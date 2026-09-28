'use client';

/**
 * The composer: the public face of an inbox link.
 *
 * Sends a message and, optionally, a colour hint. Everything happens in one
 * multipart POST so the photo and the message can't get out of sync.
 *
 * The mockup's order is deliberate and kept verbatim: what you're sending to,
 * then the prompt, then the hint, then the one button. Nothing is asked of the
 * sender before the message box.
 *
 * @license AGPL-3.0-or-later
 */

import { useRef, useState } from 'react';
import { HintPicker, type HintValue } from './hint-picker';

interface Props {
  slug: string;
  title: string;
  maxChars: number;
}

type Status = 'idle' | 'sending' | 'sent' | 'error';

export function Composer({ slug, title, maxChars }: Props) {
  const [body, setBody] = useState('');
  const [hint, setHint] = useState<HintValue | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [claimUrl, setClaimUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'sending') return;
    setError(null);

    if (!body.trim()) {
      setError('Write something first.');
      return;
    }

    setStatus('sending');
    try {
      const form = new FormData();
      form.set('body', body);
      form.set('website', ''); // honeypot: bots fill it in, people never see it
      if (hint) {
        form.set('image', hint.png, 'hint.png');
        form.set('palette', JSON.stringify(hint.palette));
      }
      const res = await fetch(`/api/messages?to=${encodeURIComponent(slug)}`, {
        method: 'POST',
        body: form,
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: boolean; error?: string; claimUrl?: string; hintAttached?: boolean }
        | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? 'That did not go through. Try again.');
        setStatus('error');
        return;
      }
      setClaimUrl(json.claimUrl ?? null);
      setBody('');
      setHint(null);
      setStatus('sent');
    } catch {
      setError('Network problem. Nothing was sent — try again.');
      setStatus('error');
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the URL is on screen and selectable */
    }
  }

  if (status === 'sent') {
    return (
      <div className="card p-6 sm:p-8">
        <span className="pill">
          <span className="block h-2 w-2 rounded-full bg-teal" />
          Sent
        </span>
        <h2 className="serif-accent mt-5 text-4xl text-ink">It’s through.</h2>
        <p className="mt-3 max-w-prose leading-relaxed text-ink-soft">
          {title} will see it as soon as they open their link.
        </p>

        {claimUrl && (
          <div className="card-sunk mt-6 p-4">
            <p className="label">Your private link</p>
            <p className="mt-2 break-all text-sm text-ink-soft">{claimUrl}</p>
            <p className="mt-2 text-sm text-ink-soft">
              Only you have this one. Use it to add or change your colours later — it reveals
              nothing on its own.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn btn-sm" onClick={() => void copy(claimUrl)}>
                {copied ? 'Copied' : 'Copy link'}
              </button>
              <a href={claimUrl} className="btn btn-sm btn-outline">
                Open it
              </a>
            </div>
          </div>
        )}

        <div className="mt-7 flex flex-wrap gap-3">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setStatus('idle');
              setClaimUrl(null);
            }}
          >
            Send another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={submit} className="card p-5 sm:p-8">
      {/* 1. who it's for */}
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-base font-bold text-white">
          {title.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="label">Sending to</p>
          <p className="truncate text-lg font-bold tracking-tight text-ink">{title}</p>
        </div>
      </div>

      {/* 2. the prompt, in the serif — this is the only voice on the page */}
      <label htmlFor="body" className="serif-accent mt-7 block text-3xl leading-tight text-ink sm:text-[2.1rem]">
        What would you like to tell them?
      </label>
      <p className="mt-1 text-sm text-ink-soft">Anonymous. No account, no name, no number.</p>

      {/* honeypot — hidden from people, tempting to bots */}
      <div aria-hidden className="absolute left-[-9999px] top-0 h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <textarea
        id="body"
        name="body"
        className="field field-serif mt-4 min-h-[9.5rem] resize-y"
        placeholder="say the thing…"
        value={body}
        maxLength={maxChars}
        onChange={(e) => setBody(e.target.value)}
      />
      <p className="mt-1.5 text-right text-xs text-ink-faint">
        {body.length} / {maxChars}
      </p>

      {/* 3. the hint */}
      <div className="mt-6">
        <HintPicker value={hint} onChange={setHint} />
      </div>

      {error && (
        <p role="alert" className="alert-error mt-5">
          {error}
        </p>
      )}

      {/* 4. the one button, with the coral slab under it */}
      <button
        type="submit"
        className="btn btn-primary mt-7 w-full text-lg"
        disabled={status === 'sending'}
      >
        {status === 'sending' ? 'Sending…' : 'Send anonymously'}
      </button>
    </form>
  );
}
