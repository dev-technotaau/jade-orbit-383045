import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { env } from '../config/env';
import { redis } from '../config/redis';

/**
 * Is a REAL Redis behind `redis`, or the disabled-mode mock?
 *
 * `REDIS_ENABLED=false` is a supported, documented configuration, and
 * config/redis.ts answers it with a mock whose every command resolves `null`.
 * Handing that to rate-limit-redis is fatal: its `loadGetScript` asserts on the
 * reply shape and throws `TypeError: unexpected reply from redis client`, and
 * express-rate-limit's `passOnStoreError` defaults to FALSE — so the throw
 * became a 500 on every rate-limited route. That included `/api/v1/unlock`,
 * which means running without Redis did not degrade the app, it bricked it: no
 * operator could get past the login screen, and the error said nothing about
 * Redis.
 */
const redisAvailable = (): boolean =>
  (redis as unknown as { status?: string }).status !== 'disabled';

/**
 * Store for a limiter. A real Redis gets the shared, cluster-wide store; with
 * Redis disabled we fall through to express-rate-limit's built-in MemoryStore,
 * which is per-process — weaker across replicas, but a working limiter beats a
 * broken route, and single-process is the deployment shape that turns Redis off
 * in the first place.
 *
 * Each store needs a unique prefix to avoid ERR_ERL_STORE_REUSE.
 */
function createRedisStore(prefix: string): RedisStore | undefined {
  if (!redisAvailable()) return undefined;
  return new RedisStore({
    prefix: `rl:${prefix}:`,
    sendCommand: (...args: string[]) => redis.call(args[0], ...args.slice(1)) as Promise<number>,
  });
}

/**
 * Options every limiter shares.
 *
 * `passOnStoreError: true` is defence in depth for the OTHER failure mode: a
 * live Redis that rejects a command (OOM, failover mid-command, WRONGTYPE).
 * Without it that rejection is a 500 for the caller. Letting the request
 * through un-counted is the right trade for an internal console — the
 * credential check is pure crypto and fails closed regardless of Redis.
 */
const SHARED: { standardHeaders: true; legacyHeaders: false; passOnStoreError: true } = {
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
};

/**
 * Strict Rate Limiter for Authentication Routes
 * Usage: Apply to /login, /register, /forgot-password
 */
export const authLimiter = rateLimit({
  windowMs: parseInt(env.AUTH_RATE_LIMIT_WINDOW_MS, 10), // Default: 5 minutes
  max: parseInt(env.AUTH_RATE_LIMIT_MAX_ATTEMPTS, 10), // Default: 10 attempts
  ...SHARED,
  store: createRedisStore('auth'),
  message: {
    status: 'fail',
    message: 'Too many login attempts, please try again later.',
  },
  // Only FAILED attempts count. With successes counted too, a busy team
  // sharing one egress IP could exhaust the window through normal use and
  // lock themselves out of the console — and counting successes buys nothing
  // here: there is one password and no account to enumerate.
  skipSuccessfulRequests: true,
});

/**
 * Standard Rate Limiter for General API Routes
 * Usage: Apply to /api
 */
export const apiLimiter = rateLimit({
  windowMs: parseInt(env.RATE_LIMIT_WINDOW_MS, 10), // Default: 15 minutes
  max: parseInt(env.RATE_LIMIT_MAX_REQUESTS, 10), // Default: 100 requests
  ...SHARED,
  store: createRedisStore('api'),
  message: {
    status: 'fail',
    message: 'Too many requests, please try again later.',
  },
});

/**
 * MFA Route Limiter
 * Usage: Apply to /auth/mfa/* endpoints to prevent brute-force
 */
export const mfaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  ...SHARED,
  store: createRedisStore('mfa'),
  message: {
    status: 'fail',
    message: 'Too many MFA attempts. Please try again later.',
  },
});

/**
 * Ceiling for the public Meta webhook.
 *
 * The webhook is mounted ahead of `apiLimiter` on purpose — Meta bursts status
 * callbacks during a campaign and a 429 makes it retry, back off, and
 * eventually disable the subscription. That left the one unauthenticated,
 * write-capable endpoint in the system completely unmetered, with only
 * ddosProtection's 100 req/s per-IP floor above it.
 *
 * So: a limit high enough that real Meta traffic will never reach it (a 50k
 * campaign generates ~150k callbacks spread over minutes, and Meta batches up
 * to 100 entries per POST), but finite. Sized per minute so a burst is absorbed
 * rather than smoothed.
 */
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3000,
  ...SHARED,
  store: createRedisStore('wh'),
  // Meta must never see a JSON error body it might interpret as a failure to
  // deliver; the 429 status alone is the signal.
  message: { ok: false },
});
