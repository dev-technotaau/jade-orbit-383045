'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { usePopoverPlacement } from '@/hooks/use-popover-placement';

interface SuggestionInputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: readonly string[];
  onSelect?: (value: string) => void;
  error?: string;
  helperText?: string;
  required?: boolean;
  leftIcon?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export default function SuggestionInput({
  label,
  placeholder,
  value,
  onChange,
  suggestions,
  onSelect,
  error,
  helperText,
  required,
  leftIcon,
  disabled,
  className,
}: SuggestionInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Suppresses the next onFocus-opens-dropdown when we programmatically refocus
  // the input right after a selection. Otherwise focus() re-triggers onFocus →
  // setIsOpen(true), undoing the close we just set.
  const skipNextFocusOpenRef = useRef(false);

  const filtered =
    value.trim().length >= 1
      ? suggestions.filter((s) => s.toLowerCase().includes(value.toLowerCase())).slice(0, 8)
      : [];

  const showDropdown = isOpen && filtered.length > 0;
  // max-h-48 = 192px + padding; flip up if not enough room below
  const dropdownPlacement = usePopoverPlacement(wrapperRef, showDropdown, 220);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Scroll highlight into view
  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightIndex] as HTMLElement;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex]);

  const handleSelect = useCallback(
    (selected: string) => {
      onChange(selected);
      onSelect?.(selected);
      setIsOpen(false);
      setHighlightIndex(-1);
      // Re-focus input after selection so user can continue typing
      skipNextFocusOpenRef.current = true;
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [onChange, onSelect],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && highlightIndex >= 0) {
      e.preventDefault();
      handleSelect(filtered[highlightIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'Tab' && highlightIndex >= 0) {
      handleSelect(filtered[highlightIndex]);
    }
  };

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
          {label}
          {required && <span className="text-error ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[var(--text-muted)]">
            {leftIcon}
          </div>
        )}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
            setHighlightIndex(-1);
          }}
          onFocus={() => {
            if (skipNextFocusOpenRef.current) {
              skipNextFocusOpenRef.current = false;
              return;
            }
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            'w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-[var(--text)] transition-colors',
            'placeholder:text-[var(--text-muted)]',
            'focus:border-primary focus:ring-primary/20 focus:ring-2 focus:outline-none',
            'disabled:cursor-not-allowed disabled:bg-[var(--bg-secondary)] disabled:opacity-60',
            error ? 'border-error' : 'border-[var(--border)]',
            leftIcon && 'pl-9',
          )}
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
        />
      </div>

      {showDropdown && (
        <ul
          ref={listRef}
          data-lenis-prevent
          className={cn(
            'absolute z-30 max-h-48 w-full overflow-auto overscroll-contain rounded-lg border border-[var(--border)] bg-white py-1 shadow-lg',
            dropdownPlacement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1',
          )}
          role="listbox"
        >
          {filtered.map((item, i) => (
            <li
              key={item}
              role="option"
              aria-selected={i === highlightIndex}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setHighlightIndex(i)}
              className={cn(
                'cursor-pointer px-3 py-2 text-sm transition-colors',
                i === highlightIndex
                  ? 'bg-primary-light text-primary'
                  : 'text-[var(--text)] hover:bg-[var(--bg-secondary)]',
              )}
            >
              {item}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-error mt-1 text-xs">{error}</p>}
      {helperText && !error && (
        <p className="mt-1 text-xs text-[var(--text-muted)]">{helperText}</p>
      )}
    </div>
  );
}
