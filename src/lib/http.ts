/**
 * Small HTTP helpers shared by every route: consistent JSON envelopes, client
 * IP extraction (hashed, never stored raw), and a uniform error shape.
 *
 * @license AGPL-3.0-or-later
 */

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { hashIp } from './crypto';

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
 * Best-effort client IP. On Vercel and Cloudflare this comes from a
 * platform-set header; behind a plain reverse proxy it falls back to the
 * socket address. Whatever we get is hashed immediately by the caller.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const candidates = [
    h.get('cf-connecting-ip'),
    h.get('x-real-ip'),
    h.get('x-vercel-forwarded-for')?.split(',')[0]?.trim(),
    h.get('x-forwarded-for')?.split(',')[0]?.trim(),
  ];
  for (const c of candidates) {
    if (c) return hashIp(c);
  }
  return hashIp('unknown');
}

export async function userAgent(): Promise<string> {
  const h = await headers();
  return (h.get('user-agent') ?? '').slice(0, 200);
}

/** Wrap a route handler so an unexpected throw becomes a 500, not a stack trace. */
export function route<T extends unknown[], R extends Response>(
  name: string,
  fn: (...args: T) => Promise<R> | R,
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (err) {
      console.error(`[${name}]`, err);
      return fail('Something went wrong on our side. Nothing you sent was lost.', 500) as unknown as R;
    }
  };
}
