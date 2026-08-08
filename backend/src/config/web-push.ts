import webpush from 'web-push';
import { env } from './env';
import logger from './logger';

if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT) {
  try {
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    logger.info('Web Push (VAPID) configured successfully');
  } catch (error) {
    logger.error('Failed to configure Web Push:', error);
  }
} else {
  logger.warn('Web Push (VAPID) keys missing in environment variables');
}

export default webpush;
