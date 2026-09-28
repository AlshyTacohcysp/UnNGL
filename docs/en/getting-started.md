# Getting started

## Requirements

- **Node 22.5 or newer.** That is the only hard requirement, and it is not
  arbitrary: UnNGL uses Node's built-in `node:sqlite`, so there is no native
  module to compile and no database server to run. On 22.5–22.x you will see one
  `ExperimentalWarning` about SQLite at boot; the app silences it internally.
- Nothing else. No PostgreSQL, no Redis, no Docker, no cloud account.

Check your version:

```bash
node -v
```

## Run it locally

```bash
git clone https://github.com/AlshyTacohcysp/UnNGL
cd UnNGL
npm install
npm run build
npm start
```

Open <http://localhost:3000>. There is no configuration step: a fresh checkout
runs.

> **Development mode** (auto-reload, and the login code shown in the UI):
> ```bash
> npm run dev
> ```
> For the code to appear in the browser, add `EXPOSE_DEV_CODES=1` to
> `.env.local`. It is refused in production — see
> [security](security.md#the-one-flag-to-never-enable).

## Try the whole flow in five minutes

### 1. Get a link

Click **Sign in**, enter any email address, and press *Email me a code*. With no
mail server configured, the code is printed to the server log:

```
┌─ UnNGL login code ─────────────────────────────────
│ to:   you@example.com
│ code: 424242
│ link: http://localhost:3000/login?email=…&code=424242
└────────────────────────────────────────────────────
```

In development mode the code also appears on screen. Type it in and you are in.

> The link in that email is the nicer path: it arrives with the code
> pre-filled, so the email works even for someone who cannot see the UI.

### 2. Get a message

Your new inbox has a short link like `unngl.link/a7k3m9xp2qvn`. Open it in a
private window — it is the public composer, exactly what anyone who has your
link sees. Write something.

To attach a hint, drop in a photo. The six colours appear immediately, in your
browser, before anything is uploaded.

### 3. Read it

Go back to `/inbox` (or the `/i/<slug>` link) and you will see the message with
its palette rendered in full, labelled *server-verified* if the colours the
server recomputed from the original photo match what the browser claimed.

### 4. Try the claim link

After sending, the composer gives you a private link like `/h/<token>`. It is
the only way back to that message, and it lets you attach or change your palette
after the fact. Only you have it.

## Seed a demo inbox

To skip all of that:

```bash
npm run seed
```

This creates `demo@unngl.link` with an inbox containing four messages, three of
them with real palettes computed by the published algorithm. It prints the login
code, the inbox link and the public composer link. Re-running it is safe.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | development server with hot reload, on port 3000 |
| `npm run build` | production build |
| `npm start` | production server (standalone output if built, else `next start`) |
| `npm test` | the full test suite (64 tests) |
| `npm run typecheck` | TypeScript, no emit |
| `npm run seed` | create the demo account and inbox |
| `npm run samples` | regenerate the example palettes in the marketing pages |
| `npm run assets` | regenerate the favicon and Open Graph card |

## Configuration

Every variable is documented in [`.env.example`](../../.env.example). For a local
run you need none of them.

The one thing that matters in production is `SESSION_SECRET`:

```bash
openssl rand -base64 48
```

The server refuses to boot in production without it, which is intentional — see
[security](security.md#secrets).

## Project layout

```
src/
  app/
    [slug]/       the public composer (the shareable link)
    i/[slug]/     the owner's inbox
    h/[token]/    the sender's claim link
    algorithm/    the published spec + playground
    api/          every route handler
  components/     collage, composer, hint picker, panels, playground
  lib/
    palette/
      extract.ts  THE ALGORITHM — runs in the browser and on the server
      png.ts      dependency-free PNG decoder (the verification path)
      client.ts   browser upload pipeline
    db.ts         node:sqlite, migrations, no ORM
    auth.ts       users, sessions, email codes
    hints.ts      creating and verifying a hint
    inbox.ts      inboxes, messages, claim tokens
    media.ts      allowlisted image fetching
    mail.ts       dependency-free SMTP client
    oauth.ts      one client, four providers
tests/            palette + security regression tests
scripts/          samples, assets, seed, start
docs/             this documentation
```

## Where to go next

- [Deployment](deployment.md) — putting it online properly
- [Architecture](architecture.md) — how the pieces fit
- [Security](security.md) — before you expose it to anyone
