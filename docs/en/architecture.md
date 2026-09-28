# Architecture

About 8,700 lines of TypeScript, one process, one PostgreSQL database, and a
dependency list small enough to read in one sitting. This page explains how it fits together
and, where there was a choice, why that choice was made.

## The shape of the system

```
                    browser
                       │
    ┌──────────────────┴───────────────────┐
    │  /[slug]        composer, anonymous  │
    │  /i/[slug]      owner inbox          │
    │  /h/[token]     claim link           │
    │  /algorithm     spec + playground    │
    │  /api/*         12 route handlers    │
    └──────────────────┬───────────────────┘
                       │
        ┌──────────────┴───────────────┐
        │                              │
   extract.ts                    extract.ts  ← literally the same file,
   (browser, canvas)             (server, png.ts)
        │                              │
        │  six hex values            six hex values
        └──────────┬───────────────────┘
                   │
              equality?  →  verified hint
                   │
              postgres  (network, pooled)
```

The single most important structural fact: **`src/lib/palette/extract.ts` is
imported by both the browser and the server.** The sender's browser computes six
colours from their photo and claims them. The server then decodes the *original
file* and runs the same function. If the two agree, the hint is marked verified;
if they do not, the reader is told. The trust model does not depend on the sender
being honest, because their claim is never taken at face value.

## Dependencies

Runtime dependencies, in full:

| Package | Why |
|---|---|
| `next` | the framework |
| `react`, `react-dom` | the framework |
| `zod` | every request body is validated by a schema |

Everything else is either in Node 22 or written here.

That is a deliberate position, not an accident of scheduling. The pieces most
likely to be attacked are the ones a package would normally cover — image
decoding, HTTP fetching, SMTP, hashing, PNG — and every one of them is small
enough to read. The dependency tree's attack surface is zero by construction.

| Normally a package | Here | Lines |
|---|---|---|
| PNG decode (`sharp`, `pngjs`) | `lib/palette/png.ts` | ~230 |
| HTTP client (`node-fetch`) | `fetch` (built in) | 0 |
| SMTP (`nodemailer`) | `lib/mail.ts` | ~300 |
| Password hashing (`bcrypt`, `argon2`) | `lib/crypto.ts` (HMAC digests) | ~60 |
| Styling framework | Tailwind v4 + ~700 lines of CSS | — |
| Fonts | Fontsource packages, vendored | — |
| Database driver (`pg`, `better-sqlite3`) | `postgres` (pure JS, no native build) | ~1k |
| Date library | `Date` | 0 |

## Data model

Eleven tables. Full definitions are in `src/lib/db.ts`, applied as numbered,
idempotent migrations at open time — there is no separate migration step and
nothing to run by hand.

| Table | Holds | Notable columns |
|---|---|---|
| `users` | one row per email-verified identity | `email`, `email_verified_at`, `display_name`, `avatar_palette` |
| `oauth_accounts` | the OAuth side | `(provider, provider_user_id)`, `user_id` |
| `sessions` | one row per live session | `id` = **HMAC digest** of the cookie, `expires_at` |
| `login_tokens` | 6-digit email codes | `code_hash`, `purpose`, `attempts`, `expires_at` |
| `inboxes` | the public composer | `slug`, `owner_id`, `title`, `last_message_at` |
| `messages` | one row per anonymous message | `body`, `sender_ip` (hashed), `seen_at`, `hint_id`, `claim_hash` |
| `hints` | the palette and its proof | `palette`, `primary_hex`, `weight`, `hash`, `algorithm`, `verified`, `image_id` |
| `images` | hint source photos, as BLOBs | `bytes`, `mime`, `bytes_len`, `delete_after` |
| `rate_limits` | counters | `key`, `window_start`, `count` |
| `meta`, `schema_migrations` | bookkeeping | |

The claim token is not its own table: it is `messages.claim_hash`, an HMAC of the
token in `/h/[token]`, resolved by lookup. One less table, one less thing to join.

### Why digests everywhere

No table stores a secret in recoverable form. Session ids, login codes, claim
tokens and OAuth state are stored as `HMAC-SHA256(secret, value)`. The plaintext
exists once, in memory, for the duration of the request.

`messages.sender_ip` is a **truncated HMAC of the sender's IP**, never the IP
itself. The owner cannot be shown the address even if they asked, but can still
recognise a repeat sender.

The practical consequence: **a database dump does not let anyone log in, claim
someone's message, or hijack a session.** It leaks message bodies and palettes —
which the recipient was always going to see — and nothing else.

The performance cost is a hash per lookup, which is nothing.

## The palette pipeline

Three stages, and they are separable on purpose.

### 1. `extract.ts` — the algorithm

Pure, deterministic, no DOM, no I/O. Takes RGBA bytes plus dimensions, returns
six hex colours. Documented line by line in [the algorithm page](algorithm.md),
and pinned by a golden-hash test so that a refactor that changes the output fails
CI.

### 2. `png.ts` — the server-side decoder

When a hint is uploaded, the server needs pixels to verify the claim. `png.ts`
decodes PNG with no dependencies and hard bounds on everything:

- longest edge ≤ 1024
- total pixels ≤ 1024 × 1024
- declared output length ≤ 8 MB

Those three bounds are what kill decompression bombs. Verified against real
payloads:

| Payload | On disk | Result |
|---|---|---|
| PNG declaring 3.6 gigapixels | 69 B | refused in 1 ms, `image is larger than 1024px on its longest side` |
| 8 MB of pixels behind an 8×8 header | 8.2 kB | refused in 1 ms, `Cannot create a Buffer larger than 264 bytes` |
| An honest 64×64 photo | 594 B | accepted, 64×64, six colours in 25 ms |

Heap growth for the two bombs is single-digit megabytes — most of which is tsx's
own module loading. Neither reaches the point of allocating what it claims.

### 3. `hints.ts` — create, verify, expire

Recomputes the palette from the stored file, compares it to the claim, and marks
the hint `verified` or `unverified`. The original file gets a row pointing at it
and a deletion date; the sweep in `storeImage` removes anything past
`HINT_IMAGE_RETENTION_DAYS` along with its row. The colours survive in the
message; the face does not.

## Requests and responses

`src/lib/http.ts` is the choke point, and almost every route goes through it.

- **`requireSameOrigin()`** — one function, called by every mutating route. It
  compares the `Origin` header against `NEXT_PUBLIC_ORIGIN` and refuses
  cross-origin requests with 403. It is centralised precisely so that a new route
  cannot forget it. (A missing `Origin` is allowed, because non-browser clients
  — curl, the mail links, some crawlers — do not send one, and refusing them
  would break the product without adding security.)
- **`clientIp()`** — returns an IP only when the app is actually behind a proxy
  it trusts (`TRUSTED_PROXY=1`). Otherwise it returns a constant. The reasoning
  is in [security](security.md#rate-limiting-fails-closed).
- **`json()`, `fail()`** — uniform shapes, and error messages that say what went
  wrong without saying whether a record exists.

## Front end

Server components by default; client components only where there is interaction:
the composer, the hint picker, the login form, the settings form, and the
algorithm playground. No state library, no data-fetching library — forms post to
route handlers and the router refreshes.

`extract.ts` runs in the browser against a canvas, so the sender sees their six
colours the instant they drop a photo, before anything is uploaded. That is a
latency decision that happens to also be a privacy one.

## Auth

One session mechanism, two ways in.

- **Email**: request a 6-digit code → stored as an HMAC digest with a 10-minute
  expiry and an attempt counter → verify → mint a session. No passwords exist
  anywhere in the codebase, so there is no password database to breach, no reset
  flow to abuse, and no credential-stuffing surface.
- **OAuth**: `lib/oauth.ts` is one generic 2.0 client with a provider table. It
  handles the authorize redirect, PKCE-less state, token exchange, and the
  identity lookup. Provider tokens are **discarded immediately** after the
  identity is resolved — the app keeps an email and an avatar, never a
  third-party token.

Matching is on the **verified** email, and only for providers that report one. An
unverified email does not get to link to an existing account, because otherwise
anyone could claim someone else's identity by registering a lookalike address at
a permissive provider.

## Rate limiting

`lib/ratelimit.ts` is a counter table: a bucket name, a window start, a count.
Buckets are per-IP and per-inbox, both hourly. It works across restarts and
across instances that share the database, which a pure in-memory limiter does
not.

The counter is read and incremented in **one** statement, an upsert with
`RETURNING`. A read-then-write was correct while the database was a single
SQLite connection, and stops being correct the moment there is a pool: two
simultaneous logins would both read `count = 0`, both be told they were the
first, and both be let through. The same reasoning is why `consumeLoginCode`
claims an attempt with `UPDATE … RETURNING` rather than selecting and then
updating. The login bucket is the only thing between an attacker and the email
sign-in, so it is the one place in the app where "check then act" is not good
enough.

It **fails closed**: with `TRUSTED_PROXY` unset, the app cannot identify clients,
so every request shares one bucket rather than pretending it can rate-limit
per-IP. A limiter that can be walked through by setting a header is worse than no
limiter, because it is believed.

## Configuration and the boot audit

`lib/config.ts` parses the environment once, with safe defaults and explicit
insecure opt-ins. `lib/startup-check.ts` then reads that config back and prints a
warning for anything that would weaken the instance — a short secret, a
non-HTTPS origin, mail going to the log, health detail on, HSTS without HTTPS.

It is advice, not a gate. Blocking startup on a config smell would make the
product harder to run for people who know what they are doing, and the code
already refuses to start when `SESSION_SECRET` is missing, which is the one case
where proceeding is actually unsafe.

## Design system

`globals.css` is a system, not a stylesheet:

- Two type families, both vendored through Fontsource (Google Fonts is not
  reachable from the build environment, and vendoring is better anyway):
  **Bricolage Grotesque** for structure, **Instrument Serif italic** for human
  voice, used sparingly and on purpose.
- Hard shadows (4px, zero blur), ink outlines (2.5px `#16130f`), paper grain,
  and a deliberate 1–2° tilt on every card.
- No border-radius, anywhere.
- The palette collage is the signature component: one dominant scrap plus five
  shredded strips, each labelled with its hex.

`npm run assets` regenerates the favicon and the Open Graph card from the same
six colours, so the identity and the product are the same object.

## Testing

```bash
npm test        # 74 tests
npm run typecheck
```

- `tests/palette.test.ts` — 18 tests over the algorithm, including a golden hash
  (`26d88308`) that pins the output for a fixed input, plus edge cases: greyscale,
  fully transparent, single colour, 1×1, non-square.
- `tests/security.test.ts` — 56 tests covering the hardening: same-origin
  enforcement, token digests, session cookie naming, secret strength, the PNG
  bomb bounds, SSRF allowlisting, response byte caps, and the health endpoint's
  disclosure rules.

## What is deliberately not here

- **No analytics, at all.** No plausible, no GA, no pixel. Nothing that watches
  who visits, including you.
- **No third-party requests at runtime.** The CSP has no external origins in it
  because the app makes none. Fonts are vendored, images are never hotlinked, and
  nothing is embedded.
- **No rate-limiting library, no auth library, no image library.** See above.
- **No multi-tenancy.** One database, and the schema assumes a single logical
  instance rather than designing for many. Horizontal scale is a fork.
