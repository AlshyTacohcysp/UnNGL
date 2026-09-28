/**
 * GET /api/health — liveness + a small, non-sensitive readiness summary.
 *
 * @license AGPL-3.0-or-later
 */

import { get, schemaVersion } from '@/lib/db';
import { ALGORITHM_VERSION } from '@/lib/palette/extract';
import { ok, route } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route('health', async () => {
  const counts = get<{ n: number }>('SELECT COUNT(*) AS n FROM users');
  return ok({
    status: 'ok',
    version: process.env.npm_package_version ?? '0.1.0',
    node: process.version,
    sqlite: process.versions.node ? 'node:sqlite' : 'unknown',
    schema: schemaVersion(),
    users: Number(counts?.n ?? 0),
    algorithm: ALGORITHM_VERSION,
    time: new Date().toISOString(),
  });
});
