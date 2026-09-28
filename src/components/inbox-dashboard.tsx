'use client';

/**
 * The inbox dashboard: every link you own, in one place.
 *
 * @license AGPL-3.0-or-later
 */

import Link from 'next/link';
import { useState } from 'react';
import { formatWhen } from './messages-panel';

export interface InboxSummary {
  slug: string;
  handle: string | null;
  title: string;
  createdAt: number;
  lastMessageAt: number | null;
  total: number;
  unread: number;
  lastBody: string | null;
}

export function InboxDashboard({ inboxes }: { inboxes: InboxSummary[] }) {
  const [items, setItems] = useState(inboxes);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/inboxes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: title.trim() || 'My messages' }),
      });
      const json = (await res.json().catch(() => null)) as
        | {
            ok: boolean;
            error?: string;
            inbox?: { slug: string; handle: string | null; title: string; url: string };
          }
        | null;
      if (!res.ok || !json?.ok || !json.inbox) {
        setError(json?.error ?? 'Could not create an inbox.');
        return;
      }
      setItems((list) => [
        {
          slug: json.inbox!.slug,
          handle: json.inbox!.handle ?? null,
          title: json.inbox!.title,
          createdAt: Date.now(),
          lastMessageAt: null,
          total: 0,
          unread: 0,
          lastBody: null,
        },
        ...list,
      ]);
      setTitle('');
    } catch {
      setError('Network problem.');
    } finally {
      setBusy(false);
    }
  }

  async function rotate(slug: string) {
    if (!window.confirm('Rotate this link? The old link stops working immediately.')) return;
    setError(null);
    const res = await fetch(`/api/inboxes/${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rotate: true }),
    });
    const json = (await res.json().catch(() => null)) as
      | { ok: boolean; error?: string; inbox?: { slug: string } }
      | null;
    if (!res.ok || !json?.ok || !json.inbox) {
      setError(json?.error ?? 'Could not rotate that link.');
      return;
    }
    setItems((list) => list.map((i) => (i.slug === slug ? { ...i, slug: json.inbox!.slug } : i)));
  }

  async function remove(slug: string) {
    if (!window.confirm('Delete this inbox and every message in it? This cannot be undone.')) return;
    setError(null);
    const res = await fetch(`/api/inboxes/${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ delete: true }),
    });
    if (!res.ok) {
      setError('Could not delete that inbox.');
      return;
    }
    setItems((list) => list.filter((i) => i.slug !== slug));
  }

  // A named inbox is shared as its name; an unnamed one keeps its code.
  // Both resolve, so a link copied here works either way.
  const linkFor = (slug: string, handle: string | null) =>
    typeof window !== 'undefined'
      ? `${window.location.origin}/${handle ?? slug}`
      : `/${handle ?? slug}`;

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={create} className="card flex flex-wrap items-end gap-3 p-5">
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="new-inbox" className="label">
            Name this inbox
          </label>
          <input
            id="new-inbox"
            className="field"
            placeholder="e.g. my page"
            value={title}
            maxLength={60}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Making…' : 'Create a link'}
        </button>
      </form>

      {error && (
        <p role="alert" className="alert-error">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="display-md">No inboxes yet.</p>
          <p className="mt-2 text-ink-soft">Make one above and share the link.</p>
        </div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2">
          {items.map((inbox) => (
            <li key={inbox.slug}>
              <article className="card flex h-full flex-col p-5">
                <div className="flex items-start gap-3">
                  <h2 className="flex-1 text-2xl">{inbox.title}</h2>
                  {inbox.unread > 0 && (
                    <span className="pill bg-coral px-2.5 py-1 text-xs font-bold text-white">
                      {inbox.unread}
                    </span>
                  )}
                </div>

                <p className="mt-1 text-sm text-ink-soft">
                  {inbox.handle ? (
                    <span className="font-semibold text-ink">unngl.link/{inbox.handle}</span>
                  ) : (
                    <span className="font-mono text-[0.68rem]">unngl.link/{inbox.slug}</span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-ink-faint">
                  {inbox.total} message{inbox.total === 1 ? '' : 's'}
                  {inbox.lastMessageAt ? ` · last ${formatWhen(inbox.lastMessageAt)}` : ''}
                </p>

                {inbox.lastBody && (
                  <p className="serif-accent mt-3 line-clamp-2 text-lg leading-snug">
                    “{inbox.lastBody}”
                  </p>
                )}

                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  <Link href={`/i/${inbox.handle ?? inbox.slug}`} className="btn btn-sm btn-outline">
                    Open
                  </Link>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      void navigator.clipboard?.writeText(linkFor(inbox.slug, inbox.handle));
                      setCopied(inbox.slug);
                      setTimeout(() => setCopied(null), 1800);
                    }}
                  >
                    {copied === inbox.slug ? 'Copied' : 'Copy link'}
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => void rotate(inbox.slug)}>
                    Rotate
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => void remove(inbox.slug)}>
                    Delete
                  </button>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
