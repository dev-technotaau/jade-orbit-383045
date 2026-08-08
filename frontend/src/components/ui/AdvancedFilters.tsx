'use client';

import { useState, useCallback, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, X, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Tooltip from './Tooltip';
import OperatorTogglePill from '@/components/job-search/OperatorTogglePill';

/* ---------- types ---------- */

export interface FacetBucket {
  key: string;
  count: number;
}

export interface FilterSection {
  /** Unique key for this filter */
  key: string;
  /** Display label */
  label: string;
  /** Type of control */
  type: 'select' | 'multiselect' | 'range' | 'checkbox' | 'radio';
  /** Options (for select, multiselect, checkbox, radio) */
  options?: Record<string, string>;
  /** Facet counts from Elasticsearch aggregations */
  facets?: FacetBucket[];
  /** Range min/max (for range type) */
  rangeMin?: number;
  rangeMax?: number;
  rangeStep?: number;
  /** Placeholder for range inputs */
  rangePlaceholderMin?: string;
  rangePlaceholderMax?: string;
  /** Range prefix (e.g., currency symbol) */
  rangePrefix?: string;
  /** Range suffix (e.g., 'years', 'LPA') */
  rangeSuffix?: string;
  /** Whether section is collapsible */
  collapsible?: boolean;
  /** Default open state */
  defaultOpen?: boolean;
}

interface AdvancedFiltersProps {
  /** Filter sections config */
  sections: FilterSection[];
  /** Current filter values */
  values: Record<string, string | undefined>;
  /** Change handler */
  onChange: (key: string, value: string | undefined) => void;
  /** Clear all */
  onClear: () => void;
  /** Active filter count */
  activeCount?: number;
  /** Title */
  title?: string;
  /** Display mode */
  layout?: 'sidebar' | 'panel' | 'inline';
  /** Additional className */
  className?: string;
  /** Whether the panel is open (used in panel/sidebar modes) */
  isOpen?: boolean;
  /** Close handler (for panel/sidebar modes) */
  onClose?: () => void;
  /** Custom header */
  header?: ReactNode;
}

/* ---------- component ---------- */

export default function AdvancedFilters({
  sections,
  values,
  onChange,
  onClear,
  activeCount = 0,
  title = 'Filters',
  layout = 'panel',
  className,
  isOpen = true,
  onClose,
  header,
}: AdvancedFiltersProps) {
  if (!isOpen) return null;

  return (
    <div
      className={cn(
        'bg-white',
        layout === 'sidebar' &&
          'w-64 shrink-0 overflow-hidden rounded-xl border border-[var(--border)]',
        layout === 'panel' && 'rounded-xl border border-[var(--border)]',
        layout === 'inline' && 'space-y-4',
        className,
      )}
    >
      {/* Header */}
      {layout !== 'inline' && (
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-[var(--text-secondary)]" />
            <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>
            {activeCount > 0 && (
              <span className="bg-primary flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white">
                {activeCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {activeCount > 0 && (
              <button
                type="button"
                onClick={onClear}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
              >
                <RotateCcw className="h-3 w-3" />
                Reset
              </button>
            )}
            {onClose && (
              <Tooltip content="Close filters">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)]"
                  aria-label="Close filters"
                >
                  <X className="h-4 w-4" />
                </button>
              </Tooltip>
            )}
          </div>
        </div>
      )}

      {header}

      {/* Filter sections */}
      <div
        className={cn(
          layout !== 'inline' && 'divide-y divide-[var(--border)]',
          layout === 'panel' && 'grid gap-0 sm:grid-cols-2 lg:grid-cols-4',
          layout === 'panel' &&
            'sm:[&>*:nth-child(2n)]:border-r-0 lg:[&>*:nth-child(4n)]:border-r-0 sm:[&>*:nth-child(n)]:border-r lg:[&>*:nth-child(n)]:border-r',
        )}
      >
        {sections.map((section) => (
          <FilterSectionBlock
            key={section.key}
            section={section}
            value={values[section.key]}
            rangeMinValue={section.type === 'range' ? values[`${section.key}Min`] : undefined}
            rangeMaxValue={section.type === 'range' ? values[`${section.key}Max`] : undefined}
            onChange={(val) => onChange(section.key, val)}
            onRangeChange={
              section.type === 'range'
                ? (minVal, maxVal) => {
                    onChange(`${section.key}Min`, minVal);
                    onChange(`${section.key}Max`, maxVal);
                  }
                : undefined
            }
            layout={layout}
          />
        ))}
      </div>
    </div>
  );
}

/* ---------- section block ---------- */

function FilterSectionBlock({
  section,
  value,
  rangeMinValue,
  rangeMaxValue,
  onChange,
  onRangeChange,
  layout,
}: {
  section: FilterSection;
  value?: string;
  rangeMinValue?: string;
  rangeMaxValue?: string;
  onChange: (value: string | undefined) => void;
  onRangeChange?: (min: string | undefined, max: string | undefined) => void;
  layout: 'sidebar' | 'panel' | 'inline';
}) {
  const [isExpanded, setIsExpanded] = useState(section.defaultOpen ?? true);
  const collapsible = section.collapsible ?? layout === 'sidebar';

  // Merge options with facet counts
  const optionsWithCounts = getOptionsWithCounts(section);

  return (
    <div
      className={cn(
        layout === 'panel' && 'p-3',
        layout === 'sidebar' && 'px-4 py-3',
        layout === 'inline' && '',
      )}
    >
      {/* Section header */}
      {collapsible ? (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex w-full items-center justify-between py-1 text-xs font-semibold tracking-wider text-[var(--text-secondary)] uppercase"
        >
          <span className="flex items-center gap-1.5">
            {section.label}
            {value && (
              <span className="bg-primary/10 text-primary flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold">
                {section.type === 'multiselect' ? value.split(/[,|]/).filter(Boolean).length : 1}
              </span>
            )}
          </span>
          {isExpanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      ) : (
        <label className="mb-1.5 block text-xs font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
          {section.label}
        </label>
      )}

      {/* Section content */}
      {(!collapsible || isExpanded) && (
        <div className={cn(collapsible && 'mt-2')}>
          {section.type === 'select' && (
            <Select
              options={optionsWithCounts.map(({ key, label, count }) => ({
                value: key,
                label: count !== undefined ? `${label} (${count})` : label,
              }))}
              value={value || ''}
              onChange={(v) => onChange(v || undefined)}
              placeholder="All"
            />
          )}

          {section.type === 'multiselect' && (
            <>
              {/* AND/OR operator toggle pill — when 2+ values are
                  selected, surfaces the search semantics and lets the
                  user flip between "all of" (AND, comma-separated) and
                  "any of" (OR, pipe-separated). Per Phase 19 + plan
                  §3.3 of the master plan. */}
              {value && (value.includes(',') || value.includes('|')) && (
                <div className="mb-2 flex items-center justify-end">
                  <OperatorTogglePill
                    value={value.includes('|') ? 'OR' : 'AND'}
                    onChange={(nextOp) => {
                      // Flip the joiner without re-parsing values.
                      const positives = value.split(/[,|]/).filter(Boolean);
                      onChange(positives.join(nextOp === 'OR' ? '|' : ',') || undefined);
                    }}
                  />
                </div>
              )}
              <div
                data-lenis-prevent
                className="max-h-48 space-y-1 overflow-y-auto overscroll-contain"
              >
                {optionsWithCounts.map(({ key, label, count }) => {
                  // Parse with both `,` and `|` separators so the
                  // checkbox state survives operator toggling.
                  const sep = value && value.includes('|') ? '|' : ',';
                  const selectedValues = value ? value.split(/[,|]/).filter(Boolean) : [];
                  const isChecked = selectedValues.includes(key);
                  return (
                    <label
                      key={key}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors',
                        isChecked
                          ? 'text-primary bg-[var(--primary-light)]'
                          : 'text-[var(--text)] hover:bg-[var(--bg-secondary)]',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          const newValues = isChecked
                            ? selectedValues.filter((v) => v !== key)
                            : [...selectedValues, key];
                          onChange(newValues.length > 0 ? newValues.join(sep) : undefined);
                        }}
                        className="text-primary focus:ring-primary/20 h-3.5 w-3.5 rounded border-[var(--border)]"
                      />
                      <span className="flex-1 truncate text-sm">{label}</span>
                      {count !== undefined && (
                        <span className="shrink-0 text-xs text-[var(--text-muted)]">
                          {count.toLocaleString()}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </>
          )}

          {section.type === 'radio' && (
            <div className="space-y-1">
              <label
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors',
                  !value
                    ? 'text-primary bg-[var(--primary-light)]'
                    : 'text-[var(--text)] hover:bg-[var(--bg-secondary)]',
                )}
              >
                <input
                  type="radio"
                  name={section.key}
                  value=""
                  checked={!value}
                  onChange={() => onChange(undefined)}
                  className="text-primary focus:ring-primary/20 h-3.5 w-3.5 border-[var(--border)]"
                />
                <span>All</span>
              </label>
              {optionsWithCounts.map(({ key, label, count }) => (
                <label
                  key={key}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors',
                    value === key
                      ? 'text-primary bg-[var(--primary-light)]'
                      : 'text-[var(--text)] hover:bg-[var(--bg-secondary)]',
                  )}
                >
                  <input
                    type="radio"
                    name={section.key}
                    value={key}
                    checked={value === key}
                    onChange={() => onChange(key)}
                    className="text-primary focus:ring-primary/20 h-3.5 w-3.5 border-[var(--border)]"
                  />
                  <span className="flex-1 truncate">{label}</span>
                  {count !== undefined && (
                    <span className="shrink-0 text-xs text-[var(--text-muted)]">
                      {count.toLocaleString()}
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}

          {section.type === 'checkbox' && (
            <div className="space-y-1">
              {optionsWithCounts.map(({ key, label, count }) => {
                const isChecked = value === key;
                return (
                  <label
                    key={key}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors',
                      isChecked
                        ? 'text-primary bg-[var(--primary-light)]'
                        : 'text-[var(--text)] hover:bg-[var(--bg-secondary)]',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => onChange(isChecked ? undefined : key)}
                      className="text-primary focus:ring-primary/20 h-3.5 w-3.5 rounded border-[var(--border)]"
                    />
                    <span className="flex-1 truncate">{label}</span>
                    {count !== undefined && (
                      <span className="shrink-0 text-xs text-[var(--text-muted)]">
                        {count.toLocaleString()}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}

          {section.type === 'range' && (
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                {section.rangePrefix && (
                  <span className="absolute top-1/2 left-2.5 -translate-y-1/2 text-xs text-[var(--text-muted)]">
                    {section.rangePrefix}
                  </span>
                )}
                <input
                  type="number"
                  placeholder={section.rangePlaceholderMin ?? 'Min'}
                  value={rangeMinValue ?? ''}
                  onChange={(e) => onRangeChange?.(e.target.value || undefined, rangeMaxValue)}
                  step={section.rangeStep}
                  min={section.rangeMin}
                  max={section.rangeMax}
                  className={cn(
                    'h-8 w-full rounded-lg border border-[var(--border)] bg-white text-sm text-[var(--text)]',
                    'focus:border-primary focus:ring-primary/20 focus:ring-2 focus:outline-none',
                    'placeholder:text-[var(--text-muted)]',
                    section.rangePrefix ? 'pr-2 pl-6' : 'px-2.5',
                  )}
                />
              </div>
              <span className="text-xs text-[var(--text-muted)]">to</span>
              <div className="relative flex-1">
                {section.rangePrefix && (
                  <span className="absolute top-1/2 left-2.5 -translate-y-1/2 text-xs text-[var(--text-muted)]">
                    {section.rangePrefix}
                  </span>
                )}
                <input
                  type="number"
                  placeholder={section.rangePlaceholderMax ?? 'Max'}
                  value={rangeMaxValue ?? ''}
                  onChange={(e) => onRangeChange?.(rangeMinValue, e.target.value || undefined)}
                  step={section.rangeStep}
                  min={section.rangeMin}
                  max={section.rangeMax}
                  className={cn(
                    'h-8 w-full rounded-lg border border-[var(--border)] bg-white text-sm text-[var(--text)]',
                    'focus:border-primary focus:ring-primary/20 focus:ring-2 focus:outline-none',
                    'placeholder:text-[var(--text-muted)]',
                    section.rangePrefix ? 'pr-2 pl-6' : 'px-2.5',
                  )}
                />
              </div>
              {section.rangeSuffix && (
                <span className="shrink-0 text-xs text-[var(--text-muted)]">
                  {section.rangeSuffix}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- helpers ---------- */

function getOptionsWithCounts(
  section: FilterSection,
): Array<{ key: string; label: string; count?: number }> {
  const options = section.options || {};
  const facetMap = new Map((section.facets || []).map((f) => [f.key, f.count]));

  return Object.entries(options).map(([key, label]) => ({
    key,
    label,
    count: facetMap.get(key),
  }));
}

/* ---------- filter tag pills ---------- */

export function ActiveFilterTags({
  sections,
  values,
  onChange,
  onClear,
  className,
}: {
  sections: FilterSection[];
  values: Record<string, string | undefined>;
  onChange: (key: string, value: string | undefined) => void;
  onClear: () => void;
  className?: string;
}) {
  const activeTags: Array<{ key: string; label: string; displayValue: string }> = [];

  sections.forEach((section) => {
    if (section.type === 'range') {
      const minVal = values[`${section.key}Min`];
      const maxVal = values[`${section.key}Max`];
      if (minVal || maxVal) {
        const prefix = section.rangePrefix ?? '';
        const suffix = section.rangeSuffix ?? '';
        let display = '';
        if (minVal && maxVal) {
          display = `${prefix}${minVal}${suffix} – ${prefix}${maxVal}${suffix}`;
        } else if (minVal) {
          display = `${prefix}${minVal}${suffix}+`;
        } else {
          display = `Up to ${prefix}${maxVal}${suffix}`;
        }
        activeTags.push({ key: section.key, label: section.label, displayValue: display });
      }
    } else {
      const val = values[section.key];
      if (val) {
        const options = section.options || {};
        if (section.type === 'multiselect') {
          // Operator-aware: "any of" / "all of" / "except". Reflects
          // the URL grammar (`,` AND, `|` OR, `!` NOT prefix).
          const isOr = val.includes('|');
          const tokens = val.split(/[,|]/).filter(Boolean);
          const positives = tokens.filter((t) => !t.startsWith('!'));
          const negatives = tokens.filter((t) => t.startsWith('!')).map((t) => t.slice(1));
          const positiveLabels = positives.map((v) => options[v] || v).join(', ');
          const negativeLabels = negatives.map((v) => options[v] || v).join(', ');
          let display = positiveLabels;
          if (negativeLabels) {
            display = display
              ? `${display} · except ${negativeLabels}`
              : `except ${negativeLabels}`;
          }
          // Operator hint annotates how 2+ positives combine.
          const opHint = positives.length >= 2 ? ` (${isOr ? 'any of' : 'all of'})` : '';
          activeTags.push({
            key: section.key,
            label: `${section.label}${opHint}`,
            displayValue: display,
          });
        } else {
          activeTags.push({
            key: section.key,
            label: section.label,
            displayValue: options[val] || val,
          });
        }
      }
    }
  });

  if (activeTags.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {activeTags.map((tag) => (
        <span
          key={tag.key}
          className="text-primary inline-flex items-center gap-1 rounded-full bg-[var(--primary-light)] px-2.5 py-1 text-xs font-medium"
        >
          <span className="text-primary/70">{tag.label}:</span>
          <span>{tag.displayValue}</span>
          <Tooltip content={`Remove ${tag.label} filter`}>
            <button
              type="button"
              onClick={() => {
                const section = sections.find((s) => s.key === tag.key);
                if (section?.type === 'range') {
                  onChange(`${tag.key}Min`, undefined);
                  onChange(`${tag.key}Max`, undefined);
                } else {
                  onChange(tag.key, undefined);
                }
              }}
              className="hover:bg-primary/10 ml-0.5 rounded-full p-0.5 transition-colors"
              aria-label={`Remove ${tag.label} filter`}
            >
              <X className="h-3 w-3" />
            </button>
          </Tooltip>
        </span>
      ))}
      <button
        type="button"
        onClick={onClear}
        className="hover:text-primary text-xs text-[var(--text-muted)] transition-colors"
      >
        Clear all
      </button>
    </div>
  );
}
