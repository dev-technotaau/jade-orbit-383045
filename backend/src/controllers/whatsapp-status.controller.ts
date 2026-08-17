import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import {
  getQueueSnapshots,
  withRedisTimeout,
  workerLeader,
  WORKER_LEADER_LOCK_KEY,
} from '../jobs/worker-leader';
import { getWebhookHealth } from '../services/whatsapp-webhook.service';

/** Who, if anyone, is running the BullMQ workers right now. */
interface LeaderState {
  /** Some instance holds the lock — workers are running somewhere. */
  held: boolean;
  /** …and it is this process. */
  isThisInstance: boolean;
  /** Seconds left on the lock; null when nobody holds it. */
  ttlSeconds: number | null;
}

/**
 * Leadership as seen from outside any one process.
 *
 * `workerLeader.isLeader` answers only for the replica that happens to serve the
 * request, so on a two-instance deployment a status panel that reached the
 * standby would report "no worker leader" — an alarming, wrong answer — while
 * the leader ran perfectly. The lock in Redis is the shared truth, and its TTL
 * doubles as evidence that whoever holds it is still renewing it.
 */
async function readLeaderState(): Promise<LeaderState> {
  // Bounded: a Redis that is down is exactly when this is being read.
  const ttl = await withRedisTimeout(redis.ttl(WORKER_LEADER_LOCK_KEY)).catch(() => -2);
  return {
    held: ttl > 0 || workerLeader.isLeader,
    isThisInstance: workerLeader.isLeader,
    ttlSeconds: ttl > 0 ? ttl : null,
  };
}

/**
 * `GET /whatsapp/system-status` — the operations view of this deployment.
 *
 * Every number here is already exported on `/metrics`, but a Prometheus to
 * scrape that is external tooling this product cannot assume: on a managed host
 * there is no scrape target at all. So the three failure modes that stop message
 * delivery WITHOUT anything erroring — the worker leader dying (nothing drains
 * the queues), a queue backing up, and the inbound webhook going silent — were
 * invisible from inside the console, which is the only place an operator looks.
 *
 * Deliberately cheap: Redis job counts, one Redis TTL, two indexed reads. No
 * Graph round trip — `GET /whatsapp/webhook-health?checkSubscription=true` is
 * the call that asks Meta, and it stays opt-in.
 */
export const getSystemStatus = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const [queues, leader, webhook, channels] = await Promise.all([
      getQueueSnapshots(),
      readLeaderState(),
      getWebhookHealth(),
      prisma.waChannel.findMany({
        where: { isActive: true },
        orderBy: [{ isDefault: 'desc' }, { displayPhone: 'asc' }],
        select: {
          id: true,
          displayPhone: true,
          displayName: true,
          isDefault: true,
          qualityRating: true,
          messagingTier: true,
          healthStatus: true,
          // "Can this number still send?" is a credential question as much as a
          // quality one — an expired token fails every send with an OAuth error
          // that otherwise surfaces only as per-message FAILED rows.
          tokenValid: true,
          tokenExpiresAt: true,
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        leader,
        queues,
        webhook,
        channels,
      },
    });
  } catch (e) {
    next(e);
  }
};
