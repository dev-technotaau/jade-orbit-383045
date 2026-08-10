import { prisma } from '../config/prisma';
import { invalidateOptOutKeywordCache } from './whatsapp-contact.service';
import { Prisma } from '@prisma/client';

/**
 * Singleton WhatsApp settings row (id="default"). Read-side upserts so the row
 * always exists with schema defaults, even on a fresh install.
 */
export async function getWaSettings() {
  return prisma.waSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default' },
    update: {},
  });
}

/** Apply a partial patch to the singleton settings row (upsert so it can't 404). */
export async function updateWaSettings(patch: {
  businessHours?: unknown;
  awayMessage?: string | null;
  welcomeMessage?: string | null;
  autoReplyEnabled?: boolean;
  awayMode?: boolean;
  marketingCapPer24h?: number;
  retentionDays?: number | null;
  optOutKeywords?: string[];
  faqMenuEnabled?: boolean;
  faqTriggerKeywords?: string[];
}) {
  const data: Prisma.WaSettingsUpdateInput = {};
  if (patch.businessHours !== undefined) {
    data.businessHours =
      patch.businessHours === null
        ? Prisma.JsonNull
        : (patch.businessHours as Prisma.InputJsonValue);
  }
  if (patch.awayMessage !== undefined) data.awayMessage = patch.awayMessage;
  if (patch.welcomeMessage !== undefined) data.welcomeMessage = patch.welcomeMessage;
  if (patch.autoReplyEnabled !== undefined) data.autoReplyEnabled = patch.autoReplyEnabled;
  if (patch.awayMode !== undefined) data.awayMode = patch.awayMode;
  if (patch.marketingCapPer24h !== undefined) data.marketingCapPer24h = patch.marketingCapPer24h;
  if (patch.retentionDays !== undefined) data.retentionDays = patch.retentionDays;
  if (patch.optOutKeywords !== undefined) data.optOutKeywords = { set: patch.optOutKeywords };
  if (patch.faqMenuEnabled !== undefined) data.faqMenuEnabled = patch.faqMenuEnabled;
  if (patch.faqTriggerKeywords !== undefined) {
    data.faqTriggerKeywords = { set: patch.faqTriggerKeywords };
  }

  const saved = await prisma.waSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default', ...(data as Prisma.WaSettingsCreateInput) },
    update: data,
  });

  // The opt-out detector caches these for 60s; drop the cache now so a keyword
  // the operator just added takes effect on the very next inbound message
  // rather than up to a minute later.
  if (patch.optOutKeywords !== undefined) invalidateOptOutKeywordCache();

  return saved;
}
