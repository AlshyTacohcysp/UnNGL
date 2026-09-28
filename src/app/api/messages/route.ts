/**
 * POST /api/messages — send an anonymous message to an inbox.
 *
 * multipart/form-data:
 *   body    the message text
 *   palette JSON of the palette the client computed (optional, for verification)
 *   image   PNG file, optional — the sender's photo, used to derive the hint
 *   website honeypot field, must stay empty
 *
 * The response hands the sender a one-time claim link so they can attach a hint
 * later, or correct a photo they regret. Nobody but the sender and the inbox
 * owner can ever see it.
 *
 * @license AGPL-3.0-or-later
 */

import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { getInboxBySlug } from '@/lib/inbox';
import { postMessage } from '@/lib/inbox';
import { clientIp, fail, ok, route, userAgent } from '@/lib/http';
import { hit, pruneRateLimits } from '@/lib/ratelimit';
import { claimedPaletteSchema, messageSchema } from '@/lib/validation';
import { maybePurge } from '@/lib/images';
import { ImageError } from '@/lib/palette/png';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const readImage = async (form: FormData): Promise<Uint8Array | null> => {
  const file = form.get('image');
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > config.limits.maxImageBytes) {
    throw new ImageError('That photo is too large. Try one under 2 MB.');
  }
  return new Uint8Array(await file.arrayBuffer());
};

export const POST = route('messages.send', async (req: Request) => {
  await maybePurge();
  await pruneRateLimits();
  const url = new URL(req.url);
  const slug = url.searchParams.get('to') ?? '';

  const inbox = await getInboxBySlug(slug);
  // Answer identically for unknown inboxes so links can't be probed.
  if (!inbox) return fail('That link has expired or never existed.', 404);

  const form = await req.formData().catch(() => null);
  if (!form) return fail('Expected a form upload');

  const parsed = messageSchema.safeParse({
    body: String(form.get('body') ?? ''),
    website: String(form.get('website') ?? ''),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid request');
  // Honeypot tripped: same shape as a normal send, so a bot learns nothing.
  if (parsed.data.website) return fail('That message could not be delivered.', 202);

  const ip = await clientIp();
  if (!(await hit('send', `inbox:${inbox.id}`, config.limits.sendsPerInboxPerHour)).ok) {
    return fail('This inbox has had a lot of messages today. Try again later.', 429);
  }
  if (!(await hit('send', `ip:${ip}`, config.limits.sendsPerIpPerHour)).ok) {
    return fail('You have sent a lot of messages recently. Try again in an hour.', 429);
  }

  const palette = claimedPaletteSchema.safeParse(
    form.get('palette') ? safeJson(String(form.get('palette'))) : null,
  );

  let image: Uint8Array | null = null;
  try {
    image = await readImage(form);
  } catch (err) {
    if (err instanceof ImageError) return fail(err.message);
    return fail('That photo could not be read');
  }

  try {
    const result = await postMessage({
      inboxSlug: inbox.slug,
      body: parsed.data.body,
      ipHash: ip,
      userAgent: await userAgent(),
      imageBytes: image ?? undefined,
      claimedPalette: palette.success ? palette.data : null,
      source: image ? 'upload' : 'none',
    });
    return NextResponse.json(
      {
        ok: true,
        messageId: result.message.id,
        claimUrl: `${config.origin}/h/${result.claimToken}`,
        hintAttached: Boolean(image),
      },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    // A rejected file is the sender's problem and gets a 400 with a reason.
    // Anything else is ours, and the route wrapper turns it into a 500.
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
