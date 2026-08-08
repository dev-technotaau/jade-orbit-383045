import { z } from 'zod';
import { toE164 } from '../utils/phone';

/**
 * The single mobile-number validator.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * There were two competing definitions. `super-admin.schema.ts` required
 * strict E.164 (`/^\+[1-9]\d{6,14}$/`), while `auth.schema.ts` made the `+`
 * OPTIONAL (`/^\+?[1-9]\d{1,14}$/`). The lax one let a bare `9876543210`
 * through, which the SMS sender then dispatched as `+9876543210` — country
 * code 98, Iran.
 *
 * This validator both NORMALISES and validates: it accepts the forms people
 * actually type (spaces, dashes, a leading 0, a 00 prefix, or a bare national
 * number) and *transforms* them to E.164, so what reaches the database and
 * the SMS queue is already correct. Anything it cannot resolve confidently is
 * a validation error rather than a silently-misrouted message.
 */
export const e164Phone = z.string().transform((value, ctx) => {
  const normalized = toE164(value);
  if (!normalized) {
    ctx.addIssue({
      code: 'custom',
      message: 'Invalid mobile number — use international format, e.g. +919876543210',
    });
    return z.NEVER;
  }
  return normalized;
});

/** Optional variant that preserves `undefined` rather than failing on it. */
export const e164PhoneOptional = e164Phone.optional();
