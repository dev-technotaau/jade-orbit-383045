/**
 * Company-review controllers — covers public submit/list/stats,
 * candidate own-history, employer-side tracking, and super-admin
 * moderation.
 *
 * Mounted under /api/v1 — see routes/company-review.routes.ts.
 */
import type { Request, Response, NextFunction } from 'express';
import type {
  ReviewGender,
  ReviewWorkPolicy,
  ReviewEmploymentType,
  ReviewStatus,
} from '@prisma/client';
import * as svc from '../services/company-review.service';
import {
  reviewFingerprint,
  voteFingerprint,
  clientIp,
  clientUserAgent,
} from '../utils/fingerprint';
import { AppError, BadRequestError, NotFoundError } from '../exceptions';
import { assertPermission } from '../middleware/require-permission';

function looksLikeUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

async function resolveOrThrow(idOrSlug: string) {
  const ref = await svc.resolveCompanyRef(
    looksLikeUuid(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug }
  );
  if (!ref) throw new NotFoundError('Company not found');
  return ref;
}

function authedUserId(req: Request): string {
  const id = (req as { user?: { id?: string } }).user?.id;
  if (!id) throw new AppError('Authentication required', 401);
  return id;
}

function optionalUserId(req: Request): string | null {
  return (req as { user?: { id?: string } }).user?.id ?? null;
}

function intOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function parseSort(value: unknown): svc.ListReviewsFilters['sort'] {
  const s = typeof value === 'string' ? value : '';
  if (
    s === 'latest' ||
    s === 'helpful' ||
    s === 'highest_rated' ||
    s === 'lowest_rated' ||
    s === 'most_detailed'
  ) {
    return s;
  }
  return undefined;
}

const VALID_CHIPS: readonly NonNullable<svc.ListReviewsFilters['chip']>[] = [
  'highly_rated',
  'critically_rated',
  'latest',
  'detailed',
  'work_life_balance',
  'salary',
  'promotions',
  'job_security',
  'skill_development',
  'work_satisfaction',
  'company_culture',
];

function parseChip(value: unknown): svc.ListReviewsFilters['chip'] {
  const s = typeof value === 'string' ? value : '';
  return (VALID_CHIPS as readonly string[]).includes(s)
    ? (s as svc.ListReviewsFilters['chip'])
    : undefined;
}

function parseEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  const s = typeof value === 'string' ? value : '';
  return (allowed as readonly string[]).includes(s) ? (s as T) : undefined;
}

function commonListFilters(req: Request): svc.ListReviewsFilters {
  return {
    page: intOr(req.query.page, 1),
    limit: intOr(req.query.limit, 10),
    sort: parseSort(req.query.sort),
    chip: parseChip(req.query.chip),
    gender: parseEnum<ReviewGender>(req.query.gender, [
      'FEMALE',
      'MALE',
      'TRANSGENDER',
      'PREFER_NOT_TO_SAY',
    ] as const),
    workPolicy: parseEnum<ReviewWorkPolicy>(req.query.workPolicy, [
      'PERMANENT_WFH',
      'WORKING_FROM_OFFICE',
      'HYBRID',
    ] as const),
    employmentType: parseEnum<ReviewEmploymentType>(req.query.employmentType, [
      'PERMANENT',
      'INTERNSHIP',
      'CONTRACT',
      'TEMPORARY',
      'FREELANCE',
      'PART_TIME',
      'TRAINEE',
    ] as const),
    currentlyWorking:
      req.query.currentlyWorking === 'true'
        ? true
        : req.query.currentlyWorking === 'false'
          ? false
          : undefined,
    overallRatingMin:
      req.query.overallRatingMin != null
        ? intOr(req.query.overallRatingMin, 0) || undefined
        : undefined,
    department:
      typeof req.query.department === 'string' && req.query.department.trim()
        ? req.query.department.trim()
        : undefined,
    designation:
      typeof req.query.designation === 'string' && req.query.designation.trim()
        ? req.query.designation.trim()
        : undefined,
    isDetailed: req.query.isDetailed === 'true' ? true : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Public — submit, list, stats, top job profiles, autocomplete
// ─────────────────────────────────────────────────────────────────────

export const submit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const idOrSlug = String(req.params.idOrSlug || '');
    if (!idOrSlug) throw new BadRequestError('Company id or slug required');
    const company = await resolveOrThrow(idOrSlug);

    const userId = optionalUserId(req);
    const fingerprintHash = reviewFingerprint(req, company.id);

    const body = req.body as Record<string, unknown>;

    const start = body.startedWorkingAt ? new Date(String(body.startedWorkingAt)) : null;
    const end = body.endedWorkingAt ? new Date(String(body.endedWorkingAt)) : null;

    const result = await svc.submitReview({
      companyId: company.id,
      userId,
      guestEmail: typeof body.guestEmail === 'string' ? body.guestEmail : null,
      fingerprintHash,
      ipAddress: clientIp(req),
      userAgent: clientUserAgent(req),

      overallRating: Number(body.overallRating),
      ratingWorkLifeBalance: Number(body.ratingWorkLifeBalance),
      ratingSalary: Number(body.ratingSalary),
      ratingPromotions: Number(body.ratingPromotions),
      ratingJobSecurity: Number(body.ratingJobSecurity),
      ratingSkillDev: Number(body.ratingSkillDev),
      ratingWorkSatisfaction: Number(body.ratingWorkSatisfaction),
      ratingCompanyCulture: Number(body.ratingCompanyCulture),

      gender:
        parseEnum<ReviewGender>(body.gender, [
          'FEMALE',
          'MALE',
          'TRANSGENDER',
          'PREFER_NOT_TO_SAY',
        ] as const) ?? null,
      workPolicy:
        parseEnum<ReviewWorkPolicy>(body.workPolicy, [
          'PERMANENT_WFH',
          'WORKING_FROM_OFFICE',
          'HYBRID',
        ] as const) ?? 'HYBRID',
      currentlyWorking: body.currentlyWorking === true || body.currentlyWorking === 'true',
      startedWorkingAt: start && !isNaN(start.getTime()) ? start : null,
      endedWorkingAt: end && !isNaN(end.getTime()) ? end : null,
      designation: String(body.designation ?? ''),
      employmentType:
        parseEnum<ReviewEmploymentType>(body.employmentType, [
          'PERMANENT',
          'INTERNSHIP',
          'CONTRACT',
          'TEMPORARY',
          'FREELANCE',
          'PART_TIME',
          'TRAINEE',
        ] as const) ?? 'PERMANENT',
      department: String(body.department ?? ''),
      workLocation: typeof body.workLocation === 'string' ? body.workLocation : null,

      likes: typeof body.likes === 'string' ? body.likes : null,
      dislikes: typeof body.dislikes === 'string' ? body.dislikes : null,
      workDetails: typeof body.workDetails === 'string' ? body.workDetails : null,
    });
    res.status(201).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const idOrSlug = String(req.params.idOrSlug || '');
    if (!idOrSlug) throw new BadRequestError('Company id or slug required');
    const company = await resolveOrThrow(idOrSlug);
    const filters = commonListFilters(req);
    const result = await svc.listReviews(company.id, filters);

    // Attach my-vote map so the UI can render initial helpful state.
    //
    // Must use `voteFingerprint(req, reviewId)` — the SAME function and scope the
    // vote write path uses below. This previously computed a single
    // `reviewFingerprint(req, 'votes:' + company.id)`, which is a different
    // function (day-bucketed) over a different scope (company, not review), so it
    // could never match a stored row and guest vote state silently reset on reload.
    const userId = optionalUserId(req);
    const reviewIds = result.items.map((it) => (it as { id: string }).id);
    const fingerprintByReviewId = userId
      ? null
      : new Map(reviewIds.map((id) => [id, voteFingerprint(req, id)]));
    const myVotes = await svc.getMyVotes(reviewIds, userId, fingerprintByReviewId);
    const enriched = (result.items as { id: string }[]).map((it) => ({
      ...(it as object),
      myVote: myVotes.has(it.id) ? myVotes.get(it.id)! : null,
    }));

    res.status(200).json({
      status: 'success',
      data: { ...result, items: enriched },
    });
  } catch (err) {
    next(err);
  }
};

export const stats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const idOrSlug = String(req.params.idOrSlug || '');
    if (!idOrSlug) throw new BadRequestError('Company id or slug required');
    const company = await resolveOrThrow(idOrSlug);
    const data = await svc.getReviewStats(company.id);
    res.status(200).json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
};

export const facets = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const idOrSlug = String(req.params.idOrSlug || '');
    if (!idOrSlug) throw new BadRequestError('Company id or slug required');
    const company = await resolveOrThrow(idOrSlug);
    const data = await svc.computeFacets(company.id);
    res.status(200).json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
};

export const topJobProfiles = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const idOrSlug = String(req.params.idOrSlug || '');
    if (!idOrSlug) throw new BadRequestError('Company id or slug required');
    const company = await resolveOrThrow(idOrSlug);
    const data = await svc.getTopJobProfiles(company.id);
    res.status(200).json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
};

export const companiesAutocomplete = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const limit = Math.min(intOr(req.query.limit, 10), 20);
    const data = await svc.searchCompaniesForForm(q, limit);
    res.status(200).json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
};

/**
 * Sitemap helper — returns companies that have ≥1 approved review,
 * ordered by aggregate id. Used by the frontend sitemap generator
 * to emit one URL per company-with-reviews under the
 * `companies-reviews` shard.
 *
 * Output shape: `{ items: [{ slug, refreshedAt, totalReviews }], cursor }`
 */
export const companiesWithReviewsSitemap = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { prisma } = await import('../config/prisma');
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const limit = Math.min(intOr(req.query.limit, 50_000), 50_000);
    const rows = await prisma.companyReviewAggregate.findMany({
      where: { totalReviews: { gt: 0 } },
      orderBy: { companyId: 'asc' },
      take: limit,
      ...(cursor ? { cursor: { companyId: cursor }, skip: 1 } : {}),
      select: {
        companyId: true,
        totalReviews: true,
        refreshedAt: true,
        company: { select: { slug: true, publicSearchable: true } },
      },
    });
    const items = rows
      .filter((r) => r.company?.publicSearchable && r.company.slug)
      .map((r) => ({
        slug: r.company!.slug as string,
        totalReviews: r.totalReviews,
        refreshedAt: r.refreshedAt,
      }));
    const nextCursor = rows.length === limit ? rows[rows.length - 1].companyId : null;
    res.status(200).json({ status: 'success', data: { items, cursor: nextCursor } });
  } catch (err) {
    next(err);
  }
};

export const vote = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reviewId = String(req.params.id || '');
    if (!reviewId) throw new BadRequestError('Review id required');
    const helpful = req.body?.helpful === true || req.body?.helpful === 'true';
    const userId = optionalUserId(req);
    const fingerprintHash = voteFingerprint(req, reviewId);
    const data = await svc.voteHelpful({ reviewId, helpful, userId, fingerprintHash });
    res.status(200).json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
};

export const report = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reviewId = String(req.params.id || '');
    if (!reviewId) throw new BadRequestError('Review id required');
    const reason = String(req.body?.reason || '').trim();
    if (!reason) throw new BadRequestError('reason is required');
    const details = typeof req.body?.details === 'string' ? req.body.details : null;
    const userId = optionalUserId(req);
    const fingerprintHash = voteFingerprint(req, `report:${reviewId}`);
    const data = await svc.reportReview({
      reviewId,
      reason,
      details,
      userId,
      fingerprintHash,
    });
    res.status(200).json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────
// Candidate-side
// ─────────────────────────────────────────────────────────────────────

export const listOwnReviews = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = authedUserId(req);
    const result = await svc.listOwnReviews(
      userId,
      intOr(req.query.page, 1),
      intOr(req.query.limit, 20)
    );
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

export const deleteOwnReview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = authedUserId(req);
    const reviewId = String(req.params.id || '');
    if (!reviewId) throw new BadRequestError('Review id required');
    await svc.deleteOwnReview(userId, reviewId);
    res.status(200).json({ status: 'success', data: { id: reviewId } });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────
// Employer-side
// ─────────────────────────────────────────────────────────────────────

export const listEmployerReviews = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const employerUserId = authedUserId(req);
    const filters = commonListFilters(req);
    const status = parseEnum<ReviewStatus>(req.query.status, [
      'PENDING',
      'APPROVED',
      'FLAGGED',
      'REJECTED',
      'DELETED',
    ] as const);
    const result = await svc.listEmployerReviews(employerUserId, {
      ...filters,
      status: status ?? 'ALL',
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

export const employerStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const employerUserId = authedUserId(req);
    const { prisma } = await import('../config/prisma');
    const company = await prisma.companyProfile.findUnique({
      where: { userId: employerUserId },
      select: { id: true },
    });
    if (!company) throw new NotFoundError('Company profile not found');
    const data = await svc.getReviewStats(company.id);
    res.status(200).json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
};

export const employerReportReview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = authedUserId(req);
    const reviewId = String(req.params.id || '');
    if (!reviewId) throw new BadRequestError('Review id required');
    const reason = String(req.body?.reason || '').trim();
    if (!reason) throw new BadRequestError('reason is required');
    const details = typeof req.body?.details === 'string' ? req.body.details : null;
    const fingerprintHash = voteFingerprint(req, `employer-report:${reviewId}`);
    const data = await svc.reportReview({
      reviewId,
      reason,
      details,
      userId,
      fingerprintHash,
    });
    res.status(200).json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────
// Super-admin
// ─────────────────────────────────────────────────────────────────────

export const listSuperAdminReviews = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = commonListFilters(req);
    const tab = parseEnum<'all' | 'flagged' | 'reports'>(req.query.tab, [
      'all',
      'flagged',
      'reports',
    ] as const);
    const status = parseEnum<ReviewStatus>(req.query.status, [
      'PENDING',
      'APPROVED',
      'FLAGGED',
      'REJECTED',
      'DELETED',
    ] as const);
    // The `reports` tab surfaces reader-filed abuse reports — reporter
    // identity, free-text allegations — which is a different disclosure from
    // "list the reviews". `reviews.reports.view` exists precisely for it, and
    // the bare route gate (`reviews.view`) was letting anyone who could read
    // reviews switch tabs into it.
    if (tab === 'reports') await assertPermission(req, 'reviews.reports.view');

    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const result = await svc.listSuperAdminReviews({
      ...filters,
      tab,
      status,
      q,
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

export const moderateReview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminUserId = authedUserId(req);
    const reviewId = String(req.params.id || '');
    if (!reviewId) throw new BadRequestError('Review id required');
    const action = parseEnum<svc.ModerationAction>(req.body?.action, [
      'APPROVE',
      'FLAG',
      'REJECT',
      'DELETE',
    ] as const);
    if (!action) throw new BadRequestError('Invalid moderation action');

    // ── Per-action permission ──
    // The route gate is `reviews.approve`, which is right for APPROVE/FLAG
    // but was also letting it cover REJECT and DELETE — so `reviews.reject`
    // and `reviews.delete` were registry nodes that enforced nothing, and an
    // admin granted approve-only could delete a review through the API even
    // though the UI hides the button. Separation of duty between "publish
    // it" and "destroy it" is the whole reason those keys exist.
    if (action === 'REJECT') await assertPermission(req, 'reviews.reject');
    if (action === 'DELETE') await assertPermission(req, 'reviews.delete');

    const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
    const data = await svc.moderateReview(reviewId, action, adminUserId, reason);
    res.status(200).json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
};

export const listReviewsForCompanyByAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const companyId = String(req.params.companyId || '');
    if (!companyId) throw new BadRequestError('Company id required');
    const filters = commonListFilters(req);
    const status = parseEnum<ReviewStatus>(req.query.status, [
      'PENDING',
      'APPROVED',
      'FLAGGED',
      'REJECTED',
      'DELETED',
    ] as const);
    const result = await svc.listReviewsForCompanyByAdmin(companyId, {
      ...filters,
      status: status ?? 'ALL',
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};
