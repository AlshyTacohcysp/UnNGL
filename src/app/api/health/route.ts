/**
 * GET /api/health — liveness + a small, non-sensitive readiness summary.
 *
 * @license AGPL-3.0-or-later
 */

import { get, schemaVersion } from '@/lib/db';
import { ALGORITHM_VERSION } from '@/lib/palette/extract';
import { config } from '@/lib/config';
import { ok, route } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Liveness plus readiness. A load balancer needs "is it up"; an operator
 * occasionally wants the detail. Splitting them means the public endpoint
 * cannot be used to count users or fingerprint the stack.
 *
 * GET /api/health        -> { status, time }
 * GET /api/health?detail=1 -> adds version, node, schema, algorithm.
 * The detail is refused in production unless HEALTH_DETAIL=1 is set.
 */
export const GET = route('health', async (req: Request) => {
  const wantsDetail = new URL(req.url).searchParams.get('detail') === '1';
  const mayDetail = !config.isProd || process.env.HEALTH_DETAIL === '1';

  if (!wantsDetail || !mayDetail) {
    return ok({ status: 'ok', time: new Date().toISOString() });
  }

  const counts = get<{ n: number }>('SELECT COUNT(*) AS n FROM users');
  return ok({
    status: 'ok',
    version: process.env.npm_package_version ?? '0.1.0',
    node: process.version,
    storage: 'node:sqlite',
    schema: schemaVersion(),
    users: Number(counts?.n ?? 0),
    algorithm: ALGORITHM_VERSION,
    time: new Date().toISOString(),
  });
});
