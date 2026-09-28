'use client';

/**
 * The claim page's form: attach a palette to a message after the fact.
 *
 * @license AGPL-3.0-or-later
 */

import { useState } from 'react';
import { HintPicker, type HintValue } from './hint-picker';
import { PaletteCollage } from './palette-collage';

export function ClaimForm({ token, existing }: { token: string; existing: boolean }) {
  const [hint, setHint] = useState<HintValue | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ colors: string[]; verified: boolean } | null>(
    existing ? null : null,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!hint || busy) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('image', hint.png, 'hint.png');
      form.set('palette', JSON.stringify(hint.palette));
      const res = await fetch(`/api/claim/${encodeURIComponent(token)}`, {
        method: 'POST',
        body: form,
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: boolean; error?: string; hint?: { colors: string[]; verified: boolean } | null }
        | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? 'Could not attach that.');
        return;
      }
      setDone({ colors: json.hint?.colors ?? hint.palette.colors, verified: json.hint?.verified ?? false });
      setHint(null);
    } catch {
      setError('Network problem.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="card p-6">
        <p className="pill pill-outline">attached</p>
        <h2 className="display-md mt-4">They can see your colours now.</h2>
        <div className="mt-5">
          <PaletteCollage colors={done.colors} footnote verified={done.verified} />
        </div>
        <p className="mt-4 leading-relaxed text-ink-soft">
          {done.verified
            ? 'We recomputed this on our server from the photo you sent, and it matched. The photo itself has been deleted.'
            : 'We could not match this palette to the photo you sent, so it is shown as unverified.'}
        </p>
        <button type="button" className="btn mt-5" onClick={() => setDone(null)}>
          Change my photo
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card p-6">
      <h2 className="display-md">{existing ? 'Change your hint' : 'Add your colours'}</h2>
      <p className="mt-2 leading-relaxed text-ink-soft">
        Pick a photo. We show the six colours it produces — never the photo itself.
      </p>

      <div className="mt-5">
        <HintPicker value={hint} onChange={setHint} />
      </div>

      {error && (
        <p role="alert" className="alert-error mt-4">
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary mt-5 w-full text-lg" disabled={!hint || busy}>
        {busy ? 'Working…' : 'Send my colours →'}
      </button>
    </form>
  );
}
