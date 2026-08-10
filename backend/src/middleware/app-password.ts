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

/**
 * Gate every operator route. Accepts either the unlock cookie or a
 * `X-App-Password` header, so scripts and webhook testers can authenticate
 * without a browser session.
 */
export const requireAppPassword = (req: Request, _res: Response, next: NextFunction): void => {
  const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[COOKIE_NAME];
  const header = req.header('X-App-Password');

  // A socket ticket is deliberately NOT accepted here — see issueSocketTicket.
  const ok = verifyUnlockToken(cookie) || (header && safeEqual(header, secret()));

  if (!ok) {
    next(new AppError('Locked. Provide the app password.', 401, 'LOCKED'));
    return;
  }

  // Shim — see the note at the top of this file.
  (req as Request & { user?: typeof APP_ACTOR }).user = APP_ACTOR;
  next();
};

export const UNLOCK_COOKIE = COOKIE_NAME;
