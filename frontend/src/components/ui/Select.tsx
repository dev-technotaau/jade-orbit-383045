'use client';

import { useState, useRef, useEffect, useCallback, useLayoutEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { ChevronDown, Check, Search, X } from 'lucide-react';
import { usePopoverPlacement } from '@/hooks/use-popover-placement';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectBaseProps {
  label?: string;
  options: SelectOption[];
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  className?: string;
  id?: string;
  required?: boolean;
  /**
   * Trigger size — controls the button height. Defaults to `md`
   * (h-10) to match the rest of our form controls. Use `lg` (h-12)
   * when the Select sits next to a same-row Input that's also h-12
   * (the help-page language picker is the canonical example).
   */
  size?: 'sm' | 'md' | 'lg';
  /**
   * Whether to show the clear (×) icon when the Select has a value.
   * Defaults to `true` for back-compat. Set `false` on Selects that
   * must always have a value (language pickers, mandatory enums)
   * where "no selection" isn't a meaningful state.
   */
  clearable?: boolean;
}

const sizeClasses: Record<NonNullable<SelectBaseProps['size']>, string> = {
  sm: 'h-8 text-sm',
  md: 'h-10 text-sm',
  lg: 'h-12 text-base',
};

interface SingleSelectProps extends SelectBaseProps {
  multiple?: false;
  value: string;
  onChange: (value: string) => void;
}

interface MultiSelectProps extends SelectBaseProps {
  multiple: true;
  value: string[];
  onChange: (value: string[]) => void;
}

type SelectProps = SingleSelectProps | MultiSelectProps;

function Select({
  label,
  options,
  value,
  onChange,
  error,
  placeholder = 'Select an option',
  disabled = false,
  searchable = false,
  multiple = false,
  className,
  id,
  required,
  size = 'md',
  clearable = true,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');
  // Search bar (~48px if searchable) + list (max-h-60 = 240px) + borders
  const dropdownPlacement = usePopoverPlacement(containerRef, isOpen, searchable ? 320 : 280);

  // Dropdown is portalled to <body> so it isn't clipped by ancestor
  // `overflow-hidden` containers (e.g. the help-page hero with its
  // decorative gradient). Recompute viewport-relative coords whenever
  // the dropdown opens, the window scrolls/resizes, or placement
  // flips between top/bottom.
  const [dropdownPos, setDropdownPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const updateDropdownPos = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const dropdownEl = dropdownRef.current;
    // Estimate dropdown height ahead of mount (matches the
    // usePopoverPlacement estimate). After mount we have the real
    // element height so use it for the second-pass adjustment.
    const estimatedHeight = dropdownEl?.offsetHeight ?? (searchable ? 320 : 280);
    const GAP = 4; // matches the `mt-1` / `mb-1` Tailwind spacing
    setDropdownPos({
      top: dropdownPlacement === 'top' ? rect.top - estimatedHeight - GAP : rect.bottom + GAP,
      left: rect.left,
      width: rect.width,
    });
  }, [dropdownPlacement, searchable]);

  useLayoutEffect(() => {
    if (!isOpen) {
      // Defer the close-state reset via microtask so the
      // setState doesn't execute synchronously inside the
      // effect body (eslint-flagged + cascades re-renders).
      // Visually identical since the dropdown is unmounting.
      queueMicrotask(() => setDropdownPos(null));
      return;
    }
    // First position pass after one rAF — the portalled
    // dropdown has had a frame to mount, so its offsetHeight
    // is real (not the fallback estimate). Initial render uses
    // the off-screen `top: -9999` fallback style until this
    // settles, so users never see an unpositioned flash.
    // Second rAF re-measures in case the first call landed
    // before paint — covers a corner case where the dropdown's
    // own children animate in (e.g. searchable input fade).
    const r1 = requestAnimationFrame(updateDropdownPos);
    const r2 = requestAnimationFrame(updateDropdownPos);
    window.addEventListener('scroll', updateDropdownPos, true);
    window.addEventListener('resize', updateDropdownPos);
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
      window.removeEventListener('scroll', updateDropdownPos, true);
      window.removeEventListener('resize', updateDropdownPos);
    };
  }, [isOpen, updateDropdownPos]);

  const filteredOptions =
    searchable && search
      ? options.filter((opt) => opt.label.toLowerCase().includes(search.toLowerCase()))
      : options;

  const handleClickOutside = useCallback((e: MouseEvent) => {
    const target = e.target as Node;
    // Dropdown lives in a portal, so containerRef won't contain it.
    // Check both the trigger wrapper AND the portalled dropdown
    // before deciding it's an outside click.
    if (containerRef.current?.contains(target)) return;
    if (dropdownRef.current?.contains(target)) return;
    setIsOpen(false);
    setSearch('');
  }, []);

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [handleClickOutside]);

  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, searchable]);

  const handleSelect = (optionValue: string) => {
    if (multiple) {
      const currentValues = value as string[];
      const multiOnChange = onChange as (value: string[]) => void;
      if (currentValues.includes(optionValue)) {
        multiOnChange(currentValues.filter((v) => v !== optionValue));
      } else {
        multiOnChange([...currentValues, optionValue]);
      }
    } else {
      (onChange as (value: string) => void)(optionValue);
      setIsOpen(false);
      setSearch('');
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (multiple) {
      (onChange as (value: string[]) => void)([]);
    } else {
      (onChange as (value: string) => void)('');
    }
  };

  const getDisplayValue = (): ReactNode => {
    if (multiple) {
      const currentValues = value as string[];
      if (currentValues.length === 0)
        return <span className="text-[var(--text-muted)]">{placeholder}</span>;
      if (currentValues.length === 1) {
        return options.find((o) => o.value === currentValues[0])?.label || placeholder;
      }
      return `${currentValues.length} selected`;
    }
    const selected = options.find((o) => o.value === (value as string));
    return selected ? (
      selected.label
    ) : (
      <span className="text-[var(--text-muted)]">{placeholder}</span>
    );
  };

  const hasValue = multiple ? (value as string[]).length > 0 : !!(value as string);

  return (
    <div className={cn('w-full', className)} ref={containerRef}>
      {label && (
        <label htmlFor={selectId} className="mb-1.5 block text-sm font-medium text-[var(--text)]">
          {label}
          {required && <span className="text-error ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        <button
          ref={triggerRef}
          id={selectId}
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className={cn(
            'flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-white px-3 text-[var(--text)] transition-colors duration-200',
            sizeClasses[size],
            'focus:border-primary focus:ring-primary/20 focus:ring-2 focus:outline-none',
            'disabled:cursor-not-allowed disabled:bg-[var(--bg-secondary)] disabled:opacity-60',
            isOpen && 'border-primary ring-primary/20 ring-2',
            error && 'border-error focus:border-error focus:ring-error/20',
          )}
        >
          <span className="truncate text-left">{getDisplayValue()}</span>
          <div className="ml-2 flex shrink-0 items-center gap-1">
            {clearable && hasValue && !disabled && (
              <span
                role="button"
                tabIndex={-1}
                onClick={handleClear}
                className="cursor-pointer p-0.5 text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronDown
              className={cn(
                'h-4 w-4 text-[var(--text-muted)] transition-transform duration-200',
                isOpen && 'rotate-180',
              )}
            />
          </div>
        </button>

        {/* Dropdown is portalled to <body> with `position: fixed` so
            it escapes ancestor `overflow-hidden` clipping (e.g. the
            help-page hero gradient section). Coordinates are
            computed from the trigger's getBoundingClientRect() and
            kept in sync with scroll/resize via useLayoutEffect. */}
        {isOpen &&
          typeof window !== 'undefined' &&
          createPortal(
            <div
              ref={dropdownRef}
              style={
                dropdownPos
                  ? {
                      position: 'fixed',
                      top: dropdownPos.top,
                      left: dropdownPos.left,
                      // At least trigger-width, but free to grow to fit
                      // option labels (narrow sidebar selects would
                      // otherwise clamp the list), capped to the viewport.
                      minWidth: dropdownPos.width,
                      width: 'max-content',
                      maxWidth: Math.max(
                        dropdownPos.width,
                        Math.min(352, window.innerWidth - dropdownPos.left - 8),
                      ),
                    }
                  : { position: 'fixed', top: -9999, left: -9999 }
              }
              className="animate-slide-down z-[60] rounded-lg border border-[var(--border)] bg-white shadow-lg"
            >
              {searchable && (
                <div className="border-b border-[var(--border)] p-2">
                  <div className="relative">
                    <Search className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search..."
                      className="focus:border-primary focus:ring-primary/20 w-full rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] py-1.5 pr-3 pl-8 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:ring-1 focus:outline-none"
                    />
                  </div>
                </div>
              )}
              <div data-lenis-prevent className="max-h-60 overflow-y-auto overscroll-contain p-1">
                {filteredOptions.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">
                    No options found
                  </div>
                ) : (
                  filteredOptions.map((option) => {
                    const isSelected = multiple
                      ? (value as string[]).includes(option.value)
                      : (value as string) === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleSelect(option.value)}
                        className={cn(
                          'flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors duration-150',
                          'hover:bg-[var(--bg-secondary)]',
                          isSelected && 'text-primary bg-[var(--primary-light)] font-medium',
                        )}
                      >
                        <span className="truncate">{option.label}</span>
                        {isSelected && <Check className="text-primary h-4 w-4 shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>,
            document.body,
          )}
      </div>
      {error && <p className="text-error mt-1 text-sm">{error}</p>}
    </div>
  );
}

Select.displayName = 'Select';

export default Select;
