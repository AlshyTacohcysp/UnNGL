/**
 * Minimal, dependency-free PNG decoder (Node).
 *
 * UnNGL deliberately avoids a native image dependency so the app installs and
 * runs anywhere Node runs. Since the browser transcodes every upload to PNG
 * before sending it, a small decoder is enough to let the server re-derive a
 * hint from the stored original and check it against what the client claimed.
 *
 * Supports colour types 0/2/3/4/6, bit depths 1/2/4/8/16, tRNS, and no
 * interlacing (Adam7 is rejected with a clear error — we never produce it).
 *
 * @license AGPL-3.0-or-later
 */

import { inflateSync } from 'node:zlib';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export interface DecodedImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

interface Ihdr {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlace: number;
}

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  return SIGNATURE.every((b, i) => bytes[i] === b);
}

/** Decode a PNG buffer to RGBA8. Throws with a human-readable reason on failure. */
export function decodePng(bytes: Uint8Array): DecodedImage {
  if (!isPng(bytes)) throw new Error('not a PNG file');

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8;
  let ihdr: Ihdr | null = null;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];

  while (pos + 8 <= bytes.length) {
    const len = view.getUint32(pos);
    const type = String.fromCharCode(
      bytes[pos + 4]!,
      bytes[pos + 5]!,
      bytes[pos + 6]!,
      bytes[pos + 7]!,
    );
    const body = bytes.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len; // length + type + data + CRC

    if (type === 'IHDR') {
      // IHDR payload layout (PNG spec §11.2.2): width and height are
      // big-endian uint32s, then bit depth, colour type, compression method,
      // filter method and interlace method as single bytes.
      ihdr = {
        width: view.getUint32(pos - len - 4),
        height: view.getUint32(pos - len),
        bitDepth: body[8]!,
        colorType: body[9]!,
        interlace: body[12]!,
      };
    } else if (type === 'PLTE') {
      palette = body.slice();
    } else if (type === 'tRNS') {
      trns = body.slice();
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (!ihdr) throw new Error('PNG is missing its IHDR chunk');
  if (ihdr.interlace !== 0) throw new Error('interlaced PNGs are not supported');
  if (!CHANNELS[ihdr.colorType]) throw new Error(`unsupported PNG colour type ${ihdr.colorType}`);
  if (idat.length === 0) throw new Error('PNG has no image data');
  if (ihdr.colorType === 3 && !palette) throw new Error('indexed PNG is missing its palette');

  const { width, height, bitDepth, colorType } = ihdr;
  const channels = CHANNELS[colorType]!;
  const bitsPerPixel = channels * bitDepth;
  const bytesPerPixel = Math.max(1, Math.ceil(bitsPerPixel / 8));
  const bytesPerRow = Math.ceil((width * bitsPerPixel) / 8);

  const raw = inflateSync(concat(idat));
  const scanlines = unfilter(raw, width, height, bytesPerRow, bytesPerPixel);
  return toRgba8(scanlines, width, height, bitDepth, colorType, palette, trns, bytesPerRow);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** Reverse the per-scanline filters (PNG spec §9). */
function unfilter(
  raw: Uint8Array,
  width: number,
  height: number,
  bytesPerRow: number,
  bpp: number,
): Uint8Array {
  const out = new Uint8Array(bytesPerRow * height);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++]!;
    const rowStart = y * bytesPerRow;
    const prevStart = rowStart - bytesPerRow;
    for (let x = 0; x < bytesPerRow; x++) {
      const rawByte = raw[pos + x] ?? 0;
      const a = x >= bpp ? out[rowStart + x - bpp]! : 0;
      const b = y > 0 ? out[prevStart + x]! : 0;
      const c = y > 0 && x >= bpp ? out[prevStart + x - bpp]! : 0;
      let value: number;
      switch (filter) {
        case 0:
          value = rawByte;
          break;
        case 1:
          value = rawByte + a;
          break;
        case 2:
          value = rawByte + b;
          break;
        case 3:
          value = rawByte + ((a + b) >> 1);
          break;
        case 4:
          value = rawByte + paeth(a, b, c);
          break;
        default:
          throw new Error(`unknown PNG filter type ${filter}`);
      }
      out[rowStart + x] = value & 0xff;
    }
    pos += bytesPerRow;
  }
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function toRgba8(
  px: Uint8Array,
  width: number,
  height: number,
  bitDepth: number,
  colorType: number,
  palette: Uint8Array | null,
  trns: Uint8Array | null,
  bytesPerRow: number,
): DecodedImage {
  const out = new Uint8ClampedArray(width * height * 4);

  /** Read the `i`-th sample of a row, honouring sub-byte bit depths. */
  const sample = (row: Uint8Array, i: number, max: number): number => {
    if (bitDepth === 8) return row[i]!;
    if (bitDepth === 16) return row[i * 2]!; // take the high byte
    const perByte = 8 / bitDepth;
    const byte = row[Math.floor(i / perByte)]!;
    const shift = 8 - bitDepth * ((i % perByte) + 1);
    const mask = (1 << bitDepth) - 1;
    const raw = (byte >> shift) & mask;
    return bitDepth === 1 ? raw * 255 : Math.round((raw / mask) * 255);
  };
  const scale16 = (v: number) => v; // 16-bit handled by taking the high byte

  for (let y = 0; y < height; y++) {
    const row = px.subarray(y * bytesPerRow, (y + 1) * bytesPerRow);
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      switch (colorType) {
        case 0: {
          // greyscale
          const g = sample(row, x, 1);
          out[o] = out[o + 1] = out[o + 2] = g;
          out[o + 3] = trns && trns.length >= 2 && sample16At(trns, 0) === g * 257 ? 0 : 255;
          break;
        }
        case 2: {
          // truecolour
          const r = sample(row, x * 3 + 0, 3);
          const g = sample(row, x * 3 + 1, 3);
          const b = sample(row, x * 3 + 2, 3);
          out[o] = r;
          out[o + 1] = g;
          out[o + 2] = b;
          out[o + 3] =
            trns &&
            trns.length >= 6 &&
            sample16At(trns, 0) === r * 257 &&
            sample16At(trns, 2) === g * 257 &&
            sample16At(trns, 4) === b * 257
              ? 0
              : 255;
          break;
        }
        case 3: {
          // indexed
          const idx = sample(row, x, 1);
          const p = idx * 3;
          out[o] = palette?.[p] ?? 0;
          out[o + 1] = palette?.[p + 1] ?? 0;
          out[o + 2] = palette?.[p + 2] ?? 0;
          out[o + 3] = trns && idx < trns.length ? trns[idx]! : 255;
          break;
        }
        case 4: {
          // greyscale + alpha
          const g = sample(row, x * 2 + 0, 2);
          out[o] = out[o + 1] = out[o + 2] = g;
          out[o + 3] = sample(row, x * 2 + 1, 2);
          break;
        }
        case 6: {
          // truecolour + alpha
          out[o] = sample(row, x * 4 + 0, 4);
          out[o + 1] = sample(row, x * 4 + 1, 4);
          out[o + 2] = sample(row, x * 4 + 2, 4);
          out[o + 3] = sample(row, x * 4 + 3, 4);
          break;
        }
        default:
          throw new Error(`unsupported PNG colour type ${colorType}`);
      }
    }
  }
  void scale16;
  return { data: out, width, height };
}

function sample16At(t: Uint8Array, i: number): number {
  return ((t[i] ?? 0) << 8) | (t[i + 1] ?? 0);
}
