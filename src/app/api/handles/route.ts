/**
 * POST /api/handles — claim or change an inbox's name.
 *
 * { inboxId: "...", handle: "amina.k" }
 *
 * The unique index decides, not this handler. Everything here is a guard rail
 * in front of it: sign in, own the inbox, pass the reserved-name and shape
 * rules, and keep the request inside the rate limit so nobody can grind
 * through the name space.
 *
 * @license AGPL-3.0-or-later
 */

import { currentUserId } from '@/lib/auth';
import { claimHandle, getInboxById } from '@/lib/inbox';
import { clientIp, fail, ok, route } from '@/lib/http';
import { hit } from '@/lib/ratelimit';
import { config } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route('handles.claim', async (req: Request) => {
  const userId = await currentUserId();
  if (!userId) return fail('Sign in to pick a name.', 401);

  if (!(await hit('create', `handle:${userId}`, 10)).ok) {
    return fail('You have renamed enough for now. Try again later.', 429);
  }
  if (!(await hit('handle', `ip:${await clientIp()}`, 30)).ok) {
    return fail('Slow down a moment.', 429);
  }

  const body = (await req.json().catch(() => ({}))) as { inboxId?: unknown; handle?: unknown };
  const inboxId = typeof body.inboxId === 'string' ? body.inboxId : '';
  const raw = typeof body.handle === 'string' ? body.handle : '';
  if (!inboxId || !raw) return fail('Missing inbox or name.', 400);

  // Ownership is checked here rather than inferred from the route, because
  // the inbox id is supplied by the client and is not a credential.
  const inbox = await getInboxById(inboxId);
  if (!inbox || inbox.owner_id !== userId) return fail('No such inbox.', 404);

  const result = await claimHandle(inboxId, raw);
  if (!result.ok) {
    // 409 for a name that is syntactically fine but already spoken for, 400
    // for one that is not a name at all. The client shows `message`.
    const status = result.check.problem === 'taken' ? 409 : 400;
    return fail(result.check.message ?? 'That name will not work.', status, {
      reason: result.check.problem,
    });
  }

  const fresh = await getInboxById(inboxId);
  return ok({
    inbox: {
      handle: result.handle,
      slug: inbox.slug,
      // The public address is the handle once there is one, and the slug
      // otherwise, so a link copied from here always resolves.
      url: `${config.origin}/${result.handle}`,
    },
    replaced: result.replaced,
  });
});
