'use client';

/**
 * The owner's view of an inbox: every message, and every hint in full.
 *
 * There is no reveal button. That is the entire point — the palette is rendered
 * the moment the page loads, and "server-verified" tells you the colours were
 * recomputed from the original photo rather than taken on trust.
 *
 * @license AGPL-3.0-or-later
 */

import { useState, useTransition } from 'react';
import { PaletteCollage } from './palette-collage';

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
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="label">Your link</p>
          <p className="mono-chip break-all">{link}</p>
        </div>
        <button
          type="button"
          className="btn btn-sm"
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
        <p role="alert" className="border-[2.5px] border-ink bg-punch px-3 py-2 text-paper">
          {error}
        </p>
      )}

      {messages.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="display-md">Nothing here yet.</p>
          <p className="mt-2 text-ink-soft">Share your link and see what turns up.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-5">
          {messages.map((m, i) => (
            <li key={m.id}>
              <article className={`card p-5 ${i % 3 === 1 ? 'tilt-b' : i % 3 === 2 ? 'tilt-c' : ''}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <time
                    className="mono-chip text-ink-soft"
                    dateTime={new Date(m.createdAt).toISOString()}
                  >
                    {formatWhen(m.createdAt)}
                  </time>
                  {!m.seen && <span className="stamp bg-punch! text-paper!">new</span>}
                </div>

                <p className="serif-accent mt-3 whitespace-pre-wrap break-words text-xl leading-snug sm:text-2xl">
                  {m.body}
                </p>

                <div className="mt-5 border-t-[2.5px] border-ink pt-4">
                  {m.hint ? (
                    <>
                      <p className="label">Their palette</p>
                      <PaletteCollage
                        colors={m.hint.colors}
                        footnote
                        algorithm={m.hint.algorithm}
                        verified={m.hint.verified}
                      />
                      <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink-soft">
                        {m.hint.verified
                          ? 'Recomputed on our server from the original photo, and it matched. The photo itself was deleted.'
                          : 'This palette did not match the photo it was submitted with, so treat it with suspicion.'}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-ink-soft">
                      No hint attached — this one stayed anonymous.
                    </p>
                  )}
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    className="btn btn-sm"
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
