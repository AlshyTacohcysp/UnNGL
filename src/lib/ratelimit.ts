/**
 * Fixed-window rate limiting, stored in Postgres so limits hold across
 * processes, regions and restarts. Keys are hashed IPs, never raw addresses.
 *
 * @license AGPL-3.0-or-later
 */

import { all, run } from './db';

export interface RateResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

type Bucket = 'send' | 'login' | 'media' | 'create' | 'handle';

const WINDOWS: Record<Bucket, number> = {
  send: 3600,
  login: 900,
  media: 3600,
  create: 3600,
  handle: 3600,
};

/**
 * Count a hit against `bucket:subject` and report whether it is allowed.
 *
 * The whole thing is one statement on purpose. Reading the counter and then
 * writing it back is a race that SQLite hid behind a single connection but a
 * connection pool does not: two simultaneous login attempts would both read
 * `count = 0`, both be told they are the first, and both be allowed. The login
 * bucket is what stands between an attacker and the email sign-in, so the
 * increment and the verdict have to come from the same atomic upsert.
 */
export async function hit(bucket: Bucket, subject: string, limit: number): Promise<RateResult> {
  const windowMs = WINDOWS[bucket] * 1000;
  const now = Date.now();
  const key = `${bucket}:${subject}`;

  const row = (
    await all<{ window_start: number; count: number }>(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT (key) DO UPDATE SET
         count        = CASE WHEN ? - rate_limits.window_start >= ? THEN 1 ELSE rate_limits.count + 1 END,
         window_start = CASE WHEN ? - rate_limits.window_start >= ? THEN ? ELSE rate_limits.window_start END
       RETURNING count, window_start`,
      key,
      now,
      now,
      windowMs,
      now,
      windowMs,
      now,
    )
  )[0];

  const count = Number(row?.count ?? 1);
  if (count > limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((Number(row?.window_start ?? now) + windowMs - now) / 1000),
    );
    return { ok: false, remaining: 0, retryAfterSeconds };
  }
  return { ok: true, remaining: limit - count, retryAfterSeconds: 0 };
}

/** Drop expired windows so the table stays small on long-lived servers. */
export async function pruneRateLimits(): Promise<void> {
  const oldest = Math.max(...Object.values(WINDOWS)) * 1000;
  await run('DELETE FROM rate_limits WHERE window_start < ?', Date.now() - oldest);
}
