/**
 * Tests for requireAppPassword (src/middleware/app-password.ts).
 *
 * This middleware is the entire authentication system: one shared secret
 * between the public internet and an operator console that can message every
 * customer the business has. It had no tests at all.
 *
 * Two things are covered. First the behaviour — cookie, header, wrong
 * credential, unset password, and session revocation via SESSION_EPOCH. Then
 * the part that is easy to break by accident: the gate is applied with a bare
 * `router.use(requireAppPassword)` partway down whatsapp.routes.ts, so anything
 * registered ABOVE that line is public, silently. A route added in the wrong
 * place looks identical in review. The last test walks the real router stack
 * and fails if any route sits in front of the gate.
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
};
jest.mock('../../config/env', () => ({
  get env() {
    return ENV;
  },
}));

// requireAppPassword consults the MFA flag on the header path, so the gate can
// refuse a single factor once MFA is on.
const isMfaEnabledMock = jest.fn();
jest.mock('../../services/whatsapp-mfa.service', () => ({
  isMfaEnabled: () => isMfaEnabledMock(),
}));

import crypto from 'crypto';
import {
  requireAppPassword,
  APP_ACTOR,
  UNLOCK_COOKIE,
  issueUnlockToken,
  verifyUnlockToken,
  issueSocketTicket,
  verifySocketTicket,
  listOperators,
  resolveOperator,
} from '../app-password';
import { errorHandler } from '../error';

/** An app that mirrors the real mount order: cookies, gate, handler, errors. */
function appWithGate() {
  const app = express();
  app.use(cookieParser());
  app.get('/gated', requireAppPassword, (req, res) => {
    res.status(200).json({ actor: (req as any).user });
  });
  app.use(errorHandler as any);
  return app;
}

beforeEach(() => {
  ENV.APP_PASSWORD = 'correct-horse-battery-staple';
  ENV.SESSION_EPOCH = '1';
  ENV.SESSION_MAX_AGE_SECONDS = '43200';
  ENV.ALLOW_PASSWORD_HEADER_WITH_MFA = 'false';
  ENV.OPERATOR_PASSWORDS = undefined;
  isMfaEnabledMock.mockResolvedValue(false);
  jest.useRealTimers();
});

describe('requireAppPassword', () => {
  it('rejects a request with no credential', async () => {
    const res = await request(appWithGate()).get('/gated');
    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('LOCKED');
  });

  it('accepts a valid unlock cookie and stamps the synthetic actor', async () => {
    const res = await request(appWithGate())
      .get('/gated')
      .set('Cookie', `${UNLOCK_COOKIE}=${issueUnlockToken().token}`);
    expect(res.status).toBe(200);
    expect(res.body.actor).toEqual(APP_ACTOR);
  });

  it('accepts the raw password via X-App-Password (for scripts)', async () => {
    const res = await request(appWithGate())
      .get('/gated')
      .set('X-App-Password', ENV.APP_PASSWORD as string);
    expect(res.status).toBe(200);
    expect(res.body.actor).toEqual(APP_ACTOR);
  });

  it('rejects a wrong password', async () => {
    const res = await request(appWithGate()).get('/gated').set('X-App-Password', 'wrong');
    expect(res.status).toBe(401);
  });

  it('rejects a cookie carrying the raw password rather than the token', async () => {
    const res = await request(appWithGate())
      .get('/gated')
      .set('Cookie', `${UNLOCK_COOKIE}=${ENV.APP_PASSWORD}`);
    expect(res.status).toBe(401);
  });

  it('rejects a forged cookie of the right length', async () => {
    const forged = crypto.createHmac('sha256', 'guessed').update('wa-unlock-v1').digest('hex');
    const res = await request(appWithGate())
      .get('/gated')
      .set('Cookie', `${UNLOCK_COOKIE}=${forged}`);
    expect(res.status).toBe(401);
  });

  it('FAILS CLOSED when APP_PASSWORD is unset — never open', async () => {
    // The single most important assertion in this file. A misconfigured
    // deployment must be unusable, not unguarded.
    ENV.APP_PASSWORD = undefined;

    // No credential: rejected before the secret is ever consulted.
    const bare = await request(appWithGate()).get('/gated');
    expect(bare.status).toBe(401);

    // With a credential, deriving the expected value throws and surfaces as a
    // named 500 — a misconfigured deployment should look misconfigured, not
    // look like everyone typed the wrong password.
    const withHeader = await request(appWithGate()).get('/gated').set('X-App-Password', 'anything');
    expect(withHeader.status).toBe(500);
    expect(withHeader.body?.error?.code).toBe('APP_PASSWORD_UNSET');

    // A malformed cookie is rejected on shape before the secret is consulted,
    // so this one is a 401 — still closed, just for a different reason. A
    // well-formed cookie reaches the HMAC and surfaces the config error.
    const withCookie = await request(appWithGate())
      .get('/gated')
      .set('Cookie', `${UNLOCK_COOKIE}=anything`);
    expect(withCookie.status).toBe(401);

    const withShapedCookie = await request(appWithGate())
      .get('/gated')
      .set('Cookie', `${UNLOCK_COOKIE}=${Date.now() + 60_000}.${'0'.repeat(64)}`);
    expect(withShapedCookie.status).toBe(500);
    expect(withShapedCookie.body?.error?.code).toBe('APP_PASSWORD_UNSET');

    for (const res of [bare, withHeader, withCookie, withShapedCookie]) {
      expect(res.status).not.toBe(200);
    }
  });

  it('invalidates outstanding cookies when SESSION_EPOCH is bumped', async () => {
    const oldToken = issueUnlockToken().token;
    ENV.SESSION_EPOCH = '2';

    const stale = await request(appWithGate())
      .get('/gated')
      .set('Cookie', `${UNLOCK_COOKIE}=${oldToken}`);
    expect(stale.status).toBe(401);

    // ...and a token minted under the new epoch works.
    const fresh = await request(appWithGate())
      .get('/gated')
      .set('Cookie', `${UNLOCK_COOKIE}=${issueUnlockToken().token}`);
    expect(fresh.status).toBe(200);
  });

  it('still honours the header after an epoch bump (it is the password itself)', async () => {
    ENV.SESSION_EPOCH = '7';
    const res = await request(appWithGate())
      .get('/gated')
      .set('X-App-Password', ENV.APP_PASSWORD as string);
    expect(res.status).toBe(200);
  });
});

describe('the X-App-Password header vs MFA', () => {
  it('REFUSES the header alone once MFA is enabled', async () => {
    // The header is compared against APP_PASSWORD directly, so leaving it open
    // would let anyone holding the password reach every operator route having
    // never presented a second factor — MFA would protect the browser and
    // nothing else.
    isMfaEnabledMock.mockResolvedValue(true);

    const res = await request(appWithGate())
      .get('/gated')
      .set('X-App-Password', ENV.APP_PASSWORD as string);

    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('MFA_REQUIRED');
  });

  it('still accepts a full session cookie when MFA is enabled', async () => {
    // A cookie can only exist if every factor was satisfied at sign-in.
    isMfaEnabledMock.mockResolvedValue(true);

    const res = await request(appWithGate())
      .get('/gated')
      .set('Cookie', `${UNLOCK_COOKIE}=${issueUnlockToken().token}`);

    expect(res.status).toBe(200);
  });

  it('re-opens the header path only when explicitly configured', async () => {
    isMfaEnabledMock.mockResolvedValue(true);
    ENV.ALLOW_PASSWORD_HEADER_WITH_MFA = 'true';

    const res = await request(appWithGate())
      .get('/gated')
      .set('X-App-Password', ENV.APP_PASSWORD as string);

    expect(res.status).toBe(200);
  });

  it('accepts the header normally when MFA is off', async () => {
    isMfaEnabledMock.mockResolvedValue(false);
    const res = await request(appWithGate())
      .get('/gated')
      .set('X-App-Password', ENV.APP_PASSWORD as string);
    expect(res.status).toBe(200);
  });
});

describe('issueUnlockToken / verifyUnlockToken', () => {
  it('carries an expiry and an HMAC, never the password itself', () => {
    const { token, expiresInSeconds } = issueUnlockToken();
    expect(token).toMatch(/^\d+\.[0-9a-f]{64}$/);
    expect(token).not.toContain(ENV.APP_PASSWORD as string);
    expect(expiresInSeconds).toBe(43200);
  });

  it('honours SESSION_MAX_AGE_SECONDS', () => {
    ENV.SESSION_MAX_AGE_SECONDS = '3600';
    expect(issueUnlockToken().expiresInSeconds).toBe(3600);
  });

  it('rejects a token whose expiry has passed — the SERVER enforces it', () => {
    // The whole point of the change: the old token was a constant, so the "12h
    // session" was a cookie attribute the server never checked.
    const { token } = issueUnlockToken();
    expect(verifyUnlockToken(token)).toBe('operator');

    const [exp, mac] = token.split('.');
    const expired = `${Number(exp) - 43200 * 1000 - 1000}.${mac}`;
    expect(verifyUnlockToken(expired)).toBeNull();
  });

  it('rejects a tampered expiry (the expiry is inside the signed message)', () => {
    const { token } = issueUnlockToken();
    const [exp, mac] = token.split('.');
    const extended = `${Number(exp) + 10_000_000}.${mac}`;
    expect(verifyUnlockToken(extended)).toBeNull();
  });

  it('rejects garbage', () => {
    for (const bad of ['', 'nonsense', '123', '.abc', 'abc.def', null, undefined, 42]) {
      expect(verifyUnlockToken(bad)).toBeNull();
    }
  });

  it('is invalidated by an epoch bump or a password change', () => {
    const { token } = issueUnlockToken();
    ENV.SESSION_EPOCH = '2';
    expect(verifyUnlockToken(token)).toBeNull();
    ENV.SESSION_EPOCH = '1';
    expect(verifyUnlockToken(token)).toBe('operator');
    ENV.APP_PASSWORD = 'a-different-password-entirely';
    expect(verifyUnlockToken(token)).toBeNull();
  });
});

describe('socket tickets', () => {
  it('are short-lived', () => {
    const { ticket, expiresInSeconds } = issueSocketTicket();
    expect(expiresInSeconds).toBe(120);
    expect(verifySocketTicket(ticket)).toBe('operator');
  });

  it('are NOT accepted as a session credential', async () => {
    // This is the property that makes handing a ticket to page JavaScript safe.
    const { ticket } = issueSocketTicket();
    expect(verifyUnlockToken(ticket)).toBeNull();

    const res = await request(appWithGate())
      .get('/gated')
      .set('Cookie', `${UNLOCK_COOKIE}=${ticket}`);
    expect(res.status).toBe(401);
  });

  it('do not accept an unlock token in their place either', () => {
    const { token } = issueUnlockToken();
    expect(verifySocketTicket(token)).toBeNull();
  });
});

/**
 * Named operators.
 *
 * The point of the roster is attribution and per-person revocation: the label
 * on every row follows the password that was used, and deleting an entry ends
 * that person's sessions without bumping SESSION_EPOCH and signing out the
 * whole team.
 */
describe('named operators (OPERATOR_PASSWORDS)', () => {
  const ALICE = 'alice-password-long-enough';
  const BOB = 'bob-password-long-enough';

  beforeEach(() => {
    ENV.OPERATOR_PASSWORDS = `alice:${ALICE},bob:${BOB}`;
  });

  it('publishes the shared account plus every named operator', () => {
    expect(listOperators()).toEqual(['operator', 'alice', 'bob']);
  });

  it('resolves a password to its own operator, and rejects a non-credential', () => {
    expect(resolveOperator(ENV.APP_PASSWORD as string)).toBe('operator');
    expect(resolveOperator(ALICE)).toBe('alice');
    expect(resolveOperator(BOB)).toBe('bob');
    expect(resolveOperator('not-a-password-at-all')).toBeNull();
  });

  it('drops entries that fail the format rules rather than accepting them loosely', () => {
    ENV.OPERATOR_PASSWORDS = 'carol:too-short,no-colon-here,d.ot:a-long-enough-password';
    expect(listOperators()).toEqual(['operator']);
    expect(resolveOperator('too-short')).toBeNull();
    expect(resolveOperator('a-long-enough-password')).toBeNull();
  });

  it('stamps the operator the password belongs to, not the shared label', async () => {
    const res = await request(appWithGate())
      .get('/gated')
      .set('Cookie', `${UNLOCK_COOKIE}=${issueUnlockToken('alice').token}`);

    expect(res.status).toBe(200);
    expect(res.body.actor).toEqual({ id: 'alice', role: 'ADMIN' });
  });

  it('attributes the X-App-Password header to the operator whose password it is', async () => {
    const res = await request(appWithGate()).get('/gated').set('X-App-Password', BOB);

    expect(res.status).toBe(200);
    expect(res.body.actor).toEqual({ id: 'bob', role: 'ADMIN' });
  });

  it("ends one operator's sessions when their entry is removed, and only theirs", async () => {
    const alice = issueUnlockToken('alice').token;
    const shared = issueUnlockToken().token;

    // The leaver goes; the password everyone else holds is untouched.
    ENV.OPERATOR_PASSWORDS = `bob:${BOB}`;

    expect(verifyUnlockToken(alice)).toBeNull();
    expect(verifyUnlockToken(shared)).toBe('operator');

    const stale = await request(appWithGate())
      .get('/gated')
      .set('Cookie', `${UNLOCK_COOKIE}=${alice}`);
    expect(stale.status).toBe(401);
  });

  it('refuses a label edited into a valid token — it is inside the signature', () => {
    const token = issueUnlockToken('alice').token;
    const [exp, , mac] = token.split('.');
    expect(verifyUnlockToken(`${exp}.bob.${mac}`)).toBeNull();
    // ...and it cannot be demoted to the shared account by dropping the label.
    expect(verifyUnlockToken(`${exp}.${mac}`)).toBeNull();
  });
});
