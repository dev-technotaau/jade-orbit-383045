import type { Request, Response, NextFunction } from 'express';
import { auth } from '../config/firebase';
import logger from '../config/logger';
import prisma from '../config/prisma';

export const verifyFirebaseToken = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    if (!auth) {
      throw new Error('Firebase Auth not initialized');
    }

    const decodedToken = await auth.verifyIdToken(token);

    // Find user in DB by email
    if (decodedToken.email) {
      const user = await prisma.user.findUnique({
        where: { email: decodedToken.email },
      });

      if (user) {
        // Attach full DB user (including role) to req
        req.user = user;
      } else {
        logger.warn(`User authenticated with Firebase (${decodedToken.email}) but not found in DB`);
      }
    }

    return next();
  } catch (error) {
    logger.error('Firebase Token Verification Failed:', error);
    return res.status(401).json({ message: 'Unauthorized: Invalid token' });
  }
};
