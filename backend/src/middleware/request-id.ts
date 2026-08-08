import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

/**
 * Request ID middleware - adds unique ID to each request for tracing
 */
export const requestId = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Always generate a new UUID — never trust client-supplied request IDs
    req.id = uuidv4();

    // Set response header for client tracking
    res.setHeader('X-Request-ID', req.id);

    next();
  };
};

export default requestId;
