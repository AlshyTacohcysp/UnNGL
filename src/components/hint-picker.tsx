'use client';

/**
 * The hint picker: choose a photo, see the palette it produces.
 *
 * The palette is computed here, in the browser, and the exact pixels it was
 * computed from are what we upload — so the server can independently recompute
 * the same six colours and mark the hint "verified".
 *
 * The mockup makes the hint optional and quiet: a switch, a strip, and a
 * dashed drop target that only appears once you've said yes to having one. So
 * the control starts as a line of text, not a box asking for a file.
 *
 * @license AGPL-3.0-or-later
 */

import { useCallback, useId, useRef, useState } from 'react';
import { fetchRemoteImage, prepareImage, type PreparedImage } from '@/lib/palette/client';
import { PalettePill } from './palette-strip';
import { PALETTE_SIZE } from '@/lib/palette/extract';

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
  label = 'Add a colour hint',
  compact = false,
}: Props) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [dragging, setDragging] = useState(false);
  // Once someone has opted in, the target stays open — un-toggling a photo
  // mid-choice would throw away work they may want to undo.
  const [wantsHint, setWantsHint] = useState(false);

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

  // Turning the hint off releases the image entirely: the sender's browser
  // forgets it and nothing is queued to upload.
  const clear = useCallback(() => {
    onChange(null);
    setError(null);
    setWantsHint(false);
  }, [onChange]);

  return (
    <div className="flex flex-col gap-3">
      {/* The switch row: what it is, and the promise, side by side. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="flex items-center gap-2.5">
          <span
            className={`relative block h-6 w-11 shrink-0 rounded-full transition-colors ${
              wantsHint || value ? 'bg-teal' : 'bg-line'
            }`}
          >
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(value) || wantsHint}
              aria-label={label}
              onClick={() => {
                if (wantsHint || value) clear();
                else setWantsHint(true);
              }}
              className={`absolute top-0.5 left-0.5 block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                wantsHint || value ? 'translate-x-5' : ''
              }`}
            />
          </span>
          <span className="font-semibold text-ink">{label}</span>
        </span>
        <span className="text-xs text-ink-soft">
          optional · free · {PALETTE_SIZE} colours, never your photo
        </span>
      </div>

      {value && <PalettePill colors={value.palette.colors} className={compact ? 'h-6' : undefined} />}

      {value && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-ink-soft">
            {value.palette.colors.length} colours · dominant{' '}
            {Math.round(value.palette.weight * 100)}% of the image
          </p>
          <button type="button" className="btn btn-sm btn-quiet" onClick={clear}>
            Remove
          </button>
        </div>
      )}

      {!value && (wantsHint || error) && (
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
          className={`card-dashed flex flex-col items-center gap-1.5 p-5 text-center transition-colors ${
            dragging ? 'bg-surface' : ''
          }`}
        >
          <p className="text-sm leading-snug text-ink-soft">
            Drop a photo here, or
            <button
              type="button"
              className="mx-1 font-semibold text-ink underline decoration-2 underline-offset-2"
              onClick={() => fileRef.current?.click()}
            >
              choose a file
            </button>
          </p>
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

      {!value && allowUrl && wantsHint && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[14rem] flex-1">
            <label htmlFor={`${inputId}-url`} className="field-label">
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
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={() => void loadUrl()}
            disabled={busy || !url.trim()}
          >
            {busy ? 'Working…' : 'Use this'}
          </button>
        </div>
      )}

      {busy && !value && <p className="text-xs text-ink-soft">reading colours…</p>}
      {error && (
        <p role="alert" className="alert-error">
          {error}
        </p>
      )}
    </div>
  );
}
