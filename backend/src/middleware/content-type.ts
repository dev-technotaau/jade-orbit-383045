import type { Request, Response, NextFunction } from 'express';

/**
 * Enforce Content-Type header on state-changing requests.
 * POST/PUT/PATCH with a body must send application/json.
 * Skips multipart/form-data (file uploads) and urlencoded (form submissions).
 */
export const enforceContentType = () => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const method = req.method.toUpperCase();
    if (!['POST', 'PUT', 'PATCH'].includes(method)) {
      return next();
    }

    // Skip if no body expected (Content-Length: 0 or absent)
    const contentLength = req.headers['content-length'];
    if (contentLength === '0' || (!contentLength && !req.headers['transfer-encoding'])) {
      return next();
    }

    const contentType = req.headers['content-type'] || '';

    // Allow JSON, multipart (file uploads), and urlencoded (form submissions)
    if (
      contentType.includes('application/json') ||
      contentType.includes('multipart/form-data') ||
      contentType.includes('application/x-www-form-urlencoded') ||
      contentType.includes('application/csp-report')
    ) {
      return next();
    }

    res.status(415).json({
      success: false,
      error: {
        message: 'Unsupported Media Type. Content-Type must be application/json',
        code: 'UNSUPPORTED_MEDIA_TYPE',
      },
    });
  };
};
