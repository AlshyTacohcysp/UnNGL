/**
 * Only same-site paths may be used as a post-login (or post-error) destination.
 * Anything else — an absolute URL, a protocol-relative `//evil.com` — is a
 * redirect an attacker controls.
 *
 * @license AGPL-3.0-or-later
 */

export function safeRedirectPath(value: string | null | undefined, fallback = '/inbox'): string {
  if (!value) return fallback;
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//')) return fallback;
  if (value.includes('\\')) return fallback;
  if (/[\r\n]/.test(value)) return fallback;
  return value;
}
