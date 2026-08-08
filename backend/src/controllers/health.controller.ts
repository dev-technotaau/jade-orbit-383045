import type { Request, Response } from 'express';
import prisma from '../config/prisma';
import { redis } from '../config/redis';
import elasticClient from '../config/elasticsearch';
import { getConsumerLag } from '../utils/kafka-lag-monitor';
import {
  isBrowserRequest,
  renderHealthPage,
  renderLivenessPage,
  renderReadinessPage,
} from '../utils/pretty-page';

const startedAt = new Date().toISOString();

/**
 * Send either JSON (probe / API client) or the pretty HTML page (browser),
 * preserving the original status code in both paths.
 */
function sendDualFormat(
  req: Request,
  res: Response,
  statusCode: number,
  jsonPayload: unknown,
  htmlRenderer: () => string
): void {
  if (isBrowserRequest(req)) {
    res.status(statusCode).type('html').send(htmlRenderer());
    return;
  }
  res.status(statusCode).json(jsonPayload);
}

/**
 * Full health check — database, Redis, Elasticsearch + system metrics
 * GET /health
 */
export const checkHealth = async (req: Request, res: Response) => {
  const checks: Record<string, string> = {
    database: 'down',
    redis: 'down',
    elasticsearch: 'down',
  };

  // Check Database
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    checks.database = 'up';
  } catch {
    // Database is down
  }

  // Check Redis
  try {
    if (redis.status === 'ready') {
      checks.redis = 'up';
    }
  } catch {
    // Redis is down
  }

  // Check Elasticsearch
  try {
    const health = await elasticClient.cluster.health();
    if (health.status !== 'red') {
      checks.elasticsearch = 'up';
    }
  } catch {
    // Elasticsearch is down
  }

  const allUp = !Object.values(checks).includes('down');
  const mem = process.memoryUsage();

  const payload = {
    status: (allUp ? 'healthy' : 'degraded') as 'healthy' | 'degraded',
    checks,
    system: {
      uptime: Math.floor(process.uptime()),
      startedAt,
      memoryUsage: {
        rss: `${Math.round(mem.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)}MB`,
      },
      nodeVersion: process.version,
      pid: process.pid,
    },
    timestamp: new Date().toISOString(),
  };

  sendDualFormat(req, res, allUp ? 200 : 503, payload, () => renderHealthPage(payload));
};

/**
 * Liveness probe — is the process alive and responding?
 * GET /health/live
 */
export const checkLiveness = (req: Request, res: Response) => {
  const payload = { status: 'alive', timestamp: new Date().toISOString() };
  sendDualFormat(req, res, 200, payload, () => renderLivenessPage(payload));
};

/**
 * Readiness probe — can we serve traffic? (DB + Redis must be up)
 * GET /health/ready
 */
export const checkReadiness = async (req: Request, res: Response) => {
  let dbReady = false;
  let redisReady = false;

  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    dbReady = true;
  } catch {
    // DB not ready
  }

  try {
    redisReady = redis.status === 'ready';
  } catch {
    // Redis not ready
  }

  // Check Kafka consumer lag (non-blocking, informational)
  let kafkaInfo: {
    connected: boolean;
    lag: Record<string, number> | null;
    totalLag: number;
    healthy: boolean;
  } = {
    connected: false,
    lag: null,
    totalLag: -1,
    healthy: false,
  };
  try {
    const lag = await getConsumerLag();
    if (lag) {
      const totalLag = Object.values(lag).reduce((sum, val) => sum + val, 0);
      kafkaInfo = {
        connected: true,
        lag,
        totalLag,
        healthy: totalLag < 10000, // Healthy if lag < 10k messages
      };
    }
  } catch {
    // Kafka lag check is non-critical
  }

  const ready = dbReady && redisReady;

  const payload = {
    status: (ready ? 'ready' : 'not_ready') as 'ready' | 'not_ready',
    checks: {
      database: dbReady ? 'up' : 'down',
      redis: redisReady ? 'up' : 'down',
      kafka: kafkaInfo,
    },
    timestamp: new Date().toISOString(),
  };

  sendDualFormat(req, res, ready ? 200 : 503, payload, () => renderReadinessPage(payload));
};
