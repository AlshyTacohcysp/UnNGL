/**
 * POST   /api/avatar — set the signed-in user's avatar (PNG, client-transcoded)
 * DELETE /api/avatar — remove it
 *
 * @license AGPL-3.0-or-later
 */

import { config } from '@/lib/config';
import { currentUserId, setUserAvatar } from '@/lib/auth';
import { saveAvatarPng } from '@/lib/avatar';
import { fail, ok, route } from '@/lib/http';
import { deleteImage } from '@/lib/images';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route('avatar.set', async (req: Request) => {
  const userId = await currentUserId();
  if (!userId) return fail('Sign in first.', 401);

  const form = await req.formData().catch(() => null);
  if (!form) return fail('Expected a form upload');
  const file = form.get('image');
  if (!(file instanceof File) || file.size === 0) return fail('Pick an image first.');
  if (file.size > config.limits.maxImageBytes) return fail('That image is too large. Try one under 2 MB.');

  try {
    const result = saveAvatarPng(userId, new Uint8Array(await file.arrayBuffer()));
    return ok({ palette: result.palette });
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'That image could not be read');
  }
});

export const DELETE = route('avatar.remove', async () => {
  const userId = await currentUserId();
  if (!userId) return fail('Sign in first.', 401);
  const { findUserById } = await import('@/lib/auth');
  const user = findUserById(userId);
  if (user?.avatar_image_id) deleteImage(user.avatar_image_id);
  setUserAvatar(userId, null, null);
  return ok({ removed: true });
});
