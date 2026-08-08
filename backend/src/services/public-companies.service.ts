/**
 * Public-companies service. Mirrors `public-jobs.service.ts` for the
 * /companies surface.
 *
 * For listing, we go through ES (`searchService.searchCompanies` —
 * added in Phase 4). For detail, we hit Prisma + Cloudinary URLs and
 * include up to 6 active jobs from the same company.
 */
import { prisma } from '../config/prisma';
import { sanitiseCompanyForPublic, applyGuestResultCap } from './public-sanitiser';
import { sanitiseJobForPublic } from './public-sanitiser';
import { NotFoundError } from '../exceptions';
import { searchService } from './search.service';
import logger from '../config/logger';

export interface PublicCompanySearchInput {
  query?: string;
  industry?: string;
  location?: string;
  city?: string;
  cities?: string;
  size?: string;
  category?: string;
  isVerified?: boolean;
  hasOpenJobs?: boolean;
  /**
   * "Featured" mode — when true, returns companies ranked by recent
   * posting activity (last 60 days). Drives /companies?featured=true
   * landings from the homepage Section 3 "View all companies" CTA.
   */
  featured?: boolean;
  sortBy?: 'relevance' | 'recency' | 'openJobsCount' | 'alphabetical';
  page?: number;
  limit?: number;
  authenticated?: boolean;
}

const GUEST_RESULT_CAP = 30;
const MAX_PAGE_SIZE = 30;

export async function searchPublicCompanies(input: PublicCompanySearchInput) {
  const limit = Math.min(input.limit ?? 20, MAX_PAGE_SIZE);
  const page = Math.max(input.page ?? 1, 1);

  // Featured mode — delegates to the public-stats featured ranker.
  // The ranker handles cold-start (when no recent posting activity
  // exists) by falling back to verified-company-by-recency, so this
  // path always returns a stable list.
  if (input.featured) {
    const { listFeaturedCompanies } = await import('./public-stats.service');
    const all = await listFeaturedCompanies(limit * page);
    const offset = (page - 1) * limit;
    const slice = all.slice(offset, offset + limit);
    const total = all.length;
    const sanitised = slice.map((c) => sanitiseCompanyForPublic(c));
    return applyGuestResultCap(
      sanitised,
      { page, limit, total },
      { authenticated: input.authenticated, guestResultCap: GUEST_RESULT_CAP }
    );
  }

  const filters: Record<string, unknown> = {
    page,
    limit,
    sortBy: input.sortBy ?? 'relevance',
    publicSearchable: true,
  };
  if (input.industry) filters.industry = input.industry;
  if (input.location) filters.location = input.location;
  if (input.city) filters.city = input.city;
  if (input.cities) filters.cities = input.cities;
  if (input.size) filters.companySize = input.size;
  if (input.category) filters.companyType = input.category;
  if (input.isVerified) filters.isVerified = input.isVerified;
  if (input.hasOpenJobs) filters.hasOpenJobs = input.hasOpenJobs;

  // Until Phase 4 ships `searchService.searchCompanies`, this falls
  // back to a Prisma query so the public surface still works on day 1.
  // Phase 4 swaps the body of this branch for the ES path.
  let result: { items: any[]; total: number };
  try {
    if (typeof (searchService as any).searchCompanies === 'function') {
      const es = await (searchService as any).searchCompanies(input.query || '', filters);
      result = { items: es.hits as any[], total: es.total as number };
    } else {
      result = await prismaCompanyFallback(input, page, limit);
    }
  } catch (err) {
    logger.warn('public-companies search — ES failed, falling back to Prisma', err);
    result = await prismaCompanyFallback(input, page, limit);
  }

  // ES employer docs indexed before the logo field was added have no `logo`
  // in their `_source`, so the card renders the Building2 placeholder. Hydrate
  // the logo (+ variants) from the DB for any hit missing it — reindex-free.
  const needLogo = (result.items as Array<{ id?: string; logo?: string | null }>).filter(
    (c) => c?.id && !c.logo
  );
  if (needLogo.length > 0) {
    const logoRows = await prisma.companyProfile.findMany({
      where: { id: { in: needLogo.map((c) => c.id as string) } },
      select: { id: true, logo: true, logoVariants: true },
    });
    const logoById = new Map(logoRows.map((r) => [r.id, r]));
    for (const c of result.items as Array<{
      id?: string;
      logo?: string | null;
      logoVariants?: unknown;
    }>) {
      if (c?.id && !c.logo) {
        const row = logoById.get(c.id);
        if (row) {
          c.logo = row.logo;
          c.logoVariants = row.logoVariants;
        }
      }
    }
  }

  const sanitised = result.items.map((c) => sanitiseCompanyForPublic(c));
  // Attach averageRating + totalReviews per company so cards render the
  // rating badge without an N+1 fetch. Aggregate row may be missing
  // for companies with zero reviews — degrade to (0, 0).
  const companyIds = sanitised.map((c) => c.id).filter((id): id is string => !!id);
  if (companyIds.length > 0) {
    const { getAggregatesForCompanyIds } = await import('./review-aggregate.service');
    const aggMap = await getAggregatesForCompanyIds(companyIds);
    for (const c of sanitised) {
      const agg = c.id ? aggMap.get(c.id) : undefined;
      (c as Record<string, unknown>).averageRating = agg?.averageRating ?? 0;
      (c as Record<string, unknown>).totalReviews = agg?.totalReviews ?? 0;
    }
  }
  return applyGuestResultCap(
    sanitised,
    { page, limit, total: result.total },
    {
      authenticated: input.authenticated,
      guestResultCap: GUEST_RESULT_CAP,
    }
  );
}

/**
 * Prisma fallback for company search — used when ES isn't ready or
 * fails. Fewer features than the ES path but still functional.
 */
async function prismaCompanyFallback(input: PublicCompanySearchInput, page: number, limit: number) {
  const where: any = { publicSearchable: true };
  if (input.query) {
    where.OR = [
      { companyName: { contains: input.query, mode: 'insensitive' } },
      { description: { contains: input.query, mode: 'insensitive' } },
      { industry: { contains: input.query, mode: 'insensitive' } },
    ];
  }
  if (input.industry) where.industry = input.industry;
  if (input.city) where.city = input.city;
  if (input.size) where.companySize = input.size;
  if (input.category) where.companyType = input.category;
  if (input.isVerified) where.isVerified = true;

  const [items, total] = await Promise.all([
    prisma.companyProfile.findMany({
      where,
      select: {
        id: true,
        slug: true,
        companyName: true,
        tagline: true,
        logo: true,
        industry: true,
        companySize: true,
        city: true,
        state: true,
        headquarters: true,
        isVerified: true,
        companyType: true,
      },
      orderBy:
        input.sortBy === 'alphabetical'
          ? { companyName: 'asc' }
          : input.sortBy === 'recency'
            ? { updatedAt: 'desc' }
            : { isVerified: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.companyProfile.count({ where }),
  ]);

  return { items, total };
}

/**
 * Detail page for `/companies/{slug}`. Includes up to 6 most-recent
 * public jobs from this company.
 */
export async function getPublicCompanyBySlug(
  slug: string,
  authenticated = false,
  viewerUserId: string | null = null
) {
  const company = await prisma.companyProfile.findFirst({
    where: {
      slug,
      publicSearchable: true,
    },
  });
  if (!company) throw new NotFoundError('Company not found');

  const jobs = await prisma.jobPost.findMany({
    where: {
      companyId: company.id,
      publicSearchable: true,
      status: 'OPEN',
    },
    select: {
      id: true,
      slug: true,
      title: true,
      location: true,
      workMode: true,
      experienceMin: true,
      experienceMax: true,
      type: true,
      salaryMin: true,
      salaryMax: true,
      salaryDisclosed: true,
      currency: true,
      createdAt: true,
      isFeatured: true,
      isPremium: true,
      urgencyLevel: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 6,
  });

  // Follow stats — followersCount is public (same for all viewers,
  // safe to share through CDN/Redis caches). `isFollowing` is
  // intentionally NOT included in this response: it varies per-user
  // and would leak across cache entries if included. Frontend reads
  // it from the dedicated /companies/:slug/follow-status endpoint
  // which uses a per-user cache key.
  const { getStatus } = await import('./company-follow.service');
  const followStatus = await getStatus(null, company.id);
  // Suppress lint for unused viewerUserId — kept on the function
  // signature for callers that want it; intentionally unused here.
  void viewerUserId;

  // Review aggregate — populated by the BullMQ aggregate worker. Falls
  // back to zero when no reviews exist; same row is shared across all
  // viewers so it's safe under per-route CDN/Redis caches.
  const aggregate = await prisma.companyReviewAggregate.findUnique({
    where: { companyId: company.id },
    select: {
      totalReviews: true,
      averageOverall: true,
      topJobProfiles: true,
    },
  });

  return {
    company: sanitiseCompanyForPublic(company),
    jobs: jobs.map((j) => sanitiseJobForPublic(j, { authenticated })),
    openJobsCount: await prisma.jobPost.count({
      where: { companyId: company.id, publicSearchable: true, status: 'OPEN' },
    }),
    followersCount: followStatus.followersCount,
    averageRating: aggregate?.averageOverall ?? 0,
    totalReviews: aggregate?.totalReviews ?? 0,
    topJobProfiles: Array.isArray(aggregate?.topJobProfiles) ? aggregate.topJobProfiles : [],
  };
}

/**
 * Filterable, paginated company-jobs feed — used by the Jobs tab on
 * the public company-detail page (and the employer's own preview).
 *
 * Returns:
 *   - items: paginated, sanitised public job rows
 *   - pagination: page/limit/total
 *   - facets: per-filter distinct values + counts, scoped to THIS
 *     company's actively-posted public jobs. Empty values are
 *     omitted so the pill UI only shows options the visitor can
 *     actually pick.
 */

export interface CompanyJobsFilterInput {
  slug: string;
  jobType?: string | string[];
  workMode?: string | string[];
  location?: string | string[];
  experienceLevel?: string | string[];
  department?: string | string[];
  page?: number;
  limit?: number;
  authenticated?: boolean;
}

interface FacetBucket {
  value: string;
  count: number;
}

export async function getCompanyJobs(input: CompanyJobsFilterInput) {
  const limit = Math.min(input.limit ?? 10, 30);
  const page = Math.max(input.page ?? 1, 1);

  const company = await prisma.companyProfile.findFirst({
    where: { slug: input.slug, publicSearchable: true },
    select: { id: true },
  });
  if (!company) throw new NotFoundError('Company not found');

  const toArray = (v: string | string[] | undefined): string[] | undefined => {
    if (!v) return undefined;
    const arr = Array.isArray(v)
      ? v
      : v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
    return arr.length > 0 ? arr : undefined;
  };

  const jobTypes = toArray(input.jobType);
  const workModes = toArray(input.workMode);
  const locations = toArray(input.location);
  const expLevels = toArray(input.experienceLevel);
  const departments = toArray(input.department);

  const baseWhere = {
    companyId: company.id,
    publicSearchable: true,
    status: 'OPEN' as const,
  };

  // Filtered where — the actual results query.
  const filteredWhere = {
    ...baseWhere,
    ...(jobTypes ? { type: { in: jobTypes as any } } : {}),
    ...(workModes ? { workMode: { in: workModes as any } } : {}),
    ...(locations ? { location: { in: locations } } : {}),
    ...(expLevels ? { experienceLevel: { in: expLevels as any } } : {}),
    ...(departments ? { department: { in: departments } } : {}),
  } as Record<string, unknown>;

  // Page items + total count.
  const [items, total] = await prisma.$transaction([
    prisma.jobPost.findMany({
      where: filteredWhere,
      select: {
        id: true,
        slug: true,
        title: true,
        location: true,
        workMode: true,
        experienceMin: true,
        experienceMax: true,
        type: true,
        salaryMin: true,
        salaryMax: true,
        salaryDisclosed: true,
        currency: true,
        createdAt: true,
        isFeatured: true,
        isPremium: true,
        urgencyLevel: true,
        experienceLevel: true,
        department: true,
      },
      orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.jobPost.count({ where: filteredWhere }),
  ]);

  // Facet buckets — distinct values + counts across THIS company's
  // OPEN public jobs (NOT the filtered subset, so pills always show
  // every option the company has, even when the visitor has narrowed
  // results). One groupBy per facet — five queries, each on the same
  // small base set so latency stays low.
  const facetGroup = async (
    field: 'type' | 'workMode' | 'location' | 'experienceLevel' | 'department'
  ): Promise<FacetBucket[]> => {
    const groups = await prisma.jobPost.groupBy({
      by: [field],
      where: baseWhere,
      _count: { _all: true },
      orderBy: { _count: { id: 'desc' } },
    });
    return groups
      .filter((g) => g[field] != null && String(g[field]).length > 0)
      .map((g) => ({ value: String(g[field]), count: g._count._all }));
  };

  const [facetJobType, facetWorkMode, facetLocation, facetExperienceLevel, facetDepartment] =
    await Promise.all([
      facetGroup('type'),
      facetGroup('workMode'),
      facetGroup('location'),
      facetGroup('experienceLevel'),
      facetGroup('department'),
    ]);

  return {
    items: items.map((j) => sanitiseJobForPublic(j, { authenticated: input.authenticated })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    facets: {
      jobType: facetJobType,
      workMode: facetWorkMode,
      location: facetLocation,
      experienceLevel: facetExperienceLevel,
      department: facetDepartment,
    },
  };
}

/**
 * Sitemap-shard data source for companies.
 */
export async function listPublicCompaniesForSitemap(
  opts: { cursor?: string; pageSize?: number } = {}
) {
  const pageSize = Math.min(opts.pageSize ?? 50_000, 50_000);
  const rows = await prisma.companyProfile.findMany({
    where: { publicSearchable: true, slug: { not: null } },
    select: { id: true, slug: true, updatedAt: true },
    orderBy: { id: 'asc' },
    take: pageSize,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  return rows;
}

export async function countPublicCompanies(): Promise<number> {
  return prisma.companyProfile.count({
    where: { publicSearchable: true, slug: { not: null } },
  });
}
