'use client';

/**
 * Filterable + paginated jobs feed for the Jobs tab on the company
 * detail surface (public + employer preview).
 *
 * Five filter pill groups, each with a heading + dynamic options
 * fetched per-company so visitors only see filter values that exist
 * in this company's actual job listings:
 *
 *   1. Job type     (FULL_TIME / PART_TIME / CONTRACT / …)
 *   2. Work mode    (REMOTE / HYBRID / ONSITE)
 *   3. Location     (cities the company has open jobs in)
 *   4. Experience   (FRESHER / ENTRY / MID / SENIOR / …)
 *   5. Department   (engineering / sales / …)
 *
 * Each pill shows the count of matching jobs in parentheses. Pills
 * are single-select per category — clicking the active pill again
 * clears the filter for that category.
 *
 * Filter state is URL-driven via `?jobType=…&workMode=…&page=2` so
 * deep-links are reproducible and the back button works.
 *
 * Pagination uses the shared Pagination UI primitive at the bottom.
 */

import { useMemo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Card from '@/components/ui/Card';
import Pagination from '@/components/ui/Pagination';
import EmptyState from '@/components/ui/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import PublicJobCard from '@/components/job-search/PublicJobCard';
import {
  publicCompaniesService,
  type CompanyJobsResult,
} from '@/services/public-companies.service';
import { JOB_TYPE_LABELS, WORK_MODE_LABELS, EXPERIENCE_LEVEL_LABELS } from '@/constants/enums';
import { Briefcase, Filter as FilterIcon, X } from 'lucide-react';

interface CompanyJobsTabProps {
  /** Required — drives the data fetch + URL filter sync. */
  slug: string;
  /**
   * Hosting company's basic info — passed straight into PublicJobCard
   * so individual job rows render the same hero strip the public
   * search results show.
   */
  company: {
    id?: string;
    slug?: string | null;
    companyName: string;
    logo?: string | null;
    /** Loose typing — public + employer shapes both pass through. */
    isVerified?: boolean | null;
  };
  /**
   * Forces the guest CTA variant. Leave undefined for the public
   * `/companies/<slug>` surface — PublicJobCard auto-detects via
   * useAuthGate, so logged-in CANDIDATEs see "Quick Apply" while
   * guests see "Sign in to apply". Set explicitly (e.g. false) for
   * /employer/profile/preview where the host knows the auth state.
   */
  isGuest?: boolean;
  /** Default page size — defaults to 10. Users can override via the per-page selector (`?limit=`). */
  limit?: number;
}

const FILTER_PARAMS = [
  'jobType',
  'workMode',
  'location',
  'experienceLevel',
  'department',
  'page',
] as const;

type FilterKey = Exclude<(typeof FILTER_PARAMS)[number], 'page'>;

interface PillGroupConfig {
  key: FilterKey;
  heading: string;
  /** Optional label resolver (enum → display string). */
  formatLabel?: (value: string) => string;
}

const PILL_GROUPS: PillGroupConfig[] = [
  { key: 'jobType', heading: 'Job type', formatLabel: (v) => JOB_TYPE_LABELS[v] || v },
  { key: 'workMode', heading: 'Work mode', formatLabel: (v) => WORK_MODE_LABELS[v] || v },
  { key: 'location', heading: 'Location' },
  {
    key: 'experienceLevel',
    heading: 'Experience',
    formatLabel: (v) => EXPERIENCE_LEVEL_LABELS[v] || v,
  },
  { key: 'department', heading: 'Department' },
];

export default function CompanyJobsTab({
  slug,
  company,
  isGuest,
  limit = 10,
}: CompanyJobsTabProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Read filter state from URL.
  const filters = useMemo(() => {
    const out: Record<FilterKey, string | undefined> = {
      jobType: searchParams?.get('jobType') ?? undefined,
      workMode: searchParams?.get('workMode') ?? undefined,
      location: searchParams?.get('location') ?? undefined,
      experienceLevel: searchParams?.get('experienceLevel') ?? undefined,
      department: searchParams?.get('department') ?? undefined,
    };
    return out;
  }, [searchParams]);
  const page = Math.max(1, Number(searchParams?.get('page') ?? '1') || 1);
  const pageSize = Math.max(1, Number(searchParams?.get('limit') ?? '') || limit);

  const { data, isLoading, isFetching } = useQuery<CompanyJobsResult>({
    queryKey: ['company-jobs', slug, filters, page, pageSize],
    queryFn: () =>
      publicCompaniesService.companyJobs(slug, {
        ...filters,
        page,
        limit: pageSize,
      }),
    staleTime: 60 * 1000,
  });

  const facets = data?.facets;
  const items = data?.items ?? [];
  const pagination = data?.pagination;

  // Build the next URL preserving non-filter query params (like ?tab=jobs).
  const buildHref = (
    next: Partial<Record<FilterKey | 'page' | 'limit', string | undefined>>,
  ): string => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    for (const [k, v] of Object.entries(next)) {
      if (v == null || v === '') params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const setFilter = (key: FilterKey, value: string | undefined) => {
    // Toggle off if same value already active.
    const cur = filters[key];
    const next = cur === value ? undefined : value;
    // Reset page to 1 whenever a filter changes.
    router.replace(buildHref({ [key]: next, page: undefined }), { scroll: false });
  };

  const clearAll = () => {
    router.replace(
      buildHref({
        jobType: undefined,
        workMode: undefined,
        location: undefined,
        experienceLevel: undefined,
        department: undefined,
        page: undefined,
      }),
      { scroll: false },
    );
  };

  const setPage = (next: number) => {
    router.replace(buildHref({ page: next > 1 ? String(next) : undefined }), {
      scroll: false,
    });
  };

  // Per-page selector — same URL mechanism as setPage; resets to page 1.
  const setPageSize = (size: number) => {
    router.replace(
      buildHref({ limit: size === limit ? undefined : String(size), page: undefined }),
      { scroll: false },
    );
  };

  const hasAnyFilter = Object.values(filters).some((v) => v);

  // Hide pill groups whose facet has 0 or 1 unique value — no point
  // showing a filter that can't actually narrow anything.
  const visibleGroups = PILL_GROUPS.filter((g) => {
    const buckets = facets?.[g.key] ?? [];
    return buckets.length >= 2;
  });

  return (
    <Card padding="lg">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--text)]">
          <Briefcase className="h-5 w-5" />
          Open jobs ({pagination?.total ?? 0})
        </h2>
        {hasAnyFilter && (
          <button
            type="button"
            onClick={clearAll}
            className="text-primary inline-flex items-center gap-1 text-xs font-semibold hover:underline"
          >
            <X className="h-3 w-3" />
            Clear all filters
          </button>
        )}
      </div>

      {/* Filter pill groups — only render groups with ≥2 distinct
          values so single-option facets don't clutter the UI. */}
      {visibleGroups.length > 0 && (
        <div className="mb-4 space-y-3">
          {visibleGroups.map((g) => {
            const buckets = facets?.[g.key] ?? [];
            const active = filters[g.key];
            return (
              <div key={g.key}>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-[var(--text-muted)] uppercase">
                  <FilterIcon className="h-3 w-3" />
                  {g.heading}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {buckets.map((b) => {
                    const isActive = active === b.value;
                    const label = g.formatLabel ? g.formatLabel(b.value) : b.value;
                    return (
                      <button
                        key={b.value}
                        type="button"
                        onClick={() => setFilter(g.key, b.value)}
                        aria-pressed={isActive}
                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          isActive
                            ? 'bg-primary border-[var(--primary)] text-white'
                            : 'border-[var(--border)] bg-white text-[var(--text-secondary)] hover:border-[var(--primary)]/40 hover:text-[var(--text)]'
                        }`}
                      >
                        {label}
                        <span
                          className={`rounded-full px-1 text-[10px] font-bold ${
                            isActive
                              ? 'bg-white/20 text-white'
                              : 'bg-[var(--bg-secondary)] text-[var(--text-muted)]'
                          }`}
                        >
                          {b.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Job list */}
      {isLoading ? (
        <ul className="space-y-3" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i}>
              <Skeleton variant="rect" height={140} />
            </li>
          ))}
        </ul>
      ) : items.length === 0 ? (
        <EmptyState
          title={hasAnyFilter ? 'No jobs match these filters' : 'No open jobs right now'}
          description={
            hasAnyFilter
              ? 'Clear the filters to see all open roles at this company.'
              : 'Follow this company to be notified when new roles are posted.'
          }
        />
      ) : (
        <ul className={`space-y-3 transition-opacity ${isFetching ? 'opacity-70' : 'opacity-100'}`}>
          {items.map((j) => (
            <li key={j.id}>
              <PublicJobCard
                job={{
                  ...j,
                  experienceMin: (j as { experienceMin?: number }).experienceMin ?? 0,
                  company: {
                    id: company.id,
                    slug: company.slug,
                    companyName: company.companyName,
                    logo: company.logo,
                    isVerified: company.isVerified ?? false,
                  },
                }}
                isGuest={isGuest}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Pagination + per-page selector — visible whenever jobs exist so
          the selector never vanishes when a large size yields one page. */}
      {pagination && pagination.total > 0 && (
        <div className="mt-6">
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            onPageChange={setPage}
            totalItems={pagination.total}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}
    </Card>
  );
}
