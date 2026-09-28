/**
 * Integration test: the real data layer against a real PostgreSQL server.
 *
 * PGlite is Postgres compiled to WebAssembly; pglite-socket serves it over the
 * wire protocol, so this exercises the same driver, the same `?` rewriting and
 * the same DDL that will run on Supabase. Nothing is stubbed.
 *
 * Run with `npm run test:pg`.
 */
process.env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${process.env.PG_TEST_PORT ?? 55442}/postgres`;

import postgres from 'postgres';
import { startTestDatabase } from '../tests/pg-harness';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures++;
}

async function main() {
  const pg = await startTestDatabase();
  const raw = postgres(pg.url, { max: 3, prepare: false });
  try {
    // Load the app's data layer pointed at this server.
    const db = await import('../src/lib/db');
    db.getSql();
    await db.migrate();

    console.log('\nSchema');
    check('migrations apply', (await db.schemaVersion()) >= 1, `version ${await db.schemaVersion()}`);
    const reapply = db.migrate();
    await reapply;
    check('migrations are idempotent', (await db.schemaVersion()) >= 1);

    console.log('\nPlaceholders and types');
    const q = await raw.unsafe(
      (await import('../src/lib/db')).toPositional('SELECT $1::int AS n, \'why?\' AS q'),
      [7],
    );
    check('? is rewritten and a literal ? survives', q[0]?.n === 7 && q[0]?.q === 'why?');

    const now = Date.now();
    await db.run('INSERT INTO users (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)', 'u1', 'a@b.c', now, now);
    const user = await db.get<{ id: string; created_at: number }>('SELECT id, created_at FROM users WHERE id = ?', 'u1');
    check('DOUBLE PRECISION comes back as a number', typeof user!.created_at === 'number', `${user!.created_at}`);
    check('and equals what went in', user!.created_at === now);

    await db.run('INSERT INTO images (id, bytes, mime, width, height, bytes_len, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      'img1', new Uint8Array([137, 80, 78, 71, 0, 255]), 'image/png', 4, 4, 6, now);
    const img = await db.get<{ bytes: Uint8Array }>('SELECT bytes FROM images WHERE id = ?', 'img1');
    check('bytea round-trips', Buffer.from(img!.bytes).toString('hex') === '89504e4700ff');

    console.log('\nRate limiting is one atomic statement');
    const { hit } = await import('../src/lib/ratelimit');
    const before = Date.now();
    const results = await Promise.all(Array.from({ length: 8 }, () => hit('login', 'race-subject', 5)));
    const allowed = results.filter((r) => r.ok).length;
    check('8 concurrent hits against a limit of 5 allow exactly 5', allowed === 5, `allowed ${allowed}`);
    const after = results.find((r) => !r.ok)!;
    check('a refusal reports a retry delay', after.retryAfterSeconds > 0, `${after.retryAfterSeconds}s`);

    console.log('\nLogin codes are claimed atomically');
    const { issueLoginCode, consumeLoginCode } = await import('../src/lib/auth');
    const issued = await issueLoginCode('race@unngl.test', 'login');
    const outcomes = await Promise.all(
      Array.from({ length: 8 }, () => consumeLoginCode('race@unngl.test', '000000', 'login')),
    );
    const locked = outcomes.filter((o) => o.status === 'locked').length;
    check('parallel wrong codes hit the lockout', locked > 0, `${locked} locked of ${outcomes.length}`);

    console.log('\nTransactions');
    const rollback = await db.tx(async (t) => {
      await t.run('INSERT INTO users (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)', 'rolled', 'r@b.c', now, now);
      throw new Error('nope');
    }).then(() => 'committed', () => 'rolled back');
    const ghost = await db.get('SELECT id FROM users WHERE id = ?', 'rolled');
    check('a throwing transaction leaves nothing behind', rollback === 'rolled back' && ghost === undefined);

    const commit = await db.tx(async (t) => {
      await t.run('INSERT INTO users (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)', 'kept', 'k@b.c', now, now);
    });
    check('a successful transaction commits', commit === undefined && (await db.get('SELECT id FROM users WHERE id = ?', 'kept')) !== undefined);

    console.log('\nA transaction never reaches back to the pool');
    // The pool is pinned to one connection here on purpose. A function that
    // accepts a transaction handle and quietly ignores it will call the pool
    // from inside the transaction, wait for a connection that cannot be handed
    // out until the transaction finishes, and hang forever. On a free tier,
    // where the pool is small by necessity, that is a hang, not a slow query.
    const { createInbox } = await import('../src/lib/inbox');
    const { postMessage } = await import('../src/lib/inbox');
    const owner = 'txowner';
    await db.run(
      'INSERT INTO users (id, email, email_verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      owner, 'tx@unngl.test', now, now, now,
    );
    const inbox = await createInbox(owner, 'tx');
    const pngBytes = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('./fixtures/ok.png', import.meta.url)));
    const posted = await Promise.race([
      postMessage({
        inboxSlug: inbox.slug,
        body: 'inside a transaction',
        imageBytes: pngBytes,
        claimedPalette: null,
        ipHash: 'ip',
        userAgent: 'pg-smoke',
        source: 'upload',
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DEADLOCK: hung inside tx')), 10_000)),
    ]).then((p: any) => p.message.hint, (e) => e);

    check('posting a hinted message inside a transaction completes', !posted.message && Boolean((posted as any).colors),
      (posted as any).colors?.join(' ') ?? String((posted as any).message));

    console.log('\nThe SQLite dialect really is gone');
    for (const [label, sql] of [
      ['strftime', `SELECT strftime('%s', 'now')`],
      ['INSERT OR REPLACE', `INSERT OR REPLACE INTO users (id) VALUES ('x')`],
      ['AUTOINCREMENT', 'CREATE TABLE z (id INTEGER PRIMARY KEY AUTOINCREMENT)'],
    ] as const) {
      let dialectError = false;
      try { await raw.unsafe(sql); } catch { dialectError = true; }
      check(`${label} is rejected by Postgres`, dialectError);
    }
  } finally {
    await raw.end({ timeout: 1 });
    await pg.stop();
  }

  console.log(failures === 0 ? '\nAll Postgres checks passed.' : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
