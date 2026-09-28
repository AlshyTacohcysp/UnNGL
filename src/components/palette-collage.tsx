'use client';

/**
 * The palette collage: UnNGL's version of NGL's "reveal" card.
 *
 * Six colour scraps torn out of someone's photo, printed with the same ink
 * outlines and hard shadows as the rest of the site. The layout is fixed (not
 * random) so the server-rendered markup and the client hydration match exactly.
 *
 * @license AGPL-3.0-or-later
 */

import { isLight } from '@/lib/palette/client';
import { paletteHash } from '@/lib/palette/extract';

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

/** Fixed misregistration offsets — deterministic, so SSR and client agree. */
const BAR_TILT = [-2, 1.6, -1.1, 2.1, -1.7] as const;
const BAR_SHIFT = [-2, 1, 0, -1.5, 2] as const;

export function PaletteCollage({
  colors,
  className = '',
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
    <figure className={`card ${compact ? 'p-2' : 'p-3'} ${className}`}>
      <div className="flex items-stretch">
        {/* dominant colour: the big scrap */}
        <div
          className="relative z-10 w-[44%] shrink-0 border-[2.5px] border-ink"
          style={{ background: six[0], transform: 'rotate(-1.6deg)' }}
        >
          <div className="aspect-square w-full" />
          {labels && (
            <span
              className="mono-chip absolute bottom-1 left-1.5 border-[2px] border-ink px-1 py-[1px]"
              style={{
                background: isLight(six[0]!) ? '#f6f1e6' : '#16130f',
                color: isLight(six[0]!) ? '#16130f' : '#f6f1e6',
              }}
            >
              {six[0]}
            </span>
          )}
        </div>

        {/* the rest: shredded strips, each nudged out of register */}
        <div className="-ml-2.5 flex min-w-0 flex-1 flex-col justify-between">
          {six.slice(1).map((hex, i) => (
            <div
              key={`${hex}-${i}`}
              className="relative -ml-1 flex-1 border-[2.5px] border-ink"
              style={{
                background: hex,
                transform: `rotate(${BAR_TILT[i] ?? 0}deg) translateY(${BAR_SHIFT[i] ?? 0}px)`,
                zIndex: 10 - i,
              }}
            >
              {labels && (
                <span
                  className="mono-chip absolute right-1.5 top-1/2 -translate-y-1/2 border-[2px] border-ink px-1 py-[1px]"
                  style={{
                    background: isLight(hex) ? '#f6f1e6' : '#16130f',
                    color: isLight(hex) ? '#16130f' : '#f6f1e6',
                  }}
                >
                  {hex}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {footnote && (
        <figcaption className="mono-chip mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-soft">
          <span>UnNGL palette v{algorithm}</span>
          <span aria-hidden>·</span>
          <span>6 colours</span>
          <span aria-hidden>·</span>
          <span title="Integrity hash of the canonical palette JSON">id {hash}</span>
          {verified !== undefined && (
            <>
              <span aria-hidden>·</span>
              <span className={verified ? 'text-ink' : 'text-punch'}>
                {verified ? 'server-verified' : 'unverified'}
              </span>
            </>
          )}
        </figcaption>
      )}
    </figure>
  );
}

/** Compact strip for lists and avatars. */
export function PaletteBars({
  colors,
  className = '',
  height = 14,
}: {
  colors: string[];
  className?: string;
  height?: number;
}) {
  const six = normalize(colors);
  return (
    <div
      className={`flex overflow-hidden border-[2px] border-ink ${className}`}
      style={{ height }}
      aria-hidden
    >
      {six.map((hex, i) => (
        <div key={`${hex}-${i}`} className="flex-1" style={{ background: hex }} />
      ))}
    </div>
  );
}

function normalize(colors: string[]): string[] {
  const clean = colors.filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 6);
  while (clean.length < 6) clean.push(clean[0] ?? '#000000');
  return clean;
}
