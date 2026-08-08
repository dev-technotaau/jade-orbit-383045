# Article System — Audit Findings (durable copy)

Committed so the implementation plan does not depend on session-scoped temp files.

Source: two workflow runs — `wf_5b0927ed-2e9` (8 codebase audits, 3 design passes, 4 gap critics → 193 gaps)
and `wf_01dfef88-efa` (6 completeness lenses over plan v1 → 48 blockers, 82 major, 18 minor).

Every finding below was produced by an agent reading the real repo. Items already resolved in
`article-system-implementation-plan.md` are still listed here so nothing is silently dropped.

---

## Part 1 — Design/architecture gaps (193, grouped by owning phase)

### Phase 0 pre implementation decisions (2)

- CONTRADICTION on the single most load-bearing decision: the backend design transports the body as a base64 bodyEncoded JSON field behind a path-scoped express.json({limit
- No empirical verification plan for the body-transport decision that every other artefact depends on. The backend design says 'confirm the body-parser short-circuit with a

### Phase 0 pre implementation decisions Phase 2 backend (1)

- No feature flag / kill switch. defaultFlags in backend/src/config/feature-flags.ts gains no enableArticles, and the Sidebar requiresFeature mechanism is not used for the

### Phase 0 pre implementation decisions Phase 2 backend API (1)

- Public API path set is inconsistent across the three designs: backend defines /public/help-articles, /public/news, /public/blog, /public/blog/category/:slug; the frontend

### Phase 0 pre implementation decisions Phase 7 SEO (1)

- CONTRADICTION on empty-sitemap-shard handling: the SEO design suppresses empty shards from <sitemapindex> via a new getShardIds()/getGeneratedShardIds() split; the fronte

### Phase 0 pre work decisions spikes (7)

- The two designs specify mutually exclusive body transports: the backend design uses base64 `bodyEncoded` in a JSON body behind a path-scoped 1MB `express.json`, the front
- The `req._body` short-circuit claim for `app.use('/api/v1/super-admin/articles', express.json({limit:'1mb'}))` above the global 10kb parser is asserted but never verified
- No feature flag anywhere. `backend/src/config/feature-flags.ts` already exists (Firebase Remote Config, 60s cache, `isFeatureEnabled(key)`) and the design uses it for not
- Article authoring is `restrictTo(Role.SUPER_ADMIN)` + `requireMfaEnabled` only. There is no editor/author role, no ownership check (`authorId === req.user.id`), and no le
- `moderation.service.ts`'s keyword blocklist is persisted to `src/data/blocked-keywords.json` on the pod filesystem — per-pod, lost on restart, divergent across replicas —
- No platform-wide comments kill switch. `SystemConfig` was flagged in the audit as the place to park one; the design only has per-article `commentsEnabled`.
- New env/config dependencies with no Zod validation or startup assertion: `CF_TURNSTILE_SECRET_KEY`, the R2 `article-assets/` prefix and bucket CORS/public-read settings,

### Phase 0 prerequisite spike contract freeze (2)

- The two halves of the design contradict each other on how the article body reaches the backend, and both are specified as artefacts. The backend design specifies `bodyEnc
- If the base64-in-JSON transport wins, every article save pushes a ~1MB string through `DOMPurify.sanitize()` in `xss-sanitize.ts` (isomorphic-dompurify = jsdom on the ser

### Phase 1 2 schema slug generation (1)

- `/blog/[slug]` will be shadowed by the static sibling segments the design also creates: `category`, `tag`, `author`, `feed.xml`, `feed.atom`, `feed.json`. Nothing in the

### Phase 1 3 data model retention (1)

- Nothing specifies retention or erasure for the PII the comment system introduces: `guestEmail`, `ipAddress`, `userAgent`, `fingerprintHash` and free-text `body` on `Artic

### Phase 1 8 data seeding rollout (1)

- Nothing states how ~79 existing FAQ entries, the three Footer category slugs, and the initial `ArticleCategory` rows get into the database. There is no seed script, no `p

### Phase 1 Prisma data model migration (5)

- `Article.updatedAt` is a Prisma `@updatedAt` column, but the design writes to the same row from the 5-minute view-counter flush (`prisma.article.update({ data: { views: {
- No slug-history model and no redirect mechanism. `ArticleMetaPanel` only 'warns when editing the slug of an already-PUBLISHED article' — there is no `ArticleSlugRedirect`
- There is no author entity. The Prisma model has `authorId String?` (FK to `User`) plus denormalised `authorName`/`authorTitle`/`authorAvatarUrl`, but no author slug, no b
- Tags are a bare `tags String[] @default([])` with no normalisation, no slug, and no tag entity — yet the design ships `/blog/tag/[tag]` hub pages, a `TagManager` with ren
- `ArticleCategory` is uniquely keyed `@@unique([kind, slug])` — so a HELP category and a BLOG category may share the slug `hiring-guides` — but the frontend routes ALL cat

### Phase 1 Prisma schema migration (3)

- No commenter-level blocking: no `BlockedFingerprint`/blocked-email list, no shadow-ban, no "block this commenter" admin action.
- The hand-written GIN indexes are invisible to Prisma, and nothing asserts they exist after deploy.
- No documented rollback for the migration. It is additive (good) but there is no down path, `prisma migrate deploy` runs automatically on push, and the GIN indexes complic

### Phase 1 data model (2)

- The frontend design puts category/tag/author hubs at `/blog/category/[cat]` for ALL kinds, but the backend model declares `@@unique([kind, slug])` on `ArticleCategory`. A
- `/blog/author/[slug]`, `ArticleSummary.authorSlug`, and `AuthorBox` (bio + social links) have no backing in the Prisma model, which carries only `authorId`, `authorName`,

### Phase 1 data model migration (5)

- /blog/author/[slug] hub, AuthorBox (bio + socials) and authorSlug types are specified in the frontend design, but the Prisma model has only authorId (FK to User) plus den
- TagManager specifies tag rename, merge, usage counts, tag slugs and 'tags with <3 articles' reporting, and /blog/tag/[tag] needs a canonical label plus a published count
- /blog/category/[cat] is specified as a canonical CROSS-KIND taxonomy hub, but ArticleCategory is uniquely keyed @@unique([kind, slug]) with a required kind scalar — a cat
- No full-text search index for article bodies. v1 search is ILIKE over title/excerpt/bodyText, and the only hand-written indexes are GIN over the tags/keywords/faqPageCont
- No translationGroupId integrity: nothing prevents two rows with the same locale in one group, nothing guarantees the group is reciprocal and self-inclusive, and there is

### Phase 1 data model migration Phase 4 public routes (1)

- No slug-change redirect infrastructure. Verified: there is no ArticleSlugHistory/redirect table anywhere in schema.prisma, and next.config.ts redirects() is a static hand

### Phase 1 migration (1)

- The migration is to be generated with `prisma migrate diff --from-schema <HEAD schema> --to-schema prisma/schema.prisma`, which will capture ANY difference between the co

### Phase 1 migration indexes (1)

- `Article` carries 14 `@@index` entries plus three hand-written GIN indexes on a table that will also receive a bulk `views` increment for every article every 5 minutes. N

### Phase 10 rollout (2)

- No content seeding, backfill or import path: no plan to migrate the 79-entry static FAQ corpus into help articles, no HTML/Markdown/WordPress importer, no bulk CSV create
- No rollout sequencing artefact. All three designs independently flag 'ship the routes before the endpoints / the endpoints before the shards' as a risk, but no design own

### Phase 10 testing (1)

- Zero test artefacts in any design, for either side, despite jest.config.ts on the frontend and src/services/**tests**/ on the backend.

### Phase 2 3 backend service caching (1)

- `invalidateArticleCache()` is specified as `redis.keys('article:*') + del`, but the same design puts the view counters at `article:views:{id}` and `article:views:day:{id}

### Phase 2 3 caching publish side effects (1)

- `invalidateArticleCache()` clears the `cache:` namespace but the ETag layer stores under a separate `etag:${req.originalUrl}:${userId}` key (verified etag.ts:70) and is n

### Phase 2 4 public comment path (1)

- Guest comment POST goes through `apiV1Router.use(doubleCsrfProtection)` (app.ts:333). Whether an unauthenticated visitor can obtain a CSRF token — and whether the BFF `/a

### Phase 2 Backend services public API (6)

- The `noindex Boolean` and `canonicalUrl String?` columns exist on `Article` but nothing consumes them on the discovery side. `getSitemapLastmods()`'s new aggregates filte
- No reserved-slug blacklist in the article zod schema. The slug regex is only `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/`.
- The hreflang design never specifies that `translations[]` must be filtered to published/indexable rows, that the current article must include itself, or that the page-lev
- The design says publishes should fire on-demand `revalidatePath()` alongside the IndexNow ping, but there is no artefact for the Next route handler that makes that possib
- No IndexNow ping on unpublish/archive/delete, and no HTTP status policy for removed articles — `notFound()` returns 404 for ARCHIVED/DELETED rows, and there is no 410 or
- For translated articles only `title` and `bodyEncoded` are in `translateSchema`. `tags`, `keywords`, `metaTitle`, `metaDescription`, `excerpt`, and the category name stay

### Phase 2 admin service (1)

- Admin list/detail queries are not specified with a `select` whitelist — only the public half is. `Article.bodyHtml` + `bodyText` are unbounded text columns, so a default

### Phase 2 backend API (1)

- No deep-pagination or payload-abuse protection on the public list endpoints. ?limit=1000 is publicly reachable on /public/news (needed by the news sitemap) and ?page= is

### Phase 2 backend API Phase 4 public frontend (1)

- The 'Was this helpful?' feedback row on /help/[slug] has no implementation behind it. Article.helpfulCount/notHelpfulCount columns exist, but there is no endpoint, no rat

### Phase 2 backend API Phase 5 admin UI (2)

- No editorial RBAC beyond restrictTo(Role.SUPER_ADMIN) + requireMfaEnabled on every article route, including reads. Role.ADMIN exists and already gates the moderation surf
- No optimistic-concurrency control on saves. The editor autosaves the body every 20s and metadata via a separate PATCH, with no version/If-Match token on either endpoint.

### Phase 2 backend services (3)

- No handling of an article changing kind (BLOG→NEWS→HELP). The URL prefix is derived from kind, so a kind change silently moves the article to a different URL space with n
- Revision-table growth is unbounded and contradicts the autosave design: the backend snapshots the previous state into ArticleRevision on every save, while the frontend au
- No article-level webhook events. WEBHOOK_EVENTS in backend/src/schemas/webhook.schema.ts is a closed 6-value list (job._, application._, candidate.\*) and gains no article

### Phase 2 backend services Phase 5 admin UI (1)

- No orphaned-asset lifecycle. Cover images and inline body images upload to R2 with no reference counting, no media library, no deletion on article delete and no GC job —

### Phase 2 backend services Phase 7 SEO (2)

- No 410 Gone / de-indexing path. Archived, unpublished and soft-DELETED articles are only ever notFound() (404), with no IndexNow removal ping, no noindex transition, and
- No CDN purge on publish. etagCache({ publicCdnCache: true }) emits s-maxage/stale-while-revalidate and Cloudflare fronts both hosts, but no design calls a Cloudflare purg

### Phase 2 backend services routes (28)

- `verifyTurnstile` fails OPEN in production: verified at backend/src/middleware/turnstile.ts — if `CF_TURNSTILE_SECRET_KEY` is unset it logs `logger.warn('Turnstile secret
- No optimistic-concurrency control on article saves. Autosave fires every 20s and `version` is incremented server-side, but there is no `expectedVersion`/If-Match check.
- Article asset upload copies `email.controller.ts:uploadAsset`, which uses `putBufferToR2` — verified to deliberately SKIP `scanFile`. So cover and inline images bypass ma
- No image re-encode, no `limitInputPixels`, no EXIF stripping, and no stated `Content-Type`/`X-Content-Type-Options`/`Content-Disposition` policy for R2 public objects.
- The sanitizer allowlist permits `img src` and `class` with no host restriction on image sources and no class allowlist, and the backend design FORBIDs `iframe` while the
- `isomorphic-dompurify` is a process-wide singleton; adding a hook (`forcing rel="noopener noreferrer nofollow"`, rejecting non-https img src) in `article-sanitize.service
- `canonicalUrl` and `ogImageUrl` are free-text editor fields validated only with `z.url()`, which accepts `javascript:` and any external host.
- `excerpt`, `metaTitle`, `metaDescription`, `heroH1`, `authorName`, `guestName` are never sanitized or constrained beyond length, and `guestName` has no reserved-name bloc
- Every rate limiter is IP-keyed (express-rate-limit default). No authenticated-user keying, no per-fingerprint key, no per-article cap, no global comments-per-day ceiling.
- No near-duplicate detection on comment bodies and no first-post link policy — `moderateCommentBody` only rejects >2 URLs.
- `voteFingerprint` is `sha256(ip|ua|'vote'|commentId)` with no day bucket — so a rotating User-Agent alone mints unlimited distinct vote identities from one IP, capped onl
- `guestEmail` is collected with no consent checkbox, no privacy-notice link, no verification, and no designed use — no guest reply notification exists.
- `collectUserData()` in `backend/src/services/data-export.service.ts` enumerates exactly 9 relations — articles authored, comments, comment votes and comment reports are n
- No right-to-erasure path for a guest commenter. `whatsapp-contact.controller.ts:146` already implements a DPDP erasure endpoint for a comparable surface; comments get not
- `SENSITIVE_KEYS` in backend/src/middleware/audit.ts is an exact lowercase match list. The design adds `bodyencoded`/`bodyhtml` but not `guestemail`, `guestname`, `ipaddre
- `resolveReportSchema` names its free-text field `note` — verified to be in `SENSITIVE_KEYS` and therefore logged as `[REDACTED]`.
- `audit()` only fires when `req.user` is present, and no public mutation (comment submit / vote / report) carries it.
- No status-transition guard on moderation — moderating an already-DELETED or already-moderated comment is not a 409, and two admins working the queue will act on the same
- `invalidateArticleCache()` uses `redis.keys('article:*')` + del.
- `etagCache({ publicCdnCache: true })` emits `Cache-Control: public, s-maxage=...`, so Cloudflare caches article responses at the edge — and nothing in the design purges C
- `revalidatePath()` is described as "fired from the publish path", but the publish path is in Express and cannot call a Next server action.
- The comment list endpoint deliberately has no `cache()`/`etagCache` because of per-viewer `myVote`.
- Locale is not part of the response cache key. `getPublicBySlug` falls back to `en` when the requested locale row is missing, and `cache()` keys on `originalUrl` plus an a
- `etagCache`'s ETag store is keyed by URL and does not use the same `::a0/::a1` auth bucket as `cache()`.
- `recordView` increments on every detail request with no bot filtering.
- `ImageJobData.entityType`/`field` are never widened for articles, yet the schema carries `coverImageVariants Json?`.
- `pingIndexNow` is called per-article from `notifyArticleChanged`, and the design includes a bulk publish action.
- `validate()` short-circuits with `{success:false, error:{message, code, details[]}}` and no `requestId`, while every other error and success path uses `{status:'success'|

### Phase 2 public API contract (1)

- The public list payload spec in `article.controller.ts` omits `locale` and `translations[]`, but `public.routes.ts` (SEO design) and `fetchArticleShardItems` both require

### Phase 2 route registration (1)

- Public reads are specified twice and in two places: `article.routes.ts` mounted at `apiV1Router.use('/', articleRoutes)` (backend design) and 'add the six endpoints to pu

### Phase 3 7 publish side effects ISR (1)

- The design says publish fires `revalidatePath()` for on-demand ISR — but publish happens in Express (article.service.ts / the BullMQ scheduled-publish worker), which cann

### Phase 3 Kafka BigQuery instrumentation (1)

- Adding `CONTENT: 'ha.content'` to `ConsolidatedTopics` changes the CONSUMER, not just the producer: consumer.ts:368-370 does `Object.values(ConsolidatedTopics)` then `awa

### Phase 3 Public frontend pages (22)

- `ArticleListShell` is specified to write every filter (search `q`, category, tag, sort) into the URL searchParams 'so the state is linkable and crawlable', but there is n
- Pagination canonicalisation is stated as 'canonical `/blog` on page 1' with prev/next links, inheriting the existing companies/jobs convention where the canonical always
- `app/layout.tsx` line 231 hardcodes `<html lang="en">`, and `SEO_CONFIG.locale` feeds a fixed `og:locale` in `generateMetadata`. Nothing in the design changes either for
- `articleSchema()` (json-ld.ts:935) hardcodes `inLanguage: 'en-IN'` and there is no parameter to override it. `blogPostingSchema`/`newsArticleSchema` inherit it verbatim.
- `articleSchema()` always emits `author: { '@type': 'Person', name, url }` with no `@id`, no `sameAs`, no `jobTitle`, and no way to emit an Organization author.
- `articleSchema()` emits `image` as a bare array of URL strings (verified: `images` is `input.image.map(abs)`), never as `ImageObject` with `width`/`height`. No minimum co
- No dynamic Open Graph image generation. Verified: there is no `opengraph-image.tsx`/`twitter-image.tsx` anywhere in `frontend/src/app`. Articles without a cover fall back
- The author hub is specified to emit `webPageSchema` ('profilePageSchema-equivalent via webPageSchema'), not `ProfilePage`.
- `collectionPageSchema` and `itemListSchema` are emitted on index and hub pages with a fixed `url` (`/blog`, `/blog/category/x`), so paginated pages re-emit the same `@id`
- Article body images are rendered through `dangerouslySetInnerHTML` as raw `<img>` tags pointing at R2/Cloudinary originals. Nothing in `ArticleBody`/`sanitiseArticleHtml`
- The proposed CLS guard `.article-body img { aspect-ratio: 1.91 / 1; }` is applied to every body image.
- The two design sections give different ISR values for the same routes: `/blog/[slug]` 600 vs 300, `/news` 120 vs 300, `/news/[slug]` 300 vs 300, `/help/[slug]` 3600 vs 30
- No `generateStaticParams` on any article route; everything is on-demand ISR, and no article route is prewarmed after deploy.
- No date-based archive hubs for news (`/news/2026/07`) and no 'all articles' cross-kind index. `/news` is a single paginated stream ordered by `publishedAt desc`.
- No previous/next article navigation on detail pages. Internal linking is limited to breadcrumb-up, `RelatedArticles` (3-6, editor-curated or category/tag derived), and ta
- No article surface is added to the homepage, `/jobs`, `/companies`, or the footer mega-section. The only sitewide entry points are the Header 'Resources' dropdown and thr
- A NEWS article's breadcrumb is undefined. Category and tag hubs live under `/blog/...` for all kinds, so the specified breadcrumb for a news piece would read Home > Blog
- No cannibalisation policy between the 79-entry static FAQ corpus rendered in full on `/help` and DB-backed help articles at `/help/{slug}`. `/help` also emits the FULL-co
- Turnstile is loaded on the guest comment path of every public article page, and `ReadingProgressBar`, `ArticleToc`, `ArticleShareBar`, `ArticleAnalytics` and `CommentSect
- No CDN cache headers for article HTML. `next.config.ts` `headers()` gains a rule only for `/(blog|news)/feed.:ext` in the design; article pages themselves get whatever IS
- Comment indexability is undecided. Comments are SSR'd into the article HTML, default to PENDING, paginate via React Query client state (so pages 2+ never reach the SSR HT
- `SEO.tsx` maps the `author` prop to `authors: [{ name }]`, which Next emits as `article:author` containing a name string.

### Phase 3 analytics view counters (1)

- `recordView()` is called from the detail controller, but every article detail route is specified with `cache({ttl:300})` — which intercepts and short-circuits on a hit be

### Phase 3 background jobs workers (11)

- `ArticleComment` introduces `ipAddress`, `userAgent`, `fingerprintHash`, `guestEmail`, `guestName` with no retention policy and no purge job.
- There is no erasure worker at all — `deletionRequestedAt` is written once in auth.service.ts:1751 and read only by the exporter. Adding user-linked UGC with `userId` → Se
- Key-namespace collision in the view flush: `article:views:day:{id}:{YYYY-MM-DD}` is prefix-nested inside `article:views:`, so the generalised prefix loop will SCAN the da
- Generalising `view-counter-flush.worker.ts` modifies a live job that also carries job-post view counts, and `GETDEL` → `prisma.update` is not atomic (now two writes per G
- No overdue-publish detection. If `withLock('lock:article-publish:'+id, 300, …)` holds a stale lock or the 60s race timeout trips, a scheduled article silently misses its
- `ArticleViewDaily.day` is normalised to UTC midnight and `article-refresh-analytics` runs at 02:15 UTC (07:45 IST).
- No repair/staleness sweep for the denormalised counters (`commentCount`, `lastCommentAt`, `helpfulCount`, `notHelpfulCount`, `reportedCount`, `replyCount`).
- Two manual infra prerequisites with no owner and no runbook entry: the `ha.content` Kafka topic must exist on Aiven before the producer deploys, and the `content_events`
- No metrics defined for the feature at all — no counters for comments submitted/approved/rejected, pending-queue depth, auto-flag rate, publish success/failure, scheduled-
- No alert thresholds and no synthetic checks — nothing watches pending-queue depth, publish lag, 4xx spikes on the public article endpoints, or whether `/public/news` retu
- Sentry noise: the sanitizer throwing `BadRequestError` on invalid base64, spam-rejected submissions and duplicate-report 409s are all expected 4xx that will land in error

### Phase 3 jobs view counters (2)

- Generalising `view-counter-flush.worker.ts` with a `{prefix:'article:views:'}` entry will have its `SCAN ... MATCH 'article:views:*'` also match the daily keys `article:v
- Generalising `view-counter-flush.worker.ts` puts the live job view counter — a shipped, user-visible feature — inside a refactor whose only beneficiary is articles. There

### Phase 3 workers (1)

- No reconciliation sweep for the denormalised commentCount, replyCount, helpfulCount, reportedCount and Article.views counters.

### Phase 3 workers Phase 10 ops (1)

- No Prometheus metrics or alerting for the article system, despite metrics.routes.ts, alertmanager.routes.ts and the ALL_QUEUES gauge convention. Reusing schedulerQueue de

### Phase 3 workers Phase 8 analytics (1)

- ArticleViewDaily.uniqueViews has no mechanism to compute it. Views are redis.incr per request; nothing tracks distinct visitors (no HyperLogLog/PFADD, no fingerprint set)

### Phase 4 6 shared component extraction (1)

- `constants/api.ts` is to be restructured by moving `PUBLIC_STATS` and `PUBLIC_JOB_CATEGORY_COUNTS` into a new `PUBLIC` group 'with aliases retained', and `ShareReviewMenu

### Phase 4 Sitemap robots discovery wiring (8)

- The `?lang=` locale query param has no canonical/robots treatment. The design keeps `?lang=` + `ha_faq_locale` as the locale mechanism, sets the article canonical to the
- `robots.txt` declares `Sitemap: ${BASE_URL}/sitemap-news.xml` unconditionally (verified at line 389), while the design makes that file conditionally advertised inside `<s
- The global `X-Robots-Tag: index, follow, max-snippet:-1, max-image-preview:large` header in next.config.ts applies to every route not matching the `(auth|portal|candidate
- The blog/news feeds are registered only in root `layout.tsx` `alternates.types`, making them site-wide `<link rel="alternate">` declarations on every page (including `/jo
- Feed coverage is asymmetric and incomplete: `/blog/feed.{xml,atom,json}` are created but news gets only `/news/feed.xml`; there are no per-category feeds; and no feed dec
- Category hub URLs (`/blog/category/{cat}`) and author hub URLs (`/blog/author/{slug}`) appear in no sitemap. One design section says 'include category hubs in the blog sh
- Each article kind gets exactly ONE shard id, and `fetchArticleShardItems` hard-breaks at `SHARD_PAGE_SIZE` (50,000). There is no `blogArticlesShardCount` arithmetic equiv
- `llms.txt` / `llms-full.txt` updates are limited to adding `/blog`, `/news` and fixing the sitemap URL. There is no per-article machine-readable surface for AI search eng

### Phase 4 public frontend (6)

- No newsletter/subscribe surface, despite a complete in-house email platform (EmailContact, double opt-in via email-optin.service.ts, campaigns, sets, RFC 8058 one-click u
- No Indic-script typography plan for article bodies in hi/ta/te/bn/mr: no webfont subset loading, no lang attribute strategy on the body element, no line-height/prose trea
- No CSP review. The current helmet CSP in app.ts is never checked against what the article sanitizer permits (remote images, embeds, inline styles from tiptap).
- Two independently-maintained allowlists — server-side in `article-sanitize.service.ts`, client-side in `lib/article-html.ts` — with no shared source of truth or version s
- No honeypot field and no minimum submission-time check on the guest comment form.
- Comment `depth` re-parenting is silent — a reply-to-a-reply is attached to the root with no `replyToName`/`replyToId` shown.

### Phase 4 public frontend Phase 2 backend API (1)

- Articles are absent from the platform's global search. SearchBar/autocomplete, search.routes.ts /autocomplete and the Elasticsearch suggestions index are untouched; the o

### Phase 4 public frontend Phase 7 SEO (1)

- No RSS/feed autodiscovery <link rel="alternate"> on the article pages themselves, and no feed for category or author hubs. Only root-layout alternates.types is edited.

### Phase 4 public pages navigation (1)

- The Footer change repoints three sitewide links — 'Career Advice', 'Salary Guide', 'Employer Resources' — from the working `/help` page to `/blog/category/career-advice|s

### Phase 4 routing middleware (1)

- Adding '/blog' and '/news' to `publicPaths` in proxy.ts is a no-op that misdescribes the middleware. Verified line 355: the check is `publicPaths.includes(pathname)` — an

### Phase 4 styling (1)

- Adding `@plugin '@tailwindcss/typography'` to globals.css ships the plugin's CSS on EVERY route in the app — including dashboards, auth pages and the homepage — not just

### Phase 5 Super admin CMS (6)

- The `ArticlePublishChecklist` lints metaTitle/metaDescription/cover/word-count/h2/slug-length/keywords, but not: headline length ≤110 chars for NEWS (Google Top Stories t
- No orphan/inbound-link reporting in the CMS. The publish checklist lints 'no internal links' in the body (outbound) but nothing surfaces articles with zero inbound intern
- No `dateModified` bump policy. Every metadata PATCH and every body autosave (every 20s and on blur) writes the row, and `dateModified` flows straight into JSON-LD and `ar
- Uploaded assets are keyed `article-assets/<uuid>.<ext>` (cloned from the email asset path). No descriptive filename, no per-article folder.
- Body-image alt text is only 'prompted' by `ArticleAssetUploader`; nothing enforces it, and `sanitiseArticleHtml`'s allowlist permits `alt` but does not require it. Only t
- The analytics page specifies a 'Top articles' table with 'CTR from search' but there is no Search Console API integration anywhere in the plan — no OAuth/service-account

### Phase 5 admin UI (2)

- No editorial workflow states or approval step. The status enum is DRAFT|SCHEDULED|PUBLISHED|ARCHIVED|DELETED — no IN_REVIEW, no assignee, no reviewer sign-off, no 'submit
- No comment moderation export (CSV) and no bulk report resolution, despite the admin section otherwise standardising on downloadBlob + filter-scoped bulk operations.

### Phase 5 admin UI Phase 6 comments (1)

- No accessibility acceptance criteria for the new interactive surfaces: no keyboard/ARIA spec for tiptap image and table insertion, no screen-reader announcement for autos

### Phase 5 help conversion (2)

- Adding `/help/[slug]` places it under the existing `app/help/layout.tsx`, which exports `metadata = buildMetadata({url:'/help', ...})`. Next merges layout metadata into c
- Converting `/help` from a fully static client page into a server page that awaits `fetchHelpArticles()` introduces a runtime backend dependency and ISR revalidation onto

### Phase 5 super admin CMS (4)

- Admin reads of comment forensics (raw IP, UA, fingerprint) are not logged, and raw IPs are rendered directly in the moderation table.
- No moderation SLA mechanism at all: comments default PENDING, moderation is SUPER_ADMIN+MFA only, and there is no oldest-pending-age metric, no digest email, no escalatio
- No orphaned-asset management: no `ArticleAsset` table, no reference counting, no GC job, no per-admin upload quota, and `coverImageKey` is never deleted on article delete
- No unauthenticated preview-share mechanism (signed, expiring token) for drafts.

### Phase 6 Launch verification monitoring (3)

- There are no Search Console / Bing Webmaster operational steps anywhere in the plan: no sitemap submission, no property/prefix verification for the new paths, no Google N
- No structured-data validation step. The plan introduces ~10 new JSON-LD emissions (BlogPosting, NewsArticle, Article, CollectionPage, ItemList, BreadcrumbList, ProfilePag
- No post-launch monitoring plan: nothing watches GSC 'Crawled — currently not indexed' (the expected fate of tag/filter/paginated URLs), the International Targeting hrefla

### Phase 6 SEO sitemap wiring (1)

- `fetchPublicCount()` becomes a hard runtime dependency of the sitemap index on backend availability, with a 10-minute memo and every failure path swallowed.

### Phase 6 comments (2)

- No consent capture for guest commenters. ConsentService (terms/privacy/marketing/cookies/data-processing) exists and is used elsewhere, but the comment form collects a na
- New notification categories (article_comment_reply, comment_auto_flagged) are introduced with no entry in the notificationPreferences JSON on either profile and no prefer

### Phase 6 comments moderation (4)

- No commenter-level moderation: no ban/block list for an abusive user, guest fingerprint or IP. Moderation acts only on individual comments.
- No trusted-commenter / auto-approve path. Every comment from every user, including repeat approved authors and logged-in staff, defaults to PENDING indefinitely.
- No 'notify me of replies' subscription for commenters and no unsubscribe token for comment notifications. Only an in-app notification to the parent author is specified —
- No defined behaviour for comments when their article leaves PUBLISHED (unpublished, archived, soft-deleted) or when commentsEnabled flips off mid-thread.

### Phase 6 super admin CMS (2)

- Adding Image and Table extensions to the shared `components/ui/RichTextEditor.tsx` changes the editor schema for every existing consumer (job descriptions, support ticket
- Refactoring `lib/email-bulk.ts` into a thin wrapper over a new `lib/bulk.ts` puts the eight live email admin pages' bulk operations — including the async-job progress pol

### Phase 7 Google News sitemap (1)

- `robots.txt/route.ts` declares `Sitemap: ${BASE_URL}/sitemap-news.xml` unconditionally (verified line 389), and the design explicitly keeps that line. Deleting `fallbackN

### Phase 7 SEO (1)

- The SEO design specifies on-demand revalidatePath() fired from the publish path, but no artefact creates the Next revalidation API route, the shared secret, or the backen

### Phase 7 launch seed rollout (5)

- Deploying the backend alone changes SEO behaviour: the sitemap shards and `/sitemap-news.xml` are already shipped and already calling `/public/help-articles` and `/public
- No seed data of any kind — zero articles, zero categories.
- Hard ordering dependency, unstated: the Footer repoint sends 'Career Advice', 'Salary Guide' and 'Employer Resources' to `/blog/category/{career-advice,salary-guides,empl
- No backfill or content plan for `/help/[slug]`. The design correctly keeps the 79-entry static FAQ corpus untouched, but then supplies no source of help-article content,
- No staging/canary plan for the comment system, and no load consideration for the moderation UI.

### Phase 7 sitemap wiring (4)

- Conditional shard advertising is driven by `fetchPublicCount()`, which swallows every error and returns 0. A backend blip, a 429 from `publicLimiter`, or a slow `/public/
- The sitemap fetchers are rewritten to paginate at `limit=200` per page across three article endpoints, on top of the eight existing shard fetchers — all issued from a sin
- The `getShardIds()` / `getGeneratedShardIds()` split changes the meaning of an exported symbol that `app/sitemap.ts:386` currently calls for `generateSitemaps()`. If that
- `STANDALONE_SITEMAP_PATHS` is a `ReadonlyArray<string>` const (verified sitemap-shards.ts:55) consumed at sitemap-index.xml/route.ts:23 and referenced by name in a commen

### Phase 8 analytics (2)

- The analytics page is designed against data the backend never collects: 'avg read depth', 'scroll completion', 'avg time on page', 'TrafficSourceChart (referrer buckets)'
- No BigQuery content_events table DDL or schema. The design adds only the tableMap entry in streamToBigQuery.

### Phase 8 rollout cutover (1)

- There is no rollback story for a release that is auto-migrated by CD and simultaneously flips public SEO surfaces. Once `/public/help-articles` and `/public/news` return

### Phase 9 compliance DPDP (3)

- Article comments are never added to collectUserData() in backend/src/services/data-export.service.ts. Verified: that function enumerates a fixed list (user, profiles, sav
- No right-to-erasure path for comments. userId is onDelete: SetNull, which leaves guestName, guestEmail, ipAddress, userAgent, fingerprintHash and the body permanently att
- No retention/TTL policy for comment abuse-forensics columns (ipAddress, userAgent, fingerprintHash), written on every comment, vote and report and never expired.

---

## Part 2 — Plan-completeness blockers (48)

- **Six of thirteen phases are a single table cell each. Phase 6 (comments — user named 'reply and comment system'), Phase 7 (SEO/sitemap/feeds — user named 'article in sitemap', 'top notch seo **
  fix: Expand each of Phases 6-12 to the granularity of Phases 1-2: a 'files to create' table with the in-repo file each is modelled on, a 'files to modify' table with the exact change, numbered tasks (e.g. P6-01…P6-40), and a per-phase DoD checklist. The user's bar
- **No URL scheme exists for non-English articles. The plan mandates `locale String @default("en")`, `@@unique([kind, slug, locale])`, `@@unique([translationGroupId, locale])`, 'hreflang recipro**
  fix: Decide and document one of: (a) `?lang=xx` query variants with self-canonical + hreflang (matches the existing FAQ pattern, weakest SEO), (b) `/{locale}/blog/{slug}` path prefix (requires a new route group + `proxy.ts` rewrite rules + updating every existing R
- **The entire frontend data layer is absent. No `frontend/src/services/article.service.ts`, `article-comment.service.ts`, `super-admin-articles.service.ts` (the repo has 54 per-domain service f**
  fix: Add a frontend file-inventory table mirroring §7.1 (service/types/hooks/validators/constants per surface, each naming its in-repo model, e.g. `super-admin-email.service.ts`). Extend spike S1 to prove the 400KB `multipart/form-data` body PUT survives the BFF pr
- **The plan contains only three endpoint paths (`/public/help-articles`, `/public/news`, `/public/blog`) and one admin path (`PUT …/:id/body`). Everything else — detail-by-slug, related, prev/n**
  fix: Write the contract inline in the plan (or ship the companion file now, since the user's instruction was to produce the plan while full context exists): every path, method, guard, rate limiter, query params, request body, response envelope, cache TTL and invali
- **'Was this helpful?' is a half-implemented feature. §6.1 gives Article `helpfulCount`/`notHelpfulCount` columns and the frontend design shows the feedback row on /help/[slug], but the plan sp**
  fix: Add `POST /public/{kind}-articles/:slug/helpful` with body {helpful:boolean}, its own Redis-backed limiter, an `ArticleHelpfulVote` row (or reuse the fingerprint+day-bucket scheme from §7.3) for idempotency, a 409 on repeat, counter denormalisation included in
- **`moderation.service.ts` persists its keyword blocklist to `src/data/blocked-keywords.json` on the pod filesystem (verified: moderation.service.ts:15 `path.join(\_\_dirname,'../data/blocked-key**
  fix: Add a Phase 0 task: migrate the blocklist to `SystemConfig` (or Redis with a SystemConfig source of truth) with a cached read, before any comment path depends on it. Keep the JSON file as a seed/fallback so nothing is removed.
- **The Kafka change is described as producer-only. §7.2 says 'Three `content.article.*` topics; `EVENT_TO_TOPIC` is `Record<KafkaTopics,string>` so omission is a compile error' — but `consumer.**
  fix: Add R13: 'Adding a topic to ConsolidatedTopics changes the consumer subscribe loop — a missing Aiven topic is a total outage of all consolidated streams.' Mitigation: provision `ha.content` on Aiven as a gated pre-deploy step (owner named in S7), and/or wrap t
- **§4.1 asserts 'The three design passes disagreed on four load-bearing points' and settles D1–D4, but at least four more live contradictions from the critic set are left unresolved: (1) per-ro**
  fix: Add D5 (single ISR table: one revalidate value per route, chosen against the sitemap <lastmod>/IndexNow window), D6 (one embed policy — either no iframe anywhere, or a host allowlist enforced identically on both sides of the R11 shared source of truth), D7 (se
- **D3 fixes the three public list paths but never resolves the slug-vs-id keying that the critics flagged as blocking: the comment list and comment POST cannot be addressed without a documented**
  fix: State in D3 whether public comment endpoints are `/public/articles/:articleId/comments` (requiring the detail response to return `id`) or `/public/{kind}/:slug/comments` (requiring a server-side slug resolution + 404 semantics), and make that decision a named
- **No audit trail for any public mutation. `audit()` only fires when `req.user` is present, so guest comment submit, vote and report produce zero AuditLog rows — there is no record of an attack**
  fix: Add a guest-capable audit path (a `publicAudit()` variant, or relax the `req.user` guard for a whitelisted action set) writing actor=`guest:{fingerprintHash}` with articleId + outcome, and confirm the redaction list covers the body. Also add `details` to SENSI
- **No input sanitization or reserved-name policy for the non-body text fields: `excerpt`, `metaTitle`, `metaDescription`, `heroH1`, `authorName` and — critically — `guestName`, which has no bra**
  fix: Zod-level: strip-tags + length caps on all six fields, plus a `RESERVED_DISPLAY_NAMES` regex (hire ?adda, admin, moderator, support, staff, official, team) rejected at 400 on guestName. Also state that `guestEmail` is never rendered in any public payload.
- **The sanitizer allowlist permits `class` with no allowlist. §7.1 constrains tags, attrs, rel-forcing, https img src and iframe, but an arbitrary `class` from a compromised editor session inje**
  fix: Restrict `class` to a fixed prefix set (e.g. only `article-*` / a named typographic allowlist), or drop `class` entirely and express body styling through element selectors under `.article-body`. Mirror the same list on the client copy per R11.
- **§7.4 says the ETag layer 'is separate … and must be invalidated too', but never addresses the security half: `etagCache`'s store is keyed `etag:${req.originalUrl}:${userId}` with no `::a0/::**
  fix: State explicitly: apply the same auth-bucket keyGenerator to `etagCache` as to `cache()`, or bypass `etagCache` entirely on any route reachable by an authenticated admin. Add it to the DoD endpoint checklist.
- **No right-to-erasure path for a guest commenter. Phase 8 says 'DPDP export + erasure' and Phase 3 adds an erasure worker for `deletionRequestedAt`, but a guest has no account — the only self-**
  fix: Specify a `POST /public/comments/erasure-request` (email token, 24h TTL) + `article-comment.service.eraseByGuestEmail()` that anonymises guestName/guestEmail/ip/ua/fingerprint and tombstones the body, modelled on `whatsapp-contact.service.ts:546` / `email-cont
- **`noindex` and `canonicalUrl` are model columns with no discovery-side consumer. §7.2 extends `getSitemapLastmods()` 'from 6 to 9 aggregates … plus the counts' but never says the aggregates a**
  fix: State that every article aggregate, count and shard-item query filters `status:'PUBLISHED', noindex:false, canonicalUrl:null` (or canonicalUrl equal to its own URL), and that `fetchPublicCount` uses the same predicate so advertising and contents agree.
- **Unbounded `ArticleRevision` growth, and it contradicts the autosave design. The backend snapshots the previous state on every save while the editor autosaves every 20s and on blur — ~180 ful**
  fix: Decide one: snapshot only on explicit save / publish / status transition, plus a content-hash dedupe and a retention rule (keep last N=50 + all published versions), enforced by a prune step in `article-reconcile-counters` or its own daily job.
- **No handling of an article changing `kind` (BLOG→NEWS→HELP). The URL prefix is derived from kind, so a routine reclassification silently moves the article to a different URL space. `ArticleSl**
  fix: Make `ArticleSlugRedirect` store (fromKind, fromSlug) → (toKind, toSlug) and write a row on any kind change too; fire the IndexNow removal ping for the old URL and the publish ping for the new one; state the reserved-slug check re-runs against the destination
- **No canonical or robots policy for the `ArticleListShell` filter searchParams. The plan keeps the design's 'write every filter into the URL so state is linkable and crawlable' without a rule,**
  fix: State the rule: filtered URLs self-canonical to the unfiltered hub and carry `robots: noindex, follow`; only the hub routes (/blog, /blog/category/x, /blog/tag/x) are indexable; chip links to filtered states carry rel=nofollow or are client-side-only.
- **Seven of the thirteen phases (54%) are compressed into a 12-line table — one cell each, 30–123 words. Phases 0–5 occupy 180 lines; Phases 6–12 occupy 12. There is no task breakdown, no file **
  fix: Expand each of Phases 6–12 to Phase-2 parity: a 'files to create' table (path + modelled-on in-repo file), a 'files to modify' table (path + exact change), an ordered task list, and a phase-scoped acceptance block. Minimum bar: every deliverable named in the c
- **The highest-risk phase in the plan (it is the phase that flips live SEO surfaces) is one 123-word cell containing 16 discrete deliverables: shard split, blog shard append, fetchPublicCount e**
  fix: Split Phase 7 into sub-phases 7.1 shard arithmetic (files: frontend/src/lib/sitemap-shards.ts, app/sitemap.ts, app/sitemap-index.xml/route.ts, app/sitemap-news.xml/route.ts), 7.2 feeds (explicit route paths + item shape + limit + revalidate), 7.3 redirects/410
- **The plan says 'RSS/Atom/JSON feeds for blog and news (+ per-category)' but never acknowledges that frontend/src/app/feed.xml/route.ts, feed.atom/ and feed.json/ already exist and serve the 1**
  fix: State explicitly that the three root feeds stay jobs-only and unmodified, and enumerate the new paths (e.g. /blog/feed.xml|.atom|.json, /news/feed.xml|.atom|.json, /blog/category/[cat]/feed.xml). Reuse the existing route.ts as the 'modelled on' reference and p
- **Comments are specified in four other phases (models in 1, article-comment.service/controller/routes/schema in 2, CommentSection/List/Item/Form in 4, moderation queue page in 5) and then agai**
  fix: Add an explicit 'owned by this phase / already built in phase N' split at the head of Phases 6 and 8, and cross-reference from the earlier phases ('comment write path lands in Phase 2; thread UI, notifications and moderation lifecycle land in Phase 6').
- **The plan itself calls this 'the single biggest unstated dependency: there is no content' and then leaves it unstated. No article count per kind, no locale coverage (the model supports 6 loca**
  fix: Specify: N help + N news + N blog articles with named working titles, the locale matrix, the seed script path and its idempotency key (upsert on [kind,slug,locale]), the category/tag/author fixture list, the importer's accepted input formats, and an acceptance
- **Phase 11 requires 'E2E (publish → sitemap → indexing)' but no E2E harness exists in the repo — neither package.json has Playwright or Cypress; the only test runners are backend/jest.config.j**
  fix: Either scope the E2E harness as its own task (tool choice, config file, CI job, one smoke spec) or replace E2E with a jest integration test plus a documented manual launch checklist. Enumerate test file paths under the existing **tests** dirs, state the covera
- **Only Phase 0 has acceptance criteria (its table has an 'Acceptance' column). Phases 1–12 have none; there is a single global Definition of Done (§13) whose ten bullets are phase-agnostic and**
  fix: Keep §13 as the global floor and add a 3–6 bullet 'Exit criteria' block to every phase, expressed as observables (e.g. Phase 1: 'migrate diff produces zero drift on a clean checkout; the six GIN indexes are present via the post-deploy assertion; prisma generat
- **There is no per-phase task checklist. The only checkboxes in the file are the ten global DoD bullets. Phases are expressed as prose tables and semicolon-joined sentences, so there is no unit**
  fix: Add a numbered, checkbox-form task list per phase (T1.1, T1.2, …) where each task names its file(s) and maps to one exit criterion. This also gives the resume-after-interruption story the plan currently lacks.
- **Localisation is modelled but has no URL strategy, and the two halves contradict each other. `@@unique([kind, slug, locale])` lets an `en` and a `hi` article share slug `x`, but the public ro**
  fix: Settle the URL space in Phase 0 as a blocking decision (S8): either (a) `/{locale}/blog/[slug]` with `en` unprefixed + per-locale generateStaticParams + locale negotiation in `src/proxy.ts` + `x-default`, or (b) locale-suffixed slugs with `@@unique([kind, slug
- **Only sanitised HTML is persisted. That is a one-way door: no structured representation means no reader mode, no AMP/Web Story, no app/JSON delivery, no per-block re-render, no embed re-hydra**
  fix: Persist `bodyJson Json` (tiptap ProseMirror doc) as the source of truth alongside derived `bodyHtml`/`bodyText`, plus `bodyFormatVersion Int` so the renderer can migrate old docs. Derive HTML server-side from JSON on save (one renderer, one allowlist) rather t
- **No content-modelling flexibility. Three kinds are hardcoded in a Prisma enum, every kind shares one identical field set, and there is no custom-field or block layer. Adding case studies, pre**
  fix: Add an `ArticleType` registry row (slug, label, route prefix, enabled fields, JSON-LD type, feed inclusion, shard participation, workflow profile) with the three kinds seeded, so a 4th type is data not code. Add a `fields Json` custom-field bag validated per t
- **Paywall / gating is entirely absent, despite the repo shipping the full apparatus: `entitlement.service.ts`, `middleware/plan-gate.ts`, `UpgradeModal`, `PremiumLockBadge`, per-plan feature f**
  fix: Add `accessLevel enum { PUBLIC, REGISTERED, PLAN_GATED, LEAD_GATED }` + `requiredFeature String?` + `teaserBlocks Int`. Enforce truncation server-side (never ship the full body and hide it with CSS), emit `isAccessibleForFree:false` + `hasPart{cssSelector}` JS
- **No internal-linking or content-graph layer — the highest-ROI system in an SEO-driven editorial platform. No link extraction on save, no `ArticleLink` edge table, no incoming-links panel, no **
  fix: On publish, parse `bodyJson` and materialise `ArticleLink { fromArticleId, toArticleId?, toEntityType, toEntityId?, href, anchorText, rel, isExternal }`. Build an incoming-links panel, orphan and dead-end reports, a broken-link cron (internal 404s + external H
- **Editorial workflow and approvals — the defining feature of an enterprise CMS — is one status enum value plus one clause in a bullet list, and S6 explicitly defers the decision ('Decide: ADMI**
  fix: Resolve S6 into a written role matrix now. Add `ArticleAssignment { articleId, userId, role: AUTHOR|EDITOR|REVIEWER|TRANSLATOR, assignedBy, dueAt }` and `ArticleWorkflowEvent { articleId, from, to, actorId, note, createdAt }`. Extend `ArticleStatus` with `CHAN
- **Roles and permissions are two roles with one ownership check, undecided. No Contributor/Author/Editor/Publisher/Translator/Moderator/Analyst separation, no per-kind permissions (a news edito**
  fix: Define a capability matrix (`article.create`, `article.edit.any`, `article.publish`, `article.publish.news`, `article.schedule`, `article.seo.edit`, `article.redirect.manage`, `article.translate`, `comment.moderate`, `comment.pii.read`, `media.delete`, `analyt
- **Collaboration is a 409. No soft edit lock ('Priya has been editing for 4 minutes'), no presence, no comments/annotations on drafts, no @mentions, no conflict-resolution UX beyond an error, n**
  fix: Add `ArticleLock { articleId, userId, acquiredAt, heartbeatAt }` with a 60s heartbeat, takeover-with-warning and release on navigate. Add presence via the existing Firebase RTDB presence infra or Socket.IO. Add `ArticleNote { articleId, blockId?, authorId, bod
- **Content audit and decay reporting is entirely missing, and it is the operational core of a help centre and the thing that keeps a blog ranking. No `nextReviewAt`/owner/review cadence, no sta**
  fix: Add `reviewIntervalDays`, `nextReviewAt`, `ownerUserId`, `lastReviewedAt/By`. Build `/super-admin/articles/audit` with tabs: Review due, Decaying (ArticleViewDaily baseline + trend), Low helpfulness (plus the free-text 'what was missing?' capture the plan neve
- **No performance budgets anywhere, and one concrete regression is planned in: body images arrive as sanitised raw `<img>`, bypassing `next/image` — no responsive srcset, no AVIF/WebP, no intri**
  fix: Rewrite body `<img>` server-side into `next/image` or `<picture>` with R2/Cloudflare Image Resizing srcset + dimensions captured at upload; reject dimensionless images at upload. Set CI-checked budgets per route (LCP ≤2.5s p75 on 4G, CLS ≤0.05, INP ≤200ms, rou
- **The plan asserts a Cloudflare purge is required but no such service exists (grep for purge in backend/src finds only whatsapp-cron), and nothing names the API token, zone id, env vars, seale**
  fix: Build `src/services/cdn-purge.service.ts` (zone id + scoped token via the documented SealedSecret workflow), purge by URL list on publish/unpublish/slug-change/category-change, retry via a queue with a dead-letter, record outcomes, and alert on failure. Add a
- **The API contract does not exist. S5 makes 'freeze the API contract' a Phase 0 _deliverable_ (`article-system-api-contract.md`) — I confirmed `d:/Projects/hire_adda/article-system-api-contrac**
  fix: Inline the full contract into the plan (or ship the contract file with it): for every endpoint — method, path, mount point, auth guard + role + MFA requirement, rate limiter, query params with types and defaults and caps, request body zod field list, response
- **Models are prose, not schema. Only the 3 enums are real code. All 11 models are a markdown table whose 'Key notes' column lists some field NAMES with zero types, zero optionality, zero defau**
  fix: Write all 11 models as literal Prisma blocks, copy-paste ready — every field with type/optionality/default/attributes, every relation with `fields`/`references`/`onDelete`, every `@@unique`/`@@index`/`@@map`. Six models (`ArticleTag`, `ArticleAuthor`, `Article
- **The relational core is self-contradictory and undefined. `Article` is described with `tags String[]` while `ArticleTag` is simultaneously a first-class model with `articleCount` — no join ta**
  fix: State explicitly: Article→Category (one-to-many? many-to-many?), Article→Tag (join model `ArticleTagOnArticle` or denormalised array + sync trigger — pick one and name it), Article→Author (FK `authorId` → `ArticleAuthor.id`), and a separate `createdByUserId` →
- **No back-relations on existing models are specified. `ArticleComment` has a `userId` FK with `SetNull`, `ArticleAuthor` has an 'optional `userId` FK', `ArticleCommentVote`/`Report`/`BlockedCo**
  fix: List every edit to every existing model (`User`, and any others) as literal added lines, plus any new values needed in existing enums (e.g. `NotificationType` for the Phase 6 reply notifications, which is mentioned as a feature but never as a schema change).
- **There is no locale URL strategy, yet the design is locale-aware end-to-end. `Article.locale` (6 locales), `@@unique([kind, slug, locale])`, `translationGroupId`, 'locale must be part of the **
  fix: Decide and document: URL shape per locale, `x-default` target, how `useFaqLocale` maps to it, what `alternates.languages` emits, and how the sitemap shards enumerate locale variants (this also changes the shard count arithmetic in D2/R6).
- **S6 is written as an open question ('Decide: ADMIN gets ... SUPER_ADMIN gets ...') and never resolved. Separately, the entire CMS in §10 is routed under `/super-admin/articles`, but `Role` in**
  fix: Resolve it in the plan: final permission matrix (role × action × endpoint), which route(s) ADMIN authors use and how the frontend guard changes, whether MFA is required for ADMIN authors, and whether reads are gated. Then propagate into the (missing) API contr
- **The whole body-transport design is contingent on a spike, with no specified fallback. S1 says 'if it fails, fall back to base64-in-JSON + path-scoped parser and re-verify' — but the plan nev**
  fix: Either write both paths fully (primary + fallback, each with route mount, middleware order, field names, limits), or run S1 now and delete the loser from the plan.
- **Called 'the pivot of the design', specified in 9 words. No tag allowlist, no attribute allowlist, no URL-scheme policy beyond 'https-only img src', no heading-id algorithm, no `readMinutes` **
  fix: Enumerate the exact ALLOWED_TAGS/ALLOWED_ATTR arrays, the hook list, the version constant name, the physical file the shared allowlist lives in, and how the frontend consumes it (duplicated file + CI equality test, or published shared module).
- **Seven phases — comments, SEO/sitemap/feeds, analytics/compliance, navigation, seed/backfill, testing/launch, deferred — are one table row each, a single comma-separated cell. Phase 7's cell **
  fix: Expand each of Phases 6–12 to the granularity of Phase 2's §7.1/§7.2 tables: files to create, files to modify with the specific change, and a checkbox task list.
- **There is no per-phase checklist. §13 is a single global 10-item DoD reused for all 13 phases, and half of it is unverifiable as written ('No existing behaviour changed', 'Every artefact in t**
  fix: Add a per-phase 'Artefacts' checklist (one line per file/endpoint/page/component, tickable) plus per-phase exit criteria that are mechanically checkable (specific commands, specific URLs returning specific shapes).
- **The mitigation is not implementable as written. Confirmed the plugin is absent from frontend/package.json. The plan says 'scope the plugin so it only applies inside `.article-body`' but give**
  fix: Specify the exact install + registration lines for Tailwind v4 (`@plugin` directive or hand-written `.article-body` prose CSS instead), and name the ~20 existing `prose` consumer files that must be screenshot-diffed.

---

## Part 3 — Plan-completeness minor findings (18)

1. **Only the backend `src/services/indexnow.service.ts` is listed. The frontend half of the IndexNow wiring — `frontend/src/lib/indexnow.ts` and the `frontend/src/app/api/indexnow-ping/` route handler, which is what actually forwards **
   - where: §7.2 files-to-modify — IndexNow
   - fix: Add both frontend files to the modify table and state whether article pings go backend-direct or through `/api/indexnow-ping`.

2. **DPDP export/erasure is covered, but the user-facing policy pages are not. Guest comment PII (`guestEmail`, `ipAddress`, `userAgent`, `fingerprintHash`) and the comment cookie/fingerprint mechanism need copy in `/privacy` and `/coo**
   - where: §11 Phase 8 — compliance
   - fix: Add a task per legal page (`/privacy`, `/cookie-policy`, `/terms`) and a new `/community-guidelines` (or comment-policy) page linked from the comment form, with the retention TTL from G-7 stated in user-facing language.

3. **The plan says `STANDALONE_SITEMAP_PATHS` 'becomes a function', but it is currently `export const STANDALONE_SITEMAP_PATHS: ReadonlyArray<string>` (`sitemap-shards.ts:56`) — changing a const to a function is a breaking export-shape**
   - where: §2.2 + §11 Phase 7 — STANDALONE_SITEMAP_PATHS
   - fix: Keep the const as a computed/back-compat export alongside the new function, and specify the full `<news:news>` and `<image:image>` field emission for article shards.

4. **The plan's own supporting evidence (the '193 gaps' from the 15-agent run) lives only at a session-scoped temp path that the plan itself admits may be gone, and the Phase-0 deliverable `article-system-api-contract.md` does not exis**
   - where: §15 Appendix + §5 deliverable
   - fix: Copy the audit output into a committed `doc/` file (or fold its actionable items into the plan), and write `article-system-api-contract.md` now while full system context exists — that was the user's stated reason for planning before implementing.

5. **The DoD has no bullet for tests — a phase can satisfy all ten bullets with zero tests written, which contradicts the existence of Phase 11 and the 'nothing partial' constraint. It also has no bullet for documentation/runbook updat**
   - where: §13 Definition of Done
   - fix: Add DoD bullets for tests accompanying each phase's code, runbook/contract-doc currency, and explicit feature-flag state at phase exit.

6. **Phase 2's security and caching sections are strong on rationale but are flat bullet lists with no file attribution and no acceptance — e.g. 'deep-pagination caps on public list endpoints' gives no cap value, 'a global comments-per**
   - where: §7.3 / §7.4 Phase 2 — hardening and caching bullet lists
   - fix: Attach concrete values (max limit, max offset, comments/day/user, links allowed on first post, AUTO_FLAG_THRESHOLD reuse) and the owning file for each bullet.

7. **The plan's supporting evidence is a session-scoped temp file (verified present today at 625KB, tasks/w58hqiipv.output) that will be gone at implementation time. The plan says re-running the audit is cheap but gives no command, no **
   - where: §15 Appendix + §5 Phase 0 deliverable
   - fix: Either inline the gap list (or its unaddressed remainder) into an appendix table in the repo, or copy the audit output to a durable path under the repo/docs before implementation starts.

8. **'notification preference entries' is one clause, but in this repo notificationPreferences is a Json blob on two Prisma models (schema.prisma:731 and :859) plus a frontend preferences UI. Adding article/comment reply preferences me**
   - where: §11 Phase 6 — notification preference entries
   - fix: Name the two Json shapes, the new keys, the default for existing rows, and the frontend preferences page file.

9. **The plan contains open decisions and unbounded deferrals, contradicting the standing bar. S6 says 'Decide'; §10 says 'either build it or cut the metric'; §4.2 defers Elasticsearch; Phase 12 defers per-category feeds and GSC. Defer**
   - where: §5 Phase 0 S6, §10 ('either build it or cut the metric'), §4.2 (ES deferred to Phase 12)
   - fix: Convert every 'decide' into a decided line in Phase 0 with recorded rationale (D5, D6, D7…). Add an explicit 'Deliberately not in v1' section listing each deferral with its reason and the trigger condition for building it, so the user can accept or reject each one before implementation starts.

10. **Specification depth collapses after Phase 5. Phases 0–5 name files, line numbers and precedents; Phases 6–12 are single table cells. Phase 7 alone contains ~12 distinct subsystems (shard split, 3 feed formats × 2 kinds, per-catego**

- where: §11 Phases 6–12 (one table row each)
- fix: Expand Phases 6–12 to Phase 1–5 fidelity: a create/modify file table with modelled-on precedents, per-artefact acceptance criteria, and a per-phase DoD checklist. Enumerate the ~40 components by name and path.

11. **Testing is one phase row and the DoD has no test criteria. No coverage target, no fixture strategy, no contract tests for the three sitemap-called endpoints (whose shape is load-bearing per D4 — a missing `pagination.total` silent**

- where: §13 Definition of Done; §11 Phase 11
- fix: Add to the DoD: a sanitizer golden-file suite (XSS corpus in, expected HTML out), contract tests asserting `data.pagination.total` on all three public endpoints, JSON-LD and feed snapshot tests, redirect/410 integration tests, comment abuse-path integration tests, visual regression across every existing `prose` consumer, and a k

12. **No quota, cost or capacity envelope: R2 storage and egress for a growing media library, Redis memory for per-article-per-day HyperLogLog keys, BigQuery `content_events` volume and cost, Kafka `ha.content` retention, and Postgres g**

- where: §7.3 asset upload; §6.1 ArticleRevision
- fix: State the autosave-vs-revision policy explicitly (autosave updates the row; a revision is cut on manual save, status change, or after N minutes of accumulated change, retained to a cap of e.g. 100 per article plus all published versions kept forever). Add retention/TTL and rough cost lines for R2, Redis HLL, BigQuery and Kafka.

13. **Sitewide content surfacing names targets ('homepage, /jobs, /companies, footer-mega') without specifying the modules, their queries, caching, or empty-state behaviour when only a handful of seeded articles exist — which is the act**

- where: §9.5; §11 Phase 9
- fix: Specify each surface: component, query, item count, fallback below N items (hide the module entirely, never render sparse), cache TTL, and a launch-content minimum per kind that Phase 10 must satisfy before Phase 9 turns the surfaces on.

14. **The plan's supporting evidence (193 gaps, 8 audits) lives only in a session-scoped temp directory that the plan itself acknowledges will disappear. The S5 API contract, the role/capability matrix, the 'deliberately not in v1' list**

- where: §15 Appendix
- fix: Copy the audit output, the S5 API contract, the capability matrix, the deferral list and this gap list into version-controlled files under `docs/article-system/` beside the plan, and reference them by repo path rather than temp path.

15. **No frontend service, type or validator files are ever named, though the house structure requires them (frontend/src/services/_.service.ts, src/types/_.ts, src/validators/). Phases 4 and 5 assume `article.service.ts`, `article.type**

- where: §7.1 / §9 / §10 — frontend file inventory
- fix: Add a frontend files-to-create table mirroring §7.1, and correct the routes.ts path.

16. **The 193 identified gaps live only in a session-scoped temp file (`…/tasks/w58hqiipv.output`, 625KB — it exists today but will not survive). The plan surfaces perhaps 40 of them (G-1..G-7, R1..R12, plus the prose gap lists). The pl**

- where: §15 Appendix
- fix: Fold the surviving gaps into the plan as numbered, tickable items, or commit the audit output into the repo (e.g. `doc/article-system-audit.md`) so the appendix reference is durable.

17. **The migration folder name is hardcoded to `20260801120000_add_article_system`. If implementation slips past that date the timestamp precedes existing migrations' ordering assumptions, and there is no instruction to re-stamp. Also **

- where: §6.3 Migration
- fix: Say 'use the current UTC timestamp at generation time' and add the generate/verify steps.

18. **Rollback is one clause ('rollback story (CD auto-migrates and simultaneously flips public SEO surfaces)') and §6.3 says only 'no down path, rollback is forward-fix'. There is no actual procedure for the worst case: articles publis**

- where: §11 Phase 11 — rollback
- fix: Write the rollback runbook: feature-flag off sequence, shard de-advertisement, IndexNow/GSC handling, and what to do about already-indexed URLs.
