/**
 * POST /api/inboxes — create a shareable inbox (sign-in required)
 *
 * @license AGPL-3.0-or-later
 */

import { config } from '@/lib/config';
import { createInbox, inboxCountForUser } from '@/lib/inbox';
import { currentUserId } from '@/lib/auth';
import { clientIp, fail, ok, route } from '@/lib/http';
import { hit } from '@/lib/ratelimit';
import { inboxSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route('inboxes.create', async (req: Request) => {
  const userId = await currentUserId();
  if (!userId) return fail('Sign in to create an inbox.', 401);

  if (inboxCountForUser(userId) >= config.limits.inboxesPerUser) {
    return fail(`You already have ${config.limits.inboxesPerUser} inboxes. Delete one to make another.`, 429);
  }
  if (!hit('create', userId, 20).ok) return fail('Slow down a moment.', 429);
  if (!hit('create', `ip:${await clientIp()}`, 60).ok) return fail('Slow down a moment.', 429);

  const body = await req.json().catch(() => ({}));
  const parsed = inboxSchema.safeParse(body ?? {});
  const title = parsed.success && parsed.data.title ? parsed.data.title : 'My messages';

  const inbox = createInbox(userId, title);
  return ok({ inbox: { slug: inbox.slug, title: inbox.title, url: `${config.origin}/${inbox.slug}` } }, 201);
});
