import crypto from 'crypto';
import { env } from '../config/env';
import logger from '../config/logger';

// Google Analytics 4 Measurement Protocol
// https://developers.google.com/analytics/devguides/collection/protocol/ga4

interface AnalyticsEvent {
  name: string;
  params?: Record<string, string | number | boolean>;
}

/** Generate a deterministic GA4 client_id from a userId */
export const getClientId = (userId: string): string => {
  return crypto.createHash('sha256').update(userId).digest('hex').slice(0, 36);
};

export const trackEvent = async (clientId: string, event: AnalyticsEvent) => {
  const measurementId = env.GA_MEASUREMENT_ID;
  const apiSecret = env.GA_API_SECRET;

  if (!measurementId || !apiSecret) {
    // logger.warn('Google Analytics credentials missing - Event not tracked');
    return;
  }

  try {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const response = await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`,
      {
        method: 'POST',
        body: JSON.stringify({
          client_id: clientId,
          events: [event],
        }),
      }
    );

    if (!response.ok) {
      logger.error(`GA4 Event Failed: ${response.statusText}`);
    }
  } catch (error) {
    logger.error('GA4 Event Error:', error);
  }
};
