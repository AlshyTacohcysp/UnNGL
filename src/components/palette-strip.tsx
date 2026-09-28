/**
 * Palette rendering.
 *
 * Four shapes, all of them taken from the mockup, and each of them does a
 * different job:
 *
 *   - `PalettePanel`   the inbox. A flat base colour with four large circles
 *                      laid over it, each bleeding off an edge and clipped by
 *                      the panel. This is the one that matters most: a hint is
 *                      something you recognise by its outline, and circles
 *                      against a ground give you an outline. Swatches in a
 *                      row give you a list.
 *   - `PaletteStrip`   the send page. A stadium-shaped pill cut into segments.
 *                      Before sending, the sender is checking "are those my
 *                      colours", which is a comparison, so the colours sit
 *                      side by side and can be compared.
 *   - `PaletteDots`    the diagram's middle node. The point there is the
 *                      count, not the shades.
 *   - `PaletteDisc`    the diagram's message node, and the inbox avatar. One
 *                      round shape, the palette inside it.
 *
 * The circles are sized from the panel's height and rounded with
 * `aspect-square`, so they stay perfectly round whatever the panel's width
 * does. Positioning is in rem for the same reason: a panel twice as wide must
 * not push its circles off the edge.
 *
 * Nothing is random. Slots and sizes are fixed, so the server-rendered markup
 * and the client hydration agree and a given hint always looks the same.
 *
 * @license AGPL-3.0-or-later
 */

import { cn } from '@/lib/cn';

export interface PaletteStripProps {
  colors: readonly string[];
  className?: string;
}

/**
 * The four slots a panel's circles sit in. Each one is anchored to a different
 * edge, so the corners stay legible instead of piling into a single mass —
 * which is what happens if you put four circles in the middle.
 */
const SLOTS = [
  // left: bleeds off the left edge, sits low
  { className: '-left-[2.4rem] top-[22%]', color: 1, size: 'h-[78%]' },
  // top: breaks the top edge, upper middle
  { className: 'left-[28%] -top-[2.6rem]', color: 2, size: 'h-[74%]' },
  // right: bleeds off the top-right corner
  { className: '-right-[1.9rem] -top-[1.1rem]', color: 3, size: 'h-[80%]' },
  // bottom: breaks the bottom edge, right of centre
  { className: 'left-[44%] -bottom-[2.4rem]', color: 4, size: 'h-[76%]' },
] as const;

/** The inbox's palette: a flat ground with four circles over it. */
export function PalettePanel({ colors, className }: PaletteStripProps) {
  const six = [...colors];
  while (six.length < 6) six.push(six[0] ?? '#cccccc');

  return (
    <div
      className={cn(
        'relative h-24 w-full overflow-hidden rounded-[1.1rem] sm:h-28',
        className,
      )}
      role="img"
      aria-label={`Palette: ${six.slice(0, 6).join(' ')}`}
    >
      <span className="absolute inset-0 block" style={{ background: six[0] }} />
      {SLOTS.map((slot, i) => (
        <span
          key={i}
          className={cn('absolute block aspect-square', slot.size, slot.className)}
          style={{ background: six[slot.color % six.length] }}
        />
      ))}
    </div>
  );
}

/**
 * The send page's palette: a pill, cut into segments, with the gaps showing
 * the card through. It is the only palette drawn as a row, because it is the
 * only one whose job is to be compared rather than recognised.
 */
export function PaletteStrip({ colors, className }: PaletteStripProps) {
  const six = [...colors];
  while (six.length < 6) six.push(six[0] ?? '#cccccc');

  return (
    <div
      className={cn('flex h-4 w-full gap-[3px]', className)}
      role="img"
      aria-label={`Palette: ${six.slice(0, 6).join(' ')}`}
    >
      {six.slice(0, 6).map((hex, i) => (
        <span
          key={i}
          className={cn(
            'block h-full flex-1',
            i === 0 && 'rounded-l-full',
            i === 5 && 'rounded-r-full',
          )}
          style={{ background: hex }}
        />
      ))}
    </div>
  );
}

/**
 * The diagram's middle node: a white lozenge holding the palette. Small
 * enough that the shapes have merged, so what reads is "six of them".
 */
export function PaletteDots({ colors, className }: PaletteStripProps) {
  const six = [...colors];
  while (six.length < 6) six.push(six[0] ?? '#cccccc');

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-surface px-3 py-2',
        className,
      )}
      role="img"
      aria-label="Six colours"
    >
      {six.slice(0, 6).map((hex, i) => (
        <span
          key={i}
          className="block h-3 w-3 rounded-full"
          style={{ background: hex }}
        />
      ))}
    </span>
  );
}

/**
 * A round palette: the diagram's message node, and the inbox avatar. The same
 * flat-ground-and-circles treatment as the panel, clipped to a circle — so
 * the small and large versions of a hint are unmistakably the same thing.
 */
export function PaletteDisc({ colors, className, size = 64 }: PaletteStripProps & { size?: number }) {
  const six = [...colors];
  while (six.length < 6) six.push(six[0] ?? '#cccccc');

  return (
    <span
      className={cn('relative block shrink-0 overflow-hidden rounded-full', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Palette: ${six.slice(0, 6).join(' ')}`}
    >
      <span className="absolute inset-0 block" style={{ background: six[0] }} />
      <span
        className="absolute -left-[22%] top-[6%] block aspect-square rounded-full"
        style={{ height: '62%', background: six[1] }}
      />
      <span
        className="absolute left-[34%] -top-[16%] block aspect-square rounded-full"
        style={{ height: '64%', background: six[2] }}
      />
      <span
        className="absolute -right-[20%] -top-[14%] block aspect-square rounded-full"
        style={{ height: '58%', background: six[3] }}
      />
      <span
        className="absolute left-[44%] -bottom-[26%] block aspect-square rounded-full"
        style={{ height: '66%', background: six[4] }}
      />
    </span>
  );
}

/**
 * The wordmark's four dots: coral, teal, blue, pink, in a white pill.
 *
 * This is the one palette that is not the sender's. It is the brand, and it
 * is deliberately a different set of four from the six a hint contains.
 */
export function BrandDots({ className }: { className?: string }) {
  const dots = [
    'var(--color-coral)',
    'var(--color-teal)',
    'var(--color-sky)',
    'var(--color-pink)',
  ];
  return (
    <span className={cn('dot-row', className)}>
      {dots.map((c) => (
        <i key={c} style={{ background: c }} />
      ))}
    </span>
  );
}
