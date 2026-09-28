/**
 * Runtime configuration. Every value has a safe development default so the app
 * runs with zero setup, and every secret must be set explicitly in production.
 *
 * @license AGPL-3.0-or-later
 */

import path from 'node:path';

const bool = (v: string | undefined, dflt: boolean) =>
  v === undefined ? dflt : /^(1|true|yes|on)$/i.test(v);

function required(name: string, dflt: string): string {
  const v = process.env[name];
  if (v && v.length > 0) return v;
  if (process.env.NODE_ENV === 'production' && !ALLOW_INSECURE_DEFAULTS) {
    throw new Error(
      `Missing required environment variable ${name}. See .env.example. ` +
        `Set ALLOW_INSECURE_DEFAULTS=1 only if you understand the risk.`,
    );
  }
  return dflt;
}

const ALLOW_INSECURE_DEFAULTS = bool(process.env.ALLOW_INSECURE_DEFAULTS, false);

/**
 * Read an environment variable without letting Next.js inline it at build time.
 *
 * Next rewrites the literal expression `process.env.NEXT_PUBLIC_ORIGIN` into a
 * string constant during the build — in the server bundle as well as the
 * client one. So a self-hoster who set their domain in .env and restarted got
 * every email link, OAuth callback and CSRF origin check still pointing at
 * whatever was configured when the image was built. It looked configured, it
 * audited as configured, and it was wrong.
 *
 * The name is spelled as a computed key precisely so it does not match, which
 * keeps the documented variable name working as a genuine runtime setting. This
 * value is never needed in the browser, so nothing is lost by not inlining it.
 */
function runtimeEnv(name: string): string | undefined {
  return (process.env as Record<string, string | undefined>)[name];
}

export const config = {
  get env() {
    return process.env.NODE_ENV ?? 'development';
  },
  get isProd() {
    return process.env.NODE_ENV === 'production';
  },
  /**
   * Public origin: the site as users reach it. Used for links in emails, OAuth
   * redirect URIs, and the same-origin check. Set it at runtime, in .env.
   */
  get origin() {
    const raw = runtimeEnv('NEXT_PUBLIC_' + 'ORIGIN') ?? 'http://localhost:3000';
    return raw.replace(/\/+$/, '');
  },
  get databasePath() {
    return process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'unngl.sqlite');
  },
  get sessionSecret() {
    return required('SESSION_SECRET', 'dev-only-insecure-session-secret-change-me');
  },
  get sessionDays() {
    return Number(process.env.SESSION_DAYS ?? 30);
  },
  get mail() {
    return {
      /** 'console' prints the login code to the server log; 'smtp' sends it. */
      transport: (process.env.MAIL_TRANSPORT ?? 'console') as 'console' | 'smtp',
      from: process.env.MAIL_FROM ?? 'UnNGL <no-reply@unngl.link>',
      smtp: {
        host: process.env.SMTP_HOST ?? '',
        port: Number(process.env.SMTP_PORT ?? 587),
        user: process.env.SMTP_USER ?? '',
        pass: process.env.SMTP_PASS ?? '',
        secure: bool(process.env.SMTP_SECURE, false),
      },
    };
  },
  get oauth() {
    return {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      },
      github: {
        clientId: process.env.GITHUB_CLIENT_ID ?? '',
        clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
      },
      discord: {
        clientId: process.env.DISCORD_CLIENT_ID ?? '',
        clientSecret: process.env.DISCORD_CLIENT_SECRET ?? '',
      },
      instagram: {
        clientId: process.env.INSTAGRAM_CLIENT_ID ?? '',
        clientSecret: process.env.INSTAGRAM_CLIENT_SECRET ?? '',
      },
    };
  },
  /**
   * Whether a login code may be returned in the API response so the sign-in
   * form can display it.
   *
   * This is a development convenience and a serious hazard if it ever turns on
   * in production: the response would hand a working login code to whoever asked
   * for one, for any address, which is account takeover for anyone whose email is
   * known. It therefore needs an explicit opt-in *and* a non-production
   * NODE_ENV *and* the console transport.
   */
  get exposeDevCodes() {
    return !this.isProd && process.env.EXPOSE_DEV_CODES === '1' && this.mail.transport === 'console';
  },
  /**
   * Escape hatch for a throwaway instance: use the development default for
   * SESSION_SECRET in production. Every HMAC in the app is then derived from a
   * value that is published in the source, so it is only ever acceptable on a
   * machine you control, reachable by nobody else.
   */
  get allowInsecureDefaults() {
    return ALLOW_INSECURE_DEFAULTS;
  },
  /**
   * Whether to believe X-Forwarded-For and friends. Off by default: if the app
   * is reachable directly, a client can put whatever it likes in those headers
   * and walk straight through every per-IP rate limit.
   */
  get trustProxy() {
    return bool(process.env.TRUSTED_PROXY, false);
  },
  limits: {
    /** Uploads: decoded pixels are capped so a bomb can't exhaust memory. */
    maxImageBytes: Number(process.env.MAX_IMAGE_BYTES ?? 2 * 1024 * 1024),
    maxImageEdge: Number(process.env.MAX_IMAGE_EDGE ?? 1024),
    /** Messages. */
    maxMessageChars: Number(process.env.MAX_MESSAGE_CHARS ?? 1000),
    /** Anti-abuse, per IP. */
    sendsPerInboxPerHour: Number(process.env.SENDS_PER_INBOX_PER_HOUR ?? 10),
    sendsPerIpPerHour: Number(process.env.SENDS_PER_IP_PER_HOUR ?? 30),
    inboxesPerUser: Number(process.env.INBOXES_PER_USER ?? 5),
    loginAttemptsPerIpPer15Min: Number(process.env.LOGIN_ATTEMPTS_PER_IP ?? 10),
    mediaFetchesPerIpPerHour: Number(process.env.MEDIA_FETCHES_PER_IP_PER_HOUR ?? 30),
  },
  get retentionDays() {
    return Number(process.env.HINT_IMAGE_RETENTION_DAYS ?? 7);
  },
  get contactEmail() {
    return process.env.CONTACT_EMAIL ?? 'hello@unngl.link';
  },
};

export type Config = typeof config;
