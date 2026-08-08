import { messaging } from '../config/firebase';
import logger from '../config/logger';
import { isFeatureEnabled } from '../config/feature-flags';

interface FcmNotificationData {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
}

export const sendFcmNotification = async (data: FcmNotificationData): Promise<any> => {
  if (!(await isFeatureEnabled('enableFCM'))) {
    logger.debug('FCM disabled via feature flag — skipping');
    return { successCount: 0, failureCount: data.tokens.length };
  }

  if (!messaging) {
    logger.warn('Firebase messaging not initialized - FCM notification skipped');
    return { successCount: 0, failureCount: data.tokens.length };
  }

  try {
    const message: any = {
      notification: {
        title: data.title,
        body: data.body,
        ...(data.imageUrl ? { image: data.imageUrl } : {}),
      },
      data: data.data || {},
      tokens: data.tokens,
    };

    const response = await messaging.sendEachForMulticast(message);

    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          logger.warn(`FCM send failed for token index ${idx}: ${resp.error?.message}`);
        }
      });
    }

    logger.info(`FCM sent: ${response.successCount} success, ${response.failureCount} failed`);
    return response;
  } catch (error) {
    logger.error('FCM send error:', error);
    throw error;
  }
};
