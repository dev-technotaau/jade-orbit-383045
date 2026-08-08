import type { Request, Response, NextFunction } from 'express';
import type { Role } from '@prisma/client';
import { AppError } from './error';

/**
 * Middleware to restrict access based on user roles.
 * @param allowedRoles Array of roles allowed to access the route
 */
export const restrictTo = (...allowedRoles: Role[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role as Role)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    next();
  };
};
