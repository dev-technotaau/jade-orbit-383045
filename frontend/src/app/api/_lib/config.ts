/**
 * BFF configuration.
 *
 * Replaces `app/api/auth/_lib/config.ts`, which carried access/refresh/session/
 * remember-me cookie names and their per-cookie options for the JWT flow. There
 * is one cookie now.
 */

/** Backend base URL, server-side only — never exposed to the browser. */
export const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || 'http://localhost:5000/api/v1';

/**
 * Shared secret proving a request came from our own BFF rather than a browser.
 * The backend uses it to bypass CSRF for proxied calls.
 */
export const BFF_SECRET = process.env.BFF_SECRET;

/** The single cookie: an HMAC of the app password, set by /api/unlock. */
export const UNLOCK_COOKIE = 'wa_unlock';
