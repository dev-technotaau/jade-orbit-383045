import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from './env';
import { AppError } from '../middleware/error';

// ---------------------------------------------------------------------------
// Stateless HMAC-signed CSRF token (no cookies required)
//
// Why not the double-submit cookie pattern?
// When frontend (Vercel) and backend (Render) are on different domains, the
// CSRF cookie becomes a third-party cookie that modern browsers block.
//
// Security model:
//  1. GET /api/csrf-token is CORS-protected — only allowed origins can read
//     the response and obtain a valid token.
//  2. Mutation requests must include the token in the x-csrf-token header.
//     Cross-origin requests with custom headers trigger a CORS preflight,
//     which only passes for allowed origins.
//  3. Tokens are HMAC-signed with CSRF_SECRET and include a timestamp, so
//     they can't be forged and expire after 24 hours.
// ---------------------------------------------------------------------------

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

function sign(nonce: string, timestamp: string): string {
  return crypto.createHmac('sha256', env.CSRF_SECRET).update(`${nonce}.${timestamp}`).digest('hex');
}

/**
 * Generate a CSRF token for the client.
 * Token format: `nonce.timestamp.signature`
 */
export function generateCsrfToken(_req: Request, _res: Response): string {
  const nonce = crypto.randomBytes(32).toString('hex');
  const timestamp = Date.now().toString(36);
  const signature = sign(nonce, timestamp);
  return `${nonce}.${timestamp}.${signature}`;
}

/**
 * Validate a CSRF token: check signature and expiry.
 */
function validateToken(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [nonce, timestamp, signature] = parts;

  // Verify signature
  const expected = sign(nonce, timestamp);
  if (expected.length !== signature.length) return false;

  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
      return false;
    }
  } catch {
    return false;
  }

  // Check expiry
  const createdAt = parseInt(timestamp, 36);
  if (isNaN(createdAt) || Date.now() - createdAt > TOKEN_MAX_AGE_MS) {
    return false;
  }

  return true;
}

/**
 * Express middleware: reject mutation requests without a valid CSRF token.
 */
export function doubleCsrfProtection(req: Request, _res: Response, next: NextFunction): void {
  if (!MUTATION_METHODS.has(req.method.toUpperCase())) return next();

  // BFF bypass: server-to-server calls from Next.js API routes
  const bffSecret = req.headers['x-bff-secret'] as string | undefined;
  if (bffSecret && env.BFF_SECRET && bffSecret === env.BFF_SECRET) return next();

  const token = req.headers['x-csrf-token'] as string | undefined;

  if (!token || !validateToken(token)) {
    return next(new AppError('Invalid CSRF token', 403, 'EBADCSRFTOKEN'));
  }

  next();
}
