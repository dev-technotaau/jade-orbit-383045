import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';
import { normalizeWaPhone } from './whatsapp-contact.service';

/** How many top campaigns to surface in the conversion summary. */
const TOP_CAMPAIGNS = 10;

/**
 * How far back a send can be and still be credited with a conversion.
 *
 * Matches the reply-attribution window in the inbound worker: a purchase two
 * days after the campaign landed is plainly attributable to it, one three months
 * later is not, and an unbounded lookback would credit every campaign a contact
 * ever received.
 */
const CONVERSION_ATTRIBUTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Record a conversion (funnel + ROI tracking). When attributed to a campaign,
 * also bump that campaign's denormalized `convertedCount` so campaign analytics
 * can show conversions without a join.
 */
export async function recordConversion(input: {
  campaignId?: string | null;
  contactId?: string | null;
  valuePaise?: number | null;
  note?: string | null;
  occurredAt?: Date | null;
  externalId?: string | null;
  source?: string;
}) {
  const conversion = await prisma.waConversion.create({
    data: {
      ...(input.campaignId !== undefined ? { campaignId: input.campaignId } : {}),
      ...(input.contactId !== undefined ? { contactId: input.contactId } : {}),
      ...(input.valuePaise !== undefined ? { valuePaise: input.valuePaise } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.occurredAt !== undefined ? { occurredAt: input.occurredAt } : {}),
      ...(input.externalId !== undefined ? { externalId: input.externalId } : {}),
      ...(input.source !== undefined ? { source: input.source } : {}),
    },
  });

  if (input.campaignId) {
    await prisma.waCampaign
      .update({
        where: { id: input.campaignId },
        data: { convertedCount: { increment: 1 } },
      })
      .catch(() => {});
  }

  return conversion;
}

/**
 * Server-to-server conversion postback.
 *
 * The only writer used to be the operator form behind the shared app password,
 * so a client's website or CRM could not report a conversion without being
 * handed the credential that unlocks the whole console — which means nobody did,
 * and the ROI figures stayed at zero.
 *
 * Deduped on `externalId` (a retried postback returns the original row instead
 * of double-counting), resolves the contact by phone, and — when the caller
 * names no campaign — attributes the conversion to the most recent campaign that
 * actually reached that contact inside the attribution window.
 */
export async function ingestConversion(input: {
  externalId: string;
  phone?: string | null;
  contactId?: string | null;
  campaignId?: string | null;
  valuePaise?: number | null;
  note?: string | null;
  occurredAt?: Date | null;
}): Promise<{ conversion: Awaited<ReturnType<typeof recordConversion>>; duplicate: boolean }> {
  const existing = await prisma.waConversion.findUnique({
    where: { externalId: input.externalId },
  });
  // Idempotent, not an error: a CRM that retries after a timeout must be able to
  // do so safely, and telling it "409" would only make it retry harder.
  if (existing) return { conversion: existing, duplicate: true };

  let contactId = input.contactId ?? null;
  if (!contactId && input.phone) {
    const contact = await prisma.waContact.findUnique({
      where: { phone: normalizeWaPhone(input.phone) },
      select: { id: true },
    });
    contactId = contact?.id ?? null;
  }

  const campaignId = input.campaignId ?? (await attributeCampaignForContact(contactId));

  const conversion = await recordConversion({
    externalId: input.externalId,
    campaignId,
    contactId,
    valuePaise: input.valuePaise ?? null,
    note: input.note ?? null,
    occurredAt: input.occurredAt ?? null,
    source: 'api',
  });
  return { conversion, duplicate: false };
}

/**
 * Delete a conversion and give the campaign its count back.
 *
 * A mistyped ₹ value or a double-clicked button used to be permanent, and it
 * inflated both convertedCount and total revenue with no way to correct it.
 */
export async function deleteConversion(id: string) {
  const conversion = await prisma.waConversion.findUnique({ where: { id } });
  if (!conversion) throw new AppError('Conversion not found', 404, 'WA_CONVERSION_NOT_FOUND');

  await prisma.waConversion.delete({ where: { id } });

  if (conversion.campaignId) {
    // Guarded so repeated deletes can never drive the counter negative.
    await prisma.waCampaign
      .updateMany({
        where: { id: conversion.campaignId, convertedCount: { gt: 0 } },
        data: { convertedCount: { decrement: 1 } },
      })
      .catch(() => {});
  }

  return conversion;
}

/**
 * The campaign a conversion by this contact should be credited to.
 *
 * Last-touch over sends that actually went out. PENDING and SKIPPED recipients
 * carry a null `sentAt`, and Postgres sorts NULLs first on DESC — so without the
 * status filter the newest campaign the contact was merely *listed* in would win
 * over the one they were actually sent.
 *
 * Extracted so the in-thread "record a conversion" action attributes exactly the
 * way the API postback does. Two implementations of last-touch attribution would
 * eventually disagree, and the disagreement would show up as revenue credited to
 * different campaigns depending on which door it came through.
 */
export async function attributeCampaignForContact(
  contactId: string | null
): Promise<string | null> {
  if (!contactId) return null;
  const recipient = await prisma.waCampaignRecipient.findFirst({
    where: {
      contactId,
      sentAt: { not: null, gte: new Date(Date.now() - CONVERSION_ATTRIBUTION_WINDOW_MS) },
      status: { in: ['SENT', 'DELIVERED', 'READ'] },
    },
    orderBy: { sentAt: 'desc' },
    select: { campaignId: true },
  });
  return recipient?.campaignId ?? null;
}

/**
 * One contact's conversions, most recent first, with the value they represent.
 *
 * The panel could show what was SENT to a contact and never what came back, so
 * "is this customer worth the follow-up?" — the question an agent asks before
 * spending twenty minutes on a thread — had no answer in the product.
 */
export async function getContactConversions(contactId: string, opts: { limit?: number } = {}) {
  const take = Math.min(Math.max(opts.limit ?? 20, 1), CONVERSIONS_PAGE_MAX);
  const [items, total, agg] = await Promise.all([
    prisma.waConversion.findMany({
      where: { contactId },
      orderBy: { createdAt: 'desc' },
      take,
      include: { campaign: { select: { id: true, name: true } } },
    }),
    prisma.waConversion.count({ where: { contactId } }),
    prisma.waConversion.aggregate({ where: { contactId }, _sum: { valuePaise: true } }),
  ]);
  return { items, total, totalValuePaise: agg._sum.valuePaise ?? 0 };
}

/** Conversions returned per request — the campaign page shows a recent list. */
const CONVERSIONS_PAGE_SIZE = 100;
/** Ceiling on what one request may ask for. */
const CONVERSIONS_PAGE_MAX = 500;

/**
 * A single campaign's recorded conversions, most recent first.
 *
 * Bounded, with the total alongside. A successful campaign accumulates
 * conversions for as long as the postback keeps firing, and this read had no
 * `take` at all — so the panel that shows the ten most recent was loading every
 * row ever attributed to the campaign to render them.
 */
export async function getCampaignConversions(
  campaignId: string,
  opts: { limit?: number } = {}
): Promise<{ items: Awaited<ReturnType<typeof prisma.waConversion.findMany>>; total: number }> {
  const take = Math.min(Math.max(opts.limit ?? CONVERSIONS_PAGE_SIZE, 1), CONVERSIONS_PAGE_MAX);
  const [items, total] = await Promise.all([
    prisma.waConversion.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'desc' },
      take,
    }),
    prisma.waConversion.count({ where: { campaignId } }),
  ]);
  return { items, total };
}

/**
 * Overall conversion summary: total count + summed value across all
 * conversions, plus the top N campaigns by conversion count (each with its
 * name, count, value sum and value per recipient reached).
 *
 * `days` scopes it to a window on when the conversion actually happened, which
 * is not when we heard about it — `occurredAt` where the caller supplied one,
 * `createdAt` otherwise (the same fallback the ROI series uses). It was the one
 * figure on the analytics page that ignored the range control, so switching to
 * "last 7 days" left a lifetime revenue total sitting beside seven days of
 * sends — a comparison that looks like a conversion rate and is not one.
 */
export async function getConversionSummary(days?: number) {
  const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;
  const where: Prisma.WaConversionWhereInput = since
    ? { OR: [{ occurredAt: { gte: since } }, { occurredAt: null, createdAt: { gte: since } }] }
    : {};
  const [overall, perCampaign] = await Promise.all([
    prisma.waConversion.aggregate({
      where,
      _count: { _all: true },
      _sum: { valuePaise: true },
    }),
    prisma.waConversion.groupBy({
      by: ['campaignId'],
      where: { ...where, campaignId: { not: null } },
      _count: { _all: true },
      _sum: { valuePaise: true },
      orderBy: { _count: { campaignId: 'desc' } },
      take: TOP_CAMPAIGNS,
    }),
  ]);

  // Names, not UUIDs. The leaderboard is the one figure here that tells an
  // operator WHICH campaign to run again, and a column of `9f3c…` identifiers
  // answers that question for nobody — it was the reason the breakdown was
  // computed on every request and then dropped on the floor by the console.
  // `sentCount` comes along so value can be expressed per recipient reached,
  // which is what makes two campaigns of different sizes comparable at all.
  const campaignIds = perCampaign
    .map((g) => g.campaignId)
    .filter((id): id is string => id !== null);
  const campaigns = campaignIds.length
    ? await prisma.waCampaign.findMany({
        where: { id: { in: campaignIds } },
        select: { id: true, name: true, sentCount: true },
      })
    : [];
  const campaignById = new Map(campaigns.map((c) => [c.id, c]));

  return {
    count: overall._count._all,
    totalValuePaise: overall._sum.valuePaise ?? 0,
    byCampaign: perCampaign
      .filter((g) => g.campaignId !== null)
      .map((g) => {
        const campaign = campaignById.get(g.campaignId as string);
        const valuePaise = g._sum.valuePaise ?? 0;
        const sent = campaign?.sentCount ?? 0;
        return {
          campaignId: g.campaignId as string,
          // The FK is SetNull, so a deleted campaign normally drops out of the
          // groupBy above; this only catches a delete landing between the two
          // queries. The row survives with a placeholder rather than putting a
          // blank cell in a revenue table.
          name: campaign?.name ?? 'Deleted campaign',
          count: g._count._all,
          valuePaise,
          sent,
          valuePerRecipientPaise: sent > 0 ? Math.round(valuePaise / sent) : 0,
        };
      }),
  };
}
