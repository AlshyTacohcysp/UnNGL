/**
 * DELETE /api/account — delete the account, its inboxes, messages and images.
 *
 * Foreign keys cascade users → inboxes → messages → hints. Images are BLOB
 * rows of our own, so they are collected and removed explicitly.
 *
 * @license AGPL-3.0-or-later
 */

import { all, run } from '@/lib/db';
import { currentUserId, destroyAllSessions, findUserById } from '@/lib/auth';
import { fail, ok, route } from '@/lib/http';
import { deleteImage } from '@/lib/images';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const DELETE = route('account.delete', async () => {
  const userId = await currentUserId();
  if (!userId) return fail('Sign in first.', 401);

  const user = await findUserById(userId);
  const images = await all<{ id: string }>(
    `SELECT i.id FROM images i
      WHERE i.id IN (SELECT avatar_image_id FROM users WHERE id = ?)
         OR i.id IN (SELECT h.image_id FROM hints h
                      JOIN messages m ON m.id = h.message_id
                      JOIN inboxes ib ON ib.id = m.inbox_id
                     WHERE ib.owner_id = ?)`,
    userId,
    userId,
  );

  await run('DELETE FROM users WHERE id = ?', userId);
  for (const image of images) await deleteImage(image.id);
  if (user?.avatar_image_id && !images.some((i) => i.id === user.avatar_image_id)) {
    await deleteImage(user.avatar_image_id);
  }
  await destroyAllSessions(userId);

  return ok({ deleted: true });
});
