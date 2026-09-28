/**
 * Start the production server.
 *
 * `next build` produces a standalone server under .next/standalone when
 * `output: 'standalone'` is set — that is what the Docker image runs. For a
 * plain checkout with no standalone output, fall back to `next start`.
 *
 * One subtlety that bit us: the standalone server has to run with its own
 * directory as cwd (that is where Next copies `public/` and `.next/static`),
 * so any *relative* path in the environment would silently resolve against
 * .next/standalone instead of the checkout.
 * against the project root before the process starts.
 *
 * @license AGPL-3.0-or-later
 */

import { existsSync, cpSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './load-env.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The standalone server does not read .env files by itself — that is normally
// next CLI's job — so do it before anything spawns.
loadEnv(root);
const standaloneDir = path.join(root, '.next', 'standalone');
const entry = path.join(standaloneDir, 'server.js');

const port = process.env.PORT ?? '3000';
const host = process.env.HOST ?? '0.0.0.0';

if (existsSync(entry)) {
  // The database is a remote Postgres, so there is nothing to pin or create
  // here any more — the old code existed to keep a SQLite file from being
  // created inside .next/standalone, where every build would delete it.

  // Next does not copy these into the standalone output; the Dockerfile does it
  // explicitly, but a plain `next build` here needs the same two lines.
  const staticSrc = path.join(root, '.next', 'static');
  const staticDest = path.join(standaloneDir, '.next', 'static');
  if (existsSync(staticSrc) && !existsSync(staticDest)) {
    mkdirSync(path.dirname(staticDest), { recursive: true });
    cpSync(staticSrc, staticDest, { recursive: true });
  }
  const publicSrc = path.join(root, 'public');
  if (existsSync(publicSrc) && !existsSync(path.join(standaloneDir, 'public'))) {
    cpSync(publicSrc, path.join(standaloneDir, 'public'), { recursive: true });
  }
  const child = spawn(process.execPath, [entry], {
    stdio: 'inherit',
    cwd: standaloneDir,
    env: { ...process.env, PORT: port, HOSTNAME: host },
  });
  child.on('exit', (code) => process.exit(code ?? 0));
} else {
  // No standalone output: fall back to `next start`, but never via bare `npx`.
  // `npx next start` resolves "next" from the registry when it is not installed
  // locally, so a checkout without node_modules would silently download and run
  // a different major version of the framework than this app was built against.
  const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
  if (!existsSync(nextBin)) {
    console.error(
      'UnNGL: no standalone build in .next/standalone, and next is not installed.\n' +
        'Run `npm install` and `npm run build` first, or use the Docker image.',
    );
    process.exit(1);
  }
  const result = spawnSync(process.execPath, [nextBin, 'start', '-H', host, '-p', port], {
    stdio: 'inherit',
    cwd: root,
  });
  process.exit(result.status ?? 0);
}
