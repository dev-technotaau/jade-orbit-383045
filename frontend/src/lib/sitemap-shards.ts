/**
 * Single source of truth for the sitemap shard layout.
 *
 * Two files consume this module:
 *
 *   - `app/sitemap.ts`            → Next.js's `generateSitemaps()` +
 *                                    default `sitemap()` route handler.
 *                                    Picks the SHARD content per id.
 *   - `app/sitemap-index.xml/route.ts` → The canonical top-level
 *                                    `<sitemapindex>` (robots primary) that
 *                                    references every shard + the news sitemap.
 *
 * Before this module both files duplicated `SHARD_PAGE_SIZE`,
 * `JOBS_SHARD_BASE`, `fetchPublicCount`, and the entire shard-ID
 * computation. Any change to one file silently drifted from the other,
 * orphaning new shards from the sitemap index.
 *
 * @see https://www.sitemaps.org/protocol.html
 */

/** Sitemap-spec hard cap — 50,000 URLs per shard file. */
export const SHARD_PAGE_SIZE = 50_000;

/**
 * First numeric ID assigned to the jobs shard family. IDs 0 + 1 are
 * reserved for static + curated. Subsequent shard IDs are derived from
 * the dynamic counts so growing/shrinking the catalogue auto-rebases.
 */
export const JOBS_SHARD_BASE = 2;

/**
 * The complete per-shard map. Every consumer that needs to know "which
 * id belongs to which shard family" reads this single record.
 */
export interface ShardMap {
  staticIds: number[];
  curatedId: number;
  jobsShardCount: number;
  companiesShardBase: number;
  companiesShardCount: number;
  cartesianShardId: number;
  popularAggregatesShardId: number;
  companyReviewsShardId: number;
  vendorsShardId: number;
  helpArticlesShardId: number;
  newsArticlesShardId: number;
}

/**
 * Standalone sitemap files — live at the root of the site rather than
 * under the `/sitemap/{id}.xml` shard scheme. Currently just the
 * Google News sitemap, which uses a distinct XML namespace + 5-minute
 * refresh cadence so it can't share the shard layout.
 */
export const STANDALONE_SITEMAP_PATHS: ReadonlyArray<string> = ['/sitemap-news.xml'];

/**
 * Pull a public-API total count via the public listing endpoint. Used
 * to derive jobsShardCount / companiesShardCount.
 */
export async function fetchPublicCount(path: string): Promise<number> {
  const apiBase =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:5000/api/v1';
  try {
    const res = await fetch(`${apiBase}${path}?limit=1&page=1`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return 0;
    const body = await res.json();
    return Number(body?.data?.pagination?.total ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Module-level cache so two parallel imports (sitemap.ts + sitemap.xml
 * route handler) share the same shard map within a single Next.js
 * server process. Caching is keyed only on time — the underlying
 * counts come from the public API which is itself cached for 10min.
 */
let shardMapCache: { map: ShardMap; expires: number } | null = null;

const SHARD_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Compute the canonical shard map.
 *
 * The order below MUST match the consumer in `sitemap.ts`'s default
 * `sitemap()` function — adding a new shard requires:
 *   1. A new field on `ShardMap`
 *   2. A new ID assignment below
 *   3. A push into `getShardIds()` below
 *   4. A new branch in `sitemap.ts` default function
 *
 * The `sitemap-index.xml/route.ts` index automatically picks up the new ID
 * because it iterates `getShardIds()` directly.
 */
export async function getShardMap(): Promise<ShardMap> {
  if (shardMapCache && shardMapCache.expires > Date.now()) {
    return shardMapCache.map;
  }
  const [jobsTotal, companiesTotal] = await Promise.all([
    fetchPublicCount('/public/jobs'),
    fetchPublicCount('/public/companies'),
  ]);
  const jobsShardCount = Math.max(1, Math.ceil(jobsTotal / SHARD_PAGE_SIZE));
  const companiesShardBase = JOBS_SHARD_BASE + jobsShardCount;
  const companiesShardCount = Math.max(1, Math.ceil(companiesTotal / SHARD_PAGE_SIZE));
  const cartesianShardId = companiesShardBase + companiesShardCount;
  const popularAggregatesShardId = cartesianShardId + 1;
  const companyReviewsShardId = popularAggregatesShardId + 1;
  const vendorsShardId = companyReviewsShardId + 1;
  const helpArticlesShardId = vendorsShardId + 1;
  const newsArticlesShardId = helpArticlesShardId + 1;
  const map: ShardMap = {
    staticIds: [0],
    curatedId: 1,
    jobsShardCount,
    companiesShardBase,
    companiesShardCount,
    cartesianShardId,
    popularAggregatesShardId,
    companyReviewsShardId,
    vendorsShardId,
    helpArticlesShardId,
    newsArticlesShardId,
  };
  shardMapCache = { map, expires: Date.now() + SHARD_CACHE_TTL_MS };
  return map;
}

/**
 * Flat list of every shard ID, in render order. Both consumers
 * iterate this — sitemap.ts maps each to a `{id}` for Next.js's
 * `generateSitemaps()`, and sitemap-index.xml/route.ts maps each to a
 * `<sitemap>` index entry.
 */
export async function getShardIds(): Promise<number[]> {
  const m = await getShardMap();
  const ids: number[] = [];
  for (const id of m.staticIds) ids.push(id);
  ids.push(m.curatedId);
  for (let i = 0; i < m.jobsShardCount; i++) ids.push(JOBS_SHARD_BASE + i);
  for (let i = 0; i < m.companiesShardCount; i++) ids.push(m.companiesShardBase + i);
  ids.push(m.cartesianShardId);
  ids.push(m.popularAggregatesShardId);
  ids.push(m.companyReviewsShardId);
  ids.push(m.vendorsShardId);
  ids.push(m.helpArticlesShardId);
  ids.push(m.newsArticlesShardId);
  return ids;
}

/* ------------------------------------------------------------------ */
/* Per-shard <lastmod>                                                 */
/* ------------------------------------------------------------------ */

/**
 * Deploy stamp for content that only changes when we ship.
 *
 * Process start, not `new Date()` at call time. That matters: the sitemap index
 * revalidates every 10 minutes, and a `lastmod` recomputed per render told
 * crawlers that every shard had just changed, every 10 minutes — which teaches
 * Google to disregard `lastmod` and re-crawl unchanged shards. Process start is
 * stable for the life of the pod and moves on deploy, which is exactly the
 * semantics for the static/marketing shard.
 *
 * Pods started at different times report slightly different values for these
 * shards. That is harmless — it is a coarse "changed at deploy" signal either
 * way — and far better than a timestamp that always says "now".
 */
const PROCESS_START_ISO = new Date().toISOString();

/** Datasets the backend reports a newest-`updatedAt` for. */
interface SitemapLastmods {
  jobs: string | null;
  companies: string | null;
  curated: string | null;
  reviews: string | null;
  vendors: string | null;
  searchAggregates: string | null;
}

let lastmodCache: { data: SitemapLastmods; expires: number } | null = null;

/**
 * Fetch the per-dataset newest `updatedAt` from the backend.
 *
 * Failure is non-fatal and returns all-nulls: callers fall back to the deploy
 * stamp, so a backend blip degrades `lastmod` precision rather than breaking the
 * sitemap index.
 */
async function fetchSitemapLastmods(): Promise<SitemapLastmods> {
  const empty: SitemapLastmods = {
    jobs: null,
    companies: null,
    curated: null,
    reviews: null,
    vendors: null,
    searchAggregates: null,
  };
  if (lastmodCache && lastmodCache.expires > Date.now()) return lastmodCache.data;

  const apiBase =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:5000/api/v1';
  try {
    const res = await fetch(`${apiBase}/public/sitemap-lastmod`, { next: { revalidate: 600 } });
    if (!res.ok) return empty;
    const body = await res.json();
    const data = { ...empty, ...(body?.data ?? {}) } as SitemapLastmods;
    lastmodCache = { data, expires: Date.now() + SHARD_CACHE_TTL_MS };
    return data;
  } catch {
    return empty;
  }
}

/**
 * `shard id → <lastmod>` for every shard in the index.
 *
 * Each shard is stamped with the freshness of the data it actually contains:
 * a jobs shard moves when a job is edited, the reviews shard when a review is
 * approved, and the static shard only on deploy. Shards whose dataset is empty
 * or unreachable fall back to the deploy stamp — never to "now".
 */
export async function getShardLastmods(): Promise<Record<number, string>> {
  const [m, lm] = await Promise.all([getShardMap(), fetchSitemapLastmods()]);
  const at = (value: string | null) => value ?? PROCESS_START_ISO;
  const out: Record<number, string> = {};

  // Static marketing/legal/auth pages — hardcoded in sitemap.ts, so deploy-time.
  for (const id of m.staticIds) out[id] = PROCESS_START_ISO;

  // Curated landings and the cartesian expansion are both generated from
  // CuratedListing rows, so they share its freshness.
  out[m.curatedId] = at(lm.curated);
  out[m.cartesianShardId] = at(lm.curated);

  for (let i = 0; i < m.jobsShardCount; i++) out[JOBS_SHARD_BASE + i] = at(lm.jobs);
  for (let i = 0; i < m.companiesShardCount; i++) {
    out[m.companiesShardBase + i] = at(lm.companies);
  }

  out[m.popularAggregatesShardId] = at(lm.searchAggregates);
  out[m.companyReviewsShardId] = at(lm.reviews);
  out[m.vendorsShardId] = at(lm.vendors);
  // Help + news articles have no backing public endpoint yet, so their shards
  // are empty; the deploy stamp is the only honest signal available.
  out[m.helpArticlesShardId] = PROCESS_START_ISO;
  out[m.newsArticlesShardId] = PROCESS_START_ISO;

  return out;
}

/** Deploy stamp, for standalone sitemaps that have no dataset of their own. */
export function getDeployStamp(): string {
  return PROCESS_START_ISO;
}
