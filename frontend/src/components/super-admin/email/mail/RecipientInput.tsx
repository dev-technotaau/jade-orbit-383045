'use client';

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import Input from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import type { RecipientInputProps } from '@/components/super-admin/email/mail/props';
import type { RecipientSuggestion } from '@/types/email-mailbox';

/** Index of the last comma or semicolon, or -1 when the value has no separator. */
function lastSeparatorIndex(value: string): number {
  return Math.max(value.lastIndexOf(','), value.lastIndexOf(';'));
}

/** The recipient currently being typed: everything after the last separator, trimmed. */
function currentToken(value: string): string {
  return value.slice(lastSeparatorIndex(value) + 1).trim();
}

/**
 * Replace the current (last) token with the chosen address, appending ", " so
 * the user can immediately type the next recipient. Everything before and
 * including the last separator is preserved verbatim.
 */
function replaceCurrentToken(value: string, address: string): string {
  const head = value.slice(0, lastSeparatorIndex(value) + 1);
  return (head ? `${head} ` : '') + address + ', ';
}

export default function RecipientInput({
  id,
  value,
  onChange,
  fetchSuggestions,
  placeholder,
  autoFocus,
  disabled,
}: RecipientInputProps) {
  const [suggestions, setSuggestions] = useState<RecipientSuggestion[]>([]);
  const [open, setOpen] = useState<boolean>(false);
  const [activeIndex, setActiveIndex] = useState<number>(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic request id so a slow, stale response can never clobber a newer one.
  const reqIdRef = useRef<number>(0);

  // Debounced suggestion fetch — driven by input/focus events (never an effect).
  const runSuggest = (nextValue: string) => {
    if (disabled) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const token = currentToken(nextValue);
    if (token.length < 1) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      const reqId = ++reqIdRef.current;
      fetchSuggestions(token)
        .then((results) => {
          if (reqId !== reqIdRef.current) return; // a newer request superseded this one
          setSuggestions(results);
          setActiveIndex(0);
          setOpen(results.length > 0);
        })
        .catch(() => {
          if (reqId !== reqIdRef.current) return;
          setSuggestions([]);
          setOpen(false);
        });
    }, 200);
  };

  // Clear any pending timers on unmount.
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (blurRef.current) clearTimeout(blurRef.current);
    },
    [],
  );

  const select = (address: string) => {
    if (blurRef.current) clearTimeout(blurRef.current);
    // Invalidate any in-flight request so it can't re-open the dropdown.
    reqIdRef.current += 1;
    onChange(replaceCurrentToken(value, address));
    setSuggestions([]);
    setOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = suggestions[activeIndex] ?? suggestions[0];
      if (chosen) select(chosen.address);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  const handleFocus = () => {
    if (blurRef.current) clearTimeout(blurRef.current);
    runSuggest(value);
  };

  const handleBlur = () => {
    // Delay so a click on a suggestion row registers before we close.
    if (blurRef.current) clearTimeout(blurRef.current);
    blurRef.current = setTimeout(() => {
      setOpen(false);
    }, 150);
  };

  const showDropdown = open && !disabled && suggestions.length > 0;

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        id={id}
        inputSize="sm"
        type="text"
        autoComplete="off"
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          runSuggest(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        role="combobox"
        aria-expanded={showDropdown}
        aria-autocomplete="list"
      />

      {showDropdown && (
        <div
          className="absolute top-full right-0 left-0 z-50 mt-1 max-h-60 overflow-auto rounded-md border border-[var(--border)] bg-[var(--bg)] shadow-lg"
          role="listbox"
        >
          {suggestions.map((s, i) => (
            <button
              key={`${s.address}-${i}`}
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              // Prevent the input from blurring so focus stays put on click.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => select(s.address)}
              className={cn(
                'flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors',
                i === activeIndex ? 'bg-[var(--bg-secondary)]' : 'hover:bg-[var(--bg-secondary)]',
              )}
            >
              {s.name ? (
                <>
                  <span className="w-full truncate text-sm font-medium text-[var(--text)]">
                    {s.name}
                  </span>
                  <span className="w-full truncate text-xs text-[var(--text-secondary)]">
                    {s.address}
                  </span>
                </>
              ) : (
                <span className="w-full truncate text-sm text-[var(--text)]">{s.address}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
