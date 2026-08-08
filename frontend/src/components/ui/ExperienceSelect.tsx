'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, X, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EXPERIENCE_BUCKETS } from '@/constants/config';
import { usePopoverPlacement } from '@/hooks/use-popover-placement';

export interface ExperienceValue {
  min: number;
  max?: number;
}

interface ExperienceSelectProps {
  value: ExperienceValue | null;
  onChange: (val: ExperienceValue | null) => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_STYLES = {
  sm: 'h-9 text-sm',
  md: 'h-11 text-sm',
  // h-12 (48 px) matches Button lg + SearchBar lg + AutoSuggest lg so
  // hero / listing search rows have a uniform element height.
  lg: 'h-12 text-base',
};

function getLabel(val: ExperienceValue | null): string | null {
  if (!val) return null;
  const bucket = EXPERIENCE_BUCKETS.find((b) => b.min === val.min && b.max === val.max);
  if (bucket) return bucket.label;
  if (val.max == null) return `${val.min}+ years`;
  return `${val.min}-${val.max} years`;
}

export default function ExperienceSelect({
  value,
  onChange,
  size = 'md',
  className,
}: ExperienceSelectProps) {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customMin, setCustomMin] = useState('');
  const [customMax, setCustomMax] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  // EXPERIENCE_BUCKETS is ~6-8 items × 36px + custom row ≈ 320px
  const dropdownPlacement = usePopoverPlacement(containerRef, open, 320);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowCustom(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setShowCustom(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const handleSelect = useCallback(
    (bucket: (typeof EXPERIENCE_BUCKETS)[number]) => {
      onChange({ min: bucket.min, max: bucket.max });
      setOpen(false);
      setShowCustom(false);
    },
    [onChange],
  );

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange(null);
      setCustomMin('');
      setCustomMax('');
    },
    [onChange],
  );

  const handleCustomApply = useCallback(() => {
    const min = parseInt(customMin, 10);
    if (isNaN(min) || min < 0) return;
    const max = customMax ? parseInt(customMax, 10) : undefined;
    if (max !== undefined && (isNaN(max) || max <= min)) return;
    onChange({ min, max });
    setOpen(false);
    setShowCustom(false);
  }, [customMin, customMax, onChange]);

  const label = getLabel(value);
  const isActive = (bucket: (typeof EXPERIENCE_BUCKETS)[number]) =>
    value != null && value.min === bucket.min && value.max === bucket.max;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          // rounded-lg matches the rest of the search-row primitives
          // (Button, SearchBar, AutoSuggest) for uniform corner radius.
          'flex w-full items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 transition-colors',
          'focus:border-primary focus:ring-primary hover:border-[var(--text-muted)] focus:ring-1 focus:outline-none',
          SIZE_STYLES[size],
          label ? 'text-[var(--text)]' : 'text-[var(--text-muted)]',
        )}
      >
        <Briefcase className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
        <span className="truncate">{label || 'Experience'}</span>
        {value ? (
          <X
            className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] hover:text-[var(--text)]"
            onClick={handleClear}
          />
        ) : (
          <ChevronDown
            className={cn(
              'ml-auto h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-transform',
              open && 'rotate-180',
            )}
          />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className={cn(
            'absolute left-0 z-50 w-56 rounded-xl border border-[var(--border)] bg-white shadow-lg',
            dropdownPlacement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1',
          )}
        >
          <ul role="listbox" className="py-1">
            {EXPERIENCE_BUCKETS.map((bucket) => (
              <li key={bucket.label}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive(bucket)}
                  onClick={() => handleSelect(bucket)}
                  className={cn(
                    'w-full px-3 py-2 text-left text-sm transition-colors',
                    isActive(bucket)
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-[var(--text)] hover:bg-[var(--bg-secondary)]',
                  )}
                >
                  {bucket.label}
                </button>
              </li>
            ))}

            {/* Custom range */}
            <li className="border-t border-[var(--border)]">
              {!showCustom ? (
                <button
                  type="button"
                  onClick={() => setShowCustom(true)}
                  className="w-full px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                >
                  Custom range...
                </button>
              ) : (
                <div className="space-y-2 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={50}
                      placeholder="Min"
                      value={customMin}
                      onChange={(e) => setCustomMin(e.target.value)}
                      className="focus:border-primary focus:ring-primary h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 text-sm text-[var(--text)] focus:ring-1 focus:outline-none"
                    />
                    <span className="text-xs text-[var(--text-muted)]">to</span>
                    <input
                      type="number"
                      min={0}
                      max={50}
                      placeholder="Max"
                      value={customMax}
                      onChange={(e) => setCustomMax(e.target.value)}
                      className="focus:border-primary focus:ring-primary h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 text-sm text-[var(--text)] focus:ring-1 focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleCustomApply}
                    disabled={!customMin || parseInt(customMin, 10) < 0}
                    className="bg-primary hover:bg-primary/90 w-full rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50"
                  >
                    Apply
                  </button>
                </div>
              )}
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
