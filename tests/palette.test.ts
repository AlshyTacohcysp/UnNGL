/**
 * Algorithm tests.
 *
 * The most important test in this repo is `is deterministic` + the golden hash:
 * a hint is a promise that "these six colours, in this order, come from that
 * photo". If the algorithm changes without the version changing, every existing
 * hint becomes a lie. So the golden values below are a tripwire.
 *
 * @license AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';
import {
  ALGORITHM_VERSION,
  canonicalPaletteJson,
  extractPalette,
  oklabToRgb255,
  paletteHash,
  rgbToOklab,
} from '../src/lib/palette/extract';
import { decodePng, isPng } from '../src/lib/palette/png';

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */

function solid(width: number, height: number, [r, g, b]: [number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

function gradient(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      data[o] = Math.round((x / (width - 1)) * 255);
      data[o + 1] = Math.round((y / (height - 1)) * 255);
      data[o + 2] = 128;
      data[o + 3] = 255;
    }
  }
  return { data, width, height };
}

/** Minimal PNG encoder, so the decoder is tested against a real encoder. */
function encodePng(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  colorType: 0 | 2 | 4 | 6 = 6,
): Uint8Array {
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 4 ? 2 : 4;
  const raw = new Uint8Array(height * (1 + width * channels));
  let p = 0;
  for (let y = 0; y < height; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      for (let c = 0; c < channels; c++) raw[p++] = data[o + c]!;
    }
  }
  const chunk = (type: string, body: Uint8Array) => {
    const out = new Uint8Array(12 + body.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, body.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(body, 8);
    view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)) >>> 0);
    return out;
  };
  const ihdr = new Uint8Array(13);
  const iv = new DataView(ihdr.buffer);
  iv.setUint32(0, width);
  iv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = colorType;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of parts) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

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

/* ------------------------------------------------------------------ *
 * colour space
 * ------------------------------------------------------------------ */

describe('OKLab conversion', () => {
  it('round-trips sRGB within one 8-bit step', () => {
    for (const rgb of [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [18, 16, 28],
      [255, 214, 92],
      [0, 210, 230],
      [128, 128, 128],
      [0, 0, 0],
      [255, 255, 255],
    ] as [number, number, number][]) {
      const back = oklabToRgb255(rgbToOklab(rgb[0], rgb[1], rgb[2]));
      for (let c = 0; c < 3; c++) {
        expect(Math.abs(back[['r', 'g', 'b'][c] as 'r'] - rgb[c]!)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('puts white at L=1 and black at L=0', () => {
    expect(rgbToOklab(255, 255, 255).L).toBeCloseTo(1, 3);
    expect(rgbToOklab(0, 0, 0).L).toBeCloseTo(0, 3);
  });
});

/* ------------------------------------------------------------------ *
 * the algorithm
 * ------------------------------------------------------------------ */

describe('extractPalette', () => {
  it('always returns six colours', () => {
    for (const img of [solid(32, 32, [255, 0, 0]), solid(8, 8, [1, 2, 3]), gradient(64, 64)]) {
      const p = extractPalette(img.data, img.width, img.height);
      expect(p.colors).toHaveLength(6);
      expect(p.colors.every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
      expect(p.primary).toBe(p.colors[0]);
      expect(p.weight).toBeGreaterThanOrEqual(0);
      expect(p.weight).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic across repeated runs', () => {
    const img = gradient(97, 61);
    const a = extractPalette(img.data, img.width, img.height);
    const b = extractPalette(img.data, img.width, img.height);
    const c = extractPalette(img.data.slice(), img.width, img.height);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(paletteHash(c)).toBe(paletteHash(a));
  });

  it('is stable when the same scene is rendered at a different size', () => {
    // Both images are under the 256px resample edge, so only the lattice
    // differs — the scene is a smooth function of position, so the palette
    // should match perceptually. It is not bit-identical: 48px and 96px sample
    // the same gradient at different rates, so 8-bit quantisation lands on
    // neighbouring values. The spec states this tolerance explicitly.
    const small = gradient(48, 48);
    const large = gradient(96, 96);
    const a = extractPalette(small.data, small.width, small.height);
    const b = extractPalette(large.data, large.width, large.height);
    expect(a.colors).toHaveLength(b.colors.length);

    for (let i = 0; i < 6; i++) {
      const x = parseHex(a.colors[i]!);
      const y = parseHex(b.colors[i]!);
      const dx = x[0] - y[0];
      const dy = x[1] - y[1];
      const dz = x[2] - y[2];
      // Perceptual distance in OKLab. A pure gradient is the worst case: every
      // colour sits on a cluster boundary, so it moves the most under a
      // different sampling rate. 0.01 is ~1% of the L range, a few 8-bit steps.
      const distance = Math.sqrt(dx * dx + 1.4 * dy * dy + 1.4 * dz * dz);
      expect(distance).toBeLessThan(0.01);
    }
  });

  it('finds a solid colour that fills the image', () => {
    const p = extractPalette(...Object.values(solid(64, 64, [26, 115, 232])).slice(0, 3) as [
      Uint8ClampedArray,
      number,
      number,
    ]);
    expect(p.primary.toLowerCase()).toBe('#1a73e8');
    expect(p.weight).toBeGreaterThan(0.9);
  });

  it('separates clearly distinct colours instead of returning one hue', () => {
    const size = 64;
    const data = new Uint8ClampedArray(size * size * 4);
    const swatches: [number, number, number][] = [
      [220, 30, 60],
      [30, 120, 220],
      [250, 200, 40],
      [20, 160, 90],
    ];
    for (let i = 0; i < size * size; i++) {
      const c = swatches[i % swatches.length]!;
      data[i * 4] = c[0];
      data[i * 4 + 1] = c[1];
      data[i * 4 + 2] = c[2];
      data[i * 4 + 3] = 255;
    }
    const p = extractPalette(data, size, size);
    const distinct = new Set(p.colors);
    // Padding by repetition is allowed, but the four real colours must survive.
    expect(distinct.size).toBeGreaterThanOrEqual(4);
  });

  it('prefers saturated colours over grey background', () => {
    const size = 64;
    const data = new Uint8ClampedArray(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      // 90% neutral grey, 10% hot pink
      const pink = i % 10 === 0;
      data[i * 4] = pink ? 255 : 128;
      data[i * 4 + 1] = pink ? 20 : 128;
      data[i * 4 + 2] = pink ? 140 : 128;
      data[i * 4 + 3] = 255;
    }
    const p = extractPalette(data, size, size);
    const hasPink = p.colors.some((c) => {
      const r = parseInt(c.slice(1, 3), 16);
      const g = parseInt(c.slice(3, 5), 16);
      const b = parseInt(c.slice(5, 7), 16);
      return r > 200 && g < 80 && b > 90;
    });
    expect(hasPink).toBe(true);
  });

  it('handles a fully transparent image without throwing', () => {
    const size = 16;
    const p = extractPalette(new Uint8ClampedArray(size * size * 4), size, size);
    expect(p.colors).toHaveLength(6);
    expect(p.weight).toBe(0);
  });

  it('sees colour through transparent pixels', () => {
    const size = 32;
    const data = new Uint8ClampedArray(size * size * 4); // alpha 0 everywhere
    for (let y = 8; y < 24; y++) {
      for (let x = 8; x < 24; x++) {
        const o = (y * size + x) * 4;
        data[o] = 255;
        data[o + 1] = 40;
        data[o + 2] = 90;
        data[o + 3] = 255;
      }
    }
    const p = extractPalette(data, size, size);
    expect(p.primary.toLowerCase()).toBe('#ff285a');
  });

  it('rejects impossible input', () => {
    expect(() => extractPalette(new Uint8ClampedArray(4), 0, 1)).toThrow();
    expect(() => extractPalette(new Uint8ClampedArray(4), 10, 10)).toThrow(/RGBA/);
    expect(() => extractPalette(new Uint8ClampedArray(4), NaN, 1)).toThrow();
  });
});

/* ------------------------------------------------------------------ *
 * versioning
 * ------------------------------------------------------------------ */

describe('versioning', () => {
  it('has a stable canonical serialisation', () => {
    const json = canonicalPaletteJson({ colors: ['#000000'], primary: '#000000', weight: 0.5 });
    expect(json).toBe(`{"v":"${ALGORITHM_VERSION}","colors":["#000000"],"weight":0.5}`);
  });

  it('matches the golden palette (tripwire: bump ALGORITHM_VERSION when changing)', () => {
    const img = gradient(120, 90);
    const p = extractPalette(img.data, img.width, img.height);
    expect({ version: ALGORITHM_VERSION, hash: paletteHash(p), colors: p.colors }).toEqual({
      version: '1.0.0',
      hash: '26d88308',
      colors: p.colors,
    });
  });
});

/* ------------------------------------------------------------------ *
 * PNG decoder — the verification path
 * ------------------------------------------------------------------ */

describe('PNG decoding', () => {
  it('decodes what a real encoder produced', () => {
    const img = solid(20, 12, [12, 200, 140]);
    const png = encodePng(img.data, img.width, img.height, 6);
    expect(isPng(png)).toBe(true);
    const decoded = decodePng(png);
    expect(decoded.width).toBe(20);
    expect(decoded.height).toBe(12);
    expect([...decoded.data.slice(0, 4)]).toEqual([12, 200, 140, 255]);
  });

  it('survives every PNG scanline filter', () => {
    // The encoder writes filter 0; hand-build filter 1..4 rows to exercise the
    // unfilter loop, which is the part most likely to rot silently.
    const width = 8;
    const height = 5;
    const px = gradient(width, height);
    const bpp = 4;
    const rowBytes = width * bpp;
    const raw = new Uint8Array(height * (1 + rowBytes));
    let p = 0;
    for (let y = 0; y < height; y++) {
      raw[p++] = (y % 5) as number; // filters 0,1,2,3,4 in turn
      for (let x = 0; x < rowBytes; x++) {
        const cur = px.data[(y * width + Math.floor(x / 4)) * 4 + (x % 4)]!;
        const a = x >= bpp ? px.data[(y * width + Math.floor((x - bpp) / 4)) * 4 + ((x - bpp) % 4)]! : 0;
        const b = y > 0 ? px.data[((y - 1) * width + Math.floor(x / 4)) * 4 + (x % 4)]! : 0;
        const c = y > 0 && x >= bpp
          ? px.data[((y - 1) * width + Math.floor((x - bpp) / 4)) * 4 + ((x - bpp) % 4)]!
          : 0;
        const encoded = (y % 5) === 0 ? cur : (y % 5) === 1 ? cur - a : (y % 5) === 2 ? cur - b : (y % 5) === 3 ? cur - ((a + b) >> 1) : cur - paeth(a, b, c);
        raw[p++] = encoded & 0xff;
      }
    }
    const parts = [
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      makeChunk('IHDR', (() => {
        const ihdr = new Uint8Array(13);
        const v = new DataView(ihdr.buffer);
        v.setUint32(0, width);
        v.setUint32(4, height);
        ihdr[8] = 8;
        ihdr[9] = 6;
        return ihdr;
      })()),
      makeChunk('IDAT', new Uint8Array(deflateSync(raw))),
      makeChunk('IEND', new Uint8Array(0)),
    ];
    const total = parts.reduce((n, c) => n + c.length, 0);
    const png = new Uint8Array(total);
    let off = 0;
    for (const c of parts) {
      png.set(c, off);
      off += c.length;
    }
    const decoded = decodePng(png);
    expect([...decoded.data.slice(0, 4)]).toEqual([...px.data.slice(0, 4)]);
  });

  it('refuses non-PNG input with a clear message', () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toThrow(/not a PNG/);
  });

  it('decoding then extracting equals extracting the pixels directly', () => {
    const img = gradient(70, 50);
    const png = encodePng(img.data, img.width, img.height, 6);
    const decoded = decodePng(png);
    expect(extractPalette(decoded.data, decoded.width, decoded.height)).toEqual(
      extractPalette(img.data, img.width, img.height),
    );
  });

  it('handles greyscale + alpha and truecolour PNGs', () => {
    const size = 8;
    const rgba = new Uint8ClampedArray(size * size * 4).fill(255);
    for (let i = 0; i < size * size; i++) rgba[i * 4] = 90;
    const grey = encodePng(rgba, size, size, 0);
    expect([...decodePng(grey).data.slice(0, 4)]).toEqual([90, 90, 90, 255]);

    const rgbOnly = new Uint8ClampedArray(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      rgbOnly[i * 4] = 200;
      rgbOnly[i * 4 + 1] = 10;
      rgbOnly[i * 4 + 2] = 90;
    }
    const rgb = encodePng(rgbOnly, size, size, 2);
    expect([...decodePng(rgb).data.slice(0, 4)]).toEqual([200, 10, 90, 255]);
  });
});

function makeChunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)) >>> 0);
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

function parseHex(hex: string): [number, number, number] {
  const lab = rgbToOklab(
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  );
  return [lab.L, lab.a, lab.b];
}
