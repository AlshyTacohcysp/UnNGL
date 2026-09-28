# Security Policy

## Reporting a vulnerability

**Please open a private GitHub security advisory** on this repository. Do not
open a public issue for anything exploitable.

Include: what happens, how to reproduce it, and what an attacker gains. You will
get a response, and you will be credited.

---

## Current status

| | |
|---|---|
| `npm audit` | **0 vulnerabilities** (production and full tree) |
| Tests | **56 passing** — 18 algorithm, 38 security regression |
| TypeScript | clean, `strict` |
| Runtime dependencies | `next`, `react`, `react-dom`, `zod` |

There is **no independent security audit**. This is a self-audit by the people
who wrote the code. That is worth less than an external review, and it is stated
here so nobody has to guess.

## Full documentation

The complete write-up — threat model, every control, what is *not* defended, and
the honest limitations — is in both languages:

- **English** — [`docs/en/security.md`](docs/en/security.md)
- **Français** — [`docs/fr/securite.md`](docs/fr/securite.md)

## Summary of the controls

**Authentication** — no passwords anywhere. 6-digit email codes (256 bits of
entropy, HMAC-digested, 10-minute expiry, single-use, attempt-capped, rate-limited
per address and IP) and OAuth 2.0, which is an addition, never the main path.
Provider tokens are discarded after the identity is resolved.

**Sessions** — 256-bit random tokens stored only as `HMAC-SHA256(SESSION_SECRET,
token)`. In production the cookie is `__Host-unngl_session`: `HttpOnly`, `Secure`,
`SameSite=Lax`, `Path=/`, no `Domain`. A database dump yields no usable session.

**CSRF** — every route is wrapped by `route()`, which enforces same-origin on all
mutating methods and returns 403 otherwise. Centralised, so a new route cannot
forget it.

**Rate limiting** — per inbox and per IP, in a SQLite counter table that survives
restarts. **Fails closed**: without `TRUSTED_PROXY` the app cannot identify
clients and shares one bucket, because a limiter that can be bypassed by setting a
header is worse than none.

**Image decoding** — a dependency-free PNG decoder with hard bounds on the long
edge, the pixel count, and the inflate size, all checked *before* allocation.
Dimension bombs and zip bombs are refused in ~1 ms. See the tables in the full
documentation for measured results.

**SSRF** — the media proxy accepts only `https` on a fixed allowlist of social CDN
hosts, with per-label matching, private-range refusal, and a streaming hard byte
cap that destroys the socket the moment the body exceeds it.

**Headers** — strict CSP with no third-party origins, plus `X-Frame-Options`,
COOP, CORP, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, and opt-in HSTS.

**Data minimisation** — no analytics of any kind, no raw IP addresses (only
truncated HMACs), no third-party tokens, and hint photos deleted 7 days after the
palette is derived.

## Deploying it yourself

Read [`docs/en/deployment.md`](docs/en/deployment.md) ·
[`docs/fr/deploiement.md`](docs/fr/deploiement.md) before exposing an instance.
The two things that actually matter:

1. **Set a random `SESSION_SECRET`.** The server refuses to start in production
   without it: `openssl rand -base64 48`.
2. **Serve it over HTTPS.** Session cookies are `Secure` in production and are
   not sent over plain HTTP at all.

The server audits its own configuration at boot and prints a warning for anything
that would weaken the instance. Read it once after your first deploy.

## Licence

AGPL-3.0-or-later. If you run a modified version as a service, the copyleft
requires you to offer your users the corresponding source — which is a feature,
not a restriction.
