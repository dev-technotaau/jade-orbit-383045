import type { Request, Response, NextFunction } from 'express';
import { auth } from '../config/firebase';
import prisma from '../config/prisma';
import { AppError } from '../middleware/error';
import { generateTokens } from '../services/auth.service';

import {} from '../kafka/producer';
import { publishEvent } from '../kafka/producer';
import { KafkaTopics } from '../kafka/topics';
import { trackEvent, getClientId } from '../services/analytics.service';
import { setTokenCookies } from '../utils/cookie-helpers';
import logger from '../config/logger';
import { Role } from '@prisma/client';

const getClientInfo = (req: Request) => ({
  userAgent: req.headers['user-agent'],
  ipAddress: req.ip || req.socket.remoteAddress,
});

/**
 * POST /api/v1/auth/firebase-login
 * Accepts a Firebase ID token, verifies it, finds or creates the user, and returns JWT tokens.
 */
export const firebaseLogin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { idToken, role } = req.body;

    if (!idToken) {
      throw new AppError('Firebase ID token is required', 400);
    }

    if (!auth) {
      throw new AppError('Firebase Auth is not configured', 503);
    }

    // Verify the Firebase ID token
    const decodedToken = await auth.verifyIdToken(idToken);

    if (!decodedToken.email) {
      throw new AppError('Firebase account must have an email address', 400);
    }

    const { userAgent, ipAddress } = getClientInfo(req);

    // Find existing user or create a new one
    let user = await prisma.user.findUnique({
      where: { email: decodedToken.email },
      include: { companyProfile: { select: { logo: true, coverImage: true, companyName: true } } },
    });

    let isNewUser = false;

    if (!user) {
      // Create new user from Firebase profile
      const userRole = role === 'EMPLOYER' ? Role.EMPLOYER : Role.CANDIDATE;

      user = await prisma.user.create({
        data: {
          email: decodedToken.email,
          firstName: decodedToken.name?.split(' ')[0] || null,
          lastName: decodedToken.name?.split(' ').slice(1).join(' ') || null,
          avatar: decodedToken.picture || null,
          role: userRole,
          isEmailVerified: decodedToken.email_verified || false,
          googleId: decodedToken.uid,
        },
        include: {
          companyProfile: { select: { logo: true, coverImage: true, companyName: true } },
        },
      });

      isNewUser = true;
      logger.info(`New user created via Firebase Auth: ${user.email}`);

      publishEvent(KafkaTopics.USER_REGISTERED, user.id, {
        userId: user.id,
        email: user.email,
        role: user.role,
        method: 'firebase',
      });
      trackEvent(getClientId(user.id), {
        name: 'sign_up',
        params: { method: 'firebase', role: user.role },
      }).catch(() => {});
    } else {
      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: {
          lastLoginAt: new Date(),
          lastLoginIp: ipAddress,
          loginAttempts: 0,
          lockUntil: null,
        },
      });

      publishEvent(KafkaTopics.USER_LOGIN, user.id, {
        userId: user.id,
        email: user.email,
        method: 'firebase',
      });
      trackEvent(getClientId(user.id), { name: 'login', params: { method: 'firebase' } }).catch(
        () => {}
      );
    }

    // Generate JWT tokens (session created inside generateTokens)
    const tokens = await generateTokens(user, userAgent, ipAddress);

    // Set httpOnly cookies
    setTokenCookies(res, tokens.accessToken, tokens.refreshToken, true, tokens.sessionId);

    res.status(200).json({
      status: 'success',
      message: isNewUser ? 'Account created and logged in via Firebase' : 'Logged in via Firebase',
      data: {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar,
          companyProfile: user.companyProfile,
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        sessionId: tokens.sessionId,
        isNewUser,
      },
    });
  } catch (error) {
    next(error);
  }
};
