/** @type {import('next').NextConfig} */

// A strict Content-Security-Policy. UnNGL has no third-party origins at all, so
// this can be tight: no CDN, no analytics, no remote fonts, no embeds.
//
//   script-src 'self' 'unsafe-inline'   Next injects its own inline bootstrap
//   style-src  'self' 'unsafe-inline'   React style props (the palette collage)
//   img-src    'self' data: blob:       palette previews are data: URLs
//   form-action 'self'                   nothing is posted off-origin
//   frame-ancestors 'none'               not embeddable, clickjacking
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'none'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',

  // Never trace runtime state into the standalone output.
  //
  // Next's file tracer follows anything referenced from the app, and the
  // database path is read at runtime, so `data/unngl.sqlite` was ending up
  // copied into .next/standalone. That is the directory people copy to a
  // server, and .dockerignore hides the problem in a Docker build but not in a
  // plain one: the image — or the tarball — would ship the developer's local
  // messages, and a fresh instance would start against a stale database.
  //
  // The glob is '/**' rather than '*': a bare '*' also matches Next's own
  // internal routes, and excluding against those strips files out of the
  // traced copy of the `next` package and produces a standalone server that
  // dies on startup with MODULE_NOT_FOUND.
  outputFileTracingExcludes: {
    '/**': ['data/**', '**/*.sqlite', '**/*.sqlite-wal', '**/*.sqlite-shm'],
  },

  experimental: {
    optimizePackageImports: ['zod'],
  },
  async headers() {
    const headers = [...securityHeaders];

    // HSTS only makes sense over TLS, and only once you are certain the domain
    // is permanently HTTPS. It is opt-in for that reason: turning it on for a
    // plain-HTTP staging box locks browsers out of it for two years.
    if (process.env.ENABLE_HSTS === '1') {
      headers.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      });
    }

    return [{ source: '/:path*', headers }];
  },
};

export default nextConfig;
