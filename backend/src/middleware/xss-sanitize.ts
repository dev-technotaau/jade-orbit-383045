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
 * Express 5-compatible XSS sanitization middleware.
 * Sanitizes req.body, req.query, and req.params.
 * Note: req.query and req.params are read-only in Express 5, so we use Object.defineProperty.
 */
export const xssSanitize = () => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.body && typeof req.body === 'object') {
      req.body = sanitize(req.body);
    }
    if (req.query && typeof req.query === 'object') {
      Object.defineProperty(req, 'query', {
        value: sanitize(req.query),
        writable: true,
        configurable: true,
      });
    }
    if (req.params && typeof req.params === 'object') {
      Object.defineProperty(req, 'params', {
        value: sanitize(req.params),
        writable: true,
        configurable: true,
      });
    }
    next();
  };
};
