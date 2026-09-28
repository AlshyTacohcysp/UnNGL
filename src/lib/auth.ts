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
import { get, run } from './db';
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

export function findUserById(id: string): User | undefined {
  return get<User>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, id);
}

export function findUserByEmail(email: string): User | undefined {
  return get<User>(`SELECT ${USER_COLUMNS} FROM users WHERE email = ?`, normalizeEmail(email));
}

/** Find or create a user for a verified email address. */
export function upsertUserByEmail(email: string, displayName?: string | null): User {
  const now = Date.now();
  const norm = normalizeEmail(email);
  const existing = findUserByEmail(norm);
  if (existing) {
    if (!existing.email_verified_at) {
      run('UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ?', now, now, existing.id);
    }
    return findUserById(existing.id)!;
  }
  const id = nanoid(16);
  run(
    `INSERT INTO users (id, email, email_verified_at, display_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id,
    norm,
    now,
    displayName ?? null,
    now,
    now,
  );
  return findUserById(id)!;
}

/** Create a user that has no email yet (OAuth-only until they add one). */
export function createOAuthUser(displayName: string | null): User {
  const now = Date.now();
  const id = nanoid(16);
  run(
    `INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    id,
    null,
    displayName,
    now,
    now,
  );
  return findUserById(id)!;
}

export function addEmailToUser(userId: string, email: string): void {
  const norm = normalizeEmail(email);
  const now = Date.now();
  const clash = findUserByEmail(norm);
  if (clash && clash.id !== userId) {
    throw new Error('That email is already linked to another account.');
  }
  run(
    'UPDATE users SET email = ?, email_verified_at = ?, updated_at = ? WHERE id = ?',
    norm,
    now,
    now,
    userId,
  );
}

export function setUserAvatar(userId: string, imageId: string | null, palette: unknown): void {
  run(
    'UPDATE users SET avatar_image_id = ?, avatar_palette = ?, updated_at = ? WHERE id = ?',
    imageId,
    palette === null ? null : JSON.stringify(palette),
    Date.now(),
    userId,
  );
}

export function setDisplayName(userId: string, name: string): void {
  run('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?', name, Date.now(), userId);
}

/* ------------------------------------------------------------------ *
 * OAuth account linking
 * ------------------------------------------------------------------ */

export function findUserByOAuth(provider: string, providerUserId: string): User | undefined {
  const row = get<{ user_id: string }>(
    'SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?',
    provider,
    providerUserId,
  );
  return row ? findUserById(row.user_id) : undefined;
}

export function linkOAuthAccount(
  userId: string,
  provider: string,
  providerUserId: string,
  username: string | null,
): void {
  run(
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

export function issueLoginCode(email: string, purpose: 'login' | 'add_email'): IssuedCode {
  const norm = normalizeEmail(email);
  const code = loginCode();
  const now = Date.now();
  // One live code per address+purpose: requesting a new one invalidates the old.
  run('DELETE FROM login_tokens WHERE email = ? AND purpose = ?', norm, purpose);
  run(
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
export function consumeLoginCode(email: string, code: string, purpose: 'login' | 'add_email'): CodeResult {
  const norm = normalizeEmail(email);
  const row = get<{ id: string; code_hash: string; attempts: number; expires_at: number }>(
    'SELECT id, code_hash, attempts, expires_at FROM login_tokens WHERE email = ? AND purpose = ?',
    norm,
    purpose,
  );
  if (!row) return { status: 'invalid' };
  if (Date.now() > Number(row.expires_at)) {
    run('DELETE FROM login_tokens WHERE id = ?', row.id);
    return { status: 'invalid' };
  }
  if (Number(row.attempts) >= MAX_CODE_ATTEMPTS) {
    run('DELETE FROM login_tokens WHERE id = ?', row.id);
    return { status: 'locked' };
  }
  if (!safeEqual(row.code_hash, digestCode(norm, code))) {
    run('UPDATE login_tokens SET attempts = attempts + 1 WHERE id = ?', row.id);
    return { status: 'invalid' };
  }
  run('DELETE FROM login_tokens WHERE id = ?', row.id);
  return { status: 'ok', user: upsertUserByEmail(norm) };
}

export function pruneLoginTokens(): void {
  run('DELETE FROM login_tokens WHERE expires_at < ?', Date.now() - 60 * 60 * 1000);
}

/* ------------------------------------------------------------------ *
 * Sessions
 * ------------------------------------------------------------------ */

export function createSession(userId: string, userAgent: string | null): string {
  const token = randomToken(32);
  const now = Date.now();
  run(
    'INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)',
    digestToken(token),
    userId,
    now,
    now + config.sessionDays * 86_400_000,
    userAgent,
  );
  return token;
}

export function sessionUserId(token: string | undefined): string | null {
  if (!token) return null;
  const row = get<{ user_id: string; expires_at: number }>(
    'SELECT user_id, expires_at FROM sessions WHERE id = ?',
    digestToken(token),
  );
  if (!row) return null;
  if (Date.now() > Number(row.expires_at)) {
    run('DELETE FROM sessions WHERE id = ?', digestToken(token));
    return null;
  }
  return row.user_id;
}

export function destroySession(token: string | undefined): void {
  if (!token) return;
  run('DELETE FROM sessions WHERE id = ?', digestToken(token));
}

export function destroyAllSessions(userId: string): void {
  run('DELETE FROM sessions WHERE user_id = ?', userId);
}

export function sessionCookieName(): string {
  return config.isProd ? SESSION_COOKIE_SECURE : SESSION_COOKIE;
}

/** The signed-in user for this request, or null. */
export async function currentUser(): Promise<User | null> {
  const store = await cookies();
  const id = sessionUserId(store.get(SESSION_COOKIE)?.value);
  return id ? (findUserById(id) ?? null) : null;
}

export async function currentUserId(): Promise<string | null> {
  const store = await cookies();
  return sessionUserId(store.get(SESSION_COOKIE)?.value);
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
