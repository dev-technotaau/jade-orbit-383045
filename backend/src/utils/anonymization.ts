import crypto from 'crypto';

/**
 * Anonymize an email address.
 * Returns a SHA-256 hash prefix + @anonymized.local
 */
export function anonymizeEmail(email: string): string {
  const hash = crypto.createHash('sha256').update(email.toLowerCase()).digest('hex');
  return `${hash.substring(0, 16)}@anonymized.local`;
}

/**
 * Anonymize a name.
 * Returns "User_" + first 8 characters of SHA-256 hash.
 */
export function anonymizeName(name: string): string {
  const hash = crypto.createHash('sha256').update(name).digest('hex');
  return `User_${hash.substring(0, 8)}`;
}

/**
 * Anonymize a phone number.
 * Returns "***" + last 4 digits.
 */
export function anonymizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `***${digits.slice(-4)}`;
}

/**
 * Anonymize a generic string field by hashing it.
 */
export function anonymizeString(value: string): string {
  const hash = crypto.createHash('sha256').update(value).digest('hex');
  return hash.substring(0, 16);
}
