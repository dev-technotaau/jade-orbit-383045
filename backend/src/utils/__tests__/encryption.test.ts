/**
 * Tests for field-level encryption (src/utils/encryption.ts).
 *
 * The point of this file is the rotation story. The original implementation
 * stored `iv:tag:ciphertext` with nothing naming the key and returned the
 * ciphertext from every failure path, so replacing FIELD_ENCRYPTION_KEY was
 * indistinguishable from a successful read: note bodies and consent evidence
 * surfaced as base64 in the UI and MFA quietly stopped verifying. Two rules are
 * asserted below and must not be softened — a value that was never encrypted
 * passes through, and a value that WAS encrypted either decrypts or throws.
 */

jest.mock('../../config/env', () => ({
  env: { FIELD_ENCRYPTION_KEY: undefined } as Record<string, string | undefined>,
}));

jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import crypto from 'crypto';
import {
  DecryptionError,
  currentKeyId,
  decryptField,
  decryptJson,
  encryptField,
  encryptJson,
  isEncrypted,
  isEncryptionEnabled,
  keyIdOf,
  tryDecryptField,
} from '../encryption';

const { env } = jest.requireMock('../../config/env') as { env: Record<string, string | undefined> };

const KEY_V1 = crypto.randomBytes(32).toString('hex');
const KEY_V2 = crypto.randomBytes(32).toString('hex');

/** The pre-versioning format, built independently — this is a legacy row. */
const encryptLegacy = (plaintext: string, keyHex: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    data.toString('base64'),
  ].join(':');
};

beforeEach(() => {
  env.FIELD_ENCRYPTION_KEY = KEY_V1;
  env.FIELD_ENCRYPTION_KEY_ID = 'v1';
  env.FIELD_ENCRYPTION_KEYS = undefined;
});

describe('encryptField / decryptField', () => {
  it('round-trips a value and stamps it with the current key id', () => {
    const stored = encryptField('opt-in via reply on 2026-08-01');

    expect(stored.startsWith('v1:')).toBe(true);
    expect(stored.split(':')).toHaveLength(4);
    expect(stored).not.toContain('opt-in');
    expect(decryptField(stored)).toBe('opt-in via reply on 2026-08-01');
    expect(keyIdOf(stored)).toBe('v1');
    expect(isEncrypted(stored)).toBe(true);
  });

  it('round-trips unicode and empty strings', () => {
    for (const value of ['', 'नमस्ते 🙏', 'a'.repeat(5000)]) {
      expect(decryptField(encryptField(value))).toBe(value);
    }
  });

  it('leaves values that were never encrypted alone', () => {
    // Rows predate encryption, and operator notes contain colons.
    for (const value of ['called back', 'called at 10:30:45', '{"source":"reply"}', 'a:b']) {
      expect(isEncrypted(value)).toBe(false);
      expect(decryptField(value)).toBe(value);
    }
  });

  it('stores plaintext when no key is configured', () => {
    env.FIELD_ENCRYPTION_KEY = undefined;
    expect(isEncryptionEnabled()).toBe(false);
    expect(encryptField('note body')).toBe('note body');
  });

  it('uses the configured key id, so ids are not hardcoded to v1', () => {
    env.FIELD_ENCRYPTION_KEY_ID = '2026-08';
    expect(currentKeyId()).toBe('2026-08');
    const stored = encryptField('secret');
    expect(keyIdOf(stored)).toBe('2026-08');
    expect(decryptField(stored)).toBe('secret');
  });
});

describe('key rotation', () => {
  it('still reads rows written before key ids existed', () => {
    const legacy = encryptLegacy('legacy note', KEY_V1);

    expect(legacy.split(':')).toHaveLength(3);
    expect(isEncrypted(legacy)).toBe(true);
    expect(keyIdOf(legacy)).toBeNull();
    expect(decryptField(legacy)).toBe('legacy note');
  });

  it('reads rows on the retired key after the key is rotated', () => {
    // The whole failure mode this exists for: swap the key and every existing
    // row used to come back as base64 with no error anywhere.
    const onOldKey = encryptField('consent evidence');

    env.FIELD_ENCRYPTION_KEY = KEY_V2;
    env.FIELD_ENCRYPTION_KEY_ID = 'v2';
    env.FIELD_ENCRYPTION_KEYS = JSON.stringify({ v1: KEY_V1 });

    expect(decryptField(onOldKey)).toBe('consent evidence');
    expect(keyIdOf(encryptField('new row'))).toBe('v2');
  });

  it('reads UNVERSIONED rows through the retired key too', () => {
    const legacy = encryptLegacy('legacy note', KEY_V1);

    env.FIELD_ENCRYPTION_KEY = KEY_V2;
    env.FIELD_ENCRYPTION_KEY_ID = 'v2';
    env.FIELD_ENCRYPTION_KEYS = JSON.stringify({ v1: KEY_V1 });

    expect(decryptField(legacy)).toBe('legacy note');
  });

  it('picks up a change to the key map without a restart', () => {
    const onOldKey = encryptField('evidence');
    env.FIELD_ENCRYPTION_KEY = KEY_V2;
    env.FIELD_ENCRYPTION_KEY_ID = 'v2';

    expect(() => decryptField(onOldKey)).toThrow(DecryptionError);

    env.FIELD_ENCRYPTION_KEYS = JSON.stringify({ v1: KEY_V1 });
    expect(decryptField(onOldKey)).toBe('evidence');
  });
});

describe('decryption failure', () => {
  it('THROWS when the key that wrote the row is gone, instead of returning ciphertext', () => {
    const stored = encryptField('evidence');
    env.FIELD_ENCRYPTION_KEY = KEY_V2;
    env.FIELD_ENCRYPTION_KEY_ID = 'v2';

    expect(() => decryptField(stored)).toThrow(DecryptionError);
    expect(() => decryptField(stored)).toThrow(/key "v1"/);
  });

  it('THROWS when an unversioned row matches no configured key', () => {
    const legacy = encryptLegacy('legacy note', KEY_V2);
    expect(() => decryptField(legacy)).toThrow(DecryptionError);
  });

  it('THROWS when the ciphertext was modified', () => {
    const stored = encryptField('evidence');
    const parts = stored.split(':');
    const data = Buffer.from(parts[3], 'base64');
    data[0] ^= 0xff;
    parts[3] = data.toString('base64');

    expect(() => decryptField(parts.join(':'))).toThrow(DecryptionError);
  });

  it('THROWS on encrypted data when the key has been unset entirely', () => {
    const stored = encryptField('evidence');
    env.FIELD_ENCRYPTION_KEY = undefined;
    expect(() => decryptField(stored)).toThrow(DecryptionError);
  });

  it('carries the key id on the error so an operator knows which key to restore', () => {
    const stored = encryptField('evidence');
    env.FIELD_ENCRYPTION_KEY = KEY_V2;
    env.FIELD_ENCRYPTION_KEY_ID = 'v2';

    try {
      decryptField(stored);
      throw new Error('expected decryptField to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(DecryptionError);
      expect((err as DecryptionError).keyId).toBe('v1');
    }
  });
});

describe('tryDecryptField', () => {
  it('reports success with the plaintext', () => {
    expect(tryDecryptField(encryptField('body'))).toEqual({ ok: true, value: 'body' });
  });

  it('reports failure instead of throwing, so one bad row cannot fail a list', () => {
    const stored = encryptField('body');
    env.FIELD_ENCRYPTION_KEY = KEY_V2;
    env.FIELD_ENCRYPTION_KEY_ID = 'v2';

    const result = tryDecryptField(stored);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.keyId).toBe('v1');
  });
});

describe('encryptJson / decryptJson', () => {
  it('round-trips an object', () => {
    const evidence = { source: 'reply', ip: '203.0.113.7', ref: 'ads' };
    const stored = encryptJson(evidence);

    expect(typeof stored).toBe('string');
    expect(stored).not.toContain('203.0.113.7');
    expect(decryptJson(stored)).toEqual(evidence);
  });

  it('passes legacy plaintext objects and nulls through untouched', () => {
    expect(decryptJson({ source: 'reply' })).toEqual({ source: 'reply' });
    expect(decryptJson(null)).toBeNull();
    expect(decryptJson(undefined)).toBeUndefined();
  });

  it('propagates the decryption failure rather than returning the ciphertext', () => {
    // Evidence that cannot be decrypted is not evidence; handing the API a
    // base64 blob to render as opt-in provenance is worse than an error.
    const stored = encryptJson({ source: 'reply' });
    env.FIELD_ENCRYPTION_KEY = KEY_V2;
    env.FIELD_ENCRYPTION_KEY_ID = 'v2';

    expect(() => decryptJson(stored)).toThrow(DecryptionError);
  });
});
