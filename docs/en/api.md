# API reference

Every route is a Next.js route handler under `src/app/api`. There is no GraphQL,
no versioning scheme, and no client library — the app is its own first consumer.

## Conventions

**Base URL**: `NEXT_PUBLIC_ORIGIN` (e.g. `https://unngl.example.com`).

**JSON responses**, always this shape:

```jsonc
{ "ok": true,  "...": "..." }            // success
{ "ok": false, "error": "human message" } // failure
```

Error messages are written for the person reading them, not for a log file.

**Same-origin on every mutation.** All non-`GET` routes go through `route()` in
`src/lib/http.ts`, which requires the `Origin` host to match the request's own
`Host` header and returns `403 {"ok":false,"error":"Cross-origin request
refused."}` on a mismatch. On an https-configured instance an `http` Origin is
refused even when the host matches.
This is centralised, so a new route cannot forget it. Requests with no `Origin`
header at all are allowed — curl, the links in emails, and some crawlers do not
send one, and refusing them would break the product without adding security.

**Authentication** is a `HttpOnly` session cookie, named `unngl_session` in
development and `__Host-unngl_session` in production. `__Host-` requires
`Secure`, `Path=/` and no `Domain`, which browsers enforce.

**Rate limits** return `429` with a message meant to be shown to the user.

**Validation** is a `zod` schema per route (`src/lib/validation.ts`). Unknown
fields are rejected; nothing is passed through unvalidated.

---

## Authentication

### `POST /api/auth/email` — request a login code

```jsonc
// request
{ "email": "you@example.com" }
```

```jsonc
// 200
{ "ok": true, "sent": true, "expiresInSeconds": 600 }
```

Sends a 6-digit code, valid for 10 minutes, single-use, with an attempt counter.
Rate-limited per address and per IP.

The response is **identical in every environment**. In development only, and only
when `EXPOSE_DEV_CODES=1` is set *and* `MAIL_TRANSPORT=console`, an extra
`devCode` field is added. That flag cannot be honoured in production: it is an
account-takeover primitive, and the API will not serve it there.

**429** if too many codes were requested for that address.

### `POST /api/auth/verify` — exchange a code for a session

```jsonc
{ "email": "you@example.com", "code": "424242" }
```

```jsonc
// 200
{ "ok": true, "user": { "id": "...", "email": "you@example.com", "displayName": null } }
```

Sets the session cookie. Codes are compared in constant time against an HMAC
digest; the plaintext is never stored and never logged at this level.

**401/400** `That code is not right, or it has expired.`
**429** `That code has been used too many times. Ask for a new one.`

### `GET /api/auth/oauth/{provider}` — start OAuth

`provider` ∈ `google` | `github` | `discord` | `facebook`.

302 to the provider. Sets a signed `state` cookie.

**404** unknown provider · **501** provider not configured on this server.

### `GET /api/auth/oauth/{provider}/callback` — finish OAuth

Exchange, resolve the identity, link to an existing account if the provider
reports a **verified** email that matches one, create otherwise, then redirect to
`/inbox`. Provider tokens are discarded immediately.

### `POST /api/auth/logout`

Destroys the session row and clears the cookie with the same name, `Path` and
attributes it was set with.

---

## Inboxes

An **inbox** is the public composer. Its slug is the shareable link.

### `POST /api/inboxes` — create

Requires a session. Body: `{ "title"?: "string ≤ 60" }`.

```jsonc
{ "ok": true, "inbox": { "id": "...", "slug": "a7k3m9xp2qvn", "title": "...", ... } }
```

The slug is 12 characters from a 31-symbol alphabet — 71 bits of entropy.

**429** at `INBOXES_PER_USER` (default 5), or when rate-limited.

### `PATCH /api/inboxes/{slug}` — rename

Owner only; anyone else gets **403** `That is not your inbox.`
Body: `{ "title"?: "string ≤ 60", "notify"?: boolean }`.

---

## Messages

### `POST /api/messages` — send anonymously

`multipart/form-data`. **No session, no account, no name.**

| Field | Type | Notes |
|---|---|---|
| `to` | string | the inbox slug |
| `body` | string | ≤ 1000 chars (`MAX_MESSAGE_CHARS`) |
| `website` | string | **honeypot** — leave empty |
| `palette` | JSON string | optional claimed palette, `{"colors":["#rrggbb",…]}` |
| `image` | file | optional PNG, ≤ 2 MB, ≤ 1024 px on the long edge |

```jsonc
// 201
{ "ok": true, "claimUrl": "/h/<token>", "palette": { "colors": [...], "verified": true } }
```

`claimUrl` is the sender's private link. It is shown **once**; the server stores
only its HMAC, so it cannot be recovered later.

If the `website` honeypot is filled, the response is
**202** `That message could not be delivered.` — the same shape as a normal
failure, so a bot learns nothing about having been detected, and nothing is
stored.

**429** `This inbox has had a lot of messages today. Try again later.` (10/hour
per inbox) or `You have sent a lot of messages recently. Try again in an hour.`
(30/hour per IP).

**Verification**: if `image` is present, the server decodes the real file and
recomputes the palette. `verified: true` means its result matches the `palette`
you claimed; `false` means it does not, and the claim is stored as unverified.

### `GET /api/messages/{slug}` — read an inbox

Public, by design — that is the whole product. Returns every message with its
palette, hint metadata, verification state, and the delete permission flag.

**Side-effect free.** Reading does not mark anything as seen; crawlers and
prefetchers therefore cannot inflate your read state. Marking read is a separate
explicit call.

**404** `That link has expired or never existed.`

### `POST /api/messages/{slug}` — mark as read

Body: `{ "id": "<message id>" }`. Optional `id: "*"` marks the whole inbox read.
Marks only messages not already seen, and returns the count changed.

### `DELETE /api/messages/{slug}` — delete one message

Body: `{ "id": "<message id>" }`. **Owner only.**

**403** `Only the owner of this inbox can delete messages.`
**404** `Message not found`

The sender cannot delete through this endpoint either; that is what the claim
link is for.

---

## Hints and claim links

### `GET /h/{token}` — the sender's private page

Not an API route: a page showing the message they sent and the current hint. The
token alone is the credential.

### `GET /api/claim/{token}` — read the claim

```jsonc
{ "ok": true, "message": { "id": "...", "body": "...", "hint": { "colors": [...], "verified": true } } }
```

**404** `This claim link is not valid any more.`

### `POST /api/claim/{token}` — attach or replace the hint

`multipart/form-data`: `image` (PNG, ≤ 2 MB) and/or `palette` (JSON).
Same recomputation and verification as sending.

Rate-limited per token: **429** `Too many attempts on this link.`

---

## Account

### `GET /api/profile`

Session required. Returns the user, their avatar palette, and their inboxes.

### `PATCH /api/profile`

Session required. `{ "displayName"?: "string ≤ 60" }`.

### `POST /api/avatar` — set an avatar photo

`multipart/form-data`, `image` field. The avatar is stored as its **palette** —
six hex values — and the image itself is discarded. The upload is still validated
as an image first, so the stored value is a real answer rather than a guess.

### `DELETE /api/avatar`

Removes the stored palette.

### `POST /api/account/email` — add an address

Session required. `{ "email": "..." }`. Sends a verification code to the **new**
address, so adding an address does not require proving you own the one you are
signed in with — possession of the session is the authorisation.

**400** `That email is already used by another account.`

### `PUT /api/account/email` — verify the new address

`{ "email": "...", "code": "123456" }`.

### `DELETE /api/account` — delete the account

Session required. Cascades: sessions, OAuth accounts, inboxes, messages, hints
and images all go with it. Irreversible; the UI asks twice.

---

## Media

### `GET /api/media/fetch?url=…`

Proxies an image **from a fixed allowlist of social CDNs** so the app never makes
a request to an arbitrary host. This is an SSRF boundary, not a convenience.

- URL length ≤ 2000, scheme `https:` only
- Host must be on the allowlist; subdomain matching is exact-per-label
- Redirects are not followed blindly
- The response body is streamed with a **hard byte cap** and the connection is cut
  the moment it is exceeded, so a `Content-Length: small` followed by an endless
  body cannot exhaust memory
- `Content-Type` must be an image; the type is re-checked on the way out

Rate-limited. **429** `Too many fetches from your connection. Try again later.`
**400** `MediaError` messages, e.g. a host that is not on the list.
**502** `Could not download that image.`

---

## Health

### `GET /api/health`

```jsonc
{ "ok": true, "status": "ok", "time": "2026-09-28T14:22:19.665Z" }
```

In production that is the entire response. With `HEALTH_DETAIL=1` — or
automatically outside production — it also reports the version, the schema
version, and the user count.

That detail is reconnaissance if it is public, which is why it is opt-in and off
by default in production.

---

## Full route table

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/auth/email` | — | request a login code |
| `POST` | `/api/auth/verify` | — | exchange a code for a session |
| `GET` | `/api/auth/oauth/{provider}` | — | start OAuth |
| `GET` | `/api/auth/oauth/{provider}/callback` | — | finish OAuth |
| `POST` | `/api/auth/logout` | session | end the session |
| `POST` | `/api/inboxes` | session | create an inbox |
| `PATCH` | `/api/inboxes/{slug}` | owner | rename / toggle notifications |
| `POST` | `/api/messages` | — | send anonymously |
| `GET` | `/api/messages/{slug}` | — | read an inbox (side-effect free) |
| `POST` | `/api/messages/{slug}` | — | mark as read |
| `DELETE` | `/api/messages/{slug}` | owner | delete a message |
| `GET` | `/api/claim/{token}` | token | read the claim |
| `POST` | `/api/claim/{token}` | token | attach or replace the hint |
| `GET` | `/api/profile` | session | read the profile |
| `PATCH` | `/api/profile` | session | update the profile |
| `POST` | `/api/avatar` | session | set the avatar palette |
| `DELETE` | `/api/avatar` | session | clear the avatar |
| `POST` | `/api/account/email` | session | add an address |
| `PUT` | `/api/account/email` | session | verify the new address |
| `DELETE` | `/api/account` | session | delete the account |
| `GET` | `/api/media/fetch` | — | allowlisted image proxy |
| `GET` | `/api/health` | — | liveness |

## Status codes

| Code | Meaning here |
|---|---|
| `200` / `201` | success (`201` for a newly sent message) |
| `202` | honeypot trip — looks like a failure, stores nothing |
| `400` | validation failed, or the request made no sense |
| `401` | no session |
| `403` | wrong origin, or not the owner |
| `404` | no such inbox, message, or claim |
| `429` | rate limited |
| `500` | server error; the message says nothing was lost |
