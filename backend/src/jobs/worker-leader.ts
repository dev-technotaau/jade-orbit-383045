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

import { createEmailWorker } from './email.worker';
import { createSmsWorker } from './sms.worker';
import { createFcmWorker } from './fcm.worker';
import { createWebPushWorker } from './web-push.worker';
import { createInAppWorker } from './in-app.worker';
import { createWhatsappWorker } from './whatsapp.worker';
import { createWhatsappInboundWorker } from './whatsapp-inbound.worker';
import { createWhatsappMediaWorker } from './whatsapp-media.worker';
import { createWhatsappCampaignWorker } from './whatsapp-campaign.worker';
import { createEmailCampaignWorker } from './email-campaign.worker';
import { createEmailBulkWorker } from './email-bulk.worker';
import { startEmailImapPoller, stopEmailImapPoller } from './email-imap.poller';
import { createWebhookWorker } from './webhook.worker';
import { createMatchingWorker } from './matching.worker';
import { createGeocodingWorker } from './geocoding.worker';
import { createResumeParseWorker } from './resume-parse.worker';
import { createEsReindexWorker } from './es-reindex.worker';
import { createOnboardingDripWorker } from './onboarding-drip.worker';
import { createImageProcessingWorker } from './image-processing.worker';
import { createSchedulerWorker } from './scheduler.worker';
import { createRazorpayWebhookWorker } from './razorpay-webhook.worker';
import { createInvoiceGenerationWorker } from './invoice-generation.worker';
import { createFraudScanWorker } from './fraud-scan.worker';
import { createBigQueryBillingWorker } from './bigquery-billing-sync.worker';
import { createPaymentStatusPollWorker } from './payment-status-poll.worker';
import { createFollowerNotifyWorker } from './follower-notify.worker';
import { createReviewAggregateWorker } from './review-aggregate.worker';
import { startKafkaConsumer, stopKafkaConsumer } from '../kafka/consumer';
import { startDlqConsumer, stopDlqConsumer } from '../kafka/dlq-consumer';

// Queue instances for metrics collection
import { emailQueue } from './email.queue';
import { smsQueue } from './sms.queue';
import { fcmQueue } from './fcm.queue';
import { webPushQueue } from './web-push.queue';
import { inAppQueue } from './in-app.queue';
import { whatsappQueue } from './whatsapp.queue';
import { whatsappInboundQueue } from './whatsapp-inbound.queue';
import { whatsappMediaQueue } from './whatsapp-media.queue';
import { whatsappCampaignQueue } from './whatsapp-campaign.queue';
import { emailCampaignQueue } from './email-campaign.queue';
import { webhookQueue } from './webhook.queue';
import { matchingQueue } from './matching.queue';
import { geocodingQueue } from './geocoding.queue';
import { resumeParseQueue } from './resume-parse.queue';
import { esReindexQueue } from './es-reindex.queue';
import { onboardingDripQueue } from './onboarding-drip.queue';
import { imageProcessingQueue } from './image-processing.queue';
import { schedulerQueue } from './scheduler.queue';
import { razorpayWebhookQueue } from './razorpay-webhook.queue';
import { invoiceGenerationQueue } from './invoice-generation.queue';
import { fraudScanQueue } from './fraud-scan.queue';
import { bigqueryBillingQueue } from './bigquery-billing-sync.queue';
import { paymentStatusPollQueue } from './payment-status-poll.queue';
import { reviewAggregateQueue } from './review-aggregate.queue';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ALL_QUEUES: Queue<any>[] = [
  emailQueue,
  smsQueue,
  fcmQueue,
  webPushQueue,
  inAppQueue,
  whatsappQueue,
  whatsappInboundQueue,
  whatsappMediaQueue,
  whatsappCampaignQueue,
  emailCampaignQueue,
  webhookQueue,
  matchingQueue,
  geocodingQueue,
  resumeParseQueue,
  esReindexQueue,
  onboardingDripQueue,
  imageProcessingQueue,
  schedulerQueue,
  razorpayWebhookQueue,
  invoiceGenerationQueue,
  fraudScanQueue,
  bigqueryBillingQueue,
  paymentStatusPollQueue,
  reviewAggregateQueue,
];

const LOCK_KEY = 'ha:worker-leader';
const LOCK_TTL = 30; // seconds — auto-expires if leader crashes
const RENEW_INTERVAL = 10_000; // ms — renew every 10s (3 chances before TTL)
const MONITOR_INTERVAL = 5_000; // ms — standby checks every 5s

/**
 * Manages BullMQ worker and Kafka consumer lifecycle via Redis-based leader election.
 *
 * In a blue-green deployment, only the leader instance creates Worker objects
 * (each creates a blocking Redis connection) and Kafka consumers (which cause
 * rebalancing storms if both instances run them). The standby instance runs in
 * API-only mode and auto-promotes if the leader dies or shuts down.
 */
class WorkerLeaderManager {
  private lockValue: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private metricsTimer: NodeJS.Timeout | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private workers: Worker<any>[] = [];
  private _isLeader = false;
  private kafkaRunning = false;

  get isLeader(): boolean {
    return this._isLeader;
  }

  /**
   * Try to become the worker leader. If successful, starts all workers + Kafka consumers.
   * If not, enters standby mode and monitors for leader failure.
   */
  async tryBecomeLeader(): Promise<boolean> {
    this.lockValue = await acquireLock(LOCK_KEY, LOCK_TTL);
    if (this.lockValue) {
      this._isLeader = true;
      this.startWorkers();
      await this.startKafka();
      this.startRenewal();
      this.startMetricsCollection();
      updateService('BullMQ Workers', 'ready', `Leader — ${this.workers.length} workers`);
      updateService(
        'Kafka Consumer',
        this.kafkaRunning ? 'ready' : 'disabled',
        this.kafkaRunning ? 'Leader — consuming' : 'Kafka not available'
      );
      return true;
    }
    // Standby mode — monitor for leader failure
    this.startMonitoring();
    updateService('BullMQ Workers', 'ready', 'Standby — monitoring');
    updateService('Kafka Consumer', 'ready', 'Standby — monitoring');
    return false;
  }

  private startWorkers(): void {
    this.workers = [
      createEmailWorker(),
      createSmsWorker(),
      createFcmWorker(),
      createWebPushWorker(),
      createInAppWorker(),
      createWhatsappWorker(),
      createWhatsappInboundWorker(),
      createWhatsappMediaWorker(),
      createWhatsappCampaignWorker(),
      createEmailCampaignWorker(),
      createEmailBulkWorker(),
      createWebhookWorker(),
      createMatchingWorker(),
      createGeocodingWorker(),
      createResumeParseWorker(),
      createEsReindexWorker(),
      createOnboardingDripWorker(),
      createImageProcessingWorker(),
      createSchedulerWorker(),
      createRazorpayWebhookWorker(),
      createInvoiceGenerationWorker(),
      createFraudScanWorker(),
      createBigQueryBillingWorker(),
      createPaymentStatusPollWorker(),
      createFollowerNotifyWorker(),
      createReviewAggregateWorker(),
    ];
    // Long-running IMAP IDLE poller (not a BullMQ Worker) — bounces + replies.
    // Best-effort and self-guarded (no-op until IMAP is configured).
    startEmailImapPoller();
    logger.info(`Worker leader elected — started ${this.workers.length} BullMQ workers`);
  }

  private async startKafka(): Promise<void> {
    try {
      await startKafkaConsumer();
      await startDlqConsumer();
      this.kafkaRunning = true;
    } catch (error) {
      logger.error('Failed to start Kafka consumers on leader:', error);
      this.kafkaRunning = false;
    }
  }

  private async stopKafka(): Promise<void> {
    if (!this.kafkaRunning) return;
    try {
      await stopDlqConsumer();
      await stopKafkaConsumer();
      this.kafkaRunning = false;
      logger.info('Stopped Kafka consumers');
    } catch (error) {
      logger.error('Error stopping Kafka consumers:', error);
    }
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
   * Periodically renew the leader lock. If renewal fails (lock stolen or Redis down),
   * transition to standby mode.
   */
  private startRenewal(): void {
    this.timer = setInterval(async () => {
      const renewed = await renewLock(LOCK_KEY, this.lockValue!, LOCK_TTL);
      if (!renewed) {
        logger.warn('Lost worker leadership (lock renewal failed)');
        this._isLeader = false;
        this.stopMetricsCollection();
        await this.stopWorkers();
        await this.stopKafka();
        updateService('BullMQ Workers', 'ready', 'Standby — monitoring');
        updateService('Kafka Consumer', 'ready', 'Standby — monitoring');
        this.startMonitoring();
      }
    }, RENEW_INTERVAL);
  }

  /**
   * Standby mode: poll periodically to check if the leader lock is available.
   * When detected, acquire it and start workers + Kafka consumers.
   */
  private startMonitoring(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(async () => {
      const acquired = await acquireLock(LOCK_KEY, LOCK_TTL);
      if (acquired) {
        this.lockValue = acquired;
        this._isLeader = true;
        if (this.timer) clearInterval(this.timer);
        this.startWorkers();
        await this.startKafka();
        this.startRenewal();
        this.startMetricsCollection();
        updateService('BullMQ Workers', 'ready', `Leader — ${this.workers.length} workers`);
        updateService(
          'Kafka Consumer',
          this.kafkaRunning ? 'ready' : 'disabled',
          this.kafkaRunning ? 'Leader — consuming' : 'Kafka not available'
        );
      }
    }, MONITOR_INTERVAL);
  }

  private async stopWorkers(): Promise<void> {
    this.stopMetricsCollection();
    await stopEmailImapPoller();
    await Promise.allSettled(this.workers.map((w) => w.close()));
    this.workers = [];
    logger.info('Stopped all BullMQ workers');
  }

  /**
   * Graceful shutdown: stop workers, Kafka consumers, and release the leader lock.
   */
  async shutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.stopWorkers();
    await this.stopKafka();
    if (this.lockValue) {
      await releaseLock(LOCK_KEY, this.lockValue);
      logger.info('Released worker leader lock');
    }
    this._isLeader = false;
  }
}

export const workerLeader = new WorkerLeaderManager();
