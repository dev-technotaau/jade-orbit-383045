import type { RedisOptions } from 'ioredis';
import Redis from 'ioredis';
import { env } from './env';
import logger from './logger';

// Check if Redis is enabled (optional for development)
const isRedisEnabled = env.REDIS_ENABLED !== 'false';

/**
 * Reconnect forever, with a bounded backoff.
 *
 * This previously returned `null` after 3 attempts. ioredis treats a non-number
 * from `retryStrategy` as "stop reconnecting" and permanently ends the client —
 * so roughly 1.2s of unavailability (200+400+600ms) killed Redis for the life of
 * the process. A managed-Redis failover on Render routinely exceeds that.
 *
 * The consequences were total and silent: `renewLock` catches the error and
 * returns false, so the worker leader demotes and stops every worker; standby
 * then polls `acquireLock`, which also catches and returns null forever. The
 * instance stayed up serving HTTP with zero inbound processing, campaign sends
 * or crons — one warn line, and no alerting.
 *
 * Capped at 5s so a long outage doesn't spin hot.
 */
const retryStrategy = (times: number): number => Math.min(times * 200, 5000);

// Build Redis configuration from environment variables
const buildRedisConfig = (): RedisOptions => {
  // If full URL is provided, use it
  if (env.REDIS_URL) {
    return {
      maxRetriesPerRequest: null, // Required for BullMQ
      lazyConnect: true, // Don't connect immediately
      retryStrategy,
    };
  }

  const config: RedisOptions = {
    host: env.REDIS_HOST,
    port: parseInt(env.REDIS_PORT, 10),
    maxRetriesPerRequest: null, // Required for BullMQ
    lazyConnect: true, // Don't connect immediately
    retryStrategy,
  };

  // Add password if provided
  if (env.REDIS_PASSWORD) {
    config.password = env.REDIS_PASSWORD;
  }

  // Enable TLS for cloud Redis (Upstash, Redis Cloud)
  if (env.REDIS_TLS === 'true') {
    config.tls = {};
  }

  return config;
};

// Create a mock Redis for when Redis is disabled.
// Covers all Redis commands used across the codebase so services
// degrade gracefully instead of throwing when REDIS_ENABLED=false.
const createMockRedis = (): Redis => {
  const noop = () => Promise.resolve(null);
  const mock = {
    // Basic key operations
    get: noop,
    set: noop,
    del: noop,
    expire: noop,
    ttl: noop,
    // Counter operations (rate-limit, DDoS protection)
    incr: () => Promise.resolve(0),
    // List operations (search history)
    lpush: () => Promise.resolve(0),
    lrange: () => Promise.resolve([]),
    ltrim: noop,
    lrem: () => Promise.resolve(0),
    // Set operations (online users)
    sadd: () => Promise.resolve(0),
    srem: () => Promise.resolve(0),
    scard: () => Promise.resolve(0),
    smembers: () => Promise.resolve([]),
    sismember: () => Promise.resolve(0),
    exists: () => Promise.resolve(0),
    // Sorted set operations (popular searches, search history, trending)
    zadd: () => Promise.resolve(0),
    zincrby: () => Promise.resolve('0'),
    zrevrange: () => Promise.resolve([]),
    zremrangebyrank: () => Promise.resolve(0),
    // Scan (cache invalidation)
    scan: () => Promise.resolve(['0', []]),
    // Connection lifecycle
    on: () => mock,
    connect: () => Promise.resolve(),
    disconnect: () => {},
    quit: () => Promise.resolve('OK'),
    duplicate: () => createMockRedis(),
    call: (..._args: unknown[]) => Promise.resolve(null),
    status: 'disabled',
  } as unknown as Redis;
  return mock;
};

const redisConfig = buildRedisConfig();

// Create Redis connection
const createConnection = (): Redis => {
  if (!isRedisEnabled) {
    logger.warn('Redis is disabled (REDIS_ENABLED=false)');
    return createMockRedis();
  }

  if (env.REDIS_URL) {
    return new Redis(env.REDIS_URL, redisConfig);
  }
  return new Redis(redisConfig);
};

// Single Redis connection shared by the entire app (caching, queues, workers).
// BullMQ Queues reuse this connection (shared: true internally).
// BullMQ Workers reuse this for commands and create ONE blocking connection
// via .duplicate(). This keeps total connections = 1 base + N workers.
export const redis = createConnection();

// BullMQ default job options from env
export const bullmqDefaultJobOptions = {
  attempts: parseInt(env.BULLMQ_DEFAULT_JOB_OPTIONS_ATTEMPTS, 10),
  backoff: {
    type: 'exponential' as const,
    delay: parseInt(env.BULLMQ_DEFAULT_JOB_OPTIONS_BACKOFF, 10),
  },
  removeOnComplete: parseInt(env.BULLMQ_REMOVE_ON_COMPLETE, 10),
  removeOnFail: parseInt(env.BULLMQ_REMOVE_ON_FAIL, 10),
};

// Event handlers (only if Redis is enabled)
if (isRedisEnabled) {
  redis.on('connect', () => {
    logger.info('✅ Redis connected');
  });

  redis.on('error', (err: Error) => {
    logger.error('❌ Redis connection error:', err.message);
  });

  redis.on('close', () => {
    logger.warn('Redis connection closed');
  });
}

export default redis;
