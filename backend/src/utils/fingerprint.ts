/**
 * Anonymous-submission fingerprinting.
 *
 * Used for the company-review surface where guests can submit one
 * review per company. We hash IP + UA + day-bucket + companyId so:
 *   - Same user reposting same day → unique-index conflict → blocked.
 *   - Different day → fresh hash → allowed (intentional — IP rotation
 *     defeats permanent bans, but we still rate-limit at the IP layer).
 *   - Different company → fresh hash → allowed.
 *
 * SHA-256 keeps the hash opaque — super-admin moderation can see the
 * hash for fraud investigation but cannot reverse it to identity.
 */
import { createHash } from 'crypto';
import type { Request } from 'express';

/**
 * Extract the most likely client IP from the request, honouring the
 * `trust proxy` config (req.ip resolves to the rightmost X-Forwarded-For
 * entry when proxied).
 */
export function clientIp(req: Request): string {
  // express's req.ip is the most reliable when trust-proxy is configured.
  const direct = (req.ip || '').trim();
  if (direct) return direct;
  // Fallbacks for environments where trust-proxy isn't set up.
  const xff = (req.headers['x-forwarded-for'] || '').toString();
  if (xff) return xff.split(',')[0].trim();
  return req.socket?.remoteAddress || '0.0.0.0';
}

export function clientUserAgent(req: Request): string {
  return (req.headers['user-agent'] || '').toString().slice(0, 512);
}

/**
 * Compute the per-company fingerprint hash for a guest review submission
 * or a guest helpful-vote. Day-bucket = UTC YYYY-MM-DD.
 */
export function reviewFingerprint(req: Request, scope: string): string {
  const ip = clientIp(req);
  const ua = clientUserAgent(req);
  const day = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD
  return createHash('sha256').update(`${ip}|${ua}|${day}|${scope}`).digest('hex');
}

/**
 * Vote-time fingerprint — DOES NOT include a day bucket so a vote
 * persists across days (you can't undo a helpful vote tomorrow).
 */
export function voteFingerprint(req: Request, reviewId: string): string {
  const ip = clientIp(req);
  const ua = clientUserAgent(req);
  return createHash('sha256').update(`${ip}|${ua}|vote|${reviewId}`).digest('hex');
}
