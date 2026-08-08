import { kafka } from '../config/kafka';
import logger from '../config/logger';

interface LagInfo {
  [topic: string]: number;
}

let cachedLag: LagInfo | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 10_000; // 10 seconds

/**
 * Get consumer lag for the hire-adda backend consumer group.
 * Caches for 10s to avoid hammering the Kafka broker.
 *
 * @returns Record of topic → total lag count, or null if unavailable
 */
export async function getConsumerLag(): Promise<LagInfo | null> {
  if (!kafka) return null;

  const now = Date.now();
  if (cachedLag && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedLag;
  }

  let admin;
  try {
    admin = kafka.admin();
    await admin.connect();

    const groupId = 'hire-adda-backend-group';
    const offsets = await admin.fetchOffsets({ groupId });

    // Get the latest offsets for each topic-partition
    const topicPartitions = offsets.map((o) => ({
      topic: o.topic,
      partitions: o.partitions.map((p) => p.partition),
    }));

    // Fetch the end offsets (watermarks) for all topic-partitions
    const lag: LagInfo = {};

    for (const tp of topicPartitions) {
      try {
        const topicOffsets = await admin.fetchTopicOffsets(tp.topic);
        let topicLag = 0;

        for (const partition of tp.partitions) {
          const consumerOffset = offsets
            .find((o) => o.topic === tp.topic)
            ?.partitions.find((p) => p.partition === partition);
          const endOffset = topicOffsets.find((o) => o.partition === partition);

          if (consumerOffset && endOffset) {
            const committed = parseInt(consumerOffset.offset, 10);
            const latest = parseInt(endOffset.high, 10);
            // If consumer hasn't committed yet, offset is -1
            if (committed >= 0) {
              topicLag += Math.max(0, latest - committed);
            }
          }
        }

        lag[tp.topic] = topicLag;
      } catch (topicError) {
        logger.debug(`Failed to fetch offsets for topic ${tp.topic}:`, topicError);
      }
    }

    cachedLag = lag;
    lastFetchTime = now;
    return lag;
  } catch (error) {
    logger.error('Failed to fetch Kafka consumer lag:', error);
    return cachedLag; // Return stale cache if available
  } finally {
    if (admin) {
      await admin.disconnect().catch(() => {});
    }
  }
}

/**
 * Get total lag across all topics.
 */
export async function getTotalLag(): Promise<number> {
  const lag = await getConsumerLag();
  if (!lag) return -1;
  return Object.values(lag).reduce((sum, val) => sum + val, 0);
}
