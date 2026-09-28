'use client';

/**
 * The palette card — UnNGL's version of NGL's "reveal" card.
 *
 * The old design printed six torn scraps with ink outlines and hard shadows.
 * The new one is quieter and closer to the product's actual claim: the colours
 * are the hint, so they get the whole frame, overlapping as blobs, and
 * everything else shrinks to a caption. The hex labels survive, because on the
 * algorithm and claim pages they are the point — they are what a reader
 * checks their own implementation against.
 *
 * The layout is fixed, not random, so the server-rendered markup and the client
 * hydration match exactly.
 *
 * @license AGPL-3.0-or-later
 */

import { isLight } from '@/lib/palette/client';
import { paletteHash } from '@/lib/palette/extract';
import { cn } from '@/lib/cn';
import { Drop } from './palette-strip';

export interface CollapsedPalette {
  colors: string[];
  primary?: string;
  weight?: number;
}

interface Props {
  colors: string[];
  className?: string;
  /** Shows the hex of each colour. */
  labels?: boolean;
  /** Adds the algorithm-version + integrity hash footnote. */
  footnote?: boolean;
  algorithm?: string;
  verified?: boolean;
  /** Tighter padding for use inside forms. */
  compact?: boolean;
}

/** Fixed, deterministic — see the note above. */
const BLOBS = [
  { color: 0, left: -14, top: -30, size: 72, shape: 0 },
  { color: 2, left: 26, top: -22, size: 64, shape: 1 },
  { color: 4, left: 58, top: 6, size: 66, shape: 2 },
  { color: 1, left: 6, top: 34, size: 58, shape: 3 },
  { color: 5, left: 46, top: 44, size: 62, shape: 4 },
] as const;

const SHAPES = [
  '58% 42% 47% 53% / 52% 44% 56% 48%',
  '44% 56% 38% 62% / 61% 39% 61% 39%',
  '62% 38% 55% 45% / 45% 58% 42% 55%',
  '38% 62% 61% 39% / 55% 41% 59% 45%',
  '52% 48% 42% 58% / 43% 57% 43% 57%',
];

export function PaletteCollage({
  colors,
  className,
  labels = true,
  footnote = false,
  algorithm = '1.0.0',
  verified,
  compact = false,
}: Props) {
  const six = normalize(colors);
  const hash = paletteHash({
    colors: six,
    primary: six[0]!,
    weight: 0,
  });

  return (
    <figure className={cn(compact ? 'p-2' : 'p-3', className)}>
      <div
        className="relative overflow-hidden rounded-2xl"
        role="img"
        aria-label={`Palette: ${six.join(' ')}`}
      >
        <span className="absolute inset-0 block" style={{ background: six[0] }} />
        {BLOBS.map((b, i) => (
          <span
            key={i}
            aria-hidden
            className="absolute block"
            style={{
              left: `${b.left}%`,
              top: `${b.top}%`,
              width: `${b.size}%`,
              height: `${b.size}%`,
              background: six[b.color],
              borderRadius: SHAPES[b.shape],
            }}
          />
        ))}

        {/* The hexes ride on the bottom edge as small pills, each one picking
            its own foreground so it stays readable on any of the six. */}
        {labels && (
          <div className="absolute inset-x-0 bottom-0 flex flex-wrap gap-1 p-1.5">
            {six.map((hex, i) => (
              <span
                key={`${hex}-${i}`}
                className="rounded-full px-1.5 py-0.5 font-mono text-[0.62rem] leading-none"
                style={{
                  background: isLight(hex) ? 'rgba(255,255,255,0.92)' : 'rgba(27,27,51,0.88)',
                  color: isLight(hex) ? '#1b1b33' : '#ffffff',
                }}
              >
                {hex}
              </span>
            ))}
          </div>
        )}
      </div>

      {footnote && (
        <figcaption className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[0.68rem] text-ink-soft">
          <span>UnNGL palette v{algorithm}</span>
          <span aria-hidden>·</span>
          <span>6 colours</span>
          <span aria-hidden>·</span>
          <span title="Integrity hash of the canonical palette JSON">id {hash}</span>
          {verified !== undefined && (
            <>
              <span aria-hidden>·</span>
              <span className={verified ? 'text-ink' : 'text-coral'}>
                {verified ? 'server-verified' : 'unverified'}
              </span>
            </>
          )}
        </figcaption>
      )}
    </figure>
  );
}

/**
 * A compact row of drops, for lists and headers. The same silhouettes as
 * the full-size version, so a palette looks like itself at every scale.
 */
export function PaletteBars({ colors, className, height = 18 }: { colors: string[]; className?: string; height?: number }) {
  const six = normalize(colors);
  return (
    <div className={cn('flex items-end gap-0.5', className)} style={{ height }} aria-hidden>
      {six.map((hex, i) => (
        <span key={`${hex}-${i}`} className="block h-full min-w-0 flex-1">
          <Drop color={hex} index={i} />
        </span>
      ))}
    </div>
  );
}

function normalize(colors: string[]): string[] {
  const clean = colors.filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 6);
  while (clean.length < 6) clean.push(clean[0] ?? '#000000');
  return clean;
}
