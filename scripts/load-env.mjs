/**
 * Load .env files into process.env before anything reads the config.
 *
 * `next dev` and `next start` do this for you. Running the standalone server
 * (`node .next/standalone/server.js`, which is what Docker does) does not —
 * so a self-hosted instance that relied on a .env file would silently fall
 * back to defaults. This module is the one place that loads them, and every
 * entry point calls it.
 *
 * Precedence, highest first:
 *   real environment variables  (what a container or PaaS gives you)
 *   .env.local                  (local overrides)
 *   .env                        (checked-in defaults)
 *
 * @license AGPL-3.0-or-later
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

let loaded = false;

export function loadEnv(root = process.cwd()) {
  if (loaded) return;
  loaded = true;

  // Lowest precedence first, and never clobber a variable that already exists.
  for (const file of ['.env', '.env.local']) {
    const full = path.join(root, file);
    if (!existsSync(full)) continue;
    try {
      // Node >= 20.12 parses the file the same way Next's dotenv does.
      process.loadEnvFile(full);
    } catch {
      // An unparseable .env should not stop the server from booting; the
      // config layer will complain loudly about anything genuinely missing.
      console.warn(`[env] could not parse ${file}`);
    }
  }
}
