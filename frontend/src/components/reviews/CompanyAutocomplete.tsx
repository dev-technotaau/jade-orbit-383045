'use client';

/**
 * CompanyAutocomplete — searchable input for the review form's
 * "Company name" field.
 *
 * Behaviour:
 *   - When a `selected` company is provided (e.g. prefilled from
 *     ?companySlug=...), the input shows the selected company's name
 *     and a small "✕" clear button. Pressing it returns the user to
 *     the search state.
 *   - As the user types ≥1 chars, debounces and queries
 *     `/public/companies-autocomplete`.
 *   - Results render as a vertical dropdown with logo + name + city.
 *   - Keyboard nav: ↑↓ to move focus, Enter to select, Esc to close.
 *
 * Used by both the standalone /reviews/write page (no prefill) and the
 * /companies/[slug]/reviews/write page (prefilled).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Building2, Loader2, Search, X, BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { companyReviewService } from '@/services/company-review.service';
import type { CompanyAutocompleteItem } from '@/types/review';

interface Props {
  value: CompanyAutocompleteItem | null;
  onChange: (company: CompanyAutocompleteItem | null) => void;
  placeholder?: string;
  required?: boolean;
  error?: string;
  className?: string;
}

export default function CompanyAutocomplete({
  value,
  onChange,
  placeholder = 'Start typing to search companies on Hire Adda…',
  required,
  error,
  className,
}: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CompanyAutocompleteItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Debounced search.
  useEffect(() => {
    if (value) return; // don't search while a company is selected
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await companyReviewService.searchCompaniesForForm(query);
        setResults(res);
        setHighlight(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, value]);

  function handleSelect(c: CompanyAutocompleteItem) {
    onChange(c);
    setQuery('');
    setOpen(false);
  }

  function handleClear() {
    onChange(null);
    setQuery('');
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      if (results[highlight]) {
        e.preventDefault();
        handleSelect(results[highlight]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  // When the input is in "selected" mode, we render the selected company
  // as a chip + an X. When in "search" mode, we render the input.
  const selectedView = useMemo(() => {
    if (!value) return null;
    return (
      <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm">
        {value.logo ? (
          <Image
            src={value.logo}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 rounded bg-white object-contain"
          />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded bg-[var(--bg-tertiary)]">
            <Building2 className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="truncate font-medium">{value.companyName}</span>
            {value.isVerified && (
              <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-label="Verified" />
            )}
          </div>
          {(value.industry || value.city) && (
            <div className="truncate text-xs text-[var(--text-muted)]">
              {[value.industry, value.city].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleClear}
          className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text)]"
          aria-label="Clear selected company"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }, [value]);

  return (
    <div ref={wrapRef} className={cn('relative w-full', className)}>
      {selectedView ?? (
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKey}
            required={required}
            placeholder={placeholder}
            aria-autocomplete="list"
            aria-expanded={open}
            className={cn(
              'block w-full rounded-md border border-[var(--border)] bg-[var(--bg)] py-2 pr-3 pl-9 text-sm text-[var(--text)]',
              'placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] focus:outline-none',
              error && 'border-red-500 focus:border-red-500 focus:ring-red-500',
            )}
          />
          {loading && (
            <Loader2 className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--text-muted)]" />
          )}
        </div>
      )}

      {!value && open && (results.length > 0 || (!loading && query.trim())) && (
        <ul
          data-lenis-prevent
          role="listbox"
          className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--bg)] shadow-lg"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-[var(--text-muted)]">
              No companies match &ldquo;{query}&rdquo;
            </li>
          ) : (
            results.map((c, i) => (
              <li
                key={c.id}
                role="option"
                aria-selected={i === highlight}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(c);
                }}
                className={cn(
                  'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm',
                  i === highlight ? 'bg-[var(--bg-secondary)]' : 'bg-[var(--bg)]',
                )}
              >
                {c.logo ? (
                  <Image
                    src={c.logo}
                    alt=""
                    width={28}
                    height={28}
                    className="h-7 w-7 rounded bg-white object-contain"
                  />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded bg-[var(--bg-tertiary)]">
                    <Building2 className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="truncate font-medium text-[var(--text)]">{c.companyName}</span>
                    {c.isVerified && (
                      <BadgeCheck
                        className="h-3.5 w-3.5 shrink-0 text-emerald-500"
                        aria-label="Verified"
                      />
                    )}
                  </div>
                  {(c.industry || c.city) && (
                    <div className="truncate text-xs text-[var(--text-muted)]">
                      {[c.industry, c.city].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
              </li>
            ))
          )}
        </ul>
      )}

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
