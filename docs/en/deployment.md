# Deployment

The whole service is one Node process and one SQLite file. There is no database
server, no cache, no queue, and no object store to provision. If you can run a
container and copy a file, you can run UnNGL.

## Before anything: two non-negotiables

1. **`SESSION_SECRET` must be set, and must be random.** The server refuses to
   boot in production without it — it exits immediately with instructions, before
   serving a single request.
   ```bash
   openssl rand -base64 48
   ```
2. **Terminate TLS in front of it.** Session cookies are `Secure` and
   `__Host-`-prefixed in production, so they are not sent over plain HTTP at all.
   This is correct behaviour, and it will make local testing look broken until
   you have a real certificate. Use a real domain, not an IP.

Optionally, once HTTPS is permanent on the domain:

```bash
ENABLE_HSTS=1 npm run build
```

HSTS tells browsers to refuse plaintext for two years. Do not enable it while
still setting things up — browsers will not let you back out.

> **`ENABLE_HSTS` is a build-time setting, not a runtime one.** `next.config` is
> not part of the standalone output, so putting it in `.env` and restarting does
> nothing at all, silently. It has to be set when you build. The server knows
> what it was compiled with and says so at boot, so you can tell which happened.
> With Docker:
> ```bash
> docker build --build-arg ENABLE_HSTS=1 -t unngl:latest .
> ```

---

## Option 1 — Docker Compose (recommended)

```bash
git clone https://github.com/AlshyTacohcysp/UnNGL
cd UnNGL
cp .env.example .env
```

Edit `.env` and set at minimum:

```bash
NEXT_PUBLIC_ORIGIN=https://unngl.example.com
SESSION_SECRET=<paste the openssl output>
```

Then:

```bash
docker compose up -d --build
docker compose logs -f
```

The SQLite file lives in a Docker **named volume**, so `docker compose down`
never touches your messages, and the database is not readable from anywhere else
on the host. The image runs as a non-root user on port 3000, has a healthcheck,
and ships Next.js *standalone* output, so the final image carries no build
tooling and no `node_modules` you did not ask for.

> **Want to see your data?** Switch to a bind mount — but run
> `mkdir -p data && sudo chown 1001:1001 data` first. The image runs as uid 1001
> and a directory Docker creates for a bind mount belongs to root, so SQLite
> cannot create its `-wal`/`-shm` files and the container exits on first start.
> It is the single most common first-run failure. The exact lines to change are
> commented at the bottom of `docker-compose.yml`.

Put a reverse proxy in front (Caddy, nginx, Traefik) for TLS. A minimal Caddyfile:

```
unngl.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Caddy gets the certificate on its own.

## Option 2 — plain Node on a VPS

```bash
git clone https://github.com/AlshyTacohcysp/UnNGL
cd UnNGL
npm ci
npm run build
```

Run it under a supervisor with a systemd unit:

```ini
[Unit]
Description=UnNGL
After=network.target

[Service]
Type=simple
User=unngl
WorkingDirectory=/srv/unngl
Environment=NODE_ENV=production
EnvironmentFile=/srv/unngl/.env
ExecStart=/usr/bin/node scripts/start.mjs
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/srv/unngl/data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now unngl
```

## Option 3 — PaaS (Fly, Railway, Render, Koyeb)

Works as-is, with one requirement: **the filesystem must be persistent**, because
the database is a file. Mount a volume and point `DATABASE_PATH` at it.

- **Fly.io**: `fly volumes create unngl_data`, set `mounts: ["/srv/data"]`,
  `DATABASE_PATH=/srv/data/unngl.sqlite`.
- **Railway / Render**: attach a disk, set the same variable.
- **Serverless platforms (Vercel, Lambda) will not work**, because their
  filesystems are ephemeral. Running more than one instance will also not work,
  for the same reason: SQLite means exactly one writer.

If you need horizontal scale, that is a fork with a different database, not a
configuration change. Be honest about it in your README if you do it.

---

## Email

Without configuration, login codes go to the server log and nothing is sent.
That is fine for a private instance and unusable for a public one.

Set:

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

Everything that matters is one file.

```bash
sqlite3 /srv/unngl/data/unngl.sqlite ".backup '/backups/unngl-$(date +%F).sqlite'"
```

With the Docker named volume:

```bash
docker run --rm -v unngl_data:/data -v "$PWD":/backup alpine \
  sh -c 'cd /data && sqlite3 unngl.sqlite ".backup /backup/unngl-$(date +%F).sqlite"'
```

Use `.backup`, not `cp`. The database runs in WAL mode, so a plain `cp` of a live
file can capture a torn state. `.backup` takes a consistent snapshot safely.

Keep a week of daily snapshots, off the machine. A day-old database is a day of
messages; a lost database is all of them.

## Upgrades

```bash
cd /srv/unngl
sqlite3 data/unngl.sqlite ".backup '/tmp/pre-upgrade.sqlite'"
git pull
npm ci
npm run build
sudo systemctl restart unngl
```

Schema changes are idempotent `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE … ADD
COLUMN` statements run at open time, so there is no separate migration step and
nothing to run by hand. If the server does not come back up, restore the
snapshot.

## Operating it

- `GET /api/health` returns `{"ok":true,"status":"ok","time":"…"}`. It is
  deliberately boring; add `HEALTH_DETAIL=1` only if you want version, schema and
  user count in the response, and remember that in production that is
  reconnaissance.
- On boot, the server audits its own configuration and prints a warning for
  anything weak: a missing or short secret, `NEXT_PUBLIC_ORIGIN` not on HTTPS,
  mail still going to the log, health detail on, HSTS on without HTTPS. It is
  advice, not a blocker — read it once after your first deploy.
- Logs are plain `console` output. There is no log file to rotate.
- The hint-image sweep runs opportunistically on message creation: any photo
  older than `HINT_IMAGE_RETENTION_DAYS` (7) is deleted along with the row that
  points at it. No cron required. If the instance is idle, photos simply sit
  until the next message; the palette they produced is already in the message row.

## Hardening checklist

- [ ] `SESSION_SECRET` random, ≥ 32 bytes, not in git
- [ ] `NEXT_PUBLIC_ORIGIN` is `https://`
- [ ] TLS terminates in front; HTTP redirects to HTTPS
- [ ] Rebuilt with `ENABLE_HSTS=1` once the domain is permanent (build-time)
- [ ] `TRUSTED_PROXY=1` **only** if a proxy you control is the sole path in
- [ ] `EXPOSE_DEV_CODES` unset
- [ ] `HEALTH_DETAIL` unset
- [ ] `MAIL_TRANSPORT=smtp` if the instance is public
- [ ] `.env` is `chmod 600` and owned by the service user
- [ ] Daily `.backup` off the machine
- [ ] `/srv/unngl/data` is not inside a world-readable web root
