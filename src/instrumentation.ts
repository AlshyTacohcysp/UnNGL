/**
 * Runs once, when the Node.js server starts — before any request is served.
 *
 * The only reason this file exists is to catch a misconfigured instance at boot
 * instead of at the first login attempt. Without it, a server with no
 * SESSION_SECRET starts happily, serves every page, and then tells the first
 * person who tries to sign in that "something went wrong on our side".
 *
 * `register()` is called once per runtime. We only care about Node: the edge
 * runtime has no filesystem, no database and no mail, so there is nothing to
 * check there.
 *
 * @license AGPL-3.0-or-later
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { auditConfig, auditSecretStrength } = await import('@/lib/startup-check');

  try {
    // Throws if a production instance is running without SESSION_SECRET. The
    // message says exactly which variable is missing and how to set it.
    auditConfig();
    auditSecretStrength();
  } catch (err) {
    // Next catches a throw from this hook and leaves the server listening but
    // answering 500 to everything, including /api/health. That is safe — nobody
    // can sign in — but it is a bad place to be stranded: the process holds the
    // port, so a restart policy sees a live container and an unhealthy one at
    // the same time. Say what is wrong once, on stderr, and exit so a
    // supervisor can do the sensible thing.
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const { getDb } = await import('@/lib/db');
  getDb();
}
