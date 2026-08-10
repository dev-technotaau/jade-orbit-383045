import { prisma } from '../config/prisma';
import logger from '../config/logger';
import { env } from '../config/env';
import { AppError } from '../middleware/error';
import { getDefaultChannel } from './whatsapp-channel.service';
import { getTemplate } from './whatsapp-template.service';
import { normalizeWaPhone } from './whatsapp-contact.service';
import { setSequenceSteps, startSequence } from './whatsapp-sequence.service';
import { getSegment } from './whatsapp-segment.service';
import { getSuppressedPhoneSet } from './whatsapp-suppression.service';
import { addCampaignBatchJob } from '../jobs/whatsapp-campaign.queue';
import type {
  Prisma,
  WaCampaign,
  WaCampaignStatus,
  WaCampaignRecipientStatus,
  WaCampaignType,
  WaCampaignVariant,
  WaContact,
  WaOptInStatus,
  WaTemplateCategory,
} from '@prisma/client';

/** Estimated per-message cost (paise) by template category, for cost previews. */
function ratePaise(category?: WaTemplateCategory): number {
  if (category === 'MARKETING') return parseInt(env.WHATSAPP_PRICE_MARKETING_PAISE, 10) || 78;
  if (category === 'AUTHENTICATION') return parseInt(env.WHATSAPP_PRICE_AUTH_PAISE, 10) || 30;
  return parseInt(env.WHATSAPP_PRICE_UTILITY_PAISE, 10) || 30;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

// Error-code classification lives in a dependency-free module so the campaign
// worker (and its tests) can use the real tables without importing this service's
// whole dependency tree. Re-exported here for existing callers.
export {
  WA_SKIP_ERROR_CODES,
  WA_RETRYABLE_ERROR_CODES,
  isSkipErrorCode,
  isRetryableErrorCode,
} from './whatsapp-error-codes';
import { isSkipErrorCode, isRetryableErrorCode } from './whatsapp-error-codes';

interface CreateCampaignInput {
  name: string;
  description?: string;
  templateId: string;
  audienceType: 'segment' | 'upload' | 'manual';
  audienceFilter?: any; // segment: { tags?, optInStatus? } · upload/manual: { phones: string[] }
  segmentId?: string; // when set, the campaign's audienceFilter is sourced from this saved segment
  variableMapping?: string[]; // per body var: literal or {{name}} / {{phone}}
  scheduledAt?: string;
  batchSize?: number;
  throttlePerSec?: number;
  type?: WaCampaignType; // 'BROADCAST' (default) | 'SEQUENCE'
  steps?: any[]; // sequence steps (only used when type === 'SEQUENCE')
  isAbTest?: boolean; // split recipients across weighted template variants
  variants?: VariantInput[]; // A/B variants (only used when isAbTest)
  recurrenceDays?: number | null; // re-run every N days (null = one-off)
  createdBy: string;
}

/** One A/B variant on create/update: a template + a relative weight. */
interface VariantInput {
  label: string;
  templateId: string;
  weight?: number;
}

type AudienceContact = Pick<
  WaContact,
  'id' | 'phone' | 'name' | 'optInStatus' | 'isBlocked' | 'lastMarketingAt'
>;

/** Columns selected for any audience contact (kept in one place for paging). */
const AUDIENCE_SELECT = {
  id: true,
  phone: true,
  name: true,
  optInStatus: true,
  isBlocked: true,
  lastMarketingAt: true,
} as const;

/** How many contacts to page through at a time when materializing a segment. */
const AUDIENCE_PAGE_SIZE = 1000;

/** Rolling marketing-cap window. */
const MARKETING_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Read the singleton WhatsApp settings, falling back to a default cap of 1. */
async function getWaSettings(): Promise<{ marketingCapPer24h: number }> {
  const s = await prisma.waSettings.findUnique({
    where: { id: 'default' },
    select: { marketingCapPer24h: true },
  });
  return s ?? { marketingCapPer24h: 1 };
}

export async function createCampaign(input: CreateCampaignInput) {
  const channel = await getDefaultChannel();
  if (!channel) throw new AppError('WhatsApp is not configured', 400, 'WA_NOT_CONFIGURED');
  const tpl = await getTemplate(input.templateId);
  if (!tpl) throw new AppError('Template not found', 404, 'WA_TEMPLATE_NOT_FOUND');

  const type: WaCampaignType = input.type ?? 'BROADCAST';
  const isAbTest = input.isAbTest ?? false;

  // When a saved segment is referenced, source the audience from its stored
  // filter (segment audienceType) — overrides any inline audienceFilter.
  let audienceType = input.audienceType;
  let audienceFilter = input.audienceFilter;
  if (input.segmentId) {
    const segment = await getSegment(input.segmentId);
    audienceType = 'segment';
    audienceFilter = segment.filter;
  }

  const campaign = await prisma.waCampaign.create({
    data: {
      name: input.name,
      description: input.description,
      channelId: channel.id,
      templateId: input.templateId,
      type,
      status: input.scheduledAt ? 'SCHEDULED' : 'DRAFT',
      audienceType,
      audienceFilter: audienceFilter ?? undefined,
      variableMapping: input.variableMapping ?? undefined,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      batchSize: input.batchSize ?? 100,
      throttlePerSec: input.throttlePerSec ?? 15,
      isAbTest,
      recurrenceDays: input.recurrenceDays ?? null,
      createdBy: input.createdBy,
    },
  });

  // Persist the drip steps for a SEQUENCE campaign so the drip-tick cron can
  // advance recipients through them after launch.
  if (type === 'SEQUENCE' && input.steps?.length) {
    await setSequenceSteps(campaign.id, input.steps);
  }
  // A/B variants: materialize the weighted template split for this campaign.
  if (input.variants?.length) {
    await setVariants(campaign.id, input.variants);
  }
  return campaign;
}

interface UpdateCampaignInput {
  name?: string;
  description?: string | null;
  templateId?: string;
  scheduledAt?: string | null;
  batchSize?: number;
  throttlePerSec?: number;
  recurrenceDays?: number | null;
  segmentId?: string;
  audienceType?: 'segment' | 'upload' | 'manual';
  audienceFilter?: any;
  variableMapping?: string[];
}

/**
 * Edit a campaign that hasn't gone out yet (DRAFT or SCHEDULED only). Supports
 * RE-SCHEDULING (set/clear scheduledAt → status flips SCHEDULED/DRAFT, and the
 * per-minute cron picks up the new time) plus editing the core fields. Running/
 * paused/completed/cancelled campaigns are immutable here.
 */
export async function updateCampaign(id: string, patch: UpdateCampaignInput): Promise<WaCampaign> {
  const campaign = await prisma.waCampaign.findUnique({ where: { id } });
  if (!campaign) throw new AppError('Campaign not found', 404, 'WA_CAMPAIGN_NOT_FOUND');
  if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
    throw new AppError(
      'Only draft or scheduled campaigns can be edited',
      400,
      'WA_CAMPAIGN_NOT_EDITABLE'
    );
  }

  const data: Prisma.WaCampaignUpdateInput = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.templateId !== undefined) {
    const tpl = await getTemplate(patch.templateId);
    if (!tpl) throw new AppError('Template not found', 404, 'WA_TEMPLATE_NOT_FOUND');
    data.template = { connect: { id: patch.templateId } };
  }
  if (patch.batchSize !== undefined) data.batchSize = patch.batchSize;
  if (patch.throttlePerSec !== undefined) data.throttlePerSec = patch.throttlePerSec;
  if (patch.recurrenceDays !== undefined) data.recurrenceDays = patch.recurrenceDays;
  if (patch.variableMapping !== undefined) data.variableMapping = patch.variableMapping;

  // Audience: a saved segment overrides the inline filter (mirrors createCampaign).
  if (patch.segmentId) {
    const segment = await getSegment(patch.segmentId);
    data.audienceType = 'segment';
    data.audienceFilter = segment.filter ?? undefined;
  } else if (patch.audienceFilter !== undefined) {
    if (patch.audienceType) data.audienceType = patch.audienceType;
    data.audienceFilter = patch.audienceFilter ?? undefined;
  } else if (patch.audienceType !== undefined) {
    data.audienceType = patch.audienceType;
  }

  // Re-schedule: a future time arms SCHEDULED; clearing it returns to DRAFT.
  if (patch.scheduledAt !== undefined) {
    data.scheduledAt = patch.scheduledAt ? new Date(patch.scheduledAt) : null;
    data.status = patch.scheduledAt ? 'SCHEDULED' : 'DRAFT';
  }

  return prisma.waCampaign.update({ where: { id }, data });
}

/** Replace all A/B variants for a campaign (full-replace semantics). */
export async function setVariants(
  campaignId: string,
  variants: VariantInput[]
): Promise<WaCampaignVariant[]> {
  await prisma.waCampaignVariant.deleteMany({ where: { campaignId } });
  if (variants.length) {
    await prisma.waCampaignVariant.createMany({
      data: variants.map((v) => ({
        campaignId,
        label: v.label,
        templateId: v.templateId,
        weight: v.weight && v.weight > 0 ? v.weight : 1,
      })),
    });
  }
  return getVariants(campaignId);
}

/** List a campaign's A/B variants (with their per-variant counters). */
export async function getVariants(campaignId: string): Promise<WaCampaignVariant[]> {
  return prisma.waCampaignVariant.findMany({
    where: { campaignId },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Deterministically pick a variant index for a given incrementing recipient
 * index by walking the cumulative-weight buckets (weighted round-robin). With a
 * total weight W, recipient i lands in the bucket containing `i % W`, so over a
 * page the split tracks the configured weights exactly.
 */
function pickVariantIndex(cumulative: number[], total: number, index: number): number {
  const slot = total > 0 ? index % total : 0;
  for (let i = 0; i < cumulative.length; i += 1) {
    if (slot < cumulative[i]) return i;
  }
  return cumulative.length - 1;
}

export async function listCampaigns(filters: {
  status?: WaCampaignStatus;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, filters.limit ?? 30);
  const where: Prisma.WaCampaignWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.waCampaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { template: { select: { name: true, category: true } } },
    }),
    prisma.waCampaign.count({ where }),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getRecipientsForExport(campaignId: string) {
  return prisma.waCampaignRecipient.findMany({
    where: { campaignId },
    orderBy: { createdAt: 'asc' },
    take: 100_000,
    include: { contact: { select: { phone: true, name: true } } },
  });
}

export async function getCampaign(id: string) {
  return prisma.waCampaign.findUnique({
    where: { id },
    include: {
      template: { select: { name: true, language: true, category: true, status: true } },
    },
  });
}

export async function getRecipients(
  campaignId: string,
  page = 1,
  limit = 50,
  status?: WaCampaignRecipientStatus
) {
  const where: Prisma.WaCampaignRecipientWhereInput = {
    campaignId,
    ...(status ? { status } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.waCampaignRecipient.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { contact: { select: { phone: true, name: true } } },
    }),
    prisma.waCampaignRecipient.count({ where }),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/** Resolve a bounded (upload/manual) audience to a list of contacts (upserting uploaded phones). */
async function resolveUploadedContacts(campaign: WaCampaign): Promise<AudienceContact[]> {
  const phones: string[] = ((campaign.audienceFilter as any)?.phones ?? []).map(normalizeWaPhone);
  const out: AudienceContact[] = [];
  for (const phone of phones) {
    if (phone.replace(/[^\d]/g, '').length < 8) continue;
    const c = await prisma.waContact.upsert({
      where: { phone },
      update: {},
      create: { phone },
      select: AUDIENCE_SELECT,
    });
    out.push(c);
  }
  return out;
}

/** Build the WHERE clause for a 'segment' audience filter. Categorizes by
 *  opt-in status and custom tags. (The host platform also filtered on
 *  on/off-platform and the linked User's role; neither exists here.) */
function segmentWhere(campaign: WaCampaign): Prisma.WaContactWhereInput {
  const f = (campaign.audienceFilter as any) ?? {};
  return {
    isBlocked: false,
    ...(f.optInStatus ? { optInStatus: f.optInStatus as WaOptInStatus } : {}),
    ...(Array.isArray(f.tags) && f.tags.length ? { tags: { hasSome: f.tags } } : {}),
  };
}

/**
 * Stream the audience one page at a time (SCALE: never loads an unbounded
 * `findMany` of all contacts into memory). Upload/manual audiences are bounded
 * by the uploaded phone list, so they yield as a single page; 'segment'
 * audiences are paged with a stable id cursor.
 */
async function forEachAudiencePage(
  campaign: WaCampaign,
  fn: (page: AudienceContact[]) => Promise<void>
): Promise<void> {
  if (campaign.audienceType === 'upload' || campaign.audienceType === 'manual') {
    await fn(await resolveUploadedContacts(campaign));
    return;
  }
  const where = segmentWhere(campaign);
  let cursor: string | undefined;

  while (true) {
    const page = await prisma.waContact.findMany({
      where,
      select: AUDIENCE_SELECT,
      orderBy: { id: 'asc' },
      take: AUDIENCE_PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (page.length === 0) break;
    await fn(page);
    if (page.length < AUDIENCE_PAGE_SIZE) break;
    cursor = page[page.length - 1].id;
  }
}

function resolveVars(mapping: string[] | undefined, contact: AudienceContact): string[] {
  if (!mapping) return [];
  return mapping.map((tok) => {
    if (tok === '{{name}}') return contact.name ?? '';
    if (tok === '{{phone}}') return contact.phone;
    return tok;
  });
}

/**
 * Filter audience down to eligible recipients.
 *  - Never to blocked or suppressed (do-not-contact list) contacts.
 *  - MARKETING requires *positive* consent (OPTED_IN); non-marketing only needs
 *    "not opted out".
 *  - Per-contact 24h marketing frequency cap (see `overMarketingCap`).
 */
function eligible(
  contacts: AudienceContact[],
  isMarketing: boolean,
  marketingCap: number,
  suppressed: Set<string>,
  now = Date.now()
): AudienceContact[] {
  return contacts.filter((c) => {
    if (c.isBlocked) return false;
    if (suppressed.has(c.phone)) return false;
    if (isMarketing) {
      if (c.optInStatus !== 'OPTED_IN') return false;
      // Frequency cap. This is the cheap pre-filter — `lastMarketingAt` alone
      // cannot tell 1 from N in the window, so it only screens out contacts that
      // are definitely over a cap of 1. The authoritative count runs at the send
      // (whatsapp-send.service.ts), which is also what catches manual, drip and
      // scheduled sends that never pass through here at all.
      if (marketingCap === 1 && c.lastMarketingAt) {
        if (now - c.lastMarketingAt.getTime() < MARKETING_WINDOW_MS) return false;
      }
      return true;
    }
    return c.optInStatus !== 'OPTED_OUT';
  });
}

/** Preview the eligible recipient count + estimated cost for a draft campaign. */
export async function previewAudienceCount(
  campaignId: string
): Promise<{ count: number; estimatedCostPaise: number }> {
  const campaign = await prisma.waCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new AppError('Campaign not found', 404, 'WA_CAMPAIGN_NOT_FOUND');
  const tpl = await getTemplate(campaign.templateId);
  const isMarketing = tpl?.category === 'MARKETING';
  const { marketingCapPer24h } = await getWaSettings();
  const suppressed = await getSuppressedPhoneSet();
  const now = Date.now();
  // Count eligible across pages so a huge segment is never fully buffered.
  let count = 0;
  await forEachAudiencePage(campaign, async (page) => {
    count += eligible(page, isMarketing, marketingCapPer24h, suppressed, now).length;
  });
  return { count, estimatedCostPaise: count * ratePaise(tpl?.category) };
}

/**
 * Materialize eligible recipients into WaCampaignRecipient rows, paging through
 * the audience and inserting each page with createMany (never buffering the
 * whole audience). Returns the total recipient count for the campaign.
 */
async function materialize(campaign: WaCampaign, isMarketing: boolean): Promise<number> {
  const mapping = Array.isArray(campaign.variableMapping)
    ? (campaign.variableMapping as string[])
    : undefined;
  const { marketingCapPer24h } = await getWaSettings();
  const suppressed = await getSuppressedPhoneSet();
  const now = Date.now();

  // A/B split setup: build cumulative weight buckets once. The incrementing
  // `assigned` index is shared across pages so the weighted split holds for the
  // whole audience, not just within a single page.
  const variants = campaign.isAbTest
    ? await prisma.waCampaignVariant.findMany({
        where: { campaignId: campaign.id },
        orderBy: { createdAt: 'asc' },
      })
    : [];
  const useVariants = variants.length > 0;
  let totalWeight = 0;
  const cumulative = variants.map((v) => (totalWeight += Math.max(1, v.weight)));
  let assigned = 0;

  await forEachAudiencePage(campaign, async (page) => {
    const rows = eligible(page, isMarketing, marketingCapPer24h, suppressed, now).map((c) => {
      const variantId = useVariants
        ? variants[pickVariantIndex(cumulative, totalWeight, assigned++)].id
        : null;
      return {
        campaignId: campaign.id,
        contactId: c.id,
        variantId,
        variables: resolveVars(mapping, c),
        status: 'PENDING' as WaCampaignRecipientStatus,
      };
    });
    if (rows.length === 0) return;
    await prisma.waCampaignRecipient.createMany({ data: rows, skipDuplicates: true });
  });
  return prisma.waCampaignRecipient.count({ where: { campaignId: campaign.id } });
}

/**
 * Enqueue every PENDING recipient of a campaign, in batches, without ever
 * holding the whole id list in memory.
 *
 * The three call sites (launch, retry-failed, recovery cron) each did an
 * unbounded `findMany` of every PENDING recipient and then sliced the array —
 * so a 500k-recipient campaign materialized 500k rows in the Node heap before
 * the first job was queued. The same file already pages its audience scan at
 * 1000 with an explicit note about exactly this hazard (`forEachAudiencePage`);
 * the pending scan simply never got the same treatment.
 *
 * Keyset pagination on the primary key: stable under concurrent writes, and no
 * OFFSET growth.
 */
export async function enqueuePendingRecipients(
  campaignId: string,
  batchSize: number,
  /** Stop after this many recipients (the recovery cron bounds its sweep). */
  cap?: number
): Promise<number> {
  const PAGE = Math.max(batchSize, 1000);
  let cursor: string | undefined;
  let queued = 0;
  let buffer: string[] = [];

  const flush = async (all: boolean) => {
    while (buffer.length >= batchSize || (all && buffer.length > 0)) {
      const slice = buffer.slice(0, batchSize);
      buffer = buffer.slice(batchSize);
      await addCampaignBatchJob({ campaignId, recipientIds: slice });
      queued += slice.length;
    }
  };

  for (;;) {
    const page: Array<{ id: string }> = await prisma.waCampaignRecipient.findMany({
      where: { campaignId, status: 'PENDING' },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (page.length === 0) break;
    buffer.push(...page.map((r) => r.id));
    cursor = page[page.length - 1].id;
    await flush(false);
    if (page.length < PAGE) break;
    if (cap != null && queued + buffer.length >= cap) break;
  }
  if (cap != null && queued + buffer.length > cap) {
    buffer = buffer.slice(0, Math.max(0, cap - queued));
  }
  await flush(true);
  return queued;
}

/** Launch (or resume) a campaign: materialize recipients + enqueue batches. */
export async function launchCampaign(id: string) {
  const campaign = await prisma.waCampaign.findUnique({ where: { id } });
  if (!campaign) throw new AppError('Campaign not found', 404, 'WA_CAMPAIGN_NOT_FOUND');
  if (!['DRAFT', 'SCHEDULED', 'PAUSED'].includes(campaign.status)) {
    throw new AppError(`Cannot launch a ${campaign.status} campaign`, 409, 'WA_CAMPAIGN_BAD_STATE');
  }
  const tpl = await getTemplate(campaign.templateId);
  if (!tpl || tpl.status !== 'APPROVED') {
    throw new AppError('Campaign template is not approved', 409, 'WA_TEMPLATE_NOT_APPROVED');
  }

  // (1) ATOMIC LAUNCH CLAIM — compare-and-set status to RUNNING in a single
  // statement. Only the winner proceeds to materialize + enqueue; this kills the
  // cron/manual double-launch (and the duplicate billing it caused). Materialize
  // + enqueue happen strictly AFTER the claim.
  const claim = await prisma.waCampaign.updateMany({
    where: { id, status: { in: ['DRAFT', 'SCHEDULED', 'PAUSED'] } },
    data: { status: 'RUNNING', startedAt: campaign.startedAt ?? new Date() },
  });
  if (claim.count !== 1) {
    // Lost the race — already claimed by another launcher. Return current state.
    return prisma.waCampaign.findUnique({ where: { id } });
  }

  let total = await prisma.waCampaignRecipient.count({ where: { campaignId: id } });
  if (total === 0) total = await materialize(campaign, tpl.category === 'MARKETING');
  if (total === 0) {
    // We claimed but there's nothing to send — release the claim back to DRAFT so
    // the campaign isn't stuck RUNNING with zero recipients, then surface the error.
    await prisma.waCampaign
      .update({ where: { id }, data: { status: 'DRAFT', startedAt: campaign.startedAt ?? null } })
      .catch(() => {});
    throw new AppError('No eligible recipients for this audience', 400, 'WA_NO_RECIPIENTS');
  }

  await prisma.waCampaign.update({
    where: { id },
    data: {
      totalRecipients: total,
      estimatedCostPaise: total * ratePaise(tpl.category),
    },
  });

  // SEQUENCE (drip) campaigns are NOT batch-blasted: startSequence arms every
  // recipient at step 0 and the `wa-drip-tick` cron sends each step at its delay.
  if (campaign.type === 'SEQUENCE') {
    await startSequence(id);
    return prisma.waCampaign.findUnique({ where: { id } });
  }

  await enqueuePendingRecipients(id, campaign.batchSize || 100);
  return prisma.waCampaign.findUnique({ where: { id } });
}

export async function pauseCampaign(id: string) {
  return prisma.waCampaign.update({ where: { id }, data: { status: 'PAUSED' } });
}

export async function resumeCampaign(id: string) {
  return launchCampaign(id);
}

export async function cancelCampaign(id: string) {
  return prisma.waCampaign.update({
    where: { id },
    data: { status: 'CANCELLED', completedAt: new Date() },
  });
}

/** Add N days to a base date (used for recurrence scheduling). */
function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Recurring re-run: clone the source campaign into a fresh DRAFT (same template,
 * audience, variable mapping, type, variants, recurrence cadence) tagged with
 * `parentCampaignId`, launch the clone, then disarm the SOURCE by pushing its
 * `nextRunAt` forward by recurrenceDays so the cron won't re-fire it until the
 * next window. Returns the launched clone. Used by the recurring cron.
 */
export async function cloneCampaign(
  campaignId: string,
  opts: { launch?: boolean; nameSuffix?: string } = {}
): Promise<WaCampaign> {
  const source = await prisma.waCampaign.findUnique({ where: { id: campaignId } });
  if (!source) throw new AppError('Campaign not found', 404, 'WA_CAMPAIGN_NOT_FOUND');

  const clone = await prisma.waCampaign.create({
    data: {
      name: `${source.name}${opts.nameSuffix ?? ''}`,
      description: source.description,
      channelId: source.channelId,
      templateId: source.templateId,
      type: source.type,
      status: 'DRAFT',
      audienceType: source.audienceType,
      audienceFilter: source.audienceFilter ?? undefined,
      variableMapping: source.variableMapping ?? undefined,
      batchSize: source.batchSize,
      throttlePerSec: source.throttlePerSec,
      isAbTest: source.isAbTest,
      // NOT copied: the clone must never carry the cadence. Only the source
      // holds `recurrenceDays` and gets its `nextRunAt` advanced. When the clone
      // inherited it, the clone armed its own `nextRunAt` on completion and the
      // recurring tick (which does not distinguish parents from children) then
      // cloned the clone — 2 campaigns after one cycle, 4 after two, 8 after
      // three, each re-sending the same template to the same audience.
      recurrenceDays: null,
      parentCampaignId: source.id,
      createdBy: source.createdBy,
    },
  });

  // Carry the A/B variants (and drip steps) onto the clone so it behaves
  // identically to the original.
  const variants = await getVariants(source.id);
  if (variants.length) {
    await prisma.waCampaignVariant.createMany({
      data: variants.map((v) => ({
        campaignId: clone.id,
        label: v.label,
        templateId: v.templateId,
        weight: v.weight,
      })),
    });
  }
  if (source.type === 'SEQUENCE') {
    const steps = await prisma.waCampaignStep.findMany({
      where: { campaignId: source.id },
      orderBy: { stepOrder: 'asc' },
    });
    if (steps.length) {
      await setSequenceSteps(
        clone.id,
        steps.map((s) => ({
          stepOrder: s.stepOrder,
          templateId: s.templateId,
          delayHours: s.delayHours,
          condition: s.condition,
        }))
      );
    }
  }

  // launch=true (recurrence cron): send immediately + push the source's next run
  // forward one cadence. launch=false (manual Duplicate): leave an editable DRAFT.
  if (opts.launch) {
    try {
      await launchCampaign(clone.id);
    } catch (err) {
      // Clean up after ourselves. `launchCampaign` throws WA_NO_RECIPIENTS
      // whenever the audience materializes to zero — the NORMAL outcome when
      // everyone is inside the 24h marketing cap or has been suppressed. The
      // clone was created before the launch, so each failed run used to leave a
      // fresh orphan DRAFT behind.
      await prisma.waCampaign.delete({ where: { id: clone.id } }).catch(() => {});
      throw err;
    } finally {
      // Advance the cadence whether or not the launch succeeded. Skipping this
      // on failure left the source still due, so the recurring cron retried it
      // on the very next tick — hourly, forever, minting an orphan every time.
      // A failed run should cost one cycle.
      if (source.recurrenceDays && source.recurrenceDays > 0) {
        await prisma.waCampaign
          .update({
            where: { id: source.id },
            data: { nextRunAt: addDays(new Date(), source.recurrenceDays) },
          })
          .catch(() => {});
      }
    }
  }

  return clone;
}

/** Recurring re-run (cron): clone the source, launch it, advance its cadence. */
export async function cloneAndLaunchRecurring(campaignId: string): Promise<WaCampaign> {
  return cloneCampaign(campaignId, { launch: true });
}

/** Reset FAILED recipients back to PENDING and re-enqueue them. */
export async function retryFailedRecipients(id: string) {
  const campaign = await prisma.waCampaign.findUnique({ where: { id } });
  if (!campaign) throw new AppError('Campaign not found', 404, 'WA_CAMPAIGN_NOT_FOUND');

  // Idempotent: only FAILED rows reset (already-PENDING/SENT rows are untouched),
  // and we clear wamid/sentAt so the worker's per-recipient claim treats them as
  // brand-new sends.
  //
  // Only failures that could plausibly succeed on a retry. This used to reset
  // EVERY failed row and clear its error code, so a number Meta had permanently
  // rejected (131026 — not a WhatsApp user) was re-sent on every retry, forever,
  // spending a conversation credit each time and never succeeding. A null code
  // counts as retryable: those rows predate error-code capture on the webhook
  // path, so we cannot say they are permanent.
  const failed = await prisma.waCampaignRecipient.findMany({
    where: { campaignId: id, status: 'FAILED' },
    select: { id: true, errorCode: true },
  });
  const retryableIds = failed
    .filter((r) => r.errorCode == null || isRetryableErrorCode(r.errorCode))
    .map((r) => r.id);
  const reset = retryableIds.length
    ? await prisma.waCampaignRecipient.updateMany({
        where: { id: { in: retryableIds } },
        data: { status: 'PENDING', wamid: null, errorCode: null, sentAt: null },
      })
    : { count: 0 };
  if (reset.count === 0) {
    throw new AppError(
      failed.length
        ? 'No retryable failures — every failed recipient was permanently rejected by Meta'
        : 'No failed recipients to retry',
      400,
      'WA_NO_FAILED_RECIPIENTS'
    );
  }

  // Re-open the campaign and recompute counters from the recipient table (no
  // fragile decrement math) so failedCount reflects the post-reset reality.
  await prisma.waCampaign.update({
    where: { id },
    data: { status: 'RUNNING', completedAt: null },
  });
  await recomputeCampaignCounters(id);

  await enqueuePendingRecipients(id, campaign.batchSize || 100);
  return prisma.waCampaign.findUnique({ where: { id } });
}

const RECIP_RANK: Record<string, number> = {
  PENDING: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
  FAILED: 3,
  SKIPPED: 3,
};

/**
 * (4) COUNTER INTEGRITY — recompute the campaign's denormalized counters from
 * the source of truth (a groupBy over WaCampaignRecipient.status) instead of
 * trusting monotonic increments. This self-heals drift and guarantees counters
 * never exceed totalRecipients. `sentCount` counts every recipient that left
 * our system (SENT + DELIVERED + READ); delivered/read are tracked distinctly.
 * Also rolls up actualCostPaise = sum of this campaign's WaMessage.costPaise.
 *
 * Safe to call from many places (worker batch end, status webhook) — it is
 * idempotent and only ever writes absolute values.
 */
export async function recomputeCampaignCounters(campaignId: string): Promise<void> {
  const [groups, cost, total, replied, converted] = await Promise.all([
    prisma.waCampaignRecipient.groupBy({
      by: ['status'],
      where: { campaignId },
      _count: { _all: true },
    }),
    prisma.waMessage.aggregate({
      where: { campaignId, costPaise: { not: null } },
      _sum: { costPaise: true },
    }),
    prisma.waCampaignRecipient.count({ where: { campaignId } }),
    // Self-heal the funnel's Replied + Converted stages (previously only the
    // per-variant repliedCount was recomputed, so the campaign-level Replied read
    // zero for non-A/B campaigns, and convertedCount only ever incremented).
    prisma.waCampaignRecipient.count({ where: { campaignId, repliedAt: { not: null } } }),
    prisma.waConversion.count({ where: { campaignId } }),
  ]);

  const by: Record<string, number> = {};
  for (const g of groups) by[g.status] = g._count._all;
  const sent = (by.SENT ?? 0) + (by.DELIVERED ?? 0) + (by.READ ?? 0);
  const delivered = (by.DELIVERED ?? 0) + (by.READ ?? 0);
  const read = by.READ ?? 0;
  const failed = by.FAILED ?? 0;
  const skipped = by.SKIPPED ?? 0;

  await prisma.waCampaign
    .update({
      where: { id: campaignId },
      data: {
        totalRecipients: total,
        sentCount: sent,
        deliveredCount: delivered,
        readCount: read,
        failedCount: failed,
        skippedCount: skipped,
        repliedCount: replied,
        convertedCount: converted,
        actualCostPaise: cost._sum.costPaise ?? 0,
      },
    })
    .catch(() => {});

  await recomputeVariantCounters(campaignId);
}

/**
 * Recompute per-variant counters (sent/delivered/read/replied) for an A/B
 * campaign from the recipient table via a groupBy on variantId+status. Like the
 * campaign-level recompute, this writes absolute values so it self-heals. No-op
 * when the campaign has no variants.
 */
async function recomputeVariantCounters(campaignId: string): Promise<void> {
  const variants = await prisma.waCampaignVariant.findMany({
    where: { campaignId },
    select: { id: true },
  });
  if (variants.length === 0) return;

  // Split by status (sent/delivered/read), then count replies separately since a
  // reply is tracked by repliedAt on the recipient, not by a recipient status.
  const [groups, repliedGroups] = await Promise.all([
    prisma.waCampaignRecipient.groupBy({
      by: ['variantId', 'status'],
      where: { campaignId, variantId: { not: null } },
      _count: { _all: true },
    }),
    prisma.waCampaignRecipient.groupBy({
      by: ['variantId'],
      where: { campaignId, variantId: { not: null }, repliedAt: { not: null } },
      _count: { _all: true },
    }),
  ]);

  // variantId -> status -> count
  const byVariant: Record<string, Record<string, number>> = {};
  for (const g of groups) {
    if (!g.variantId) continue;
    (byVariant[g.variantId] ??= {})[g.status] = g._count._all;
  }
  const repliedByVariant: Record<string, number> = {};
  for (const g of repliedGroups) {
    if (g.variantId) repliedByVariant[g.variantId] = g._count._all;
  }

  await Promise.all(
    variants.map((v) => {
      const by = byVariant[v.id] ?? {};
      const sent = (by.SENT ?? 0) + (by.DELIVERED ?? 0) + (by.READ ?? 0);
      const delivered = (by.DELIVERED ?? 0) + (by.READ ?? 0);
      const read = by.READ ?? 0;
      const replied = repliedByVariant[v.id] ?? 0;
      return prisma.waCampaignVariant
        .update({
          where: { id: v.id },
          data: {
            sentCount: sent,
            deliveredCount: delivered,
            readCount: read,
            repliedCount: replied,
          },
        })
        .catch(() => {});
    })
  );
}

/**
 * Reconcile a campaign recipient + campaign counters from a delivery-status
 * webhook (called by the inbound worker). Forward-only by status rank, then
 * recompute counters from the recipient table so they self-heal.
 */
export async function reconcileRecipientStatus(
  wamid: string,
  status: WaCampaignRecipientStatus,
  opts: { errorCode?: string | null } = {}
): Promise<void> {
  const recipient = await prisma.waCampaignRecipient.findFirst({ where: { wamid } });
  if (!recipient || !recipient.campaignId) return;
  if (RECIP_RANK[status] <= RECIP_RANK[recipient.status]) return;

  // A cap / opted-out code is a SKIP, not a failure — same classification the
  // synchronous send path uses, so the two agree about what a campaign's
  // numbers mean.
  const finalStatus =
    status === 'FAILED' && isSkipErrorCode(opts.errorCode)
      ? ('SKIPPED' as WaCampaignRecipientStatus)
      : status;

  await prisma.waCampaignRecipient.update({
    where: { id: recipient.id },
    data: {
      status: finalStatus,
      ...(opts.errorCode ? { errorCode: opts.errorCode } : {}),
    },
  });
  // Coalesced, not awaited. The per-recipient row write above is the durable
  // part; the campaign rollup can lag a few seconds.
  scheduleCampaignCounterRecompute(recipient.campaignId);
}

/**
 * Debounce window for campaign counter recomputes triggered by webhooks.
 */
const RECOMPUTE_DEBOUNCE_MS = 5000;
const pendingRecomputes = new Map<string, NodeJS.Timeout>();

/**
 * Coalesce campaign counter recomputes.
 *
 * `recomputeCampaignCounters` is a full rebuild: two groupBys, an aggregate
 * and three counts over every recipient and message of the campaign, plus two
 * more groupBys for variants. That is the right shape for a periodic self-heal
 * and the wrong shape for a hot path — and it was being run once per delivery
 * status webhook. Meta sends `sent`, `delivered` and `read` for every single
 * message, so a 50k campaign meant ~150k full rebuilds, from an inbound worker
 * at concurrency 10 against a pool of 5 connections. The queue backs up, the
 * pool starves, and inbound customer replies — sharing that worker — stall
 * behind counter maintenance.
 *
 * One rebuild per campaign per window instead. Trailing edge, so the last
 * status in a burst is always included. The campaign worker still recomputes
 * at the end of every batch and the recovery cron still self-heals, so this
 * only ever delays the number on screen.
 */
export function scheduleCampaignCounterRecompute(campaignId: string): void {
  if (pendingRecomputes.has(campaignId)) return; // already queued for this window
  const timer = setTimeout(() => {
    pendingRecomputes.delete(campaignId);
    recomputeCampaignCounters(campaignId).catch((e) => {
      logger.warn(
        `WhatsApp campaign counter recompute failed for ${campaignId}: ` +
          `${e instanceof Error ? e.message : String(e)}`
      );
    });
  }, RECOMPUTE_DEBOUNCE_MS);
  timer.unref?.(); // never hold the process open during shutdown
  pendingRecomputes.set(campaignId, timer);
}

/** Flush every pending recompute now — called during graceful shutdown. */
export async function flushPendingCounterRecomputes(): Promise<void> {
  const ids = [...pendingRecomputes.keys()];
  for (const id of ids) {
    const t = pendingRecomputes.get(id);
    if (t) clearTimeout(t);
    pendingRecomputes.delete(id);
  }
  await Promise.allSettled(ids.map((id) => recomputeCampaignCounters(id)));
}
