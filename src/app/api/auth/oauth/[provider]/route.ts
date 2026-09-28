/**
 * GET /api/auth/oauth/[provider] — start an OAuth flow.
 *
 * @license AGPL-3.0-or-later
 */

import { NextResponse } from 'next/server';
import { randomToken } from '@/lib/crypto';
import { safeRedirectPath } from '@/lib/redirect';
import { authorizeUrl, getProvider } from '@/lib/oauth';
import { fail, route } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'unngl_oauth';

export const GET = route('oauth.start', async (req: Request, ctx: { params: Promise<{ provider: string }> }) => {
  const { provider: providerId } = await ctx.params;
  const provider = getProvider(providerId);
  if (!provider) return fail('Unknown sign-in provider', 404);
  if (!provider.clientId || !provider.clientSecret) {
    return fail(`${provider.label} sign-in is not configured on this server.`, 501);
  }

  const url = new URL(req.url);
  const redirectTo = safeRedirectPath(url.searchParams.get('redirect'));
  const state = randomToken(16);
  const target = authorizeUrl(provider, state, redirectTo);

  const res = NextResponse.redirect(target, 302);
  res.cookies.set(
    STATE_COOKIE,
    `${state}:${Buffer.from(redirectTo).toString('base64url')}`,
    { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 600 },
  );
  return res;
});

