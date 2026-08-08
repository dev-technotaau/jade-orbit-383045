'use client';

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  X,
  Clock,
  TrendingUp,
  Briefcase,
  MapPin,
  Building2,
  Sparkles,
  Trash2,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useAutocomplete,
  useSearchHistory,
  usePopularSearches,
  useAddToSearchHistory,
  useClearSearchHistory,
} from '@/hooks/use-search';
import { useSuggest } from '@/hooks/use-suggestions';
import { usePopoverPlacement } from '@/hooks/use-popover-placement';
import { useAuthStore } from '@/store/auth.store';
import Spinner from '@/components/ui/Spinner';
import type { AutocompleteResult, SuggestionType } from '@/types/search';

/* ---------- types ---------- */

interface SearchBarProps {
  placeholder?: string;
  searchType?: 'jobs' | 'candidates' | 'all';
  /** Initial query value */
  defaultValue?: string;
  /** Called when user submits a search (enter key or click) */
  onSearch?: (query: string) => void;
  /** Called when suggestion is selected */
  onSelect?: (item: AutocompleteResult) => void;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Full-width mode (e.g., for hero sections) */
  fullWidth?: boolean;
  /** Show search type tabs */
  showTypeTabs?: boolean;
  /** Additional className */
  className?: string;
  /** Auto-focus on mount */
  autoFocus?: boolean;
}

/* ---------- constants ---------- */

const TYPE_ICONS: Record<SuggestionType, typeof Briefcase> = {
  job_title: Briefcase,
  skill: Sparkles,
  company: Building2,
  location: MapPin,
};

const TYPE_LABELS: Record<SuggestionType, string> = {
  job_title: 'Job Title',
  skill: 'Skill',
  company: 'Company',
  location: 'Location',
};

const SIZE_STYLES = {
  sm: {
    input: 'h-9 text-sm pl-9 pr-8',
    icon: 'left-2.5 h-4 w-4',
    clear: 'right-2 h-4 w-4',
    dropdown: 'text-sm',
  },
  md: {
    input: 'h-11 text-sm pl-10 pr-9',
    icon: 'left-3 h-4.5 w-4.5',
    clear: 'right-2.5 h-4 w-4',
    dropdown: 'text-sm',
  },
  lg: {
    // h-12 (48 px) matches Button lg so SearchBar lines up cleanly with
    // the Search button + ExperienceSelect lg + AutoSuggest lg.
    input: 'h-12 text-base pl-11 pr-10',
    icon: 'left-3 h-5 w-5',
    clear: 'right-3 h-5 w-5',
    dropdown: 'text-base',
  },
};

/* ---------- component ---------- */

export default function SearchBar({
  placeholder = 'Search jobs, skills, companies...',
  searchType = 'all',
  defaultValue = '',
  onSearch,
  onSelect,
  size = 'md',
  fullWidth = false,
  showTypeTabs = false,
  className,
  autoFocus = false,
}: SearchBarProps) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  /* ---- state ---- */
  const [query, setQuery] = useState(defaultValue);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [activeType, setActiveType] = useState(searchType);

  /* ---- refs ---- */
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  /* ---- a11y: unique listbox id ----
     Per-instance id so multiple SearchBars on the same page don't
     collide (the public job listing shell + hero search both render
     on /jobs, for example). `aria-controls` / `aria-owns` reference
     this id but ONLY when the dropdown is actually in the DOM —
     axe-core / Lighthouse flag aria-* attributes that point at a
     non-existent target ("[aria-*] attributes do not have valid
     values"). */
  const reactId = useId();
  const listboxId = `search-listbox-${reactId.replace(/[:]/g, '')}`;
  // max-h-[400px] + padding — flip upward when there's not enough room below
  const dropdownPlacement = usePopoverPlacement(containerRef, isOpen, 420);

  /* ---- queries ---- */
  const { data: autocompleteData, isLoading: isLoadingAutocomplete } = useAutocomplete(
    debouncedQuery,
    activeType,
  );
  const { data: historyData } = useSearchHistory();
  const { data: popularData } = usePopularSearches();
  const addToHistory = useAddToSearchHistory();
  const clearHistory = useClearSearchHistory();

  const suggestions = autocompleteData?.data?.suggestions ?? [];
  const history = historyData?.data?.history ?? [];
  const popular = popularData?.data?.searches ?? [];

  /* ---- seeded suggestions from suggestions index ---- */
  const { suggestions: seedSkills, isLoading: isLoadingSeedSkills } = useSuggest({
    category: 'skill',
    query: debouncedQuery,
    limit: 5,
    minChars: 2,
  });
  const { suggestions: seedJobTitles, isLoading: isLoadingSeedTitles } = useSuggest({
    category: 'job_title',
    query: debouncedQuery,
    limit: 5,
    minChars: 2,
  });
  const isLoadingSeedSuggestions = isLoadingSeedSkills || isLoadingSeedTitles;

  const seededSuggestions = useMemo(() => {
    if (debouncedQuery.length < 2) return [];
    const existingTexts = new Set(suggestions.map((s) => s.text.toLowerCase()));
    const items: { text: string; category: string }[] = [];
    for (const s of seedJobTitles) {
      if (!existingTexts.has(s.toLowerCase())) items.push({ text: s, category: 'job_title' });
    }
    for (const s of seedSkills) {
      if (!existingTexts.has(s.toLowerCase())) items.push({ text: s, category: 'skill' });
    }
    return items.slice(0, 8);
  }, [debouncedQuery, suggestions, seedJobTitles, seedSkills]);

  /* ---- build flat list of navigable items ---- */
  const getNavigableItems = useCallback((): Array<{
    id: string;
    label: string;
    type: 'suggestion' | 'history' | 'popular' | 'seeded';
    data?: AutocompleteResult;
  }> => {
    const items: Array<{
      id: string;
      label: string;
      type: 'suggestion' | 'history' | 'popular' | 'seeded';
      data?: AutocompleteResult;
    }> = [];

    if (debouncedQuery.length >= 2) {
      suggestions.forEach((s, i) => {
        items.push({
          id: `suggestion-${i}`,
          label: s.text,
          type: 'suggestion',
          data: s,
        });
      });
      seededSuggestions.forEach((s, i) => {
        items.push({ id: `seeded-${i}`, label: s.text, type: 'seeded' });
      });
    } else if (!debouncedQuery) {
      // Show history first, then popular
      if (isAuthenticated && history.length > 0) {
        history.slice(0, 5).forEach((h, i) => {
          items.push({ id: `history-${i}`, label: h.query, type: 'history' });
        });
      }
      if (popular.length > 0) {
        popular.slice(0, 5).forEach((p, i) => {
          items.push({ id: `popular-${i}`, label: p.query, type: 'popular' });
        });
      }
    }

    return items;
  }, [debouncedQuery, suggestions, seededSuggestions, isAuthenticated, history, popular]);

  const navigableItems = getNavigableItems();

  /* ---- debounced query update ---- */
  const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setActiveIndex(-1);

    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(value.trim());
    }, 250);
  }, []);

  /* ---- submit ---- */
  const handleSubmit = useCallback(
    (searchQuery: string) => {
      const trimmed = searchQuery.trim();
      if (!trimmed) return;

      setIsOpen(false);
      setQuery(trimmed);
      setDebouncedQuery('');
      inputRef.current?.blur();

      // Add to search history
      if (isAuthenticated) {
        addToHistory.mutate({
          query: trimmed,
          type: activeType === 'candidates' ? 'candidate' : 'job',
        });
      }

      if (onSearch) {
        onSearch(trimmed);
      }
    },
    [isAuthenticated, addToHistory, activeType, onSearch],
  );

  /* ---- selection ---- */
  const handleSelectSuggestion = useCallback(
    (item: AutocompleteResult) => {
      setQuery(item.text);
      setIsOpen(false);
      setDebouncedQuery('');
      inputRef.current?.blur();

      if (isAuthenticated) {
        addToHistory.mutate({
          query: item.text,
          type: activeType === 'candidates' ? 'candidate' : 'job',
        });
      }

      if (onSelect) {
        onSelect(item);
      } else if (onSearch) {
        onSearch(item.text);
      }
    },
    [isAuthenticated, addToHistory, activeType, onSelect, onSearch],
  );

  const handleSelectItem = useCallback(
    (item: (typeof navigableItems)[number]) => {
      if (item.type === 'suggestion' && item.data) {
        handleSelectSuggestion(item.data);
      } else {
        handleSubmit(item.label);
      }
    },
    [handleSelectSuggestion, handleSubmit],
  );

  /* ---- keyboard navigation ---- */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen && e.key !== 'Escape') {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          setIsOpen(true);
          return;
        }
      }

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          const nextIndex = activeIndex < navigableItems.length - 1 ? activeIndex + 1 : 0;
          setActiveIndex(nextIndex);
          itemRefs.current[nextIndex]?.scrollIntoView({
            block: 'nearest',
          });
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const prevIndex = activeIndex > 0 ? activeIndex - 1 : navigableItems.length - 1;
          setActiveIndex(prevIndex);
          itemRefs.current[prevIndex]?.scrollIntoView({
            block: 'nearest',
          });
          break;
        }
        case 'Enter': {
          e.preventDefault();
          if (activeIndex >= 0 && navigableItems[activeIndex]) {
            handleSelectItem(navigableItems[activeIndex]);
          } else {
            handleSubmit(query);
          }
          break;
        }
        case 'Escape': {
          e.preventDefault();
          setIsOpen(false);
          setActiveIndex(-1);
          inputRef.current?.blur();
          break;
        }
        case 'Tab': {
          setIsOpen(false);
          setActiveIndex(-1);
          break;
        }
      }
    },
    [isOpen, activeIndex, navigableItems, handleSelectItem, handleSubmit, query],
  );

  /* ---- clear ---- */
  const handleClear = useCallback(() => {
    setQuery('');
    setDebouncedQuery('');
    setActiveIndex(-1);
    inputRef.current?.focus();
    onSearch?.('');
  }, [onSearch]);

  /* ---- click outside ---- */
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        inputRef.current &&
        !inputRef.current.contains(target)
      ) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /* ---- reset refs array on item count change ---- */
  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, navigableItems.length);
  }, [navigableItems.length]);

  /* ---- cleanup debounce ---- */
  useEffect(() => {
    return () => clearTimeout(debounceTimerRef.current);
  }, []);

  /* ---- sync defaultValue ---- */
  useEffect(() => {
    setQuery(defaultValue);
  }, [defaultValue]);

  const styles = SIZE_STYLES[size];
  const showDropdown =
    isOpen && (navigableItems.length > 0 || isLoadingAutocomplete || isLoadingSeedSuggestions);

  /* ---- grouped suggestions for rendering ---- */
  const groupedSuggestions = suggestions.reduce<Record<SuggestionType, AutocompleteResult[]>>(
    (acc, s) => {
      if (!acc[s.type]) acc[s.type] = [];
      acc[s.type].push(s);
      return acc;
    },
    {} as Record<SuggestionType, AutocompleteResult[]>,
  );

  /* ---- get flat index for a given section item ---- */
  let flatIndexCounter = 0;

  return (
    <div
      ref={containerRef}
      className={cn('relative', fullWidth ? 'w-full' : 'w-full max-w-2xl', className)}
      role="combobox"
      aria-expanded={showDropdown}
      aria-haspopup="listbox"
      aria-owns={showDropdown ? listboxId : undefined}
    >
      {/* Type tabs */}
      {showTypeTabs && (
        <div className="mb-2 flex gap-1">
          {(['all', 'jobs', 'candidates'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setActiveType(t);
                setDebouncedQuery(query.trim());
              }}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                activeType === t
                  ? 'bg-primary text-white'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border)]',
              )}
            >
              {t === 'all' ? 'All' : t === 'jobs' ? 'Jobs' : 'Candidates'}
            </button>
          ))}
        </div>
      )}

      {/* Input field */}
      <div className="relative">
        <Search
          className={cn(
            'pointer-events-none absolute top-1/2 -translate-y-1/2 text-[var(--text-muted)]',
            styles.icon,
          )}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          role="searchbox"
          aria-autocomplete="list"
          aria-controls={showDropdown ? listboxId : undefined}
          aria-activedescendant={
            showDropdown && activeIndex >= 0 ? navigableItems[activeIndex]?.id : undefined
          }
          className={cn(
            // rounded-lg matches Button + AutoSuggest + ExperienceSelect for
            // a uniform corner radius across every search-row element.
            'w-full rounded-lg border border-[var(--border)] bg-white text-[var(--text)]',
            'transition-all duration-200 placeholder:text-[var(--text-muted)]',
            'focus:border-primary focus:ring-primary/20 focus:ring-2 focus:outline-none',
            'hover:border-[var(--text-muted)]',
            styles.input,
          )}
        />

        {/* Clear / loading indicator */}
        <div className="absolute top-1/2 right-0 flex -translate-y-1/2 items-center gap-1 pr-2.5">
          {isLoadingAutocomplete && debouncedQuery.length >= 2 && <Spinner size="sm" />}
          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded-full p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-secondary)]"
              aria-label="Clear search"
            >
              <X className={styles.clear} />
            </button>
          )}
        </div>
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div
          ref={dropdownRef}
          id={listboxId}
          role="listbox"
          data-lenis-prevent
          className={cn(
            'absolute right-0 left-0 z-50',
            'max-h-[400px] overflow-y-auto overscroll-contain',
            'rounded-xl border border-[var(--border)] bg-white shadow-lg',
            'animate-slide-down',
            dropdownPlacement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1',
            styles.dropdown,
          )}
        >
          {/* Loading state */}
          {isLoadingAutocomplete &&
            debouncedQuery.length >= 2 &&
            suggestions.length === 0 &&
            seededSuggestions.length === 0 && (
              <div className="flex items-center justify-center gap-2 p-4 text-[var(--text-muted)]">
                <Spinner size="sm" />
                <span>Searching...</span>
              </div>
            )}

          {/* Autocomplete + seeded suggestions */}
          {debouncedQuery.length >= 2 &&
            (suggestions.length > 0 ||
              seededSuggestions.length > 0 ||
              isLoadingSeedSuggestions) && (
              <div className="py-1">
                {/* Autocomplete suggestions (grouped by type) */}
                {suggestions.length > 0 &&
                  (
                    Object.entries(groupedSuggestions) as [SuggestionType, AutocompleteResult[]][]
                  ).map(([type, items]) => {
                    const Icon = TYPE_ICONS[type];
                    return (
                      <div key={type}>
                        <div className="px-3 py-1.5 text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
                          {TYPE_LABELS[type]}
                        </div>
                        {items.map((item) => {
                          const idx = flatIndexCounter++;
                          return (
                            <button
                              key={`${type}-${item.text}`}
                              ref={(el) => {
                                itemRefs.current[idx] = el;
                              }}
                              id={navigableItems[idx]?.id}
                              role="option"
                              aria-selected={activeIndex === idx}
                              onClick={() => handleSelectSuggestion(item)}
                              onMouseEnter={() => setActiveIndex(idx)}
                              className={cn(
                                'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                                activeIndex === idx
                                  ? 'text-primary bg-[var(--primary-light)]'
                                  : 'text-[var(--text)] hover:bg-[var(--bg-secondary)]',
                              )}
                            >
                              <Icon className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                              <span className="flex-1 truncate">
                                <HighlightMatch text={item.text} query={debouncedQuery} />
                              </span>
                              {item.count !== undefined && item.count > 0 && (
                                <span className="shrink-0 text-xs text-[var(--text-muted)]">
                                  {item.count.toLocaleString()}
                                </span>
                              )}
                              <ArrowRight className="h-3 w-3 shrink-0 text-[var(--text-muted)] opacity-0 group-hover:opacity-100" />
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}

                {/* Seeded suggestions section */}
                {(seededSuggestions.length > 0 || isLoadingSeedSuggestions) && (
                  <div>
                    <div className="border-t border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
                      Suggestions
                    </div>
                    {isLoadingSeedSuggestions && seededSuggestions.length === 0 && (
                      <div className="flex items-center justify-center gap-2 p-2 text-xs text-[var(--text-muted)]">
                        <Spinner size="sm" />
                        <span>Loading...</span>
                      </div>
                    )}
                    {seededSuggestions.map((item) => {
                      const idx = flatIndexCounter++;
                      const Icon = item.category === 'skill' ? Sparkles : Briefcase;
                      return (
                        <button
                          key={`seeded-${item.text}`}
                          ref={(el) => {
                            itemRefs.current[idx] = el;
                          }}
                          id={navigableItems[idx]?.id}
                          role="option"
                          aria-selected={activeIndex === idx}
                          onClick={() => handleSubmit(item.text)}
                          onMouseEnter={() => setActiveIndex(idx)}
                          className={cn(
                            'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                            activeIndex === idx
                              ? 'text-primary bg-[var(--primary-light)]'
                              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]',
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                          <span className="flex-1 truncate">
                            <HighlightMatch text={item.text} query={debouncedQuery} />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Search for full query */}
                <div className="border-t border-[var(--border)] px-3 py-2">
                  <button
                    type="button"
                    onClick={() => handleSubmit(query)}
                    className="text-primary flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-[var(--primary-light)]"
                  >
                    <Search className="h-4 w-4" />
                    <span>
                      Search for &quot;<span className="font-medium">{query}</span>&quot;
                    </span>
                  </button>
                </div>
              </div>
            )}

          {/* Empty state: show history + popular */}
          {!debouncedQuery && (
            <div className="py-1">
              {/* Recent searches */}
              {isAuthenticated && history.length > 0 && (
                <div>
                  <div className="flex items-center justify-between px-3 py-1.5">
                    <span className="text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
                      Recent Searches
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearHistory.mutate();
                      }}
                      className="hover:text-error flex items-center gap-1 text-[11px] text-[var(--text-muted)] transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                      Clear
                    </button>
                  </div>
                  {history.slice(0, 5).map((h, i) => {
                    const idx = flatIndexCounter++;
                    return (
                      <button
                        key={`history-${h.query}`}
                        ref={(el) => {
                          itemRefs.current[idx] = el;
                        }}
                        id={navigableItems[idx]?.id}
                        role="option"
                        aria-selected={activeIndex === idx}
                        onClick={() => handleSubmit(h.query)}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={cn(
                          'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                          activeIndex === idx
                            ? 'text-primary bg-[var(--primary-light)]'
                            : 'text-[var(--text)] hover:bg-[var(--bg-secondary)]',
                        )}
                      >
                        <Clock className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                        <span className="flex-1 truncate">{h.query}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Popular searches */}
              {popular.length > 0 && (
                <div>
                  {isAuthenticated && history.length > 0 && (
                    <div className="mx-3 border-t border-[var(--border)]" />
                  )}
                  <div className="px-3 py-1.5 text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
                    Trending Searches
                  </div>
                  {popular.slice(0, 5).map((p, i) => {
                    const idx = flatIndexCounter++;
                    return (
                      <button
                        key={`popular-${p.query}`}
                        ref={(el) => {
                          itemRefs.current[idx] = el;
                        }}
                        id={navigableItems[idx]?.id}
                        role="option"
                        aria-selected={activeIndex === idx}
                        onClick={() => handleSubmit(p.query)}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={cn(
                          'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                          activeIndex === idx
                            ? 'text-primary bg-[var(--primary-light)]'
                            : 'text-[var(--text)] hover:bg-[var(--bg-secondary)]',
                        )}
                      >
                        <TrendingUp className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                        <span className="flex-1 truncate">{p.query}</span>
                        {p.count > 0 && (
                          <span className="shrink-0 text-xs text-[var(--text-muted)]">
                            {p.count.toLocaleString()} searches
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* No results */}
          {debouncedQuery.length >= 2 &&
            !isLoadingAutocomplete &&
            !isLoadingSeedSuggestions &&
            suggestions.length === 0 &&
            seededSuggestions.length === 0 && (
              <div className="p-4 text-center text-sm text-[var(--text-muted)]">
                No suggestions found for &quot;{debouncedQuery}&quot;
              </div>
            )}

          {/* Keyboard hint */}
          <div className="flex items-center gap-3 border-t border-[var(--border)] px-3 py-1.5 text-[11px] text-[var(--text-muted)]">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] px-1 py-0.5 font-mono text-[10px]">
                ↑↓
              </kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] px-1 py-0.5 font-mono text-[10px]">
                ↵
              </kbd>
              select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] px-1 py-0.5 font-mono text-[10px]">
                esc
              </kbd>
              close
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- helper: highlight match ---------- */

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) return <>{text}</>;

  const before = text.slice(0, index);
  const match = text.slice(index, index + query.length);
  const after = text.slice(index + query.length);

  return (
    <>
      {before}
      <span className="text-primary font-semibold">{match}</span>
      {after}
    </>
  );
}
