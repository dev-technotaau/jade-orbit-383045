import type { Request, Response, NextFunction } from 'express';
import { AuditService } from '../services/audit.service';

const SENSITIVE_KEYS = [
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

/**
 * Middleware to automatically log audit events for sensitive routes.
 * Must be placed AFTER authentication middleware so `req.user` is available.
 * @param action The action name (e.g., 'UPDATE_PROFILE')
 * @param entity The entity being affected (e.g., 'User')
 */
export const audit = (action: string, entity: string) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (req.user) {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      const userAgent = req.get('User-Agent');
      // `req.body` can be undefined on POSTs sent with no body / no JSON
      // Content-Type (e.g. action routes like `/templates/sync`), so guard it —
      // otherwise this middleware throws before the handler runs (500).
      const entityId = req.params.id || req.body?.id;

      // Fire and forget audit log (PII redacted)
      void AuditService.log({
        action,
        entity,
        entityId: typeof entityId === 'string' ? entityId : undefined,
        performedBy: req.user.id,
        details: {
          method: req.method,
          url: req.originalUrl,
          body: req.method !== 'GET' ? redactSensitive(req.body) : undefined,
        },
        ipAddress: Array.isArray(ip) ? ip[0] : ip,
        userAgent,
      });
    }

    next();
  };
};
