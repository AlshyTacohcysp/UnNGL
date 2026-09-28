/**
 * GET    /api/messages/[slug] — read an inbox (the link is the credential)
 * POST   /api/messages/[slug]?id=… — mark one message read
 * DELETE /api/messages/[slug]?id=… — delete one message (owner only)
 *
 * Reading is open to anyone with the link, because that is the product: a
 * shared link *is* the inbox. Deleting is not — it destroys data irreversibly,
 * so it requires the owner's session. An earlier version allowed deletion by
 * link alone, which meant anyone who ever saw a shared link could wipe it.
 *
 * @license AGPL-3.0-or-later
 */

import { getInboxBySlug, deleteMessage, getMessage, listMessages, markSeen } from '@/lib/inbox';
import { currentUserId } from '@/lib/auth';
import { fail, ok, route } from '@/lib/http';
import { maybePurge } from '@/lib/images';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ slug: string }> };

export const GET = route('messages.list', async (_req: Request, ctx: Ctx) => {
  maybePurge();
  const { slug } = await ctx.params;
  const inbox = getInboxBySlug(slug);
  if (!inbox) return fail('That link has expired or never existed.', 404);

  // GET is deliberately side-effect free: a cross-site <img> pointing here must
  // not be able to mark someone's messages as read. Marking happens on the
  // server when the owner opens the page, or via the POST below.
  return ok({
    inbox: { title: inbox.title, slug: inbox.slug, createdAt: inbox.created_at },
    messages: listMessages(inbox.id),
  });
});

export const DELETE = route('messages.delete', async (req: Request, ctx: Ctx) => {
  const { slug } = await ctx.params;
  const inbox = getInboxBySlug(slug);
  if (!inbox) return fail('That link has expired or never existed.', 404);

  const userId = await currentUserId();
  if (!userId || inbox.owner_id !== userId) {
    return fail('Only the owner of this inbox can delete messages.', 403);
  }

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return fail('Missing message id');
  const message = getMessage(id);
  if (!message || message.inbox_id !== inbox.id) return fail('Message not found', 404);

  deleteMessage(id);
  return ok({ deleted: id });
});

/** POST /api/messages/[slug]?id=… — mark a single message read. */
export const POST = route('messages.seen', async (_req: Request, ctx: Ctx) => {
  const { slug } = await ctx.params;
  const inbox = getInboxBySlug(slug);
  if (!inbox) return fail('That link has expired or never existed.', 404);
  const id = new URL(_req.url).searchParams.get('id');
  if (!id) return fail('Missing message id');
  const message = getMessage(id);
  if (!message || message.inbox_id !== inbox.id) return fail('Message not found', 404);
  markSeen(id);
  return ok({ seen: id });
});
