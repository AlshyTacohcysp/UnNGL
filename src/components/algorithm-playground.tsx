'use client';

/**
 * The playground on /algorithm: drop in any image, watch the published
 * algorithm run on it in your browser, and get the exact inputs a third party
 * would need to reproduce the result.
 *
 * @license AGPL-3.0-or-later
 */

import { useCallback, useRef, useState } from 'react';
import { prepareImage, type PreparedImage } from '@/lib/palette/client';
import { canonicalPaletteJson, paletteHash } from '@/lib/palette/extract';
import { PaletteCollage } from './palette-collage';

export function AlgorithmPlayground() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<PreparedImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);

  const handle = useCallback(async (file: Blob) => {
    setBusy(true);
    setError(null);
    try {
      const t0 = performance.now();
      const prepared = await prepareImage(file);
      setElapsed(performance.now() - t0);
      setResult(prepared);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.');
      setResult(null);
    } finally {
      setBusy(false);
    }
  }, []);

  const hash = result ? paletteHash(result.palette) : null;

  return (
    <div className="card p-5 sm:p-6">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) void handle(file);
        }}
        className="flex flex-col items-center gap-2 border-[2.5px] border-dashed border-ink bg-surface-sunk p-6 text-center"
      >
        <p className="serif-accent text-2xl">throw an image at it</p>
        <p className="text-sm text-ink-soft">
          Nothing is uploaded. This runs entirely in your browser, and the image never leaves
          the page.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handle(file);
          }}
        />
        <button type="button" className="btn btn-outline btn-sm mt-2" onClick={() => inputRef.current?.click()}>
          Choose an image
        </button>
      </div>

      {busy && <p className="font-mono text-[0.68rem] mt-4">running…</p>}
      {error && (
        <p role="alert" className="alert-error mt-4">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-6 flex flex-col gap-5">
          <div className="grid gap-5 sm:grid-cols-[10rem_1fr]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={result.previewUrl}
              alt="The image you dropped in"
              className="w-full border-0 shadow-lift"
            />
            <PaletteCollage colors={result.palette.colors} footnote verified />
          </div>

          <dl className="grid gap-3 sm:grid-cols-2">
            <Stat label="input" value={`${result.width}×${result.height} RGBA`} />
            <Stat label="dominant share" value={`${Math.round(result.palette.weight * 100)}%`} />
            <Stat label="algorithm" value="v1.0.0" />
            <Stat label="hash" value={hash ?? ''} />
            <Stat
              label="time"
              value={elapsed === null ? '—' : `${elapsed.toFixed(0)} ms in this browser`}
            />
            <Stat label="output" value="6 sRGB hex values" />
          </dl>

          <div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setShowJson((v) => !v)}
              aria-expanded={showJson}
            >
              {showJson ? 'Hide' : 'Show'} the canonical JSON
            </button>
            {showJson && (
              <pre className="font-mono text-[0.68rem] mt-3 overflow-x-auto border-0 bg-ink p-3 text-white">
                {canonicalPaletteJson(result.palette)}
              </pre>
            )}
          </div>

          <p className="text-sm leading-relaxed text-ink-soft">
            The hash above is FNV-1a over that exact JSON. If you implement the algorithm
            yourself and get the same hash, you implemented it correctly.
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-0 px-3 py-2">
      <dt className="font-mono text-[0.68rem] text-ink-soft">{label}</dt>
      <dd className="font-semibold break-all">{value}</dd>
    </div>
  );
}
