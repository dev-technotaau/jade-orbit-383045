import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

/**
 * Validates that the request is coming from a trusted Cloudflare IP.
 * Optional: Can be used if we want to strictly deny non-Cloudflare traffic
 * at the application level (though better done at Firewall/Network level).
 *
 * For now, this just logs a warning if headers are missing.
 */
export const cloudflareProxyCheck = (req: Request, _res: Response, next: NextFunction) => {
  const cfVisitingIp = req.headers['cf-connecting-ip'];

  if (!cfVisitingIp && env.NODE_ENV === 'production') {
    // In production, we expect traffic via Cloudflare
    // We confirm this by checking for CF headers
    console.warn('⚠️ Request received without Cloudflare headers in production!');
  }

  next();
};

/**
 * Adds security headers compatible with Cloudflare features
 */
export const cloudflareSecurityHeaders = (_req: Request, _res: Response, next: NextFunction) => {
  // Page Shield (CSP reporting) - can be configured here
  // For now, we rely on Helmet, but we can extend it
  next();
};
