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

export function auditConfig(): void {
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
  if (config.sessionSecret.length < 32) {
    console.error(
      `[config] WARNING: SESSION_SECRET is ${config.sessionSecret.length} characters; ` +
        'use at least 32 (e.g. openssl rand -base64 48).',
    );
  }
}

