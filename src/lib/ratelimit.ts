/**
 * Fixed-window rate limiting, stored in SQLite so limits hold across processes
 * and restarts. Keys are hashed IPs, never raw addresses.
 *
 * @license AGPL-3.0-or-later
 */

import { all, run } from './db';

export interface RateResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

type Bucket = 'send' | 'login' | 'media' | 'create';

const WINDOWS: Record<Bucket, number> = {
  send: 3600,
  login: 900,
  media: 3600,
  create: 3600,
};

/** Count a hit against `bucket:subject` and report whether it is allowed. */
export function hit(bucket: Bucket, subject: string, limit: number): RateResult {
  const windowMs = WINDOWS[bucket] * 1000;
  const now = Date.now();
  const key = `${bucket}:${subject}`;
  const row = all<{ window_start: number; count: number }>(
    'SELECT window_start, count FROM rate_limits WHERE key = ?',
    key,
  )[0];

  if (!row || now - Number(row.window_start) >= windowMs) {
    run(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start, count = 1`,
      key,
      now,
    );
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  const count = Number(row.count);
  if (count >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((Number(row.window_start) + windowMs - now) / 1000));
    return { ok: false, remaining: 0, retryAfterSeconds };
  }
  run('UPDATE rate_limits SET count = count + 1 WHERE key = ?', key);
  return { ok: true, remaining: limit - count - 1, retryAfterSeconds: 0 };
}

/** Drop expired windows so the table stays small on long-lived servers. */
export function pruneRateLimits(): void {
  const oldest = Math.max(...Object.values(WINDOWS)) * 1000;
  run('DELETE FROM rate_limits WHERE window_start < ?', Date.now() - oldest);
}
