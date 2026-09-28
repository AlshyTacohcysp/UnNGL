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
import { ImageError } from '@/lib/palette/png';

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
    const result = await saveAvatarPng(userId, new Uint8Array(await file.arrayBuffer()));
    return ok({ palette: result.palette });
  } catch (err) {
    // Only a rejected file is a 400. An unexpected fault is ours, and must not be
    // reported to the user as though their picture were at fault.
    if (err instanceof ImageError) return fail(err.message);
    throw err;
  }
});

export const DELETE = route('avatar.remove', async () => {
  const userId = await currentUserId();
  if (!userId) return fail('Sign in first.', 401);
  const { findUserById } = await import('@/lib/auth');
  const user = await findUserById(userId);
  if (user?.avatar_image_id) await deleteImage(user.avatar_image_id);
  await setUserAvatar(userId, null, null);
  return ok({ removed: true });
});
