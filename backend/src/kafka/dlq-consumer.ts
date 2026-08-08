import type { Kafka } from 'kafkajs';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import logger from '../config/logger';

const DLQ_TOPIC = 'hire-adda.dlq';
const DLQ_GROUP_ID = 'hire-adda-dlq-group';

let dlqConsumer: ReturnType<Kafka['consumer']> | null = null;

/**
 * Start the DLQ consumer that persists failed messages and alerts admins.
 */
export async function startDlqConsumer(): Promise<void> {
  if (!env.KAFKA_BROKERS) {
    logger.debug('Kafka not configured — skipping DLQ consumer');
    return;
  }

  try {
    const { kafka } = await import('../config/kafka');
    if (!kafka) {
      logger.debug('Kafka instance not available — skipping DLQ consumer');
      return;
    }

    dlqConsumer = kafka.consumer({ groupId: DLQ_GROUP_ID });
    await dlqConsumer.connect();
    await dlqConsumer.subscribe({ topic: DLQ_TOPIC, fromBeginning: false });

    await dlqConsumer.run({
      eachMessage: async ({ message }) => {
        const rawValue = message.value?.toString();
        if (!rawValue) return;

        try {
          const data = JSON.parse(rawValue);

          // Persist to database
          await prisma.kafkaDlqMessage.create({
            data: {
              originalTopic: data.originalTopic || 'unknown',
              partition: data.partition ?? 0,
              offset: data.offset || '0',
              originalValue: data.originalValue || null,
              error: data.error || null,
              stack: data.stack || null,
              timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
            },
          });

          // Alert SUPER_ADMIN users via notification (fire-and-forget)
          void (async () => {
            try {
              const superAdmins = await prisma.user.findMany({
                where: { role: 'SUPER_ADMIN' },
                select: { id: true },
              });
              const { notificationService } = await import('../services/notification.service');
              for (const admin of superAdmins) {
                await notificationService
                  .send({
                    userId: admin.id,
                    title: 'Kafka DLQ Alert',
                    message: `Failed message from ${data.originalTopic}: ${(data.error || 'Unknown error').slice(0, 200)}`,
                    type: 'WARNING' as any,
                    category: 'system',
                    channels: ['in_app'],
                  })
                  .catch(() => {});
              }
            } catch {
              /* non-critical */
            }
          })();

          logger.warn(`DLQ message persisted from topic: ${data.originalTopic}`);
        } catch (error) {
          logger.error('Failed to process DLQ message:', error);
        }
      },
    });

    logger.info('Kafka DLQ consumer started');
  } catch (error) {
    logger.error('Failed to start Kafka DLQ consumer:', error);
  }
}

/**
 * Stop the DLQ consumer gracefully.
 */
export async function stopDlqConsumer(): Promise<void> {
  if (!dlqConsumer) return;
  try {
    await dlqConsumer.disconnect();
    logger.info('Kafka DLQ consumer disconnected');
  } catch (error) {
    logger.error('Error disconnecting Kafka DLQ consumer:', error);
  }
}
