/**
 * GET /api/media/fetch?url=… — allowlisted image fetch (see lib/media.ts)
 *
 * Used by the composer when someone pastes a link to their profile photo
 * instead of choosing a file. Rate limited per IP.
 *
 * @license AGPL-3.0-or-later
 */

import { config } from '@/lib/config';
import { fetchImage, isAllowedMediaUrl, MediaError } from '@/lib/media';
import { clientIp, fail, route } from '@/lib/http';
import { hit } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(
  'media.fetch',
  async (req: Request) => {
    const ip = await clientIp();
    if (!hit('media', ip, config.limits.mediaFetchesPerIpPerHour).ok) {
      return fail('Too many fetches from your connection. Try again later.', 429);
    }

    const target = new URL(req.url).searchParams.get('url');
    if (!target) return fail('Missing url');
    if (target.length > 2000) return fail('That URL is too long');
    if (!isAllowedMediaUrl(target)) {
      return fail(
        'UnNGL only downloads photos from Instagram/Facebook CDN hosts. ' +
          'Or download the photo and upload the file instead.',
      );
    }

    try {
      const { bytes, contentType } = await fetchImage(target);
      return new Response(new Uint8Array(bytes), {
        status: 200,
        headers: {
          'content-type': contentType,
          'content-length': String(bytes.length),
          'cache-control': 'private, max-age=600',
        },
      });
    } catch (err) {
      if (err instanceof MediaError) return fail(err.message, 400);
      console.error('[media] fetch failed', err);
      return fail('Could not download that image.', 502);
    }
  },
);
