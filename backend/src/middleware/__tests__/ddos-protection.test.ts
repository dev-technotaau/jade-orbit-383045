/**
 * Tests for the app-level DDoS protection (src/middleware/ddos-protection.ts).
 *
 * This is the per-IP floor under every other limiter, and the two ways it goes
 * wrong are both silent. It can be a complete no-op — which is what happened
 * when `REDIS_ENABLED=false` handed it a mock client whose `incr()` resolved 0,
 * so no counter ever grew while the boot banner still reported the protection
 * ready. Or it can be too broad, and 429 the Meta webhook during a campaign,
 * which makes Meta back off and eventually disable the subscription.
 *
 * A third way it goes wrong is quieter still: keyed on `req.ip`, every operator
 * arrived as the BFF's egress address and shared one bucket, so a single busy
 * browser could 429 the whole team. So the cases below are the exemptions, the
 * thresholds, who gets metered as whom, and every failure mode of the store.
 */

import type { Request, RequestHandler, Response } from 'express';
import express from 'express';
import request from 'supertest';

const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('../../config/logger', () => ({ __esModule: true, default: loggerMock }));

const redisMock = {
  status: 'ready',
  get: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  set: jest.fn(),
};
jest.mock('../../config/redis', () => ({ redis: redisMock }));

/** Only BFF_SECRET is read here; the real config/env validates all 170 vars. */
const envMock: { BFF_SECRET?: string } = {};
jest.mock('../../config/env', () => ({ env: envMock }));

const CLIENT_IP = '203.0.113.9';
const BFF_SECRET = 'bff-secret-long-enough-for-the-schema';
/** What the BFF derives from a browser's unlock cookie. */
const OPERATOR = 'e3b0c44298fc1c149afbf4c8996fb924';

/**
 * `warnedDisabled` is module state ("one warning per process"), so each case
 * gets its own module instance.
 */
async function loadMiddleware(): Promise<RequestHandler> {
  jest.resetModules();
  const mod = await import('../ddos-protection');
  return mod.ddosProtection() as RequestHandler;
}

function app(mw: RequestHandler) {
  const a = express();
  // Makes req.ip the forwarded address, so the Redis keys are predictable.
  a.set('trust proxy', true);
  a.use(mw);
  a.use((_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });
  return a;
}

const send = (
  mw: RequestHandler,
  method: 'get' | 'post',
  path: string,
  headers: Record<string, string> = {}
) => {
  let pending = request(app(mw))[method](path).set('X-Forwarded-For', CLIENT_IP);
  for (const [name, value] of Object.entries(headers)) pending = pending.set(name, value);
  return pending;
};

beforeEach(() => {
  jest.clearAllMocks();
  redisMock.status = 'ready';
  envMock.BFF_SECRET = BFF_SECRET;
  redisMock.get.mockResolvedValue(null);
  redisMock.incr.mockResolvedValue(1);
  redisMock.expire.mockResolvedValue(1);
  redisMock.set.mockResolvedValue('OK');
});

describe('when Redis is disabled', () => {
  it('lets requests through and says so exactly once', async () => {
    redisMock.status = 'disabled';
    const mw = await loadMiddleware();

    for (let i = 0; i < 3; i++) {
      const res = await send(mw, 'get', '/api/v1/contacts');
      expect(res.status).toBe(200);
    }

    // The counter is never consulted, which is the honest behaviour — the
    // dishonest one was pretending to count against a mock that always said 0.
    expect(redisMock.incr).not.toHaveBeenCalled();
    const disabledWarnings = loggerMock.warn.mock.calls.filter((c) =>
      String(c[0]).includes('DDoS protection is INACTIVE')
    );
    expect(disabledWarnings).toHaveLength(1);
  });
});

describe('exemptions', () => {
  it('does not meter health probes', async () => {
    const mw = await loadMiddleware();

    const res = await send(mw, 'get', '/health/ready');

    expect(res.status).toBe(200);
    expect(redisMock.get).not.toHaveBeenCalled();
    expect(redisMock.incr).not.toHaveBeenCalled();
  });

  it('does not meter the Meta webhook POST', async () => {
    const mw = await loadMiddleware();

    const res = await send(mw, 'post', '/api/v1/webhooks/whatsapp');

    // Meta bursts status callbacks during a campaign; a 429 makes it retry,
    // back off and eventually disable the subscription. The HMAC is what
    // protects this path.
    expect(res.status).toBe(200);
    expect(redisMock.incr).not.toHaveBeenCalled();
  });

  it('DOES meter the webhook GET handshake', async () => {
    const mw = await loadMiddleware();

    const res = await send(mw, 'get', '/api/v1/webhooks/whatsapp');

    // The verification handshake has no HMAC and no burst behaviour, so
    // exempting it by path alone just published a free unmetered endpoint.
    expect(res.status).toBe(200);
    expect(redisMock.incr).toHaveBeenCalledWith(`ddos:rate:${CLIENT_IP}`);
  });
});

describe('counting and blocking', () => {
  it('opens a one-second window on the first request from an IP', async () => {
    const mw = await loadMiddleware();

    await send(mw, 'get', '/api/v1/contacts');

    expect(redisMock.expire).toHaveBeenCalledWith(`ddos:rate:${CLIENT_IP}`, 1);
  });

  it('does not reset the window on subsequent requests inside it', async () => {
    const mw = await loadMiddleware();
    redisMock.incr.mockResolvedValue(7);

    await send(mw, 'get', '/api/v1/contacts');

    // Re-arming the TTL on every request turns a 1s window into a rolling one
    // that never expires, so a steady 60 req/s client is eventually blocked.
    expect(redisMock.expire).not.toHaveBeenCalled();
  });

  it('warns above the soft threshold but still serves the request', async () => {
    const mw = await loadMiddleware();
    redisMock.incr.mockResolvedValue(51);

    const res = await send(mw, 'get', '/api/v1/contacts');

    expect(res.status).toBe(200);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      `DDoS protection: High rate from ${CLIENT_IP} — 51 req/s`
    );
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('blocks the IP for a minute once the hard threshold is passed', async () => {
    const mw = await loadMiddleware();
    redisMock.incr.mockResolvedValue(101);

    const res = await send(mw, 'get', '/api/v1/contacts');

    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBe('60');
    expect(res.body).toEqual({
      success: false,
      error: { message: 'Too many requests. Please try again later.', code: 'RATE_LIMIT_EXCEEDED' },
    });
    expect(redisMock.set).toHaveBeenCalledWith(`ddos:block:${CLIENT_IP}`, '1', 'EX', 60);
  });

  it('rejects an already-blocked IP without counting it again', async () => {
    const mw = await loadMiddleware();
    redisMock.get.mockResolvedValue('1');

    const res = await send(mw, 'get', '/api/v1/contacts');

    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBe('60');
    expect(redisMock.incr).not.toHaveBeenCalled();
  });
});

describe('who gets metered', () => {
  const bff = { 'x-bff-secret': BFF_SECRET, 'x-operator-key': OPERATOR };

  it('gives each operator their own bucket when the BFF vouches for them', async () => {
    const mw = await loadMiddleware();

    await send(mw, 'get', '/api/v1/contacts', bff);

    // Keyed on the address, the whole team shares one counter behind the BFF's
    // egress IP and one person's open tabs 429s everybody else.
    expect(redisMock.incr).toHaveBeenCalledWith(`ddos:rate:op:${OPERATOR}`);
    expect(redisMock.get).toHaveBeenCalledWith(`ddos:block:op:${OPERATOR}`);
  });

  it('blocks only that operator, not the address they came from', async () => {
    const mw = await loadMiddleware();
    redisMock.incr.mockResolvedValue(101);

    const res = await send(mw, 'get', '/api/v1/contacts', bff);

    expect(res.status).toBe(429);
    expect(redisMock.set).toHaveBeenCalledWith(`ddos:block:op:${OPERATOR}`, '1', 'EX', 60);
  });

  it('ignores an operator key sent without the BFF secret', async () => {
    const mw = await loadMiddleware();

    await send(mw, 'get', '/api/v1/contacts', { 'x-operator-key': OPERATOR });

    // The header is client-supplied. Trusted on its own, anyone could send a
    // fresh key per request and never be counted at all.
    expect(redisMock.incr).toHaveBeenCalledWith(`ddos:rate:${CLIENT_IP}`);
  });

  it('ignores an operator key sent with the wrong BFF secret', async () => {
    const mw = await loadMiddleware();

    await send(mw, 'get', '/api/v1/contacts', {
      'x-bff-secret': 'not-the-secret',
      'x-operator-key': OPERATOR,
    });

    expect(redisMock.incr).toHaveBeenCalledWith(`ddos:rate:${CLIENT_IP}`);
  });

  it('ignores the header entirely when no BFF secret is configured', async () => {
    envMock.BFF_SECRET = undefined;
    const mw = await loadMiddleware();

    await send(mw, 'get', '/api/v1/contacts', bff);

    // Otherwise an unconfigured deployment would accept any key at face value,
    // because an absent secret would compare equal to an absent header.
    expect(redisMock.incr).toHaveBeenCalledWith(`ddos:rate:${CLIENT_IP}`);
  });
});

describe('when Redis errors mid-request', () => {
  it('serves the request rather than failing it closed', async () => {
    const mw = await loadMiddleware();
    redisMock.incr.mockRejectedValue(new Error('READONLY'));

    const res = await send(mw, 'get', '/api/v1/contacts');

    // A Redis blip must not take the whole console down; the credential check
    // downstream is pure crypto and fails closed on its own.
    expect(res.status).toBe(200);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      'DDoS protection: Redis error, skipping rate check:',
      'READONLY'
    );
  });
});
