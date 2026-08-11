/**
 * Tests for the MFA service (src/services/whatsapp-mfa.service.ts).
 *
 * The first describe block is the important one. hire_adda's equivalent feature
 * has never worked in production: generation hashes the dashed `'A1B2-C3D4'`,
 * verification strips the dash and hashes `'A1B2C3D4'`, and no input can satisfy
 * both — so the backup-code branch is dead code and the only way back into a
 * locked-out account is an email OTP. It is exactly the kind of bug that unit
 * tests exist for and that no amount of code review catches, because each half
 * looks correct on its own.
 *
 * So: a round-trip test that fails the moment the two halves disagree.
 */

jest.mock('../../config/env', () => ({
  env: {
    BRAND_NAME: 'TechnoTaau',
    OPERATOR_LABEL: 'operator',
    FIELD_ENCRYPTION_KEY: 'a'.repeat(64),
  },
}));

const prismaMock = {
  waMfaConfig: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  waTrustedDevice: {
    create: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    delete: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
};
jest.mock('../../config/prisma', () => ({ prisma: prismaMock }));

// Redis backs the replay guard. Default: every code is fresh.
const redisMock = { set: jest.fn(), get: jest.fn(), del: jest.fn(), expire: jest.fn() };
jest.mock('../../config/redis', () => ({ redis: redisMock }));

jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { TOTP, Secret } from 'otpauth';
import * as mfa from '../whatsapp-mfa.service';
import { __testing } from '../whatsapp-mfa.service';

const SECRET = new Secret({ size: 20 }).base32;

/** A currently-valid code for the seed under test. */
const liveCode = (secret = SECRET): string =>
  new TOTP({
    issuer: 'TechnoTaau',
    label: 'operator',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  }).generate();

const config = (over: Record<string, unknown> = {}) => ({
  id: 'default',
  enabled: true,
  secret: SECRET, // encryptField is a pass-through in this env, see below
  pendingSecret: null,
  pendingAt: null,
  recoveryCodes: [],
  epoch: 1,
  enrolledAt: new Date(),
  lastVerifiedAt: null,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.waMfaConfig.upsert.mockResolvedValue(config());
  prismaMock.waMfaConfig.findUnique.mockResolvedValue({ enabled: true });
  prismaMock.waMfaConfig.update.mockResolvedValue({});
  prismaMock.waMfaConfig.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.waTrustedDevice.count.mockResolvedValue(0);
  redisMock.set.mockResolvedValue('OK'); // NX succeeds -> code not yet used
  redisMock.get.mockResolvedValue(null);
});

describe('recovery codes — generation and verification must agree', () => {
  it('hashes what it generates, verbatim, dashes and all', () => {
    // THE regression test. If someone changes one side's normalisation, this
    // fails immediately instead of silently disabling account recovery.
    for (const code of __testing.generateRecoveryCodes(20)) {
      expect(__testing.hashRecoveryCode(code)).toBe(
        __testing.hashRecoveryCode(__testing.normalizeRecoveryCode(code))
      );
    }
  });

  it('accepts the code however the operator retypes it', () => {
    const [code] = __testing.generateRecoveryCodes(1);
    const canonical = __testing.hashRecoveryCode(code);

    expect(__testing.hashRecoveryCode(code.replace('-', ''))).toBe(canonical); // no dash
    expect(__testing.hashRecoveryCode(code.toLowerCase())).toBe(canonical); // lowercase
    expect(__testing.hashRecoveryCode(` ${code} `)).toBe(canonical); // padded
    expect(__testing.hashRecoveryCode(code.replace('-', ' '))).toBe(canonical); // space
  });

  it('generates unique codes from an unambiguous alphabet', () => {
    const codes = __testing.generateRecoveryCodes(50);
    expect(new Set(codes).size).toBe(50);
    for (const c of codes) {
      expect(c).toMatch(
        /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/
      );
      // O/0 and I/1 are excluded — these get read down a phone line.
      expect(c).not.toMatch(/[O0I1]/);
    }
  });
});

describe('verifyCode — TOTP', () => {
  it('accepts a live code', async () => {
    await expect(mfa.verifyCode(liveCode())).resolves.toBe('totp');
  });

  it('rejects a wrong code', async () => {
    await expect(mfa.verifyCode('000000')).resolves.toBeNull();
  });

  it('rejects a code for a different seed', async () => {
    await expect(mfa.verifyCode(liveCode(new Secret({ size: 20 }).base32))).resolves.toBeNull();
  });

  it('REJECTS A REPLAY of a code it already accepted', async () => {
    // hire_adda has no replay guard at all: the same six digits keep working
    // for the full ~90s window, on every endpoint that takes a code.
    const code = liveCode();
    redisMock.set.mockResolvedValueOnce('OK'); // first claim wins
    await expect(mfa.verifyCode(code)).resolves.toBe('totp');

    redisMock.set.mockResolvedValueOnce(null); // NX fails -> already claimed
    await expect(mfa.verifyCode(code)).resolves.toBeNull();
  });

  it('still verifies when Redis is unavailable (fails open, not closed)', async () => {
    // Refusing every valid login during a Redis outage would trade a narrow
    // replay window for a total outage.
    redisMock.set.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(mfa.verifyCode(liveCode())).resolves.toBe('totp');
  });

  it('returns null when MFA is not enabled', async () => {
    prismaMock.waMfaConfig.upsert.mockResolvedValue(config({ enabled: false }));
    await expect(mfa.verifyCode(liveCode())).resolves.toBeNull();
  });
});

describe('verifyCode — recovery codes', () => {
  it('accepts a stored recovery code and consumes it atomically', async () => {
    const [code] = __testing.generateRecoveryCodes(1);
    const hash = __testing.hashRecoveryCode(code);
    prismaMock.waMfaConfig.upsert.mockResolvedValue(config({ recoveryCodes: [hash, 'other'] }));

    await expect(mfa.verifyCode(code)).resolves.toBe('recovery_code');

    // The guard `recoveryCodes: { has: hash }` is what stops two concurrent
    // requests both spending the same code.
    const call = prismaMock.waMfaConfig.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ recoveryCodes: { has: hash } });
    expect(call.data.recoveryCodes).toEqual(['other']);
  });

  it('loses the race gracefully when another request spent it first', async () => {
    const [code] = __testing.generateRecoveryCodes(1);
    prismaMock.waMfaConfig.upsert.mockResolvedValue(
      config({ recoveryCodes: [__testing.hashRecoveryCode(code)] })
    );
    prismaMock.waMfaConfig.updateMany.mockResolvedValue({ count: 0 });

    await expect(mfa.verifyCode(code)).resolves.toBeNull();
  });

  it('rejects a code that is not in the stored set', async () => {
    prismaMock.waMfaConfig.upsert.mockResolvedValue(config({ recoveryCodes: ['deadbeef'] }));
    await expect(mfa.verifyCode('ABCD-EFGH')).resolves.toBeNull();
  });
});

describe('enrolment', () => {
  it('REFUSES to enrol without FIELD_ENCRYPTION_KEY rather than store a plaintext seed', async () => {
    // hire_adda's encryptField returns its input unchanged when the key is
    // missing, so a misconfigured deployment silently stores raw base32 seeds.
    const { env } = jest.requireMock('../../config/env') as { env: Record<string, unknown> };
    const saved = env.FIELD_ENCRYPTION_KEY;
    env.FIELD_ENCRYPTION_KEY = undefined;

    await expect(mfa.beginEnrolment()).rejects.toMatchObject({
      code: 'WA_MFA_ENCRYPTION_REQUIRED',
    });
    expect(prismaMock.waMfaConfig.update).not.toHaveBeenCalled();

    env.FIELD_ENCRYPTION_KEY = saved;
  });

  it('writes the new seed to pendingSecret, never over a live one', async () => {
    // Re-opening the setup screen must not kill the authenticator that is
    // currently protecting the console.
    prismaMock.waMfaConfig.upsert.mockResolvedValue(config({ enabled: false, secret: null }));

    const res = await mfa.beginEnrolment();

    expect(res.secret).toMatch(/^[A-Z2-7]+$/);
    expect(res.qrCodeDataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(res.otpauthUri).toContain('issuer=TechnoTaau');
    const written = prismaMock.waMfaConfig.update.mock.calls[0][0].data;
    expect(written).toHaveProperty('pendingSecret');
    expect(written).not.toHaveProperty('secret');
  });

  it('refuses to start a second enrolment while MFA is enabled', async () => {
    await expect(mfa.beginEnrolment()).rejects.toMatchObject({
      code: 'WA_MFA_ALREADY_ENABLED',
    });
  });

  it('promotes pendingSecret and issues recovery codes on a correct code', async () => {
    prismaMock.waMfaConfig.upsert.mockResolvedValue(
      config({ enabled: false, secret: null, pendingSecret: SECRET, pendingAt: new Date() })
    );

    const { recoveryCodes } = await mfa.confirmEnrolment(liveCode());

    expect(recoveryCodes).toHaveLength(10);
    const data = prismaMock.waMfaConfig.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ enabled: true, secret: SECRET, pendingSecret: null });
    // Only hashes are persisted — the plaintext exists in the response and nowhere else.
    expect(data.recoveryCodes).toEqual(recoveryCodes.map(__testing.hashRecoveryCode));
    for (const stored of data.recoveryCodes) expect(recoveryCodes).not.toContain(stored);
  });

  it('rejects a wrong confirmation code and leaves MFA off', async () => {
    prismaMock.waMfaConfig.upsert.mockResolvedValue(
      config({ enabled: false, secret: null, pendingSecret: SECRET, pendingAt: new Date() })
    );
    await expect(mfa.confirmEnrolment('000000')).rejects.toMatchObject({
      code: 'WA_MFA_INVALID_CODE',
    });
    expect(prismaMock.waMfaConfig.update).not.toHaveBeenCalled();
  });

  it('expires a stale enrolment instead of honouring it forever', async () => {
    prismaMock.waMfaConfig.upsert.mockResolvedValue(
      config({
        enabled: false,
        secret: null,
        pendingSecret: SECRET,
        pendingAt: new Date(Date.now() - 30 * 60 * 1000),
      })
    );
    await expect(mfa.confirmEnrolment(liveCode())).rejects.toMatchObject({
      code: 'WA_MFA_ENROLMENT_EXPIRED',
    });
  });
});

describe('trusted devices', () => {
  it('stores only a hash, never the token itself', async () => {
    const { token } = await mfa.trustDevice({ userAgent: 'Mozilla/5.0 (Windows) Chrome/120' });
    const stored = prismaMock.waTrustedDevice.create.mock.calls[0][0].data;
    expect(stored.tokenHash).not.toBe(token);
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.label).toBe('Chrome on Windows');
    expect(stored.epoch).toBe(1);
  });

  it('ROTATES the token on use, so a captured one dies', async () => {
    // hire_adda's device token is good for 30 days to anyone who copies it.
    prismaMock.waTrustedDevice.findUnique.mockResolvedValue({
      id: 'd1',
      tokenHash: 'hash',
      epoch: 1,
      expiresAt: new Date(Date.now() + 86400_000),
      label: 'Chrome on Windows',
      ip: null,
    });

    const res = await mfa.consumeTrustedDevice('some-token');

    expect(res).not.toBeNull();
    expect(res!.token).toMatch(/^[0-9a-f]{64}$/);
    expect(res!.token).not.toBe('some-token');
    expect(prismaMock.waTrustedDevice.updateMany).toHaveBeenCalled();
  });

  it('rejects a device trusted under an older MFA epoch', async () => {
    prismaMock.waTrustedDevice.findUnique.mockResolvedValue({
      id: 'd1',
      tokenHash: 'hash',
      epoch: 0, // config is on epoch 1
      expiresAt: new Date(Date.now() + 86400_000),
    });
    await expect(mfa.consumeTrustedDevice('t')).resolves.toBeNull();
    expect(prismaMock.waTrustedDevice.delete).toHaveBeenCalled();
  });

  it('rejects an expired device and deletes the row', async () => {
    prismaMock.waTrustedDevice.findUnique.mockResolvedValue({
      id: 'd1',
      tokenHash: 'hash',
      epoch: 1,
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(mfa.consumeTrustedDevice('t')).resolves.toBeNull();
  });

  it('returns null for an unknown or absent token', async () => {
    prismaMock.waTrustedDevice.findUnique.mockResolvedValue(null);
    await expect(mfa.consumeTrustedDevice('nope')).resolves.toBeNull();
    await expect(mfa.consumeTrustedDevice(undefined)).resolves.toBeNull();
  });
});

describe('revocation', () => {
  it('rotating the epoch clears the seed, the codes and every device', async () => {
    prismaMock.waMfaConfig.update.mockResolvedValue({ epoch: 2 });

    const { epoch } = await mfa.rotateEpoch();

    expect(epoch).toBe(2);
    const data = prismaMock.waMfaConfig.update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      epoch: 2,
      enabled: false,
      secret: null,
      recoveryCodes: [],
    });
    expect(prismaMock.waTrustedDevice.deleteMany).toHaveBeenCalled();
  });

  it('disabling MFA drops the trusted devices with it', async () => {
    await mfa.disableMfa();
    expect(prismaMock.waMfaConfig.update.mock.calls[0][0].data).toMatchObject({
      enabled: false,
      secret: null,
      recoveryCodes: [],
    });
    expect(prismaMock.waTrustedDevice.deleteMany).toHaveBeenCalled();
  });

  it('prunes expired devices — the sweeper hire_adda never wrote', async () => {
    prismaMock.waTrustedDevice.deleteMany.mockResolvedValue({ count: 7 });
    await expect(mfa.pruneExpiredTrustedDevices()).resolves.toBe(7);
    expect(prismaMock.waTrustedDevice.deleteMany.mock.calls[0][0].where.expiresAt).toHaveProperty(
      'lt'
    );
  });
});
