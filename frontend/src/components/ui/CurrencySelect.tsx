'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CURRENCIES, getCurrency, type Currency } from '@/constants/currencies';
import { usePopoverPlacement } from '@/hooks/use-popover-placement';

/**
 * CurrencySelect — the currency analogue of PhoneInput's country-code
 * picker, as a standalone field. Searchable (code, name, or symbol),
 * keyboard-navigable, relevance-ranked, with the same placement-flip
 * behaviour near the viewport bottom.
 *
 * Use this anywhere a currency is chosen NEXT TO separate amount
 * fields (salary min/max pairs, job postings). When a single amount +
 * currency travel together, prefer CurrencyAmountInput.
 */

const sizeStyles = {
  sm: 'h-8 text-sm px-2.5',
  md: 'h-10 text-sm px-3',
  lg: 'h-12 text-base px-3.5',
};

/** Relevance scoring mirroring PhoneInput's country search. */
function scoreMatch(c: Currency, q: string): number {
  const code = c.code.toLowerCase();
  const name = c.name.toLowerCase();
  const qLower = q.toLowerCase();

  if (code === qLower) return 1000;
  if (c.symbol === q) return 900;
  if (code.startsWith(qLower)) return 700;
  if (name.startsWith(qLower)) return 600;
  if (name.split(/\s+/).some((w) => w.startsWith(qLower))) return 500;
  if (name.includes(qLower)) return 200;
  return -1;
}

interface CurrencySelectProps {
  value: string;
  onChange: (code: string) => void;
  label?: string;
  error?: string;
  helperText?: string;
  placeholder?: string;
  size?: 'sm' | 'md' | 'lg';
  required?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export default function CurrencySelect({
  value,
  onChange,
  label,
  error,
  helperText,
  placeholder = 'Select currency',
  size = 'md',
  required,
  disabled,
  id,
  className,
}: CurrencySelectProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  const selected = getCurrency(value);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const placement = usePopoverPlacement(containerRef, open, 300);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return CURRENCIES;
    return CURRENCIES.map((c) => ({ c, score: scoreMatch(c, q) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name))
      .map(({ c }) => c);
  }, [search]);

  useEffect(() => {
    if (highlightIndex < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-currency-item]');
    items[highlightIndex]?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex]);

  const select = (c: Currency) => {
    onChange(c.code);
    setOpen(false);
    setSearch('');
    setHighlightIndex(-1);
  };

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIndex >= 0 && highlightIndex < filtered.length) {
          select(filtered[highlightIndex]);
        } else if (filtered.length === 1) {
          select(filtered[0]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-[var(--text)]">
          {label}
          {required && <span className="text-error ml-0.5">*</span>}
        </label>
      )}
      <div className="relative" ref={containerRef}>
        <button
          type="button"
          id={inputId}
          onClick={() => {
            if (disabled) return;
            if (!open) {
              setSearch('');
              setHighlightIndex(-1);
            }
            setOpen(!open);
          }}
          className={cn(
            'flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-white text-left transition-colors duration-200',
            'focus:border-primary focus:ring-primary/20 focus:ring-2 focus:outline-none',
            error && 'border-error focus:border-error focus:ring-error/20',
            disabled && 'cursor-not-allowed bg-[var(--bg-secondary)] opacity-60',
            sizeStyles[size],
            className,
          )}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={label || 'Select currency'}
          disabled={disabled}
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2 text-[var(--text)]">
              <span className="shrink-0 font-semibold">{selected.symbol}</span>
              <span className="truncate">
                {selected.code} · {selected.name}
              </span>
            </span>
          ) : (
            <span className="text-[var(--text-muted)]">{placeholder}</span>
          )}
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>

        {open && (
          <div
            className={cn(
              'absolute left-0 z-50 w-full min-w-64 rounded-lg border border-[var(--border)] bg-[var(--bg)] shadow-lg',
              placement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1',
            )}
          >
            <div className="border-b border-[var(--border)] p-2">
              <div className="flex items-center gap-2 rounded-md bg-[var(--bg-secondary)] px-2.5">
                <Search className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setHighlightIndex(-1);
                  }}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search currency or code..."
                  className="w-full bg-transparent py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none"
                  aria-label="Search currencies"
                />
              </div>
            </div>
            <div
              ref={listRef}
              data-lenis-prevent
              className="max-h-60 overflow-y-auto overscroll-contain py-1"
              role="listbox"
              aria-label="Currencies"
            >
              {filtered.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-[var(--text-muted)]">
                  No currencies found
                </p>
              ) : (
                filtered.map((c, idx) => (
                  <button
                    key={c.code}
                    type="button"
                    data-currency-item
                    role="option"
                    aria-selected={c.code === value}
                    onClick={() => select(c)}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                      idx === highlightIndex && 'bg-[var(--bg-secondary)]',
                      c.code === value && 'text-primary font-medium',
                      idx !== highlightIndex && 'hover:bg-[var(--bg-secondary)]',
                    )}
                  >
                    <span className="w-8 shrink-0 font-semibold">{c.symbol}</span>
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="shrink-0 text-[var(--text-muted)]">{c.code}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-error mt-1 text-sm">{error}</p>}
      {helperText && !error && (
        <p className="mt-1 text-sm text-[var(--text-muted)]">{helperText}</p>
      )}
    </div>
  );
}
