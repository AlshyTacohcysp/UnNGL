/**
 * Security regression tests.
 *
 * Each test here corresponds to a real defect that existed at some point, or
 * to an attack that the design is supposed to refuse. They are written to fail
 * loudly if the corresponding protection is ever removed.
 *
 * @license AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';
import { decodePng, isPng, ImageError, MAX_EDGE, MAX_PIXELS } from '../src/lib/palette/png';
import { safeRedirectPath } from '../src/lib/redirect';
import { isAllowedMediaUrl } from '../src/lib/media';

/* ------------------------------------------------------------------ *
 * Reading source files in assertions
 * ------------------------------------------------------------------ */

/**
 * Read a source file with its comments stripped.
 *
 * Several tests below assert on how code *reads*, not on what it *says*, so a
 * comment explaining the very thing being asserted would otherwise make the test
 * pass or fail for the wrong reason. String literals are preserved, because
 * 'https://x' contains something that looks like the start of a comment.
 */
function readCode(relative: string): string {
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  const src = readFileSync(new URL(relative, import.meta.url), 'utf8');
  let out = '';
  let i = 0;
  let mode: 'code' | 'line' | 'block' | 'str' | 'tmpl' = 'code';
  while (i < src.length) {
    const c = src[i]!;
    const next = src[i + 1]!;
    if (mode === 'code') {
      if (c === '/' && next === '/') { mode = 'line'; i += 2; continue; }
      if (c === '/' && next === '*') { mode = 'block'; i += 2; continue; }
      if (c === "'") mode = 'str';
      else if (c === '`') mode = 'tmpl';
      else if (c === '"') mode = 'str';
      out += c; i++; continue;
    }
    if (mode === 'line') { if (c === '\n') { mode = 'code'; out += c; } i++; continue; }
    if (mode === 'block') { if (c === '*' && next === '/') { mode = 'code'; i += 2; } else i++; continue; }
    // inside a string or template
    if (c === '\\') { out += c + next; i += 2; continue; }
    if ((mode === 'str' && c === "'") || (mode === 'tmpl' && c === '`')) mode = 'code';
    out += c; i++;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * helpers: a minimal PNG writer, so we can forge hostile files
 * ------------------------------------------------------------------ */

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const b of bytes) crc = crcTable[(crc ^ b) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

function assemble(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of parts) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/** A PNG with arbitrary declared dimensions and arbitrary IDAT contents. */
function forgePng(width: number, height: number, idatBody: Uint8Array, bitDepth = 8, colorType = 6): Uint8Array {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = bitDepth;
  ihdr[9] = colorType;
  return assemble([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idatBody),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

/** Filter-0 scanlines for a real w*h image. */
function rawScanlines(width: number, height: number, channels = 4): Uint8Array {
  const out = new Uint8Array(height * (1 + width * channels));
  out.fill(0x80);
  for (let y = 0; y < height; y++) out[y * (1 + width * channels)] = 0; // filter byte
  return out;
}

describe('PNG decoder: resource exhaustion', () => {
  it('rejects a tiny file that declares an enormous image', () => {
    // ~60 bytes on the wire, 60000x60000 = 3.6 gigapixels if it were believed.
    const bomb = forgePng(60000, 60000, deflateSync(rawScanlines(1, 1)));
    expect(bomb.length).toBeLessThan(200);
    expect(() => decodePng(bomb)).toThrow(/larger than|more than/);
  });

  it('rejects dimensions at exactly one past the limit', () => {
    const png = forgePng(MAX_EDGE + 1, 4, deflateSync(rawScanlines(MAX_EDGE + 1, 4)));
    expect(() => decodePng(png)).toThrow(/larger than/);
  });

  it('accepts dimensions exactly at the limit', () => {
    const png = forgePng(MAX_EDGE, 2, deflateSync(rawScanlines(MAX_EDGE, 2)));
    expect(decodePng(png).width).toBe(MAX_EDGE);
  });

  it('rejects a pixel count over the cap even when each edge is legal', () => {
    // Both edges under MAX_EDGE, but the product is over MAX_PIXELS.
    const side = Math.floor(Math.sqrt(MAX_PIXELS)) + 1;
    expect(side * side).toBeGreaterThan(MAX_PIXELS);
    const png = forgePng(side, side, deflateSync(new Uint8Array(16)));
    expect(() => decodePng(png)).toThrow(/larger than|more than/);
  });

  it('refuses to inflate more than IHDR says the image needs (zip bomb)', () => {
    // 8x8 declared, but 8 MB of highly compressible IDAT behind it.
    const huge = new Uint8Array(8 * 1024 * 1024);
    huge.fill(0);
    const bomb = forgePng(8, 8, deflateSync(huge, { level: 9 }));
    expect(bomb.length).toBeLessThan(50_000); // small on the wire
    expect(() => decodePng(bomb)).toThrow();
  });

  it('rejects zero and absurd dimensions', () => {
    expect(() => decodePng(forgePng(0, 10, deflateSync(new Uint8Array(8))))).toThrow(/invalid dimensions/);
    expect(() => decodePng(forgePng(10, 0, deflateSync(new Uint8Array(8))))).toThrow(/invalid dimensions/);
  });

  it('rejects a truncated pixel stream', () => {
    // Declares 64x64 but the IDAT inflates to far less than that.
    const png = forgePng(64, 64, deflateSync(new Uint8Array(32)));
    expect(() => decodePng(png)).toThrow();
  });

  it('still decodes an honest image', () => {
    const png = forgePng(16, 16, deflateSync(rawScanlines(16, 16)));
    const img = decodePng(png);
    expect(img.width).toBe(16);
    expect(img.data).toHaveLength(16 * 16 * 4);
  });

  it('honours per-call limits below the module default', () => {
    const png = forgePng(64, 64, deflateSync(rawScanlines(64, 64)));
    expect(() => decodePng(png, { maxEdge: 32 })).toThrow(/larger than/);
  });
});

/* ------------------------------------------------------------------ *
 * SSRF
 * ------------------------------------------------------------------ */

describe('media fetch allowlist', () => {
  const allowed = [
    'https://scontent.cdninstagram.com/v/t51/x.jpg',
    'https://cdninstagram.com/a.png',
    'https://lookaside.fbsbx.com/thing.jpg',
    'https://scontent.xx.fbcdn.net/v/image.jpg',
    // The allowlist is a *host* check, so a bare allowlisted host passes too;
    // the request then 404s, which is harmless.
    'https://cdninstagram.com',
  ];

  it.each(allowed)('allows %s', (url) => {
    expect(isAllowedMediaUrl(url)).toBe(true);
  });

  const refused = [
    ['loopback', 'http://127.0.0.1:3000/api/health'],
    ['loopback alias', 'http://localhost/admin'],
    ['link-local metadata', 'http://169.254.169.254/latest/meta-data/iam/'],
    ['file scheme', 'file:///etc/passwd'],
    ['gopher scheme', 'gopher://example.com/'],
    ['plain http', 'http://cdninstagram.com/a.png'],
    ['unrelated host', 'https://evil.example.com/x.png'],
    // The classic: the allowlisted string is in the middle, not at the end.
    ['suffix confusion', 'https://cdninstagram.com.evil.com/x.png'],
    ['prefix confusion', 'https://evilcdninstagram.com/x.png'],
    ['userinfo confusion', 'https://cdninstagram.com@evil.com/x.png'],
    ['embedded creds', 'https://user:pass@cdninstagram.com/x.png'],
    ['non-standard port', 'https://cdninstagram.com:8443/x.png'],
  ] as const;

  it.each(refused)('refuses %s', (_name, url) => {
    expect(isAllowedMediaUrl(url)).toBe(false);
  });

  it('refuses nonsense without throwing', () => {
    for (const junk of ['', 'not a url', '://', 'https://', 'javascript:alert(1)']) {
      expect(isAllowedMediaUrl(junk)).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ *
 * open redirect
 * ------------------------------------------------------------------ */

describe('post-login redirect target', () => {
  it('accepts same-site paths', () => {
    expect(safeRedirectPath('/inbox')).toBe('/inbox');
    expect(safeRedirectPath('/i/abc123')).toBe('/i/abc123');
    expect(safeRedirectPath('/inbox?x=1')).toBe('/inbox?x=1');
  });

  it('refuses anything that could leave the site', () => {
    const hostile = [
      '//evil.com',
      '///evil.com',
      'https://evil.com',
      'http://evil.com',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      '/\\evil.com',
      'https:evil.com',
      '/path\nSet-Cookie: x=y',
      '\\\\evil.com',
    ];
    for (const value of hostile) {
      expect(safeRedirectPath(value)).toBe('/inbox');
    }
  });

  it('falls back for null and undefined', () => {
    expect(safeRedirectPath(null)).toBe('/inbox');
    expect(safeRedirectPath(undefined)).toBe('/inbox');
    expect(safeRedirectPath(null, '/settings')).toBe('/settings');
  });
});

/* ------------------------------------------------------------------ *
 * crypto helpers
 * ------------------------------------------------------------------ */

describe('token generation', () => {
  it('produces 256 bits of entropy in URL-safe base64', async () => {
    const { randomToken, loginCode } = await import('../src/lib/crypto');
    const token = randomToken();
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);

    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(randomToken(32));
    expect(seen.size).toBe(2000);

    for (let i = 0; i < 2000; i++) {
      const code = loginCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it('gives codes a uniform distribution across the first digit', async () => {
    const { loginCode } = await import('../src/lib/crypto');
    const first = new Map<string, number>();
    for (let i = 0; i < 20_000; i++) {
      const d = loginCode()[0]!;
      first.set(d, (first.get(d) ?? 0) + 1);
    }
    expect(first.size).toBe(10);
    for (const [, n] of first) {
      // 20k samples over 10 buckets: 2000 expected, +/-400 is a wide bound that
      // still catches a modulo-style skew.
      expect(n).toBeGreaterThan(1600);
      expect(n).toBeLessThan(2400);
    }
  });
});

/* ------------------------------------------------------------------ *
 * malformed input never reaches the algorithm
 * ------------------------------------------------------------------ */

describe('hostile input', () => {
  it('rejects bytes that merely look like a PNG', () => {
    const fake = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    expect(isPng(fake)).toBe(true);
    expect(() => decodePng(fake)).toThrow();
  });

  it('rejects an empty buffer and a truncated signature', () => {
    expect(isPng(new Uint8Array(0))).toBe(false);
    expect(() => decodePng(new Uint8Array(0))).toThrow(/not a PNG/);
    expect(() => decodePng(new Uint8Array([0x89, 0x50]))).toThrow(/not a PNG/);
  });

  it('rejects interlaced PNGs rather than mis-decoding them', () => {
    const ihdr = new Uint8Array(13);
    const v = new DataView(ihdr.buffer);
    v.setUint32(0, 4);
    v.setUint32(4, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    ihdr[12] = 1; // Adam7
    const png = assemble([
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(rawScanlines(4, 4))),
      chunk('IEND', new Uint8Array(0)),
    ]);
    expect(() => decodePng(png)).toThrow(/interlaced/);
  });

  it('rejects unknown colour types and unknown scanline filters', () => {
    const bad = forgePng(2, 2, deflateSync(new Uint8Array(20)), 8, 9);
    expect(() => decodePng(bad)).toThrow(/colour type/);

    // filter byte 200 is not a valid PNG filter
    const raw = rawScanlines(2, 2);
    raw[0] = 200;
    expect(() => decodePng(forgePng(2, 2, deflateSync(raw)))).toThrow(/filter/);
  });
});

/* ------------------------------------------------------------------ *
 * Image rejection must be a 400 with a reason, not a generic 500
 * ------------------------------------------------------------------ */

describe('image rejection typing', () => {
  it('every decoder failure is an ImageError, so routes can answer 400', () => {
    // Regression: routes used to decide "was this a rejected file?" by testing
    // `err.message.includes('Image')`. The decoder's messages start with a
    // lowercase "image", so every hostile file escaped that check and reached
    // the generic 500 handler — the client was told the server had broken.
    const bombs: Array<[string, Uint8Array]> = [
      ['dimension bomb', forgePng(60_000, 60_000, new Uint8Array(16))],
      ['zero dimensions', forgePng(0, 0, new Uint8Array(16))],
      ['absurd dimensions', forgePng(0xffffffff, 0xffffffff, new Uint8Array(16))],
      ['zip bomb', forgePng(8, 8, deflateSync(Buffer.alloc(8 * 1024 * 1024, 0x80)))],
      ['truncated pixel stream', forgePng(64, 64, new Uint8Array(4))],
      ['not a PNG at all', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])],
    ];
    for (const [name, bytes] of bombs) {
      let err: unknown;
      try {
        decodePng(bytes);
      } catch (e) {
        err = e;
      }
      expect(err, `${name} should be rejected`).toBeInstanceOf(ImageError);
      expect((err as Error).message, `${name} should carry a reason`).toBeTruthy();
    }
  });

  it('a valid image still decodes, so the typing cannot pass by refusing all', () => {
    const bytes = forgePng(2, 2, deflateSync(rawScanlines(2, 2)));
    const img = decodePng(bytes);
    expect(img.width).toBe(2);
    expect(img.data).toHaveLength(2 * 2 * 4);
  });
});

/* ------------------------------------------------------------------ *
 * The database must never live inside .next
 * ------------------------------------------------------------------ */

describe('deployment invariants', () => {
  it('pins DATABASE_PATH to the project root, not the standalone cwd', async () => {
    // Regression, and the worst bug in this file's history. The app defaulted
    // DATABASE_PATH to path.join(process.cwd(), 'data', ...), but the standalone
    // server runs with .next/standalone as its cwd — so a deployment that set no
    // DATABASE_PATH created .next/standalone/data/unngl.sqlite, and every
    // `npm run build` deleted .next. The instance came back healthy and empty,
    // with every message gone and nothing in the logs.
    const start = readCode('../scripts/start.mjs');
    expect(start).toMatch(/process\.env\.DATABASE_PATH\s*=\s*path\.join\(root,/);
    // ...and it must happen before the value is resolved against the root, or
    // the relative-path handling below never sees it.
    expect(start.indexOf('path.join(root,')).toBeLessThan(
      start.indexOf("absolutise('DATABASE_PATH')"),
    );
  });

  it('never falls back to a bare npx next, which would fetch another major', async () => {
    // `npx next start` resolves "next" from the registry when it is not installed
    // locally, so a checkout without node_modules silently downloaded and ran a
    // different major version of the framework than the app was built against.
    const start = readCode('../scripts/start.mjs');
    expect(start).not.toMatch(/spawnSync\(\s*'npx'/);
  });

  it('refuses to run in production without SESSION_SECRET, at boot', async () => {
    // It used to be a lazy getter: the server booted, every page rendered, and
    // the first person to try to sign in was told "something went wrong on our
    // side". A missing secret is an operator error and must read like one.
    const check = readCode('../src/lib/startup-check.ts');
    expect(check).toMatch(/UnNGL cannot start: SESSION_SECRET is not set/);
    expect(check).toMatch(/openssl rand -base64 48/);

    // ...and it must be wired to something that actually runs at boot.
    const instrumentation = readCode('../src/instrumentation.ts');
    expect(instrumentation).toMatch(/auditConfig\(\)/);
    expect(instrumentation).toMatch(/process\.exit\(1\)/);
  });
});

/* ------------------------------------------------------------------ *
 * Settings whose effect is decided at build time must say so
 * ------------------------------------------------------------------ */

describe('build-time settings', () => {
  it('bakes the HSTS decision so the server can report it at boot', async () => {
    // Regression, and a silent one: next.config is not part of the standalone
    // output, so ENABLE_HSTS set only in the environment at runtime did nothing
    // at all — no header, no warning. An operator would tick the box in .env and
    // the hardening checklist would claim HSTS was on. It is now baked into
    // UNNGL_HSTS at build time, so the running server can tell you which
    // combination it was actually compiled with.
    const cfg = readCode('../next.config.mjs');
    expect(cfg).toMatch(/UNNGL_HSTS: process\.env\.ENABLE_HSTS === '1' \? '1' : '0'/);

    const check = readCode('../src/lib/startup-check.ts');
    expect(check).toMatch(/UNNGL_HSTS === '1'/);
    // ...and the audit must actually have the HSTS checks the docs promise.
    expect(check).toMatch(/HSTS is compiled in but NEXT_PUBLIC_ORIGIN/);
    expect(check).toMatch(/HSTS is off/);
  });
});

describe('runtime configuration is not inlined at build time', () => {
  it('reads NEXT_PUBLIC_ORIGIN so a self-hoster can set their domain at deploy', async () => {
    // Regression, and the worst one for a self-hosted app. Next.js rewrites the
    // literal `process.env.NEXT_PUBLIC_ORIGIN` into a constant at build time —
    // in the server bundle too. So an operator who set their domain in .env and
    // restarted got every email link, OAuth callback and CSRF origin check
    // still pointing at whatever was configured when the image was built, and
    // the boot audit cheerfully confirmed the wrong value.
    //
    // The name has to be spelled as a computed key for that substitution not to
    // apply. Assert the spelling, not just the intent: `process.env.NEXT_PUBLIC_
    // ORIGIN` would look identical here and silently re-break it.
    const cfg = readCode('../src/lib/config.ts');
    expect(cfg).toMatch(/runtimeEnv\('NEXT_PUBLIC_' \+ 'ORIGIN'\)/);
    expect(cfg).not.toMatch(/process\.env\.NEXT_PUBLIC_ORIGIN/);
  });
});

describe('the session cookie is read under the name it is written', () => {
  it('never reads the session from a hardcoded name', () => {
    // The worst bug in this project's history, and it only existed in
    // production. The cookie was written as `__Host-unngl_session` and read as
    // `unngl_session`, so every session was accepted at sign-in and rejected on
    // the very next request: nobody could stay signed in on a real deployment.
    //
    // It hid so well because over plain HTTP — which is how the test suite and
    // every local run work — the Secure cookie is never sent at all, so the read
    // path is never exercised. Only a real TLS run surfaces it.
    const auth = readCode('../src/lib/auth.ts');
    // The only permitted literal use of the constant is inside sessionCookieName.
    const literals = auth.match(/store\.get\(['"][a-zA-Z_]+['"]\)/g) ?? [];
    expect(literals).toEqual([]);
    expect(auth).toMatch(/store\.get\(sessionCookieName\(\)\)/);
  });

  it('uses __Host- in production and a plain name in development', async () => {
    const { sessionCookieName } = await import('../src/lib/auth');
    // NODE_ENV is readonly on the typed ProcessEnv, and it is a string only.
    const env = process.env as Record<string, string | undefined>;
    const prev = env.NODE_ENV;
    try {
      env.NODE_ENV = 'production';
      expect(sessionCookieName()).toBe('__Host-unngl_session');
      env.NODE_ENV = 'development';
      expect(sessionCookieName()).toBe('unngl_session');
    } finally {
      env.NODE_ENV = prev;
    }
  });
});

describe('same-origin refuses a scheme downgrade', () => {
  it('rejects an http Origin on an https-configured instance', () => {
    const http = readCode('../src/lib/http.ts');
    // Host comparison alone let `http://unngl.example` authorise a request to
    // `https://unngl.example` whenever the host matched. Not browser-exploitable
    // on its own — a browser on an https page never sends an http Origin, and
    // the session cookie is Secure — but the docs claimed a check the code did
    // not perform, which is its own problem.
    expect(http).toMatch(/config\.origin\.startsWith\('https:\/\/'\)/);
    expect(http).toMatch(/o\.protocol !== 'https:'/);
  });
});
