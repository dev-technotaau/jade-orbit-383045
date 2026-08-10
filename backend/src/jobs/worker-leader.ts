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

import { createWhatsappInboundWorker } from './whatsapp-inbound.worker';
import { createWhatsappMediaWorker } from './whatsapp-media.worker';
import { createWhatsappCampaignWorker } from './whatsapp-campaign.worker';
import { createSchedulerWorker } from './scheduler.worker';
import { createWebhookWorker } from './webhook.worker';

// Queue instances for metrics collection
import { whatsappInboundQueue } from './whatsapp-inbound.queue';
import { whatsappMediaQueue } from './whatsapp-media.queue';
import { whatsappCampaignQueue } from './whatsapp-campaign.queue';
import { schedulerQueue } from './scheduler.queue';
import { webhookQueue } from './webhook.queue';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ALL_QUEUES: Queue<any>[] = [
  whatsappInboundQueue,
  whatsappMediaQueue,
  whatsappCampaignQueue,
  schedulerQueue,
  webhookQueue,
];

const LOCK_KEY = 'wa:worker-leader';
const LOCK_TTL = 30; // seconds — auto-expires if leader crashes
const RENEW_INTERVAL = 10_000; // ms — renew every 10s (3 chances before TTL)
const MONITOR_INTERVAL = 5_000; // ms — standby checks every 5s
/**
 * Consecutive renewal failures tolerated before demoting.
 *
 * The 30s TTL against a 10s renewal deliberately gives three attempts; demoting
 * on the first one threw that away and turned a single Redis hiccup into a full
 * worker stop-start (which drains all five workers, and a campaign batch can take a
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
    this.lockValue = await acquireLock(LOCK_KEY, LOCK_TTL);
    if (this.lockValue) {
      this._isLeader = true;
      this.startWorkers();
      this.startRenewal();
      this.startMetricsCollection();
      updateService('BullMQ Workers', 'ready', `Leader — ${this.workers.length} workers`);
      return true;
    }

    // Standby mode — monitor for leader failure
    this.startMonitoring();
    updateService('BullMQ Workers', 'ready', 'Standby — monitoring');
    return false;
  }

  private startWorkers(): void {
    this.workers = [
      createWhatsappInboundWorker(),
      createWhatsappMediaWorker(),
      createWhatsappCampaignWorker(),
      createSchedulerWorker(),
      // Delivers WhatsApp domain events (message.inbound, contact.created,
      // campaign.completed, …) to subscribed CRM / Zapier endpoints. Without
      // it, webhookService.dispatch() enqueues jobs nothing ever processes.
      createWebhookWorker(),
    ];
    logger.info(`Worker leader elected — started ${this.workers.length} BullMQ workers`);
  }

  private startMetricsCollection(): void {
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

      const renewed = await renewLock(LOCK_KEY, this.lockValue!, LOCK_TTL);
      if (renewed) {
        this.renewFailures = 0;
        return;
      }

      this.renewFailures += 1;
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
      try {
        this.stopMetricsCollection();
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
      const acquired = await acquireLock(LOCK_KEY, LOCK_TTL);
      if (!acquired) return;

      this.transitioning = true;
      try {
        this.lockValue = acquired;
        this._isLeader = true;
        this.clearTimer();
        this.startWorkers();
        this.startMetricsCollection();
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
    this.stopMetricsCollection();
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
    await this.stopWorkers();
    if (this.lockValue) {
      await releaseLock(LOCK_KEY, this.lockValue);
      logger.info('Released worker leader lock');
    }
    this._isLeader = false;
  }
}

export const workerLeader = new WorkerLeaderManager();
