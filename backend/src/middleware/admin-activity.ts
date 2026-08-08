import type { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import logger from '../config/logger';

/**
 * Passive activity capture for every admin request.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Answers "who is doing what, right now" for the control centre's live
 * feed, and gives the conflict-detection UI something to reason about when
 * two admins converge on the same record.
 *
 * ── Why not just use AuditLog? ─────────────────────────────────────────
 * AuditLog is a curated compliance record: opt-in per route, retains
 * redacted request bodies, and is meant to be read months later. This is
 * the opposite — automatic on every admin route, stores NO request body at
 * all (only method, route pattern, status, duration), and is expected to be
 * high-volume and short-lived. Merging them would either drown the audit
 * trail or force body retention onto every call.
 *
 * ── Route pattern, not URL ─────────────────────────────────────────────
 * We record `/api/v1/super-admin/users/:id`, never the concrete id-bearing
 * URL. Two reasons: grouping by route is what makes the feed readable, and
 * raw URLs leak identifiers into a table that is deliberately not
 * access-controlled as tightly as the records themselves. The affected id
 * is captured separately as `entityId`.
 *
 * Writes are fire-and-forget on the response lifecycle — activity logging
 * must never add latency to, or fail, the request it observes.
 */

/**
 * Route PATTERN for grouping.
 *
 * `baseUrl` is captured at REQUEST time and passed in. By the time the
 * response finishes, a request rejected by middleware — a 403 from
 * `requirePermission`, a 409, a 400 — may have lost its mount context, so
 * this recorded a truncated `/users/:id/suspend` instead of the full
 * `/api/v1/super-admin/users/:id/suspend`. Failures therefore grouped
 * separately from the successes of the very same route, which is the
 * comparison the feed exists to support.
 */
function routePattern(req: Request, baseUrl: string): string {
  const path = (req.route as { path?: string } | undefined)?.path;
  if (path && path !== '/') return `${baseUrl}${path}`;
  if (path === '/') return baseUrl || '/';
  // No handler matched, or middleware short-circuited before routing —
  // strip ids so the pattern stays groupable.
  return (req.originalUrl.split('?')[0] || '/').replace(
    /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    '/:id'
  );
}

/** Coarse bucket for the per-domain filter: `email.campaigns.send` → `email`. */
function domainOf(permissionKey: string | undefined): string | null {
  if (!permissionKey) return null;
  const dot = permissionKey.indexOf('.');
  return dot === -1 ? permissionKey : permissionKey.slice(0, dot);
}

/**
 * Best-effort entity id. Covers the overwhelmingly common `/:id` shape plus
 * the handful of routes that name their param differently.
 */
function entityIdOf(req: Request): string | undefined {
  const p = req.params as Record<string, string | undefined>;
  const candidate =
    p.id ?? p.companyId ?? p.roleId ?? p.adminId ?? p.userId ?? p.jobId ?? p.ticketId;
  if (typeof candidate === 'string' && candidate.length > 0) return candidate;

  // `req.params` is only populated once a route matched. When middleware
  // rejects first — exactly the 403/409 rows an operator reviews — it is
  // empty, so fall back to the first UUID in the URL. Without this the
  // "who touched this record" lookup missed every denied attempt.
  const fromUrl = (req.originalUrl.split('?')[0] || '').match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  );
  return fromUrl ? fromUrl[0] : undefined;
}

export const trackAdminActivity = (req: Request, res: Response, next: NextFunction): void => {
  // Captured now, not at finish: see routePattern.
  const baseUrl = req.baseUrl || '';
  const startedAt = process.hrtime.bigint();
  let recorded = false;

  const record = () => {
    if (recorded) return;
    recorded = true;

    // ── Role check happens HERE, not on the way in ──
    // Several routers (tickets, verifications, contact, reviews, feature
    // flags) apply `protect` PER-ROUTE rather than router-wide, so at
    // request time `req.user` may not be populated yet. Checking on the way
    // in therefore silently dropped every one of those domains from the
    // feed. By the time the response finishes, `protect` has run and
    // `req.user` is authoritative — which also makes this middleware safe
    // to mount anywhere in a router's chain.
    if (!req.user || (req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN')) return;

    // Reads are the bulk of the traffic and say little about intent.
    // Keeping only mutations plus explicit reads of sensitive surfaces
    // stops the table growing by millions of rows a week for no signal.
    const isMutation = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS';
    if (!isMutation) return;

    const durationMs = Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
    const ipHeader = req.headers['x-forwarded-for'];
    const ip = Array.isArray(ipHeader) ? ipHeader[0] : ipHeader || req.socket.remoteAddress;

    prisma.adminActivityLog
      .create({
        data: {
          adminId: req.user!.id,
          permissionKey: req.permissionKey ?? null,
          domain: domainOf(req.permissionKey),
          method: req.method,
          route: routePattern(req, baseUrl),
          entityId: entityIdOf(req) ?? null,
          statusCode: res.statusCode,
          durationMs,
          ipAddress: typeof ip === 'string' ? ip.split(',')[0]!.trim() : null,
          userAgent: req.get('User-Agent') ?? null,
        },
      })
      .catch((err: Error) => logger.debug('Admin activity log write failed:', err.message));
  };

  // `finish` fires on a completed response; `close` covers a client that
  // hung up mid-flight (an aborted bulk export is exactly the kind of thing
  // the feed should still show).
  res.on('finish', record);
  res.on('close', record);

  next();
};
