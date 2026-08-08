'use client';

/**
 * Footer mega-section — 3 stacked sections above the existing Footer:
 *
 *   Section 1: Find Jobs (CuratedType.JOB_LOCATION)
 *   Section 2: Popular Jobs (CuratedType.JOB_DEMAND + JOB_CATEGORY collapsed)
 *   Section 3: Jobs by Department (CuratedType.JOB_DEPARTMENT) — TEMPORARILY
 *              HIDDEN, along with the divider that preceded it.
 *
 * Each section:
 *   - 5-column grid on desktop, collapses to 2 / 1 column on smaller widths.
 *   - Default 5 rows visible (so 25 items at most).
 *   - "View More" expands to show every row; "View Less" collapses back.
 *   - Click any link → same destination as the header mega-menu (drives
 *     through the curatedHref helper internally).
 *
 * Sections are separated by a thin horizontal divider for visual rhythm.
 * Data fetched once via TanStack Query (10min staleTime).
 */

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { curatedService, type CuratedListing } from '@/services/curated.service';
import { curatedHref, curatedAriaLabel } from '@/lib/curated-href';

const ROWS_DEFAULT = 5;
const COLUMNS = 5;

interface SectionProps {
  heading: string;
  items: CuratedListing[];
}

function FooterSection({ heading, items }: SectionProps) {
  const [expanded, setExpanded] = useState(false);
  const visibleCount = expanded ? items.length : Math.min(items.length, COLUMNS * ROWS_DEFAULT);
  const visible = items.slice(0, visibleCount);
  const hasMore = items.length > COLUMNS * ROWS_DEFAULT;

  return (
    <section className="px-4 py-8 sm:px-6 lg:px-8">
      <h3 className="mb-5 text-sm font-bold tracking-wider text-[var(--text)] uppercase">
        {heading}
      </h3>
      {/* 2 cols on mobile (matches the Quick Links / Job Seekers /
          Employers columns in Footer.tsx) → 5 cols on lg+. Default
          was 1 col which left a lot of dead space below each label
          on phones; bumping to 2 mirrors the rest of the footer and
          fills the row. Font size aligned to text-sm site-wide so
          the mega-section labels don't look smaller than the
          Footer column links sitting directly below them. */}
      <ul className="grid grid-cols-2 gap-x-4 gap-y-2 lg:grid-cols-5">
        {visible.map((item) => (
          <li key={item.id}>
            <Link
              href={curatedHref(item)}
              aria-label={curatedAriaLabel(item)}
              className="block rounded text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--primary)]"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
      {hasMore && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-primary inline-flex items-center gap-1 text-xs font-semibold hover:underline"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3" />
                View less
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                View more
              </>
            )}
          </button>
        </div>
      )}
    </section>
  );
}

export default function FooterMegaSection() {
  const { data } = useQuery({
    queryKey: ['curated-footer'],
    queryFn: () => curatedService.footer(),
    staleTime: 10 * 60 * 1000,
  });

  const findJobs = (data?.JOB_LOCATION ?? []) as CuratedListing[];
  const popularJobs = [
    ...((data?.JOB_DEMAND ?? []) as CuratedListing[]),
    ...((data?.JOB_CATEGORY ?? []) as CuratedListing[]),
  ].slice(0, 50);
  // "Jobs by Department" is temporarily hidden — restore together with its
  // section and its preceding divider in the markup below.
  // const byDepartment = (data?.JOB_DEPARTMENT ?? []) as CuratedListing[];

  // Hide entirely if curated data hasn't loaded yet — nothing to show.
  // byDepartment is deliberately NOT counted while its section is hidden:
  // otherwise a department-only payload would pass this guard and render a
  // mega-section containing nothing but the closing divider.
  const hasAnyData = findJobs.length > 0 || popularJobs.length > 0;
  if (!hasAnyData) return null;

  return (
    <div className="bg-[var(--bg-secondary)]">
      <div className="mx-auto max-w-7xl">
        {findJobs.length > 0 && <FooterSection heading="Find Jobs" items={findJobs} />}
        {findJobs.length > 0 && popularJobs.length > 0 && (
          <hr className="mx-4 border-[var(--border)] sm:mx-6 lg:mx-8" />
        )}
        {popularJobs.length > 0 && <FooterSection heading="Popular Jobs" items={popularJobs} />}
        {/* "Jobs by Department" and the divider that preceded it are
            temporarily hidden — restore together with the `byDepartment`
            const above. The closing divider below is NOT part of this and
            must stay: it separates the whole mega-section from the footer
            column block.
        {popularJobs.length > 0 && byDepartment.length > 0 && (
          <hr className="mx-4 border-[var(--border)] sm:mx-6 lg:mx-8" />
        )}
        {byDepartment.length > 0 && (
          <FooterSection heading="Jobs by Department" items={byDepartment} />
        )}
        */}
        {/* Closing divider — separates the mega-section from the
            "Company / Job Seekers / Employers / Support / Legal"
            column block in Footer.tsx. Sits INSIDE the max-w-7xl
            container with the same mx-{4|6|8} padding as the inter-
            section hrs above, so it visually aligns with every other
            footer divider (which are all border-t inside the same
            constrained width). Without these margins the rule would
            span the full viewport and look inconsistent. */}
        <hr className="mx-4 border-[var(--border)] sm:mx-6 lg:mx-8" />
      </div>
    </div>
  );
}
