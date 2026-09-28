/**
 * The collage behind the top of a screen.
 *
 * The mockup draws it with big, clean, overlapping CIRCLES — not organic
 * blobs, not torn paper. They spill off the top and are clipped by whatever
 * card or viewport edge they meet, and because they are circles the overlaps
 * read as flat colour meeting flat colour, with no outlines anywhere.
 *
 * A circle is a div with `border-radius: 50%`, which scales with its
 * container and costs nothing: no SVG, no images, no layout shift.
 *
 * @license AGPL-3.0-or-later
 */

import { cn } from '@/lib/cn';

export interface Blob {
  /** Any CSS colour. */
  color: string;
  /** Left edge, as a percentage of the collage box. */
  left: number;
  /** Top edge, as a percentage of the collage box. Negative crops it off. */
  top: number;
  /** Diameter, as a percentage of the collage box's width. */
  size: number;
  /** Stacking order; the mockup puts the pale shapes behind the saturated ones. */
  z?: number;
}

/** The arrangement from the mockup: overlapping, cropped by the top edge. */
export const DEFAULT_BLOBS: Blob[] = [
  { color: 'var(--color-amber)', left: -16, top: -46, size: 62, z: 1 },
  { color: 'var(--color-teal)', left: 22, top: -58, size: 74, z: 2 },
  { color: 'var(--color-pink)', left: 68, top: -44, size: 54, z: 1 },
  { color: 'var(--color-coral)', left: -22, top: 4, size: 68, z: 3 },
  { color: 'var(--color-indigo)', left: 52, top: 26, size: 70, z: 2 },
  { color: 'var(--color-amber)', left: 6, top: 58, size: 46, z: 1 },
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
          className="absolute block rounded-full"
          style={{
            left: `${b.left}%`,
            top: `${b.top}%`,
            width: `${b.size}%`,
            aspectRatio: '1',
            background: b.color,
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
