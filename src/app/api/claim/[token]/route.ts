/**
 * POST /api/claim/[token] — the sender attaches (or replaces) their hint.
 *
 * The claim token lives only in the sender's own URL. It's stored hashed, it
 * reveals nothing but the palette once a hint exists, and it can be forgotten:
 * the owner deletes the message, the photo deletion timer runs out, or the
 * sender just never comes back.
 *
 * @license AGPL-3.0-or-later
 */

import { config } from '@/lib/config';
import { attachHintToClaimedMessage, findMessageByClaim } from '@/lib/inbox';
import { fail, ok, route } from '@/lib/http';
import { hit } from '@/lib/ratelimit';
import { claimedPaletteSchema } from '@/lib/validation';
import { ImageError } from '@/lib/palette/png';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string }> };

export const GET = route('claim.get', async (_req: Request, ctx: Ctx) => {
  const { token } = await ctx.params;
  const message = findMessageByClaim(token);
  if (!message) return fail('This claim link is not valid any more.', 404);
  return ok({ canAttach: true });
});

export const POST = route('claim.attach', async (req: Request, ctx: Ctx) => {
  const { token } = await ctx.params;
  const message = findMessageByClaim(token);
  if (!message) return fail('This claim link is not valid any more.', 404);

  if (!hit('media', `claim:${token}`, 10).ok) {
    return fail('Too many attempts on this link.', 429);
  }

  const form = await req.formData().catch(() => null);
  if (!form) return fail('Expected a form upload');

  const file = form.get('image');
  if (!(file instanceof File) || file.size === 0) return fail('Pick a photo first.');
  if (file.size > config.limits.maxImageBytes) return fail('That photo is too large. Try one under 2 MB.');

  const bytes = new Uint8Array(await file.arrayBuffer());
  const claimed = claimedPaletteSchema.safeParse(
    form.get('palette') ? safeJson(String(form.get('palette'))) : null,
  );

  try {
    const view = attachHintToClaimedMessage(
      token,
      bytes,
      claimed.success ? claimed.data : null,
      'upload',
    );
    if (!view) return fail('This claim link is not valid any more.', 404);
    return ok({ hint: view.hint });
  } catch (err) {
    // A rejected file is the sender's problem: 400 with the reason. Anything
    // else is a server fault and the route wrapper turns it into a 500.
    if (err instanceof ImageError) return fail(err.message);
    throw err;
  }
});

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
