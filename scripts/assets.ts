/**
 * Generates the brand assets: the favicon and the Open Graph card.
 *
 * Both are drawn with the same six-colour collage the site uses everywhere,
 * so the identity and the product are visibly the same thing. PNGs are
 * encoded here rather than shipped as binaries in the repo — run
 * `npx tsx scripts/assets.ts` to regenerate after a palette change.
 *
 * @license AGPL-3.0-or-later
 */

import { deflateSync } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

type Rgba = [number, number, number, number];

/* --------------------------- tiny PNG encoder --------------------------- */

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of bytes) crc = crcTable[(crc ^ b) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Buffer): Buffer {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'ascii');
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}

function encodePng(width: number, height: number, px: Uint8ClampedArray): Buffer {
  const raw = Buffer.alloc(height * (1 + width * 4));
  let p = 0;
  for (let y = 0; y < height; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < width * 4; x++) raw[p++] = px[y * width * 4 + x]!;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------ drawing -------------------------------- */

const INK: Rgba = [22, 19, 15, 255];
const PAPER: Rgba = [246, 241, 230, 255];

/** The house palette, straight out of the tokens in globals.css. */
const SIX = ['#ff4a1c', '#c9f03a', '#2f5bff', '#8b5cf6', '#ffc400', '#0fc4a4'] as const;

class Canvas {
  readonly data: Uint8ClampedArray;
  constructor(readonly width: number, readonly height: number) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  set(x: number, y: number, c: Rgba): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const o = (y * this.width + x) * 4;
    const a = c[3] / 255;
    if (a >= 1) {
      this.data[o] = c[0];
      this.data[o + 1] = c[1];
      this.data[o + 2] = c[2];
      this.data[o + 3] = 255;
      return;
    }
    for (let i = 0; i < 3; i++) {
      this.data[o + i] = c[i]! * a + this.data[o + i]! * (1 - a);
    }
    this.data[o + 3] = Math.max(this.data[o + 3]!, c[3]!);
  }

  rect(x: number, y: number, w: number, h: number, c: Rgba): void {
    for (let yy = Math.floor(y); yy < y + h; yy++) {
      for (let xx = Math.floor(x); xx < x + w; xx++) this.set(xx, yy, c);
    }
  }

  /** Hard-edged filled parallelogram, used for the torn scraps. */
  scrap(x: number, y: number, w: number, h: number, tiltDeg: number, c: Rgba): void {
    const t = Math.tan((tiltDeg * Math.PI) / 180);
    for (let yy = Math.floor(y); yy < y + h; yy++) {
      const dy = yy - y;
      const shift = dy * t;
      for (let xx = Math.floor(x + shift); xx < x + shift + w; xx++) this.set(xx, yy, c);
    }
  }

  /** Ink outline around a rectangle. */
  outline(x: number, y: number, w: number, h: number, t: number): void {
    this.rect(x, y, w, t, INK);
    this.rect(x, y + h - t, w, t, INK);
    this.rect(x, y, t, h, INK);
    this.rect(x + w - t, y, t, h, INK);
  }
}

const hex = (h: string): Rgba => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
  255,
];

/** The mark: six scraps in a 3×2 grid, outlined in ink, tilted. */
function drawMark(c: Canvas, ox: number, oy: number, cell: number, gap: number): void {
  const tilts = [-3, 2, -1.5, 2.5, -2, 1];
  for (let i = 0; i < 6; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = ox + col * (cell + gap);
    const y = oy + row * (cell + gap);
    const size = cell + (i === 0 ? 6 : 0);
    c.scrap(x, y, size, size, tilts[i]!, hex(SIX[i]!));
    c.outline(x, y, size, size, Math.max(2, Math.round(cell * 0.09)));
  }
}

/* --------------------------------- assets ------------------------------ */

function favicon(): Buffer {
  const s = 64;
  const c = new Canvas(s, s);
  c.rect(0, 0, s, s, PAPER);
  drawMark(c, 8, 8, 14, 5);
  c.outline(3, 3, s - 6, s - 6, 5);
  return encodePng(s, s, c.data);
}

function opengraph(): Buffer {
  const w = 1200;
  const h = 630;
  const c = new Canvas(w, h);
  c.rect(0, 0, w, h, PAPER);

  // the collage, oversized on the right
  drawMark(c, 640, 90, 150, 28);

  // wordmark, drawn as blocks: 5x7 pixel letters, scaled up
  const word = 'UNNGL';
  const scale = 14;
  const glyphs: Record<string, string[]> = {
    U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
    N: ['10001', '11001', '11001', '10101', '10011', '10011', '10001'],
    G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
    L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  };
  let x = 80;
  for (const ch of word) {
    const g = glyphs[ch]!;
    for (let row = 0; row < g.length; row++) {
      for (let col = 0; col < g[row]!.length; col++) {
        if (g[row]![col] === '1') {
          c.rect(x + col * scale, 170 + row * scale, scale, scale, INK);
        }
      }
    }
    x += 6 * scale;
  }

  // accent bar + tagline blocks
  c.rect(80, 320, 480, 18, hex(SIX[0]!));
  c.rect(80, 356, 380, 18, hex(SIX[2]!));
  c.rect(80, 392, 300, 18, hex(SIX[1]!));

  c.rect(80, 470, 260, 10, INK);
  c.rect(80, 492, 190, 10, INK);

  c.outline(0, 0, w, h, 0);
  return encodePng(w, h, c.data);
}

/* --------------------------------- write ------------------------------- */

const out = path.join(process.cwd(), 'src', 'app');
fs.writeFileSync(path.join(out, 'icon.png'), favicon());
fs.writeFileSync(path.join(out, 'opengraph-image.png'), opengraph());
console.log('wrote src/app/icon.png and src/app/opengraph-image.png');
