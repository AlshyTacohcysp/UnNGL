/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  // better-sqlite3 is a native module: keep it external to the server bundle.
  serverExternalPackages: ['better-sqlite3'],
  experimental: {
    optimizePackageImports: ['zod'],
  },
  async headers() {
    return [
      {
        // The app is a PWA-ish, self-contained static shell: no third-party origins.
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
};

export default nextConfig;
