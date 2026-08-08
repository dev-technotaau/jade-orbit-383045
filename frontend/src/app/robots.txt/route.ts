/**
 * /robots.txt — Route Handler.
 *
 * Implemented as a raw Route Handler (instead of Next.js's `robots.ts`
 * metadata convention) because we need directives that aren't covered by
 * the `MetadataRoute.Robots` type:
 *
 *   - `Clean-param` (Yandex) — collapses tracking-parameter URL variants
 *     into their canonical form in the index.
 *   - Wildcard `Disallow` patterns for query-string parameters (e.g.
 *     `/*?utm_*`) — explicit belt-and-braces on top of Google's canonical
 *     tag handling.
 *
 * Non-production environments return a blanket `Disallow: /` to prevent
 * staging URLs from being indexed.
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://hireadda.in';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ── Path groups ─────────────────────────────────────────────────────────
const PUBLIC_ALLOW_PATHS = [
  '/',
  '/about',
  '/contact',
  '/help',
  '/site-map',
  // Jobs listings — `/jobs/*` (public listing page, future) + individual
  // detail pages under the same prefix.
  '/jobs',
  '/jobs/',
  // Company profiles — the actual route is `/company/[id]` (singular);
  // `/companies` is the planned public index page. Allow both so crawlers
  // find the listing AND individual profile pages.
  '/company/',
  '/companies',
  '/companies/',
  // Pricing pages — public landing surfaces for both the catch-all index
  // and the audience-split variants. The trailing-slash form covers the
  // per-plan detail pages at `/pricing/[slug]`.
  '/pricing',
  '/pricing/',
  '/pricing/candidate',
  '/pricing/employer',
  // Enterprise "Contact Sales" quote form. The rest of /billing/* is
  // disallowed below (private user dashboard), but this single URL is
  // a public lead-capture page. More-specific Allow > broader Disallow
  // is honoured by Googlebot, Bingbot, YandexBot, and other modern
  // crawlers — defence-in-depth across all rule tiers.
  '/billing/quote',
  '/billing/quote/',
  // Public vendor directory — `/vendors/*` is the public browse + profile
  // pages (employers holding the VENDOR_CONNECT plan). The `/vendor/*`
  // prefix (no `s`) is legacy-redirect-only and is disallowed below.
  '/vendors',
  '/vendors/',
  '/privacy',
  '/terms',
  '/cookie-policy',
  '/refund-policy',
  '/accessibility',
  '/disclaimer',
  '/auth/login',
  '/auth/login/candidate',
  '/auth/login/employer',
  '/auth/register',
  '/auth/register/candidate',
  '/auth/register/employer',
];

const PRIVATE_DISALLOW_PATHS = [
  '/candidate/',
  '/employer/',
  '/admin/',
  '/super-admin/',
  '/portal/',
  // Legacy `/vendor/*` prefix — the vendor dashboard moved to
  // /employer/vendor (already covered by the `/employer/` disallow above);
  // these URLs are now just 308 redirects and shouldn't be crawled.
  // DO NOT confuse with `/vendors/*` which is the PUBLIC vendor directory;
  // the trailing slash ensures we don't disallow the public prefix.
  '/vendor/',
  // Billing / payment / subscription pages — all auth-required user flows.
  '/billing/',
  // Team-invite acceptance flow — signed-token, single-use URL.
  '/team/',
  '/notifications',
  '/notifications/',
  '/auth/reset-password',
  '/auth/verify-email',
  '/auth/forgot-password',
  '/auth/callback',
  '/verify-employment/', // signed-token employment verification flow
  '/api/',
  '/_next/',
  '/share',
  '/offline',
  '/404',
  '/500',
];

// Tracking-parameter URL variants that should NEVER be indexed as separate
// pages. Google normally dedupes these via canonical tags, but explicit
// Disallow is defence-in-depth for misconfigured canonicals + Bing/Yandex.
const TRACKING_PARAM_DISALLOW = [
  '/*?utm_source=*',
  '/*?utm_medium=*',
  '/*?utm_campaign=*',
  '/*?utm_content=*',
  '/*?utm_term=*',
  '/*?fbclid=*',
  '/*?gclid=*',
  '/*?gclsrc=*',
  '/*?msclkid=*',
  '/*?mc_eid=*',
  '/*?ref=*',
];

// Yandex Clean-param: list of query parameters to strip from the indexed
// URL. All variants collapse to the canonical parameterless URL.
const YANDEX_CLEAN_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'fbclid',
  'gclid',
  'gclsrc',
  'msclkid',
  'mc_eid',
  'ref',
];

// ── AI crawler policy ───────────────────────────────────────────────────
//
// These lists were previously ONE list (`AI_TRAINING_BOTS`) rendered with
// `Disallow: /`, and then FIFTEEN of the same user-agents were rendered a
// second time with an allow-list. That is a contradictory robots.txt: a
// crawler matching two groups either merges them or honours the first, and
// behaviour differs per implementation — so the safe assumption is that the
// `Disallow: /` won.
//
// Cloudflare's AI Crawl Control confirmed it. Every UA in both lists showed
// heavy failures (ClaudeBot 18, GPTBot 17, ChatGPT-User 12, OAI-SearchBot 12,
// PerplexityBot 11) while every UA in neither (Googlebot, Baidu, BingBot,
// Applebot) showed Unsuccessful: 0.
//
// A user-agent must now appear in EXACTLY ONE list. `assertNoDuplicateAgents`
// below enforces that at build time so this cannot silently regress.

// AI search / answer engines and user-triggered assistants.
// These CITE and LINK BACK — they are a traffic source, equivalent to a search
// engine. Blocking them removes the site from AI answers entirely.
const AI_SEARCH_BOTS = [
  // OpenAI — search index + user-triggered fetch
  'OAI-SearchBot',
  'ChatGPT-User',
  // Anthropic — search index + user-triggered fetch
  'Claude-SearchBot',
  'Claude-User',
  'ClaudeBot-User',
  // Perplexity
  'PerplexityBot',
  'Perplexity-User',
  // DuckDuckGo assistant
  'DuckAssistBot',
  // Mistral / xAI user-triggered
  'MistralAI-User',
  'xAI-Bot',
  'GrokBot',
  // Meta user-triggered fetch (distinct from Meta-ExternalAgent training)
  'Meta-ExternalFetcher',
  // Answer engines
  'YouBot',
  'PhindBot',
  // Newer assistants seen in Cloudflare AI Crawl Control
  'Manus Bot',
  'Novellum AI Crawl',
  'ProRataInc',
  'Anchor Browser',
];

// AI model-training crawlers. These ingest content for training and generally
// do NOT send traffic back.
//
// Allowed here by explicit product decision — the goal is maximum presence in
// AI systems. This is a reversible business choice, not a technical necessity:
// flip this list to `Disallow: /` to opt out of training while KEEPING the
// AI_SEARCH_BOTS above allowed, which is the usual publisher stance.
const AI_TRAINING_BOTS = [
  // OpenAI
  'GPTBot',
  // Anthropic
  'ClaudeBot',
  'Claude-Web',
  'anthropic-ai',
  // Google AI
  'Google-Extended',
  'GoogleOther',
  'GoogleOther-Image',
  'GoogleOther-Video',
  'Google-CloudVertexBot',
  // Meta AI
  'Meta-ExternalAgent',
  'FacebookBot',
  // Apple AI (training opt-out UA; plain Applebot is a search engine, Tier 1)
  'Applebot-Extended',
  // Amazon
  'Amazonbot',
  // Cohere
  'cohere-ai',
  'cohere-training-data-crawler',
  // Common Crawl — feeds most open training corpora
  'CCBot',
  // Chinese / Korean vendors
  'Bytespider',
  'TikTok Spider',
  'PetalBot',
  'PanguBot',
  'Yeti',
  'Sogou web spider',
  'Sogou inst spider',
  'iaskspider/2.0',
  // Dataset labs and research crawlers
  'AI2Bot',
  'AI2Bot-Dolma',
  'ImagesiftBot',
  'Omgilibot',
  'omgili',
  'Webzio-Extended',
  'Timpibot',
  'ICC-Crawler',
  'ISSCyberRiskCrawler',
  'Kangaroo Bot',
  'FriendlyCrawler',
  'VelenPublicWebCrawler',
  'NovaAct',
  'Crawlspace',
  'IntelliSeek.ai',
  'BrightBot',
  'Cloudflare Crawler',
];

// Web archives. Preserve the public record; negligible traffic cost.
const ARCHIVE_BOTS = ['archive.org_bot', 'ia_archiver', 'Arquivo-web-crawler', 'Wayback'];

// Commercial scrapers and generic scraping frameworks. NOT AI search, NOT an
// archive, no citation or traffic benefit — they resell or harvest content.
// Deliberately still blocked; this is the one category left disallowed.
const SCRAPER_BOTS = ['Diffbot', 'Scrapy', 'DataForSeoBot', 'SemrushBot', 'AhrefsBot', 'MJ12bot'];

/**
 * A user-agent declared in two groups makes robots.txt ambiguous — a crawler
 * either merges the groups or honours the first, depending on implementation.
 * That was this file's original defect: 15 AI user-agents appeared in both a
 * `Disallow: /` group and an allow-list group.
 *
 * Validates the FINAL RENDERED TEXT rather than the source arrays. An earlier
 * version checked only the AI constant lists and consequently missed
 * `Applebot`, which was duplicated between two inline tier arrays. Checking
 * the output is the only version that cannot have blind spots.
 *
 * Throws outside production so it surfaces in dev and CI; in production it
 * logs instead, because a hard throw would take robots.txt down entirely —
 * an ambiguous file is bad, no file at all is worse.
 */
function assertNoDuplicateAgents(rendered: string): void {
  const counts = new Map<string, number>();
  for (const line of rendered.split('\n')) {
    if (!line.startsWith('User-agent:')) continue;
    const ua = line.slice('User-agent:'.length).trim().toLowerCase();
    counts.set(ua, (counts.get(ua) ?? 0) + 1);
  }
  const dupes = [...counts.entries()].filter(([, n]) => n > 1).map(([ua, n]) => `${ua} (x${n})`);
  if (!dupes.length) return;

  const msg = `robots.txt: duplicate user-agents make the file ambiguous: ${dupes.join(', ')}`;
  if (process.env.NODE_ENV !== 'production') throw new Error(msg);
  console.error(msg);
}

// ── Serialisation helpers ───────────────────────────────────────────────
function renderRule(
  agents: string | string[],
  allow: string[],
  disallow: string[],
  crawlDelay?: number,
): string {
  const lines: string[] = [];
  (Array.isArray(agents) ? agents : [agents]).forEach((ua) => lines.push(`User-agent: ${ua}`));
  allow.forEach((p) => lines.push(`Allow: ${p}`));
  disallow.forEach((p) => lines.push(`Disallow: ${p}`));
  if (crawlDelay !== undefined) lines.push(`Crawl-delay: ${crawlDelay}`);
  return lines.join('\n');
}

function buildRobotsTxt(): string {
  // Staging / preview / local — block everything.
  if (!IS_PRODUCTION || BASE_URL.includes('localhost') || BASE_URL.includes('vercel.app')) {
    return [
      '# Non-production environment — all crawling disallowed.',
      'User-agent: *',
      'Disallow: /',
      '',
    ].join('\n');
  }

  const blocks: string[] = [
    '# Hire Adda robots.txt',
    '# Generated by src/app/robots.txt/route.ts — do not edit in place.',
    '',

    // Tier 1: Major search engines — full public access
    '# ── Tier 1: Major search engines ─────────────────────────────────',
    renderRule(
      ['Googlebot', 'Googlebot-Image', 'Googlebot-News', 'Googlebot-Video'],
      PUBLIC_ALLOW_PATHS,
      [...PRIVATE_DISALLOW_PATHS, ...TRACKING_PARAM_DISALLOW],
    ),
    '',
    // No Crawl-delay here, deliberately.
    //
    // This group carried `Crawl-delay: 1`, which caps these engines at one
    // request per second. Bing honours the directive, and Microsoft's own
    // guidance is to control Bing's rate through Crawl Control in Bing
    // Webmaster Tools rather than robots.txt — a static delay overrides their
    // adaptive scheduling and can only ever lower the ceiling.
    //
    // Context: Bing spent months seeing an empty page on every URL, because
    // MaintenanceGate blocked SSR and served a spinner (fixed 2026-08-01).
    // Every URL sat at "Discovered but not crawled". While recovering that
    // crawl budget there is no reason to keep an artificial rate cap in place
    // — Bing was managing ~6 requests/day against Googlebot's ~190, so the
    // limit was not binding, but it is one less ceiling in the way.
    //
    // Googlebot (above) never had a Crawl-delay, so this also makes the two
    // Tier-1 groups consistent. Google ignores the directive entirely.
    // Applebot is a SEARCH ENGINE crawler (Siri / Spotlight / Safari
    // suggestions) and belongs here, not with the AI tiers — the AI opt-out
    // UA is the separate `Applebot-Extended`. Baidu likewise.
    renderRule(
      [
        'Bingbot',
        'Slurp',
        'DuckDuckBot',
        'Applebot',
        'Baiduspider',
        'Baiduspider-render',
        // Ceramic's search crawler. Cloudflare classes it "Search Engine
        // Crawler"; without an explicit group it falls through to `*` and gets
        // the narrower catch-all allow-list rather than the full public set.
        'TerracottaBot',
        'Terracotta',
      ],
      PUBLIC_ALLOW_PATHS,
      [...PRIVATE_DISALLOW_PATHS, ...TRACKING_PARAM_DISALLOW],
    ),
    '',

    // Yandex gets its OWN group so `Clean-param` can live inside it.
    //
    // Clean-param is a Yandex-only extension. It used to be emitted at the top
    // level, outside every user-agent group, where Bing's robots.txt tester
    // flags it as a hard error (along with the `Host:` directive, now removed).
    //
    // NOTE: the allow/disallow lists are intentionally repeated here rather
    // than folding Yandex in with Bingbot above. A crawler obeys ONLY its most
    // specific matching group — so a bare `User-agent: Yandex` block carrying
    // just Clean-param would silently drop every Disallow, exposing /admin,
    // /super-admin and the rest to Yandex. The duplication is load-bearing.
    renderRule(['YandexBot', 'Yandex'], PUBLIC_ALLOW_PATHS, [
      ...PRIVATE_DISALLOW_PATHS,
      ...TRACKING_PARAM_DISALLOW,
    ]),
    // Inside the Yandex group — no blank line above, or it becomes a separate
    // record and stops applying to Yandex.
    `Clean-param: ${YANDEX_CLEAN_PARAMS.join('&')} /`,
    '',

    // Tier 2: Social link-preview crawlers
    '# ── Tier 2: Social media / link-preview crawlers ─────────────────',
    renderRule(
      [
        'facebookexternalhit',
        'Facebot',
        'Twitterbot',
        'LinkedInBot',
        'Slackbot',
        'Slackbot-LinkExpanding',
        'TelegramBot',
        'Discordbot',
        'WhatsApp',
        // 'Applebot' intentionally NOT here — it is a search-engine crawler
        // (Siri / Spotlight / Safari suggestions) and lives in Tier 1. Listing
        // it twice made robots.txt ambiguous for it.
        'SkypeUriPreview',
        'Pinterest',
        'Pinterestbot',
        'redditbot',
      ],
      PUBLIC_ALLOW_PATHS,
      PRIVATE_DISALLOW_PATHS,
    ),
    '',

    // Tier 3: Google advertising crawlers
    '# ── Tier 3: Google advertising crawlers ──────────────────────────',
    renderRule(
      ['AdsBot-Google', 'AdsBot-Google-Mobile', 'Mediapartners-Google', 'APIs-Google'],
      PUBLIC_ALLOW_PATHS,
      PRIVATE_DISALLOW_PATHS,
    ),
    '',

    // Tier 4: Generic catch-all
    '# ── Tier 4: Generic crawlers — restrictive default ───────────────',
    renderRule(
      '*',
      [
        '/',
        '/about',
        '/contact',
        '/help',
        '/site-map',
        '/pricing',
        '/pricing/',
        '/pricing/candidate',
        '/pricing/employer',
        // Enterprise quote form — explicit allow overrides the
        // /billing/ disallow further down for catch-all UAs too.
        '/billing/quote',
        '/billing/quote/',
        '/vendors',
        '/vendors/',
        '/auth/login',
        '/auth/login/candidate',
        '/auth/login/employer',
        '/auth/register',
        '/auth/register/candidate',
        '/auth/register/employer',
        '/privacy',
        '/terms',
        '/cookie-policy',
        '/refund-policy',
        '/accessibility',
        '/disclaimer',
      ],
      [...PRIVATE_DISALLOW_PATHS, ...TRACKING_PARAM_DISALLOW],
      2,
    ),
    '',

    // ── Tier 5: AI search / answer engines / assistants ──────────────
    // These cite and link back — a traffic source, like a search engine.
    // Same public surface as Tier 1: if a human may read it, an AI answer
    // engine may too.
    '# ── Tier 5: AI search engines & assistants — public surfaces ─────',
    renderRule(AI_SEARCH_BOTS, PUBLIC_ALLOW_PATHS, [
      ...PRIVATE_DISALLOW_PATHS,
      ...TRACKING_PARAM_DISALLOW,
    ]),
    '',

    // ── Tier 6: AI model-training crawlers ───────────────────────────
    // Allowed by explicit product decision (maximum AI presence). Unlike
    // Tier 5 these generally send no traffic back, so this is the list to
    // flip to `Disallow: /` if the trade stops being worth it.
    '# ── Tier 6: AI training crawlers — public surfaces ───────────────',
    renderRule(AI_TRAINING_BOTS, PUBLIC_ALLOW_PATHS, [
      ...PRIVATE_DISALLOW_PATHS,
      ...TRACKING_PARAM_DISALLOW,
    ]),
    '',

    // ── Tier 7: Web archives ─────────────────────────────────────────
    '# ── Tier 7: Web archives ─────────────────────────────────────────',
    renderRule(ARCHIVE_BOTS, PUBLIC_ALLOW_PATHS, [...PRIVATE_DISALLOW_PATHS]),
    '',

    // ── Tier 8: Commercial scrapers — full disallow ──────────────────
    // The one category still blocked: no citation, no traffic, resells or
    // harvests content. Not an AI answer engine and not an archive.
    '# ── Tier 8: Commercial scrapers / SEO harvesters — disallow ──────',
    renderRule(SCRAPER_BOTS, [], ['/']),
    '',

    // Clean-param now lives INSIDE the Yandex group above, not here.
    // `Host:` has been removed entirely: Yandex dropped support for it in
    // 2018 in favour of 301s + rel=canonical (both of which this site already
    // does), so it was dead weight — and Bing's robots.txt tester reports it
    // as an error. Two fewer parse errors for a directive that did nothing.

    // Sitemap references — canonical index (references every shard + the news
    // sitemap) followed by the standalone Google News sitemap. These are
    // correctly top-level: `Sitemap` is a cross-crawler directive, unlike
    // Clean-param/Host.
    `Sitemap: ${BASE_URL}/sitemap-index.xml`,
    `Sitemap: ${BASE_URL}/sitemap-news.xml`,
    '',
  ];

  const rendered = blocks.join('\n');
  assertNoDuplicateAgents(rendered);
  return rendered;
}

export async function GET() {
  return new Response(buildRobotsTxt(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // Robots.txt can be cached aggressively — it changes on deploys only.
      // Browsers / crawlers should re-fetch periodically; 1 hour edge cache
      // + stale-while-revalidate gives freshness without origin load.
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}

// Explicitly mark static — evaluated at build time, identical output every
// request. Prevents per-request function invocations.
export const dynamic = 'force-static';
