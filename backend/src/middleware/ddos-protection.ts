import type { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';
import logger from '../config/logger';

const WINDOW_SECONDS = 1;
const WARN_THRESHOLD = 50; // requests per second before warning
const BLOCK_THRESHOLD = 100; // requests per second before blocking
const BLOCK_DURATION = 60; // seconds to block an IP after threshold breach

/**
 * App-level DDoS protection using Redis sliding window counters.
 * Tracks request rate per IP and blocks abusive clients.
 * Health check endpoints are exempt.
 */
export const ddosProtection = () => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Exempt health checks
    if (req.path.startsWith('/health')) {
      return next();
    }

    // Graceful degradation if Redis unavailable
    if (!redis) {
      return next();
    }

    try {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const blockKey = `ddos:block:${ip}`;
      const rateKey = `ddos:rate:${ip}`;

      // Check if IP is currently blocked
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
        // Block the IP
        await redis.set(blockKey, '1', 'EX', BLOCK_DURATION);
        logger.warn(`DDoS protection: Blocked IP ${ip} — ${count} req/s`);
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
        logger.warn(`DDoS protection: High rate from IP ${ip} — ${count} req/s`);
      }

      next();
    } catch (error) {
      // Never block requests due to Redis errors, but log for monitoring
      logger.warn('DDoS protection: Redis error, skipping rate check:', (error as Error).message);
      next();
    }
  };
};
