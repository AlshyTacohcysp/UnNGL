/**
 * POST /api/auth/verify — exchange a login code for a session cookie.
 *
 * @license AGPL-3.0-or-later
 */

import { NextResponse } from 'next/server';
import {
  consumeLoginCode,
  createSession,
  sessionCookieName,
  sessionCookieOptions,
} from '@/lib/auth';
import { clientIp, fail, ok, route, userAgent } from '@/lib/http';
import { config } from '@/lib/config';
import { hit } from '@/lib/ratelimit';
import { loginVerifySchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route('auth.verify', async (req: Request) => {
  const ip = await clientIp();
  const limit = await hit('login', `try:${ip}`, config.limits.loginAttemptsPerIpPer15Min * 3);
  if (!limit.ok) return fail('Too many attempts. Try again in a few minutes.', 429);

  const body = await req.json().catch(() => null);
  const parsed = loginVerifySchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid request');

  const result = await consumeLoginCode(parsed.data.email, parsed.data.code, 'login');
  if (result.status === 'locked') {
    return fail('That code has been used too many times. Ask for a new one.', 429);
  }
  if (result.status === 'invalid') {
    return fail('That code is not right, or it has expired.');
  }

  const token = await createSession(result.user.id, await userAgent());
  const res = ok({ user: { id: result.user.id, email: result.user.email } }) as NextResponse;
  res.cookies.set(sessionCookieName(), token, sessionCookieOptions());
  return res;
});
