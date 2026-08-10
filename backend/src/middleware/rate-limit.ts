import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { env } from '../config/env';
import { redis } from '../config/redis';

/**
 * Create a fresh RedisStore instance for each limiter.
 * Each must have a unique prefix to avoid ERR_ERL_STORE_REUSE.
 */
function createRedisStore(prefix: string): RedisStore {
  return new RedisStore({
    prefix: `rl:${prefix}:`,
    sendCommand: (...args: string[]) => redis.call(args[0], ...args.slice(1)) as Promise<number>,
  });
}

/**
 * Strict Rate Limiter for Authentication Routes
 * Usage: Apply to /login, /register, /forgot-password
 */
export const authLimiter = rateLimit({
  windowMs: parseInt(env.AUTH_RATE_LIMIT_WINDOW_MS, 10), // Default: 5 minutes
  max: parseInt(env.AUTH_RATE_LIMIT_MAX_ATTEMPTS, 10), // Default: 10 attempts
  standardHeaders: true,
  legacyHeaders: false,
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
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('api'),
  message: {
    status: 'fail',
    message: 'Too many requests, please try again later.',
  },
});

/**
 * Public/Open Route Limiter (e.g. valid for landing page data)
 * Usage: Apply to public read-only endpoints if needed
 */
export const publicLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('pub'),
});

/**
 * MFA Route Limiter
 * Usage: Apply to /auth/mfa/* endpoints to prevent brute-force
 */
export const mfaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('mfa'),
  message: {
    status: 'fail',
    message: 'Too many MFA attempts. Please try again later.',
  },
});

/**
 * Export Route Limiter
 * Usage: Apply to bulk export endpoints (CSV/XLSX, resume ZIP)
 * Prevents abuse of resource-intensive export operations.
 */
export const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 export requests per hour per user
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('export'),
  message: {
    status: 'fail',
    message: 'Too many export requests. Please try again later.',
  },
});

/**
 * Search Route Limiter
 * Usage: Apply to /search routes (autocomplete, suggestions, etc.)
 * More permissive than auth but stricter than general API to prevent abuse.
 */
export const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('search'),
  message: {
    status: 'fail',
    message: 'Too many search requests, please slow down.',
  },
});

/**
 * Review-submission limiter — caps the same IP at 1 review submission
 * per company per 24h. The unique-index dedup is the hard guarantee;
 * this limiter just degrades the abuse signal earlier so the DB
 * doesn't take the load.
 */
export const reviewSubmitLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 5, // 5 submissions per IP per 24h across the platform
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('review-submit'),
  message: {
    status: 'fail',
    message: 'You have submitted too many reviews recently. Please try again tomorrow.',
  },
});

/**
 * Review-vote limiter — 30 helpful/not-helpful votes per IP per hour.
 */
export const reviewVoteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('review-vote'),
  message: { status: 'fail', message: 'Too many votes. Please slow down.' },
});

/**
 * Review-report limiter — 5 reports per IP per hour.
 */
export const reviewReportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('review-report'),
  message: { status: 'fail', message: 'Too many reports. Please slow down.' },
});

/**
 * Vendor contact-reveal limiter — anti-scraping burst guard on the
 * vendor job board's "reveal employer contact" action. The VENDOR_LEAD
 * quota ledger + per-job dedup are the real controls; this just caps
 * rapid enumeration. 60 reveals per IP per minute.
 */
export const vendorRevealLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('vendor-reveal'),
  message: { status: 'fail', message: 'Too many contact reveals. Please slow down.' },
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
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('wh'),
  // Meta must never see a JSON error body it might interpret as a failure to
  // deliver; the 429 status alone is the signal.
  message: { ok: false },
});
