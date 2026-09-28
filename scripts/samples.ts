/**
 * Generate the sample palettes used across the marketing pages by running the
 * real algorithm over synthetic images — so every screenshot in the UI is an
 * honest output of UnNGL Palette v1, not a hand-picked colour list.
 *
 *   npx tsx scripts/samples.ts
 *
 * @license AGPL-3.0-or-later
 */

import { extractPalette, paletteHash, ALGORITHM_VERSION } from '../src/lib/palette/extract';
import fs from 'node:fs';
import path from 'node:path';

type Painter = (x: number, y: number) => [number, number, number];

function render(size: number, paint: Painter): { data: Uint8ClampedArray; width: number; height: number } {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = paint(x / size, y / size);
      const o = (y * size + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  return { data, width: size, height: size };
}

const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

const SAMPLES: Record<string, Painter> = {
  // A sunset over water: the classic "profile photo" palette.
  sunset: (x, y) => {
    const sky = [lerp(255, 255, x), lerp(120, 90, y), lerp(60, 160, y)];
    const sun = Math.hypot(x - 0.68, y - 0.38) < 0.13 ? [255, 214, 92] : sky;
    const sea = y > 0.62 ? [lerp(30, 14, x), lerp(70, 40, y), lerp(120, 90, y)] : sun;
    return sea as [number, number, number];
  },
  // Studio portrait: warm skin, teal backdrop, red jacket.
  studio: (x, y) => {
    if (y > 0.55) return [lerp(200, 120, x), lerp(40, 30, y), lerp(50, 90, x)];
    if (Math.hypot(x - 0.5, y - 0.32) < 0.26) return [lerp(238, 205, y), lerp(198, 160, y), lerp(170, 130, y)];
    return [lerp(24, 46, x), lerp(120, 150, x), lerp(126, 140, y)];
  },
  // Neon night: magenta and cyan on near-black.
  neon: (x, y) => {
    const base: [number, number, number] = [18, 16, 28];
    if (Math.hypot(x - 0.3, y - 0.35) < 0.16) return [lerp(255, 40, y), 40, lerp(160, 200, x)];
    if (Math.hypot(x - 0.72, y - 0.6) < 0.14) return [30, lerp(210, 245, y), 230];
    if (y < 0.12) return [lerp(120, 255, x), 40, 150];
    return base;
  },
  // Beach daytime: pale sky, sand, turquoise water.
  beach: (x, y) => {
    if (y < 0.45) return [lerp(120, 190, x), lerp(190, 225, y), lerp(240, 250, x)];
    if (y < 0.62) return [lerp(232, 246, x), lerp(210, 226, y), lerp(168, 190, x)];
    return [lerp(60, 20, x), lerp(170, 140, y), lerp(190, 180, x)];
  },
};

const out: Record<string, unknown> = { algorithm: ALGORITHM_VERSION };
for (const [name, paint] of Object.entries(SAMPLES)) {
  const img = render(96, paint);
  const palette = extractPalette(img.data, img.width, img.height);
  out[name] = { ...palette, hash: paletteHash(palette) };
  console.log(name.padEnd(8), palette.colors.join(' '), `${Math.round(palette.weight * 100)}%`);
}

const dest = path.join(process.cwd(), 'src', 'lib', 'samples.generated.ts');
const body = `/**
 * Sample palettes, produced by scripts/samples.ts running UnNGL Palette
 * v${ALGORITHM_VERSION} over synthetic images. Regenerate with:
 *   npx tsx scripts/samples.ts
 *
 * These exist so every example in the UI is a real algorithm output.
 *
 * @license AGPL-3.0-or-later
 */

import type { Palette } from './palette/extract';

export const ALGORITHM = ${JSON.stringify(ALGORITHM_VERSION)};

export const SUNSET = ${JSON.stringify(out.sunset, null, 2)} as Palette & { hash: string };
export const STUDIO = ${JSON.stringify(out.studio, null, 2)} as Palette & { hash: string };
export const NEON = ${JSON.stringify(out.neon, null, 2)} as Palette & { hash: string };
export const BEACH = ${JSON.stringify(out.beach, null, 2)} as Palette & { hash: string };

export const SAMPLE_LIST: Array<Palette & { hash: string }> = [SUNSET, STUDIO, NEON, BEACH];
`;

fs.writeFileSync(dest, body);
console.log(`\nwrote ${dest}`);
