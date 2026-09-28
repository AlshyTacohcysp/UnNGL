/**
 * Startup configuration audit.
 *
 * Most "secure by default" claims in a README are really claims about a
 * deployment someone got right once. This runs at boot and says out loud when
 * an instance is running with a setting that weakens it, so the failure is
 * visible in the logs rather than discovered later.
 *
 * @license AGPL-3.0-or-later
 */

import { config } from './config';

let done = false;

/**
 * Refuse to run in production without a real SESSION_SECRET.
 *
 * This used to be a lazy getter that threw the first time a login was attempted.
 * That was worse than useless: the server booted, every page rendered, and the
 * first person to try to sign in was told "Something went wrong on our side.
 * Nothing you sent was lost" — which is both false and useless to whoever has to
 * fix it. A missing secret is an operator error, and it should read like one.
 */
function requireProductionSecret(): void {
  if (!config.isProd) return;
  if (config.allowInsecureDefaults) return;
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length > 0) return;
  throw new Error(
    [
      '',
      '  UnNGL cannot start: SESSION_SECRET is not set.',
      '',
      '  Every session cookie, login code and claim token is an HMAC of this value.',
      '  Without it, nobody can sign in and nothing can be verified.',
      '',
      '  Generate one and put it in your .env:',
      '',
      '      openssl rand -base64 48',
      '',
      '  or, with no openssl:',
      '',
      '      node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64\'))"',
      '',
      '  See .env.example. To run a throwaway instance on purpose, set',
      '  ALLOW_INSECURE_DEFAULTS=1 — and understand exactly what that gives away.',
      '',
    ].join('\n'),
  );
}

export function auditConfig(): void {
  requireProductionSecret();
  if (done) return;
  done = true;

  const problems: string[] = [];
  const notes: string[] = [];

  if (config.isProd) {
    if (config.mail.transport === 'console') {
      problems.push(
        'MAIL_TRANSPORT=console in production: login codes are only written to the ' +
          'server log and never emailed. Set MAIL_TRANSPORT=smtp and configure SMTP, ' +
          'or nobody will be able to sign in from outside this machine.',
      );
    }
    if (config.trustProxy) {
      notes.push(
        'TRUSTED_PROXY=1: X-Forwarded-For is trusted. Only enable this when a proxy ' +
          'you control is the sole path to the app, or rate limits can be bypassed.',
      );
    }
    if (config.exposeDevCodes) {
      problems.push('EXPOSE_DEV_CODES is set in production — login codes would be returned to callers.');
    }
    if (config.sessionSecret.startsWith('dev-only')) {
      problems.push('SESSION_SECRET still has its development default.');
    }
    if (config.sessionDays > 365) {
      problems.push(`SESSION_DAYS is ${config.sessionDays}; a year or less is plenty.`);
    }
    if (!config.origin.startsWith('https://')) {
      problems.push(
        `NEXT_PUBLIC_ORIGIN is ${config.origin} — session cookies will not be marked ` +
          'Secure and OAuth redirects will be plain HTTP.',
      );
    }

    // HSTS is baked in at build time, so the running server cannot simply read
    // ENABLE_HSTS: by the time it is running, next.config has been consumed by
    // the build and the standalone output does not carry it. UNNGL_HSTS is the
    // decision as it was actually compiled in, so these warnings describe the
    // server that is running rather than the one that was configured.
    const hsts = process.env.UNNGL_HSTS === '1';
    if (hsts && !config.origin.startsWith('https://')) {
      problems.push(
        `HSTS is compiled in but NEXT_PUBLIC_ORIGIN is ${config.origin}. Browsers will ` +
          'refuse to reach this site over plain HTTP. Either serve it on HTTPS or ' +
          'rebuild with ENABLE_HSTS unset.',
      );
    }
    if (!hsts && config.origin.startsWith('https://')) {
      notes.push(
        'HSTS is off. That is the right default until the domain is permanently HTTPS, ' +
          'but a browser will not be told to refuse plaintext. Enable it with ' +
          'ENABLE_HSTS=1 and rebuild — it is a build-time setting.',
      );
    }
  }

  for (const note of notes) console.warn(`[config] note: ${note}`);
  for (const problem of problems) console.error(`[config] WARNING: ${problem}`);
  if (problems.length === 0 && !config.isProd) {
    console.log('[config] development mode: login codes are printed to this log.');
  }
}

/**
 * Warn if the session secret is weak. Not enforced — an operator may have a
 * reason — but 32 bytes of entropy is the documented recommendation.
 */
export function auditSecretStrength(): void {
  if (!config.isProd) return;
  const secret = process.env.SESSION_SECRET;
  if (!secret || config.allowInsecureDefaults) return;
  if (secret.length < 32) {
    console.error(
      `[config] WARNING: SESSION_SECRET is ${secret.length} characters; ` +
        'use at least 32 (e.g. openssl rand -base64 48).',
    );
  }
}
