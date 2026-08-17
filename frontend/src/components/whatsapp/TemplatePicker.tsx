'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePopoverPlacement } from '@/hooks/use-popover-placement';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { ApiResponse } from '@/types/api';
import type { WaTemplate } from '@/types/whatsapp';

/**
 * One page of picker results. Deliberately small: the list is a typeahead, so
 * the server does the matching and there is no reason to ship the catalogue to
 * the browser. Every picker used to ask for `limit: 100` and render a plain
 * <Select> over the result — on a WABA with more than 100 approved templates
 * (routine once you multiply brands by languages) the rest simply did not
 * appear in any send, campaign, sequence, schedule or keyword-rule picker, with
 * no error to explain the absence.
 */
const PAGE_SIZE = 25;
const DEBOUNCE_MS = 250;

/** Height estimate for the flip-up decision: search row + max-h-60 list + footer. */
const DROPDOWN_HEIGHT = 340;

const optionSubtitle = (t: WaTemplate) => `${t.language} · ${t.category}`;
const triggerLabel = (t: WaTemplate) => `${t.name} (${t.language})`;

/**
 * Resolve stored template ids to the templates themselves, one cached query per
 * id. Read-only surfaces (a launched sequence's steps, a rule's reply column)
 * hold nothing but an id, and they used to look it up in the same capped list —
 * so past the cap they printed a raw cuid where a template name belongs.
 */
export function useTemplatesByIds(
  ids: Array<string | null | undefined>,
): (id: string) => WaTemplate | null {
  const unique = [...new Set(ids.filter((x): x is string => !!x))].sort();

  const results = useQueries({
    queries: unique.map((id) => ({
      queryKey: ['wa-template', id],
      queryFn: () => svc.getTemplate(id),
    })),
  });

  const byId = new Map<string, WaTemplate>();
  results.forEach((r, i) => {
    const tpl = r.data?.data;
    if (tpl) byId.set(unique[i], tpl);
  });
  return (id: string) => byId.get(id) ?? null;
}

interface TemplatePickerProps {
  label?: string;
  /** Selected template id — `''` when nothing is picked. */
  value: string;
  /**
   * Fires when the operator picks (or clears) a template. Hands back the whole
   * template, not just its id: every call site needs `components` to know which
   * parameters to ask for, and it can no longer find the template in a local list.
   */
  onChange: (template: WaTemplate | null) => void;
  /**
   * Fires once when the picker resolves an id it was handed — an existing rule,
   * a saved sequence step — into the full template. Kept separate from
   * `onChange` so a caller can reset its parameter inputs on a real change
   * without wiping the values it just loaded from the server.
   */
  onResolve?: (template: WaTemplate) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

/**
 * Approved-template picker with server-side search. Shared by every surface
 * that sends a template, so all of them page and filter the catalogue the same
 * way instead of each fetching the first N and hoping.
 */
export default function TemplatePicker({
  label,
  value,
  onChange,
  onResolve,
  placeholder = 'Select an approved template',
  disabled = false,
  required,
  className,
}: TemplatePickerProps) {
  const qc = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const placement = usePopoverPlacement(containerRef, isOpen, DROPDOWN_HEIGHT);

  // Debounced so a fast typist fires one request, not one per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isFetching } = useQuery({
    queryKey: ['wa-templates', 'picker', query],
    queryFn: () =>
      svc.listTemplates({ status: 'APPROVED', q: query || undefined, limit: PAGE_SIZE }),
  });
  const items = data?.data?.items ?? [];
  const total = data?.data?.total ?? 0;
  const catalogueEmpty = !query && !isFetching && total === 0;

  // The selection is resolved by id as well as from the current page, because it
  // has to survive a search that excludes it — reading it from the page alone
  // meant typing a filter blanked the template the operator had already picked.
  const { data: byIdData } = useQuery({
    queryKey: ['wa-template', value],
    queryFn: () => svc.getTemplate(value),
    enabled: !!value,
  });
  const fromPage = items.find((t) => t.id === value) ?? null;
  const selected = fromPage ?? (byIdData?.data?.id === value ? byIdData.data : null);

  // Hand the caller the full template behind an id it supplied itself. Without
  // this an edit form knows the id but not the components, so the parameter
  // inputs for an already-configured template would never render.
  const resolvedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!value || !selected || selected.id !== value) return;
    if (resolvedRef.current === value) return;
    resolvedRef.current = value;
    onResolve?.(selected);
  }, [value, selected, onResolve]);

  const [dropdownPos, setDropdownPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  // Dropdown is portalled to <body> with `position: fixed` so it is not clipped
  // by the scrolling modal bodies these pickers live in.
  const updateDropdownPos = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const height = dropdownRef.current?.offsetHeight ?? DROPDOWN_HEIGHT;
    const GAP = 4; // matches the mt-1 / mb-1 spacing used elsewhere
    setDropdownPos({
      top: placement === 'top' ? rect.top - height - GAP : rect.bottom + GAP,
      left: rect.left,
      width: rect.width,
    });
  }, [placement]);

  useLayoutEffect(() => {
    if (!isOpen) {
      // Deferred so the reset does not run synchronously inside the effect body
      // (eslint-flagged, and it cascades re-renders). The dropdown is unmounting
      // either way, so nothing is visible.
      queueMicrotask(() => setDropdownPos(null));
      return;
    }
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

  const close = useCallback(() => {
    setIsOpen(false);
    setSearch('');
    setQuery('');
  }, []);

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      const target = e.target as Node;
      // The dropdown lives in a portal, so containerRef does not contain it.
      if (containerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      close();
    },
    [close],
  );

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [handleClickOutside]);

  useEffect(() => {
    if (isOpen) searchInputRef.current?.focus();
  }, [isOpen]);

  const pick = (tpl: WaTemplate) => {
    // Seed the by-id cache with what we already hold, so naming the selection
    // costs no extra request — here or in the read-only lists that resolve the
    // same key.
    qc.setQueryData<ApiResponse<WaTemplate>>(['wa-template', tpl.id], {
      status: 'success',
      message: '',
      data: tpl,
    });
    resolvedRef.current = tpl.id;
    onChange(tpl);
    close();
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    resolvedRef.current = null;
    onChange(null);
  };

  return (
    <div className={cn('w-full', className)} ref={containerRef}>
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
          {label}
          {required && <span className="text-error ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          onClick={() => !disabled && (isOpen ? close() : setIsOpen(true))}
          className={cn(
            'flex h-10 w-full items-center justify-between rounded-lg border border-[var(--border)] bg-white px-3 text-sm text-[var(--text)] transition-colors duration-200',
            'focus:border-primary focus:ring-primary/20 focus:ring-2 focus:outline-none',
            'disabled:cursor-not-allowed disabled:bg-[var(--bg-secondary)] disabled:opacity-60',
            isOpen && 'border-primary ring-primary/20 ring-2',
          )}
        >
          <span className="truncate text-left">
            {selected ? (
              triggerLabel(selected)
            ) : (
              <span className="text-[var(--text-muted)]">
                {catalogueEmpty ? 'No approved templates — sync first' : placeholder}
              </span>
            )}
          </span>
          <div className="ml-2 flex shrink-0 items-center gap-1">
            {!!value && !disabled && (
              <span
                role="button"
                tabIndex={-1}
                onClick={clear}
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

        {isOpen &&
          typeof window !== 'undefined' &&
          createPortal(
            <div
              ref={dropdownRef}
              onKeyDown={(e) => e.key === 'Escape' && close()}
              style={
                dropdownPos
                  ? {
                      position: 'fixed',
                      top: dropdownPos.top,
                      left: dropdownPos.left,
                      minWidth: dropdownPos.width,
                      width: 'max-content',
                      maxWidth: Math.max(
                        dropdownPos.width,
                        Math.min(400, window.innerWidth - dropdownPos.left - 8),
                      ),
                    }
                  : { position: 'fixed', top: -9999, left: -9999 }
              }
              className="animate-slide-down z-[60] rounded-lg border border-[var(--border)] bg-white shadow-lg"
            >
              <div className="border-b border-[var(--border)] p-2">
                <div className="relative">
                  <Search className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search templates by name…"
                    className="focus:border-primary focus:ring-primary/20 w-full rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] py-1.5 pr-8 pl-8 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:ring-1 focus:outline-none"
                  />
                  {isFetching && (
                    <Loader2 className="absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--text-muted)]" />
                  )}
                </div>
              </div>
              <div data-lenis-prevent className="max-h-60 overflow-y-auto overscroll-contain p-1">
                {items.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">
                    {isFetching
                      ? 'Searching…'
                      : query
                        ? `No approved template matches “${query}”`
                        : 'No approved templates — sync from Meta first'}
                  </div>
                ) : (
                  items.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => pick(tpl)}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors duration-150',
                        'hover:bg-[var(--bg-secondary)]',
                        tpl.id === value && 'text-primary bg-[var(--primary-light)] font-medium',
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{tpl.name}</span>
                        <span className="block truncate text-xs text-[var(--text-muted)]">
                          {optionSubtitle(tpl)}
                        </span>
                      </span>
                      {tpl.id === value && <Check className="text-primary h-4 w-4 shrink-0" />}
                    </button>
                  ))
                )}
              </div>
              {total > items.length && (
                <p className="border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)]">
                  Showing {items.length} of {total} — type to narrow the list.
                </p>
              )}
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
}
