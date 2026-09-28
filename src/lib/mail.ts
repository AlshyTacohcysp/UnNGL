/**
 * Outbound email: a 6-digit login code, and nothing else.
 *
 * UnNGL does not send marketing mail, does not sell or share addresses, and
 * has no unsubscribe flow because it has no mailing list. There are two
 * transports: `console` (prints to the server log — the default, so a fresh
 * install works instantly) and a dependency-free `smtp` client.
 *
 * @license AGPL-3.0-or-later
 */

import tls from 'node:tls';
import net from 'node:net';
import { config } from './config';

export interface LoginMail {
  code: string;
  url: string;
}

export function buildLoginMail(email: string, code: string): LoginMail {
  // One link that both signs in and degrades gracefully: it lands on the code
  // step with everything pre-filled, so the email works even if the 6-digit
  // code is what someone actually types.
  const url = `${config.origin}/login?email=${encodeURIComponent(email)}&code=${code}`;
  return { code, url };
}

export async function sendLoginCode(email: string, code: string, url: string): Promise<'console' | 'smtp'> {
  const { transport } = config.mail;
  if (transport === 'smtp') {
    await sendSmtp({
      to: email,
      subject: `${code} is your UnNGL code`,
      text: [
        `Your UnNGL login code is ${code}`,
        '',
        `Or open your inbox directly: ${url}`,
        '',
        'The code expires in 10 minutes. If you did not ask to sign in, ignore this',
        'message — nobody can see your inbox without the link.',
      ].join('\n'),
    });
    return 'smtp';
  }

  // Development / self-host default: no SMTP configured, so surface the code
  // where the operator can see it instead of silently failing.
  console.log(
    [
      '',
      '┌─ UnNGL login code ─────────────────────────────────',
      `│ to:   ${email}`,
      `│ code: ${code}`,
      `│ link: ${url}`,
      '└────────────────────────────────────────────────────',
      '',
    ].join('\n'),
  );
  return 'console';
}

export async function sendNewMessageNotice(
  to: string,
  inboxTitle: string,
  inboxUrl: string,
  count: number,
): Promise<void> {
  if (config.mail.transport !== 'smtp') return;
  await sendSmtp({
    to,
    subject: count === 1 ? 'You got a message on UnNGL' : `You got ${count} messages on UnNGL`,
    text: [
      `New anonymous message${count === 1 ? '' : 's'} in "${inboxTitle}".`,
      '',
      inboxUrl,
      '',
      'Anyone with the link can read and delete these messages, and so can you.',
      'The hint attached to a message is only the sender\'s colour palette — never their photo.',
    ].join('\n'),
  });
}

/* ------------------------------------------------------------------ *
 * A very small SMTP client (AUTH LOGIN / PLAIN, no dependencies)
 * ------------------------------------------------------------------ */

interface SmtpMessage {
  to: string;
  subject: string;
  text: string;
}

function encodeHeader(value: string): string {
  // Header injection guard: CR/LF must never reach the wire.
  return value.replace(/[\r\n]+/g, ' ').trim();
}

async function sendSmtp(msg: SmtpMessage): Promise<void> {
  const { host, port, user, pass, secure } = config.mail.smtp;
  if (!host) throw new Error('SMTP_HOST is not set but MAIL_TRANSPORT=smtp');

  const socket = secure
    ? tls.connect({ host, port, servername: host })
    : net.connect({ host, port });
  socket.setTimeout(15_000);

  const reader = createLineReader(socket);
  const expect = async (codes: string[]) => {
    const line = await reader.read();
    if (!codes.some((c) => line.startsWith(c))) {
      throw new Error(`SMTP: unexpected reply "${line}"`);
    }
  };
  const command = async (text: string, codes: string[]) => {
    socket.write(`${text}\r\n`);
    await expect(codes);
  };

  await new Promise<void>((resolve, reject) => {
    socket.once('secureConnect', () => resolve());
    socket.once('connect', () => resolve());
    socket.once('error', reject);
  });
  await expect(['220']);

  await command('EHLO unngl.link', ['250']);
  if (user) {
    await command('AUTH LOGIN', ['334']);
    await command(Buffer.from(user).toString('base64'), ['334']);
    await command(Buffer.from(pass).toString('base64'), ['235']);
  }
  await command('MAIL FROM:<no-reply@unngl.link>', ['250']);
  await command(`RCPT TO:<${encodeHeader(msg.to).replace(/[<>\s]/g, '')}>`, ['250', '251']);
  await command('DATA', ['354']);

  const body = [
    `From: ${encodeHeader(config.mail.from)}`,
    `To: ${encodeHeader(msg.to)}`,
    `Subject: ${encodeHeader(msg.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Auto-Submitted: auto-generated',
    '',
    msg.text,
  ].join('\r\n');
  socket.write(`${body}\r\n.\r\n`);
  await expect(['250']);
  await command('QUIT', ['221', '250']);
  socket.end();
}

/** Turn a socket into an awaitable stream of SMTP reply lines. */
function createLineReader(socket: net.Socket) {
  let buffer = '';
  let waiter: ((line: string) => void) | null = null;
  let failure: ((err: Error) => void) | null = null;

  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).replace(/\r$/, '');
      buffer = buffer.slice(idx + 1);
      const resolve = waiter;
      waiter = null;
      resolve?.(line);
    }
  });
  socket.on('error', (err) => {
    const reject = failure;
    failure = null;
    reject?.(err);
  });
  socket.on('close', () => {
    const reject = failure;
    failure = null;
    reject?.(new Error('SMTP connection closed'));
  });

  return {
    read(): Promise<string> {
      const idx = buffer.indexOf('\n');
      if (idx >= 0) {
        const line = buffer.slice(0, idx).replace(/\r$/, '');
        buffer = buffer.slice(idx + 1);
        return Promise.resolve(line);
      }
      return new Promise<string>((resolve, reject) => {
        waiter = resolve;
        failure = reject;
      });
    },
  };
}
