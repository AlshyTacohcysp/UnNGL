'use client';

/**
 * Account settings: name, avatar (with live palette preview), email, danger zone.
 *
 * @license AGPL-3.0-or-later
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { HintPicker, type HintValue } from './hint-picker';
import { PaletteCollage } from './palette-collage';

interface Palette {
  colors: string[];
  primary: string;
  weight: number;
  hash?: string;
}

export function SettingsForm({
  initialDisplayName,
  email,
  verified,
  palette,
  inboxCount,
}: {
  initialDisplayName: string | null;
  email: string | null;
  verified: boolean;
  palette: Palette | null;
  inboxCount: number;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName ?? '');
  const [hint, setHint] = useState<HintValue | null>(null);
  const [livePalette, setLivePalette] = useState<Palette | null>(palette);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState('');
  const [code, setCode] = useState('');
  const [emailStep, setEmailStep] = useState<'idle' | 'sent'>('idle');

  function flash(message: string) {
    setSaved(message);
    setTimeout(() => setSaved(null), 2500);
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: displayName.trim() }),
      });
      const json = (await res.json().catch(() => null)) as { ok: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? 'Could not save that name.');
        return;
      }
      flash('Name saved');
      router.refresh();
    } catch {
      setError('Network problem.');
    } finally {
      setBusy(false);
    }
  }

  async function saveAvatar(e: React.FormEvent) {
    e.preventDefault();
    if (!hint) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('image', hint.png, 'avatar.png');
      const res = await fetch('/api/avatar', { method: 'POST', body: form });
      const json = (await res.json().catch(() => null)) as
        | { ok: boolean; error?: string; palette?: Palette }
        | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? 'Could not save that photo.');
        return;
      }
      setLivePalette(json.palette ?? null);
      setHint(null);
      flash('Avatar saved');
      router.refresh();
    } catch {
      setError('Network problem.');
    } finally {
      setBusy(false);
    }
  }

  async function removeAvatar() {
    if (!window.confirm('Remove your avatar?')) return;
    setBusy(true);
    await fetch('/api/avatar', { method: 'DELETE' });
    setLivePalette(null);
    setBusy(false);
    flash('Avatar removed');
    router.refresh();
  }

  async function sendEmailCode() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/account/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: newEmail }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: boolean; error?: string; devCode?: string }
        | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? 'Could not send a code.');
        return;
      }
      if (json.devCode) setCode(json.devCode);
      setEmailStep('sent');
    } catch {
      setError('Network problem.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmEmail() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/account/email', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: newEmail, code }),
      });
      const json = (await res.json().catch(() => null)) as { ok: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? 'That code is not right.');
        return;
      }
      setEmailStep('idle');
      setNewEmail('');
      setCode('');
      flash('Email added');
      router.refresh();
    } catch {
      setError('Network problem.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    const typed = window.prompt(
      'This deletes your account, every inbox and every message. Type DELETE to confirm.',
    );
    if (typed !== 'DELETE') return;
    setBusy(true);
    try {
      await fetch('/api/account', { method: 'DELETE' });
      window.location.href = '/';
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* ---------------- name ---------------- */}
      <section className="card p-5">
        <h2 className="text-xl">Name</h2>
        <form onSubmit={saveName} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[12rem] flex-1">
            <label htmlFor="displayName" className="label">
              What should we call you?
            </label>
            <input
              id="displayName"
              className="field"
              value={displayName}
              maxLength={60}
              placeholder="your name"
              onChange={(e) => {
                void setDisplayName(e.target.value);
              }}
            />
          </div>
          <button type="submit" className="btn btn-sm" disabled={busy || !displayName.trim()}>
            Save
          </button>
        </form>
      </section>

      {/* ---------------- avatar ---------------- */}
      <section className="card p-5">
        <h2 className="text-xl">Your colours</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Your avatar is only ever shown as a palette. The photo is stored so you can change
          it, and is never displayed.
        </p>

        {livePalette && !hint && (
          <div className="mt-4 max-w-md">
            <PaletteCollage colors={livePalette.colors} footnote verified />
          </div>
        )}

        <div className="mt-4">
          <HintPicker
            value={hint}
            onChange={setHint}
            label={livePalette ? 'Replace your photo' : 'Add a photo'}
            idPrefix="avatar"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {hint && (
            <button type="button" className="btn btn-sm btn-outline" disabled={busy} onClick={saveAvatar}>
              {busy ? 'Saving…' : 'Save this palette'}
            </button>
          )}
          {livePalette && (
            <button type="button" className="btn btn-sm" disabled={busy} onClick={removeAvatar}>
              Remove
            </button>
          )}
        </div>
      </section>

      {/* ---------------- email ---------------- */}
      <section className="card p-5">
        <h2 className="text-xl">Email</h2>
        {email ? (
          <p className="mt-3 flex flex-wrap items-center gap-2">
            <span className="font-semibold">{email}</span>
            <span className={`pill pill-outline ${verified ? 'bg-amber!' : 'bg-amber!'}`}>
              {verified ? 'verified' : 'unverified'}
            </span>
          </p>
        ) : (
          <p className="mt-3 text-ink-soft">
            You signed in with an OAuth provider and have not added an email. Without one you
            cannot sign in with a code, and you will not get message notifications.
          </p>
        )}

        {emailStep === 'idle' ? (
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1">
              <label htmlFor="new-email" className="label">
                {email ? 'Change to' : 'Add an email'}
              </label>
              <input
                id="new-email"
                type="email"
                className="field"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy || !newEmail.includes('@')}
              onClick={sendEmailCode}
            >
              Send a code
            </button>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <div className="min-w-[10rem] flex-1">
              <label htmlFor="email-code" className="label">
                Code sent to {newEmail}
              </label>
              <input
                id="email-code"
                className="field"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
              />
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              disabled={busy || code.length !== 6}
              onClick={confirmEmail}
            >
              Confirm
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setEmailStep('idle')}>
              Cancel
            </button>
          </div>
        )}
      </section>

      {/* ---------------- danger ---------------- */}
      <section
        className="rounded-3xl p-5"
        style={{ background: 'color-mix(in oklab, var(--color-coral) 12%, var(--color-surface))' }}
      >
        <h2 className="text-xl">Delete this account</h2>
        <p className="mt-2 text-ink-soft">
          {inboxCount} inbox{inboxCount === 1 ? '' : 'es'}, every message in them, your stored
          photos and your sessions. Gone immediately, with no copy anywhere else.
        </p>
        <button type="button" className="btn btn-sm btn-danger mt-4" disabled={busy} onClick={deleteAccount}>
          Delete my account
        </button>
      </section>

      {saved && <p className="font-mono text-[0.68rem]">{saved}</p>}
      {error && (
        <p role="alert" className="border-0 bg-coral px-3 py-2 text-white">
          {error}
        </p>
      )}
    </div>
  );
}
