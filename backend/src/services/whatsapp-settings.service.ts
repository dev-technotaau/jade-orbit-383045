import { prisma } from '../config/prisma';
import { publishAppEvent } from '../config/redis';
import {
  WA_CACHE_INVALIDATE_CHANNEL,
  WA_KEYWORD_CACHE_KEY,
  invalidateOptOutKeywordCache,
} from './whatsapp-contact.service';
import { Prisma } from '@prisma/client';
import { emitWa } from '../utils/whatsapp-realtime';

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
  awayDebounceMinutes?: number;
  marketingCapPer24h?: number;
  retentionDays?: number | null;
  optOutKeywords?: string[];
  optInKeywords?: string[];
  optOutConfirmationMessage?: string | null;
  faqMenuEnabled?: boolean;
  faqTriggerKeywords?: string[];
  faqFallbackMessage?: string | null;
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
  if (patch.awayDebounceMinutes !== undefined) {
    data.awayDebounceMinutes = patch.awayDebounceMinutes;
  }
  if (patch.marketingCapPer24h !== undefined) data.marketingCapPer24h = patch.marketingCapPer24h;
  if (patch.retentionDays !== undefined) data.retentionDays = patch.retentionDays;
  if (patch.optOutKeywords !== undefined) data.optOutKeywords = { set: patch.optOutKeywords };
  if (patch.optInKeywords !== undefined) data.optInKeywords = { set: patch.optInKeywords };
  if (patch.optOutConfirmationMessage !== undefined) {
    data.optOutConfirmationMessage = patch.optOutConfirmationMessage;
  }
  if (patch.faqMenuEnabled !== undefined) data.faqMenuEnabled = patch.faqMenuEnabled;
  if (patch.faqTriggerKeywords !== undefined) {
    data.faqTriggerKeywords = { set: patch.faqTriggerKeywords };
  }
  if (patch.faqFallbackMessage !== undefined) data.faqFallbackMessage = patch.faqFallbackMessage;

  const saved = await prisma.waSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default', ...(data as Prisma.WaSettingsCreateInput) },
    update: data,
  });

  // The opt-out detector caches these for 60s; drop the cache now so a keyword
  // the operator just added takes effect on the very next inbound message
  // rather than up to a minute later.
  // One cache invalidator covers both lists (see whatsapp-contact.service).
  //
  // The local call only reaches THIS process, and the process serving this
  // request is not the one running the inbound worker in any multi-process or
  // multi-replica deployment — so the publish is what actually makes the
  // "very next inbound message" promise true for the detector.
  if (patch.optOutKeywords !== undefined || patch.optInKeywords !== undefined) {
    invalidateOptOutKeywordCache();
    publishAppEvent(WA_CACHE_INVALIDATE_CHANNEL, WA_KEYWORD_CACHE_KEY);
  }

  // Settings are a singleton shared by every operator tab/device. Without this
  // fan-out the only refresh was the saving tab's own query invalidation, so one
  // operator flipping Away left the others rendering Online (and the Settings
  // screen showing stale business hours and auto-reply state) until something
  // unrelated happened to refetch — two operators could fight over the same
  // toggle without ever seeing each other's change. No conversationId: this is
  // account-wide, so it goes to the `wa:inbox` room every operator socket joins.
  emitWa('wa:settings', { settings: saved });

  return saved;
}
