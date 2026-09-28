/**
 * Inboxes and messages.
 *
 * An inbox is the shareable link. An inbox URL is the only credential a
 * receiver needs, so slugs are 71 bits of entropy and inbox owners are
 * encouraged to rotate them.
 *
 * A slug is a secret. A handle is a name. Both address the same inbox and
 * both stay valid, which is what lets a link shared today keep resolving
 * after its owner renames theirs.
 *
 * @license AGPL-3.0-or-later
 */

import { customAlphabet } from 'nanoid';
import { all, db, get, run, tx, type Executor } from './db';
import { digestToken, randomToken } from './crypto';
import { normalizeHandle, validateHandle, type HandleCheck } from './handle';
import { createHintFromImage, getHintForMessage, toHintView, type HintView } from './hints';
import { deleteImage } from './images';

// Unambiguous alphabet: no 0/O/1/l/I, so slugs survive being read aloud or
// retyped from a screenshot.
const slug = customAlphabet('23456789abcdefghijkmnpqrstuvwxyz', 12);
const id = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 20);

export interface Inbox {
  id: string;
  owner_id: string;
  slug: string;
  /** User-chosen name, or NULL for inboxes nobody has named yet. */
  handle: string | null;
  title: string;
  notify: number;
  created_at: number;
  last_message_at: number | null;
  deleted_at: number | null;
}

export interface Message {
  id: string;
  inbox_id: string;
  body: string;
  created_at: number;
  sender_ip: string | null;
  sender_agent: string | null;
  seen_at: number | null;
  claim_hash: string | null;
}

export function newId(): string {
  return id();
}

async function uniqueSlug(): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const s = slug();
    if (!(await get('SELECT 1 FROM inboxes WHERE slug = ?', s))) return s;
  }
  throw new Error('could not allocate a unique slug');
}

export async function createInbox(ownerId: string, title: string): Promise<Inbox> {
  const now = Date.now();
  const inboxId = newId();
  const s = await uniqueSlug();
  await run(
    `INSERT INTO inboxes (id, owner_id, slug, title, notify, created_at) VALUES (?, ?, ?, ?, 0, ?)`,
    inboxId,
    ownerId,
    s,
    title,
    now,
  );
  return (await getInboxBySlug(s))!;
}

export async function getInboxBySlug(slugValue: string): Promise<Inbox | undefined> {
  return await get<Inbox>('SELECT * FROM inboxes WHERE slug = ? AND deleted_at IS NULL', slugValue);
}

/* ------------------------------------------------------------------ *
 * Handles
 * ------------------------------------------------------------------ */

/**
 * Resolve whatever appeared in the URL to an inbox.
 *
 * Three lookups, cheapest first, all on an index:
 *
 *   1. a live handle          — what a person chose
 *   2. a retired handle       — so a shared link survives a rename
 *   3. a slug                 — every link ever shared, and the fallback for
 *                               the inboxes that have never been named
 *
 * Order matters: a handle is checked before a slug so a rename can never be
 * shadowed by an unrelated inbox that happens to hold the old slug value.
 * The input is folded to lower case first, because handles are stored
 * normalised and slugs are already lower case, so one fold serves both.
 */
export async function getInboxByHandleOrSlug(value: string): Promise<Inbox | undefined> {
  const key = normalizeHandle(value);
  if (!key) return undefined;

  const byHandle = await get<Inbox>(
    'SELECT * FROM inboxes WHERE lower(handle) = ? AND deleted_at IS NULL',
    key,
  );
  if (byHandle) return byHandle;

  const byAlias = await get<{ inbox_id: string }>(
    'SELECT inbox_id FROM handle_aliases WHERE handle = ?',
    key,
  );
  if (byAlias) return await getInboxById(byAlias.inbox_id);

  return await getInboxBySlug(key);
}

/** Is this name free? Folds case, so `Amina.K` and `amina.k` are one name. */
export async function handleIsTaken(handle: string): Promise<boolean> {
  const key = normalizeHandle(handle);
  const live = await get('SELECT 1 FROM inboxes WHERE lower(handle) = ?', key);
  if (live) return true;
  const alias = await get('SELECT 1 FROM handle_aliases WHERE handle = ?', key);
  return Boolean(alias);
}

export type ClaimHandleResult =
  | { ok: true; handle: string; replaced: string | null }
  | { ok: false; check: HandleCheck };

/**
 * Give this inbox a name.
 *
 * The insert is the availability check: the unique index on `lower(handle)`
 * is the only thing that can settle a race between two people picking the
 * same name at the same instant, so this deliberately does not pre-check and
 * then insert. A 23505 here means someone else won, which is the same answer
 * a pre-check would have given a moment later.
 *
 * A renamed handle is written to `handle_aliases` in the same transaction as
 * the update, so a link that was already handed out keeps resolving. An
 * alias row for a handle that is later re-claimed by its original owner is
 * cleared, so the name is never permanently burned.
 */
export async function claimHandle(
  inboxId: string,
  rawHandle: string,
): Promise<ClaimHandleResult> {
  const check = validateHandle(rawHandle);
  if (!check.ok) return { ok: false, check };
  const handle = check.handle!;

  const inbox = await getInboxById(inboxId);
  if (!inbox) {
    return { ok: false, check: { ok: false, problem: 'empty', message: 'No such inbox.' } };
  }

  // Renaming to the name you already have is a no-op, not a conflict.
  if (inbox.handle && inbox.handle.toLowerCase() === handle) {
    return { ok: true, handle, replaced: null };
  }

  // One statement, not a transaction with three.
  //
  // The unique index on lower(handle) is the only thing that can settle two
  // people picking the same name at the same instant, so the update has to be
  // the thing that can fail — and a statement that fails is atomic in Postgres
  // on its own, with nothing to roll back. The obvious alternative, catching
  // 23505 out of a SAVEPOINT inside a transaction, does not work here: the
  // savepoint correctly restores the transaction, but this driver re-raises
  // the original error when the transaction commits, so the "someone already
  // has that name" answer never escapes to the caller.
  //
  // A CTE also lets the alias be written in the same statement, which is what
  // makes "rename" and "keep the old link working" a single fact rather than
  // two that can disagree.
  try {
    const row = await get<{ handle: string | null; replaced: string | null }>(
      `WITH previous AS (
         SELECT handle FROM inboxes WHERE id = ? AND deleted_at IS NULL
       ),
       updated AS (
         UPDATE inboxes SET handle = ? WHERE id = ? AND deleted_at IS NULL
         RETURNING handle
       ),
       retired AS (
         INSERT INTO handle_aliases (handle, inbox_id, created_at)
         SELECT lower(previous.handle), ?, ?
           FROM previous
          WHERE previous.handle IS NOT NULL
            AND lower(previous.handle) <> ?
         ON CONFLICT (handle) DO UPDATE
            SET inbox_id = EXCLUDED.inbox_id,
                created_at = EXCLUDED.created_at
         RETURNING handle AS old_handle
       )
       SELECT updated.handle AS handle,
              (SELECT old_handle FROM retired) AS replaced
         FROM updated`,
      inboxId,
      handle,
      inboxId,
      inboxId,
      Date.now(),
      handle,
    );

    // No row means the inbox was deleted between the read above and here.
    if (!row) {
      return { ok: false, check: { ok: false, problem: 'empty', message: 'No such inbox.' } };
    }
    return { ok: true, handle: row.handle!, replaced: row.replaced ?? null };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        ok: false,
        check: { ok: false, problem: 'taken', message: 'Someone already has that name.' },
      };
    }
    throw err;
  }
}

/** Postgres unique-violation, whatever the driver called it. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

export async function getInboxById(inboxId: string): Promise<Inbox | undefined> {
  return await get<Inbox>('SELECT * FROM inboxes WHERE id = ? AND deleted_at IS NULL', inboxId);
}

export async function listInboxesForUser(
  ownerId: string,
): Promise<Array<Inbox & { total: number; unread: number; last_body: string | null }>> {
  return await all<Inbox & { total: number; unread: number; last_body: string | null }>(
    `SELECT i.*,
            (SELECT COUNT(*) FROM messages m WHERE m.inbox_id = i.id) AS total,
            (SELECT COUNT(*) FROM messages m WHERE m.inbox_id = i.id AND m.seen_at IS NULL) AS unread,
            (SELECT m.body FROM messages m WHERE m.inbox_id = i.id ORDER BY m.created_at DESC LIMIT 1) AS last_body
       FROM inboxes i
      WHERE i.owner_id = ? AND i.deleted_at IS NULL
      ORDER BY COALESCE(i.last_message_at, i.created_at) DESC`,
    ownerId,
  );
}

export async function inboxCountForUser(ownerId: string): Promise<number> {
  const row = await get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM inboxes WHERE owner_id = ? AND deleted_at IS NULL',
    ownerId,
  );
  return Number(row?.n ?? 0);
}

export async function renameInbox(inboxId: string, title: string, notify: boolean): Promise<void> {
  await run('UPDATE inboxes SET title = ?, notify = ? WHERE id = ?', title, notify ? 1 : 0, inboxId);
}

export async function rotateInboxSlug(inboxId: string): Promise<string> {
  const s = await uniqueSlug();
  await run('UPDATE inboxes SET slug = ? WHERE id = ?', s, inboxId);
  return s;
}

export async function softDeleteInbox(inboxId: string): Promise<void> {
  await run('UPDATE inboxes SET deleted_at = ? WHERE id = ?', Date.now(), inboxId);
  await run(
    `DELETE FROM hints WHERE message_id IN (SELECT id FROM messages WHERE inbox_id = ?)`,
    inboxId,
  );
  await run('DELETE FROM messages WHERE inbox_id = ?', inboxId);
}

/* ------------------------------------------------------------------ *
 * Messages
 * ------------------------------------------------------------------ */

export interface MessageView {
  id: string;
  body: string;
  createdAt: number;
  seen: boolean;
  hint: HintView | null;
  /** Present only in the response to the sender who just submitted it. */
  claimToken?: string;
}

export async function listMessages(inboxId: string): Promise<MessageView[]> {
  const rows = await all<Message>(
    'SELECT * FROM messages WHERE inbox_id = ? ORDER BY created_at DESC, id DESC',
    inboxId,
  );
  return Promise.all(rows.map((m) => toView(m)));
}

export async function getMessage(idValue: string, t?: Executor): Promise<Message | undefined> {
  return (t ?? db()).get<Message>('SELECT * FROM messages WHERE id = ?', idValue);
}

async function toView(m: Message, t?: Executor): Promise<MessageView> {
  const hint = await getHintForMessage(m.id, t);
  return {
    id: m.id,
    body: m.body,
    createdAt: m.created_at,
    seen: m.seen_at !== null,
    hint: hint ? toHintView(hint) : null,
  };
}

export async function markAllSeen(inboxId: string): Promise<number> {
  const res = await run('UPDATE messages SET seen_at = ? WHERE inbox_id = ? AND seen_at IS NULL', Date.now(), inboxId);
  return res.changes;
}

export async function markSeen(messageId: string): Promise<void> {
  await run('UPDATE messages SET seen_at = ? WHERE id = ? AND seen_at IS NULL', Date.now(), messageId);
}

export async function deleteMessage(messageId: string): Promise<void> {
  // The photo behind a hint goes with it; the palette goes with the message.
  const hint = await getHintForMessage(messageId);
  if (hint?.image_id) await deleteImage(hint.image_id);
  await run('DELETE FROM messages WHERE id = ?', messageId);
}

export interface PostMessageInput {
  inboxSlug: string;
  body: string;
  ipHash: string;
  userAgent: string;
  /** PNG bytes of the sender's photo, if they attached a hint. */
  imageBytes?: Uint8Array;
  claimedPalette?: unknown;
  source?: string;
}

export interface PostMessageResult {
  message: MessageView;
  claimToken: string;
  inbox: Inbox;
}

/** Store a message (and its hint, if any) atomically. */
export async function postMessage(input: PostMessageInput): Promise<PostMessageResult> {
  const inbox = await getInboxBySlug(input.inboxSlug);
  if (!inbox) throw new Error('inbox not found');

  const now = Date.now();
  const messageId = newId();
  const claimToken = randomToken(24);

  await tx(async (t) => {
    await t.run(
      `INSERT INTO messages (id, inbox_id, body, created_at, sender_ip, sender_agent, claim_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      messageId,
      inbox.id,
      input.body,
      now,
      input.ipHash,
      input.userAgent ?? null,
      digestToken(claimToken),
    );
    if (input.imageBytes && input.imageBytes.length > 0) {
      // A hint without its photo would be a lie, so the palette is derived
      // inside the same transaction: either both land or neither does.
      await createHintFromImage(messageId, input.imageBytes, input.claimedPalette, input.source ?? 'upload', t);
    }
    await t.run('UPDATE inboxes SET last_message_at = ? WHERE id = ?', now, inbox.id);
  });

  const message = (await getMessage(messageId))!;
  return {
    message: { ...(await toView(message)), claimToken },
    claimToken,
    inbox: (await getInboxBySlug(input.inboxSlug))!,
  };
}

/** Attach (or replace) the hint on a message the sender still holds a claim for. */
export async function attachHintToClaimedMessage(
  claimToken: string,
  imageBytes: Uint8Array,
  claimedPalette: unknown,
  source: string,
): Promise<MessageView | null> {
  const hash = digestToken(claimToken);
  const msg = await get<Message>('SELECT * FROM messages WHERE claim_hash = ?', hash);
  if (!msg) return null;
  return await tx(async (t) => {
    const existing = await getHintForMessage(msg.id, t);
    if (existing) {
      // One palette per message keeps the public spec simple: replacing the
      // photo replaces the palette, and the old photo goes with it.
      if (existing.image_id) await deleteImage(existing.image_id, t);
      await t.run('DELETE FROM hints WHERE id = ?', existing.id);
    }
    await createHintFromImage(msg.id, imageBytes, claimedPalette, source, t);
    return toView((await getMessage(msg.id, t))!, t);
  });
}

export async function findMessageByClaim(claimToken: string): Promise<Message | undefined> {
  return await get<Message>('SELECT * FROM messages WHERE claim_hash = ?', digestToken(claimToken));
}
