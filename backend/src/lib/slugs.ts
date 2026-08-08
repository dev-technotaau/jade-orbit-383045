/**
 * Slug helpers — single source of truth for URL-safe identifiers
 * shared by JobPost, CompanyProfile, and the public-search SEO route
 * resolver.
 *
 * Patterns:
 *   - Job slug: `{title-kebab}-{company-or-city-kebab}-{shortid8}`
 *               e.g. "senior-react-engineer-acme-bengaluru-x7k9p2lm"
 *   - Company slug: `{companyName-kebab}` with collision suffix `-2`, `-3`, ...
 *
 * The shortid suffix on job slugs makes collisions effectively
 * impossible (2^48 keyspace) while keeping URLs human-readable. Company
 * slugs use a deterministic collision-resolution against the DB so that
 * "Acme Pvt Ltd" and "Acme" both end up unique without user-visible
 * UUIDs.
 *
 * Used from:
 *   - `services/job.service.ts` createJob/updateJob → buildJobSlug
 *   - `services/employer.service.ts` createOrUpdateCompany → buildCompanySlug
 *   - `scripts/backfill-job-slugs.ts`
 *   - `scripts/backfill-company-slugs.ts`
 *   - public SEO resolver (parses search-slug forms like
 *     "web-developer-jobs-in-noida")
 */

import crypto from 'node:crypto';

// ─────────────────────────────────────────────────────────────────────
// Core kebabize: lowercase, ASCII-fold, collapse runs of separators.
// ─────────────────────────────────────────────────────────────────────

const NON_KEBAB_CHAR = /[^a-z0-9]+/g;
const TRIM_DASHES = /(^-+|-+$)/g;

/**
 * Convert any string to a URL-safe kebab-case slug component.
 *   "Senior React Engineer (Hybrid)"  → "senior-react-engineer-hybrid"
 *   "Acme Pvt. Ltd."                  → "acme-pvt-ltd"
 *   "C++ Developer"                   → "c-developer"  (note: "++" collapsed)
 *   "São Paulo"                       → "sao-paulo"   (diacritics stripped)
 */
export function kebabize(input: string | null | undefined): string {
  if (!input) return '';
  return (
    input
      .normalize('NFKD')
      // Strip combining marks (diacritics) — São → Sao.
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(NON_KEBAB_CHAR, '-')
      .replace(TRIM_DASHES, '')
  );
}

/**
 * Truncate a kebab string to `maxLen` chars without breaking a word.
 * Trims to the last full segment (no trailing partial word).
 */
export function truncateKebab(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  const cut = s.slice(0, maxLen);
  const lastDash = cut.lastIndexOf('-');
  return lastDash > 0 ? cut.slice(0, lastDash) : cut;
}

// ─────────────────────────────────────────────────────────────────────
// shortId — random 8-char base-36 suffix for job slugs.
// 36^8 ≈ 2.8 × 10^12 keyspace; collision probability is negligible
// at 50k jobs/year. We don't need cryptographic security here, but
// crypto.randomBytes is available so we use it for uniformity.
// ─────────────────────────────────────────────────────────────────────

const SHORT_ID_LEN = 8;

export function shortId(len: number = SHORT_ID_LEN): string {
  // 6 random bytes → 12 hex chars → trim to len. We mix in base-36
  // representation for shorter, friendlier suffixes.
  const buf = crypto.randomBytes(6);
  const big = BigInt('0x' + buf.toString('hex'));
  const base36 = big.toString(36);
  // Pad-left in case of small numbers; trim to len.
  return base36.padStart(len, '0').slice(-len);
}

// ─────────────────────────────────────────────────────────────────────
// Job slug builder
// ─────────────────────────────────────────────────────────────────────

export interface BuildJobSlugInput {
  title: string;
  /** Prefer companyName; fallback to companySlug; fallback omitted. */
  companyName?: string | null;
  companySlug?: string | null;
  /** Primary city (used as a humanising third token). */
  city?: string | null;
  /** Optional explicit short id — provide when re-deriving an existing slug. */
  shortIdOverride?: string;
}

const JOB_SLUG_TITLE_MAX = 60;
const JOB_SLUG_COMPANY_MAX = 30;
const JOB_SLUG_CITY_MAX = 25;
const JOB_SLUG_TOTAL_MAX = 200; // Postgres unique-index friendliness

/**
 * Build a job slug. Format:
 *   {title}-{company-or-companySlug}-{city}-{shortid}
 *
 * Each segment is independently truncated to keep the total slug under
 * `JOB_SLUG_TOTAL_MAX` chars. Empty segments collapse cleanly. The
 * shortid is always appended last so the slug remains unique even when
 * title/company/city collide.
 */
export function buildJobSlug(input: BuildJobSlugInput): string {
  const parts: string[] = [];

  const titlePart = truncateKebab(kebabize(input.title), JOB_SLUG_TITLE_MAX);
  if (titlePart) parts.push(titlePart);

  const companyPart = truncateKebab(
    kebabize(input.companySlug || input.companyName || ''),
    JOB_SLUG_COMPANY_MAX
  );
  if (companyPart) parts.push(companyPart);

  const cityPart = truncateKebab(kebabize(input.city || ''), JOB_SLUG_CITY_MAX);
  if (cityPart) parts.push(cityPart);

  const id = input.shortIdOverride || shortId();
  parts.push(id);

  let slug = parts.join('-');
  if (slug.length > JOB_SLUG_TOTAL_MAX) {
    // Edge-case: extreme content. Keep title + shortid only.
    slug = `${truncateKebab(titlePart, JOB_SLUG_TOTAL_MAX - id.length - 1)}-${id}`;
  }
  return slug;
}

/**
 * Extract the short-id suffix from an existing job slug. Used by the
 * public-search resolver to detect "this is a job-detail slug" vs. a
 * curated search-slug like "web-developer-jobs-in-noida".
 *
 * Returns the trailing 8-char base-36 component if present, else null.
 */
export function extractJobSlugShortId(slug: string): string | null {
  const m = /-([a-z0-9]{8})$/.exec(slug);
  return m ? m[1] : null;
}

// ─────────────────────────────────────────────────────────────────────
// Company slug builder + collision suffixing
// ─────────────────────────────────────────────────────────────────────

export interface BuildCompanySlugOptions {
  /**
   * Async resolver invoked with a candidate slug — returns true if the
   * slug is taken. The builder will append `-2`, `-3`, ... until it
   * finds a free one. Caller must implement this against their DB.
   */
  isTaken: (candidate: string) => Promise<boolean>;
  maxAttempts?: number;
}

const COMPANY_SLUG_MAX = 80;
const DEFAULT_MAX_ATTEMPTS = 1000;

/**
 * Build a unique company slug from the company name. On collision,
 * appends a numeric suffix (`-2`, `-3`, ...) until a free slot is
 * found, up to `maxAttempts`.
 *
 *   "Acme Pvt Ltd"  → "acme-pvt-ltd"
 *   (taken)         → "acme-pvt-ltd-2"
 *
 * Callers should pass a DB-bound `isTaken` function; the builder makes
 * no DB assumptions itself.
 */
export async function buildCompanySlug(
  companyName: string,
  options: BuildCompanySlugOptions
): Promise<string> {
  const base = truncateKebab(kebabize(companyName), COMPANY_SLUG_MAX);
  if (!base) {
    // Fallback when the company name is purely non-alphanumeric — use
    // an opaque shortid prefixed with "company-".
    return `company-${shortId()}`;
  }

  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  let candidate = base;
  let n = 1;
  while (await options.isTaken(candidate)) {
    n += 1;
    candidate = `${base}-${n}`;
    if (n > maxAttempts) {
      // Pathological case (>1000 collisions): fall back to a randomised suffix.
      candidate = `${base}-${shortId()}`;
      break;
    }
  }
  return candidate;
}

// ─────────────────────────────────────────────────────────────────────
// Public-search slug parser
//
// The public job-listing resolver matches incoming `/jobs/[...slug]`
// path segments against the patterns in §3 of the master plan. This
// helper exposes a single API: `parseJobSearchSlug(slug)` returns
// `{ kind, params }` so the route handler can dispatch.
// ─────────────────────────────────────────────────────────────────────

export type JobSearchSlugMatch =
  | { kind: 'detail'; shortId: string }
  | { kind: 'role-city'; role: string; city: string; modifier?: 'top' | 'best' | 'hiring' }
  | { kind: 'role-experience'; role: string; experienceYears: number }
  | { kind: 'role'; role: string }
  | { kind: 'category'; category: string }
  | { kind: 'department'; department: string }
  | { kind: 'qualification'; qualification: string }
  | { kind: 'collection'; collection: string }
  | { kind: 'city'; city: string; state?: string }
  | { kind: 'curated'; preset: string }
  | { kind: 'unknown'; raw: string };

const CURATED_PRESETS = new Set([
  'work-from-home',
  'remote',
  'fresher',
  'part-time',
  'full-time',
  'walk-in',
  'women',
  'night-shift',
  'mnc',
  'startup',
  'internship',
  'contract',
  'freelance',
]);

const CITY_PREFIX = /^in-([a-z0-9-]+)$/;
const ROLE_CITY_REGEX =
  /^(?:(top|best|hiring)-)?(.+?)-(?:jobs|vacancies|careers|openings|recruitment)-in-(.+)$/;
// "hiring-{role}-in-{city}" — no "jobs" word. Matches AFTER ROLE_CITY_REGEX
// so the canonical "{role}-jobs-in-{city}" still wins.
const HIRING_PREFIX_REGEX = /^hiring-(.+?)-in-(.+)$/;
// "{role}-recruitment-{city}" — no "in" separator.
const RECRUITMENT_NOIN_REGEX = /^(.+?)-recruitment-([a-z0-9-]+?)$/;
const ROLE_EXP_REGEX = /^(.+?)-jobs-for-(\d+)(?:-?\+)?(?:-?years?)?-?(?:experience)?$/;

/**
 * Parse a `/jobs/[...slug]` segment into a typed dispatch payload.
 * Order matters — most specific patterns first.
 */
export function parseJobSearchSlug(segments: string[]): JobSearchSlugMatch {
  if (segments.length === 0) return { kind: 'unknown', raw: '' };

  const first = segments[0].toLowerCase();
  const joined = segments.join('/').toLowerCase();

  // 1. Job detail — single segment ending in 8-char shortid.
  if (segments.length === 1) {
    const sid = extractJobSlugShortId(first);
    if (sid) return { kind: 'detail', shortId: sid };
  }

  // 2. Curated presets — single segment exact match.
  if (segments.length === 1 && CURATED_PRESETS.has(first)) {
    return { kind: 'curated', preset: first };
  }

  // 3. Two-level prefixes — `category/<x>`, `department/<x>`,
  //    `qualification/<x>`, `collection/<x>`, `in/<city>[/state]`.
  if (segments.length >= 2) {
    const [prefix, ...rest] = segments;
    const tail = rest.join('/');
    switch (prefix.toLowerCase()) {
      case 'category':
        return { kind: 'category', category: rest[0] };
      case 'department':
        return { kind: 'department', department: rest[0] };
      case 'qualification':
        return { kind: 'qualification', qualification: rest[0] };
      case 'collection':
        return { kind: 'collection', collection: rest[0] };
      case 'in':
        return { kind: 'city', city: rest[0], state: rest[1] };
      default:
        // Fall through to single-segment matches against `joined`.
        void tail;
    }
  }

  // 4. Single segment — try regex matchers.
  if (segments.length === 1) {
    // role-city alias variants (top/best/hiring + jobs/vacancies/...)
    const rc = ROLE_CITY_REGEX.exec(first);
    if (rc) {
      const [, modifier, role, city] = rc;
      return {
        kind: 'role-city',
        role,
        city,
        ...(modifier ? { modifier: modifier as 'top' | 'best' | 'hiring' } : {}),
      };
    }

    // "hiring-{role}-in-{city}" alias.
    const hp = HIRING_PREFIX_REGEX.exec(first);
    if (hp) {
      return { kind: 'role-city', role: hp[1], city: hp[2], modifier: 'hiring' };
    }

    // "{role}-recruitment-{city}" alias.
    const rn = RECRUITMENT_NOIN_REGEX.exec(first);
    if (rn) {
      return { kind: 'role-city', role: rn[1], city: rn[2] };
    }

    const re = ROLE_EXP_REGEX.exec(first);
    if (re) {
      return { kind: 'role-experience', role: re[1], experienceYears: Number(re[2]) };
    }

    const cm = CITY_PREFIX.exec(first);
    if (cm) {
      return { kind: 'city', city: cm[1] };
    }

    // Bare role — last fallback before giving up.
    return { kind: 'role', role: first };
  }

  return { kind: 'unknown', raw: joined };
}

/**
 * Inverse of `parseJobSearchSlug`. Builds canonical SEO URLs from
 * filter inputs. Used by the sitemap generator + canonical-link
 * emitter on listing pages.
 */
export function buildJobSearchUrl(input: {
  role?: string;
  city?: string;
  state?: string;
  category?: string;
  department?: string;
  qualification?: string;
  collection?: string;
  experienceYears?: number;
  curatedPreset?: string;
  modifier?: 'top' | 'best' | 'hiring';
}): string {
  // Most-specific first.
  if (input.role && input.city) {
    const prefix = input.modifier ? `${input.modifier}-` : '';
    return `/jobs/${prefix}${kebabize(input.role)}-jobs-in-${kebabize(input.city)}`;
  }
  if (input.role && input.experienceYears != null) {
    return `/jobs/${kebabize(input.role)}-jobs-for-${input.experienceYears}-years-experience`;
  }
  if (input.curatedPreset) return `/jobs/${kebabize(input.curatedPreset)}`;
  if (input.category) return `/jobs/category/${kebabize(input.category)}`;
  if (input.department) return `/jobs/department/${kebabize(input.department)}`;
  if (input.qualification) return `/jobs/qualification/${kebabize(input.qualification)}`;
  if (input.collection) return `/jobs/collection/${kebabize(input.collection)}`;
  if (input.city) {
    const cityKebab = kebabize(input.city);
    return input.state ? `/jobs/in/${cityKebab}/${kebabize(input.state)}` : `/jobs/in/${cityKebab}`;
  }
  if (input.role) return `/jobs/${kebabize(input.role)}`;
  return '/jobs';
}

/**
 * Build all SEO-alias URLs for a given role+city pair.
 *
 * Used by the sitemap generator to enumerate every crawl-ready alias
 * pattern from §3.4 of the master plan. The first entry is the
 * canonical URL; the rest are crawl-ready synonyms that all resolve
 * to the same listing via `parseJobSearchSlug`.
 */
export function buildJobSearchAliasUrls(role: string, city: string): string[] {
  const r = kebabize(role);
  const c = kebabize(city);
  if (!r || !c) return [];
  return [
    `/jobs/${r}-jobs-in-${c}`, // canonical
    `/jobs/top-${r}-jobs-in-${c}`,
    `/jobs/best-${r}-jobs-in-${c}`,
    `/jobs/${r}-vacancies-in-${c}`,
    `/jobs/${r}-careers-in-${c}`,
    `/jobs/${r}-openings-in-${c}`,
    `/jobs/hiring-${r}-in-${c}`,
    `/jobs/${r}-recruitment-${c}`,
  ];
}

/**
 * Company-side: build canonical URL from filter inputs.
 */
export function buildCompanySearchUrl(input: {
  category?: string;
  industry?: string;
  city?: string;
  collection?: string;
  slug?: string;
}): string {
  if (input.slug) return `/companies/${kebabize(input.slug)}`;
  if (input.category) return `/companies/category/${kebabize(input.category)}`;
  if (input.collection) return `/companies/collection/${kebabize(input.collection)}`;
  if (input.industry) return `/companies/industry/${kebabize(input.industry)}`;
  if (input.city) return `/companies/in/${kebabize(input.city)}`;
  return '/companies';
}
