import type { Request, Response, NextFunction } from 'express';
import { BadRequestError } from '../exceptions';
import { env } from '../config/env';
import logger from '../config/logger';

/**
 * Middleware to verify Cloudflare Turnstile token
 * Expects 'cf-turnstile-response' in request body or headers
 */
export const verifyTurnstile = async (req: Request, _res: Response, next: NextFunction) => {
  // Skip verification in development/test if not configured
  if (env.NODE_ENV !== 'production' && !env.CF_TURNSTILE_SECRET_KEY) {
    return next();
  }

  const token = req.body['cf-turnstile-response'] || req.headers['cf-turnstile-response'];
  const secretKey = env.CF_TURNSTILE_SECRET_KEY;
  const ip = req.ip;

  if (!token) {
    throw new BadRequestError('Missing Turnstile CAPTCHA token');
  }

  if (!secretKey) {
    // FAIL CLOSED. This used to `return next()`, so a production deployment
    // missing the key silently accepted any string as a CAPTCHA token — every
    // protected endpoint lost its bot defence with only a log line to show for
    // it. Non-production without a key already short-circuited above, so
    // reaching here at all means the key is genuinely missing where it matters.
    logger.error('Turnstile secret key is missing — rejecting CAPTCHA-protected request');
    throw new BadRequestError('CAPTCHA verification is unavailable');
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token as string);
    if (ip) formData.append('remoteip', ip);

    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });

    const outcome = (await result.json()) as { success: boolean };

    if (!outcome.success) {
      throw new BadRequestError('Invalid CAPTCHA challenge');
    }

    next();
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
    logger.error('Turnstile verification error:', error);
    throw new BadRequestError('Failed to verify CAPTCHA');
  }
};
