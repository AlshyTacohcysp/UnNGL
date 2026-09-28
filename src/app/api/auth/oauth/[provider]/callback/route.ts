/**
 * GET /api/auth/oauth/[provider]/callback — finish an OAuth flow.
 *
 * Account linking rules:
 *  1. If this (provider, id) is already linked, sign in as that user.
 *  2. Else if the provider gave us a *verified* email that matches an existing
 *     account, link and sign in (this is what makes email and OAuth the same
 *     account rather than two half-accounts).
 *  3. Else create a new user.
 *  4. If the person is already signed in, link the provider to the current user
 *     instead of creating a second one.
 *
 * @license AGPL-3.0-or-later
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  addEmailToUser,
  createOAuthUser,
  createSession,
  currentUserId,
  findUserByEmail,
  findUserByOAuth,
  linkOAuthAccount,
  sessionCookieName,
  sessionCookieOptions,
  upsertUserByEmail,
} from '@/lib/auth';
import { exchangeCode, getProvider } from '@/lib/oauth';
import { fail, route, userAgent } from '@/lib/http';
import { safeRedirectPath } from '@/lib/redirect';
import { maybeFetchAndStoreAvatar } from '@/lib/avatar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'unngl_oauth';

export const GET = route(
  'oauth.callback',
  async (req: Request, ctx: { params: Promise<{ provider: string }> }) => {
    const { provider: providerId } = await ctx.params;
    const provider = getProvider(providerId);
    if (!provider) return fail('Unknown sign-in provider', 404);

    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const store = await cookies();
    const saved = store.get(STATE_COOKIE)?.value ?? '';
    const [savedState, savedRedirect] = saved.split(':');
    const redirectTo = safeRedirectPath(savedRedirect ? Buffer.from(savedRedirect, 'base64url').toString() : null);

    const cookieError = (message: string) => {
      const res = NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, url.origin), 302);
      res.cookies.set(STATE_COOKIE, '', { path: '/', maxAge: 0 });
      return res;
    };

    if (!code || !state || !savedState || state !== savedState) {
      return cookieError('That sign-in attempt expired. Please try again.');
    }

    let accessToken: string;
    let profile: Awaited<ReturnType<typeof provider.fetchProfile>>;
    try {
      accessToken = await exchangeCode(provider, code);
      profile = await provider.fetchProfile(accessToken);
    } catch (err) {
      console.error('[oauth] exchange failed', err);
      return cookieError('Sign-in failed at the provider. Please try again.');
    }

    const current = await currentUserId();
    let userId: string | null = current;

    if (!userId) {
      const linked = await findUserByOAuth(provider.id, profile.providerUserId);
      if (linked) {
        userId = linked.id;
      } else if (profile.email && profile.emailVerified) {
        userId = (await upsertUserByEmail(profile.email, profile.displayName)).id;
      } else {
        userId = (await createOAuthUser(profile.displayName)).id;
      }
    }

    await linkOAuthAccount(userId, provider.id, profile.providerUserId, profile.username);

    // Adopt a verified email that the account is missing.
    if (profile.email && profile.emailVerified) {
      const user = await findUserByEmail(profile.email);
      if (!user || user.id === userId) {
        try {
          await addEmailToUser(userId, profile.email);
        } catch {
          /* email already owned by a different account: leave it alone */
        }
      }
    }

    // A profile picture is a nice default avatar — the same palette hint, from
    // the same algorithm, as any other photo.
    if (profile.avatarUrl) {
      await maybeFetchAndStoreAvatar(userId, profile.avatarUrl);
    }

    const token = await createSession(userId, await userAgent());
    const res = NextResponse.redirect(new URL(redirectTo, url.origin), 302);
    res.cookies.set(sessionCookieName(), token, sessionCookieOptions());
    res.cookies.set(STATE_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  },
);
