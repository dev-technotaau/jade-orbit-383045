import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';
import { injectTraceContext } from '../utils/trace-propagation';

export const GEOCODING_QUEUE_NAME = 'geocoding-queue';

export interface GeocodingJobData {
  entityType: 'candidate' | 'job' | 'company';
  entityId: string;
  address: string;
  _traceContext?: Record<string, string>;
}

export const geocodingQueue = new Queue<GeocodingJobData>(GEOCODING_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

geocodingQueue.on('error', (err) => {
  logger.error('Geocoding Queue Error:', err);
});

export const addGeocodingJob = async (data: GeocodingJobData) => {
  return geocodingQueue.add(
    'geocode',
    { ...data, _traceContext: injectTraceContext() },
    {
      // Deduplicate: if same entity already queued, skip
      jobId: `geocode-${data.entityType}-${data.entityId}`,
    }
  );
};

logger.info(`Geocoding Queue initialized: ${GEOCODING_QUEUE_NAME}`);
