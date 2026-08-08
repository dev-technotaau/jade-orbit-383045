import { BigQuery } from '@google-cloud/bigquery';
import { env } from './env';
import logger from './logger';

let bigqueryClient: BigQuery | null = null;

try {
  if (env.GOOGLE_CLOUD_PROJECT_ID && env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);

    bigqueryClient = new BigQuery({
      credentials: {
        client_email: serviceAccount.client_email,
        private_key: serviceAccount.private_key,
      },
      projectId: env.GOOGLE_CLOUD_PROJECT_ID,
      location: env.GOOGLE_CLOUD_LOCATION_ID,
    });

    logger.info('📊 Google BigQuery initialized');
  } else {
    logger.warn('⚠️ Google Cloud credentials missing - BigQuery disabled');
  }
} catch (error) {
  logger.error('❌ BigQuery initialization failed:', error);
}

export { bigqueryClient };
