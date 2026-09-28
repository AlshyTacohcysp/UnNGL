/**
 * Avatar storage.
 *
 * An avatar is the one image a user deliberately publishes, so it is kept
 * (no deletion timer) and its palette is shown wherever their name is. The
 * picture itself is only ever fetched from allowlisted social CDNs.
 *
 * @license AGPL-3.0-or-later
 */

import { analyzePng, storeImage } from './images';
import { fetchImage, isAllowedMediaUrl, MediaError } from './media';
import { setUserAvatar } from './auth';
import { ALGORITHM_VERSION, paletteHash } from './palette/extract';

export interface AvatarResult {
  imageId: string;
  palette: { colors: string[]; primary: string; weight: number; v: string; hash: string };
}

/** Store a PNG as a user's avatar and derive its palette. */
export async function saveAvatarPng(userId: string, png: Uint8Array): Promise<AvatarResult> {
  const analysis = analyzePng(png);
  const stored = await storeImage(png, { retainDays: null });
  const palette = {
    colors: analysis.colors,
    primary: analysis.primary,
    weight: analysis.weight,
    v: ALGORITHM_VERSION,
    hash: paletteHash({
      colors: analysis.colors,
      primary: analysis.primary,
      weight: analysis.weight,
    }),
  };
  await setUserAvatar(userId, stored.id, palette);
  return { imageId: stored.id, palette };
}

/**
 * Best-effort: pull a provider's profile picture and use it as the avatar.
 * Failures are never fatal to a sign-in.
 */
export async function maybeFetchAndStoreAvatar(
  userId: string,
  url: string,
): Promise<AvatarResult | null> {
  if (!isAllowedMediaUrl(url)) return null;
  try {
    const { bytes } = await fetchImage(url);
    // Normalise whatever the CDN sent into a PNG via the platform decoder is
    // not available server-side, so we only accept PNG and skip the rest.
    if (!isPngBytes(bytes)) return null;
    return await saveAvatarPng(userId, bytes);
  } catch (err) {
    if (!(err instanceof MediaError)) console.error('[avatar] fetch failed', err);
    return null;
  }
}

function isPngBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}
