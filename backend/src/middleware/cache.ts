import type { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';
import logger from '../config/logger';

interface CacheOptions {
  /** TTL in seconds (default: 300 = 5 minutes) */
  ttl?: number;
  /** Custom key generator (default: req.originalUrl) */
  keyGenerator?: (req: Request) => string;
  /** Only cache for authenticated users (includes user ID in key) */
  perUser?: boolean;
  /** Query param that bypasses cache when present (e.g. 'fresh') */
  bypassParam?: string;
}

/**
 * Redis-based response caching middleware for GET endpoints.
 * Caches JSON responses and serves them on subsequent requests.
 */
export const cache = (options: CacheOptions = {}) => {
  const { ttl = 300, keyGenerator, perUser = false, bypassParam } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      next();
      return;
    }

    // Skip cache if redis is not available
    if (redis.status !== 'ready') {
      next();
      return;
    }

    // Skip cache if bypass query param is present (e.g. ?fresh=true)
    if (bypassParam && req.query[bypassParam] === 'true') {
      next();
      return;
    }

    const baseKey = keyGenerator ? keyGenerator(req) : req.originalUrl;
    const userId = perUser && (req as any).user?.id ? `:u:${(req as any).user.id}` : '';
    const cacheKey = `cache:${baseKey}${userId}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-TTL', String(ttl));
        res.status(200).json(parsed);
        return;
      }
    } catch (error) {
      logger.warn(`Cache read error for ${cacheKey}:`, (error as Error).message);
    }

    // Intercept res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        redis
          .set(cacheKey, JSON.stringify(body), 'EX', ttl)
          .catch((err: Error) => logger.warn(`Cache write error for ${cacheKey}:`, err.message));
      }
      res.setHeader('X-Cache', 'MISS');
      return originalJson(body);
    };

    next();
  };
};

/**
 * Invalidate cache entries matching a pattern.
 * Call this after mutations (POST/PUT/DELETE) to clear stale data.
 *
 * @param pattern - Redis key pattern (e.g. "cache:/api/v1/jobs*")
 */
export const invalidateCache = async (pattern: string): Promise<void> => {
  if (redis.status !== 'ready') return;

  try {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');
  } catch (error) {
    logger.warn(`Cache invalidation error for pattern ${pattern}:`, (error as Error).message);
  }
};

export default cache;
