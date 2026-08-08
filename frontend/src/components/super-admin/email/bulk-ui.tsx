'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Check, Minus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Shared multi-select UI for the email admin lists — a sticky bulk action bar
 * plus header/row checkboxes. Pairs with the `useBulkSelect` hook. Light-mode
 * styling to match the rest of the email panel.
 */

interface BulkBarProps {
  /** Explicit selected count (ignored when allMatching). */
  count: number;
  allMatching: boolean;
  /** Total records matching the active filter (drives the "select all N" affordance). */
  totalMatching: number;
  /** Whether every id on the current page is selected (gates the select-all banner). */
  allOnPage: boolean;
  entity: string; // noun, e.g. "contacts", "threads"
  onSelectAllMatching: () => void;
  onClear: () => void;
  children: ReactNode; // action buttons
  /** Offer "select all N matching filter" (only for surfaces whose bulk endpoints accept a filter). */
  allowSelectAll?: boolean;
}

export function BulkBar({
  count,
  allMatching,
  totalMatching,
  allOnPage,
  entity,
  onSelectAllMatching,
  onClear,
  children,
  allowSelectAll = true,
}: BulkBarProps) {
  const showSelectAll = allowSelectAll && !allMatching && allOnPage && totalMatching > count;
  return (
    <div className="border-primary/30 bg-primary/5 sticky top-0 z-20 mb-3 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2.5 shadow-sm">
      <span className="text-sm font-semibold text-[var(--text)]">
        {allMatching
          ? `All ${totalMatching.toLocaleString()} ${entity} selected`
          : `${count} selected`}
      </span>
      {showSelectAll && (
        <button
          type="button"
          onClick={onSelectAllMatching}
          className="text-primary text-sm font-medium underline-offset-2 hover:underline"
        >
          Select all {totalMatching.toLocaleString()} matching filter
        </button>
      )}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {children}
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-[var(--text-muted)] hover:bg-black/5 hover:text-[var(--text)]"
        >
          <X className="h-3.5 w-3.5" /> Clear
        </button>
      </div>
    </div>
  );
}

/** A bulk-bar action button. */
export function BulkButton({
  onClick,
  icon: Icon,
  children,
  danger = false,
  disabled = false,
}: {
  onClick: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  children: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        danger
          ? 'border-error/40 text-error hover:bg-error/10'
          : 'border-[var(--border)] bg-white text-[var(--text)] hover:bg-black/5',
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

/** Header checkbox with an indeterminate state (some-but-not-all selected). */
export function HeaderCheckbox({
  checked,
  indeterminate,
  onChange,
  title,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: (on: boolean) => void;
  title?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked]);
  return (
    <label className="inline-flex cursor-pointer items-center" title={title}>
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        className={cn(
          'flex h-[18px] w-[18px] items-center justify-center rounded border border-[var(--border)] bg-white transition-colors',
          (checked || indeterminate) && 'border-primary bg-primary',
        )}
      >
        {checked ? (
          <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
        ) : indeterminate ? (
          <Minus className="h-3.5 w-3.5 text-white" strokeWidth={3} />
        ) : null}
      </span>
    </label>
  );
}

/** Row selection checkbox. */
export function RowCheckbox({
  checked,
  onChange,
  onClick,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center" onClick={onClick}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        className={cn(
          'flex h-[18px] w-[18px] items-center justify-center rounded border border-[var(--border)] bg-white transition-colors',
          checked && 'border-primary bg-primary',
        )}
      >
        {checked && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
      </span>
    </label>
  );
}
