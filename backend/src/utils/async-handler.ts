import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wrap an async route handler so a rejected promise reaches the error
 * middleware instead of becoming an unhandled rejection.
 *
 * Express 5 forwards rejections from async handlers automatically, but only for
 * handlers it invokes directly — a handler that kicks off its own async work and
 * returns synchronously (which is what an `void (async () => {...})()` body does)
 * is outside that guarantee. This makes the intent explicit and gives the
 * codebase one place where the promise-to-`next` bridge lives, rather than
 * thirteen copies of `.catch(next)` scattered across route files.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    // eslint-disable-next-line promise/no-callback-in-promise -- this IS the bridge
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export default asyncHandler;
