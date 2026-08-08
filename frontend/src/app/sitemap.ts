import { execSync } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';
import type { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://hireadda.in';

/**
 * Build-time timestamp. Used as the fallback when no git or filesystem
 * history is available for a page.
 */
const LAST_BUILD = new Date();

/**
 * Per-page lastModified resolution order:
 *   1. Git commit timestamp — `git log -1 --format=%cI <file>` gives real
 *      content-change history. Works during CI builds that check out the
 *      full repo; may fail in stripped Docker images (no `.git`).
 *   2. Filesystem mtime — `statSync(file).mtime`. Useful in dev; not
 *      reliable under Docker COPY which resets mtimes at build time.
 *   3. Build timestamp — `LAST_BUILD`. Last-resort fallback when neither
 *      of the above is available.
 *
 * Results are memoised — each page file is probed once per process.
 */
const lastModCache = new Map<string, Date>();

function getPageLastModified(pageFile: string): Date {
  const cached = lastModCache.get(pageFile);
  if (cached) return cached;

  const absPath = path.join(process.cwd(), pageFile);

  // Try git first — real content-change history.
  try {
    const iso = execSync(`git log -1 --format=%cI -- "${absPath}"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (iso) {
      const d = new Date(iso);
      if (!Number.isNaN(d.getTime())) {
        lastModCache.set(pageFile, d);
        return d;
      }
    }
  } catch {
    // git not available (stripped Docker image, non-git checkout) — fall through.
  }

  // Fallback: filesystem mtime.
  try {
    const stat = statSync(absPath);
    lastModCache.set(pageFile, stat.mtime);
    return stat.mtime;
  } catch {
    // File not found (shouldn't happen for declared entries) — fall through.
  }

  lastModCache.set(pageFile, LAST_BUILD);
  return LAST_BUILD;
}

/**
 * Supported languages for hreflang alternates.
 *
 * Currently single-language (en-IN) — no content is translated yet. The
 * `x-default` entry is the fallback Google uses when no locale matches,
 * and is pointed at the canonical English URL.
 *
 * When additional locales ship (e.g. hi-IN, ta-IN), add them here and
 * they'll automatically appear as `<xhtml:link rel="alternate">` on every
 * sitemap entry.
 */
const LANGUAGES: Record<string, string> = {
  'en-IN': BASE_URL,
  'x-default': BASE_URL,
};

type ChangeFreq = NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>;

interface SitemapEntry {
  path: string;
  /** Source file used to derive content-specific lastModified (relative to cwd). */
  source: string;
  changeFrequency: ChangeFreq;
  priority: number;
  /** Image URL(s) for image sitemaps — surfaces page imagery in Google Images. */
  images?: string[];
  /** Explicit override — skips the git/fs lookup entirely. */
  lastModified?: Date;
}

/**
 * All pages registered here are public, indexable, and contain non-transient
 * content. Authenticated pages, transient endpoints (share target, offline
 * fallback), and planned-but-not-yet-launched pages (public jobs, public
 * companies) are intentionally excluded to preserve crawl trust — a sitemap
 * pointing to 404s erodes it.
 *
 * `source` points at the Next.js page file so `lastModified` reflects when
 * the content (not the deploy) was last changed. Edit `src/app/privacy/page.tsx`
 * and only that entry's timestamp bumps; other pages keep their old dates.
 */
const STATIC_ENTRIES: SitemapEntry[] = [
  // Core marketing pages
  {
    path: '/',
    source: 'src/app/page.tsx',
    changeFrequency: 'daily',
    priority: 1.0,
    images: ['/images/og-home.jpg', '/icons/logo.png'],
  },
  // Public job board + company directory — top-level listing pages.
  // These are SEPARATE from the dynamic /sitemap/2..K shards (which
  // hold individual /jobs/{slug} + /companies/{slug} URLs). The
  // listing-page index is high priority because it's the primary
  // entry surface for "jobs in india" / "companies hiring" queries.
  {
    path: '/jobs',
    source: 'src/app/jobs/page.tsx',
    changeFrequency: 'daily',
    priority: 0.9,
    images: ['/images/og-home.jpg'],
  },
  {
    path: '/companies',
    source: 'src/app/companies/page.tsx',
    changeFrequency: 'daily',
    priority: 0.9,
    images: ['/images/og-home.jpg'],
  },
  // Standalone review-write entry — open form, no company prefill.
  {
    path: '/reviews/write',
    source: 'src/app/reviews/write/page.tsx',
    changeFrequency: 'monthly',
    priority: 0.5,
  },
  { path: '/about', source: 'src/app/about/page.tsx', changeFrequency: 'monthly', priority: 0.8 },
  {
    path: '/contact',
    source: 'src/app/contact/page.tsx',
    changeFrequency: 'monthly',
    priority: 0.7,
  },
  { path: '/help', source: 'src/app/help/page.tsx', changeFrequency: 'weekly', priority: 0.7 },

  // Auth entry points — kept in sitemap so link-preview crawlers can render
  // previews, but priority is intentionally lowered: these pages are thin
  // (no SEO-valuable content), and over-prioritising them wastes crawl budget.
  {
    path: '/auth/login',
    source: 'src/app/auth/login/page.tsx',
    changeFrequency: 'monthly',
    priority: 0.5,
  },
  {
    path: '/auth/login/candidate',
    source: 'src/app/auth/login/candidate/page.tsx',
    changeFrequency: 'monthly',
    priority: 0.5,
  },
  {
    path: '/auth/login/employer',
    source: 'src/app/auth/login/employer/page.tsx',
    changeFrequency: 'monthly',
    priority: 0.5,
  },
  {
    path: '/auth/register',
    source: 'src/app/auth/register/page.tsx',
    changeFrequency: 'monthly',
    priority: 0.5,
  },
  {
    path: '/auth/register/candidate',
    source: 'src/app/auth/register/candidate/page.tsx',
    changeFrequency: 'monthly',
    priority: 0.5,
  },
  {
    path: '/auth/register/employer',
    source: 'src/app/auth/register/employer/page.tsx',
    changeFrequency: 'monthly',
    priority: 0.5,
  },
  {
    path: '/auth/forgot-password',
    source: 'src/app/auth/forgot-password/page.tsx',
    changeFrequency: 'yearly',
    priority: 0.2,
  },

  // Human-readable site map page. URL is `/site-map` (dashed) — undashed
  // would collide with the `sitemap.xml` metadata file.
  {
    path: '/site-map',
    source: 'src/app/site-map/page.tsx',
    changeFrequency: 'monthly',
    priority: 0.5,
  },

  // Pricing pages — high priority, business-critical landing surfaces.
  // The audience-split pages (/pricing/employer, /pricing/candidate) are
  // ranked alongside the catch-all so each gets full SEO coverage.
  {
    path: '/pricing',
    source: 'src/app/pricing/page.tsx',
    changeFrequency: 'weekly',
    priority: 0.8,
  },
  {
    path: '/pricing/employer',
    source: 'src/app/pricing/employer/page.tsx',
    changeFrequency: 'weekly',
    priority: 0.8,
  },
  {
    path: '/pricing/candidate',
    source: 'src/app/pricing/candidate/page.tsx',
    changeFrequency: 'weekly',
    priority: 0.8,
  },

  // Per-plan detail pages — slugs are stable (defined by seed-plans.ts).
  // Ranked slightly below the pricing index so the index pages remain the
  // primary landing surface for "<role> pricing" queries.
  {
    path: '/pricing/candidate-premium',
    source: 'src/app/pricing/[slug]/page.tsx',
    changeFrequency: 'monthly',
    priority: 0.6,
  },
  {
    path: '/pricing/employer-free',
    source: 'src/app/pricing/[slug]/page.tsx',
    changeFrequency: 'monthly',
    priority: 0.6,
  },
  {
    path: '/pricing/employer-standard',
    source: 'src/app/pricing/[slug]/page.tsx',
    changeFrequency: 'monthly',
    priority: 0.6,
  },
  {
    path: '/pricing/employer-premium',
    source: 'src/app/pricing/[slug]/page.tsx',
    changeFrequency: 'monthly',
    priority: 0.6,
  },
  {
    path: '/pricing/cvdb-lite',
    source: 'src/app/pricing/[slug]/page.tsx',
    changeFrequency: 'monthly',
    priority: 0.6,
  },
  {
    path: '/pricing/cvdb-pro',
    source: 'src/app/pricing/[slug]/page.tsx',
    changeFrequency: 'monthly',
    priority: 0.6,
  },
  {
    path: '/pricing/cvdb-enterprise',
    source: 'src/app/pricing/[slug]/page.tsx',
    changeFrequency: 'monthly',
    priority: 0.6,
  },
  {
    path: '/pricing/assisted-hiring',
    source: 'src/app/pricing/[slug]/page.tsx',
    changeFrequency: 'monthly',
    priority: 0.6,
  },
  {
    path: '/pricing/vendor-connect',
    source: 'src/app/pricing/[slug]/page.tsx',
    changeFrequency: 'monthly',
    priority: 0.6,
  },

  // Enterprise "Contact Sales" quote form — public lead-capture surface
  // sits under /billing/* (which is otherwise crawler-disallowed). The
  // explicit `Allow: /billing/quote` exception in robots.txt opens just
  // this single URL while keeping the rest of the billing dashboard
  // private. Priority matched to /contact since both are conversion
  // surfaces for high-intent enterprise visitors.
  {
    path: '/billing/quote',
    source: 'src/app/billing/quote/page.tsx',
    changeFrequency: 'monthly',
    priority: 0.7,
  },

  // Public vendor directory — lists employers who hold the VENDOR_CONNECT
  // plan (vendor is an employer capability, not a separate role). The index
  // page lives here; individual /vendors/[slug] profile pages are emitted
  // by the dynamic vendors shard below.
  {
    path: '/vendors',
    source: 'src/app/vendors/page.tsx',
    changeFrequency: 'weekly',
    priority: 0.7,
  },

  // Legal / policy pages — required for compliance + app store approval
  {
    path: '/privacy',
    source: 'src/app/privacy/page.tsx',
    changeFrequency: 'yearly',
    priority: 0.3,
  },
  { path: '/terms', source: 'src/app/terms/page.tsx', changeFrequency: 'yearly', priority: 0.3 },
  {
    path: '/cookie-policy',
    source: 'src/app/cookie-policy/page.tsx',
    changeFrequency: 'yearly',
    priority: 0.3,
  },
  {
    path: '/refund-policy',
    source: 'src/app/refund-policy/page.tsx',
    changeFrequency: 'yearly',
    priority: 0.3,
  },
  {
    path: '/accessibility',
    source: 'src/app/accessibility/page.tsx',
    changeFrequency: 'yearly',
    priority: 0.3,
  },
  {
    path: '/disclaimer',
    source: 'src/app/disclaimer/page.tsx',
    changeFrequency: 'yearly',
    priority: 0.3,
  },
];

/**
 * Sitemap shards.
 *
 * Next.js's `generateSitemaps` returns a list of shard identifiers, and the
 * default `sitemap()` function is invoked once per shard. For each shard a
 * separate `/sitemap/{id}.xml` is generated, and Next.js auto-creates the
 * top-level `/sitemap.xml` index that references them.
 *
 * Today we have one shard (`static`) for the 13 marketing/legal/auth pages.
 * When dynamic content ships, add further shards:
 *
 *   - `jobs-0`, `jobs-1`, … (50k URLs per shard — the sitemap spec limit)
 *   - `companies-0`, `companies-1`, …
 *
 * Each dynamic shard pulls its IDs + updatedAt from the backend, honouring
 * the per-entry `lastModified` for granular freshness signals (instead of
 * a blanket build-time stamp).
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap#generating-multiple-sitemaps
 * @see https://www.sitemaps.org/protocol.html
 */
/**
 * Sitemap-shard map.
 *
 *   0       = static (marketing/legal/auth/pricing/site-map)
 *   1       = curated landings (cities, categories, departments,
 *             qualifications, collections — both job-side and company-side)
 *   2..K    = jobs (50k URLs/shard, paginated by id ASC)
 *   K+1..N  = companies (50k URLs/shard)
 *   N+1     = cartesian (CuratedListing × top cities × exp buckets)
 *   N+2     = popular role×city aggregates (from SearchHistory hits)
 *   N+3     = company-reviews (one URL per company with ≥1 approved review)
 *   N+4     = vendors (per-vendor public profile pages)
 *   N+5     = help-articles (per-article URLs under /help/{slug})
 *   N+6     = news-articles (Google News sitemap candidate)
 *
 * Constants, shard counters, and ID arithmetic live in
 * `@/lib/sitemap-shards` so this file and `app/sitemap-index.xml/route.ts`
 * share a single source of truth — adding a new shard there propagates
 * to both consumers without code-level drift.
 */
import { JOBS_SHARD_BASE, SHARD_PAGE_SIZE, getShardIds, getShardMap } from '@/lib/sitemap-shards';

export async function generateSitemaps() {
  const ids = await getShardIds();
  return ids.map((id) => ({ id }));
}

interface ShardItem {
  url: string;
  lastModified?: Date;
  changeFrequency: ChangeFreq;
  priority: number;
  /**
   * Optional image URLs surfaced via the sitemap-image namespace
   * (`<image:image>` per Google's image sitemap spec). Next.js's
   * `MetadataRoute.Sitemap` `images` field serialises these directly.
   * Drives Google Images / Bing visual-search discovery for company
   * logos, job-posting thumbnails, etc.
   */
  images?: string[];
}

async function fetchCuratedSitemapItems(): Promise<ShardItem[]> {
  const apiBase =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:5000/api/v1';
  const items: ShardItem[] = [];
  try {
    const res = await fetch(`${apiBase}/public/curated/menu`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return items;
    const body = await res.json();
    const grouped: Record<
      string,
      Array<{ slug: string; type: string; updatedAt: string }>
    > = body?.data ?? {};
    const all = Object.values(grouped).flat();
    for (const item of all) {
      const path = curatedSlugToPath(item.slug, item.type);
      if (path) {
        items.push({
          url: `${BASE_URL}${path}`,
          lastModified: item.updatedAt ? new Date(item.updatedAt) : undefined,
          changeFrequency: 'weekly',
          priority: 0.6,
        });
      }
    }
  } catch {
    /* ignore — curated section will be empty for this build */
  }
  return items;
}

function curatedSlugToPath(slug: string, type: string): string | null {
  switch (type) {
    case 'JOB_LOCATION':
      return `/jobs/in/${slug.replace(/^jobs-in-/, '')}`;
    case 'JOB_CATEGORY':
      return `/jobs/category/${slug.replace(/-jobs$/, '')}`;
    case 'JOB_DEPARTMENT':
      // Strip both the `dept-` prefix (added to avoid collision with
      // JOB_CATEGORY slugs in the seed) AND the `-jobs` suffix.
      return `/jobs/department/${slug.replace(/^dept-/, '').replace(/-jobs$/, '')}`;
    case 'JOB_QUALIFICATION':
      return `/jobs/qualification/${slug.replace(/-jobs$/, '')}`;
    case 'JOB_DEMAND':
      return `/jobs/${slug}`;
    case 'JOB_COLLECTION':
      return `/jobs/collection/${slug}`;
    case 'COMPANY_CATEGORY':
      return `/companies/category/${slug.replace(/^companies-/, '')}`;
    case 'COMPANY_COLLECTION':
      return `/companies/collection/${slug}`;
    // Companies-by-city: maps COMPANY_LOCATION curated entries to the
    // /companies/in/{city} surface. The route exists at
    // app/companies/in/[city]/page.tsx with full JSON-LD.
    case 'COMPANY_LOCATION':
      return `/companies/in/${slug.replace(/^companies-in-/, '').replace(/^companies-/, '')}`;
    // Companies-by-industry: maps COMPANY_INDUSTRY curated entries to
    // /companies/industry/{ind}. The route exists at
    // app/companies/industry/[ind]/page.tsx.
    case 'COMPANY_INDUSTRY':
      return `/companies/industry/${slug.replace(/^companies-industry-/, '').replace(/^companies-/, '')}`;
    default:
      return null;
  }
}

async function fetchJobsShard(shardIndex: number): Promise<ShardItem[]> {
  const apiBase =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:5000/api/v1';
  const items: ShardItem[] = [];
  let page = 1;
  const targetCount = SHARD_PAGE_SIZE;
  const startOffset = shardIndex * SHARD_PAGE_SIZE;
  // Pull pages until we've collected `targetCount` items for this shard.
  // Wrapped in try/catch so a backend outage during build (CI/Docker)
  // emits an empty shard instead of crashing the entire Next.js export.
  try {
    while (items.length < targetCount) {
      const res = await fetch(
        `${apiBase}/public/jobs?limit=100&page=${page + Math.floor(startOffset / 100)}`,
        { next: { revalidate: 600 } },
      );
      if (!res.ok) break;
      const body = await res.json();
      const rows: Array<{
        slug?: string;
        updatedAt?: string;
        company?: { logo?: string | null };
      }> = body?.data?.items ?? [];
      if (rows.length === 0) break;
      for (const r of rows) {
        if (!r.slug) continue;
        const logo = r.company?.logo;
        items.push({
          url: `${BASE_URL}/jobs/${r.slug}`,
          lastModified: r.updatedAt ? new Date(r.updatedAt) : undefined,
          changeFrequency: 'weekly',
          priority: 0.7,
          // Surface the company logo as a sitemap image so Google
          // Images / Bing visual-search index the brand-mark on every
          // job page. Skipped when the company has no logo.
          ...(logo ? { images: [logo] } : {}),
        });
        if (items.length >= targetCount) break;
      }
      if (rows.length < 100) break;
      page += 1;
    }
  } catch {
    /* ignore — empty shard if backend unavailable at build time */
  }
  return items;
}

/**
 * Cartesian-combos generator — emits `{role}-jobs-in-{city}` and
 * `{role}-jobs-for-{n}-years-experience` URL forms for every
 * combination of:
 *   - CuratedListing entries (JOB_CATEGORY + JOB_DEMAND + JOB_DEPARTMENT)
 *   - Top cities (JOB_LOCATION curated entries)
 *   - 5 experience buckets (0, 2, 5, 8, 12 years +)
 *
 * Hard-capped at 50k URLs per shard (sitemap spec limit). Skips combos
 * that would duplicate canonical curated landings already emitted by
 * shard 1 (curated).
 */
async function fetchCartesianComboItems(): Promise<ShardItem[]> {
  const apiBase =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:5000/api/v1';

  const items: ShardItem[] = [];
  try {
    const res = await fetch(`${apiBase}/public/curated/menu`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return items;
    const body = await res.json();
    const grouped: Record<string, Array<{ slug: string; type: string }>> = body?.data ?? {};

    const roles = [
      ...(grouped.JOB_CATEGORY ?? []),
      ...(grouped.JOB_DEMAND ?? []),
      ...(grouped.JOB_DEPARTMENT ?? []),
    ];
    const cities = (grouped.JOB_LOCATION ?? []).slice(0, 50);
    const expBuckets = [0, 2, 5, 8, 12]; // 5 buckets matching plan §14.

    for (const role of roles) {
      // Strip well-known suffixes so the URL slug is clean.
      const r = role.slug.replace(/-jobs$/, '').replace(/^jobs-in-/, '');
      // role × city
      for (const city of cities) {
        const c = city.slug.replace(/^jobs-in-/, '');
        items.push({
          url: `${BASE_URL}/jobs/${r}-jobs-in-${c}`,
          changeFrequency: 'weekly',
          priority: 0.55,
        });
        if (items.length >= SHARD_PAGE_SIZE) return items;
      }
      // role × exp
      for (const yrs of expBuckets) {
        items.push({
          url: `${BASE_URL}/jobs/${r}-jobs-for-${yrs}-years-experience`,
          changeFrequency: 'weekly',
          priority: 0.5,
        });
        if (items.length >= SHARD_PAGE_SIZE) return items;
      }
    }
  } catch {
    /* curated API down — return whatever we have collected */
  }
  return items;
}

/**
 * Popular role×city aggregates from SearchHistory. Returns empty when
 * the table has no data; once accrued, returns the top 5,000 most-
 * frequent role+city queries as crawl-ready URLs.
 *
 * The aggregates endpoint must exist server-side. Today there is no
 * such endpoint — when SearchHistory accrues data we'll add a
 * `/api/v1/public/search-aggregates` route. Until then, this shard
 * is intentionally empty (still emitted so Googlebot caches the path
 * and re-crawls when content arrives).
 */
async function fetchPopularAggregateItems(): Promise<ShardItem[]> {
  const apiBase =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:5000/api/v1';
  try {
    const res = await fetch(`${apiBase}/public/search-aggregates?limit=5000`, {
      next: { revalidate: 7 * 24 * 60 * 60 },
    });
    if (!res.ok) return [];
    const body = await res.json();
    const rows: Array<{ url: string; updatedAt?: string }> = body?.data?.items ?? [];
    return rows.map((r) => ({
      url: r.url.startsWith('http') ? r.url : `${BASE_URL}${r.url}`,
      lastModified: r.updatedAt ? new Date(r.updatedAt) : undefined,
      changeFrequency: 'weekly' as ChangeFreq,
      priority: 0.55,
    }));
  } catch {
    return [];
  }
}

async function fetchCompaniesShard(shardIndex: number): Promise<ShardItem[]> {
  const apiBase =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:5000/api/v1';
  const items: ShardItem[] = [];
  let page = 1;
  const targetCount = SHARD_PAGE_SIZE;
  const startOffset = shardIndex * SHARD_PAGE_SIZE;
  // Wrapped in try/catch so a backend outage during build (CI/Docker)
  // emits an empty shard instead of crashing the entire Next.js export.
  try {
    while (items.length < targetCount) {
      const res = await fetch(
        `${apiBase}/public/companies?limit=100&page=${page + Math.floor(startOffset / 100)}`,
        { next: { revalidate: 600 } },
      );
      if (!res.ok) break;
      const body = await res.json();
      const rows: Array<{
        slug?: string;
        updatedAt?: string;
        logo?: string | null;
        coverImage?: string | null;
      }> = body?.data?.items ?? [];
      if (rows.length === 0) break;
      for (const r of rows) {
        if (!r.slug) continue;
        // Surface the brand logo + cover image as sitemap-image entries.
        // Google Images extracts these for visual-search and the
        // knowledge-panel hero. Both are optional — skipped when missing.
        const images = [r.logo, r.coverImage].filter(
          (i): i is string => typeof i === 'string' && i.length > 0,
        );
        items.push({
          url: `${BASE_URL}/companies/${r.slug}`,
          lastModified: r.updatedAt ? new Date(r.updatedAt) : undefined,
          changeFrequency: 'weekly',
          priority: 0.6,
          ...(images.length > 0 ? { images } : {}),
        });
        if (items.length >= targetCount) break;
      }
      if (rows.length < 100) break;
      page += 1;
    }
  } catch {
    /* ignore — empty shard if backend unavailable at build time */
  }
  return items;
}

/**
 * Companies-with-reviews shard — emits `/companies/{slug}/reviews`
 * for every company that has ≥1 approved review. Backend cursor-paged
 * so the shard cleanly fits the 50k spec limit.
 */
async function fetchCompanyReviewsShardItems(): Promise<ShardItem[]> {
  const apiBase =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:5000/api/v1';
  const items: ShardItem[] = [];
  try {
    let cursor: string | null = null;
    while (items.length < 50_000) {
      const url = `${apiBase}/public/companies-with-reviews-sitemap?limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const res = await fetch(url, { next: { revalidate: 600 } });
      if (!res.ok) break;
      const body = await res.json();
      const rows: Array<{ slug: string; refreshedAt: string }> = body?.data?.items ?? [];
      for (const r of rows) {
        if (!r.slug) continue;
        items.push({
          url: `${BASE_URL}/companies/${r.slug}/reviews`,
          lastModified: r.refreshedAt ? new Date(r.refreshedAt) : undefined,
          changeFrequency: 'weekly',
          priority: 0.6,
        });
        if (items.length >= 50_000) break;
      }
      const next = body?.data?.cursor as string | null | undefined;
      if (!next) break;
      cursor = next;
    }
  } catch {
    /* ignore — shard renders empty if backend is unavailable */
  }
  return items;
}

function buildAlternates(path: string) {
  const languages: Record<string, string> = {};
  for (const [lang, origin] of Object.entries(LANGUAGES)) {
    languages[lang] = `${origin}${path}`;
  }
  return { languages };
}

/**
 * Enterprise-grade sitemap generator.
 *
 * Notes:
 *   - Declarative `SitemapEntry[]` + single generator — no hand-maintained
 *     duplication.
 *   - Each entry emits image references (Google Images / Bing visual search)
 *     where relevant.
 *   - Each entry emits hreflang alternates so locale-specific versions
 *     automatically get indexed in their markets when they launch.
 *   - `lastModified` defaults to build time (uniform freshness per deploy);
 *     entries with known update dates can override.
 *   - Shard-aware via `generateSitemaps()` — ready to slot in dynamic
 *     jobs / companies sitemaps without restructuring.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 * @see https://developers.google.com/search/docs/specialty/international/localized-versions
 */
function staticShardEntries(): MetadataRoute.Sitemap {
  return STATIC_ENTRIES.map((entry) => ({
    url: `${BASE_URL}${entry.path}`,
    lastModified: entry.lastModified ?? getPageLastModified(entry.source),
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
    alternates: buildAlternates(entry.path),
    ...(entry.images && entry.images.length > 0
      ? { images: entry.images.map((src) => `${BASE_URL}${src}`) }
      : {}),
  }));
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  // Resolve the Next.js 16 id-as-Promise quirk defensively.
  const resolvedId =
    typeof id === 'object' && id !== null && 'then' in (id as object)
      ? Number(await (id as unknown as Promise<number>))
      : Number(id);

  if (resolvedId === 0) return staticShardEntries();

  const map = await getShardMap();

  // Single mapper — propagates url, lastModified, change-freq, priority,
  // alternates AND `images` (when present) for every dynamic shard.
  // Without this, Next.js drops the `images` field and Google Image
  // search misses every company logo in the catalogue.
  const toEntry = (it: ShardItem) => ({
    url: it.url,
    lastModified: it.lastModified,
    changeFrequency: it.changeFrequency,
    priority: it.priority,
    alternates: buildAlternates(it.url.replace(BASE_URL, '')),
    ...(it.images && it.images.length > 0 ? { images: it.images } : {}),
  });

  if (resolvedId === map.curatedId) {
    const items = await fetchCuratedSitemapItems();
    return items.map(toEntry);
  }

  // Jobs shards.
  if (resolvedId >= JOBS_SHARD_BASE && resolvedId < map.companiesShardBase) {
    const shardIndex = resolvedId - JOBS_SHARD_BASE;
    const items = await fetchJobsShard(shardIndex);
    return items.map(toEntry);
  }

  // Companies shards.
  if (
    resolvedId >= map.companiesShardBase &&
    resolvedId < map.companiesShardBase + map.companiesShardCount
  ) {
    const shardIndex = resolvedId - map.companiesShardBase;
    const items = await fetchCompaniesShard(shardIndex);
    return items.map(toEntry);
  }

  // Cartesian curated × cities × exp shard.
  if (resolvedId === map.cartesianShardId) {
    const items = await fetchCartesianComboItems();
    return items.map(toEntry);
  }

  // Popular role×city aggregates from SearchHistory. Returns [] when
  // the aggregates endpoint isn't yet available — Googlebot still picks
  // up the empty shard and re-crawls when content arrives.
  if (resolvedId === map.popularAggregatesShardId) {
    const items = await fetchPopularAggregateItems();
    return items.map(toEntry);
  }

  // Company-reviews shard — `/companies/{slug}/reviews` for every
  // company with ≥1 approved review.
  if (resolvedId === map.companyReviewsShardId) {
    const items = await fetchCompanyReviewsShardItems();
    return items.map(toEntry);
  }

  // Vendors shard — public vendor profile pages.
  if (resolvedId === map.vendorsShardId) {
    const items = await fetchVendorsShardItems();
    return items.map(toEntry);
  }

  // Help-articles shard — public help articles under /help/{slug}.
  if (resolvedId === map.helpArticlesShardId) {
    const items = await fetchHelpArticlesShardItems();
    return items.map(toEntry);
  }

  // News-articles shard — Google News candidate. Empty until /news ships.
  if (resolvedId === map.newsArticlesShardId) {
    const items = await fetchNewsArticlesShardItems();
    return items.map(toEntry);
  }

  // Unknown shard id — return empty so the sitemap remains valid.
  return [];
}

/**
 * Vendors shard — public vendor profile pages. Pulled from the public
 * vendor-search endpoint; capped at 50k per the sitemap spec.
 */
async function fetchVendorsShardItems(): Promise<ShardItem[]> {
  const apiBase =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:5000/api/v1';
  const items: ShardItem[] = [];
  try {
    let page = 1;
    while (items.length < 50_000) {
      const res = await fetch(`${apiBase}/vendors?limit=100&page=${page}`, {
        next: { revalidate: 600 },
      });
      if (!res.ok) break;
      const body = await res.json();
      const rows: Array<{ slug?: string; updatedAt?: string }> =
        body?.data?.items ?? body?.data?.vendors ?? [];
      if (rows.length === 0) break;
      for (const r of rows) {
        if (!r.slug) continue;
        items.push({
          url: `${BASE_URL}/vendors/${r.slug}`,
          lastModified: r.updatedAt ? new Date(r.updatedAt) : undefined,
          changeFrequency: 'weekly',
          priority: 0.5,
        });
        if (items.length >= 50_000) break;
      }
      if (rows.length < 100) break;
      page += 1;
    }
  } catch {
    /* ignore — empty shard if backend unavailable */
  }
  return items;
}

/**
 * Help-articles shard — public help/{slug} pages. Empty array on
 * failure so the sitemap remains spec-valid.
 */
async function fetchHelpArticlesShardItems(): Promise<ShardItem[]> {
  const apiBase =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:5000/api/v1';
  const items: ShardItem[] = [];
  try {
    const res = await fetch(`${apiBase}/public/help-articles?limit=500`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return items;
    const body = await res.json();
    const rows: Array<{ slug?: string; updatedAt?: string }> =
      body?.data?.items ?? body?.data ?? [];
    for (const r of rows) {
      if (!r.slug) continue;
      items.push({
        url: `${BASE_URL}/help/${r.slug}`,
        lastModified: r.updatedAt ? new Date(r.updatedAt) : undefined,
        changeFrequency: 'monthly',
        priority: 0.5,
      });
    }
  } catch {
    /* ignore */
  }
  return items;
}

/**
 * News-articles shard — Google News sitemap candidate. Empty until a
 * /news or /blog surface ships; emitted regardless so Googlebot has a
 * stable shard URL waiting.
 */
async function fetchNewsArticlesShardItems(): Promise<ShardItem[]> {
  const apiBase =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:5000/api/v1';
  const items: ShardItem[] = [];
  try {
    const res = await fetch(`${apiBase}/public/news?limit=500`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return items;
    const body = await res.json();
    const rows: Array<{ slug?: string; updatedAt?: string }> =
      body?.data?.items ?? body?.data ?? [];
    for (const r of rows) {
      if (!r.slug) continue;
      items.push({
        url: `${BASE_URL}/news/${r.slug}`,
        lastModified: r.updatedAt ? new Date(r.updatedAt) : undefined,
        changeFrequency: 'daily',
        priority: 0.6,
      });
    }
  } catch {
    /* ignore */
  }
  return items;
}
