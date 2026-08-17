import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';

export const WEBHOOK_QUEUE_NAME = 'webhook-delivery';

export const webhookQueue = new Queue(WEBHOOK_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    // 8 attempts at exponential 5s => 5s, 10s, 20s … ~10.7 hours of cover.
    //
    // 3 attempts at 1s gave the subscriber roughly THREE SECONDS to be up. Any
    // deploy, restart or brief network blip on their side silently dropped the
    // event — and because the failures also counted toward auto-disable, a
    // routine subscriber deploy could kill the integration outright.
    attempts: 8,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true,
    // Bounded, not `false`. Failed jobs are worth keeping to diagnose a bad
    // run, but `false` keeps them FOREVER — in Redis, the one datastore here
    // with no retention story and the tightest memory budget. A week and a
    // thousand jobs is enough to investigate anything anyone will actually
    // investigate.
    removeOnFail: { age: 7 * 24 * 3600, count: 1000 },
  },
});

webhookQueue.on('error', (err) => {
  logger.error('Webhook Queue Error:', err);
});

logger.info(`Webhook Queue initialized: ${WEBHOOK_QUEUE_NAME}`);
