/**
 * POST /api/auth/email — issue a login code.
 *
 * Always answers 200 with the same shape, whether or not the address is known,
 * so this endpoint can't be used to enumerate accounts.
 *
 * @license AGPL-3.0-or-later
 */

import { issueLoginCode, pruneLoginTokens } from '@/lib/auth';
import { buildLoginMail, sendLoginCode } from '@/lib/mail';
import { hit } from '@/lib/ratelimit';
import { clientIp, fail, ok, route } from '@/lib/http';
import { config } from '@/lib/config';
import { loginRequestSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route('auth.email', async (req: Request) => {
  const ip = await clientIp();
  const limit = hit('login', ip, config.limits.loginAttemptsPerIpPer15Min);
  if (!limit.ok) {
    return fail('Too many attempts. Try again in a few minutes.', 429, {
      retryAfter: limit.retryAfterSeconds,
    });
  }

  const body = await req.json().catch(() => null);
  const parsed = loginRequestSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid request');

  const limitPerAddress = hit('login', `addr:${parsed.data.email}`, 5);
  if (!limitPerAddress.ok) return fail('Too many codes requested for this address.', 429);

  pruneLoginTokens();
  const { code } = issueLoginCode(parsed.data.email, 'login');
  const mail = buildLoginMail(parsed.data.email, code);
  await sendLoginCode(parsed.data.email, code, mail.url);

  return ok({
    sent: true,
    // The code itself is only ever returned when the operator has explicitly
    // opted in on a non-production deployment. See config.exposeDevCodes.
    devCode: config.exposeDevCodes ? code : undefined,
    expiresInSeconds: 600,
  });
});
