/**
 * Company-review service — core surface for the ratings + reviews
 * system.
 *
 * Responsibilities:
 *   - submitReview: anonymous-friendly review creation with fingerprint
 *     dedup, profanity-flag pre-screening, aggregate refresh trigger.
 *   - listReviews: paginated, filtered, sorted, faceted.
 *   - getReviewStats: aggregate-backed (with live fallback).
 *   - getTopJobProfiles: top-4 designations preview.
 *   - voteHelpful: idempotent toggle with denorm count update.
 *   - reportReview: increment counter + auto-flag at threshold.
 *   - moderateReview: super-admin actions, audit-logged.
 *   - listOwnReviews / listEmployerReviews / listSuperAdminReviews.
 *   - searchCompaniesForForm: autocomplete used by the form's
 *     company-name field.
 */
import { prisma } from '../config/prisma';
import { Prisma } from '@prisma/client';
import type {
  ReviewGender,
  ReviewWorkPolicy,
  ReviewEmploymentType,
  ReviewStatus,
} from '@prisma/client';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../exceptions';
import logger from '../config/logger';
import { moderateReviewBody, isDetailedBody } from './text-moderation.service';
import { enqueueReviewAggregateRefresh } from '../jobs/review-aggregate.queue';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export interface SubmitReviewInput {
  companyId: string;
  // Identity
  userId: string | null;
  guestEmail?: string | null;
  fingerprintHash: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  // Ratings
  overallRating: number;
  ratingWorkLifeBalance: number;
  ratingSalary: number;
  ratingPromotions: number;
  ratingJobSecurity: number;
  ratingSkillDev: number;
  ratingWorkSatisfaction: number;
  ratingCompanyCulture: number;
  // Demographic + employment
  gender?: ReviewGender | null;
  workPolicy: ReviewWorkPolicy;
  currentlyWorking: boolean;
  startedWorkingAt?: Date | null;
  endedWorkingAt?: Date | null;
  designation: string;
  employmentType: ReviewEmploymentType;
  department: string;
  workLocation?: string | null;
  // Body
  likes?: string | null;
  dislikes?: string | null;
  workDetails?: string | null;
}

export interface ListReviewsFilters {
  page?: number;
  limit?: number;
  sort?: 'latest' | 'helpful' | 'highest_rated' | 'lowest_rated' | 'most_detailed';
  // Chips (URL-driven)
  chip?:
    | 'highly_rated'
    | 'critically_rated'
    | 'latest'
    | 'detailed'
    | 'work_life_balance'
    | 'salary'
    | 'promotions'
    | 'job_security'
    | 'skill_development'
    | 'work_satisfaction'
    | 'company_culture';
  // Facets (sidebar)
  gender?: ReviewGender;
  workPolicy?: ReviewWorkPolicy;
  employmentType?: ReviewEmploymentType;
  currentlyWorking?: boolean;
  overallRatingMin?: number;
  department?: string;
  designation?: string;
  isDetailed?: boolean;
  // Status filter (default APPROVED for public; admin overrides)
  status?: ReviewStatus | 'ALL';
}

export interface ListResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  facets?: ReviewFacets;
}

export interface ReviewFacets {
  gender: { value: ReviewGender; count: number }[];
  workPolicy: { value: ReviewWorkPolicy; count: number }[];
  employmentType: { value: ReviewEmploymentType; count: number }[];
  currentlyWorking: { value: boolean; count: number }[];
  rating: { value: number; count: number }[];
  department: { value: string; count: number }[];
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function validateRating(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new BadRequestError(`${label} must be an integer between 1 and 5 (got ${value})`);
  }
}

const CRITERIA_CHIP_FIELD: Record<string, string> = {
  work_life_balance: 'ratingWorkLifeBalance',
  salary: 'ratingSalary',
  promotions: 'ratingPromotions',
  job_security: 'ratingJobSecurity',
  skill_development: 'ratingSkillDev',
  work_satisfaction: 'ratingWorkSatisfaction',
  company_culture: 'ratingCompanyCulture',
};

// ─────────────────────────────────────────────────────────────────────
// submitReview
// ─────────────────────────────────────────────────────────────────────

export async function submitReview(
  input: SubmitReviewInput
): Promise<{ id: string; status: ReviewStatus; isDetailed: boolean }> {
  // Sanity checks on ratings
  validateRating(input.overallRating, 'overallRating');
  validateRating(input.ratingWorkLifeBalance, 'ratingWorkLifeBalance');
  validateRating(input.ratingSalary, 'ratingSalary');
  validateRating(input.ratingPromotions, 'ratingPromotions');
  validateRating(input.ratingJobSecurity, 'ratingJobSecurity');
  validateRating(input.ratingSkillDev, 'ratingSkillDev');
  validateRating(input.ratingWorkSatisfaction, 'ratingWorkSatisfaction');
  validateRating(input.ratingCompanyCulture, 'ratingCompanyCulture');

  if (!input.designation?.trim()) {
    throw new BadRequestError('Designation is required');
  }
  if (!input.department?.trim()) {
    throw new BadRequestError('Department is required');
  }

  // Per the user spec: Yes hides BOTH dates, No shows BOTH.
  if (input.currentlyWorking) {
    if (input.startedWorkingAt || input.endedWorkingAt) {
      // Quietly drop — keeping dates with currentlyWorking=true would
      // be inconsistent. We reject explicitly to make the contract
      // clear.
      throw new BadRequestError('Date fields must be empty when currently working.');
    }
  } else {
    if (!input.startedWorkingAt || !input.endedWorkingAt) {
      throw new BadRequestError(
        'Both startedWorkingAt and endedWorkingAt are required when not currently working.'
      );
    }
    if (input.startedWorkingAt > input.endedWorkingAt) {
      throw new BadRequestError('startedWorkingAt must be earlier than endedWorkingAt.');
    }
  }

  // Cap body lengths.
  const cap = (s: string | null | undefined): string | null =>
    s == null ? null : s.length > 1500 ? s.slice(0, 1500) : s;
  const likes = cap(input.likes);
  const dislikes = cap(input.dislikes);
  const workDetails = cap(input.workDetails);

  // Verify company exists and is searchable.
  const company = await prisma.companyProfile.findUnique({
    where: { id: input.companyId },
    select: { id: true, userId: true, slug: true, companyName: true, publicSearchable: true },
  });
  if (!company) throw new NotFoundError('Company not found');
  if (!company.publicSearchable) {
    throw new ForbiddenError('Company is not publicly visible');
  }
  // Self-review guard — employers cannot review their own company.
  if (input.userId && input.userId === company.userId) {
    throw new ForbiddenError('You cannot review your own company.');
  }

  // Moderation pre-screening — sets status=FLAGGED on suspicious bodies.
  const verdict = moderateReviewBody({ likes, dislikes, workDetails });
  const initialStatus: ReviewStatus = verdict.ok ? 'APPROVED' : 'FLAGGED';
  const detailed = isDetailedBody({ likes, dislikes, workDetails });

  // Insert. Unique-index conflicts are translated to 409.
  let created;
  try {
    created = await prisma.companyReview.create({
      data: {
        companyId: input.companyId,
        userId: input.userId,
        guestEmail: input.guestEmail ?? null,
        fingerprintHash: input.fingerprintHash,
        overallRating: input.overallRating,
        ratingWorkLifeBalance: input.ratingWorkLifeBalance,
        ratingSalary: input.ratingSalary,
        ratingPromotions: input.ratingPromotions,
        ratingJobSecurity: input.ratingJobSecurity,
        ratingSkillDev: input.ratingSkillDev,
        ratingWorkSatisfaction: input.ratingWorkSatisfaction,
        ratingCompanyCulture: input.ratingCompanyCulture,
        gender: input.gender ?? null,
        workPolicy: input.workPolicy,
        currentlyWorking: input.currentlyWorking,
        startedWorkingAt: input.startedWorkingAt ?? null,
        endedWorkingAt: input.endedWorkingAt ?? null,
        designation: input.designation.trim(),
        employmentType: input.employmentType,
        department: input.department.trim(),
        workLocation: input.workLocation?.trim() || null,
        likes,
        dislikes,
        workDetails,
        isDetailed: detailed,
        status: initialStatus,
        moderationReason: verdict.ok ? null : verdict.reason,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
      select: { id: true, status: true, isDetailed: true },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError('You have already submitted a review for this company.');
    }
    throw err;
  }

  // Fire-and-forget aggregate refresh. The submit endpoint shouldn't
  // wait on the aggregate recompute.
  void enqueueReviewAggregateRefresh(input.companyId, 'review_created').catch(() => {});

  // Fire-and-forget employer notification. Never block the response.
  if (initialStatus === 'APPROVED') {
    void notifyEmployerOfNewReview(input.companyId, created.id).catch((err) => {
      logger.warn('notifyEmployerOfNewReview failed (non-fatal)', err);
    });

    // IndexNow — fresh review on a public company page, push the
    // change to instant-indexing engines.
    try {
      const { notifyCompanyReviewsChanged } = await import('./indexnow.service');
      notifyCompanyReviewsChanged(company.slug);
    } catch {
      // never fatal
    }
  }

  return created;
}

// ─────────────────────────────────────────────────────────────────────
// listReviews
// ─────────────────────────────────────────────────────────────────────

export async function listReviews(
  companyId: string,
  filters: ListReviewsFilters
): Promise<ListResult<unknown>> {
  const limit = Math.min(filters.limit ?? 10, 50);
  const page = Math.max(filters.page ?? 1, 1);

  const where: Prisma.CompanyReviewWhereInput = { companyId };

  // Default to APPROVED for public consumers; admins can pass status='ALL'.
  if (filters.status === 'ALL') {
    // no status filter
  } else if (filters.status) {
    where.status = filters.status;
  } else {
    where.status = 'APPROVED';
  }

  if (filters.gender) where.gender = filters.gender;
  if (filters.workPolicy) where.workPolicy = filters.workPolicy;
  if (filters.employmentType) where.employmentType = filters.employmentType;
  if (typeof filters.currentlyWorking === 'boolean') {
    where.currentlyWorking = filters.currentlyWorking;
  }
  if (filters.overallRatingMin) {
    where.overallRating = { gte: filters.overallRatingMin };
  }
  if (filters.department) {
    where.department = { contains: filters.department, mode: 'insensitive' };
  }
  if (filters.designation) {
    where.designation = { contains: filters.designation, mode: 'insensitive' };
  }
  if (filters.isDetailed) {
    where.isDetailed = true;
  }

  // Chip filters layer on top of facet filters.
  if (filters.chip === 'highly_rated') {
    where.overallRating = { gte: 4 };
  } else if (filters.chip === 'critically_rated') {
    where.overallRating = { lte: 2 };
  } else if (filters.chip === 'latest') {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    where.createdAt = { gte: since };
  } else if (filters.chip === 'detailed') {
    where.isDetailed = true;
  } else if (filters.chip && filters.chip in CRITERIA_CHIP_FIELD) {
    const field = CRITERIA_CHIP_FIELD[filters.chip];
    (where as Record<string, unknown>)[field] = { gte: 4 };
  }

  // Sort
  const orderBy: Prisma.CompanyReviewOrderByWithRelationInput[] = (() => {
    switch (filters.sort) {
      case 'helpful':
        return [{ helpfulCount: 'desc' }, { createdAt: 'desc' }];
      case 'highest_rated':
        return [{ overallRating: 'desc' }, { createdAt: 'desc' }];
      case 'lowest_rated':
        return [{ overallRating: 'asc' }, { createdAt: 'desc' }];
      case 'most_detailed':
        return [{ isDetailed: 'desc' }, { createdAt: 'desc' }];
      case 'latest':
      default:
        return [{ createdAt: 'desc' }];
    }
  })();

  const [items, total] = await prisma.$transaction([
    prisma.companyReview.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        overallRating: true,
        ratingWorkLifeBalance: true,
        ratingSalary: true,
        ratingPromotions: true,
        ratingJobSecurity: true,
        ratingSkillDev: true,
        ratingWorkSatisfaction: true,
        ratingCompanyCulture: true,
        gender: true,
        workPolicy: true,
        currentlyWorking: true,
        startedWorkingAt: true,
        endedWorkingAt: true,
        designation: true,
        employmentType: true,
        department: true,
        workLocation: true,
        likes: true,
        dislikes: true,
        workDetails: true,
        isDetailed: true,
        helpfulCount: true,
        notHelpfulCount: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.companyReview.count({ where }),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// ─────────────────────────────────────────────────────────────────────
// computeFacets — count buckets scoped to APPROVED reviews of the company
// ─────────────────────────────────────────────────────────────────────

export async function computeFacets(companyId: string): Promise<ReviewFacets> {
  const baseWhere: Prisma.CompanyReviewWhereInput = {
    companyId,
    status: 'APPROVED',
  };

  const [genderRows, policyRows, employmentRows, currentlyRows, ratingRows, deptRows] =
    await Promise.all([
      prisma.companyReview.groupBy({
        by: ['gender'],
        where: { ...baseWhere, gender: { not: null } },
        _count: { _all: true },
      }),
      prisma.companyReview.groupBy({
        by: ['workPolicy'],
        where: baseWhere,
        _count: { _all: true },
      }),
      prisma.companyReview.groupBy({
        by: ['employmentType'],
        where: baseWhere,
        _count: { _all: true },
      }),
      prisma.companyReview.groupBy({
        by: ['currentlyWorking'],
        where: baseWhere,
        _count: { _all: true },
      }),
      prisma.companyReview.groupBy({
        by: ['overallRating'],
        where: baseWhere,
        _count: { _all: true },
      }),
      prisma.companyReview.groupBy({
        by: ['department'],
        where: baseWhere,
        _count: { _all: true },
        orderBy: { _count: { department: 'desc' } },
        take: 12,
      }),
    ]);

  return {
    gender: genderRows
      .filter((r) => r.gender)
      .map((r) => ({ value: r.gender as ReviewGender, count: r._count._all })),
    workPolicy: policyRows.map((r) => ({
      value: r.workPolicy,
      count: r._count._all,
    })),
    employmentType: employmentRows.map((r) => ({
      value: r.employmentType,
      count: r._count._all,
    })),
    currentlyWorking: currentlyRows.map((r) => ({
      value: r.currentlyWorking,
      count: r._count._all,
    })),
    rating: ratingRows.map((r) => ({
      value: r.overallRating,
      count: r._count._all,
    })),
    department: deptRows.map((r) => ({
      value: r.department,
      count: r._count._all,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────
// getReviewStats — aggregate-backed with live fallback
// ─────────────────────────────────────────────────────────────────────

export interface ReviewStatsResponse {
  totalReviews: number;
  averageOverall: number;
  averageWorkLifeBalance: number;
  averageSalary: number;
  averagePromotions: number;
  averageJobSecurity: number;
  averageSkillDev: number;
  averageWorkSatisfaction: number;
  averageCompanyCulture: number;
  distribution: { star: number; count: number; percent: number }[];
  men: { count: number; average: number | null; percent: number };
  women: { count: number; average: number | null; percent: number };
  industry: { name: string | null; average: number | null; diff: number | null };
  topJobProfiles: { designation: string; avgRating: number; count: number }[];
}

export async function getReviewStats(companyId: string): Promise<ReviewStatsResponse> {
  const agg = await prisma.companyReviewAggregate.findUnique({
    where: { companyId },
  });

  if (!agg) {
    // Aggregate row hasn't been created yet — kick off a refresh and
    // return zeros so callers don't block.
    void enqueueReviewAggregateRefresh(companyId, 'stats_miss').catch(() => {});
    return {
      totalReviews: 0,
      averageOverall: 0,
      averageWorkLifeBalance: 0,
      averageSalary: 0,
      averagePromotions: 0,
      averageJobSecurity: 0,
      averageSkillDev: 0,
      averageWorkSatisfaction: 0,
      averageCompanyCulture: 0,
      distribution: [5, 4, 3, 2, 1].map((star) => ({ star, count: 0, percent: 0 })),
      men: { count: 0, average: null, percent: 0 },
      women: { count: 0, average: null, percent: 0 },
      industry: { name: null, average: null, diff: null },
      topJobProfiles: [],
    };
  }

  const total = agg.totalReviews;
  const dist = [
    { star: 5, count: agg.count5 },
    { star: 4, count: agg.count4 },
    { star: 3, count: agg.count3 },
    { star: 2, count: agg.count2 },
    { star: 1, count: agg.count1 },
  ].map((d) => ({
    ...d,
    percent: total > 0 ? Number(((d.count / total) * 100).toFixed(1)) : 0,
  }));

  return {
    totalReviews: agg.totalReviews,
    averageOverall: agg.averageOverall,
    averageWorkLifeBalance: agg.averageWorkLifeBalance,
    averageSalary: agg.averageSalary,
    averagePromotions: agg.averagePromotions,
    averageJobSecurity: agg.averageJobSecurity,
    averageSkillDev: agg.averageSkillDev,
    averageWorkSatisfaction: agg.averageWorkSatisfaction,
    averageCompanyCulture: agg.averageCompanyCulture,
    distribution: dist,
    men: {
      count: agg.countMen,
      average: agg.averageMen,
      percent: total > 0 ? Number(((agg.countMen / total) * 100).toFixed(1)) : 0,
    },
    women: {
      count: agg.countWomen,
      average: agg.averageWomen,
      percent: total > 0 ? Number(((agg.countWomen / total) * 100).toFixed(1)) : 0,
    },
    industry: {
      name: agg.industryName,
      average: agg.industryAverage,
      diff:
        agg.industryAverage != null
          ? Number((agg.averageOverall - agg.industryAverage).toFixed(2))
          : null,
    },
    topJobProfiles: Array.isArray(agg.topJobProfiles)
      ? (agg.topJobProfiles as unknown as {
          designation: string;
          avgRating: number;
          count: number;
        }[])
      : [],
  };
}

// ─────────────────────────────────────────────────────────────────────
// getTopJobProfiles
// ─────────────────────────────────────────────────────────────────────

export async function getTopJobProfiles(
  companyId: string
): Promise<{ designation: string; avgRating: number; count: number }[]> {
  const agg = await prisma.companyReviewAggregate.findUnique({
    where: { companyId },
    select: { topJobProfiles: true },
  });
  if (agg && Array.isArray(agg.topJobProfiles)) {
    return agg.topJobProfiles as unknown as {
      designation: string;
      avgRating: number;
      count: number;
    }[];
  }
  return [];
}

// ─────────────────────────────────────────────────────────────────────
// voteHelpful
// ─────────────────────────────────────────────────────────────────────

export interface VoteInput {
  reviewId: string;
  helpful: boolean;
  userId: string | null;
  fingerprintHash: string;
}

export async function voteHelpful(
  input: VoteInput
): Promise<{ helpfulCount: number; notHelpfulCount: number; myVote: boolean | null }> {
  // Lock-free idempotent toggle:
  //   - If existing vote with same direction → remove (toggle off).
  //   - If existing vote with different direction → flip.
  //   - If no existing vote → insert.
  // All wrapped in a transaction so the denorms stay consistent.
  return prisma.$transaction(async (tx) => {
    const review = await tx.companyReview.findUnique({
      where: { id: input.reviewId },
      select: { id: true, status: true, helpfulCount: true, notHelpfulCount: true },
    });
    if (!review) throw new NotFoundError('Review not found');
    if (review.status !== 'APPROVED') {
      throw new ForbiddenError('Cannot vote on a non-approved review.');
    }

    // Find existing vote — try userId first, fall back to fingerprint.
    const existing = input.userId
      ? await tx.companyReviewVote.findUnique({
          where: { uq_vote_user_review: { reviewId: input.reviewId, userId: input.userId } },
        })
      : await tx.companyReviewVote.findUnique({
          where: {
            uq_vote_fp_review: {
              reviewId: input.reviewId,
              fingerprintHash: input.fingerprintHash,
            },
          },
        });

    let helpfulDelta = 0;
    let notHelpfulDelta = 0;
    let myVote: boolean | null = null;

    if (!existing) {
      // Insert new vote.
      try {
        await tx.companyReviewVote.create({
          data: {
            reviewId: input.reviewId,
            userId: input.userId,
            fingerprintHash: input.fingerprintHash,
            helpful: input.helpful,
          },
        });
      } catch (err) {
        // P2002 from a concurrent insert — fall through and re-read.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          // ignore
        } else {
          throw err;
        }
      }
      if (input.helpful) helpfulDelta = 1;
      else notHelpfulDelta = 1;
      myVote = input.helpful;
    } else if (existing.helpful === input.helpful) {
      // Toggle off (same direction).
      await tx.companyReviewVote.delete({ where: { id: existing.id } });
      if (existing.helpful) helpfulDelta = -1;
      else notHelpfulDelta = -1;
      myVote = null;
    } else {
      // Flip direction.
      await tx.companyReviewVote.update({
        where: { id: existing.id },
        data: { helpful: input.helpful },
      });
      if (input.helpful) {
        helpfulDelta = 1;
        notHelpfulDelta = -1;
      } else {
        helpfulDelta = -1;
        notHelpfulDelta = 1;
      }
      myVote = input.helpful;
    }

    if (helpfulDelta !== 0 || notHelpfulDelta !== 0) {
      await tx.companyReview.update({
        where: { id: input.reviewId },
        data: {
          helpfulCount: { increment: helpfulDelta },
          notHelpfulCount: { increment: notHelpfulDelta },
        },
      });
    }

    const updated = await tx.companyReview.findUnique({
      where: { id: input.reviewId },
      select: { helpfulCount: true, notHelpfulCount: true },
    });
    return {
      helpfulCount: updated?.helpfulCount ?? 0,
      notHelpfulCount: updated?.notHelpfulCount ?? 0,
      myVote,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────
// reportReview — increments counter + auto-flags at threshold
// ─────────────────────────────────────────────────────────────────────

const AUTO_FLAG_THRESHOLD = 3;

export interface ReportInput {
  reviewId: string;
  reason: string;
  details?: string | null;
  userId: string | null;
  fingerprintHash: string;
}

export async function reportReview(
  input: ReportInput
): Promise<{ reportedCount: number; autoFlagged: boolean }> {
  if (!input.reason || input.reason.length < 3) {
    throw new BadRequestError('Reason is required.');
  }

  return prisma.$transaction(async (tx) => {
    const review = await tx.companyReview.findUnique({
      where: { id: input.reviewId },
      select: { id: true, status: true, reportedCount: true, companyId: true },
    });
    if (!review) throw new NotFoundError('Review not found');

    await tx.companyReviewReport.create({
      data: {
        reviewId: input.reviewId,
        reporterUserId: input.userId,
        reporterFp: input.fingerprintHash,
        reason: input.reason.slice(0, 64),
        details: input.details?.slice(0, 1000) || null,
      },
    });

    const newCount = review.reportedCount + 1;
    const shouldAutoFlag = newCount >= AUTO_FLAG_THRESHOLD && review.status === 'APPROVED';

    await tx.companyReview.update({
      where: { id: input.reviewId },
      data: {
        reportedCount: newCount,
        ...(shouldAutoFlag
          ? {
              status: 'FLAGGED',
              moderationReason: 'auto_flagged_by_reports',
            }
          : {}),
      },
    });

    if (shouldAutoFlag) {
      void enqueueReviewAggregateRefresh(review.companyId, 'auto_flag').catch(() => {});
      void notifySuperAdminsOfFlag(input.reviewId).catch(() => {});
    }

    return { reportedCount: newCount, autoFlagged: shouldAutoFlag };
  });
}

// ─────────────────────────────────────────────────────────────────────
// moderateReview — super-admin only, audit-logged
// ─────────────────────────────────────────────────────────────────────

export type ModerationAction = 'APPROVE' | 'FLAG' | 'REJECT' | 'DELETE';

export async function moderateReview(
  reviewId: string,
  action: ModerationAction,
  adminUserId: string,
  reason?: string
): Promise<{ id: string; status: ReviewStatus }> {
  const review = await prisma.companyReview.findUnique({
    where: { id: reviewId },
    select: { id: true, companyId: true },
  });
  if (!review) throw new NotFoundError('Review not found');

  const newStatus: ReviewStatus =
    action === 'APPROVE'
      ? 'APPROVED'
      : action === 'FLAG'
        ? 'FLAGGED'
        : action === 'REJECT'
          ? 'REJECTED'
          : 'DELETED';

  const updated = await prisma.companyReview.update({
    where: { id: reviewId },
    data: {
      status: newStatus,
      moderationReason: reason || `admin_${action.toLowerCase()}`,
      moderatedBy: adminUserId,
      moderatedAt: new Date(),
    },
    select: { id: true, status: true },
  });

  // Audit log — fire-and-forget.
  void writeModerationAudit(adminUserId, reviewId, action, reason).catch(() => {});

  // Aggregate refresh.
  void enqueueReviewAggregateRefresh(review.companyId, `moderate_${action}`).catch(() => {});

  return updated;
}

async function writeModerationAudit(
  adminUserId: string,
  reviewId: string,
  action: ModerationAction,
  reason?: string
): Promise<void> {
  try {
    const { AuditService } = await import('./audit.service');
    await AuditService.log({
      performedBy: adminUserId,
      action: `MODERATE_COMPANY_REVIEW_${action}`,
      entity: 'CompanyReview',
      entityId: reviewId,
      details: { reason: reason ?? null },
    });
  } catch (err) {
    logger.warn('moderation audit log failed (non-fatal)', err);
  }
}

// ─────────────────────────────────────────────────────────────────────
// listOwnReviews
// ─────────────────────────────────────────────────────────────────────

export async function listOwnReviews(userId: string, page = 1, limit = 20) {
  const safeLimit = Math.min(limit, 50);
  const safePage = Math.max(page, 1);
  const [items, total] = await prisma.$transaction([
    prisma.companyReview.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
      include: {
        company: {
          select: { id: true, slug: true, companyName: true, logo: true, isVerified: true },
        },
      },
    }),
    prisma.companyReview.count({ where: { userId } }),
  ]);
  return {
    items,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────
// listEmployerReviews — own company
// ─────────────────────────────────────────────────────────────────────

export async function listEmployerReviews(employerUserId: string, filters: ListReviewsFilters) {
  const company = await prisma.companyProfile.findUnique({
    where: { userId: employerUserId },
    select: { id: true },
  });
  if (!company) throw new NotFoundError('Company profile not found');
  return listReviews(company.id, { ...filters, status: filters.status ?? 'ALL' });
}

// ─────────────────────────────────────────────────────────────────────
// listSuperAdminReviews
// ─────────────────────────────────────────────────────────────────────

export async function listSuperAdminReviews(
  filters: ListReviewsFilters & { tab?: 'all' | 'flagged' | 'reports'; q?: string }
) {
  const limit = Math.min(filters.limit ?? 20, 100);
  const page = Math.max(filters.page ?? 1, 1);

  const where: Prisma.CompanyReviewWhereInput = {};
  if (filters.tab === 'flagged') {
    where.status = 'FLAGGED';
  } else if (filters.tab === 'reports') {
    where.reportedCount = { gt: 0 };
  } else if (filters.status && filters.status !== 'ALL') {
    where.status = filters.status;
  }

  const q = filters.q?.trim();
  if (q) {
    where.OR = [
      { designation: { contains: q, mode: 'insensitive' } },
      { department: { contains: q, mode: 'insensitive' } },
      { likes: { contains: q, mode: 'insensitive' } },
      { dislikes: { contains: q, mode: 'insensitive' } },
      { workDetails: { contains: q, mode: 'insensitive' } },
      { company: { companyName: { contains: q, mode: 'insensitive' } } },
    ];
  }

  const [items, total] = await prisma.$transaction([
    prisma.companyReview.findMany({
      where,
      orderBy: [{ reportedCount: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        company: {
          select: { id: true, slug: true, companyName: true, logo: true },
        },
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    }),
    prisma.companyReview.count({ where }),
  ]);
  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// ─────────────────────────────────────────────────────────────────────
// listReviewsForCompanyByAdmin — super-admin drill-down per company
// ─────────────────────────────────────────────────────────────────────

export async function listReviewsForCompanyByAdmin(companyId: string, filters: ListReviewsFilters) {
  return listReviews(companyId, { ...filters, status: filters.status ?? 'ALL' });
}

// ─────────────────────────────────────────────────────────────────────
// deleteOwnReview — candidate deletes their own review
// ─────────────────────────────────────────────────────────────────────

export async function deleteOwnReview(userId: string, reviewId: string): Promise<void> {
  const review = await prisma.companyReview.findUnique({
    where: { id: reviewId },
    select: { id: true, userId: true, companyId: true },
  });
  if (!review) throw new NotFoundError('Review not found');
  if (review.userId !== userId) {
    throw new ForbiddenError('You can only delete your own reviews.');
  }
  await prisma.companyReview.delete({ where: { id: reviewId } });
  void enqueueReviewAggregateRefresh(review.companyId, 'review_deleted').catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────
// searchCompaniesForForm — autocomplete for the form's company-name field
// ─────────────────────────────────────────────────────────────────────

export async function searchCompaniesForForm(query: string, limit = 10) {
  const q = (query || '').trim();
  if (q.length === 0) {
    // Return a list of well-known companies (verified first) to seed
    // the dropdown when the user hasn't typed anything yet.
    const rows = await prisma.companyProfile.findMany({
      where: { publicSearchable: true },
      orderBy: [{ isVerified: 'desc' }, { companyName: 'asc' }],
      take: limit,
      select: {
        id: true,
        slug: true,
        companyName: true,
        logo: true,
        industry: true,
        isVerified: true,
        city: true,
        state: true,
      },
    });
    return rows;
  }

  const rows = await prisma.companyProfile.findMany({
    where: {
      publicSearchable: true,
      OR: [
        { companyName: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q.toLowerCase().replace(/[^a-z0-9-]/g, '-') } },
        { industry: { contains: q, mode: 'insensitive' } },
      ],
    },
    orderBy: [{ isVerified: 'desc' }, { companyName: 'asc' }],
    take: Math.min(limit, 20),
    select: {
      id: true,
      slug: true,
      companyName: true,
      logo: true,
      industry: true,
      isVerified: true,
      city: true,
      state: true,
    },
  });
  return rows;
}

// ─────────────────────────────────────────────────────────────────────
// resolveCompanyRef — slug or id → companyId
// ─────────────────────────────────────────────────────────────────────

export async function resolveCompanyRef(ref: {
  id?: string;
  slug?: string;
}): Promise<{ id: string; userId: string; companyName: string; slug: string | null } | null> {
  if (!ref.id && !ref.slug) return null;
  const company = await prisma.companyProfile.findFirst({
    where: ref.id ? { id: ref.id } : { slug: ref.slug },
    select: { id: true, userId: true, companyName: true, slug: true, publicSearchable: true },
  });
  if (!company) return null;
  if (!company.publicSearchable) return null;
  return {
    id: company.id,
    userId: company.userId,
    companyName: company.companyName,
    slug: company.slug,
  };
}

// ─────────────────────────────────────────────────────────────────────
// getMyVotes — surfaces existing helpful/not-helpful for a list of
// review ids so the UI can render initial state correctly.
//
// GUEST LOOKUP TAKES ONE HASH PER REVIEW, not one hash for the page.
// `voteFingerprint()` hashes the reviewId into the digest, so every stored
// guest vote has a DIFFERENT fingerprintHash. This used to accept a single
// hash (built from the company id) and match it against every review, which
// could never equal any stored row — so a logged-out visitor voted, reloaded,
// and their vote appeared to vanish. Callers now pass reviewId → the same
// `voteFingerprint(req, reviewId)` value the write path stores.
// ─────────────────────────────────────────────────────────────────────

export async function getMyVotes(
  reviewIds: string[],
  userId: string | null,
  /** reviewId → `voteFingerprint(req, reviewId)`. Ignored when `userId` is set. */
  fingerprintByReviewId: Map<string, string> | null
): Promise<Map<string, boolean>> {
  if (reviewIds.length === 0) return new Map();

  let rows: { reviewId: string; helpful: boolean }[];
  if (userId) {
    rows = await prisma.companyReviewVote.findMany({
      where: { reviewId: { in: reviewIds }, userId },
      select: { reviewId: true, helpful: true },
    });
  } else {
    // Exact (reviewId, fingerprintHash) pairs — an OR of equality pairs rather
    // than two independent `in` lists, so one review's hash can never satisfy
    // another review's row.
    const pairs = reviewIds
      .map((reviewId) => ({ reviewId, fingerprintHash: fingerprintByReviewId?.get(reviewId) }))
      .filter((p): p is { reviewId: string; fingerprintHash: string } =>
        Boolean(p.fingerprintHash)
      );
    if (pairs.length === 0) return new Map();
    rows = await prisma.companyReviewVote.findMany({
      where: { OR: pairs },
      select: { reviewId: true, helpful: true },
    });
  }

  const map = new Map<string, boolean>();
  for (const r of rows) map.set(r.reviewId, r.helpful);
  return map;
}

// ─────────────────────────────────────────────────────────────────────
// notifyEmployerOfNewReview / notifySuperAdminsOfFlag
// ─────────────────────────────────────────────────────────────────────

async function notifyEmployerOfNewReview(companyId: string, reviewId: string): Promise<void> {
  const company = await prisma.companyProfile.findUnique({
    where: { id: companyId },
    select: { userId: true, companyName: true, slug: true },
  });
  if (!company) return;

  const link = company.slug ? `/employer/reviews?focus=${reviewId}` : '/employer/reviews';

  const { notificationService } = await import('./notification.service');
  await notificationService.send({
    userId: company.userId,
    title: 'New review on your company',
    message: `${company.companyName} just received a new review.`,
    type: 'INFO' as const,
    category: 'company_new_review',
    link,
    metadata: { companyId, reviewId },
    channels: ['in_app'],
  });
}

async function notifySuperAdminsOfFlag(reviewId: string): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: 'SUPER_ADMIN', isActive: true },
    select: { id: true },
  });
  if (admins.length === 0) return;

  const { notificationService } = await import('./notification.service');
  for (const admin of admins) {
    await notificationService
      .send({
        userId: admin.id,
        title: 'Review auto-flagged',
        message: 'A company review has been auto-flagged after multiple reports. Please moderate.',
        type: 'WARNING' as const,
        category: 'review_auto_flagged',
        link: `/super-admin/reviews?focus=${reviewId}`,
        metadata: { reviewId },
        channels: ['in_app'],
      })
      .catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────────────────
// __test_only_helper — re-exposed for the test suite to short-circuit
// the BullMQ refresh in unit tests.
// ─────────────────────────────────────────────────────────────────────

export { AUTO_FLAG_THRESHOLD };
