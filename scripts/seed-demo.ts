/**
 * Seed a demo account with a demo inbox and a few messages, so a fresh
 * checkout has something to click on.
 *
 *   npx tsx scripts/seed-demo.ts
 *
 * Safe to re-run: it does nothing if the demo user already exists. It prints a
 * login code you can use, because that is how the app works — there are no
 * passwords. The npm script passes --env-file-if-exists so the same .env the
 * app reads is the one this reads.
 *
 * @license AGPL-3.0-or-later
 */

import { upsertUserByEmail, issueLoginCode, findUserByEmail } from '../src/lib/auth';
import { createInbox, getInboxBySlug, postMessage, listInboxesForUser } from '../src/lib/inbox';
import { decodePng } from '../src/lib/palette/png';
import { extractPalette, paletteHash } from '../src/lib/palette/extract';
import { deflateSync } from 'node:zlib';

const EMAIL = process.env.DEMO_EMAIL ?? 'demo@unngl.link';

/** Build a PNG the same way the browser would, so the hint verifies. */
function makePng(width: number, height: number, paint: (x: number, y: number) => [number, number, number]): Uint8Array {
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc32 = (b: Uint8Array) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const raw = Buffer.alloc(height * (1 + width * 4));
  let p = 0;
  for (let y = 0; y < height; y++) {
    raw[p++] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x / width, y / height);
      raw[p++] = r;
      raw[p++] = g;
      raw[p++] = b;
      raw[p++] = 255;
    }
  }
  const chunk = (type: string, body: Buffer) => {
    const out = Buffer.alloc(12 + body.length);
    out.writeUInt32BE(body.length, 0);
    out.write(type, 4, 'ascii');
    body.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

const SCENES: Array<{
  body: string;
  paint: (x: number, y: number) => [number, number, number];
}> = [
  {
    body: 'is the thing at 8pm still on? because i am not going out again after work',
    paint: (x, y) => {
      const sky: [number, number, number] = [
        Math.round(40 + 200 * x),
        Math.round(30 + 120 * (1 - y)),
        Math.round(120 - 60 * y),
      ];
      return Math.hypot(x - 0.4, y - 0.35) < 0.18 ? [255, 214, 92] : sky;
    },
  },
  {
    body: 'ok so i may have told everyone we were talking. my bad. it was a nice conversation',
    paint: (x, y) => (y > 0.5 ? [220, 60, 90] : [30 + 60 * x, 120, 130]),
  },
  {
    body: 'i just wanted you to know the colours thing is genuinely clever. also hi',
    paint: (x, y) => (Math.hypot(x - 0.6, y - 0.5) < 0.2 ? [140, 90, 240] : [20, 200, 190]),
  },
  {
    body: 'no message here, i just wanted the link to exist',
    paint: () => [0, 0, 0],
  },
];

async function main() {
  // A standalone script gets no `instrumentation.ts`, so the schema it needs
  // has to be applied here or the first query fails with "relation does not
  // exist".
  const { initDb } = await import('../src/lib/db');
  await initDb();
  const existing = await findUserByEmail(EMAIL);
  if (existing && (await listInboxesForUser(existing.id)).length > 0) {
    const inbox = (await listInboxesForUser(existing.id))[0]!;
    console.log(`Demo already seeded. Sign in as ${EMAIL} and open /i/${inbox.slug}`);
    return;
  }

  const user = await upsertUserByEmail(EMAIL, 'Demo');
  const inbox = existing ? (await listInboxesForUser(user.id))[0]?.slug : undefined;
  const target = inbox ? (await getInboxBySlug(inbox))! : await createInbox(user.id, 'demo page');

  for (const scene of SCENES) {
    const png = makePng(180, 180, scene.paint);
    const decoded = decodePng(png);
    const palette = extractPalette(decoded.data, decoded.width, decoded.height);
    const post = await postMessage({
      inboxSlug: target.slug,
      body: scene.body,
      ipHash: 'seed',
      userAgent: 'seed',
      imageBytes: png,
      claimedPalette: palette,
      source: 'upload',
    });
    console.log(
      `  + "${scene.body.slice(0, 42)}…"  palette ${palette.colors.join(' ')}  ${paletteHash(palette)}`,
    );
    void post;
  }

  const { code } = await issueLoginCode(EMAIL, 'login');
  console.log('');
  console.log(`  demo user : ${EMAIL}`);
  console.log(`  inbox     : /i/${target.slug}`);
  console.log(`  send page : /${target.slug}`);
  console.log(`  login code: ${code}   (valid 10 minutes)`);
}

// Not `await main()`: tsx compiles this file to CommonJS, where top-level
// await is a syntax error, and the failure only shows up when the script runs.
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
