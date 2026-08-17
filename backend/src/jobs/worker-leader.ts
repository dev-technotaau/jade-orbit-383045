import type { Queue, Worker } from 'bullmq';
import { acquireLock, releaseLock, renewLock } from '../utils/distributed-lock';
import { updateService } from '../config/service-status';
import logger from '../config/logger';
import {
  bullmqQueueWaiting,
  bullmqQueueActive,
  bullmqQueueCompleted,
  bullmqQueueFailed,
} from '../routes/metrics.routes';
import { waWorkerLeader, waWorkerLeaderRenewFailuresTotal } from '../utils/whatsapp-metrics';

import { createWhatsappInboundWorker } from './whatsapp-inbound.worker';
import { createWhatsappMediaWorker } from './whatsapp-media.worker';
import { createWhatsappAutoReplyWorker } from './whatsapp-autoreply.worker';
import { createWhatsappCampaignWorker } from './whatsapp-campaign.worker';
import { createWhatsappImportWorker } from './whatsapp-import.worker';
import { createSchedulerWorker } from './scheduler.worker';
import { createWebhookWorker } from './webhook.worker';

// Queue instances for metrics collection
import { whatsappInboundQueue } from './whatsapp-inbound.queue';
import { whatsappMediaQueue } from './whatsapp-media.queue';
import { whatsappAutoReplyQueue } from './whatsapp-autoreply.queue';
import { whatsappCampaignQueue } from './whatsapp-campaign.queue';
import { whatsappImportQueue } from './whatsapp-import.queue';
import { schedulerQueue } from './scheduler.queue';
import { webhookQueue } from './webhook.queue';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ALL_QUEUES: Queue<any>[] = [
  whatsappInboundQueue,
  whatsappMediaQueue,
  whatsappAutoReplyQueue,
  whatsappCampaignQueue,
  whatsappImportQueue,
  schedulerQueue,
  webhookQueue,
];

/**
 * The Redis key leadership is held on. Exported because it is also the only way
 * to answer "is ANY instance running the workers" from outside this process —
 * `workerLeader.isLeader` speaks for the replica that happens to be asked.
 */
export const WORKER_LEADER_LOCK_KEY = 'wa:worker-leader';
const LOCK_TTL = 30; // seconds — auto-expires if leader crashes
const RENEW_INTERVAL = 10_000; // ms — renew every 10s (3 chances before TTL)
const MONITOR_INTERVAL = 5_000; // ms — standby checks every 5s
/**
 * Consecutive renewal failures tolerated before demoting.
 *
 * The 30s TTL against a 10s renewal deliberately gives three attempts; demoting
 * on the first one threw that away and turned a single Redis hiccup into a full
 * worker stop-start (which drains every worker, and a campaign batch can take a
 * while to drain). Two failures still leaves a renewal's worth of headroom
 * before the lock actually expires and another instance can claim it.
 */
const MAX_RENEW_FAILURES = 2;

/**
 * Manages BullMQ worker lifecycle via Redis-based leader election.
 *
 * When more than one instance is running, only the leader creates Worker
 * objects — each one holds a blocking Redis connection, and duplicated workers
 * would process the same jobs twice. The standby instance serves the API only
 * and auto-promotes if the leader dies or shuts down.
 *
 * The host platform also ran Kafka consumers under this same election. Kafka is
 * gone from this module, so leadership now governs BullMQ workers alone.
 */
class WorkerLeaderManager {
  private lockValue: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private metricsTimer: NodeJS.Timeout | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private workers: Worker<any>[] = [];
  private _isLeader = false;
  /** Guards against a second demotion/promotion racing one already in flight. */
  private transitioning = false;
  private renewFailures = 0;

  get isLeader(): boolean {
    return this._isLeader;
  }

  /**
   * Try to become the worker leader. On success, starts all workers.
   * Otherwise enters standby and monitors for leader failure.
   */
  async tryBecomeLeader(): Promise<boolean> {
    // Queue depth is scraped from EVERY instance, leader or not. Reading job
    // counts needs no Worker — only the shared Redis connection — and collecting
    // them on the leader alone meant the standby served
    // `bullmq_queue_waiting`/`_failed` at prom-client's default of 0. Scraping
    // both replicas then produced alternating real-and-zero series, so a
    // queue-depth or failed-job alert either flapped or averaged itself into
    // silence — exactly the alert an operator needs when campaign sending backs
    // up. It runs for the life of the process now, not for the life of a
    // leadership term.
    this.startMetricsCollection();

    this.lockValue = await acquireLock(WORKER_LEADER_LOCK_KEY, LOCK_TTL);
    if (this.lockValue) {
      this._isLeader = true;
      waWorkerLeader.set(1);
      this.startWorkers();
      this.startRenewal();
      updateService('BullMQ Workers', 'ready', `Leader — ${this.workers.length} workers`);
      return true;
    }

    // Standby mode — monitor for leader failure
    waWorkerLeader.set(0);
    this.startMonitoring();
    updateService('BullMQ Workers', 'ready', 'Standby — monitoring');
    return false;
  }

  private startWorkers(): void {
    this.workers = [
      createWhatsappInboundWorker(),
      createWhatsappMediaWorker(),
      // Sends the welcome / away / keyword / FAQ replies for inbound messages.
      // Without it those jobs pile up and every customer who writes in out of
      // hours gets silence.
      createWhatsappAutoReplyWorker(),
      createWhatsappCampaignWorker(),
      // Runs bulk contact imports. Without it a submitted import sits at QUEUED
      // forever and the operator's progress modal never moves.
      createWhatsappImportWorker(),
      createSchedulerWorker(),
      // Delivers WhatsApp domain events (message.inbound, contact.created,
      // campaign.completed, …) to subscribed CRM / Zapier endpoints. Without
      // it, webhookService.dispatch() enqueues jobs nothing ever processes.
      createWebhookWorker(),
    ];
    logger.info(`Worker leader elected — started ${this.workers.length} BullMQ workers`);
  }

  private startMetricsCollection(): void {
    if (this.metricsTimer) return;
    this.metricsTimer = setInterval(async () => {
      for (const queue of ALL_QUEUES) {
        try {
          const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed');
          bullmqQueueWaiting.set({ queue: queue.name }, counts.waiting);
          bullmqQueueActive.set({ queue: queue.name }, counts.active);
          bullmqQueueCompleted.set({ queue: queue.name }, counts.completed);
          bullmqQueueFailed.set({ queue: queue.name }, counts.failed);
        } catch {
          // Skip — queue may be temporarily unavailable
        }
      }
    }, 30_000);
  }

  private stopMetricsCollection(): void {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
  }

  /**
   * Periodically renew the leader lock. If renewal fails (lock stolen or Redis
   * down), transition to standby mode.
   */
  private startRenewal(): void {
    this.renewFailures = 0;
    this.timer = setInterval(async () => {
      // A demotion already in progress owns the transition; renewing underneath
      // it (or starting a second one) is how two overlapping demotions used to
      // orphan a whole worker set.
      if (this.transitioning) return;

      const renewed = await renewLock(WORKER_LEADER_LOCK_KEY, this.lockValue!, LOCK_TTL);
      if (renewed) {
        this.renewFailures = 0;
        return;
      }

      this.renewFailures += 1;
      waWorkerLeaderRenewFailuresTotal.inc();
      if (this.renewFailures < MAX_RENEW_FAILURES) {
        logger.warn(
          `Leader lock renewal failed (${this.renewFailures}/${MAX_RENEW_FAILURES}) — retrying`
        );
        return;
      }

      logger.warn('Lost worker leadership (lock renewal failed)');
      this.transitioning = true;
      // Stop renewing FIRST. This interval used to keep firing throughout the
      // (potentially minutes-long) worker drain below, stacking demotions on top
      // of each other; it was only cleared inside startMonitoring, after the
      // await.
      this.clearTimer();
      this._isLeader = false;
      waWorkerLeader.set(0);
      try {
        // Queue metrics deliberately keep running through the demotion: this
        // instance is about to be the standby, and a standby that stops
        // reporting is the hole this used to leave.
        await this.stopWorkers();
        updateService('BullMQ Workers', 'ready', 'Standby — monitoring');
      } finally {
        this.transitioning = false;
        this.startMonitoring();
      }
    }, RENEW_INTERVAL);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Standby mode: poll to see whether the leader lock has become available.
   * When it has, acquire it and start the workers.
   */
  private startMonitoring(): void {
    this.clearTimer();
    this.timer = setInterval(async () => {
      if (this.transitioning || this._isLeader) return;
      const acquired = await acquireLock(WORKER_LEADER_LOCK_KEY, LOCK_TTL);
      if (!acquired) return;

      this.transitioning = true;
      try {
        this.lockValue = acquired;
        this._isLeader = true;
        waWorkerLeader.set(1);
        this.clearTimer();
        this.startWorkers();
        updateService('BullMQ Workers', 'ready', `Leader — ${this.workers.length} workers`);
      } finally {
        this.transitioning = false;
      }
      // Renewal starts last, and outside the guard, so its first tick can never
      // observe a half-built worker set.
      this.startRenewal();
    }, MONITOR_INTERVAL);
  }

  private async stopWorkers(): Promise<void> {
    // Take the list BEFORE awaiting. Clearing it afterwards would wipe any
    // worker set installed by a promotion that ran during the drain — those
    // workers would then be live but unreachable, and nothing could ever stop
    // them.
    const workers = this.workers;
    this.workers = [];
    if (workers.length === 0) return;
    await Promise.allSettled(workers.map((w) => w.close()));
    logger.info(`Stopped ${workers.length} BullMQ workers`);
  }

  /** Graceful shutdown: stop workers and release the leader lock. */
  async shutdown(): Promise<void> {
    this.transitioning = true; // no promotion may start while we are leaving
    this.clearTimer();
    // The only place metrics collection stops: the process is going away, and a
    // live interval would hold the event loop open past the drain.
    this.stopMetricsCollection();
    await this.stopWorkers();
    if (this.lockValue) {
      await releaseLock(WORKER_LEADER_LOCK_KEY, this.lockValue);
      logger.info('Released worker leader lock');
    }
    this._isLeader = false;
    waWorkerLeader.set(0);
  }
}

export const workerLeader = new WorkerLeaderManager();

/**
 * How long a status read waits on Redis before calling a queue unreachable.
 *
 * ioredis is configured with `maxRetriesPerRequest: null` (BullMQ requires it),
 * so a command issued while Redis is down queues rather than failing — the read
 * would hang until the 30s request timeout. That is the exact moment this panel
 * is being looked at, so it answers quickly and says "unreachable" instead.
 */
const SNAPSHOT_TIMEOUT_MS = 2000;

/** Reject after `ms` rather than waiting on a promise that may never settle. */
export function withRedisTimeout<T>(p: Promise<T>, ms = SNAPSHOT_TIMEOUT_MS): Promise<T> {
  // The loser of the race still settles. Without this handler, a Redis command
  // that fails AFTER the timeout has already rejected is an unhandled rejection,
  // which Node ends the process over — the status endpoint would take the API
  // down with it.
  p.catch(() => {});
  return Promise.race([
    p,
    new Promise<T>((_resolve, reject) => {
      // unref: a pending timer must never hold the process open during shutdown.
      setTimeout(() => reject(new Error('redis read timed out')), ms).unref();
    }),
  ]);
}

/** One queue's live depth, as the operations panel and the status endpoint read it. */
export interface QueueSnapshot {
  name: string;
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  /** False when Redis would not answer for this queue — the counts are then meaningless. */
  reachable: boolean;
}

/**
 * Job counts for every queue this deployment runs.
 *
 * The same numbers `startMetricsCollection` publishes to Prometheus, served
 * directly as well: a deployment with no Prometheus in front of it — the default
 * on a managed host — otherwise has no way to see a queue backing up, which is
 * one of the three ways message delivery stops without anything logging an
 * error.
 */
export async function getQueueSnapshots(): Promise<QueueSnapshot[]> {
  return Promise.all(
    ALL_QUEUES.map(async (queue): Promise<QueueSnapshot> => {
      try {
        const c = await withRedisTimeout(
          queue.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed')
        );
        return {
          name: queue.name,
          waiting: c.waiting ?? 0,
          active: c.active ?? 0,
          delayed: c.delayed ?? 0,
          completed: c.completed ?? 0,
          failed: c.failed ?? 0,
          reachable: true,
        };
      } catch {
        // Reported as unreachable rather than as zeros: a queue Redis will not
        // answer for looks exactly like an idle one, which is the reading an
        // operator must not be given while jobs are piling up.
        return {
          name: queue.name,
          waiting: 0,
          active: 0,
          delayed: 0,
          completed: 0,
          failed: 0,
          reachable: false,
        };
      }
    })
  );
}
