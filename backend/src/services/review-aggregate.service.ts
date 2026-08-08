/**
 * Review aggregate refresh — recomputes CompanyReviewAggregate for a
 * single company. Called from the BullMQ worker. Idempotent.
 *
 * Algorithm:
 *   1. Read every APPROVED review for the company.
 *   2. Compute totals, criteria averages, distribution buckets,
 *      gender split, top job profiles (by Wilson-ish ranking).
 *   3. Read industry average from Redis (set by industry-avg.service).
 *   4. Upsert the aggregate row.
 */
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import logger from '../config/logger';
import type { Prisma } from '@prisma/client';
import type { ReviewGender } from '@prisma/client';

export interface TopJobProfile {
  designation: string;
  avgRating: number;
  count: number;
}

interface ReviewSnapshot {
  overallRating: number;
  ratingWorkLifeBalance: number;
  ratingSalary: number;
  ratingPromotions: number;
  ratingJobSecurity: number;
  ratingSkillDev: number;
  ratingWorkSatisfaction: number;
  ratingCompanyCulture: number;
  gender: ReviewGender | null;
  designation: string;
}

/**
 * Top-job-profiles ranking: bias for designations with both high
 * average AND a meaningful number of reviews so a single 5-star
 * outlier doesn't dominate.
 *
 * Score = avg × ln(1 + count). Truncated to top 4.
 */
export function rankTopJobProfiles(reviews: ReviewSnapshot[]): TopJobProfile[] {
  const buckets = new Map<string, { sum: number; count: number; key: string }>();
  for (const r of reviews) {
    const key = r.designation.trim().toLowerCase();
    if (!key) continue;
    const existing = buckets.get(key);
    if (existing) {
      existing.sum += r.overallRating;
      existing.count += 1;
    } else {
      buckets.set(key, {
        sum: r.overallRating,
        count: 1,
        // Preserve the first seen casing as the displayed label.
        key: r.designation.trim(),
      });
    }
  }

  const ranked = Array.from(buckets.values())
    .map((b) => {
      const avg = b.count > 0 ? b.sum / b.count : 0;
      const score = avg * Math.log(1 + b.count);
      return { designation: b.key, avgRating: avg, count: b.count, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ designation, avgRating, count }) => ({
      designation,
      avgRating: Number(avgRating.toFixed(2)),
      count,
    }));

  return ranked;
}

export async function refreshAggregate(companyId: string): Promise<void> {
  const company = await prisma.companyProfile.findUnique({
    where: { id: companyId },
    select: { industry: true },
  });
  if (!company) {
    logger.warn(`refreshAggregate: company ${companyId} not found`);
    return;
  }

  const reviews = await prisma.companyReview.findMany({
    where: { companyId, status: 'APPROVED' },
    select: {
      overallRating: true,
      ratingWorkLifeBalance: true,
      ratingSalary: true,
      ratingPromotions: true,
      ratingJobSecurity: true,
      ratingSkillDev: true,
      ratingWorkSatisfaction: true,
      ratingCompanyCulture: true,
      gender: true,
      designation: true,
    },
  });

  const total = reviews.length;
  if (total === 0) {
    // Reset aggregate to zeros if no reviews remain (e.g. after admin
    // deletions). Idempotent upsert.
    await prisma.companyReviewAggregate.upsert({
      where: { companyId },
      create: {
        companyId,
        totalReviews: 0,
        averageOverall: 0,
        averageWorkLifeBalance: 0,
        averageSalary: 0,
        averagePromotions: 0,
        averageJobSecurity: 0,
        averageSkillDev: 0,
        averageWorkSatisfaction: 0,
        averageCompanyCulture: 0,
        count1: 0,
        count2: 0,
        count3: 0,
        count4: 0,
        count5: 0,
        averageMen: null,
        countMen: 0,
        averageWomen: null,
        countWomen: 0,
        topJobProfiles: [],
        industryAverage: null,
        industryName: company.industry ?? null,
        refreshedAt: new Date(),
      },
      update: {
        totalReviews: 0,
        averageOverall: 0,
        averageWorkLifeBalance: 0,
        averageSalary: 0,
        averagePromotions: 0,
        averageJobSecurity: 0,
        averageSkillDev: 0,
        averageWorkSatisfaction: 0,
        averageCompanyCulture: 0,
        count1: 0,
        count2: 0,
        count3: 0,
        count4: 0,
        count5: 0,
        averageMen: null,
        countMen: 0,
        averageWomen: null,
        countWomen: 0,
        topJobProfiles: [],
        industryAverage: null,
        industryName: company.industry ?? null,
        refreshedAt: new Date(),
      },
    });
    return;
  }

  const sums = {
    overall: 0,
    workLifeBalance: 0,
    salary: 0,
    promotions: 0,
    jobSecurity: 0,
    skillDev: 0,
    workSatisfaction: 0,
    companyCulture: 0,
  };
  const dist = { c1: 0, c2: 0, c3: 0, c4: 0, c5: 0 };
  let menSum = 0,
    menCount = 0,
    womenSum = 0,
    womenCount = 0;

  for (const r of reviews) {
    sums.overall += r.overallRating;
    sums.workLifeBalance += r.ratingWorkLifeBalance;
    sums.salary += r.ratingSalary;
    sums.promotions += r.ratingPromotions;
    sums.jobSecurity += r.ratingJobSecurity;
    sums.skillDev += r.ratingSkillDev;
    sums.workSatisfaction += r.ratingWorkSatisfaction;
    sums.companyCulture += r.ratingCompanyCulture;

    if (r.overallRating === 5) dist.c5 += 1;
    else if (r.overallRating === 4) dist.c4 += 1;
    else if (r.overallRating === 3) dist.c3 += 1;
    else if (r.overallRating === 2) dist.c2 += 1;
    else if (r.overallRating === 1) dist.c1 += 1;

    if (r.gender === 'MALE') {
      menSum += r.overallRating;
      menCount += 1;
    } else if (r.gender === 'FEMALE') {
      womenSum += r.overallRating;
      womenCount += 1;
    }
  }

  const r2 = (n: number) => Number((n / total).toFixed(2));

  // Industry average from Redis cache (set by industry-avg.service).
  let industryAverage: number | null = null;
  try {
    if (company.industry) {
      const raw = await redis.get(`industry-avg:${company.industry}`);
      if (raw) {
        const parsed = parseFloat(raw);
        if (!Number.isNaN(parsed)) industryAverage = Number(parsed.toFixed(2));
      }
    }
  } catch {
    // Redis unavailable — proceed without industry comparison.
  }

  const topJobProfiles = rankTopJobProfiles(reviews);

  await prisma.companyReviewAggregate.upsert({
    where: { companyId },
    create: {
      companyId,
      totalReviews: total,
      averageOverall: r2(sums.overall),
      averageWorkLifeBalance: r2(sums.workLifeBalance),
      averageSalary: r2(sums.salary),
      averagePromotions: r2(sums.promotions),
      averageJobSecurity: r2(sums.jobSecurity),
      averageSkillDev: r2(sums.skillDev),
      averageWorkSatisfaction: r2(sums.workSatisfaction),
      averageCompanyCulture: r2(sums.companyCulture),
      count5: dist.c5,
      count4: dist.c4,
      count3: dist.c3,
      count2: dist.c2,
      count1: dist.c1,
      averageMen: menCount > 0 ? Number((menSum / menCount).toFixed(2)) : null,
      countMen: menCount,
      averageWomen: womenCount > 0 ? Number((womenSum / womenCount).toFixed(2)) : null,
      countWomen: womenCount,
      topJobProfiles: topJobProfiles as unknown as Prisma.InputJsonValue,
      industryAverage,
      industryName: company.industry ?? null,
      refreshedAt: new Date(),
    },
    update: {
      totalReviews: total,
      averageOverall: r2(sums.overall),
      averageWorkLifeBalance: r2(sums.workLifeBalance),
      averageSalary: r2(sums.salary),
      averagePromotions: r2(sums.promotions),
      averageJobSecurity: r2(sums.jobSecurity),
      averageSkillDev: r2(sums.skillDev),
      averageWorkSatisfaction: r2(sums.workSatisfaction),
      averageCompanyCulture: r2(sums.companyCulture),
      count5: dist.c5,
      count4: dist.c4,
      count3: dist.c3,
      count2: dist.c2,
      count1: dist.c1,
      averageMen: menCount > 0 ? Number((menSum / menCount).toFixed(2)) : null,
      countMen: menCount,
      averageWomen: womenCount > 0 ? Number((womenSum / womenCount).toFixed(2)) : null,
      countWomen: womenCount,
      topJobProfiles: topJobProfiles as unknown as Prisma.InputJsonValue,
      industryAverage,
      industryName: company.industry ?? null,
      refreshedAt: new Date(),
    },
  });
}

/**
 * Bulk-fetch aggregate rows for a list of company ids — used by the
 * public-companies listing endpoint to attach `averageRating` +
 * `totalReviews` to each card without N+1 calls.
 */
export async function getAggregatesForCompanyIds(
  companyIds: string[]
): Promise<
  Map<string, { averageRating: number; totalReviews: number; topJobProfiles: TopJobProfile[] }>
> {
  if (companyIds.length === 0) return new Map();
  const rows = await prisma.companyReviewAggregate.findMany({
    where: { companyId: { in: companyIds } },
    select: {
      companyId: true,
      averageOverall: true,
      totalReviews: true,
      topJobProfiles: true,
    },
  });
  const map = new Map<
    string,
    { averageRating: number; totalReviews: number; topJobProfiles: TopJobProfile[] }
  >();
  for (const r of rows) {
    map.set(r.companyId, {
      averageRating: r.averageOverall,
      totalReviews: r.totalReviews,
      topJobProfiles: Array.isArray(r.topJobProfiles)
        ? (r.topJobProfiles as unknown as TopJobProfile[])
        : [],
    });
  }
  return map;
}
