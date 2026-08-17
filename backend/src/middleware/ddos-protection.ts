import type { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';
import logger from '../config/logger';
import { env } from '../config/env';

/** One warning per process, not one per request. */
let warnedDisabled = false;

const WINDOW_SECONDS = 1;
const WARN_THRESHOLD = 50; // requests per second before warning
const BLOCK_THRESHOLD = 100; // requests per second before blocking
const BLOCK_DURATION = 60; // seconds to block a client after threshold breach

/**
 * Who this request should be metered as: the operator, when the BFF vouched for
 * one, and the IP otherwise.
 *
 * Console traffic arrives browser → Next.js BFF → load balancer, so `req.ip`
 * resolves to the BFF's egress address and EVERY operator falls into the same
 * bucket. One person opening a handful of inbox tabs could push that single
 * address past the threshold below and 429 the whole team for a minute, and one
 * mistyped password consumed the shared auth window. Raising TRUST_PROXY_HOPS
 * to 2 fixes the console path but makes the Meta webhook — one hop, header
 * supplied by Meta — trust a spoofable X-Forwarded-For, so no single hop count
 * serves both.
 *
 * So the BFF sends `x-operator-key`, derived from that browser's unlock cookie.
 * It is a client-supplied header, so it is honoured ONLY alongside a matching
 * `x-bff-secret` — without that check anyone could send a fresh key per request
 * and opt out of every limiter. Callers that do not come through the BFF (the
 * Meta webhook, /unlock before a session exists) get undefined here and stay
 * keyed on their address.
 */
export function operatorKey(req: Request): string | undefined {
  const key = req.headers['x-operator-key'];
  if (typeof key !== 'string' || key.length === 0) return undefined;
  const secret = req.headers['x-bff-secret'];
  if (!env.BFF_SECRET || typeof secret !== 'string' || secret !== env.BFF_SECRET) return undefined;
  return `op:${key}`;
}

/**
 * App-level DDoS protection using Redis sliding window counters.
 * Tracks request rate per client (see {@link operatorKey}) and blocks abusive
 * ones.
 * Health check endpoints are exempt.
 */
export const ddosProtection = () => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Exempt health checks
    // The Meta webhook is exempt for the same reason app.ts mounts it ahead of
    // apiLimiter: Meta bursts delivery/read callbacks during a bulk campaign, and
    // a 429 makes it retry, back off, and eventually disable the subscription.
    // Its protection is the X-Hub-Signature-256 HMAC, which is verified before
    // anything is written. (A generous webhookLimiter still applies.)
    // Narrowed to POST. The justification below is Meta's status-callback
    // burst, which is POST-only; the GET handshake has no HMAC and no burst
    // behaviour, so exempting it just handed out a free unmetered endpoint.
    if (
      req.path.startsWith('/health') ||
      (req.method === 'POST' && req.path === '/api/v1/webhooks/whatsapp')
    ) {
      return next();
    }

    // Graceful degradation if Redis unavailable.
    //
    // The disabled-mode Redis is a MOCK object, not null — always truthy, with
    // incr() resolving to 0. So this guard never fired, the counter never grew, and
    // every threshold check silently passed: with REDIS_ENABLED=false the DDoS
    // protection was a complete no-op while the boot banner reported it ready.
    // Detect the mock explicitly, and say so once.
    if (!redis || (redis as { status?: string }).status === 'disabled') {
      if (!warnedDisabled) {
        warnedDisabled = true;
        logger.warn(
          'DDoS protection is INACTIVE: Redis is disabled (REDIS_ENABLED=false). ' +
            'Per-client request thresholds are not being enforced.'
        );
      }
      return next();
    }

    try {
      const client = operatorKey(req) ?? req.ip ?? req.socket.remoteAddress ?? 'unknown';
      const blockKey = `ddos:block:${client}`;
      const rateKey = `ddos:rate:${client}`;

      // Check if the client is currently blocked
      const isBlocked = await redis.get(blockKey);
      if (isBlocked) {
        res.set('Retry-After', String(BLOCK_DURATION));
        res.status(429).json({
          success: false,
          error: {
            message: 'Too many requests. Please try again later.',
            code: 'RATE_LIMIT_EXCEEDED',
          },
        });
        return;
      }

      // Increment request counter (sliding window)
      const count = await redis.incr(rateKey);
      if (count === 1) {
        await redis.expire(rateKey, WINDOW_SECONDS);
      }

      if (count > BLOCK_THRESHOLD) {
        // Block the client
        await redis.set(blockKey, '1', 'EX', BLOCK_DURATION);
        logger.warn(`DDoS protection: Blocked ${client} — ${count} req/s`);
        res.set('Retry-After', String(BLOCK_DURATION));
        res.status(429).json({
          success: false,
          error: {
            message: 'Too many requests. Please try again later.',
            code: 'RATE_LIMIT_EXCEEDED',
          },
        });
        return;
      }

      if (count > WARN_THRESHOLD) {
        logger.warn(`DDoS protection: High rate from ${client} — ${count} req/s`);
      }

      next();
    } catch (error) {
      // Never block requests due to Redis errors, but log for monitoring
      logger.warn('DDoS protection: Redis error, skipping rate check:', (error as Error).message);
      next();
    }
  };
};
