import prisma from '../config/prisma';
import logger from '../config/logger';
import { dataExportQueue } from '../jobs/data-export.queue';

interface ExportedData {
  exportedAt: string;
  user: Record<string, unknown>;
  candidateProfile: Record<string, unknown> | null;
  companyProfile: Record<string, unknown> | null;
  savedJobs: unknown[];
  verificationRequests: unknown[];
  notifications: unknown[];
  consents: unknown[];
  knownDevices: unknown[];
  loginLocations: unknown[];
  auditLogs: unknown[];
}

/**
 * Collect all user data for GDPR export.
 */
export async function collectUserData(userId: string): Promise<ExportedData> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      avatar: true,
      mobileNumber: true,
      isMobileVerified: true,
      isWhatsappVerified: true,
      isActive: true,
      isEmailVerified: true,
      mfaEnabled: true,
      lastLoginAt: true,
      lastActiveAt: true,
      createdAt: true,
      updatedAt: true,
      deletionRequestedAt: true,
    },
  });

  if (!user) throw new Error('User not found');

  const [
    candidateProfile,
    companyProfile,
    savedJobs,
    verificationRequests,
    notifications,
    consents,
    knownDevices,
    loginLocations,
    auditLogs,
  ] = await Promise.all([
    prisma.candidateProfile.findUnique({
      where: { userId },
      select: {
        headline: true,
        bio: true,
        currentLocation: true,
        preferredLocations: true,
        resume: true,
        city: true,
        state: true,
        country: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.companyProfile.findUnique({
      where: { userId },
      select: {
        companyName: true,
        description: true,
        industry: true,
        website: true,
        locations: true,
        companySize: true,
        logo: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.savedJob.findMany({
      where: { userId },
      select: { jobId: true, createdAt: true },
    }),
    prisma.verificationRequest.findMany({
      where: { userId },
      select: { type: true, status: true, createdAt: true, reviewedAt: true },
    }),
    prisma.notification.findMany({
      where: { userId },
      select: { title: true, message: true, type: true, isRead: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
    prisma.userConsent.findMany({
      where: { userId },
      select: { type: true, version: true, givenAt: true, revokedAt: true },
    }),
    prisma.knownDevice.findMany({
      where: { userId },
      select: { name: true, ipAddress: true, location: true, lastUsedAt: true, createdAt: true },
    }),
    prisma.loginLocation.findMany({
      where: { userId },
      select: { ipAddress: true, country: true, city: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.auditLog.findMany({
      where: { performedBy: userId },
      select: { action: true, entity: true, entityId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    user: user as Record<string, unknown>,
    candidateProfile: candidateProfile as Record<string, unknown> | null,
    companyProfile: companyProfile as Record<string, unknown> | null,
    savedJobs,
    verificationRequests,
    notifications,
    consents,
    knownDevices,
    loginLocations,
    auditLogs,
  };
}

/**
 * Queue a data export job for async processing.
 * The worker will collect data, generate JSON, and email a download link.
 */
export async function requestDataExport(userId: string, email: string): Promise<void> {
  await dataExportQueue.add('export-user-data', { userId, email });
  logger.info(`Data export queued for user ${userId}`);
}
