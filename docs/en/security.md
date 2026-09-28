# Security

UnNGL is an anonymous message app. That is a hostile shape by default: strangers
write to you, they upload arbitrary bytes, they have no account, and your link is
public. This page is an honest account of what was done about that — what is
enforced, what is merely assumed, and what is left to you.

Read the [threat model](#threat-model) before the [controls](#controls), and the
[operator responsibilities](#what-you-are-responsible-for) before deploying.

---

## Status

| | |
|---|---|
| `npm audit` (production) | **0 vulnerabilities** |
| `npm audit` (including dev) | **0 vulnerabilities** |
| Test suite | **54 passing** (18 algorithm, 36 security regression) |
| TypeScript | clean, `strict` |
| Security headers | CSP, HSTS (opt-in), `X-Frame-Options`, COOP, CORP, `nosniff`, `Referrer-Policy`, `Permissions-Policy` |
| Runtime dependencies | 3 (`next`, `react`, `react-dom`, plus `zod`) |

There is no external security audit. This is a self-audit by the people who wrote
it, which is worth less than an independent one, and is stated here so nobody has
to guess.

## Reporting a vulnerability

Open a GitHub security advisory on the repository. Please do not open a public
issue for anything exploitable. Give the maintainers a reasonable window before
disclosure, and you will be credited.

---

## Threat model

### What we are defending

| Asset | Why it matters |
|---|---|
| **Session cookies** | Full account takeover: the owner's inbox, profile, and every message. |
| **Login codes** | Account takeover, and the recovery path for OAuth-only users. |
| **Claim tokens** | The only credential a sender has. Leaking one exposes the message and lets the token holder rewrite the hint. |
| **Message bodies** | Written by strangers, read by their target. Not encrypted at rest. |
| **Hint source photos** | Faces. Deleted on a timer precisely because they are the most sensitive thing the app holds. |
| **Server availability** | One process, one SQLite file. A single crash or a memory blow-up is an outage for everyone. |
| **The instance itself** | SSRF into the host, a proxy hop into the private network, or the cloud metadata endpoint. |

### What we are *not* defending

- **Traffic analysis.** We cannot tell you who wrote to you beyond a truncated
  HMAC of their IP, kept so a repeat sender is recognisable. We do not try.
- **A hostile inbox owner.** If someone sends you something horrible and you want
  it gone, the delete button deletes it. The app is not a moderation system and
  does not pretend to be one.
- **The algorithm being secret.** It is not, and it should not be. The design
  assumption is that you will reimplement it and check us.
- **A determined attacker with a browser exploit.** The CSP is not a defence
  against a bug in the browser.

### Trust boundaries

```
  anonymous sender  ──untrusted──▶  Next.js route handler  ──▶  SQLite (one file)
        │                                │
        │ uploads bytes                  │ resolves the session
        ▼                                ▼
  png.ts (bounds-checked)        auth.ts (HMAC digest)
  media.ts (host allowlist)
```

The sender is untrusted in **both** directions: their text and their claimed
palette. Their claimed palette is never taken at face value — the server
recomputes it from the bytes it received.

---

## Controls

### 1. Session cookies

| | Development | Production |
|---|---|---|
| Name | `unngl_session` | `__Host-unngl_session` |
| `HttpOnly` | yes | yes |
| `Secure` | no | **yes** |
| `SameSite` | `Lax` | `Lax` |
| `Path` | `/` | `/` |
| `Domain` | host-only | host-only (required by `__Host-`) |

The `__Host-` prefix is a browser-enforced contract: a cookie carrying it is
**rejected by the browser** unless it is `Secure`, has `Path=/`, and has no
`Domain` attribute. That removes subdomain-fixation and cookie-shadowing attacks
without any server-side defence, and it is why the app looks broken when you run
production mode over plain HTTP: the cookie is not sent, on purpose.

Session tokens are 32 bytes of `crypto.randomBytes`, URL-safe base64 — 256 bits.
The database stores `HMAC-SHA256(SESSION_SECRET, token)`, **never the token**, so
a database dump yields no usable session. Lookup is by digest; comparison is
constant-time.

Expiry is `SESSION_DAYS` (default 30). Expired rows are deleted on lookup, so
they cannot accumulate. Logout deletes the row and clears the cookie with the
same name, `Path` and flags it was set with — the mismatch that would silently
fail to log you out is exactly the kind of bug this catches.

### 2. Login codes

- 6 digits from `crypto.randomInt`, not `Math.random`. A distribution test in
  the suite checks uniformity of the leading digit.
- Stored only as an HMAC digest, with `attempts`, `created_at` and `expires_at`.
- 10-minute expiry, single-use — a successful verify deletes the row.
- Each wrong guess increments `attempts`; too many and the code is dead.
- Rate-limited per address and per IP, before and after the code is checked.
- **Never returned in an API response in production.** The response is always
  `{"ok":true,"sent":true,"expiresInSeconds":600}`, in every environment.

### 3. The dev-code flag — the one flag to never enable

`EXPOSE_DEV_CODES=1` makes the API return the login code so a local sign-in form
can fill it in. It is honoured **only** when `NODE_ENV !== production` **and**
`MAIL_TRANSPORT=console` **and** the secret still has its development default.
All three, or nothing. The boot audit prints a red warning if it is somehow set
in production.

This is the highest-value flag in the file, because it turns email login into "ask
the server for the code". Treat it as a hypothetical account takeover.

### 4. CSRF — centralised same-origin enforcement

`route()` wraps **every** handler. Any method other than `GET`, `HEAD` or
`OPTIONS` must match `Origin` against `NEXT_PUBLIC_ORIGIN` or gets
`403 {"ok":false,"error":"Cross-origin request refused."}`.

Centralising it is the point. A per-route check is a check someone forgets on
the route they add at 2am. There is exactly one place to get wrong, and it has a
test.

Requests with **no** `Origin` header are allowed. Browsers always send one on
cross-origin state-changing requests, so this loses nothing against CSRF, and
refusing it would break curl, the links in login emails, and some crawlers.

Verified live:

```
POST /api/messages   Origin: https://evil.example        -> 403
POST /api/messages   Origin: https://unngl.example       -> 201
POST /api/messages   (no Origin header)                  -> 201
```

`SameSite=Lax` on the session cookie is the second layer, and
`form-action 'self'` in the CSP is the third.

### 5. Open redirect

`?next=` after sign-in is passed through `safeRedirectPath()`, which accepts only
paths that begin with a single `/` and are not protocol-relative (`//evil.com`).
Anything else falls back to `/inbox`. Tested.

### 6. Rate limiting — fails closed

`ratelimit.ts` is a SQLite counter table: bucket, window start, count. Buckets are
per inbox (10 sends/hour) and per IP (30/hour), plus separate buckets for code
requests, code verifications, inbox creation, and media fetches.

The important part is what happens when the app **cannot** identify clients:

> With `TRUSTED_PROXY` unset, `clientIp()` returns a constant. Every request
> shares one bucket.

This looks like a worse product, and it is deliberate. If the app is directly
reachable and trusted `X-Forwarded-For`, an attacker sets a random header per
request and every per-IP limit is meaningless — a limiter that can be walked
through is worse than no limiter, because operators believe it.

Turn on `TRUSTED_PROXY=1` **only** when a proxy you control is the sole path in.
The boot audit prints a note when you do.

Verified live: 40 requests with distinct forged `X-Forwarded-For` values all landed
in one bucket, and the limit held.

### 7. Image decoding — resource exhaustion

The verification path has to decode attacker-supplied bytes, which is the single
riskiest thing in the app. `src/lib/palette/png.ts` is written for it specifically:

- Longest edge ≤ `MAX_EDGE` (1024), checked against the IHDR **before** any
  allocation.
- Total pixels ≤ `MAX_PIXELS` (1024 × 1024), which catches a legal-looking
  1×1,048,576.
- Inflate is capped at the length IHDR itself declares, so a zlib stream that
  expands past the image's own size is refused mid-stream.
- Rejects interlaced PNGs rather than mis-decoding them.
- Rejects unknown colour types and unknown scanline filters.
- Upload size capped at 2 MB before the decoder is even reached.

Measured against real payloads, through the production code path:

| Payload | On disk | Outcome |
|---|---|---|
| Declares 3.6 gigapixels | 69 B | refused in 1 ms — `image is larger than 1024px on its longest side` |
| 8 MB of pixels behind an 8×8 header | 8.2 kB | refused in 1 ms — `Cannot create a Buffer larger than 264 bytes` |
| Honest 64×64 image | 594 B | accepted, 64×64, six colours in 25 ms |

Heap growth for both bombs is single-digit megabytes, most of it tsx loading its
own modules. Neither reaches allocation.

### 8. SSRF — a fixed allowlist, and a streaming cap

`/api/media/fetch` exists so the app can show a profile photo from a social CDN
without the browser leaking the visitor's IP. That makes it an SSRF primitive by
construction, so:

- **Only** `https:`, only ports 443, and only hosts on a fixed list of social
  media CDN suffixes.
- Matching is per-label against the allowlist, so `cdninstagram.com.evil.com`
  and `evilcdninstagram.com` are both refused, as is `notcdninstagram.com`.
- Loopback, link-local (`169.254.0.0/16`, which contains the cloud metadata
  endpoint), and other private ranges are refused.
- `file:`, `gopher:` and plain `http:` are refused.
- Userinfo in the URL (`https://cdninstagram.com@evil.com/`) is refused.
- Redirects are not followed blindly.
- The response body is **streamed with a hard byte cap**, and the socket is
  destroyed the moment it is exceeded. A server that lies about
  `Content-Length` and then streams forever cannot exhaust memory.
- `Content-Type` must be an image, re-checked on the way out.

Each of those refusals has a test in `tests/security.test.ts`.

### 9. Response and error handling

- Uncaught errors in a route return a generic 500 with
  `"Something went wrong on our side. Nothing you sent was lost."` — no stack
  traces, no SQL, no file paths.
- Error messages do not distinguish "no such inbox" from "no such message" from
  "no such claim" where that would help an attacker enumerate.
- `Cache-Control: no-store` on message responses.
- All queries are parameterised. There is no string interpolation into SQL
  anywhere in the codebase.

### 10. Injection

- No `eval`, no `new Function`, no dynamic `require`.
- The only `dangerouslySetInnerHTML` is a **static** JSON-LD block with no
  interpolated user data.
- Every request body is validated by a `zod` schema; unknown keys are rejected.
- Rendering is React's default escaping. There is no `dangerouslySetInnerHTML`
  on any user-supplied string.
- Message bodies are rendered as text, never as HTML.

### 11. HTTP headers

Set in `next.config.mjs`, on every path:

```http
Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none';
  script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:; font-src 'self'; connect-src 'self';
  media-src 'none'; worker-src 'self'; manifest-src 'self';
  form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()
X-DNS-Prefetch-Control: off
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload   ← only with ENABLE_HSTS=1
```

The CSP has **no external origins**, because the app makes no third-party
requests. Fonts are vendored through Fontsource, there is no analytics script, no
CDN, and nothing is embedded. `'unsafe-inline'` for scripts and styles is
required by Next.js's own bootstrap and by React's style props; it is the one
remaining soft spot, and it is not removable without breaking the framework.

`Strict-Transport-Security` is **opt-in** (`ENABLE_HSTS=1`) on purpose. Turning it
on for a staging box over HTTP locks browsers out for two years. Enable it once
the domain is permanently HTTPS.

### 12. Information disclosure

`GET /api/health` returns, in production:

```json
{"ok":true,"status":"ok","time":"2026-09-28T14:22:19.665Z"}
```

No version, no schema, no user count, no stack. With `HEALTH_DETAIL=1` it adds
them; the flag is off by default in production because a public user count and
schema version are reconnaissance.

Error responses do not leak stack traces or SQL. Login responses do not reveal
whether an address has an account.

### 13. Data minimisation

- **No analytics.** Not one, not even a privacy-friendly one. Nothing records
  who visits, including you.
- **No raw IP addresses.** `messages.sender_ip` is
  `HMAC-SHA256(IP_KEY, ip)` truncated to 32 hex characters.
- **No third-party tokens.** OAuth access and refresh tokens are discarded
  immediately after the identity is resolved.
- **Hint photos are deleted** `HINT_IMAGE_RETENTION_DAYS` (7) after the palette
  is derived, together with the row referencing them. The palette survives; the
  face does not.
- **Avatars are stored as palettes** — six hex values. The uploaded image is
  decoded, validated, and dropped.
- **Account deletion cascades** to sessions, OAuth accounts, inboxes, messages,
  hints and images.
- Nothing is sold, and there is no mechanism by which it could be.

### 14. Secrets

`SESSION_SECRET` is the only one, and the app **refuses to start in production
without it**. `IP_KEY` is derived from it.

`auditSecretStrength()` warns in production if it is under 32 characters. The
audit is advice, not a gate — an operator may have a reason, and the startup gate
already covers the case where proceeding is genuinely unsafe.

### 15. Boot-time configuration audit

Most "secure by default" claims are really claims about a deployment someone got
right once. `startup-check.ts` runs at open time and prints, out loud, for:

- `MAIL_TRANSPORT=console` in production — codes never leave the log
- `EXPOSE_DEV_CODES` set in production
- `SESSION_SECRET` still at its development default, or under 32 characters
- `NEXT_PUBLIC_ORIGIN` not on `https://`
- `SESSION_DAYS` over a year
- `TRUSTED_PROXY=1` (a note, not a warning — it is sometimes correct)

So a misconfiguration is visible in the logs at deploy time rather than discovered
months later.

---

## Supply chain

```
npm audit                -> 0 vulnerabilities
npm audit --omit=dev     -> 0 vulnerabilities
```

PostCSS is pinned to **8.5.28** via a package override, past the 8.5.23 advisory,
and Vitest is on **5.0.2**, past its advisory. Next.js is held at **15.5.26 or
later** — do not downgrade it.

Runtime dependencies are `next`, `react`, `react-dom` and `zod`. The pieces that
would normally be packages — PNG decoding, SMTP, hashing, HTTP fetching — are
written in-repo precisely so that the attack surface of the dependency tree is
small enough to audit by reading. See
[architecture](architecture.md#dependencies).

> **Self-hosters:** UnNGL uses Node's built-in `node:sqlite` rather than
> `better-sqlite3`, so there is no native module to compile and no
> `node-gyp` step — which also means no download of Node headers at install time.

## Testing

`tests/security.test.ts` holds 36 regression tests. Each corresponds either to a
real defect that existed at some point, or to an attack the design must refuse.
They are written to fail loudly if the protection is ever removed:

- **PNG resource exhaustion** (9) — dimension bombs, pixel-count caps with
  individually legal edges, zip bombs, zero/absurd dimensions, truncated streams,
  boundary cases at exactly the limit and exactly one past it, and a positive
  control so the suite cannot pass by refusing everything.
- **Media allowlist** (16) — each social CDN that must be allowed, and each
  confusion that must not: loopback, loopback aliases, link-local metadata, file
  and gopher schemes, plain HTTP, suffix and prefix confusion, userinfo, embedded
  credentials, non-standard ports, unrelated hosts, and malformed input that must
  not throw.
- **Redirect safety** (3) — same-site paths accepted; absolute URLs,
  protocol-relative URLs and off-site paths refused; null/undefined fall back.
- **Token generation** (2) — 256 bits in URL-safe base64; uniform first digit
  across 20,000 codes.
- **Hostile input** (4) — bytes that merely look like a PNG, empty buffers,
  truncated signatures, interlaced images, unknown colour types and filters.

Plus `tests/palette.test.ts` (18) for the algorithm, including a golden hash
(`26d88308`) that pins the output for a fixed input.

```bash
npm test
npm run typecheck
```

## What you are responsible for

UnNGL can only enforce what it can see. These are yours:

- [ ] **`SESSION_SECRET` is random, ≥ 32 bytes, not in git.**
- [ ] **HTTPS, terminated in front.** Cookies are `Secure` in production; there
      is no fallback to plaintext.
- [ ] **`TRUSTED_PROXY=1` only behind a proxy you control.** Otherwise leave it
      off and accept the shared rate-limit bucket.
- [ ] **`.env` is `chmod 600`, owned by the service user.**
- [ ] **The database file is not inside a world-readable web root.** It contains
      message bodies, which are not encrypted at rest.
- [ ] **Daily `.backup` off the machine.** See
      [deployment](deployment.md#backups) — use `sqlite3 .backup`, not `cp`.
- [ ] **Back up `SESSION_SECRET`.** Rotating it logs everyone out and orphans
      every stored digest.
- [ ] **Read the boot audit** after each deploy.

## Honest limitations

- **Message bodies are not encrypted at rest.** They are read by their target by
  design, and protecting them would require a key the operator holds. Anyone with
  the database file can read them.
- **An inbox is public.** Anyone with the link can read it. That is the product.
  Use a link you are willing to share.
- **The palette is a hint, not a proof.** Someone who knows your colours can
  attach a photo that produces them. The verification proves the colours came from
  *the attached file*; it cannot prove the file is a picture of the sender.
- **SQLite means one writer.** Under real load you want a different database,
  which is a fork, not a setting.
- **There is no abuse reporting pipeline.** Message text is not filtered. If you
  run a public instance you will eventually need moderation, and you should say so
  plainly on your own deployment.
- **No independent audit.** See [Status](#status).
- **The 2 MB / 1024 px image limits are a compatibility choice as much as a
  security one.** They are what makes the dependency-free decoder tractable.
