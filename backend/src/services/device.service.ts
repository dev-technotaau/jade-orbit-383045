import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';
import logger from '../config/logger';

class DeviceService {
  /**
   * Register FCM device token
   */
  async registerFcmToken(userId: string, token: string, platform?: string, deviceName?: string) {
    const deviceToken = await prisma.deviceToken.upsert({
      where: { token },
      create: {
        userId,
        token,
        platform,
        deviceName,
      },
      update: {
        userId, // Re-assign to current user if token was previously registered by another
        platform,
        deviceName,
        updatedAt: new Date(),
      },
    });

    logger.info(`FCM token registered for user ${userId}`);
    return deviceToken;
  }

  /**
   * Remove FCM device token
   */
  async removeFcmToken(userId: string, tokenId: string): Promise<void> {
    const token = await prisma.deviceToken.findFirst({
      where: { id: tokenId, userId },
    });

    if (!token) {
      throw new AppError('Device token not found', 404);
    }

    await prisma.deviceToken.delete({ where: { id: tokenId } });
    logger.info(`FCM token removed for user ${userId}`);
  }

  /**
   * Get user's FCM tokens
   */
  async getUserFcmTokens(userId: string) {
    return prisma.deviceToken.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Register web push subscription
   */
  async registerPushSubscription(
    userId: string,
    endpoint: string,
    p256dh: string,
    auth: string,
    userAgent?: string
  ) {
    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        userId,
        endpoint,
        p256dh,
        auth,
        userAgent,
      },
      update: {
        userId,
        p256dh,
        auth,
        userAgent,
      },
    });

    logger.info(`Push subscription registered for user ${userId}`);
    return subscription;
  }

  /**
   * Remove web push subscription
   */
  async removePushSubscription(userId: string, subscriptionId: string): Promise<void> {
    const sub = await prisma.pushSubscription.findFirst({
      where: { id: subscriptionId, userId },
    });

    if (!sub) {
      throw new AppError('Push subscription not found', 404);
    }

    await prisma.pushSubscription.delete({ where: { id: subscriptionId } });
    logger.info(`Push subscription removed for user ${userId}`);
  }

  /**
   * Remove push subscription by endpoint (for expired subscriptions)
   */
  async removePushSubscriptionByEndpoint(endpoint: string): Promise<void> {
    await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  }
}

export const deviceService = new DeviceService();
