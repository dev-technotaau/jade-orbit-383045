import type { Request, Response, NextFunction } from 'express';
import { AppError } from './error';

/**
 * Request timeout middleware
 * Sends 408 if a request exceeds the configured timeout duration.
 *
 * @param ms - Timeout in milliseconds (default: 30000 = 30s)
 */
export const requestTimeout = (ms = 30000) => {
  return (_req: Request, res: Response, next: NextFunction) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        next(new AppError(`Request timed out after ${ms / 1000}s`, 408, 'REQUEST_TIMEOUT'));
      }
    }, ms);

    // Clear timeout when response finishes
    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));

    next();
  };
};

export default requestTimeout;
