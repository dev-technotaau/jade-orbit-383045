/**
 * Phone-number normalisation to E.164.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * There were two disagreeing implementations of this: the API accepted
 * `/^\+?[1-9]\d{1,14}$/` (the `+` OPTIONAL), and `sendSMS` then built the
 * destination as `'+' + digits`. A bare Indian `9876543210` therefore passed
 * validation and was dispatched as `+9876543210` — `+98` is Iran. The message
 * left the platform addressed to a different country and Twilio reported it
 * as accepted.
 *
 * This module is the single definition. It is applied at BOTH ends:
 *   • at the schema boundary, so what lands in the database is already E.164;
 *   • inside the SMS enqueue path, so a value that reached the DB some other
 *     way (seed, import, direct SQL, an older row) cannot still be misrouted.
 *
 * It is deliberately conservative: anything it cannot resolve confidently
 * returns `null`, and the caller refuses to send. Texting the wrong person is
 * worse than not texting.
 */

/**
 * Default country calling code (no `+`) applied to numbers supplied without
 * one. India, because that is the platform's market; override per-deployment.
 */
const DEFAULT_CC = (process.env.DEFAULT_COUNTRY_CODE || '91').replace(/\D/g, '');

/** National significant number lengths we accept for the default country. */
const DEFAULT_CC_NSN_LENGTH: Record<string, number> = {
  '91': 10, // India
  '1': 10, // US/Canada
  '44': 10, // UK (mobile, without trunk 0)
  '971': 9, // UAE
};

/** A syntactically valid E.164 string: `+` then 8–15 digits, no leading zero. */
export const E164_REGEX = /^\+[1-9]\d{7,14}$/;

/**
 * Convert user input to E.164, or `null` when it cannot be resolved.
 *
 * Handles the forms people actually type:
 *   +91 98765 43210 / +91-98765-43210 → +919876543210
 *   00919876543210                    → +919876543210   (00 = intl prefix)
 *   09876543210                       → +919876543210   (0 = trunk prefix)
 *   9876543210                        → +919876543210   (bare national)
 *   +13155551234                      → +13155551234    (already E.164)
 */
export function toE164(input: string | null | undefined, defaultCc = DEFAULT_CC): string | null {
  if (!input) return null;

  // Strip everything a human might type as separators.
  let s = String(input)
    .trim()
    .replace(/[\s()\-.]/g, '');
  if (!s) return null;

  if (s.startsWith('+')) {
    s = '+' + s.slice(1).replace(/\D/g, '');
  } else if (s.startsWith('00')) {
    // ITU international access prefix.
    s = '+' + s.slice(2).replace(/\D/g, '');
  } else {
    const digits = s.replace(/\D/g, '');
    if (!digits) return null;

    const expected = DEFAULT_CC_NSN_LENGTH[defaultCc];

    // National trunk prefix: 0 followed by the national number.
    if (digits.startsWith('0')) {
      const nsn = digits.replace(/^0+/, '');
      if (!nsn) return null;
      if (expected && nsn.length !== expected) return null;
      s = `+${defaultCc}${nsn}`;
    } else if (
      digits.startsWith(defaultCc) &&
      expected &&
      digits.length === defaultCc.length + expected
    ) {
      // Already carries the country code, just without the `+`.
      s = `+${digits}`;
    } else if (expected && digits.length === expected) {
      s = `+${defaultCc}${digits}`;
    } else {
      // Ambiguous: could be a foreign number missing its `+`, or a typo.
      // Refusing is the safe answer — see the module comment.
      return null;
    }
  }

  return E164_REGEX.test(s) ? s : null;
}

/** True when the value is already valid E.164. */
export function isE164(value: string | null | undefined): boolean {
  return !!value && E164_REGEX.test(value);
}
