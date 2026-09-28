-- UnNGL schema for Supabase.
--
-- The app applies this itself at boot, idempotently, so running it here is
-- optional. Apply it in the Supabase SQL editor if you would rather review
-- the schema before anything touches your database, or if you want the
-- database ready before the first request arrives.
--
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run
--
-- It is the same text the application runs; see src/lib/db.ts.

CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  applied_at DOUBLE PRECISION NOT NULL
);
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

INSERT INTO schema_migrations (id, applied_at) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;
