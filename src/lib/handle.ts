/**
 * User-chosen handles.
 *
 * A handle is the friendly half of an inbox's public URL: `amina.k` instead
 * of `7uaibm3q7xc8`. The slug stays exactly as it was — 12 characters of
 * entropy, the actual credential — and the handle is a second, memorable name
 * for the same inbox. A link shared with a slug keeps working forever; a
 * handle can be given, changed, or released.
 *
 * Three properties this module exists to guarantee:
 *
 *  1. A handle can never collide with a route the app owns. `/login`,
 *     `/i/amina.k` and `/api/...` all have to keep working, so those names
 *     are reserved before anything else happens.
 *  2. Two people can never hold the same handle, whatever order their
 *     requests arrive in. That is a unique index, not a check-then-insert.
 *  3. A handle is a public, attacker-chosen string that ends up in a URL, a
 *     page title and a link preview. So it is normalised to a small alphabet
 *     and length-capped at the first step, and nothing downstream has to
 *     escape it.
 *
 * @license AGPL-3.0-or-later
 */

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 24;

/**
 * A single lowercase run of letters, digits, dots, dashes and underscores,
 * starting and ending on a letter or digit.
 *
 * Deliberately ASCII-only. Underscores are not permitted to lead, so
 * `_admin` cannot be made to look like a system account, and the dot form
 * (`amina.k`) is allowed because that is the shape people expect from a
 * username. Homoglyphs are not a concern here because a handle is never
 * rendered as a trust signal — it is always shown next to its own inbox,
 * which the recipient can verify by the colours in the message.
 */
const HANDLE_RE = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

/**
 * Names the app already routes, plus the ones an attacker would reach for.
 * Compared against the *normalised* handle, so `/ADMIN` and `/admin` are
 * both refused.
 */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  // app routes
  'api', 'i', 'h', 'u', 'login', 'logout', 'signup', 'inbox', 'settings',
  'algorithm', 'about', 'privacy', 'terms', 'admin', 'dashboard', 'account',
  'static', 'public', 'assets', 'cdn', 'www', 'help', 'support', 'search',
  'new', 'edit', 'delete', 'null', 'undefined', 'me', 'you', 'all', 'home',
  // plausible impersonation of the service or its infra
  'root', 'system', 'administrator', 'moderator', 'support', 'security',
  'postmaster', 'hostmaster', 'abuse', 'noreply', 'no-reply', 'unngl',
  'ngl', 'official', 'staff', 'team', 'helpdesk', 'billing', 'pay',
  // the extension of a public URL is a claim about origin; don't let a
  // handle be mistaken for one
  'com', 'org', 'net', 'io', 'link', 'app', 'dev', 'co',
]);

/** Why a handle was refused, so the UI can say something useful. */
export type HandleProblem =
  | 'empty'
  | 'too-short'
  | 'too-long'
  | 'characters'
  | 'reserved'
  | 'taken';

export interface HandleCheck {
  ok: boolean;
  /** The canonical form to store. Present whenever `ok` is true. */
  handle?: string;
  problem?: HandleProblem;
  /** A sentence the UI can show verbatim. */
  message?: string;
}

/**
 * Fold a typed handle to its canonical form: trimmed, lowercased. Returns ''
 * for anything that cannot be a handle at all.
 */
export function normalizeHandle(input: string): string {
  return input.trim().toLowerCase();
}

/**
 * Validate a handle without touching the database.
 *
 * `taken` is never returned here — availability is a race and only a unique
 * index can settle it, so it is reported by the caller after the insert.
 */
export function validateHandle(input: string): HandleCheck {
  const handle = normalizeHandle(input);

  if (!handle) return { ok: false, problem: 'empty', message: 'Pick a name.' };
  if (handle.length < HANDLE_MIN) {
    return {
      ok: false,
      problem: 'too-short',
      message: `At least ${HANDLE_MIN} characters.`,
    };
  }
  if (handle.length > HANDLE_MAX) {
    return {
      ok: false,
      problem: 'too-long',
      message: `At most ${HANDLE_MAX} characters.`,
    };
  }
  // `..` and friends are refused before the character test so the message can
  // name the actual problem instead of "those characters aren't allowed".
  if (handle.includes('..')) {
    return { ok: false, problem: 'characters', message: 'Two dots in a row is not a name.' };
  }
  if (!HANDLE_RE.test(handle)) {
    return {
      ok: false,
      problem: 'characters',
      message: 'Letters, numbers, dots, dashes and underscores only.',
    };
  }
  if (RESERVED_HANDLES.has(handle)) {
    return { ok: false, problem: 'reserved', message: 'That one is taken by UnNGL itself.' };
  }

  return { ok: true, handle };
}

/**
 * A hint for the person typing, shown under the field.
 *
 * Deliberately not an error: it is a nudge, and it is the same string for
 * everyone, so it cannot be used to map which handles exist.
 */
export function handleHint(input: string): string {
  const handle = normalizeHandle(input);
  if (!handle) return `${HANDLE_MIN}–${HANDLE_MAX} characters. Letters, numbers, dots, dashes.`;
  if (handle.length < HANDLE_MIN) return `${HANDLE_MIN - handle.length} more character(s) to go.`;
  if (handle.length > HANDLE_MAX) return `${handle.length - HANDLE_MAX} too many.`;
  if (RESERVED_HANDLES.has(handle)) return 'That one belongs to UnNGL.';
  return 'Looks good.';
}
