'use client';

/**
 * PublicJobListingShell — the shared experience powering /jobs and the
 * curated listing variants under /jobs/[...slug].
 *
 * Search-bar parity with the private candidate dashboard:
 *   - keyword       → <SearchBar> (Elasticsearch autosuggest dropdown,
 *                     search history when signed in, trending searches,
 *                     keyboard navigation, debounced)
 *   - location      → <AutoSuggest> (useSuggestLocations) + Popular
 *                     Locations focus section + Recent Locations
 *                     focus section (auth-gated)
 *   - experience    → <ExperienceSelect> (bucket picker + custom range)
 *   - operator help → <KeywordSyntaxHelp> inline in keyword field
 *   - geo radius    → <RadiusSlider>
 *   - filters       → <AdvancedFilters> (left rail) + <ActiveFilterTags>
 *                     above the results
 *   - date posted   → 24h / 3d / 7d / 14d / 30d pill row
 *   - history       → <JobSearchHistoryChips> (existing horizontal
 *                     scrolling chips — preserved as-is)
 *
 * Behaviour:
 *   - URL <-> filter state synced via query params.
 *   - Soft-walls guests at 30 results (LoginToContinueBanner shown after
 *     the 30th card, pagination disabled past page 1).
 *   - Records every successful search to SearchHistory (server-side) so
 *     the chip carousel stays warm.
 *   - Multiple guest CTAs interleaved: InlineSignupCard every 8 cards,
 *     SidebarSignupCard on the right rail (lg+), StickyMobileBottomCta
 *     on mobile.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search, Loader2, Filter as FilterIcon, SlidersHorizontal, Sparkles } from 'lucide-react';
import Pagination from '@/components/ui/Pagination';
import Card from '@/components/ui/Card';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import SearchBar from '@/components/ui/SearchBar';
import AutoSuggest, {
  type SuggestOption,
  type AdditionalSuggestSection,
} from '@/components/ui/AutoSuggest';
import ExperienceSelect, { type ExperienceValue } from '@/components/ui/ExperienceSelect';
import AdvancedFilters, {
  ActiveFilterTags,
  type FilterSection,
} from '@/components/ui/AdvancedFilters';
import RadiusSlider from '@/components/jobs/RadiusSlider';
import PublicJobCard from './PublicJobCard';
import LoginToContinueBanner from './LoginToContinueBanner';
import InlineSignupCard from './InlineSignupCard';
import SidebarSignupCard from './SidebarSignupCard';
import StickyMobileBottomCta from './StickyMobileBottomCta';
import NarrowResultsCta from './NarrowResultsCta';
import ExitIntentSaveSearchModal from './ExitIntentSaveSearchModal';
import JobSearchHistoryChips from './JobSearchHistoryChips';
import KeywordSyntaxHelp from './KeywordSyntaxHelp';
import { publicJobsService } from '@/services/public-jobs.service';
import { searchHistoryService } from '@/services/search-history.service';
import { useAuthStore } from '@/store/auth.store';
import { useSuggestLocations } from '@/hooks/use-search';
import { useStaticSuggestions } from '@/hooks/use-suggestions';
import {
  useFieldHistory,
  useAddToFieldHistory,
  useClearFieldHistory,
} from '@/hooks/use-field-history';
import {
  WORK_MODE_LABELS,
  JOB_TYPE_LABELS,
  EXPERIENCE_LEVEL_LABELS,
  COMPANY_TYPE_LABELS,
  EDUCATION_LEVEL_LABELS,
  SHIFT_TYPE_LABELS,
} from '@/constants/enums';
import { cn } from '@/lib/utils';
import type { AutocompleteResult } from '@/types/search';

interface Props {
  /** Initial filter preset from a curated landing slug (e.g. role+city). */
  initialFilters?: Record<string, string>;
  /** Override the page H1 — typically supplied by curated landings. */
  heroH1?: string;
  /** Optional sub-headline below the H1. */
  heroSubtitle?: string;
  /** When true, render an SEO-friendly intro paragraph above the results. */
  seoIntro?: string;
}

const FILTER_KEYS = [
  'q',
  'location',
  'cities',
  'skills',
  'designation',
  'experienceMin',
  'experienceMax',
  'experienceLevel',
  'workMode',
  'jobType',
  'industry',
  'department',
  'category',
  'qualification',
  'shiftType',
  'companyType',
  'educationRequired',
  'salaryMin',
  'salaryMax',
  'salaryBucket',
  'postedAfter',
  'latitude',
  'longitude',
  'radiusKm',
  'sortBy',
] as const;

const DATE_POSTED_OPTIONS = [
  { value: '', label: 'Any time' },
  { value: '1', label: 'Last 24h' },
  { value: '3', label: 'Last 3 days' },
  { value: '7', label: 'Last 7 days' },
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
];

const FILTER_SECTIONS: FilterSection[] = [
  { key: 'workMode', label: 'Work Mode', type: 'multiselect', options: WORK_MODE_LABELS },
  { key: 'jobType', label: 'Job Type', type: 'multiselect', options: JOB_TYPE_LABELS },
  {
    key: 'experienceLevel',
    label: 'Experience Level',
    type: 'multiselect',
    options: EXPERIENCE_LEVEL_LABELS,
  },
  { key: 'salary', label: 'Salary Range', type: 'range', rangePrefix: '₹' },
  { key: 'companyType', label: 'Company Type', type: 'multiselect', options: COMPANY_TYPE_LABELS },
  { key: 'industry', label: 'Industry', type: 'multiselect' },
  {
    key: 'educationRequired',
    label: 'Education',
    type: 'multiselect',
    options: EDUCATION_LEVEL_LABELS,
  },
  { key: 'shiftType', label: 'Shift Type', type: 'multiselect', options: SHIFT_TYPE_LABELS },
];

function paramsToFilters(sp: URLSearchParams): Record<string, string> {
  const filters: Record<string, string> = {};
  for (const k of FILTER_KEYS) {
    const v = sp.get(k);
    if (v) filters[k] = v;
  }
  return filters;
}

function filtersToParams(filters: Record<string, string>, page: number): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v && v !== '') sp.set(k, v);
  }
  if (page > 1) sp.set('page', String(page));
  return sp;
}

export default function PublicJobListingShell({
  initialFilters,
  heroH1,
  heroSubtitle,
  seoIntro,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // URL-driven filter state (with optional curated overrides).
  const [filters, setFilters] = useState<Record<string, string>>(() => ({
    ...(initialFilters ?? {}),
    ...paramsToFilters(searchParams ?? new URLSearchParams()),
  }));
  const [page, setPage] = useState<number>(() => Number(searchParams?.get('page') ?? '1') || 1);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  /**
   * Which Date-Posted chip is highlighted.
   *
   * Tracked separately from `filters.postedAfter` because the two are no
   * longer the same value: the chips carry a day count ('7') while the filter
   * carries the ISO timestamp the backend's date range actually needs. Reading
   * the chip state off `postedAfter` would leave no chip ever highlighted.
   *
   * Deliberately not derived from the ISO value at render time — that would
   * need `Date.now()` during render and risk an SSR/client hydration
   * mismatch. The cost is that deep-linking `?postedAfter=<iso>` does not
   * pre-highlight a chip; the filter itself still applies.
   */
  const [postedDays, setPostedDays] = useState('');
  const [locationQuery, setLocationQuery] = useState<string>(filters.location ?? '');

  // Sync filters → URL (replaceState — no history pollution).
  useEffect(() => {
    const sp = filtersToParams(filters, page);
    const next = sp.toString();
    const current = searchParams?.toString() ?? '';
    if (next !== current) {
      router.replace(next ? `?${next}` : '?', { scroll: false });
    }
  }, [filters, page, router, searchParams]);

  // Server query — drives the results list.
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['public-jobs', filters, page],
    queryFn: () =>
      publicJobsService.search({
        ...filters,
        page,
        limit: 20,
      }),
    placeholderData: (prev) => prev,
  });

  // History recording moved into the keyword handlers (`handleKeywordSearch`
  // + `handleKeywordSelect`) so the chip carousel only gathers searches
  // the user explicitly performed via the SearchBar. The previous
  // useEffect ran on every `filters` change, which meant curated landings
  // (`/jobs/in/bangalore`, etc.) and any pill / dropdown toggle flooded
  // the carousel with chips the user never actually "searched for".

  // ── Location autosuggest (mirrors candidate/jobs/page.tsx) ──
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

  // ── Derived UI state ──
  const experienceValue: ExperienceValue | null = useMemo(() => {
    const minRaw = filters.experienceMin;
    const maxRaw = filters.experienceMax;
    if (!minRaw && !maxRaw) return null;
    const min = minRaw ? Number(minRaw) : 0;
    if (Number.isNaN(min)) return null;
    if (maxRaw && !Number.isNaN(Number(maxRaw))) {
      return { min, max: Number(maxRaw) };
    }
    return { min };
  }, [filters.experienceMin, filters.experienceMax]);

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
  // SearchBar Enter / suggestion-select are the two paths we treat as
  // an "explicit search" — they trigger a write to the global search-
  // history store. Filter pills, location autosuggest, exp slider,
  // advanced-filters dropdowns, etc. only update local state — they
  // don't pollute the history carousel.
  function recordKeywordSearch(q: string, nextFilters: Record<string, string>) {
    if (!q.trim()) return;
    searchHistoryService
      .record({
        searchType: 'JOB',
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

  function handleExperienceChange(val: ExperienceValue | null) {
    setFilters((prev) => {
      const next = { ...prev };
      if (val) {
        next.experienceMin = String(val.min);
        if (val.max !== undefined) {
          next.experienceMax = String(val.max);
        } else {
          delete next.experienceMax;
        }
      } else {
        delete next.experienceMin;
        delete next.experienceMax;
      }
      return next;
    });
    setPage(1);
  }

  function handleDatePosted(value: string) {
    setPostedDays(value);
    setFilters((prev) => {
      const next = { ...prev };
      if (value) {
        // DATE_POSTED_OPTIONS carry a DAY COUNT ('7'), but `postedAfter` goes
        // into an Elasticsearch range on `createdAt`. Sending the raw count
        // made ES read it as epoch milliseconds — '7' meant 7ms after 1 Jan
        // 1970 — so the filter matched every job and silently did nothing.
        // Convert to a real ISO timestamp.
        const days = Number(value);
        next.postedAfter = Number.isFinite(days)
          ? new Date(Date.now() - days * 86_400_000).toISOString()
          : value;
      } else {
        delete next.postedAfter;
      }
      return next;
    });
    setPage(1);
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
      // Strip every key managed by FILTER_SECTIONS (incl. range Min/Max).
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

  function handleGeoLocation(lat: string, lng: string, cityName?: string) {
    setFilters((prev) => ({
      ...prev,
      latitude: lat,
      longitude: lng,
      ...(cityName ? { location: cityName } : {}),
    }));
    setPage(1);
  }

  function handleRadiusChange(radiusKm: string) {
    setFilters((prev) => ({ ...prev, radiusKm }));
    setPage(1);
  }

  function handleClearGeo() {
    setFilters((prev) => {
      const next = { ...prev };
      delete next.latitude;
      delete next.longitude;
      delete next.radiusKm;
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

  const cards = useMemo(() => {
    const out: Array<{ kind: 'job'; data: (typeof items)[number] } | { kind: 'inline-cta' }> = [];
    items.forEach((it, i) => {
      out.push({ kind: 'job', data: it });
      // Interleave inline CTA every 8 cards for guests.
      if (!isAuthenticated && (i + 1) % 8 === 0 && i !== items.length - 1) {
        out.push({ kind: 'inline-cta' });
      }
    });
    return out;
  }, [items, isAuthenticated]);

  return (
    <div className="bg-[var(--bg)]">
      {/* Hero */}
      <section className="under-public-header bg-gradient-to-b from-[var(--bg-secondary)] to-[var(--bg)] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-3xl font-extrabold tracking-tight text-[var(--text)] sm:text-4xl lg:text-5xl">
            {heroH1 ?? 'Find Jobs'}
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

          {/* Search Card — parity with /candidate/jobs */}
          <Card className="mt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="relative min-w-0 flex-1">
                <SearchBar
                  placeholder="Job title, skills, or company"
                  searchType="jobs"
                  defaultValue={filters.q ?? ''}
                  onSearch={handleKeywordSearch}
                  onSelect={handleKeywordSelect}
                  size="lg"
                  fullWidth
                />
                <div className="absolute top-1/2 right-2 -translate-y-1/2">
                  {/* Hidden while the keyword field has text — otherwise
                      the `?` icon overlaps the SearchBar's own clear (×)
                      button, which lives in the same right-edge slot. */}
                  <KeywordSyntaxHelp hidden={Boolean(filters.q?.trim())} />
                </div>
              </div>
              <ExperienceSelect
                value={experienceValue}
                onChange={handleExperienceChange}
                size="lg"
                className="w-full shrink-0 sm:w-40"
              />
              <div className="min-w-0 flex-1 sm:max-w-xs">
                <AutoSuggest
                  placeholder="City or remote"
                  value={filters.location ?? ''}
                  onChange={handleLocationChange}
                  suggestions={locationOptions}
                  isLoading={isLoadingLocations}
                  onInputChange={setLocationQuery}
                  allowCreate
                  createLabel={(q) => `Search in "${q}"`}
                  minChars={2}
                  inputSize="lg"
                  focusSections={locationFocusSections}
                />
              </div>
            </div>

            {/* Pro tip + geo radius */}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="hidden items-center gap-1.5 text-[10px] text-[var(--text-muted)] sm:flex">
                <span>Pro tip:</span>
                <span className="rounded bg-[var(--bg-secondary)] px-1 py-0.5 font-mono">AND</span>
                <span className="rounded bg-[var(--bg-secondary)] px-1 py-0.5 font-mono">OR</span>
                <span className="rounded bg-[var(--bg-secondary)] px-1 py-0.5 font-mono">NOT</span>
                <span>operators supported</span>
              </div>
              <RadiusSlider
                latitude={filters.latitude}
                longitude={filters.longitude}
                radiusKm={filters.radiusKm}
                onLocationChange={handleGeoLocation}
                onRadiusChange={handleRadiusChange}
                onClear={handleClearGeo}
              />
            </div>
          </Card>

          {/* Date-posted pill row */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {DATE_POSTED_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleDatePosted(opt.value)}
                className={cn(
                  'cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  postedDays === opt.value
                    ? 'bg-primary text-white shadow-sm'
                    : 'border border-[var(--border)] bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

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

          {/* Search history chips (preserved as-is — complementary to
              SearchBar's internal dropdown history). */}
          <JobSearchHistoryChips type="JOB" destination="/jobs" className="mt-4" hideWhenEmpty />
        </div>
      </section>

      {/* Results + sidebar */}
      <section className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[260px_1fr_300px]">
          {/* Filters sidebar (left rail) — Advanced filters drawer */}
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

          {/* Results column */}
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
                    {total === 1 ? 'job' : 'jobs'}
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
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs text-[var(--text-secondary)] lg:hidden"
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
                  <Skeleton key={i} className="h-32 w-full rounded-2xl" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                icon={Search}
                title="No matching jobs"
                description="Try removing some filters, broadening the location, or use simpler keywords."
              />
            ) : (
              <ul className="space-y-3">
                {cards.map((c, i) =>
                  c.kind === 'inline-cta' ? (
                    <li key={`cta-${i}`}>
                      <InlineSignupCard />
                    </li>
                  ) : (
                    <li key={c.data.id}>
                      <PublicJobCard
                        job={c.data}
                        searchKeyword={filters.q}
                        isGuest={!isAuthenticated}
                      />
                    </li>
                  ),
                )}
              </ul>
            )}

            {/* Soft-wall after 30 results for guests. */}
            {loginRequired && <LoginToContinueBanner totalAvailable={total} shown={items.length} />}
            {isFetching && items.length > 0 && (
              <div className="mt-3 flex items-center justify-center gap-1 text-xs text-[var(--text-muted)]">
                <Loader2 className="h-3 w-3 animate-spin" /> Refreshing…
              </div>
            )}

            {/* Pagination — hidden past the soft-wall for guests until they sign up. */}
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

          {/* Right-rail sidebar — guest CTAs */}
          {!isAuthenticated && (
            <div className="space-y-4">
              <SidebarSignupCard />
              {/* Niche-search CTA — visible only when filters narrow
                  results below 10. Encourages saved-search alerts. */}
              <NarrowResultsCta
                resultCount={data?.pagination?.total ?? 0}
                redirectIntent={
                  typeof window !== 'undefined'
                    ? window.location.pathname + window.location.search
                    : undefined
                }
              />
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

      {/* Mobile sticky bottom CTA */}
      <StickyMobileBottomCta />

      {/* Exit-intent modal — capped to once per 30 days for guests. */}
      {!isAuthenticated && <ExitIntentSaveSearchModal searchSnapshot={{ type: 'JOB', filters }} />}

      {/* Sparkles import retained for symmetry with did-you-mean — used
          when public-jobs backend ships a `didYouMean` field. */}
      <span hidden aria-hidden="true">
        <Sparkles className="h-3 w-3" />
      </span>
    </div>
  );
}
