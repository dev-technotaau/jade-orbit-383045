import { Router } from 'express';
import type { Request, Response } from 'express';
import crypto from 'crypto';
import { env } from '../config/env';
import {
  issueUnlockToken,
  issueSocketTicket,
  requireAppPassword,
} from '../middleware/app-password';
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
      error: {
        message: 'APP_PASSWORD is not configured on the server',
        code: 'APP_PASSWORD_UNSET',
      },
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

  const { token, expiresInSeconds } = issueUnlockToken();
  // `expiresInSeconds` is the authority — the BFF sets the cookie's maxAge from
  // it so the browser and the server agree on when the session ends.
  res.status(200).json({ success: true, data: { token, expiresInSeconds } });
});

/**
 * Mint a short-lived Socket.IO handshake ticket.
 *
 * Page JavaScript needs *something* to put in `handshake.auth`, and the unlock
 * cookie is httpOnly precisely so it cannot be that something. The BFF calls
 * this with the cookie and hands the browser a two-minute, socket-scoped
 * ticket instead: it opens a socket and nothing else — requireAppPassword
 * rejects it, so a ticket leaked from the page is not a session.
 */
router.get('/socket-ticket', requireAppPassword, (_req: Request, res: Response) => {
  const { ticket, expiresInSeconds } = issueSocketTicket();
  res.status(200).json({ success: true, data: { ticket, expiresInSeconds } });
});

/**
 * Echo how this process resolved the caller's address.
 *
 * `trust proxy` depth decides what `req.ip` is, and therefore what the per-IP
 * rate limiter buckets on — get it wrong and either every operator shares one
 * bucket (because they all arrive via the BFF's egress IP) or a client can
 * spoof its own address. There is no way to reason that out from the code
 * alone; it depends on how many proxies the deployment actually has. So: hit
 * this once after the first deploy and confirm `ip` is your real address.
 *
 * Behind requireAppPassword, and it reveals nothing about anyone but the caller.
 */
router.get('/whoami', requireAppPassword, (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      ip: req.ip,
      ips: req.ips,
      trustProxy: req.app.get('trust proxy fn') ? req.app.get('trust proxy') : undefined,
      xForwardedFor: req.headers['x-forwarded-for'] ?? null,
    },
  });
});

export default router;
