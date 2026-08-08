# Article System — Implementation Plan

**Help Articles · News · Blog · Comments · SEO · Super-Admin CMS**

|                     |                                                                                                                                                                                                                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**          | PLAN ONLY — not started. Do not implement until the user says "start implementing the plan".                                                                                                                                                                                                                                |
| **Created**         | 2026-07-31 · **Revised** 2026-07-31 (v2, after an adversarial completeness audit returned MATERIALLY_INCOMPLETE on v1)                                                                                                                                                                                                      |
| **Grounded in**     | 21 agents across two workflow runs: 8 codebase audits, 3 design passes, 4 gap critics (193 gaps), 6 completeness lenses (48 blockers, 82 major). Every file path, line number and convention below was verified against the actual repo.                                                                                    |
| **Bar**             | Every phase specified to the same depth · numbered tasks (`T{phase}.{n}`) · per-phase exit criteria · every file named.                                                                                                                                                                                                     |
| **Companion files** | All committed to the repo, none deferred: `docs/article-system/data-model.prisma` (literal Prisma, all 29 models + 7 enums) · `docs/article-system/file-inventory.md` (every file, create + modify, with its in-repo precedent) · `docs/article-system/audit-findings.md` (all 193 gaps + 48 blockers + 18 minor, verbatim) |

---

## 1. The original request (verbatim)

> ok now I want you make a full-flagged top notch detailed phase wise plan file for implementing this end-to-end across full-stack this empty shards and no yet implemented /public/help-articles /public/news /public/blog-article system and article is also not in sitemap/seo system as well so you have to implement all system end-to-end across full-stack like backend and model and routes and services and schema and article in sitemap and super-admin CRUD for these help article and news and blog article and management and then public pages for these like blog page and blog slug pages and news page and news slugs (details) pages and help article slug pages and help article integration in help&faq page and so much more system full enterprise grade help article system and news and blog article system end-to-end across full-stack with top notch seo and indexing system and top notch UI and all the enteprise grade features and functionalities like reply and comment system and so many more features. and full-flagged enterprise grade top notch CRUD and management and analytics system for these in super-admin with advanced features and functionalities and all the pages and everything. and putting in the header/footer and human-sitemap and more things like complete end-to-end system. so make proper detailed comprehensive plan file. also include more things and points which I have missed in this request. and mention that nothing shold break or remove while implementing this. and also put this exact my request prompt into the plan file as well. the plan file should be in the project root. and one more thing we will not exicute the plan yet we are just making the plan because we have currently full contect of system so make plan now and then whenever I say start implementing the plan. do full detailed audit and research before making the full-flagged comprehensive top notch enterprise grade plan of this massive implementation. and keep in mind and also mention in the plan that nothing should be left behind when implementing neither complex or major or minor things you have to implement everything end-to-end and nothing partial or gaps or half-implemented or skipped. and after making the complete plan file write in your memory as well about this plan so you always know that what we you to do when I say start implementing this plan. so I want describe anything then like read the plan file or bla-bla. ultracode is on and now start.

---

## 2. Non-negotiable constraints

1. **NOTHING MAY BREAK.** Every existing feature behaves identically afterwards. Blast radii in §12, each with a named mitigation and a regression check.
2. **NOTHING MAY BE REMOVED.** No file deleted, no export dropped, no route retired, no column dropped. Where something is _replaced_, the old symbol stays as a re-export or wrapper. The single sanctioned exception is `fallbackNewsItem()` (§3), gated on real data existing.
3. **NOTHING PARTIAL, NOTHING SKIPPED.** Minor items count as much as major: loading skeletons, error boundaries, empty states, alt text, ARIA labels, `llms.txt`, the human sitemap. A phase closes only when its exit criteria (per phase) **and** the global DoD (§13) are met.
4. **Match existing conventions.** Every artefact names the in-repo file it is modelled on.
5. **Additive-only** where this touches shipped systems.
6. **Deferred ≠ dropped.** Anything pushed to Phase 13 is listed there explicitly with a reason.

---

## 3. Current broken state (verified live 2026-07-31)

| Symptom                                                  | Root cause                                                                                                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| GSC reports **"Missing XML tag"** on sitemap shards 6–9  | They serve a well-formed but **empty** `<urlset>` (110 bytes, zero `<url>`). The spec requires ≥1 `<url>`.                                          |
| `/public/help-articles` → 404                            | **Never written.** `frontend/src/app/sitemap.ts:892` has called it since the sitemap shipped.                                                       |
| `/public/news` → 404                                     | Never written. Called by `sitemap.ts:926` **and** `sitemap-news.xml/route.ts`.                                                                      |
| `/sitemap-news.xml` declares the homepage a news article | `fallbackNewsItem()` (`sitemap-news.xml/route.ts:51`) re-dates the homepage "published seconds ago" every 5 minutes because the real endpoint 404s. |
| `/help/{slug}` advertised but 404                        | Shard 8 emits them; `app/help/[slug]/` does not exist.                                                                                              |
| No blog at all                                           | No route, no model, no shard.                                                                                                                       |
| Three Footer links are placeholders                      | `Footer.tsx:20-31` — "Career Advice", "Salary Guide", "Employer Resources" all resolve to `/help`.                                                  |

**The sitemap scaffolding already exists and is waiting:** `sitemap-shards.ts:45-46` declares `helpArticlesShardId`/`newsArticlesShardId`; `getShardLastmods()` (252-255) already comments _"Help + news articles have no backing public endpoint yet, so their shards are empty."_

---

## 4. Architecture decisions

All are **settled**. Do not re-litigate mid-implementation.

### D1 — Body transport: multipart on a dedicated endpoint

`PUT /api/v1/super-admin/articles/:id/body`, `multipart/form-data`, route-local `multer` memory storage.
_Why:_ `app.use(xssSanitize())` (app.ts:202) runs DOMPurify with `ALLOWED_TAGS: []` over every string in `req.body` (verified: `<p>Hello <b>world</b></p>` → `Hello world`), and `express.json({limit:'10kb'})` is global. `express.json` does not parse multipart, so `req.body` is empty when `xssSanitize` runs and the 10kb cap never applies.
_Fallback if S1 fails:_ base64 `bodyEncoded` in JSON behind `app.use('/api/v1/super-admin/articles', express.json({limit:'1mb'}))` mounted **above** the global parser (body-parser short-circuits on `req._body`). **Both paths are fully specified in §7.5** — S1 decides which ships, and the loser is deleted from the plan at that point.

### D2 — Empty sitemap shards: split the enumerators

`getGeneratedShardIds()` (unconditional superset → `generateSitemaps()`) vs `getShardIds()` (filtered → `sitemap-index.xml`). Empty shards keep their id and stay routable; they are simply not advertised, and return automatically once non-empty. **Nothing deleted.**

> ⚠️ New invariant: a new shard must be pushed into **both**. Advertised-not-generated = 404; generated-not-advertised = invisible.

### D3 — Public API paths and keying

One `article.routes.ts` mounted `apiV1Router.use('/', articleRoutes)` (`company-review.routes.ts` precedent), **not** appended to the 300-line `public.routes.ts`.
**Keying is by `kind` + `slug`, never uuid, on every public route** — including comments: `/public/articles/:kind/:slug/comments`. The detail response still returns `id` for admin deep-links, but no public URL contains one.
Three paths are contractually fixed because shipped frontend code already calls them: `/public/help-articles`, `/public/news`, `/public/blog`.

### D4 — Response envelope

`{ status: 'success', data: { items, pagination } }`. **`pagination.total` is mandatory** — `fetchPublicCount()` reads `body.data.pagination.total`; omit it and the shard is suppressed silently, forever.

### D5 — Locale: **English-only at v1**

The `locale`, `translationGroupId` columns and the `@@unique([kind,slug,locale])` constraint ship, but **only `en` rows are created, no hreflang is emitted, and no locale UI exists.**
_Why:_ the app has **no locale routing** — no `[locale]` segment anywhere in `frontend/src/app`, and `useFaqLocale` is client-side `?lang=` + localStorage. There is literally no URL for a Hindi blog post. Adding `/{locale}/` means a new route group, `proxy.ts` rewrites, every `ROUTES` constant, per-locale `generateStaticParams`, `x-default`, and it changes the shard arithmetic. Shipping locale columns without a URL space would make every canonical, hreflang and sitemap claim undefined.
**Multi-locale articles are Phase 13.1** — scheduled, not dropped. The schema is forward-compatible so no migration is needed then.

### D6 — ISR revalidate values (one table, authoritative)

| Route                        | revalidate               | Why                                                         |
| ---------------------------- | ------------------------ | ----------------------------------------------------------- |
| `/blog`                      | 300                      | index churn                                                 |
| `/blog/[slug]`               | 600                      | stable once published; publish fires on-demand revalidation |
| `/news`                      | 120                      | fastest-moving index                                        |
| `/news/[slug]`               | 300                      | must beat the 48h news window comfortably                   |
| `/help`                      | 300                      | matches today's value — unchanged                           |
| `/help/[slug]`               | 3600                     | help content is stable                                      |
| category / tag / author hubs | 300                      |                                                             |
| all feeds                    | 300 (news 300, blog 600) |                                                             |

### D7 — Embed policy: **no `iframe`, anywhere, either side**

The server allowlist and the client allowlist are byte-identical (§7.5) with a shared `SANITIZER_VERSION` asserted equal by a CI test. Video embeds are Phase 13.2 via a vetted oEmbed shortcode, not raw HTML.

### D8 — Feeds

The existing `/feed.xml`, `/feed.atom`, `/feed.json` **stay jobs-only and unmodified.** New feeds are additive: `/blog/feed.xml|.atom|.json` and `/news/feed.xml|.atom|.json`. Per-category feeds are **Phase 13.3** (the v1 promise is withdrawn here rather than left contradictory).

### D9 — RBAC capability matrix (resolves the old open question)

| Capability                                   | ADMIN | SUPER_ADMIN |
| -------------------------------------------- | ----- | ----------- |
| `article.read`                               | ✅    | ✅          |
| `article.create`                             | ✅    | ✅          |
| `article.edit.own`                           | ✅    | ✅          |
| `article.edit.any`                           | ❌    | ✅          |
| `article.submit_review`                      | ✅    | ✅          |
| `article.publish`                            | ❌    | ✅          |
| `article.schedule`                           | ❌    | ✅          |
| `article.delete`                             | ❌    | ✅          |
| `article.seo.edit`                           | ✅    | ✅          |
| `article.review` (approve / request-changes) | ✅    | ✅          |
| `article.redirect.manage`                    | ❌    | ✅          |
| `comment.moderate`                           | ✅    | ✅          |
| `comment.pii.read`                           | ❌    | ✅          |
| `media.delete`                               | ❌    | ✅          |
| `analytics.read`                             | ✅    | ✅          |

MFA (`requireMfaEnabled`) is required for **write** capabilities only; reads are not MFA-gated, so an ADMIN without MFA can still read the CMS. Enforced by a `requireCapability(cap)` middleware, not scattered `restrictTo` calls.

**These capabilities are unreachable unless the pages let ADMIN in.** Granting ADMIN a capability is meaningless if every CMS page is `requiredRole={['SUPER_ADMIN']}` — the matrix above would be decorative. So:

| Reachable by ADMIN + SUPER_ADMIN                                                                                                                                                                                     | SUPER_ADMIN only                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `articles`, `articles/new`, `articles/[id]`, `articles/[id]/edit`, `articles/[id]/preview`, `articles/[id]/revisions`, `articles/comments`, `articles/blocked-commenters`, `articles/calendar`, `articles/analytics` | `articles/redirects`, `articles/seo/*`, `articles/types`, `articles/assets` (`media.delete`), `articles/audit` |

`DashboardLayout requiredRole={['SUPER_ADMIN','ADMIN']}` on the first set — the two-role array is an established in-repo pattern (`super-admin/assisted-hiring/page.tsx:71` and its `[id]/page.tsx:185` already ship exactly it).

> ⚠️ Publish, schedule and delete live **inside** `articles/[id]/edit`, which ADMIN can reach. Page-level `requiredRole` cannot express a per-action matrix, so `ArticleWorkflowBar` and `ArticlePublishChecklist` must render their actions from the **capability set the backend returns**, not from the role. The page is role-reachable; the buttons are capability-gated.

> ⚠️ `Sidebar.tsx` has a separate `adminStructure()` (line 332). D14's "Content" group must be mirrored there in filtered form, or an ADMIN has the permissions and no navigation to use them.

### D10 — Body source of truth: **sanitised `bodyHtml`** _(revised — the earlier draft said `bodyJson`, which nothing in this plan could produce)_

**The revision, and why it was forced.** The original D10 made `bodyJson` (ProseMirror) the source of truth with HTML derived server-side. That is the better architecture in the abstract — one renderer, one allowlist, safe re-sanitisation after an allowlist change — but the plan never contained the machinery to do it, and the gap is not small:

- `backend/package.json` has **no** `@tiptap/*`, no `prosemirror-*`, no `jsdom`. A server-side ProseMirror renderer would mean installing the TipTap schema plus every extension package on Express.
- The extension module this plan defines (`components/ui/rich-text/article-extensions.ts`) lives under `frontend/src/` and would carry React NodeViews — **unreachable from Express**, so it would have to be split into a framework-free schema half and a client-only NodeView half.
- `RichTextEditor.tsx` is `onChange: (html: string) => void` calling `editor.getHTML()` (line 39/301). There is no JSON path today, and §10.1 gives it exactly one new prop.
- §10.1 already specifies the opposite ("Editing is HTML-over-multipart, sanitised twice"), so the plan contradicted itself.

**Decision:** the **sanitised `bodyHtml` is the source of truth and the render source.** `bodyJson` remains a nullable column, written verbatim from the same editor instance in the same request, purely as a forward-compatibility artefact — it is **never** read back to render or to re-hydrate the editor.

**The rule that makes this safe:** the editor loads `bodyHtml`, not `bodyJson`. If the two ever disagree — which they can, because sanitisation may strip something the JSON still contains — the sanitised HTML wins, because that is what the public saw. Loading `bodyJson` back into the editor would silently resurrect stripped content on the next save, which is precisely the drift bug this rule closes.

**Consequently, every derived value is computed from the sanitised HTML, server-side, once:** `bodyText`, `wordCount`, `readMinutes`, the heading outline and ToC, the internal-link graph (`article-link.service.ts`), and the asset reference set for `refCount` (via `extractPublicId()` on each `img src`). One parser, one pass, in `article.service` immediately after `sanitizeArticleHtml()`.

> ⚠️ **The pass covers D16 content too.** FAQ answers and How-To steps are real words on the page, and a 400-word article with 600 words of FAQ would otherwise read as thin content, rank as unreadable, and be invisible to site search. So the derivation input is `bodyHtml` **plus** the article's FAQ `answerHtml` and How-To step text, each sanitised the same way. This also produces the **plain-text answer** `faqPageSchema()` needs — its `acceptedAnswer.text` must be text, not the stored HTML. `bodyFormatVersion Int` is retained and bumped when the allowlist changes, which is what enables a re-sanitisation sweep.

**What this costs, stated honestly:** no reader-mode/JSON delivery and no per-block re-render without an HTML parse. Both are acceptable at v1; **Phase 13.10** carries the upgrade to a true JSON pipeline if an app or per-block surface ever needs it.

> ⚠️ `ArticleNote.blockId` was specified as a "ProseMirror node id". With no JSON render path, notes anchor to the **generated heading id** (`injectHeadingIds`) plus a text quote, and degrade to article-level when the anchor no longer resolves.

### D11 — Content types are data, not code

An `ArticleType` registry row (slug, label, routePrefix, jsonLdType, enabledFields, feedInclusion, shardParticipation, workflowProfile) seeded with `HELP`/`NEWS`/`BLOG`. A fourth type (case study, press release) becomes a row, not a migration + enum + code change.

**`enabledFields` and `workflowProfile` need seeded values and a named reader, or they are decorative columns.** Both were declared and never given content. The seeded values:

| Type   | `enabledFields`                                                                                | `workflowProfile`                            | `includeInFeeds` |
| ------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------------- |
| `help` | body, faq, howTo, toc, category, tags, cover _(no author byline, no publish date on the page)_ | `simple` — DRAFT → PUBLISHED, no review step | **false**        |
| `news` | body, cover, author, category, tags, toc · **publish date required**                           | `review` — review required before publish    | **true**         |
| `blog` | everything: body, faq, howTo, toc, cover, author + co-authors, category, tags, series          | `standard`                                   | **true**         |

Read in exactly two places: the CMS editor hides panels for fields not in `enabledFields`, and `article-workflow.service.ts` selects the legal-transition subset from `workflowProfile`. **Required-field enforcement per kind** rides on the same column — a NEWS article without a publish date or an author fails its publish checklist, a HELP article does not.

> ⚠️ `includeInFeeds` defaults to `true` in the model, but D8 excludes help articles from feeds — so the **seed must set `help` to `false` explicitly**, or help content silently appears in the blog and news feeds.
> ⚠️ D11's headline promise is **narrower than it sounds**, and the plan should say so rather than let someone discover it: `ArticleType.kind` is a Prisma **enum**, so a genuinely new _kind_ still needs a migration. What a row buys is a new **type within an existing kind** — a "case study" that is a BLOG, a "press release" that is NEWS — with its own routePrefix, jsonLdType, SEO patterns, feed and shard participation.

### D12 — Access gating ships in v1

`accessLevel enum { PUBLIC, REGISTERED, PLAN_GATED, LEAD_GATED }` + `requiredFeature String?` + `teaserBlocks Int`. The repo already ships the whole apparatus (`entitlement.service.ts`, `middleware/plan-gate.ts`, `UpgradeModal`, `PremiumLockBadge`). **Truncation is server-side** — never ship the full body and hide it with CSS. Emits `isAccessibleForFree:false` + `hasPart{cssSelector}` JSON-LD so Google does not treat it as cloaking.

**Gating covers FAQ, How-To and the ToC — not just the body.** D12's truncation was written when the body was the only content. With D16 a gated article would ship its **complete FAQ answers and every How-To step** to anonymous readers, in the JSON payload _and_ in the `FAQPage`/`HowTo` JSON-LD — the substance of the article, free, below the paywall, and machine-readable. So on a gated response: body truncates to `teaserBlocks` as before, **FAQ and How-To are omitted entirely** (not emptied client-side), their JSON-LD nodes are **not emitted**, and the ToC lists only headings within the visible teaser. The `hasPart{cssSelector}` + `isAccessibleForFree:false` markup then describes what is genuinely gated, which is what keeps this honest rather than cloaking.

**`LEAD_GATED` is specified, not left as a dead enum member.** It was declared and then never mentioned again — no capture form, no storage, no admin surface. Either it works or it should not be in the enum (and striking it does not violate "nothing may be removed": the enum does not exist yet). It works:

- `model ArticleLead`, modelled on the **shipped** `VendorLead` (`schema.prisma:1449`) — `@@unique([articleId, email])`, optional name/phone, `consentId`, `source`, `fingerprintHash`.
- `POST /public/articles/:kind/:slug/lead` carries the **identical guard stack the plan already mandates for guest comments**, and this is the whole point of stating it: `publicLimiter` with its **own** `createRedisStore(prefix)` (a reused prefix throws `ERR_ERL_STORE_REUSE` at boot), Turnstile **failing closed** (T0.3), `publicAudit()` (plain `audit()` fires only when `req.user` exists, so a guest lead would otherwise be unaudited), a `ConsentService` record, and the standing rule that `guestEmail`-class PII never appears in a public payload.
- Teaser truncation **reuses D12's server-side path verbatim** — no second truncation implementation.
- Admin: one `articles/leads/page.tsx`, exporting through the existing report pipeline.

**In-article CTA blocks and job embeds are editor nodes, not a new CMS model.** Given D11 (`ArticleType.enabledFields`) the idiomatic move is a node in the article-only extension set, rendered by `ArticleBody.tsx` as a React component. The job embed stores **only a `jobId`**.

> ⚠️ There is no `JobCard` component in this repo — the shipped cards are `components/jobs/CandidateJobCard.tsx` and `CandidateCompactJobCard.tsx`, both candidate-dashboard-scoped. The article renderer needs a small **public-safe wrapper**, and it must not surface employer contact fields, which standing policy strips from every public payload (sole exception: the vendor job board). D7 is untouched — these are React components, not iframes.

### D13 — **All article IMAGES go to Cloudinary, never R2** _(corrects earlier drafts of this plan)_

Cover images and inline body images upload to **Cloudinary**. **Generated OG cards are not stored anywhere** — they are rendered on demand by Next `ImageResponse` route handlers (§9.6), so they are neither Cloudinary nor R2 objects. (An earlier draft said generated OG images upload to Cloudinary, which contradicted §9.6 and the file inventory.) R2 is not used by this system at all.

_Why this is the architecturally correct split, not a preference:_ the repo already draws this line cleanly —

- **Cloudinary = images.** `backend/src/config/cloudinary.ts` exports `uploadImage`, `uploadOptions`, `deleteImage`, `extractPublicId`; avatars, company logos and cover images all go through it (`employer.service.ts`, `candidate.service.ts`, `vendor.service.ts`, `super-admin.service.ts`), and `jobs/image-processing.worker.ts` already generates responsive variants into Cloudinary folders shaped `{entityType}s/{field}/{variant}`.
- **R2 = documents + backups.** Resumes, invoices, email attachments, WhatsApp media (`storage.service.ts`, `invoice.service.ts`, `email-attachment.service.ts`, `resume-toolkit.service.ts`).

**Three consequences, all simplifying:**

1. `ArticleAsset` stores a Cloudinary `publicId` + `secureUrl` + `variants Json`, not an R2 key. Deletion is `deleteImage(extractPublicId(url))`.
2. **No image-host whitelist work is needed.** `res.cloudinary.com` is _already_ in `next.config.ts` `images.remotePatterns` **and** in `lib/image-host.ts` `OPTIMISABLE_HOSTS`. Two previously-listed gaps disappear.
3. Article covers reuse `image-processing.worker.ts` — but **not "for free", and an earlier draft of this line was simply wrong**. Read the worker: `VARIANTS` is `100/200/400` **square** at `fit:'cover', position:'center'` (lines 10-13, 55), and the write-back branch only ever updates `candidateProfile` / `companyProfile` (lines 80-92). A 400×400 centre-cropped square is useless as a 16:9 card image, and nothing would persist it to an article row. Article covers therefore need **two real additions** to that worker: **(a) an `article` variant profile** at the ratios the surfaces actually render, and **(b) a write-back branch** persisting to `Article.coverImageVariants` / `ArticleAsset.variants`. Both are additive — the existing profile and both existing branches are untouched, so profile and logo processing is unaffected.

**The variant set, defined literally** (so "responsive images" is a contract, not an aspiration):
`{ card: 1280×720, hero: 1920×1080, social: 1200×630, square: 600×600, blur: dataUri }` — card grid and carousel consume `card`; the article hero consumes `hero`; OG/Twitter fall back to `social`; the compact/rail carousel variants consume `square`; `blur` is the placeholder.

**Crop the master at 16:9, not 1.91:1.** `CoverImagePicker` crops at the **widest ratio any surface renders (16:9)** and `social` (1.91:1) and `square` are derived server-side. Cropping the master at 1.91:1 — as an earlier draft specified — permanently destroys the pixels the 16:9 hero needs. The picker previews **all** named variants side by side, so an editor sees the square crop before saving rather than discovering a beheaded portrait on the homepage.

**Focal point:** persist `coverFocalX Float?` / `coverFocalY Float?` from the cropper and pass them to Cloudinary as `c_fill,g_xy_center`; where no focal point is set use **`g_auto`**, not a blind centre crop. (Note this is a _content-cropping and quality_ fix, not a CLS fix — `object-fit` inside a fixed `aspect-[16/9]` box already has zero layout shift.)

Upload path: `POST /super-admin/article-assets` → multer memory → `uploadImage(buffer, uploadOptions({ folder: 'articles/<kind>/<articleId>' }))` → enqueue `image-processing` for variants → persist `ArticleAsset`.

### D14 — Super-admin nav gets its **own new sidebar group**, "Content"

Per explicit instruction, article CMS entries do **not** go into the existing "Content & Moderation" group. A new top-level group **"Content"** is added to `superAdminStructure()` holding: **Articles** (list/new/edit/preview/revisions) · **Categories** · **Tags** · **Authors** · **Comments** (moderation + staff replies) · **Media** · **Content Types** (D11 registry) · **SEO** (nested: Patterns · Overrides · Indexing · Broken links · Redirects) · **Analytics** · **Content Audit**.

Nested items use the same `items:[]` sub-group shape the sidebar already supports (as WhatsApp and Email do), so "SEO" collapses rather than adding five top-level rows.

> ⚠️ Known consequence, accepted, and now measured against the real code. `Sidebar.tsx:589-596`: when a user has no `expandedOverride`, groups are **all** open at `length <= 5`; above that, only the **active group + `groups.slice(0, 2)`** are open by default. Super-admin already has **8** groups (People & Access · Content & Moderation · Vendors & Hiring · Support · WhatsApp · Email · Billing & Finance · Platform), so "Content" is the 9th and the rule already applies today.
> **Mitigation:** insert "Content" at index 0 or 1 so it lands inside `slice(0, 2)`. Note the real trade: doing so pushes whichever group currently sits at index 1 out of the default-open set. That is a visible change to an existing admin's sidebar, so it is a deliberate decision, not a free win — and it is why this is called out rather than silently shipped. Admins who have set an `expandedOverride` are unaffected either way.

### D15 — SEO is **derive-by-default, pin-on-edit**

The requirement is "as automatic and advanced as possible, with manual control in super-admin for whatever can't be automated". Those two pull against each other in the obvious implementation: if a human ever types a meta description, should a later title change regenerate it? Storing only the final string cannot answer that, and it is the reason most CMS SEO panels rot — every field silently becomes manual the first time anyone touches anything.

**Decision:** every SEO field is _derived_ from content on each save unless a human has explicitly overridden it, and the override is recorded as data.

- `Article.seoOverrides String[]` — the names of fields a human has pinned. Empty by default.
- A field absent from `seoOverrides` is **recomputed on every save** by `article-seo.service.ts` and is never stale.
- Editing a field in the SEO panel adds its name to `seoOverrides`. Each field has a visible **"Auto" / "Custom"** state and a one-click **"Reset to auto"** that removes the pin and immediately shows the regenerated value.
- Bulk "reset to auto" exists for a field across a filtered set, so a sitewide title-pattern change can reclaim articles whose authors pinned a value early.
- The derivation is **pure and versioned** (`SEO_RULES_VERSION`). Bumping it triggers a background recompute of every non-pinned field — which is what makes rule improvements retroactive instead of applying only to new content.

This one decision is what lets the system be genuinely automatic without ever fighting an editor who wanted a specific headline.

### D16 — FAQ and How-To are **structured records, authored in panels**, not prose in the body

Both were named as requirements and neither existed anywhere in this plan: "how-to" appeared **zero times** across all four files, and every FAQ reference was about the _pre-existing static corpus_ (`data/faqs/`, the `faqCategory`/`faqAudiences`/`faqPageContexts`/`relatedFaqIds` bridge fields) — a different feature that happens to share the name. Meanwhile `frontend/src/lib/json-ld.ts` already exports a **complete, correct, and entirely unused** `howToSchema()` (line 434, with `totalTime`/`estimatedCost`/`supply`/`tool`/`steps[]`) and `faqPageSchema()` (line 418). The generators exist; nothing feeds them.

**Decision: store them as relational records, author them in dedicated repeatable-row panels, render them at a fixed position, and emit their JSON-LD from the same records.** Not as TipTap body nodes.

_Why panels and not in-body nodes:_ two editors over one dataset is a drift bug. If FAQ pairs live in prose, generating valid `FAQPage` JSON-LD means parsing headings back out of HTML and hoping the author used the expected shape — the exact fragile coupling that makes structured data rot. A repeatable-row panel produces schema-valid data by construction, and it is also what "all their management in the super-admin panel" asks for.

_Why relational and not a `Json` column:_ per-step and per-answer images are Cloudinary assets, and `refCount` is recomputed from **references** (§8.1). An image referenced only inside a JSON blob would be invisible to that recompute and the nightly GC would delete a live image. An FK is visible.

**Models** (`ArticleFaq`, `ArticleHowToStep`) plus four `Article` columns (`howToEnabled`, `howToTotalTime`, `howToTools[]`, `howToSupplies[]`) — literal in `docs/article-system/data-model.prisma`. **`refCount` recompute must include FAQ answer images and How-To step images**, not just body and cover.

**JSON-LD composition.** `graph()` (json-ld.ts:1504) already composes multiple `@graph` nodes, so `FAQPage` and `HowTo` ride as **additional nodes** alongside the article node — `ArticleType.jsonLdType` being a single scalar is not a blocker. Gates: FAQ emits when ≥1 complete pair; How-To emits when `howToEnabled && steps.length >= 2`.

> ⚠️ **A real defect this exposes in the existing helper:** `articleSchema()` hardcodes `'@type': 'Article'` (json-ld.ts:957), so `ArticleType.jsonLdType` (`"BlogPosting"` / `"NewsArticle"`) **cannot be honoured at all** today. Parameterising `@type` belongs in the same edit — §9.5's "articleSchema() fixes" list did not mention it.

> ⚠️ **The one-FAQPage-per-page guard needs a mechanism, not three prose restatements.** `/help/{slug}` is a different URL from `/help`, so a per-article `FAQPage` there is legal; the real constraint is one `FAQPage` entity per _page_. But `PageFaqSection` emits its `faqPageSchema` **unconditionally today**, so "the article's blocks win" cannot happen by convention. The artefact is an explicit opt-out prop — `PageFaqSection` gains `emitSchema?: boolean` (default `true`, so all four existing consumers are unchanged), and the article page passes `emitSchema={false}` whenever the article has its own FAQ blocks. A single owner decides; nothing is left to render order.

> ⚠️ **`howToSchema()` has two required inputs the model does not carry.** `name` and `description` are non-optional in the shipped helper. Derive them (D15): `name` from `Article.title`, `description` from `metaDescription ?? excerpt`. Both are then covered by `SEO_RULES_VERSION` like every other derived field — no new columns, no empty required properties in the emitted JSON-LD.

> ⚠️ **Do not list How-To as a rich-result win.** Google retired How-To rich results for all sites in 2023. The payoff is authoring quality, on-page rendering, and AI/answer-engine surfaces — not a SERP carousel. Phase 12's Rich Results validation covers `FAQPage`; How-To is validated for correctness only.

### D17 — A **published article has a working copy**; edits never touch the live row

The plan had no unpublished-changes buffer, and that is not a missing nicety — it is a live-site defect. `Article` has one `bodyHtml` and one `status`; the public endpoint's predicate is `status:'PUBLISHED'`, which does not change while someone edits. So **a 2-second-idle autosave on a published article mutates the exact row the public page serves**, and D6's 300–600s ISR window is what decides how fast a half-written sentence reaches readers. Two of the plan's own mechanisms also become incoherent: `contentUpdatedAt` ("set only when the body, title or cover materially changes") and the `ArticleCorrection` trigger ("written from the path that detects a material body change on a PUBLISHED article") would both fire **on every autosave**, minting corrections notices and moving `<lastmod>`/`dateModified` while someone types. The plan even contradicted itself — §10.1 said autosave "updates the draft row" while no draft row was ever modelled.

**Decision:** while `status ∈ {PUBLISHED, ARCHIVED}`, every body and metadata write — manual save and `?mode=autosave` alike — targets **draft columns**. The live columns are what the public, the derived values, the sitemap and the JSON-LD all read, and they change only at an explicit promote.

- `Article` gains: `draftTitle`, `draftExcerpt`, `draftBodyHtml`, `draftBodyJson`, `draftCoverImagePublicId`/`Url`/`Alt`, `draftUpdatedAt`, `draftUpdatedById`, `hasUnpublishedChanges Boolean @default(false)`.
- `ArticleFaq` and `ArticleHowToStep` get `isDraft Boolean @default(false)` with the uniques widened to `[articleId, isDraft, position]`, so a live set and an edited set coexist. Without this, D16 content would bypass the buffer and go live immediately — the very bug this decision closes.
- **`POST /articles/:id/publish-changes`** — re-runs the publish checklist **against the draft columns**, promotes draft→live in one transaction, recomputes SEO/`bodyText`/links/`refCount`, cuts a revision, evaluates the `ArticleCorrection` trigger, then fires ISR revalidation + CDN purge + IndexNow.
- **`POST /articles/:id/discard-changes`** — drops the working copy, clears the flag.
- UI: an "Unpublished changes" banner plus a live-vs-draft diff in `ArticleWorkflowBar`, **reusing `RevisionDiffView`** rather than a second diff component.

> ⚠️ `contentUpdatedAt` and the `ArticleCorrection` material-change check are evaluated **only at promote time, never per save**. This is the whole point; wiring either to the save path reintroduces the defect in a subtler form.
> ⚠️ While `status` is `DRAFT`/`IN_REVIEW`/`CHANGES_REQUESTED`/`SCHEDULED`, there is nothing to protect — writes go straight to the live columns as before, and the draft columns stay null.

---

## 5. Phase 0 — Blocking spikes and decisions

**Nothing else starts until every row closes.**

| ID   | Task                                                                                                                                                                                                                                                                                                                          | Exit criterion                                                                                                        |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| T0.1 | Prove D1: POST a 400KB HTML body (`<p>`,`<b>`,`<img>`,`<table>`) through the real middleware stack **and through the BFF `/api/proxy/[...path]` hop**                                                                                                                                                                         | Body arrives byte-identical, no 413, no flattening. Loser transport deleted from §7.5.                                |
| T0.2 | Prove guest CSRF: `apiV1Router` carries `doubleCsrfProtection` (app.ts:333)                                                                                                                                                                                                                                                   | Logged-out browser POSTs a comment end-to-end                                                                         |
| T0.3 | `verifyTurnstile` fails **open** today (missing key → warn + proceed)                                                                                                                                                                                                                                                         | `CF_TURNSTILE_SECRET_KEY` added to the Zod env schema with a startup assertion                                        |
| T0.4 | Migrate `moderation.service.ts`'s blocklist off the pod filesystem (`src/data/blocked-keywords.json`, verified line 15) to `SystemConfig` with a cached read                                                                                                                                                                  | Blocklist survives a pod restart and is identical across replicas. JSON file kept as seed/fallback — nothing removed. |
| T0.5 | Provision Kafka topic `ha.content` on Aiven **before** any producer deploys (see R13)                                                                                                                                                                                                                                         | Topic exists; consumer subscribe loop verified against it                                                             |
| T0.6 | BigQuery `content_events` table DDL written and applied                                                                                                                                                                                                                                                                       | Table exists; `streamToBigQuery` tableMap entry lands cleanly                                                         |
| T0.7 | Feature flags in `backend/src/config/feature-flags.ts`: `article.system`, `article.comments`, `article.guest_comments`; sidebar `requiresFeature` wired; platform comments kill switch in `SystemConfig`                                                                                                                      | All four toggles flip behaviour without a deploy                                                                      |
| T0.8 | **Cloudinary** folder convention `articles/<kind>/<articleId>` + an upload preset with the transformation chain (D13). Confirm `CLOUDINARY_*` env vars are in the Zod schema. **No R2 work, and no image-host whitelist work — `res.cloudinary.com` is already whitelisted in both `next.config.ts` and `lib/image-host.ts`** | Upload → variant generation → `next/image` render round-trips from a non-prod pod                                     |
| T0.9 | Cloudflare purge credentials via the documented SealedSecret workflow (zone id + scoped token)                                                                                                                                                                                                                                | `cdn-purge.service.ts` (T2.19) can authenticate                                                                       |

---

## 6. Phase 1 — Data model & migration

### 6.1 Enums

```prisma
enum ArticleKind          { HELP NEWS BLOG }
enum ArticleStatus        { DRAFT IN_REVIEW CHANGES_REQUESTED SCHEDULED PUBLISHED ARCHIVED DELETED }
enum ArticleCommentStatus { PENDING APPROVED FLAGGED REJECTED DELETED }
enum ArticleAccessLevel   { PUBLIC REGISTERED PLAN_GATED LEAD_GATED }
enum ArticleAssignmentRole{ AUTHOR EDITOR REVIEWER TRANSLATOR }
```

### 6.2 Models (literal, copy-paste ready)

Placed after `OffPlatformResume` (schema:5051) under a 3-line `// ====` banner matching the EMAIL SYSTEM block. `///` doc comments on every model.

> ⚠️ **`docs/article-system/data-model.prisma` is the single source of truth for the schema.** The `Article` block below is an excerpt reproduced for narrative context, and the two copies have already drifted once (`tocEnabled`, `isTemplate`, `conversionCount`, `relatedArticleIds` were added to the model file and missed here). **Copy from the model file, never from this block**, and if you change one, diff the other — the `migrate diff` drift this causes is exactly what §6.4's exit criterion tests for.

```prisma
model Article {
  id                 String        @id @default(uuid())
  kind               ArticleKind
  typeSlug           String        @default("blog")     // → ArticleType.slug (D11)
  slug               String
  locale             String        @default("en")        // D5: only "en" written at v1
  translationGroupId String?
  status             ArticleStatus @default(DRAFT)

  title       String
  excerpt     String?
  bodyJson          Json?                                 // D10 — forward-compat only, NEVER read back
  bodyHtml          String?                               // derived
  bodyText          String?                               // derived, search + reading time
  bodyFormatVersion Int    @default(1)
  wordCount         Int    @default(0)
  readMinutes       Int    @default(0)

  coverImagePublicId String?                               // Cloudinary (D13)
  coverImageUrl      String?                               // secure delivery URL
  coverImageAlt      String?
  coverImageWidth    Int?
  coverImageHeight   Int?
  coverImageVariants Json?                                 // card/hero/social/square/blur — D13
  coverFocalX        Float?                                // → c_fill,g_xy_center; null ⇒ g_auto
  coverFocalY        Float?

  // SEO — every field DERIVED on save unless named in `seoOverrides` (D15).
  metaTitle       String?
  metaDescription String?
  canonicalUrl    String?
  keywords        String[] @default([])
  focusKeyword    String?
  noindex         Boolean  @default(false)
  nofollow        Boolean  @default(false)
  noarchive       Boolean  @default(false)
  maxSnippet      Int?
  maxImagePreview String?
  maxVideoPreview Int?

  ogTitle            String?
  ogDescription      String?
  ogType             String? @default("article")
  ogImageUrl         String?
  twitterCard        String? @default("summary_large_image")
  twitterTitle       String?
  twitterDescription String?
  twitterImageUrl    String?

  seoOverrides    String[] @default([])                    // pinned by a human
  seoRulesVersion Int      @default(1)
  seoScore        Int?
  schemaOverride  Json?

  accessLevel     ArticleAccessLevel @default(PUBLIC)     // D12
  requiredFeature String?
  teaserBlocks    Int                @default(2)

  categoryId String?
  authorId   String?
  tags       String[] @default([])                        // denormalised mirror of ArticleTagOnArticle

  // Bridge to the PRE-EXISTING static FAQ corpus — NOT the D16 per-article
  // FAQ blocks. Same word, different feature.
  faqCategory       String?
  faqAudiences      String[] @default([])
  faqPageContexts   String[] @default([])
  relatedFaqIds     String[] @default([])
  relatedArticleIds String[] @default([])          // editor-curated; falls back to category → tags → recent

  approvedAt         DateTime?                     // "DRAFT (approved)" — publish/schedule gate
  approvedById       String?                       // cleared on any later body edit
  publishAttemptedAt DateTime?                     // a failed scheduled publish, visible to the editor
  publishError       String?

  tocEnabled Boolean @default(true)                // heading-level opt-out is class="article-toc-skip"
  isTemplate Boolean @default(false)               // a template is just an Article; never published
  conversionCount Int @default(0)                  // denormalised, mirrors WaConversion's pattern

  // Editorial promotion — FeaturedCarousel (§9a) selects on these. `isFeatured`
  // existed only on ArticleCategory before this.
  isFeatured   Boolean   @default(false)
  featuredAt   DateTime?
  featuredRank Int?

  // D17 — working copy. While PUBLISHED/ARCHIVED, ALL writes land here.
  draftTitle              String?
  draftExcerpt            String?
  draftBodyHtml           String?
  draftBodyJson           Json?
  draftCoverImagePublicId String?
  draftCoverImageUrl      String?
  draftCoverImageAlt      String?
  draftUpdatedAt          DateTime?
  draftUpdatedById        String?
  hasUnpublishedChanges   Boolean   @default(false)

  // D16 — How-To envelope; steps are ArticleHowToStep rows.
  howToEnabled   Boolean  @default(false)
  howToTotalTime String?                                    // ISO-8601, "PT15M"
  howToTools     String[] @default([])
  howToSupplies  String[] @default([])

  views            Int      @default(0)
  helpfulCount     Int      @default(0)
  notHelpfulCount  Int      @default(0)
  commentCount     Int      @default(0)
  lastCommentAt    DateTime?
  commentsEnabled  Boolean  @default(true)

  version            Int       @default(1)
  publishedAt        DateTime?
  scheduledPublishAt DateTime?
  contentUpdatedAt   DateTime?                            // G-3: feeds dateModified, NOT updatedAt
  archivedAt         DateTime?
  reviewIntervalDays Int?
  nextReviewAt       DateTime?
  lastReviewedAt     DateTime?
  lastReviewedById   String?
  ownerUserId        String?

  createdByUserId String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt                     // G-2: view flush uses raw UPDATE, never touches this

  category   ArticleCategory? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  author     ArticleAuthor?   @relation(fields: [authorId],   references: [id], onDelete: SetNull)
  createdBy  User?            @relation("ArticleCreatedBy", fields: [createdByUserId], references: [id], onDelete: SetNull)
  owner      User?            @relation("ArticleOwner",     fields: [ownerUserId],     references: [id], onDelete: SetNull)

  revisions   ArticleRevision[]
  comments    ArticleComment[]
  tagLinks    ArticleTagOnArticle[]
  assignments ArticleAssignment[]
  workflow    ArticleWorkflowEvent[]
  viewsDaily  ArticleViewDaily[]
  outLinks    ArticleLink[]     @relation("ArticleOutLinks")
  inLinks     ArticleLink[]     @relation("ArticleInLinks")
  assets      ArticleAsset[]
  helpfulVotes ArticleHelpfulVote[]
  locks       ArticleLock[]
  notes       ArticleNote[]

  @@unique([kind, slug, locale], name: "uq_article_kind_slug_locale")
  @@unique([translationGroupId, locale], name: "uq_article_group_locale")   // G-4
  @@index([slug])
  @@index([kind, status, publishedAt])
  @@index([status, scheduledPublishAt])
  @@index([categoryId, status, publishedAt])
  @@index([authorId, status, publishedAt])
  @@index([archivedAt])
  @@index([nextReviewAt])
  @@index([typeSlug])
  @@index([createdAt])
}
```

**All 29 models and 7 enums are written literally in `docs/article-system/data-model.prisma`** — copy-paste ready, every field typed, every relation with `onDelete`, every index. The table below is the index into that file:

| Model                                                   | Modelled on                                     | Key constraints                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ArticleType`                                           | `CuratedListing` (schema:1539)                  | `slug @unique`, seeded HELP/NEWS/BLOG. **Also carries the per-type SEO patterns** (`metaTitlePattern`, `metaDescriptionPattern`, `ogTitlePattern`, `breadcrumbRootLabel`, `defaultNoindex`/`Changefreq`/`Priority`) so retuning titles sitewide is a form submit, not a deploy (D15)                                                                                              |
| `ArticleCategory`                                       | `CuratedListing`                                | **`@@unique([slug])` GLOBALLY** (G-1 — `kind` is a nullable hint; the frontend routes all category hubs under `/blog/category/{cat}`, so a kind-scoped key would put two pages at one URL)                                                                                                                                                                                        |
| `ArticleTag`                                            | new                                             | `slug @unique`, `articleCount`                                                                                                                                                                                                                                                                                                                                                    |
| `ArticleTagOnArticle`                                   | join                                            | `@@id([articleId, tagId])` — **explicit join table**; `Article.tags[]` is a denormalised mirror kept in sync in the same transaction                                                                                                                                                                                                                                              |
| `ArticleAuthor`                                         | new                                             | `slug @unique`, bio, avatar, socials `Json`, optional `userId` FK SetNull                                                                                                                                                                                                                                                                                                         |
| `ArticleRevision`                                       | `EmailTemplateVersion` (schema:4470)            | `@@unique([articleId, version])`, immutable, `createdAt` only. **Snapshots the whole renderable state** — `coverSnapshot`, `seoSnapshot`, `faqSnapshot`, `howToSnapshot` — because a body-only snapshot makes "restore" produce a version that never existed. **`wasPublished`/`publishedAt`** make the "keep all published versions forever" retention rule implementable at all |
| `ArticleSlugRedirect`                                   | new                                             | `@@unique([fromKind, fromSlug])` → `(toKind, toSlug)` — **also written on a `kind` change**                                                                                                                                                                                                                                                                                       |
| `ArticleComment`                                        | `TicketMessage` (schema:1900) + `CompanyReview` | `parentId`/`rootId`/`depth`/`replyToName`, dual identity, forensics, `@@index([articleId,status,createdAt])`, `@@index([rootId,createdAt])`. **Staff response fields** `isStaff`/`staffRole`/`isPinned`/`pinnedAt`/`pinnedBy` (Phase 6) + `@@index([status, reportedCount])` for the queue's default sort                                                                         |
| `ArticleCommentVote`                                    | `CompanyReviewVote` (3577)                      | Dual uniques `[commentId,userId]` + `[commentId,fingerprintHash]`                                                                                                                                                                                                                                                                                                                 |
| `ArticleCommentReport`                                  | `CompanyReviewReport` (3593)                    | **Gains the two uniques the original lacks** + a real `resolution`/`resolvedBy`/`resolvedAt` that is actually read                                                                                                                                                                                                                                                                |
| `ArticleHelpfulVote`                                    | new                                             | `@@unique([articleId, fingerprintHash])` — closes the half-implemented "Was this helpful?"                                                                                                                                                                                                                                                                                        |
| **`ArticleFaq`**                                        | new (**D16**)                                   | `@@unique([articleId, position])`; `answerHtml` runs through the **same** `sanitizeArticleHtml()` as the body (it is rich text, so it is an XSS surface otherwise); optional `imageAssetId` FK → feeds `faqPageSchema()`                                                                                                                                                          |
| **`ArticleAuthorOnArticle`** + `enum ArticleBylineRole` | join                                            | `@@id([articleId, authorId, role])`; AUTHOR / CO_AUTHOR / REVIEWER. `Article.authorId` stays the denormalised primary byline so existing indexes and the author hub are untouched                                                                                                                                                                                                 |
| **`ArticleLead`**                                       | **`VendorLead` (schema:1449)**                  | `@@unique([articleId, email])`; D12 `LEAD_GATED` made real                                                                                                                                                                                                                                                                                                                        |
| **`ArticleNotFoundHit`**                                | new                                             | `path @unique`; real 404 traffic, not just crawler-known broken links                                                                                                                                                                                                                                                                                                             |
| **`ArticleCorrection`**                                 | new                                             | public corrections notice — required because this system publishes NEWS                                                                                                                                                                                                                                                                                                           |
| **`ArticleConversion`**                                 | **`WaConversion` (schema:4211)**                | `enum ArticleConversionType`; the content→application attribution row (§11.8a). Denormalised `Article.conversionCount` mirrors the WhatsApp precedent                                                                                                                                                                                                                             |
| **`ArticleBookmark`**                                   | new                                             | `@@unique([userId, articleId])`; ships in v1 because both dashboards are already open for the §9a carousel edit                                                                                                                                                                                                                                                                   |
| **`ArticleHowToStep`**                                  | new (**D16**)                                   | `@@unique([articleId, position])`; mirrors the already-shipped, currently-unused `howToSchema()`; optional `imageAssetId` FK; emits only when `Article.howToEnabled && steps >= 2`                                                                                                                                                                                                |
| `ArticleViewDaily`                                      | new                                             | `@@unique([articleId, day])`, `uniqueViews` from a Redis HyperLogLog                                                                                                                                                                                                                                                                                                              |
| `ArticleAsset`                                          | new                                             | **Cloudinary** `publicId @unique` + `secureUrl` + `variants Json` (D13 — _not_ an R2 key); required `width`/`height` (CLS); reference counting for GC                                                                                                                                                                                                                             |
| `ArticleLink`                                           | new                                             | content graph: `fromArticleId`, `toArticleId?`, `href`, `anchorText`, `rel`, `isExternal`                                                                                                                                                                                                                                                                                         |
| `ArticleAssignment`                                     | new                                             | `role ArticleAssignmentRole`, `dueAt`                                                                                                                                                                                                                                                                                                                                             |
| `ArticleWorkflowEvent`                                  | `SubscriptionEvent`                             | from/to/actor/note audit of every status transition                                                                                                                                                                                                                                                                                                                               |
| `ArticleLock`                                           | new                                             | soft edit lock, 60s heartbeat, takeover-with-warning. Soft means a conflict is a **designed state**, so it needs a resolution path — see §10.2                                                                                                                                                                                                                                    |
| `ArticleNote`                                           | `EmailThreadNote`                               | comments-on-drafts, optional `blockId`                                                                                                                                                                                                                                                                                                                                            |
| `BlockedCommenter`                                      | new                                             | fingerprint / email / userId + reason + expiry                                                                                                                                                                                                                                                                                                                                    |

### 6.3 Edits to existing models

```prisma
// model User — append to the relation block
articlesCreated     Article[]              @relation("ArticleCreatedBy")
articlesOwned       Article[]              @relation("ArticleOwner")
articleComments     ArticleComment[]
articleCommentVotes ArticleCommentVote[]
articleAssignments  ArticleAssignment[]
articleNotes        ArticleNote[]
```

Notifications ride on the existing `Notification.category` **string** — `article_comment_reply`, `article_comment_moderated`, `article_review`, `article_assignment`, `article_published`, `article_schedule_failed`. **`NotificationType` is not touched**: it is a severity enum, and adding content events to it corrupts the type (see the ⚠️ in §7.1).

### 6.4 Migration

- One folder: `backend/prisma/migrations/<CURRENT_UTC_TIMESTAMP>_add_article_system/migration.sql` — **stamp at generation time**, do not hardcode; it must sort after `20260730120000_refund_requests`.
- `npx prisma migrate diff --from-schema <HEAD schema file> --to-schema prisma/schema.prisma --script -o <path>`. **`-o` is mandatory** — shell redirection puts `prisma.config.js`'s `[dotenv…]` line at the top and breaks `migrate deploy`.
- Confirm `git status` shows only article changes before generating — `migrate diff` captures _any_ drift.
- Hand-append GIN indexes on **exactly four** array columns + a post-deploy assertion they exist: `tags`, `keywords`, `faqPageContexts`, and `seoOverrides` (7.7's Overrides dashboard filters it with `hasSome`). **Not** `faqAudiences`, `relatedFaqIds` or `relatedArticleIds` — those are read by id _after_ the row loads and are never a `WHERE` predicate anywhere in the plan, so a GIN on them is pure write amplification.
- **Full-text search:** v1 `?q` is `ILIKE` over `title`/`excerpt`/`bodyText`, acceptable at seed volume (~30 articles); a `tsvector` GIN index lands with Phase 13.5. Recorded as a decision, not a gap.
- **Write amplification:** `Article` carries 10 `@@index` + 3 GIN against a 5-minute bulk view flush. The flush is **one batched `UPDATE` of the `views` column only**, which touches no indexed column — index cost is off the hot path.
- **Rollback:** additive-only, no down path. Recovery is forward-fix: a follow-up migration that drops the new tables, plus feature-flag off (T0.7) to stop traffic first. Documented in the runbook.

**Exit criteria:** `prisma validate` clean · `migrate diff` on a clean checkout produces zero drift · `prisma generate` succeeds · all **4** GIN indexes present via the assertion · no existing model's behaviour changed.

---

## 7. Phase 2 — Backend services, routes, schemas

### 7.1 Complete API contract

Every public route: `publicLimiter`, `optionalAuth`, `etagCache({ttl, publicCdnCache:true})`, `cache({ttl, keyGenerator: authBucket})`. Every response `{status:'success', data}`.

| Method | Path                                    | Guard                       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------ | --------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/public/blog`                          | public                      | list; `?page&limit&category&tag&author&q&sort`; **`limit` capped 100**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| GET    | `/public/news`                          | public                      | as above + `?since=<ISO>`; `limit` capped 1000 (news sitemap needs it)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| GET    | `/public/help-articles`                 | public                      | as above                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| GET    | `/public/articles/:kind/:slug`          | public                      | detail; 301 via `ArticleSlugRedirect`; **410 for DELETED**, 404 for never-existed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| GET    | `/public/articles/:kind/:slug/related`  | public                      | server-resolved: curated → category → tags → recent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| GET    | `/public/articles/:kind/:slug/adjacent` | public                      | prev/next                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| POST   | `/public/articles/:kind/:slug/helpful`  | public + limiter            | `{helpful:boolean}`; idempotent via `ArticleHelpfulVote`; 409 on repeat                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| GET    | `/public/articles/:kind/:slug/comments` | public                      | `?page&sort`; **no `cache()` AND `publicCdnCache:false`** — exempting only the Redis layer is not enough. The §7.1 preamble applies `etagCache({ publicCdnCache:true })` to every public route, so a per-viewer response carrying `myVote` would be stored in a CDN/ETag entry **shared across viewers** and hand one reader another reader's vote state. Either drop `myVote` from this payload and resolve it in a separate uncached per-viewer call, or keep it and mark the route private end-to-end. Pick the latter for v1; note it in the route's own comment so nobody "optimises" the flag back on |
| POST   | `/public/articles/:kind/:slug/comments` | limiter + Turnstile (guest) | `{body, parentId?, guestName?, guestEmail?, token?}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| POST   | `/public/comments/:id/vote`             | limiter                     | `{helpful:boolean}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| DELETE | `/public/comments/:id/vote`             | limiter                     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| POST   | `/public/comments/:id/report`           | limiter                     | `{reason, detail?}`; 409 on duplicate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| POST   | `/public/comments/erasure-request`      | limiter                     | guest DPDP path — email token, 24h TTL                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| GET    | `/public/article-categories`            | public                      |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| GET    | `/public/article-tags`                  | public                      |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| GET    | `/public/article-authors/:slug`         | public                      |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Super-admin (`/api/v1/super-admin/...`, `protect` + `requireCapability(...)` per D9):
`GET /articles` · `GET /articles/:id` · `POST /articles` · `PATCH /articles/:id` · **`PUT /articles/:id/body` (multipart, D1)** · **`PUT /articles/:id/body?mode=autosave`** (same multipart route + own limiter; cuts no revision, bumps no `version` — §10.1) · `POST /articles/:id/publish|unpublish|schedule|archive|duplicate|submit-review|approve|request-changes` · `GET /articles/:id/revisions` · `GET /articles/:id/revisions/:v` · `POST /articles/:id/revisions/:v/restore` · `POST /articles/:id/lock|heartbeat|release` · `GET|POST /articles/:id/notes` · `POST /articles/bulk` · `GET /articles/analytics` · `GET /articles/audit` · full CRUD for `/article-categories`, `/article-tags`, `/article-authors`, `/article-redirects` · `GET /article-comments` + `/reports` + `POST /article-comments/:id/moderate` + `/bulk` + `/export` · `POST /article-assets` (upload → Cloudinary, D13) + `GET /article-assets` (library) + `DELETE /article-assets/:id`.

**D17 working-copy endpoints:** `POST /articles/:id/publish-changes` (checklist against the draft columns → promote in one transaction → revision + correction check → full `propagateArticleChange`) · `POST /articles/:id/discard-changes` · `GET /articles/:id/diff?against=live` (feeds the banner's live-vs-draft view, reusing `RevisionDiffView`). Both mutations need `article.publish`, and both are audited.

**Schedule control:** `POST /articles/:id/unschedule` (alias of `schedule` with a null time, per the transition matrix) and `POST /articles/bulk` gains `reschedule`.

**Draft preview links need a store — "revocable" is not a mechanism.** `model ArticleShareToken { id, articleId, token @unique, createdById, expiresAt, revokedAt, lastUsedAt, useCount }` with `POST /articles/:id/share-tokens` (mint), `GET` (list), `DELETE /:tokenId` (revoke). The public side is the already-named `GET /public/articles/preview/:token` — 24h TTL, `noindex`, `no-store`, rate-limited, and it **must resolve the D17 working copy**, not the live row, or "share a preview of my changes" shows the reviewer the published version.

**`POST /articles/bulk` — the actions, spelled out.** It was named with no action list, no scope model and none of the async/undo parity the repo already ships for email. Actions: `publish`, `unpublish`, `archive`, `restore`, `delete`, `set-category`, `add-tags`, `remove-tags`, `set-author`, `set-owner`, `set-review-date`, `feature`, `unfeature`, `reset-seo-field`. It reuses the **established** primitives rather than inventing a second bulk system: the `scope()` model (`allMatching ? {filter} : {ids}`) from `useBulkSelect`, the `runBulk` dispatcher, offload to a queue above 1,000 rows with live progress, and a snapshot-backed **Undo** toast for the destructive actions. Every action audited; capability-checked per action (`delete` stays SUPER_ADMIN).

**Content types are genuinely CRUD** (D11 promises "a 4th type is a row, not a migration", but only `GET|PATCH` existed): add `POST /article-types` and `DELETE /article-types/:slug` (soft — `isActive:false`, refused while articles reference it).

> ⚠️ Scope note on what a new type can be: see the caveat under **D11** — a row buys a new _type within an existing kind_, not a new `ArticleKind`.

**`POST /articles/:id/duplicate` — say what it copies.** Unspecified, a clone silently loses exactly the things that are expensive to re-author. It copies title (suffixed "(copy)"), body, cover, category, tags, author and bylines, **FAQ blocks and How-To steps**, and the SEO fields **with `seoOverrides` cleared** so the copy re-derives its own metadata rather than inheriting a pinned title that now describes a different article. It does **not** copy: slug (regenerated), status (always `DRAFT`), `publishedAt`, revisions, comments, analytics, conversions or bookmarks.

**Complete the partial CRUD:** `PATCH|DELETE /articles/:id/notes/:noteId` (notes could be created and listed but never resolved or deleted — `resolvedAt`/`resolvedBy` had no writer) · `PATCH /article-assets/:id` (alt text, caption and title were uneditable after upload, so a missing-alt lint could never be cleared without re-uploading) · `GET /article-assets/:id/usage` (which articles reference this asset — the question every media library gets asked before a delete).

**"Was this helpful?" free text** (`ArticleHelpfulVote.comment` was a column with no way in and no way out): the public `POST /public/articles/:id/helpful` body gains an optional `comment` (≤500 chars, sanitised, rate-limited with the vote, never rendered publicly), and the admin side gets it in the per-article analytics detail plus the `articles/audit` low-helpfulness view, with CSV export. Without both halves it is a column that only ever holds NULL.

**Delete / trash / restore** (D9 grants `article.delete` as a capability but no endpoint existed): `POST /articles/:id/delete` → status `DELETED` + `archivedAt`, SUPER_ADMIN-only, audited, fires the IndexNow removal ping and `cdn-purge.service.ts` · `POST /articles/:id/restore` → `DELETED|ARCHIVED → DRAFT`, re-running the slug collision + `RESERVED_SLUGS` checks because the slug may have been reused in the meantime, and writing an `ArticleWorkflowEvent` like every other transition. **Unarchive folds into `restore`** — one reverse edge owned by `article-workflow.service.ts`, not two verbs. `GET /articles` gains a `status` filter with `ARCHIVED`/`DELETED` excluded from the default list; **Trash is that filter on the existing list page, not a new route.**

> ⚠️ **No hard delete, ever.** The house rule is `status DELETED` only. A real `DELETE` would cascade-destroy `ArticleRevision`, `ArticleComment`, `ArticleViewDaily`, `ArticleWorkflowEvent` and `ArticleLink` — every one is `onDelete: Cascade` — taking the entire audit and analytics history with it. The storage argument for purging is already answered by `article-asset-gc` (§8.1).

**Blocked commenters** (the model existed with no way to list or unban): `GET|POST|PATCH|DELETE /super-admin/blocked-commenters` under the `comment.moderate` capability — so ADMIN can manage it, not only SUPER_ADMIN — every mutation audited, list searchable over fingerprint/email/userId with active/expired filters. Page `articles/blocked-commenters/page.tsx` + `BlockedCommenterTable.tsx`, modelled on the in-repo `super-admin/email/suppression/page.tsx`. Also `POST /article-comments/:id/block-author`, since "block author" was already promised as a _bulk_ action with no single-row equivalent.

> Shadow-ban reuses the mechanism Phase 6 already specifies — **author-only visibility of their own PENDING comment**. The comment is stored, rendered back to its own author through that existing path, and never enters the queue count, the public thread, `commentCount` or any notification. It does **not** need a new `ArticleCommentStatus` member.
> Expiry is enforced in the query (`expiresAt IS NULL OR expiresAt > now()`, supported by the existing `@@index([expiresAt])`), **not** by a sweep job. A sweep is optional row housekeeping and must not be mistaken for the enforcement mechanism.

**Editorial workflow read paths** (assignments and events were written but never readable, and `completedAt`/`assignedById` had no writer): `GET|POST /articles/:id/assignments` · `PATCH|DELETE /articles/:id/assignments/:assignmentId` (complete / reassign) · `GET /articles/assignments?assignee=me&overdue=` backed by the existing `@@index([userId, completedAt])` · `GET /articles/:id/workflow` for the per-article trail. `article.edit.any` to assign to others, `article.edit.own` to complete your own. UI: `ArticleAssignmentPanel.tsx`, `ArticleActivityTimeline.tsx`, and `ContentCalendar` mounted at `articles/calendar/page.tsx` with a D14 entry.

> ⚠️ **Notifications use `category`, not new `NotificationType` members.** An earlier draft (and the model file) said to add `ARTICLE_COMMENT_REPLY` / `ARTICLE_COMMENT_MODERATED` to `NotificationType`. That enum is a **severity** (`INFO`/`SUCCESS`/…); adding content-event members corrupts it. Emit `Notification { type: INFO|SUCCESS, category: 'article_review' | 'article_assignment' | 'article_published' | 'article_schedule_failed' | 'article_comment_reply' | 'article_comment_moderated', link: '/super-admin/articles/{id}/edit' }`, matching `notification.service.ts`'s existing shape. Phase 6 must follow the same rule.

A **daily overdue-assignment digest** is added to `article-maintenance.worker.ts` — distinct from the existing weekly `article-review-due-digest`, which keys on `nextReviewAt` (content decay), not `dueAt` (editorial).

**D16 FAQ + How-To endpoints:** `GET|PUT /articles/:id/faqs` (PUT replaces the whole ordered set in one transaction — per-row PATCH plus a separate reorder call is how ordering desyncs) · `GET|PUT /articles/:id/howto` (envelope + ordered steps, same whole-set semantics) · both are **multipart** where `answerHtml`/`text` are rich (D1: a JSON body would arrive tag-stripped), both run `sanitizeArticleHtml()`, both recompute `refCount` for referenced assets (§8.1), and both are audited.

**SEO + staff-reply endpoints** (D15 / 7.7 / Phase 6): `GET /articles/:id/seo` (derived + pinned values side by side) · `PATCH /articles/:id/seo` (pins the edited fields) · `POST /articles/:id/seo/reset` (`{ fields: string[] }` → unpin + recompute) · `GET /articles/:id/seo/preview` (SERP + social card) · `GET|PATCH /article-types/:slug` (SEO patterns) · `POST /articles/seo/recompute` (`{ filter }` → count preview, then background job — R20) · `GET /articles/seo/audit` (duplicates, missing, thin, orphan, stale) · `GET /articles/seo/indexing` (shard counts, lastmods, IndexNow status, **fetch-failure state distinct from zero rows**) · `POST /article-comments/:id/reply` (staff, skips moderation) · `POST /article-comments/:id/approve-and-reply` · `POST /article-comments/:id/pin|unpin`.

Every mutation carries `audit(...)`, an `expectedVersion` If-Match check, and cache + CDN invalidation.

### 7.1a Numbered tasks

`T2.1` sanitize service · `T2.2` article service · `T2.3` category service · `T2.4` tag service · `T2.5` author service · `T2.6` comment service · `T2.7` workflow service · `T2.8` link service · `T2.9` analytics service · `T2.10` asset service · `T2.11` public controllers · `T2.12` admin controllers · `T2.13` public routes · `T2.14` admin routes · `T2.15` zod schemas · `T2.16` `require-capability` middleware · `T2.17` audit + `publicAudit` · `T2.18` rate limiters · **`T2.19` `cdn-purge.service.ts`** · `T2.20` slugs + reserved words · `T2.21` IndexNow (batched for bulk) · `T2.22` `getSitemapLastmods` + counts · `T2.23` text moderation · `T2.24` DPDP export · `T2.25` Kafka + webhooks · `T2.26` `utils/trending.ts` · `T2.27` CSP diff vs the sanitizer allowlist · `T2.28` app.ts mounts.

Phases 1 and 3–13 carry the same `T{phase}.{n}` numbering, one task per row of `docs/article-system/file-inventory.md`.

### 7.2 Files to create

| File                                                                                                                | Modelled on                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `src/services/article-sanitize.service.ts`                                                                          | **The pivot** — see §7.5                                                                                                         |
| `src/services/article.service.ts`                                                                                   | `curated.service.ts`                                                                                                             |
| `src/services/article-category.service.ts`                                                                          | `curated.service.ts` + Redis read-through                                                                                        |
| `src/services/article-tag.service.ts`                                                                               | new (rename/merge/counts)                                                                                                        |
| `src/services/article-author.service.ts`                                                                            | new                                                                                                                              |
| `src/services/article-comment.service.ts`                                                                           | `company-review.service.ts:698-810`, `AUTO_FLAG_THRESHOLD = 3`                                                                   |
| `src/services/article-workflow.service.ts`                                                                          | new (status transitions + events)                                                                                                |
| `src/services/article-link.service.ts`                                                                              | new (content graph parsed from the **sanitised `bodyHtml`** — D10 revised)                                                       |
| `src/services/article-analytics.service.ts`                                                                         | new                                                                                                                              |
| `src/services/article-asset.service.ts`                                                                             | new. **Owns the `refCount` writer** — see the GC safety rules in Phase 3, without which the nightly job deletes every live image |
| `src/services/cdn-purge.service.ts`                                                                                 | **new — does not exist today** (grep for purge finds only whatsapp-cron)                                                         |
| `src/controllers/article.controller.ts`, `article-comment.controller.ts`                                            | thin, `next(err)`                                                                                                                |
| `src/controllers/super-admin-articles.controller.ts` (+ `-comments`, `-categories`, `-tags`, `-authors`, `-assets`) | `super-admin-curated.controller.ts`                                                                                              |
| `src/routes/article.routes.ts`, `article-comment.routes.ts`                                                         | `company-review.routes.ts`                                                                                                       |
| `src/routes/super-admin-article*.routes.ts` (5 files)                                                               | `super-admin-curated.routes.ts`                                                                                                  |
| `src/schemas/article.schema.ts`, `article-comment.schema.ts`, `article-admin.schema.ts`                             | `email.schema.ts` bare-object style. **Zod v4: `error:` not `errorMap:`**                                                        |
| `src/middleware/require-capability.ts`                                                                              | new, implements D9                                                                                                               |

### 7.3 Files to modify

| File                                                                           | Change                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app.ts`                                                                   | Mount routers; multipart route (D1)                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/middleware/audit.ts`                                                      | Add `bodyencoded`,`bodyhtml`,`bodyjson`,`guestemail`,`guestname`,`ipaddress`,`useragent`,`fingerprinthash` to `SENSITIVE_KEYS`. **Rename `resolveReportSchema`'s free-text field off `note`** — `note` is already redacted, so moderation rationale would log `[REDACTED]`. Add a **`publicAudit()`** variant: `audit()` only fires when `req.user` exists, so guest comment/vote/report currently produce zero rows |
| `src/middleware/rate-limit.ts`                                                 | Five limiters, **each with its own `createRedisStore(prefix)`** — reuse throws `ERR_ERL_STORE_REUSE` at boot. Keyed by user+fingerprint+IP, not IP alone                                                                                                                                                                                                                                                             |
| `src/lib/slugs.ts`                                                             | `buildArticleSlug()` in the `buildCompanySlug` collision style + `RESERVED_SLUGS` (`category`,`tag`,`author`,`feed.xml`,`feed.atom`,`feed.json`,`page`,`rss`,`sitemap`)                                                                                                                                                                                                                                              |
| `src/services/indexnow.service.ts`                                             | `articleUrl(kind,slug)`, `notifyArticleChanged()`; **ping on unpublish/archive/delete/slug-change too**                                                                                                                                                                                                                                                                                                              |
| `frontend/src/lib/indexnow.ts` + `frontend/src/app/api/indexnow-ping/route.ts` | **The frontend half — v1 listed only the backend service.** Article pings go backend-direct (the service owns the publish transaction); the frontend route stays jobs/companies-only and unmodified                                                                                                                                                                                                                  |
| `src/services/public-stats.service.ts`                                         | `getSitemapLastmods()` 6→9 aggregates **+ counts**, every one filtered `status:'PUBLISHED', noindex:false, accessLevel:'PUBLIC'` so a draft or gated article cannot bump a public `lastmod`                                                                                                                                                                                                                          |
| `src/services/text-moderation.service.ts`                                      | `moderateCommentBody()` + near-duplicate detection + first-post link policy                                                                                                                                                                                                                                                                                                                                          |
| `src/services/data-export.service.ts`                                          | **DPDP:** add articles authored, comments, votes, reports to `collectUserData()`                                                                                                                                                                                                                                                                                                                                     |
| `src/kafka/topics.ts` / `producer.ts` / `consumer.ts`                          | Three `content.article.*` topics — **see R13, this changes the consumer**                                                                                                                                                                                                                                                                                                                                            |
| `src/schemas/webhook.schema.ts`                                                | Add `article.*` to the closed `WEBHOOK_EVENTS` list                                                                                                                                                                                                                                                                                                                                                                  |

### 7.4 Security hardening (all mandatory)

Turnstile failing **closed** · honeypot + min-submission-time · `voteFingerprint` **must include a day bucket** (a rotating UA alone currently mints unlimited vote identities) · **one fingerprint function per axis used identically on write and read** — the review system has a live bug here (`list` uses `reviewFingerprint(req,'votes:'+companyId)`, `vote` stores `voteFingerprint(req, reviewId)`; they can never match, so guest vote state silently resets — **do not copy it**) · asset upload must **not** copy `email.controller.ts:uploadAsset` which skips `scanFile`; articles need malware scan (`scanFile`) + re-encode + `limitInputPixels` + EXIF strip · `canonicalUrl`/`ogImageUrl` https + host allowlist, not bare `z.url()` (which accepts `javascript:`) · strip-tags + length caps on `excerpt`,`metaTitle`,`metaDescription`,`heroH1`,`authorName`,`guestName` plus a `RESERVED_DISPLAY_NAMES` block (hire ?adda, admin, moderator, support, staff, official, team) · `guestEmail` never appears in any public payload · status-transition guards (409 on already-moderated) · admin `select` whitelists (`bodyHtml`/`bodyText` are unbounded).

**Also required:** `recordView()` filters known bots by UA plus a Redis fingerprint gate before incrementing — otherwise every Phase 8 number is crawler-inflated · the aggregate/shard predicate is `status:'PUBLISHED', noindex:false, accessLevel:'PUBLIC', canonicalUrl:null` and **`fetchPublicCount()` uses the identical predicate** (a mismatch is the same silent-suppression class of bug as D4) · Cloudinary public ids are `articles/{kind}/{articleId}/{slug}-{hash}` (D13), not bare uuids · body images require `alt` at upload and the publish checklist lints "every body `<img>` has alt" · admin PII reveal writes an audit event and IPs are masked until an explicit reveal · article routes normalise 4xx to `{status:'error', message, requestId}` (the shared `validate()` emits `{success:false}` with no requestId).

**Upload hardening is Cloudinary-side, not header-side.** An earlier draft demanded explicit `Content-Type` / `X-Content-Type-Options` / `Content-Disposition` on stored objects — that was written for R2 and is not applicable: those response headers belong to `res.cloudinary.com`, not to us (D13). The equivalent controls are an **`articleImage` preset** added to `uploadOptions` in `backend/src/config/cloudinary.ts`: `resource_type:'image'`, `allowed_formats:['jpg','jpeg','png','webp','gif']` — **explicitly no `svg`**, unlike the existing `companyLogo` preset, because an SVG body image is a script-execution vector — folder `articles/<kind>/<articleId>`, `transformation:[{quality:'auto',fetch_format:'auto'}]`.

> ⚠️ D13's upload line calls `uploadOptions(...)` as a **function**; it is an options object. The correct call is `uploadImage(buffer, { ...uploadOptions.articleImage, folder })`.

**Two distinct allowlists, and they must not be collapsed into one:**

- `ALLOWED_IMG_HOSTS = ['res.cloudinary.com', 'assets.hireadda.in']` — exported from `article-sanitize.service.ts` and mirrored verbatim in `frontend/src/lib/article-html.ts`, covered by the existing `SANITIZER_VERSION` parity test (R11). The invariant is that it is a strict **subset** of `next.config.ts` `remotePatterns` and `lib/image-host.ts` `OPTIMISABLE_HOSTS` — deliberately _not_ equal: `lh3.googleusercontent.com` is in those lists as the Google avatar CDN and is never a legitimate article body image. A non-allowlisted `<img>` is **dropped, never silently rewritten**, and the rejection is surfaced to the editor rather than swallowed.
- `ALLOWED_CANONICAL_HOSTS` — the site's own hosts, used for `canonicalUrl`. Collapsing the two would let a canonical point at Cloudinary.

**Concrete limits** (v1 left these as adjectives):

| Control                               | Value                                                                                                                                                                   | Owning file                  |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Public list `limit`                   | max 100 (news 1000, sitemap-only)                                                                                                                                       | `article.schema.ts`          |
| Public list `page`                    | max offset 10,000 → 400 beyond                                                                                                                                          | `article.schema.ts`          |
| Comment body                          | 2,000 chars                                                                                                                                                             | `article-comment.schema.ts`  |
| Comments per user/day                 | 20                                                                                                                                                                      | `rate-limit.ts`              |
| Comments per IP/hour                  | 10                                                                                                                                                                      | `rate-limit.ts`              |
| Links allowed in a first-ever comment | 0 (2 for a trusted commenter)                                                                                                                                           | `text-moderation.service.ts` |
| Min submission time                   | 3s from form render                                                                                                                                                     | `article-comment.service.ts` |
| `AUTO_FLAG_THRESHOLD`                 | 3 distinct reporters                                                                                                                                                    | `article-comment.service.ts` |
| Votes per fingerprint/day             | 50                                                                                                                                                                      | `rate-limit.ts`              |
| Asset upload                          | 5 MB; **`image/jpeg`, `image/png`, `image/webp`, `image/gif` only — no SVG**; max 5000×5000 px; MIME derived server-side from the buffer, never trusted from the client | `article-asset.service.ts`   |
| Tags per article                      | max 8                                                                                                                                                                   | `article.schema.ts`          |
| Trusted-commenter threshold           | 3 approved comments                                                                                                                                                     | `article-comment.service.ts` |

### 7.5 The sanitizer (specified, not described)

```
ALLOWED_TAGS: p br strong em u s sub sup code pre blockquote h2 h3 h4 ul ol li a img
              figure figcaption table thead tbody tr th td caption hr span div section ol
ALLOWED_ATTR: href title alt src width height colspan rowspan class id target rel
              data-align data-width data-lang
FORBID:       iframe script style object embed form input (D7)
```

**The allowlist must cover what the specified editor actually emits, or content silently vanishes on publish.** Enumerate, do not leave implicit:

- `sub`/`sup` (Subscript/Superscript extensions), `caption` (Table), `pre > code[data-lang]` (CodeBlockLowlight), `div`/`section` with an `article-`-prefixed class (callout/Details, FAQ and How-To sections).
- `figure[data-align]`, `figure[data-width]`, and the enumerated `article-align-{left|center|right}` / `article-img-{25|50|75|100}` classes.
- **`article-toc-skip`** — the per-heading ToC exclusion marker (§9.6), permitted on `h2`/`h3` only. It is listed here because the `article-` prefix rule permits only classes that are actually enumerated; without this line the marker is stripped on save and the exclusion silently stops working.
- **`article-faq`** / **`article-howto`** section classes and the `article-h-faq` / `article-h-howto` ids, so the D16 sections survive sanitisation.
- **No `style` attribute, ever.** This is why `@tiptap/extension-text-align` must be reconfigured to emit a class rather than its default inline `style` (§10.1) — otherwise every alignment the author sets is stripped at save time.
- The **shared** editor already ships `TextStyle` + `Color` + `Highlight`, which emit inline `style`. Those marks are **not** in the article set; if they were, colour and highlight would appear to work in the editor and disappear on publish. The article toolbar therefore omits them.
  > ⚠️ Phase 11's sanitizer golden-file suite must include one fixture per node in this list — a round-trip through the real editor, saved and re-read. The failure mode this catches is invisible in review and obvious to readers.
  > Hooks: force `rel="noopener noreferrer nofollow"` on external `a` · reject non-https `img src` and non-allowlisted hosts · **`class` restricted to an `article-` prefix allowlist** (an arbitrary class from a compromised editor session injects `fixed inset-0 z-50` clickjacking) · `id` only on headings, generated by `injectHeadingIds` · exported `SANITIZER_VERSION` constant.
  > **Isolated DOMPurify instance** — `isomorphic-dompurify` is a process-wide singleton and hooks would otherwise affect every other consumer (R12).
  > Shared source of truth: `backend/src/services/article-sanitize.service.ts` is authoritative; `frontend/src/lib/article-html.ts` mirrors it, and a CI test asserts the two allowlists and `SANITIZER_VERSION` are equal (R11).

### 7.6 Caching

`invalidateArticleCache()` must **not** be `redis.keys('article:*') + del` — that nukes the view counters under `article:views:*`. Precise namespaces, `SCAN` never `KEYS`. **The ETag layer is separate** (`etag:${originalUrl}:${userId}`) and needs both invalidation **and the same `::a0/::a1` auth bucket** — without it an admin request populates an entry anonymous readers then 304-validate against. `recordView()` **cannot** sit behind `cache()` (a hit short-circuits before the controller). CDN purge on every publish/unpublish/slug-change via `cdn-purge.service.ts`.

**Exit criteria:** every endpoint in §7.1 exists with validation, guard, limiter, envelope, cache + CDN invalidation · sanitizer parity test green · no `KEYS` in production paths · guest mutations produce audit rows · `collectUserData()` returns article data.

---

## 8. Phase 3 — Background jobs

**Create:** `article-cron.queue.ts` (modelled on `email-cron.queue.ts`) registering `article-run-scheduled-publish` (\*/5), `article-refresh-analytics` (daily 02:15 UTC), `article-purge-forensics` (daily), `article-reconcile-counters` (daily), `article-prune-revisions` (daily), `article-review-due-digest` (weekly), `article-broken-link-scan` (weekly), `article-asset-gc` (daily) · `article-scheduled-publish.worker.ts` (from `scheduled-publish.worker.ts`, `withLock('lock:article-publish:'+id, 300, …)`) · `article-maintenance.worker.ts`.

**Modify:** `scheduler.worker.ts` (new `case` labels — **not** a new BullMQ Worker, which needs edits in two places in `worker-leader.ts` plus a 13th Redis connection) · `jobs/index.ts` · `view-counter-flush.worker.ts` — generalise to a prefix table, with **two traps**: `article:views:day:{id}:{date}` is prefix-nested inside `article:views:` so a naive `MATCH article:views:*` eats the daily keys (use disjoint namespaces), and this is a **live job carrying job-post view counts** so it needs its own regression check.

**Also:** overdue-publish detection (a stale lock silently misses a window) · counter reconciliation for every denormalised count · forensics purge (retention: IP/UA/fingerprint 90 days, `guestEmail` until erasure) · erasure worker for `deletionRequestedAt` · revision pruning (**keep the last 100 per article + all published versions forever**, content-hash dedupe — the single authoritative number is §12.5's; an earlier draft of this line said 50) · Prometheus counters + alerts (pending-queue depth, publish lag, 4xx spikes, `/public/news` returning empty) · Sentry noise suppression for expected 4xx.

### 8.1 `refCount` and asset GC — the job that can delete the whole media library

`ArticleAsset.refCount` was declared with **no writer anywhere in the plan**, which means it stays at its `@default(0)` forever and a nightly `refCount = 0 → deleteImage` sweep deletes **every live image on the site the first night it runs**. Both halves are specified here.

**The writer — recompute, never delta.** `article-asset.service.recomputeRefCounts(publicIds)` runs **in the same transaction as the write that changes what an article references**: manual body save, cover change, publish, `publish-changes` (the D17 promote), unpublish, revision restore, archive, and the FAQ/How-To set replacements. It sets `refCount` to the number of **distinct articles whose current live `bodyHtml` + cover + FAQ/How-To images reference that `publicId`**.

> ⚠️ **Autosave is deliberately excluded, and D17 is why.** An earlier draft listed autosave here. Under D17 an autosave on a published article writes only the draft columns, which no public surface reads — so recomputing against them would either count draft-only references as live or thrash the counter every two seconds. The consequence to handle explicitly: an image inserted in a working copy has `refCount = 0` until promote, so it is `articleId`-linked on upload and the GC's `articleId IS NULL` clause is what keeps it alive in the meantime. That clause is load-bearing, not defensive.

> ⚠️ Blind increment/decrement is wrong and will lose images. Revision restore legitimately **re-references** an asset that a previous edit already decremented to 0 — a delta scheme has no way back from that, a recompute does. Cover replacement must recompute **both** the old and the new asset, which is the case `CoverImagePicker` will otherwise miss.

The referenced set is extracted from the **sanitised `bodyHtml`** (D10 revised) by collecting every `img src` and mapping it through the existing `extractPublicId()` in `backend/src/config/cloudinary.ts` — the same helper the delete path uses, so the two can never disagree about what an asset's identity is.

**The GC — four-part predicate, and three safety rails.** `article-asset-gc` (daily) deletes only assets matching **all** of:
`refCount = 0` **AND** `articleId IS NULL` **AND** `createdAt < now() - 24h` **AND** not referenced by any retained `ArticleRevision`.

Plus: a **dry-run flag** (default on for the first production week, logging what it _would_ delete), one **audit row per deletion**, and a **hard per-run deletion cap**. The cap is the important one — it is what stops a bug that zeroes `refCount` from emptying the media library in a single night. Exceeding the cap aborts the run and alerts rather than continuing.

**Exit criteria:** scheduled publish fires within 5 min · job view counts unchanged (regression check) · forensics older than the TTL are gone · counters self-heal after deliberate corruption · every job emits a metric.

---

## 9. Phase 4 — Public frontend

### 9.1 Pages

`/blog`, `/blog/[slug]`, `/blog/category/[cat]`, `/blog/tag/[tag]`, `/blog/author/[slug]`, `/news`, `/news/[slug]`, `/help/[slug]` — **each with its own `loading.tsx` and `error.tsx`** (without them these routes inherit `app/loading.tsx`, a full-screen fixed z-50 spinner).

**Every new public page's first rendered node is a plain BLOCK element carrying `under-public-header`.** `globals.css` scopes `.under-public-header::before` to `[data-public-chrome]`; `PublicLayout` applies `-mt-20` to `<main>`. Omit it → content sits 80px too high under the transparent header. Put it on a flex container → the spacer becomes a flex item and silently does nothing.

### 9.2 Frontend data layer (was entirely missing from v1)

| File                                                                                      | Modelled on                                |
| ----------------------------------------------------------------------------------------- | ------------------------------------------ |
| `src/types/article.ts`                                                                    | `types/review.ts`                          |
| `src/services/article.service.ts`                                                         | `curated.service.ts` (unwraps `data.data`) |
| `src/services/article-comment.service.ts`                                                 | `company-review.service.ts`                |
| `src/services/super-admin-articles.service.ts`                                            | `super-admin-email.service.ts`             |
| `src/services/super-admin-article-comments.service.ts`                                    | ditto                                      |
| `src/hooks/use-articles.ts`, `use-article-comments.ts`, `use-article-lock.ts`             | `hooks/use-subscriptions.ts`               |
| `src/validators/article.ts`                                                               | `validators/auth.ts`                       |
| `src/lib/article-html.ts`, `text-diff.ts`, `serp-metrics.ts`, `bulk.ts`, `help-search.ts` | see §9.4                                   |
| `src/constants/routes.ts`, `api.ts`                                                       | extend, never inline strings               |

### 9.3 Components — **every one named in `docs/article-system/file-inventory.md` §3**

Cards/grid/skeletons · `ArticleBody` · `ArticleToc` · `ReadingProgressBar` · `ArticleByline` · `AuthorBox` · `RelatedArticles` · `ArticleShareBar` · `ArticleTagChips` · `ArticleAnalytics` · `ArticleGate` (D12) · comment tree (`CommentSection`/`List`/`Item`/`Form`) · `ArticleKindBadge` + `article-kind-style.ts`.

**Shared extractions — nothing removed, old paths become re-exports:** `ShareReviewMenu` → `components/common/ShareMenu` · `ModerateModal`/`ReportModal` → `components/moderation/` · `lib/email-bulk.ts` → thin wrapper over `lib/bulk.ts` · the Fuse config duplicated verbatim in three files → `data/faqs/search-config.ts`.

### 9.4 The `/help` conversion — riskiest edit in the plan

`app/help/page.tsx` is `'use client'` end-to-end (Fuse, tabs, framer-motion, `useFaqLocale`, `useAuthStore`). It becomes a **server page + `HelpCenterShell` client child**. The 79-entry 6-locale FAQ corpus and `FaqEntry` type are **untouched**; `getFaqsForPage` is shared by `HelpModal`, `PageFaqSection` and the FAQPage JSON-LD and must behave identically.

- **FAQ schema on help articles — corrected by D16.** An earlier draft of this line said `/help/[slug]` emits `articleSchema` only, because `/help` already emits a full-corpus `faqPageSchema`. That premise was wrong: `/help/{slug}` is a **different URL** from `/help`, and the constraint is one `FAQPage` entity **per page**, not per site. A help article with its own D16 FAQ blocks therefore **does** emit `FAQPage` — the guard is that if `PageFaqSection` also renders on that page, the article's own blocks win and `PageFaqSection` suppresses its emission.
- `app/help/layout.tsx` exports `metadata` with `url:'/help'`; Next merges layout metadata into children, so `/help/[slug]` must fully override `alternates.canonical` or every article self-canonicalises to `/help`.
- **Cannibalisation rule:** FAQs stay on `/help` as the canonical short answer; help articles are long-form at `/help/{slug}` and must not duplicate an FAQ's text verbatim.

**How help articles actually appear on `/help`** (the request's literal clause — v2 specified the page rewrite but never this):

1. **Unified search.** `lib/help-search.ts` builds ONE Fuse index over `{kind:'faq'} | {kind:'article'}` with mapped keys (`question`→`title`, `answer`→`excerpt`, `keywords`→`keywords`) using the extracted `FAQ_FUSE_OPTIONS`. One result list — articles render as `HelpArticleCard`, FAQs as accordion rows.
2. **Per-category browse.** Each of the 7 existing category tabs gains a "Guides" block above the accordion listing that category's help articles (matched via `ArticleCategory.faqCategory`), with a count in the tab badge.
3. **A "Guides" tab** alongside the 7 category tabs, listing all published help articles grouped by category.
4. **Empty state:** a category with zero articles renders no block — never an empty header.
5. **`HelpModal`** (the sitewide FAQ modal) renders article hits as links to `/help/{slug}` beneath the FAQ results — never long-form inline.
6. **`PageFaqSection`** gains an optional `relatedArticles` prop rendering a "Read more" list beneath its accordion, **and an `emitSchema?: boolean` prop (default `true`)** — its emission is _not_ unchanged, contrary to an earlier draft of this line. When an article carries its own D16 FAQ blocks the page passes `emitSchema={false}`, so exactly one `FAQPage` entity exists per page and the **article's blocks win**. Precedence is decided at the page level by the `graph()` composer, never by whichever component happens to render first.

### 9.5 Resolved SEO/UX policies (v1 left these as a bare list)

- **Filter searchParams:** filtered URLs self-canonical to the unfiltered hub and carry `robots: noindex, follow`. Indexable hubs are `/blog`, `/blog/category/x`, `/blog/tag/x` **and `/blog/author/x`** — the author hub is the E-E-A-T destination `article:author` resolves to, so excluding it (as an earlier draft did) both contradicts §9.5's own author-schema work and throws away the page Google uses to attribute expertise. Filter chips are client-side only.
- **Hub metadata is derived too** (D15): tag, author and category hubs get `metaTitle`/`metaDescription`/`ogImageUrl`/`noindex`/`seoOverrides` with the same Auto/Custom pin-and-reset UI as articles. Their patterns are **versioned constants in `article-seo.service.ts`**, not per-hub pattern columns — `{{label}} articles | {{siteName}}`, `{{count}} articles about {{label}} — guides and news from {{siteName}}`, and for authors `{{displayName}} — {{title}} at {{siteName}}`. §7.7 gains a **"Hub metadata"** tab, because otherwise no CMS page owns tag or author meta at all.
- **Hub OG cards:** `app/blog/category/[cat]/opengraph-image.tsx`, `app/blog/tag/[tag]/opengraph-image.tsx`, `app/blog/author/[slug]/opengraph-image.tsx`. The author card composites `ArticleAuthor.avatarUrl`, which means `ImageResponse` fetches a Cloudinary URL — confirm that is permitted under the same CSP constraint that already forces the font subset to be bundled.
- **Pagination:** page 1 canonical is the bare hub; pages 2+ self-canonical with `rel=prev/next`; `@id` in `collectionPageSchema` includes the page number so paginated hubs do not collide.
- **NEWS breadcrumb:** `Home > News > {title}`. Category/tag hubs are blog-only; a news article's category renders as a chip, not a breadcrumb crumb.
- **Comment indexability:** comments are SSR'd page 1 only, wrapped in a `UserComments` JSON-LD `comment` array; pages 2+ are client-side and `noindex` is not needed because they are not separate URLs.
- **Body images:** rewritten server-side from the sanitised HTML into `next/image`/`<picture>` with a **Cloudinary** srcset (`ArticleAsset.variants`, D13) and dimensions captured at upload; **dimensionless images are rejected at upload** (CLS). Because `res.cloudinary.com` is already in `remotePatterns` + `OPTIMISABLE_HOSTS`, these go through the optimiser with no config change.
- **Typography:** `@tailwindcss/typography` is **not installed**, so ~20 existing `prose prose-sm max-w-none` usages are currently inert no-ops. Install it **scoped**: register the plugin and constrain prose styles under `.article-body` only, then screenshot-diff all ~20 existing consumers before/after.
- **Feeds:** `<link rel="alternate">` on the article pages themselves, not only root layout; the **six** new feed routes (D8) must be excluded from the global `X-Robots-Tag: index, follow` header (`next.config.ts:117/144`) — they are non-HTML and have no meta-tag channel.
- **`?lang=`:** not emitted on article URLs at all (D5).
- **Dynamic OG images:** `opengraph-image.tsx` per article route — none exists anywhere in the app today.
- **`articleSchema()` fixes:** **parameterise `@type`, which is hardcoded to `'Article'` at `json-ld.ts:957` — until this is fixed `ArticleType.jsonLdType` (`BlogPosting`/`NewsArticle`) is dead data and every blog post ships the wrong schema type**; parameterise `inLanguage` (hardcoded `en-IN`); emit `image` as `ImageObject` with dimensions (currently bare URL strings); author gains `@id` + `sameAs` from `ArticleAuthor.socials` and an Organization-author option; `components/common/SEO.tsx` passes the author profile URL so `article:author` resolves to `/blog/author/{slug}` instead of a bare name.
- **Co-authors and reviewers:** `articleSchema` gains an optional `authors?: {name,url,sameAs?}[]` and `reviewedBy?`, **added alongside** the existing `author` prop rather than replacing it, so every current caller is unaffected. Backed by `ArticleAuthorOnArticle` (AUTHOR / CO_AUTHOR / REVIEWER); `Article.authorId` remains the denormalised primary byline so the author-hub query and `@@index([authorId, status, publishedAt])` are untouched.
- **Wire the two dead generators:** `faqPageSchema()` (json-ld.ts:418) and `howToSchema()` (json-ld.ts:434) both already exist and are correct; `howToSchema` currently has **zero consumers** anywhere in the app. D16 supplies their input. No new schema helper is written.
- **Author hub JSON-LD:** `ProfilePage` with `mainEntity: Person` — not `webPageSchema`. Added to the Phase 12 Rich Results list.
- **Static generation:** on-demand ISR only, **no `generateStaticParams`** — slugs are unbounded and editors publish continuously. Phase 12 adds a post-deploy prewarm of the top 20 published slugs per kind.
- **Third-party loading policy:** Turnstile is injected on first comment-form focus, never on page load; `CommentSection` and `ArticleAnalytics` are dynamically imported below the fold. This backs the LCP/INP exit criterion.
- **Global `X-Robots-Tag` — no change needed for article HTML routes.** An earlier draft claimed the permissive global header would _override_ the page-level `noindex, follow` on filtered and paginated hubs. That is backwards, and `next.config.ts:110-119` says so in its own comment: **when HTML and HTTP robots signals disagree, Google honours the MOST restrictive**, so a permissive header can never un-noindex a page whose metadata says `noindex`. The header exclusion is therefore needed **only** for the six feed routes, and on its own merits — they are non-HTML responses with no meta-tag channel, so the header is the _only_ robots signal they have.
- **Where per-article robots directives are actually emitted:** page-level `metadata.robots` covers `noindex`/`nofollow`. If the HTTP layer must also carry per-article `noarchive`/`max-snippet` (the D15 columns), it is emitted **per-request from `src/proxy.ts`**, which already sets per-request headers (it owns the nonce-based CSP) and is the only layer that can see a query string or a per-row value. A static `next.config.ts` pattern cannot: `headers()` can match a query param only via `has: [{ type: 'query', key: 'page' }]`, and nothing there can express a `noindex` an editor set on one article in the SEO panel.
- **Feed alternates are page-scoped.** Root `layout.tsx` keeps only the jobs feeds; blog/news feed `<link rel="alternate">` is emitted by the article pages themselves.
- **Category and author hub URLs are deliberately sitemap-excluded** — reachable via `/site-map`, internal links and the index pages. Only article URLs enter the shards. Recorded so this is a decision, not an omission.
- **News date archives (`/news/2026/07`) and a cross-kind all-articles index are Phase 13.13** — deliberate cuts: at launch volume they would be thin-content pages. (An earlier draft numbered these 13.8/13.9, which now collide with two different deferrals.)
- **A per-article machine-readable surface for AI search is Phase 13.14**; v1 `llms.txt` work is limited to adding `/blog`, `/news`, the `/help/{slug}` pattern and repointing `/sitemap.xml` → `/sitemap-index.xml`.

**Exit criteria:** all 8 routes + loading + error render · every page passes the `under-public-header` check · Rich Results Test clean for each JSON-LD type · no existing `prose` page changed visually · Lighthouse LCP ≤2.5s / CLS ≤0.05 on an article page.

---

### 9.6 Visual design system — custom inline SVG illustrations

Every page, component and empty state in this system is held to the same visual bar as the best existing surfaces. The house style is already established and must be matched, not reinvented — precedents: `components/about/trust-visuals.tsx` (314), `components/about/ValuesCompass.tsx` (204), `components/billing/plan-visuals.tsx` (476), `components/billing/plan-detail-art.tsx` (218), `components/about/MissionVisual.tsx`, `components/home/HeroShowcase.tsx` (1429).

**The rules that style encodes** (read `trust-visuals.tsx:1-51` before authoring any of these):

- **Hand-authored inline SVG, never stock art, never a lucide glyph standing in for an illustration.** Each drawing depicts the specific thing its card claims. A generic icon is a failure, not a shortcut.
- **Server Components by default** — no `'use client'`, so illustrations ship **zero JS**. Motion is hover-only CSS, so a section costs nothing while it is off-screen.
- Shared `SVG_PROPS` const: `viewBox`, `fill="none"`, `className="h-full w-full"`, `preserveAspectRatio`, and **`aria-hidden`** (they are decorative; the adjacent text is the accessible name).
- A `TONES` record mapping a tone key → Tailwind wash/glow/bar classes, so one illustration re-skins per category without a second copy.
- **`<defs>` id collision is the trap here.** The precedent uses static ids and documents that this is only safe because each illustration renders **once per page**. Article surfaces break that assumption immediately — a blog grid renders the same category illustration 12 times, and duplicate gradient ids make every instance after the first resolve to the wrong `<defs>`. **Every article illustration therefore takes a required `idPrefix` prop** (or is a client component using `useId()`); a static id in this system is a bug. Ship a lint-style check in review: any `id="` inside `components/articles/**` must be a template literal.
- **`prefers-reduced-motion: reduce` disables all motion in this system — and the global rule does not exist yet.** An earlier draft said this "matches existing behaviour"; it does not. `globals.css` has no reduced-motion block at all, and the app's existing handling is six per-component JS checks. This system therefore **adds** an `@media (prefers-reduced-motion: reduce)` rule to `globals.css` zeroing `transition`/`animation` on the article illustration hover classes and on `.article-progress-bar`. That CSS rule is precisely what lets the illustrations remain zero-JS Server Components — a JS check would force `'use client'` on every one of them.

**Illustration inventory** — `components/articles/article-visuals.tsx` + `article-empty-art.tsx`:

- Per-kind hero art: **Help** (a question mark resolving into a checklist), **News** (a broadcast tower over a dateline), **Blog** (a page with a pull-quote and a rising engagement curve). Used on hub headers and as the card fallback when an article has no cover.
- Per-category art for the top 6 blog categories, tone-mapped, reused in cards and the category hub.
- **Empty states, which are where this usually gets skipped:** no search results · empty category · empty tag · no comments yet · comment awaiting moderation · article not found (404) · article gone (410) · draft preview banner · no bookmarks/reading list · offline/feed error. Each gets its own drawing, not a shared shrug.
- **Super-admin empty/zero states too** — one drawing per created admin page, not a token five across twenty pages. The full mapped list lives with `admin-empty-art.tsx` in the file inventory; admin surfaces reuse the same `TONES` record and illustration grammar as the public side, at a smaller scale, so the CMS does not read as a different product. Two of them carry meaning beyond decoration: **"nothing to review" and "zero broken links" are reward states and should look like rewards**, and the **shard-fetch-failure** state on `seo/indexing` must be _visually distinct from zero rows_ — collapsing those two is exactly the §3 incident, and 7.1b already requires the data layer to keep them apart.
- Loading: skeletons that match the real card geometry exactly (no layout shift on hydrate), reusing the app's existing skeleton primitives rather than a new spinner.
- Decorative section furniture: the carousel section's background wash, the ToC rail, the reading-progress bar, the helpfulness widget's yes/no faces, the share row.

**Typography and rhythm:** the article body is the product here. `@tailwindcss/typography` scoped to `.article-body` (§9.5), a measure capped near 68ch, `text-wrap: pretty` on headings, drop-cap optional per kind, figure/caption styling, callout and code-block treatments, and a table treatment that scrolls inside its own `overflow-x:auto` container rather than blowing out the page.

**Responsive layout** (specified because "responsive" otherwise means whatever the implementer does on the day):

- **Article detail:** single column below `lg`; at `lg+` a `grid-cols-[minmax(0,1fr)_16rem]` with the body left and a `sticky top-24` ToC rail right. The carousel's `rail` variant renders **only** at `lg+` where that column exists, and collapses into the in-flow `full` variant below it — otherwise `rail` is dead code on the majority of this audience's traffic.
- **ToC below `lg`:** a sticky collapsed disclosure pinned under the header showing the active heading and expanding to the full outline — keyboard-reachable, focus-visible. Explicitly **not** `hidden lg:block`, which silently deletes the feature on mobile.
- **Comment tree:** visual indentation caps at depth 3 while `depth` keeps counting; deeper replies render flush with the `replyToName` prefix (which Phase 6 already requires) carrying the context.
- Tables and code blocks scroll inside their own `overflow-x:auto` container; the page body never scrolls horizontally.

**The table of contents and heading ids** — the mechanism, not just the feature name:

- An id is **minted once, when the heading is created**, and persisted in `bodyHtml` as the heading's `id` attribute. It is **never re-derived from heading text**, because re-deriving breaks every shared `#anchor` and the copy-link-to-heading affordance the moment someone fixes a typo in a heading.
- Format `article-h-{slug}`, deduped within the document with a `-2`/`-3` suffix. **The `article-` prefix is required, not cosmetic:** an unprefixed id DOM-clobbers (`<h2 id="comments">` shadows `window.comments`) and collides with the app's own `#comments` / `#main` anchors.
- Depth: `h2` and `h3` only. Per-article toggle via an **`tocEnabled Boolean @default(true)` column** (it had none), and a per-heading exclude via **`class="article-toc-skip"`** — enumerated in §7.5's allowlist, because the `article-` prefix rule only permits classes that are actually listed. Neither control was implementable as originally written.
- **The ToC includes the FAQ and How-To sections** as trailing entries when present, with stable ids `article-h-faq` / `article-h-howto` minted by the renderer — otherwise the two most navigable parts of the page are missing from its navigation.
- **Imported and legacy content has no ids** — the Phase 10 HTML/Markdown importer derives them deterministically from the text on first parse and **writes them back into `bodyHtml`**, so they are frozen from that moment on exactly like authored ones.

**Cover images** are Cloudinary (D13) with `next/image`, explicit width/height, `priority` only on the hero of an article page, and a blurred placeholder derived from a Cloudinary transformation. Cards use `aspect-[16/9]` so a missing cover swaps in the per-kind illustration with **zero** layout shift.

**OG images:** generated at `/blog/[slug]/opengraph-image` via Next's `ImageResponse` — same visual language, title + kind badge + author + date over the tone wash. Falls back to a static per-kind card when the title is missing. (Runtime constraint: `ImageResponse` needs the font bytes fetched at build/edge — bundle the subset rather than fetching a remote font, which the CSP would block anyway.)

**Definition of done for the visual layer:** no page in this system ships a bare `<div>Loading…</div>` or an unstyled empty state · every illustration renders correctly when duplicated 12× on one page (the id-collision test) · Lighthouse a11y 100 on hub and article pages · zero CLS on card grids · every illustration is Server-rendered unless it genuinely needs `useId()`.

---

## 10. Phase 5 — Super-admin CMS

Routed pages under `/super-admin/articles` (**not** the email TemplateBuilder's full-screen overlay, which bypasses `ui/Modal` and has no focus trap, Escape handler or focus restore):

`articles` (list + filters + bulk) · `articles/new` · `articles/[id]/edit` (metadata, tiptap body per §10.1, SEO panel with live SERP + social-card preview and per-field Auto/Custom state per D15, scheduling, revision history + word-level diff, preview-as-published, **soft lock + presence**, draft notes) · `article-categories` · `article-tags` (rename/merge/usage) · `article-authors` · `article-redirects` · `article-comments` (moderation queue + reports + **staff reply/approve-and-reply/pin** + CSV export + bulk resolve) · `article-assets` (media library) · `articles/types` (D11 registry + its SEO patterns) · **`articles/seo`** + `seo/patterns` + `seo/overrides` + `seo/indexing` + `seo/broken-links` (the control centre, 7.7) · `articles/analytics` (overview · per-article · content health · editorial · moderation, all exportable) · `articles/audit` (review-due, decaying, low-helpfulness, orphans, broken links).

Nav goes into a **new, dedicated "Content" sidebar group** — see **D14**, which supersedes the earlier draft of this line (that draft folded the entries into the existing "Content & Moderation" group to dodge Sidebar's >5-groups auto-collapse). The group is placed high in the order so the auto-collapse lands on a lower-value group instead, and the collapse behaviour is accepted, not worked around.

**Editorial workflow — a legal-transition matrix, not a one-line chain.** The earlier draft was `DRAFT → IN_REVIEW → CHANGES_REQUESTED → SCHEDULED → PUBLISHED → ARCHIVED`, which reads as an enum ordering and leaves most real edges undefined: `unpublish` appears five times in this plan and never says what status it produces, `approve` has no target, there is no way to cancel a schedule, and `CHANGES_REQUESTED` has no return edge. `article-workflow.service.ts` enforces this table and **409s on anything not in it**:

| From                    | Action          | To                                        | Capability         | Side effects                                                                                                                  |
| ----------------------- | --------------- | ----------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| —                       | create          | `DRAFT`                                   | `article.create`   | —                                                                                                                             |
| `DRAFT`                 | submit-review   | `IN_REVIEW`                               | `article.edit.own` | assignment + notification                                                                                                     |
| `IN_REVIEW`             | withdraw        | `DRAFT`                                   | `article.edit.own` | —                                                                                                                             |
| `IN_REVIEW`             | request-changes | `CHANGES_REQUESTED`                       | `article.review`   | notification                                                                                                                  |
| `CHANGES_REQUESTED`     | resubmit        | `IN_REVIEW`                               | `article.edit.own` | notification                                                                                                                  |
| `IN_REVIEW`             | approve         | `DRAFT` + `approvedAt`/`approvedById` set | `article.review`   | unblocks publish/schedule; **cleared on any later body edit** — approval is of a specific version, not of the article forever |
| `DRAFT` (approved)      | publish         | `PUBLISHED`                               | `article.publish`  | checklist · `publishedAt` · sitemap · feeds · IndexNow · ISR · CDN purge                                                      |
| `DRAFT` (approved)      | schedule        | `SCHEDULED`                               | `article.schedule` | `scheduledPublishAt` set                                                                                                      |
| `SCHEDULED`             | unschedule      | `DRAFT`                                   | `article.schedule` | `scheduledPublishAt` cleared                                                                                                  |
| `SCHEDULED`             | reschedule      | `SCHEDULED`                               | `article.schedule` | new time; same validation as schedule                                                                                         |
| `SCHEDULED`             | worker fires    | `PUBLISHED`                               | system             | as publish                                                                                                                    |
| `PUBLISHED`             | edit            | `PUBLISHED`                               | `article.edit.*`   | **writes the D17 working copy only**                                                                                          |
| `PUBLISHED`             | publish-changes | `PUBLISHED`                               | `article.publish`  | promote · revision · correction check · full propagation                                                                      |
| `PUBLISHED`             | unpublish       | `DRAFT`                                   | `article.publish`  | **`publishedAt` preserved**; removed from sitemap + feeds; IndexNow removal                                                   |
| `PUBLISHED` \| `DRAFT`  | archive         | `ARCHIVED`                                | `article.delete`   | as unpublish                                                                                                                  |
| `ARCHIVED` \| `DELETED` | restore         | `DRAFT`                                   | `article.delete`   | slug collision + `RESERVED_SLUGS` re-check                                                                                    |
| any                     | delete          | `DELETED`                                 | `article.delete`   | 410 · IndexNow removal · CDN purge                                                                                            |

**Rules the matrix implies, stated so they are not guessed:** a `SCHEDULED` article **may** be body-edited, and the publish checklist **re-runs at fire time** (see below) · `schedule` is not legal on a `PUBLISHED` article — that is `publish-changes` · `unpublish` preserves `publishedAt` so a re-publish does not reset the article's age and destroy its news eligibility · every transition writes an `ArticleWorkflowEvent`.

**Cancelling a schedule** follows the in-repo precedent rather than inventing one: `email-campaign.service.ts:244` sets `status: input.scheduledAt ? 'SCHEDULED' : 'DRAFT'`, so `schedule` with a null `scheduledPublishAt` unschedules, and `POST /articles/:id/unschedule` is its explicit alias.

**Scheduling has a timezone contract.** The audience is IST and the cron runs UTC. The picker shows and accepts **IST**, converts to UTC for storage, and labels the stored value's timezone in the queue view. A past datetime is rejected; the minimum lead time is **5 minutes**, matching the `*/5` cron — anything tighter silently fires late and looks broken.

**If a scheduled article fails its publish checklist at fire time:** the worker does **not** publish and does **not** silently retry forever. It moves the article to `CHANGES_REQUESTED`, writes an `ArticleWorkflowEvent` with the failing lints, records `publishAttemptedAt` + `publishError` on the article, and **notifies the scheduler and the owner** (`category: 'article_schedule_failed'`). The same `publishAttemptedAt`/`publishError` pair captures non-checklist failures — a thrown exception, a stale `withLock` holder, a missed window — so the editor sees _why_ in the CMS. Prometheus "publish lag" alerting is ops-facing and is not a substitute. The scheduled-queue view surfaces any row with a `publishError`. This requires the checklist to distinguish **blocking** lints (missing title, empty body, missing cover alt, invalid How-To step count, slug collision) from **warnings** (reading level, meta length, internal-link count) — a warning must never block a scheduled publish, and that classification is part of the checklist spec, not an implementation detail.

**Unauthenticated draft sharing:** `GET /public/articles/preview/:token` — signed, 24h TTL, `noindex`, no cache, revocable. Lets an editor share a draft with a stakeholder who has no account.

**Publish checklist lints:** metaTitle/metaDescription length, cover present with alt + dimensions, word count, ≥1 h2, slug length, keywords, internal links present, **NEWS headline ≤110 chars** (Google Top Stories), reading level, and broken-link check. **Plus D16:** every FAQ row has a non-empty question _and_ answer; no duplicate questions; How-To has **≥2 steps** if `howToEnabled` (a 1-step How-To is invalid schema), every step has a name and text, and `howToTotalTime` parses as an ISO-8601 duration.

> ⚠️ Adding Image/Table extensions to the **shared** `ui/RichTextEditor.tsx` changes the editor schema for every existing consumer (job descriptions, ticket replies) — gate behind opt-in props.
> ⚠️ tiptap reads `value` only at mount — the `editorKey` remount trick is mandatory or revision-restore and image-insert silently do nothing.
> ⚠️ "CTR from search" needs a Search Console API integration that does not exist → **cut from v1**, listed in Phase 13.4.

### 10.1 — The authoring editor (rich text)

**TipTap is already installed and already wrapped.** `frontend/src/components/ui/RichTextEditor.tsx` is a complete TipTap 3 editor — StarterKit + Link + Placeholder + TextAlign + TextStyle/Color + Highlight, a 20-button toolbar, `promptDialog`-based link insertion, `immediatelyRender: false` for SSR safety. Deps `@tiptap/react`, `@tiptap/starter-kit` and five extensions are in `frontend/package.json` today. **Do not add a second editor library, and do not fork this file.** Seven surfaces already consume it (`employer/jobs/new`, `employer/jobs/[id]/edit`, `super-admin/jobs/new`, `super-admin/jobs/[id]/edit`, `admin/tickets/[id]`, `super-admin/email/templates`, `email/mail/MailComposer`) — its schema is shared blast radius.

**Extension strategy — additive and opt-in.** The article editor needs nodes the shared one lacks: `Figure` (Cloudinary-backed image + caption + align/width, above), `Table`, `CodeBlockLowlight`, `Subscript`/`Superscript`, `CharacterCount`, `Details`/callout, and a heading-anchor decoration.

> ⚠️ **No `Youtube` / embed node.** An earlier draft of this list included one; it contradicts **D7** (no `iframe`, anywhere, either side), the §7.5 sanitizer's FORBID list, and Phase 13.2, which defers vetted oEmbed embeds. A node the sanitizer strips on every save is worse than no node — it looks like it works in the editor and silently disappears on publish. Video stays deferred to 13.2.

**New dependencies, named** (the plan previously implied eight extensions while naming two): `@tiptap/extension-table` + `table-row`/`table-cell`/`table-header`, `@tiptap/extension-code-block-lowlight` + `lowlight`, `@tiptap/extension-subscript`, `@tiptap/extension-superscript`, `@tiptap/extension-character-count`, `@tiptap/extension-details` (or a local Node for the callout). `@tiptap/extension-image` is **not** used directly — `Figure` wraps it. Add these to `frontend/package.json` in Phase 0 so the version alignment with the installed `@tiptap/react` 3.x is verified before authoring begins. Adding them unconditionally rewrites the ProseMirror schema for job descriptions and ticket replies, and TipTap silently drops unknown nodes when it parses stored HTML — meaning an existing job description round-tripped through a changed schema can **lose content**. So:

- `RichTextEditorProps` gains one optional prop, `extensions?: 'basic' | 'article'` (default `'basic'` — every existing call site keeps byte-identical behaviour).
- The article extension set lives in a **new** `components/ui/rich-text/article-extensions.ts`, imported only when `extensions === 'article'`.
- The toolbar splits into `BasicToolbar` (today's buttons, unchanged) and `ArticleToolbar` (basic + figure/table/code/anchor groups — **no embed group**, per D7). No existing button moves.
- Regression gate: open one saved job description and one saved ticket reply in the editor before and after, and diff `editor.getHTML()` — byte-identical or the change is wrong.

**In-body images are a `Figure` node, not a bare `<img>`.** The renderer allows `figure`/`figcaption` but nothing could author them. The article set defines a `Figure` node wrapping the image plus an optional `figcaption`, carrying `data-align` (`left|center|right|full`) and `data-width` (`25|50|75|100`). Two constraints make this concrete:

- **Alignment reuses `@tiptap/extension-text-align`, already installed** and configured at `RichTextEditor.tsx:294` as `types: ['heading','paragraph']` — the article set widens it to include the figure node. **But** TextAlign renders an inline `style`, which §7.5's allowlist forbids, so it must be reconfigured to emit `class="article-align-{left|center|right}"` instead.
- §7.5's allowlist must **enumerate** `figure[data-align]`, `figure[data-width]` and the `article-align-*` / `article-img-*` classes. Leaving it to the `article-` prefix rule implicitly is how these get silently stripped in production.
- A keyboard-accessible **click-to-zoom lightbox** (`ArticleImageLightbox.tsx`) built on the existing `components/ui/Modal` — Escape to close, focus restored to the triggering figure, `role="dialog"` + `aria-modal`. Not a bespoke overlay, for the same reason §10 rejects the email TemplateBuilder's trapless full-screen overlay.
- The **first body image must not get `priority`** — that is reserved for the article hero (§9.6), and handing it to a body image moves the LCP element to the wrong thing.

**Article-only authoring affordances** (all in the article wrapper, none in the shared component): slash-command menu · bubble menu on selection · drag-and-drop + paste-from-clipboard image upload straight to Cloudinary with an optimistic placeholder and a real progress bar · paste-from-Word/Docs cleanup (strip `mso-*`, `<span style>` soup, smart quotes preserved) · live word/character/reading-time counter wired to the publish checklist · a **Markdown paste** path (paste `.md` → parsed to nodes) · heading outline panel that doubles as the ToC preview · internal-link autocomplete that searches existing published articles and inserts a relative `/blog/…` URL (feeding the "internal links present" lint) · `Ctrl/Cmd+S` manual save · focus/zen mode · full-screen toggle.

**Autosave and the mount-once trap.** TipTap reads `content` **only at mount**. Every flow that replaces the document from outside — revision restore, template insert, AI draft, autosave-conflict resolution — must bump a React `key` on the editor (the `editorKey` remount trick) or the call silently no-ops while the UI claims success. Autosave itself must _not_ remount: it is a debounced (2s idle) `onUpdate` that does **not** cut a revision (Phase 12.5). A dirty-state guard blocks route change and `beforeunload`.

**Where autosave writes depends on status (D17), and this is the load-bearing part.** On a `DRAFT`/`IN_REVIEW`/`CHANGES_REQUESTED`/`SCHEDULED` article it writes the live columns as normal. On a **`PUBLISHED`** or `ARCHIVED` article it writes the **draft columns** — because the public endpoint's predicate is `status:'PUBLISHED'` and does not change while someone edits, so writing live would put half-typed sentences on the public page within one ISR window. Promotion is the explicit `POST /articles/:id/publish-changes`.

> ⚠️ **Autosave must use the multipart body route, not a JSON `PATCH`.** An earlier draft of this line specified `PATCH /super-admin/articles/:id/autosave`; D1 is the proof that this cannot work — the global `xssSanitize()` runs DOMPurify with `ALLOWED_TAGS: []` over every string in `req.body`, so a JSON autosave would silently save the body **stripped to plain text**, and would do it every two seconds. Autosave is therefore `PUT /super-admin/articles/:id/body?mode=autosave` on the same sanitiser-skipping, multer-memory router as the manual save.

Three properties of `mode=autosave`, each of which is a bug if missed:

1. It does **not** cut an `ArticleRevision` (§12.5).
2. It does **not** bump `Article.version`. Bumping it would invalidate the editor's own `If-Match`/`expectedVersion` token on the very next manual save, turning every editing session into a false 409 conflict.
3. It gets its **own** rate limiter with its own `createRedisStore(prefix)` — a 2s-idle autosave across a few concurrent editors is the highest-QPS admin route in the app, and a reused store prefix throws `ERR_ERL_STORE_REUSE` at boot.

**`PATCH /articles/:id` stays JSON and metadata-only and must never carry `bodyHtml` or `bodyJson`** — asserted in the Phase 11 contract tests, because this is exactly the mistake that will be made again.

**Editing is HTML-over-multipart, sanitised twice.** The body cannot travel as a normal JSON string: `xssSanitize()` runs DOMPurify with `ALLOWED_TAGS: []` over every string in `req.body`, so a JSON POST arrives with the markup stripped to plain text, and `express.json({ limit: '10kb' })` would reject a long article anyway. The article write endpoints therefore take **multipart** bodies (already the pattern used for uploads) and are registered on a router that skips the global sanitiser, with `sanitizeArticleHtml()` (§7.5 — allowlist + hooks + `SANITIZER_VERSION`) applied explicitly in the service. The frontend also sanitises on render via `isomorphic-dompurify`, which is already a dependency and already used by the five job-detail pages — same defence-in-depth shape, no new library.

**True WYSIWYG typography.** `EditorContent` currently carries `prose prose-sm max-w-none`, which is **inert** — `@tailwindcss/typography` is not installed (see §Phase 4). When it is installed scoped under `.article-body`, the editing surface must get that same class, or the author writes in one typography and publishes into another. This is the one place where "scope prose to `.article-body`" deliberately extends into an admin surface.

**Accessibility + polish:** every toolbar button already has a `Tooltip`; the article toolbar adds `aria-pressed` on toggles, a roving-tabindex toolbar pattern, a visible keyboard-shortcut sheet (`?`), and a screen-reader-announced save state. Toolbar overflows into a "more" menu below `md` rather than wrapping into three rows.

**Exit criteria:** full CRUD for all six entities · lock prevents concurrent edits · revision restore round-trips · moderation queue actions are audited and 409 on double-action · analytics renders only metrics the backend actually collects · every destructive action confirmed · **existing job-description and ticket-reply HTML round-trips byte-identically through the extended editor** · an article body with images, a table and a code block survives save → reload → publish → public render with no node loss.

---

### 10.2 — What happens when the lock loses: conflict resolution

The lock is **soft** with takeover-with-warning, so two people editing the same article is an anticipated state, not an error case — yet the plan specified the 409 and stopped there. A 409 with no path forward means the loser's work is gone, and they will not use the CMS twice.

**The 409 body must carry what the panel renders**, or the conflict UI has nothing to show: `{ error: { code: 'VERSION_CONFLICT', currentVersion, changedByName, changedByUserId, changedAt, currentBodyHtml, requestId } }`. `currentBodyHtml` is what makes the three-way diff possible without a second round-trip.

> ⚠️ **An autosave that 409s must stop the loop.** A 2-second-idle autosave that retries into a conflict re-fires every two seconds forever, and each attempt looks to the user like the editor is broken. On a 409 the autosave loop **halts**, the document is marked conflicted, and the §10.2 dialog is raised — the user resolves it once rather than the client hammering the endpoint.

On a save whose `expectedVersion` no longer matches:

1. The save is rejected — the server never merges silently.
2. The editor keeps the local document intact and shows a conflict panel: **who** holds the lock, when they last saved, and a **three-way view** (base / theirs / mine) built on `RevisionDiffView` and `lib/text-diff.ts`, both already in the build list.
3. Three explicit exits: **Overwrite** (requires `article.edit.any`, cuts a revision of _their_ version first so it is recoverable), **Discard mine**, or **Copy mine out** — save the local document as a new `ArticleRevision` with a note, so nothing is lost even when the author walks away.
4. Takeover of a stale lock (no heartbeat for >2 min) writes an `ArticleWorkflowEvent` and notifies the displaced editor.

> ⚠️ The version token comes from the live row, and D17 means a published article's edits sit in the draft columns — so the conflict is over **the working copy**, and two editors sharing one working copy is exactly the case that produces this. Resolution operates on draft columns; nothing public moves until promote.

---

## 11. Phases 6–13 (each at Phase-2 parity)

### Phase 6 — Comments & moderation

_Owned here (write path lands in Phase 2, thread UI in Phase 4):_ the "awaiting review" success state (without it guests assume the form broke and resubmit) · author-only visibility of their own PENDING comment · **`replyToName` shown** so silent re-parenting is visible · reply notifications + unsubscribe token · **`notificationPreferences` is a `Json` blob on TWO Prisma models (`CandidateProfile` schema:731 and `CompanyProfile` schema:859) plus a frontend preferences UI** — add keys `articleCommentReply` and `articleCommentModerated` (default `true` for existing rows via a read-time default, not a backfill), and surface both in `candidate/settings` and `employer/settings` · commenter blocking/shadow-ban via `BlockedCommenter` · trusted-commenter auto-approve after N approved · defined behaviour when an article leaves PUBLISHED or `commentsEnabled` flips mid-thread (existing comments render read-only, form hidden) · guest consent capture via the existing `ConsentService` · guest erasure endpoint.
**Staff response & reply — the admin side of the conversation** (explicitly called for; v1 specified moderation but not _responding_):

- A super-admin/editor replies to any comment **from three places**: the moderation queue, the article's comment tab in the CMS, and inline on the public thread while signed in as staff. All three post through one endpoint.
- A staff reply sets `isStaff` + `staffRole`, **bypasses the moderation queue** (the author is already trusted), renders with an official badge and a distinct treatment, and may be **pinned** to the top of its thread (`isPinned`/`pinnedAt`/`pinnedBy`, one pin per thread, unpinnable, audited).
- **Approve-and-reply in one action**, because that is the actual workflow — approving then hunting for the row again is where moderation queues go to die. Also: reply-and-resolve, reply templates/canned responses (reusing the existing email-template pattern rather than a new one), and `@`-mention of the article author.
- Staff replies use the **same TipTap editor** in a constrained extension set (no images/tables — links and basic marks only), and pass through the same sanitizer.
- **Notifications:** a staff reply notifies the parent commenter (respecting `notificationPreferences`, including the guest unsubscribe token), and never notifies the staff member about their own reply.
- **Editing/deleting:** staff may edit their own reply within a window with an "edited" marker; deleting sets status `DELETED` (never a hard delete — the `parent` cascade would destroy the subtree, per the model note).
- **Bulk moderation** reuses the established `useBulkSelect` + `bulk-ui.tsx` primitives and the select-all-across-filter `scope()` model already used across the eight email pages — approve / reject / spam / delete / block author, all audited, 409 on double-action.
- **SLA visibility:** unanswered-comment age, oldest-pending, and median response time on the moderation dashboard, so "response and reply" is measurable rather than assumed.

**Exit:** spam suite (link stuffing, duplicate, banned fingerprint, rotating UA) all blocked · a guest can request and receive erasure · no PII in any public payload · a staff reply posts, badges, pins, notifies and appears publicly without a moderation round-trip · every moderation and reply action lands in the audit log with its actor.

### Phase 7 — SEO, sitemap, feeds, discovery

**7.1 Shards:** `sitemap-shards.ts` (D2 split + blog shard **appended** as the last id — ids are derived arithmetic, inserting renumbers help 8 and news 9), `sitemap.ts`, `sitemap-index.xml/route.ts`, `sitemap-news.xml/route.ts` (delete `fallbackNewsItem()`, conditional advertisement, 48h re-filter).

> ⚠️ `STANDALONE_SITEMAP_PATHS` is currently `export const … : ReadonlyArray<string>` (`sitemap-shards.ts:56`). Turning it into a function is a **breaking export-shape change** and violates constraint §2.2. **Keep the const** (computed, back-compat) and add `getStandaloneSitemapPaths()` alongside it. Shard overflow arithmetic for >50,000 articles per kind.
> **7.1e The public DETAIL response shape is pinned too.** The list shape is fixed in 7.1c, but the detail shape never was — so nothing contractually carried `faqs`, `howToSteps` or the ToC to the components and JSON-LD generators that consume them. It is:
> `{ …all list fields, bodyHtml, coverImageVariants: {card, hero, social, square, blur}, seo: {metaTitle, metaDescription, canonicalUrl, ogTitle, ogDescription, ogType, ogImageUrl, twitterCard, twitterTitle, twitterDescription, twitterImageUrl, noindex, nofollow, noarchive, maxSnippet, maxImagePreview, maxVideoPreview}, toc: [{id, text, level}], faqs: [{question, answerHtml, imageUrl}], howTo: {enabled, totalTime, tools[], supplies[], steps:[{name, text, imageUrl, url}]} | null, bylines: [{name, slug, role, avatarUrl, sameAs[]}], corrections: [{body, createdAt}], adjacent: {prev, next}, accessLevel, isTruncated }`

Two of those exist for a specific reason: **`coverImageVariants`** because the list shape carries only `coverImageUrl` and the article hero needs the `hero` variant (D13), and the **`seo` block** because `generateMetadata()` on the article page otherwise has no contractual source for the ten D15 columns — the panel would edit them and the page would never read them. Phase 11 contract-tests **both** shapes, not just the list.
`faqs`, `howTo` and the gated part of `toc` are **absent** on a gated response (above), and `isTruncated` is what the client uses to render the gate — never a length heuristic.

**7.1d Freshness — two different `lastmod`s, one of which already works.** Per-URL `<lastmod>` is **already implemented**: `sitemap.ts`'s existing `fetchHelpArticlesShardItems` / `fetchNewsArticlesShardItems` already read `r.updatedAt` per row into `ShardItem.lastModified`. The change is not to add it — it is to make those two reads (and the new blog fetcher) use **`contentUpdatedAt ?? publishedAt`**, so a view-count bump does not advertise a content change. `getSitemapLastmods()` is a _different_ consumer feeding the per-shard `<lastmod>` in the sitemap **index**.

> ⚠️ `contentUpdatedAt` is nullable with no default, so `_max: { contentUpdatedAt: true }` returns `null` for any corpus whose articles were published but never edited — and the article shards would then emit **no index-level lastmod at all**. The aggregate must be `GREATEST(MAX(contentUpdatedAt), MAX(publishedAt))`, via a raw query or two `_max`s coalesced in JS.

**7.1a Cover images reach Google Images for free — if the fetchers populate one field.** `sitemap.ts`'s `toEntry` is a single shared mapper that already spreads `images` for every dynamic shard (its own comment: "Without this, Next.js drops the `images` field and Google Image search misses every company logo"). So the three article fetchers only need to push `images: [coverImageUrl]` (omitted when null) and covers are indexed with no serialiser work. Note `ShardItem.images` is `string[]` — URLs only; width/height belong to the JSON-LD `ImageObject` (§9.5), not to the shard.

**7.1c The public list-item shape is a contract, not an implementation detail.** Pin it in the §7.1 table:
`{ slug, title, excerpt, kind, publishedAt, contentUpdatedAt, keywords[], coverImageUrl, coverImageWidth, coverImageHeight, coverImageAlt, categorySlug, authorSlug, readMinutes, accessLevel }`
**`/public/news` must include `keywords` and `publishedAt`** — `sitemap-news.xml/route.ts:56-70` already reads both, so omitting them silently degrades the news sitemap rather than failing loudly. And note the scope of §7.6's "keywords are advisory only": that governs the `<meta name="keywords">` **tag**, which is never emitted; it does **not** mean the API omits the field. Phase 11's existing contract test asserting `data.pagination.total` on the three sitemap-called endpoints extends to assert this field set, for the same load-bearing-shape reason as D4.

**7.1b Fetch budget:** three new article fetchers paginate at `limit=200` on top of the eight existing shard fetchers, all from one Next route. Budget: max 5 pages per fetcher, 8s total timeout, concurrency 3. A timeout or non-2xx is recorded **distinctly from "zero rows"**, so R8's silent-suppression failure cannot occur.
**7.2 Feeds:** six new routes (D8), each with item shape, limit, revalidate, and page-level `<link rel="alternate">`.
**7.3 Redirects & status codes:** `ArticleSlugRedirect` 301s, **410 Gone** for DELETED, IndexNow removal pings.

**Every non-published state needs a stated public status — only `DELETED` had one:**

| State                        | Public URL                                                                                | Sitemap / feeds | IndexNow     |
| ---------------------------- | ----------------------------------------------------------------------------------------- | --------------- | ------------ |
| `DRAFT` (never published)    | **404**                                                                                   | absent          | —            |
| `PUBLISHED` → unpublished    | **404**, not 410 — 410 is permanent and burns the URL, and unpublish is usually temporary | removed         | removal ping |
| `ARCHIVED`                   | **404**; if a successor exists, **301** to it                                             | removed         | removal ping |
| `DELETED`                    | **410**                                                                                   | removed         | removal ping |
| re-published after unpublish | 200, **original `publishedAt` preserved**                                                 | re-added        | re-ping      |

`publishedAt` preservation is the one that matters: resetting it on re-publish makes an old article look new, which breaks the news 48-hour window and misdates every card and feed entry.

> ⚠️ **410 needs a named artefact — an App Router page cannot set it.** `page.tsx` has no status-code channel, and `proxy.ts` is the wrong layer (it would need a per-slug DB lookup on every request). A sibling `route.ts` beside `page.tsx` is illegal. The mechanism is therefore a Route Handler at **`app/api/gone/[kind]/[slug]/route.ts`** returning `new Response(html, { status: 410 })`, with the detail page's data fetch redirecting to it when the backend answers 410.
> **The 404 and 410 drawings need mount points too.** Add nested `not-found.tsx` for the four route groups that call `notFound()` — `blog/[slug]`, `news/[slug]`, `help/[slug]`, `blog/category/[cat]` — each rendering the §9.6 "not found" art plus a search box and a hub link. A nested `not-found.tsx` is what stops Next falling through to the root `app/not-found.tsx`, which knows nothing about articles.
> **7.4 On-demand ISR:** a Next revalidation route handler + shared secret — **Express cannot call a Next server action**, so this is a real artefact, not a call.
> **7.5 Surfaces:** `robots.txt` (its unconditional `Sitemap: /sitemap-news.xml` line must become conditional too), `llms.txt`, `llms-full.txt`, `/site-map` human sitemap section, `layout.tsx` alternates.

**7.6 The automatic SEO engine** — `backend/src/services/article-seo.service.ts`, pure and versioned (`SEO_RULES_VERSION`, D15). Runs on every save and produces every field not pinned in `seoOverrides`:

| Field                                                                         | Derivation                                                                                                                                                                                                     | Guard                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slug`                                                                        | slugified `title`, deduped with a numeric suffix                                                                                                                                                               | reserved-word list; **frozen once published** — a change mints an `ArticleSlugRedirect` 301 instead of moving the URL silently                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `metaTitle`                                                                   | `ArticleType.metaTitlePattern` interpolated                                                                                                                                                                    | truncate at a word boundary to ≤60 chars; warn >60, error >70                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `metaDescription`                                                             | `excerpt`, else the first body paragraph stripped to text                                                                                                                                                      | ≤155 chars, word-boundary, never mid-sentence; warn <70                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `excerpt`                                                                     | first paragraph, sentence-boundary trimmed                                                                                                                                                                     | ≤200 chars                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `ogTitle` / `ogDescription`                                                   | `metaTitle` / `metaDescription` unless the type overrides                                                                                                                                                      | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `ogImageUrl`                                                                  | generated OG card (§9.6), else cover, else per-kind static                                                                                                                                                     | always resolves — a missing card is a silent social failure. **Ownership rule:** a route that has an `opengraph-image.tsx` must **not** also receive `image`/`openGraph.images` from `SEO.tsx` — Next gives file-based metadata precedence and would silently discard the passed value. So the handler itself reads the article, redirects to `ogImageUrl` when it is pinned in `seoOverrides`, and renders the generated card otherwise; the page metadata omits `openGraph.images` entirely on `/blog/[slug]`, `/news/[slug]`, `/help/[slug]` |
| `twitter*`                                                                    | mirrors the OG chain; `summary_large_image`                                                                                                                                                                    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `canonicalUrl`                                                                | self-canonical absolute URL; filtered/paginated variants point at the hub (§9.5)                                                                                                                               | never cross-domain unless pinned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `keywords` / `focusKeyword`                                                   | extracted from title + headings + tag set (TF-weighted, stop-worded)                                                                                                                                           | advisory only — never emitted as `<meta name="keywords">` (Google ignores it; it only leaks strategy)                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `readMinutes` / `wordCount` / `bodyText`                                      | from the **sanitised `bodyHtml`**, in the single post-sanitise parse (D10)                                                                                                                                     | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `headingIds` + ToC                                                            | `injectHeadingIds`                                                                                                                                                                                             | stable across edits                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Image `alt`                                                                   | required at upload; **never machine-invented**                                                                                                                                                                 | a body image without alt fails the publish checklist                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| JSON-LD                                                                       | `graph()` composes the article node (`@type` from `ArticleType.jsonLdType`) **+ `BreadcrumbList` + `FAQPage` when D16 blocks exist + `HowTo` when `howToEnabled && steps >= 2`**, then merges `schemaOverride` | validated in Phase 11; one `FAQPage` per page (D16 guard)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Breadcrumbs                                                                   | route prefix + category + title                                                                                                                                                                                | NEWS omits the category crumb (§9.5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `contentUpdatedAt`                                                            | set **only** when the body, title or cover materially changes — never by a view-count bump, a comment, or a metadata-only edit                                                                                 | this is the single source for `<lastmod>`, `dateModified` and `article:modified_time`; wiring it to `updatedAt` makes every article look edited every day and destroys the freshness signal                                                                                                                                                                                                                                                                                                                                                     |
| Sitemap entry, `lastmod`, feed inclusion, **IndexNow ping**, ISR revalidation | automatic — via the single fan-out below, not per-endpoint                                                                                                                                                     | no manual step, ever                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Internal links                                                                | engine _suggests_ targets from published articles; insertion stays human                                                                                                                                       | suggestions only — auto-inserted links read as spam                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

> ⚠️ **These fields need an emission path before they are worth storing.** `generateMetadata()` in `frontend/src/components/common/SEO.tsx` (line 70 — there is no `buildSEO`; ~40 call sites import it as `generateMetadata as buildMetadata`) currently **hardcodes** `twitter.card` (line 149) and `googleBot`'s `max-image-preview` / `max-snippet` / `max-video-preview` (lines 162-164), and has no `noarchive`, `ogTitle`, `ogDescription`, `ogType`, `twitterTitle`, `twitterDescription` or `twitterImage` prop at all. Ship the additive `SEOProps` extension **in the same phase** as the columns — every new prop optional with a default that reproduces today's output byte-for-byte — or super-admin gains ten controls that do nothing. (Also note the path: it is `components/common/SEO.tsx`, not `components/SEO.tsx`.)

#### 7.6a `propagateArticleChange()` — one owner for the whole fan-out

"Automatic on publish/unpublish" was too narrow. **Many more mutations change what a published page renders or what its JSON-LD contains**, and each was silently outside the trigger set — a FAQ edit, a How-To reorder, an SEO pin, a comment approval, a category rename. The failure is invisible: correct in the database, stale on the site, and never re-pinged.

All of it goes through **one exported function** in `article.service.ts`. Scattering the fan-out per endpoint is exactly how one path forgets a step, and the plan already has thirty-odd mutation endpoints.

```
propagateArticleChange(articleId, {
  contentChanged,   // bump contentUpdatedAt → lastmod, dateModified, article:modified_time
  seoChanged,       // re-derive non-pinned SEO fields
  structuredChanged,// FAQ / How-To / byline → JSON-LD graph must regenerate
  visibilityChanged // published/unpublished/deleted → sitemap + feeds + IndexNow
})
```

It performs, in order: SEO re-derivation → `contentUpdatedAt` bump → precise Redis invalidation (**never `KEYS article:*`**, which would nuke the view counters) → ETag-layer invalidation in **both** `::a0`/`::a1` auth buckets → CDN purge → Next on-demand ISR revalidation → IndexNow ping (batched) → Kafka event → webhook dispatch → audit row.

| Mutation                                                | contentChanged | seoChanged | structuredChanged | visibilityChanged |
| ------------------------------------------------------- | -------------- | ---------- | ----------------- | ----------------- |
| `publish-changes` (D17 promote)                         | ✅             | ✅         | ✅                | —                 |
| publish / unpublish / archive / delete / restore        | ✅             | ✅         | ✅                | ✅                |
| scheduled-publish worker fires                          | ✅             | ✅         | ✅                | ✅                |
| slug or kind change                                     | ✅             | ✅         | —                 | ✅ (+301 row)     |
| **`PUT /articles/:id/faqs`** on a published article     | ✅             | —          | ✅                | —                 |
| **`PUT /articles/:id/howto`** on a published article    | ✅             | —          | ✅                | —                 |
| **`PATCH /articles/:id/seo`** / `seo/reset`             | —              | ✅         | —                 | —                 |
| cover change / asset replace                            | ✅             | ✅         | ✅                | —                 |
| revision restore                                        | ✅             | ✅         | ✅                | —                 |
| byline / co-author change                               | —              | ✅         | ✅                | —                 |
| **comment approve / reject / staff reply**              | —              | —          | ✅                | —                 |
| editing a **draft** (any status but PUBLISHED/ARCHIVED) | —              | ✅         | —                 | —                 |
| autosave                                                | —              | —          | —                 | —                 |

> ⚠️ **Comment moderation is on this list for a reason.** Page 1 of the comment thread is SSR'd and wrapped in `UserComments` JSON-LD, and `commentCount` renders on cards. Approving a comment therefore changes the published HTML _and_ its structured data — but the moderation endpoints live in a different service and would never have called this.
> ⚠️ **Autosave deliberately propagates nothing.** It writes the D17 working copy, which no public surface reads. Wiring it here would re-ping IndexNow every two seconds.
> ⚠️ **Sitewide SEO recompute** (`POST /articles/seo/recompute`) rewrites metadata across the whole corpus. It must call this per affected article in **batches**, not skip it — otherwise every published page's `<title>` changes in the database and nothing invalidates, so the fix appears not to work.
> ⚠️ **Category / tag / author slug changes and tag merges** propagate to every article that references them: their hub URLs move (so they need their own `ArticleSlugRedirect`-equivalent 301s) and every article page shows the renamed label. Batch-propagate, and cap the fan-out — a merge across 500 articles must not become 500 synchronous IndexNow pings.

**The on-demand ISR route needs a contract, not just a name.** `POST /api/revalidate-article` takes `{ secret, paths: string[], tags?: string[] }`, validates the shared secret in **constant time**, then calls `revalidatePath` for each path **and `revalidateTag` for each tag**.

> ⚠️ **`tags` is not optional decoration — without it the carousel cache has no invalidation channel at all.** §9a and R19 both specify "one shared, tag-based cache entry per (kind, category, count) tuple", and `revalidatePath` cannot clear a tag. The tag names are fixed here so caller and cache cannot drift: **`articles:{kind}`**, **`articles:{kind}:{categorySlug}`**, **`article:{id}`**, **`article-hubs`**.

The **caller computes the full path set**, because it is never one URL: the article, its kind hub, its category hub, each tag hub, its author hub, the homepage when it is among the latest, and the six feed routes. A revalidation that only clears `/blog/[slug]` leaves every carousel and hub showing the old title.

Also specified, because each is a real failure mode: a secret mismatch returns **401** and is logged with the caller IP · the route is **idempotent** (re-revalidating a fresh path is a no-op, so retries are safe) · a revalidation failure is **logged and non-fatal to the calling Express transaction** — the database write must not roll back because Next was briefly unreachable; it is queued for retry instead · each call logs the reason (`publish`, `publish-changes`, `faq`, `comment`, …) so the indexing monitor can show why a page was last refreshed.

**Explicitly not automated** (and therefore manual in super-admin, which is the point of D15): the final headline when an editor wants a specific one · a cross-domain canonical · `noindex` on a deliberately thin page · redirect targets for retired URLs · `schemaOverride` · the sitewide title/description patterns themselves · robots directives for non-article routes.

**7.7 Super-admin SEO control centre** — `/super-admin/articles/seo`, inside the new "Content" group (D14):

- **Per-article SEO panel** (in the editor): live Google SERP preview (desktop + mobile), live OG/Twitter card preview, per-field **Auto/Custom** badge with one-click reset (D15), character counters with the thresholds above, focus-keyword analysis (in title / description / H1 / first paragraph / URL / density / heading coverage), and a 0-100 `seoScore` with the specific failing checks listed rather than a bare number.
- **Sitewide patterns:** edit `ArticleType` SEO templates with a live token preview against a real sample article; saving offers a **"recompute all non-pinned fields"** action showing the affected count first.
- **Overrides dashboard:** which articles have pinned fields, what the auto value _would_ be, and bulk reset — this is what stops override rot.
- **Redirects manager** (`ArticleSlugRedirect`): list, create, edit, bulk import, loop/chain detection, and **hit counts that come from somewhere** — `hitCount`/`lastHitAt` columns plus `@@index([hitCount])`.
  > ⚠️ Do **not** increment synchronously on the 301. The article routes sit behind `cache()` + `etagCache({publicCdnCache:true})` and Cloudflare, so an edge-served 301 never reaches the controller and the count would undercount badly while adding a write to a hot path. Increment `article:redirhits:{id}` in Redis and flush through the generalised `view-counter-flush.worker.ts` prefix table. **This adds a third namespace to the disjoint-prefix trap** (`article:views:` / `article:viewday:` / `article:redirhits:`) — R3's regression check must cover it.
- **404 / broken-link monitor:** internal links resolving to 404, articles linking to retired slugs, one-click "create redirect". Real 404 traffic is captured in `ArticleNotFoundHit { path @unique, referrerHost, count, firstSeenAt, lastSeenAt, resolvedRedirectId }`, written from the article routes' not-found path — without it, "404 monitoring" only ever sees links the crawler already knew about, never the ones real users and external sites actually hit.
- **Sitemap & indexing monitor:** per-shard URL counts and `lastmod`, last IndexNow ping and response, feed health, and the **shard-fetch failure distinction from 7.1b surfaced as an alert** — this is precisely the failure that caused the live incident this plan opens with (§3).
- **Robots & crawl controls:** per-article robots directives, per-type defaults, and a read-only render of the effective `robots.txt`.
- **Article-system settings** (`articles/settings`) over one `SystemConfig` document, matching the house pattern: comments kill switch, default `commentsEnabled`, pre-moderate vs auto-approve, trusted-commenter threshold, guest comments on/off, and the keyword blocklist (which moves off the pod filesystem in T0.4 and needs an editor somewhere). Backed by `GET|PATCH /super-admin/article-settings` with a cached accessor seeded from the §7.4 defaults.
  > ⚠️ **Rate-limit values do not move here.** `rate-limit.ts` builds its limiters at boot from `createRedisStore(prefix)`; making them settings-driven would mean a per-request settings lookup and a restructure of the limiter layer, for no benefit. They stay as code constants in the §7.4 table.
- **Schema validator:** renders the generated JSON-LD per article with inline validation before publish.
- **SEO audit report:** missing/duplicate meta titles and descriptions, thin content, orphan pages (no internal inbound links), stale content past its review date, low-helpfulness articles, images missing alt, and articles whose `seoRulesVersion` is behind — exportable via the existing report/export infrastructure.
- **Keyword cannibalisation:** group published, indexable, public articles by `lower(trim(focusKeyword))`, flag every group with more than one member, link to all members, and offer set-canonical / merge / re-target. Needs `@@index([focusKeyword])` on `Article` — which lands in the same single migration as everything else, not a follow-up.
- **Readability, defined rather than gestured at:** "reading level" is **Flesch Reading Ease** computed over the already-derived `bodyText`, in `article-seo.service.ts` alongside `wordCount`/`readMinutes` — so it is covered by `SEO_RULES_VERSION` and recomputes with everything else. Surfaced as a publish-checklist warning, never a hard block.

**Exit:** GSC reports zero errors on all shards · `/sitemap-news.xml` advertised only when a real article is <48h old · every article URL reachable from the human sitemap · **publishing an article with no SEO fields touched produces a complete, valid, length-compliant meta/OG/JSON-LD set with zero human input** · pinning a field survives a title change; resetting it restores the derived value · bumping `SEO_RULES_VERSION` recomputes non-pinned fields and leaves pinned ones untouched.

### Phase 8 — Analytics & compliance

`ArticleViewDaily.day` is **UTC midnight** while the audience is IST — the analytics UI labels every bucket "UTC" explicitly, and the 02:15 UTC refresh (07:45 IST) is documented so a partial current-day bucket is never mistaken for a drop.

**User-facing policy copy** (v1 covered the machinery but not the disclosure): guest comment PII (`guestEmail`, `ipAddress`, `userAgent`, `fingerprintHash`), the fingerprint mechanism, the `ha_content_ref` attribution cookie (§11.8a) and the retention TTLs need copy in `/privacy`, `/cookie-policy` and `/terms`, plus a new **`/community-guidelines`** page linked from the comment form.

**Editorial trust surfaces — required because this system publishes NEWS.** Silently editing a published story is the failure mode here:

- `ArticleCorrection` rows, written from the path that already detects a material body change on a **published** article, rendered as a dated corrections notice on the article and surfaced in the CMS.
- A new **`/editorial-policy`** page (sourcing, fact-checking, corrections, AI-use disclosure, ownership), linked from every article byline and from the footer.
- `lastReviewedAt` rendered as "Last reviewed {date}" in `ArticleByline` for HELP articles — the column already exists and it is the cheapest genuine freshness signal available.
  > ⚠️ **`/accessibility` already exists** in this repo alongside `/privacy`, `/terms`, `/cookie-policy`, `/disclaimer` and `/refund-policy`. The task there is to **link** to it from the article surfaces, not to create it — creating it would collide with a shipped route, and rewriting it is barred by the no-break constraint.

`ArticleViewDaily` + HyperLogLog unique views · GA4 **client-side only** (a server mirror double-counts with a different identity) · BigQuery `content_events` · Prometheus metrics · DPDP export + erasure + retention. Analytics UI shows only collected metrics — "avg read depth", "time on page" and "traffic sources" require instrumentation that must ship in this phase or the widgets are cut.

### 11.8a Content → application attribution (the metric this system exists to move)

This is a **job portal**. "Views" and "read time" are proxies; the business question is _which article produced an application, a registration or a purchase_, and nothing in the plan could answer it. Two halves, both required — GA4 alone cannot, because it is unreadable server-side (the same reason Search Console CTR is cut to 13.4).

**(a) Client — extend the existing taxonomy, do not invent a parallel one.** `lib/analytics/types.ts` already declares a **closed** `AnalyticsEvent` union containing `job_apply`, `sign_up`, `purchase`, `begin_checkout` and `lead`, fanned out to GA4 plus eight pixels by `analytics/track.ts` — and that file is _already_ a modify row for `article_view`/`article_read`. Same row: add an optional `contentRef?: string` to the existing `job_apply` / `sign_up` / `purchase` variants, plus one new `article_cta_click` variant.

**(b) Server — a first-party row.** `model ArticleConversion` + `enum ArticleConversionType { CTA_CLICK JOB_VIEW APPLICATION_SUBMITTED REGISTRATION PLAN_PURCHASE }`, modelled on the **shipped** `WaConversion` (`schema.prisma:4211`), written by an `article-conversion.service.ts` cloned from `whatsapp-conversion.service.ts`'s `recordConversion()`. That precedent also bumps a denormalised counter — mirror it with `Article.conversionCount Int @default(0)` so the list view needs no join.

**Last-touch** is a first-party `ha_content_ref` cookie (articleId + first-touch timestamp, 30d), read at the existing application-create / register / order-paid call sites. Two constraints that are easy to get wrong:

> ⚠️ It must be set and read **client-side only and never enter the CDN cache key**. Article HTML is edge-cached (`s-maxage` + `etagCache({publicCdnCache:true})`), and a `Vary` on this cookie would shatter the edge cache that all 16 carousel placements depend on (R19).
> ⚠️ It is a tracking identifier: it needs a line in the `/privacy` + `/cookie-policy` + `/terms` copy task this phase already owns, and it sits behind the **same consent gate that already gates the pixel loaders**.

Name `content_conversion` in T0.6's event taxonomy and in the `content.article.*` Kafka payload so the Phase 0 BigQuery DDL is right the first time. "Attributed applications, conversion rate and value per article" joins the Phase 8 overview, the per-article detail, content health, and the **exit criteria**.

**The super-admin analytics surface** (`/super-admin/articles/analytics`), built on the existing dashboard/report primitives rather than a new charting stack — `recharts` is already the house chart library and the report/export infrastructure already exists:

- **Overview:** total/published/draft/scheduled by kind, views and unique views over a selectable range, top and bottom articles, publishing cadence, and a comment-volume trend. Range picker + segment controls matching the pattern already shipped on the reports page (`resolveRange`).
- **Per-article detail:** view/unique-view series, scroll-depth buckets, read-completion rate, helpfulness yes/no ratio with trend, comment count and sentiment split, referrers, device/geo split, average read time vs estimated `readMinutes` (the gap between the two is the useful signal), and the article's `seoScore` history.
- **Content health:** decaying articles (views trending down over 90 days), stale-past-review-date, low-helpfulness, zero-view, orphan (no internal inbound links), and broken-link counts — each row linking straight into the editor. This is the same dataset the SEO audit (7.7) reads; one query layer, two presentations.
- **Editorial metrics:** per-author output and performance, time-in-status (draft→review→published), review turnaround, and scheduled-queue lookahead.
- **Comment/moderation metrics:** queue depth, oldest pending, approval/rejection ratio, spam-block counts, staff response time (Phase 6 SLA), and top reported threads.
- **Every view is exportable** through the existing report/export pipeline (CSV/XLSX, PII-gated, audited) rather than a bespoke download path.
- **Truthfulness rule, enforced:** a widget renders only if a real column or a real event backs it. No estimated, interpolated or placeholder numbers — a metric with no source is cut from the UI, not faked with a plausible-looking chart.

**Exit:** every dashboard number traceable to a real column · export contains article data · forensics purge verified · no widget renders a metric the backend does not actually collect · every analytics view respects the same date-range/segment semantics as the existing reports page.

### Phase 9 — Navigation & sitewide surfacing

Each surface is specified, not just named:

#### 9a. `ArticleCarousel` — the blog preview-card carousel

One shared, **widely-placed** module: `components/articles/ArticleCarousel.tsx` (presentation) + a thin per-surface wrapper that supplies the query. It is the primary way this system is surfaced across the app, so it is specified once and reused everywhere rather than re-implemented per page.

**Built on the existing slider engine, not a new library.** `hooks/use-snap-slider.ts` already exists and is the house carousel controller — it derives `atStart`/`atEnd`/`pageCount`/`activePage` from real scroll geometry (`scrollLeft`, `clientWidth`, `scrollWidth`) so the index cannot desync from a manual swipe or trackpad scroll, and it exposes `scrollByPage`/`scrollToPage`/`sync`. **Verified consumers: `FeaturedCompaniesSlider`, `LatestJobsSection`, `TopCompanyCategoriesSlider`** — copy those three, not `TestimonialCarousel`, which is a _different_ engine (paged `AnimatePresence` transitions with autoplay and `useSyncExternalStore` breakpoint tracking) suited to one-testimonial-at-a-time, not to a scrollable card rail. **No embla, no swiper, no keen-slider** — none are dependencies and none are needed.

- Markup: a `<ul>` scroll container with `snap-x snap-mandatory overflow-x-auto`, `<li className="snap-start">` cards, `onScroll={sync}`, and `sync()` re-called when the item count changes.
- Cards per view: 1 / 2 / 3 / 4 at sm / md / lg / xl, driven by basis utilities, so the same component serves a narrow auth-page column and a full-bleed homepage band.
- Prev/next buttons disabled via `atStart`/`atEnd` (never hidden — hiding causes layout shift), dot indicators from `pageCount`/`activePage`, `scrollToPage` on dot click.
- **A11y:** `role="region"` + `aria-label`, `aria-live="polite"` off (it is user-driven, not auto-advancing), buttons labelled "Previous articles"/"Next articles", full keyboard reachability, and visible focus rings on cards. **No autoplay** — autoplay carousels are an a11y liability and are explicitly rejected here.
- **Reduced motion:** `scrollByPage`/`scrollToPage` pass `behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'` — the pattern already shipped at `app/employer/jobs/new/page.tsx:543,579`. `use-snap-slider.ts` hardcodes `'smooth'` at lines 40 and 45, so it takes an **optional `behavior` argument** rather than having those defaults changed, keeping its three existing consumers byte-identical.
- **RTL/overflow:** the track scrolls inside its own container; the page body never scrolls horizontally.
- Card content: cover (Cloudinary, `aspect-[16/9]`, per-kind illustration fallback — §9.6), kind badge, category chip, title (2-line clamp, `text-wrap: pretty`), excerpt (2-line clamp), author avatar + name, published date, reading time. Whole card is one link; nested interactive elements are avoided so there is exactly one tab stop per card.
- **Server Component** with the fetch done server-side and passed as props; the client boundary is only the slider shell. Skeleton matches card geometry exactly (zero CLS).
- Variants: `full` (homepage band), `compact` (auth pages, narrower column), `rail` (in-article sidebar).

**Placements** — every one specified, not just named:

| Surface                                           | Module / wrapper                                                                                              | Query                                         | Count   | Below-minimum behaviour                            | TTL    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------- | -------------------------------------------------- | ------ |
| **Homepage** `app/page.tsx`                       | `LatestArticlesCarousel` (`full`)                                                                             | latest BLOG published                         | 8       | **hide the module entirely** — never render sparse | 600    |
| **Candidate login** `/auth/login/candidate`       | `ArticleCarousel` (`compact`) inside `CandidateAuthShell`, between `TestimonialCarousel` and `PageFaqSection` | BLOG in `career-advice` + `interview-tips`    | 6       | hide                                               | 900    |
| **Candidate register** `/auth/register/candidate` | same shell → same placement, single insertion covers both                                                     | as above                                      | 6       | hide                                               | 900    |
| **Employer login** `/auth/login/employer`         | `ArticleCarousel` (`compact`) inside `EmployerAuthShell`, same slot                                           | BLOG in `hiring-insights` + `employer-guides` | 6       | hide                                               | 900    |
| **Employer register** `/auth/register/employer`   | same shell → same placement                                                                                   | as above                                      | 6       | hide                                               | 900    |
| `/jobs` listing                                   | `CareerAdviceStrip` (`full`)                                                                                  | BLOG in `career-advice`                       | 6       | hide                                               | 900    |
| `/companies` listing                              | `HiringInsightsStrip` (`full`)                                                                                | BLOG in `hiring-insights`                     | 6       | hide                                               | 900    |
| **Article page footer**                           | `RelatedArticlesCarousel`                                                                                     | related by tag/category, excluding self       | 6       | fall back to latest-in-kind, then hide             | 600    |
| **Blog/News/Help hubs**                           | `FeaturedCarousel` above the grid                                                                             | `isFeatured` then latest                      | 6       | hide (grid still renders)                          | 600    |
| **Category / tag / author hubs**                  | `ArticleCarousel` (`full`)                                                                                    | more from this category/tag/author            | 6       | hide                                               | 900    |
| `/about`, `/contact`, `/pricing`                  | `ArticleCarousel` (`full`)                                                                                    | latest BLOG                                   | 6       | hide                                               | 900    |
| `/help` hub + help article                        | `ArticleCarousel` (`compact`)                                                                                 | popular help + related blog                   | 6       | hide                                               | 900    |
| **Candidate dashboard**                           | `ArticleCarousel` (`compact`)                                                                                 | BLOG in `career-advice`                       | 6       | hide                                               | 600    |
| **Employer dashboard**                            | `ArticleCarousel` (`compact`)                                                                                 | BLOG in `hiring-insights`                     | 6       | hide                                               | 600    |
| `/vendors` hub                                    | `ArticleCarousel` (`full`)                                                                                    | BLOG in `hiring-insights`                     | 6       | hide                                               | 900    |
| FooterMegaSection                                 | link group (not a carousel)                                                                                   | category hubs                                 | 4 links | hide group                                         | static |

> ⚠️ **Both auth shells are single files each rendering four routes** (`login/candidate`, `register/candidate` via `CandidateAuthShell`; the employer pair via `EmployerAuthShell`). One insertion per shell covers all four pages — do **not** edit the four route files.
> ⚠️ **Four host pages are client components, not two.** Verified by reading the first line of each: `app/contact/page.tsx` and `app/vendors/page.tsx` are both `'use client'`, on top of the two auth-gated dashboards. All four use a `useQuery` fetch rather than the Server Component path — same visual component, different data hook. A fifth, `app/help/page.tsx`, is `'use client'` **today** but §9.4 converts it to a Server Component; its carousel is therefore **hard-ordered after** that conversion, and uses the server path once it lands. Getting this wrong means either a `'use client'` page trying to `await` a fetch, or a pointless client fetch on a server page.
> ⚠️ Sixteen surfaces hitting the public article list endpoint make its cache mandatory, not optional (§7.6). One shared, tag-based cache entry per (kind, category, count) tuple; revalidated on publish by the on-demand ISR route (7.4).

**The minimum, as an actual number.** "Below-minimum behaviour: hide" is meaningless without one. A carousel renders only when the query returns **≥ 4** items (enough that a 3-up desktop layout has something to scroll to); below that the module returns `null` and renders nothing — not a heading, not an empty rail, not a "coming soon". The `RelatedArticlesCarousel` is the one exception: it falls back to latest-in-kind before hiding, because an article page with no onward path is worse than a slightly loose match.

**Every filtered placement needs its category to exist.** Seven placements filter on category slugs — `career-advice`, `interview-tips`, `hiring-insights`, `employer-guides` — and none of those were enumerated in Phase 10's "8 categories". They are now named there explicitly, each seeded with ≥4 published articles, or those seven surfaces are permanently invisible and the failure is silent by design.

Phase 10 must satisfy the per-kind minimum **before** Phase 9 turns any surface on — with 16 placements, a thin content library is visible everywhere at once, which is exactly what the hide-when-sparse rule exists to prevent.

**Files touched:** Header `resourcesMenuItems` (**plus `startsWith` active-state clauses** or `/blog/my-post` never highlights) · Footer — the three placeholder links currently all resolve to `/help`, so repointing is **hard-ordered after** the category hubs exist and have content · FooterMegaSection · `app/page.tsx` · `CandidateAuthShell.tsx` · `EmployerAuthShell.tsx` · `/jobs` · `/companies` · `/about` · `/contact` · `/pricing` · `/help` · `/vendors` · candidate + employer dashboards · `routes.ts` · `api.ts`.
**Exit:** no dead link anywhere · active states correct on nested routes · the carousel renders correctly at every breakpoint on all 16 surfaces · a surface below its minimum renders **nothing**, not an empty carousel shell.

### Phase 10 — Seed, backfill & content

**The single biggest dependency.** Seed script (idempotent upsert on `[kind,slug,locale]`) for: 8 categories, 25 tags, 3 authors, **12 help articles, 6 news articles, 10 blog posts** — all `en` (D5). Plus an HTML/Markdown importer and bulk CSV create. Optional FAQ→help-article promotion (never duplicating FAQ text verbatim).

**The categories are a table, not a prose list**, because §9a's placements filter on four of these slugs, §9.6 needs a tone key per category for its art, and Phase 9 repoints three footer placeholders onto them — a typo or a missing row makes a surface silently invisible forever:

| slug              | label              | kind hint | tone (§9.6) | consumed by                                                                   |
| ----------------- | ------------------ | --------- | ----------- | ----------------------------------------------------------------------------- |
| `career-advice`   | Career Advice      | blog      | primary     | candidate auth carousel · `/jobs` strip · candidate dashboard                 |
| `interview-tips`  | Interview Tips     | blog      | primary     | candidate auth carousel                                                       |
| `hiring-insights` | Hiring Insights    | blog      | emerald     | employer auth carousel · `/companies` strip · `/vendors` · employer dashboard |
| `employer-guides` | Employer Resources | blog      | emerald     | employer auth carousel · **Footer "Employer Resources"**                      |
| `salary-guides`   | Salary Guide       | blog      | amber       | **Footer "Salary Guide"**                                                     |
| `resume-tips`     | Resume Tips        | blog      | primary     | Footer third placeholder                                                      |
| `workplace`       | Workplace          | blog      | amber       | —                                                                             |
| `industry-news`   | Industry News      | news      | amber       | —                                                                             |
| `product-updates` | Product Updates    | news      | primary     | —                                                                             |

**Each of the four carousel-queried slugs needs ≥4 published articles** to clear the §9a minimum, so the blog seed count rises to **16** rather than leaving seven surfaces dark. The three Footer placeholders that currently all resolve to `/help` repoint to `employer-guides`, `salary-guides` and `resume-tips` respectively — which is why those rows exist even though no carousel queries them.

Seed content must also exercise the D16 features, or they ship untested: **at least two articles with FAQ blocks and one with a complete How-To** (≥2 steps, total time, tools), so `FAQPage`/`HowTo` JSON-LD is validated against real seeded data in Phase 11 rather than against a fixture.

**Exit:** every shard non-empty · every hub has ≥3 articles (the tag-page thin-content threshold) · **each of the four carousel-queried categories has ≥4 published articles, verified by actually loading all 16 §9a surfaces and confirming the carousel renders** · re-running the seed changes nothing.

### Phase 11 — Testing

**Named suites:** a sanitizer **golden-file** suite (XSS corpus in → expected HTML out, including the `class` allowlist and `iframe` rejection) · **contract tests asserting `data.pagination.total` is present on all three sitemap-called endpoints** (load-bearing per D4 — its absence suppresses a shard silently and forever) · JSON-LD snapshot tests per page type · feed snapshot tests · redirect/410 integration tests · comment abuse-path integration tests · **visual regression across every existing `prose` consumer** (R2) · slug + reserved words · diff · shard arithmetic · fingerprint day-bucketing · moderation transitions · publish→sitemap under the existing `backend/src/services/__tests__/` and `frontend` jest · **no E2E harness exists in either package.json** → either scope Playwright as its own task or replace E2E with integration + a documented manual launch checklist. Decide at T0 planning; do not assume.
**Exit:** named coverage targets met · CI green.

### Phase 12 — Launch, monitoring & rollback

**Rollback runbook** (v1 had one clause). Worst case: articles published, URLs indexed, a defect found.

1. `article.system` feature flag **off** → public endpoints 404, admin CMS hidden. Traffic stops immediately; no deploy needed.
2. Shards self-de-advertise on the next index revalidation (D2) because counts read 0 — no manual sitemap edit.
3. Already-indexed URLs: leave them 200 and serving (do **not** mass-410 — that burns the URLs). If the defect is content, unpublish individually; if structural, fix forward.
4. Only if data is corrupt: a forward migration dropping the new tables. The original migration is additive with no down path (§6.4).
5. IndexNow removal pings **only** for URLs deliberately retired, never as a bulk rollback step.
6. GSC: do not remove the sitemap; a suppressed shard resolves itself.

Staging canary · Search Console + Bing submission · Rich Results validation for all ~10 JSON-LD types · GSC "Crawled — currently not indexed" watch (tag/filter/paginated URLs are the expected pile) · rollback story (CD auto-migrates **and** flips public SEO surfaces simultaneously — feature flags are the kill switch).

### Phase 12.5 — Capacity, cost and retention envelope

| Resource                  | Policy                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ArticleRevision`         | Autosave never cuts a revision (and on a published article it writes only the D17 working copy); a **revision is cut only** on manual save, status transition, `publish-changes`, or after 10 minutes of accumulated change. Retain 100 per article + **all published versions forever** (identified by `wasPublished`, which the prune job filters on — without that column the rule cannot be expressed). Content-hash dedupe. Pruned daily (R14) |
| Cloudinary media (D13)    | 5 MB/asset cap; orphan GC daily under the **four-part predicate + dry-run + per-run cap** in Phase 3 (never a bare `refCount = 0` sweep); transformation-credit + storage usage reviewed at 1,000 assets. Shares the account with profile/company/vendor images, so the GC job is what keeps article media from crowding the existing quota                                                                                                         |
| Redis HLL                 | One key per article per UTC day, 14-day TTL                                                                                                                                                                                                                                                                                                                                                                                                         |
| BigQuery `content_events` | Partition by day, 90-day expiry                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Kafka `ha.content`        | 7-day retention                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Postgres                  | GIN indexes on 4 array columns; revision table is the growth risk — the cap above bounds it                                                                                                                                                                                                                                                                                                                                                         |

### Phase 13 — Deferred but scheduled

13.1 multi-locale articles + locale routing (D5) · 13.2 vetted oEmbed embeds (D7) · 13.3 per-category feeds (D8) · 13.4 Search Console API for CTR · 13.5 Elasticsearch indexing + global search/autocomplete · 13.6 A/B headline testing · 13.7 newsletter integration with the existing in-house email platform (`EmailContact`, double opt-in, RFC 8058 — all already built and currently unused here) · **13.8** social auto-post and owned-channel distribution (WhatsApp broadcast + push), deferred because each needs its own consent and frequency policy · **13.9** behavioural "related by what others read" (needs the `ArticleConversion`/view history to accumulate first) · **13.10** a true `bodyJson` render pipeline if an app or per-block surface ever needs it (D10) · **13.11** article series / multi-part grouping (needs a `/blog/series/[slug]` hub and an undecided canonical + sitemap policy) · **13.12** author-follow (worthless without a publish-time notification channel) · **13.13** news date archives (`/news/2026/07`) + a cross-kind all-articles index (thin content at launch volume) · **13.14** a per-article machine-readable surface for AI search.

---

## 11.5 Additions you did not ask for (the "things I missed" clause, made auditable)

Included because an enterprise content system is incomplete without them. Each is a deliberate scope addition, visible rather than smuggled in:

access gating (D12) · editorial workflow + assignments + approvals · soft edit locks and draft notes · revision history with diff and restore · slug-change 301s and 410 Gone · content graph with orphan and broken-link reporting · content audit and decay reporting (`nextReviewAt`, owner, low-helpfulness capture) · media library with reference counting and orphan GC · commenter blocking and trusted-commenter auto-approve · "Was this helpful?" with free-text capture · `/community-guidelines` · DPDP export, guest erasure and forensics retention · CDN purge service · capacity and cost envelope · `llms.txt` for AI search · dynamic OG images · trending / most-read module · unauthenticated draft preview links · Prometheus metrics and alert thresholds.

**Second pass — further additions** (from the review that produced D13–D15, §9.6, §9a, §10.1, 7.6/7.7):

- **Reader-facing, cheap, and conspicuously missing otherwise:** reading-progress bar · sticky table of contents from generated heading ids · estimated reading time everywhere a card appears · copy-link-to-heading anchors · share row (native share sheet + X/LinkedIn/WhatsApp — WhatsApp matters most for this audience) · print stylesheet (help articles get printed) · "next / previous article" navigation.
- **Each of these is now backed by an artefact, not a promise** — the earlier draft of this list named them and stopped there:
  - **Bookmark / save-for-later → ships in v1.** `ArticleBookmark` model; `POST|DELETE /public/articles/:kind/:slug/bookmark` (note: these take `protect`, **not** the `public` guard every other row in §7.1's public table carries — a deliberate exception); `GET /me/article-bookmarks`; `BookmarkButton.tsx`; reading-list blocks on both dashboards, which §9a already opens for edit.
  - **In-article CTAs / lead capture / job embeds → ship in v1** as editor nodes + `ArticleLead` (D12).
  - **Series / multi-part grouping → deferred to 13.11**, with a reason: it needs a `/blog/series/[slug]` hub plus a canonical-and-sitemap policy §9.5 has not decided, and §9.5 already excludes category/author hubs from the shards, so a series hub would inherit an undecided rule.
  - **Author-follow → deferred to 13.12**, with a reason: it is worthless without a publish-time notification channel, which does not exist.
- **Search:** on-hub filtering + a lightweight Postgres full-text search across articles in v1, with the Elasticsearch upgrade already deferred to 13.5. A help centre with no search is a help centre nobody uses.
- **Editorial** — each now backed rather than promised: the content-calendar view ships as `articles/calendar` · **duplicate-title and duplicate-slug warnings at create time** come from `GET /articles?titleLike=` on blur, a warning not a block (two "How to write a CV" articles may be legitimate) · the **near-duplicate prompt** before publishing reuses `text-moderation.service.ts`'s existing near-duplicate detection over `bodyText`, surfaced as a publish-checklist **warning** listing the similar articles with a link, feeding the same query layer as the cannibalisation check (7.7) · **per-author style notes** is a `styleNotes String?` column on `ArticleAuthor`, shown read-only in the editor sidebar when that author is selected.
- **Article templates:** starting a new article from a saved skeleton is `POST /articles` with `fromTemplateId` — a template is an `Article` with `status: DRAFT` and `isTemplate Boolean @default(false)`, so it reuses the whole editor and the duplicate path rather than adding a parallel model.
- **Operational:** an `article.system` kill switch flag (already in the rollback runbook, listed here so it is not mistaken for rollback-only) · seeded demo content behind a flag so a fresh environment is never visibly empty · a first-run empty state in the CMS that explains what to do rather than showing a bare table.
  **Third pass — from the 14-agent gap audit (59 confirmed findings).** Added since: per-article **FAQ blocks and How-To steps** (D16) · content→application **attribution** (§11.8a) · **bookmarks** · **lead capture** for `LEAD_GATED` · in-article **CTA and job-embed nodes** · article **delete/trash/restore** · **blocked-commenter** management · editorial **assignment and workflow read paths** + content calendar · a specified **bulk-action** set · **content-type CRUD** · **corrections + `/editorial-policy`** · real **404-hit capture** · **redirect hit counts** · **keyword-cannibalisation** and Flesch readability · **hub SEO** for tags/authors/categories · **co-author/reviewer bylines** · an article-system **settings** page · the **`refCount` writer and GC safety rails** (§8.1) · a **defined TOC/heading-id mechanism** · **responsive layout** and a real **reduced-motion** rule · **cover-image variants and focal point**.

**Fourth pass — lifecycle and propagation audit (34 confirmed findings).** Added since: **D17 working copy** (the blocking one — editing a published article wrote the live row) · the **legal-transition matrix** replacing the one-line workflow chain · **`propagateArticleChange()`** as the single fan-out owner, with the mutation × side-effect matrix (7.6a) · unschedule/reschedule · a **timezone, past-date and 5-minute-lead contract** for scheduling · **blocking-vs-warning lint classification** and defined behaviour when a scheduled publish fails its checklist · per-state **public HTTP status** table (unpublish = 404, delete = 410, `publishedAt` preserved) · full-state **revision snapshots** + `wasPublished` · **gating covers FAQ/How-To/ToC** · the pinned **public detail response shape** · the **`emitSchema` opt-out** that makes the one-FAQPage guard real · D16 text entering the **derivation pass** (search, word count, readability, and the plain-text form `faqPageSchema` needs) · `tocEnabled` + `article-toc-skip` · **duplicate semantics** · **`ArticleShareToken`** so "revocable" preview links have something to revoke · seeded **`enabledFields`/`workflowProfile`** values and per-kind required fields · the **ISR route payload contract** and its full path set.

**Corrections made in the same pass — things the plan asserted that were not true:**

- §10.1 said autosave "updates the draft row" while §12.5 said it "updates the row" — and no draft row was modelled anywhere.
- "Automatic on publish/unpublish" was the whole trigger set, leaving ~12 other mutations that change a live page propagating nothing.
- `ArticleRevision` snapshotted only title/excerpt/body, so restore was lossy by construction, and the "keep all published versions forever" rule had no column to express it.
- `unpublish` appeared five times without ever stating its resulting status; `approve` had no target status; there was no way to cancel a schedule.
- `PageFaqSection` emits `faqPageSchema` unconditionally, so "the article's blocks win" could not happen by convention.
- `howToSchema()`'s required `name`/`description` had no source.
- `includeInFeeds` defaults to `true` while D8 excludes help from feeds.
- D10 declared `bodyJson` the source of truth while nothing could produce it, and §10.1 said the opposite. Resolved to sanitised `bodyHtml`.
- Autosave was a JSON `PATCH`, which D1 itself proves strips the body to plain text.
- `refCount` had no writer, so the nightly GC would have deleted every live image on its first run.
- D13 claimed article covers get srcset "for free"; the worker emits 100/200/400 **squares** and writes back only to profile tables.
- The `X-Robots-Tag` "override" premise was backwards — Google honours the _most_ restrictive signal, as `next.config.ts`'s own comment says.
- The article extension set included a `Youtube` node, contradicting D7's iframe ban and the sanitizer's FORBID list.
- `Article.isFeatured` did not exist, though `FeaturedCarousel` selected on it.
- Ten stored SEO columns had no emission path — `generateMetadata()` (SEO.tsx:70) hardcodes the values they would set. (An earlier draft of this plan called that function `buildSEO`, which does not exist.)
- `NotificationType` is a **severity** enum; adding content events to it would have corrupted it.
- The one-FAQPage-per-URL reasoning that foreclosed article FAQ schema was wrong (per _page_, not per site).
- Phase 1 demanded six GIN indexes; only three were specified, and only four are justified.
- Revision retention was 50 in one phase and 100 in another.
- `/accessibility` already exists — the task is a link, not a page.

- **Correctness/consistency items surfaced during this pass, each already folded into the relevant phase:** the `<defs>` id-collision hazard when illustrations repeat on one page (§9.6) · the TipTap schema blast radius across seven existing consumers (§10.1) · the inert `prose` classes that make WYSIWYG lie until typography is installed (§10.1) · the 16 carousel placements making the list-endpoint cache load-bearing (§9a) · SEO override rot, which D15 exists to prevent.

**Deliberate cuts** (Phase 13, each with a reason — not omissions): multi-locale articles (no locale routing exists) · embeds (`iframe` banned) · per-category feeds · Search Console CTR API · Elasticsearch / global search · A/B headlines · newsletter integration · news date archives · per-article AI surface.

---

## 12. Risk register

| #       | Risk                                                                                                                                                                                                                              | Mitigation                                                                                                                                                                                                     |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1      | `/help` client→server conversion breaks the FAQ centre                                                                                                                                                                            | Shell-child extraction; corpus untouched; interaction parity check                                                                                                                                             |
| R2      | `@tailwindcss/typography` retroactively restyles ~20 pages                                                                                                                                                                        | Scope under `.article-body`; before/after screenshot diff of every consumer                                                                                                                                    |
| R3      | Generalising `view-counter-flush.worker.ts` breaks live job view counts                                                                                                                                                           | Disjoint namespaces; dedicated regression check                                                                                                                                                                |
| R4      | Shared `RichTextEditor` schema change affects job descriptions + tickets                                                                                                                                                          | Opt-in props                                                                                                                                                                                                   |
| R5      | `lib/email-bulk.ts` refactor destabilises 8 live email admin pages                                                                                                                                                                | Old module becomes a pre-bound wrapper                                                                                                                                                                         |
| R6      | Shard ids are derived arithmetic — crossing 50,000 jobs renumbers help 8→9, news 9→10, blog 10→11                                                                                                                                 | Documented; stable-id map is Phase 13                                                                                                                                                                          |
| R7      | Publishing before frontend routes exist advertises 404s                                                                                                                                                                           | Strict order (§14); shards stay unadvertised until routes are live                                                                                                                                             |
| R8      | `fetchPublicCount()` swallows all errors → 0 → shard suppressed silently forever                                                                                                                                                  | Distinguish "zero rows" from "fetch failed"; alert on the latter                                                                                                                                               |
| R9      | Footer repoint sends live links to hubs that do not yet exist                                                                                                                                                                     | Hard-ordered after Phase 10 content                                                                                                                                                                            |
| R10     | Deploying the backend alone flips live SEO surfaces immediately                                                                                                                                                                   | Feature-flag the public endpoints (T0.7)                                                                                                                                                                       |
| R11     | Sanitizer allowlists drift between server and client                                                                                                                                                                              | Shared `SANITIZER_VERSION` + CI equality test                                                                                                                                                                  |
| R12     | `isomorphic-dompurify` is a process-wide singleton; hooks leak to other consumers                                                                                                                                                 | Isolated instance                                                                                                                                                                                              |
| **R13** | **Adding a topic to `ConsolidatedTopics` changes `consumer.ts`'s `Object.values()` subscribe loop — a missing Aiven topic is a total outage of all five consolidated streams**                                                    | Provision `ha.content` as a gated pre-deploy step (T0.5); wrap the subscribe in per-topic error isolation                                                                                                      |
| R14     | Unbounded `ArticleRevision` growth (~180 snapshots/hour at 20s autosave)                                                                                                                                                          | Snapshot on explicit save/publish/transition only + content-hash dedupe + prune job                                                                                                                            |
| R15     | An article changing `kind` silently moves its URL                                                                                                                                                                                 | `ArticleSlugRedirect` stores `(fromKind,fromSlug)→(toKind,toSlug)`; removal + publish IndexNow pings                                                                                                           |
| R16     | Body images bypass `next/image` → no srcset, no AVIF, CLS                                                                                                                                                                         | Server-side rewrite to `next/image`; reject dimensionless uploads                                                                                                                                              |
| **R17** | **Article extensions change the shared TipTap ProseMirror schema; TipTap silently drops unknown nodes when parsing stored HTML, so an existing job description round-tripped through the changed schema can lose content**        | `extensions: 'basic' \| 'article'` prop defaulting to `'basic'`; article set in a separate module; byte-identical `getHTML()` diff on a saved job description and a saved ticket reply as a merge gate (§10.1) |
| R18     | Illustrations reuse static `<defs>` gradient ids; a card grid renders one 12× and every instance after the first resolves to the wrong gradient                                                                                   | Required `idPrefix` prop (or `useId()`); review check that no `id="` literal exists under `components/articles/**`; explicit duplicate-render test (§9.6)                                                      |
| R19     | 16 carousel placements make the public list endpoint the hottest path in the app; a cache miss storm on publish is self-inflicted                                                                                                 | Shared tag-based cache per (kind, category, count); revalidate via the on-demand ISR route rather than TTL expiry alone; hide-when-sparse means a cold cache renders nothing rather than blocking (§9a)        |
| R20     | A `SEO_RULES_VERSION` bump recomputes every non-pinned field across the corpus — a synchronous recompute would stall the admin request and a careless one would overwrite human intent                                            | Recompute runs as a background job in batches; pinned fields are excluded by construction (D15); the admin action previews the affected count before running                                                   |
| **R26** | **Editing a PUBLISHED article writes the live row, so a 2s-idle autosave puts half-written text on the public page within one ISR window — and fires the `contentUpdatedAt` bump and the corrections notice while someone types** | D17 working copy: all writes go to draft columns while PUBLISHED/ARCHIVED; `contentUpdatedAt` and the correction check evaluated **only** at promote                                                           |
| R27     | A mutation that changes a published page propagates nothing because the fan-out is per-endpoint and one path forgot a step                                                                                                        | One `propagateArticleChange()` owner + the explicit mutation × side-effect matrix (7.6a); comment moderation and FAQ/How-To edits are on it precisely because they would otherwise be missed                   |
| R28     | A gated article leaks its full FAQ answers and How-To steps to anonymous readers, in the payload **and** the JSON-LD                                                                                                              | Gating omits FAQ/How-To entirely server-side and suppresses their schema nodes; the ToC lists only teaser headings                                                                                             |
| R29     | Revision restore reverts the body but leaves cover, SEO and D16 blocks current, producing a version that never existed                                                                                                            | `ArticleRevision` snapshots the full renderable state (`coverSnapshot`/`seoSnapshot`/`faqSnapshot`/`howToSnapshot`); `wasPublished` makes the retention rule expressible                                       |
| **R22** | **`ArticleAsset.refCount` has no writer → stays 0 → the nightly GC deletes every live image on its first run**                                                                                                                    | Recompute-in-transaction writer (§8.1) + four-part GC predicate + 24h grace + dry-run + hard per-run deletion cap + one audit row per deletion                                                                 |
| R23     | The sanitizer allowlist is narrower than what the editor emits, so content vanishes silently on publish (alignment via inline `style`, `sub`/`sup`, `caption`, callout `div`s)                                                    | Enumerate every tag/attr/class the article extension set produces; reconfigure TextAlign to emit classes; one golden-file fixture per node, round-tripped through the real editor (Phase 11)                   |
| R24     | Autosave posted as JSON would save the body stripped to plain text — every 2 seconds, silently                                                                                                                                    | Autosave uses the multipart body route with `mode=autosave`; a contract test asserts `PATCH /articles/:id` never carries `bodyHtml`/`bodyJson`                                                                 |
| R25     | The `ha_content_ref` attribution cookie enters the CDN cache key and shatters the edge cache all 16 carousel placements depend on                                                                                                 | Client-side set/read only, never a `Vary`; behind the existing consent gate; disclosed in the policy copy                                                                                                      |
| R21     | Auto-derived meta fields are wrong-but-plausible (truncated mid-word, description repeating the title) and nobody notices because they were never typed                                                                           | Word-boundary truncation with hard length guards; the publish checklist lints derived values exactly as it lints typed ones; the SEO audit report lists duplicates and near-duplicates sitewide (7.7)          |

---

## 13. Global Definition of Done

Applies to every phase, on top of that phase's own exit criteria.

- [ ] Every artefact exists — no stubs, no TODOs, no placeholder pages
- [ ] `npx tsc --noEmit` clean on both sides
- [ ] `npx eslint` on changed files introduces **zero new** warnings vs the pre-change baseline
- [ ] Every new public page: `under-public-header` on a block element + own `loading.tsx` + `error.tsx`
- [ ] Every new admin surface: empty, loading, error states; destructive actions confirmed and audited
- [ ] Every new endpoint: zod validation, capability guard, rate limiter, `{status:'success',data}` envelope, cache + CDN invalidation
- [ ] No existing behaviour changed — §12 regression checks walked
- [ ] Nothing removed — every replaced symbol still exported from its original path
- [ ] Structured data validated in Rich Results Test
- [ ] Accessibility: keyboard path, focus management, ARIA labels, contrast ≥4.5:1 body / ≥3:1 UI
- [ ] **Tests ship with the phase's code** — a phase cannot close with zero tests for what it added
- [ ] **Docs current** — this plan, the API contract table (§7.1) and the runbook reflect what was actually built
- [ ] **Feature-flag state recorded** at phase exit (which flags are on, in which environment)
- [ ] **Visual bar met** (§9.6) — no bare `Loading…`, no unstyled empty state, custom inline SVG wherever an illustration belongs, and every illustration safe to render 12× on one page
- [ ] **All images are Cloudinary** (D13) — no article code path touches R2, which stays documents + backups
- [ ] **SEO is complete with zero human input** (D15 / 7.6) — publishing an untouched article yields valid, length-compliant meta, OG, Twitter, canonical, JSON-LD, sitemap entry and IndexNow ping
- [ ] **The carousel renders on all 16 surfaces** (§9a) at every breakpoint, and renders _nothing_ when below its content minimum

---

## 14. Execution order

```
Phase 0 (blocking spikes)
 └ 1 schema+migration
    └ 2 services/routes ─┬─ 3 jobs
                         └─ 5 super-admin CMS
                               └ 10 seed content
                                  └ 4 public pages
                                     └ 6 comments
                                        └ 7 SEO/sitemap   ← shards light up ONLY here
                                           └ 9 navigation
                                              └ 8 analytics
                                                 └ 11 testing → 12 launch → 13 deferred
```

**Content must exist before pages; pages before the sitemap advertises them; the sitemap correct before Search Console is asked to re-crawl.**

---

## 15. Appendix

**Durable evidence is committed to the repo** — the raw findings no longer live only in session-scoped temp files:

- **`docs/article-system/audit-findings.md`** — all 193 design gaps (grouped by owning phase), all 48 plan-completeness blockers, and all 18 minor findings, verbatim. Items already resolved here are still listed there so nothing is silently dropped.

Workflow runs backing this plan: `wf_5b0927ed-2e9` (8 codebase audits, 3 design passes, 4 gap critics) and `wf_01dfef88-efa` (6 completeness lenses over plan v1).
