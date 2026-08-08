import { prisma } from '../config/prisma';
import { Prisma } from '@prisma/client';
import { assertUnmodified } from '../utils/optimistic-lock';

/**
 * Singleton email-system settings row (id="default"). Read-side upserts so the
 * row always exists with schema defaults, even on a fresh install. Mirrors the
 * WhatsApp settings pattern.
 */
export async function getEmailSettings() {
  return prisma.emailSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default' },
    update: {},
  });
}

export interface EmailSettingsPatch {
  businessHours?: unknown;
  awayMessage?: string | null;
  welcomeMessage?: string | null;
  autoReplyEnabled?: boolean;
  awayMode?: boolean;
  marketingCapPer24h?: number;
  retentionDays?: number | null;
  unsubscribeKeywords?: string[];
  footerAddress?: string | null;
  footerHtml?: string | null;
  defaultFromName?: string | null;
  defaultReplyTo?: string | null;
  trackOpens?: boolean;
  trackClicks?: boolean;
  warmupSchedule?: unknown;
  seedAddresses?: string[];
  /**
   * Optimistic-concurrency token: the `updatedAt` the editor loaded. The
   * settings page posts the WHOLE document, so without this a second admin
   * saving a minute later silently reverted the first one's business hours,
   * footer and auto-reply copy with no trace. Optional — omitting it is an
   * explicit "overwrite whatever is there".
   */
  expectedUpdatedAt?: string;
}

/** Apply a partial patch to the singleton settings row (upsert so it can't 404). */
export async function updateEmailSettings(patch: EmailSettingsPatch) {
  if (patch.expectedUpdatedAt) {
    const current = await prisma.emailSettings.findUnique({ where: { id: 'default' } });
    // A missing row means nothing to clobber — the upsert below creates it.
    if (current) assertUnmodified(current, patch.expectedUpdatedAt, 'Email settings');
  }

  const data: Prisma.EmailSettingsUpdateInput = {};
  if (patch.businessHours !== undefined) {
    data.businessHours =
      patch.businessHours === null
        ? Prisma.JsonNull
        : (patch.businessHours as Prisma.InputJsonValue);
  }
  if (patch.warmupSchedule !== undefined) {
    data.warmupSchedule =
      patch.warmupSchedule === null
        ? Prisma.JsonNull
        : (patch.warmupSchedule as Prisma.InputJsonValue);
  }
  if (patch.awayMessage !== undefined) data.awayMessage = patch.awayMessage;
  if (patch.welcomeMessage !== undefined) data.welcomeMessage = patch.welcomeMessage;
  if (patch.autoReplyEnabled !== undefined) data.autoReplyEnabled = patch.autoReplyEnabled;
  if (patch.awayMode !== undefined) data.awayMode = patch.awayMode;
  if (patch.marketingCapPer24h !== undefined) data.marketingCapPer24h = patch.marketingCapPer24h;
  if (patch.retentionDays !== undefined) data.retentionDays = patch.retentionDays;
  if (patch.unsubscribeKeywords !== undefined) {
    data.unsubscribeKeywords = { set: patch.unsubscribeKeywords };
  }
  if (patch.footerAddress !== undefined) data.footerAddress = patch.footerAddress;
  if (patch.footerHtml !== undefined) data.footerHtml = patch.footerHtml;
  if (patch.defaultFromName !== undefined) data.defaultFromName = patch.defaultFromName;
  if (patch.defaultReplyTo !== undefined) data.defaultReplyTo = patch.defaultReplyTo;
  if (patch.trackOpens !== undefined) data.trackOpens = patch.trackOpens;
  if (patch.trackClicks !== undefined) data.trackClicks = patch.trackClicks;
  if (patch.seedAddresses !== undefined) data.seedAddresses = { set: patch.seedAddresses };

  return prisma.emailSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default', ...(data as Prisma.EmailSettingsCreateInput) },
    update: data,
  });
}
