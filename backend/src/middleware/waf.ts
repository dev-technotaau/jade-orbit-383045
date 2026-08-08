import type { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';

// SQL injection patterns
const SQL_PATTERNS = [
  /(\b(UNION|SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|EXEC|EXECUTE)\b.*\b(SELECT|FROM|TABLE|INTO|WHERE|SET|DATABASE)\b)/i,
  /(\bOR\b\s+\d+\s*=\s*\d+)/i, // OR 1=1
  /(\bAND\b\s+\d+\s*=\s*\d+)/i, // AND 1=1
  /(;\s*--)/, // ; --
  /(\b(WAITFOR|BENCHMARK|SLEEP)\s*\()/i, // Time-based injection
];

// Path traversal patterns
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\//, // ../
  /\.\.\\/, // ..\
  /%2e%2e(%2f|%5c)/i, // URL-encoded ../
  /%252e%252e(%252f|%255c)/i, // Double-encoded
];

// Exploit probe paths
const BLOCKED_PATHS = [
  '/wp-admin',
  '/wp-login',
  '/wp-content',
  '/wp-includes',
  '/phpmyadmin',
  '/pma',
  '/myadmin',
  '/.env',
  '/.git',
  '/.svn',
  '/.htaccess',
  '/.htpasswd',
  '/actuator',
  '/console',
  '/admin/config',
  '/cgi-bin',
  '/xmlrpc.php',
];

// Max header sizes
const MAX_SINGLE_HEADER = 8 * 1024; // 8KB per header
const MAX_TOTAL_HEADERS = 32 * 1024; // 32KB total

/**
 * Application-level WAF middleware.
 * Blocks common attack patterns: SQL injection, path traversal, exploit probes.
 */
export const waf = () => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const url = decodeURIComponent(req.originalUrl || req.url);
    const queryString = req.originalUrl?.split('?')[1] || '';

    // Check blocked paths
    const lowerPath = req.path.toLowerCase();
    if (BLOCKED_PATHS.some((blocked) => lowerPath.startsWith(blocked))) {
      logger.warn(`WAF: Blocked exploit probe ${req.path} from ${req.ip}`);
      res.status(403).json({
        success: false,
        error: { message: 'Forbidden', code: 'WAF_BLOCKED' },
      });
      return;
    }

    // Check path traversal in URL
    if (PATH_TRAVERSAL_PATTERNS.some((pattern) => pattern.test(url))) {
      logger.warn(`WAF: Blocked path traversal in URL from ${req.ip}: ${url}`);
      res.status(403).json({
        success: false,
        error: { message: 'Forbidden', code: 'WAF_BLOCKED' },
      });
      return;
    }

    // Check SQL injection in query string
    if (
      queryString &&
      SQL_PATTERNS.some((pattern) => pattern.test(decodeURIComponent(queryString)))
    ) {
      logger.warn(`WAF: Blocked SQL injection in query from ${req.ip}`);
      res.status(403).json({
        success: false,
        error: { message: 'Forbidden', code: 'WAF_BLOCKED' },
      });
      return;
    }

    // Check oversized headers
    let totalHeaderSize = 0;
    for (const [key, value] of Object.entries(req.headers)) {
      const headerSize =
        key.length + (Array.isArray(value) ? value.join(', ').length : value?.length || 0);
      totalHeaderSize += headerSize;
      if (headerSize > MAX_SINGLE_HEADER) {
        logger.warn(`WAF: Blocked oversized header '${key}' from ${req.ip}`);
        res.status(431).json({
          success: false,
          error: { message: 'Request Header Fields Too Large', code: 'WAF_HEADER_TOO_LARGE' },
        });
        return;
      }
    }
    if (totalHeaderSize > MAX_TOTAL_HEADERS) {
      logger.warn(`WAF: Blocked oversized total headers from ${req.ip}: ${totalHeaderSize} bytes`);
      res.status(431).json({
        success: false,
        error: { message: 'Request Header Fields Too Large', code: 'WAF_HEADER_TOO_LARGE' },
      });
      return;
    }

    next();
  };
};
