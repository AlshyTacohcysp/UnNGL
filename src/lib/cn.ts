/**
 * Class name joiner.
 *
 * The app has no CSS-in-JS and no `clsx`; a conditional className is either
 * two literals joined or one of two values chosen, and this is the smallest
 * thing that expresses both without a truthy-string bug.
 *
 * @license AGPL-3.0-or-later
 */

export type ClassValue = string | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
