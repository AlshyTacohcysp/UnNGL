# Deployment

UnNGL is one stateless Node process and one PostgreSQL database. There is no
cache, no queue, no object store and no file on disk. That is what makes it
deployable on a free tier: the only thing you have to keep is the database.

Two ways to run it, both free:

| | Cost | Good for |
|---|---|---|
| **[Vercel + Supabase](#option-1--vercel--supabase-recommended)** | free | the public instance. No server to maintain. |
| **[Docker Compose](#option-2--docker-compose)** | free on your own hardware | running it yourself, or a VPS. |

---

## Before anything: two non-negotiables

1. **`SESSION_SECRET` must be set, and must be random.** The server refuses to
   boot in production without it — it exits immediately with instructions, before
   serving a single request.
   ```bash
   openssl rand -base64 48
   ```
   Changing it later logs everyone out and invalidates every stored digest. Set
   it once.
2. **`NEXT_PUBLIC_ORIGIN` must be your real `https://` domain.** Session cookies
   are `Secure` and `__Host-`-prefixed in production, so they are not sent over
   plain HTTP at all, and email links are built from this value.

---

## Option 1 — Vercel + Supabase (recommended)

Both free tiers. No card, no server, no `docker`.

### 1. The database

1. Create a project at [supabase.com](https://supabase.com) and wait for it to
   finish building.
2. Open **Project Settings → Database**. Copy the connection string that looks
   like this:

   ```
   postgresql://postgres.[project-ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
   ```

> **Use the pooler on port `6543`, not the direct connection on `5432`.**
> A serverless function opens a fresh database connection per invocation and
> closes it afterwards. The direct connection is a dedicated session, so a burst
> of requests exhausts the tier's connection limit and the site falls over. The
> transaction pooler is built for exactly this. The app connects with
> `prepare: false` for the same reason — the pooler has no session to hang a
> prepared statement on.

Set **Transaction pooler** as the pool mode if Supabase asks, and turn **SSL**
on if it offers the choice. The app does not require the `pgbouncer=true` query
parameter that the Prisma-style URLs carry; it is harmless if you leave it.

3. Optional, but recommended: open **SQL Editor → New query** and paste
   [`supabase/schema.sql`](../../supabase/schema.sql), then run it. The app
   applies the same schema by itself at boot, so this is not required — it just
   means the tables exist before the first visitor does, and that you have read
   the schema before it touches your project.

> **The free tier pauses after 7 days of inactivity.** When it wakes, the first
> request can take up to half a minute while the database restarts. This is the
> single sharpest edge of running UnNGL for free; everything else about the
> deployment is uneventful. If that trade is wrong for you, [Option 2](#option-2--docker-compose)
> on hardware you already own removes it.

### 2. The app

1. Push this repository to GitHub, then **Import Project** on
   [vercel.com](https://vercel.com). Vercel detects Next.js; nothing needs
   changing.
2. Add these **environment variables** (Settings → Environment Variables):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | the `6543` connection string from step 1 |
   | `SESSION_SECRET` | the 48 random bytes from above |
   | `NEXT_PUBLIC_ORIGIN` | `https://your-app.vercel.app` — then your real domain |
   | `MAIL_TRANSPORT` | `smtp` once you have SMTP configured, see [Email](#email) |
   | `MAIL_FROM` | `UnNGL <no-reply@yourdomain>` |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | your SMTP provider's |
   | `ENABLE_HSTS` | `1` — see the note below |

   `TRUSTED_PROXY=1` **only** if a proxy you control is the sole path to the
   app. Vercel is that proxy, so set it; without it the app cannot see client IP
   addresses and every visitor shares one rate-limit bucket, which disables
   rate limiting in practice.

3. **Deploy.** The first request applies the schema. Nothing else to run.

4. Once you have a real domain, set `NEXT_PUBLIC_ORIGIN` to it and redeploy.
   `NEXT_PUBLIC_ORIGIN` is a runtime setting — changing it and redeploying is
   enough, no rebuild of the app is required.

### HSTS

```bash
ENABLE_HSTS=1 npm run build
```

HSTS tells browsers to refuse plaintext for two years. Do not enable it while
still setting things up — browsers will not let you back out.

> On Vercel the build command is in the project settings, so set the variable
> there and redeploy rather than building locally.

> **`ENABLE_HSTS` is a build-time setting, not a runtime one.** `next.config` is
> not present in the deployed output, so putting it in `.env` and restarting does
> nothing at all, silently. It has to be set when the app is built. The server
> knows what it was compiled with and says so at boot, so you can tell which
> happened. With Docker:
> ```bash
> docker build --build-arg ENABLE_HSTS=1 -t unngl:latest .
> ```

---

## Option 2 — Docker Compose

Runs the app and a real PostgreSQL together. Nothing is published to the host
except the app's own port.

```bash
git clone https://github.com/AlshyTacohcysp/UnNGL
cd UnNGL
cp .env.example .env
# set SESSION_SECRET, NEXT_PUBLIC_ORIGIN
docker compose up -d
```

The database lives in a Docker **named volume**, so `docker compose down` never
touches it, and `docker compose down -v` is the one command that discards it.
`docker-compose.yml` waits for the database to actually accept connections
before starting the app, because the app applies its migrations on boot.

To use a PostgreSQL you already have instead of the bundled one, set
`DATABASE_URL` in `.env` and delete the `DATABASE_URL` line from the
`environment:` block in `docker-compose.yml`.

### Plain Node on a VPS

The Docker image is the whole story, and it also runs without Docker:

```bash
git clone https://github.com/AlshyTacohcysp/UnNGL
cd UnNGL
npm ci
ENABLE_HSTS=1 npm run build
DATABASE_URL='postgresql://…' SESSION_SECRET="$(openssl rand -base64 48)" \
  NEXT_PUBLIC_ORIGIN='https://unngl.example.com' \
  node scripts/start.mjs
```

Put it behind a reverse proxy that terminates TLS. The app is stateless, so you
can run as many as you like against one database.

---

## Email

Without configuration, login codes go to the server log and nothing is sent.
That is fine for a private instance and unusable for a public one — email is the
primary way to sign in, so a public instance without SMTP cannot be used at all.

```bash
MAIL_TRANSPORT=smtp
MAIL_FROM=UnNGL <no-reply@unngl.example.com>
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=unngl
SMTP_PASS=<password>
```

The SMTP client is written from scratch — no `nodemailer` — because it is about
300 lines of AUTH/LOGIN and MIME framing, and because a dependency is a
dependency. It speaks ESMTP with `STARTTLS`, `PLAIN` and `LOGIN` auth.

If you stay on `console` in production, the server prints a warning at boot
saying so. Codes are still never returned in an API response.

Most people reach for Resend, Mailgun, Brevo or Postmark's free tier here; all
four work, and all four have a free tier that covers a small instance.

## OAuth (optional)

Set the client id and secret for any provider; each one switches itself on.
The callback URL is always:

```
{NEXT_PUBLIC_ORIGIN}/api/auth/oauth/{provider}/callback
```

With `NEXT_PUBLIC_ORIGIN=https://unngl.example.com`, Google is
`https://unngl.example.com/api/auth/oauth/google/callback`. See
[getting started](getting-started.md#sign-in) for what each provider does.

---

## Backups

A Postgres database is backed up with `pg_dump`, not `cp`. A plain copy of a
live database can capture a torn state.

```bash
pg_dump "$DATABASE_URL" -Fc -f "/backups/unngl-$(date +%F).dump"
```

With the Docker named volume:

```bash
docker compose exec -T db pg_dump -U postgres -d unngl -Fc > "unngl-$(date +%F).dump"
```

Keep a week of daily snapshots, off the machine. A day-old database is a day of
messages; a lost database is all of them.

On Supabase, daily backups are included on paid tiers; on the free tier, take
your own with the command above, or point a free GitHub Actions cron at it.

## Upgrades

On Vercel: redeploy, or let a new commit redeploy for you. Nothing to run by
hand.

With Docker or on a server:

```bash
pg_dump "$DATABASE_URL" -Fc -f /tmp/pre-upgrade.dump
git pull
docker compose up -d --build     # or: npm ci && npm run build && restart
```

Schema changes are idempotent `CREATE TABLE IF NOT EXISTS` statements recorded
in a `schema_migrations` table and run at boot, so there is no separate
migration step and nothing to run by hand. If the server does not come back up,
restore the snapshot.

## Operating it

- `GET /api/health` returns `{"ok":true,"status":"ok","time":"…"}`. It is
  deliberately boring; add `HEALTH_DETAIL=1` only if you want version, schema and
  user count in the response, and remember that in production that is
  reconnaissance.
- On boot, the server audits its own configuration and prints a warning for
  anything weak: a missing or short secret, `DATABASE_URL` unset or pointing at
  localhost, `NEXT_PUBLIC_ORIGIN` not on HTTPS, mail still going to the log,
  health detail on, HSTS on without HTTPS. It is advice, not a blocker — read it
  once after your first deploy.
- Logs are plain `console` output, which on Vercel means the function logs.
- The hint-image sweep runs opportunistically on message creation: any photo
  older than `HINT_IMAGE_RETENTION_DAYS` (7) is deleted along with the row that
  points at it. No cron required. If the instance is idle, photos simply sit
  until the next message; the palette they produced is already in the message row.

## Hardening checklist

- [ ] `SESSION_SECRET` random, ≥ 32 bytes, not in git
- [ ] `NEXT_PUBLIC_ORIGIN` is `https://` and matches the real domain
- [ ] TLS terminates in front; HTTP redirects to HTTPS
- [ ] `DATABASE_URL` uses the **pooler**, port `6543`
- [ ] Rebuilt with `ENABLE_HSTS=1` once the domain is permanent (build-time)
- [ ] `TRUSTED_PROXY=1` **only** if a proxy you control is the sole path in
- [ ] `EXPOSE_DEV_CODES` unset
- [ ] `HEALTH_DETAIL` unset
- [ ] `MAIL_TRANSPORT=smtp` if the instance is public
- [ ] A daily `pg_dump` runs, off the machine
