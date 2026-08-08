import { prisma } from '../config/prisma';

/** How many top campaigns to surface in the conversion summary. */
const TOP_CAMPAIGNS = 10;

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
}) {
  const conversion = await prisma.waConversion.create({
    data: {
      ...(input.campaignId !== undefined ? { campaignId: input.campaignId } : {}),
      ...(input.contactId !== undefined ? { contactId: input.contactId } : {}),
      ...(input.valuePaise !== undefined ? { valuePaise: input.valuePaise } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
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

/** List a single campaign's recorded conversions (most recent first). */
export async function getCampaignConversions(campaignId: string) {
  return prisma.waConversion.findMany({
    where: { campaignId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Overall conversion summary: total count + summed value across all
 * conversions, plus the top N campaigns by conversion count (each with its own
 * count + value sum).
 */
export async function getConversionSummary() {
  const [overall, perCampaign] = await Promise.all([
    prisma.waConversion.aggregate({
      _count: { _all: true },
      _sum: { valuePaise: true },
    }),
    prisma.waConversion.groupBy({
      by: ['campaignId'],
      where: { campaignId: { not: null } },
      _count: { _all: true },
      _sum: { valuePaise: true },
      orderBy: { _count: { campaignId: 'desc' } },
      take: TOP_CAMPAIGNS,
    }),
  ]);

  return {
    count: overall._count._all,
    totalValuePaise: overall._sum.valuePaise ?? 0,
    byCampaign: perCampaign.map((g) => ({
      campaignId: g.campaignId,
      count: g._count._all,
      valuePaise: g._sum.valuePaise ?? 0,
    })),
  };
}
