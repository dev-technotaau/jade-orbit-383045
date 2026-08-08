import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import { prisma } from '../config/prisma';
import { JobStatus } from '@prisma/client';
import { cache } from '../middleware/cache';
import { etagCache } from '../middleware/etag';
import { optionalAuth } from '../middleware/auth';
import { publicLimiter } from '../middleware/rate-limit';
import { getTrendingJobs, getTrendingSearches } from '../utils/trending';
import * as publicCtrl from '../controllers/public.controller';
import * as searchHistoryCtrl from '../controllers/search-history.controller';
import * as curatedCtrl from '../controllers/curated.controller';
import * as publicStatsCtrl from '../controllers/public-stats.controller';
import { protect } from '../middleware/auth';

const router = Router();

// Public stats — cached for 10 minutes
router.get(
  '/stats',
  cache({ ttl: 600 }),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      // `applications` is the headline public metric: it counts something that
      // happens entirely ON the platform, so it is always accurate.
      //
      // `placements` (applications marked HIRED) is retained for API
      // compatibility but is NO LONGER SURFACED publicly — the final hire
      // happens off-platform, so employers seldom set that status and the
      // number understates reality badly. Don't put it back on a marketing
      // surface without a reliable way to capture outcomes.
      const [activeJobs, companies, candidates, applications, placements] =
        await prisma.$transaction([
          prisma.jobPost.count({ where: { status: JobStatus.OPEN } }),
          prisma.companyProfile.count(),
          prisma.candidateProfile.count(),
          prisma.jobApplication.count(),
          prisma.jobApplication.count({ where: { status: 'HIRED' } }),
        ]);

      res.status(200).json({
        status: 'success',
        data: { activeJobs, companies, candidates, applications, placements },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Job counts grouped by department — cached for 10 minutes
router.get(
  '/jobs/category-counts',
  cache({ ttl: 600 }),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const groups = await prisma.jobPost.groupBy({
        by: ['department'],
        where: { status: JobStatus.OPEN, department: { not: null } },
        _count: { id: true },
      });

      const data: Record<string, number> = {};
      for (const g of groups) {
        if (g.department) {
          data[g.department] = g._count.id;
        }
      }

      res.status(200).json({ status: 'success', data });
    } catch (error) {
      next(error);
    }
  }
);

// Trending jobs & searches — cached for 60s
router.get(
  '/trending',
  cache({ ttl: 60 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 10, 20);
      const [trendingJobs, trendingSearches] = await Promise.all([
        getTrendingJobs(limit),
        getTrendingSearches(limit),
      ]);

      // Enrich trending jobs with basic info
      const jobIds = trendingJobs.map((t) => t.jobId);
      const jobs =
        jobIds.length > 0
          ? await prisma.jobPost.findMany({
              where: { id: { in: jobIds }, status: JobStatus.OPEN },
              select: {
                id: true,
                title: true,
                location: true,
                type: true,
                company: { select: { companyName: true, logo: true } },
              },
            })
          : [];
      const jobMap = new Map(jobs.map((j) => [j.id, j]));

      const enrichedJobs = trendingJobs
        .map((t) => {
          const job = jobMap.get(t.jobId);
          if (!job) return null;
          return { ...job, viewCount: t.score };
        })
        .filter(Boolean);

      res.status(200).json({
        status: 'success',
        data: { trendingJobs: enrichedJobs, trendingSearches },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ───────────────────────────────────────────────────────────────────────
// Public job-board + company-directory surfaces (added Phase 2 of the
// Public Jobs + Companies plan). Optional auth so authenticated users
// see the same surfaces without the guest-result soft-wall, and IP
// rate-limit so anonymous callers can't DDoS the search backend.
// ───────────────────────────────────────────────────────────────────────

router.get(
  '/jobs',
  publicLimiter,
  optionalAuth,
  etagCache({ ttl: 60, publicCdnCache: true }),
  // Cache key fragments by auth-state bucket — guests see the
  // 30-result soft-walled response, authed users see the uncapped
  // version. Without this fragment a guest could pull an auth-user's
  // cached uncapped response (and vice versa).
  cache({
    ttl: 60,
    keyGenerator: (req) => {
      const isAuthed = !!(req as any).user?.id;
      return `${req.originalUrl}::a${isAuthed ? '1' : '0'}`;
    },
  }),
  publicCtrl.searchJobs
);
router.get(
  '/jobs/:slug',
  publicLimiter,
  optionalAuth,
  etagCache({ ttl: 300, publicCdnCache: true }),
  cache({ ttl: 300 }),
  publicCtrl.getJobBySlug
);
router.get(
  '/companies',
  publicLimiter,
  optionalAuth,
  etagCache({ ttl: 60, publicCdnCache: true }),
  cache({
    ttl: 60,
    keyGenerator: (req) => {
      const isAuthed = !!(req as any).user?.id;
      return `${req.originalUrl}::a${isAuthed ? '1' : '0'}`;
    },
  }),
  publicCtrl.searchCompanies
);
// IMPORTANT: this MUST stay above `/companies/:slug` — Express matches
// routes in declaration order, and `:slug` would otherwise swallow the
// literal `featured` path (returning a 404 from getCompanyBySlug).
// Section 3 of the homepage: featured companies, ranked by recent
// posting activity. Cache-keyed identically to the slow query.
router.get(
  '/companies/featured',
  publicLimiter,
  etagCache({ ttl: 30 * 60, publicCdnCache: true }),
  cache({ ttl: 30 * 60 }),
  publicStatsCtrl.featuredCompanies
);
router.get(
  '/companies/:slug',
  publicLimiter,
  optionalAuth,
  etagCache({ ttl: 300, publicCdnCache: true }),
  cache({ ttl: 300 }),
  publicCtrl.getCompanyBySlug
);
// Filterable + paginated jobs feed for the Jobs tab on the company
// detail page. Shorter TTL since this drives interactive filter UX.
router.get(
  '/companies/:slug/jobs',
  publicLimiter,
  optionalAuth,
  etagCache({ ttl: 60, publicCdnCache: true }),
  cache({ ttl: 60 }),
  publicCtrl.getCompanyJobsBySlug
);

// ─── Search history (guest + auth) ─────────────────────────────────────
// Fed by the chip carousel on the homepage hero, listing pages, and
// candidate dashboard. Migration endpoint runs on login to promote
// guest sessions into the user's bound history.
router.get('/search-history', publicLimiter, optionalAuth, searchHistoryCtrl.list);
router.post('/search-history', publicLimiter, optionalAuth, searchHistoryCtrl.record);
router.delete('/search-history/:id', publicLimiter, optionalAuth, searchHistoryCtrl.remove);
router.post('/search-history/migrate', protect, searchHistoryCtrl.migrate);

// Aggregate popular searches across all owners — used by the sitemap
// popular-aggregates shard. Cached for 24h since it's a heavy GROUP BY.
router.get(
  '/search-aggregates',
  publicLimiter,
  etagCache({ ttl: 24 * 60 * 60, publicCdnCache: true }),
  cache({ ttl: 24 * 60 * 60 }),
  searchHistoryCtrl.aggregates
);

// Per-dataset newest-updatedAt, consumed by the sitemap index to stamp each
// child sitemap with a real <lastmod>. Cheap (indexed MAX per dataset) and
// cached for 10 minutes to match the sitemap index's own revalidate window.
router.get(
  '/sitemap-lastmod',
  publicLimiter,
  etagCache({ ttl: 600, publicCdnCache: true }),
  cache({ ttl: 600 }),
  publicStatsCtrl.sitemapLastmods
);

// ─── Curated listings (mega-menu + footer + SEO landings) ──────────────
router.get(
  '/curated/menu',
  publicLimiter,
  etagCache({ ttl: 600, publicCdnCache: true }),
  cache({ ttl: 600 }),
  curatedCtrl.listAllForMenu
);
router.get(
  '/curated/footer',
  publicLimiter,
  etagCache({ ttl: 600, publicCdnCache: true }),
  cache({ ttl: 600 }),
  curatedCtrl.listForFooter
);
router.get(
  '/curated/by-slug/:slug',
  publicLimiter,
  etagCache({ ttl: 300, publicCdnCache: true }),
  cache({ ttl: 300 }),
  curatedCtrl.getBySlug
);
router.get(
  '/curated/:type',
  publicLimiter,
  etagCache({ ttl: 600, publicCdnCache: true }),
  cache({ ttl: 600 }),
  curatedCtrl.listByType
);

// ─── Homepage discovery widgets — public-stats aggregates ───────────────
// Section 2: per-COMPANY_CATEGORY hiring stats (totals + sample logos).
router.get(
  '/company-categories/stats',
  publicLimiter,
  etagCache({ ttl: 60 * 60, publicCdnCache: true }),
  cache({ ttl: 60 * 60 }),
  publicStatsCtrl.companyCategoryStats
);
// Section 3 (/companies/featured) is declared earlier in this file —
// it must sit above the `/companies/:slug` route or Express matches the
// parameterized handler first and the homepage section returns empty.
// Section 4: per-role public-job counts (batched).
router.get(
  '/role-counts',
  publicLimiter,
  etagCache({ ttl: 30 * 60, publicCdnCache: true }),
  cache({ ttl: 30 * 60 }),
  publicStatsCtrl.roleCounts
);

export default router;
