'use client';

import { useCallback, useMemo, useState } from 'react';

/**
 * Multi-select state for list surfaces with an enterprise "select-all-across-filter"
 * mode. Two selection modes:
 *  - explicit ids (user checks individual rows / the current page), OR
 *  - `allMatching` — act on EVERY record matching the active filter (across pages).
 *
 * The two are mutually exclusive: engaging `allMatching` clears explicit ids and
 * vice-versa. Pages read `allMatching` to decide whether to send `{ ids }` or
 * `{ filter }` to a bulk endpoint.
 */
export interface BulkSelect {
  /** Explicit selected ids (empty when allMatching). */
  ids: string[];
  idSet: Set<string>;
  /** Count of explicitly-selected ids (0 when allMatching). */
  count: number;
  /** True once the user opts into "all N matching the filter". */
  allMatching: boolean;
  /** Any selection active (explicit ids OR allMatching). */
  active: boolean;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  /** Select/clear every id on the current page. */
  setPage: (pageIds: string[], on: boolean) => void;
  /** True when every id on the page is selected (and there is at least one). */
  allOnPage: (pageIds: string[]) => boolean;
  someOnPage: (pageIds: string[]) => boolean;
  /** Engage "all matching filter" mode. */
  selectAllMatching: () => void;
  /** Reset all selection. */
  clear: () => void;
}

export function useBulkSelect(): BulkSelect {
  const [idSet, setIdSet] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);

  const toggle = useCallback((id: string) => {
    setAllMatching(false);
    setIdSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setPage = useCallback((pageIds: string[], on: boolean) => {
    setAllMatching(false);
    setIdSet((prev) => {
      const next = new Set(prev);
      for (const id of pageIds) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const selectAllMatching = useCallback(() => {
    setAllMatching(true);
    setIdSet(new Set());
  }, []);

  const clear = useCallback(() => {
    setAllMatching(false);
    setIdSet(new Set());
  }, []);

  const isSelected = useCallback(
    (id: string) => allMatching || idSet.has(id),
    [allMatching, idSet],
  );

  const allOnPage = useCallback(
    (pageIds: string[]) => pageIds.length > 0 && pageIds.every((id) => idSet.has(id)),
    [idSet],
  );
  const someOnPage = useCallback(
    (pageIds: string[]) => pageIds.some((id) => idSet.has(id)),
    [idSet],
  );

  return useMemo(
    () => ({
      ids: [...idSet],
      idSet,
      count: idSet.size,
      allMatching,
      active: allMatching || idSet.size > 0,
      isSelected,
      toggle,
      setPage,
      allOnPage,
      someOnPage,
      selectAllMatching,
      clear,
    }),
    [
      idSet,
      allMatching,
      isSelected,
      toggle,
      setPage,
      allOnPage,
      someOnPage,
      selectAllMatching,
      clear,
    ],
  );
}

/** Trigger a browser download of a Blob (CSV/XLSX export helper). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
