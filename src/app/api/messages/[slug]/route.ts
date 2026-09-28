/**
 * GET  /api/messages/[slug] — read an inbox (the link is the credential)
 * DELETE /api/messages/[slug] — delete a message
 *
 * @license AGPL-3.0-or-later
 */

import { getInboxBySlug, deleteMessage, getMessage, listMessages, markAllSeen, markSeen } from '@/lib/inbox';
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

  const messages = listMessages(inbox.id);
  // Opening the inbox is what marks it read; no separate "read" round trip.
  if (messages.some((m) => !m.seen)) markAllSeen(inbox.id);
  return ok({
    inbox: { title: inbox.title, slug: inbox.slug, createdAt: inbox.created_at },
    messages,
  });
});

export const DELETE = route('messages.delete', async (req: Request, ctx: Ctx) => {
  const { slug } = await ctx.params;
  const inbox = getInboxBySlug(slug);
  if (!inbox) return fail('That link has expired or never existed.', 404);

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return fail('Missing message id');
  const message = getMessage(id);
  if (!message || message.inbox_id !== inbox.id) return fail('Message not found', 404);

  deleteMessage(id);
  return ok({ deleted: id });
});

/** POST /api/messages/[slug]?id=… — mark a single message read. */
export const POST = route('messages.seen', async (req: Request, ctx: Ctx) => {
  const { slug } = await ctx.params;
  const inbox = getInboxBySlug(slug);
  if (!inbox) return fail('That link has expired or never existed.', 404);
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return fail('Missing message id');
  const message = getMessage(id);
  if (!message || message.inbox_id !== inbox.id) return fail('Message not found', 404);
  markSeen(id);
  return ok({ seen: id });
});
