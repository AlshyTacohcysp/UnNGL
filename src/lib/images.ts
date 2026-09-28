/**
 * Blob store for uploaded images.
 *
 * Privacy rule baked in: a hint's source photo is kept only long enough to be
 * independently re-analysed by the server, then deleted on a timer. What remains
 * forever is the palette and the verification result. Avatars (which a user
 * deliberately set as their public face) are kept until the user removes them.
 *
 * @license AGPL-3.0-or-later
 */

import { nanoid } from 'nanoid';
import { all, db, get, run, type Executor } from './db';
import { config } from './config';
import { decodePng, isPng, ImageError } from './palette/png';
import { extractPalette, type Palette } from './palette/extract';

export interface StoredImage {
  id: string;
  width: number;
  height: number;
  bytesLen: number;
  delete_after: number | null;
}

export interface ImageAnalysis extends Palette {
  width: number;
  height: number;
  source: 'png';
}

export async function storeImage(
  bytes: Uint8Array,
  opts: { retainDays?: number | null; mime?: string } = {},
  t?: Executor,
): Promise<StoredImage> {
  // Every rejection below is `ImageError` so a route can answer 400 with a
  // reason. A plain Error here would be indistinguishable from a server fault
  // and would surface as a generic 500 to a sender who did nothing wrong.
  if (bytes.length > config.limits.maxImageBytes) {
    throw new ImageError(`Image is larger than ${Math.round(config.limits.maxImageBytes / 1024)} kB`);
  }
  if (!isPng(bytes)) {
    throw new ImageError('Only PNG uploads are accepted (the browser transcodes for you)');
  }
  const decoded = decodePng(bytes);
  const edge = Math.max(decoded.width, decoded.height);
  if (edge > config.limits.maxImageEdge) {
    throw new ImageError(`Image is larger than ${config.limits.maxImageEdge}px on its longest side`);
  }
  const now = Date.now();
  const id = nanoid(16);
  const deleteAfter =
    opts.retainDays === null
      ? null
      : now + (opts.retainDays ?? config.retentionDays) * 86_400_000;
  // Honour the caller's transaction if there is one. Reaching for the pool
  // from inside a transaction borrows a second connection: with a small pool
  // that deadlocks, and with a large one it silently writes outside the
  // transaction the caller believes is covering it.
  await (t ?? db()).run(
    `INSERT INTO images (id, bytes, mime, width, height, bytes_len, created_at, delete_after)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    bytes,
    opts.mime ?? 'image/png',
    decoded.width,
    decoded.height,
    bytes.length,
    now,
    deleteAfter,
  );
  return {
    id,
    width: decoded.width,
    height: decoded.height,
    bytesLen: bytes.length,
    delete_after: deleteAfter,
  };
}

export async function readImage(id: string): Promise<{ bytes: Buffer; mime: string } | undefined> {
  const row = await get<{ bytes: Uint8Array; mime: string }>('SELECT bytes, mime FROM images WHERE id = ?', id);
  if (!row) return undefined;
  return { bytes: Buffer.from(row.bytes), mime: row.mime };
}

export async function deleteImage(id: string, t?: Executor): Promise<void> {
  await (t ?? db()).run('DELETE FROM images WHERE id = ?', id);
}

/**
 * Decoded pixels -> palette, using the exact same code the browser ran.
 * Throws `ImageError` if the bytes are not a decodable, in-bounds PNG.
 */
export function analyzePng(bytes: Uint8Array): ImageAnalysis {
  const img = decodePng(bytes);
  const palette = extractPalette(img.data, img.width, img.height);
  return { ...palette, width: img.width, height: img.height, source: 'png' };
}

/** Delete images whose retention window has closed. Cheap enough to run hourly. */
export async function purgeExpiredImages(): Promise<number> {
  const rows = await all<{ id: string }>('SELECT id FROM images WHERE delete_after IS NOT NULL AND delete_after < ?', Date.now());
  for (const r of rows) await deleteImage(r.id);
  return rows.length;
}

let lastPurge = 0;

/** Run the purge at most once an hour, opportunistically. */
export async function maybePurge(): Promise<void> {
  const now = Date.now();
  if (now - lastPurge < 3_600_000) return;
  lastPurge = now;
  try {
    await purgeExpiredImages();
  } catch (err) {
    console.error('[images] purge failed', err);
  }
}
