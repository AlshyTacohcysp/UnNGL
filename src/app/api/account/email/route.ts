/**
 * POST /api/account/email — send a code to add an email to the current account
 * POST /api/account/email/verify — confirm it
 *
 * @license AGPL-3.0-or-later
 */

import { z } from 'zod';
import {
  addEmailToUser,
  consumeLoginCode,
  currentUserId,
  findUserByEmail,
  issueLoginCode,
} from '@/lib/auth';
import { buildLoginMail, sendLoginCode } from '@/lib/mail';
import { fail, ok, route } from '@/lib/http';
import { emailSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const codeSchema = z.object({
  email: emailSchema,
  code: z.string().trim().regex(/^\d{6}$/, 'The code is 6 digits'),
});

export const POST = route('account.email.add', async (req: Request) => {
  const userId = await currentUserId();
  if (!userId) return fail('Sign in first.', 401);

  const body = await req.json().catch(() => null);
  const parsed = emailSchema.safeParse((body as { email?: string } | null)?.email);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid email');

  const clash = findUserByEmail(parsed.data);
  if (clash && clash.id !== userId) {
    return fail('That email is already used by another account.');
  }

  const { code } = issueLoginCode(parsed.data, 'add_email');
  const mail = buildLoginMail(parsed.data, code);
  const transport = await sendLoginCode(parsed.data, code, mail.url);
  return ok({ sent: true, transport, devCode: transport === 'console' ? code : undefined });
});

export const PUT = route('account.email.verify', async (req: Request) => {
  const userId = await currentUserId();
  if (!userId) return fail('Sign in first.', 401);

  const body = await req.json().catch(() => null);
  const parsed = codeSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid request');

  const result = consumeLoginCode(parsed.data.email, parsed.data.code, 'add_email');
  if (result.status !== 'ok') return fail('That code is not right, or it has expired.');

  try {
    addEmailToUser(userId, parsed.data.email);
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Could not add that email');
  }
  return ok({ email: parsed.data.email, verified: true });
});
