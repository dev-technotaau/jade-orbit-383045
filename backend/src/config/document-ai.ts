import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import { env } from './env';
import logger from './logger';

let documentAIClient: DocumentProcessorServiceClient | null = null;

try {
  if (env.GOOGLE_CLOUD_PROJECT_ID && env.FIREBASE_SERVICE_ACCOUNT && env.DOCUMENT_AI_PROCESSOR_ID) {
    const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);

    documentAIClient = new DocumentProcessorServiceClient({
      credentials: {
        client_email: serviceAccount.client_email,
        private_key: serviceAccount.private_key,
      },
      projectId: env.GOOGLE_CLOUD_PROJECT_ID,
    });

    logger.info('📄 Google Document AI initialized');
  } else if (env.GOOGLE_CLOUD_PROJECT_ID && env.FIREBASE_SERVICE_ACCOUNT) {
    logger.warn('⚠️ DOCUMENT_AI_PROCESSOR_ID missing — Document AI disabled');
  } else {
    logger.warn('⚠️ Google Cloud credentials missing — Document AI disabled');
  }
} catch (error) {
  logger.error('❌ Document AI initialization failed:', error);
}

export { documentAIClient };
