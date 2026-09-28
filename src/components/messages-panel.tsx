'use client';

/**
 * The owner's view of an inbox: every message, and every hint in full.
 *
 * There is no reveal button. That is the entire point — the palette is rendered
 * the moment the page loads, and "verified" tells you the colours were
 * recomputed from the original photo rather than taken on trust.
 *
 * The mockup's inbox is a stack of quiet white cards. The one thing that is
 * allowed to be loud is the palette, so the palette gets the blobs and the
 * message text gets the serif, and everything else stays out of the way.
 *
 * @license AGPL-3.0-or-later
 */

import { useState, useTransition } from 'react';
import { PaletteBlobs } from './palette-strip';

export interface MessageView {
  id: string;
  body: string;
  createdAt: number;
  seen: boolean;
  hint: {
    id: string;
    colors: string[];
    primary: string;
    weight: number;
    verified: boolean;
    algorithm: string;
  } | null;
}

export function MessagesPanel({
  slug,
  title,
  messages: initial,
}: {
  slug: string;
  title: string;
  messages: MessageView[];
}) {
  const [messages, setMessages] = useState(initial);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const link =
    typeof window !== 'undefined' ? `${window.location.origin}/${slug}` : `/${slug}`;

  async function remove(id: string) {
    if (!window.confirm('Delete this message? It cannot be undone.')) return;
    setError(null);
    try {
      const res = await fetch(`/api/messages/${encodeURIComponent(slug)}?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const json = (await res.json().catch(() => null)) as { ok: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? 'Could not delete that message.');
        return;
      }
      setMessages((m) => m.filter((x) => x.id !== id));
    } catch {
      setError('Network problem.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* The share pill. Your link is the product, so it sits at the top,
          visible, one tap from being sent to someone. */}
      <div className="card flex flex-wrap items-center gap-3 p-4 sm:p-5">
        <div className="min-w-[12rem] flex-1">
          <p className="label">Your link</p>
          <p className="mt-1 truncate text-sm text-ink-soft">{link}</p>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() => {
            void navigator.clipboard?.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>

      {error && (
        <p role="alert" className="alert-error">
          {error}
        </p>
      )}

      {messages.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="serif-accent text-3xl text-ink">Nothing here yet.</p>
          <p className="mt-2 text-ink-soft">Share your link and see what turns up.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {messages.map((m) => (
            <li key={m.id}>
              <article className="card p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-2.5">
                  <time className="text-xs text-ink-faint" dateTime={new Date(m.createdAt).toISOString()}>
                    {formatWhen(m.createdAt)}
                  </time>
                  {!m.seen && (
                    <span className="pill pill-outline px-2.5 py-1 text-[0.7rem]">
                      <span className="block h-1.5 w-1.5 rounded-full bg-coral" />
                      New
                    </span>
                  )}
                </div>

                {/* The message, in the serif: a person wrote this. */}
                <p className="serif-body mt-3 text-xl leading-snug whitespace-pre-wrap break-words text-ink sm:text-[1.4rem]">
                  {m.body}
                </p>

                <div className="mt-5">
                  {m.hint ? (
                    <>
                      <PaletteBlobs colors={m.hint.colors} />
                      <p className="mt-3 text-sm text-ink-soft">
                        {m.hint.verified
                          ? 'Recomputed on our server from the original photo, and it matched. The photo itself was deleted.'
                          : 'This palette did not match the photo it was submitted with, so treat it with suspicion.'}
                      </p>
                    </>
                  ) : (
                    /* No hint. Dashed, because this is an absence — the
                       mockup draws it as an empty outline, not a card. */
                    <div className="card-dashed p-5 text-center">
                      <p className="text-sm text-ink-soft">
                        This one sent no colours.
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  {m.hint && (
                    <span className="pill pill-outline">
                      Do you recognise these colours?
                    </span>
                  )}
                  <button
                    type="button"
                    className="btn btn-sm btn-quiet ml-auto"
                    disabled={pending}
                    onClick={() => startTransition(() => void remove(m.id))}
                  >
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

export function formatWhen(ts: number): string {
  const d = new Date(ts);
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
