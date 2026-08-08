import { Router } from 'express';
import type { Request, Response } from 'express';
import crypto from 'crypto';
import { env } from '../config/env';
import { unlockToken } from '../middleware/app-password';
import { authLimiter } from '../middleware/rate-limit';

/**
 * The only unauthenticated endpoint: exchange the app password for a token.
 *
 * This replaces the host application's entire auth surface (login, register,
 * refresh, OAuth callbacks, WebAuthn, MFA, session management — 13 routes).
 *
 * The response carries an HMAC of the password, never the password itself, so
 * the value the browser stores is useless for anything except presenting back
 * here. The BFF puts it in an httpOnly cookie, which JavaScript cannot read.
 *
 * Rate-limited with the same limiter the host app used for login, because this
 * is the one credential in the system and therefore the only thing worth
 * brute-forcing.
 */
const router = Router();

router.post('/', authLimiter, (req: Request, res: Response) => {
  const supplied = (req.body as { password?: unknown })?.password;

  if (!env.APP_PASSWORD) {
    // Fail closed and say so plainly — a misconfigured deployment should be
    // obvious, not look like a wrong password.
    res.status(500).json({
      success: false,
      error: { message: 'APP_PASSWORD is not configured on the server', code: 'APP_PASSWORD_UNSET' },
    });
    return;
  }

  if (typeof supplied !== 'string' || supplied.length === 0) {
    res.status(400).json({
      success: false,
      error: { message: 'Password is required', code: 'PASSWORD_REQUIRED' },
    });
    return;
  }

  // Constant-time compare. Length is checked first because timingSafeEqual
  // throws on a length mismatch — and length alone leaks nothing useful here.
  const a = Buffer.from(supplied);
  const b = Buffer.from(env.APP_PASSWORD);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!ok) {
    res.status(401).json({
      success: false,
      error: { message: 'Incorrect password', code: 'INVALID_PASSWORD' },
    });
    return;
  }

  res.status(200).json({ success: true, data: { token: unlockToken() } });
});

export default router;
