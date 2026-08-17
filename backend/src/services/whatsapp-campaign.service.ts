import { prisma } from '../config/prisma';
import logger from '../config/logger';
import { AppError } from '../middleware/error';
import {
  getDefaultChannel,
  getPhoneHealthStatus,
  type WaHealthEntity,
} from './whatsapp-channel.service';
import { getTemplate, getTemplateHealthStatus } from './whatsapp-template.service';
import { normalizeWaPhone, segmentContactWhere } from './whatsapp-contact.service';
import { setSequenceSteps, startSequence, resumeSequence } from './whatsapp-sequence.service';
import { analyzeTemplateSpec } from './whatsapp-template.service';
import type { TemplateSendCarouselCard } from './whatsapp-template.service';
import { getSegment } from './whatsapp-segment.service';
import { forEachSuppressedPhonePage, getSuppressedPhonesIn } from './whatsapp-suppression.service';
import { addCampaignBatchJob } from '../jobs/whatsapp-campaign.queue';
import { emitWaEvent } from './whatsapp-events.service';
import { emitWa } from '../utils/whatsapp-realtime';
import { Prisma } from '@prisma/client';
import type {
  WaCampaign,
  WaCampaignStatus,
  WaCampaignRecipientStatus,
  WaCampaignType,
  WaCampaignVariant,
  WaAudienceType,
  WaContact,
  WaOptInStatus,
} from '@prisma/client';

// Estimated per-message cost (paise) by template category, for cost previews.
//
// It used to read the three WHATSAPP_PRICE_*_PAISE env constants directly and
// nothing ever checked them against what Meta actually billed. `resolveRatePaise`
// prefers the rate observed in Meta's own pricing analytics and only falls back
// to the constant, so a wrong guess self-corrects once the daily cost sync has
// run rather than quietly skewing every budget forecast.
import { resolveRatePaise } from './whatsapp-pricing';

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

/**
 * The template parameters that are CONSTANT across a campaign's audience.
 * Body variables are per-recipient and live on WaCampaignRecipient.variables.
 */
export interface CampaignTemplateParams {
  headerText?: string;
  headerMediaUrl?: string;
  headerMediaType?: 'image' | 'video' | 'document';
  buttonUrlParam?: string;
  /** COPY_CODE button value — one coupon shared by the whole audience. */
  couponCode?: string;
  /** LIMITED_TIME_OFFER countdown expiry, epoch ms. */
  ltoExpirationMs?: number;
  /**
   * CAROUSEL cards, in card order — one entry per card the template was approved
   * with. Campaign-wide, exactly like the header media above: every recipient
   * gets the same card images and card text, and only the bubble's body mapping
   * is personalised per recipient.
   */
  carouselCards?: TemplateSendCarouselCard[];
}

interface CreateCampaignInput {
  name: string;
  description?: string;
  templateId: string;
  audienceType: 'segment' | 'upload' | 'manual';
  // segment: { tags?, optInStatus?, attributes? } · upload/manual: { phones: string[] }
  audienceFilter?: any;
  segmentId?: string; // when set, the campaign's audienceFilter is sourced from this saved segment
  variableMapping?: string[]; // per body var: literal or {{name}} / {{phone}}
  /** Campaign-level template send params (header media/text, URL-button suffix). */
  templateParams?: CampaignTemplateParams;
  scheduledAt?: string;
  /** Hold sends (and drip steps) outside WaSettings.businessHours. */
  respectBusinessHours?: boolean;
  batchSize?: number;
  throttlePerSec?: number;
  type?: WaCampaignType; // 'BROADCAST' (default) | 'SEQUENCE'
  steps?: any[]; // sequence steps (only used when type === 'SEQUENCE')
  isAbTest?: boolean; // split recipients across weighted template variants
  variants?: VariantInput[]; // A/B variants (only used when isAbTest)
  /** Launch to this % of the eligible audience only, holding the rest back for the winner. */
  abTestSamplePct?: number | null;
  /** Which rate decides the winner: 'delivered' | 'read' | 'replied'. */
  abTestMetric?: WaAbMetric | null;
  recurrenceDays?: number | null; // re-run every N days (null = one-off)
  createdBy: string;
}

/** One A/B variant on create/update: a template + a relative weight. */
interface VariantInput {
  label: string;
  templateId: string;
  /** Per-variant {{n}} mapping. Variants may use different templates. */
  variableMapping?: string[];
  weight?: number;
}

type AudienceContact = Pick<
  WaContact,
  | 'id'
  | 'phone'
  | 'name'
  | 'optInStatus'
  | 'isBlocked'
  | 'lastMarketingAt'
  | 'marketingRefusedAt'
  | 'attributes'
>;

/** Columns selected for any audience contact (kept in one place for paging). */
const AUDIENCE_SELECT = {
  id: true,
  phone: true,
  name: true,
  optInStatus: true,
  isBlocked: true,
  lastMarketingAt: true,
  marketingRefusedAt: true,
  // Personalisation beyond name/phone reads from here (`{{attr.city}}`), so it
  // has to travel with the audience — selecting it at send time would be one
  // extra query per recipient.
  attributes: true,
} as const;

/** How many contacts to page through at a time when materializing a segment. */
const AUDIENCE_PAGE_SIZE = 1000;

/** How many uploaded phone numbers are turned into contact rows per statement. */
const UPLOAD_PERSIST_CHUNK = 1000;

/**
 * The rate an A/B test can be decided on.
 *
 * All three are counted per variant off WaCampaignRecipient, and all three are
 * expressed over that variant's SENT count so the denominators are comparable —
 * read/delivered would flatter a variant whose messages mostly failed to deliver.
 */
export type WaAbMetric = 'delivered' | 'read' | 'replied';
export const WA_AB_METRICS: readonly WaAbMetric[] = ['delivered', 'read', 'replied'];
/** Replies are the closest of the three to intent, so it is the default. */
export const DEFAULT_AB_METRIC: WaAbMetric = 'replied';
/** Two-sided z at 95% — the bar "significant" means everywhere in this module. */
const Z_95 = 1.96;

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

/**
 * Parse a Meta messaging tier to the number of DISTINCT contacts the number may
 * start a conversation with in 24h ('1K', 'TIER_10K', '100K' → 1000/10000/100000).
 *
 * Returns null whenever there is no daily allowance to enforce: an absent or
 * unrecognized tier, 'UNLIMITED', or one of the per-second throughput levels
 * ('STANDARD'/'HIGH') Meta reports for numbers on per-message pricing — those are
 * a rate, not a daily cap, and reading them as one would refuse every campaign.
 */
export function tierDailyLimit(tier: string | null | undefined): number | null {
  const t = String(tier ?? '')
    .toUpperCase()
    .replace(/^TIER[_-]?/, '')
    .trim();
  if (!t || t.includes('UNLIMITED')) return null;
  const m = t.match(/^(\d+(?:\.\d+)?)\s*([KMB]?)$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const mult = m[2] === 'K' ? 1_000 : m[2] === 'M' ? 1_000_000 : m[2] === 'B' ? 1_000_000_000 : 1;
  return Math.round(n * mult);
}

export interface WaTierBudget {
  /** Daily unique-recipient cap, or null when the tier imposes none we can read. */
  limit: number | null;
  /** Distinct contacts already sent a template inside the rolling 24h window. */
  uniqueSentLast24h: number;
  /** Contacts that may still be started today; null when there is no cap. */
  remaining: number | null;
}

/**
 * How much of the channel's Meta messaging tier is still available today.
 *
 * The tier used to be read in exactly one place — a Prometheus gauge — so nothing
 * that sends knew about it. An operator on a 1K tier could launch a 50,000-recipient
 * campaign; it was accepted, materialized, and spent the whole daily allowance in
 * minutes, after which Meta refused every remaining recipient with 131056/130497.
 * Those refusals are what degrade the number's quality rating and eventually get it
 * restricted, so the allowance has to be checked before sending rather than
 * discovered from the failures.
 */
export async function getMessagingTierBudget(): Promise<WaTierBudget> {
  const channel = await getDefaultChannel();
  const limit = tierDailyLimit(channel?.messagingTier);
  // No enforceable cap — skip the count entirely rather than pay for a number
  // nothing can act on.
  if (limit === null) return { limit: null, uniqueSentLast24h: 0, remaining: null };
  // The tier counts CONTACTS, not messages, and Prisma cannot express a distinct
  // count: `groupBy` would return one row per contact — a tier's worth of rows
  // pulled into Node just to read `.length`. FAILED sends are excluded because a
  // message Meta refused never opened a conversation, so it consumed no allowance.
  // The window bound is computed in SQL as a UTC timestamp (the same shape the
  // analytics queries use): `createdAt` is `timestamp without time zone` holding
  // UTC, so comparing it to a bound timestamptz would silently shift the window by
  // the database session's timezone.
  const rows = await prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
    SELECT COUNT(DISTINCT "contactId") AS count
    FROM "WaMessage"
    WHERE "direction" = 'OUTBOUND'
      AND "type" = 'TEMPLATE'
      AND "status" <> 'FAILED'
      AND "createdAt" >= (now() AT TIME ZONE 'UTC') - interval '24 hours'
  `);
  const uniqueSentLast24h = Number(rows[0]?.count ?? 0);
  return { limit, uniqueSentLast24h, remaining: Math.max(0, limit - uniqueSentLast24h) };
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
  let segmentId: string | null = null;
  if (input.segmentId) {
    const segment = await getSegment(input.segmentId);
    audienceType = 'segment';
    audienceFilter = segment.filter;
    // Recorded as PROVENANCE only — `audienceFilter` above stays the snapshot the
    // launch resolves. It exists so "save as blueprint" can keep the link to the
    // live segment instead of freezing a copy of its filter forever.
    segmentId = segment.id;
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
      segmentId,
      variableMapping: input.variableMapping ?? undefined,
      templateParams: (input.templateParams as Prisma.InputJsonValue) ?? undefined,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      respectBusinessHours: input.respectBusinessHours ?? false,
      batchSize: input.batchSize ?? 100,
      throttlePerSec: input.throttlePerSec ?? 15,
      isAbTest,
      // Only meaningful for an A/B test; storing them on a plain broadcast would
      // cap its audience at the sample percentage for no reason.
      abTestSamplePct: isAbTest ? (input.abTestSamplePct ?? null) : null,
      abTestMetric: isAbTest ? (input.abTestMetric ?? DEFAULT_AB_METRIC) : null,
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
  respectBusinessHours?: boolean;
  batchSize?: number;
  throttlePerSec?: number;
  recurrenceDays?: number | null;
  segmentId?: string;
  audienceType?: 'segment' | 'upload' | 'manual';
  audienceFilter?: any;
  variableMapping?: string[];
  /** Pass {} (or null) to clear; see updateCampaign for why null is stored as {}. */
  templateParams?: CampaignTemplateParams | null;
  abTestSamplePct?: number | null;
  abTestMetric?: WaAbMetric | null;
}

/**
 * Fields an A/B test keeps editable after launch.
 *
 * `abTestMetric` chooses which number the A/B panel judges on — a reporting
 * choice that changes nothing about what is sent — and the panel only exists
 * once a campaign is RUNNING or later. Gating it with the rest of the edit form
 * made the panel's "Judge on" selector reject every change with "Only draft or
 * scheduled campaigns can be edited", so the operator could not switch a
 * finished test from replies to reads before declaring a winner.
 */
const POST_LAUNCH_EDITABLE: ReadonlySet<string> = new Set(['abTestMetric']);

/**
 * Edit a campaign that hasn't gone out yet (DRAFT or SCHEDULED only). Supports
 * RE-SCHEDULING (set/clear scheduledAt → status flips SCHEDULED/DRAFT, and the
 * per-minute cron picks up the new time) plus editing the core fields. Running/
 * paused/completed/cancelled campaigns are immutable here, except for the
 * decision-time A/B fields above.
 */
export async function updateCampaign(id: string, patch: UpdateCampaignInput): Promise<WaCampaign> {
  const campaign = await prisma.waCampaign.findUnique({ where: { id } });
  if (!campaign) throw new AppError('Campaign not found', 404, 'WA_CAMPAIGN_NOT_FOUND');
  const touched = Object.entries(patch)
    .filter(([, v]) => v !== undefined)
    .map(([k]) => k);
  const decisionOnly =
    campaign.isAbTest && touched.length > 0 && touched.every((k) => POST_LAUNCH_EDITABLE.has(k));
  if (!decisionOnly && campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
    throw new AppError(
      'Only draft or scheduled campaigns can be edited',
      400,
      'WA_CAMPAIGN_NOT_EDITABLE'
    );
  }

  const data: Prisma.WaCampaignUpdateInput = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.templateParams !== undefined) {
    // Stored as {} rather than SQL NULL when cleared: every reader already
    // treats a missing object as "no params" (`templateParams ?? {}`), and using
    // Prisma.DbNull would force a value import of Prisma purely for this line.
    data.templateParams = (patch.templateParams ?? {}) as Prisma.InputJsonValue;
  }
  if (patch.templateId !== undefined) {
    const tpl = await getTemplate(patch.templateId);
    if (!tpl) throw new AppError('Template not found', 404, 'WA_TEMPLATE_NOT_FOUND');
    data.template = { connect: { id: patch.templateId } };
  }
  if (patch.batchSize !== undefined) data.batchSize = patch.batchSize;
  if (patch.throttlePerSec !== undefined) data.throttlePerSec = patch.throttlePerSec;
  if (patch.respectBusinessHours !== undefined) {
    data.respectBusinessHours = patch.respectBusinessHours;
  }
  if (patch.recurrenceDays !== undefined) data.recurrenceDays = patch.recurrenceDays;
  if (patch.variableMapping !== undefined) data.variableMapping = patch.variableMapping;
  if (patch.abTestSamplePct !== undefined) data.abTestSamplePct = patch.abTestSamplePct;
  if (patch.abTestMetric !== undefined) data.abTestMetric = patch.abTestMetric;

  // Audience: a saved segment overrides the inline filter (mirrors createCampaign).
  if (patch.segmentId) {
    const segment = await getSegment(patch.segmentId);
    data.audienceType = 'segment';
    data.audienceFilter = segment.filter ?? undefined;
    data.segmentId = segment.id;
  } else if (patch.audienceFilter !== undefined) {
    if (patch.audienceType) data.audienceType = patch.audienceType;
    data.audienceFilter = patch.audienceFilter ?? undefined;
    // Cleared, not left standing: the audience is now an inline filter the
    // operator typed, and a stale segmentId would make a blueprint saved from
    // this campaign re-read a segment it no longer follows.
    data.segmentId = null;
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

/**
 * Refuse a set of template references that Meta will not send.
 *
 * Shared by `launchCampaign` and the configure-time setters so a paused or
 * rejected template is named the moment it is chosen. Only the base template was
 * ever checked; a bad VARIANT or STEP template surfaced as a per-recipient send
 * failure long after launch, and on the drip path that failure was caught and
 * re-armed forever.
 */
export async function assertTemplatesApproved(
  refs: Array<{ id: string; label: string }>
): Promise<void> {
  for (const ref of refs) {
    const tpl = await getTemplate(ref.id);
    if (!tpl || tpl.status !== 'APPROVED') {
      throw new AppError(
        `The template for ${ref.label} is not approved (${tpl?.status ?? 'missing'}), so this campaign cannot be launched.`,
        409,
        'WA_TEMPLATE_NOT_APPROVED'
      );
    }
  }
}

/**
 * Replace all A/B variants for a campaign (full-replace semantics).
 *
 * `validateTemplates` defaults ON so an unapproved variant is refused where the
 * operator can still fix it. `cloneCampaign` passes false deliberately — a
 * Duplicate has to keep working after Meta pauses a template, because making an
 * editable copy is exactly how the operator repairs it.
 */
export async function setVariants(
  campaignId: string,
  variants: VariantInput[],
  opts: { validateTemplates?: boolean } = {}
): Promise<WaCampaignVariant[]> {
  if (opts.validateTemplates !== false) {
    await assertTemplatesApproved(
      variants.map((v) => ({ id: v.templateId, label: `variant "${v.label}"` }))
    );
  }
  await prisma.waCampaignVariant.deleteMany({ where: { campaignId } });
  if (variants.length) {
    await prisma.waCampaignVariant.createMany({
      data: variants.map((v) => ({
        campaignId,
        label: v.label,
        templateId: v.templateId,
        weight: v.weight && v.weight > 0 ? v.weight : 1,
        variableMapping: (v.variableMapping as Prisma.InputJsonValue) ?? undefined,
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
  /** Name search (case-insensitive substring). */
  q?: string;
  page?: number;
  limit?: number;
  /** Include soft-archived campaigns (they are hidden from the default list). */
  includeArchived?: boolean;
}) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, filters.limit ?? 30);
  const q = filters.q?.trim();
  const where: Prisma.WaCampaignWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    // Finding one campaign by name used to mean paging through the whole
    // history: the list is ordered by createdAt and a year of weekly broadcasts
    // buries anything older than the current page.
    ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
    // Archived campaigns keep their history but leave the list. Without this the
    // page is an append-only log: every mistaken draft, every test run and every
    // recurring clone stays on it forever.
    ...(filters.includeArchived ? {} : { archivedAt: null }),
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

/** Rows fetched per page of the streamed recipient export. */
const EXPORT_PAGE_SIZE = 1000;

/**
 * Every recipient of a campaign, one page at a time, for the CSV export.
 *
 * Paged and uncapped. It used to be a single `findMany` with `take: 100_000`
 * whose result the controller joined into one string: a campaign larger than
 * that produced a file with no error, no warning and no truncation marker, so an
 * operator reconciling a send against it silently lost every recipient past the
 * cap — the worst possible failure for a compliance export. The whole file also
 * sat in the Node heap at once, a memory spike proportional to campaign size.
 *
 * Keyset on `contactId` within the campaign rather than an offset: it is unique
 * per campaign and `@@unique([campaignId, contactId])` backs the range scan, so
 * no page can skip or repeat a row while rows are being written underneath the
 * export, and the last page costs what the first one did. That makes the file
 * contact-ordered rather than createdAt-ordered, which an export does not care
 * about: every row is still present, and `contactId` is the only column here
 * whose uniqueness within a campaign the database itself guarantees — the tie
 * break a `(createdAt, id)` keyset needs a second column to supply.
 */
export async function* streamRecipientsForExport(
  campaignId: string,
  pageSize = EXPORT_PAGE_SIZE
): AsyncGenerator<
  Array<
    Prisma.WaCampaignRecipientGetPayload<{
      include: { contact: { select: { phone: true; name: true } } };
    }>
  >
> {
  let after: string | undefined;
  for (;;) {
    const page = await prisma.waCampaignRecipient.findMany({
      where: { campaignId, ...(after ? { contactId: { gt: after } } : {}) },
      orderBy: { contactId: 'asc' },
      take: pageSize,
      include: { contact: { select: { phone: true, name: true } } },
    });
    if (page.length === 0) return;
    yield page;
    if (page.length < pageSize) return;
    after = page[page.length - 1].contactId;
  }
}

export async function getCampaign(id: string) {
  return prisma.waCampaign.findUnique({
    where: { id },
    include: {
      template: { select: { name: true, language: true, category: true, status: true } },
    },
  });
}

/** Serialised keyset position: the last row's `createdAt` and id. */
function encodeRecipientCursor(row: { createdAt: Date; id: string }): string {
  return `${row.createdAt.getTime()}.${row.id}`;
}

function decodeRecipientCursor(raw?: string | null): { at: Date; id: string } | null {
  if (!raw) return null;
  const dot = raw.indexOf('.');
  if (dot <= 0) return null;
  const ms = Number(raw.slice(0, dot));
  const id = raw.slice(dot + 1);
  if (!Number.isFinite(ms) || !id) return null;
  return { at: new Date(ms), id };
}

/**
 * One page of a campaign's recipients.
 *
 * KEYSET, not OFFSET. `skip: (page - 1) * limit` made every page of a large send
 * re-read and discard everything before it — page 400 of a 500k-recipient
 * campaign asked Postgres for 20,000 rows to return 50 — and the paired
 * `count()` re-scanned the whole filtered set on top of that, on a panel that
 * polls every 8 seconds while a campaign is running. `@@index([campaignId,
 * createdAt, id])` now serves both the order and the range, so the last page
 * costs what the first one did.
 *
 * The comparison is by VALUE rather than Prisma's `cursor` + `skip: 1`: a
 * recipient's status changes while the operator is paging (that is the entire
 * point of watching a live send), so a status-filtered cursor row can stop
 * matching the predicate between two requests — and Prisma's cursor silently
 * shifts the whole page when it does.
 *
 * `total` is only present when it is cheap: unfiltered it comes from the
 * campaign's own maintained counter, filtered it is counted once for the first
 * page and left null afterwards, so the console keeps the figure it already has
 * instead of paying for a full scan per page.
 */
export async function getRecipients(
  campaignId: string,
  opts: {
    limit?: number;
    status?: WaCampaignRecipientStatus;
    /** Only recipients who opened a tracked link from this campaign. */
    clickedOnly?: boolean;
    cursor?: string | null;
  } = {}
) {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const after = decodeRecipientCursor(opts.cursor);
  const filtered = !!opts.status || !!opts.clickedOnly;
  const where: Prisma.WaCampaignRecipientWhereInput = {
    campaignId,
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.clickedOnly ? { clickedAt: { not: null } } : {}),
  };

  const rows = await prisma.waCampaignRecipient.findMany({
    where: {
      ...where,
      ...(after
        ? {
            OR: [{ createdAt: { gt: after.at } }, { createdAt: after.at, id: { gt: after.id } }],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    // One extra row answers "is there another page?" without a second query.
    take: limit + 1,
    include: { contact: { select: { phone: true, name: true } } },
  });
  const items = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? encodeRecipientCursor(items[items.length - 1]) : null;

  let total: number | null = null;
  if (!after) {
    total = filtered
      ? await prisma.waCampaignRecipient.count({ where })
      : ((
          await prisma.waCampaign.findUnique({
            where: { id: campaignId },
            select: { totalRecipients: true },
          })
        )?.totalRecipients ?? 0);
  }

  return { items, total, limit, nextCursor };
}

/**
 * One row of an uploaded audience: a number, plus the personalisation columns
 * that came with it in the file.
 *
 * `vars` is merged over the contact's own `attributes` for the length of this
 * send, so `{{attr.order_id}}` in the variable mapping resolves through exactly
 * the same `resolveTemplateVars` a segment audience uses — no second token
 * grammar, and nothing about a one-off blast is written onto the contact record
 * permanently.
 */
interface UploadedAudienceRow {
  phone: string;
  name?: string | null;
  vars?: Record<string, string> | null;
}

/**
 * Read an uploaded/manual audience out of `audienceFilter`, normalised and
 * de-duplicated.
 *
 * Accepts BOTH shapes: the newer `recipients: [{ phone, name?, vars? }]` that
 * the campaign builder writes from a parsed CSV/XLSX/vCard, and the original
 * bare `phones: string[]`, which every campaign created before per-recipient
 * columns existed still carries.
 *
 * De-duplicated on the normalised phone, FIRST occurrence winning: a pasted list
 * routinely repeats a number, and a repeat used to be counted twice by the
 * preview while the launch collapsed it to one recipient row (the
 * (campaignId, contactId) unique key) — so the size the operator approved was
 * bigger than the audience that was actually messaged.
 */
function readUploadedRows(campaign: Pick<WaCampaign, 'audienceFilter'>): UploadedAudienceRow[] {
  const filter = (campaign.audienceFilter ?? {}) as {
    recipients?: unknown;
    phones?: unknown;
  };
  const raw: UploadedAudienceRow[] = Array.isArray(filter.recipients)
    ? (filter.recipients as UploadedAudienceRow[]).map((r) => ({
        phone: String(r?.phone ?? ''),
        name: r?.name ?? null,
        vars: r?.vars ?? null,
      }))
    : Array.isArray(filter.phones)
      ? (filter.phones as unknown[]).map((p) => ({ phone: String(p) }))
      : [];

  const out: UploadedAudienceRow[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    const phone = normalizeWaPhone(row.phone);
    if (phone.replace(/[^\d]/g, '').length < 8) continue;
    if (seen.has(phone)) continue;
    seen.add(phone);
    out.push({ phone, name: row.name ?? null, vars: row.vars ?? null });
  }
  return out;
}

/** Overlay one uploaded row's supplied name and columns onto a contact. */
function applyUploadedRow(base: AudienceContact, row: UploadedAudienceRow): AudienceContact {
  const suppliedName = row.name?.trim();
  const hasVars = row.vars && Object.keys(row.vars).length > 0;
  if (!suppliedName && !hasVars) return base;
  return {
    ...base,
    // The file wins over the stored profile name: the operator supplied it FOR
    // this send, and it is routinely the only name a freshly uploaded number has.
    name: suppliedName || base.name,
    attributes: hasVars
      ? ({
          ...((base.attributes &&
          typeof base.attributes === 'object' &&
          !Array.isArray(base.attributes)
            ? base.attributes
            : {}) as Record<string, unknown>),
          ...row.vars,
        } as Prisma.JsonValue)
      : base.attributes,
  };
}

/** Resolve a bounded (upload/manual) audience to a list of contacts (upserting uploaded phones). */
/**
 * Resolve an uploaded/manual audience.
 *
 * `persist` is the whole point of this signature. This used to ALWAYS upsert, and
 * it is on the PREVIEW endpoint's path for an uploaded audience — so
 * `GET /campaigns/:id/preview` created a real WaContact row for every uploaded
 * phone number. Merely opening a draft campaign silently populated the contact
 * book with unconsented rows that then appeared in the contacts list, in segment
 * counts and in exports.
 *
 * Preview reads. Only materialize(), reached from launchCampaign, writes.
 */
async function resolveUploadedContacts(
  campaign: Pick<WaCampaign, 'audienceFilter'>,
  persist: boolean
): Promise<AudienceContact[]> {
  const rows = readUploadedRows(campaign);
  if (rows.length === 0) return [];
  const phones = rows.map((r) => r.phone);
  const rowByPhone = new Map(rows.map((r) => [r.phone, r]));

  if (!persist) {
    // One batched read instead of N upserts. Phones with no row yet are represented
    // in memory with exactly the shape an upsert would have created, so the
    // eligibility count shown in the preview matches what launching would actually
    // produce. This mirrors WaContact.optInStatus's schema default and has to move
    // with it — when the default was UNKNOWN and this said OPTED_IN (or the
    // reverse) the preview silently disagreed with the launch for every unknown
    // phone in an uploaded list.
    const known = await prisma.waContact.findMany({
      where: { phone: { in: phones } },
      select: AUDIENCE_SELECT,
    });
    const byPhone = new Map(known.map((c) => [c.phone, c]));
    return rows.map((row) =>
      applyUploadedRow(
        byPhone.get(row.phone) ?? {
          id: '',
          phone: row.phone,
          name: null,
          optInStatus: 'OPTED_IN' as WaOptInStatus,
          isBlocked: false,
          lastMarketingAt: null,
          marketingRefusedAt: null,
          attributes: null,
        },
        row
      )
    );
  }

  // Chunked create-then-read, not one upsert per number. The uploaded list is
  // bounded by WA_UPLOAD_PHONE_MAX (20,000) and this runs INSIDE the launch
  // request, which has a 30s budget: at one round-trip per number a full list
  // cannot finish inside it, so the launch 408s while the contact writes carry
  // on behind it and the operator retries something that is already running.
  // `createMany({ skipDuplicates })` is exactly what `upsert` with an empty
  // update did, minus the round-trips.
  const out: AudienceContact[] = [];
  for (let i = 0; i < phones.length; i += UPLOAD_PERSIST_CHUNK) {
    const chunk = phones.slice(i, i + UPLOAD_PERSIST_CHUNK);
    await prisma.waContact.createMany({
      data: chunk.map((phone) => ({
        phone,
        // A supplied name is worth keeping on the row it creates — it is the
        // only name this contact has — but the per-send `vars` deliberately are
        // not: they describe one blast, not the person.
        name: rowByPhone.get(phone)?.name?.trim() || null,
      })),
      skipDuplicates: true,
    });
    const created = await prisma.waContact.findMany({
      where: { phone: { in: chunk } },
      select: AUDIENCE_SELECT,
    });
    const byPhone = new Map(created.map((c) => [c.phone, c]));
    // Read back in the uploaded order, and drop anything that did not come back
    // rather than fabricate it: materialize would otherwise write a recipient
    // row with an empty contactId.
    for (const phone of chunk) {
      const contact = byPhone.get(phone);
      const row = rowByPhone.get(phone);
      if (contact && row) out.push(applyUploadedRow(contact, row));
    }
  }
  return out;
}

/** Build the WHERE clause for a 'segment' audience filter. Categorizes by
 *  opt-in status, custom tags, imported attributes, recency windows and campaign
 *  engagement. (The host platform also filtered on on/off-platform and the linked
 *  User's role; neither exists here.)
 *
 *  The predicate itself lives in whatsapp-contact.service so the contacts list
 *  and `GET /segments/:id/count` resolve a segment exactly the way a launch
 *  does — they used to differ, and the difference was invisible.
 *
 *  `now` is threaded through rather than left to default so a recency rule
 *  ("messaged us in the last 30 days") is evaluated against the SAME instant as
 *  the marketing-cap window beside it — otherwise the preview and the launch
 *  would each pick their own boundary and quietly disagree about the audience. */
function segmentWhere(
  campaign: Pick<WaCampaign, 'audienceFilter'>,
  now: number
): Prisma.WaContactWhereInput {
  return segmentContactWhere((campaign.audienceFilter as Record<string, unknown>) ?? {}, now);
}

/**
 * The FULL eligibility predicate as SQL: the segment filter plus every rule
 * `eligible()` re-checks in JS.
 *
 * Only `segmentWhere` used to reach the database, so answering "how many people
 * will this campaign reach, and what will it cost?" meant reading every contact
 * in the segment 1000 rows at a time and filtering them in Node — 500 sequential
 * round-trips on a 500k-contact deployment, inside one request. The preview timed
 * out, so the operator launched a campaign that spends real money without ever
 * seeing its size. Expressed here, Postgres answers it with one COUNT.
 *
 * Suppression is deliberately NOT in here: WaSuppression has no relation to
 * WaContact, so it is subtracted separately (see `countSuppressedInAudience`).
 */
function eligibilityWhere(
  campaign: Pick<WaCampaign, 'audienceFilter'>,
  isMarketing: boolean,
  marketingCap: number,
  now: number
): Prisma.WaContactWhereInput {
  // The window bound is inclusive (`lte`) to match `eligible()` exactly: a
  // contact last messaged precisely 24h ago is outside the window, not inside it.
  // ANDed rather than merged into the top level: a segment that filters on
  // optInStatus itself must keep narrowing the audience, not be silently
  // overwritten by the campaign-category rule.
  const and: Prisma.WaContactWhereInput[] = [];
  if (isMarketing) {
    const windowStart = new Date(now - MARKETING_WINDOW_MS);
    // MARKETING requires *positive* consent; non-marketing only "not opted out".
    and.push({ optInStatus: 'OPTED_IN' });
    and.push({ OR: [{ marketingRefusedAt: null }, { marketingRefusedAt: { lte: windowStart } }] });
    // Cap > 1 is deliberately not screened here — see `eligible()` for why a
    // single lastMarketingAt cannot tell 1 from N inside the window.
    if (marketingCap === 1) {
      and.push({ OR: [{ lastMarketingAt: null }, { lastMarketingAt: { lte: windowStart } }] });
    }
  } else {
    and.push({ optInStatus: { not: 'OPTED_OUT' } });
  }
  // The segment predicate can carry an `AND` of its own (attribute filters), so
  // the two are concatenated rather than spread — assigning `AND:` over the top
  // silently dropped every attribute condition, and the audience the operator
  // saved would quietly widen to everyone matching only the tags.
  const base = segmentWhere(campaign, now);
  const baseAnd = Array.isArray(base.AND) ? base.AND : base.AND ? [base.AND] : [];
  return { ...base, AND: [...baseAnd, ...and] };
}

/**
 * How many contacts matching `where` are on the do-not-contact list.
 *
 * WaSuppression is keyed by phone and has no relation to WaContact (it holds
 * numbers that may have no contact row at all), so Prisma cannot express the
 * anti-join, and inlining the whole blocklist as `NOT: { phone: { in: [...] } }`
 * stops working long before the blocklist is large. Walking the blocklist in
 * pages and intersecting each page through the unique phone index makes the cost
 * scale with the suppression list — operator-curated, small — rather than with
 * the contact table.
 */
async function countSuppressedInAudience(where: Prisma.WaContactWhereInput): Promise<number> {
  let count = 0;
  await forEachSuppressedPhonePage(async (phones) => {
    count += await prisma.waContact.count({ where: { AND: [where, { phone: { in: phones } }] } });
  });
  return count;
}

/**
 * Stream the audience one page at a time (SCALE: never loads an unbounded
 * `findMany` of all contacts into memory). Upload/manual audiences are bounded
 * by the uploaded phone list, so they yield as a single page; 'segment'
 * audiences are paged with a stable id cursor.
 */
/**
 * The ONLY audience walk permitted to create contact rows. Named rather than a
 * bare boolean at the call site so "does this write?" is answerable by reading
 * the caller.
 */
async function forEachAudiencePageForMaterialize(
  campaign: Pick<WaCampaign, 'audienceType' | 'audienceFilter'>,
  where: Prisma.WaContactWhereInput,
  fn: AudiencePageFn
): Promise<void> {
  return forEachAudiencePage(campaign, where, fn, true);
}

/**
 * Handler for one audience page. Returning `true` stops the walk — the A/B test
 * phase fills a sample and then has no reason to keep paging an audience it is
 * deliberately holding back (a 5% sample of 500k would otherwise read all 500
 * pages to discard 475 of them, inside the launch request's 30s budget).
 */
type AudiencePageFn = (page: AudienceContact[]) => Promise<boolean | void>;

async function forEachAudiencePage(
  campaign: Pick<WaCampaign, 'audienceType' | 'audienceFilter'>,
  /** Eligibility predicate for a 'segment' audience — see `eligibilityWhere`.
   *  Filtering in SQL means the walk only touches rows that can actually be
   *  recipients, instead of paging the whole contact table to discard most of it. */
  where: Prisma.WaContactWhereInput,
  fn: AudiencePageFn,
  /** true only on the materialize path. Defaults to read-only so a new caller
   *  cannot accidentally reintroduce writes from a GET. */
  persist = false
): Promise<void> {
  if (campaign.audienceType === 'upload' || campaign.audienceType === 'manual') {
    await fn(await resolveUploadedContacts(campaign, persist));
    return;
  }
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
    if ((await fn(page)) === true) break;
    if (page.length < AUDIENCE_PAGE_SIZE) break;
    cursor = page[page.length - 1].id;
  }
}

/** A contact as far as personalisation is concerned. */
export interface TemplateVarContact {
  name?: string | null;
  phone: string;
  /** Free-form import columns, addressed as `{{attr.<key>}}`. */
  attributes?: Prisma.JsonValue | null;
}

/**
 * One mapping slot: `{{token}}`, or `{{token|fallback}}`.
 *
 * The fallback is everything after the FIRST pipe, so a literal default may
 * itself contain one.
 */
const MAPPING_TOKEN = /^\{\{([^}]+)\}\}$/;

/** Read one `{{attr.<key>}}` / `{{attributes.<key>}}` value off a contact. */
function attributeValue(contact: TemplateVarContact, key: string): string {
  const attrs = contact.attributes;
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) return '';
  const value = (attrs as Record<string, unknown>)[key];
  if (value == null || typeof value === 'object') return '';
  return String(value);
}

/**
 * Resolve a {{n}} mapping against a contact.
 *
 * Exported because drip steps and keyword auto-replies need the SAME semantics —
 * both used to send no parameters at all. A second implementation would drift
 * from this one the first time a token is added.
 *
 * Two things beyond `{{name}}` / `{{phone}}`:
 *
 *  - `{{attr.city}}` reads WaContact.attributes, the column the import now
 *    fills from every unmapped file column. Without it an operator's `{{city}}`
 *    went to Meta as the literal string "{{city}}".
 *
 *  - `{{name|there}}` supplies a fallback. Meta rejects a template parameter
 *    that is the empty string and fails the ENTIRE message, and most imported
 *    contacts have no profile name — so a bare `{{name}}` hard-failed the
 *    majority of a typical audience, and "Retry failed" re-failed it
 *    identically. An unknown token still passes through as a literal, which is
 *    what an operator typing plain text into a mapping row means.
 */
export function resolveTemplateVars(
  mapping: string[] | undefined,
  contact: TemplateVarContact
): string[] {
  if (!mapping) return [];
  return mapping.map((entry) => {
    const match = MAPPING_TOKEN.exec(entry);
    if (!match) return entry;
    const pipe = match[1].indexOf('|');
    const token = (pipe === -1 ? match[1] : match[1].slice(0, pipe)).trim();
    const fallback = pipe === -1 ? null : match[1].slice(pipe + 1);

    let value: string | null = null;
    if (token === 'name') value = contact.name ?? '';
    else if (token === 'phone') value = contact.phone;
    else if (token.startsWith('attr.')) value = attributeValue(contact, token.slice(5));
    else if (token.startsWith('attributes.')) value = attributeValue(contact, token.slice(11));
    // Not a token we know: the operator typed a literal that happens to look
    // like one. Send it as written, unchanged.
    if (value === null) return entry;

    return value.trim() ? value : (fallback ?? '');
  });
}

/**
 * The contact a campaign TEST send should personalise against.
 *
 * A named contact wins; otherwise the test number's own contact row is used, so
 * the reviewer sees the message a real recipient with that data would get. Only
 * when neither exists does it fall back to a labelled sample — the test send
 * used to pass no parameters at all, which Meta rejects outright for every
 * template that has any.
 */
export async function resolveTestContact(opts: {
  contactId?: string;
  phone: string;
}): Promise<TemplateVarContact> {
  if (opts.contactId) {
    const chosen = await prisma.waContact.findUnique({
      where: { id: opts.contactId },
      select: { name: true, phone: true, attributes: true },
    });
    if (!chosen) throw new AppError('Contact not found', 404, 'WA_CONTACT_NOT_FOUND');
    return chosen;
  }
  const phone = normalizeWaPhone(opts.phone);
  const existing = await prisma.waContact.findUnique({
    where: { phone },
    select: { name: true, phone: true, attributes: true },
  });
  return existing ?? { name: 'Test', phone, attributes: null };
}

function resolveVars(mapping: string[] | undefined, contact: AudienceContact): string[] {
  // Delegated, never re-implemented: this used to be a byte-identical copy, and
  // a token added to one of them would have silently not existed in the other.
  return resolveTemplateVars(mapping, contact);
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
      // Meta already refused this recipient -- the send path will throw
      // WA_MARKETING_REFUSED, so counting them here would promise an audience the
      // launch then skips. Unlike the frequency cap below, this one is exact:
      // it is a single timestamp, not a count that lastMarketingAt cannot infer.
      if (c.marketingRefusedAt && now - c.marketingRefusedAt.getTime() < MARKETING_WINDOW_MS) {
        return false;
      }
      if (marketingCap === 1 && c.lastMarketingAt) {
        if (now - c.lastMarketingAt.getTime() < MARKETING_WINDOW_MS) return false;
      }
      return true;
    }
    return c.optInStatus !== 'OPTED_OUT';
  });
}

/** One mapped `{{n}}` that will go out empty for part of the audience. */
export interface WaBlankVariable {
  /** 1-based placeholder position, i.e. `{{index}}` in the template body. */
  index: number;
  /** The mapping entry as the operator wrote it. */
  token: string;
  /** How many reachable contacts resolve it to nothing. */
  blankCount: number;
}

/**
 * Mapping slots that read `{{name}}` with no `|fallback`.
 *
 * Only `{{name}}` is checked. It is the token this actually happens on — most
 * imported contacts have no profile name — and it is the only one Postgres can
 * answer with an indexed COUNT over the audience predicate. A `{{attr.x}}` gap
 * would need a JSON-path probe per key that cannot express "key absent", and a
 * half-right number here is worse than none: the operator would trust it.
 */
function fallbackLessNameSlots(mapping: string[]): Array<{ index: number; token: string }> {
  return mapping
    .map((token, i) => ({ index: i + 1, token }))
    .filter(({ token }) => /^\{\{\s*name\s*\}\}$/.test(token));
}

/** What an audience preview answers, whether or not a campaign exists yet. */
export interface WaAudiencePreview {
  count: number;
  estimatedCostPaise: number;
  /** Meta daily unique-recipient cap; null when the tier imposes none we can read. */
  tierLimit: number | null;
  /** Distinct contacts already messaged inside the rolling 24h window. */
  uniqueSentLast24h: number;
  /** True when this audience cannot all be started inside today's allowance. */
  exceedsTier: boolean;
  /**
   * Mapped variables that resolve to nothing for part of this audience — the
   * pre-launch check for the failure below.
   */
  blankVariables: WaBlankVariable[];
}

/**
 * The fields a preview actually reads. Narrower than WaCampaign on purpose: the
 * create form has to be able to ask this question before anything is persisted.
 */
export interface WaAudienceSpec {
  templateId: string;
  audienceType: WaAudienceType;
  audienceFilter: Prisma.JsonValue | null;
  variableMapping?: Prisma.JsonValue | null;
}

/**
 * Preview the eligible recipient count + estimated cost for an audience, plus
 * how it sits against the channel's Meta messaging tier.
 *
 * Takes the audience DESCRIPTION rather than a campaign id, because the question
 * "how many people is this, and what will it cost?" is one an operator needs
 * answered while they are still choosing tags — not after they have submitted a
 * draft and discovered the audience is three people or three hundred thousand,
 * with the edit form unable to change the audience fields anyway.
 *
 * The tier fields are the whole point of previewing before a launch: the size and
 * the cost were shown, but nothing said the audience was five times what the number
 * is allowed to message today — so the operator only found out from a wall of
 * 131056 failures and a downgraded quality rating.
 */
export async function previewAudienceFor(spec: WaAudienceSpec): Promise<WaAudiencePreview> {
  const tpl = await getTemplate(spec.templateId);
  const isMarketing = tpl?.category === 'MARKETING';
  const { marketingCapPer24h } = await getWaSettings();
  const now = Date.now();
  const mapping = Array.isArray(spec.variableMapping) ? (spec.variableMapping as string[]) : [];
  const audience = { audienceType: spec.audienceType, audienceFilter: spec.audienceFilter };

  let count: number;
  let blankVariables: WaBlankVariable[];
  if (spec.audienceType === 'upload' || spec.audienceType === 'manual') {
    // Bounded by the uploaded phone list, so it is answered in memory — and
    // read-only, because a preview must not create the contact rows a launch would.
    const contacts = await resolveUploadedContacts(audience, false);
    const suppressed = await getSuppressedPhonesIn(contacts.map((c) => c.phone));
    const reachable = eligible(contacts, isMarketing, marketingCapPer24h, suppressed, now);
    count = reachable.length;
    blankVariables = fallbackLessNameSlots(mapping).map((slot) => ({
      ...slot,
      blankCount: reachable.filter((c) => !(c.name ?? '').trim()).length,
    }));
  } else {
    // A segment is unbounded, so it is counted in SQL — one COUNT plus the
    // blocklist anti-join, never a page-by-page walk of the contact table.
    const where = eligibilityWhere(audience, isMarketing, marketingCapPer24h, now);
    const [matched, suppressed] = await Promise.all([
      prisma.waContact.count({ where }),
      countSuppressedInAudience(where),
    ]);
    count = Math.max(0, matched - suppressed);
    const slots = fallbackLessNameSlots(mapping);
    // ANDed, not spread. A segment with `op: 'or'` compiles its rule group onto
    // the top-level `OR`, and spreading a second `OR` over it REPLACED those
    // rules — so the "N recipients would get an empty parameter" warning was
    // counted over a superset of the audience and could report blanks for people
    // the campaign never sends to (or, at the "0 blanks" end, wave through a send
    // that fails for everyone in it).
    const nameless = slots.length
      ? await prisma.waContact.count({
          where: { AND: [where, { OR: [{ name: null }, { name: '' }] }] },
        })
      : 0;
    blankVariables = slots.map((slot) => ({ ...slot, blankCount: nameless }));
  }
  const budget = await getMessagingTierBudget();
  return {
    count,
    estimatedCostPaise: count * (await resolveRatePaise(tpl?.category)),
    tierLimit: budget.limit,
    uniqueSentLast24h: budget.uniqueSentLast24h,
    exceedsTier: budget.remaining !== null && count > budget.remaining,
    blankVariables: blankVariables.filter((v) => v.blankCount > 0),
  };
}

/**
 * Preview a saved campaign's audience. A thin loader over `previewAudienceFor`,
 * so the draft form and the detail page cannot answer the same question two
 * different ways.
 */
export async function previewAudienceCount(campaignId: string): Promise<WaAudiencePreview> {
  const campaign = await prisma.waCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new AppError('Campaign not found', 404, 'WA_CAMPAIGN_NOT_FOUND');
  return previewAudienceFor(campaign);
}

/**
 * Resolve a DRAFT audience the way `createCampaign` would, then preview it.
 *
 * A saved segment overrides the inline filter here exactly as it does on create,
 * so the number the form shows is the number the campaign it is about to create
 * will reach — the two resolving the audience differently is the failure this
 * shares a code path to avoid.
 */
export async function previewAudienceDraft(input: {
  templateId: string;
  audienceType: 'segment' | 'upload' | 'manual';
  audienceFilter?: Prisma.JsonValue | null;
  segmentId?: string;
  variableMapping?: string[];
}): Promise<WaAudiencePreview> {
  const tpl = await getTemplate(input.templateId);
  if (!tpl) throw new AppError('Template not found', 404, 'WA_TEMPLATE_NOT_FOUND');
  let audienceType: WaAudienceType = input.audienceType;
  let audienceFilter = input.audienceFilter ?? null;
  if (input.segmentId) {
    const segment = await getSegment(input.segmentId);
    audienceType = 'segment';
    audienceFilter = segment.filter;
  }
  return previewAudienceFor({
    templateId: input.templateId,
    audienceType,
    audienceFilter,
    variableMapping: input.variableMapping ?? null,
  });
}

/**
 * Materialize eligible recipients into WaCampaignRecipient rows, paging through
 * the audience and inserting each page with createMany (never buffering the
 * whole audience). Returns the total recipient count for the campaign.
 */
async function materialize(
  campaign: WaCampaign,
  isMarketing: boolean,
  opts: {
    /** Stop after this many recipient rows — the A/B test phase's sample size. */
    limit?: number;
    /** Bind every new recipient to this variant instead of splitting by weight. */
    forceVariantId?: string;
  } = {}
): Promise<number> {
  const mapping = Array.isArray(campaign.variableMapping)
    ? (campaign.variableMapping as string[])
    : undefined;
  const { marketingCapPer24h } = await getWaSettings();
  const now = Date.now();
  const where = eligibilityWhere(campaign, isMarketing, marketingCapPer24h, now);

  // A/B split setup: build cumulative weight buckets once. The incrementing
  // `assigned` index is shared across pages so the weighted split holds for the
  // whole audience, not just within a single page.
  const allVariants = campaign.isAbTest
    ? await prisma.waCampaignVariant.findMany({
        where: { campaignId: campaign.id },
        orderBy: { createdAt: 'asc' },
      })
    : [];
  // The remainder send is not a split — every held-back contact gets the variant
  // that won, which is the entire point of having run the test.
  const winner = opts.forceVariantId
    ? (allVariants.find((v) => v.id === opts.forceVariantId) ?? null)
    : null;
  const variants = winner ? [winner] : allVariants;
  const useVariants = variants.length > 0;
  let totalWeight = 0;
  const cumulative = variants.map((v) => (totalWeight += Math.max(1, v.weight)));
  let assigned = 0;
  let inserted = 0;

  await forEachAudiencePageForMaterialize(campaign, where, async (page) => {
    // The test phase sends to a slice of the audience and holds the rest back, so
    // the walk has to stop once the sample is full rather than materialize
    // everyone and bill the whole list against an undecided experiment.
    if (opts.limit != null && inserted >= opts.limit) return true;
    // Only this page's phones are checked against the blocklist: loading the
    // whole suppression table into a Set cost a full scan of it on every launch
    // and grew without bound, where an indexed lookup per page does not.
    const suppressed = await getSuppressedPhonesIn(page.map((c) => c.phone));
    const rows = eligible(page, isMarketing, marketingCapPer24h, suppressed, now).map((c) => {
      // A/B: the recipient is bound to a variant, so its parameters must come from
      // THAT variant. The wizard used to send `variableMapping: undefined` for A/B
      // campaigns and nothing else supplied one, so every recipient of a
      // parameterised A/B campaign got `variables: []` and received a template with
      // empty placeholders. Falls back to the campaign mapping when a variant has
      // none of its own.
      const variant = useVariants
        ? variants[pickVariantIndex(cumulative, totalWeight, assigned++)]
        : null;
      const variantMapping = Array.isArray(variant?.variableMapping)
        ? (variant.variableMapping as string[])
        : undefined;
      return {
        campaignId: campaign.id,
        contactId: c.id,
        variantId: variant ? variant.id : null,
        variables: resolveVars(variantMapping ?? mapping, c),
        status: 'PENDING' as WaCampaignRecipientStatus,
      };
    });
    if (rows.length === 0) return;
    const capped = opts.limit != null ? rows.slice(0, Math.max(0, opts.limit - inserted)) : rows;
    if (capped.length === 0) return;
    // `skipDuplicates` is what makes the remainder pass safe to run over the same
    // audience: the sample's recipients already hold the (campaignId, contactId)
    // unique key, so they are left on their original variant.
    const { count } = await prisma.waCampaignRecipient.createMany({
      data: capped,
      skipDuplicates: true,
    });
    inserted += count;
    // Sample full: stop reading pages of an audience this launch is deliberately
    // not sending to.
    return opts.limit != null && inserted >= opts.limit;
  });
  return prisma.waCampaignRecipient.count({ where: { campaignId: campaign.id } });
}

/**
 * How many contacts this campaign could reach right now, blocklist subtracted.
 *
 * Same arithmetic `previewAudienceCount` reports, extracted because the A/B test
 * phase needs the number for two decisions the preview never made: how big a
 * sample `abTestSamplePct` works out to, and how many people are still being
 * held back for the winner.
 */
async function countEligibleAudience(
  campaign: WaCampaign,
  isMarketing: boolean,
  opts: {
    /** Count only contacts this campaign has NO recipient row for yet. */
    excludeMaterialized?: boolean;
  } = {}
): Promise<number> {
  const { marketingCapPer24h } = await getWaSettings();
  const now = Date.now();
  if (campaign.audienceType === 'upload' || campaign.audienceType === 'manual') {
    const contacts = await resolveUploadedContacts(campaign, false);
    const suppressed = await getSuppressedPhonesIn(contacts.map((c) => c.phone));
    const reachable = eligible(contacts, isMarketing, marketingCapPer24h, suppressed, now);
    if (!opts.excludeMaterialized) return reachable.length;
    // Uploaded lists are bounded by the schema's 20k cap, so the already-sent
    // slice is answered with one indexed lookup rather than a walk.
    const ids = reachable.map((c) => c.id).filter(Boolean);
    if (ids.length === 0) return 0;
    const already = await prisma.waCampaignRecipient.count({
      where: { campaignId: campaign.id, contactId: { in: ids } },
    });
    return Math.max(0, reachable.length - already);
  }
  const base = eligibilityWhere(campaign, isMarketing, marketingCapPer24h, now);
  const where: Prisma.WaContactWhereInput = opts.excludeMaterialized
    ? {
        ...base,
        AND: [
          ...(Array.isArray(base.AND) ? base.AND : base.AND ? [base.AND] : []),
          { campaignRecipients: { none: { campaignId: campaign.id } } },
        ],
      }
    : base;
  const [matched, suppressed] = await Promise.all([
    prisma.waContact.count({ where }),
    countSuppressedInAudience(where),
  ]);
  return Math.max(0, matched - suppressed);
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

/**
 * Meta's answer to 'may this campaign send at all?', asked BEFORE the launch.
 *
 * Meta publishes a `health_status` for the number, its WABA, the business behind
 * it and the template — and nothing here ever read it. An ineligible number and
 * a paused template both report perfectly normal quality ratings right up to the
 * moment the send is refused, so the first sign of either was a materialized
 * audience and a screen full of FAILED recipients.
 *
 * Never throws for a check it could not make: an unreachable Graph is reported
 * as `available: false`, which the launch screen shows as 'not checked' rather
 * than as a blocked number.
 */
export interface WaCampaignPreflight {
  /** AVAILABLE | LIMITED | BLOCKED, or null when neither check could be made. */
  canSend: string | null;
  /** True when at least one of the two checks answered. */
  checked: boolean;
  /** Only the entities that are NOT free to send — the actionable part. */
  blockers: WaHealthEntity[];
  /** Why a check could not be made, when one could not be. */
  errors: string[];
}

export async function campaignPreflight(id: string): Promise<WaCampaignPreflight> {
  const campaign = await prisma.waCampaign.findUnique({ where: { id } });
  if (!campaign) throw new AppError('Campaign not found', 404, 'WA_CAMPAIGN_NOT_FOUND');

  const [channel, template] = await Promise.all([
    getPhoneHealthStatus(campaign.channelId).catch((e: unknown) => ({
      available: false,
      canSend: null,
      entities: [] as WaHealthEntity[],
      checkedAt: null,
      error: (e as Error).message,
    })),
    getTemplateHealthStatus(campaign.templateId).catch((e: unknown) => ({
      available: false,
      canSend: null,
      entities: [] as WaHealthEntity[],
      checkedAt: null,
      error: (e as Error).message,
    })),
  ]);

  const errors = [channel.error, template.error].filter((e): e is string => !!e);
  const checked = channel.available || template.available;
  // De-duplicated on entity id: the number and the template both report the WABA
  // and the business, so the same blocker would otherwise be listed twice.
  const seen = new Set<string>();
  const blockers: WaHealthEntity[] = [];
  for (const e of [...channel.entities, ...template.entities]) {
    if (e.canSend === 'AVAILABLE' || e.canSend === 'UNKNOWN') continue;
    const key = `${e.type}:${e.id ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    blockers.push(e);
  }

  // The worst verdict wins: LIMITED on the template with AVAILABLE on the number
  // still means part of this audience will not be reached.
  const verdicts = [channel.canSend, template.canSend].filter((v): v is string => !!v);
  const canSend = verdicts.includes('BLOCKED')
    ? 'BLOCKED'
    : verdicts.includes('LIMITED')
      ? 'LIMITED'
      : (verdicts[0] ?? null);

  return { canSend, checked, blockers, errors };
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

  // REFUSE a launch the selected template cannot satisfy.
  //
  // The worker used to send body parameters only, so a template with a media
  // header, a variable text header or a dynamic URL button went out incomplete
  // and Meta rejected EVERY recipient with (#131008) Required parameter is
  // missing. The campaign burned through its whole audience marking rows FAILED,
  // with no diagnosis surfaced anywhere in the UI. Failing loudly here, before a
  // single message is sent, is the difference between a fixable mistake and a
  // spent audience.
  // Every template this campaign can actually send must be approved, not just the
  // base one. An unapproved VARIANT or STEP template threw at send time instead —
  // and on the drip path that throw was caught and re-armed, so the recipient
  // retried the same rejected template every 15 minutes indefinitely.
  const variantRefs = (
    await prisma.waCampaignVariant.findMany({
      where: { campaignId: id },
      select: { templateId: true, label: true },
    })
  ).map((v) => ({ id: v.templateId, label: `variant "${v.label}"` }));
  const stepRefs = (
    await prisma.waCampaignStep.findMany({
      where: { campaignId: id },
      select: { templateId: true, stepOrder: true },
    })
  ).map((st) => ({ id: st.templateId, label: `step ${st.stepOrder}` }));
  await assertTemplatesApproved([...variantRefs, ...stepRefs]);
  // A campaign holds ONE set of carousel cards (`templateParams.carouselCards`,
  // filled in against the main template), while a variant and a drip step carry a
  // body mapping and nothing else. A carousel used as either would therefore be
  // sent with no card parameters at all and Meta would refuse every one of its
  // recipients with (#131008) — so refuse it here, where the operator can still
  // swap the template, rather than per recipient once the audience is spent.
  for (const ref of [...variantRefs, ...stepRefs]) {
    const other = await getTemplate(ref.id);
    if (analyzeTemplateSpec(other?.components).carouselCards.length > 0) {
      throw new AppError(
        `The template for ${ref.label} is a carousel, and a campaign can only supply cards for its main template. Send the carousel as its own broadcast instead.`,
        400,
        'WA_CAROUSEL_TEMPLATE_NOT_SUPPORTED'
      );
    }
  }

  const spec = analyzeTemplateSpec(tpl.components);
  const params = (campaign.templateParams ?? {}) as CampaignTemplateParams;
  const missing: string[] = [];
  if (spec.headerNeedsMedia && !params.headerMediaUrl) {
    missing.push(`a ${spec.headerFormat.toLowerCase()} header URL`);
  }
  // An AUTHENTICATION template needs a UNIQUE one-time code per recipient. A
  // campaign has one shared parameter set, so any code it could send would go to
  // the whole audience at once - useless as a second factor and a real security
  // problem. Refuse the category rather than send something meaningless.
  if (tpl.category === 'AUTHENTICATION') {
    throw new AppError(
      'Authentication templates send a one-time code and cannot be broadcast — ' +
        'every recipient would receive the same code. Send these from the inbox ' +
        'or an API integration instead.',
      400,
      'WA_AUTH_TEMPLATE_NOT_BROADCASTABLE'
    );
  }
  if (spec.headerHasTextVar && !params.headerText) missing.push('header text');
  if (spec.buttonUrlVar && !params.buttonUrlParam) missing.push('a URL-button value');
  // The marketing extras. Meta rejects a COPY_CODE template with no coupon
  // parameter and a LIMITED_TIME_OFFER template with no expiration timestamp,
  // both with (#131008) — per recipient, for the whole audience.
  if (spec.needsCouponCode && !params.couponCode) missing.push('a coupon code');
  if (spec.needsLtoExpiration && !params.ltoExpirationMs) missing.push('an offer expiry');
  // CAROUSEL. The media, the card text and the card button values live on the
  // CARDS, so a carousel campaign is unsatisfiable until every card has them —
  // and Meta refuses the whole message per recipient for one missing card image,
  // which on a broadcast is the entire audience.
  // Refuse a carousel payload for a template that has no carousel. This used to
  // fall outside the check below entirely, so the launch succeeded and then every
  // recipient failed -- the exact outcome the pre-flight exists to prevent.
  if (spec.carouselCards.length === 0 && (params.carouselCards?.length ?? 0) > 0) {
    missing.push(
      'carousel card values were supplied but this template has no carousel component ' +
        '(they are left over from a different template - reselect the template)'
    );
  }
  if (spec.carouselCards.length > 0) {
    const cards = params.carouselCards ?? [];
    // Extra values are as fatal as missing ones: Meta rejects on parameter COUNT,
    // so a leftover body param for a card that now has fewer placeholders fails
    // for every recipient just as a blank one does.
    if (cards.length > spec.carouselCards.length) {
      missing.push(
        `only ${spec.carouselCards.length} carousel card(s) on this template, but ${cards.length} were supplied`
      );
    }
    spec.carouselCards.forEach((cardSpec, idx) => {
      const supplied = cards[idx]?.bodyParams?.length ?? 0;
      // bodyPositional is the HIGHEST {{n}} in the card body, i.e. the number of
      // values Meta expects -- not an array.
      const expected = cardSpec.bodyPositional;
      if (supplied > expected) {
        missing.push(
          `card ${idx + 1} takes ${expected} value(s) but ${supplied} were supplied`
        );
      }
    });
    if (cards.length < spec.carouselCards.length) {
      missing.push(
        `values for all ${spec.carouselCards.length} carousel cards (${cards.length} filled in)`
      );
    } else {
      spec.carouselCards.forEach((card, i) => {
        const supplied = cards[i] ?? {};
        const label = `card ${i + 1}`;
        if (!supplied.headerMediaUrl?.trim() && !supplied.headerMediaId?.trim()) {
          missing.push(`${label}'s ${card.headerFormat === 'VIDEO' ? 'video' : 'image'}`);
        }
        // An EMPTY parameter is not "unpersonalised" — Meta refuses the message
        // outright — so a blank card slot counts as missing, not as a default.
        const values = supplied.bodyParams ?? [];
        const blank = Array.from({ length: card.bodyPositional }, (_, n) => n).filter(
          (n) => !String(values[n] ?? '').trim()
        );
        if (blank.length) {
          missing.push(`${label}'s ${blank.map((n) => `{{${n + 1}}}`).join(', ')} value`);
        }
        if (card.buttonUrlVar && !supplied.buttonUrlParam?.trim()) {
          missing.push(`${label}'s button link value`);
        }
      });
    }
  }
  if (spec.bodyNamed.length > 0) {
    // Named body variables resolve per recipient, and the campaign materializer
    // only produces positional values — so this template cannot be campaign-sent
    // correctly at all. Say so, rather than fail once per recipient.
    missing.push(
      `named body variables (${spec.bodyNamed.join(', ')}) which campaigns cannot supply`
    );
  }
  if (missing.length > 0) {
    throw new AppError(
      `This template needs ${missing.join(', ')}. Edit the campaign and provide it before launching.`,
      400,
      'WA_TEMPLATE_PARAMS_MISSING'
    );
  }
  // An offer that has already expired renders as a finished countdown on every
  // handset in the audience. A campaign can sit in DRAFT or SCHEDULED for days
  // after the expiry was chosen, so this has to be checked at LAUNCH, not at save.
  if (params.ltoExpirationMs != null && params.ltoExpirationMs <= Date.now()) {
    throw new AppError(
      'The limited-time offer has already expired. Set a future expiry before launching.',
      400,
      'WA_LTO_EXPIRED'
    );
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
  if (total === 0) {
    // A/B TEST PHASE. With a sample percentage set, the launch materializes only
    // that slice of the audience; the rest stay unmaterialized until a winner is
    // declared and `sendAbRemainder` binds them to it. Without this, an A/B test
    // spent the entire audience before there was anything to learn from.
    const isMarketing = tpl.category === 'MARKETING';
    const samplePct = campaign.isAbTest ? campaign.abTestSamplePct : null;
    let limit: number | undefined;
    if (samplePct != null && samplePct > 0 && samplePct < 100) {
      const audience = await countEligibleAudience(campaign, isMarketing);
      limit = Math.max(1, Math.ceil((audience * samplePct) / 100));
    }
    total = await materialize(campaign, isMarketing, limit != null ? { limit } : {});
  }
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
      estimatedCostPaise: total * (await resolveRatePaise(tpl.category)),
    },
  });

  // Say out loud that this audience is bigger than the number is allowed to
  // message today. The send itself is capped by the worker (it stops at the tier
  // and leaves the rest PENDING for the recovery cron, so the campaign spreads
  // across days), but a launch is also reached from the scheduled-campaign cron,
  // which never saw the pre-launch preview warning — this log is the only place
  // that spread is stated for those.
  const budget = await getMessagingTierBudget();
  if (budget.limit !== null && budget.remaining !== null && total > budget.remaining) {
    logger.warn(
      `WhatsApp campaign ${id}: ${total} recipient(s) exceeds the messaging tier ` +
        `allowance (${budget.remaining} of ${budget.limit} contacts left in this 24h ` +
        `window); the remainder will be sent over ${Math.ceil(total / budget.limit)} day(s)`
    );
  }

  // The launch itself, fanned out to subscribers. `whatsapp.campaign.completed`
  // was the only campaign event, so an integration learned about a send only
  // once it was over — too late to open a support rota, pause an ad, or warn a
  // sales team that a few thousand replies are about to arrive.
  void emitWaEvent('whatsapp.campaign.started', {
    campaignId: id,
    name: campaign.name,
    type: campaign.type,
    totalRecipients: total,
    templateName: tpl.name,
    templateCategory: tpl.category,
    estimatedCostPaise: total * (await resolveRatePaise(tpl.category)),
  }).catch(() => {});

  // SEQUENCE (drip) campaigns are NOT batch-blasted: startSequence arms every
  // recipient at step 0 and the `wa-drip-tick` cron sends each step at its delay.
  if (campaign.type === 'SEQUENCE') {
    // Resuming is NOT relaunching. `campaign` was read before the claim above, so
    // its status is the pre-launch one: PAUSED means an operator pressed Resume on
    // a drip that is already part-way through. startSequence would arm from step 0;
    // resumeSequence only repairs recipients stranded mid-claim and leaves
    // everyone else exactly where the pause left them.
    if (campaign.status === 'PAUSED') {
      await resumeSequence(id);
    } else {
      await startSequence(id);
    }
    return prisma.waCampaign.findUnique({ where: { id } });
  }

  await enqueuePendingRecipients(id, campaign.batchSize || 100);
  return prisma.waCampaign.findUnique({ where: { id } });
}

/** One variant's performance, as the A/B panel reads it. */
export interface WaAbVariantStat {
  id: string;
  label: string;
  templateId: string;
  weight: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  repliedCount: number;
  /** The decision metric over this variant's sends, 0-1. null when nothing sent. */
  rate: number | null;
  /** Percentage-point difference against the best OTHER variant. */
  liftPct: number | null;
  /** Two-proportion z against the best other variant. */
  z: number | null;
  /** True when |z| clears 95% two-sided against the best other variant. */
  significant: boolean;
  isWinner: boolean;
}

/** Everything the A/B panel needs to decide and act. */
export interface WaAbTestReport {
  metric: WaAbMetric;
  samplePct: number | null;
  winnerVariantId: string | null;
  decidedAt: Date | null;
  /** Best measured rate with at least one send — the suggested winner. */
  leaderVariantId: string | null;
  /** True when the leader beats the runner-up at 95%. */
  significant: boolean;
  /** Contacts still eligible that no recipient row covers yet. */
  remainingAudience: number;
  variants: WaAbVariantStat[];
}

/** The metric's numerator for one variant. */
function abMetricCount(v: WaCampaignVariant, metric: WaAbMetric): number {
  if (metric === 'delivered') return v.deliveredCount;
  if (metric === 'read') return v.readCount;
  return v.repliedCount;
}

/**
 * Two-proportion z for x1/n1 against x2/n2.
 *
 * This is the whole reason the panel exists: with 40 sends per variant, "9 reads
 * vs 7 reads" looks like a 28% win and is pure noise. Returns null when either
 * arm has no sends or the pooled variance is zero, so the UI says "not enough
 * data" instead of printing a fabricated confidence.
 */
export function twoProportionZ(x1: number, n1: number, x2: number, n2: number): number | null {
  if (n1 <= 0 || n2 <= 0) return null;
  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const pooled = (x1 + x2) / (n1 + n2);
  const variance = pooled * (1 - pooled) * (1 / n1 + 1 / n2);
  if (!(variance > 0)) return null;
  return (p1 - p2) / Math.sqrt(variance);
}

/** Normalize a stored/requested metric string, falling back to the default. */
function coerceAbMetric(metric: unknown): WaAbMetric {
  const m = String(metric ?? '').toLowerCase();
  return (WA_AB_METRICS as readonly string[]).includes(m) ? (m as WaAbMetric) : DEFAULT_AB_METRIC;
}

/**
 * Per-variant rates, lift and significance for an A/B campaign.
 *
 * The panel used to render four raw counters and nothing else, so judging a test
 * meant doing the division by hand and guessing whether the gap was real. Rates
 * are all taken over the variant's own SENT count so a variant that failed to
 * deliver is not flattered by a smaller denominator.
 */
export async function getAbTestReport(campaignId: string): Promise<WaAbTestReport> {
  const campaign = await prisma.waCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new AppError('Campaign not found', 404, 'WA_CAMPAIGN_NOT_FOUND');
  const metric = coerceAbMetric(campaign.abTestMetric);
  const variants = await getVariants(campaignId);

  const rateOf = (v: WaCampaignVariant): number | null =>
    v.sentCount > 0 ? abMetricCount(v, metric) / v.sentCount : null;

  // The leader is the best MEASURED rate; a variant with no sends has no rate and
  // cannot win by default.
  const measured = variants.filter((v) => v.sentCount > 0);
  const leader = measured.reduce<WaCampaignVariant | null>(
    (best, v) => (best === null || (rateOf(v) ?? 0) > (rateOf(best) ?? 0) ? v : best),
    null
  );

  const stats: WaAbVariantStat[] = variants.map((v) => {
    // Compared against the best OTHER variant, so every row answers the same
    // question: "is this one really different from its nearest competitor?"
    const rival = measured
      .filter((o) => o.id !== v.id)
      .reduce<WaCampaignVariant | null>(
        (best, o) => (best === null || (rateOf(o) ?? 0) > (rateOf(best) ?? 0) ? o : best),
        null
      );
    const z = rival
      ? twoProportionZ(
          abMetricCount(v, metric),
          v.sentCount,
          abMetricCount(rival, metric),
          rival.sentCount
        )
      : null;
    const rate = rateOf(v);
    const rivalRate = rival ? rateOf(rival) : null;
    return {
      id: v.id,
      label: v.label,
      templateId: v.templateId,
      weight: v.weight,
      sentCount: v.sentCount,
      deliveredCount: v.deliveredCount,
      readCount: v.readCount,
      repliedCount: v.repliedCount,
      rate,
      liftPct: rate != null && rivalRate != null ? (rate - rivalRate) * 100 : null,
      z,
      significant: z != null && Math.abs(z) >= Z_95,
      isWinner: campaign.winnerVariantId === v.id,
    };
  });

  const leaderStat = stats.find((v) => v.id === leader?.id) ?? null;
  const tpl = await getTemplate(campaign.templateId);

  return {
    metric,
    samplePct: campaign.abTestSamplePct,
    winnerVariantId: campaign.winnerVariantId,
    decidedAt: campaign.abTestDecidedAt,
    leaderVariantId: leader?.id ?? null,
    significant: leaderStat?.significant === true,
    // Exactly what a remainder send would add: eligible contacts this campaign
    // holds no recipient row for. Reporting the whole audience instead would
    // promise the operator a number that includes the sample already paid for.
    remainingAudience: await countEligibleAudience(campaign, tpl?.category === 'MARKETING', {
      excludeMaterialized: true,
    }),
    variants: stats,
  };
}

/**
 * Declare the winning variant — explicitly, or by taking the measured leader.
 *
 * Recording the decision is what lets `sendAbRemainder` bind the held-back
 * audience to one template; before this there was no winner field at all, so the
 * operator had to hand-build a second campaign for the rest of the list.
 */
export async function selectAbWinner(
  campaignId: string,
  opts: { variantId?: string; metric?: WaAbMetric } = {}
): Promise<WaCampaign> {
  const campaign = await prisma.waCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new AppError('Campaign not found', 404, 'WA_CAMPAIGN_NOT_FOUND');
  const variants = await getVariants(campaignId);
  if (variants.length < 2) {
    throw new AppError(
      'This campaign has no A/B variants to choose between',
      400,
      'WA_CAMPAIGN_NOT_AB_TEST'
    );
  }
  // A metric change is persisted before the report is read, so "decide on reads"
  // and the numbers the decision is made from cannot disagree.
  if (opts.metric && opts.metric !== campaign.abTestMetric) {
    await prisma.waCampaign.update({
      where: { id: campaignId },
      data: { abTestMetric: opts.metric },
    });
  }

  let winnerId = opts.variantId ?? null;
  if (winnerId) {
    if (!variants.some((v) => v.id === winnerId)) {
      throw new AppError('That variant is not on this campaign', 404, 'WA_VARIANT_NOT_FOUND');
    }
  } else {
    const report = await getAbTestReport(campaignId);
    winnerId = report.leaderVariantId;
    if (!winnerId) {
      throw new AppError(
        'No variant has sent anything yet, so there is nothing to compare',
        400,
        'WA_AB_NO_DATA'
      );
    }
  }

  return prisma.waCampaign.update({
    where: { id: campaignId },
    data: { winnerVariantId: winnerId, abTestDecidedAt: new Date() },
  });
}

/**
 * Send the held-back remainder of an A/B campaign's audience using the winner.
 *
 * Materializes every eligible contact that has no recipient row yet, bound to the
 * winning variant, and enqueues them. `createMany({ skipDuplicates })` leaves the
 * test sample exactly where it is, so nobody is messaged twice.
 */
export async function sendAbRemainder(campaignId: string): Promise<{
  campaign: WaCampaign | null;
  added: number;
}> {
  const campaign = await prisma.waCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new AppError('Campaign not found', 404, 'WA_CAMPAIGN_NOT_FOUND');
  if (!campaign.winnerVariantId) {
    throw new AppError(
      'Pick the winning variant before sending to the rest of the audience',
      400,
      'WA_AB_NO_WINNER'
    );
  }
  if (!['RUNNING', 'PAUSED', 'COMPLETED'].includes(campaign.status)) {
    throw new AppError(
      `Cannot send the remainder of a ${campaign.status} campaign`,
      409,
      'WA_CAMPAIGN_BAD_STATE'
    );
  }
  const tpl = await getTemplate(campaign.templateId);
  await assertTemplatesApproved([
    { id: campaign.templateId, label: 'this campaign' },
    ...(
      await prisma.waCampaignVariant.findMany({
        where: { id: campaign.winnerVariantId },
        select: { templateId: true, label: true },
      })
    ).map((v) => ({ id: v.templateId, label: `variant "${v.label}"` })),
  ]);

  const before = await prisma.waCampaignRecipient.count({ where: { campaignId } });
  const total = await materialize(campaign, tpl?.category === 'MARKETING', {
    forceVariantId: campaign.winnerVariantId,
  });
  const added = Math.max(0, total - before);
  if (added === 0) {
    throw new AppError(
      'Everyone eligible has already received this campaign',
      400,
      'WA_NO_RECIPIENTS'
    );
  }

  await prisma.waCampaign.update({
    where: { id: campaignId },
    data: {
      status: 'RUNNING',
      completedAt: null,
      totalRecipients: total,
      estimatedCostPaise: total * (await resolveRatePaise(tpl?.category)),
    },
  });
  await enqueuePendingRecipients(campaignId, campaign.batchSize || 100);
  return { campaign: await prisma.waCampaign.findUnique({ where: { id: campaignId } }), added };
}

/**
 * Remove a campaign: hard-delete a DRAFT, archive anything that has already sent.
 *
 * There was no delete at all, so a long-lived deployment accumulated every
 * mistaken draft, every test run and every recurring clone in a list with no
 * search or status filter. A DRAFT has no history worth keeping and the schema
 * cascades recipients/steps/variants, so it goes for real; a CANCELLED or
 * COMPLETED campaign keeps its numbers (analytics and conversions reference it)
 * and is archived out of the default list instead. Anything mid-flight is
 * refused — stop it first, so the operator sees what they are stopping.
 */
export async function deleteCampaign(id: string): Promise<{ deleted: boolean; archived: boolean }> {
  const campaign = await prisma.waCampaign.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!campaign) throw new AppError('Campaign not found', 404, 'WA_CAMPAIGN_NOT_FOUND');

  if (campaign.status === 'DRAFT') {
    await prisma.waCampaign.delete({ where: { id } });
    return { deleted: true, archived: false };
  }
  if (campaign.status === 'CANCELLED' || campaign.status === 'COMPLETED') {
    await prisma.waCampaign.update({
      where: { id },
      // `nextRunAt` too: archiving a recurring campaign has to disarm it, or the
      // recurrence cron keeps minting clones of something the operator believes
      // they removed.
      data: { archivedAt: new Date(), nextRunAt: null },
    });
    return { deleted: false, archived: true };
  }
  throw new AppError(
    `Cancel this campaign before removing it (it is ${campaign.status})`,
    409,
    'WA_CAMPAIGN_BAD_STATE'
  );
}

export async function pauseCampaign(id: string) {
  return prisma.waCampaign.update({ where: { id }, data: { status: 'PAUSED' } });
}

export async function resumeCampaign(id: string) {
  return launchCampaign(id);
}

/**
 * Cancel a campaign AND stop any recurrence.
 *
 * Clearing `nextRunAt` is the load-bearing part: cancel used to write only the
 * status, so a recurring campaign kept cloning and sending forever with no way
 * to stop it from the UI — `updateCampaign` refuses to edit anything that is not
 * DRAFT/SCHEDULED, so `recurrenceDays` could never be cleared once it had run.
 * `recurrenceDays` is deliberately kept so the schedule is still legible on the
 * detail page; `nextRunAt: null` is what actually disarms it, and the cron now
 * skips CANCELLED sources too.
 */
export async function cancelCampaign(id: string) {
  const campaign = await prisma.waCampaign.update({
    where: { id },
    data: { status: 'CANCELLED', completedAt: new Date(), nextRunAt: null },
  });
  // Close out the recipients that will now never be attempted. Cancel used to
  // write only the campaign row, so every unsent recipient stayed PENDING
  // forever: the detail page showed a progress bar frozen part-way, the funnel
  // divided by a total that included messages that were never going to be sent,
  // and there was no way to tell a cancelled campaign from a stalled one.
  // SKIPPED already renders in the recipients table; the errorCode distinguishes
  // a cancel-skip from a consent-skip.
  await prisma.waCampaignRecipient.updateMany({
    where: { campaignId: id, status: 'PENDING' },
    data: { status: 'SKIPPED', errorCode: 'WA_CAMPAIGN_CANCELLED' },
  });
  await recomputeCampaignCounters(id);
  return campaign;
}

/**
 * Mark a campaign COMPLETED, arm its next recurrence if it has one, and announce
 * that it finished.
 *
 * Three paths retire a campaign — the batch worker, the recovery cron and drip
 * retirement — and only the worker computed `nextRunAt`. A recurring campaign that
 * finished through either of the others simply stopped recurring, with nothing to
 * show why. One helper, called from all three.
 *
 * The announcement lives here for the same reason: it used to be a single
 * `emitWaEvent` in the batch worker, so a campaign drained by the recovery cron
 * (the normal ending for anything that hit a rate limit or an expired token
 * mid-run) and every drip sequence finished in complete silence — no webhook to
 * the operator's CRM, and nothing on screen.
 */
export async function completeCampaign(id: string): Promise<void> {
  const campaign = await prisma.waCampaign.findUnique({
    where: { id },
    select: {
      name: true,
      recurrenceDays: true,
      totalRecipients: true,
      sentCount: true,
      deliveredCount: true,
      readCount: true,
      failedCount: true,
      skippedCount: true,
    },
  });
  if (!campaign) return;
  await prisma.waCampaign.update({
    where: { id },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      ...(campaign.recurrenceDays && campaign.recurrenceDays > 0
        ? { nextRunAt: addDays(new Date(), campaign.recurrenceDays) }
        : {}),
    },
  });

  // `failedRate` rather than a raw count, because the number that matters is
  // proportional: 40 failures out of 50,000 is a bad afternoon, 40 out of 40 is
  // a broken template or a dead token and every remaining send will fail the
  // same way. Consumers (the console toast, a subscriber's CRM) threshold on it
  // instead of re-deriving it from counters they would have to fetch.
  const totalRecipients = campaign.totalRecipients ?? 0;
  const failedCount = campaign.failedCount ?? 0;
  const failedRate = totalRecipients > 0 ? failedCount / totalRecipients : 0;

  // Same `wa:campaign` event the worker already emits for live progress, with a
  // `completed` flag so a listener can tell the final frame from the 500 before
  // it without diffing counters.
  emitWa('wa:campaign', {
    id,
    status: 'COMPLETED',
    completed: true,
    name: campaign.name,
    totalRecipients,
    sentCount: campaign.sentCount,
    deliveredCount: campaign.deliveredCount,
    readCount: campaign.readCount,
    failedCount,
    skippedCount: campaign.skippedCount,
    failedRate,
  });
  void emitWaEvent('whatsapp.campaign.completed', {
    campaignId: id,
    name: campaign.name,
    totalRecipients,
    sentCount: campaign.sentCount,
    failedCount,
    failedRate,
  }).catch(() => {});
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
      segmentId: source.segmentId,
      variableMapping: source.variableMapping ?? undefined,
      // The campaign-wide send values: header media, coupon, offer expiry and the
      // carousel's cards. Left behind, the clone fails the launch pre-flight for
      // parameters the source had — and the recurring re-run below clones and
      // launches in one step, so a recurring media-header or carousel campaign
      // would run once and then stop with nobody watching.
      templateParams: source.templateParams ?? undefined,
      batchSize: source.batchSize,
      throttlePerSec: source.throttlePerSec,
      // Copied with the rest of the send configuration: a recurring campaign that
      // was set to respect business hours must keep respecting them on every
      // re-run, which is the run nobody is watching.
      respectBusinessHours: source.respectBusinessHours,
      isAbTest: source.isAbTest,
      // The A/B DESIGN is copied; the VERDICT is not. Carrying winnerVariantId
      // onto a clone would bind a fresh audience to last month's winner before a
      // single message of this run had been measured.
      abTestSamplePct: source.abTestSamplePct,
      abTestMetric: source.abTestMetric,
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
        // Copied with the variant, like the steps below: without it a cloned A/B
        // campaign sends the same templates with every placeholder blank.
        variableMapping: (v.variableMapping as Prisma.InputJsonValue) ?? undefined,
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
          variableMapping: Array.isArray(s.variableMapping)
            ? (s.variableMapping as string[])
            : undefined,
        })),
        // Duplicating must keep working after Meta pauses a step's template —
        // making an editable copy is exactly how the operator repairs it. The
        // launch below (and any later manual launch) still refuses.
        { validateTemplates: false }
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

  // Same rule the detail page uses to show the Retry button. Without it the
  // endpoint was still directly callable on a CANCELLED campaign, and the
  // unconditional `status: 'RUNNING'` below flipped it back on and resumed
  // sending — an operator who stopped a campaign mid-blast (wrong audience,
  // wrong template, budget pulled) could have it start messaging again from a
  // single stray request, with only the hidden button standing in the way.
  if (!['COMPLETED', 'PAUSED', 'RUNNING'].includes(campaign.status)) {
    throw new AppError(`Cannot retry a ${campaign.status} campaign`, 409, 'WA_CAMPAIGN_BAD_STATE');
  }
  // Archived means the operator considers it removed (it is hidden from the
  // default list); reviving it out of the archive is the same surprise.
  if (campaign.archivedAt) {
    throw new AppError('Cannot retry an archived campaign', 409, 'WA_CAMPAIGN_BAD_STATE');
  }

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
  //
  // Paged, not a single unbounded scan. This used to `findMany` EVERY failed row
  // into the Node heap and then send one `id: { in: [...] }` update — on a large
  // campaign that is hundreds of thousands of UUIDs in memory and past Postgres'
  // 65535 bind-parameter ceiling, so "retry failed" died with an opaque driver
  // error on exactly the campaigns that needed it most. Same keyset shape as
  // `enqueuePendingRecipients` below.
  const RETRY_PAGE = 5000;
  let cursor: string | undefined;
  let failedSeen = 0;
  let resetCount = 0;
  for (;;) {
    const page = await prisma.waCampaignRecipient.findMany({
      where: { campaignId: id, status: 'FAILED' },
      select: { id: true, errorCode: true },
      orderBy: { id: 'asc' },
      take: RETRY_PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (page.length === 0) break;
    failedSeen += page.length;
    cursor = page[page.length - 1].id;
    const retryableIds = page
      .filter((r) => r.errorCode == null || isRetryableErrorCode(r.errorCode))
      .map((r) => r.id);
    if (retryableIds.length) {
      const res = await prisma.waCampaignRecipient.updateMany({
        where: { id: { in: retryableIds } },
        data: { status: 'PENDING', wamid: null, errorCode: null, sentAt: null },
      });
      resetCount += res.count;
    }
    if (page.length < RETRY_PAGE) break;
  }
  if (resetCount === 0) {
    throw new AppError(
      failedSeen
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
      _sum: { costPaise: true, costAmount: true },
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
        // Summed from the EXACT per-message decimals and rounded once, not from
        // the per-row rounded minor units. Meta quotes 0.0383, which each row
        // rounds to 4 — a few percent per message that compounds into a
        // materially wrong figure over a six-figure campaign. Falls back to the
        // rounded column for rows written before `costAmount` existed.
        //
        // Still a single number in the WABA's currency, whatever that is: the
        // per-message currency lives on WaMessage.costCurrency and the analytics
        // summary is where the two are reconciled.
        actualCostPaise:
          cost._sum.costAmount != null
            ? Math.round(Number(cost._sum.costAmount) * 100)
            : (cost._sum.costPaise ?? 0),
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
 * Reconcile campaign recipients + campaign counters from a batch of
 * delivery-status webhooks (the inbound worker hands over a whole
 * `value.statuses` array). Forward-only by status rank, then a coalesced
 * counter recompute per campaign so the numbers self-heal.
 *
 * Batched on purpose: Meta emits `sent`, `delivered` and `read` for every
 * message, and the old per-status findFirst + update meant two extra
 * round-trips per callback — ~300k of them for a 50k campaign, competing for
 * the same connections that campaign is still sending on, which is how
 * delivery ticks ended up hours behind the send.
 *
 * @returns the wamids that have NO recipient row at all, so the caller can
 * decide whether to replay the webhook later. A recipient's wamid is written
 * only after the send call returns, while `dispatchOutbound` has already
 * stamped it on the WaMessage, so a status callback can legitimately arrive in
 * between; swallowing that left the recipient at SENT for good and the
 * campaign's delivered count short by everyone who fell in the gap.
 */
export async function reconcileRecipientStatuses(
  updates: Array<{ wamid: string; status: WaCampaignRecipientStatus; errorCode?: string | null }>
): Promise<string[]> {
  if (updates.length === 0) return [];

  // A single webhook POST can carry `delivered` and `read` for the same
  // message; keep only the furthest-along status per wamid so each recipient is
  // written once.
  const wanted = new Map<string, { status: WaCampaignRecipientStatus; errorCode: string | null }>();
  for (const u of updates) {
    if (!u.wamid) continue;
    const prev = wanted.get(u.wamid);
    if (prev && RECIP_RANK[u.status] < RECIP_RANK[prev.status]) continue;
    wanted.set(u.wamid, { status: u.status, errorCode: u.errorCode ?? null });
  }
  if (wanted.size === 0) return [];

  const recipients = await prisma.waCampaignRecipient.findMany({
    where: { wamid: { in: [...wanted.keys()] } },
    select: { id: true, wamid: true, status: true, campaignId: true },
  });
  const present = new Set(recipients.map((r) => r.wamid).filter((w): w is string => Boolean(w)));
  const missing = [...wanted.keys()].filter((wamid) => !present.has(wamid));

  const groups = new Map<
    string,
    { status: WaCampaignRecipientStatus; errorCode: string | null; ids: string[] }
  >();
  const campaignIds = new Set<string>();
  for (const recipient of recipients) {
    const want = recipient.wamid ? wanted.get(recipient.wamid) : undefined;
    if (!want || !recipient.campaignId) continue;
    if (RECIP_RANK[want.status] <= RECIP_RANK[recipient.status]) continue;

    // A cap / opted-out code is a SKIP, not a failure — same classification the
    // synchronous send path uses, so the two agree about what a campaign's
    // numbers mean.
    const finalStatus =
      want.status === 'FAILED' && isSkipErrorCode(want.errorCode)
        ? ('SKIPPED' as WaCampaignRecipientStatus)
        : want.status;

    // Every recipient that ends on the same (status, errorCode) shares one
    // write — in a status batch that is nearly all of them.
    const key = `${finalStatus}\u0000${want.errorCode ?? ''}`;
    const group = groups.get(key);
    if (group) group.ids.push(recipient.id);
    else groups.set(key, { status: finalStatus, errorCode: want.errorCode, ids: [recipient.id] });
    campaignIds.add(recipient.campaignId);
  }

  for (const group of groups.values()) {
    await prisma.waCampaignRecipient.updateMany({
      where: { id: { in: group.ids } },
      data: {
        status: group.status,
        ...(group.errorCode ? { errorCode: group.errorCode } : {}),
      },
    });
  }
  // Coalesced, not awaited. The per-recipient row writes above are the durable
  // part; the campaign rollup can lag a few seconds.
  for (const campaignId of campaignIds) scheduleCampaignCounterRecompute(campaignId);

  return missing;
}

/**
 * Single-status form of {@link reconcileRecipientStatuses}, for callers that
 * only ever hold one delivery status at a time.
 */
export async function reconcileRecipientStatus(
  wamid: string,
  status: WaCampaignRecipientStatus,
  opts: { errorCode?: string | null } = {}
): Promise<void> {
  await reconcileRecipientStatuses([{ wamid, status, errorCode: opts.errorCode ?? null }]);
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
