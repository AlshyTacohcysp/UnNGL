/**
 * Inboxes and messages.
 *
 * An inbox is the shareable link. An inbox URL is the only credential a
 * receiver needs, so slugs are 71 bits of entropy and inbox owners are
 * encouraged to rotate them.
 *
 * @license AGPL-3.0-or-later
 */

import { customAlphabet } from 'nanoid';
import { all, get, run, tx } from './db';
import { digestToken, randomToken } from './crypto';
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

function uniqueSlug(): string {
  for (let i = 0; i < 12; i++) {
    const s = slug();
    if (!get('SELECT 1 FROM inboxes WHERE slug = ?', s)) return s;
  }
  throw new Error('could not allocate a unique slug');
}

export function createInbox(ownerId: string, title: string): Inbox {
  const now = Date.now();
  const inboxId = newId();
  const s = uniqueSlug();
  run(
    `INSERT INTO inboxes (id, owner_id, slug, title, notify, created_at) VALUES (?, ?, ?, ?, 0, ?)`,
    inboxId,
    ownerId,
    s,
    title,
    now,
  );
  return getInboxBySlug(s)!;
}

export function getInboxBySlug(slugValue: string): Inbox | undefined {
  return get<Inbox>('SELECT * FROM inboxes WHERE slug = ? AND deleted_at IS NULL', slugValue);
}

export function getInboxById(inboxId: string): Inbox | undefined {
  return get<Inbox>('SELECT * FROM inboxes WHERE id = ? AND deleted_at IS NULL', inboxId);
}

export function listInboxesForUser(ownerId: string): Array<
  Inbox & { total: number; unread: number; last_body: string | null }
> {
  return all<Inbox & { total: number; unread: number; last_body: string | null }>(
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

export function inboxCountForUser(ownerId: string): number {
  const row = get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM inboxes WHERE owner_id = ? AND deleted_at IS NULL',
    ownerId,
  );
  return Number(row?.n ?? 0);
}

export function renameInbox(inboxId: string, title: string, notify: boolean): void {
  run('UPDATE inboxes SET title = ?, notify = ? WHERE id = ?', title, notify ? 1 : 0, inboxId);
}

export function rotateInboxSlug(inboxId: string): string {
  const s = uniqueSlug();
  run('UPDATE inboxes SET slug = ? WHERE id = ?', s, inboxId);
  return s;
}

export function softDeleteInbox(inboxId: string): void {
  run('UPDATE inboxes SET deleted_at = ? WHERE id = ?', Date.now(), inboxId);
  run(
    `DELETE FROM hints WHERE message_id IN (SELECT id FROM messages WHERE inbox_id = ?)`,
    inboxId,
  );
  run('DELETE FROM messages WHERE inbox_id = ?', inboxId);
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

export function listMessages(inboxId: string): MessageView[] {
  const rows = all<Message>(
    'SELECT * FROM messages WHERE inbox_id = ? ORDER BY created_at DESC, id DESC',
    inboxId,
  );
  return rows.map((m) => toView(m));
}

export function getMessage(idValue: string): Message | undefined {
  return get<Message>('SELECT * FROM messages WHERE id = ?', idValue);
}

function toView(m: Message): MessageView {
  const hint = getHintForMessage(m.id);
  return {
    id: m.id,
    body: m.body,
    createdAt: m.created_at,
    seen: m.seen_at !== null,
    hint: hint ? toHintView(hint) : null,
  };
}

export function markAllSeen(inboxId: string): number {
  const res = run('UPDATE messages SET seen_at = ? WHERE inbox_id = ? AND seen_at IS NULL', Date.now(), inboxId);
  return res.changes;
}

export function markSeen(messageId: string): void {
  run('UPDATE messages SET seen_at = ? WHERE id = ? AND seen_at IS NULL', Date.now(), messageId);
}

export function deleteMessage(messageId: string): void {
  // The photo behind a hint goes with it; the palette goes with the message.
  const hint = getHintForMessage(messageId);
  if (hint?.image_id) deleteImage(hint.image_id);
  run('DELETE FROM messages WHERE id = ?', messageId);
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
export function postMessage(input: PostMessageInput): PostMessageResult {
  const inbox = getInboxBySlug(input.inboxSlug);
  if (!inbox) throw new Error('inbox not found');

  const now = Date.now();
  const messageId = newId();
  const claimToken = randomToken(24);

  tx(() => {
    run(
      `INSERT INTO messages (id, inbox_id, body, created_at, sender_ip, sender_agent, claim_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      messageId,
      inbox.id,
      input.body,
      now,
      input.ipHash,
      input.userAgent,
      digestToken(claimToken),
    );
    if (input.imageBytes && input.imageBytes.length > 0) {
      createHintFromImage(messageId, input.imageBytes, input.claimedPalette, input.source ?? 'upload');
    }
    run('UPDATE inboxes SET last_message_at = ? WHERE id = ?', now, inbox.id);
  });

  const message = getMessage(messageId)!;
  return {
    message: { ...toView(message), claimToken },
    claimToken,
    inbox: getInboxBySlug(input.inboxSlug)!,
  };
}

/** Attach (or replace) the hint on a message the sender still holds a claim for. */
export function attachHintToClaimedMessage(
  claimToken: string,
  imageBytes: Uint8Array,
  claimedPalette: unknown,
  source: string,
): MessageView | null {
  const hash = digestToken(claimToken);
  const msg = get<Message>('SELECT * FROM messages WHERE claim_hash = ?', hash);
  if (!msg) return null;
  return tx(() => {
    const existing = getHintForMessage(msg.id);
    if (existing) {
      // One palette per message keeps the public spec simple: replacing the
      // photo replaces the palette, and the old photo goes with it.
      if (existing.image_id) deleteImage(existing.image_id);
      run('DELETE FROM hints WHERE id = ?', existing.id);
    }
    createHintFromImage(msg.id, imageBytes, claimedPalette, source);
    return toView(getMessage(msg.id)!);
  });
}

export function findMessageByClaim(claimToken: string): Message | undefined {
  return get<Message>('SELECT * FROM messages WHERE claim_hash = ?', digestToken(claimToken));
}
