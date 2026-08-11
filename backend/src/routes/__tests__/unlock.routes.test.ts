/**
 * Tests for the two-step unlock flow (src/routes/unlock.routes.ts).
 *
 * This is the whole authentication surface of the product, so the assertions
 * that matter are the negative ones: that a correct password alone does NOT
 * produce a session when MFA is on, that the challenge ticket cannot be
 * substituted for a session token, and that neither step ever hands back a
 * session it should not have.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';

const ENV: Record<string, string | undefined> = {
  APP_PASSWORD: 'correct-horse-battery-staple',
  SESSION_EPOCH: '1',
  SESSION_MAX_AGE_SECONDS: '43200',
  ALLOW_PASSWORD_HEADER_WITH_MFA: 'false',
  OPERATOR_LABEL: 'operator',
  NODE_ENV: 'test',
};
jest.mock('../../config/env', () => ({
  get env() {
    return ENV;
  },
}));

// Turnstile is exercised by its own suite; here it is a pass-through so the
// unlock branching is what is under test.
jest.mock('../../middleware/turnstile', () => ({
  verifyTurnstile: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../middleware/rate-limit', () => {
  const passthrough = (_req: any, _res: any, next: any) => next();
  return new Proxy({}, { get: () => passthrough });
});

jest.mock('../../middleware/audit', () => ({
  audit: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mfaMock = {
  isMfaEnabled: jest.fn(),
  verifyCode: jest.fn(),
  consumeTrustedDevice: jest.fn(),
  trustDevice: jest.fn(),
  getMfaStatus: jest.fn(),
  beginEnrolment: jest.fn(),
  confirmEnrolment: jest.fn(),
  disableMfa: jest.fn(),
  regenerateRecoveryCodes: jest.fn(),
  rotateEpoch: jest.fn(),
  listTrustedDevices: jest.fn(),
  revokeTrustedDevice: jest.fn(),
  revokeAllTrustedDevices: jest.fn(),
};
jest.mock('../../services/whatsapp-mfa.service', () => mfaMock);

const attemptMock = {
  applyProgressiveDelay: jest.fn().mockResolvedValue(0),
  recordUnlockFailure: jest.fn().mockResolvedValue(undefined),
  recordUnlockSuccess: jest.fn().mockResolvedValue(undefined),
};
jest.mock('../../services/unlock-attempt.service', () => attemptMock);

import unlockRoutes from '../unlock.routes';
import { verifyUnlockToken, verifyMfaPendingToken } from '../../middleware/app-password';
import { errorHandler } from '../../middleware/error';

const app = () => {
  const a = express();
  a.use(express.json());
  a.use(cookieParser());
  a.use('/unlock', unlockRoutes);
  a.use(errorHandler as never);
  return a;
};

const PASSWORD = 'correct-horse-battery-staple';

beforeEach(() => {
  jest.clearAllMocks();
  ENV.APP_PASSWORD = PASSWORD;
  mfaMock.isMfaEnabled.mockResolvedValue(false);
  mfaMock.consumeTrustedDevice.mockResolvedValue(null);
  attemptMock.applyProgressiveDelay.mockResolvedValue(0);
});

describe('POST /unlock — MFA off', () => {
  it('returns a session token for the right password', async () => {
    const res = await request(app()).post('/unlock').send({ password: PASSWORD });

    expect(res.status).toBe(200);
    expect(verifyUnlockToken(res.body.data.token)).toBe(true);
    expect(attemptMock.recordUnlockSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ mfa: 'not_required' })
    );
  });

  it('rejects a wrong password and records the failure', async () => {
    const res = await request(app()).post('/unlock').send({ password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('INVALID_PASSWORD');
    expect(attemptMock.recordUnlockFailure).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'bad_password' })
    );
  });

  it('applies the progressive delay BEFORE comparing, so it is not a timing oracle', async () => {
    await request(app()).post('/unlock').send({ password: 'wrong' });
    expect(attemptMock.applyProgressiveDelay).toHaveBeenCalled();

    const delayOrder = attemptMock.applyProgressiveDelay.mock.invocationCallOrder[0];
    const failOrder = attemptMock.recordUnlockFailure.mock.invocationCallOrder[0];
    expect(delayOrder).toBeLessThan(failOrder);
  });

  it('requires a password', async () => {
    const res = await request(app()).post('/unlock').send({});
    expect(res.status).toBe(400);
    expect(res.body?.error?.code ?? res.body?.error).toBeTruthy();
  });

  it('fails closed when APP_PASSWORD is unset', async () => {
    ENV.APP_PASSWORD = undefined;
    const res = await request(app()).post('/unlock').send({ password: 'anything' });
    expect(res.status).toBe(500);
    expect(res.body?.error?.code).toBe('APP_PASSWORD_UNSET');
  });
});

describe('POST /unlock — MFA on', () => {
  beforeEach(() => mfaMock.isMfaEnabled.mockResolvedValue(true));

  it('does NOT issue a session for a correct password alone', async () => {
    // The assertion the entire feature rests on.
    const res = await request(app()).post('/unlock').send({ password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.mfaRequired).toBe(true);
    expect(res.body.data.token).toBeUndefined();
    expect(verifyUnlockToken(res.body.data.pendingToken)).toBe(false);
    expect(verifyMfaPendingToken(res.body.data.pendingToken)).toBe(true);
  });

  it('skips the prompt for a trusted browser and rotates its token', async () => {
    mfaMock.consumeTrustedDevice.mockResolvedValue({
      token: 'rotated-token',
      expiresAt: new Date(Date.now() + 86400_000),
    });

    const res = await request(app())
      .post('/unlock')
      .set('Cookie', 'wa_device=old-token')
      .send({ password: PASSWORD });

    expect(res.status).toBe(200);
    expect(verifyUnlockToken(res.body.data.token)).toBe(true);
    expect(res.body.data.trustedDevice.token).toBe('rotated-token');
    expect(attemptMock.recordUnlockSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ mfa: 'trusted_device' })
    );
  });

  it('still refuses a wrong password even with a trusted browser', async () => {
    mfaMock.consumeTrustedDevice.mockResolvedValue({
      token: 'rotated',
      expiresAt: new Date(Date.now() + 86400_000),
    });
    const res = await request(app())
      .post('/unlock')
      .set('Cookie', 'wa_device=old-token')
      .send({ password: 'wrong' });

    expect(res.status).toBe(401);
    expect(mfaMock.consumeTrustedDevice).not.toHaveBeenCalled();
  });
});

describe('POST /unlock/mfa/verify', () => {
  /** A challenge ticket, obtained the way a real client does. */
  async function pendingToken(): Promise<string> {
    mfaMock.isMfaEnabled.mockResolvedValue(true);
    const res = await request(app()).post('/unlock').send({ password: PASSWORD });
    return res.body.data.pendingToken as string;
  }

  it('exchanges a valid code for a session', async () => {
    const token = await pendingToken();
    mfaMock.verifyCode.mockResolvedValue('totp');

    const res = await request(app())
      .post('/unlock/mfa/verify')
      .send({ pendingToken: token, code: '123456' });

    expect(res.status).toBe(200);
    expect(verifyUnlockToken(res.body.data.token)).toBe(true);
    expect(res.body.data.factor).toBe('totp');
  });

  it('REFUSES a request with no challenge ticket', async () => {
    mfaMock.verifyCode.mockResolvedValue('totp');
    const res = await request(app()).post('/unlock/mfa/verify').send({ code: '123456' });

    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('WA_MFA_CHALLENGE_EXPIRED');
    // The code must never even be checked without a valid ticket.
    expect(mfaMock.verifyCode).not.toHaveBeenCalled();
  });

  it('REFUSES a session token used in place of a challenge ticket', async () => {
    // Scopes are what stop one credential standing in for another.
    mfaMock.isMfaEnabled.mockResolvedValue(false);
    const unlocked = await request(app()).post('/unlock').send({ password: PASSWORD });
    const sessionToken = unlocked.body.data.token as string;

    mfaMock.verifyCode.mockResolvedValue('totp');
    const res = await request(app())
      .post('/unlock/mfa/verify')
      .send({ pendingToken: sessionToken, code: '123456' });

    expect(res.status).toBe(401);
    expect(mfaMock.verifyCode).not.toHaveBeenCalled();
  });

  it('rejects a wrong code without issuing anything', async () => {
    const token = await pendingToken();
    mfaMock.verifyCode.mockResolvedValue(null);

    const res = await request(app())
      .post('/unlock/mfa/verify')
      .send({ pendingToken: token, code: '000000' });

    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('WA_MFA_INVALID_CODE');
    expect(attemptMock.recordUnlockFailure).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'bad_mfa_code' })
    );
  });

  it('classifies a bad recovery code separately from a bad TOTP code', async () => {
    const token = await pendingToken();
    mfaMock.verifyCode.mockResolvedValue(null);

    await request(app())
      .post('/unlock/mfa/verify')
      .send({ pendingToken: token, code: 'ABCD-EFGH' });

    expect(attemptMock.recordUnlockFailure).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'bad_recovery_code' })
    );
  });

  it('mints a trusted device only when asked', async () => {
    const token = await pendingToken();
    mfaMock.verifyCode.mockResolvedValue('totp');
    mfaMock.trustDevice.mockResolvedValue({
      token: 'device-token',
      expiresAt: new Date(Date.now() + 86400_000),
    });

    const without = await request(app())
      .post('/unlock/mfa/verify')
      .send({ pendingToken: token, code: '123456' });
    expect(without.body.data.trustedDevice).toBeUndefined();
    expect(mfaMock.trustDevice).not.toHaveBeenCalled();

    const token2 = await pendingToken();
    const withTrust = await request(app())
      .post('/unlock/mfa/verify')
      .send({ pendingToken: token2, code: '123456', trustDevice: true });
    expect(withTrust.body.data.trustedDevice.token).toBe('device-token');
  });

  it('requires a code', async () => {
    const token = await pendingToken();
    const res = await request(app()).post('/unlock/mfa/verify').send({ pendingToken: token });
    expect(res.status).toBe(400);
  });
});
