import type { Job } from 'bullmq';
import { ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import logger from '../config/logger';
import { collectUserData } from '../services/data-export.service';
import { emailQueue } from './email.queue';
import { prisma } from '../config/prisma';
import { r2Client, R2_BUCKET_NAME } from '../config/r2';
import {
  userDataExportReady,
  candidateExportReady,
  resumeExportReady,
} from '../templates/email/data-export';
import { notificationService } from '../services/notification.service';
import { NotificationType } from '@prisma/client';

interface DataExportJob {
  userId: string;
  email?: string;
  exportType: 'USER_DATA' | 'CANDIDATE_EXPORT' | 'RESUME_EXPORT';
  format?: 'csv' | 'xlsx' | 'json';
  candidateIds?: string[];
  /** Requester's role — admins bypass the contact paywall in exports. */
  requesterRole?: string;
}

export async function handleDataExport(job: Job<DataExportJob>) {
  const TIMEOUT_MS = 120_000;
  const timeoutId = setTimeout(() => {
    /* safety net */
  }, TIMEOUT_MS);
  try {
    const { userId, email, exportType, format, candidateIds } = job.data;
    logger.info(`Processing ${exportType} export for user ${userId}`);

    const processExport = async () => {
      switch (exportType) {
        case 'USER_DATA': {
          const data = await collectUserData(userId);
          const jsonStr = JSON.stringify(data, null, 2);

          const exportEmail = userDataExportReady(data.exportedAt);
          await emailQueue.add('send-email', {
            to: email!,
            subject: exportEmail.subject,
            html: exportEmail.html,
            attachments: [
              {
                filename: `hire-adda-data-export-${new Date().toISOString().split('T')[0]}.json`,
                content: jsonStr,
                contentType: 'application/json',
              },
            ],
          });

          notificationService
            .send({
              userId,
              title: 'Data Export Ready',
              message: 'Your personal data export has been sent to your email.',
              type: NotificationType.SUCCESS,
              category: 'export',
              link: '/candidate/settings',
              channels: ['in_app'],
            })
            .catch(() => {});

          // Also notify via WhatsApp (fire-and-forget)
          try {
            const waUser = await prisma.user.findUnique({
              where: { id: userId },
              select: {
                isWhatsappVerified: true,
                whatsappNumber: true,
                mobileNumber: true,
              },
            });
            const target = waUser?.isWhatsappVerified
              ? waUser.whatsappNumber || waUser.mobileNumber
              : null;
            if (target) {
              const { dataExportReadyWhatsapp } = await import('../templates/whatsapp');
              const { whatsappQueue } = await import('./whatsapp.queue');
              const tmpl = dataExportReadyWhatsapp('account data', '/candidate/settings');
              await whatsappQueue.add('send-whatsapp', {
                to: target,
                templateName: tmpl.templateName,
                components: tmpl.components,
              });
            }
          } catch (waErr) {
            logger.error('Failed to enqueue WhatsApp data export ready', waErr);
          }

          logger.info(`User data export completed and emailed for user ${userId}`);
          return { success: true };
        }

        case 'CANDIDATE_EXPORT': {
          if (!candidateIds || candidateIds.length === 0) {
            throw new Error('candidateIds required for CANDIDATE_EXPORT');
          }

          const candidates = await prisma.candidateProfile.findMany({
            where: { userId: { in: candidateIds } },
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  mobileNumber: true,
                  lastActiveAt: true,
                },
              },
            },
          });

          // Contact paywall — same rule as search/detail. Email/phone only
          // for candidates the exporter unlocked (or who applied to them);
          // everyone else exports as "Locked". Admins bypass.
          const exporterIsAdmin =
            job.data.requesterRole === 'ADMIN' || job.data.requesterRole === 'SUPER_ADMIN';
          let contactVisible = (_id: string) => true;
          if (!exporterIsAdmin) {
            const { getContactVisibilitySet } = await import('../services/cv-unlock.service');
            const { all, visible } = await getContactVisibilitySet(
              userId,
              candidates.map((c) => c.userId)
            );
            contactVisible = (id: string) => all || visible.has(id);
          }

          const ExcelJS = (await import('exceljs')).default;
          const workbook = new ExcelJS.Workbook();
          const sheet = workbook.addWorksheet('Candidates');

          sheet.columns = [
            { header: 'Name', key: 'name', width: 25 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Phone', key: 'phone', width: 15 },
            { header: 'Location', key: 'location', width: 20 },
            { header: 'Experience (yrs)', key: 'experience', width: 15 },
            { header: 'Current Company', key: 'company', width: 25 },
            { header: 'Current Role', key: 'role', width: 25 },
            { header: 'Skills', key: 'skills', width: 50 },
            { header: 'Expected Salary Min', key: 'salaryMin', width: 18 },
            { header: 'Expected Salary Max', key: 'salaryMax', width: 18 },
            { header: 'Notice Period', key: 'notice', width: 15 },
            { header: 'Last Active', key: 'lastActive', width: 20 },
          ];

          sheet.getRow(1).font = { bold: true };
          sheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' },
          };

          for (const c of candidates) {
            const showContact = contactVisible(c.userId);
            sheet.addRow({
              name: `${c.user?.firstName || ''} ${c.user?.lastName || ''}`.trim() || '-',
              email: showContact ? c.user?.email || '-' : 'Locked',
              phone: showContact ? c.phone || c.user?.mobileNumber || '-' : 'Locked',
              location: c.currentLocation || '-',
              experience: c.experienceYears || 0,
              company: c.currentCompany || '-',
              role: c.currentRole || '-',
              skills: ((c.skills as string[]) || []).join(', ') || '-',
              salaryMin: c.expectedSalaryMin
                ? `${c.salaryCurrency} ${Number(c.expectedSalaryMin).toLocaleString()}`
                : '-',
              salaryMax: c.expectedSalaryMax
                ? `${c.salaryCurrency} ${Number(c.expectedSalaryMax).toLocaleString()}`
                : '-',
              notice: c.noticePeriod || '-',
              lastActive: c.user?.lastActiveAt
                ? new Date(c.user.lastActiveAt).toLocaleDateString()
                : '-',
            });
          }

          const buffer =
            format === 'csv' ? await workbook.csv.writeBuffer() : await workbook.xlsx.writeBuffer();

          const filename = `candidates-${Date.now()}.${format === 'csv' ? 'csv' : 'xlsx'}`;
          const contentType =
            format === 'csv'
              ? 'text/csv'
              : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

          const { uploadFileToR2, getSignedDownloadUrl } =
            await import('../services/storage.service');
          const { key } = await uploadFileToR2(
            Buffer.from(buffer),
            filename,
            'exports',
            contentType
          );

          const SEVEN_DAYS = 7 * 24 * 60 * 60;
          const signedUrl = await getSignedDownloadUrl(key, SEVEN_DAYS);

          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, firstName: true },
          });

          if (!user?.email) {
            throw new Error('User email not found');
          }

          const candidateEmail = candidateExportReady(
            user.firstName,
            candidates.length,
            format || 'xlsx',
            signedUrl,
            filename
          );
          await emailQueue.add('send-email', {
            to: user.email,
            subject: candidateEmail.subject,
            html: candidateEmail.html,
          });

          notificationService
            .send({
              userId,
              title: 'Candidate Export Ready',
              message: `Your candidate export (${candidates.length} candidates) has been sent to your email.`,
              type: NotificationType.SUCCESS,
              category: 'export',
              link: '/employer/candidates',
              channels: ['in_app'],
            })
            .catch(() => {});

          logger.info(
            `Candidate export completed for user ${userId}: ${candidates.length} candidates, format: ${format}`
          );
          return { signedUrl, filename, count: candidates.length };
        }

        case 'RESUME_EXPORT': {
          if (!candidateIds || candidateIds.length === 0) {
            throw new Error('candidateIds required for RESUME_EXPORT');
          }

          const resumeCandidates = await prisma.candidateProfile.findMany({
            where: { userId: { in: candidateIds } },
            select: {
              resume: true,
              resumeOriginalName: true,
              user: { select: { id: true, firstName: true, lastName: true } },
            },
          });

          const {
            extractR2KeyFromUrl,
            downloadFileFromR2,
            uploadFileToR2,
            getSignedDownloadUrl: getResumeSignedUrl,
          } = await import('../services/storage.service');
          const archiver = (await import('archiver')).default;
          const path = await import('path');

          // Create ZIP archive in memory
          const archive = archiver('zip', { zlib: { level: 6 } });
          const zipChunks: Buffer[] = [];
          archive.on('data', (chunk: Buffer) => zipChunks.push(chunk));

          const nameCountMap = new Map<string, number>();
          let resumeCount = 0;
          let skippedCount = 0;

          for (const c of resumeCandidates) {
            if (!c.resume) {
              skippedCount++;
              continue;
            }

            const r2Key = extractR2KeyFromUrl(c.resume);
            if (!r2Key) {
              skippedCount++;
              continue;
            }

            try {
              const fileBuffer = await downloadFileFromR2(r2Key);
              const ext = c.resumeOriginalName
                ? path.extname(c.resumeOriginalName)
                : path.extname(r2Key) || '.pdf';
              const baseName =
                `${c.user?.firstName || 'Unknown'}_${c.user?.lastName || 'Candidate'}`.replace(
                  /[^a-zA-Z0-9_-]/g,
                  '_'
                );

              // Deduplicate filenames
              const count = nameCountMap.get(baseName) || 0;
              nameCountMap.set(baseName, count + 1);
              const fileName = count > 0 ? `${baseName}_${count}${ext}` : `${baseName}${ext}`;

              archive.append(fileBuffer, { name: fileName });
              resumeCount++;
            } catch (err) {
              logger.warn(
                `Failed to download resume for candidate ${c.user?.id}: ${(err as Error).message}`
              );
              skippedCount++;
            }
          }

          archive.finalize();
          await new Promise<void>((resolve, reject) => {
            archive.on('end', resolve);
            archive.on('error', reject);
          });

          const zipBuffer = Buffer.concat(zipChunks);

          if (resumeCount === 0) {
            throw new Error('No resumes available to export');
          }

          const zipFilename = `resumes-${Date.now()}.zip`;
          const { key: zipKey } = await uploadFileToR2(
            zipBuffer,
            zipFilename,
            'resume-exports',
            'application/zip'
          );

          const SEVEN_DAYS = 7 * 24 * 60 * 60;
          const zipSignedUrl = await getResumeSignedUrl(zipKey, SEVEN_DAYS);

          const resumeUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, firstName: true },
          });

          if (!resumeUser?.email) {
            throw new Error('User email not found');
          }

          const resumeEmail = resumeExportReady(
            resumeUser.firstName,
            resumeCount,
            skippedCount,
            zipSignedUrl,
            zipFilename
          );
          await emailQueue.add('send-email', {
            to: resumeUser.email,
            subject: resumeEmail.subject,
            html: resumeEmail.html,
          });

          notificationService
            .send({
              userId,
              title: 'Resume Export Ready',
              message: `Your resume export (${resumeCount} resumes) has been sent to your email.`,
              type: NotificationType.SUCCESS,
              category: 'export',
              link: '/employer/candidates',
              channels: ['in_app'],
            })
            .catch(() => {});

          logger.info(
            `Resume export completed for user ${userId}: ${resumeCount} resumes, ${skippedCount} skipped`
          );
          return { signedUrl: zipSignedUrl, filename: zipFilename, count: resumeCount };
        }

        default:
          throw new Error(`Unknown export type: ${exportType}`);
      }
    };

    await Promise.race([
      processExport(),
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error('Data export worker timeout after 120s')), TIMEOUT_MS)
      ),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

const EXPORT_PREFIXES = ['exports/', 'resume-exports/'];
const EXPORT_RETENTION_DAYS = 8; // 1 day buffer beyond the 7-day signed URL expiry

/**
 * Cleanup handler — deletes export files older than EXPORT_RETENTION_DAYS from R2.
 * Covers both `exports/` (CSV/XLSX) and `resume-exports/` (ZIP) prefixes.
 */
export async function handleExportCleanup(
  job: Job
): Promise<{ success: boolean; deleted: number }> {
  const CLEANUP_TIMEOUT_MS = 120_000;
  const timeoutId = setTimeout(() => {}, CLEANUP_TIMEOUT_MS);
  try {
    logger.info(`Processing export cleanup ${job.id}`);

    if (!r2Client) {
      logger.warn('R2 storage is not configured — skipping export cleanup');
      return { success: true, deleted: 0 };
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - EXPORT_RETENTION_DAYS);

    let deleted = 0;

    for (const prefix of EXPORT_PREFIXES) {
      let continuationToken: string | undefined;

      do {
        const listResponse = await r2Client.send(
          new ListObjectsV2Command({
            Bucket: R2_BUCKET_NAME,
            Prefix: prefix,
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
            logger.debug(`Deleted expired export: ${obj.Key}`);
            deleted++;
          }
        }

        continuationToken = listResponse.IsTruncated
          ? listResponse.NextContinuationToken
          : undefined;
      } while (continuationToken);
    }

    logger.info(`Export cleanup completed: deleted ${deleted} expired file(s)`);
    return { success: true, deleted };
  } catch (error) {
    logger.error('Export cleanup failed:', error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
