/**
 * /sitemap-index.xml — Canonical Sitemap Index
 *
 * Next.js 16 emits the shard files at `/sitemap/[id].xml` via
 * `app/sitemap.ts` + `generateSitemaps()`, and (as of 16.2.x) also serves a
 * bare shard index at `/sitemap.xml` natively. This hand-written index is the
 * CANONICAL one advertised in robots.txt: it references every shard AND the
 * standalone sitemaps (e.g. Google News), and carries our own cache headers.
 * It lives at `/sitemap-index.xml` to avoid colliding with the metadata route
 * Next now registers at `/sitemap.xml`.
 *
 * The shard layout is defined ONCE in `lib/sitemap-shards.ts` and consumed by
 * both this route handler AND `app/sitemap.ts`. Adding a new shard there
 * auto-propagates here without code changes.
 *
 * @see https://www.sitemaps.org/protocol.html#index
 */

import {
  getDeployStamp,
  getShardIds,
  getShardLastmods,
  STANDALONE_SITEMAP_PATHS,
} from '@/lib/sitemap-shards';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://hireadda.in';

async function buildSitemapIndex(): Promise<string> {
  /*
   * `lastmod` is per-shard and reflects the newest `updatedAt` in the data that
   * shard renders — not the render time. Stamping everything with "now" (which
   * is what this did) meant every 10-minute revalidation announced that all
   * eleven sitemaps had just changed, which trains crawlers to ignore `lastmod`
   * and re-fetch shards that never moved.
   */
  const [ids, lastmods] = await Promise.all([getShardIds(), getShardLastmods()]);
  const deployStamp = getDeployStamp();

  /*
   * Per-shard entries, advertised at the ROOT-LEVEL `/sitemap-{id}.xml` alias
   * rather than the `/sitemap/{id}.xml` path Next actually generates.
   *
   * This is load-bearing, not cosmetic. The sitemap protocol scopes a sitemap
   * file to its own directory: a file served from `/sitemap/4.xml` may only
   * list URLs under `https://host/sitemap/`. Every URL our shards contain sits
   * at the site root (`/`, `/jobs/...`, `/companies/...`), so while the index
   * pointed at `/sitemap/{id}.xml` Google discarded all of them — Search
   * Console read exactly one of eleven children, `/sitemap-news.xml`, which is
   * the only one that already lived at the root.
   *
   * `next.config.ts` rewrites `/sitemap-{id}.xml` → `/sitemap/{id}.xml`, so the
   * bytes are identical and `generateSitemaps()` is untouched; only the path
   * Google sees moves up to the root, where listing root URLs is in scope.
   *
   * @see https://www.sitemaps.org/protocol.html#location
   */
  const shardEntries = ids
    .map(
      (id) => `  <sitemap>
    <loc>${BASE_URL}/sitemap-${id}.xml</loc>
    <lastmod>${lastmods[id] ?? deployStamp}</lastmod>
  </sitemap>`,
    )
    .join('\n');

  // Standalone sitemap files — live at the root rather than under the
  // /sitemap/{id}.xml shard scheme. See STANDALONE_SITEMAP_PATHS in
  // lib/sitemap-shards.ts (currently /sitemap-news.xml only — distinct
  // namespace + 5-min refresh cadence).
  const standaloneEntries = STANDALONE_SITEMAP_PATHS.map(
    (path) => `  <sitemap>
    <loc>${BASE_URL}${path}</loc>
    <lastmod>${deployStamp}</lastmod>
  </sitemap>`,
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${shardEntries}
${standaloneEntries}
</sitemapindex>`;
}

export async function GET() {
  const body = await buildSitemapIndex();
  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}

// Dynamic = ISR-revalidate the index so growing job/company counts get
// reflected on the next 10-min interval without redeploying.
export const revalidate = 600;
