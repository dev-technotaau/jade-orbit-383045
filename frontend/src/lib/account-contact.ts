/**
 * Matching helpers for the "use my account contact details" consent flow
 * on employer onboarding + profile.
 *
 * The product rule: an employer may only use their ACCOUNT email/mobile
 * as the public company contact via an explicit checkbox (which locks
 * the field). Typing the account value manually without ticking the box
 * is rejected at validation time. These helpers decide "is this the
 * account value?" robustly so format noise can't dodge the check.
 */

/**
 * Case-insensitive, whitespace-trimmed email equality. Both sides must
 * be non-empty — an empty form field never "matches" anything.
 */
export function emailsMatch(a?: string | null, b?: string | null): boolean {
  const ea = (a ?? '').trim().toLowerCase();
  const eb = (b ?? '').trim().toLowerCase();
  return ea.length > 0 && ea === eb;
}

/**
 * Phone equality on the last 10 digits (Indian mobile length), ignoring
 * all formatting — `+91 98765-43210`, `09876543210` and `9876543210`
 * all match each other. Requires BOTH sides to have at least 10 digits
 * so short/partial inputs can't accidentally match.
 */
export function phonesMatch(a?: string | null, b?: string | null): boolean {
  const da = (a ?? '').replace(/\D/g, '');
  const db = (b ?? '').replace(/\D/g, '');
  if (da.length < 10 || db.length < 10) return false;
  return da.slice(-10) === db.slice(-10);
}
