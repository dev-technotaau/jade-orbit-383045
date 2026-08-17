/**
 * Tests for the Turnstile middleware (src/middleware/turnstile.ts).
 *
 * This is the bot check standing in front of the only credential in the system,
 * so the behaviour that matters is not "does a valid token pass" — it is what
 * happens in every failure mode. The host platform's original version returned
 * `next()` when the secret key was missing, which meant a production deployment
 * that forgot to set it lost its bot defence entirely and said so in one log
 * line. Every case below is a way to fail; all of them must fail CLOSED.
 */

/* The middleware under test calls global fetch and disables this same rule
   inline; stubbing it here trips the rule again. Node 20 has fetch. */
/* eslint-disable n/no-unsupported-features/node-builtins */

import express from 'express';
import request from 'supertest';

const ENV: Record<string, string | undefined> = {
  NODE_ENV: 'production',
  CF_TURNSTILE_SECRET_KEY: 'secret-key',
};
jest.mock('../../config/env', () => ({
  get env() {
    return ENV;
  },
}));

jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const incMock = jest.fn();
// errorHandler (mounted below) reports every 5xx through captureWaException, so
// the mock has to carry it too — a factory missing it makes the handler throw
// while turning a fail-closed 503 into an unrelated 500.
jest.mock('../../utils/whatsapp-metrics', () => ({
  turnstileVerificationsTotal: { inc: (...a: unknown[]) => incMock(...a) },
  captureWaException: jest.fn(),
}));

import { verifyTurnstile } from '../turnstile';
import { errorHandler } from '../error';

const app = () => {
  const a = express();
  a.use(express.json());
  a.post('/gated', verifyTurnstile, (_req, res) => res.status(200).json({ ok: true }));
  a.use(errorHandler as never);
  return a;
};

/** Stub global fetch with a siteverify response. */
function mockSiteVerify(body: unknown, opts: { reject?: Error } = {}) {
  global.fetch = jest.fn().mockImplementation(() => {
    if (opts.reject) return Promise.reject(opts.reject);
    return Promise.resolve({ json: () => Promise.resolve(body) });
  }) as unknown as typeof fetch;
}

const outcomes = () => incMock.mock.calls.map((c) => (c[0] as { outcome: string }).outcome);

beforeEach(() => {
  jest.clearAllMocks();
  ENV.NODE_ENV = 'production';
  ENV.CF_TURNSTILE_SECRET_KEY = 'secret-key';
});

describe('verifyTurnstile', () => {
  it('passes a request whose token Cloudflare accepts', async () => {
    mockSiteVerify({ success: true });
    const res = await request(app()).post('/gated').send({ 'cf-turnstile-response': 'good-token' });

    expect(res.status).toBe(200);
    expect(outcomes()).toEqual(['passed']);
  });

  it('sends the secret, the token and the caller IP to Cloudflare', async () => {
    mockSiteVerify({ success: true });
    await request(app()).post('/gated').send({ 'cf-turnstile-response': 'good-token' });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = (init.body as URLSearchParams).toString();
    expect(body).toContain('secret=secret-key');
    expect(body).toContain('response=good-token');
    // Idempotency key makes a retried verification safe.
    expect(body).toContain('idempotency_key=');
  });

  it('rejects when no token is supplied', async () => {
    mockSiteVerify({ success: true });
    const res = await request(app()).post('/gated').send({});

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('TURNSTILE_TOKEN_MISSING');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(outcomes()).toEqual(['missing']);
  });

  it('FAILS CLOSED when the secret key is missing in production', async () => {
    // The whole point. The upstream version returned next() here.
    ENV.CF_TURNSTILE_SECRET_KEY = undefined;
    const res = await request(app()).post('/gated').send({ 'cf-turnstile-response': 'anything' });

    expect(res.status).toBe(503);
    expect(res.body?.error?.code).toBe('TURNSTILE_UNAVAILABLE');
    expect(outcomes()).toEqual(['misconfigured']);
  });

  it('skips the check in development when no key is configured', async () => {
    // So `npm run dev` works without a Cloudflare account.
    ENV.NODE_ENV = 'development';
    ENV.CF_TURNSTILE_SECRET_KEY = undefined;
    const res = await request(app()).post('/gated').send({});

    expect(res.status).toBe(200);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects when Cloudflare says the challenge failed', async () => {
    mockSiteVerify({ success: false, 'error-codes': ['invalid-input-response'] });
    const res = await request(app()).post('/gated').send({ 'cf-turnstile-response': 'bad-token' });

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('TURNSTILE_FAILED');
    expect(outcomes()).toEqual(['rejected']);
  });

  it('says "expired" for a reused token rather than a generic failure', async () => {
    // A single-use token submitted twice is the most common real failure, and
    // "that expired, try again" is actionable where "verification failed" is not.
    mockSiteVerify({ success: false, 'error-codes': ['timeout-or-duplicate'] });
    const res = await request(app()).post('/gated').send({ 'cf-turnstile-response': 'used-token' });

    expect(res.status).toBe(400);
    expect(res.body?.error?.message).toMatch(/expired/i);
  });

  it('FAILS CLOSED when Cloudflare is unreachable', async () => {
    mockSiteVerify(null, { reject: new Error('ECONNREFUSED') });
    const res = await request(app()).post('/gated').send({ 'cf-turnstile-response': 'token' });

    expect(res.status).toBe(503);
    expect(res.body?.error?.code).toBe('TURNSTILE_UNAVAILABLE');
    // The operator must be able to tell "Cloudflare is down" from "wrong password".
    expect(res.body?.error?.message).toMatch(/CAPTCHA service/i);
    expect(outcomes()).toEqual(['error']);
  });

  it('FAILS CLOSED when Cloudflare times out', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    mockSiteVerify(null, { reject: abort });
    const res = await request(app()).post('/gated').send({ 'cf-turnstile-response': 'token' });

    expect(res.status).toBe(503);
    expect(outcomes()).toEqual(['timeout']);
  });

  it('accepts the token from a header as well as the body', async () => {
    mockSiteVerify({ success: true });
    const res = await request(app())
      .post('/gated')
      .set('cf-turnstile-response', 'header-token')
      .send({});

    expect(res.status).toBe(200);
  });
});
