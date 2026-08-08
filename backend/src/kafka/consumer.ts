import { consumer, producer } from '../config/kafka';
import logger from '../config/logger';
import { ConsolidatedTopics, KafkaTopics } from './topics';
import { isFeatureEnabled } from '../config/feature-flags';
import { isProcessed, markProcessed } from '../utils/idempotency';
import { validateEvent } from './schemas';
import { withExtractedContext, SpanKind } from '../utils/trace-propagation';

const DLQ_TOPIC = 'hire-adda.dlq';

/**
 * Publish a failed message to the Dead Letter Queue topic.
 */
async function publishToDlq(
  originalTopic: string,
  partition: number,
  offset: string,
  key: string | null,
  value: string | null,
  error: Error
): Promise<void> {
  if (!producer) {
    logger.warn('Kafka producer not available - cannot publish to DLQ');
    return;
  }

  try {
    await producer.send({
      topic: DLQ_TOPIC,
      messages: [
        {
          key: key || undefined,
          value: JSON.stringify({
            originalTopic,
            partition,
            offset,
            originalValue: value,
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
          }),
        },
      ],
    });
    logger.info(`Failed message published to DLQ from ${originalTopic}[${partition}]:${offset}`);
  } catch (dlqError) {
    logger.error('Failed to publish message to DLQ:', dlqError);
  }
}

// Handler functions use dynamic imports to avoid circular dependencies

async function handleUserRegistered(data: any): Promise<void> {
  const { notificationService } = await import('../services/notification.service');
  const prisma = (await import('../config/prisma')).default;
  const user = await prisma.user.findUnique({
    where: { id: data.userId },
    select: {
      firstName: true,
      email: true,
      role: true,
      isEmailVerified: true,
      mobileNumber: true,
      whatsappNumber: true,
      isWhatsappVerified: true,
      companyProfile: { select: { companyName: true } },
    },
  });

  const channels: ('in_app' | 'fcm' | 'web_push' | 'email' | 'whatsapp')[] = [
    'in_app',
    'fcm',
    'web_push',
  ];
  let emailOptions;
  let whatsappOptions;

  if (user?.isEmailVerified && user.email) {
    channels.push('email');

    if (user.role === 'EMPLOYER' && user.companyProfile?.companyName) {
      const { onboardingWelcomeEmployer } = await import('../templates/email/onboarding');
      const tmpl = onboardingWelcomeEmployer(
        user.firstName || 'Hiring Manager',
        user.companyProfile.companyName
      );
      emailOptions = { to: user.email, subject: tmpl.subject, html: tmpl.html, text: tmpl.text };
    } else {
      const { welcomeEmail } = await import('../templates/email/auth');
      const tmpl = welcomeEmail(user.firstName || 'there');
      emailOptions = { to: user.email, subject: tmpl.subject, html: tmpl.html, text: tmpl.text };
    }
  }

  const whatsappTarget = user?.whatsappNumber || user?.mobileNumber;
  if (user?.isWhatsappVerified && whatsappTarget) {
    channels.push('whatsapp');
    const { welcomeWhatsapp } = await import('../templates/whatsapp');
    const tmpl = welcomeWhatsapp(user.firstName || 'there');
    whatsappOptions = {
      to: whatsappTarget,
      templateName: tmpl.templateName,
      components: tmpl.components,
    };
  }

  await notificationService.send({
    userId: data.userId,
    title: 'Welcome to Hire Adda!',
    message: 'Complete your profile to get started and find your perfect match.',
    type: 'INFO',
    category: 'onboarding',
    channels,
    emailOptions,
    whatsappOptions,
  });
  logger.info(`Welcome notification sent for user ${data.userId}`);

  // Schedule onboarding drip emails (+1d, +3d, +7d)
  if (user) {
    const { scheduleOnboardingDrip } = await import('../jobs/onboarding-drip.queue');
    await scheduleOnboardingDrip(data.userId, user.role).catch((err: unknown) =>
      logger.error(`Failed to schedule onboarding drip for ${data.userId}:`, err)
    );
  }
}

async function handleUserLogin(data: any): Promise<void> {
  const prisma = (await import('../config/prisma')).default;
  await prisma.user.update({
    where: { id: data.userId },
    data: { lastActiveAt: new Date() },
  });
}

async function handleJobPosted(data: any): Promise<void> {
  const { matchingQueue } = await import('../jobs/matching.queue');
  await matchingQueue.add('match-candidates', {
    jobId: data.jobId,
    companyId: data.companyId,
  });
  logger.info(`Matching queue triggered for new job ${data.jobId}`);
}

async function handleJobUpdated(data: any): Promise<void> {
  const { addReindexJob } = await import('../jobs/es-reindex.queue');
  await addReindexJob({ indexType: 'job', documentId: data.jobId, action: 'index' });
  logger.info(`Queued ES reindex for updated job ${data.jobId}`);
}

async function handleJobClosed(data: any): Promise<void> {
  const { addReindexJob } = await import('../jobs/es-reindex.queue');
  await addReindexJob({ indexType: 'job', documentId: data.jobId, action: 'delete' });
  logger.info(`Queued ES delete for closed job ${data.jobId}`);
}

async function handleApplicationSubmitted(data: any): Promise<void> {
  // Notification is already sent via notificationService.notifyNewApplication()
  // in job.service.ts (multi-channel: in_app, fcm, web_push, email).
  // This handler only logs; webhooks/BigQuery are dispatched by routeByEventType.
  logger.info(`Application submitted event processed: ${data.applicationId}`);
}

async function handleApplicationStatusChanged(data: any): Promise<void> {
  // Notification is already sent via notificationService.notifyApplicationStatusChange()
  // in job.service.ts (multi-channel: in_app, fcm, web_push, email, whatsapp).
  // This handler only logs; webhooks/BigQuery are dispatched by routeByEventType.
  logger.info(`Application status changed event processed: ${data.applicationId} → ${data.status}`);
}

async function handleProfileUpdated(data: any): Promise<void> {
  const { matchingQueue } = await import('../jobs/matching.queue');
  await matchingQueue.add('match-jobs', { userId: data.userId });
  logger.info(`Matching queue triggered for updated profile ${data.userId}`);
}

/**
 * Dispatch webhook events for relevant Kafka topics (fire-and-forget).
 */
async function dispatchWebhook(eventType: string, data: any): Promise<void> {
  const eventMap: Record<string, string> = {
    [KafkaTopics.JOB_POSTED]: 'job.posted',
    [KafkaTopics.JOB_UPDATED]: 'job.updated',
    [KafkaTopics.JOB_CLOSED]: 'job.closed',
    [KafkaTopics.APPLICATION_SUBMITTED]: 'application.submitted',
    [KafkaTopics.APPLICATION_STATUS_CHANGED]: 'application.status_changed',
    [KafkaTopics.PROFILE_UPDATED]: 'candidate.profile_updated',
    [KafkaTopics.COMPANY_PROFILE_UPDATED]: 'company.profile_updated',
    [KafkaTopics.COMPANY_VERIFIED]: 'company.verified',
    [KafkaTopics.VERIFICATION_APPROVED]: 'verification.approved',
    [KafkaTopics.VERIFICATION_REJECTED]: 'verification.rejected',
  };

  const webhookEvent = eventMap[eventType];
  if (webhookEvent) {
    const { webhookService } = await import('../services/webhook.service');
    webhookService.dispatch(webhookEvent, data).catch(() => {});
  }
}

/**
 * Route a message to the appropriate handler based on the eventType field.
 */
/**
 * Stream events to BigQuery for analytics (fire-and-forget).
 */
async function streamToBigQuery(eventType: string, data: any): Promise<void> {
  const tableMap: Record<string, string> = {
    [KafkaTopics.USER_REGISTERED]: 'user_events',
    [KafkaTopics.USER_LOGIN]: 'user_events',
    [KafkaTopics.JOB_POSTED]: 'job_events',
    [KafkaTopics.JOB_UPDATED]: 'job_events',
    [KafkaTopics.JOB_CLOSED]: 'job_events',
    [KafkaTopics.APPLICATION_SUBMITTED]: 'application_events',
    [KafkaTopics.APPLICATION_STATUS_CHANGED]: 'application_events',
    [KafkaTopics.SEARCH_PERFORMED]: 'search_events',
    [KafkaTopics.COMPANY_VERIFIED]: 'user_events',
    [KafkaTopics.VERIFICATION_SUBMITTED]: 'user_events',
    [KafkaTopics.VERIFICATION_APPROVED]: 'user_events',
    [KafkaTopics.VERIFICATION_REJECTED]: 'user_events',
    [KafkaTopics.ADMIN_USER_SUSPENDED]: 'user_events',
    [KafkaTopics.ADMIN_ROLE_CHANGED]: 'user_events',
    [KafkaTopics.SESSION_CREATED]: 'user_events',
    [KafkaTopics.SESSION_REVOKED]: 'user_events',
    [KafkaTopics.WHATSAPP_MESSAGE_INBOUND]: 'whatsapp_events',
    [KafkaTopics.WHATSAPP_CONTACT_CREATED]: 'whatsapp_events',
    [KafkaTopics.WHATSAPP_CONTACT_OPTED_OUT]: 'whatsapp_events',
    [KafkaTopics.WHATSAPP_CAMPAIGN_COMPLETED]: 'whatsapp_events',
  };

  const table = tableMap[eventType];
  if (table) {
    // WhatsApp analytics: warehouse METADATA ONLY — strip the message body and
    // phone number so chat-content / PII never lands in BigQuery (same stance as
    // Elasticsearch + audit logs). Other domains stream their payload as-is.
    let row: Record<string, unknown> = { event_type: eventType, ...data };
    if (table === 'whatsapp_events') {
      const d = (data ?? {}) as Record<string, unknown>;
      row = {
        event_type: eventType,
        conversationId: d.conversationId,
        contactId: d.contactId,
        campaignId: d.campaignId,
        type: d.type,
      };
    }
    const { bigqueryService } = await import('../services/bigquery.service');
    bigqueryService.insertEvent(table, row).catch(() => {});
  }
}

/**
 * Increment Firestore live counters (fire-and-forget).
 */
async function incrementFirestoreCounters(eventType: string): Promise<void> {
  const counterMap: Record<string, string> = {
    [KafkaTopics.USER_REGISTERED]: 'newUsersToday',
    [KafkaTopics.USER_LOGIN]: 'activeUsers',
    [KafkaTopics.JOB_POSTED]: 'jobsPostedToday',
    [KafkaTopics.APPLICATION_SUBMITTED]: 'applicationsToday',
    [KafkaTopics.SEARCH_PERFORMED]: 'searchesToday',
    [KafkaTopics.COMPANY_VERIFIED]: 'verificationsToday',
  };

  const metric = counterMap[eventType];
  if (metric) {
    const { firestoreCountersService } = await import('../services/firestore-counters.service');
    firestoreCountersService.incrementCounter(metric as any).catch(() => {});
  }
}

/**
 * Push event to in-memory ring buffer for admin event viewer.
 */
function pushToEventBuffer(eventType: string, topic: string, key: string | null): void {
  void import('../services/kafka-events.service')
    .then(({ kafkaEventsService }) => {
      return kafkaEventsService.push({
        eventType,
        topic,
        key,
        timestamp: new Date().toISOString(),
      });
    })
    .catch(() => {});
}

async function routeByEventType(eventType: string, data: any): Promise<void> {
  // Dispatch webhook events (fire-and-forget)
  dispatchWebhook(eventType, data).catch(() => {});
  // Stream to BigQuery (fire-and-forget)
  streamToBigQuery(eventType, data).catch(() => {});
  // Increment Firestore counters (fire-and-forget)
  incrementFirestoreCounters(eventType).catch(() => {});

  switch (eventType) {
    case KafkaTopics.USER_REGISTERED:
      await handleUserRegistered(data);
      break;
    case KafkaTopics.USER_LOGIN:
      await handleUserLogin(data);
      break;
    case KafkaTopics.JOB_POSTED:
      await handleJobPosted(data);
      break;
    case KafkaTopics.JOB_UPDATED:
      await handleJobUpdated(data);
      break;
    case KafkaTopics.JOB_CLOSED:
      await handleJobClosed(data);
      break;
    case KafkaTopics.APPLICATION_SUBMITTED:
      await handleApplicationSubmitted(data);
      break;
    case KafkaTopics.APPLICATION_STATUS_CHANGED:
      await handleApplicationStatusChanged(data);
      break;
    case KafkaTopics.PROFILE_UPDATED:
      await handleProfileUpdated(data);
      break;
    case KafkaTopics.NOTIFICATION_SENT:
      logger.debug(`Notification delivered: ${data.notificationId || data.userId}`);
      break;
    // New event types — handled by webhook/BigQuery/Firestore dispatchers above;
    // no additional handler logic needed for these.
    case KafkaTopics.COMPANY_VERIFIED:
    case KafkaTopics.COMPANY_PROFILE_UPDATED:
    case KafkaTopics.SEARCH_PERFORMED:
    case KafkaTopics.VERIFICATION_SUBMITTED:
    case KafkaTopics.VERIFICATION_APPROVED:
    case KafkaTopics.VERIFICATION_REJECTED:
    case KafkaTopics.ADMIN_USER_SUSPENDED:
    case KafkaTopics.ADMIN_JOB_REJECTED:
    case KafkaTopics.ADMIN_ROLE_CHANGED:
    case KafkaTopics.SESSION_CREATED:
    case KafkaTopics.SESSION_REVOKED:
    case KafkaTopics.RESUME_UPLOADED:
    case KafkaTopics.AVATAR_CHANGED:
    case KafkaTopics.WHATSAPP_MESSAGE_INBOUND:
    case KafkaTopics.WHATSAPP_CONTACT_CREATED:
    case KafkaTopics.WHATSAPP_CONTACT_OPTED_OUT:
    case KafkaTopics.WHATSAPP_CAMPAIGN_COMPLETED:
      // WhatsApp events are analytics-only here (BigQuery + event viewer above);
      // webhook fan-out is done directly by emitWaEvent (not in dispatchWebhook),
      // which avoids double delivery.
      logger.debug(`Kafka event processed: ${eventType}`);
      break;
    default:
      logger.debug(`Unhandled Kafka event type: ${eventType}`);
  }
}

export const startKafkaConsumer = async (): Promise<void> => {
  if (!(await isFeatureEnabled('enableKafka'))) {
    logger.info('Kafka disabled via feature flag — skipping consumer start');
    return;
  }

  if (!consumer) {
    logger.warn('Kafka consumer not available - skipping consumer start');
    return;
  }

  try {
    await consumer.connect();

    // Subscribe to all 4 consolidated topics
    const topics = Object.values(ConsolidatedTopics);
    for (const topic of topics) {
      await consumer.subscribe({ topic, fromBeginning: false });
    }

    await consumer.run({
      autoCommit: false,
      eachMessage: async ({ topic, partition, message, heartbeat }) => {
        const rawValue = message.value?.toString() || null;
        const rawKey = message.key?.toString() || null;

        try {
          if (!rawValue) {
            // Commit offset for empty messages so we don't get stuck
            await consumer!.commitOffsets([
              {
                topic,
                partition,
                offset: (Number(message.offset) + 1).toString(),
              },
            ]);
            return;
          }

          const data = JSON.parse(rawValue);
          const eventType = data.eventType;

          logger.debug(
            `Kafka message received: ${topic} → ${eventType} [partition: ${partition}]`,
            {
              key: rawKey,
              timestamp: data.timestamp,
            }
          );

          if (!eventType) {
            logger.warn(`Kafka message on ${topic} missing eventType field, skipping`);
            await consumer!.commitOffsets([
              {
                topic,
                partition,
                offset: (Number(message.offset) + 1).toString(),
              },
            ]);
            return;
          }

          // Schema validation — invalid messages go to DLQ
          const validation = validateEvent(eventType, data);
          if (!validation.valid) {
            logger.warn(
              `Kafka consumer schema validation failed for ${eventType}: ${validation.errors.join(', ')}`
            );
            await publishToDlq(
              topic,
              partition,
              message.offset,
              rawKey,
              rawValue,
              new Error(`Schema validation failed: ${validation.errors.join(', ')}`)
            );
            await consumer!.commitOffsets([
              { topic, partition, offset: (Number(message.offset) + 1).toString() },
            ]);
            return;
          }

          // Idempotency check — skip if already processed
          const idempotencyKey = `${topic}:${partition}:${message.offset}`;
          if (await isProcessed(idempotencyKey)) {
            logger.debug(`Skipping already-processed message: ${idempotencyKey}`);
            await consumer!.commitOffsets([
              {
                topic,
                partition,
                offset: (Number(message.offset) + 1).toString(),
              },
            ]);
            return;
          }

          // Push to event buffer for admin viewer
          pushToEventBuffer(eventType, topic, rawKey);

          // Extract trace context from Kafka headers for distributed tracing
          const traceCarrier: Record<string, string> = {};
          if (message.headers) {
            for (const [k, v] of Object.entries(message.headers)) {
              if (v) traceCarrier[k] = Buffer.isBuffer(v) ? v.toString() : String(v);
            }
          }

          await withExtractedContext(
            traceCarrier,
            `kafka.process ${eventType}`,
            SpanKind.CONSUMER,
            () => routeByEventType(eventType, data)
          );

          // Mark as processed for idempotency
          await markProcessed(idempotencyKey);

          // Commit offset after successful processing
          await consumer!.commitOffsets([
            {
              topic,
              partition,
              offset: (Number(message.offset) + 1).toString(),
            },
          ]);

          await heartbeat();
        } catch (error) {
          logger.error(`Error processing Kafka message on topic ${topic}:`, error);

          // Publish failed message to DLQ
          await publishToDlq(
            topic,
            partition,
            message.offset,
            rawKey,
            rawValue,
            error instanceof Error ? error : new Error(String(error))
          );

          // Commit offset so we don't re-process the same failed message forever
          await consumer!
            .commitOffsets([
              {
                topic,
                partition,
                offset: (Number(message.offset) + 1).toString(),
              },
            ])
            .catch((commitErr) => {
              logger.error('Failed to commit offset after DLQ publish:', commitErr);
            });
        }
      },
    });

    logger.info(`Kafka consumer started, subscribed to: ${topics.join(', ')}`);
  } catch (error) {
    logger.error('Failed to start Kafka consumer:', error);
  }
};

export const stopKafkaConsumer = async (): Promise<void> => {
  if (!consumer) return;
  try {
    await consumer.disconnect();
    logger.info('Kafka consumer disconnected');
  } catch (error) {
    logger.error('Error disconnecting Kafka consumer:', error);
  }
};
