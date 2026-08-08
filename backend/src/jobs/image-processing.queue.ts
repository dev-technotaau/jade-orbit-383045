import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import { injectTraceContext } from '../utils/trace-propagation';

export const IMAGE_PROCESSING_QUEUE_NAME = 'image-processing-queue';

export const imageProcessingQueue = new Queue(IMAGE_PROCESSING_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

export interface ImageJobData {
  entityType: 'candidate' | 'company';
  entityId: string;
  userId: string;
  imageUrl: string;
  field: 'avatar' | 'logo' | 'cover';
}

export async function addImageJob(data: ImageJobData) {
  return imageProcessingQueue.add('process-image', {
    ...data,
    _traceContext: injectTraceContext(),
  });
}
