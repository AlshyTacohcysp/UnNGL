/**
 * Two ways the mockup shows a palette, and only two.
 *
 *  - `PalettePill`   the send page: one fully-rounded bar, one segment per
 *                    colour, the thing a sender looks at to confirm "yes,
 *                    those are my colours".
 *  - `PaletteBlobs`  the inbox: overlapping organic circles in the sender's
 *                    colours. It is the whole point of the product made
 *                    visible — you recognise the shapes, not a set of swatches.
 *
 * Both take the hex list straight from the hint, so what the sender's phone
 * computed is what the recipient sees, byte for byte.
 *
 * @license AGPL-3.0-or-later
 */

import { cn } from '@/lib/cn';
import { PALETTE_SIZE } from '@/lib/palette/extract';

export interface PaletteStripProps {
  colors: readonly string[];
  className?: string;
}

/** The flat bar. Rounded at both ends, hard divisions between colours. */
export function PalettePill({ colors, className }: PaletteStripProps) {
  return (
    <div
      className={cn('flex h-7 w-full overflow-hidden rounded-full', className)}
      role="img"
      aria-label={`Palette: ${colors.join(' ')}`}
    >
      {colors.map((hex, i) => (
        <span key={i} className="block h-full flex-1" style={{ background: hex }} />
      ))}
    </div>
  );
}

/**
 * The blobs. A base wash of the palette's own colours with three or four
 * circles laid over it, clipped by the rounded frame — which is what makes
 * two different senders with similar colours still look different.
 */
export function PaletteBlobs({ colors, className }: PaletteStripProps) {
  // Four shapes, positioned as fractions of the frame. Fixed rather than
  // derived from the colours, so the same hint always renders identically.
  const marks: Array<{ color: number; left: number; top: number; size: number; shape: number }> = [
    { color: 1, left: -12, top: -34, size: 78, shape: 0 },
    { color: 2, left: 22, top: -14, size: 62, shape: 1 },
    { color: 3, left: 56, top: 12, size: 70, shape: 2 },
    { color: 0, left: 74, top: -28, size: 54, shape: 3 },
  ];
  const shapes = [
    '58% 42% 47% 53% / 52% 44% 56% 48%',
    '44% 56% 38% 62% / 61% 39% 61% 39%',
    '62% 38% 55% 45% / 45% 58% 42% 55%',
    '38% 62% 61% 39% / 55% 41% 59% 45%',
  ];

  return (
    <div
      className={cn('relative h-24 w-full overflow-hidden rounded-2xl sm:h-28', className)}
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
            borderRadius: shapes[m.shape]!,
          }}
        />
      ))}
    </div>
  );
}

/**
 * The six colour dots, as a small pill. Used in the "photo → palette →
 * message" diagram, where the point is the count, not the shades.
 */
export function PaletteDots({ colors, className }: PaletteStripProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-2',
        className,
      )}
    >
      {Array.from({ length: PALETTE_SIZE }, (_, i) => (
        <span
          key={i}
          className="block h-3.5 w-3.5 rounded-full"
          style={{ background: colors[i % Math.max(colors.length, 1)] ?? '#ccc' }}
        />
      ))}
    </span>
  );
}

/**
 * The four dots in the wordmark. The mockup puts them in a fixed order —
 * amber, coral, teal, indigo — because the mark is a promise about colour, and
 * a brand mark that reshuffles is not a brand mark.
 */
export function BrandDots({ className }: { className?: string }) {
  const dots = ['var(--color-amber)', 'var(--color-coral)', 'var(--color-teal)', 'var(--color-indigo)'];
  return (
    <span className={cn('dot-row', className)}>
      {dots.map((c) => (
        <i key={c} style={{ background: c }} />
      ))}
    </span>
  );
}
