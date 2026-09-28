# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# UnNGL — multi-stage, standalone Next.js output on a slim Node image.
# The whole service is one process and one SQLite file: mount a volume at
# /app/data and back it up by copying that file.
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
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_PATH=/app/data/unngl.sqlite

# openssl is only here for the `openssl rand` line in the quick-start below;
# drop it and the apk if you generate your secret elsewhere.
RUN apk add --no-cache openssl \
 && addgroup -g 1001 -S unngl \
 && adduser -u 1001 -S unngl -G unngl

COPY --from=builder --chown=unngl:unngl /app/.next/standalone ./
COPY --from=builder --chown=unngl:unngl /app/.next/static ./.next/static
COPY --from=builder --chown=unngl:unngl /app/public ./public

RUN mkdir -p /app/data && chown -R unngl:unngl /app/data
USER unngl
VOLUME ["/app/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Generate a real one:  docker run --rm unngl node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
CMD ["node", "server.js"]
