import { Router } from 'express';
import type { Request, Response } from 'express';
import crypto from 'crypto';
import { env } from '../config/env';
import {
  issueUnlockToken,
  issueSocketTicket,
  issueMfaPendingToken,
  verifyMfaPendingToken,
  requireAppPassword,
} from '../middleware/app-password';
import { authLimiter, mfaLimiter } from '../middleware/rate-limit';
import { verifyTurnstile } from '../middleware/turnstile';
import { AppError } from '../middleware/error';
import { audit } from '../middleware/audit';
import { asyncHandler } from '../utils/async-handler';
import * as mfa from '../services/whatsapp-mfa.service';
import {
  applyProgressiveDelay,
  recordUnlockFailure,
  recordUnlockSuccess,
} from '../services/unlock-attempt.service';

/**
 * The only unauthenticated surface: exchange the app password (and, when MFA is
 * on, a second factor) for a session token.
 *
 * This replaces the host application's entire auth stack — login, register,
 * refresh, OAuth callbacks, WebAuthn, MFA, session management, 13 routes.
 *
 * The response carries an HMAC of the password, never the password itself, so
 * the value the browser stores is useless for anything except presenting back
 * here. The BFF puts it in an httpOnly cookie, which JavaScript cannot read.
 *
 * ── The two-step shape ──
 *   POST /unlock                 password        -> full token, OR mfaRequired + pendingToken
 *   POST /unlock/mfa/verify      pendingToken+code -> full token
 * The password is sent exactly once. The pending token is scoped, so it opens
 * nothing but the verify endpoint.
 */
const router = Router();

/** The trusted-device cookie. httpOnly, set by the BFF, hashed server-side. */
export const TRUSTED_DEVICE_COOKIE = 'wa_device';

const clientIp = (req: Request): string => req.ip || req.socket.remoteAddress || 'unknown';
const clientUa = (req: Request): string | undefined => req.get('user-agent') ?? undefined;

function requireConfiguredPassword(res: Response): string | null {
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
    return null;
  }
  return env.APP_PASSWORD;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Step 1 — password
 * ──────────────────────────────────────────────────────────────────────────*/

// Turnstile runs BEFORE the limiter's counter is spent and before any password
// comparison, so automated traffic is turned away at the cheapest possible
// point and never consumes an operator's rate-limit budget.
//
// Step 2 (/mfa/verify) is deliberately NOT challenged again: its gate is the
// scoped 5-minute pending token, which cannot be obtained without first passing
// both this challenge and the password. The host platform reaches the same
// conclusion by checking `req.body.mfaCode ? next() : verifyTurnstile(...)`,
// which is the same idea keyed off an attacker-supplied field instead of a
// cryptographic one.
router.post(
  '/',
  verifyTurnstile,
  authLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const ip = clientIp(req);
    const userAgent = clientUa(req);
    const supplied = (req.body as { password?: unknown })?.password;

    const secret = requireConfiguredPassword(res);
    if (!secret) return;

    if (typeof supplied !== 'string' || supplied.length === 0) {
      res.status(400).json({
        success: false,
        error: { message: 'Password is required', code: 'PASSWORD_REQUIRED' },
      });
      return;
    }

    // Applied BEFORE the comparison, so the delay cannot be used as an oracle
    // to distinguish a wrong password from a right one by timing.
    await applyProgressiveDelay(ip);

    // Constant-time compare. Length is checked first because timingSafeEqual
    // throws on a length mismatch — and length alone leaks nothing useful here.
    const a = Buffer.from(supplied);
    const b = Buffer.from(secret);
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);

    if (!ok) {
      await recordUnlockFailure({ ip, userAgent, reason: 'bad_password' });
      res.status(401).json({
        success: false,
        error: { message: 'Incorrect password', code: 'INVALID_PASSWORD' },
      });
      return;
    }

    if (!(await mfa.isMfaEnabled())) {
      await recordUnlockSuccess({ ip, userAgent, mfa: 'not_required' });
      const { token, expiresInSeconds } = issueUnlockToken();
      res.status(200).json({ success: true, data: { token, expiresInSeconds } });
      return;
    }

    // A browser that already proved possession recently skips the prompt. The
    // token is rotated on use, so the value just presented stops working.
    const deviceToken = (req as Request & { cookies?: Record<string, string> }).cookies?.[
      TRUSTED_DEVICE_COOKIE
    ];
    const rotated = await mfa.consumeTrustedDevice(deviceToken, { userAgent, ip });
    if (rotated) {
      await recordUnlockSuccess({ ip, userAgent, mfa: 'trusted_device' });
      const { token, expiresInSeconds } = issueUnlockToken();
      res.status(200).json({
        success: true,
        data: {
          token,
          expiresInSeconds,
          trustedDevice: { token: rotated.token, expiresAt: rotated.expiresAt },
        },
      });
      return;
    }

    const pending = issueMfaPendingToken();
    res.status(200).json({
      success: true,
      data: {
        mfaRequired: true,
        pendingToken: pending.token,
        expiresInSeconds: pending.expiresInSeconds,
      },
    });
  })
);

/* ────────────────────────────────────────────────────────────────────────────
 * Step 2 — second factor
 *
 * Stays on the pre-CSRF router with step 1: the caller is not authenticated yet
 * and has nothing to bind a CSRF token to. Its own protection is the scoped,
 * 5-minute pending token, which an attacker cannot obtain without the password.
 * ──────────────────────────────────────────────────────────────────────────*/

router.post(
  '/mfa/verify',
  mfaLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const ip = clientIp(req);
    const userAgent = clientUa(req);
    const { pendingToken, code, trustDevice } = (req.body ?? {}) as {
      pendingToken?: unknown;
      code?: unknown;
      trustDevice?: unknown;
    };

    if (!verifyMfaPendingToken(pendingToken)) {
      await recordUnlockFailure({ ip, userAgent, reason: 'expired_challenge' });
      res.status(401).json({
        success: false,
        error: {
          message: 'This sign-in attempt expired. Enter the password again.',
          code: 'WA_MFA_CHALLENGE_EXPIRED',
        },
      });
      return;
    }

    if (typeof code !== 'string' || code.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: { message: 'A code is required', code: 'WA_MFA_CODE_REQUIRED' },
      });
      return;
    }

    await applyProgressiveDelay(ip);

    const factor = await mfa.verifyCode(code);
    if (!factor) {
      await recordUnlockFailure({
        ip,
        userAgent,
        reason: /^\d{6}$/.test(code.trim()) ? 'bad_mfa_code' : 'bad_recovery_code',
      });
      res.status(401).json({
        success: false,
        error: { message: 'That code is not valid', code: 'WA_MFA_INVALID_CODE' },
      });
      return;
    }

    await recordUnlockSuccess({ ip, userAgent, mfa: factor });
    const { token, expiresInSeconds } = issueUnlockToken();

    const data: Record<string, unknown> = { token, expiresInSeconds, factor };
    if (trustDevice === true) {
      const device = await mfa.trustDevice({ userAgent, ip });
      data.trustedDevice = { token: device.token, expiresAt: device.expiresAt };
    }
    res.status(200).json({ success: true, data });
  })
);

/* ────────────────────────────────────────────────────────────────────────────
 * Socket ticket
 * ──────────────────────────────────────────────────────────────────────────*/

/**
 * Mint a short-lived Socket.IO handshake ticket.
 *
 * Page JavaScript needs something to put in `handshake.auth`, and the unlock
 * cookie is httpOnly precisely so it cannot be that something. The BFF calls
 * this with the cookie and hands the browser a two-minute, socket-scoped ticket
 * instead: it opens a socket and nothing else — requireAppPassword rejects it.
 */
router.get('/socket-ticket', requireAppPassword, (_req: Request, res: Response) => {
  const { ticket, expiresInSeconds } = issueSocketTicket();
  res.status(200).json({ success: true, data: { ticket, expiresInSeconds } });
});

/* ────────────────────────────────────────────────────────────────────────────
 * MFA management — full session required, and CSRF-protected
 *
 * Exported SEPARATELY and mounted in app.ts *after* doubleCsrfProtection.
 *
 * It cannot live on the router above: that one is deliberately mounted ahead of
 * the CSRF middleware, because a locked browser has no session to bind a CSRF
 * token to and the unlock POST would 403 forever (this was a real outage — the
 * product was unusable on first boot until the mount order was fixed). Anything
 * hanging off it inherits that bypass, so a state-changing endpoint placed here
 * would be forgeable from any origin using nothing but the victim's cookie.
 *
 * The dangerous operations additionally re-assert the app password, so even a
 * CSRF bypass would not be sufficient — but defence in depth is the point, and
 * the device endpoints deliberately do not demand a password.
 * ──────────────────────────────────────────────────────────────────────────*/

export const mfaManagementRouter = Router();
const mgmt = mfaManagementRouter;
mgmt.use(requireAppPassword);

/** Re-assert the password for a state-changing MFA action. */
function assertPassword(supplied: unknown): void {
  if (!env.APP_PASSWORD) {
    throw new AppError('APP_PASSWORD is not configured', 500, 'APP_PASSWORD_UNSET');
  }
  if (typeof supplied !== 'string' || supplied.length === 0) {
    throw new AppError(
      'Confirm your app password to make this change',
      400,
      'WA_MFA_PASSWORD_REQUIRED'
    );
  }
  const a = Buffer.from(supplied);
  const b = Buffer.from(env.APP_PASSWORD);
  if (!(a.length === b.length && crypto.timingSafeEqual(a, b))) {
    throw new AppError('Incorrect password', 401, 'INVALID_PASSWORD');
  }
}

mgmt.get(
  '/status',
  asyncHandler(async (_req: Request, res: Response) => {
    res.status(200).json({ success: true, data: await mfa.getMfaStatus() });
  })
);

mgmt.post(
  '/setup',
  mfaLimiter,
  audit('WA_MFA_SETUP_STARTED', 'WaMfaConfig'),
  asyncHandler(async (_req: Request, res: Response) => {
    res.status(200).json({ success: true, data: await mfa.beginEnrolment() });
  })
);

mgmt.post(
  '/enable',
  mfaLimiter,
  audit('WA_MFA_ENABLED', 'WaMfaConfig'),
  asyncHandler(async (req: Request, res: Response) => {
    const { code, password } = (req.body ?? {}) as { code?: unknown; password?: unknown };
    assertPassword(password);
    if (typeof code !== 'string') {
      throw new AppError('A code is required', 400, 'WA_MFA_CODE_REQUIRED');
    }
    const data = await mfa.confirmEnrolment(code);
    res.status(200).json({ success: true, data });
  })
);

mgmt.post(
  '/disable',
  mfaLimiter,
  audit('WA_MFA_DISABLED', 'WaMfaConfig'),
  asyncHandler(async (req: Request, res: Response) => {
    const { code, password } = (req.body ?? {}) as { code?: unknown; password?: unknown };
    assertPassword(password);
    // Both factors to remove a factor — otherwise a leaked password alone
    // could strip MFA and re-open the console to one factor.
    if (typeof code !== 'string' || !(await mfa.verifyCode(code))) {
      throw new AppError('That code is not valid', 401, 'WA_MFA_INVALID_CODE');
    }
    await mfa.disableMfa();
    res.status(200).json({ success: true, data: { enabled: false } });
  })
);

mgmt.post(
  '/recovery-codes',
  mfaLimiter,
  audit('WA_MFA_RECOVERY_CODES_REGENERATED', 'WaMfaConfig'),
  asyncHandler(async (req: Request, res: Response) => {
    const { code, password } = (req.body ?? {}) as { code?: unknown; password?: unknown };
    assertPassword(password);
    if (typeof code !== 'string' || !(await mfa.verifyCode(code))) {
      throw new AppError('That code is not valid', 401, 'WA_MFA_INVALID_CODE');
    }
    const data = await mfa.regenerateRecoveryCodes();
    res.status(200).json({ success: true, data });
  })
);

mgmt.post(
  '/rotate-epoch',
  mfaLimiter,
  audit('WA_MFA_EPOCH_ROTATED', 'WaMfaConfig'),
  asyncHandler(async (req: Request, res: Response) => {
    assertPassword((req.body as { password?: unknown })?.password);
    const data = await mfa.rotateEpoch();
    res.status(200).json({ success: true, data });
  })
);

mgmt.get(
  '/devices',
  asyncHandler(async (_req: Request, res: Response) => {
    res.status(200).json({ success: true, data: await mfa.listTrustedDevices() });
  })
);

mgmt.delete(
  '/devices/:id',
  audit('WA_MFA_DEVICE_REVOKED', 'WaTrustedDevice'),
  asyncHandler(async (req: Request, res: Response) => {
    // Express 5 types params as string | string[]; a single :id is always a string.
    await mfa.revokeTrustedDevice(String(req.params.id));
    res.status(200).json({ success: true, data: { revoked: true } });
  })
);

mgmt.post(
  '/devices/revoke-all',
  audit('WA_MFA_DEVICES_REVOKED_ALL', 'WaTrustedDevice'),
  asyncHandler(async (_req: Request, res: Response) => {
    res.status(200).json({ success: true, data: await mfa.revokeAllTrustedDevices() });
  })
);

/**
 * Echo how this process resolved the caller's address.
 *
 * `trust proxy` depth decides what `req.ip` is, and therefore what the per-IP
 * rate limiter buckets on — get it wrong and either every operator shares one
 * bucket (because they all arrive via the BFF's egress IP) or a client can
 * spoof its own address. Hit this once after the first deploy and confirm `ip`
 * is your real address.
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
