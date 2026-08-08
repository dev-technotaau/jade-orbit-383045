import { prisma } from '../config/prisma';
import logger from '../config/logger';
import {} from '../kafka/producer';
import { publishEvent } from '../kafka/producer';
import type { KafkaTopics } from '../kafka/topics';

class KafkaReplayService {
  /**
   * Store a published event for potential replay (fire-and-forget).
   */
  async storeEvent(eventType: string, key: string, data: any): Promise<void> {
    try {
      await prisma.kafkaEvent.create({
        data: {
          eventType,
          key,
          data: JSON.stringify(data),
          publishedAt: new Date(),
        },
      });
    } catch (error) {
      logger.debug(`Failed to store Kafka event for replay: ${eventType}`, error);
    }
  }

  /**
   * Replay events within a time range, optionally filtered by event types.
   */
  async replayEvents(
    startTime: Date,
    endTime: Date,
    eventTypes?: string[]
  ): Promise<{ replayed: number; errors: number }> {
    const where: any = {
      publishedAt: { gte: startTime, lte: endTime },
    };
    if (eventTypes && eventTypes.length > 0) {
      where.eventType = { in: eventTypes };
    }

    const events = await prisma.kafkaEvent.findMany({
      where,
      orderBy: { publishedAt: 'asc' },
      take: 1000, // Safety limit
    });

    let replayed = 0;
    let errors = 0;

    for (const event of events) {
      try {
        const data = JSON.parse(event.data);
        await publishEvent(event.eventType as KafkaTopics, event.key, data);
        replayed++;
      } catch (error) {
        errors++;
        logger.error(`Failed to replay event ${event.id}:`, error);
      }
    }

    logger.info(`Kafka event replay complete: ${replayed} replayed, ${errors} errors`);
    return { replayed, errors };
  }

  /**
   * Replay a specific DLQ message by its ID.
   */
  async replayDlqMessage(messageId: string): Promise<boolean> {
    const dlqMessage = await prisma.kafkaDlqMessage.findUnique({
      where: { id: messageId },
    });

    if (!dlqMessage) {
      throw new Error('DLQ message not found');
    }

    if (!dlqMessage.originalValue) {
      throw new Error('DLQ message has no original value to replay');
    }

    const data = JSON.parse(dlqMessage.originalValue);
    const eventType = data.eventType as KafkaTopics;

    if (!eventType) {
      throw new Error('DLQ message has no eventType');
    }

    await publishEvent(eventType, data.userId || data.jobId || 'unknown', data);

    // Mark as replayed
    await prisma.kafkaDlqMessage.update({
      where: { id: messageId },
      data: { replayed: true, replayedAt: new Date() },
    });

    logger.info(`DLQ message ${messageId} replayed successfully`);
    return true;
  }

  /**
   * Get DLQ messages with pagination.
   */
  async getDlqMessages(page = 1, limit = 20, replayedFilter?: boolean) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (replayedFilter !== undefined) {
      where.replayed = replayedFilter;
    }

    const [items, total] = await prisma.$transaction([
      prisma.kafkaDlqMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.kafkaDlqMessage.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;
    return { items, total, page, limit, totalPages, hasMore: page < totalPages };
  }
}

export const kafkaReplayService = new KafkaReplayService();
