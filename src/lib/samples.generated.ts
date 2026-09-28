/**
 * Sample palettes, produced by scripts/samples.ts running UnNGL Palette
 * v1.0.0 over synthetic images. Regenerate with:
 *   npx tsx scripts/samples.ts
 *
 * These exist so every example in the UI is a real algorithm output.
 *
 * @license AGPL-3.0-or-later
 */

import type { Palette } from './palette/extract';

export const ALGORITHM = "1.0.0";

export const SUNSET = {
  "colors": [
    "#ff734c",
    "#172e60",
    "#ff6a6d",
    "#ffd65c",
    "#ffa25e",
    "#ffbb5e"
  ],
  "primary": "#ff734c",
  "weight": 0.367,
  "hash": "3ec2917a"
} as Palette & { hash: string };
export const STUDIO = {
  "colors": [
    "#a12247",
    "#238782",
    "#e4ba9e",
    "#645566",
    "#bc696d",
    "#89a392"
  ],
  "primary": "#a12247",
  "weight": 0.532,
  "hash": "549642f1"
} as Palette & { hash: string };
export const NEON = {
  "colors": [
    "#12101c",
    "#9d289e",
    "#d5299c",
    "#1ee7e6",
    "#187e83",
    "#15464e"
  ],
  "primary": "#12101c",
  "weight": 0.551,
  "hash": "f398f316"
} as Palette & { hash: string };
export const BEACH = {
  "colors": [
    "#2a92b9",
    "#8ac6f2",
    "#adc5f8",
    "#efdbb3",
    "#bad4d0",
    "#2a92b9"
  ],
  "primary": "#2a92b9",
  "weight": 0.422,
  "hash": "86e74114"
} as Palette & { hash: string };

export const SAMPLE_LIST: Array<Palette & { hash: string }> = [SUNSET, STUDIO, NEON, BEACH];
