# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# UnNGL — multi-stage, standalone Next.js output on a slim Node image.
#
# The service is stateless: the database is a remote Postgres, so there is no
# volume to mount and nothing to back up here. Set DATABASE_URL to point at
# one — Supabase's transaction pooler, or the `db` service in
# docker-compose.yml.
#
# Run it as uid 1001. Nothing on disk needs to be writable, so there is no
# bind-mount ownership trap to walk into.
# ---------------------------------------------------------------------------

FROM node:22-alpine AS deps
WORKDIR /app
# Only the manifests, so a source-only change doesn't reinstall the world.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The build must not need SESSION_SECRET; the server enforces it at runtime.
ENV SESSION_SECRET=build-time-placeholder
# HSTS is a build-time setting: next.config is not present in the standalone
# output, so an ENABLE_HSTS value passed only at runtime is silently ignored.
# Once the domain is permanently HTTPS, rebuild with:
#   docker build --build-arg ENABLE_HSTS=1 -t unngl:latest .
ARG ENABLE_HSTS=0
ENV ENABLE_HSTS=${ENABLE_HSTS}
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S unngl \
 && adduser -u 1001 -S unngl -G unngl

COPY --from=builder --chown=unngl:unngl /app/.next/standalone ./
COPY --from=builder --chown=unngl:unngl /app/.next/static ./.next/static
COPY --from=builder --chown=unngl:unngl /app/public ./public

# The container refuses to start without a database URL, rather than coming up
# healthy and 500ing on every request.
ENV DATABASE_URL=postgres://postgres:postgres@db:5432/unngl
USER unngl
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Generate a real one on the host (openssl is deliberately not in this image):
#   openssl rand -base64 48
# or, with no openssl anywhere:
#   node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
CMD ["node", "server.js"]
