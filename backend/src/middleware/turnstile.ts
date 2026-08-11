import type { Request, Response, NextFunction } from 'express';
import { AppError } from './error';
import { asyncHandler } from '../utils/async-handler';
import { env } from '../config/env';
import logger from '../config/logger';
import { turnstileVerificationsTotal } from '../utils/whatsapp-metrics';

/**
 * Cloudflare Turnstile — the bot check in front of the app password.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ported back from the host platform, which had this on login and lost it when
 * the module was stripped. Without it, the one credential in the system faced
 * nothing but rate limiting: a shell one-liner could grind against `/unlock`
 * from any number of addresses, and the only thing standing in the way was the
 * length of APP_PASSWORD.
 *
 * ── Required, not optional ──
 * `CF_TURNSTILE_SECRET_KEY` is mandatory in production (config/env.ts refuses to
 * boot without it), and this middleware FAILS CLOSED — a missing key rejects the
 * request rather than waving it through. The host platform's original version
 * did `return next()` when the key was absent, so a production deployment that
 * forgot to set it silently lost its bot defence with one log line to show for
 * it; that was fixed there and the fixed behaviour is what is ported here.
 *
 * ── Local development ──
 * Cloudflare publishes test keys that always pass, so `npm run dev` works with
 * no Cloudflare account. See backend/.env.example. Without a key set, a
 * non-production environment skips the check entirely.
 */

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Cloudflare is a hard dependency of the login path once this is on, so bound
 * it. The host platform's version has no timeout at all: a hung siteverify
 * stalls the request until the global 30s request timeout, holding a connection
 * and an operator the whole time.
 */
const VERIFY_TIMEOUT_MS = 5000;

interface SiteVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
}

/** Read the token from the body or the header, matching Cloudflare's convention. */
function extractToken(req: Request): string | null {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const fromBody = body['cf-turnstile-response'] ?? body.turnstileToken;
  if (typeof fromBody === 'string' && fromBody.length > 0) return fromBody;
  const fromHeader = req.get('cf-turnstile-response');
  return fromHeader && fromHeader.length > 0 ? fromHeader : null;
}

/**
 * Verify a Turnstile token. Mount ahead of any endpoint that accepts the app
 * password.
 */
export const verifyTurnstile = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const secretKey = env.CF_TURNSTILE_SECRET_KEY;

    // Development convenience only. In production the key is required at boot,
    // so this branch is unreachable there.
    if (env.NODE_ENV !== 'production' && !secretKey) {
      return next();
    }

    if (!secretKey) {
      // Fail closed. Reaching here means production is missing the key, which
      // env validation should already have prevented.
      logger.error('Turnstile secret key is missing — rejecting the request');
      turnstileVerificationsTotal.inc({ outcome: 'misconfigured' });
      return next(
        new AppError('CAPTCHA verification is unavailable', 503, 'TURNSTILE_UNAVAILABLE')
      );
    }

    const token = extractToken(req);
    if (!token) {
      turnstileVerificationsTotal.inc({ outcome: 'missing' });
      return next(
        new AppError('Complete the challenge and try again', 400, 'TURNSTILE_TOKEN_MISSING')
      );
    }

    const form = new URLSearchParams();
    form.append('secret', secretKey);
    form.append('response', token);
    if (req.ip) form.append('remoteip', req.ip);
    // Idempotency key: makes a retried verification safe, and lets Cloudflare
    // reject a genuine replay of the same token.
    form.append('idempotency_key', `${req.id ?? ''}-${Date.now()}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

    let outcome: SiteVerifyResponse;
    try {
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      const res = await fetch(SITEVERIFY_URL, {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });
      outcome = (await res.json()) as SiteVerifyResponse;
    } catch (e) {
      const timedOut = (e as Error)?.name === 'AbortError';
      logger.error(
        `Turnstile verification ${timedOut ? 'timed out' : 'failed'}: ${(e as Error).message}`
      );
      turnstileVerificationsTotal.inc({ outcome: timedOut ? 'timeout' : 'error' });
      // Still closed. An operator seeing this needs to know it is Cloudflare
      // that is unreachable, not their password that is wrong.
      return next(
        new AppError(
          'Could not reach the CAPTCHA service. Try again in a moment.',
          503,
          'TURNSTILE_UNAVAILABLE'
        )
      );
    } finally {
      clearTimeout(timer);
    }

    if (!outcome.success) {
      // The error codes are the only way to tell a stale token from a bad
      // sitekey from a genuine bot, and the host platform discards them.
      const codes = outcome['error-codes'] ?? [];
      logger.warn(
        `Turnstile rejected a challenge from ${req.ip}: ${codes.join(', ') || 'no code'}`
      );
      turnstileVerificationsTotal.inc({ outcome: 'rejected' });

      const stale =
        codes.includes('timeout-or-duplicate') || codes.includes('invalid-input-response');
      return next(
        new AppError(
          stale ? 'That challenge expired. Try again.' : 'CAPTCHA verification failed. Try again.',
          400,
          'TURNSTILE_FAILED'
        )
      );
    }

    turnstileVerificationsTotal.inc({ outcome: 'passed' });
    next();
  }
);
