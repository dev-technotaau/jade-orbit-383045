'use client';

/**
 * Inline AND/OR toggle pill rendered inside multi-value filter sections
 * (skills, designations, etc.). Gives users explicit control over how
 * the values combine in the search query.
 *
 * Default operator is AND (most users expect "all-of" behaviour). The
 * pill is intentionally subtle — power users see it; everyone else
 * keeps the AND default. The actual operator is serialised into the
 * URL via `?op=AND` / `?op=OR` (or per-field overrides in the URL
 * grammar if we expand later).
 */

import { cn } from '@/lib/utils';

type Op = 'AND' | 'OR';

interface Props {
  value: Op;
  onChange: (next: Op) => void;
  /** Localised labels — defaults to "any of" / "all of". */
  labels?: { AND: string; OR: string };
  className?: string;
}

export default function OperatorTogglePill({
  value,
  onChange,
  labels = { AND: 'all of', OR: 'any of' },
  className,
}: Props) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg-secondary)] p-0.5 text-xs',
        className,
      )}
      role="group"
      aria-label="Combine values with"
    >
      {(['AND', 'OR'] as const).map((op) => (
        <button
          key={op}
          type="button"
          onClick={() => onChange(op)}
          className={cn(
            'rounded-full px-2.5 py-0.5 font-semibold transition-colors',
            value === op
              ? 'bg-white text-[var(--text)] shadow-sm'
              : 'text-[var(--text-muted)] hover:text-[var(--text)]',
          )}
          aria-pressed={value === op}
        >
          {labels[op]}
        </button>
      ))}
    </div>
  );
}
