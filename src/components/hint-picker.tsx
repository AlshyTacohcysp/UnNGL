'use client';

/**
 * The hint picker: choose a photo, see the palette it produces.
 *
 * The palette is computed here, in the browser, and the exact pixels it was
 * computed from are what we upload — so the server can independently recompute
 * the same six colours and mark the hint "verified".
 *
 * @license AGPL-3.0-or-later
 */

import { useCallback, useId, useRef, useState } from 'react';
import { fetchRemoteImage, prepareImage, type PreparedImage } from '@/lib/palette/client';
import { PaletteCollage } from './palette-collage';

export interface HintValue {
  png: Blob;
  palette: { colors: string[]; primary: string; weight: number };
  source: 'upload' | 'instagram';
}

interface Props {
  value: HintValue | null;
  onChange: (value: HintValue | null) => void;
  /** Allow pasting a profile-photo link (goes through our allowlisted proxy). */
  allowUrl?: boolean;
  idPrefix?: string;
  label?: string;
  compact?: boolean;
}

export function HintPicker({
  value,
  onChange,
  allowUrl = true,
  idPrefix = 'hint',
  label = 'Attach a colour hint',
  compact = false,
}: Props) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [dragging, setDragging] = useState(false);

  const accept = useCallback(
    async (blob: Blob, source: HintValue['source']) => {
      setBusy(true);
      setError(null);
      try {
        const prepared: PreparedImage = await prepareImage(blob);
        onChange({ png: prepared.png, palette: prepared.palette, source });
      } catch (err) {
        onChange(null);
        setError(err instanceof Error ? err.message : 'That image could not be used.');
      } finally {
        setBusy(false);
      }
    },
    [onChange],
  );

  const loadUrl = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await fetchRemoteImage(trimmed);
      await accept(blob, 'instagram');
      setUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That link could not be downloaded.');
    } finally {
      setBusy(false);
    }
  }, [accept, url]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={inputId} className="label mb-0">
          {label}
        </label>
        <span className="mono-chip text-ink-soft">optional · free · never shown as a photo</span>
      </div>

      {!value && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void accept(file, 'upload');
          }}
          className={`flex flex-col items-center gap-2 border-[2.5px] border-dashed p-5 text-center transition-colors ${
            dragging ? 'bg-acid' : 'bg-paper-2'
          }`}
        >
          <p className="text-sm leading-snug text-ink-soft">
            Drop a photo here, or
            <button
              type="button"
              className="mx-1 underline decoration-2 underline-offset-2"
              onClick={() => fileRef.current?.click()}
            >
              choose a file
            </button>
          </p>
          <p className="serif-accent text-lg">your colours, not your face</p>
        </div>
      )}

      <input
        ref={fileRef}
        id={inputId}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void accept(file, 'upload');
        }}
      />

      {!value && allowUrl && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[14rem] flex-1">
            <label htmlFor={`${inputId}-url`} className="label">
              …or paste your profile photo link
            </label>
            <input
              id={`${inputId}-url`}
              className="field"
              placeholder="https://…/photo.jpg"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void loadUrl();
                }
              }}
            />
          </div>
          <button type="button" className="btn btn-sm" onClick={() => void loadUrl()} disabled={busy || !url.trim()}>
            {busy ? 'Working…' : 'Use this'}
          </button>
        </div>
      )}

      {busy && !value && <p className="mono-chip text-ink-soft">reading colours…</p>}
      {error && (
        <p role="alert" className="border-[2px] border-ink bg-punch px-3 py-2 text-sm text-paper">
          {error}
        </p>
      )}

      {value && (
        <div className="flex flex-col gap-3">
          <PaletteCollage colors={value.palette.colors} compact={compact} />
          <div className="flex flex-wrap items-center gap-2">
            <p className="mono-chip text-ink-soft">
              {value.palette.colors.length} colours · dominant{' '}
              {Math.round(value.palette.weight * 100)}% of the image
            </p>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                onChange(null);
                setError(null);
              }}
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
