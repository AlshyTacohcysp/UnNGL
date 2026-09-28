/**
 * The organic blob collage.
 *
 * The mockup's signature: overlapping soft-edged shapes, never flat colour
 * blocks, spilling out of the top of a screen and clipped by whatever card or
 * viewport edge they meet. A blob is a div with a multi-value `border-radius`,
 * which is the cheapest way to get an asymmetric organic outline that scales
 * with its container — no SVG, no images, no layout shift.
 *
 * @license AGPL-3.0-or-later
 */

import { cn } from '@/lib/cn';

/** Outlines chosen to read as "cut paper", not as circles. */
const SHAPES = [
  '58% 42% 47% 53% / 52% 44% 56% 48%',
  '44% 56% 38% 62% / 61% 39% 61% 39%',
  '62% 38% 55% 45% / 45% 58% 42% 55%',
  '38% 62% 61% 39% / 55% 41% 59% 45%',
  '52% 48% 42% 58% / 43% 57% 43% 57%',
] as const;

export interface Blob {
  /** Any CSS colour. */
  color: string;
  /** Position and size, as percentages of the collage box. */
  left: number;
  top: number;
  size: number;
  /** Rotation, in degrees. */
  rotate?: number;
  /** Index into SHAPES, so two blobs never repeat an outline. */
  shape?: number;
  /** Render under its siblings. The mockup stacks the pale shapes behind. */
  z?: number;
}

/**
 * The default arrangement, in the order the mockup layers them: the pale
 * shapes sit behind, the saturated ones in front, and the whole thing is
 * cropped at the top so the shapes read as coming from off-screen.
 */
export const DEFAULT_BLOBS: Blob[] = [
  { color: 'var(--color-amber)', left: -14, top: -34, size: 74, shape: 0, z: 1 },
  { color: 'var(--color-teal)', left: 18, top: -46, size: 78, shape: 1, z: 2 },
  { color: 'var(--color-pink)', left: 52, top: -30, size: 58, shape: 2, z: 1 },
  { color: 'var(--color-coral)', left: -10, top: 14, size: 62, shape: 3, z: 3 },
  { color: 'var(--color-indigo)', left: 44, top: 30, size: 66, shape: 4, z: 2 },
  { color: 'var(--color-sky)', left: 20, top: 46, size: 44, shape: 2, z: 1 },
  { color: 'var(--color-pink)', left: 74, top: 54, size: 40, shape: 0, z: 1 },
];

export function BlobCollage({
  blobs = DEFAULT_BLOBS,
  className,
  style,
}: {
  blobs?: Blob[];
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} style={style}>
      {blobs.map((b, i) => (
        <span
          key={i}
          aria-hidden
          className="absolute block"
          style={{
            left: `${b.left}%`,
            top: `${b.top}%`,
            width: `${b.size}%`,
            height: `${b.size}%`,
            background: b.color,
            borderRadius: SHAPES[(b.shape ?? i) % SHAPES.length],
            transform: `rotate(${b.rotate ?? ((i % 3) - 1) * 4}deg)`,
            zIndex: b.z ?? 1,
          }}
        />
      ))}
    </div>
  );
}

/**
 * A full-bleed collage header: blobs bleeding off the top, content laid over
 * them. The mockup's height is roughly 38% of a phone screen; it grows a
 * little on wider viewports so the shapes do not flatten out.
 */
export function CollageHeader({
  children,
  className,
  blobs,
}: {
  children: React.ReactNode;
  className?: string;
  blobs?: Blob[];
}) {
  return (
    <div className={cn('relative isolate overflow-hidden', className)}>
      <BlobCollage blobs={blobs} />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
