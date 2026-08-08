/**
 * IndexNow client — backend version. Fires an instant-indexing ping to
 * Bing, Yandex, and friends whenever a public-facing URL changes.
 *
 * Triggered on:
 *   - Job create / publish / update / close / delete
 *   - Company profile slug or major-field update
 *   - New approved review (reviews page becomes more relevant)
 *
 * Fire-and-forget — never blocks the originating mutation. Failures are
 * logged at WARN; instant indexing is best-effort.
 */
import logger from '../config/logger';
import { env } from '../config/env';

const FRONTEND_BASE = env.NEXT_PUBLIC_APP_URL || 'https://hireadda.in';

const HOST = (() => {
  try {
    return new URL(FRONTEND_BASE).host;
  } catch {
    return 'hireadda.in';
  }
})();

const KEY = env.INDEXNOW_KEY || 'c43d83f87126d18729b99c85048ac0f8';
const KEY_LOCATION = `${FRONTEND_BASE}/${KEY}.txt`;

const ENDPOINTS = [
  'https://api.indexnow.org/IndexNow',
  'https://yandex.com/indexnow',
  'https://www.bing.com/indexnow',
];

/**
 * Submit a list of public URLs to IndexNow. Returns a per-endpoint
 * status report. Never throws.
 */
export async function pingIndexNow(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  if (env.NODE_ENV !== 'production') {
    // Skip outbound pings in non-prod — preview/staging URLs would be
    // rejected by the IndexNow validators anyway.
    logger.debug(`IndexNow skipped (env=${env.NODE_ENV}): ${urls.length} urls`);
    return;
  }
  const payload = JSON.stringify({
    host: HOST,
    key: KEY,
    keyLocation: KEY_LOCATION,
    urlList: urls.slice(0, 10_000),
  });
  await Promise.all(
    ENDPOINTS.map(async (endpoint) => {
      try {
        // Node 20 LTS has stable global fetch; plugin-n flags it as experimental
        // only because its built-in support matrix is pinned to >=21.
        // eslint-disable-next-line n/no-unsupported-features/node-builtins
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'User-Agent': `HireAdda-IndexNow/1.0 (+https://${HOST})`,
          },
          body: payload,
          signal: AbortSignal.timeout(5_000),
        });
        if (!res.ok) {
          logger.warn(`IndexNow ${endpoint} returned ${res.status}`);
        }
      } catch (err) {
        logger.warn(`IndexNow ${endpoint} ping failed: ${(err as Error).message}`);
      }
    })
  );
}

/** Build a public job URL from a slug. */
export function jobUrl(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return `${FRONTEND_BASE}/jobs/${slug}`;
}

/** Build a public company URL from a slug. */
export function companyUrl(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return `${FRONTEND_BASE}/companies/${slug}`;
}

/** Build a public company-reviews URL from a slug. */
export function companyReviewsUrl(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return `${FRONTEND_BASE}/companies/${slug}/reviews`;
}

/**
 * Convenience helpers — call from service mutation paths. All are
 * fire-and-forget; never await them on the request hot path.
 */
export function notifyJobChanged(slug: string | null | undefined): void {
  const url = jobUrl(slug);
  if (!url) return;
  void pingIndexNow([url]).catch(() => {});
}

export function notifyCompanyChanged(slug: string | null | undefined): void {
  const url = companyUrl(slug);
  if (!url) return;
  void pingIndexNow([url]).catch(() => {});
}

export function notifyCompanyReviewsChanged(slug: string | null | undefined): void {
  const urls = [companyUrl(slug), companyReviewsUrl(slug)].filter((u): u is string => !!u);
  if (urls.length === 0) return;
  void pingIndexNow(urls).catch(() => {});
}
