/**
 * PATCH /api/inboxes/[slug] — rename, toggle notifications, rotate the link,
 *                            or delete the inbox and everything in it.
 * Owner only.
 *
 * @license AGPL-3.0-or-later
 */

import {
  getInboxBySlug,
  listMessages,
  rotateInboxSlug,
  renameInbox,
  softDeleteInbox,
} from '@/lib/inbox';
import { currentUserId, findUserById } from '@/lib/auth';
import { config } from '@/lib/config';
import { fail, ok, route } from '@/lib/http';
import { inboxPatchSchema } from '@/lib/validation';
import { sendNewMessageNotice } from '@/lib/mail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ slug: string }> };

export const PATCH = route('inboxes.patch', async (req: Request, ctx: Ctx) => {
  const { slug } = await ctx.params;
  const userId = await currentUserId();
  if (!userId) return fail('Sign in first.', 401);

  const inbox = getInboxBySlug(slug);
  if (!inbox) return fail('Inbox not found', 404);
  if (inbox.owner_id !== userId) return fail('That is not your inbox.', 403);

  const parsed = inboxPatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail('Invalid request');
  const { title, notify, rotate, delete: remove } = parsed.data;

  if (remove) {
    softDeleteInbox(inbox.id);
    return ok({ deleted: true });
  }

  const nextTitle = title ?? inbox.title;
  const nextNotify = notify ?? inbox.notify === 1;
  renameInbox(inbox.id, nextTitle, nextNotify);

  // Rotating kills the old link the instant it changes: that is the point.
  const currentSlug = rotate ? rotateInboxSlug(inbox.id) : inbox.slug;

  if (nextNotify && !inbox.notify) {
    const user = findUserById(userId);
    if (user?.email && user.email_verified_at) {
      const unread = listMessages(inbox.id).filter((m) => !m.seen).length;
      if (unread > 0) {
        await sendNewMessageNotice(user.email, nextTitle, `${config.origin}/i/${currentSlug}`, unread).catch(
          (err) => console.error('[inboxes] notice failed', err),
        );
      }
    }
  }

  return ok({ inbox: { slug: currentSlug, title: nextTitle, url: `${config.origin}/${currentSlug}` } });
});
