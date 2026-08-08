'use client';

/**
 * Header mega-menu rendering Jobs / Companies dropdowns.
 *
 * Jobs dropdown — 4 columns:
 *   - Popular Categories  (CuratedType.JOB_CATEGORY)
 *   - Jobs in Demand      (CuratedType.JOB_DEMAND)
 *   - Jobs by Location    (CuratedType.JOB_LOCATION)
 *   - Jobs by Qualification (CuratedType.JOB_QUALIFICATION)
 *
 * Companies dropdown — 2 columns:
 *   - Explore Categories  (CuratedType.COMPANY_CATEGORY)
 *   - Explore Collections (CuratedType.COMPANY_COLLECTION)
 *
 * Data fetched once per session via TanStack Query (5min staleTime).
 * Mobile variant collapses to an accordion driven by the same data.
 */

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ChevronDown, Briefcase, Building2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { curatedService, type CuratedType, type CuratedListing } from '@/services/curated.service';
import { curatedHref, curatedAriaLabel } from '@/lib/curated-href';

type MenuKey = 'jobs' | 'companies' | null;

const JOBS_COLUMNS: Array<{ heading: string; type: CuratedType }> = [
  { heading: 'Popular Categories', type: 'JOB_CATEGORY' },
  { heading: 'Jobs in Demand', type: 'JOB_DEMAND' },
  { heading: 'Jobs by Location', type: 'JOB_LOCATION' },
  { heading: 'Jobs by Qualification', type: 'JOB_QUALIFICATION' },
];

const COMPANIES_COLUMNS: Array<{ heading: string; type: CuratedType }> = [
  { heading: 'Explore Categories', type: 'COMPANY_CATEGORY' },
  { heading: 'Explore Collections', type: 'COMPANY_COLLECTION' },
];

// Single source of truth for CuratedListing → URL routing —
// imported below to keep header / footer / homepage in lockstep.

interface Props {
  onNavigate?: () => void;
}

export default function NavMegaMenu({ onNavigate }: Props) {
  const [open, setOpen] = useState<MenuKey>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // 150ms grace period when the cursor leaves the trigger/panel cluster
  // — lets the user travel the gap between trigger and panel without the
  // menu flickering closed.
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: menu } = useQuery({
    queryKey: ['curated-menu'],
    queryFn: () => curatedService.menu(),
    staleTime: 5 * 60 * 1000,
  });

  // Close on outside click + Escape (kept for keyboard/touch users who
  // open via click; hover users get closed automatically via onMouseLeave).
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(null);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(null);
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEsc);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleEsc);
      };
    }
  }, [open]);

  // Clear any pending close timer on unmount.
  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    [],
  );

  function cancelClose() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }
  function scheduleClose() {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setOpen(null), 150);
  }
  function hoverOpen(key: Exclude<MenuKey, null>) {
    cancelClose();
    setOpen(key);
  }

  const closeAndNavigate = () => {
    cancelClose();
    setOpen(null);
    onNavigate?.();
  };

  return (
    <div
      ref={containerRef}
      className="relative flex items-center gap-1"
      onMouseLeave={scheduleClose}
      onMouseEnter={cancelClose}
    >
      <NavTrigger
        label="Jobs"
        icon={Briefcase}
        isOpen={open === 'jobs'}
        onToggle={() => setOpen(open === 'jobs' ? null : 'jobs')}
        onHoverOpen={() => hoverOpen('jobs')}
      />
      <NavTrigger
        label="Companies"
        icon={Building2}
        isOpen={open === 'companies'}
        onToggle={() => setOpen(open === 'companies' ? null : 'companies')}
        onHoverOpen={() => hoverOpen('companies')}
      />

      {open === 'jobs' && (
        <div
          role="menu"
          onMouseEnter={cancelClose}
          className="animate-scale-in absolute top-full left-0 z-50 mt-2 w-[min(96vw,840px)] rounded-2xl border border-[var(--border)] bg-white p-6 shadow-xl"
        >
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 lg:grid-cols-4">
            {JOBS_COLUMNS.map((col) => (
              <MenuColumn
                key={col.type}
                heading={col.heading}
                items={menu?.[col.type] ?? []}
                onNavigate={closeAndNavigate}
              />
            ))}
          </div>
          <div className="mt-6 border-t border-[var(--border)] pt-4 text-right">
            <Link
              href="/jobs"
              onClick={closeAndNavigate}
              className="text-primary text-sm font-semibold hover:underline"
            >
              Browse all jobs →
            </Link>
          </div>
        </div>
      )}

      {open === 'companies' && (
        <div
          role="menu"
          onMouseEnter={cancelClose}
          className="animate-scale-in absolute top-full left-0 z-50 mt-2 w-[min(96vw,560px)] rounded-2xl border border-[var(--border)] bg-white p-6 shadow-xl"
        >
          <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
            {COMPANIES_COLUMNS.map((col) => (
              <MenuColumn
                key={col.type}
                heading={col.heading}
                items={menu?.[col.type] ?? []}
                onNavigate={closeAndNavigate}
              />
            ))}
          </div>
          <div className="mt-6 border-t border-[var(--border)] pt-4 text-right">
            <Link
              href="/companies"
              onClick={closeAndNavigate}
              className="text-primary text-sm font-semibold hover:underline"
            >
              Browse all companies →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function NavTrigger({
  label,
  icon: Icon,
  isOpen,
  onToggle,
  onHoverOpen,
}: {
  label: string;
  icon: typeof Briefcase;
  isOpen: boolean;
  onToggle: () => void;
  onHoverOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      onMouseEnter={onHoverOpen}
      onFocus={onHoverOpen}
      aria-expanded={isOpen}
      aria-haspopup="menu"
      className={cn(
        'inline-flex items-center gap-1 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
        isOpen
          ? 'bg-primary-light text-primary'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]',
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
      <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-180')} />
    </button>
  );
}

function MenuColumn({
  heading,
  items,
  onNavigate,
}: {
  heading: string;
  items: CuratedListing[];
  onNavigate: () => void;
}) {
  if (items.length === 0) {
    return (
      <div>
        <h4 className="mb-3 text-xs font-bold tracking-wider text-[var(--text-muted)] uppercase">
          {heading}
        </h4>
        <p className="text-xs text-[var(--text-muted)]">Loading…</p>
      </div>
    );
  }
  return (
    <div>
      <h4 className="mb-3 text-xs font-bold tracking-wider text-[var(--text-muted)] uppercase">
        {heading}
      </h4>
      <ul className="space-y-1.5">
        {/* Cap each column at 6 rows so the mega panel stays compact;
            "Browse all" below is the path to the full listing. */}
        {items.slice(0, 6).map((item) => (
          <li key={item.id}>
            <Link
              href={curatedHref(item)}
              aria-label={curatedAriaLabel(item)}
              onClick={onNavigate}
              className="hover:text-primary block rounded-md py-1 text-sm text-[var(--text-secondary)] transition-colors"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Mobile accordion variant — used inside the existing mobile drawer.
 * Two collapsible sections, lazily-rendered same data.
 */
export function MobileNavMegaMenu({ onNavigate }: { onNavigate?: () => void }) {
  const [openJobs, setOpenJobs] = useState(false);
  const [openCompanies, setOpenCompanies] = useState(false);
  const { data: menu } = useQuery({
    queryKey: ['curated-menu'],
    queryFn: () => curatedService.menu(),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpenJobs((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
      >
        <span className="inline-flex items-center gap-2">
          <Briefcase className="h-4 w-4" />
          Jobs
        </span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', openJobs && 'rotate-180')} />
      </button>
      {openJobs && (
        <div className="space-y-3 pb-2 pl-6">
          {JOBS_COLUMNS.map((col) => (
            <details key={col.type} className="group">
              <summary className="cursor-pointer py-1 text-xs font-bold tracking-wider text-[var(--text-muted)] uppercase">
                {col.heading}
              </summary>
              <ul className="mt-1 space-y-1">
                {(menu?.[col.type] ?? []).slice(0, 12).map((it) => (
                  <li key={it.id}>
                    <Link
                      href={curatedHref(it)}
                      aria-label={curatedAriaLabel(it)}
                      onClick={onNavigate}
                      className="hover:text-primary block rounded-md py-1 text-sm text-[var(--text-secondary)]"
                    >
                      {it.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ))}
          <Link
            href="/jobs"
            onClick={onNavigate}
            className="text-primary inline-block text-xs font-semibold"
          >
            Browse all jobs →
          </Link>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpenCompanies((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
      >
        <span className="inline-flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Companies
        </span>
        <ChevronDown
          className={cn('h-4 w-4 transition-transform', openCompanies && 'rotate-180')}
        />
      </button>
      {openCompanies && (
        <div className="space-y-3 pb-2 pl-6">
          {COMPANIES_COLUMNS.map((col) => (
            <details key={col.type} className="group">
              <summary className="cursor-pointer py-1 text-xs font-bold tracking-wider text-[var(--text-muted)] uppercase">
                {col.heading}
              </summary>
              <ul className="mt-1 space-y-1">
                {(menu?.[col.type] ?? []).slice(0, 12).map((it) => (
                  <li key={it.id}>
                    <Link
                      href={curatedHref(it)}
                      aria-label={curatedAriaLabel(it)}
                      onClick={onNavigate}
                      className="hover:text-primary block rounded-md py-1 text-sm text-[var(--text-secondary)]"
                    >
                      {it.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ))}
          <Link
            href="/companies"
            onClick={onNavigate}
            className="text-primary inline-block text-xs font-semibold"
          >
            Browse all companies →
          </Link>
        </div>
      )}
    </>
  );
}
