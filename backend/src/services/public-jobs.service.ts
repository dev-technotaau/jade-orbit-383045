/**
 * Public-jobs service. Wraps the existing ES-backed `searchService` and
 * the Prisma single-row reads, then runs every response through
 * `public-sanitiser` before returning.
 *
 * Used by:
 *   - `/api/v1/public/jobs` (list/search)
 *   - `/api/v1/public/jobs/:slug` (detail)
 *   - Sitemap generators (`listPublicJobsForSitemap`)
 */
import { prisma } from '../config/prisma';
import { searchService } from './search.service';
import { sanitiseJobForPublic, applyGuestResultCap } from './public-sanitiser';
import { NotFoundError } from '../exceptions';
import logger from '../config/logger';

export interface PublicJobSearchInput {
  /** Free-text. */
  query?: string;
  /** Comma-separated. Operators: `,` AND, `|` OR, `!` NOT prefix. */
  skills?: string;
  designation?: string;
  cities?: string;
  location?: string;
  experienceMin?: number;
  experienceMax?: number;
  workMode?: string;
  jobType?: string;
  industry?: string;
  department?: string;
  category?: string;
  qualification?: string;
  shiftType?: string;
  salaryMin?: number;
  salaryMax?: number;
  postedAfter?: string;
  sortBy?: 'relevance' | 'date' | 'salary' | 'salary_asc' | 'distance';
  page?: number;
  limit?: number;
  /** Provided by the route handler from req.user — drives sanitisation. */
  authenticated?: boolean;
}

const GUEST_RESULT_CAP = 30;
const MAX_PAGE_SIZE = 30;

/**
 * Search public jobs. Always restricts to `publicSearchable: true` and
 * `status: OPEN` so guests never see closed/expired/private jobs.
 */
export async function searchPublicJobs(input: PublicJobSearchInput) {
  const limit = Math.min(input.limit ?? 20, MAX_PAGE_SIZE);
  const page = Math.max(input.page ?? 1, 1);

  // Compose filters for the existing ES search.
  const filters: Record<string, unknown> = {
    page,
    limit,
    sortBy: input.sortBy ?? 'relevance',
  };
  // Operator-aware skills parsing — `,` AND (default), `|` OR, `!` NOT.
  if (input.skills) {
    const { parseMultiValue, hasOperatorChars } = await import('../lib/operator-parser');
    if (hasOperatorChars(input.skills)) {
      filters.skillsBool = parseMultiValue(input.skills);
    } else {
      filters.skills = input.skills;
    }
  }
  if (input.designation) filters.designation = input.designation;
  if (input.cities) filters.cities = input.cities;
  if (input.location) filters.location = input.location;
  if (input.experienceMin != null) filters.experienceMin = input.experienceMin;
  if (input.experienceMax != null) filters.experienceMax = input.experienceMax;
  if (input.workMode) filters.workMode = input.workMode;
  if (input.jobType) filters.type = input.jobType;
  if (input.industry) filters.industry = input.industry;
  if (input.department) filters.department = input.department;
  if (input.category) filters.roleCategory = input.category;
  if (input.qualification) filters.educationRequired = input.qualification;
  if (input.shiftType) filters.shiftType = input.shiftType;
  if (input.salaryMin != null) filters.salaryMin = input.salaryMin;
  if (input.salaryMax != null) filters.salaryMax = input.salaryMax;
  if (input.postedAfter) filters.postedAfter = input.postedAfter;
  // Public-only filter — excludes private/confidential jobs from the board.
  filters.publicSearchable = true;
  filters.status = 'OPEN';

  const result = await searchService.searchJobs(input.query || '', filters);

  // Sanitise + apply guest cap.
  const sanitisedItems = (result.hits as any[]).map((j) =>
    sanitiseJobForPublic(j, { authenticated: input.authenticated })
  );

  // Attach averageRating + totalReviews per job's company so the cards
  // can render the rating badge inline.
  await attachCompanyRatings(sanitisedItems);

  return applyGuestResultCap(
    sanitisedItems,
    {
      page,
      limit,
      total: result.total,
    },
    {
      authenticated: input.authenticated,
      guestResultCap: GUEST_RESULT_CAP,
    }
  );
}

/**
 * Hydrates `company.averageRating` + `company.totalReviews` on a list
 * of job rows. Bulk one-shot fetch — no N+1.
 */
async function attachCompanyRatings(rows: Array<{ company?: { id?: string } }>): Promise<void> {
  const ids: string[] = [];
  for (const r of rows) {
    const id = r.company?.id;
    if (id && !ids.includes(id)) ids.push(id);
  }
  if (ids.length === 0) return;
  const { getAggregatesForCompanyIds } = await import('./review-aggregate.service');
  const aggMap = await getAggregatesForCompanyIds(ids);
  for (const r of rows) {
    if (!r.company || !r.company.id) continue;
    const agg = aggMap.get(r.company.id);
    (r.company as Record<string, unknown>).averageRating = agg?.averageRating ?? 0;
    (r.company as Record<string, unknown>).totalReviews = agg?.totalReviews ?? 0;
  }
}

/**
 * Fetch a single public job by slug. Strips contact + internal fields.
 *   - 404 when no matching job, expired, or `publicSearchable: false`.
 *   - Includes hiring company's public summary in `company`.
 *   - Includes top 3 related jobs from the same company / role category.
 */
export async function getPublicJobBySlug(slug: string, authenticated = false) {
  const job = await prisma.jobPost.findFirst({
    where: {
      slug,
      publicSearchable: true,
      status: 'OPEN',
    },
    include: {
      company: {
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
          website: true,
        },
      },
      screeningQuestions: {
        select: {
          id: true,
          question: true,
          questionType: true,
          isRequired: true,
          options: true,
          displayOrder: true,
        },
        orderBy: { displayOrder: 'asc' },
      },
    },
  });
  if (!job) throw new NotFoundError('Job not found or no longer accepting applications');

  // Related jobs (up to 3) — same role category if available, else same
  // city. Best-effort; failures don't break the response.
  let related: Array<{
    id: string;
    slug: string | null;
    title: string;
    location: string;
    workMode: string | null;
    company: {
      id: string;
      slug: string | null;
      companyName: string;
      logo: string | null;
      isVerified: boolean;
    } | null;
  }> = [];
  try {
    related = (await prisma.jobPost.findMany({
      where: {
        publicSearchable: true,
        status: 'OPEN',
        id: { not: job.id },
        OR: [
          job.roleCategory ? { roleCategory: job.roleCategory } : {},
          { location: job.location },
        ],
      },
      select: {
        id: true,
        slug: true,
        title: true,
        location: true,
        workMode: true,
        company: {
          select: { id: true, slug: true, companyName: true, logo: true, isVerified: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
    })) as typeof related;
  } catch (err) {
    logger.warn('public-jobs.related fetch failed', err);
  }

  const sanitisedJob = sanitiseJobForPublic(job, { authenticated });
  const sanitisedRelated = related.map((r) => sanitiseJobForPublic(r, { authenticated }));
  await attachCompanyRatings([sanitisedJob, ...sanitisedRelated]);

  return {
    job: sanitisedJob,
    related: sanitisedRelated,
  };
}

/**
 * Cursor-paginated job list for sitemap shards. Returns 50k IDs at most
 * per call. `lastModified` reflects `updatedAt` so the sitemap honours
 * per-job freshness.
 */
export async function listPublicJobsForSitemap(opts: { cursor?: string; pageSize?: number } = {}) {
  const pageSize = Math.min(opts.pageSize ?? 50_000, 50_000);
  const rows = await prisma.jobPost.findMany({
    where: { publicSearchable: true, status: 'OPEN', slug: { not: null } },
    select: { id: true, slug: true, updatedAt: true },
    orderBy: { id: 'asc' },
    take: pageSize,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  return rows;
}

/**
 * Count total public jobs — used by sitemap shard planner to determine
 * how many shards to allocate.
 */
export async function countPublicJobs(): Promise<number> {
  return prisma.jobPost.count({
    where: { publicSearchable: true, status: 'OPEN', slug: { not: null } },
  });
}
