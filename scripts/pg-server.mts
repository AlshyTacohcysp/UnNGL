/**
 * A standalone PostgreSQL server for local development against the real
 * database engine, without installing Postgres.
 *
 *   npm run db:serve      # terminal 1
 *   npm run dev           # terminal 2
 *
 * PGlite is Postgres compiled to WebAssembly; pglite-socket serves it over the
 * wire protocol, so the app connects through the same driver it uses in
 * production. Set DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/postgres
 * in .env.local and everything else is unchanged.
 */
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const port = Number(process.env.PG_PORT ?? 55432);

const db = await PGlite.create({ dataDir: process.env.PG_DATADIR ?? 'memory://unngl-dev' });
const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 10 });
await server.start();

const { version } = await db.query<{ version: string }>('SELECT version()');
console.log(`Postgres listening on 127.0.0.1:${port}`);
console.log(`  DATABASE_URL=postgres://postgres:postgres@127.0.0.1:${port}/postgres`);
console.log(`  ${String(version).split(',')[0]}`);
console.log('  data is in memory and is lost when this process stops');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void (async () => {
      await server.stop();
      await db.close();
      process.exit(0);
    })();
  });
}
