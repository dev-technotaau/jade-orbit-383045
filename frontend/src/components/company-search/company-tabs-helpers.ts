/**
 * Server-safe helpers for the public + employer-preview company-tab UI.
 *
 * Lives in a plain `.ts` module (no `'use client'`) so it's importable
 * from BOTH server components (e.g. `app/companies/[slug]/page.tsx`,
 * `app/employer/profile/preview/page.tsx`) AND client components (e.g.
 * `CompanyDetailTabs.tsx`, `CompanyTabPanels.tsx`).
 *
 * Why this split exists:
 *   Next.js 16 forbids calling functions imported from `'use client'`
 *   modules inside a server component — only rendering them as JSX or
 *   passing as props is allowed. `deriveAvailableCompanyTabs(company)`
 *   is a pure helper, not a component, so it must live in a non-client
 *   module to be callable during SSR.
 */

export type CompanyTabKey =
  | 'overview'
  | 'why-work-with-us'
  | 'culture'
  | 'benefits'
  | 'people'
  | 'gallery'
  | 'hiring'
  | 'jobs';

/**
 * Given a company-shaped object, return the set of tab keys that have
 * content to render. Overview + Jobs are always included; the other 6
 * tabs are only emitted when there's data to show, so the tab bar auto-
 * hides empty sections without the host having to repeat has-data checks.
 */
export function deriveAvailableCompanyTabs(c: {
  description?: string | null;
  whyWorkForUs?: string | null;
  missionStatement?: string | null;
  visionStatement?: string | null;
  coreValues?: string[] | null;
  diversityStatement?: string | null;
  companyCulture?: string | null;
  csrInitiatives?: string | null;
  benefits?: string[] | null;
  structuredPerks?: unknown;
  workplacePolicies?: unknown;
  leadershipTeam?: unknown;
  employeeTestimonials?: unknown;
  officePhotos?: unknown;
  companyVideoUrl?: string | null;
  interviewProcess?: string | null;
}): Set<CompanyTabKey> {
  const set = new Set<CompanyTabKey>(['overview', 'jobs']);
  if (c.whyWorkForUs?.trim()) set.add('why-work-with-us');
  if (
    c.missionStatement?.trim() ||
    c.visionStatement?.trim() ||
    (c.coreValues?.length ?? 0) > 0 ||
    c.diversityStatement?.trim() ||
    c.companyCulture?.trim() ||
    c.csrInitiatives?.trim()
  ) {
    set.add('culture');
  }
  if (
    (c.benefits?.length ?? 0) > 0 ||
    (Array.isArray(c.structuredPerks) && c.structuredPerks.length > 0) ||
    (Array.isArray(c.workplacePolicies) && c.workplacePolicies.length > 0) ||
    (c.workplacePolicies &&
      typeof c.workplacePolicies === 'object' &&
      !Array.isArray(c.workplacePolicies) &&
      Object.keys(c.workplacePolicies as Record<string, unknown>).length > 0)
  ) {
    set.add('benefits');
  }
  if (
    (Array.isArray(c.leadershipTeam) && c.leadershipTeam.length > 0) ||
    (Array.isArray(c.employeeTestimonials) && c.employeeTestimonials.length > 0)
  ) {
    set.add('people');
  }
  if (
    (Array.isArray(c.officePhotos) && c.officePhotos.length > 0) ||
    (typeof c.companyVideoUrl === 'string' && c.companyVideoUrl.trim())
  ) {
    set.add('gallery');
  }
  if (c.interviewProcess?.trim()) set.add('hiring');
  return set;
}
