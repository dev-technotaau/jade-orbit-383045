import crypto from 'crypto';
import { env } from '../config/env';

/**
 * Stateless, tamper-proof tokens for the public email tracking + unsubscribe
 * endpoints (open pixel, click redirect, one-click unsubscribe). Signed with
 * HMAC-SHA256 so a token can't be forged into an open-redirect or a spoofed
 * unsubscribe. Falls back to JWT_SECRET when EMAIL_UNSUBSCRIBE_SECRET is unset
 * so the system degrades gracefully before the dedicated secret is sealed.
 */
const SECRET = env.EMAIL_UNSUBSCRIBE_SECRET || env.JWT_SECRET;

const b64url = (buf: Buffer | string): string => Buffer.from(buf).toString('base64url');

/** Sign a payload → `payloadB64.sigB64` (URL-safe, self-verifying). */
export function signToken(payload: Record<string, unknown>): string {
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

/** Verify + decode a signed token. Returns null on tamper / malformed input. */
export function verifyToken<T = Record<string, unknown>>(token: string): T | null {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

/** Random opaque per-recipient tracking key (stored on EmailCampaignRecipient). */
export function randomTrackingToken(): string {
  return crypto.randomBytes(18).toString('base64url');
}

// ---- Public tracking URL builders ----

const TRACKING_BASE = (env.EMAIL_TRACKING_BASE_URL || 'https://api.hireadda.in').replace(
  /\/+$/,
  ''
);

/** WAF/CSRF-exempt public prefix (mirrors the WhatsApp webhook exemption). */
export const EMAIL_WEBHOOK_PREFIX = `${TRACKING_BASE}/api/v1/webhooks/email`;

/** Open-tracking pixel URL for a recipient's opaque token. */
export function openPixelUrl(trackingToken: string): string {
  return `${EMAIL_WEBHOOK_PREFIX}/o/${encodeURIComponent(trackingToken)}`;
}

/** Click-tracking redirect URL — signs the target so it can't be tampered. */
export function clickUrl(payload: { r: string; c?: string | null; u: string }): string {
  return `${EMAIL_WEBHOOK_PREFIX}/c/${signToken(payload)}`;
}

/** One-click / landing unsubscribe URL (RFC 8058). */
export function unsubscribeUrl(payload: {
  e: string;
  r?: string | null;
  c?: string | null;
}): string {
  return `${EMAIL_WEBHOOK_PREFIX}/u/${signToken(payload)}`;
}

/** Public preference-center URL (manage subscription / resubscribe). */
export function preferencesUrl(payload: {
  e: string;
  r?: string | null;
  c?: string | null;
}): string {
  return `${EMAIL_WEBHOOK_PREFIX}/preferences/${signToken(payload)}`;
}

/** Double-opt-in confirmation URL. */
export function confirmUrl(payload: { e: string }): string {
  return `${EMAIL_WEBHOOK_PREFIX}/confirm/${signToken({ ...payload, a: 'confirm' })}`;
}

/**
 * One-click unsubscribe URL for a NOTIFICATION digest (not a campaign).
 *
 * Deliberately a separate path (`/n/u/`) and a separate payload shape from
 * `unsubscribeUrl` above: campaign unsubscribes flip an `EmailContact` to
 * UNSUBSCRIBED, which is the wrong outcome here. A candidate turning off
 * "Profile views" must not lose application-status mail, and must not be
 * removed from a marketing contact list they were never on.
 *
 * `u` = userId. `k` = digest category; omit it to mean "all digests off".
 */
export function notificationUnsubscribeUrl(payload: { u: string; k?: string }): string {
  return `${EMAIL_WEBHOOK_PREFIX}/n/u/${signToken(payload)}`;
}
