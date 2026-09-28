/**
 * Users, sessions, and passwordless email login.
 *
 * Design notes:
 *  - No passwords are stored anywhere. Email login issues a 6-digit code that
 *    is only kept as an HMAC digest, expires in 10 minutes, and is rate-limited
 *    per address and per IP.
 *  - Sessions are random tokens; only their digest lives in the database.
 *  - Logging in with a *verified* email that already exists links the browser
 *    to that account, which is what makes OAuth and email interchangeable.
 *
 * @license AGPL-3.0-or-later
 */

import { cookies } from 'next/headers';
import { nanoid } from 'nanoid';
import { all, get, run } from './db';
import { config } from './config';
import { digestCode, digestToken, loginCode, normalizeEmail, randomToken, safeEqual } from './crypto';

/**
 * In production the cookie is named with the `__Host-` prefix, which browsers
 * enforce: it is only accepted if it is Secure, sent only to this exact host
 * (no Domain attribute) and has Path=/. That removes subdomain cookie
 * injection as an attack — an attacker who can set a cookie for
 * unngl.link.evil.com cannot forge a session for unngl.link.
 *
 * The name is read through this function everywhere, so the two values can
 * never drift apart.
 */
const SESSION_COOKIE = 'unngl_session';
const SESSION_COOKIE_SECURE = '__Host-unngl_session';
const LOGIN_CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

export interface User {
  id: string;
  email: string | null;
  email_verified_at: number | null;
  display_name: string | null;
  avatar_image_id: string | null;
  avatar_palette: string | null;
  created_at: number;
}

const USER_COLUMNS =
  'id, email, email_verified_at, display_name, avatar_image_id, avatar_palette, created_at';

/* ------------------------------------------------------------------ *
 * Users
 * ------------------------------------------------------------------ */

export async function findUserById(id: string): Promise<User | undefined> {
  return await get<User>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, id);
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  return await get<User>(`SELECT ${USER_COLUMNS} FROM users WHERE email = ?`, normalizeEmail(email));
}

/** Find or create a user for a verified email address. */
export async function upsertUserByEmail(email: string, displayName?: string | null): Promise<User> {
  const now = Date.now();
  const norm = normalizeEmail(email);
  const existing = await findUserByEmail(norm);
  if (existing) {
    if (!existing.email_verified_at) {
      await run('UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ?', now, now, existing.id);
    }
    return (await findUserById(existing.id))!;
  }
  const id = nanoid(16);
  await run(
    `INSERT INTO users (id, email, email_verified_at, display_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id,
    norm,
    now,
    displayName ?? null,
    now,
    now,
  );
  return (await findUserById(id))!;
}

/** Create a user that has no email yet (OAuth-only until they add one). */
export async function createOAuthUser(displayName: string | null): Promise<User> {
  const now = Date.now();
  const id = nanoid(16);
  await run(
    `INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    id,
    null,
    displayName,
    now,
    now,
  );
  return (await findUserById(id))!;
}

export async function addEmailToUser(userId: string, email: string): Promise<void> {
  const norm = normalizeEmail(email);
  const now = Date.now();
  const clash = await findUserByEmail(norm);
  if (clash && clash.id !== userId) {
    throw new Error('That email is already linked to another account.');
  }
  await run(
    'UPDATE users SET email = ?, email_verified_at = ?, updated_at = ? WHERE id = ?',
    norm,
    now,
    now,
    userId,
  );
}

export async function setUserAvatar(userId: string, imageId: string | null, palette: unknown): Promise<void> {
  await run(
    'UPDATE users SET avatar_image_id = ?, avatar_palette = ?, updated_at = ? WHERE id = ?',
    imageId,
    palette === null ? null : JSON.stringify(palette),
    Date.now(),
    userId,
  );
}

export async function setDisplayName(userId: string, name: string): Promise<void> {
  await run('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?', name, Date.now(), userId);
}

/* ------------------------------------------------------------------ *
 * OAuth account linking
 * ------------------------------------------------------------------ */

export async function findUserByOAuth(provider: string, providerUserId: string): Promise<User | undefined> {
  const row = await get<{ user_id: string }>(
    'SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?',
    provider,
    providerUserId,
  );
  return row ? await findUserById(row.user_id) : undefined;
}

export async function linkOAuthAccount(
  userId: string,
  provider: string,
  providerUserId: string,
  username: string | null,
): Promise<void> {
  await run(
    `INSERT INTO oauth_accounts (provider, provider_user_id, user_id, username, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(provider, provider_user_id) DO UPDATE SET user_id = excluded.user_id`,
    provider,
    providerUserId,
    userId,
    username,
    Date.now(),
  );
}

/* ------------------------------------------------------------------ *
 * Email login codes
 * ------------------------------------------------------------------ */

export interface IssuedCode {
  code: string;
  expiresAt: number;
}

export async function issueLoginCode(email: string, purpose: 'login' | 'add_email'): Promise<IssuedCode> {
  const norm = normalizeEmail(email);
  const code = loginCode();
  const now = Date.now();
  // One live code per address+purpose: requesting a new one invalidates the old.
  await run('DELETE FROM login_tokens WHERE email = ? AND purpose = ?', norm, purpose);
  await run(
    `INSERT INTO login_tokens (id, email, code_hash, purpose, attempts, created_at, expires_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)`,
    nanoid(12),
    norm,
    digestCode(norm, code),
    purpose,
    now,
    now + LOGIN_CODE_TTL_MS,
  );
  return { code, expiresAt: now + LOGIN_CODE_TTL_MS };
}

export type CodeResult = { status: 'ok'; user: User } | { status: 'invalid' } | { status: 'locked' };

/** Consume a login code. Codes are single-use and burn an attempt on failure. */
export async function consumeLoginCode(email: string, code: string, purpose: 'login' | 'add_email'): Promise<CodeResult> {
  const norm = normalizeEmail(email);
  // Claim this attempt and read the token back in one statement. Doing it as a
  // SELECT followed by an UPDATE would let a handful of parallel guesses all
  // read `attempts = 0` and all be counted as the first, so the five-try limit
  // in front of a six-digit code would be five tries per burst rather than five
  // tries at all.
  const row = (
    await all<{ id: string; code_hash: string; attempts: number; expires_at: number }>(
      `UPDATE login_tokens SET attempts = attempts + 1
        WHERE id = (SELECT id FROM login_tokens WHERE email = ? AND purpose = ?)
        RETURNING id, code_hash, attempts, expires_at`,
      norm,
      purpose,
    )
  )[0];

  if (!row) return { status: 'invalid' };
  if (Date.now() > Number(row.expires_at)) {
    await run('DELETE FROM login_tokens WHERE id = ?', row.id);
    return { status: 'invalid' };
  }
  // `attempts` already includes the attempt being made right now, so this
  // rejects the sixth guess — the same point the previous read-then-write
  // version did.
  if (Number(row.attempts) > MAX_CODE_ATTEMPTS) {
    await run('DELETE FROM login_tokens WHERE id = ?', row.id);
    return { status: 'locked' };
  }
  if (!safeEqual(row.code_hash, digestCode(norm, code))) {
    return { status: 'invalid' };
  }
  await run('DELETE FROM login_tokens WHERE id = ?', row.id);
  return { status: 'ok', user: await upsertUserByEmail(norm) };
}

export async function pruneLoginTokens(): Promise<void> {
  await run('DELETE FROM login_tokens WHERE expires_at < ?', Date.now() - 60 * 60 * 1000);
}

/* ------------------------------------------------------------------ *
 * Sessions
 * ------------------------------------------------------------------ */

export async function createSession(userId: string, userAgent: string | null): Promise<string> {
  const token = randomToken(32);
  const now = Date.now();
  await run(
    'INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)',
    digestToken(token),
    userId,
    now,
    now + config.sessionDays * 86_400_000,
    userAgent,
  );
  return token;
}

export async function sessionUserId(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const row = await get<{ user_id: string; expires_at: number }>(
    'SELECT user_id, expires_at FROM sessions WHERE id = ?',
    digestToken(token),
  );
  if (!row) return null;
  if (Date.now() > Number(row.expires_at)) {
    await run('DELETE FROM sessions WHERE id = ?', digestToken(token));
    return null;
  }
  return row.user_id;
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await run('DELETE FROM sessions WHERE id = ?', digestToken(token));
}

export async function destroyAllSessions(userId: string): Promise<void> {
  await run('DELETE FROM sessions WHERE user_id = ?', userId);
}

export function sessionCookieName(): string {
  return config.isProd ? SESSION_COOKIE_SECURE : SESSION_COOKIE;
}

/**
 * The session token on this request, if any.
 *
 * The name has to come from sessionCookieName() and not from the constant: in
 * production the cookie is `__Host-unngl_session`, and reading the plain
 * `unngl_session` instead meant the server set a cookie it then never looked
 * for. Every session in production was accepted at sign-in and rejected on the
 * very next request — nobody could stay signed in. It stayed hidden because over
 * plain HTTP the Secure cookie is not sent at all, so the failure only appears
 * once you actually deploy behind TLS.
 */
async function sessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(sessionCookieName())?.value;
}

/** The signed-in user for this request, or null. */
export async function currentUser(): Promise<User | null> {
  const id = await sessionUserId(await sessionToken());
  return id ? ((await findUserById(id)) ?? null) : null;
}

export async function currentUserId(): Promise<string | null> {
  return await sessionUserId(await sessionToken());
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.isProd,
    path: '/',
    maxAge: config.sessionDays * 86_400,
  };
}
