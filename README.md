# UnNGL

**Anonymous messages where the hint is a person's entire colour palette — and it costs nothing.**

A free, open source alternative to NGL.link. You get a link, strangers write to you
anonymously, and instead of paying to unlock a vague "profile photo hint" you get the
sender's whole palette — six colours, extracted from their photo by an algorithm that
is published in full, versioned, and hash-checkable.

No paywall. No data sold. AGPL-3.0.

---

## Why it exists

The NGL business model is the hint: the app can produce one for pennies, charge you
dollars to see it, and there is no pressure on it to be *useful*. The FTC has gone
after apps using exactly this design, including around children's data.

UnNGL inverts it:

| | NGL-style | UnNGL |
|---|---|---|
| Cost of a hint | paid in-app purchase per message | free, always, no purchase button exists |
| What you get | often vague, sometimes fake | six exact hex values from a published algorithm |
| Can you check it? | no | yes — recompute it yourself, we publish the spec |
| What happens to photos | stored and resold | deleted 7 days after the palette is derived |
| IP addresses | stored | never stored raw, only a truncated HMAC per message |
| Source | closed | AGPL, self-hostable, one SQLite file |

A palette is a genuinely good hint: to someone who *knows* you it is an unmistakable
fingerprint, and to someone who doesn't it is useless. That is exactly the right shape
for privacy — it reveals to the people who already know you, and nothing to anyone else.

---

## Run it

Requires **Node 22.5 or newer** (the database uses Node's built-in `node:sqlite` — no
native module to compile, no database server to run).

```bash
npm install
cp .env.example .env.local
npm run build
npm start          # http://localhost:3000
```

Sign in with any email — with no SMTP server configured the login code is printed to
the server log, so the whole flow works out of the box.

**One thing is genuinely required**, and the server refuses to boot without it,
before serving anything:

```bash
echo "SESSION_SECRET=$(openssl rand -base64 48)" >> .env.local
```

Every session cookie, login code and claim token is an HMAC of that value. If it
is missing the process exits with a message telling you exactly this. For a
throwaway local instance you can skip it with `ALLOW_INSECURE_DEFAULTS=1` — but
then every HMAC in the app is derived from a value that is published in the
source.

To try it with content in it:

```bash
npm run seed       # creates demo@unngl.link with a few messages + real palettes
```

### With Docker

```bash
cp .env.example .env
# generate a secret and paste it in:
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
docker compose up -d
```

The database lives in a Docker **named volume**, so `docker compose down` never
touches it and it is not readable from the rest of the host. `docker-compose.yml`
comments show how to switch to a bind mount, and the one `chown` that requires.

### Deploying anywhere else

- **Vercel / any Node host:** works, but set `DATABASE_PATH` to a persistent disk —
  serverless filesystems are ephemeral, and this app is stateful by nature.
- **Fly.io / Railway / a VPS:** the Docker image is the whole story.

---

## The product

| Route | What it is |
|---|---|
| `/` | the pitch |
| `/[slug]` | **your public link.** Anyone can write here anonymously |
| `/i/[slug]` | your inbox: every message, every palette, nothing locked |
| `/h/[token]` | the sender's private claim link, to attach or change a hint later |
| `/algorithm` | the full public specification + a playground that runs in your browser |
| `/login` | email code, or OAuth |
| `/settings` | name, avatar (stored as a palette), email, delete account |
| `/privacy`, `/terms`, `/about` | the short versions |

### The flow

1. **Get a link.** Sign in with a 6-digit email code, or OAuth. You get a short link
   that is your inbox — 12 characters from a 31-symbol alphabet, 71 bits of entropy.
2. **Someone writes to you.** No account, no name, no number. They may attach a photo
   purely so you can see their colours.
3. **You see their palette.** Six colours, computed in their browser *and* recomputed
   on our server from the original file. If the two disagree, the reader is told, and
   the hint is marked unverified. The photo is deleted after 7 days.

No step involves a payment, an account, or a coin flip.

### Sign-in

**Email first**, as asked: a 6-digit code, no passwords anywhere. Codes are stored
only as an HMAC digest, expire in 10 minutes, are single-use, and are rate-limited per
address and per IP.

**OAuth** is a generic 2.0/OIDC client — adding a provider is a table entry, not new
code. Google, GitHub, Discord and Facebook are wired up and activate as soon as you set
their client ID and secret.

**On Instagram:** Meta retired the Instagram Basic Display API in December 2024, so no
ordinary app can read an Instagram profile that way any more — a sign-in button doing
it would be a button that cannot work. What remains is Facebook Login, which can return
an Instagram username, so that is the provider labelled **Facebook / Instagram**. For
the palette itself it makes no difference: a photo and a documented algorithm is all a
hint needs, and people can paste a profile-photo link or upload a file either way.

---

## The palette algorithm

Documented in full at **`/algorithm`**, implemented in one dependency-free file:
[`src/lib/palette/extract.ts`](src/lib/palette/extract.ts).

**v1.0.0**, in six steps:

1. Box-filter to a 256px longest edge, in premultiplied alpha.
2. Sample a fixed 64×64 lattice — always 4096 samples, whatever the input size.
3. Convert sRGB → **OKLab**, drop samples under α 0.5, and weight each sample by
   `alpha × (0.35 + 0.65 × min(1, C/0.16))` so saturated colours beat grey background.
4. Weighted k-means into 6 clusters, seeded by highest weight then farthest-point —
   **no RNG anywhere**.
5. Merge clusters closer than 0.01 in OKLab, drop chroma outliers (unless that would
   discard more than 40% of the weight), order by weight with a total tie-break.
6. Convert back to sRGB, clamp, round. Pad to six by repeating the dominant colour.

Guarantees: deterministic, constant work, resolution-independent to within ~0.01 in
OKLab, and hashable — the canonical JSON of a palette hashes to a stable FNV-1a value
that a third-party implementation can reproduce.

**Every hint is verified.** The browser transcodes an upload to a lossless PNG, uploads
those exact bytes, and the server decodes them with its own ~200-line PNG decoder and
recomputes the palette from scratch. If the client's claim doesn't match, the hint is
stored as unverified and the reader is shown that. There is no image library in the
stack at all, which is the only reason this is possible without a native dependency.

```bash
npm test      # 64 tests, including a golden hash that fails if the algorithm drifts
```

---

## Stack, and why

| Choice | Reason |
|---|---|
| **Next.js 15 + React 19** | server and client in one codebase, one deployable, no separate API |
| **TypeScript, strict** | `noUncheckedIndexedAccess` on; it found real bugs during the build |
| **Tailwind v4** | tokens live in `globals.css` as CSS variables, so the design is inspectable |
| **SQLite via `node:sqlite`** | zero native modules, zero services. The entire state of the app is one file you can copy |
| **No ORM** | ~200 lines of typed queries is less code than the ORM's config, and the SQL is readable |
| **No image library** | a PNG decoder is 200 lines; a native dep would break `npm install` on half of all platforms |
| **Auth written here** | email codes + one generic OAuth client instead of a framework that would decide our schema |
| **Self-hosted fonts** | fontsource packages, not Google — a privacy product must not call Google |

Dependencies, in full: `next`, `react`, `react-dom`, `zod`, `nanoid`, and two Fontsource
packages. That's it — and the pieces most worth attacking (image decoding, SMTP,
hashing, HTTP fetching) are written in-repo so the tree's attack surface stays small
enough to audit by reading. See [`docs/en/security.md`](docs/en/security.md#supply-chain).

---

## Design

The "v3 collage" direction, built as a system in `src/app/globals.css`:

- **Bricolage Grotesque** for everything structural, **Instrument Serif italic** for
  exactly one thing at a time: a human voice (message bodies, pull quotes, captions).
- **Ink outlines everywhere** (2.5px `#16130f`), **hard shadows** (4px offset, zero
  blur), and deliberate misregistration — every card is tilted a degree or two, like
  paper scraps laid down by hand.
- Cream paper `#f6f1e6` with a grain, punch vermilion, acid lime, ink blue.
- **No rounded corners, anywhere.** The site is built out of rectangles and rules.
- The palette collage is the signature object: one dominant scrap plus five shredded
  strips, each nudged out of register, each labelled with its hex.

The favicon and the Open Graph card are generated by `npm run assets` using the same
six colours, so the identity and the product are visibly the same thing.

---

## Privacy, concretely

- **Photos** are deleted by a sweep `HINT_IMAGE_RETENTION_DAYS` (default 7) after the
  palette is derived. The palette and the verification result remain.
- **IP addresses** are never stored — only an HMAC-SHA256 digest, used as a rate-limit
  bucket key.
- **No third-party requests.** No analytics, no CDN, no fonts, no pixels. The site only
  talks to itself.
- **No marketing email, ever.** There is no mailing list, so there is nothing to
  unsubscribe from.
- Inbox pages, claim links and every API route are `noindex` + `no-store`.

`src/app/privacy/page.tsx` has the full table, generated from the config so it can't
drift from the code.

---

## Project layout

```
src/
  app/
    [slug]/          public composer (the shareable link)
    i/[slug]/        owner's inbox
    h/[token]/       sender's claim link
    algorithm/       the published spec + playground
    api/             16 route handlers
  components/        collage, composer, hint picker, panels, playground
  lib/
    palette/
      extract.ts     THE ALGORITHM — browser + server, no dependencies
      png.ts         dependency-free PNG decoder (the verification path)
      client.ts      browser upload pipeline
    db.ts            node:sqlite, migrations, no ORM
    auth.ts          users, sessions, email codes
    hints.ts         create + verify a hint
    inbox.ts         inboxes, messages, claim tokens
    media.ts         allowlisted image fetching (SSRF-safe by construction)
    mail.ts          dependency-free SMTP client
    oauth.ts         one client, four providers
tests/palette.test.ts
scripts/             samples, assets, seed, start
```

---

## Security

- **No passwords anywhere.** Email is a 6-digit code, HMAC-digested, 10-minute
  expiry, single-use, attempt-capped, rate-limited per address and per IP. OAuth
  is an addition, never the main path, and provider tokens are discarded
  immediately.
- **Sessions** are 256-bit random tokens stored only as
  `HMAC-SHA256(SESSION_SECRET, token)`, in a `__Host-` prefixed, `HttpOnly`,
  `Secure`, `SameSite=Lax` cookie in production. A database dump yields no usable
  session.
- **CSRF** is refused centrally: every route is wrapped by `route()`, which
  enforces same-origin on all mutating methods.
- **Rate limiting fails closed** — with no trusted proxy, the app cannot identify
  clients and shares one bucket, because a limiter that can be walked through by
  setting a header is worse than none.
- **The image decoder** has hard bounds on edge, pixel count and inflate size,
  all checked before allocation. Dimension bombs and zip bombs are refused in
  about a millisecond.
- **`npm audit`: 0 vulnerabilities.** 46 security regression tests.

Full write-up, threat model and honest limitations:
[`docs/en/security.md`](docs/en/security.md) ·
[`docs/fr/securite.md`](docs/fr/securite.md) · [`SECURITY.md`](SECURITY.md)

---

## Documentation

The full documentation is in **English** and **Français**, and covers the same
ground:

| | English | Français |
|---|---|---|
| Index | [`docs/en/README.md`](docs/en/README.md) | [`docs/fr/README.md`](docs/fr/README.md) |
| Getting started | [`docs/en/getting-started.md`](docs/en/getting-started.md) | [`docs/fr/demarrage.md`](docs/fr/demarrage.md) |
| Deployment | [`docs/en/deployment.md`](docs/en/deployment.md) | [`docs/fr/deploiement.md`](docs/fr/deploiement.md) |
| Architecture | [`docs/en/architecture.md`](docs/en/architecture.md) | [`docs/fr/architecture.md`](docs/fr/architecture.md) |
| The palette algorithm | [`docs/en/algorithm.md`](docs/en/algorithm.md) | [`docs/fr/algorithme.md`](docs/fr/algorithme.md) |
| API reference | [`docs/en/api.md`](docs/en/api.md) | [`docs/fr/api.md`](docs/fr/api.md) |
| Security | [`docs/en/security.md`](docs/en/security.md) | [`docs/fr/securite.md`](docs/fr/securite.md) |
| Contributing | [`docs/en/contributing.md`](docs/en/contributing.md) | [`docs/fr/contribuer.md`](docs/fr/contribuer.md) |

---

## Licence

**AGPL-3.0-or-later.** If you run a modified UnNGL as a service, publish your
changes. That is the whole point.

Not affiliated with NGL.link.
