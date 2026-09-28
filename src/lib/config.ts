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

export const config = {
  get env() {
    return process.env.NODE_ENV ?? 'development';
  },
  get isProd() {
    return process.env.NODE_ENV === 'production';
  },
  /** Public origin, used for links in emails and OAuth redirects. */
  get origin() {
    return (process.env.NEXT_PUBLIC_ORIGIN ?? 'http://localhost:3000').replace(/\/+$/, '');
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
  get siteUrl() {
    return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://unngl.link';
  },
  get contactEmail() {
    return process.env.CONTACT_EMAIL ?? 'hello@unngl.link';
  },
};

export type Config = typeof config;
