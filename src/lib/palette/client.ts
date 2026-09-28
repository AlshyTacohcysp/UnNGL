'use client';

/**
 * Browser half of the palette pipeline.
 *
 * The important detail: the PNG we upload is the *exact* canvas the palette was
 * computed from (`toBlob('image/png')` is lossless), and that PNG is what the
 * server decodes to verify. That's why a hint can be marked "verified" — the
 * server is checking the claim against the same pixels, not trusting a number
 * the client sent.
 *
 * @license AGPL-3.0-or-later
 */

import { extractPalette, type Palette } from './extract';

/** Longest edge kept for uploads. The algorithm resamples to 256 anyway. */
const UPLOAD_EDGE = 512;

export interface PreparedImage {
  /** Exact PNG bytes of the canvas the palette came from. */
  png: Blob;
  /** Object URL for previewing; caller revokes it. */
  previewUrl: string;
  palette: Palette;
  width: number;
  height: number;
}

export class ImageError extends Error {}

function loadBitmap(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageError('That file could not be read as an image.'));
    };
    img.src = url;
  });
}

/** File -> square-ish canvas -> PNG bytes + palette. */
export async function prepareImage(file: Blob, edge = UPLOAD_EDGE): Promise<PreparedImage> {
  if (file.size > 8 * 1024 * 1024) {
    throw new ImageError('That file is too large. Try one under 8 MB.');
  }
  const img = await loadBitmap(file);
  if (img.naturalWidth < 1 || img.naturalHeight < 1) {
    throw new ImageError('That image is empty.');
  }

  const scale = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new ImageError('Your browser blocked image processing.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const palette = extractPalette(imageData.data, width, height);
  const png = await canvasToPng(canvas);
  return { png, previewUrl: canvas.toDataURL('image/png'), palette, width, height };
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new ImageError('Could not encode the image.'));
    }, 'image/png');
  });
}

/**
 * Fetch a profile-photo link through our own allowlisted proxy, because a
 * browser can't read pixels from another origin's image.
 */
export async function fetchRemoteImage(url: string): Promise<Blob> {
  const res = await fetch(`/api/media/fetch?url=${encodeURIComponent(url)}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ImageError(body?.error ?? 'That link could not be downloaded.');
  }
  return res.blob();
}

/** Is this colour light enough that ink text reads better on it? */
export function isLight(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

