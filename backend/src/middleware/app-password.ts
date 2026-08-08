import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AppError } from './error';
import { env } from '../config/env';

/**
 * Single app-level password.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * This module replaces the entire auth stack that came from the host
 * application — users, roles, sessions, refresh tokens, OAuth, WebAuthn, MFA,
 * RBAC and PBAC. This is a single-tenant operator tool: one shared secret gates
 * the whole thing, and there is no concept of "who" beyond that.
 *
 * ── The req.user shim ──
 * 25 call sites across the WhatsApp controllers read `req.user!.id` to stamp
 * `createdBy`, `actorUserId` and `performedBy`. Rather than edit all of them —
 * and rather than make those columns nullable — this middleware sets a fixed
 * synthetic actor. The columns are plain strings with no foreign key (the User
 * relations were removed from the schema), so a constant is a valid value and
 * every existing call site keeps working untouched.
 *
 * If you later want per-operator attribution without real accounts, set
 * OPERATOR_LABEL per deployment, or let the unlock endpoint accept a name and
 * carry it in the cookie payload.
 */

const COOKIE_NAME = 'wa_unlock';

/** Fixed actor. Not a user record — nothing in the schema points at it. */
export const APP_ACTOR = {
  id: env.OPERATOR_LABEL || 'operator',
  role: 'ADMIN' as const,
};

function secret(): string {
  const s = env.APP_PASSWORD;
  if (!s) {
    // Fail closed. An unset password must never mean "everyone is allowed".
    throw new AppError('APP_PASSWORD is not configured', 500, 'APP_PASSWORD_UNSET');
  }
  return s;
}

/** Value stored in the cookie: an HMAC of the password, not the password. */
export function unlockToken(): string {
  return crypto.createHmac('sha256', secret()).update('wa-unlock-v1').digest('hex');
}

/** Constant-time compare so the token cannot be probed byte by byte. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Gate every operator route. Accepts either the unlock cookie or a
 * `X-App-Password` header, so scripts and webhook testers can authenticate
 * without a browser session.
 */
export const requireAppPassword = (req: Request, _res: Response, next: NextFunction): void => {
  const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[COOKIE_NAME];
  const header = req.header('X-App-Password');

  const ok =
    (cookie && safeEqual(cookie, unlockToken())) || (header && safeEqual(header, secret()));

  if (!ok) {
    next(new AppError('Locked. Provide the app password.', 401, 'LOCKED'));
    return;
  }

  // Shim — see the note at the top of this file.
  (req as Request & { user?: typeof APP_ACTOR }).user = APP_ACTOR;
  next();
};

export const UNLOCK_COOKIE = COOKIE_NAME;
