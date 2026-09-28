/**
 * A real PostgreSQL server, in-process, for tests.
 *
 * PGlite is Postgres compiled to WebAssembly and pglite-socket serves it over
 * the real wire protocol, so the application talks to it through the exact same
 * `postgres` driver and the same `?`-rewriting layer it will use in
 * production. Nothing here stubs the data layer: if a query is not valid
 * Postgres, it fails here the same way it would fail on Supabase.
 */
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

// pglite-socket multiplexes several client connections onto PGlite's single
// in-process database, and it mis-binds parameters when queries from two of
// them are in flight at once ("bind message supplies N parameters, but
// prepared statement requires 0"). That is a limitation of the test double, not
// of Postgres, so the harness runs the app on one connection. Concurrency tests
// still queue the same way they did under SQLite, which is the property under
// test.
process.env.DB_POOL_MAX = '1';

export const TEST_PORT = Number(process.env.PG_TEST_PORT ?? 55442);
export const TEST_URL = `postgres://postgres:postgres@127.0.0.1:${TEST_PORT}/postgres`;

let server: PGLiteSocketServer | null = null;
let db: PGlite | null = null;

export async function startTestDatabase(): Promise<{ url: string; stop: () => Promise<void> }> {
  if (!db) {
    db = await PGlite.create({ dataDir: 'memory://unngl-test' });
    server = new PGLiteSocketServer({ db, port: TEST_PORT, host: '127.0.0.1', maxConnections: 10 });
    await server.start();
  }
  return {
    url: TEST_URL,
    stop: async () => {
      await server?.stop();
      await db?.close();
      server = null;
      db = null;
    },
  };
}
