import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AppError } from './error';
import { env } from '../config/env';
import { asyncHandler } from '../utils/async-handler';

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

/** Default session lifetime when SESSION_MAX_AGE_SECONDS is unset: 12 hours. */
const DEFAULT_SESSION_TTL_SECONDS = 12 * 60 * 60;

/** Socket handshake tickets are deliberately tiny — the client refetches. */
const SOCKET_TICKET_TTL_SECONDS = 120;

function sessionTtlSeconds(): number {
  const raw = parseInt(env.SESSION_MAX_AGE_SECONDS || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SESSION_TTL_SECONDS;
}

/** Constant-time compare so a token cannot be probed byte by byte. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Mint a `<expiresAtMs>.<hmac>` token.
 *
 * The expiry is INSIDE the signed message, so the server enforces it. The
 * previous token was `HMAC(password, 'wa-unlock-v<epoch>')` — a constant with no
 * timestamp and no nonce, valid forever. The only lifetime control was the
 * cookie's `maxAge`, which is a hint to the browser: anyone who captured the
 * value (from a shared machine, a proxy log, a copied cURL) held a credential
 * that worked until someone thought to bump SESSION_EPOCH. The advertised "12h
 * session" was 12h of browser politeness and unlimited server-side validity.
 *
 * `scope` separates credentials that must not be interchangeable — an unlock
 * cookie and a socket handshake ticket sign different messages, so a ticket
 * handed to page JavaScript is NOT accepted by requireAppPassword.
 */
function mintToken(scope: string, ttlSeconds: number): string {
  const epoch = env.SESSION_EPOCH || '1';
  const exp = Date.now() + ttlSeconds * 1000;
  const message = `wa-${scope}-v${epoch}|${exp}`;
  const mac = crypto.createHmac('sha256', secret()).update(message).digest('hex');
  return `${exp}.${mac}`;
}

/** Verify a token minted by {@link mintToken}: shape, expiry, then signature. */
function verifyToken(scope: string, token: unknown): boolean {
  if (typeof token !== 'string') return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const expPart = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const exp = Number(expPart);
  if (!Number.isFinite(exp) || exp <= Date.now()) return false;

  const epoch = env.SESSION_EPOCH || '1';
  const expected = crypto
    .createHmac('sha256', secret())
    .update(`wa-${scope}-v${epoch}|${exp}`)
    .digest('hex');
  return safeEqual(mac, expected);
}

/**
 * Issue the value stored in the unlock cookie: a signed, expiring HMAC of the
 * password — never the password itself.
 *
 * SESSION_EPOCH is part of the signed message, so bumping it invalidates every
 * outstanding cookie and socket immediately while APP_PASSWORD stays the same.
 */
export function issueUnlockToken(): { token: string; expiresInSeconds: number } {
  const ttl = sessionTtlSeconds();
  return { token: mintToken('unlock', ttl), expiresInSeconds: ttl };
}

/** True when `token` is a currently-valid unlock token. */
export function verifyUnlockToken(token: unknown): boolean {
  return verifyToken('unlock', token);
}

/**
 * Issue a short-lived Socket.IO handshake ticket.
 *
 * The BFF used to hand the browser the unlock cookie's exact value so
 * Socket.IO could put it in `handshake.auth` — which meant page JavaScript held
 * the full session bearer credential, defeating the point of the cookie being
 * httpOnly. This ticket is scoped: it opens a socket, and `requireAppPassword`
 * rejects it. It lives two minutes; the client refetches on reconnect.
 */
export function issueSocketTicket(): { ticket: string; expiresInSeconds: number } {
  return {
    ticket: mintToken('socket', SOCKET_TICKET_TTL_SECONDS),
    expiresInSeconds: SOCKET_TICKET_TTL_SECONDS,
  };
}

/** True when `ticket` is a currently-valid socket handshake ticket. */
export function verifySocketTicket(ticket: unknown): boolean {
  return verifyToken('socket', ticket);
}

/** How long an operator has to produce their second factor. */
const MFA_PENDING_TTL_SECONDS = 5 * 60;

/**
 * Issue the half-authenticated token handed out after a correct password when
 * MFA is enabled.
 *
 * This is what makes the second factor mean something. hire_adda has no
 * intermediate state at all: it answers `{requireMfa:true}` with no token, and
 * the client re-POSTs the entire email+password alongside the code — so the
 * password crosses the wire twice per login and nothing downstream can tell a
 * session that passed TOTP from one that did not.
 *
 * A pending token proves "this caller knew the password, just now" and NOTHING
 * else. It is scoped, so `requireAppPassword` rejects it on every route: the
 * only thing it opens is the verify endpoint.
 */
export function issueMfaPendingToken(): { token: string; expiresInSeconds: number } {
  return {
    token: mintToken('mfa-pending', MFA_PENDING_TTL_SECONDS),
    expiresInSeconds: MFA_PENDING_TTL_SECONDS,
  };
}

/** True when `token` is a currently-valid MFA challenge token. */
export function verifyMfaPendingToken(token: unknown): boolean {
  return verifyToken('mfa-pending', token);
}

/**
 * Gate every operator route. Accepts either the unlock cookie or a
 * `X-App-Password` header, so scripts and webhook testers can authenticate
 * without a browser session.
 */
export const requireAppPassword = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[COOKIE_NAME];
    const header = req.header('X-App-Password');

    // A socket ticket is deliberately NOT accepted here — see issueSocketTicket.
    // A session cookie can only exist if every factor was satisfied at sign-in.
    if (verifyUnlockToken(cookie)) {
      (req as Request & { user?: typeof APP_ACTOR }).user = APP_ACTOR;
      return next();
    }

    if (header && safeEqual(header, secret())) {
      /**
       * The raw-password header is a COMPLETE MFA BYPASS unless it is gated.
       *
       * It exists so scripts and webhook testers can authenticate without a
       * browser session, and it is checked against APP_PASSWORD directly — so
       * once MFA is enabled, anyone holding the password could still reach every
       * operator route (read every conversation, message every customer, export
       * the contact list) having never presented a second factor. Turning MFA on
       * while leaving this open buys almost nothing.
       *
       * So: when MFA is on, the header alone is refused. A deployment that truly
       * needs the script path can re-open it with
       * ALLOW_PASSWORD_HEADER_WITH_MFA=true, which is an explicit, auditable
       * decision to accept one factor for API callers rather than an accident.
       */
      const { isMfaEnabled } = await import('../services/whatsapp-mfa.service');
      if ((await isMfaEnabled()) && env.ALLOW_PASSWORD_HEADER_WITH_MFA !== 'true') {
        return next(
          new AppError(
            'Two-factor authentication is enabled, so the X-App-Password header is not ' +
              'sufficient on its own. Sign in through the console, or set ' +
              'ALLOW_PASSWORD_HEADER_WITH_MFA=true to allow single-factor API access.',
            401,
            'MFA_REQUIRED'
          )
        );
      }
      (req as Request & { user?: typeof APP_ACTOR }).user = APP_ACTOR;
      return next();
    }

    next(new AppError('Locked. Provide the app password.', 401, 'LOCKED'));
  }
);

export const UNLOCK_COOKIE = COOKIE_NAME;
