# Getting started

## Requirements

- **Node 22 or newer.**
- **A PostgreSQL database.** In production that is Supabase's free tier. For
  development you do not need to install anything: `npm run db:serve` starts a
  real PostgreSQL in the same process, served over the wire protocol, so the app
  connects to it through the same driver it uses in production.

Check your version:

```bash
node -v
```

## Run it locally

```bash
git clone https://github.com/AlshyTacohcysp/UnNGL
cd UnNGL
npm install
cp .env.example .env.local

# Terminal 1 — a real PostgreSQL, in memory, for as long as this runs.
npm run db:serve

# Terminal 2 — the app.
npm run dev
```

Open <http://localhost:3000>. The schema is created automatically the first time
the app connects.

> **Against a real database instead:** point `DATABASE_URL` in `.env.local` at
> any PostgreSQL 14 or newer and skip `npm run db:serve`. The local one keeps
> its data in memory, so it starts empty every time.

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
| `npm test` | the full test suite (74 tests) |
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
    db.ts         postgres, migrations, no ORM
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
