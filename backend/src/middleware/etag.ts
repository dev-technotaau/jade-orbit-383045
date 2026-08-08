import type { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { redis } from '../config/redis';
import logger from '../config/logger';

interface ETagOptions {
  /** TTL in seconds for the cached ETag (default: 60) */
  ttl?: number;
  /**
   * When true, the middleware also emits CDN-friendly `Cache-Control`
   * + `Vary` headers on the response. Use only on PUBLIC, anonymous
   * endpoints — emitting these on auth-bearing routes leaks per-user
   * data through shared caches.
   *
   *   Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600
   *   Vary: Accept, Accept-Language, Accept-Encoding
   */
  publicCdnCache?: boolean;
}

/**
 * ETag middleware — caches response ETags in Redis and returns 304 Not Modified
 * when the client sends a matching If-None-Match header.
 * Apply selectively to high-traffic GET endpoints.
 */
export const etagCache = (options: ETagOptions = {}) => {
  const { ttl = 60, publicCdnCache = false } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') {
      next();
      return;
    }

    // Emit CDN cache hints up-front so even Redis-down requests benefit.
    // Per Phase 18 of the master plan: public endpoints are anonymous,
    // safe to share across edges, and benefit from a 1min fresh / 5min
    // stale-while-revalidate window. Vary tells caches to fragment by
    // negotiation headers.
    if (publicCdnCache) {
      // Anonymous-only CDN caching by default. When a request carries
      // an auth cookie/bearer, downgrade to `private` so the CDN
      // doesn't serve an authed user's cap-uncapped response to a
      // guest (or vice versa).
      const hasAuth =
        !!(req as any).user?.id || !!req.headers.authorization || !!req.cookies?.ha_access_token;
      if (hasAuth) {
        res.setHeader(
          'Cache-Control',
          `private, max-age=${ttl}, stale-while-revalidate=${Math.max(ttl * 10, 600)}`
        );
      } else {
        res.setHeader(
          'Cache-Control',
          `public, max-age=${ttl}, s-maxage=${Math.max(ttl * 5, 300)}, stale-while-revalidate=${Math.max(ttl * 10, 600)}`
        );
      }
      // Cookie is added so any reverse-proxy/CDN that doesn't strip
      // the auth cookie still fragments correctly between guests +
      // authenticated users.
      res.setHeader('Vary', 'Accept, Accept-Language, Accept-Encoding, Cookie, Authorization');
    }

    if (redis.status !== 'ready') {
      next();
      return;
    }

    const userId = (req as any).user?.id || 'anon';
    const etagKey = `etag:${req.originalUrl}:${userId}`;
    const ifNoneMatch = req.headers['if-none-match'];

    // Check if client's ETag matches the stored one
    if (ifNoneMatch) {
      try {
        const storedEtag = await redis.get(etagKey);
        if (storedEtag && storedEtag === ifNoneMatch) {
          res.status(304).end();
          return;
        }
      } catch {
        // Redis unavailable — proceed normally
      }
    }

    // Intercept res.json to compute and cache ETag
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const bodyStr = JSON.stringify(body);
          const etag = `"${createHash('md5').update(bodyStr).digest('hex')}"`;
          res.setHeader('ETag', etag);

          // Cache the ETag in Redis (fire-and-forget)
          redis.set(etagKey, etag, 'EX', ttl).catch(() => {});
        } catch (error) {
          logger.debug('ETag computation error:', error);
        }
      }
      return originalJson(body);
    };

    next();
  };
};
