import crypto from 'crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/** Key id assumed when FIELD_ENCRYPTION_KEY_ID is unset (dev, tests). */
const DEFAULT_KEY_ID = 'v1';

/**
 * Key ids are short opaque labels: `v1`, `v2`, `2026-08`. Duplicated in
 * config/env.ts, which validates the same shape at boot — env.ts cannot import
 * from here (this module imports env).
 */
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

/**
 * Read an encryption setting off `env`.
 *
 * Deliberately a per-call lookup (and a cast, because tests mock the module
 * with a partial object): nothing here caches the key, so a test can flip it
 * between cases and a process restart is the only thing a rotation needs.
 */
function setting(
  name: 'FIELD_ENCRYPTION_KEY' | 'FIELD_ENCRYPTION_KEY_ID' | 'FIELD_ENCRYPTION_KEYS'
): string | undefined {
  return (env as unknown as Record<string, string | undefined>)[name];
}

/**
 * Get the field encryption key from environment.
 * Returns null if not configured (encryption disabled).
 */
function getKey(): Buffer | null {
  const keyHex = setting('FIELD_ENCRYPTION_KEY');
  if (!keyHex) return null;
  return Buffer.from(keyHex, 'hex');
}

/**
 * The key id stamped into everything encrypted from now on.
 */
export function currentKeyId(): string {
  return setting('FIELD_ENCRYPTION_KEY_ID') || DEFAULT_KEY_ID;
}

let retiredCache: { raw: string | undefined; keys: Map<string, Buffer> } | null = null;

/**
 * Previous keys, kept readable while a rotation is in flight
 * (FIELD_ENCRYPTION_KEYS, a JSON map of key id -> hex key).
 *
 * Memoised on the raw string rather than on first read, so a test that swaps
 * the map mid-suite is not served a stale one. The throws below are
 * unreachable in a booted process — config/env.ts rejects a malformed map
 * before the server starts — but a bad value must not degrade into "no retired
 * keys", which reads as data loss.
 */
function retiredKeys(): Map<string, Buffer> {
  const raw = setting('FIELD_ENCRYPTION_KEYS');
  if (retiredCache && retiredCache.raw === raw) return retiredCache.keys;

  const keys = new Map<string, Buffer>();
  if (raw) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('FIELD_ENCRYPTION_KEYS is not valid JSON - expected {"v1":"<64 hex>"}');
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('FIELD_ENCRYPTION_KEYS must be a JSON object of key id -> 64-char hex key');
    }
    for (const [id, hex] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof hex !== 'string' || !/^[0-9a-fA-F]{64}$/.test(hex)) {
        throw new Error(`FIELD_ENCRYPTION_KEYS["${id}"] is not a 64-char hex key`);
      }
      keys.set(id, Buffer.from(hex, 'hex'));
    }
  }

  retiredCache = { raw, keys };
  return keys;
}

/**
 * Whether field encryption is configured (FIELD_ENCRYPTION_KEY present).
 *
 * `encryptField` returns its input unchanged when there is no key, which is the
 * right behaviour for a dev machine and a silent data-protection failure in
 * production: opt-in evidence (IP, referral) and operator notes about customers
 * land in the database as plaintext, with nothing in the logs saying so. The
 * key is now required in production (config/env.ts refuses to boot without it),
 * and {@link warnIfEncryptionDisabled} covers every other environment.
 */
export function isEncryptionEnabled(): boolean {
  return getKey() !== null;
}

let warned = false;

/**
 * Log once, loudly, when a field that is supposed to be encrypted is about to be
 * written in the clear. Called from the write sites and from boot.
 */
export function warnIfEncryptionDisabled(context = 'startup'): void {
  if (isEncryptionEnabled() || warned) return;
  warned = true;
  // Lazy require: this module is imported by config-level code, and importing
  // the logger eagerly would create a cycle.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const logger = require('../config/logger').default as { warn: (m: string) => void };
  logger.warn(
    `FIELD_ENCRYPTION_KEY is not set (${context}) - consent evidence and ` +
      'conversation notes will be stored in PLAINTEXT. Generate one with ' +
      '`openssl rand -hex 32`.'
  );
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns format: keyId:iv:authTag:ciphertext (iv/tag/ciphertext base64).
 * Returns plaintext unchanged if encryption key is not configured.
 *
 * The leading key id is the point. The original format was `iv:tag:ciphertext`
 * with nothing identifying the key, so rotating FIELD_ENCRYPTION_KEY orphaned
 * every existing row AND left no way to tell which rows were on which key —
 * not even a query could separate them. Rows written before this change carry
 * no id; they still decrypt (see {@link decryptField}) and `npm run reencrypt`
 * stamps them.
 */
export function encryptField(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    currentKeyId(),
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

/**
 * Thrown when a value is unmistakably our ciphertext and no configured key
 * opens it.
 *
 * `decryptField` used to return the ciphertext on every failure path, so a
 * rotated or lost key produced no error anywhere: note bodies and consent
 * evidence reached the UI as `iv:tag:data` base64, indistinguishable from
 * corrupt data, and MFA verified TOTP codes against the ciphertext instead of
 * the seed — it simply stopped accepting anything. An operator can act on an
 * error; they cannot act on silence.
 */
export class DecryptionError extends Error {
  /** Key id from the envelope; null for ciphertext written before key ids. */
  readonly keyId: string | null;

  constructor(message: string, keyId: string | null) {
    super(message);
    this.name = 'DecryptionError';
    this.keyId = keyId;
  }
}

interface Envelope {
  keyId: string | null;
  iv: Buffer;
  authTag: Buffer;
  data: Buffer;
}

/**
 * Recognise our ciphertext, versioned or not. Returns null for everything else
 * — a legacy plaintext note, a bare JSON string, an operator's "called at
 * 10:30:45" — because those predate encryption and must pass through untouched.
 */
function parseEnvelope(value: string): Envelope | null {
  const parts = value.split(':');

  let keyId: string | null;
  let body: string[];
  if (parts.length === 4 && KEY_ID_PATTERN.test(parts[0])) {
    keyId = parts[0];
    body = parts.slice(1);
  } else if (parts.length === 3) {
    keyId = null; // written before the envelope carried a key id
    body = parts;
  } else {
    return null;
  }

  const [ivB64, tagB64, dataB64] = body;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  if (iv.length !== IV_LENGTH || authTag.length !== TAG_LENGTH) return null; // Not our format

  return { keyId, iv, authTag, data: Buffer.from(dataB64, 'base64') };
}

/**
 * Keys to try for an envelope, most likely first.
 *
 * A versioned envelope names its key, so at most one candidate is tried. Older
 * ciphertext names nothing, so the current key is tried and then every retired
 * one — GCM's auth tag turns a wrong key into a clean failure rather than
 * plausible garbage, which is what makes trying several safe, and what keeps
 * un-migrated rows readable across a rotation.
 */
function candidateKeys(keyId: string | null): Buffer[] {
  const current = getKey();
  const retired = retiredKeys();

  if (keyId === null) {
    return [...(current ? [current] : []), ...retired.values()];
  }

  const candidates: Buffer[] = [];
  if (current && keyId === currentKeyId()) candidates.push(current);
  const retiredKey = retired.get(keyId);
  if (retiredKey) candidates.push(retiredKey);
  return candidates;
}

/** Try each key in turn; null when none of them authenticates. */
function openEnvelope(envelope: Envelope, keys: Buffer[]): string | null {
  for (const key of keys) {
    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, key, envelope.iv);
      decipher.setAuthTag(envelope.authTag);
      const decrypted = Buffer.concat([decipher.update(envelope.data), decipher.final()]);
      return decrypted.toString('utf8');
    } catch {
      // Wrong key — GCM rejected the tag. Fall through to the next candidate.
    }
  }
  return null;
}

/**
 * Decrypt a field encrypted with encryptField().
 *
 * Returns the value unchanged if it doesn't match the encrypted format (rows
 * that predate encryption). THROWS {@link DecryptionError} when the value IS
 * our ciphertext and cannot be opened — see that class for why returning the
 * ciphertext was worse than failing. Callers listing many rows, where one bad
 * row should not take down the whole response, want {@link tryDecryptField}.
 */
export function decryptField(encrypted: string): string {
  const envelope = parseEnvelope(encrypted);
  if (!envelope) return encrypted; // Not encrypted, return as-is

  const keys = candidateKeys(envelope.keyId);
  if (keys.length === 0) {
    throw new DecryptionError(
      envelope.keyId === null
        ? 'Cannot decrypt field: no encryption key configured (FIELD_ENCRYPTION_KEY)'
        : `Cannot decrypt field: key "${envelope.keyId}" is neither FIELD_ENCRYPTION_KEY_ID ` +
            'nor present in FIELD_ENCRYPTION_KEYS',
      envelope.keyId
    );
  }

  const plaintext = openEnvelope(envelope, keys);
  if (plaintext === null) {
    throw new DecryptionError(
      `Field decryption failed for key "${envelope.keyId ?? 'unversioned'}": no configured key ` +
        'matches this ciphertext, or the stored value was modified',
      envelope.keyId
    );
  }
  return plaintext;
}

export type DecryptResult = { ok: true; value: string } | { ok: false; error: DecryptionError };

/**
 * {@link decryptField} as a result rather than a throw, for callers that would
 * rather mark a single unreadable row than fail the request around it.
 */
export function tryDecryptField(encrypted: string): DecryptResult {
  try {
    return { ok: true, value: decryptField(encrypted) };
  } catch (err) {
    if (err instanceof DecryptionError) return { ok: false, error: err };
    throw err;
  }
}

/**
 * Encrypt a JSON-serializable value for storage in a Prisma `Json` column.
 * Returns the ciphertext string (a valid JSON value). Pairs with decryptJson().
 */
export function encryptJson(value: unknown): string {
  // Consent evidence carries IP and referral data; if it is about to be stored
  // in the clear, say so once rather than degrading silently.
  warnIfEncryptionDisabled('consent evidence');
  return encryptField(JSON.stringify(value));
}

/**
 * Inverse of encryptJson(). Accepts the stored value as read from a `Json`
 * column: an encrypted string -> decrypted + parsed object; a legacy plaintext
 * object (or null) -> returned unchanged. Safe to run on mixed old/new rows.
 *
 * Propagates {@link DecryptionError} for an unreadable ciphertext: consent
 * evidence that cannot be decrypted is not evidence, and handing the caller a
 * base64 blob to render as provenance is worse than an error.
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
  return parseEnvelope(value) !== null;
}

/**
 * The key id a stored value was encrypted under: a label for versioned
 * ciphertext, null for pre-versioning ciphertext AND for values that aren't
 * encrypted at all — pair it with {@link isEncrypted} to tell those apart.
 * Lets the re-encryption script skip rows already on the current key.
 */
export function keyIdOf(value: string): string | null {
  return parseEnvelope(value)?.keyId ?? null;
}
