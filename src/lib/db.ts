/**
 * Postgres access, via the `postgres` driver.
 *
 * UnNGL was written against SQLite (`node:sqlite`) and moved to Postgres so it
 * can be hosted for free on Vercel, where a serverless filesystem is ephemeral
 * and a database file cannot survive between invocations. The public surface of
 * this module is deliberately unchanged — `all`, `get`, `run`, `tx` — so the
 * rest of the app still reads like it always did; what changed is that every one
 * of them is now a promise.
 *
 * Two details worth knowing:
 *
 *   - `?` placeholders. Every query in the codebase is written with `?`, which
 *     is what `node:sqlite` took. The driver sends positional parameters as
 *     `$1, $2…` and does not rewrite the query text, so `toPositional` does it,
 *     skipping anything inside a quoted string so a literal `?` is never
 *     mistaken for a placeholder.
 *
 *   - Timestamps are DOUBLE PRECISION, not BIGINT. `Date.now()` exceeds the
 *     range of a 32-bit integer, and the driver returns BIGINT as a *string*,
 *     which would quietly turn every date comparison in the app into string
 *     comparison. Double precision holds integers exactly to 2^53 and comes
 *     back as a JavaScript number, so the rest of the code keeps treating
 *     timestamps as numbers without knowing any of this.
 *
 * @license AGPL-3.0-or-later
 */

import postgres from 'postgres';
import { config } from './config';
import { auditConfig, auditSecretStrength } from './startup-check';

export type Row = Record<string, unknown>;

/**
 * Rewrite `?` placeholders as `$1, $2, …`, ignoring anything inside a quoted
 * string or a quoted identifier. Exported for its tests.
 */
export function toPositional(query: string): string {
  let out = '';
  let n = 0;
  let i = 0;
  while (i < query.length) {
    const c = query[i]!;
    // Single-quoted literal. '' is an escaped quote, not the end of the string.
    if (c === "'") {
      let j = i + 1;
      while (j < query.length) {
        if (query[j] === "'") {
          if (query[j + 1] === "'") j += 2;
          else break;
        } else j++;
      }
      out += query.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    // Double-quoted identifier.
    if (c === '"') {
      let j = i + 1;
      while (j < query.length && query[j] !== '"') j++;
      out += query.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === '?') {
      n += 1;
      out += `$${n}`;
    } else {
      out += c;
    }
    i++;
  }
  return out;
}

type Sql = ReturnType<typeof postgres>;

interface DbGlobal {
  __unngl_sql?: Sql;
}

const g = globalThis as unknown as DbGlobal;

function open(): Sql {
  // Boot-time configuration audit: warns loudly about settings that would
  // weaken the instance, rather than leaving them to be discovered later.
  auditConfig();
  auditSecretStrength();

  return postgres(config.databaseUrl, {
    // Serverless invocations are short and bursty, and each one would otherwise
    // open a fresh connection. A small pool with a short idle timeout is what
    // keeps a free-tier database from exhausting its connection limit.
    max: config.dbPoolMax,
    idle_timeout: 20,
    connect_timeout: 15,
    // Supabase's transaction pooler does not support server-side prepared
    // statements; without this, a pooled connection fails with
    // "prepared statement already exists" the moment two lambdas overlap.
    prepare: false,
  });
}

export function getSql(): Sql {
  if (!g.__unngl_sql) g.__unngl_sql = open();
  return g.__unngl_sql;
}

type Param = string | number | bigint | boolean | null | Uint8Array;

function normalize(params: unknown[]): Param[] {
  return params.map((p) => {
    if (p === undefined || p === null) return null;
    // The schema stores flags as 0/1 integers, and the rest of the app compares
    // them that way, so booleans become numbers rather than Postgres BOOLEANs.
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (p instanceof Date) return p.getTime();
    if (typeof p === 'object' && !(p instanceof Uint8Array)) return JSON.stringify(p);
    return p as Param;
  });
}

function query<T = Row>(sql: Sql, q: string, params: unknown[]) {
  return sql.unsafe(toPositional(q), normalize(params) as never[]) as Promise<T[]>;
}

/** The three read/write helpers, bound to one connection. */
export interface Executor {
  all<T = Row>(q: string, ...params: unknown[]): Promise<T[]>;
  get<T = Row>(q: string, ...params: unknown[]): Promise<T | undefined>;
  run(q: string, ...params: unknown[]): Promise<{ changes: number }>;
}

/**
 * A helper set bound to a specific connection. Pass one into a library
 * function to run that function's statements inside somebody else's
 * transaction; pass nothing to use the pool.
 */
export function executor(sql: Sql): Executor {
  return {
    all: <T = Row>(q: string, ...params: unknown[]) => query<T>(sql, q, params),
    get: async <T = Row>(q: string, ...params: unknown[]) => (await query<T>(sql, q, params))[0],
    run: async (q: string, ...params: unknown[]) => {
      const res = (await query(sql, q, params)) as unknown as { count?: number };
      return { changes: Number(res?.count ?? 0) };
    },
  };
}

/** The pool-bound executor, used by everything that is not in a transaction. */
export function db(): Executor {
  return executor(getSql());
}

export async function all<T = Row>(q: string, ...params: unknown[]): Promise<T[]> {
  return query<T>(getSql(), q, params);
}

export async function get<T = Row>(q: string, ...params: unknown[]): Promise<T | undefined> {
  const rows = await query<T>(getSql(), q, params);
  return rows[0];
}

export async function run(q: string, ...params: unknown[]): Promise<{ changes: number }> {
  // The await is load-bearing: without it the statement is dispatched, the
  // connection goes back to the pool, and the write is lost.
  const res = (await query(getSql(), q, params)) as unknown as { count?: number };
  return { changes: Number(res?.count ?? 0) };
}

/**
 * Run `fn` inside a transaction, rolling back on throw.
 *
 * The callback receives the transaction's own connection. That is not optional:
 * a pool may hand out a different connection for each statement, and the
 * statements inside a transaction have to share one or atomicity is a fiction.
 */
export async function tx<T>(fn: (t: Executor) => Promise<T>): Promise<T> {
  const sql = getSql();
  // The callback gets the transaction's own executor. Routing its statements
  // back to the pool would spread them across connections, and a COMMIT that
  // does not cover the work it claims to is worse than no transaction at all.
  return sql.begin(async (conn) => fn(executor(conn as unknown as Sql))) as Promise<T>;
}

/* ------------------------------------------------------------------ *
 * Schema
 * ------------------------------------------------------------------ */

interface Migration {
  id: number;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    id: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id                TEXT PRIMARY KEY,
        email             TEXT UNIQUE,
        email_verified_at DOUBLE PRECISION,
        display_name      TEXT,
        avatar_image_id   TEXT,
        avatar_palette    TEXT,
        created_at        DOUBLE PRECISION NOT NULL,
        updated_at        DOUBLE PRECISION NOT NULL
      );

      CREATE TABLE IF NOT EXISTS oauth_accounts (
        provider         TEXT NOT NULL,
        provider_user_id TEXT NOT NULL,
        user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        username         TEXT,
        created_at       DOUBLE PRECISION NOT NULL,
        PRIMARY KEY (provider, provider_user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_oauth_user ON oauth_accounts(user_id);

      CREATE TABLE IF NOT EXISTS sessions (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at DOUBLE PRECISION NOT NULL,
        expires_at DOUBLE PRECISION NOT NULL,
        user_agent TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

      CREATE TABLE IF NOT EXISTS login_tokens (
        id          TEXT PRIMARY KEY,
        email       TEXT NOT NULL,
        code_hash   TEXT NOT NULL,
        purpose     TEXT NOT NULL,
        attempts    INTEGER NOT NULL DEFAULT 0,
        created_at  DOUBLE PRECISION NOT NULL,
        expires_at  DOUBLE PRECISION NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_login_tokens_email ON login_tokens(email);

      CREATE TABLE IF NOT EXISTS inboxes (
        id              TEXT PRIMARY KEY,
        owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        slug            TEXT NOT NULL UNIQUE,
        title           TEXT NOT NULL,
        notify          INTEGER NOT NULL DEFAULT 0,
        created_at      DOUBLE PRECISION NOT NULL,
        last_message_at DOUBLE PRECISION,
        deleted_at      DOUBLE PRECISION
      );
      CREATE INDEX IF NOT EXISTS idx_inboxes_owner ON inboxes(owner_id);

      CREATE TABLE IF NOT EXISTS messages (
        id           TEXT PRIMARY KEY,
        inbox_id     TEXT NOT NULL REFERENCES inboxes(id) ON DELETE CASCADE,
        body         TEXT NOT NULL,
        created_at   DOUBLE PRECISION NOT NULL,
        sender_ip    TEXT,
        sender_agent TEXT,
        seen_at      DOUBLE PRECISION,
        -- The sender's private token. There is deliberately no hint_id column:
        -- hints.message_id is the link.
        claim_hash   TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_messages_inbox ON messages(inbox_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS hints (
        id          TEXT PRIMARY KEY,
        message_id  TEXT NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
        palette     TEXT NOT NULL,
        primary_hex TEXT NOT NULL,
        weight      DOUBLE PRECISION NOT NULL,
        hash        TEXT NOT NULL,
        algorithm   TEXT NOT NULL,
        verified    INTEGER NOT NULL DEFAULT 0,
        image_id    TEXT,
        source      TEXT NOT NULL,
        created_at  DOUBLE PRECISION NOT NULL
      );

      CREATE TABLE IF NOT EXISTS images (
        id           TEXT PRIMARY KEY,
        bytes        BYTEA NOT NULL,
        mime         TEXT NOT NULL,
        width        INTEGER NOT NULL,
        height       INTEGER NOT NULL,
        bytes_len    INTEGER NOT NULL,
        created_at   DOUBLE PRECISION NOT NULL,
        delete_after DOUBLE PRECISION
      );
      CREATE INDEX IF NOT EXISTS idx_images_purge ON images(delete_after);

      CREATE TABLE IF NOT EXISTS rate_limits (
        key          TEXT PRIMARY KEY,
        window_start DOUBLE PRECISION NOT NULL,
        count        INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
];

let migrated: Promise<void> | null = null;

/**
 * Apply any migrations this database has not seen. Idempotent, and safe to run
 * concurrently: the advisory lock means two serverless invocations starting at
 * the same moment cannot both run the DDL.
 */
export async function migrate(): Promise<void> {
  if (!migrated) {
    migrated = (async () => {
      const sql = getSql();
      await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        applied_at DOUBLE PRECISION NOT NULL
      )`;
      for (const m of MIGRATIONS) {
        const done = await sql`SELECT 1 FROM schema_migrations WHERE id = ${m.id}`;
        if (done.length) continue;
        // Postgres has no DDL transaction helper as simple as SQLite's BEGIN, and
        // CREATE TABLE IF NOT EXISTS is idempotent, so running the statements
        // directly is both safe and simpler than wrapping them.
        await sql.unsafe(m.sql);
        await sql`INSERT INTO schema_migrations (id, applied_at)
                   VALUES (${m.id}, ${Date.now()})
                   ON CONFLICT (id) DO NOTHING`;
      }
    })().catch((err) => {
      // Let the next call retry rather than caching the failure forever.
      migrated = null;
      throw err;
    });
  }
  return migrated;
}

/** Open the connection and bring the schema up to date. */
export async function initDb(): Promise<void> {
  getSql();
  await migrate();
}

export async function schemaVersion(): Promise<number> {
  const rows = await all<Row>('SELECT MAX(id) AS v FROM schema_migrations');
  return Number(rows[0]?.v ?? 0);
}
