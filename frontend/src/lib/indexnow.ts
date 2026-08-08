/**
 * IndexNow client — instant indexing protocol backed by Bing, Yandex,
 * Naver, Seznam, and a growing list of participating engines.
 *
 * Unlike sitemap-based discovery (which can take days), IndexNow
 * typically reflects URL changes in minutes.
 *
 * Wiring:
 *   - The site key lives at /public/<KEY>.txt (a 32-char hex token).
 *   - INDEXNOW_KEY env var holds the same value (falls back to the
 *     compile-time default below for local/dev).
 *   - `/api/indexnow-ping` route handler accepts a list of URLs and
 *     forwards them to api.indexnow.org with the host + key.
 *   - Backend job/company mutations call this endpoint via fetch.
 *   - On deploy, a CI step pings static-page URLs.
 *
 * @see https://www.indexnow.org/
 * @see https://blogs.bing.com/webmaster/october-2021/IndexNow-Instantly-Index-your-web-content-in-Search-Engines
 */

const DEFAULT_KEY = 'c43d83f87126d18729b99c85048ac0f8';

const INDEXNOW_ENDPOINTS = [
  // Bing's IndexNow gateway also forwards to other participating engines
  // (Yandex, Naver, Seznam) through their shared protocol consortium.
  'https://api.indexnow.org/IndexNow',
  // Direct submission to Yandex (faster for ru/en sites).
  'https://yandex.com/indexnow',
  // Bing direct.
  'https://www.bing.com/indexnow',
];

const HOST = (() => {
  const url = process.env.NEXT_PUBLIC_APP_URL || 'https://hireadda.in';
  try {
    return new URL(url).host;
  } catch {
    return 'hireadda.in';
  }
})();

export function indexnowKey(): string {
  return process.env.INDEXNOW_KEY || DEFAULT_KEY;
}

export function indexnowKeyUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://hireadda.in';
  return `${base}/${indexnowKey()}.txt`;
}

export interface IndexNowResult {
  endpoint: string;
  ok: boolean;
  status: number;
  error?: string;
}

/**
 * Fan-out a URL list to every IndexNow endpoint. Each engine confirms
 * receipt independently; we collect all responses for caller telemetry
 * but never throw — instant indexing is best-effort.
 */
export async function pingIndexNow(urls: ReadonlyArray<string>): Promise<IndexNowResult[]> {
  if (urls.length === 0) return [];

  const key = indexnowKey();
  const keyLocation = indexnowKeyUrl();
  const payload = JSON.stringify({
    host: HOST,
    key,
    keyLocation,
    urlList: urls.slice(0, 10_000), // spec limit per submission
  });

  const headers: HeadersInit = {
    'Content-Type': 'application/json; charset=utf-8',
    'User-Agent': `HireAdda-IndexNow/1.0 (+https://${HOST})`,
  };

  const results = await Promise.all(
    INDEXNOW_ENDPOINTS.map(async (endpoint) => {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: payload,
          // 5s ceiling — IndexNow is fire-and-forget; never block requests on it.
          signal: AbortSignal.timeout(5_000),
        });
        return {
          endpoint,
          ok: res.ok,
          status: res.status,
        };
      } catch (err) {
        return {
          endpoint,
          ok: false,
          status: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );
  return results;
}

/**
 * Generate the canonical IndexNow URL for a given path. Strips query
 * strings (tracking variants are handled via canonical tags) and
 * normalises trailing slashes.
 */
export function canonicaliseForIndexNow(pathOrUrl: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://hireadda.in';
  let url: URL;
  try {
    url = new URL(pathOrUrl, base);
  } catch {
    return `${base}${pathOrUrl}`;
  }
  url.search = '';
  url.hash = '';
  // Strip trailing slash except for root
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}
