'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useClickOutside } from '@/hooks/use-click-outside';
import Link from 'next/link';
import { Menu, ChevronDown, LogOut, ExternalLink, Keyboard, Home, Search } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useUIStore } from '@/store/ui.store';
import { ROUTES, ROLE_DASHBOARDS } from '@/constants/routes';
import { ROLE_LABELS } from '@/constants/enums';
import { QUERY_KEYS } from '@/constants/config';
import { employerService } from '@/services/employer.service';
import Avatar from '@/components/ui/Avatar';
import AvatarWithVerified from '@/components/common/AvatarWithVerified';
import Badge from '@/components/ui/Badge';
import Tooltip from '@/components/ui/Tooltip';
import Logo from '@/components/common/Logo';
import NotificationBell from '@/components/notifications/NotificationBell';
import AwayToggle from '@/components/super-admin/whatsapp/AwayToggle';
import QuotaBar from '@/components/billing/QuotaBar';
import BillingAlertBadge from '@/components/billing/BillingAlertBadge';
import EmployerQuickActions from '@/components/billing/EmployerQuickActions';
import SearchBar from '@/components/ui/SearchBar';
import AutoSuggest from '@/components/ui/AutoSuggest';
import ExperienceSelect, { type ExperienceValue } from '@/components/ui/ExperienceSelect';
import { useSuggestLocations } from '@/hooks/use-search';
import { useSuggest, useStaticSuggestions } from '@/hooks/use-suggestions';
import {
  useFieldHistory,
  useAddToFieldHistory,
  useClearFieldHistory,
} from '@/hooks/use-field-history';
import type { Role } from '@/types/auth';
import type { AutocompleteResult } from '@/types/search';

const ROLE_BADGE_VARIANT: Record<
  string,
  'info' | 'success' | 'warning' | 'error' | 'secondary' | 'accent'
> = {
  CANDIDATE: 'info',
  EMPLOYER: 'accent',
  ADMIN: 'secondary',
  SUPER_ADMIN: 'error',
};

const SEARCH_ROUTES: Record<string, string> = {
  CANDIDATE: ROUTES.CANDIDATE.JOBS,
  EMPLOYER: ROUTES.EMPLOYER.CANDIDATES,
};

export default function DashboardHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { setSidebarOpen } = useUIStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  useClickOutside(userMenuRef, () => setUserMenuOpen(false), userMenuOpen);
  /* EMPLOYER-ONLY: the search row lives behind a button in a dropdown instead
     of sitting permanently in the header. Candidates keep the inline row —
     `isEmployer` below is the single switch, so nothing about the
     candidate header changes. Same open/close plumbing as the user menu. */
  const [searchOpen, setSearchOpen] = useState(false);
  const searchDropdownRef = useRef<HTMLDivElement>(null);
  useClickOutside(searchDropdownRef, () => setSearchOpen(false), searchOpen);
  // Keyword is now tracked locally instead of letting <SearchBar>
  // navigate on its own — see the submit-only flow below. The hero
  // search bar uses the same pattern so selecting a suggestion or
  // pressing Enter populates this field, and navigation happens only
  // when the user clicks the Search button (mirroring user request).
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [experience, setExperience] = useState<ExperienceValue | null>(null);
  // Container ref drives focus chaining between the three search-row
  // cells: keyword → location → experience. Same `data-hero-field`
  // marker convention as HeroJobSearchBar so the behaviour is
  // identical (flight-booking-style auto-advance after each commit).
  const searchRowRef = useRef<HTMLDivElement | null>(null);

  const { data: companyData } = useQuery({
    queryKey: QUERY_KEYS.EMPLOYERS.COMPANY,
    queryFn: () => employerService.getCompany(),
    enabled: user?.role === 'EMPLOYER',
    staleTime: 10 * 60 * 1000,
  });
  // Use query data when available, fall back to auth store (available immediately after login)
  const companyLogo = companyData?.data?.logo ?? user?.companyProfile?.logo;

  const dashboardPath = user?.role ? ROLE_DASHBOARDS[user.role as Role] : '/';
  const hasSearchPage = user?.role === 'CANDIDATE' || user?.role === 'EMPLOYER';
  const searchType = user?.role === 'EMPLOYER' ? ('candidates' as const) : ('jobs' as const);
  /* Employer-only header differences, both driven off one flag rather than a
     search-named one doing double duty:
       · the search row collapses into a dropdown
       · the add-on quick actions appear beside the plan badges */
  const isEmployer = user?.role === 'EMPLOYER';
  const searchPlaceholder =
    user?.role === 'EMPLOYER' ? 'Search candidates, skills...' : 'Job title, skills, company...';

  const { data: locationSuggestions, isLoading: isLoadingLocations } =
    useSuggestLocations(locationInput);

  const locationOptions = useMemo(
    () =>
      (locationSuggestions?.data?.suggestions ?? []).map((s) => ({
        label: s.text,
        value: s.text,
        count: s.count,
      })),
    [locationSuggestions],
  );

  const { suggestions: esSuggestions, isLoading: isLoadingEsSuggestions } = useSuggest({
    category: 'location',
    query: locationInput,
    limit: 10,
    minChars: 2,
  });
  const locationAdditionalSections = useMemo(
    () =>
      locationInput.length >= 2
        ? [
            {
              label: 'Suggestions',
              options: esSuggestions.map((s) => ({ label: s, value: s })),
              isLoading: isLoadingEsSuggestions,
            },
          ]
        : [],
    [locationInput, esSuggestions, isLoadingEsSuggestions],
  );

  // ── Focus sections: Recent Locations + Popular Locations ──
  const { data: locationHistory } = useFieldHistory('location');
  const addLocationHistory = useAddToFieldHistory('location');
  const clearLocationHistory = useClearFieldHistory('location');
  const { suggestions: popularLocations, isLoading: isLoadingPopular } = useStaticSuggestions(
    'location',
    8,
  );

  const locationFocusSections = useMemo(() => {
    const sections: import('@/components/ui/AutoSuggest').AdditionalSuggestSection[] = [];
    const historyItems = locationHistory?.data?.history ?? [];
    if (user && historyItems.length > 0) {
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
  }, [user, locationHistory, popularLocations, isLoadingPopular, clearLocationHistory]);

  // Close user menu on route change (adjust-state-during-render pattern)
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setUserMenuOpen(false);
    setSearchOpen(false);
  }

  // Close user menu on Escape key
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setUserMenuOpen(false);
      setSearchOpen(false);
    }
  }, []);

  useEffect(() => {
    if (userMenuOpen || searchOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [userMenuOpen, searchOpen, handleEscape]);

  /* The search fields, lifted out VERBATIM so the employer dropdown and the
     candidate inline row render the identical controls with identical logic.
     Only two deltas, both required by the dropdown:
       · the Search button also closes the dropdown after submitting
       · `lg:block` becomes `block` on location/experience, because those were
         hidden on md purely for header width — inside a roomy panel there is
         no reason to hide them.
     `submit()` itself is untouched, so navigation to the find-candidates page
     behaves exactly as before. */
  const searchFields = (inDropdown: boolean) => (
    <>
      <div className={cn('min-w-0 flex-1', !inDropdown && 'lg:max-w-sm')} data-search-field>
        <SearchBar
          placeholder={searchPlaceholder}
          searchType={searchType}
          defaultValue={keyword}
          onSearch={handleSearch}
          onSelect={handleSelect}
          size="lg"
          fullWidth
        />
      </div>
      {/* Field 1 — Location. Hidden until lg in the inline row so md screens
          keep the keyword + button only; always shown in the dropdown. */}
      <div
        className={cn('w-full max-w-[220px]', inDropdown ? 'block' : 'hidden lg:block')}
        data-search-field
      >
        <AutoSuggest
          placeholder="Location"
          value={location}
          onChange={handleLocationChange}
          suggestions={locationOptions}
          isLoading={isLoadingLocations}
          onInputChange={setLocationInput}
          allowCreate
          createLabel={(q) => `Search in "${q}"`}
          minChars={2}
          inputSize="lg"
          additionalSections={locationAdditionalSections}
          focusSections={locationFocusSections}
        />
      </div>
      {/* Field 2 — Experience. Last auto-advance step. */}
      <div
        className={cn('w-36 shrink-0', inDropdown ? 'block' : 'hidden lg:block')}
        data-search-field
      >
        <ExperienceSelect
          value={experience}
          onChange={setExperience}
          size="lg"
          className="w-full"
        />
      </div>
      <Button
        type="button"
        variant="primary"
        size="lg"
        leftIcon={<Search className="h-4 w-4" />}
        onClick={() => {
          submit();
          setSearchOpen(false);
        }}
        tooltip="Search"
      >
        Search
      </Button>
    </>
  );

  // ── Focus chaining (mirrors HeroJobSearchBar) ─────────────────
  // After a value is committed in field N, focus moves to field N+1.
  // Wrapped in a single rAF so the suggestion dropdown can close +
  // React commits the same-tick setState before we move focus —
  // otherwise the dropdown's outside-click handler can steal focus
  // back.
  const focusNextSearchField = useCallback((currentIdx: number) => {
    const el = searchRowRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      const cells = el.querySelectorAll<HTMLElement>('[data-search-field]');
      const next = cells[currentIdx + 1];
      if (!next) return;
      // First focusable inside the next cell — input for SearchBar /
      // AutoSuggest, button for ExperienceSelect's dropdown trigger.
      const focusable =
        next.querySelector<HTMLElement>('input:not([type="hidden"])') ??
        next.querySelector<HTMLElement>('button') ??
        next;
      focusable.focus();
    });
  }, []);

  // ── Submit ────────────────────────────────────────────────────
  // The only place that navigates. Reads current `keyword`,
  // `location`, `experience` state — all three are optional, so
  // hitting Search with just a keyword (or just a location, or
  // nothing) is allowed and routes to the listing page with whatever
  // filters the user provided.
  const submit = useCallback(
    (opts?: { keyword?: string; location?: string }) => {
      if (!user?.role) return;
      const basePath = SEARCH_ROUTES[user.role];
      if (!basePath) return;
      const kw = (opts?.keyword ?? keyword).trim();
      const loc = (opts?.location ?? location).trim();
      const params = new URLSearchParams();
      if (kw) params.set('q', kw);
      if (loc) params.set('location', loc);
      if (experience) {
        if (user.role === 'CANDIDATE') {
          // Job search uses single "experience" string like "3-5" or "12+"
          params.set(
            'experience',
            experience.max != null ? `${experience.min}-${experience.max}` : `${experience.min}+`,
          );
        } else {
          // Candidate search uses separate experienceMin/experienceMax
          params.set('experienceMin', String(experience.min));
          if (experience.max != null) params.set('experienceMax', String(experience.max));
        }
      }
      const qs = params.toString();
      router.push(qs ? `${basePath}?${qs}` : basePath);
    },
    [user, keyword, location, experience, router],
  );

  // ── Field handlers (populate-only, no navigation) ─────────────
  // SearchBar's onSearch fires on Enter; onSelect fires on
  // dropdown selection. Both used to call navigateToSearch and
  // jump to /jobs immediately, which meant the user couldn't add
  // location/experience filters before searching. Now they only
  // commit the chosen keyword and advance focus to the next cell;
  // the user clicks Search to actually navigate.
  const handleSearch = useCallback(
    (query: string) => {
      setKeyword(query);
      focusNextSearchField(0);
    },
    [focusNextSearchField],
  );

  const handleSelect = useCallback(
    (item: AutocompleteResult) => {
      setKeyword(item.text);
      focusNextSearchField(0);
    },
    [focusNextSearchField],
  );

  const handleLocationChange = useCallback(
    (value: string | string[]) => {
      const loc = typeof value === 'string' ? value : value[0] || '';
      setLocation(loc);
      if (loc) {
        addLocationHistory.mutate(loc);
        // Auto-advance to the experience field only when the user
        // actually picked a value — clearing via backspace / X-button
        // shouldn't yank focus forward. AutoSuggest's onChange fires
        // on selection or Enter-with-allowCreate, not on every
        // keystroke, so this is safe.
        focusNextSearchField(1);
      }
    },
    [addLocationHistory, focusNextSearchField],
  );

  const openCommandPalette = () => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }),
    );
  };

  if (!user) return null;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[var(--border)] bg-white">
      <div className="flex h-20 items-center gap-3 px-4">
        {/* Left section */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Mobile sidebar toggle */}
          <Tooltip content="Open sidebar">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] lg:hidden"
              aria-label="Open sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>
          </Tooltip>

          <Logo size="md" href={dashboardPath} />
        </div>

        {/* Center — Search section.
            Same submit-only behaviour as the homepage HeroJobSearchBar:
            typing or picking a suggestion ONLY populates the keyword
            field (does NOT navigate). The user is then free to choose
            a location and experience and only navigates when they
            click the Search button. Location + experience remain
            optional — the button works with any subset of the three
            fields filled in. Mirrors `HeroJobSearchBar.tsx`. */}
        {hasSearchPage ? (
          isEmployer ? (
            /* EMPLOYER — "Find candidates" is NOT here. It lives in the
               right-hand cluster beside the add-on shortcuts, because centred it
               read as belonging to neither side of the header. All this branch
               does is hold the space that keeps that cluster right-aligned. */
            <div className="hidden min-w-0 flex-1 md:block" />
          ) : (
            /* CANDIDATE — untouched inline row. */
            <div
              ref={searchRowRef}
              className="hidden min-w-0 flex-1 items-center justify-center gap-2 px-6 md:flex"
            >
              {searchFields(false)}
            </div>
          )
        ) : (
          <div className="hidden min-w-0 flex-1 px-6 md:block">
            {/* Ctrl+K trigger for admin/super-admin */}
            <Tooltip content="Open command palette (Ctrl+K)">
              <button
                onClick={openCommandPalette}
                className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2.5 text-sm text-[var(--text-muted)] transition-colors hover:border-[var(--text-muted)] hover:bg-white"
              >
                <Search className="h-4 w-4" />
                <span className="hidden lg:inline">Search...</span>
                <kbd className="ml-4 hidden rounded border border-[var(--border)] bg-white px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)] lg:inline-flex">
                  Ctrl K
                </kbd>
              </button>
            </Tooltip>
          </div>
        )}

        {/* Spacer for mobile */}
        <div className="flex-1 md:hidden" />

        {/* Right section */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {/* Mobile search icon — navigates to search page */}
          {hasSearchPage && (
            <Tooltip content="Search">
              <button
                onClick={() => router.push(SEARCH_ROUTES[user.role] || '/')}
                className="rounded-lg p-2.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] md:hidden"
                aria-label="Search"
              >
                <Search className="h-5 w-5" />
              </button>
            </Tooltip>
          )}

          {/* EMPLOYER — the candidate search, collapsed behind a button and
              sitting immediately left of the add-on shortcuts. The panel renders
              `searchFields(true)`, i.e. the identical controls and the identical
              submit(), so behaviour is unchanged; only its position differs.
              `md:block` mirrors the old centred wrapper — below that the mobile
              search icon above already covers this role. */}
          {hasSearchPage && isEmployer && (
            <div ref={searchDropdownRef} className="relative hidden md:block">
              <Tooltip content="Find candidates">
                <button
                  type="button"
                  onClick={() => setSearchOpen((v) => !v)}
                  aria-expanded={searchOpen}
                  aria-haspopup="dialog"
                  className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2.5 text-sm text-[var(--text-muted)] transition-colors hover:border-[var(--text-muted)] hover:bg-white"
                >
                  <Search className="h-4 w-4" />
                  <span>Find candidates</span>
                  <ChevronDown
                    className={cn('h-4 w-4 transition-transform', searchOpen && 'rotate-180')}
                  />
                </button>
              </Tooltip>
              {searchOpen && (
                <div
                  ref={searchRowRef}
                  role="dialog"
                  aria-label="Find candidates"
                  /* Anchored to the button's RIGHT edge, not centred on it. The
                     old `left-1/2 -translate-x-1/2` was safe mid-header; this
                     close to the right edge it would push a 26rem panel
                     off-screen. */
                  className="animate-scale-in absolute top-full right-0 z-50 mt-2 flex w-[min(90vw,26rem)] flex-col gap-3 rounded-2xl border border-[var(--border)] bg-white p-4 shadow-xl"
                >
                  {searchFields(true)}
                </div>
              )}
            </div>
          )}

          {/* Employer-only add-on shortcuts, beside the plan/quota badges. Not
              rendered for candidates or admins. */}
          {isEmployer && <EmployerQuickActions />}

          {/* Persistent quota bar — only for paying roles, hidden on small screens */}
          {(user.role === 'CANDIDATE' || user.role === 'EMPLOYER') && (
            <div className="hidden items-center gap-2 lg:flex">
              <QuotaBar
                units={
                  user.role === 'EMPLOYER' ? ['JOB_POST', 'CV_UNLOCK'] : ['MATCHED_PROFILE_EMAIL']
                }
              />
            </div>
          )}

          {/* Billing-state alert (expiring/no-plan/failed-renewal) */}
          {(user.role === 'CANDIDATE' || user.role === 'EMPLOYER') && <BillingAlertBadge />}

          {/* WhatsApp Online/Away status (super-admin only; self-gates) */}
          <AwayToggle />

          <NotificationBell />

          {/* User menu */}
          <div ref={userMenuRef} className="relative">
            <Tooltip content="Open user menu">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 rounded-lg p-2 transition-colors hover:bg-[var(--bg-secondary)]"
                aria-expanded={userMenuOpen}
                aria-haspopup="true"
              >
                {companyLogo && (
                  <img
                    src={companyLogo}
                    alt="Company"
                    loading="lazy"
                    className="h-10 w-10 rounded-md border border-[var(--border)] object-contain"
                  />
                )}
                <AvatarWithVerified>
                  <Avatar
                    src={user.avatar}
                    firstName={user.firstName}
                    lastName={user.lastName}
                    size="md"
                  />
                </AvatarWithVerified>
                <div className="hidden items-center gap-2 xl:flex">
                  <span className="text-sm font-medium text-[var(--text)]">{user.firstName}</span>
                  <Badge variant={ROLE_BADGE_VARIANT[user.role] || 'info'} size="sm">
                    {ROLE_LABELS[user.role] || user.role}
                  </Badge>
                </div>
                <ChevronDown
                  className={cn(
                    'hidden h-4 w-4 text-[var(--text-muted)] transition-transform sm:block',
                    userMenuOpen && 'rotate-180',
                  )}
                />
              </button>
            </Tooltip>

            {userMenuOpen && (
              <div className="animate-scale-in absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-lg">
                {/* User info */}
                <div className="border-b border-[var(--border)] px-4 py-3">
                  <p className="text-sm font-medium text-[var(--text)]">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">{user.email}</p>
                  <Badge
                    variant={ROLE_BADGE_VARIANT[user.role] || 'info'}
                    size="sm"
                    className="mt-1.5"
                  >
                    {ROLE_LABELS[user.role] || user.role}
                  </Badge>
                </div>

                {/* View Public Profile — candidates & employers only */}
                {(user.role === 'CANDIDATE' || user.role === 'EMPLOYER') && (
                  <Link
                    href={
                      user.role === 'CANDIDATE'
                        ? ROUTES.CANDIDATE.PROFILE_PREVIEW
                        : ROUTES.EMPLOYER.PROFILE
                    }
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <ExternalLink className="h-4 w-4" />
                    View Public Profile
                  </Link>
                )}

                {/* Keyboard Shortcuts */}
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    openCommandPalette();
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
                >
                  <Keyboard className="h-4 w-4" />
                  <span className="flex-1 text-left">Keyboard Shortcuts</span>
                  <kbd className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
                    Ctrl K
                  </kbd>
                </button>

                {/* Visit Homepage — explicit opt-out from the
                      auth → dashboard auto-redirect that fires on `/`.
                      The `?stayhome=1` flag is honoured by both the
                      middleware (proxy.ts) and AuthHomeRedirect; any
                      OTHER navigation to `/` still routes logged-in
                      users to their dashboard as designed.
                      AuthHomeRedirect strips the query param after
                      first paint so it doesn't linger in the URL bar
                      or get shared. */}
                <Link
                  href={`${ROUTES.PUBLIC.HOME}?stayhome=1`}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <Home className="h-4 w-4" />
                  Visit Homepage
                </Link>

                <div className="border-t border-[var(--border)]">
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      logout();
                    }}
                    className="text-error hover:bg-error-light flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
