/**
 * GET /api/handles/check?handle=amina.k — is this name free?
 *
 * Answers the question the settings field asks as you type. It is signed in
 * only, because the only person who needs the answer is the one about to
 * claim the name, and an open oracle here would let anyone map which names
 * exist without creating anything.
 *
 * @license AGPL-3.0-or-later
 */

import { currentUserId } from '@/lib/auth';
import { handleIsTaken } from '@/lib/inbox';
import { clientIp, ok, route } from '@/lib/http';
import { hit } from '@/lib/ratelimit';
import { validateHandle } from '@/lib/handle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route('handles.check', async (req: Request) => {
  const userId = await currentUserId();
  if (!userId) return ok({ available: false, reason: 'unauthenticated' });

  // Typing a handle produces one request per keystroke, so the per-user
  // budget is generous; the per-IP one is not, because that is what a
  // script would use.
  if (!(await hit('handle', userId, 120)).ok) return ok({ available: false, reason: 'rate' });
  if (!(await hit('handle', `ip:${await clientIp()}`, 200)).ok) {
    return ok({ available: false, reason: 'rate' });
  }

  const raw = new URL(req.url).searchParams.get('handle') ?? '';
  const check = validateHandle(raw);

  // An invalid name is answered as unavailable with the reason attached, so
  // the field can explain itself; the client still re-validates on submit,
  // because nothing a browser says is authoritative.
  if (!check.ok) return ok({ available: false, reason: check.problem, message: check.message });

  const taken = await handleIsTaken(check.handle!);
  return ok({ available: !taken, reason: taken ? 'taken' : undefined, handle: check.handle });
});
