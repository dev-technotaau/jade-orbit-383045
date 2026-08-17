/**
 * Tests for the rate limiters (src/middleware/rate-limit.ts).
 *
 * The interesting behaviour is not the counting — express-rate-limit does that
 * — it is which STORE each limiter is built with. `REDIS_ENABLED=false` is a
 * supported configuration, and handing rate-limit-redis the disabled-mode mock
 * client made its script loader throw `unexpected reply from redis client`.
 * With express-rate-limit's `passOnStoreError` defaulting to false, that throw
 * became a 500 on every rate-limited route — including `/api/v1/unlock`, so
 * running without Redis did not degrade the console, it locked everyone out of
 * it, and the error never mentioned Redis.
 *
 * The other thing worth asserting is what each limiter COUNTS AGAINST. Keyed on
 * `req.ip`, the whole team arrives as the BFF's egress address and shares one
 * 100-request budget, so a couple of busy inbox tabs 429 everybody else.
 *
 * So: express-rate-limit and rate-limit-redis are both stubbed, and the tests
 * assert on the options the module hands them.
 */

import type { Request } from 'express';

interface LimiterOptions {
  windowMs: number;
  max: number;
  store?: unknown;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
  passOnStoreError?: boolean;
  skipSuccessfulRequests?: boolean;
  keyGenerator?: (req: Request) => string;
  message?: unknown;
  handler?: (req: Request, res: FakeResponse) => void;
}

/** Just enough of a response for the webhook limiter's handler to answer on. */
interface FakeResponse {
  status: jest.Mock;
  json: jest.Mock;
}

const limiterOptions: LimiterOptions[] = [];
jest.mock('express-rate-limit', () => ({
  __esModule: true,
  default: (options: LimiterOptions) => {
    limiterOptions.push(options);
    return () => undefined;
  },
  // The real helper collapses an IPv6 address to its /56; here it only has to
  // be distinguishable from the raw value the module must NOT return.
  ipKeyGenerator: (ip: string) => `ip:${ip}`,
}));

interface StoreOptions {
  prefix: string;
  sendCommand: (...args: string[]) => unknown;
}
const storeOptions: StoreOptions[] = [];
class FakeRedisStore {
  constructor(options: StoreOptions) {
    storeOptions.push(options);
  }
}
jest.mock('rate-limit-redis', () => ({ RedisStore: FakeRedisStore }));

const BFF_SECRET = 'bff-secret-long-enough-for-the-schema';

jest.mock('../../config/env', () => ({
  env: {
    AUTH_RATE_LIMIT_WINDOW_MS: '300000',
    AUTH_RATE_LIMIT_MAX_ATTEMPTS: '10',
    RATE_LIMIT_WINDOW_MS: '900000',
    RATE_LIMIT_MAX_REQUESTS: '100',
    BFF_SECRET: 'bff-secret-long-enough-for-the-schema',
  },
}));

const redisMock = { status: 'ready', call: jest.fn() };
jest.mock('../../config/redis', () => ({ redis: redisMock }));

// Pulled in transitively: the API key generator lives with the DDoS floor,
// which logs.
const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('../../config/logger', () => ({ __esModule: true, default: loggerMock }));

/** Enough of a request for a key generator to read. */
const req = (headers: Record<string, string> = {}, ip = '203.0.113.9') =>
  ({ headers, ip, socket: { remoteAddress: ip } }) as unknown as Request;

/** Order the module builds its limiters in. */
const AUTH = 0;
const API = 1;
const MFA = 2;
const WEBHOOK = 3;

async function loadLimiters() {
  jest.resetModules();
  limiterOptions.length = 0;
  storeOptions.length = 0;
  await import('../rate-limit');
}

beforeEach(() => {
  jest.clearAllMocks();
  redisMock.status = 'ready';
});

describe('with a real Redis', () => {
  beforeEach(async () => {
    await loadLimiters();
  });

  it('gives every limiter a shared Redis store under its own prefix', () => {
    expect(storeOptions.map((s) => s.prefix)).toEqual(['rl:auth:', 'rl:api:', 'rl:mfa:', 'rl:wh:']);
    // Distinct prefixes are not cosmetic: express-rate-limit refuses a reused
    // store with ERR_ERL_STORE_REUSE and the process fails to boot.
    expect(new Set(storeOptions.map((s) => s.prefix)).size).toBe(storeOptions.length);
    expect(limiterOptions.every((o) => o.store !== undefined)).toBe(true);
  });

  it('routes store commands through the shared ioredis connection', () => {
    storeOptions[API].sendCommand('EVAL', 'script', '1', 'key');

    expect(redisMock.call).toHaveBeenCalledWith('EVAL', 'script', '1', 'key');
  });

  it('tolerates a live Redis rejecting a command rather than 500ing the caller', () => {
    // Defence in depth for the OTHER failure mode: OOM, failover mid-command,
    // WRONGTYPE. Un-counted beats unavailable on an internal console.
    expect(limiterOptions.every((o) => o.passOnStoreError === true)).toBe(true);
    expect(limiterOptions.every((o) => o.standardHeaders === true)).toBe(true);
    expect(limiterOptions.every((o) => o.legacyHeaders === false)).toBe(true);
  });

  it('counts only failed attempts on the auth limiter', () => {
    expect(limiterOptions[AUTH].windowMs).toBe(300_000);
    expect(limiterOptions[AUTH].max).toBe(10);
    // There is one password and no account to enumerate, so counting successes
    // buys nothing and lets a team behind one egress IP lock itself out.
    expect(limiterOptions[AUTH].skipSuccessfulRequests).toBe(true);
  });

  it('reads the general API window from the environment', () => {
    expect(limiterOptions[API].windowMs).toBe(900_000);
    expect(limiterOptions[API].max).toBe(100);
  });

  it('meters the general API per operator, not per egress IP', () => {
    const key = limiterOptions[API].keyGenerator;

    expect(key?.(req({ 'x-bff-secret': BFF_SECRET, 'x-operator-key': 'abc123' }))).toBe(
      'op:abc123'
    );
  });

  it('falls back to the address — through ipKeyGenerator — for everything else', () => {
    const key = limiterOptions[API].keyGenerator;

    // Returning req.ip raw would let an IPv6 client rotate inside its own /64
    // and never reach the limit; the built-in generator masks to /56.
    expect(key?.(req())).toBe('ip:203.0.113.9');
    // Client-supplied on its own, so it buys nothing without the BFF secret.
    expect(key?.(req({ 'x-operator-key': 'abc123' }))).toBe('ip:203.0.113.9');
    expect(key?.(req({ 'x-bff-secret': 'wrong', 'x-operator-key': 'abc123' }))).toBe(
      'ip:203.0.113.9'
    );
  });

  it('leaves the auth, MFA and webhook limiters on the default IP key', () => {
    // /unlock runs before any session exists, so there is no operator to key
    // on, and Meta never sends the BFF secret.
    expect(limiterOptions[AUTH].keyGenerator).toBeUndefined();
    expect(limiterOptions[MFA].keyGenerator).toBeUndefined();
    expect(limiterOptions[WEBHOOK].keyGenerator).toBeUndefined();
  });

  it('caps the MFA endpoints tightly', () => {
    expect(limiterOptions[MFA].windowMs).toBe(15 * 60 * 1000);
    expect(limiterOptions[MFA].max).toBe(10);
  });

  it('meters the public Meta webhook per minute, well above real traffic', () => {
    expect(limiterOptions[WEBHOOK].windowMs).toBe(60_000);
    expect(limiterOptions[WEBHOOK].max).toBe(3000);
  });

  it('sheds an over-ceiling Meta callback with a 200, never a 429', () => {
    // 429 is a RETRYABLE failure: Meta redelivers the same callback into the
    // same flood that tripped the ceiling, and the resulting run of failures is
    // what gets the subscription disabled — trading a minute of shed load for an
    // inbound outage somebody has to re-subscribe by hand.
    const res: FakeResponse = { status: jest.fn(), json: jest.fn() };
    res.status.mockReturnValue(res);

    limiterOptions[WEBHOOK].handler?.(
      { method: 'POST', path: '/api/v1/webhooks/whatsapp' } as unknown as Request,
      res
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: false, dropped: 'rate limited' });
    // The drop is invisible to Meta by design, so it has to be visible to us.
    expect(loggerMock.warn).toHaveBeenCalled();
  });
});

describe('with REDIS_ENABLED=false', () => {
  beforeEach(async () => {
    redisMock.status = 'disabled';
    await loadLimiters();
  });

  it('never constructs a Redis store against the disabled-mode mock', () => {
    expect(storeOptions).toHaveLength(0);
  });

  it('leaves every limiter on the built-in memory store', () => {
    expect(limiterOptions).toHaveLength(4);
    // `store: undefined` is what makes express-rate-limit fall back to its
    // MemoryStore. Per-process and therefore weaker across replicas — but
    // single-process is the deployment shape that turns Redis off, and a
    // working limiter beats a route that 500s.
    expect(limiterOptions.map((o) => o.store)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });
});
