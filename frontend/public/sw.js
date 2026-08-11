/* eslint-disable no-undef */
/**
 * Service worker.
 *
 *  Strategies:
 *    - Navigation: network-first → offline fallback (`/offline`).
 *      Uses navigation-preload to overlap SW startup + network fetch.
 *    - Static assets (images, fonts, CSS, JS, _next/static): stale-while-revalidate.
 *    - API GETs: network-first with 3s timeout → cached fallback (5min TTL).
 *    - Font files: cache-first, immutable for 1 year.
 *
 *  Update lifecycle:
 *    - Versioned cache keys with bump-on-deploy (CACHE_VERSION).
 *    - On install: pre-cache critical assets, skip waiting.
 *    - On activate: clean every cache that's not in the current set,
 *      claim clients, register navigation preload.
 *    - On message {type: 'SKIP_WAITING'}: force update on user click.
 *
 *  Background sync:
 *    - 'sync-saves': retries failed save-job actions.
 *    - 'sync-analytics': retries Sentry/GA beacons buffered while offline.
 *
 *  (Periodic background sync and push notifications were removed with the
 *  job-board prewarm task and the Web Push / FCM stack.)
 */

const CACHE_VERSION = 'v7';
const CACHE_PREFIX = 'ha-';

const PAGE_CACHE = `${CACHE_PREFIX}pages-${CACHE_VERSION}`;
const STATIC_CACHE = `${CACHE_PREFIX}static-${CACHE_VERSION}`;
const IMAGE_CACHE = `${CACHE_PREFIX}images-${CACHE_VERSION}`;
const FONT_CACHE = `${CACHE_PREFIX}fonts-${CACHE_VERSION}`;
const API_CACHE = `${CACHE_PREFIX}api-${CACHE_VERSION}`;

const ALL_CACHES = [PAGE_CACHE, STATIC_CACHE, IMAGE_CACHE, FONT_CACHE, API_CACHE];

const OFFLINE_URL = '/offline';

const PRECACHE_ASSETS = [
  '/',
  '/offline',
  '/logo.svg',
  '/web-app-manifest-192x192.png',
  '/web-app-manifest-512x512.png',
];

// LRU-style cap per cache. Limits are tuned to typical browser quota
// (~50MB available per origin in older Safari; modern browsers >100MB).
const CACHE_LIMITS = {
  [PAGE_CACHE]: 30,
  [STATIC_CACHE]: 80,
  [IMAGE_CACHE]: 60,
  [FONT_CACHE]: 12,
  [API_CACHE]: 50,
};

/* ── Helpers ────────────────────────────────────────────────────────── */

async function trimCache(cacheName, maxItems) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length <= maxItems) return;
    // Drop the oldest entries (first-inserted = first-key).
    const overflow = keys.length - maxItems;
    for (let i = 0; i < overflow; i++) {
      await cache.delete(keys[i]);
    }
  } catch {
    /* cache may be inaccessible during shutdown — ignore */
  }
}

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request).then(
      (res) => {
        clearTimeout(timer);
        resolve(res);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// API paths that produce content on-demand (Puppeteer-rendered PDFs,
// long-running parse jobs, etc.) MUST bypass the SW cache + timeout.
// They legitimately take longer than the default 8s budget — wrapping
// them in handleApi causes the SW to time-out, return a synthetic 503
// ("Request failed and no cache is available."), and surface a confusing
// toast even though the backend is healthy and would respond in
// 4-30 seconds.
//
// Matched as a substring on `url.pathname`. Add to this list when
// introducing a new long-running GET. POST/PUT/DELETE never go through
// handleApi anyway (isApiGet filters on method).
const SLOW_API_PATH_FRAGMENTS = [
  '/resume/generate',
  '/resume/parse',
  '/resume/parsed',
  '/invoices/', // /invoices/:id/pdf etc.
  '/billing/invoices/',
  '/pdf', // generic catch-all for any other PDF render endpoint
  '/export', // CSV / Excel export endpoints
  '/download',
];

function isApiGet(req) {
  if (req.method !== 'GET') return false;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return false;
  if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/v1/')) return false;
  // Bypass slow generation endpoints — let them hit the network directly
  // so the SW never times them out.
  for (const frag of SLOW_API_PATH_FRAGMENTS) {
    if (url.pathname.includes(frag)) return false;
  }
  return true;
}

function isStaticAsset(req) {
  return (
    req.destination === 'style' ||
    req.destination === 'script' ||
    req.url.includes('/_next/static/')
  );
}

function isImageAsset(req) {
  return req.destination === 'image';
}

function isFontAsset(req) {
  return req.destination === 'font';
}

/* ── Install ───────────────────────────────────────────────────────── */

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PAGE_CACHE);
      // Deliberately NOT cache.addAll(). addAll() is atomic: a single 404
      // rejects the whole promise, which fails the install and leaves nothing
      // cached at all — including the offline fallback that exists for exactly
      // that situation. The browser then retries the install on every load.
      await Promise.all(
        PRECACHE_ASSETS.map(async (url) => {
          try {
            const res = await fetch(url, { cache: 'reload' });
            // A redirected response cannot be served for a navigation request
            // ("a redirected response was used for a request whose redirect
            // mode is not follow"), so caching one is worse than caching none.
            // While locked, / redirects to /unlock and would land here.
            if (!res.ok || res.redirected) return;
            await cache.put(url, res);
          } catch {
            // A missing or unreachable asset must never fail the install.
          }
        }),
      );
    })(),
  );
  // Activate the new SW as soon as install completes — combined with
  // clientsClaim + skipWaiting message support, users get fresh code on
  // next reload without a 24h SW-update wait.
  self.skipWaiting();
});

/* ── Activate ──────────────────────────────────────────────────────── */

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Clean any cache that doesn't match the current version set.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && !ALL_CACHES.includes(k))
          .map((k) => caches.delete(k)),
      );

      // Navigation preload — start the network fetch in parallel with
      // SW startup so the navigation isn't bottlenecked on SW boot
      // (~50-200ms savings on cold loads).
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch {
          /* not all browsers support this; proceed without */
        }
      }

      await self.clients.claim();
    })(),
  );
});

/* ── Message handler — manual update, cache-clear ──────────────────── */

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING' || event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (event.data?.type === 'CLEAR_CACHES') {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
});

/* ── Fetch — strategy router ───────────────────────────────────────── */

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Bail on non-GET, non-http(s), and cross-origin requests.
  if (request.method !== 'GET') return;
  if (!request.url.startsWith('http')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation — network-first, fallback to offline.
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(event));
    return;
  }

  // API GETs — network-first with 3s timeout, fallback to cache.
  if (isApiGet(request)) {
    event.respondWith(handleApi(request));
    return;
  }

  // Fonts — cache-first (immutable for 1 year).
  if (isFontAsset(request)) {
    event.respondWith(handleFont(request));
    return;
  }

  // Images — stale-while-revalidate.
  if (isImageAsset(request)) {
    event.respondWith(handleImage(request));
    return;
  }

  // Static assets (CSS, JS, _next/static/*) — stale-while-revalidate.
  if (isStaticAsset(request)) {
    event.respondWith(handleStatic(request));
    return;
  }
});

async function handleNavigation(event) {
  // Try the navigation-preload fetch first if available.
  let preloadResponse;
  try {
    preloadResponse = await event.preloadResponse;
  } catch {
    preloadResponse = undefined;
  }

  const networkPromise = (async () => {
    if (preloadResponse) return preloadResponse;
    return fetch(event.request);
  })();

  try {
    const response = await networkPromise;
    if (response && response.ok) {
      const clone = response.clone();
      caches
        .open(PAGE_CACHE)
        .then((cache) => cache.put(event.request, clone))
        .then(() => trimCache(PAGE_CACHE, CACHE_LIMITS[PAGE_CACHE]))
        .catch(() => {});
    }
    return response;
  } catch {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
    return Response.error();
  }
}

async function handleApi(request) {
  const cache = await caches.open(API_CACHE);
  try {
    // 8s timeout for list/read GETs that go through handleApi. Slow
    // generation endpoints are excluded upstream in isApiGet (see
    // SLOW_API_PATH_FRAGMENTS) so this budget only needs to cover
    // normal read endpoints. Previous 3s was too tight: any backend
    // pod under load (cold cache, post-rollout warm-up) would time out
    // and the SW would return a synthetic 503 even though the real
    // response was on its way.
    const fresh = await fetchWithTimeout(request, 8_000);
    // Only cache complete (200) responses. Range/streamed media replies are 206
    // (Partial Content), which the Cache API refuses to store ("Partial response
    // (status code 206) is unsupported") — skip them to avoid the uncaught error.
    if (fresh && fresh.status === 200) {
      cache.put(request, fresh.clone()).then(() => trimCache(API_CACHE, CACHE_LIMITS[API_CACHE]));
    }
    return fresh;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ error: 'offline', message: 'Request failed and no cache is available.' }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}

async function handleFont(request) {
  const cache = await caches.open(FONT_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      cache.put(request, fresh.clone()).then(() => trimCache(FONT_CACHE, CACHE_LIMITS[FONT_CACHE]));
    }
    return fresh;
  } catch {
    return cached || Response.error();
  }
}

async function handleImage(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) {
        cache
          .put(request, res.clone())
          .then(() => trimCache(IMAGE_CACHE, CACHE_LIMITS[IMAGE_CACHE]));
      }
      return res;
    })
    .catch(() => cached);
  return cached || network;
}

async function handleStatic(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) {
        cache
          .put(request, res.clone())
          .then(() => trimCache(STATIC_CACHE, CACHE_LIMITS[STATIC_CACHE]));
      }
      return res;
    })
    .catch(() => cached);
  return cached || network;
}

/* ── Background Sync ───────────────────────────────────────────────── */

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-analytics') {
    event.waitUntil(replayQueue('analytics'));
  }
});

/**
 * Background-sync replay loop. The page-level code stores failed POST
 * payloads in IndexedDB under `ha-sync-queue` keyed by tag. This handler
 * drains them when connectivity returns. Implementation is intentionally
 * minimal — full IDB plumbing lives in src/lib/offline-queue.ts.
 */
async function replayQueue(tag) {
  // Lazy IDB open — postMessage to clients lets the page-level helper
  // do the actual replay so we don't duplicate the fetch logic here.
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({ type: 'REPLAY_SYNC_QUEUE', tag });
  }
}
/* ── Push notifications ─────────────────────────────────────────────
   The push + notificationclick handlers were removed with the Web Push /
   FCM stack: no backend endpoint accepts a subscription and nothing sends,
   so they could never fire. Realtime reaches the inbox over Socket.IO.
   ────────────────────────────────────────────────────────────────── */
