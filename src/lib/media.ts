/**
 * Media fetching for "paste your profile photo link".
 *
 * The browser can't read pixels from someone else's image host (canvas would
 * be tainted), so we fetch on the server — which means we are running a
 * user-supplied-URL fetcher and have to treat it like one:
 *
 *  - https only, default port only, no credentials in the URL
 *  - host must be on a small allowlist of social CDNs
 *  - redirects are followed manually, re-validating every hop (max 3)
 *  - the body is capped and streamed, so a huge response can't exhaust memory
 *  - the response must be an image; anything else is discarded unread
 *
 * @license AGPL-3.0-or-later
 */

import { config } from './config';

/**
 * Hosts we are willing to fetch from. Keep this list short.
 *
 * The first three are the social CDNs people actually paste profile-photo
 * links from; the rest are the avatar hosts of the OAuth providers we support,
 * which we read once at sign-in to pre-fill an avatar.
 */
const ALLOWED_HOSTS = [
  /^(?:[a-z0-9-]+\.)*cdninstagram\.com$/i,
  /^(?:[a-z0-9-]+\.)*fbcdn\.net$/i,
  /^(?:[a-z0-9-]+\.)*fbsbx\.com$/i,
  /^avatars\.githubusercontent\.com$/i,
  /^(?:[a-z0-9-]+\.)*googleusercontent\.com$/i,
  /^cdn\.discordapp\.com$/i,
];

const MAX_REDIRECTS = 3;

export class MediaError extends Error {}

export function isAllowedMediaUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  if (u.port && u.port !== '443') return false;
  return ALLOWED_HOSTS.some((re) => re.test(u.hostname));
}

function assertAllowed(raw: string): URL {
  if (!isAllowedMediaUrl(raw)) {
    throw new MediaError(
      'That image host is not allowed. UnNGL only fetches images from Instagram/Facebook CDN hosts — or just upload the file.',
    );
  }
  return new URL(raw);
}

export interface FetchedImage {
  bytes: Buffer;
  contentType: string;
}

/** Fetch an allowlisted image URL with a hard byte cap and hop validation. */
export async function fetchImage(rawUrl: string): Promise<FetchedImage> {
  let url = assertAllowed(rawUrl);
  let response: Response | null = null;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    response = await fetch(url, {
      redirect: 'manual',
      headers: {
        // Some CDNs serve a low-res variant without a UA; some block unknown ones.
        'user-agent': 'UnNGL/0.1 (+https://unngl.link)',
        accept: 'image/*',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new MediaError('CDN sent a redirect with no destination');
      url = assertAllowed(new URL(location, url).toString());
      continue;
    }
    break;
  }
  if (!response) throw new MediaError('too many redirects');
  if (!response.ok) throw new MediaError(`The image host replied ${response.status}`);

  const contentType = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (!contentType.startsWith('image/')) {
    throw new MediaError('That URL did not return an image');
  }

  const limit = config.limits.maxImageBytes;
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > limit) throw new MediaError('That image is too large');

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > limit) throw new MediaError('That image is too large');
  if (bytes.length === 0) throw new MediaError('That image was empty');
  return { bytes, contentType };
}
