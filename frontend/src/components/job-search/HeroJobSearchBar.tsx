'use client';

/**
 * Homepage-hero job search bar — keyword + location + experience +
 * Search button. Built on the SAME primitives as the private candidate
 * dashboard / find-jobs page so authed and unauthed users get the
 * identical search experience:
 *
 *   - keyword       → `<SearchBar>` (Elasticsearch autosuggest dropdown,
 *                     search history when signed in, trending searches,
 *                     keyboard nav, debounced 250 ms — every feature the
 *                     candidate dashboard ships with)
 *   - location      → `<AutoSuggest>` driven by `useSuggestLocations`
 *                     with Popular Locations focus section + Recent
 *                     Locations focus section when signed in
 *   - experience    → `<ExperienceSelect>` with buckets + custom range
 *
 * Submitting navigates to `/jobs?q=&location=&experienceMin=&experienceMax=`
 * so users land on the public listing page with their filters applied.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import SearchBar from '@/components/ui/SearchBar';
import AutoSuggest, {
  type SuggestOption,
  type AdditionalSuggestSection,
} from '@/components/ui/AutoSuggest';
import ExperienceSelect, { type ExperienceValue } from '@/components/ui/ExperienceSelect';
import Button from '@/components/ui/Button';
import { useSuggestLocations } from '@/hooks/use-search';
import { useStaticSuggestions } from '@/hooks/use-suggestions';
import {
  useFieldHistory,
  useAddToFieldHistory,
  useClearFieldHistory,
} from '@/hooks/use-field-history';
import { useAuthStore } from '@/store/auth.store';
import { searchHistoryService } from '@/services/search-history.service';
import type { AutocompleteResult } from '@/types/search';

interface Props {
  /** Override destination URL prefix. Default `/jobs`. */
  destination?: string;
  className?: string;
}

export default function HeroJobSearchBar({ destination = '/jobs', className }: Props) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  /* ---- state ---- */
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [experience, setExperience] = useState<ExperienceValue | null>(null);

  /* ---- location autosuggest (mirrors candidate/jobs/page.tsx) ---- */
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

  /* ---- focus → scroll-into-view ----
     When the user focuses ANY field inside the search bar, smoothly
     scroll the page so the bar sits in a comfortable typing position:
       • Desktop (≥1024 px): centered vertically (block:'center').
       • Mobile / tablet (<1024 px): ~15% from the top of the *visual*
         viewport — leaves the search bar visible above the on-screen
         keyboard, which usually claims the bottom ~50% of the screen.
     We re-run on visualViewport `resize` because the keyboard appears
     ~150–300 ms after focus and changes the visible height.
     A `hasScrolled` ref prevents repeated jumps while the user is
     still interacting (typing → autosuggest open → tab between fields).
  */
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasScrolledRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof window === 'undefined') return;

    const scrollToBar = () => {
      const rect = el.getBoundingClientRect();
      const elTop = rect.top + window.scrollY;
      const elHeight = rect.height;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const isDesktop = window.matchMedia('(min-width: 1024px)').matches;

      // Desktop: center vertically. Mobile/tablet: anchor near the top
      // so the keyboard doesn't cover the bar (or its dropdown).
      const targetY = isDesktop
        ? elTop - (viewportHeight - elHeight) / 2
        : elTop - viewportHeight * 0.15;

      window.scrollTo({
        top: Math.max(0, targetY),
        behavior: 'smooth',
      });
    };

    const onFocusIn = () => {
      if (hasScrolledRef.current) return;
      hasScrolledRef.current = true;
      // Double-RAF: lets the dropdown layer render + the mobile keyboard
      // begin opening before we measure — avoids landing in a spot that
      // gets covered a beat later by the keyboard.
      requestAnimationFrame(() => requestAnimationFrame(scrollToBar));
    };

    const onFocusOut = (e: FocusEvent) => {
      // Reset only when focus has fully LEFT the search bar (not when
      // moving between its own inputs/buttons).
      if (!el.contains(e.relatedTarget as Node | null)) {
        hasScrolledRef.current = false;
      }
    };

    const onVVResize = () => {
      // Keyboard opened/closed (or orientation changed) — re-center.
      if (hasScrolledRef.current) scrollToBar();
    };

    el.addEventListener('focusin', onFocusIn);
    el.addEventListener('focusout', onFocusOut);
    window.visualViewport?.addEventListener('resize', onVVResize);

    return () => {
      el.removeEventListener('focusin', onFocusIn);
      el.removeEventListener('focusout', onFocusOut);
      window.visualViewport?.removeEventListener('resize', onVVResize);
    };
  }, []);

  /* ---- handlers ---- */
  function submit(opts?: { keyword?: string; location?: string }) {
    const kw = (opts?.keyword ?? keyword).trim();
    const loc = (opts?.location ?? location).trim();
    const sp = new URLSearchParams();
    if (kw) sp.set('q', kw);
    if (loc) {
      sp.set('location', loc);
      // Track in recent-locations history (only fires when signed in;
      // the mutation no-ops for guests).
      if (isAuthenticated) addLocationHistory.mutate(loc);
    }
    if (experience) {
      sp.set('experienceMin', String(experience.min));
      if (experience.max !== undefined) sp.set('experienceMax', String(experience.max));
    }

    // Record this search to history — ONLY when the user provided at
    // least one meaningful input. The chip carousel reads from the
    // same store, and we don't want empty / no-input submits (which
    // map to "/jobs" with no params) to pollute it.
    //
    // This is the only place the homepage flow writes to history;
    // the auto-record on /jobs filter changes was removed because
    // curated-landing mounts + pill toggles produced a flood of
    // noise chips that users hadn't actually searched for.
    if (kw || loc || experience) {
      const recordFilters: Record<string, unknown> = {};
      if (experience) {
        recordFilters.experienceMin = experience.min;
        if (experience.max !== undefined) recordFilters.experienceMax = experience.max;
      }
      searchHistoryService
        .record({
          searchType: 'JOB',
          filters: recordFilters,
          query: kw || undefined,
          location: loc || undefined,
        })
        .catch(() => {});
    }

    const qs = sp.toString();
    router.push(qs ? `${destination}?${qs}` : destination);
  }

  /**
   * Hero-only behavior: typing or selecting a suggestion only POPULATES
   * the keyword field — it does NOT navigate. The user must click the
   * Search button (or use one of the other fields) before navigation
   * happens. This is intentional so the user can flow keyword → location
   * → experience → submit without being yanked to /jobs mid-flow.
   *
   * Other surfaces (e.g. PublicJobListingShell) don't have a separate
   * Search button — they're built around an "Enter = search" model
   * because they're already ON the listing page — so they keep their
   * existing behavior and the shared SearchBar primitive is unchanged.
   *
   * Focus chaining (hero only): after a value is committed in field N,
   * focus moves to field N+1 — flight-booking-style UX. Wrapped in a
   * single rAF so the suggestion dropdown can close + React commits
   * the same-tick setState before we move focus, otherwise the
   * dropdown's own outside-click handler can steal focus back.
   */
  function focusNextHeroField(currentIdx: number) {
    const el = containerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      const cells = el.querySelectorAll<HTMLElement>('[data-hero-field]');
      const next = cells[currentIdx + 1];
      if (!next) return;
      // First focusable inside the next cell — input for SearchBar /
      // AutoSuggest (text typing), button for ExperienceSelect (its
      // trigger that opens the dropdown on Enter/Space).
      const focusable =
        next.querySelector<HTMLElement>('input:not([type="hidden"])') ??
        next.querySelector<HTMLElement>('button') ??
        next;
      focusable.focus();
    });
  }

  function handleKeywordSearch(q: string) {
    setKeyword(q);
    focusNextHeroField(0);
  }

  function handleKeywordSelect(item: AutocompleteResult) {
    setKeyword(item.text);
    focusNextHeroField(0);
  }

  function handleLocationChange(v: string | string[]) {
    const val = Array.isArray(v) ? (v[0] ?? '') : v;
    setLocation(val);
    // Only advance when a real value was committed — clearing via
    // backspace / X-button shouldn't yank focus to the experience
    // picker. AutoSuggest's onChange fires on selection or Enter-with-
    // allowCreate, not on every keystroke, so this is safe.
    if (val) focusNextHeroField(1);
  }

  return (
    <div
      ref={containerRef}
      className={`grid grid-cols-1 gap-2 rounded-2xl border border-[var(--border)] bg-white p-2 shadow-md sm:grid-cols-[1.5fr_1fr_auto_auto] sm:items-stretch sm:gap-2 lg:grid-cols-[2fr_1.4fr_auto_auto] ${className ?? ''}`}
    >
      {/* Keyword — full-featured SearchBar (autosuggest, history, trending).
          `data-hero-field` marks this cell as field 0 in the focus chain;
          on suggestion-select / Enter, focus advances to field 1 (location). */}
      <div className="min-w-0" data-hero-field>
        <SearchBar
          placeholder="Job title, skills, or company"
          searchType="jobs"
          defaultValue={keyword}
          onSearch={handleKeywordSearch}
          onSelect={handleKeywordSelect}
          size="lg"
          fullWidth
        />
      </div>

      {/* Location — AutoSuggest with ES suggestions + popular + recent (auth).
          Field 1 in the focus chain: receives focus after keyword commits;
          on its own commit, focus advances to field 2 (experience). */}
      <div className="min-w-0" data-hero-field>
        <AutoSuggest
          placeholder="City or remote"
          value={location}
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

      {/* Experience — bucket picker with custom range. Wrapped so the
          focus-chain selector has a stable cell-level element to target;
          the trigger button inside is what actually receives focus. This
          is field 2 — the last auto-advance step. */}
      <div data-hero-field>
        <ExperienceSelect
          value={experience}
          onChange={setExperience}
          size="lg"
          className="w-full sm:w-44"
        />
      </div>

      {/* Submit */}
      <Button
        type="button"
        variant="primary"
        size="lg"
        leftIcon={<Search className="h-4 w-4" />}
        onClick={() => submit()}
      >
        Search
      </Button>
    </div>
  );
}
