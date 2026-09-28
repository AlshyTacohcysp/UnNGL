'use client';

/**
 * Per-inbox settings: rename, email notifications, rotate or delete.
 *
 * @license AGPL-3.0-or-later
 */

import { useState } from 'react';

export function InboxSettings({
  slug,
  title: initialTitle,
  notify: initialNotify,
}: {
  slug: string;
  title: string;
  notify: boolean;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [notify, setNotify] = useState(initialNotify);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  return (
    <section className="card p-5">
      <h2 className="text-xl">Settings</h2>

      <div className="mt-4 flex flex-col gap-4">
        <div>
          <label htmlFor="inbox-title" className="label">
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

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={notify}
            onChange={(e) => void patch({ notify: e.target.checked }, 'Notification setting saved')}
            className="h-5 w-5 accent-[#ff4a1c]"
          />
          <span>
            Email me when a message arrives
            <span className="block text-sm text-ink-soft">
              Needs a verified address and a working mail server. No marketing, ever.
            </span>
          </span>
        </label>

        <div className="flex flex-wrap gap-2 border-t-[2.5px] border-ink pt-4">
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

      {saved && <p className="font-mono text-[0.68rem] mt-3 text-ink-soft">{saved}</p>}
      {error && (
        <p role="alert" className="mt-3 border-0 bg-coral px-3 py-2 text-white">
          {error}
        </p>
      )}
    </section>
  );
}
