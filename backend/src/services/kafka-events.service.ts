import redis from '../config/redis';

interface KafkaEventEntry {
  eventType: string;
  topic: string;
  key: string | null;
  timestamp: string;
}

const REDIS_KEY = 'kafka:event-buffer';
const MAX_BUFFER_SIZE = 1000;

// In-memory fallback when Redis is unavailable
const fallbackBuffer: KafkaEventEntry[] = [];
const FALLBACK_MAX = 100;

export const kafkaEventsService = {
  async push(entry: KafkaEventEntry): Promise<void> {
    try {
      await redis.lpush(REDIS_KEY, JSON.stringify(entry));
      await redis.ltrim(REDIS_KEY, 0, MAX_BUFFER_SIZE - 1);
    } catch {
      // Fallback to in-memory
      fallbackBuffer.push(entry);
      if (fallbackBuffer.length > FALLBACK_MAX) {
        fallbackBuffer.shift();
      }
    }
  },

  async getRecentEvents(limit: number = 20): Promise<KafkaEventEntry[]> {
    try {
      const raw = await redis.lrange(REDIS_KEY, 0, limit - 1);
      return raw.map((item: string) => JSON.parse(item) as KafkaEventEntry);
    } catch {
      // Fallback to in-memory
      return fallbackBuffer.slice(-limit).reverse();
    }
  },

  async getBufferSize(): Promise<number> {
    try {
      return await redis.llen(REDIS_KEY);
    } catch {
      return fallbackBuffer.length;
    }
  },
};
