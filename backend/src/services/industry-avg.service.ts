/**
 * Industry-average computation.
 *
 * Periodically (every 6h via the scheduler queue) groups all
 * APPROVED reviews by their company's industry and stores the average
 * overall rating in Redis under `industry-avg:{industry}` (no TTL — the
 * cron refreshes the value).
 *
 * The aggregate refresh job reads these values when computing the
 * per-company `industryAverage` field surfaced in the stats card.
 *
 * Industries with <3 companies producing reviews are skipped (small-N
 * comparisons are noise and would produce wild swings).
 */
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import logger from '../config/logger';

export async function refreshIndustryAverages(): Promise<{ updated: number }> {
  // Pull every aggregate with reviews + the joined industry. We only
  // include companies with totalReviews ≥ 1 so empty-aggregates don't
  // tug the industry mean toward zero.
  const rows = await prisma.companyReviewAggregate.findMany({
    where: { totalReviews: { gt: 0 } },
    select: {
      companyId: true,
      averageOverall: true,
      totalReviews: true,
      company: { select: { industry: true } },
    },
  });

  const buckets = new Map<string, { weighted: number; count: number; companies: number }>();
  for (const row of rows) {
    const industry = row.company?.industry?.trim();
    if (!industry) continue;
    const existing = buckets.get(industry);
    if (existing) {
      existing.weighted += row.averageOverall * row.totalReviews;
      existing.count += row.totalReviews;
      existing.companies += 1;
    } else {
      buckets.set(industry, {
        weighted: row.averageOverall * row.totalReviews,
        count: row.totalReviews,
        companies: 1,
      });
    }
  }

  let updated = 0;
  for (const [industry, b] of buckets) {
    if (b.companies < 3) {
      // Not enough comparators — clear any stale cached value.
      await redis.del(`industry-avg:${industry}`).catch(() => {});
      continue;
    }
    const avg = b.weighted / b.count;
    try {
      await redis.set(`industry-avg:${industry}`, avg.toFixed(2));
      updated += 1;
    } catch (err) {
      logger.warn(`industry-avg: redis SET failed for ${industry}`, err);
    }
  }

  logger.info(`industry-avg: refreshed ${updated} industry averages`);
  return { updated };
}
