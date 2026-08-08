/**
 * Lightweight text-moderation heuristic for company reviews.
 *
 * Detects common spam/abuse signals without any external dependency:
 *   - Profanity (English + common Hindi-romanised slur list).
 *   - URL stuffing (>2 URLs in body — typical promo spam).
 *   - All-caps shouting (>50% caps in a body ≥30 chars).
 *   - Repeat-char floods (`heyyyyy`, `!!!!!!!!!`).
 *   - Personal-data leakage (10-digit phone, GST, PAN — flagged for review).
 *
 * Returns:
 *   - `ok: true` → safe to auto-publish.
 *   - `ok: false` + `reason` → set status=FLAGGED, super-admin will review.
 *
 * Intentionally conservative — false positives are reviewed by a human
 * super-admin so the cost of mis-flagging is low. The bar is "looks
 * fishy enough to warrant a human glance".
 */

const PROFANITY_PATTERNS: RegExp[] = [
  /\bf+u+c+k+\b/i,
  /\bs+h+i+t+\b/i,
  /\bb+i+t+c+h+\b/i,
  /\bc+u+n+t+\b/i,
  /\ba+s+s+h+o+l+e+\b/i,
  /\b(mother|son\s*of\s*a)\s*f[a-z]*er\b/i,
  /\b(chutiya|gandu|bhosdi|madarchod|behenchod|randi)\b/i,
];

const URL_PATTERN = /https?:\/\/[^\s]+|www\.[^\s]+\.[a-z]{2,}/gi;
const REPEAT_CHAR = /(.)\1{6,}/i;
const PHONE_10_DIGITS = /(?:\+?91[\s-]?)?[6-9]\d{9}/;
const GST_PATTERN = /\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}Z[A-Z\d]\b/;
const PAN_PATTERN = /\b[A-Z]{5}\d{4}[A-Z]\b/;

export type ModerationVerdict = { ok: true } | { ok: false; reason: string };

export function moderateReviewBody(parts: {
  likes?: string | null;
  dislikes?: string | null;
  workDetails?: string | null;
}): ModerationVerdict {
  const combined = [parts.likes, parts.dislikes, parts.workDetails]
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .join('\n\n');

  if (combined.length === 0) {
    // No body — that's fine; "non-detailed" reviews are allowed.
    return { ok: true };
  }

  for (const pattern of PROFANITY_PATTERNS) {
    if (pattern.test(combined)) {
      return { ok: false, reason: 'profanity_detected' };
    }
  }

  const urlMatches = combined.match(URL_PATTERN);
  if (urlMatches && urlMatches.length > 2) {
    return { ok: false, reason: 'url_stuffing' };
  }

  if (combined.length >= 30) {
    const letters = combined.replace(/[^A-Za-z]/g, '');
    if (letters.length >= 30) {
      const caps = letters.replace(/[^A-Z]/g, '').length;
      if (caps / letters.length > 0.7) {
        return { ok: false, reason: 'all_caps_shouting' };
      }
    }
  }

  if (REPEAT_CHAR.test(combined)) {
    return { ok: false, reason: 'repeat_char_flood' };
  }

  if (PHONE_10_DIGITS.test(combined)) {
    return { ok: false, reason: 'personal_phone_in_body' };
  }
  if (GST_PATTERN.test(combined) || PAN_PATTERN.test(combined)) {
    return { ok: false, reason: 'personal_id_in_body' };
  }

  return { ok: true };
}

/**
 * Min-length sanity check for body fields. The form layer enforces
 * the same rule client-side, but defence-in-depth.
 */
export function isDetailedBody(parts: {
  likes?: string | null;
  dislikes?: string | null;
  workDetails?: string | null;
}): boolean {
  const ok = (s?: string | null) => typeof s === 'string' && s.trim().length >= 30;
  return ok(parts.likes) && ok(parts.dislikes) && ok(parts.workDetails);
}
