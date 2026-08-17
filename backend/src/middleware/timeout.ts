import type { Request, Response, NextFunction } from 'express';
import { AppError } from './error';

/**
 * Resolves the budget for one request. Return 0 (or a negative number) to give
 * the request NO deadline — see the media note in `requestTimeout`.
 */
export type TimeoutResolver = (req: Request) => number;

/**
 * Request timeout middleware
 * Sends 408 if a request exceeds the configured timeout duration.
 *
 * @param ms - Timeout in milliseconds (default: 30000 = 30s), or a function of
 *   the request when different routes deserve different budgets. A flat 30s was
 *   applied to every route including media upload/download, where the duration
 *   is set by the file size and the operator's uplink rather than by us: a large
 *   attachment 408'd at 30s while the Graph upload behind it carried on and
 *   delivered the message, so the operator retried a send that had in fact
 *   succeeded.
 */
export const requestTimeout = (ms: number | TimeoutResolver = 30000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const budget = typeof ms === 'function' ? ms(req) : ms;
    if (!budget || budget <= 0) return next();

    const timer = setTimeout(() => {
      if (!res.headersSent) {
        next(new AppError(`Request timed out after ${budget / 1000}s`, 408, 'REQUEST_TIMEOUT'));
      }
    }, budget);

    // Clear timeout when response finishes
    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));

    next();
  };
};

export default requestTimeout;
