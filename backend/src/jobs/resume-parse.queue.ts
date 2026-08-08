import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';

export const RESUME_PARSE_QUEUE_NAME = 'resume-parse';

export const resumeParseQueue = new Queue(RESUME_PARSE_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

resumeParseQueue.on('error', (err) => {
  logger.error('Resume Parse Queue Error:', err);
});

logger.info(`Resume Parse Queue initialized: ${RESUME_PARSE_QUEUE_NAME}`);
