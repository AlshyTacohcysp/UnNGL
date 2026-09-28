'use client';

/**
 * Per-inbox settings: pick a handle, rename, email notifications, rotate or
 * delete.
 *
 * The handle field is the one that talks back. It checks as you type, because
 * the expensive failure here is not "your name is invalid" — it is picking
 * `amina.k`, telling everyone your link is now that, and discovering a week
 * later that it was taken.
 *
 * @license AGPL-3.0-or-later
 */

import { useEffect, useRef, useState } from 'react';
import { handleHint, normalizeHandle, validateHandle } from '@/lib/handle';

export function InboxSettings({
  slug,
  inboxId,
  handle: initialHandle,
  title: initialTitle,
  notify: initialNotify,
}: {
  slug: string;
  inboxId: string;
  handle: string | null;
  title: string;
  notify: boolean;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [notify, setNotify] = useState(initialNotify);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [handle, setHandle] = useState(initialHandle ?? '');
  const [availability, setAvailability] = useState<
    { state: 'idle' } | { state: 'checking' } | { state: 'free'; handle: string } | { state: 'taken' | 'invalid'; message: string }
  >({ state: 'idle' });

  // The availability request is debounced and, crucially, abandoned when a
  // newer keystroke supersedes it. Without the guard, a slow answer for
  // "ami" can land after a fast one for "amina.k" and paint the wrong verdict
  // onto a name that is perfectly fine.
  const checkSeq = useRef(0);

  useEffect(() => {
    const value = normalizeHandle(handle);
    const seq = ++checkSeq.current;

    const local = validateHandle(value);
    if (!local.ok) {
      setAvailability(
        local.problem === 'empty' || local.problem === 'too-short'
          ? { state: 'idle' }
          : { state: 'invalid', message: local.message ?? 'That name will not work.' },
      );
      return;
    }
    if (local.handle === initialHandle) {
      setAvailability({ state: 'idle' });
      return;
    }

    setAvailability({ state: 'checking' });
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/handles/check?handle=${encodeURIComponent(local.handle!)}`,
          { cache: 'no-store' },
        );
        const json = (await res.json().catch(() => null)) as
          | { available?: boolean; message?: string }
          | null;
        if (seq !== checkSeq.current) return; // superseded
        if (json?.available) setAvailability({ state: 'free', handle: local.handle! });
        else if (json?.message) setAvailability({ state: 'invalid', message: json.message });
        else setAvailability({ state: 'taken', message: 'Someone already has that name.' });
      } catch {
        if (seq !== checkSeq.current) return;
        // A failed check is not a refusal: say nothing and let the submit
        // be the authority.
        setAvailability({ state: 'idle' });
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [handle, initialHandle]);

  async function patch(body: Record<string, unknown>, successMessage: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/inboxes/${encodeURIComponent(slug)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as { ok: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? 'Could not save that.');
        return false;
      }
      setSaved(successMessage);
      setTimeout(() => setSaved(null), 2500);
      return true;
    } catch {
      setError('Network problem.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function claim() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/handles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ inboxId, handle }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: boolean; error?: string; inbox?: { handle: string } }
        | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? 'Could not claim that name.');
        return;
      }
      setHandle(json.inbox?.handle ?? handle);
      setAvailability({ state: 'idle' });
      setSaved(
        json.inbox?.handle
          ? `Your link is now /${json.inbox.handle}`
          : 'Name saved',
      );
      setTimeout(() => setSaved(null), 4000);
    } catch {
      setError('Network problem.');
    } finally {
      setBusy(false);
    }
  }

  const dirty = normalizeHandle(handle) !== (initialHandle ?? '');
  const canClaim = dirty && availability.state !== 'checking' && availability.state !== 'taken';

  return (
    <section className="card p-5 sm:p-6">
      <h2 className="text-xl">Settings</h2>

      <div className="mt-5 flex flex-col gap-5">
        {/* ---------------- the handle ---------------- */}
        <div>
          <label htmlFor="inbox-handle" className="field-label">
            Your link
          </label>
          <div className="flex items-center gap-1 rounded-full bg-surface-sunk px-4 py-2.5">
            <span className="text-sm text-ink-faint">unngl.link/</span>
            <input
              id="inbox-handle"
              className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none"
              placeholder="amina.k"
              value={handle}
              maxLength={24}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => setHandle(e.target.value)}
              aria-describedby="inbox-handle-status"
            />
            <span aria-live="polite" className="shrink-0 text-sm">
              {availability.state === 'checking' && <span className="text-ink-faint">…</span>}
              {availability.state === 'free' && <span className="text-teal">free</span>}
              {availability.state === 'taken' && <span className="text-coral">taken</span>}
              {availability.state === 'invalid' && <span className="text-coral">no</span>}
            </span>
          </div>

          <p id="inbox-handle-status" className="mt-2 text-sm text-ink-soft">
            {availability.state === 'invalid' || availability.state === 'taken'
              ? availability.message
              : handleHint(handle)}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-sm btn-outline"
              disabled={busy || !canClaim}
              onClick={() => void claim()}
            >
              {initialHandle ? 'Change my name' : 'Claim this name'}
            </button>
            <p className="text-xs text-ink-faint">
              {initialHandle
                ? 'Links with your old name keep working.'
                : 'Optional. Without one, your link stays a random code.'}
            </p>
          </div>
        </div>

        {/* ---------------- the title ---------------- */}
        <div>
          <label htmlFor="inbox-title" className="field-label">
            Name
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="inbox-title"
              className="field min-w-[12rem] flex-1"
              value={title}
              maxLength={60}
              onChange={(e) => setTitle(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy || !title.trim() || title === initialTitle}
              onClick={() => void patch({ title: title.trim() }, 'Name saved')}
            >
              Save
            </button>
          </div>
        </div>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={notify}
            onChange={(e) => void patch({ notify: e.target.checked }, 'Notification setting saved')}
            className="mt-1 h-5 w-5 accent-[#2ec4a6]"
          />
          <span>
            Email me when a message arrives
            <span className="block text-sm text-ink-soft">
              Needs a verified address and a working mail server. No marketing, ever.
            </span>
          </span>
        </label>

        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm('Rotate this link? The old one dies immediately.')) return;
              const done = await patch({ rotate: true }, 'Link rotated');
              if (done) window.location.reload();
            }}
          >
            Rotate link
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm('Delete this inbox and every message in it? Forever.')) return;
              const done = await patch({ delete: true }, 'Deleted');
              if (done) window.location.href = '/inbox';
            }}
          >
            Delete inbox
          </button>
        </div>
      </div>

      {saved && <p className="mt-3 text-sm text-ink-soft">{saved}</p>}
      {error && (
        <p role="alert" className="alert-error mt-3">
          {error}
        </p>
      )}
    </section>
  );
}
