/** Ensure number has country code prefix. Returns "+919876543210" format. */
export function normalizePhone(number: string, defaultCode = '+91'): string {
  const cleaned = number.replace(/\s+/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('+')) return cleaned;
  const codeDigits = defaultCode.slice(1);
  if (cleaned.startsWith(codeDigits)) return '+' + cleaned;
  return defaultCode + cleaned;
}

/** Strip country code prefix for display. Returns "9876543210". */
export function stripCountryCode(number: string, code = '+91'): string {
  const cleaned = number.replace(/\s+/g, '');
  if (cleaned.startsWith(code)) return cleaned.slice(code.length);
  const codeDigits = code.slice(1);
  if (cleaned.startsWith(codeDigits)) return cleaned.slice(codeDigits.length);
  return cleaned;
}
