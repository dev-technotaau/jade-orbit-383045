import type { Job } from 'bullmq';
import { exec } from 'child_process';
import { promisify } from 'util';
import { gzip } from 'zlib';
import logger from '../config/logger';
import redis from '../config/redis';
import { env } from '../config/env';
import { r2Client, R2_BUCKET_NAME } from '../config/r2';
import { ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

const execAsync = promisify(exec);
const gzipAsync = promisify(gzip);
const TIMEOUT_MS = 300_000; // 5 min for backup operations
const BACKUP_FOLDER = 'backups/db';

// Redis keys for tracking backup status
const BACKUP_KEYS = {
  dbLastSuccess: 'backup:last-success:db',
  dbLastFailure: 'backup:last-failure:db',
  cleanupLastRun: 'backup:last-success:cleanup',
};

async function trackBackupStatus(key: string): Promise<void> {
  try {
    await redis.set(key, new Date().toISOString());
  } catch {
    // Redis tracking is best-effort
  }
}

async function notifyBackupFailure(type: string, error: string): Promise<void> {
  try {
    const { notificationService } = await import('../services/notification.service');
    if (env.SUPER_ADMIN_EMAIL) {
      await notificationService
        .send({
          userId: 'system',
          title: `Backup Failed: ${type}`,
          message: `Automated ${type} backup failed: ${error}`,
          type: 'ERROR',
          category: 'system',
          channels: ['email'],
        })
        .catch(() => {});
    }
  } catch {
    // Notification is best-effort
  }
}

/**
 * Database backup handler — runs pg_dump and uploads the gzipped SQL to Cloudflare R2.
 *
 * Works on Render, Docker, or any environment with `pg_dump` available.
 * The backup is stored at: r2://<bucket>/backups/db/hire_adda_YYYYMMDD_HHMMSS.sql.gz
 */
export async function handleDbBackup(job: Job): Promise<{ success: boolean; key?: string }> {
  const timeoutId = setTimeout(() => {}, TIMEOUT_MS);
  try {
    logger.info(`Processing database backup ${job.id}`);

    if (!r2Client) {
      throw new Error('R2 storage is not configured — cannot upload backup');
    }

    // Run pg_dump and capture stdout as raw SQL
    const { stdout: sqlDump } = await Promise.race([
      execAsync(
        `pg_dump "${env.DATABASE_URL}" --no-owner --no-privileges --clean --if-exists`,
        { maxBuffer: 100 * 1024 * 1024, timeout: TIMEOUT_MS } // 100MB max
      ),
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error('pg_dump timeout after 5min')), TIMEOUT_MS)
      ),
    ]);

    // Compress the SQL dump
    const compressed = await gzipAsync(Buffer.from(sqlDump, 'utf-8'));

    // Upload to R2
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, '')
      .slice(0, 15);
    const key = `${BACKUP_FOLDER}/hire_adda_${timestamp}.sql.gz`;

    const upload = new Upload({
      client: r2Client,
      params: {
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: compressed,
        ContentType: 'application/gzip',
      },
    });

    await upload.done();

    const sizeMB = (compressed.length / (1024 * 1024)).toFixed(2);
    await trackBackupStatus(BACKUP_KEYS.dbLastSuccess);
    logger.info(`Database backup uploaded to R2: ${key} (${sizeMB}MB)`);
    return { success: true, key };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await trackBackupStatus(BACKUP_KEYS.dbLastFailure);
    await notifyBackupFailure('database', message);
    logger.error('Database backup failed:', error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Backup cleanup handler — deletes old backup files from R2 beyond the retention period.
 *
 * Lists all objects in the backups/db/ prefix and deletes those older than BACKUP_RETENTION_DAYS.
 */
export async function handleBackupCleanup(
  job: Job
): Promise<{ success: boolean; deleted: number }> {
  const timeoutId = setTimeout(() => {}, TIMEOUT_MS);
  try {
    logger.info(`Processing backup cleanup ${job.id}`);

    if (!r2Client) {
      logger.warn('R2 storage is not configured — skipping backup cleanup');
      return { success: true, deleted: 0 };
    }

    const retentionDays = env.BACKUP_RETENTION_DAYS;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    let deleted = 0;
    let continuationToken: string | undefined;

    // Paginate through all backup objects
    do {
      const listResponse = await r2Client.send(
        new ListObjectsV2Command({
          Bucket: R2_BUCKET_NAME,
          Prefix: `${BACKUP_FOLDER}/`,
          ContinuationToken: continuationToken,
        })
      );

      for (const obj of listResponse.Contents ?? []) {
        if (obj.LastModified && obj.LastModified < cutoffDate && obj.Key) {
          await r2Client.send(
            new DeleteObjectCommand({
              Bucket: R2_BUCKET_NAME,
              Key: obj.Key,
            })
          );
          logger.debug(`Deleted old backup: ${obj.Key}`);
          deleted++;
        }
      }

      continuationToken = listResponse.IsTruncated ? listResponse.NextContinuationToken : undefined;
    } while (continuationToken);

    await trackBackupStatus(BACKUP_KEYS.cleanupLastRun);
    logger.info(`Backup cleanup completed: deleted ${deleted} old backup(s)`);
    return { success: true, deleted };
  } catch (error) {
    logger.error('Backup cleanup failed:', error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
