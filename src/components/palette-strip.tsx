/**
 * Palette shapes.
 *
 * The hint is a set of colours, and colours are not rectangles. Every palette
 * on the site is drawn as drops — a point, a swell, a round belly — because
 * that is what a colour looks like when it is recognisable rather than
 * catalogued. A bar of six flat blocks says "swatch"; six drops say "these
 * are somebody's colours".
 *
 * Two families, both organic, both deterministic:
 *
 *   - Drops, drawn as SVG paths. A drop is an apex, two curves out to a
 *     circle, and a semicircular belly, so the join from curve to circle
 *     lands on the rim instead of kinking. The six silhouettes differ in
 *     tip height, width, lean and belly, and each is rotated and offset a
 *     little, so a row of them reads as paint that landed rather than as six
 *     copies of one icon.
 *   - Blobs, drawn with `border-radius`. Bigger, softer, overlapping — the
 *     inbox's version, where the colours should feel like a photograph of
 *     someone's palette rather than a list of it.
 *
 * Nothing here is random at render time. The variation is indexed off the
 * drop's position, so the server-rendered markup and the client hydration are
 * identical, and the same hint always looks the same.
 *
 * @license AGPL-3.0-or-later
 */

import { cn } from '@/lib/cn';

export interface PaletteStripProps {
  colors: readonly string[];
  className?: string;
}

/**
 * Six drop silhouettes, generated rather than hand-written.
 *
 * Each is an apex, two cubics out to the widest point of a circle, a
 * semicircle around the belly, and the two sides back to the apex. The arc's
 * endpoints are exactly 2r apart, so the belly really is that circle and the
 * join from curve to curve does not kink.
 *
 * The one number that decides whether this reads as liquid or as a flower
 * petal is how far out the first control point sits: that is the neck. Wide
 * and it is a petal; narrow and it is a thorn; around 0.3-0.45 with the
 * widening held low, the curve stays slim until the belly opens, which is
 * what a falling drop does.
 */
const DROP_PATHS = [
  'M50 4 C62 37 80 59.5 80 70 A30 30 0 0 1 20 70 C20 59.5 38 37 50 4 Z',
  'M52 10 C63.5 39 88 56.1 86 68 A34 34 0 0 1 18 68 C20 56.1 41.8 39 52 10 Z',
  'M47 3 C57.1 37.5 70 62.9 73 72 A26 26 0 0 1 21 72 C18 62.9 34.2 37.5 47 3 Z',
  'M50 18 C60.8 41.5 86 52.4 86 65 A36 36 0 0 1 14 65 C14 52.4 39.2 41.5 50 18 Z',
  'M49 6 C61.6 37.5 84 58.1 80 69 A31 31 0 0 1 18 69 C22 58.1 39.3 37.5 49 6 Z',
  'M51 13 C62 41 80 57.8 83 69 A32 32 0 0 1 19 69 C16 57.8 37.7 41 51 13 Z',
] as const;

/** Rotation and lift per position, in degrees and percent. */
const DROP_TILT = [-7, 5, -4, 10, -6, 3] as const;
const DROP_LIFT = [0, 5, 2, 7, 1, 4] as const;

/** Blobs, for the larger surfaces. Softer than the SVG drops on purpose. */
const BLOB_SHAPES = [
  '58% 42% 47% 53% / 52% 44% 56% 48%',
  '44% 56% 38% 62% / 61% 39% 61% 39%',
  '62% 38% 55% 45% / 45% 58% 42% 55%',
  '38% 62% 61% 39% / 55% 41% 59% 45%',
  '52% 48% 42% 58% / 43% 57% 43% 57%',
] as const;

/** Exactly one drop, sized by its container. */
export function Drop({
  color,
  index = 0,
  className,
}: {
  color: string;
  index?: number;
  className?: string;
}) {
  const i = ((index % DROP_PATHS.length) + DROP_PATHS.length) % DROP_PATHS.length;
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn('block h-full w-full', className)}
      aria-hidden
      focusable="false"
      style={{
        transform: `rotate(${DROP_TILT[i]! * 1.6}deg) translateY(-${DROP_LIFT[i]! * 0.4}%)`,
      }}
    >
      <path d={DROP_PATHS[i]!} fill={color} />
    </svg>
  );
}

/**
 * A palette as a row of drops. The default reading of a palette anywhere in
 * the app: on the send page, in the settings preview, in the algorithm
 * playground.
 */
export function PaletteDrops({ colors, className }: PaletteStripProps) {
  return (
    <div
      className={cn('flex h-12 w-full items-end justify-between gap-0.5', className)}
      role="img"
      aria-label={`Palette: ${colors.join(' ')}`}
    >
      {colors.map((hex, i) => (
        <span key={`${hex}-${i}`} className="block h-full min-w-0 flex-1">
          <Drop color={hex} index={i} />
        </span>
      ))}
    </div>
  );
}

/**
 * The small version, for inside a sentence or a card header. Dots at this
 * size would be a colour list; drops are still recognisable as drops.
 */
export function PaletteDots({ colors, className }: PaletteStripProps) {
  return (
    <span
      className={cn('inline-flex items-center gap-0.5', className)}
      role="img"
      aria-label={`Palette: ${colors.join(' ')}`}
    >
      {colors.map((hex, i) => (
        <span
          key={`${hex}-${i}`}
          className="block h-5 w-4 shrink-0"
          style={{
            transform: `rotate(${DROP_TILT[i % DROP_TILT.length]! * 1.2}deg)`,
          }}
        >
          <Drop color={hex} index={i} />
        </span>
      ))}
    </span>
  );
}

/**
 * The large version: overlapping blobs in a rounded frame. The inbox's
 * version, where the point is that a palette has a shape — two senders with
 * similar colours should still not look identical.
 */
export function PaletteBlobs({ colors, className }: PaletteStripProps) {
  const marks: Array<{ color: number; left: number; top: number; size: number; shape: number }> = [
    { color: 1, left: -12, top: -34, size: 78, shape: 0 },
    { color: 2, left: 22, top: -14, size: 62, shape: 1 },
    { color: 3, left: 56, top: 12, size: 70, shape: 2 },
    { color: 0, left: 74, top: -28, size: 54, shape: 3 },
    { color: 4, left: 4, top: 38, size: 58, shape: 4 },
  ];

  return (
    <div
      className={cn('relative h-24 w-full overflow-hidden rounded-3xl sm:h-28', className)}
      role="img"
      aria-label={`Palette: ${colors.join(' ')}`}
    >
      <span className="absolute inset-0 block" style={{ background: colors[0] ?? '#ccc' }} />
      {marks.map((m, i) => (
        <span
          key={i}
          className="absolute block"
          style={{
            left: `${m.left}%`,
            top: `${m.top}%`,
            width: `${m.size}%`,
            height: `${m.size}%`,
            background: colors[m.color % Math.max(colors.length, 1)] ?? '#ccc',
            borderRadius: BLOB_SHAPES[m.shape]!,
          }}
        />
      ))}
    </div>
  );
}

/**
 * The wordmark's four dots.
 *
 * Circles, not drops: at seven pixels across, a drop silhouette collapses
 * into its own tip, and a brand mark that has to be re-read at small sizes
 * isn't a mark. This is the one place in the app where a colour is a dot.
 */
export function BrandDots({ className }: { className?: string }) {
  const dots = [
    'var(--color-amber)',
    'var(--color-coral)',
    'var(--color-teal)',
    'var(--color-indigo)',
  ];
  return (
    <span className={cn('dot-row', className)}>
      {dots.map((c) => (
        <i key={c} style={{ background: c }} />
      ))}
    </span>
  );
}
