import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';
import {
  createCampaign,
  type CampaignTemplateParams,
  type WaAbMetric,
} from './whatsapp-campaign.service';

/** The metrics an A/B test can be judged by — mirrors the zod enum on the API. */
const AB_METRICS: readonly WaAbMetric[] = ['delivered', 'read', 'replied'];
import type { WaCampaign } from '@prisma/client';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Reusable campaign blueprints ("save as template"): snapshot a known-good
 * campaign's full config — message template + audience (segment filter / phone
 * list) + variable mapping + throttle/batch + A/B variants + drip steps — so it
 * can be re-launched in one click without rebuilding from a blank form.
 */

/** Snapshot a campaign into a reusable blueprint. */
export async function saveCampaignAsTemplate(
  campaignId: string,
  name: string | undefined,
  createdBy: string
) {
  const c = await prisma.waCampaign.findUnique({ where: { id: campaignId } });
  if (!c) throw new AppError('Campaign not found', 404, 'WA_CAMPAIGN_NOT_FOUND');

  const [variants, steps] = await Promise.all([
    prisma.waCampaignVariant.findMany({
      where: { campaignId },
      select: { label: true, templateId: true, weight: true },
    }),
    prisma.waCampaignStep.findMany({
      where: { campaignId },
      orderBy: { stepOrder: 'asc' },
      select: { stepOrder: true, templateId: true, delayHours: true, condition: true },
    }),
  ]);

  return prisma.waCampaignTemplate.create({
    data: {
      name: name?.trim() || c.name,
      description: c.description,
      templateId: c.templateId,
      audienceType: c.audienceType,
      audienceFilter: c.audienceFilter ?? undefined,
      // The LINK, not just the frozen copy of the filter beside it. A blueprint
      // saved from a segment-driven campaign used to snapshot that segment's
      // filter forever: editing the segment afterwards changed nothing about the
      // campaigns launched from the blueprint, and no UI said the link had been
      // broken. createCampaignFromTemplate passes it back, so createCampaign's
      // segment branch re-reads the segment as it stands today.
      segmentId: c.segmentId,
      variableMapping: c.variableMapping ?? undefined,
      // The campaign-wide send values. Without them a blueprint of a
      // media-header, coupon, offer, location, catalog or carousel campaign
      // produced a campaign that could not launch — it failed the pre-flight
      // asking for exactly the value the blueprint existed to remember.
      templateParams: c.templateParams ?? undefined,
      respectBusinessHours: c.respectBusinessHours,
      // The A/B design. `isAbTest` and the variant list were saved without the
      // split share or the metric, so a blueprint of an A/B campaign came back
      // as one that sends to everyone at once with nothing to judge by.
      abTestSamplePct: c.abTestSamplePct,
      abTestMetric: c.abTestMetric,
      type: c.type,
      batchSize: c.batchSize,
      throttlePerSec: c.throttlePerSec,
      recurrenceDays: c.recurrenceDays,
      isAbTest: c.isAbTest,
      variants: variants.length ? (variants as any) : undefined,
      steps: steps.length ? (steps as any) : undefined,
      createdBy,
    },
  });
}

export async function listCampaignTemplates() {
  return prisma.waCampaignTemplate.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function deleteCampaignTemplate(id: string) {
  try {
    return await prisma.waCampaignTemplate.delete({ where: { id } });
  } catch {
    throw new AppError('Campaign template not found', 404, 'WA_CAMPAIGN_TEMPLATE_NOT_FOUND');
  }
}

/** Create a new DRAFT (or SCHEDULED, when scheduledAt is given) campaign from a
 *  saved blueprint. Re-uses createCampaign so all validation/segment logic holds. */
export async function createCampaignFromTemplate(
  templateId: string,
  opts: { name?: string; scheduledAt?: string; createdBy: string }
): Promise<WaCampaign> {
  const t = await prisma.waCampaignTemplate.findUnique({ where: { id: templateId } });
  if (!t) throw new AppError('Campaign template not found', 404, 'WA_CAMPAIGN_TEMPLATE_NOT_FOUND');

  const variants = Array.isArray(t.variants) ? (t.variants as any[]) : undefined;
  const steps = Array.isArray(t.steps) ? (t.steps as any[]) : undefined;

  // A segment deleted since the blueprint was saved must not make the blueprint
  // unusable — createCampaign throws WA_SEGMENT_NOT_FOUND on a missing id, and
  // "this blueprint can never be launched again" is a worse answer than falling
  // back to the filter snapshot that was frozen alongside it.
  let segmentId = t.segmentId ?? undefined;
  if (segmentId) {
    const stillThere = await prisma.waSegment.findUnique({
      where: { id: segmentId },
      select: { id: true },
    });
    if (!stillThere) segmentId = undefined;
  }

  return createCampaign({
    name: opts.name?.trim() || t.name,
    description: t.description ?? undefined,
    templateId: t.templateId,
    // No cast: the column is a WaAudienceType enum, so the database itself
    // guarantees one of the three the code branches on. It used to be a free
    // string, and anything unrecognised silently resolved to "every contact".
    audienceType: t.audienceType ?? 'segment',
    audienceFilter: t.audienceFilter ?? undefined,
    segmentId,
    variableMapping: Array.isArray(t.variableMapping) ? (t.variableMapping as string[]) : undefined,
    scheduledAt: opts.scheduledAt,
    // Restored alongside the audience — see the note where they are saved.
    templateParams: (t.templateParams ?? undefined) as CampaignTemplateParams | undefined,
    respectBusinessHours: t.respectBusinessHours,
    abTestSamplePct: t.abTestSamplePct ?? undefined,
    // The column is a plain string, the input a three-value union. Narrowed
    // rather than cast: a value that predates the enum — or arrives from a data
    // fix — must fall back to the default rather than reach the A/B decision
    // logic as a metric nothing knows how to measure.
    abTestMetric: AB_METRICS.includes(t.abTestMetric as WaAbMetric)
      ? (t.abTestMetric as WaAbMetric)
      : undefined,
    batchSize: t.batchSize,
    throttlePerSec: t.throttlePerSec,
    type: t.type,
    steps,
    isAbTest: t.isAbTest,
    variants: variants?.map((v) => ({
      label: v.label,
      templateId: v.templateId,
      weight: v.weight,
    })),
    recurrenceDays: t.recurrenceDays,
    createdBy: opts.createdBy,
  });
}
