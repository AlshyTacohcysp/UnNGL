/**
 * Hints: the free, verifiable colour-palette reveal.
 *
 * The contract with the sender is written in plain language — "we will show
 * your colours, never your face" — and the contract with the receiver is that
 * every palette is recomputed on our server from the original file. If a client
 * ever submits colours that don't match the image it uploaded, the hint is
 * stored as UNVERIFIED and the UI says so.
 *
 * @license AGPL-3.0-or-later
 */

import { nanoid } from 'nanoid';
import { db, type Executor, get, run } from './db';
import { config } from './config';
import { analyzePng, storeImage } from './images';
import { ALGORITHM_VERSION, paletteHash, PALETTE_SIZE, type Palette } from './palette/extract';

export interface Hint {
  id: string;
  message_id: string;
  /** Canonical palette JSON (see palette/extract.ts). */
  palette: string;
  /** Column is `primary_hex`: PRIMARY is a SQLite keyword. */
  primary_hex: string;
  weight: number;
  hash: string;
  algorithm: string;
  verified: number;
  image_id: string | null;
  source: string;
  created_at: number;
}

export interface HintView {
  id: string;
  colors: string[];
  primary: string;
  weight: number;
  verified: boolean;
  algorithm: string;
  createdAt: number;
  source: string;
}

export function toHintView(h: Hint): HintView {
  const parsed = JSON.parse(h.palette) as { colors: string[]; primary: string; weight: number };
  return {
    id: h.id,
    colors: parsed.colors.slice(0, PALETTE_SIZE),
    primary: parsed.primary || h.primary_hex,
    weight: parsed.weight ?? h.weight,
    verified: h.verified === 1,
    algorithm: h.algorithm,
    createdAt: h.created_at,
    source: h.source,
  };
}

function isPaletteShape(value: unknown): value is Palette {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.colors) &&
    v.colors.length > 0 &&
    v.colors.every((c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c))
  );
}

export interface CreateHintResult {
  hint: Hint;
  serverPalette: Palette;
}

/**
 * Derive a hint from an uploaded PNG.
 *
 * @param pngBytes    original PNG as uploaded
 * @param claimed      palette the client claims it computed (optional; used only
 *                     to mark the hint verified or not)
 * @param source       'upload' | 'instagram' | 'avatar'
 */
export async function createHintFromImage(
  messageId: string,
  pngBytes: Uint8Array,
  claimed: unknown,
  source: string,
  t?: Executor,
): Promise<CreateHintResult> {
  // The server never trusts the client's pixels or colours: it decodes and
  // recomputes everything itself, using the same reference implementation.
  const analysis = analyzePng(pngBytes);
  const serverPalette: Palette = {
    colors: analysis.colors,
    primary: analysis.primary,
    weight: analysis.weight,
  };
  const verified = isPaletteShape(claimed) && paletteHash(claimed) === paletteHash(serverPalette);

  const stored = await storeImage(pngBytes, { retainDays: config.retentionDays }, t);
  const now = Date.now();
  const id = nanoid(16);
  await (t ?? db()).run(
    `INSERT INTO hints (id, message_id, palette, primary_hex, weight, hash, algorithm, verified, image_id, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    messageId,
    JSON.stringify(serverPalette),
    serverPalette.primary,
    serverPalette.weight,
    paletteHash(serverPalette),
    ALGORITHM_VERSION,
    verified ? 1 : 0,
    stored.id,
    source,
    now,
  );
  return { hint: (await getHintForMessage(messageId, t))!, serverPalette };
}

export async function getHintForMessage(messageId: string, t?: Executor): Promise<Hint | undefined> {
  return (t ?? db()).get<Hint>('SELECT * FROM hints WHERE message_id = ?', messageId);
}

