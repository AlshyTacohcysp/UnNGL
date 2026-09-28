/**
 * Request validation. Every API body goes through zod before it reaches the
 * database, and the limits here are the only place message length is defined.
 *
 * @license AGPL-3.0-or-later
 */

import { z } from 'zod';
import { config } from './config';

/** Pragmatic email check: one @, a dot in the domain, no whitespace. */
export const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .toLowerCase()
  .refine((v) => /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(v), 'That does not look like an email address');

export const loginRequestSchema = z.object({ email: emailSchema });

export const loginVerifySchema = z.object({
  email: emailSchema,
  code: z.string().trim().regex(/^\d{6}$/, 'The code is 6 digits'),
});

export const messageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Write something first')
    .max(config.limits.maxMessageChars, `Keep it under ${config.limits.maxMessageChars} characters`)
    // Strip control characters; keep newlines and emoji.
    .transform((s) => s.replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/g, '')),
  /**
   * Anti-bot honeypot. Real people never see this field, so anything in it is a
   * bot: we accept the input and report a generic failure, so the response
   * teaches the sender nothing about why it was rejected.
   */
  website: z.string().max(200).optional(),
});

export const claimedPaletteSchema = z
  .object({
    colors: z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).min(1).max(16),
    primary: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    weight: z.number().min(0).max(1).optional(),
  })
  .optional()
  .nullable();

export const inboxSchema = z.object({
  title: z.string().trim().min(1).max(60).optional(),
});

export const inboxPatchSchema = z.object({
  title: z.string().trim().min(1).max(60).optional(),
  notify: z.boolean().optional(),
  rotate: z.boolean().optional(),
  delete: z.boolean().optional(),
});

export const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type MessageInput = z.infer<typeof messageSchema>;
