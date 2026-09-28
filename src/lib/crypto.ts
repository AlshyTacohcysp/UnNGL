/**
 * Hashing, tokens, and other small cryptographic helpers.
 *
 * Tokens (session ids, login codes) are random 256-bit values. Only a salted
 * SHA-256 digest of each is stored, so a database leak cannot be replayed as
 * live sessions. HMAC uses SESSION_SECRET so digests from one deployment don't
 * validate on another.
 *
 * @license AGPL-3.0-or-later
 */

import crypto from 'node:crypto';
import { config } from './config';

const SESSION_KEY = () => `unngl:v1:${config.sessionSecret}`;
const IP_KEY = () => `unngl:ip:v1:${config.sessionSecret}`;

/** URL-safe random token, `bytes` of entropy. */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Numeric login code: 6 digits, uniform, with 10000 leading zeros. */
export function loginCode(): string {
  const n = crypto.randomInt(0, 1_000_000);
  return String(n).padStart(6, '0');
}

/** Salted, keyed digest used for everything we store. */
export function digestToken(token: string): string {
  return crypto.createHmac('sha256', SESSION_KEY()).update(token).digest('hex');
}

export function digestCode(email: string, code: string): string {
  return crypto
    .createHmac('sha256', SESSION_KEY())
    .update(`code:${email.trim().toLowerCase()}:${code}`)
    .digest('hex');
}

export function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * One-way hash of a client IP. We need abuse control without keeping raw IPs,
 * which is both a privacy obligation and a legal one in the EU.
 */
export function hashIp(ip: string): string {
  return crypto.createHmac('sha256', IP_KEY()).update(ip.trim()).digest('hex').slice(0, 32);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Constant-time string compare for digests. */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(a, b);
}
