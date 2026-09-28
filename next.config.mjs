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

  // Vercel builds and runs the app itself; `output: 'standalone'` only matters
  // to the Docker image and to `npm start` on a server. Leaving it on is
  // harmless on Vercel but confusing, so it follows the target: set
  // DEPLOY_TARGET=vercel to drop it.
  ...(process.env.DEPLOY_TARGET === 'vercel' ? {} : { output: 'standalone' }),

  // The Postgres driver speaks the wire protocol over a raw TCP socket and
  // reaches for node:tls, node:crypto and node:stream. Webpack cannot resolve
  // those Node builtins from inside it, so the bundle fails to build with
  // MODULE_NOT_FOUND. Keeping the package external makes Node require it at
  // runtime, where those builtins simply exist.
  serverExternalPackages: ['postgres'],

  webpack(config, { isServer }) {
    if (isServer) {
      // `serverExternalPackages` covers the route and server-component
      // compilations, but the instrumentation hook is bundled in a layer of its
      // own, and the driver is pulled in from there too. Name it external in
      // every server compilation rather than fixing one layer and hoping.
      config.externals = [...(config.externals ?? []), 'postgres'];
    }
    return config;
  },

  // HSTS is decided at BUILD time, because next.config is not present in the
  // standalone output — an ENABLE_HSTS value exported only at runtime is
  // silently ignored, which is the sort of thing an operator assumes worked.
  // Bake the decision so the server can still read it at runtime and warn about
  // a nonsensical combination (HSTS on a plain-HTTP origin, or vice versa).
  env: {
    UNNGL_HSTS: process.env.ENABLE_HSTS === '1' ? '1' : '0',
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
