'use client';

/**
 * Horizontal carousel of recent search chips.
 *
 * Surfaces:
 *   - Homepage hero (below the search bar).
 *   - Public listing page (above the results list).
 *   - Candidate dashboard recent-searches widget.
 *
 * Modalities:
 *   - Mouse drag to scroll (mousedown + mousemove).
 *   - Touch swipe (native browser horizontal scroll on touch devices).
 *   - Mouse wheel — vertical wheel converts to horizontal scroll.
 *   - Keyboard — left/right arrow keys when the carousel is focused.
 *
 * Each chip shows the canonical search label + a "+N new" delta badge
 * that pulses for 5s when first rendered. Click navigates back to the
 * search; long-press / right-click reveals a dismiss button.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSearchHistory } from '@/hooks/use-search-history';
import type { SearchHistoryEntry, SearchHistoryType } from '@/services/search-history.service';

interface Props {
  /** Search domain — drives both the API call and the chip click destination. */
  type?: SearchHistoryType;
  /** Override the click destination prefix. Default: /jobs (or /companies if type=COMPANY). */
  destination?: string;
  /** Optional Tailwind classes for the wrapper. */
  className?: string;
  /** Optional title shown above the carousel. */
  title?: string;
  /** Empty-state copy when there are no chips. */
  emptyText?: string;
  /** Hide entirely when empty (instead of showing emptyText). */
  hideWhenEmpty?: boolean;
}

const SCROLL_STEP_PX = 240;

/**
 * Build the canonical chip-label string from a history row. We aim for
 * a one-line, scan-friendly summary: "Web Developer · Noida · 3+ yrs".
 */
function chipLabel(entry: SearchHistoryEntry): string {
  const parts: string[] = [];
  if (entry.query) parts.push(entry.query);
  if (entry.location) parts.push(entry.location);
  const filters = entry.filters as Record<string, unknown>;
  if (filters.experienceMin != null && filters.experienceMin !== '') {
    parts.push(`${filters.experienceMin}+ yrs`);
  } else if (filters.experience) {
    parts.push(`${filters.experience} yrs`);
  }
  if (filters.skills && typeof filters.skills === 'string') {
    parts.push(filters.skills.split(',').slice(0, 2).join(', '));
  }
  return parts.length > 0 ? parts.join(' · ') : 'Recent search';
}

/**
 * Build the destination URL for a chip. Re-applies the saved filters
 * to the listing page query string so users land back on the same
 * search.
 */
function chipHref(entry: SearchHistoryEntry, basePath: string): string {
  const params = new URLSearchParams();
  if (entry.query) params.set('q', entry.query);
  if (entry.location) params.set('location', entry.location);
  const filters = entry.filters as Record<string, unknown>;
  for (const [key, value] of Object.entries(filters)) {
    if (value == null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export default function JobSearchHistoryChips({
  type = 'JOB',
  destination,
  className,
  title,
  emptyText = 'Your recent searches will appear here.',
  hideWhenEmpty = false,
}: Props) {
  const router = useRouter();
  const { items, isLoading, remove } = useSearchHistory(type, 12);

  const basePath = destination ?? (type === 'COMPANY' ? '/companies' : '/jobs');

  const carouselRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({ dragging: false, startX: 0, scrollLeft: 0 });

  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);
  const [showAll, setShowAll] = useState(false);

  /**
   * "+N new" badges pulse for 5s after first appearing — per Phase 12
   * of the master plan. Track which (entryId, newCount) pairs are
   * "fresh" and clear after 5s. The newCount counter on a row
   * incrementing past its previous value triggers a re-pulse.
   */
  const seenCountsRef = useRef<Map<string, number>>(new Map());
  const [pulsingIds, setPulsingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!items || items.length === 0) return;
    const fresh = new Set<string>();
    const seen = seenCountsRef.current;
    for (const entry of items) {
      if (entry.newCount > 0) {
        const prev = seen.get(entry.id) ?? 0;
        if (entry.newCount > prev) {
          fresh.add(entry.id);
        }
        seen.set(entry.id, entry.newCount);
      } else {
        seen.delete(entry.id);
      }
    }
    if (fresh.size === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPulsingIds((prev) => new Set([...prev, ...fresh]));
    const t = window.setTimeout(() => {
      setPulsingIds((prev) => {
        const next = new Set(prev);
        for (const id of fresh) next.delete(id);
        return next;
      });
    }, 5_000);
    return () => window.clearTimeout(t);
  }, [items]);

  const updateScrollHints = () => {
    const el = carouselRef.current;
    if (!el) return;
    setShowLeft(el.scrollLeft > 4);
    setShowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateScrollHints();
    const el = carouselRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollHints, { passive: true });
    window.addEventListener('resize', updateScrollHints);
    return () => {
      el.removeEventListener('scroll', updateScrollHints);
      window.removeEventListener('resize', updateScrollHints);
    };
  }, [items.length]);

  // Mouse drag-to-scroll.
  const onMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    const el = carouselRef.current;
    if (!el) return;
    dragState.current = {
      dragging: true,
      startX: e.pageX - el.offsetLeft,
      scrollLeft: el.scrollLeft,
    };
    el.style.cursor = 'grabbing';
  };
  const endDrag = () => {
    const el = carouselRef.current;
    if (!el) return;
    dragState.current.dragging = false;
    el.style.cursor = '';
  };
  const onMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!dragState.current.dragging) return;
    const el = carouselRef.current;
    if (!el) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    const walk = (x - dragState.current.startX) * 1.5;
    el.scrollLeft = dragState.current.scrollLeft - walk;
  };

  // Convert vertical wheel to horizontal scroll for non-trackpad mice.
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    const el = carouselRef.current;
    if (!el) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollLeft += e.deltaY;
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = carouselRef.current;
    if (!el) return;
    if (e.key === 'ArrowRight') {
      el.scrollLeft += SCROLL_STEP_PX;
      e.preventDefault();
    } else if (e.key === 'ArrowLeft') {
      el.scrollLeft -= SCROLL_STEP_PX;
      e.preventDefault();
    }
  };

  const scrollBy = (delta: number) => {
    const el = carouselRef.current;
    if (!el) return;
    el.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const computedItems = useMemo(() => items, [items]);

  if (isLoading) {
    return (
      <div className={`flex gap-2 overflow-hidden py-2 ${className ?? ''}`} aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-9 w-32 shrink-0 animate-pulse rounded-full bg-[var(--bg-secondary)]"
          />
        ))}
      </div>
    );
  }

  if (computedItems.length === 0) {
    if (hideWhenEmpty) return null;
    return <p className={`text-xs text-[var(--text-muted)] ${className ?? ''}`}>{emptyText}</p>;
  }

  return (
    <section className={className} aria-label="Recent searches">
      {title && (
        <h3 className="mb-2 text-xs font-semibold tracking-wider text-[var(--text-muted)] uppercase">
          {title}
        </h3>
      )}
      <div className="relative">
        {showLeft && (
          <button
            type="button"
            aria-label="Scroll left"
            onClick={() => scrollBy(-SCROLL_STEP_PX)}
            className="absolute top-1/2 left-0 z-10 hidden -translate-x-2 -translate-y-1/2 rounded-full border border-[var(--border)] bg-white p-1.5 shadow-md hover:bg-[var(--bg-secondary)] sm:block"
          >
            <ChevronLeft className="h-4 w-4 text-[var(--text-secondary)]" />
          </button>
        )}
        {showRight && (
          <button
            type="button"
            aria-label="Scroll right"
            onClick={() => scrollBy(SCROLL_STEP_PX)}
            className="absolute top-1/2 right-0 z-10 hidden translate-x-2 -translate-y-1/2 rounded-full border border-[var(--border)] bg-white p-1.5 shadow-md hover:bg-[var(--bg-secondary)] sm:block"
          >
            <ChevronRight className="h-4 w-4 text-[var(--text-secondary)]" />
          </button>
        )}
        <div
          ref={carouselRef}
          tabIndex={0}
          role="list"
          onMouseDown={onMouseDown}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          onMouseMove={onMouseMove}
          onWheel={onWheel}
          onKeyDown={onKeyDown}
          className="scrollbar-hide -mx-1 flex gap-2 overflow-x-auto scroll-smooth px-1 py-1 select-none focus:outline-none"
          style={{ cursor: 'grab' }}
        >
          {computedItems.map((entry) => (
            <div
              key={entry.id}
              role="listitem"
              className="group relative flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] bg-white py-1.5 pr-1.5 pl-3 text-sm shadow-sm transition-colors hover:border-[var(--primary)]/40 hover:bg-[var(--bg-secondary)]"
            >
              <button
                type="button"
                onClick={() => router.push(chipHref(entry, basePath))}
                className="flex items-center gap-2 text-left text-[var(--text)]"
              >
                <Search className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                <span className="max-w-[180px] truncate font-medium">{chipLabel(entry)}</span>
                {entry.newCount > 0 && (
                  <span
                    className={`bg-primary inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white ${
                      pulsingIds.has(entry.id) ? 'animate-pulse' : ''
                    }`}
                    aria-label={`${entry.newCount} new since you last visited`}
                  >
                    +{entry.newCount} new
                  </span>
                )}
              </button>
              <button
                type="button"
                aria-label="Remove from history"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(entry.id);
                }}
                className="rounded-full p-1 text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[var(--bg-secondary)] hover:text-[var(--text)] focus:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}

          {/* "See all" overflow chip — opens the full history list (up
              to 50 entries) per Phase 12 of the master plan. Renders
              only when the soft-cap (12) was reached, suggesting the
              user has more history hidden. */}
          {computedItems.length >= 12 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="bg-primary/10 text-primary hover:bg-primary/20 inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors"
              aria-label="Show all recent searches"
            >
              See all
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Overflow drawer — shows up to 50 history entries when the
          user clicks "See all". */}
      {showAll && (
        <SearchHistoryOverflow type={type} basePath={basePath} onClose={() => setShowAll(false)} />
      )}
    </section>
  );
}

/**
 * Modal/drawer rendering up to 50 search-history entries. Re-fetches
 * with `limit=50` so the overflow shows entries beyond the chip's
 * `limit=12`. Click on a row to navigate, X to remove.
 */
function SearchHistoryOverflow({
  type,
  basePath,
  onClose,
}: {
  type: SearchHistoryType;
  basePath: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { items, isLoading, remove } = useSearchHistory(type, 50);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-lenis-prevent
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-[var(--text)]">Recent searches</h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-full p-1 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {isLoading ? (
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">Loading…</p>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">No recent searches.</p>
        ) : (
          <ul role="list" className="space-y-1">
            {items.map((entry) => (
              <li
                key={entry.id}
                role="listitem"
                className="group flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-[var(--bg-secondary)]"
              >
                <button
                  type="button"
                  onClick={() => {
                    router.push(chipHref(entry, basePath));
                    onClose();
                  }}
                  className="flex flex-1 items-center gap-2 text-left"
                >
                  <Search className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                  <span className="flex-1 truncate text-sm text-[var(--text)]">
                    {chipLabel(entry)}
                  </span>
                  {entry.newCount > 0 && (
                    <span className="bg-primary rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white">
                      +{entry.newCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  aria-label="Remove from history"
                  onClick={() => remove(entry.id)}
                  className="rounded-full p-1 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:bg-[var(--bg)] hover:text-[var(--text)]"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
