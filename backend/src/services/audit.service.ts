import crypto from 'crypto';
import logger from '../config/logger';
import prisma from '../config/prisma';

interface AuditLogData {
  action: string;
  entity: string;
  entityId?: string;
  performedBy: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Generate a SHA-256 checksum for audit log integrity verification.
 */
function generateChecksum(
  action: string,
  entity: string,
  entityId: string | undefined,
  performedBy: string,
  details: unknown,
  createdAt: string
): string {
  const payload = `${action}|${entity}|${entityId || ''}|${performedBy}|${JSON.stringify(details)}|${createdAt}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export class AuditService {
  static async log(data: AuditLogData) {
    try {
      const now = new Date();
      const checksum = generateChecksum(
        data.action,
        data.entity,
        data.entityId,
        data.performedBy,
        data.details || {},
        now.toISOString()
      );

      await prisma.auditLog.create({
        data: {
          action: data.action,
          entity: data.entity,
          entityId: data.entityId,
          performedBy: data.performedBy,
          details: (data.details ?? {}) as object,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          checksum,
          createdAt: now,
        },
      });
    } catch (error) {
      logger.error('Failed to create audit log:', error as Error);
    }
  }

  /**
   * Verify the integrity of an audit log entry by recalculating its checksum.
   */
  static async verifyIntegrity(auditLogId: string): Promise<boolean> {
    const log = await prisma.auditLog.findUnique({ where: { id: auditLogId } });
    if (!log || !log.checksum) return false;

    const expected = generateChecksum(
      log.action,
      log.entity,
      log.entityId ?? undefined,
      log.performedBy ?? '',
      log.details ?? {},
      log.createdAt.toISOString()
    );

    return expected === log.checksum;
  }

  /**
   * Archive audit logs older than a given date (for compliance retention).
   */
  static async archiveLogs(olderThan: Date): Promise<number> {
    const result = await prisma.auditLog.updateMany({
      where: { createdAt: { lt: olderThan }, isArchived: false },
      data: { isArchived: true },
    });
    logger.info(`Archived ${result.count} audit logs older than ${olderThan.toISOString()}`);
    return result.count;
  }
}
