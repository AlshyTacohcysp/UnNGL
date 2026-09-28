'use client';

/**
 * The composer: the public face of an inbox link.
 *
 * Sends a message and, optionally, a colour hint. Everything happens in one
 * multipart POST so the photo and the message can't get out of sync.
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

  if (status === 'sent') {
    return (
      <div className="card p-6">
        <p className="stamp">sent</p>
        <h2 className="display-md mt-4">It’s through.</h2>
        <p className="mt-3 max-w-prose leading-relaxed">
          They’ll see it as soon as they open their link
          {claimUrl
            ? '. If you forgot to attach a hint, you can still add one using the private link below — only you have it.'
            : '.'}
        </p>

        {claimUrl && (
          <div className="mt-5 border-[2.5px] border-ink bg-paper-2 p-4">
            <p className="label">Your private claim link</p>
            <p className="mono-chip break-all">{claimUrl}</p>
            <p className="mt-2 text-sm text-ink-soft">
              Keep it if you want to change or add your palette later. It reveals
              nothing on its own.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void navigator.clipboard?.writeText(claimUrl)}
              >
                Copy link
              </button>
              <a href={claimUrl} className="btn btn-sm btn-acid">
                Open it
              </a>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            className="btn"
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
    <form ref={formRef} onSubmit={submit} className="card p-5 sm:p-6">
      <h2 className="display-md">Leave {title} a message</h2>
      <p className="mt-2 text-ink-soft">Anonymous. No account, no name, no number.</p>

      {/* honeypot — hidden from people, tempting to bots */}
      <div aria-hidden className="absolute left-[-9999px] top-0 h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="mt-5">
        <label htmlFor="body" className="label">
          Message
        </label>
        <textarea
          id="body"
          name="body"
          className="field min-h-[9rem] resize-y text-lg"
          placeholder="say the thing…"
          value={body}
          maxLength={maxChars}
          onChange={(e) => setBody(e.target.value)}
        />
        <p className="mono-chip mt-1 text-right text-ink-soft">
          {body.length} / {maxChars}
        </p>
      </div>

      <div className="mt-4 border-t-[2.5px] border-ink pt-4">
        <HintPicker value={hint} onChange={setHint} />
      </div>

      {error && (
        <p role="alert" className="mt-4 border-[2.5px] border-ink bg-punch px-3 py-2 text-paper">
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-punch mt-5 w-full text-lg" disabled={status === 'sending'}>
        {status === 'sending' ? 'Sending…' : 'Send anonymously →'}
      </button>

      <p className="mt-3 text-center text-sm text-ink-soft">
        Nothing here is for sale. Attach a photo only if you want your colours shown.
      </p>
    </form>
  );
}
