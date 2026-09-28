'use client';

/**
 * Email-first sign-in. A 6-digit code, no password, no OAuth-only path.
 *
 * @license AGPL-3.0-or-later
 */

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

interface Provider {
  id: string;
  label: string;
  configured: boolean;
  note?: string;
}

type Step = 'email' | 'code';

export function LoginForm({
  providers,
  redirectTo,
  devMode,
  notice,
  initialEmail,
  initialCode,
}: {
  providers: Provider[];
  redirectTo: string;
  devMode: boolean;
  notice?: string;
  /** Pre-filled from the ?email=…&code=… link in the login email. */
  initialEmail?: string;
  initialCode?: string;
}) {
  const [step, setStep] = useState<Step>(initialCode ? 'code' : 'email');
  const [email, setEmail] = useState(initialEmail ?? '');
  const [code, setCode] = useState(initialCode ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Clicking the link in the email signs you straight in.
  const autoVerified = useRef(false);
  useEffect(() => {
    if (!initialEmail || !initialCode || autoVerified.current) return;
    autoVerified.current = true;
    void verify(new Event('submit') as unknown as React.FormEvent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: boolean; error?: string; devCode?: string }
        | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? 'Could not send the code.');
        return;
      }
      if (json.devCode) setDevCode(json.devCode);
      setStep('code');
      setCooldown(45);
    } catch {
      setError('Network problem.');
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const json = (await res.json().catch(() => null)) as { ok: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? 'That code is not right.');
        return;
      }
      window.location.href = redirectTo;
    } catch {
      setError('Network problem.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      {notice && (
        <p className="card-flat border-[2.5px] border-ink bg-sun p-3 text-sm">{notice}</p>
      )}

      <div className="card p-6">
        <h1 className="display-md">
          {step === 'email' ? 'Sign in' : 'Check your email'}
        </h1>

        {step === 'email' ? (
          <form onSubmit={requestCode} className="mt-5 flex flex-col gap-4">
            <div>
              <label htmlFor="email" className="label">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                className="field text-lg"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="mt-2 text-sm text-ink-soft">
                No password to forget, nothing to phish. We send a 6-digit code.
              </p>
            </div>
            <button type="submit" className="btn btn-punch w-full text-lg" disabled={busy}>
              {busy ? 'Sending…' : 'Email me a code →'}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-5 flex flex-col gap-4">
            <p className="text-ink-soft">
              Code sent to <strong className="text-ink">{email}</strong>. It expires in 10 minutes.
            </p>
            {devCode && devMode && (
              <p className="border-[2.5px] border-ink bg-acid px-3 py-2 text-sm">
                No mail server configured — your code is{' '}
                <strong className="mono-chip">{devCode}</strong>
              </p>
            )}
            <div>
              <label htmlFor="code" className="label">
                6-digit code
              </label>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                className="field text-center text-3xl tracking-[0.4em]"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <button
              type="submit"
              className="btn btn-punch w-full text-lg"
              disabled={busy || code.length !== 6}
            >
              {busy ? 'Checking…' : 'Sign in →'}
            </button>
            <div className="flex justify-between text-sm">
              <button
                type="button"
                className="underline decoration-2 underline-offset-2"
                onClick={() => {
                  setStep('email');
                  setCode('');
                  setError(null);
                }}
              >
                Use a different email
              </button>
              <button
                type="button"
                className="underline decoration-2 underline-offset-2 disabled:opacity-40"
                disabled={cooldown > 0}
                onClick={() => void requestCode(new Event('submit') as unknown as React.FormEvent)}
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </button>
            </div>
          </form>
        )}

        {error && (
          <p role="alert" className="mt-4 border-[2.5px] border-ink bg-punch px-3 py-2 text-paper">
            {error}
          </p>
        )}
      </div>

      {providers.length > 0 && (
        <div className="card p-6">
          <p className="label">Or sign in with</p>
          <div className="mt-3 grid gap-2">
            {providers.map((p) => (
              <a
                key={p.id}
                href={`/api/auth/oauth/${p.id}?redirect=${encodeURIComponent(redirectTo)}`}
                className={`btn w-full justify-between ${p.configured ? '' : 'opacity-50'}`}
                aria-disabled={!p.configured}
                title={p.configured ? undefined : p.note ?? 'Not configured on this server'}
              >
                <span>{p.label}</span>
                <span className="mono-chip">{p.configured ? 'connect' : 'not set up'}</span>
              </a>
            ))}
          </div>
          {providers.some((p) => !p.configured) && (
            <p className="mt-3 text-sm text-ink-soft">
              OAuth keys come from the environment — see <code className="mono-chip">.env.example</code>.
              Email always works with no configuration.
            </p>
          )}
        </div>
      )}

      <p className="text-center text-sm text-ink-soft">
        <Link href="/" className="underline decoration-2 underline-offset-2">
          ← back to the start
        </Link>
      </p>
    </div>
  );
}
