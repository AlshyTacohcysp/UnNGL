/**
 * OAuth 2.0 / OIDC providers.
 *
 * One generic implementation drives every provider: build the authorize URL,
 * exchange the code, fetch the profile, normalise it. Adding a provider is a
 * table entry, not new code.
 *
 * On Instagram: Meta retired the Instagram Basic Display API in December 2024,
 * so "sign in with Instagram and read the profile" is no longer available to a
 * normal app. What remains is Facebook Login, which can carry an Instagram
 * username. UnNGL therefore offers `facebook` as the real OAuth flow and keeps
 * an `instagram` entry that stores a handle and the photo you attach yourself —
 * which is all the palette hint actually needs.
 *
 * @license AGPL-3.0-or-later
 */

import { config } from './config';

export interface OAuthProfile {
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
}

export interface OAuthProviderDef {
  id: string;
  label: string;
  /** Shown in the UI; explains itself when a provider needs extra setup. */
  note?: string;
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  extraAuthParams?: Record<string, string>;
  fetchProfile: (accessToken: string) => Promise<OAuthProfile>;
}

const getJson = async (url: string, init?: RequestInit) => {
  const res = await fetch(url, {
    ...init,
    headers: { accept: 'application/json', 'user-agent': 'UnNGL/0.1', ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`provider replied ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
};

const google: OAuthProviderDef = {
  id: 'google',
  label: 'Google',
  clientId: config.oauth.google.clientId,
  clientSecret: config.oauth.google.clientSecret,
  authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  scope: 'openid email profile',
  extraAuthParams: { access_type: 'online', prompt: 'select_account' },
  async fetchProfile(token) {
    const info = await getJson('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { authorization: `Bearer ${token}` },
    });
    return {
      providerUserId: String(info.sub),
      email: typeof info.email === 'string' ? info.email : null,
      emailVerified: info.email_verified === true,
      displayName: typeof info.name === 'string' ? info.name : null,
      username: null,
      avatarUrl: typeof info.picture === 'string' ? info.picture : null,
    };
  },
};

const github: OAuthProviderDef = {
  id: 'github',
  label: 'GitHub',
  clientId: config.oauth.github.clientId,
  clientSecret: config.oauth.github.clientSecret,
  authorizeUrl: 'https://github.com/login/oauth/authorize',
  tokenUrl: 'https://github.com/login/oauth/access_token',
  scope: 'read:user user:email',
  async fetchProfile(token) {
    const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' };
    const me = await getJson('https://api.github.com/user', { headers });
    let email: string | null = typeof me.email === 'string' ? me.email : null;
    let verified = email !== null;
    if (!email) {
      const emails = (await getJson('https://api.github.com/user/emails', { headers })) as unknown as Array<{
        email: string;
        primary: boolean;
        verified: boolean;
      }>;
      const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
      if (primary) {
        email = primary.email;
        verified = true;
      }
    }
    return {
      providerUserId: String(me.id),
      email,
      emailVerified: verified,
      displayName: (me.name as string) ?? (me.login as string) ?? null,
      username: typeof me.login === 'string' ? me.login : null,
      avatarUrl: typeof me.avatar_url === 'string' ? me.avatar_url : null,
    };
  },
};

const discord: OAuthProviderDef = {
  id: 'discord',
  label: 'Discord',
  clientId: config.oauth.discord.clientId,
  clientSecret: config.oauth.discord.clientSecret,
  authorizeUrl: 'https://discord.com/oauth2/authorize',
  tokenUrl: 'https://discord.com/api/oauth2/token',
  scope: 'identify email',
  async fetchProfile(token) {
    const me = await getJson('https://discord.com/api/users/@me', {
      headers: { authorization: `Bearer ${token}` },
    });
    return {
      providerUserId: String(me.id),
      email: typeof me.email === 'string' ? me.email : null,
      emailVerified: me.verified === true,
      displayName: (me.global_name as string) ?? (me.username as string) ?? null,
      username: typeof me.username === 'string' ? me.username : null,
      avatarUrl: me.avatar
        ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png`
        : null,
    };
  },
};

const facebook: OAuthProviderDef = {
  id: 'facebook',
  label: 'Facebook / Instagram',
  clientId: config.oauth.instagram.clientId,
  clientSecret: config.oauth.instagram.clientSecret,
  authorizeUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
  tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token',
  scope: 'email public_profile',
  extraAuthParams: { display: 'popup' },
  async fetchProfile(token) {
    const fields = 'id,name,email,username,picture.type(large)';
    const me = await getJson(
      `https://graph.facebook.com/v21.0/me?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`,
    );
    return {
      providerUserId: String(me.id),
      email: typeof me.email === 'string' ? me.email : null,
      emailVerified: true,
      displayName: typeof me.name === 'string' ? me.name : null,
      // When a person connected an Instagram account, `username` is the IG handle.
      username: typeof me.username === 'string' ? me.username : null,
      avatarUrl:
        me.picture && typeof me.picture === 'object'
          ? String((me.picture as { data?: { url?: string } }).data?.url ?? '')
          : null,
    };
  },
};

const PROVIDERS: Record<string, OAuthProviderDef> = {
  google,
  github,
  discord,
  facebook,
};

export function listProviders(): Array<OAuthProviderDef & { configured: boolean }> {
  return Object.values(PROVIDERS).map((p) => ({
    ...p,
    configured: Boolean(p.clientId && p.clientSecret),
  }));
}

export function getProvider(idValue: string): OAuthProviderDef | undefined {
  return PROVIDERS[idValue];
}

export function redirectUri(providerId: string): string {
  return `${config.origin}/api/auth/oauth/${providerId}/callback`;
}

export function authorizeUrl(
  provider: OAuthProviderDef,
  state: string,
  redirectTo: string,
): string {
  const u = new URL(provider.authorizeUrl);
  u.searchParams.set('client_id', provider.clientId);
  u.searchParams.set('redirect_uri', redirectUri(provider.id));
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', provider.scope);
  u.searchParams.set('state', state);
  // Passed through the `state` cookie rather than the provider, so the callback
  // can return the user to where they started.
  u.searchParams.set('prompt', 'select_account');
  for (const [k, v] of Object.entries(provider.extraAuthParams ?? {})) u.searchParams.set(k, v);
  void redirectTo;
  return u.toString();
}

export interface TokenResponse {
  access_token: string;
}

export async function exchangeCode(
  provider: OAuthProviderDef,
  code: string,
): Promise<string> {
  const res = await fetch(provider.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      code,
      redirect_uri: redirectUri(provider.id),
      grant_type: 'authorization_code',
    }).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
  const json = (await res.json()) as TokenResponse;
  if (!json.access_token) throw new Error('provider returned no access token');
  return json.access_token;
}

/** The shape UnNGL links an account by. */
export interface LinkedIdentity {
  userId: string | null;
  email: string | null;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
}
