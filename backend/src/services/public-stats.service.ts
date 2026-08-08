/**
 * Public-stats service. Aggregations behind the homepage discovery
 * widgets (top company categories, featured companies, popular roles).
 *
 * Every method is anonymous-safe — no per-user data — and aggressively
 * cached at the route level (Redis 1h TTL via `cache` middleware) since
 * the underlying numbers move slowly.
 *
 * Used by:
 *   - GET /api/v1/public/company-categories/stats
 *   - GET /api/v1/public/companies/featured
 *   - GET /api/v1/public/role-counts
 */
import { CuratedType, JobStatus, ReviewStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import logger from '../config/logger';

// ─────────────────────────────────────────────────────────────────────
// Section 2 — top company categories with per-category stats
// ─────────────────────────────────────────────────────────────────────

export interface CompanyCategoryStat {
  /** CuratedListing.slug — e.g. "companies-unicorn". */
  slug: string;
  /** CuratedListing.label — e.g. "Unicorn Companies". */
  label: string;
  /** Public URL (drives the click → category landing). */
  href: string;
  /** Companies actively hiring in this category (≥1 OPEN public job). */
  totalCompanies: number;
  /** Up to 4 sample logos for visual richness. */
  sampleLogos: string[];
  /** Average overall rating across companies in the category that have reviews — null when no reviews yet. */
  averageRating?: number | null;
  /** Total reviews summed across companies in the category. */
  totalReviews?: number;
}

const SECTION_2_TARGET = 15;

function buildCompanyWhere(
  filterPreset: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!filterPreset || typeof filterPreset !== 'object') return {};
  const where: Record<string, unknown> = {};
  if (typeof filterPreset.companyType === 'string') {
    where.companyType = filterPreset.companyType;
  }
  if (typeof filterPreset.industry === 'string') {
    where.industry = filterPreset.industry;
  }
  // COMPANY_COLLECTION editorial filters — only verified-employer is a
  // real DB field today. Other COLLECTION presets (sponsored, featured,
  // trending, hasDiversityProgram) don't map to columns, so we let
  // them fall through to the baseline "any actively-hiring company"
  // count — fine because those collections are editorially curated and
  // the ALL-companies-with-open-jobs count is still meaningful.
  if (filterPreset.isVerified === true) {
    where.isVerified = true;
  }
  return where;
}

/**
 * Build the public URL for any CuratedListing entry — mirrors the
 * frontend `curated-href` resolver so the click destinations match the
 * mega-nav exactly.
 */
function curatedListingHref(slug: string, type: CuratedType): string {
  if (type === CuratedType.COMPANY_CATEGORY) {
    return `/companies/category/${slug.replace(/^companies-/, '')}`;
  }
  if (type === CuratedType.COMPANY_COLLECTION) {
    return `/companies/collection/${slug}`;
  }
  // Fallback (shouldn't happen for company entries).
  return `/companies/${slug}`;
}

export async function listCompanyCategoryStats(): Promise<CompanyCategoryStat[]> {
  // Pull COMPANY_CATEGORY (≤10) + COMPANY_COLLECTION (≤8) and slice to
  // SECTION_2_TARGET (15). The companies mega-nav has BOTH "Explore
  // Categories" + "Explore Collections" columns, so the homepage
  // section "Top Companies Hiring Now" mirrors that mix. Categories
  // come first (`displayOrder` ASC), then collections fill remaining
  // slots up to 15.
  const rows = await prisma.curatedListing.findMany({
    where: {
      type: { in: [CuratedType.COMPANY_CATEGORY, CuratedType.COMPANY_COLLECTION] },
      isPublic: true,
    },
    // Categories ASCII-sort before collections — keep stable ordering.
    orderBy: [{ type: 'asc' }, { displayOrder: 'asc' }, { label: 'asc' }],
    take: SECTION_2_TARGET,
  });

  const stats: CompanyCategoryStat[] = [];
  for (const row of rows) {
    const baseWhere = buildCompanyWhere(row.filterPreset as Record<string, unknown>);
    const where = {
      ...baseWhere,
      publicSearchable: true,
      // Active hiring = at least one OPEN, publicSearchable job
      jobs: {
        some: {
          status: 'OPEN' as const,
          publicSearchable: true,
        },
      },
    };

    try {
      const [totalCompanies, samples, ratedCompanies] = await prisma.$transaction([
        prisma.companyProfile.count({ where }),
        prisma.companyProfile.findMany({
          where: {
            ...where,
            logo: { not: null },
          },
          select: { logo: true },
          orderBy: { updatedAt: 'desc' },
          take: 4,
        }),
        // Pull aggregate ratings for companies in this category — used to
        // surface a category-level "★ 4.2 · 1.2k" sample on the slider.
        prisma.companyProfile.findMany({
          where,
          select: {
            reviewAggregate: {
              select: { averageOverall: true, totalReviews: true },
            },
          },
        }),
      ]);

      // Weighted average across the category's companies (ignoring
      // companies with zero reviews so noise doesn't dilute the signal).
      let weightedSum = 0;
      let totalReviews = 0;
      for (const c of ratedCompanies) {
        const r = c.reviewAggregate;
        if (r && r.totalReviews > 0) {
          weightedSum += r.averageOverall * r.totalReviews;
          totalReviews += r.totalReviews;
        }
      }
      const averageRating =
        totalReviews > 0 ? Number((weightedSum / totalReviews).toFixed(2)) : null;

      stats.push({
        slug: row.slug,
        label: row.label,
        href: curatedListingHref(row.slug, row.type),
        totalCompanies,
        sampleLogos: samples.map((s) => s.logo).filter((l): l is string => Boolean(l)),
        averageRating,
        totalReviews,
      });
    } catch (err) {
      logger.warn(`category-stats failed for ${row.slug}`, err);
      stats.push({
        slug: row.slug,
        label: row.label,
        href: curatedListingHref(row.slug, row.type),
        totalCompanies: 0,
        sampleLogos: [],
      });
    }
  }
  return stats;
}

// ─────────────────────────────────────────────────────────────────────
// Section 3 — featured companies (ranked by recent posting activity)
//
// "Featured" = whichever companies actively post/hire in less time.
// Operationally: rank by count of OPEN public jobs created in the last
// 60 days, descending. Tie-break by company.updatedAt (recency of any
// profile edit) so dormant pages never lead the carousel.
// ─────────────────────────────────────────────────────────────────────

export interface FeaturedCompany {
  id: string;
  slug: string;
  companyName: string;
  logo: string | null;
  tagline: string | null;
  industry: string | null;
  isVerified: boolean;
  /** Count of OPEN public jobs the company is currently hiring for. */
  openJobsCount: number;
  /** Activity score = jobs posted in last 60 days. Drives the ranking. */
  recentActivityScore: number;
  /** Average overall rating (1–5) — 0 when no reviews. */
  averageRating?: number;
  /** Total APPROVED reviews count — 0 when none. */
  totalReviews?: number;
}

const FEATURED_LOOKBACK_DAYS = 60;
const FEATURED_DEFAULT_LIMIT = 15;

export async function listFeaturedCompanies(
  limit = FEATURED_DEFAULT_LIMIT
): Promise<FeaturedCompany[]> {
  const since = new Date(Date.now() - FEATURED_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  // Step 1 — rank companies by recent posting activity (groupBy + count).
  // We over-fetch (limit × 3) so we still have candidates after filtering
  // out companies that since the count have closed their last job.
  const grouped = await prisma.jobPost.groupBy({
    by: ['companyId'],
    where: {
      createdAt: { gte: since },
      publicSearchable: true,
      status: { in: ['OPEN', 'CLOSED'] }, // recent posting activity counts even if some closed
    },
    _count: { _all: true },
    orderBy: { _count: { id: 'desc' } },
    take: limit * 3,
  });

  if (grouped.length === 0) {
    // Cold-start fallback — verified companies with at least one open
    // job, ranked by last-update recency. Ensures the homepage section
    // never renders empty on day one.
    const fallback = await prisma.companyProfile.findMany({
      where: {
        publicSearchable: true,
        slug: { not: null },
        jobs: { some: { status: 'OPEN', publicSearchable: true } },
      },
      orderBy: [{ isVerified: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        slug: true,
        companyName: true,
        logo: true,
        tagline: true,
        industry: true,
        isVerified: true,
      },
    });
    const counts = await prisma.jobPost.groupBy({
      by: ['companyId'],
      where: {
        companyId: { in: fallback.map((f) => f.id) },
        status: 'OPEN',
        publicSearchable: true,
      },
      _count: { _all: true },
    });
    const countByCompany = new Map(counts.map((c) => [c.companyId, c._count._all]));
    const { getAggregatesForCompanyIds: getAggsFallback } =
      await import('./review-aggregate.service');
    const aggsFallback = await getAggsFallback(fallback.map((f) => f.id));
    return fallback.map((f) => ({
      id: f.id,
      slug: f.slug ?? '',
      companyName: f.companyName,
      logo: f.logo,
      tagline: f.tagline,
      industry: f.industry,
      isVerified: f.isVerified,
      openJobsCount: countByCompany.get(f.id) ?? 0,
      recentActivityScore: 0,
      averageRating: aggsFallback.get(f.id)?.averageRating ?? 0,
      totalReviews: aggsFallback.get(f.id)?.totalReviews ?? 0,
    }));
  }

  const companyIds = grouped.map((g) => g.companyId);
  const scoreById = new Map(grouped.map((g) => [g.companyId, g._count._all]));

  const companies = await prisma.companyProfile.findMany({
    where: {
      id: { in: companyIds },
      publicSearchable: true,
      slug: { not: null },
    },
    select: {
      id: true,
      slug: true,
      companyName: true,
      logo: true,
      tagline: true,
      industry: true,
      isVerified: true,
      updatedAt: true,
    },
  });

  // Open-jobs count for the badge. Only counted when a job is currently
  // OPEN — so we don't show "0 jobs" on a company that's just gone cold.
  const openCounts = await prisma.jobPost.groupBy({
    by: ['companyId'],
    where: {
      companyId: { in: companyIds },
      status: 'OPEN',
      publicSearchable: true,
    },
    _count: { _all: true },
  });
  const openByCompany = new Map(openCounts.map((c) => [c.companyId, c._count._all]));

  const { getAggregatesForCompanyIds } = await import('./review-aggregate.service');
  const aggMap = await getAggregatesForCompanyIds(companyIds);

  return companies
    .map((c) => ({
      id: c.id,
      slug: c.slug ?? '',
      companyName: c.companyName,
      logo: c.logo,
      tagline: c.tagline,
      industry: c.industry,
      isVerified: c.isVerified,
      openJobsCount: openByCompany.get(c.id) ?? 0,
      recentActivityScore: scoreById.get(c.id) ?? 0,
      averageRating: aggMap.get(c.id)?.averageRating ?? 0,
      totalReviews: aggMap.get(c.id)?.totalReviews ?? 0,
      _updatedAt: c.updatedAt.getTime(),
    }))
    .filter((c) => c.openJobsCount > 0) // hide dormant companies
    .sort((a, b) => {
      if (a.recentActivityScore !== b.recentActivityScore) {
        return b.recentActivityScore - a.recentActivityScore;
      }
      return b._updatedAt - a._updatedAt;
    })
    .slice(0, limit)
    .map(({ _updatedAt, ...rest }) => {
      void _updatedAt;
      return rest;
    });
}

// ─────────────────────────────────────────────────────────────────────
// Section 4 — popular roles (job-count per role keyword)
//
// Section 4 widget shows N role tiles (e.g. "Sales Executive · 1,242
// jobs"). The frontend posts the role list it wants counts for; we
// return the public-job count for each role keyword.
// ─────────────────────────────────────────────────────────────────────

export interface RoleCount {
  /** The role keyword as supplied by the caller. */
  role: string;
  /** Count of OPEN, publicSearchable jobs whose title or skills contain `role`. */
  count: number;
}

const ROLE_COUNT_MAX_BATCH = 30;
const ROLE_COUNT_MAX_LEN = 60;

export async function countJobsForRoles(roles: string[]): Promise<RoleCount[]> {
  if (!Array.isArray(roles) || roles.length === 0) return [];
  const cleaned = roles
    .map((r) => String(r).trim())
    .filter((r) => r.length > 0 && r.length <= ROLE_COUNT_MAX_LEN)
    .slice(0, ROLE_COUNT_MAX_BATCH);
  if (cleaned.length === 0) return [];

  // Single transaction — N count queries in parallel. Each query
  // looks for the role keyword in title (preferred) or skills array.
  const counts = await prisma.$transaction(
    cleaned.map((role) =>
      prisma.jobPost.count({
        where: {
          status: 'OPEN',
          publicSearchable: true,
          OR: [
            { title: { contains: role, mode: 'insensitive' } },
            { skillsRequired: { has: role } },
          ],
        },
      })
    )
  );

  return cleaned.map((role, i) => ({ role, count: counts[i] ?? 0 }));
}

/**
 * Newest `updatedAt` per sitemap-relevant dataset.
 *
 * Feeds the `<lastmod>` values in `/sitemap-index.xml`. Before this, the index
 * stamped every child with the render time, so on each 10-minute revalidation it
 * told crawlers "all eleven sitemaps just changed" — which teaches Google to
 * ignore `lastmod` altogether and wastes crawl budget re-fetching shards that
 * had not moved.
 *
 * One round-trip, and each value is an indexed `MAX()` rather than a scan. The
 * filters mirror what actually lands in each shard, so a private or unapproved
 * row cannot bump a public sitemap's freshness.
 *
 * Nulls are expected for empty datasets — the caller decides the fallback.
 */
export async function getSitemapLastmods(): Promise<Record<string, string | null>> {
  const [jobs, companies, curated, reviews, vendors, aggregates] = await prisma.$transaction([
    prisma.jobPost.aggregate({
      where: { status: JobStatus.OPEN, publicSearchable: true },
      _max: { updatedAt: true },
    }),
    prisma.companyProfile.aggregate({
      where: { publicSearchable: true },
      _max: { updatedAt: true },
    }),
    prisma.curatedListing.aggregate({
      where: { isPublic: true },
      _max: { updatedAt: true },
    }),
    prisma.companyReview.aggregate({
      where: { status: ReviewStatus.APPROVED },
      _max: { updatedAt: true },
    }),
    prisma.vendorProfile.aggregate({
      where: { isPublic: true },
      _max: { updatedAt: true },
    }),
    // Aggregates are derived from search traffic, so recency of the underlying
    // rows is the only freshness signal available.
    prisma.searchHistory.aggregate({ _max: { updatedAt: true } }),
  ]);

  const iso = (d: Date | null | undefined): string | null => d?.toISOString() ?? null;

  return {
    jobs: iso(jobs._max.updatedAt),
    companies: iso(companies._max.updatedAt),
    curated: iso(curated._max.updatedAt),
    reviews: iso(reviews._max.updatedAt),
    vendors: iso(vendors._max.updatedAt),
    searchAggregates: iso(aggregates._max.updatedAt),
  };
}
