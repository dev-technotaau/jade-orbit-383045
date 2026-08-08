'use client';

import {
  forwardRef,
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  type InputHTMLAttributes,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { COUNTRY_CODES, type CountryCode } from '@/constants/country-codes';
import { usePopoverPlacement } from '@/hooks/use-popover-placement';

interface PhoneInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'value'
> {
  label?: string;
  error?: string;
  helperText?: string;
  inputSize?: 'sm' | 'md' | 'lg';
  countryCode?: string;
  /** The full phone number including country code (e.g., "+919876543210") */
  value?: string;
  /** Called with the full number including country code */
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  /** Called with the full number including country code */
  onValueChange?: (fullNumber: string) => void;
}

const sizeStyles = {
  sm: 'h-8 text-sm',
  md: 'h-10 text-sm',
  lg: 'h-12 text-base',
};

// Pre-sort by code length descending for detection
const SORTED_CODES = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);

// Common aliases — maps user input to country ISO codes for natural search
const ALIASES: Record<string, string[]> = {
  USA: ['US'],
  'U.S.': ['US'],
  'U.S.A.': ['US'],
  AMERICA: ['US'],
  STATES: ['US'],
  UK: ['GB'],
  'U.K.': ['GB'],
  BRITAIN: ['GB'],
  ENGLAND: ['GB'],
  UAE: ['AE'],
  EMIRATES: ['AE'],
  KSA: ['SA'],
  SAUDI: ['SA'],
  HOLLAND: ['NL'],
  NETHERLANDS: ['NL'],
  DEUTSCHLAND: ['DE'],
  GERMANY: ['DE'],
  KOREA: ['KR', 'KP'],
  PRC: ['CN'],
  CHINA: ['CN'],
  ROC: ['TW'],
  TAIWAN: ['TW'],
  HK: ['HK'],
  RUSSIA: ['RU'],
  IRAN: ['IR'],
  TURKEY: ['TR'],
  CZECH: ['CZ'],
  IVORY: ['CI'],
  CONGO: ['CD', 'CG'],
};

/**
 * Score a country against a search query.
 * Higher score = more relevant. Returns -1 to filter out.
 */
function scoreMatch(c: CountryCode, q: string): number {
  const name = c.name.toLowerCase();
  const iso = c.iso.toLowerCase();
  const code = c.code.toLowerCase();
  const qLower = q.toLowerCase();

  // Exact ISO match — highest priority
  if (iso === qLower) return 1000;

  // Alias match (e.g., "USA" → US)
  const aliasIsos = ALIASES[q.toUpperCase()];
  if (aliasIsos?.includes(c.iso)) return 900;

  // Exact dial code match (e.g., "+1" or "1")
  const codeNoPlus = code.replace('+', '');
  if (code === qLower || codeNoPlus === qLower.replace('+', '')) return 800;

  // Name starts with query
  if (name.startsWith(qLower)) return 700;

  // ISO starts with query (handles partial like "u" → US, UK)
  if (iso.startsWith(qLower)) return 600;

  // Name word-boundary match (e.g., "states" matches "United States")
  if (name.split(/[\s&-]+/).some((word) => word.startsWith(qLower))) return 500;

  // Code starts with query
  if (codeNoPlus.startsWith(qLower.replace('+', ''))) return 400;

  // Substring in name
  if (name.includes(qLower)) return 200;

  // Substring in code
  if (code.includes(qLower)) return 100;

  return -1;
}

/** Detect country code from a full phone number */
function detectCode(number: string): string | null {
  if (!number) return null;
  const cleaned = number.replace(/\s+/g, '');
  if (!cleaned.startsWith('+')) return null;
  for (const c of SORTED_CODES) {
    if (cleaned.startsWith(c.code)) return c.code;
  }
  return null;
}

/** Strip country code prefix for display */
function stripCode(number: string, code: string): string {
  const cleaned = number.replace(/\s+/g, '');
  if (cleaned.startsWith(code)) return cleaned.slice(code.length);
  const codeDigits = code.slice(1);
  if (cleaned.startsWith(codeDigits)) return cleaned.slice(codeDigits.length);
  return cleaned;
}

const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  (
    {
      className,
      label,
      error,
      helperText,
      inputSize = 'md',
      countryCode: defaultCode = '+91',
      value,
      onChange,
      onValueChange,
      id,
      ...props
    },
    ref,
  ) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    const detectedCode = value ? detectCode(value) : null;
    // Track the user's manual selection by ISO (unique per country),
    // NOT by dial code — multiple countries share a code (US/CA on
    // +1, UK/JE/GG/IM on +44, KZ/RU on +7, etc.). Tracking only the
    // code meant `find(c => c.code === selectedCode)` always returned
    // the first listed match, silently overriding the user's pick.
    const [internalIso, setInternalIso] = useState<string | null>(null);

    // Effective country resolution:
    //   1. If the user picked a country and its dial code is still
    //      compatible with the current value (or there's no value),
    //      respect that pick — this is what fixes the US-vs-Canada
    //      bug after manual selection.
    //   2. Otherwise fall back to detecting from the value's prefix,
    //      then to the default country code. The first +N match in
    //      COUNTRY_CODES still wins for unprefilled / externally-set
    //      values, which is the best we can do without ambiguity.
    const currentCountry = useMemo(() => {
      if (internalIso) {
        const picked = COUNTRY_CODES.find((c) => c.iso === internalIso);
        if (picked && (!detectedCode || picked.code === detectedCode)) {
          return picked;
        }
      }
      const code = detectedCode || defaultCode;
      return COUNTRY_CODES.find((c) => c.code === code) || COUNTRY_CODES[0];
    }, [internalIso, detectedCode, defaultCode]);
    const selectedCode = currentCountry.code;
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [highlightIndex, setHighlightIndex] = useState(-1);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const phoneInputRef = useRef<HTMLInputElement | null>(null);
    // Flip upward when there's not enough room below — prevents a white strip
    // from appearing beneath the page when opened near viewport bottom.
    const dropdownPlacement = usePopoverPlacement(dropdownRef, dropdownOpen, 300);

    // Focus search input when dropdown opens
    useEffect(() => {
      if (!dropdownOpen) return;
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }, [dropdownOpen]);

    // Close dropdown on outside click
    useEffect(() => {
      if (!dropdownOpen) return;
      const handler = (e: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
          setDropdownOpen(false);
        }
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, [dropdownOpen]);

    // Filter countries by search query — ranked by relevance
    const filtered = useMemo(() => {
      const q = search.trim();
      if (!q) return COUNTRY_CODES;
      return COUNTRY_CODES.map((c) => ({ c, score: scoreMatch(c, q) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name))
        .map(({ c }) => c);
    }, [search]);

    // Scroll highlighted item into view
    useEffect(() => {
      if (highlightIndex < 0 || !listRef.current) return;
      const items = listRef.current.querySelectorAll('[data-country-item]');
      items[highlightIndex]?.scrollIntoView({ block: 'nearest' });
    }, [highlightIndex]);

    const localValue = value ? stripCode(value, selectedCode) : '';

    const emitChange = useCallback(
      (local: string, code: string) => {
        const fullNumber = local ? `${code}${local}` : '';
        onValueChange?.(fullNumber);
      },
      [onValueChange],
    );

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
      const local = e.target.value.replace(/[^\d]/g, '');
      const fullNumber = local ? `${selectedCode}${local}` : '';

      const syntheticEvent = {
        ...e,
        target: { ...e.target, value: fullNumber },
      } as ChangeEvent<HTMLInputElement>;

      onChange?.(syntheticEvent);
      onValueChange?.(fullNumber);
    };

    const handleCodeSelect = (c: CountryCode) => {
      setInternalIso(c.iso);
      setDropdownOpen(false);
      setSearch('');
      setHighlightIndex(-1);
      // Re-focus the phone number input after selection
      requestAnimationFrame(() => phoneInputRef.current?.focus());
      emitChange(localValue, c.code);
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
            handleCodeSelect(filtered[highlightIndex]);
          } else if (filtered.length === 1) {
            handleCodeSelect(filtered[0]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setDropdownOpen(false);
          phoneInputRef.current?.focus();
          break;
        case 'Tab':
          setDropdownOpen(false);
          break;
      }
    };

    // Merge refs
    const setRefs = useCallback(
      (node: HTMLInputElement | null) => {
        phoneInputRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
      },
      [ref],
    );

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-[var(--text)]">
            {label}
            {props.required && <span className="text-error ml-0.5">*</span>}
          </label>
        )}
        <div
          className={cn(
            'flex w-full rounded-lg border border-[var(--border)] bg-white transition-colors duration-200',
            'focus-within:border-primary focus-within:ring-primary/20 focus-within:ring-2',
            error && 'border-error focus-within:border-error focus-within:ring-error/20',
            props.disabled && 'cursor-not-allowed bg-[var(--bg-secondary)] opacity-60',
          )}
        >
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => {
                if (props.disabled) return;
                if (!dropdownOpen) {
                  setSearch('');
                  setHighlightIndex(-1);
                }
                setDropdownOpen(!dropdownOpen);
              }}
              className={cn(
                // rounded-l-lg matches the outer container's rounded-lg so the button's
                // bg-secondary fill doesn't poke out past the container's curved corners.
                'flex shrink-0 items-center gap-1 rounded-l-lg border-r border-[var(--border)] bg-[var(--bg-secondary)] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)]',
                inputSize === 'sm'
                  ? 'h-8 px-2 text-sm'
                  : inputSize === 'lg'
                    ? 'h-12 px-3 text-base'
                    : 'h-10 px-2.5 text-sm',
                props.disabled && 'pointer-events-none',
              )}
              aria-label={`Select country code, current: ${currentCountry.name} ${selectedCode}`}
              aria-expanded={dropdownOpen}
              aria-haspopup="listbox"
              tabIndex={-1}
            >
              <span>{currentCountry.flag}</span>
              <span>{selectedCode}</span>
              <ChevronDown
                className={cn(
                  'h-3 w-3 opacity-50 transition-transform',
                  dropdownOpen && 'rotate-180',
                )}
              />
            </button>
            {dropdownOpen && (
              <div
                className={cn(
                  'absolute left-0 z-50 w-72 rounded-lg border border-[var(--border)] bg-[var(--bg)] shadow-lg',
                  dropdownPlacement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1',
                )}
              >
                {/* Search input */}
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
                      placeholder="Search country or code..."
                      className="w-full bg-transparent py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none"
                      aria-label="Search countries"
                    />
                  </div>
                </div>
                {/* Country list */}
                <div
                  ref={listRef}
                  data-lenis-prevent
                  className="max-h-60 overflow-y-auto overscroll-contain py-1"
                  role="listbox"
                  aria-label="Country codes"
                >
                  {filtered.length === 0 ? (
                    <p className="px-3 py-4 text-center text-sm text-[var(--text-muted)]">
                      No countries found
                    </p>
                  ) : (
                    filtered.map((c, idx) => (
                      <button
                        key={`${c.iso}-${c.code}`}
                        type="button"
                        data-country-item
                        role="option"
                        aria-selected={c.code === selectedCode}
                        onClick={() => handleCodeSelect(c)}
                        onMouseEnter={() => setHighlightIndex(idx)}
                        className={cn(
                          'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                          idx === highlightIndex && 'bg-[var(--bg-secondary)]',
                          c.code === selectedCode && 'text-primary font-medium',
                          idx !== highlightIndex && 'hover:bg-[var(--bg-secondary)]',
                        )}
                      >
                        <span className="shrink-0">{c.flag}</span>
                        <span className="flex-1 truncate">{c.name}</span>
                        <span className="shrink-0 text-[var(--text-muted)]">{c.code}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          <input
            ref={setRefs}
            id={inputId}
            type="tel"
            value={localValue}
            onChange={handleChange}
            className={cn(
              'w-full bg-transparent px-3 text-[var(--text)] placeholder:text-[var(--text-muted)]',
              'focus:outline-none',
              'disabled:cursor-not-allowed',
              sizeStyles[inputSize],
              className,
            )}
            {...props}
          />
        </div>
        {error && <p className="text-error mt-1 text-sm">{error}</p>}
        {helperText && !error && (
          <p className="mt-1 text-sm text-[var(--text-muted)]">{helperText}</p>
        )}
      </div>
    );
  },
);

PhoneInput.displayName = 'PhoneInput';

export default PhoneInput;
