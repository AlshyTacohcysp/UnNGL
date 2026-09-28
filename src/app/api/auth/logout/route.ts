/**
 * POST /api/auth/logout
 *
 * @license AGPL-3.0-or-later
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { destroySession, sessionCookieName } from '@/lib/auth';
import { ok, route } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route('auth.logout', async () => {
  const store = await cookies();
  const token = store.get(sessionCookieName())?.value;
  destroySession(token);
  const res = ok() as NextResponse;
  res.cookies.set(sessionCookieName(), '', { path: '/', maxAge: 0 });
  return res;
});
