import type { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';
import logger from '../config/logger';
import { AuditService } from '../services/audit.service';

const SENSITIVE_KEYS = [
  // Subscriber identifiers. A bulk import posts up to 5,000 rows of real names
  // and phone numbers; every one was copied verbatim into AuditLog.details and
  // then survived DPDP erasure, because erasure scrubs messages and contacts but
  // never touched the audit trail. The audit log records THAT an import happened,
  // not who was in it.
  'phone',
  'phones',
  'waid',
  'contacts',
  // WhatsApp two-step verification PIN. The channel service states it is
  // NEVER stored, and the audit snapshot of req.body was quietly making that
  // untrue for 180 days, in a table a lower role can read.
  'pin',
  'twostepp' + 'in',
  'password',
  'newpassword',
  'currentpassword',
  'confirmpassword',
  'token',
  'secret',
  'mfacode',
  'otp',
  'creditcard',
  'ssn',
  'refreshtoken',
  'accesstoken',
  // Free-text / message content. The audit log records that an action happened
  // and on which entity — never the verbatim content. This keeps WhatsApp chat
  // bodies, internal notes, CSAT comments and auto-reply/FAQ/keyword copy out of
  // AuditLog.details (the audit viewer is reachable by Role.ADMIN, which is below
  // the SUPER_ADMIN required to read the data itself) and out of DPDP-erasure
  // residue.
  'text',
  'body',
  'bodytext',
  'caption',
  'message',
  'csatcomment',
  'comment',
  'note',
  'answer',
  'question',
  'replytext',
  'welcomemessage',
  'awaymessage',
];

/**
 * Recursively redact sensitive fields from an object before logging.
 */
function redactSensitive(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return obj;
  if (Array.isArray(obj)) return obj.map(redactSensitive);
  if (typeof obj === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.includes(key.toLowerCase())) {
        redacted[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        redacted[key] = redactSensitive(value);
      } else {
        redacted[key] = value;
      }
    }
    return redacted;
  }
  return obj;
}

export interface AuditOptions {
  /**
   * Collapse repeats of the same (action, actor, entity) into a single row for
   * this many seconds.
   *
   * Only for routes the UI fetches mechanically rather than on a deliberate
   * operator action. Media is the case: every image, video, audio and document
   * bubble in a conversation issues its own GET, and the gallery grid fires one
   * per tile again, so opening a conversation with 30 photos wrote 30 rows and
   * a stale-tab reload wrote them again once the short browser cache lapsed.
   * Those rows sit in AuditLog for the full 180-day retention window and bury
   * the deliberate WA_SEND and WA_CONTACT entries the viewer exists to show.
   *
   * De-duplicating keeps the answer to "who first opened this attachment, and
   * when" — the part that is actually security-relevant — while dropping the
   * scroll noise.
   */
  dedupeTtlSec?: number;

  /**
   * Route-specific fields to merge into `details`, read from the request on the
   * way in.
   *
   * Added for the DPDP data-access and erasure routes: a regulator asking "who
   * authorised this erasure, and under what request" needs the operator's ticket
   * reference recorded next to the action, and there was nowhere to put it.
   */
  extraDetails?: (req: Request) => Record<string, unknown> | undefined;
}

/**
 * Claim the de-dupe slot for one (action, actor, entity) window.
 *
 * Returns true when this event was already recorded inside the window, i.e. the
 * caller should skip the write.
 *
 * Fails OPEN: an unreachable store means the row IS written. A duplicate audit
 * entry is noise; a missing one is a hole in the trail.
 */
async function alreadyRecorded(
  action: string,
  actor: string,
  target: string,
  ttlSec: number
): Promise<boolean> {
  // REDIS_ENABLED=false swaps in a mock whose every command resolves null, which
  // reads exactly like "another request already claimed this key" — that would
  // suppress every deduped row rather than every duplicate one, silently turning
  // the media trail off in any deployment running without Redis.
  if ((redis.status as string) === 'disabled') return false;

  try {
    const key = `audit:dedupe:${action}:${actor}:${target}`;
    return (await redis.set(key, '1', 'EX', ttlSec, 'NX')) !== 'OK';
  } catch (err) {
    logger.error('Audit dedupe store unavailable — writing the row anyway:', err);
    return false;
  }
}

/**
 * Middleware to automatically log audit events for sensitive routes.
 * Must be placed AFTER authentication middleware so `req.user` is available.
 * @param action The action name (e.g., 'UPDATE_PROFILE')
 * @param entity The entity being affected (e.g., 'User')
 * @param options Optional behaviour, e.g. `dedupeTtlSec` for high-frequency reads
 */
export const audit = (action: string, entity: string, options: AuditOptions = {}) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.user) {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      const userAgent = req.get('User-Agent');
      // `req.body` can be undefined on POSTs sent with no body / no JSON
      // Content-Type (e.g. action routes like `/templates/sync`), so guard it —
      // otherwise this middleware throws before the handler runs (500).
      const entityId = req.params.id || req.body?.id;

      // Snapshot the request NOW — handlers may mutate req.body — but do not
      // write until the response is finished, so the row can record what actually
      // happened.
      //
      // This used to log on the way IN and call next() immediately, with no status
      // at all. Mounted ahead of handlers that reject, it recorded refused actions
      // as though they had succeeded: a failed MFA enable, a 403 contact erasure
      // and a successful one were indistinguishable in the trail. For a log whose
      // whole purpose is answering "who did what", that is worse than no entry.
      // Bulk payloads are summarised, not redacted field-by-field: a 5,000-row
      // import is not useful in an audit row and key-redaction alone still leaves
      // the array shape and length of PII behind. What matters for the trail is
      // that N rows were imported, by whom, and with what consent flag.
      const rawBody: unknown = req.body;
      const bulkArray =
        rawBody && typeof rawBody === 'object'
          ? Object.entries(rawBody as Record<string, unknown>).find(
              ([, v]) => Array.isArray(v) && v.length > 20
            )
          : undefined;
      const redactedBody =
        req.method === 'GET'
          ? undefined
          : bulkArray
            ? { [bulkArray[0]]: `[${(bulkArray[1] as unknown[]).length} rows omitted]` }
            : redactSensitive(req.body);
      const extraDetails = options.extraDetails?.(req);
      const actor = req.user.id;

      res.on('finish', () => {
        const ok = res.statusCode < 400;
        // Failures are a distinct, queryable action rather than a flag buried in
        // details, so "show me refused attempts" is an index-friendly lookup.
        const resolvedAction = ok ? action : `${action}_FAILED`;

        void (async () => {
          if (options.dedupeTtlSec) {
            // Successes and failures dedupe independently (the action differs),
            // so a route that starts refusing still records that it did.
            const target = (typeof entityId === 'string' && entityId) || req.path;
            if (await alreadyRecorded(resolvedAction, actor, target, options.dedupeTtlSec)) {
              return;
            }
          }

          // A handler that resolved an alias to the canonical row id publishes it
          // on res.locals; prefer it. The DPDP routes accept a phone number where
          // the contact UUID goes — writing THAT into the trail would leave the
          // exact identifier the data subject asked us to erase sitting in
          // AuditLog, which erasure does not scrub, for the full 180-day
          // retention window. The url is rewritten for the same reason.
          const resolvedId =
            typeof res.locals.auditEntityId === 'string' ? res.locals.auditEntityId : undefined;
          const rawId = typeof entityId === 'string' ? entityId : undefined;
          const url =
            resolvedId && rawId && resolvedId !== rawId
              ? req.originalUrl
                  .split(rawId)
                  .join(resolvedId)
                  .split(encodeURIComponent(rawId))
                  .join(resolvedId)
              : req.originalUrl;

          await AuditService.log({
            action: resolvedAction,
            entity,
            entityId: resolvedId ?? rawId,
            performedBy: actor,
            details: {
              method: req.method,
              url,
              body: redactedBody,
              status: res.statusCode,
              success: ok,
              ...extraDetails,
            },
            ipAddress: Array.isArray(ip) ? ip[0] : ip,
            userAgent,
          });
        })();
      });
    }

    next();
  };
};
