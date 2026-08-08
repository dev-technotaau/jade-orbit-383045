import type { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import { AppError } from './error';

/**
 * Require MFA to be enabled for the current user.
 * Must be used after `protect` middleware.
 */
export const requireMfaEnabled = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      return next(new AppError('Not authorized', 401));
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { mfaEnabled: true },
    });

    if (!user?.mfaEnabled) {
      return next(
        new AppError(
          'MFA must be enabled to access this resource. Please enable two-factor authentication.',
          403,
          'MFA_REQUIRED'
        )
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Block ADMIN users from managing their own MFA (must be done by SUPER_ADMIN).
 * Must be used after `protect` middleware.
 */
export const blockAdminSelfMfa = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.user?.role === 'ADMIN') {
    return next(
      new AppError('Admin MFA must be managed by a Super Admin.', 403, 'ADMIN_MFA_RESTRICTED')
    );
  }
  next();
};
