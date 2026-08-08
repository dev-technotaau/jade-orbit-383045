import { Search, X } from 'lucide-react';
import Select from '@/components/ui/Select';

interface FilterOption {
  label: string;
  value: string;
}

interface SelectFilter {
  key: string;
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (next: string) => void;
}

interface Props {
  search?: {
    value: string;
    onChange: (next: string) => void;
    placeholder?: string;
  };
  filters?: SelectFilter[];
  rightSlot?: React.ReactNode;
}

/**
 * Reusable filter bar for super-admin list pages — search input + multiple
 * select dropdowns + optional right-side slot for action buttons.
 */
export default function AdminFilterBar({ search, filters, rightSlot }: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      {search ? (
        <div className="relative min-w-[220px] flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[var(--text-secondary)]"
            size={14}
          />
          <input
            type="search"
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder ?? 'Search…'}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] py-2 pr-8 pl-8 text-sm text-[var(--text)] focus:border-blue-500 focus:outline-none"
          />
          {search.value ? (
            <button
              type="button"
              onClick={() => search.onChange('')}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-0.5 text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
      ) : null}

      {(filters ?? []).map((f) => (
        <label
          key={f.key}
          htmlFor={`admin-filter-${f.key}`}
          className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]"
        >
          <span>{f.label}:</span>
          <Select
            id={`admin-filter-${f.key}`}
            value={f.value}
            onChange={(val) => f.onChange(val)}
            options={f.options}
            size="sm"
            clearable={false}
            className="min-w-[10rem]"
          />
        </label>
      ))}

      {rightSlot ? <div className="ml-auto">{rightSlot}</div> : null}
    </div>
  );
}
