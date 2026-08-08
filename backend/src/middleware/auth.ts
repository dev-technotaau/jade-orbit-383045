import type { Request, Response, NextFunction } from 'express';
import type { DecodedToken } from '../utils/jwt';
import { verifyAccessToken } from '../utils/jwt';
import { AppError } from './error';
import prisma from '../config/prisma';
import logger from '../config/logger';
import { env } from '../config/env';
import redis from '../config/redis';
import { COOKIE_NAMES } from '../utils/cookie-helpers';
import { sessionService } from '../services/session.service';
import { extendOnlineTTL } from '../utils/online-users';

/**
 * Extract access token from Authorization header or httpOnly cookie.
 * Header takes precedence for backward compatibility.
 */
function extractAccessToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  return req.cookies?.[COOKIE_NAMES.ACCESS_TOKEN];
}

// Express type extension moved to src/types/express/index.d.ts

/**
 * Protect routes - require valid JWT access token
 */
export const protect = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    // Get token from header or httpOnly cookie
    const token = extractAccessToken(req);

    if (!token) {
      throw new AppError('Not authorized. Please log in.', 401);
    }

    // Verify token
    let decoded: DecodedToken;
    try {
      decoded = verifyAccessToken(token);
    } catch {
      throw new AppError('Invalid or expired token. Please log in again.', 401);
    }

    // Validate session is still active (skip for old tokens without sessionId)
    if (decoded.sessionId) {
      const sessionActive = await sessionService.isSessionActive(decoded.sessionId);
      if (!sessionActive) {
        throw new AppError('Session has been revoked. Please log in again.', 401);
      }
    }

    // Check if user still exists
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        role: true,
        isEmailVerified: true,
        isActive: true,
        isSuspended: true,
        mfaEnabled: true,
        lastActiveAt: true,
      },
    });

    if (!user) {
      throw new AppError('User no longer exists.', 401);
    }

    // Check if account is active and not suspended
    if (!user.isActive) {
      throw new AppError('Your account has been deactivated. Please contact support.', 403);
    }

    if (user.isSuspended) {
      throw new AppError('Your account has been suspended. Please contact support.', 403);
    }

    // Check session timeout
    const sessionTimeoutHours = parseInt(env.SESSION_TIMEOUT_HOURS, 10);
    if (user.lastActiveAt) {
      const hoursSinceActive = (Date.now() - user.lastActiveAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceActive > sessionTimeoutHours) {
        throw new AppError('Session expired due to inactivity. Please log in again.', 401);
      }
    }

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      mfaEnabled: user.mfaEnabled,
      sessionId: decoded.sessionId,
    };

    // Debounced lastActiveAt update (every 5 min via Redis)
    try {
      const cacheKey = `last_active:${user.id}`;
      let shouldUpdate = true;
      if (redis) {
        const cached = await redis.get(cacheKey);
        if (cached) shouldUpdate = false;
        else await redis.set(cacheKey, '1', 'EX', 300);
      }
      if (shouldUpdate) {
        prisma.user
          .update({
            where: { id: user.id },
            data: { lastActiveAt: new Date() },
          })
          .catch(() => {});
      }
      // Extend online presence TTL (reuse debounce — only on fresh updates)
      extendOnlineTTL(user.id).catch(() => {});
    } catch (error) {
      logger.debug('Last-active update failed:', (error as Error).message);
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Optional authentication - attach user if token present, continue otherwise
 */
export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractAccessToken(req);

    if (!token) {
      return next();
    }

    try {
      const decoded = verifyAccessToken(token);

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          role: true,
          isEmailVerified: true,
        },
      });

      if (user) {
        req.user = {
          id: user.id,
          email: user.email,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
        };
      }
    } catch {
      // Token invalid, continue without user
      logger.debug('Optional auth: invalid token, continuing without user');
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Require email verification - must be used after protect middleware
 */
export const requireEmailVerified = (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.user) {
    return next(new AppError('Not authorized. Please log in.', 401));
  }

  if (!req.user.isEmailVerified) {
    return next(new AppError('Please verify your email address to access this resource.', 403));
  }

  next();
};

// restrictTo has been consolidated into middleware/rbac.ts (uses Prisma Role enum for type safety)
