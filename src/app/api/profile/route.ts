/**
 * GET   /api/profile — session summary for the settings screen
 * PATCH /api/profile — display name
 *
 * Account deletion lives at DELETE /api/account.
 *
 * @license AGPL-3.0-or-later
 */

import { get } from '@/lib/db';
import { currentUserId, findUserById, setDisplayName } from '@/lib/auth';
import { fail, ok, route } from '@/lib/http';
import { profileSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = route('profile.update', async (req: Request) => {
  const userId = await currentUserId();
  if (!userId) return fail('Sign in first.', 401);

  const parsed = profileSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail('Invalid request');
  if (parsed.data.displayName) setDisplayName(userId, parsed.data.displayName);
  return ok({ displayName: parsed.data.displayName ?? null });
});

/** GET /api/profile — session summary for the settings screen. */
export const GET = route('profile.get', async () => {
  const userId = await currentUserId();
  if (!userId) return fail('Sign in first.', 401);
  const user = findUserById(userId)!;
  const inboxCount = get<{ n: number }>('SELECT COUNT(*) AS n FROM inboxes WHERE owner_id = ?', userId);
  return ok({
    user: {
      id: user.id,
      email: user.email,
      verified: Boolean(user.email_verified_at),
      displayName: user.display_name,
      palette: user.avatar_palette ? JSON.parse(user.avatar_palette) : null,
    },
    inboxes: Number(inboxCount?.n ?? 0),
  });
});
