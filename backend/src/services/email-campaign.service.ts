import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';
import { getDefaultSender, getSender } from './email-sender.service';
import { getTemplate } from './email-template.service';
import { getSegment } from './email-segment.service';
import {
  resolveAudienceContactIds,
  previewAudienceSize,
  normalizeEmail,
  upsertContactByEmail,
} from './email-contact.service';
import { getSuppressedEmailSet } from './email-suppression.service';
import { getEmailSettings } from './email-settings.service';
import { setSequenceSteps, startSequence } from './email-sequence.service';
import { randomTrackingToken } from '../utils/email-token';
import { wallClockToUtc } from '../utils/email-tz';
import { addEmailCampaignBatchJob } from '../jobs/email-campaign.queue';
import type {
  Prisma,
  EmailCampaign,
  EmailCampaignStatus,
  EmailCampaignRecipientStatus,
  EmailCampaignType,
  EmailCampaignVariant,
  EmailSubscribeStatus,
} from '@prisma/client';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * SMTP outcomes that should roll a recipient back to PENDING (transient) rather
 * than mark FAILED, so the recovery cron re-batches a deliverable message.
 */
const RETRYABLE_MARKERS = [
  '421',
  '450',
  '451',
  '452',
  'greylist',
  'try again',
  'temporarily',
  'econnreset',
  'etimedout',
  'eai_again',
  'timeout',
  'connection',
];

export function isRetryableSendReason(reason?: string | null): boolean {
  if (!reason) return false;
  const r = reason.toLowerCase();
  return RETRYABLE_MARKERS.some((m) => r.includes(m));
}

const CHUNK = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

interface CreateCampaignInput {
  name: string;
  description?: string;
  senderId?: string;
  templateId?: string;
  subjectOverride?: string;
  fromNameOverride?: string | null;
  replyToOverride?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  audienceType: string; // segment | upload | manual | platform
  audienceFilter?: any;
  segmentId?: string;
  variableMapping?: any;
  attachments?: any[];
  scheduledAt?: string;
  sendTimezone?: string | null;
  batchSize?: number;
  sendRate?: number;
  type?: EmailCampaignType;
  steps?: any[];
  isAbTest?: boolean;
  variants?: VariantInput[];
  recurrenceDays?: number | null;
  createdBy: string;
}

interface VariantInput {
  label: string;
  templateId?: string;
  subjectOverride?: string;
  weight?: number;
}

export async function createCampaign(input: CreateCampaignInput) {
  const sender = input.senderId ? await getSender(input.senderId) : await getDefaultSender();
  if (!sender) throw new AppError('No sending identity configured', 400, 'EMAIL_NO_SENDER');
  if (input.templateId) await getTemplate(input.templateId); // validates existence

  const type: EmailCampaignType = input.type ?? 'BROADCAST';

  let audienceType = input.audienceType;
  let audienceFilter = input.audienceFilter;
  if (input.segmentId) {
    const segment = await getSegment(input.segmentId);
    audienceType = 'segment';
    audienceFilter = segment.filter;
  }

  const campaign = await prisma.emailCampaign.create({
    data: {
      name: input.name,
      description: input.description,
      senderId: sender.id,
      templateId: input.templateId ?? null,
      subjectOverride: input.subjectOverride ?? null,
      fromNameOverride: input.fromNameOverride ?? null,
      replyToOverride: input.replyToOverride ?? null,
      utmSource: input.utmSource ?? null,
      utmMedium: input.utmMedium ?? null,
      utmCampaign: input.utmCampaign ?? null,
      utmTerm: input.utmTerm ?? null,
      utmContent: input.utmContent ?? null,
      type,
      status: input.scheduledAt ? 'SCHEDULED' : 'DRAFT',
      audienceType,
      audienceFilter: audienceFilter ?? undefined,
      segmentId: input.segmentId ?? null,
      variableMapping: input.variableMapping ?? undefined,
      attachments: input.attachments ?? undefined,
      scheduledAt: input.scheduledAt
        ? input.sendTimezone
          ? wallClockToUtc(input.scheduledAt, input.sendTimezone)
          : new Date(input.scheduledAt)
        : null,
      sendTimezone: input.sendTimezone ?? null,
      batchSize: input.batchSize ?? 200,
      sendRate: input.sendRate ?? 20,
      isAbTest: input.isAbTest ?? false,
      recurrenceDays: input.recurrenceDays ?? null,
      createdBy: input.createdBy,
    },
  });

  if (type === 'SEQUENCE' && input.steps?.length) {
    await setSequenceSteps(campaign.id, input.steps);
  }
  if (input.variants?.length) {
    await setVariants(campaign.id, input.variants);
  }
  return campaign;
}

interface UpdateCampaignInput {
  name?: string;
  description?: string | null;
  senderId?: string;
  templateId?: string | null;
  subjectOverride?: string | null;
  fromNameOverride?: string | null;
  replyToOverride?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  scheduledAt?: string | null;
  sendTimezone?: string | null;
  batchSize?: number;
  sendRate?: number;
  recurrenceDays?: number | null;
  segmentId?: string;
  audienceType?: string;
  audienceFilter?: any;
  variableMapping?: any;
  attachments?: any[];
}

/** Edit a campaign that hasn't gone out yet (DRAFT or SCHEDULED only). */
export async function updateCampaign(
  id: string,
  patch: UpdateCampaignInput
): Promise<EmailCampaign> {
  const campaign = await prisma.emailCampaign.findUnique({ where: { id } });
  if (!campaign) throw new AppError('Campaign not found', 404, 'EMAIL_CAMPAIGN_NOT_FOUND');
  if (!['DRAFT', 'SCHEDULED', 'PAUSED'].includes(campaign.status)) {
    throw new AppError(
      'Only draft, scheduled or paused campaigns can be edited',
      400,
      'EMAIL_CAMPAIGN_NOT_EDITABLE'
    );
  }

  const data: Prisma.EmailCampaignUpdateInput = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.subjectOverride !== undefined) data.subjectOverride = patch.subjectOverride;
  if (patch.senderId !== undefined) {
    await getSender(patch.senderId);
    data.sender = { connect: { id: patch.senderId } };
  }
  if (patch.templateId !== undefined) {
    if (patch.templateId) {
      await getTemplate(patch.templateId);
      data.template = { connect: { id: patch.templateId } };
    } else {
      data.template = { disconnect: true };
    }
  }
  if (patch.fromNameOverride !== undefined) data.fromNameOverride = patch.fromNameOverride;
  if (patch.replyToOverride !== undefined) data.replyToOverride = patch.replyToOverride;
  if (patch.utmSource !== undefined) data.utmSource = patch.utmSource;
  if (patch.utmMedium !== undefined) data.utmMedium = patch.utmMedium;
  if (patch.utmCampaign !== undefined) data.utmCampaign = patch.utmCampaign;
  if (patch.utmTerm !== undefined) data.utmTerm = patch.utmTerm;
  if (patch.utmContent !== undefined) data.utmContent = patch.utmContent;
  if (patch.sendTimezone !== undefined) data.sendTimezone = patch.sendTimezone;
  if (patch.batchSize !== undefined) data.batchSize = patch.batchSize;
  if (patch.sendRate !== undefined) data.sendRate = patch.sendRate;
  if (patch.recurrenceDays !== undefined) data.recurrenceDays = patch.recurrenceDays;
  if (patch.variableMapping !== undefined)
    data.variableMapping = patch.variableMapping ?? undefined;
  if (patch.attachments !== undefined) data.attachments = patch.attachments ?? undefined;

  if (patch.segmentId) {
    const segment = await getSegment(patch.segmentId);
    data.audienceType = 'segment';
    data.segmentId = patch.segmentId;
    data.audienceFilter = segment.filter ?? undefined;
  } else if (patch.audienceFilter !== undefined) {
    if (patch.audienceType) data.audienceType = patch.audienceType;
    data.audienceFilter = patch.audienceFilter ?? undefined;
  } else if (patch.audienceType !== undefined) {
    data.audienceType = patch.audienceType;
  }

  if (patch.scheduledAt !== undefined) {
    const tz = patch.sendTimezone ?? campaign.sendTimezone;
    data.scheduledAt = patch.scheduledAt
      ? tz
        ? wallClockToUtc(patch.scheduledAt, tz)
        : new Date(patch.scheduledAt)
      : null;
    data.status = patch.scheduledAt ? 'SCHEDULED' : 'DRAFT';
  }

  return prisma.emailCampaign.update({ where: { id }, data });
}

// ---- Variants (A/B) ----------------------------------------------------------

export async function setVariants(
  campaignId: string,
  variants: VariantInput[]
): Promise<EmailCampaignVariant[]> {
  await prisma.emailCampaignVariant.deleteMany({ where: { campaignId } });
  if (variants.length) {
    await prisma.emailCampaignVariant.createMany({
      data: variants.map((v) => ({
        campaignId,
        label: v.label,
        templateId: v.templateId ?? null,
        subjectOverride: v.subjectOverride ?? null,
        weight: v.weight && v.weight > 0 ? v.weight : 1,
      })),
    });
  }
  return getVariants(campaignId);
}

export async function getVariants(campaignId: string): Promise<EmailCampaignVariant[]> {
  return prisma.emailCampaignVariant.findMany({
    where: { campaignId },
    orderBy: { createdAt: 'asc' },
  });
}

function pickVariantIndex(cumulative: number[], total: number, index: number): number {
  const slot = total > 0 ? index % total : 0;
  for (let i = 0; i < cumulative.length; i += 1) {
    if (slot < cumulative[i]) return i;
  }
  return cumulative.length - 1;
}

// ---- Reads -------------------------------------------------------------------

export async function listCampaigns(filters: {
  status?: EmailCampaignStatus;
  q?: string;
  archived?: boolean;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, filters.limit ?? 30);
  const where: Prisma.EmailCampaignWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.q ? { name: { contains: filters.q, mode: 'insensitive' } } : {}),
    // Archived campaigns are hidden from the default list and shown only under
    // the Archived filter.
    archivedAt: filters.archived ? { not: null } : null,
  };
  const [items, total] = await Promise.all([
    prisma.emailCampaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        template: { select: { name: true, category: true } },
        sender: { select: { fromEmail: true, fromName: true, dkimVerified: true } },
      },
    }),
    prisma.emailCampaign.count({ where }),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getCampaign(id: string) {
  return prisma.emailCampaign.findUnique({
    where: { id },
    include: {
      template: { select: { name: true, subject: true, category: true, status: true } },
      sender: {
        select: {
          fromEmail: true,
          fromName: true,
          dkimVerified: true,
          spfVerified: true,
          dmarcVerified: true,
        },
      },
      variants: { orderBy: { createdAt: 'asc' } },
      steps: { orderBy: { stepOrder: 'asc' } },
    },
  });
}

export async function getRecipients(
  campaignId: string,
  page = 1,
  limit = 50,
  status?: EmailCampaignRecipientStatus
) {
  const where: Prisma.EmailCampaignRecipientWhereInput = {
    campaignId,
    ...(status ? { status } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.emailCampaignRecipient.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { contact: { select: { email: true, name: true } } },
    }),
    prisma.emailCampaignRecipient.count({ where }),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getRecipientsForExport(campaignId: string) {
  return prisma.emailCampaignRecipient.findMany({
    where: { campaignId },
    orderBy: { createdAt: 'asc' },
    take: 200_000,
    include: { contact: { select: { email: true, name: true } } },
  });
}

// ---- Eligibility + materialize ----------------------------------------------

type EligibleContact = {
  id: string;
  email: string;
  name: string | null;
  subscribeStatus: EmailSubscribeStatus;
  isBlocked: boolean;
  lastMarketingAt: Date | null;
  attributes: Prisma.JsonValue;
};

const AUDIENCE_CONTACT_SELECT = {
  id: true,
  email: true,
  name: true,
  subscribeStatus: true,
  isBlocked: true,
  lastMarketingAt: true,
  attributes: true,
} as const;

function isEligible(
  c: EligibleContact,
  isMarketing: boolean,
  marketingCap: number,
  suppressed: Set<string>,
  now: number
): boolean {
  if (c.isBlocked) return false;
  if (suppressed.has(c.email)) return false;
  if (isMarketing) {
    if (c.subscribeStatus !== 'SUBSCRIBED') return false;
    if (marketingCap > 0 && c.lastMarketingAt && now - c.lastMarketingAt.getTime() < DAY_MS) {
      return false;
    }
    return true;
  }
  return c.subscribeStatus !== 'UNSUBSCRIBED';
}

/** Preview eligible recipient count for a draft campaign. */
export async function previewCampaignAudience(campaignId: string): Promise<{ count: number }> {
  const campaign = await prisma.emailCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new AppError('Campaign not found', 404, 'EMAIL_CAMPAIGN_NOT_FOUND');
  // Coarse, cheap estimate (skips per-contact eligibility for speed).
  const count = await previewAudienceSize({
    audienceType: campaign.audienceType,
    audienceFilter: campaign.audienceFilter as any,
    segmentId: campaign.segmentId,
  });
  return { count };
}

async function materialize(campaign: EmailCampaign, isMarketing: boolean): Promise<number> {
  const contactIds = await resolveAudienceContactIds({
    audienceType: campaign.audienceType,
    audienceFilter: campaign.audienceFilter as any,
    segmentId: campaign.segmentId,
  });
  const suppressed = await getSuppressedEmailSet();
  const settings = await getEmailSettings();
  const marketingCap = settings.marketingCapPer24h ?? 1;
  const now = Date.now();

  const variants = campaign.isAbTest
    ? await prisma.emailCampaignVariant.findMany({
        where: { campaignId: campaign.id },
        orderBy: { createdAt: 'asc' },
      })
    : [];
  const useVariants = variants.length > 0;
  let totalWeight = 0;
  const cumulative = variants.map((v) => (totalWeight += Math.max(1, v.weight)));
  let assigned = 0;

  for (let i = 0; i < contactIds.length; i += CHUNK) {
    const slice = contactIds.slice(i, i + CHUNK);
    const contacts = (await prisma.emailContact.findMany({
      where: { id: { in: slice } },
      select: AUDIENCE_CONTACT_SELECT,
    })) as EligibleContact[];

    const rows = contacts
      .filter((c) => isEligible(c, isMarketing, marketingCap, suppressed, now))
      .map((c) => ({
        campaignId: campaign.id,
        contactId: c.id,
        email: c.email,
        variantId: useVariants
          ? variants[pickVariantIndex(cumulative, totalWeight, assigned++)].id
          : null,
        variables: (c.attributes ?? {}) as Prisma.InputJsonValue,
        trackingToken: randomTrackingToken(),
        status: 'PENDING' as EmailCampaignRecipientStatus,
      }));
    if (rows.length) {
      await prisma.emailCampaignRecipient.createMany({ data: rows, skipDuplicates: true });
    }
  }

  // Seed / monitoring inboxes — injected into every campaign for deliverability
  // tracking. Marked isSeed so they're excluded from audience metrics.
  for (const raw of settings.seedAddresses ?? []) {
    const email = normalizeEmail(raw);
    if (!email) continue;
    const contact = await upsertContactByEmail(email, { subscribeSource: 'seed' }).catch(
      () => null
    );
    if (!contact) continue;
    await prisma.emailCampaignRecipient.createMany({
      data: [
        {
          campaignId: campaign.id,
          contactId: contact.id,
          email,
          isSeed: true,
          variables: {},
          trackingToken: randomTrackingToken(),
          status: 'PENDING' as EmailCampaignRecipientStatus,
        },
      ],
      skipDuplicates: true,
    });
  }

  // Audience total excludes seeds.
  return prisma.emailCampaignRecipient.count({ where: { campaignId: campaign.id, isSeed: false } });
}

// ---- Lifecycle ---------------------------------------------------------------

/** Launch (or resume) a campaign: verify sender/template, materialize, enqueue. */
export async function launchCampaign(id: string) {
  const campaign = await prisma.emailCampaign.findUnique({ where: { id } });
  if (!campaign) throw new AppError('Campaign not found', 404, 'EMAIL_CAMPAIGN_NOT_FOUND');
  if (!['DRAFT', 'SCHEDULED', 'PAUSED'].includes(campaign.status)) {
    throw new AppError(
      `Cannot launch a ${campaign.status} campaign`,
      409,
      'EMAIL_CAMPAIGN_BAD_STATE'
    );
  }
  if (!campaign.templateId) {
    throw new AppError('Attach a template before launching', 400, 'EMAIL_CAMPAIGN_NO_TEMPLATE');
  }
  const template = await getTemplate(campaign.templateId);
  const sender = await getSender(campaign.senderId);
  // Deliverability guard: a self-hosted campaign only sends from a DKIM-verified
  // identity (the #1 inbox-placement lever). Verify DNS on the Settings page first.
  if (!sender.isActive) throw new AppError('Sender is inactive', 409, 'EMAIL_SENDER_INACTIVE');
  if (!sender.dkimVerified) {
    throw new AppError(
      'Sender DKIM is not verified — verify DNS on the deliverability page before sending',
      409,
      'EMAIL_SENDER_NOT_READY'
    );
  }

  const isMarketing = template.category !== 'TRANSACTIONAL';

  const claim = await prisma.emailCampaign.updateMany({
    where: { id, status: { in: ['DRAFT', 'SCHEDULED', 'PAUSED'] } },
    data: {
      status: 'RUNNING',
      startedAt: campaign.startedAt ?? new Date(),
      autoPausedReason: null,
    },
  });
  if (claim.count !== 1) return prisma.emailCampaign.findUnique({ where: { id } });

  let total = await prisma.emailCampaignRecipient.count({ where: { campaignId: id } });
  if (total === 0) total = await materialize(campaign, isMarketing);
  if (total === 0) {
    await prisma.emailCampaign
      .update({ where: { id }, data: { status: 'DRAFT', startedAt: campaign.startedAt ?? null } })
      .catch(() => {});
    throw new AppError('No eligible recipients for this audience', 400, 'EMAIL_NO_RECIPIENTS');
  }

  await prisma.emailCampaign.update({ where: { id }, data: { totalRecipients: total } });

  if (campaign.type === 'SEQUENCE') {
    await startSequence(id);
    return prisma.emailCampaign.findUnique({ where: { id } });
  }

  const pending = await prisma.emailCampaignRecipient.findMany({
    where: { campaignId: id, status: 'PENDING' },
    select: { id: true },
  });
  const batchSize = campaign.batchSize || 200;
  for (let i = 0; i < pending.length; i += batchSize) {
    await addEmailCampaignBatchJob({
      campaignId: id,
      recipientIds: pending.slice(i, i + batchSize).map((r) => r.id),
    });
  }
  return prisma.emailCampaign.findUnique({ where: { id } });
}

/**
 * Pre-materialize (or refresh) a campaign's recipient set without launching, so
 * an admin can review the exact audience before sending. Idempotent
 * (skipDuplicates) — safe to call repeatedly on a DRAFT/SCHEDULED/PAUSED campaign.
 */
export async function materializeCampaign(id: string): Promise<{ total: number }> {
  const campaign = await prisma.emailCampaign.findUnique({ where: { id } });
  if (!campaign) throw new AppError('Campaign not found', 404, 'EMAIL_CAMPAIGN_NOT_FOUND');
  if (campaign.status === 'RUNNING' || campaign.status === 'COMPLETED') {
    throw new AppError(
      'Cannot re-materialize a running/completed campaign',
      409,
      'EMAIL_CAMPAIGN_BAD_STATE'
    );
  }
  const isMarketing = campaign.templateId
    ? (await getTemplate(campaign.templateId)).category !== 'TRANSACTIONAL'
    : true;
  const total = await materialize(campaign, isMarketing);
  await prisma.emailCampaign.update({ where: { id }, data: { totalRecipients: total } });
  return { total };
}

/**
 * Reconcile a campaign's recipient state from recorded bounce/complaint events
 * (self-heal if an inbound effect partially failed), then recompute counters.
 * The plan's named `reconcile` lifecycle op — bounces have no ESP webhook, so
 * this re-derives state from the EmailEvent log.
 */
export async function reconcileCampaign(id: string) {
  const campaign = await prisma.emailCampaign.findUnique({ where: { id } });
  if (!campaign) throw new AppError('Campaign not found', 404, 'EMAIL_CAMPAIGN_NOT_FOUND');

  const bounces = await prisma.emailEvent.findMany({
    where: { campaignId: id, eventType: 'BOUNCE', recipientId: { not: null } },
    select: { recipientId: true, bounceType: true },
  });
  for (const e of bounces) {
    if (!e.recipientId) continue;
    await prisma.emailCampaignRecipient
      .updateMany({
        where: { id: e.recipientId, bouncedAt: null },
        data: {
          bouncedAt: new Date(),
          bounceType: e.bounceType ?? 'hard',
          ...(e.bounceType === 'soft' ? {} : { status: 'BOUNCED' }),
        },
      })
      .catch(() => {});
  }

  const complaints = await prisma.emailEvent.findMany({
    where: { campaignId: id, eventType: 'COMPLAINT', recipientId: { not: null } },
    select: { recipientId: true },
  });
  for (const e of complaints) {
    if (!e.recipientId) continue;
    await prisma.emailCampaignRecipient
      .updateMany({
        where: { id: e.recipientId, complainedAt: null },
        data: { complainedAt: new Date(), status: 'COMPLAINED' },
      })
      .catch(() => {});
  }

  await recomputeCampaignCounters(id);
  return prisma.emailCampaign.findUnique({ where: { id } });
}

export async function pauseCampaign(id: string, reason?: string) {
  return prisma.emailCampaign.update({
    where: { id },
    data: { status: 'PAUSED', ...(reason ? { autoPausedReason: reason } : {}) },
  });
}

export async function resumeCampaign(id: string) {
  return launchCampaign(id);
}

export async function cancelCampaign(id: string) {
  return prisma.emailCampaign.update({
    where: { id },
    data: { status: 'CANCELLED', completedAt: new Date() },
  });
}

/**
 * Permanently delete a campaign that is not in flight (DRAFT / COMPLETED /
 * CANCELLED / FAILED). Recipients/steps/variants cascade; events/send-logs keep
 * their rows (campaignId is a plain string column) for the audit trail.
 */
export async function deleteCampaign(id: string) {
  const campaign = await prisma.emailCampaign.findUnique({ where: { id } });
  if (!campaign) throw new AppError('Campaign not found', 404, 'EMAIL_CAMPAIGN_NOT_FOUND');
  if (['RUNNING', 'QUEUED', 'SCHEDULED', 'PAUSED'].includes(campaign.status)) {
    throw new AppError('Cancel the campaign before deleting it', 409, 'EMAIL_CAMPAIGN_IN_FLIGHT');
  }
  return prisma.emailCampaign.delete({ where: { id } });
}

/**
 * Soft-archive a campaign (hide from the default list without losing its real
 * status). In-flight campaigns must be paused/cancelled first.
 */
export async function archiveCampaign(id: string, archived: boolean) {
  const campaign = await prisma.emailCampaign.findUnique({ where: { id } });
  if (!campaign) throw new AppError('Campaign not found', 404, 'EMAIL_CAMPAIGN_NOT_FOUND');
  if (archived && ['RUNNING', 'QUEUED', 'SCHEDULED'].includes(campaign.status)) {
    throw new AppError(
      'Pause or cancel the campaign before archiving it',
      409,
      'EMAIL_CAMPAIGN_IN_FLIGHT'
    );
  }
  return prisma.emailCampaign.update({
    where: { id },
    data: { archivedAt: archived ? new Date() : null },
  });
}

export type CampaignBulkAction =
  | 'delete'
  | 'pause'
  | 'cancel'
  | 'resume'
  | 'duplicate'
  | 'archive'
  | 'unarchive';

/**
 * Apply a lifecycle action to many campaigns. Per-campaign so each keeps its own
 * guards (e.g. deleteCampaign refuses in-flight); failures are collected, not
 * fatal, so one bad id never blocks the rest.
 */
export async function bulkCampaigns(
  ids: string[],
  action: CampaignBulkAction
): Promise<{ affected: number; errors: Array<{ id: string; error: string }> }> {
  const errors: Array<{ id: string; error: string }> = [];
  let affected = 0;
  for (const id of [...new Set(ids)]) {
    try {
      switch (action) {
        case 'delete':
          await deleteCampaign(id);
          break;
        case 'pause':
          await pauseCampaign(id);
          break;
        case 'cancel':
          await cancelCampaign(id);
          break;
        case 'resume':
          await resumeCampaign(id);
          break;
        case 'duplicate':
          await cloneCampaign(id, { nameSuffix: ' (copy)' });
          break;
        case 'archive':
          await archiveCampaign(id, true);
          break;
        case 'unarchive':
          await archiveCampaign(id, false);
          break;
      }
      affected++;
    } catch (e) {
      errors.push({ id, error: (e as Error).message });
    }
  }
  return { affected, errors };
}

/** Disarm recurrence on a running/scheduled recurring campaign (stops future re-runs). */
export async function stopRecurrence(id: string) {
  const campaign = await prisma.emailCampaign.findUnique({ where: { id } });
  if (!campaign) throw new AppError('Campaign not found', 404, 'EMAIL_CAMPAIGN_NOT_FOUND');
  return prisma.emailCampaign.update({
    where: { id },
    data: { recurrenceDays: null, nextRunAt: null },
  });
}

/** Re-queue leftover PENDING recipients (recovery after a pause/hourly-cap stop). */
export async function requeuePending(id: string) {
  const campaign = await prisma.emailCampaign.findUnique({ where: { id } });
  if (!campaign) return;
  const pending = await prisma.emailCampaignRecipient.findMany({
    where: { campaignId: id, status: 'PENDING' },
    select: { id: true },
  });
  const batchSize = campaign.batchSize || 200;
  for (let i = 0; i < pending.length; i += batchSize) {
    await addEmailCampaignBatchJob({
      campaignId: id,
      recipientIds: pending.slice(i, i + batchSize).map((r) => r.id),
    });
  }
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * DAY_MS);
}

/** Clone a campaign into a fresh DRAFT (carrying variants + drip steps). */
export async function cloneCampaign(
  campaignId: string,
  opts: { launch?: boolean; nameSuffix?: string } = {}
): Promise<EmailCampaign> {
  const source = await prisma.emailCampaign.findUnique({ where: { id: campaignId } });
  if (!source) throw new AppError('Campaign not found', 404, 'EMAIL_CAMPAIGN_NOT_FOUND');

  const clone = await prisma.emailCampaign.create({
    data: {
      name: `${source.name}${opts.nameSuffix ?? ''}`,
      description: source.description,
      senderId: source.senderId,
      templateId: source.templateId,
      subjectOverride: source.subjectOverride,
      type: source.type,
      status: 'DRAFT',
      audienceType: source.audienceType,
      audienceFilter: source.audienceFilter ?? undefined,
      segmentId: source.segmentId,
      variableMapping: source.variableMapping ?? undefined,
      batchSize: source.batchSize,
      sendRate: source.sendRate,
      isAbTest: source.isAbTest,
      recurrenceDays: source.recurrenceDays,
      parentCampaignId: source.id,
      createdBy: source.createdBy,
    },
  });

  const variants = await getVariants(source.id);
  if (variants.length) {
    await prisma.emailCampaignVariant.createMany({
      data: variants.map((v) => ({
        campaignId: clone.id,
        label: v.label,
        templateId: v.templateId,
        subjectOverride: v.subjectOverride,
        weight: v.weight,
      })),
    });
  }
  if (source.type === 'SEQUENCE') {
    const steps = await prisma.emailCampaignStep.findMany({
      where: { campaignId: source.id },
      orderBy: { stepOrder: 'asc' },
    });
    if (steps.length) {
      await setSequenceSteps(
        clone.id,
        steps.map((s) => ({
          stepOrder: s.stepOrder,
          templateId: s.templateId,
          subject: s.subject,
          delayHours: s.delayHours,
          condition: s.condition,
        }))
      );
    }
  }

  if (opts.launch) {
    await launchCampaign(clone.id);
    if (source.recurrenceDays && source.recurrenceDays > 0) {
      await prisma.emailCampaign
        .update({
          where: { id: source.id },
          data: { nextRunAt: addDays(new Date(), source.recurrenceDays) },
        })
        .catch(() => {});
    }
  }
  return clone;
}

export async function cloneAndLaunchRecurring(campaignId: string): Promise<EmailCampaign> {
  return cloneCampaign(campaignId, { launch: true });
}

/** Reset FAILED recipients back to PENDING and re-enqueue them. */
export async function retryFailedRecipients(id: string) {
  const campaign = await prisma.emailCampaign.findUnique({ where: { id } });
  if (!campaign) throw new AppError('Campaign not found', 404, 'EMAIL_CAMPAIGN_NOT_FOUND');
  const reset = await prisma.emailCampaignRecipient.updateMany({
    where: { campaignId: id, status: 'FAILED' },
    data: { status: 'PENDING', errorMessage: null, sentAt: null },
  });
  if (reset.count === 0)
    throw new AppError('No failed recipients to retry', 400, 'EMAIL_NO_FAILED_RECIPIENTS');

  await prisma.emailCampaign.update({
    where: { id },
    data: { status: 'RUNNING', completedAt: null, autoPausedReason: null },
  });
  await recomputeCampaignCounters(id);
  await requeuePending(id);
  return prisma.emailCampaign.findUnique({ where: { id } });
}

// ---- Counters ----------------------------------------------------------------

/**
 * Recompute denormalized counters from the recipient table (source of truth) so
 * they self-heal and never drift past totalRecipients.
 */
export async function recomputeCampaignCounters(campaignId: string): Promise<void> {
  // Seed/monitoring recipients (isSeed) are excluded from all audience metrics.
  const [groups, opened, clicked, bounced, complained, unsub, replied, total] = await Promise.all([
    prisma.emailCampaignRecipient.groupBy({
      by: ['status'],
      where: { campaignId, isSeed: false },
      _count: { _all: true },
    }),
    prisma.emailCampaignRecipient.count({
      where: { campaignId, isSeed: false, openedAt: { not: null } },
    }),
    prisma.emailCampaignRecipient.count({
      where: { campaignId, isSeed: false, clickedAt: { not: null } },
    }),
    prisma.emailCampaignRecipient.count({
      where: { campaignId, isSeed: false, bouncedAt: { not: null } },
    }),
    prisma.emailCampaignRecipient.count({
      where: { campaignId, isSeed: false, complainedAt: { not: null } },
    }),
    prisma.emailCampaignRecipient.count({
      where: { campaignId, isSeed: false, unsubscribedAt: { not: null } },
    }),
    prisma.emailCampaignRecipient.count({
      where: { campaignId, isSeed: false, repliedAt: { not: null } },
    }),
    prisma.emailCampaignRecipient.count({ where: { campaignId, isSeed: false } }),
  ]);
  const by: Record<string, number> = {};
  for (const g of groups) by[g.status] = g._count._all;
  const sent =
    (by.SENT ?? 0) +
    (by.OPENED ?? 0) +
    (by.CLICKED ?? 0) +
    (by.BOUNCED ?? 0) +
    (by.COMPLAINED ?? 0);
  const failed = by.FAILED ?? 0;
  const skipped = by.SKIPPED ?? 0;
  const delivered = Math.max(0, sent - bounced);

  await prisma.emailCampaign
    .update({
      where: { id: campaignId },
      data: {
        totalRecipients: total,
        sentCount: sent,
        deliveredCount: delivered,
        openedCount: opened,
        clickedCount: clicked,
        bouncedCount: bounced,
        complainedCount: complained,
        unsubscribedCount: unsub,
        failedCount: failed,
        skippedCount: skipped,
        repliedCount: replied,
      },
    })
    .catch(() => {});

  await recomputeVariantCounters(campaignId);
}

async function recomputeVariantCounters(campaignId: string): Promise<void> {
  const variants = await prisma.emailCampaignVariant.findMany({
    where: { campaignId },
    select: { id: true },
  });
  if (variants.length === 0) return;
  const [groups, openedG, clickedG, bouncedG] = await Promise.all([
    prisma.emailCampaignRecipient.groupBy({
      by: ['variantId', 'status'],
      where: { campaignId, variantId: { not: null } },
      _count: { _all: true },
    }),
    prisma.emailCampaignRecipient.groupBy({
      by: ['variantId'],
      where: { campaignId, variantId: { not: null }, openedAt: { not: null } },
      _count: { _all: true },
    }),
    prisma.emailCampaignRecipient.groupBy({
      by: ['variantId'],
      where: { campaignId, variantId: { not: null }, clickedAt: { not: null } },
      _count: { _all: true },
    }),
    prisma.emailCampaignRecipient.groupBy({
      by: ['variantId'],
      where: { campaignId, variantId: { not: null }, bouncedAt: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const byVariant: Record<string, Record<string, number>> = {};
  for (const g of groups) {
    if (!g.variantId) continue;
    (byVariant[g.variantId] ??= {})[g.status] = g._count._all;
  }
  const mapCount = (
    rows: Array<{ variantId: string | null; _count: { _all: number } }>
  ): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const r of rows) if (r.variantId) out[r.variantId] = r._count._all;
    return out;
  };
  const openedBy = mapCount(openedG as any);
  const clickedBy = mapCount(clickedG as any);
  const bouncedBy = mapCount(bouncedG as any);

  await Promise.all(
    variants.map((v) => {
      const b = byVariant[v.id] ?? {};
      const sent =
        (b.SENT ?? 0) + (b.OPENED ?? 0) + (b.CLICKED ?? 0) + (b.BOUNCED ?? 0) + (b.COMPLAINED ?? 0);
      return prisma.emailCampaignVariant
        .update({
          where: { id: v.id },
          data: {
            sentCount: sent,
            deliveredCount: Math.max(0, sent - (bouncedBy[v.id] ?? 0)),
            openedCount: openedBy[v.id] ?? 0,
            clickedCount: clickedBy[v.id] ?? 0,
            bouncedCount: bouncedBy[v.id] ?? 0,
          },
        })
        .catch(() => {});
    })
  );
}

// ---- Blueprints (save-as-template) ------------------------------------------

export async function saveAsBlueprint(campaignId: string, name: string, createdBy?: string | null) {
  const c = await prisma.emailCampaign.findUnique({ where: { id: campaignId } });
  if (!c) throw new AppError('Campaign not found', 404, 'EMAIL_CAMPAIGN_NOT_FOUND');
  const variants = await getVariants(campaignId);
  const steps = await prisma.emailCampaignStep.findMany({
    where: { campaignId },
    orderBy: { stepOrder: 'asc' },
  });
  return prisma.emailCampaignBlueprint.create({
    data: {
      name,
      description: c.description,
      senderId: c.senderId,
      templateId: c.templateId,
      subjectOverride: c.subjectOverride,
      audienceType: c.audienceType,
      audienceFilter: c.audienceFilter ?? undefined,
      segmentId: c.segmentId,
      variableMapping: c.variableMapping ?? undefined,
      type: c.type,
      batchSize: c.batchSize,
      sendRate: c.sendRate,
      recurrenceDays: c.recurrenceDays,
      isAbTest: c.isAbTest,
      variants: variants.length
        ? (variants.map((v) => ({
            label: v.label,
            templateId: v.templateId,
            subjectOverride: v.subjectOverride,
            weight: v.weight,
          })) as Prisma.InputJsonValue)
        : undefined,
      steps: steps.length
        ? (steps.map((s) => ({
            stepOrder: s.stepOrder,
            templateId: s.templateId,
            subject: s.subject,
            delayHours: s.delayHours,
            condition: s.condition,
          })) as Prisma.InputJsonValue)
        : undefined,
      createdBy: createdBy ?? null,
    },
  });
}

export async function listBlueprints() {
  return prisma.emailCampaignBlueprint.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function deleteBlueprint(id: string) {
  return prisma.emailCampaignBlueprint.delete({ where: { id } }).catch(() => null);
}

/** Instantiate a DRAFT campaign from a saved blueprint. */
export async function createCampaignFromBlueprint(
  blueprintId: string,
  createdBy: string,
  nameOverride?: string
) {
  const bp = await prisma.emailCampaignBlueprint.findUnique({ where: { id: blueprintId } });
  if (!bp) throw new AppError('Blueprint not found', 404, 'EMAIL_BLUEPRINT_NOT_FOUND');
  return createCampaign({
    name: nameOverride || bp.name,
    description: bp.description ?? undefined,
    senderId: bp.senderId ?? undefined,
    templateId: bp.templateId ?? undefined,
    subjectOverride: bp.subjectOverride ?? undefined,
    audienceType: bp.audienceType ?? 'segment',
    audienceFilter: bp.audienceFilter,
    segmentId: bp.segmentId ?? undefined,
    variableMapping: bp.variableMapping,
    batchSize: bp.batchSize,
    sendRate: bp.sendRate,
    type: bp.type,
    isAbTest: bp.isAbTest,
    variants: (bp.variants as any) ?? undefined,
    steps: (bp.steps as any) ?? undefined,
    recurrenceDays: bp.recurrenceDays,
    createdBy,
  });
}
