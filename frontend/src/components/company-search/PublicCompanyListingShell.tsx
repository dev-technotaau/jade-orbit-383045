'use client';

/**
 * Public companies listing shell — analog of PublicJobListingShell.
 * Shared by /companies and the curated landings under /companies/*.
 *
 * Search-bar parity with the private candidate dashboard:
 *   - keyword       → <SearchBar> (Elasticsearch autosuggest dropdown,
 *                     search history when signed in, trending searches,
 *                     keyboard navigation, debounced)
 *   - location      → <AutoSuggest> (useSuggestLocations) + Popular
 *                     Locations focus section + Recent Locations
 *                     focus section (auth-gated)
 *   - filters       → <AdvancedFilters> (left rail) + <ActiveFilterTags>
 *                     above the results — industry, company type,
 *                     verified-only, hiring-now toggles
 *   - history       → <JobSearchHistoryChips type="COMPANY"> (preserved)
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search, Loader2, Filter as FilterIcon, SlidersHorizontal } from 'lucide-react';
import Button from '@/components/ui/Button';
import Pagination from '@/components/ui/Pagination';
import Card from '@/components/ui/Card';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import SearchBar from '@/components/ui/SearchBar';
import AutoSuggest, {
  type SuggestOption,
  type AdditionalSuggestSection,
} from '@/components/ui/AutoSuggest';
import AdvancedFilters, {
  ActiveFilterTags,
  type FilterSection,
} from '@/components/ui/AdvancedFilters';
import PublicCompanyCard from './PublicCompanyCard';
import LoginToContinueBanner from '@/components/job-search/LoginToContinueBanner';
import InlineSignupCard from '@/components/job-search/InlineSignupCard';
import SidebarSignupCard from '@/components/job-search/SidebarSignupCard';
import StickyMobileBottomCta from '@/components/job-search/StickyMobileBottomCta';
import JobSearchHistoryChips from '@/components/job-search/JobSearchHistoryChips';
import { publicCompaniesService } from '@/services/public-companies.service';
import { searchHistoryService } from '@/services/search-history.service';
import { useAuthStore } from '@/store/auth.store';
import { useSuggestLocations } from '@/hooks/use-search';
import { useStaticSuggestions } from '@/hooks/use-suggestions';
import {
  useFieldHistory,
  useAddToFieldHistory,
  useClearFieldHistory,
} from '@/hooks/use-field-history';
import { COMPANY_TYPE_LABELS } from '@/constants/enums';
import { cn } from '@/lib/utils';
import type { AutocompleteResult } from '@/types/search';

interface Props {
  initialFilters?: Record<string, string>;
  heroH1?: string;
  heroSubtitle?: string;
  seoIntro?: string;
}

const FILTER_KEYS = [
  'q',
  'industry',
  'location',
  'city',
  'cities',
  'size',
  'category',
  'companyType',
  'isVerified',
  'hasOpenJobs',
  'featured',
  'sortBy',
] as const;

const FILTER_SECTIONS: FilterSection[] = [
  { key: 'companyType', label: 'Company Type', type: 'multiselect', options: COMPANY_TYPE_LABELS },
  {
    key: 'size',
    label: 'Company Size',
    type: 'multiselect',
    options: {
      '1-10': '1-10',
      '11-50': '11-50',
      '51-200': '51-200',
      '201-500': '201-500',
      '501-1000': '501-1000',
      '1001-5000': '1001-5000',
      '5001-10000': '5001-10000',
      '10000+': '10000+',
    },
  },
  { key: 'industry', label: 'Industry', type: 'multiselect' },
  {
    key: 'isVerified',
    label: 'Verified Only',
    type: 'select',
    options: { true: 'Verified employers only' },
  },
  {
    key: 'hasOpenJobs',
    label: 'Currently Hiring',
    type: 'select',
    options: { true: 'Has open positions' },
  },
];

function paramsToFilters(sp: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of FILTER_KEYS) {
    const v = sp.get(k);
    if (v) out[k] = v;
  }
  return out;
}

function filtersToParams(filters: Record<string, string>, page: number): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v && v !== '') sp.set(k, v);
  }
  if (page > 1) sp.set('page', String(page));
  return sp;
}

export default function PublicCompanyListingShell({
  initialFilters,
  heroH1,
  heroSubtitle,
  seoIntro,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [filters, setFilters] = useState<Record<string, string>>(() => ({
    ...(initialFilters ?? {}),
    ...paramsToFilters(searchParams ?? new URLSearchParams()),
  }));
  const [page, setPage] = useState<number>(() => Number(searchParams?.get('page') ?? '1') || 1);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [locationQuery, setLocationQuery] = useState<string>(filters.location ?? '');

  useEffect(() => {
    const sp = filtersToParams(filters, page);
    const next = sp.toString();
    const current = searchParams?.toString() ?? '';
    if (next !== current) {
      router.replace(next ? `?${next}` : '?', { scroll: false });
    }
  }, [filters, page, router, searchParams]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['public-companies', filters, page],
    queryFn: () => publicCompaniesService.search({ ...filters, page, limit: 20 }),
    placeholderData: (prev) => prev,
  });

  // ── Location autosuggest (mirrors job shell) ──
  const { data: locationSuggestions, isLoading: isLoadingLocations } =
    useSuggestLocations(locationQuery);
  const { suggestions: popularLocations, isLoading: isLoadingPopular } = useStaticSuggestions(
    'location',
    8,
  );
  const { data: locationHistory } = useFieldHistory('location');
  const addLocationHistory = useAddToFieldHistory('location');
  const clearLocationHistory = useClearFieldHistory('location');

  const locationOptions: SuggestOption[] = useMemo(
    () =>
      (locationSuggestions?.data?.suggestions ?? []).map((s) => ({
        label: s.text,
        value: s.text,
        count: s.count,
      })),
    [locationSuggestions],
  );

  const locationFocusSections = useMemo(() => {
    const sections: AdditionalSuggestSection[] = [];
    const historyItems = locationHistory?.data?.history ?? [];
    if (isAuthenticated && historyItems.length > 0) {
      sections.push({
        label: 'Recent Locations',
        options: historyItems.map((h) => ({ label: h.value, value: h.value })),
        onClear: () => clearLocationHistory.mutate(),
      });
    }
    sections.push({
      label: 'Popular Locations',
      options: popularLocations.map((loc) => ({ label: loc, value: loc })),
      isLoading: isLoadingPopular,
    });
    return sections;
  }, [isAuthenticated, locationHistory, popularLocations, isLoadingPopular, clearLocationHistory]);

  // ── Active filter count ──
  const activeFilterCount = useMemo(
    () =>
      FILTER_SECTIONS.reduce((count, section) => {
        if (section.type === 'range') {
          if (filters[`${section.key}Min`] || filters[`${section.key}Max`]) return count + 1;
          return count;
        }
        return filters[section.key] ? count + 1 : count;
      }, 0),
    [filters],
  );

  // ── Handlers ──
  // Mirror of the job-shell behaviour: only an explicit SearchBar
  // submit (Enter) or suggestion-pick writes to the global search-
  // history store. Industry / city / verified-only toggles and other
  // refinements stay local — they don't pollute the chip carousel.
  function recordKeywordSearch(q: string, nextFilters: Record<string, string>) {
    if (!q.trim()) return;
    searchHistoryService
      .record({
        searchType: 'COMPANY',
        filters: nextFilters,
        query: q,
        location: nextFilters.location,
      })
      .catch(() => {});
  }

  function handleKeywordSearch(q: string) {
    setFilters((prev) => {
      const next = { ...prev, q };
      recordKeywordSearch(q, next);
      return next;
    });
    setPage(1);
  }
  function handleKeywordSelect(item: AutocompleteResult) {
    setFilters((prev) => {
      const next = { ...prev, q: item.text };
      recordKeywordSearch(item.text, next);
      return next;
    });
    setPage(1);
  }
  function handleLocationChange(v: string | string[]) {
    const val = Array.isArray(v) ? (v[0] ?? '') : v;
    setFilters((prev) => ({ ...prev, location: val }));
    setPage(1);
    if (val && isAuthenticated) addLocationHistory.mutate(val);
  }
  function handleAdvancedChange(key: string, value: string | undefined) {
    setFilters((prev) => {
      const next = { ...prev };
      if (value === undefined || value === '') delete next[key];
      else next[key] = value;
      return next;
    });
    setPage(1);
  }
  function handleClearAdvanced() {
    setFilters((prev) => {
      const next = { ...prev };
      for (const section of FILTER_SECTIONS) {
        if (section.type === 'range') {
          delete next[`${section.key}Min`];
          delete next[`${section.key}Max`];
        } else {
          delete next[section.key];
        }
      }
      return next;
    });
    setPage(1);
  }

  const items = data?.items ?? [];
  const total = data?.pagination.total ?? 0;
  const cap = data?.pagination.cap;
  const loginRequired = data?.pagination.loginRequired;
  // Guests can only page through up to `cap` results before the soft-wall;
  // bound the numbered pages so we never offer pages past the guest cap.
  const pageSize = 20;
  const navigableTotal = cap ? Math.min(total, cap) : total;
  const totalPages = Math.ceil(navigableTotal / pageSize);

  const cards = items.flatMap((it, i) => {
    const arr: Array<{ kind: 'company'; data: typeof it } | { kind: 'inline-cta' }> = [
      { kind: 'company', data: it },
    ];
    if (!isAuthenticated && (i + 1) % 8 === 0 && i !== items.length - 1) {
      arr.push({ kind: 'inline-cta' });
    }
    return arr;
  });

  return (
    <div className="bg-[var(--bg)]">
      <section className="under-public-header bg-gradient-to-b from-[var(--bg-secondary)] to-[var(--bg)] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <div className="mx-auto max-w-7xl">
          {filters.featured === 'true' && (
            <span className="bg-primary/10 text-primary mb-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wider uppercase">
              ★ Featured
            </span>
          )}
          <h1 className="text-3xl font-extrabold tracking-tight text-[var(--text)] sm:text-4xl lg:text-5xl">
            {filters.featured === 'true'
              ? 'Featured Companies Hiring'
              : (heroH1 ?? 'Browse Companies')}
          </h1>
          {heroSubtitle && (
            <p className="hero-subtitle mt-2 text-sm text-[var(--text-secondary)] sm:text-base">
              {heroSubtitle}
            </p>
          )}
          {seoIntro && (
            <p
              data-speakable="true"
              className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]"
            >
              {seoIntro}
            </p>
          )}

          {/* Search Card — parity with /candidate/jobs (no experience field) */}
          <Card className="mt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <SearchBar
                  placeholder="Company name, industry, or tagline"
                  searchType="all"
                  defaultValue={filters.q ?? ''}
                  onSearch={handleKeywordSearch}
                  onSelect={handleKeywordSelect}
                  size="lg"
                  fullWidth
                />
              </div>
              <div className="min-w-0 flex-1 sm:max-w-xs">
                <AutoSuggest
                  placeholder="City or remote"
                  value={filters.location ?? ''}
                  onChange={handleLocationChange}
                  suggestions={locationOptions}
                  isLoading={isLoadingLocations}
                  onInputChange={setLocationQuery}
                  allowCreate
                  createLabel={(q) => `Companies in "${q}"`}
                  minChars={2}
                  inputSize="lg"
                  focusSections={locationFocusSections}
                />
              </div>
              <Button
                variant="primary"
                size="lg"
                leftIcon={<Search className="h-4 w-4" />}
                onClick={() => setPage(1)}
                className="shrink-0"
              >
                Search
              </Button>
            </div>
          </Card>

          {/* Active filter chips */}
          {activeFilterCount > 0 && (
            <ActiveFilterTags
              className="mt-3"
              sections={FILTER_SECTIONS}
              values={filters}
              onChange={handleAdvancedChange}
              onClear={handleClearAdvanced}
            />
          )}

          {/* Recent searches chip carousel */}
          <div className="mt-4">
            <JobSearchHistoryChips type="COMPANY" destination="/companies" hideWhenEmpty />
          </div>
        </div>
      </section>

      <section className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[260px_1fr_300px]">
          <aside className="hidden flex-col gap-3 lg:flex">
            <div className="flex items-center justify-between text-sm font-semibold text-[var(--text)]">
              <span className="inline-flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4" /> Filters
                {activeFilterCount > 0 && (
                  <span className="bg-primary inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </span>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={handleClearAdvanced}
                  className="text-primary text-xs font-medium hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>
            <AdvancedFilters
              sections={FILTER_SECTIONS}
              values={filters}
              onChange={handleAdvancedChange}
              onClear={handleClearAdvanced}
              activeCount={activeFilterCount}
              layout="sidebar"
              title="Refine search"
            />
          </aside>

          <div className="min-w-0">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-[var(--text-secondary)]">
                {isLoading ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                  </span>
                ) : (
                  <>
                    Showing <strong className="text-[var(--text)]">{items.length}</strong> of{' '}
                    <strong className="text-[var(--text)]">{total.toLocaleString('en-IN')}</strong>{' '}
                    {total === 1 ? 'company' : 'companies'}
                    {cap ? (
                      <span className="text-[var(--text-muted)]">
                        {' '}
                        · capped at {cap} for guests
                      </span>
                    ) : null}
                  </>
                )}
              </p>
              <button
                type="button"
                aria-label="Open filters"
                onClick={() => setAdvancedOpen(true)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs text-[var(--text-secondary)] lg:hidden',
                )}
              >
                <FilterIcon className="h-3.5 w-3.5" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="bg-primary inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>

            {isLoading && items.length === 0 ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 w-full rounded-2xl" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                icon={Search}
                title="No matching companies"
                description="Try removing filters or broadening your search."
              />
            ) : (
              <ul className="space-y-3">
                {cards.map((c, i) =>
                  c.kind === 'inline-cta' ? (
                    <li key={`cta-${i}`}>
                      <InlineSignupCard
                        headline="Follow companies you love"
                        subheadline="Sign up free to follow companies and get notified about new openings."
                      />
                    </li>
                  ) : (
                    <li key={c.data.id}>
                      <PublicCompanyCard company={c.data} searchKeyword={filters.q} />
                    </li>
                  ),
                )}
              </ul>
            )}

            {loginRequired && <LoginToContinueBanner totalAvailable={total} shown={items.length} />}
            {isFetching && items.length > 0 && (
              <div className="mt-3 flex items-center justify-center gap-1 text-xs text-[var(--text-muted)]">
                <Loader2 className="h-3 w-3 animate-spin" /> Refreshing…
              </div>
            )}
            {!loginRequired && total > items.length && (
              <Pagination
                className="mt-6"
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
                totalItems={navigableTotal}
                pageSize={pageSize}
              />
            )}
          </div>

          {!isAuthenticated && (
            <div>
              <SidebarSignupCard headline="Save companies you like" />
            </div>
          )}
        </div>
      </section>

      {/* Mobile filter drawer */}
      {advancedOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end bg-black/40 lg:hidden"
          onClick={() => setAdvancedOpen(false)}
        >
          <div
            data-lenis-prevent
            className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-[var(--text)]">Filters</h3>
              <button
                type="button"
                onClick={() => setAdvancedOpen(false)}
                className="text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                Done
              </button>
            </div>
            <AdvancedFilters
              sections={FILTER_SECTIONS}
              values={filters}
              onChange={handleAdvancedChange}
              onClear={handleClearAdvanced}
              activeCount={activeFilterCount}
              layout="panel"
              title=""
            />
          </div>
        </div>
      )}

      <StickyMobileBottomCta />
    </div>
  );
}
