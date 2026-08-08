'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Building2, X, BadgeCheck } from 'lucide-react';
import {
  superAdminJobService,
  type SuperAdminCompanyOption,
} from '@/services/super-admin-jobs.service';

/**
 * Server-driven company picker for the super-admin job poster — a debounced
 * search field + custom results dropdown (NOT a native <select>). The chosen
 * company's `id` (CompanyProfile id) is what a job is posted against.
 */
export default function CompanySelector({
  value,
  onChange,
  error,
}: {
  value: SuperAdminCompanyOption | null;
  onChange: (company: SuperAdminCompanyOption | null) => void;
  error?: string;
}) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Debounce the typed query (no shared hook in the app yet).
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Close on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ['sa-companies', debounced],
    queryFn: () => superAdminJobService.listCompanies(debounced || undefined, 1, 20),
    enabled: open && !value,
  });
  const items = data?.data?.items ?? [];

  return (
    <div ref={ref} className="relative">
      <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
        Company <span className="text-[var(--error)]">*</span>
      </label>

      {value ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2.5">
          <span className="flex min-w-0 items-center gap-2">
            {value.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={value.logo} alt="" className="h-6 w-6 rounded object-contain" />
            ) : (
              <Building2 className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
            )}
            <span className="truncate text-sm font-medium text-[var(--text)]">
              {value.companyName}
            </span>
            {value.isVerified && <BadgeCheck className="h-4 w-4 shrink-0 text-[var(--primary)]" />}
            {value.ownerEmail && (
              <span className="truncate text-xs text-[var(--text-muted)]">
                · {value.ownerEmail}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="shrink-0 rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text)]"
            aria-label="Clear selected company"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search a company by name or owner email…"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] py-2.5 pr-3 pl-9 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
          />
        </div>
      )}

      {error && !value && <p className="mt-1 text-xs text-[var(--error)]">{error}</p>}

      {open && !value && (
        <div
          data-lenis-prevent
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-[var(--border)] bg-white shadow-lg"
        >
          {isFetching && <p className="px-3 py-2.5 text-xs text-[var(--text-muted)]">Searching…</p>}
          {!isFetching && items.length === 0 && (
            <p className="px-3 py-2.5 text-xs text-[var(--text-muted)]">No companies found.</p>
          )}
          {items.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onChange(c);
                setOpen(false);
                setQ('');
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--bg-secondary)]"
            >
              {c.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.logo} alt="" className="h-6 w-6 shrink-0 rounded object-contain" />
              ) : (
                <Building2 className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 truncate text-sm text-[var(--text)]">
                  {c.companyName}
                  {c.isVerified && <BadgeCheck className="h-3.5 w-3.5 text-[var(--primary)]" />}
                </span>
                <span className="block truncate text-xs text-[var(--text-muted)]">
                  {[c.city, c.ownerEmail].filter(Boolean).join(' · ') || '—'}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
