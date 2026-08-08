/**
 * Validation helpers for Indian legal identity codes — PAN, GSTIN, CIN.
 * Shared by the masked inputs' parents (employer onboarding + profile)
 * for save-time gating, including legacy values saved before positional
 * masking existed (which may contain lowercase/junk the inputs can no
 * longer produce).
 */

/** PAN: 5 letters, 4 digits, 1 letter — e.g. AAAAA1234A. */
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/**
 * GSTIN: 2-digit state code + the entity's 10-char PAN + entity code
 * [1-9A-Z] + literal 'Z' + alphanumeric checksum — 15 chars total.
 * This is the government-published shape.
 */
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/**
 * CIN: listing char (L/U) + 5-digit NIC code + 2-letter state +
 * 4-digit incorporation year + 3-letter ownership type + 6-digit
 * registration number — 21 chars total (MCA format).
 */
export const CIN_REGEX = /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;

/**
 * LLPIN: 3 letters + hyphen + 4 digits — e.g. AAB-1234 (MCA format for
 * Limited Liability Partnerships; LLPs have this instead of a CIN).
 */
export const LLPIN_REGEX = /^[A-Z]{3}-[0-9]{4}$/;

/**
 * TAN: 4 letters + 5 digits + 1 letter — e.g. DELM12345B. Issued to
 * any entity that deducts/collects tax at source (TDS/TCS), which can
 * be a company OR an individual/proprietor employer.
 */
export const TAN_REGEX = /^[A-Z]{4}[0-9]{5}[A-Z]$/;

export const isValidPan = (v: string): boolean => PAN_REGEX.test(v);
export const isValidGstin = (v: string): boolean => GSTIN_REGEX.test(v);
export const isValidCin = (v: string): boolean => CIN_REGEX.test(v);
export const isValidLlpin = (v: string): boolean => LLPIN_REGEX.test(v);
export const isValidTan = (v: string): boolean => TAN_REGEX.test(v);

/**
 * Characters 3–12 of a GSTIN are, by specification, the entity's PAN.
 * Cross-checking the two catches real data-entry errors (or someone
 * pasting another company's GSTIN). Only meaningful when both values
 * are complete — callers should gate on that before treating a `false`
 * as an error.
 */
export function gstinEmbedsPan(gstin: string, pan: string): boolean {
  return gstin.slice(2, 12) === pan;
}
