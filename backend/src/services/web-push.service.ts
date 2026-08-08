import webpush from '../config/web-push';
import logger from '../config/logger';

interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export const sendWebPushNotification = async (
  subscription: PushSubscriptionData,
  payload: string | Buffer | null
): Promise<any> => {
  try {
    const result = await webpush.sendNotification(subscription, payload);
    logger.info(`Web Push sent to ${subscription.endpoint.substring(0, 50)}...`);
    return result;
  } catch (error: any) {
    if (error.statusCode === 410 || error.statusCode === 404) {
      // Subscription expired or no longer valid
      logger.warn(`Web Push subscription expired: ${subscription.endpoint.substring(0, 50)}...`);
      throw error; // Let caller handle cleanup
    }
    logger.error('Web Push send error:', error);
    throw error;
  }
};
