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
    // Pub/sub (cross-process cache invalidation)
    publish: () => Promise.resolve(0),
    subscribe: () => Promise.resolve(0),
    unsubscribe: () => Promise.resolve(0),
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

// No shared BullMQ default job options live here, on purpose.
//
// There used to be a `bullmqDefaultJobOptions` built from four BULLMQ_* env
// vars, and nothing imported it: all seven queues state their own retry and
// retention policy inline, each with the reason written next to it (media
// retries across Meta's ~30-day availability window, auto-replies give up in
// seconds because a late reply is worse than none, webhooks cover a
// subscriber's deploy). A shared baseline was therefore overridden key for key
// by every consumer, so an operator who set BULLMQ_REMOVE_ON_FAIL and restarted
// changed nothing and was told nothing. Tune the queue, not the environment.

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

/*
 * Cross-process cache invalidation.
 *
 * Several hot paths cache a settings row in module-level state with a short TTL
 * and drop that cache in-process when the row is saved. That is correct for a
 * single process and silently wrong for every deployment that runs the API and
 * the workers separately (or more than one replica): the process that saved the
 * row is not the process that reads the cache, so the "takes effect on the very
 * next message" promise degrades to "within the TTL". These two helpers turn
 * that local flag into a fan-out every process hears.
 */

/** Handlers per channel, so one subscriber connection serves every caller. */
const channelHandlers = new Map<string, Array<(message: string) => void>>();

let subscriberClient: Redis | null = null;

/**
 * The subscriber connection, created on first use.
 *
 * A subscribed ioredis client is in subscriber mode and rejects every command
 * that is not (un)subscribe, so this cannot be the shared `redis` connection —
 * it has to be a `duplicate()`. Lazily created so a process that never
 * subscribes never opens a second connection.
 */
const getSubscriber = (): Redis => {
  if (subscriberClient) return subscriberClient;

  const sub = redis.duplicate();
  sub.on('error', (err: Error) => {
    logger.error(`❌ Redis subscriber error: ${err.message}`);
  });
  sub.on('message', (channel: string, message: string) => {
    for (const handler of channelHandlers.get(channel) ?? []) {
      try {
        handler(message);
      } catch (err) {
        // A throwing handler must not take down the subscriber connection and
        // with it every other channel's invalidation.
        logger.warn(`Redis handler for ${channel} threw: ${(err as Error).message}`);
      }
    }
  });
  subscriberClient = sub;
  return sub;
};

/**
 * Tell every process (including this one) that `channel` fired.
 *
 * Best-effort by design: this is a cache hint, and a Redis blip must not fail
 * the write that triggered it. The worst case is the TTL behaviour we had
 * before the fan-out existed.
 */
export const publishAppEvent = (channel: string, message = ''): void => {
  if (!isRedisEnabled) return;
  try {
    void redis.publish(channel, message).catch((err: Error) => {
      logger.warn(`Redis publish to ${channel} failed: ${err.message}`);
    });
  } catch (err) {
    logger.warn(`Redis publish to ${channel} failed: ${(err as Error).message}`);
  }
};

/**
 * Run `handler` whenever any process publishes to `channel`.
 *
 * Safe to call repeatedly; the SUBSCRIBE itself only happens for the first
 * handler on a channel. A no-op when Redis is disabled, where there is only one
 * process and the in-process invalidation already covers it.
 */
export const subscribeAppEvent = (channel: string, handler: (message: string) => void): void => {
  if (!isRedisEnabled) return;

  const existing = channelHandlers.get(channel);
  if (existing) {
    existing.push(handler);
    return;
  }

  // Connection first: if duplicating fails, the caller sees it and no stale
  // registration is left behind to make a later retry think it is subscribed.
  const sub = getSubscriber();
  channelHandlers.set(channel, [handler]);

  void sub.subscribe(channel).catch((err: Error) => {
    logger.warn(`Redis subscribe to ${channel} failed: ${err.message}`);
  });
};

export default redis;
