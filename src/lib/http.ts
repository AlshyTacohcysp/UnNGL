/**
 * Small HTTP helpers shared by every route: consistent JSON envelopes, client
 * IP extraction (hashed, never stored raw), and a uniform error shape.
 *
 * @license AGPL-3.0-or-later
 */

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { hashIp } from './crypto';
import { config } from './config';

export function json<T>(data: T, init?: number | ResponseInit): NextResponse {
  const res = NextResponse.json(data as object, typeof init === 'number' ? { status: init } : init);
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export function ok<T>(data: T = {} as T, status = 200): NextResponse {
  return json({ ok: true, ...data }, status);
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>): NextResponse {
  return json({ ok: false, error: message, ...extra }, { status });
}

/**
 * Client identity for rate limiting, hashed immediately — the raw address is
 * never returned, stored or logged.
 *
 * The forwarded headers are only consulted when `TRUSTED_PROXY=1`. That
 * default matters: if the app is reachable directly, a client can put any
 * string it likes in `X-Forwarded-For` and mint a fresh rate-limit bucket on
 * every request, which is exactly what the limits exist to stop. Next.js does
 * not expose the socket address, so with no trusted proxy we cannot identify
 * the client at all — and we deliberately fail *closed* by putting everyone in
 * one shared bucket rather than open.
 */
export async function clientIp(): Promise<string> {
  if (!config.trustProxy) return hashIp('untrusted-proxy');
  const h = await headers();
  const candidates = [
    h.get('cf-connecting-ip'),
    h.get('x-real-ip'),
    h.get('x-vercel-forwarded-for')?.split(',')[0]?.trim(),
    h.get('x-forwarded-for')?.split(',')[0]?.trim(),
  ];
  for (const c of candidates) {
    if (c && isPlausibleIp(c)) return hashIp(c);
  }
  return hashIp('unknown');
}

/** Reject obviously forged header values (anything that isn't an IP literal). */
function isPlausibleIp(value: string): boolean {
  const v = value.trim();
  if (v.length > 45) return false;
  return /^[0-9a-f:.]+$/i.test(v) && /[0-9]/.test(v);
}

/**
 * Same-origin check for state-changing requests.
 *
 * The session cookie is SameSite=Lax, which already stops a cross-site POST
 * from carrying it. This is the belt to that braces: a mutating request whose
 * Origin is present and is not us is refused outright, which also closes the
 * gap if the app is ever embedded or proxied in a way that weakens SameSite.
 */
export async function isSameOrigin(req: Request): Promise<boolean> {
  const origin = req.headers.get('origin');
  // Non-browser clients (curl, native apps) send no Origin; SameSite already
  // protects those, and requiring one would break every scripted integration.
  if (!origin) return true;
  const host = req.headers.get('host');
  if (!host) return false;
  try {
    const o = new URL(origin);
    return o.protocol === 'https:' || o.protocol === 'http:'
      ? o.host === host
      : false;
  } catch {
    return false;
  }
}

export async function userAgent(): Promise<string> {
  const h = await headers();
  return (h.get('user-agent') ?? '').slice(0, 200);
}

/** Wrap a route handler: origin check on mutations, uniform errors. */
export function route<T extends unknown[], R extends Response>(
  name: string,
  fn: (...args: T) => Promise<R> | R,
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    try {
      // Every state-changing request must be same-origin. Enforcing it here
      // rather than per handler means a new route cannot forget to.
      const first = args[0];
      if (first instanceof Request && !SAFE_METHODS.has(first.method)) {
        if (!(await isSameOrigin(first))) {
          return fail('Cross-origin request refused.', 403) as unknown as R;
        }
      }
      return await fn(...args);
    } catch (err) {
      console.error(`[${name}]`, err);
      return fail('Something went wrong on our side. Nothing you sent was lost.', 500) as unknown as R;
    }
  };
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
