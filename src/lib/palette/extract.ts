/**
 * UnNGL Palette Algorithm — reference implementation.
 *
 * This file is the single source of truth for the algorithm described at
 * /algorithm. It is pure, dependency-free, and runs identically in the browser
 * (to extract a hint) and on the server (to independently re-derive and verify
 * that a hint matches the image it claims to come from).
 *
 * Everything that could make two runs disagree is pinned here:
 *   - fixed number of resampling steps and a fixed stride (no "pick every Nth
 *     pixel of however many the browser gave us"),
 *   - f64 accumulation, rounded once at the end,
 *   - a fixed iteration budget instead of an epsilon-based early exit,
 *   - deterministic seeding (farthest-point) and a deterministic tie-break rule.
 *
 * @license AGPL-3.0-or-later
 */

/* ------------------------------------------------------------------ *
 * 1. Constants — the tunables, all public and all versioned.
 * ------------------------------------------------------------------ */

/** Number of colours in a hint. This is the *entire* palette, not a preview. */
export const PALETTE_SIZE = 6;

/**
 * Decode / resample grid. The source image is first box-filtered down to at most
 * LONG_EDGE pixels, then sampled on an exact SAMPLE_GRID x SAMPLE_GRID lattice
 * with a fixed step count per cell. The result is always SAMPLE_GRID^2 samples
 * regardless of the input dimensions, so run time is constant.
 */
export const SAMPLE_GRID = 64;
export const LONG_EDGE = 256;

/** Samples below this alpha are ignored entirely (cut-out logos still work). */
export const MIN_ALPHA = 0.5;

/**
 * Per-sample weight = alpha * (CHROMA_FLOOR + (1 - CHROMA_FLOOR) * min(1, C / CHROMA_REF)).
 * Grey and near-grey pixels (low chroma) are real, but a photo is mostly
 * background: without the chroma bias the six slots fill up with greys and the
 * hint stops being a recognisable "look at this person" signal.
 */
export const CHROMA_FLOOR = 0.35;
export const CHROMA_REF = 0.16;

/** Weighted k-means budget. Fixed so every run does the same amount of work. */
export const KMEANS_ITERATIONS = 24;

/** Two clusters closer than this in OKLab (≈0.006 of the unit gamut diagonal). */
export const MERGE_DISTANCE = 0.01;

/** Changes smaller than this in total weight stop the run early. */
const CONVERGENCE = 1e-5;

/** Undersaturated outliers ("the red car in a grey photo") are dropped. */
export const CHROMA_OUTLIER = 0.012;

/** At most this fraction of the total weight may be discarded as outliers. */
export const MAX_OUTLIER_WEIGHT = 0.4;

/* ------------------------------------------------------------------ *
 * 2. sRGB <-> linear <-> OKLab
 * ------------------------------------------------------------------ */

/** sRGB transfer function, IEC 61966-2-1. */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Inverse sRGB transfer function. */
export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export interface Rgb {
  /** 0..255, integers. */
  r: number;
  g: number;
  b: number;
}
export interface Oklab {
  /** Lightness 0..1. */
  L: number;
  /** Green/red axis, roughly -0.4..0.4. */
  a: number;
  /** Blue/yellow axis, roughly -0.4..0.4. */
  b: number;
}

/** OKLab matrix (Björn Ottosson's 2020 constants). */
const M1 = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
] as const;
const M2 = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766],
] as const;
/** LMS (after the cube) -> linear sRGB, i.e. the inverse of M2 ∘ M1. */
const M2_INV = [
  [4.0767416621, -3.3077115913, 0.2309699292],
  [-1.2684380046, 2.6097574011, -0.3413193965],
  [-0.0041960863, -0.7034186147, 1.707614701],
] as const;

function mul3(m: readonly (readonly number[])[], v: readonly number[]): [number, number, number] {
  return [
    m[0]![0]! * v[0]! + m[0]![1]! * v[1]! + m[0]![2]! * v[2]!,
    m[1]![0]! * v[0]! + m[1]![1]! * v[1]! + m[1]![2]! * v[2]!,
    m[2]![0]! * v[0]! + m[2]![1]! * v[1]! + m[2]![2]! * v[2]!,
  ];
}

/** linear sRGB -> OKLab. */
export function rgbToOklab(r: number, g: number, b: number): Oklab {
  const [lr, lg, lb] = [srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255)];
  const l = Math.cbrt(mul3(M1, [lr, lg, lb])[0]);
  const m = Math.cbrt(mul3(M1, [lr, lg, lb])[1]);
  const s = Math.cbrt(mul3(M1, [lr, lg, lb])[2]);
  const [L, A, B] = mul3(M2, [l, m, s]);
  return { L, a: A, b: B };
}

/** OKLab -> linear sRGB. */
export function oklabToRgb(lab: Oklab): { lr: number; lg: number; lb: number } {
  const l_ = lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const m_ = lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const s_ = lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  const [lr, lg, lb] = mul3(M2_INV, [l, m, s]);
  return { lr, lg, lb };
}

/** OKLab -> sRGB 0..255, gamut-clipped per channel. */
export function oklabToRgb255(lab: Oklab): Rgb {
  const { lr, lg, lb } = oklabToRgb(lab);
  const enc = (v: number) => Math.round(Math.min(1, Math.max(0, linearToSrgb(v))) * 255);
  return { r: enc(lr), g: enc(lg), b: enc(lb) };
}

/** Perceptual chroma magnitude in OKLab. */
export function chroma(lab: Oklab): number {
  return Math.hypot(lab.a, lab.b);
}

/* ------------------------------------------------------------------ *
 * 3. Deterministic resampling
 * ------------------------------------------------------------------ */

function byteAt(src: Uint8ClampedArray | Uint8Array, i: number): number {
  return src[i]!;
}

/**
 * Box-filter `src` down to at most LONG_EDGE x LONG_EDGE, exactly.
 * Averages in premultiplied alpha so transparent edges don't bleed black in.
 */
function boxFilter(
  src: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  if (w <= LONG_EDGE && h <= LONG_EDGE) {
    return { data: src instanceof Uint8ClampedArray ? src : new Uint8ClampedArray(src), width: w, height: h };
  }
  const scale = Math.max(w / LONG_EDGE, h / LONG_EDGE);
  const dw = Math.max(1, Math.round(w / scale));
  const dh = Math.max(1, Math.round(h / scale));
  const out = new Uint8ClampedArray(dw * dh * 4);
  const xr = w / dw;
  const yr = h / dh;
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor(y * yr);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * yr));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor(x * xr);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * xr));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = y0; sy < y1 && sy < h; sy++) {
        let i = (sy * w + x0) * 4;
        for (let sx = x0; sx < x1; sx++, i += 4) {
          const pa = byteAt(src, i + 3) / 255;
          r += byteAt(src, i) * pa;
          g += byteAt(src, i + 1) * pa;
          b += byteAt(src, i + 2) * pa;
          a += byteAt(src, i + 3);
          n++;
        }
      }
      const o = (y * dw + x) * 4;
      const alpha = a / n;
      const wsum = a === 0 ? 0 : n * 255;
      out[o] = wsum === 0 ? 0 : Math.round(r / wsum);
      out[o + 1] = wsum === 0 ? 0 : Math.round(g / wsum);
      out[o + 2] = wsum === 0 ? 0 : Math.round(b / wsum);
      out[o + 3] = Math.round(alpha);
    }
  }
  return { data: out, width: dw, height: dh };
}

/**
 * Produce exactly SAMPLE_GRID^2 weighted samples in OKLab.
 * Each cell of the lattice contributes a fixed number of box-filtered taps, so
 * the sample count never depends on the input size (constant time, ~30k reads).
 */
function resample(
  data: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
): { L: Float64Array; A: Float64Array; B: Float64Array; W: Float64Array; n: number } {
  const filtered = boxFilter(data, w, h);
  const fw = filtered.width;
  const fh = filtered.height;
  const n = SAMPLE_GRID * SAMPLE_GRID;
  const L = new Float64Array(n);
  const A = new Float64Array(n);
  const B = new Float64Array(n);
  const W = new Float64Array(n);
  const xr = fw / SAMPLE_GRID;
  const yr = fh / SAMPLE_GRID;
  let k = 0;
  for (let gy = 0; gy < SAMPLE_GRID; gy++) {
    const y0 = Math.floor(gy * yr);
    const y1 = Math.max(y0 + 1, Math.floor((gy + 1) * yr));
    for (let gx = 0; gx < SAMPLE_GRID; gx++) {
      const x0 = Math.floor(gx * xr);
      const x1 = Math.max(x0 + 1, Math.floor((gx + 1) * xr));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let taps = 0;
      for (let sy = y0; sy < y1 && sy < fh; sy++) {
        let i = (sy * fw + x0) * 4;
        for (let sx = x0; sx < x1 && sx < fw; sx++, i += 4) {
          const pa = byteAt(filtered.data, i + 3) / 255;
          r += byteAt(filtered.data, i) * pa;
          g += byteAt(filtered.data, i + 1) * pa;
          b += byteAt(filtered.data, i + 2) * pa;
          a += pa;
          taps++;
        }
      }
      if (taps === 0) continue;
      // Un-premultiply. A fully transparent cell has no colour to speak of, so
      // it is skipped entirely rather than being turned into black.
      if (a <= 0) continue;
      const alpha = a / taps;
      if (alpha < MIN_ALPHA) continue;
      const labReal = rgbToOklab(r / a, g / a, b / a);
      const c = chroma(labReal);
      const w8 = alpha * (CHROMA_FLOOR + (1 - CHROMA_FLOOR) * Math.min(1, c / CHROMA_REF));
      L[k] = labReal.L;
      A[k] = labReal.a;
      B[k] = labReal.b;
      W[k] = w8;
      k++;
    }
  }
  return { L, A, B, W, n: k };
}

/* ------------------------------------------------------------------ *
 * 4. Deterministic weighted k-means (farthest-point seeding)
 * ------------------------------------------------------------------ */

function dist2(l1: number, a1: number, b1: number, l2: number, a2: number, b2: number): number {
  // Chroma is weighted up: two colours with the same lightness but different
  // hue are much more distinguishable than two shades of the same grey.
  const dl = l1 - l2;
  const da = (a1 - a2) * 1.4;
  const db = (b1 - b2) * 1.4;
  return dl * dl + da * da + db * db;
}

interface Cluster {
  L: number;
  a: number;
  b: number;
  w: number;
  /** Perceptual distance from the largest cluster seen so far (seeding only). */
  d2: number;
}

function kmeans(
  L: Float64Array,
  A: Float64Array,
  B: Float64Array,
  W: Float64Array,
  n: number,
  k: number,
): Cluster[] {
  const m = Math.min(k, n);
  if (m === 0) return [];

  // --- seeding: first centre = highest weight (ties -> lowest L, then a, then b)
  let first = 0;
  for (let i = 1; i < n; i++) {
    const wi = W[i]!;
    const wf = W[first]!;
    if (
      wi > wf + 1e-15 ||
      (Math.abs(wi - wf) <= 1e-15 &&
        (L[i]! < L[first]! - 1e-15 ||
          (Math.abs(L[i]! - L[first]!) <= 1e-15 && A[i]! < A[first]!)))
    ) {
      first = i;
    }
  }
  const centres: Cluster[] = [
    { L: L[first]!, a: A[first]!, b: B[first]!, w: W[first]!, d2: 0 },
  ];
  for (let c = 1; c < m; c++) {
    // farthest-point: the sample furthest from every centre chosen so far
    let best = -1;
    let bestD = -1;
    for (let i = 0; i < n; i++) {
      let d = Infinity;
      for (let j = 0; j < centres.length; j++) {
        const cj = centres[j]!;
        const dj = dist2(L[i]!, A[i]!, B[i]!, cj.L, cj.a, cj.b);
        if (dj < d) d = dj;
      }
      if (d > bestD + 1e-18 || (Math.abs(d - bestD) <= 1e-18 && best >= 0 && i < best)) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) break;
    centres.push({ L: L[best]!, a: A[best]!, b: B[best]!, w: W[best]!, d2: bestD });
  }

  // --- Lloyd iterations
  const assign = new Int32Array(n).fill(-1);
  for (let iter = 0; iter < KMEANS_ITERATIONS; iter++) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      let bestJ = 0;
      let bestD = Infinity;
      for (let j = 0; j < centres.length; j++) {
        const cj = centres[j]!;
        const d = dist2(L[i]!, A[i]!, B[i]!, cj.L, cj.a, cj.b);
        if (d < bestD - 1e-18 || (Math.abs(d - bestD) <= 1e-18 && j < bestJ)) {
          bestD = d;
          bestJ = j;
        }
      }
      if (assign[i] !== bestJ) {
        assign[i] = bestJ;
        moved++;
      }
    }
    // recompute centres
    const nl = centres.map(() => 0);
    const na = centres.map(() => 0);
    const nb = centres.map(() => 0);
    const nw = centres.map(() => 0);
    for (let i = 0; i < n; i++) {
      const j = assign[i]!;
      if (j < 0) continue;
      const w = W[i]!;
      nl[j]! += L[i]! * w;
      na[j]! += A[i]! * w;
      nb[j]! += B[i]! * w;
      nw[j]! += w;
    }
    for (let j = 0; j < centres.length; j++) {
      const w = nw[j]!;
      const c = centres[j]!;
      if (w > 0) {
        c.L = nl[j]! / w;
        c.a = na[j]! / w;
        c.b = nb[j]! / w;
      }
      c.w = w;
    }
    if (moved === 0) break;
  }
  return centres.filter((c) => c.w > 0);
}

/* ------------------------------------------------------------------ *
 * 5. Merge, outlier drop, ordering
 * ------------------------------------------------------------------ */

function mergeClose(centres: Cluster[]): Cluster[] {
  const out: Cluster[] = [];
  for (const c of centres) {
    let merged = false;
    for (const o of out) {
      if (dist2(c.L, c.a, c.b, o.L, o.a, o.b) <= MERGE_DISTANCE * MERGE_DISTANCE) {
        const tw = o.w + c.w;
        o.L = (o.L * o.w + c.L * c.w) / tw;
        o.a = (o.a * o.w + c.a * c.w) / tw;
        o.b = (o.b * o.w + c.b * c.w) / tw;
        o.w = tw;
        merged = true;
        break;
      }
    }
    if (!merged) out.push({ ...c });
  }
  return out;
}

function dropOutliers(centres: Cluster[]): Cluster[] {
  let total = 0;
  for (const c of centres) total += c.w;
  if (total <= 0) return centres;
  const kept = centres.filter((c) => chroma(c) >= CHROMA_OUTLIER);
  if (kept.length === 0) return centres;
  let kw = 0;
  for (const c of kept) kw += c.w;
  // If dropping outliers would have removed more than 40% of the image weight,
  // the "outliers" were the picture after all. Put them back.
  if (kw < total * (1 - MAX_OUTLIER_WEIGHT)) return centres;
  return kept;
}

/** Order by weight desc; ties broken by hue then lightness so it is stable. */
function order(centres: Cluster[]): Cluster[] {
  return [...centres].sort((x, y) => {
    if (Math.abs(y.w - x.w) > 1e-12) return y.w - x.w;
    const hx = hueOf(x);
    const hy = hueOf(y);
    if (Math.abs(hy - hx) > 1e-12) return hy - hx;
    return x.L - y.L;
  });
}

/** OKLCH hue in degrees, 0..360. Undefined chroma maps to 0 by convention. */
function hueOf(c: Cluster): number {
  let h = (Math.atan2(c.b, c.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return h;
}

/* ------------------------------------------------------------------ *
 * 6. Public API
 * ------------------------------------------------------------------ */

export interface Palette {
  /** Ordered, most dominant first. */
  colors: string[];
  /** Dominant colour, duplicated for convenience. */
  primary: string;
  /** Share of the image's weighted mass held by `colors[0]`, 0..1, 3 decimals. */
  weight: number;
}

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/**
 * Extract the palette from RGBA pixel data.
 * @param data  RGBA bytes, row-major, 8 bits per channel.
 * @param width width in pixels (> 0)
 * @param height height in pixels (> 0)
 */
export function extractPalette(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): Palette {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('extractPalette: width/height must be positive numbers');
  }
  if (data.length < width * height * 4) {
    throw new Error(
      `extractPalette: expected at least ${width * height * 4} bytes of RGBA data, got ${data.length}`,
    );
  }

  const { L, A, B, W, n } = resample(data, width, height);
  if (n === 0) {
    // Fully transparent image: a valid, honest answer.
    return { colors: Array.from({ length: PALETTE_SIZE }, () => '#000000'), primary: '#000000', weight: 0 };
  }

  let centres = kmeans(L, A, B, W, n, PALETTE_SIZE);
  centres = mergeClose(centres);
  centres = dropOutliers(centres);
  centres = order(centres);

  let total = 0;
  for (const c of centres) total += c.w;

  const colors: string[] = [];
  for (const c of centres) {
    const { r, g, b } = oklabToRgb255(c);
    colors.push(toHex(r, g, b));
  }
  while (colors.length < PALETTE_SIZE) {
    // Pad by duplicating the most common colour: the palette is still a valid
    // 6-slot collage, and the spec says padding is by repetition.
    colors.push(colors[0] ?? '#000000');
  }

  const dominant = centres[0];
  return {
    colors: colors.slice(0, PALETTE_SIZE),
    primary: colors[0]!,
    weight: dominant && total > 0 ? round3(dominant.w / total) : 0,
  };
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/**
 * Canonical JSON serialisation used for the integrity hash. Keys are emitted in
 * a fixed order and the array length is fixed, so the hash is stable forever.
 */
export function canonicalPaletteJson(p: Palette): string {
  return JSON.stringify({
    v: ALGORITHM_VERSION,
    colors: p.colors,
    weight: p.weight,
  });
}

export const ALGORITHM_VERSION = '1.0.0';

/** Stable integrity hash of a palette. FNV-1a 32-bit, hex, 8 chars. */
export function paletteHash(p: Palette): string {
  const s = canonicalPaletteJson(p);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
