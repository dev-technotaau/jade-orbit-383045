/**
 * Frontend mirror of `backend/src/lib/slugs.ts` `parseJobSearchSlug`.
 *
 * Used by `/jobs/[...slug]/page.tsx` to dispatch incoming SEO-friendly
 * URL paths to the right rendering branch:
 *   - Job detail page (slug ends in 8-char shortid).
 *   - Curated preset (work-from-home, remote, fresher, etc.).
 *   - Role + city alias ({role}-jobs-in-{city}, top-X-jobs, etc.).
 *   - Role + experience aliases.
 *   - Two-segment prefixes (category/, department/, qualification/, collection/, in/).
 *   - Bare role fallback.
 */

export type JobSearchSlugMatch =
  | { kind: 'detail'; shortId: string; fullSlug: string }
  | {
      kind: 'role-city';
      role: string;
      city: string;
      modifier?: 'top' | 'best' | 'hiring';
    }
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

const SHORTID_SUFFIX = /-([a-z0-9]{8})$/;
// Canonical: {role}-jobs-in-{city}.
// Aliases:   top-/best-/hiring- modifier prefix · vacancies/careers/openings/recruitment synonyms.
const ROLE_CITY_REGEX =
  /^(?:(top|best|hiring)-)?(.+?)-(?:jobs|vacancies|careers|openings|recruitment)-in-(.+)$/;
// "hiring-{role}-in-{city}" — no "jobs" word, just verb + role + "in" + city.
//   e.g. "hiring-frontend-developer-in-delhi"
const HIRING_PREFIX_REGEX = /^hiring-(.+?)-in-(.+)$/;
// "{role}-recruitment-{city}" — no "in" separator.
//   e.g. "marketing-manager-recruitment-bangalore"
const RECRUITMENT_NOIN_REGEX = /^(.+?)-recruitment-([a-z0-9-]+?)$/;
const ROLE_EXP_REGEX = /^(.+?)-jobs-for-(\d+)(?:-?\+)?(?:-?years?)?-?(?:experience)?$/;
const CITY_PREFIX = /^in-([a-z0-9-]+)$/;

export function parseJobSearchSlug(segments: string[]): JobSearchSlugMatch {
  if (segments.length === 0) return { kind: 'unknown', raw: '' };

  const first = segments[0].toLowerCase();
  const joined = segments.join('/').toLowerCase();

  // 1. Single-segment job-detail (slug ends in 8-char shortid).
  if (segments.length === 1) {
    const m = SHORTID_SUFFIX.exec(first);
    if (m) return { kind: 'detail', shortId: m[1], fullSlug: first };
  }

  // 2. Curated single-segment presets.
  if (segments.length === 1 && CURATED_PRESETS.has(first)) {
    return { kind: 'curated', preset: first };
  }

  // 3. Two-level prefixes.
  if (segments.length >= 2) {
    const [prefix, ...rest] = segments;
    const p = prefix.toLowerCase();
    switch (p) {
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
      // Fall through to the single-segment regex matchers via `joined`.
    }
  }

  // 4. Single-segment regex matchers (role-city aliases, role-experience).
  if (segments.length === 1) {
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
    // "hiring-{role}-in-{city}" alias — try BEFORE the bare-role fallback.
    const hp = HIRING_PREFIX_REGEX.exec(first);
    if (hp) {
      return {
        kind: 'role-city',
        role: hp[1],
        city: hp[2],
        modifier: 'hiring',
      };
    }
    // "{role}-recruitment-{city}" alias — only match if it doesn't already
    // match the more-specific ROLE_CITY_REGEX (which requires "-in-").
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
    return { kind: 'role', role: first };
  }

  return { kind: 'unknown', raw: joined };
}

/**
 * Build a filter-preset object from a parsed slug match — applied on
 * the listing page so the URL-derived filters are pre-set.
 */
export function presetFromSlug(match: JobSearchSlugMatch): Record<string, string> {
  const titleCase = (s: string) =>
    s
      .split('-')
      .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
      .join(' ');
  switch (match.kind) {
    case 'role':
      return { q: titleCase(match.role) };
    case 'city':
      return { location: titleCase(match.city) };
    case 'role-city':
      return { q: titleCase(match.role), location: titleCase(match.city) };
    case 'role-experience':
      return { q: titleCase(match.role), experienceMin: String(match.experienceYears) };
    case 'category':
      return { category: titleCase(match.category) };
    case 'department':
      return { department: titleCase(match.department) };
    case 'qualification':
      return { qualification: match.qualification.toUpperCase() };
    case 'collection':
      return { collection: match.collection };
    case 'curated':
      return { preset: match.preset };
    default:
      return {};
  }
}

/**
 * Compose a human-readable H1 from a parsed slug — used by curated
 * listing pages when no editorial heroH1 exists in the CuratedListing
 * row.
 */
export function defaultHeroFromSlug(match: JobSearchSlugMatch): {
  h1: string;
  subtitle: string;
} {
  const titleCase = (s: string) =>
    s
      .split('-')
      .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
      .join(' ');
  switch (match.kind) {
    case 'role':
      return { h1: `${titleCase(match.role)} Jobs`, subtitle: 'Latest openings on Hire Adda' };
    case 'city':
      return {
        h1: `Jobs in ${titleCase(match.city)}`,
        subtitle: 'Verified employers, fast applications',
      };
    case 'role-city':
      return {
        h1: `${match.modifier ? titleCase(match.modifier) + ' ' : ''}${titleCase(match.role)} Jobs in ${titleCase(match.city)}`,
        subtitle: 'Apply on Hire Adda — verified employers, fast hiring',
      };
    case 'role-experience':
      return {
        h1: `${titleCase(match.role)} Jobs for ${match.experienceYears}+ Years Experience`,
        subtitle: 'Senior, mid, junior — find your next role',
      };
    case 'category':
      return { h1: `${titleCase(match.category)} Jobs`, subtitle: 'Browse latest openings' };
    case 'department':
      return {
        h1: `${titleCase(match.department)} Jobs`,
        subtitle: 'Department-specific openings',
      };
    case 'qualification':
      return {
        h1: `${match.qualification.toUpperCase()} Jobs`,
        subtitle: 'Qualification-matched openings',
      };
    case 'collection':
      return { h1: titleCase(match.collection), subtitle: 'Curated by Hire Adda' };
    case 'curated':
      return { h1: titleCase(match.preset), subtitle: 'Latest openings on Hire Adda' };
    default:
      return { h1: 'Find Jobs', subtitle: 'Browse the latest openings' };
  }
}
