import crypto from 'crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Get the field encryption key from environment.
 * Returns null if not configured (encryption disabled).
 */
function getKey(): Buffer | null {
  const keyHex = (env as unknown as Record<string, string | undefined>).FIELD_ENCRYPTION_KEY;
  if (!keyHex) return null;
  return Buffer.from(keyHex, 'hex');
}

/**
 * Whether field encryption is configured (FIELD_ENCRYPTION_KEY present).
 * Callers that store third-party secrets (e.g. mailbox IMAP/SMTP passwords)
 * should refuse to persist rather than silently fall back to plaintext.
 */
export function isEncryptionEnabled(): boolean {
  return getKey() !== null;
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns format: iv:authTag:ciphertext (all base64).
 * Returns plaintext unchanged if encryption key is not configured.
 */
export function encryptField(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypt a field encrypted with encryptField().
 * Returns the value unchanged if it doesn't match the encrypted format.
 */
export function decryptField(encrypted: string): string {
  const key = getKey();
  if (!key) return encrypted;

  const parts = encrypted.split(':');
  if (parts.length !== 3) return encrypted; // Not encrypted, return as-is

  try {
    const [ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');

    if (iv.length !== IV_LENGTH || authTag.length !== TAG_LENGTH) {
      return encrypted; // Not our format
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return encrypted; // Decryption failed, return as-is
  }
}

/**
 * Encrypt a JSON-serializable value for storage in a Prisma `Json` column.
 * Returns the ciphertext string (a valid JSON value). Pairs with decryptJson().
 */
export function encryptJson(value: unknown): string {
  return encryptField(JSON.stringify(value));
}

/**
 * Inverse of encryptJson(). Accepts the stored value as read from a `Json`
 * column: an encrypted string -> decrypted + parsed object; a legacy plaintext
 * object (or null) -> returned unchanged. Safe to run on mixed old/new rows.
 */
export function decryptJson(stored: unknown): unknown {
  if (typeof stored !== 'string') return stored; // legacy object / null — as-is
  const decrypted = decryptField(stored);
  try {
    return JSON.parse(decrypted);
  } catch {
    return decrypted;
  }
}

/**
 * Check if a string appears to be an encrypted field value.
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  try {
    const iv = Buffer.from(parts[0], 'base64');
    return iv.length === IV_LENGTH;
  } catch {
    return false;
  }
}
