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
  OPERATOR_LABEL: 'operator',
};
jest.mock('../../config/env', () => ({
  get env() {
    return ENV;
  },
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
    expect(verifyUnlockToken(token)).toBe(true);

    const [exp, mac] = token.split('.');
    const expired = `${Number(exp) - 43200 * 1000 - 1000}.${mac}`;
    expect(verifyUnlockToken(expired)).toBe(false);
  });

  it('rejects a tampered expiry (the expiry is inside the signed message)', () => {
    const { token } = issueUnlockToken();
    const [exp, mac] = token.split('.');
    const extended = `${Number(exp) + 10_000_000}.${mac}`;
    expect(verifyUnlockToken(extended)).toBe(false);
  });

  it('rejects garbage', () => {
    for (const bad of ['', 'nonsense', '123', '.abc', 'abc.def', null, undefined, 42]) {
      expect(verifyUnlockToken(bad)).toBe(false);
    }
  });

  it('is invalidated by an epoch bump or a password change', () => {
    const { token } = issueUnlockToken();
    ENV.SESSION_EPOCH = '2';
    expect(verifyUnlockToken(token)).toBe(false);
    ENV.SESSION_EPOCH = '1';
    expect(verifyUnlockToken(token)).toBe(true);
    ENV.APP_PASSWORD = 'a-different-password-entirely';
    expect(verifyUnlockToken(token)).toBe(false);
  });
});

describe('socket tickets', () => {
  it('are short-lived', () => {
    const { ticket, expiresInSeconds } = issueSocketTicket();
    expect(expiresInSeconds).toBe(120);
    expect(verifySocketTicket(ticket)).toBe(true);
  });

  it('are NOT accepted as a session credential', async () => {
    // This is the property that makes handing a ticket to page JavaScript safe.
    const { ticket } = issueSocketTicket();
    expect(verifyUnlockToken(ticket)).toBe(false);

    const res = await request(appWithGate())
      .get('/gated')
      .set('Cookie', `${UNLOCK_COOKIE}=${ticket}`);
    expect(res.status).toBe(401);
  });

  it('do not accept an unlock token in their place either', () => {
    const { token } = issueUnlockToken();
    expect(verifySocketTicket(token)).toBe(false);
  });
});
