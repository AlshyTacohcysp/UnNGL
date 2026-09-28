/**
 * POST /api/inboxes — create a shareable inbox (sign-in required)
 *
 * @license AGPL-3.0-or-later
 */

import { config } from '@/lib/config';
import { claimHandle, createInbox, inboxCountForUser } from '@/lib/inbox';
import { currentUserId } from '@/lib/auth';
import { clientIp, fail, ok, route } from '@/lib/http';
import { hit } from '@/lib/ratelimit';
import { inboxSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route('inboxes.create', async (req: Request) => {
  const userId = await currentUserId();
  if (!userId) return fail('Sign in to create an inbox.', 401);

  if (await inboxCountForUser(userId) >= config.limits.inboxesPerUser) {
    return fail(`You already have ${config.limits.inboxesPerUser} inboxes. Delete one to make another.`, 429);
  }
  if (!(await hit('create', userId, 20)).ok) return fail('Slow down a moment.', 429);
  if (!(await hit('create', `ip:${await clientIp()}`, 60)).ok) return fail('Slow down a moment.', 429);

  const body = await req.json().catch(() => ({}));
  const parsed = inboxSchema.safeParse(body ?? {});
  const title = parsed.success && parsed.data.title ? parsed.data.title : 'My messages';

  const inbox = await createInbox(userId, title);

  // A name offered at creation is a convenience, not a condition: if it is
  // taken or malformed the inbox still exists and still works by slug, so a
  // name someone else already has never costs them their link.
  let handle: string | null = null;
  const wanted = typeof (body as { handle?: unknown }).handle === 'string'
    ? String((body as { handle: string }).handle)
    : '';
  if (wanted.trim()) {
    const claimed = await claimHandle(inbox.id, wanted);
    handle = claimed.ok ? claimed.handle : null;
  }

  return ok(
    {
      inbox: {
        // The id is returned to the signed-in creator so a client can claim a
        // handle for this inbox. It is not a credential: every handle
        // endpoint re-checks that the caller owns the inbox it names.
        id: inbox.id,
        slug: inbox.slug,
        handle,
        title: inbox.title,
        url: `${config.origin}/${handle ?? inbox.slug}`,
      },
      handleRejected: wanted.trim() && handle === null ? true : undefined,
    },
    201,
  );
});
