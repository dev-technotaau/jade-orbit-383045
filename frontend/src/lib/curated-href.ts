/**
 * Resolve a CuratedListing entry to its canonical public URL.
 *
 * Single source of truth for routing CuratedListing rows — used by:
 *   - Header NavMegaMenu
 *   - Footer mega-section
 *   - Homepage discovery widgets (Sections 1, 2)
 *   - Sitemap generator (frontend mirror lives in `app/sitemap.ts`)
 */
import type { CuratedListing } from '@/services/curated.service';

export function curatedHref(item: CuratedListing): string {
  const isCompany = item.type.startsWith('COMPANY_');
  if (isCompany) {
    if (item.type === 'COMPANY_CATEGORY')
      return `/companies/category/${item.slug.replace(/^companies-/, '')}`;
    return `/companies/collection/${item.slug}`;
  }
  if (item.type === 'JOB_LOCATION') {
    const city = item.slug.replace(/^jobs-in-/, '');
    return `/jobs/in/${city}`;
  }
  if (item.type === 'JOB_CATEGORY') return `/jobs/category/${item.slug.replace(/-jobs$/, '')}`;
  if (item.type === 'JOB_DEPARTMENT')
    return `/jobs/department/${item.slug.replace(/^dept-/, '').replace(/-jobs$/, '')}`;
  if (item.type === 'JOB_QUALIFICATION')
    return `/jobs/qualification/${item.slug.replace(/-jobs$/, '')}`;
  if (item.type === 'JOB_COLLECTION') return `/jobs/collection/${item.slug}`;
  return `/jobs/${item.slug}`;
}

/**
 * Accessible name for a CuratedListing link.
 *
 * Many curated entries share the same visible label across types — e.g.
 * "Sales Jobs" exists as a JOB_CATEGORY and again as a JOB_DEPARTMENT,
 * both pointing at different URLs (`/jobs/category/sales` vs
 * `/jobs/department/sales`). Lighthouse's "identical-links-same-purpose"
 * heuristic and screen-reader users both struggle when two links share
 * an accessible name but route to different destinations. We append a
 * type-derived qualifier so each link gets a unique accessible name,
 * while the visible text stays compact (`item.label`).
 */
export function curatedAriaLabel(item: CuratedListing): string {
  switch (item.type) {
    case 'JOB_CATEGORY':
      return `${item.label} — browse by category`;
    case 'JOB_DEPARTMENT':
      return `${item.label} — browse by department`;
    case 'JOB_QUALIFICATION':
      return `${item.label} — browse by qualification`;
    case 'JOB_COLLECTION':
      return `${item.label} — curated collection`;
    case 'JOB_LOCATION':
      return `${item.label} — browse by location`;
    case 'JOB_DEMAND':
      // JOB_DEMAND labels are already distinct ("Fresher Jobs",
      // "Remote Jobs", "Walk-in", "Night Shift", …) so the visible
      // text is sufficient.
      return item.label;
    case 'COMPANY_CATEGORY':
      return `${item.label} — companies by category`;
    case 'COMPANY_COLLECTION':
      return `${item.label} — company collection`;
    default:
      return item.label;
  }
}
