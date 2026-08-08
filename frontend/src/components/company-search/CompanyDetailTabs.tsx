'use client';

/**
 * Tab navigation for the public company-detail page + employer
 * preview.
 *
 * Eight possible tabs (auto-hidden when no data):
 *   - overview        — company description, industry/size meta
 *   - why-work-with-us — `whyWorkForUs` editorial pitch
 *   - culture         — mission / vision / coreValues / diversity / culture / csr
 *   - benefits        — benefits / structuredPerks / workplacePolicies
 *   - people          — leadershipTeam / employeeTestimonials
 *   - gallery         — officePhotos / companyVideoUrl
 *   - hiring          — interviewProcess
 *   - jobs            — open public jobs (always shown)
 *
 * Tab state is URL-driven via `?tab=key` so external links + the
 * homepage Featured-Companies slider can deep-link directly.
 *
 * The component is a thin tab-bar — content rendering stays in the
 * host page (server-conditional on /companies/[slug] for SEO,
 * client-conditional in /employer/profile/preview).
 */

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  FileText,
  Briefcase,
  Sparkles,
  Heart,
  Gift,
  Users,
  Camera,
  ListChecks,
  type LucideIcon,
} from 'lucide-react';
import {
  deriveAvailableCompanyTabs as deriveTabsHelper,
  type CompanyTabKey,
} from './company-tabs-helpers';

// Re-export for back-compat: any consumer that historically imported
// `CompanyTabKey` / `deriveAvailableCompanyTabs` from this client module
// continues to compile via the re-exports. New server-component code
// should import directly from `./company-tabs-helpers` to avoid the
// "client function from server" error that Next.js 16 raises.
export type { CompanyTabKey };
export const deriveAvailableCompanyTabs = deriveTabsHelper;

interface TabDef {
  key: CompanyTabKey;
  label: string;
  icon: LucideIcon;
}

const ALL_TABS: TabDef[] = [
  { key: 'overview', label: 'Overview', icon: FileText },
  { key: 'why-work-with-us', label: 'Why work with us', icon: Sparkles },
  { key: 'culture', label: 'Culture', icon: Heart },
  { key: 'benefits', label: 'Benefits', icon: Gift },
  { key: 'people', label: 'People', icon: Users },
  { key: 'gallery', label: 'Gallery', icon: Camera },
  { key: 'hiring', label: 'Hiring process', icon: ListChecks },
  { key: 'jobs', label: 'Jobs', icon: Briefcase },
];

interface Props {
  /** Open-jobs count for the badge on the Jobs tab. */
  openJobsCount: number;
  /**
   * Set/array of tab keys that should appear. Overview + Jobs are
   * forced visible inside the component for sane defaults.
   */
  available?: ReadonlySet<CompanyTabKey> | CompanyTabKey[];
}

export default function CompanyDetailTabs({ openJobsCount, available }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = (searchParams?.get('tab') ?? 'overview') as CompanyTabKey;

  // Default to all tabs visible if the host doesn't pass `available`
  // — keeps backwards-compat with the original 2-tab API.
  const availableSet = new Set<CompanyTabKey>(
    available
      ? available instanceof Set
        ? Array.from(available)
        : available
      : ALL_TABS.map((t) => t.key),
  );
  // Always include Overview + Jobs.
  availableSet.add('overview');
  availableSet.add('jobs');

  // Defensive — if a deep-link points at a tab the host hides, fall
  // back to overview so we never render an empty tab body.
  const active: CompanyTabKey = availableSet.has(requested) ? requested : 'overview';

  const visibleTabs = ALL_TABS.filter((t) => availableSet.has(t.key));

  return (
    <nav
      aria-label="Company sections"
      role="tablist"
      // No horizontal negative-margin bleed — the previous version pulled
      // out to the section's gutter padding (-mx-4/-mx-6/-mx-8) which
      // was correct when the tab strip lived next to a full-width header
      // card. After the hero restructure the strip sits inside the
      // content grid's left column, so the bleed visibly overflows the
      // column on both sides. Keeping just border-b inside the column
      // gives a clean column-aligned divider.
      //
      // `overflow-y-hidden` suppresses the spurious vertical scrollbar
      // that otherwise appears next to the tab strip. `overflow-x-auto`
      // alone resolves `overflow-y` to `auto` per spec, and the tab
      // buttons' `-mb-px` negative margin overflows the content box by
      // 1px — enough to make the y-axis "scrollable". Clipping the
      // 1px overhang is invisible (the border-b still draws the divider
      // line), but kills the scrollbar.
      className="sticky top-0 z-10 mb-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-[var(--border)] bg-white/95 backdrop-blur"
    >
      {visibleTabs.map((t) => {
        const Icon = t.icon;
        const isActive = active === t.key;
        const params = new URLSearchParams(searchParams?.toString() ?? '');
        if (t.key === 'overview') params.delete('tab');
        else params.set('tab', t.key);
        const qs = params.toString();
        const href = qs ? `${pathname}?${qs}` : pathname;
        return (
          <Link
            key={t.key}
            href={href}
            role="tab"
            aria-selected={isActive}
            scroll={false}
            replace
            className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-semibold whitespace-nowrap transition-colors ${
              isActive
                ? 'text-primary border-[var(--primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            <Icon className="h-4 w-4" />
            {t.label}
            {t.key === 'jobs' && openJobsCount > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  isActive
                    ? 'bg-[var(--primary)] text-white'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-muted)]'
                }`}
              >
                {openJobsCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

// `deriveAvailableCompanyTabs` lives in `./company-tabs-helpers.ts`
// (server-safe). It is re-exported from this file for back-compat —
// see the import block at the top of the file.
