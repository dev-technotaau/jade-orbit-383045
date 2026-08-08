import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';
import { injectTraceContext } from '../utils/trace-propagation';

export const WHATSAPP_QUEUE_NAME = 'whatsapp-queue';

export const whatsappQueue = new Queue(WHATSAPP_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

whatsappQueue.on('error', (err) => {
  logger.error('WhatsApp Queue Error:', err);
});

logger.info(`WhatsApp Queue initialized: ${WHATSAPP_QUEUE_NAME}`);

export async function addWhatsAppJob(
  data: {
    to: string;
    templateName: string;
    params?: string[];
    languageCode?: string;
    components?: any[];
  },
  priority?: number
) {
  return whatsappQueue.add(
    'send-whatsapp',
    { ...data, _traceContext: injectTraceContext() },
    priority ? { priority } : {}
  );
}
