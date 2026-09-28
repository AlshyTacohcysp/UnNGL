/**
 * SQLite access, built on Node's built-in `node:sqlite` — no native module to
 * compile, no database server to run. The whole app state is one file.
 *
 * The database is opened lazily and cached per process; Next.js hot-reloads
 * modules in development, so it lives on globalThis.
 *
 * @license AGPL-3.0-or-later
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';

// node:sqlite is flagged experimental on Node 22. The warning is noise for
// operators who chose this stack, and silencing it beats a log full of it.
const originalEmit = process.emitWarning;
process.emitWarning = function (warning: unknown, ...rest: unknown[]) {
  const name =
    typeof warning === 'object' && warning !== null && 'name' in warning
      ? String((warning as { name: unknown }).name)
      : '';
  if (name === 'ExperimentalWarning' && String(warning).includes('SQLite')) return;
  return (originalEmit as (...a: unknown[]) => void).call(process, warning as never, ...rest);
} as typeof process.emitWarning;

export type Row = Record<string, unknown>;

interface DbGlobal {
  __unngl_db?: DatabaseSync;
}

const g = globalThis as unknown as DbGlobal;

function open(): DatabaseSync {
  const file = config.databasePath;
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);
  migrate(db);
  return db;
}

export function getDb(): DatabaseSync {
  if (!g.__unngl_db) g.__unngl_db = open();
  return g.__unngl_db;
}

type Param = string | number | bigint | null | Uint8Array;

function normalize(params: unknown[]): Param[] {
  return params.map((p) => {
    if (p === undefined || p === null) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (p instanceof Date) return p.getTime();
    if (typeof p === 'object' && !(p instanceof Uint8Array)) return JSON.stringify(p);
    return p as Param;
  });
}

export function all<T = Row>(sql: string, ...params: unknown[]): T[] {
  return getDb().prepare(sql).all(...normalize(params)) as T[];
}

export function get<T = Row>(sql: string, ...params: unknown[]): T | undefined {
  return getDb().prepare(sql).get(...normalize(params)) as T | undefined;
}

export function run(sql: string, ...params: unknown[]): { changes: number } {
  const res = getDb().prepare(sql).run(...normalize(params));
  return { changes: Number(res.changes) };
}

/** Run `fn` inside a transaction, rolling back on throw. */
export function tx<T>(fn: () => T): T {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  }
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
      CREATE TABLE users (
        id                TEXT PRIMARY KEY,
        email             TEXT UNIQUE,
        email_verified_at INTEGER,
        display_name      TEXT,
        avatar_image_id   TEXT,
        avatar_palette    TEXT,
        created_at        INTEGER NOT NULL,
        updated_at        INTEGER NOT NULL
      );

      CREATE TABLE oauth_accounts (
        provider         TEXT NOT NULL,
        provider_user_id TEXT NOT NULL,
        user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        username         TEXT,
        created_at       INTEGER NOT NULL,
        PRIMARY KEY (provider, provider_user_id)
      );
      CREATE INDEX idx_oauth_user ON oauth_accounts(user_id);

      CREATE TABLE sessions (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        user_agent TEXT
      );
      CREATE INDEX idx_sessions_user ON sessions(user_id);

      CREATE TABLE login_tokens (
        id          TEXT PRIMARY KEY,
        email       TEXT NOT NULL,
        code_hash   TEXT NOT NULL,
        purpose     TEXT NOT NULL,
        attempts    INTEGER NOT NULL DEFAULT 0,
        created_at  INTEGER NOT NULL,
        expires_at  INTEGER NOT NULL
      );
      CREATE INDEX idx_login_tokens_email ON login_tokens(email);

      CREATE TABLE inboxes (
        id              TEXT PRIMARY KEY,
        owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        slug            TEXT NOT NULL UNIQUE,
        title           TEXT NOT NULL,
        notify          INTEGER NOT NULL DEFAULT 0,
        created_at      INTEGER NOT NULL,
        last_message_at INTEGER,
        deleted_at      INTEGER
      );
      CREATE INDEX idx_inboxes_owner ON inboxes(owner_id);

      CREATE TABLE messages (
        id           TEXT PRIMARY KEY,
        inbox_id     TEXT NOT NULL REFERENCES inboxes(id) ON DELETE CASCADE,
        body         TEXT NOT NULL,
        created_at   INTEGER NOT NULL,
        sender_ip    TEXT,
        sender_agent TEXT,
        seen_at      INTEGER,
        hint_id      TEXT,
        claim_hash   TEXT
      );
      CREATE INDEX idx_messages_inbox ON messages(inbox_id, created_at DESC);

      CREATE TABLE hints (
        id          TEXT PRIMARY KEY,
        message_id  TEXT NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
        palette     TEXT NOT NULL,
        primary_hex TEXT NOT NULL,
        weight      REAL NOT NULL,
        hash        TEXT NOT NULL,
        algorithm   TEXT NOT NULL,
        verified    INTEGER NOT NULL DEFAULT 0,
        image_id    TEXT,
        source      TEXT NOT NULL,
        created_at  INTEGER NOT NULL
      );

      CREATE TABLE images (
        id          TEXT PRIMARY KEY,
        bytes       BLOB NOT NULL,
        mime        TEXT NOT NULL,
        width       INTEGER NOT NULL,
        height      INTEGER NOT NULL,
        bytes_len   INTEGER NOT NULL,
        created_at  INTEGER NOT NULL,
        delete_after INTEGER
      );
      CREATE INDEX idx_images_purge ON images(delete_after);

      CREATE TABLE rate_limits (
        key          TEXT PRIMARY KEY,
        window_start INTEGER NOT NULL,
        count        INTEGER NOT NULL
      );

      CREATE TABLE meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
];

function migrate(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
  );`);
  const applied = new Set(
    (db.prepare('SELECT id FROM schema_migrations').all() as Row[]).map((r) => Number(r.id)),
  );
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(
        m.id,
        Date.now(),
      );
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

export function schemaVersion(): number {
  const rows = all<Row>('SELECT MAX(id) AS v FROM schema_migrations');
  return Number(rows[0]?.v ?? 0);
}
