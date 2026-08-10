import type { Request, Response, NextFunction } from 'express';
import DOMPurify from 'isomorphic-dompurify';

/**
 * Recursively sanitize strings in an object to prevent XSS.
 * Uses DOMPurify to strip ALL HTML tags (no double-encode issues).
 */
function sanitize(data: unknown): unknown {
  if (typeof data === 'string') {
    return DOMPurify.sanitize(data, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  }
  if (Array.isArray(data)) {
    return data.map(sanitize);
  }
  if (data !== null && typeof data === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      sanitized[key] = sanitize(value);
    }
    return sanitized;
  }
  return data;
}

/**
 * Paths whose bodies carry MESSAGE CONTENT, not markup.
 *
 * DOMPurify HTML-serialises what it keeps, so `<` and `>` come back as `&lt;`
 * and `&gt;`. Applied to every body globally, that quietly rewrote what
 * operators typed on its way to WhatsApp: a customer asking "is 3 < 5?" got
 * "is 3 &lt; 5?" delivered to their phone, and the same applied to campaign
 * bodies, canned replies and template variables. None of this text is ever
 * rendered as HTML — the inbox renders it as text, and Meta renders it in the
 * WhatsApp client — so sanitising it protects nothing and corrupts the product's
 * core output.
 *
 * Everything else still goes through the sanitiser.
 */
const CONTENT_PATH_PATTERNS: RegExp[] = [
  /^\/api\/v\d+\/whatsapp\/conversations(\/|$)/,
  /^\/api\/v\d+\/whatsapp\/campaigns(\/|$)/,
  /^\/api\/v\d+\/whatsapp\/templates(\/|$)/,
  /^\/api\/v\d+\/whatsapp\/canned-replies(\/|$)/,
  /^\/api\/v\d+\/whatsapp\/scheduled(\/|$)/,
  /^\/api\/v\d+\/whatsapp\/notes(\/|$)/,
  /^\/api\/v\d+\/whatsapp\/settings(\/|$)/,
];

function carriesMessageContent(path: string): boolean {
  return CONTENT_PATH_PATTERNS.some((re) => re.test(path));
}

/**
 * Express 5-compatible XSS sanitization middleware.
 *
 * Sanitizes req.body and req.query. `req.params` is NOT sanitized: this runs at
 * app level, before routing, where `req.params` is always `{}` — the branch that
 * used to be here sanitised nothing at all.
 */
export const xssSanitize = () => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const path = req.path || req.url || '';

    if (req.body && typeof req.body === 'object' && !carriesMessageContent(path)) {
      req.body = sanitize(req.body);
    }
    if (req.query && typeof req.query === 'object') {
      // Query strings are search terms and filters, never message content.
      Object.defineProperty(req, 'query', {
        value: sanitize(req.query),
        writable: true,
        configurable: true,
      });
    }
    next();
  };
};
