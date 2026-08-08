'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import {
  preferencesService,
  type SidebarPreferences,
  type UiPreferences,
} from '@/services/preferences.service';

const LS_KEY = 'ha:ui-prefs';
const QK = ['ui-prefs'] as const;
const PUT_DEBOUNCE_MS = 600;

function readLocal(): UiPreferences | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as UiPreferences) : undefined;
  } catch {
    return undefined;
  }
}

function writeLocal(prefs: UiPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(prefs));
  } catch {
    /* quota / disabled storage — non-fatal, the server copy is durable */
  }
}

/**
 * Per-user sidebar preferences (pins + per-role section expansion), synced to
 * the backend so they follow the user across devices.
 *
 *  - localStorage gives an instant, flash-free hydrate on first paint.
 *  - React Query holds the durable server value and dedupes the fetch across
 *    the desktop sidebar, the mobile drawer, and the command palette.
 *  - Writes are optimistic (cache + localStorage update immediately) and the
 *    PUT is debounced so rapid toggles (e.g. reordering pins) collapse into a
 *    single request; a pending write is flushed on unmount.
 *
 * Scoped to `role`: `expandedOverride`/`setExpanded` read+write that role's
 * open-set, so each role remembers its own layout.
 */
export function useSidebarPrefs(role: string | undefined) {
  const qc = useQueryClient();
  const { isAuthenticated } = useAuth();
  const putTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<SidebarPreferences | null>(null);

  const query = useQuery({
    queryKey: QK,
    queryFn: () => preferencesService.get(),
    enabled: isAuthenticated,
    initialData: readLocal,
    // The localStorage seed is marked stale so we still fetch the durable
    // server copy on mount (and pick up changes made on another device).
    initialDataUpdatedAt: 0,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const flush = useCallback(() => {
    if (putTimer.current) {
      clearTimeout(putTimer.current);
      putTimer.current = null;
    }
    const pending = pendingRef.current;
    if (pending) {
      pendingRef.current = null;
      preferencesService.update({ sidebar: pending }).catch(() => {});
    }
  }, []);

  // Flush any pending write when the tree unmounts (DashboardLayout remounts on
  // every navigation, so a toggle made just before navigating must not be lost).
  useEffect(() => () => flush(), [flush]);

  const prefs: UiPreferences = query.data ?? {};
  const sidebar: SidebarPreferences = prefs.sidebar ?? {};
  const pins = sidebar.pins ?? [];

  // Merge a sidebar patch, update cache + localStorage instantly, and schedule
  // a single debounced PUT of the whole sidebar object.
  const write = useCallback(
    (patch: Partial<SidebarPreferences>) => {
      const base = qc.getQueryData<UiPreferences>(QK) ?? {};
      const nextSidebar: SidebarPreferences = { ...(base.sidebar ?? {}), ...patch };
      const next: UiPreferences = { ...base, sidebar: nextSidebar };
      qc.setQueryData(QK, next);
      writeLocal(next);
      pendingRef.current = nextSidebar;
      if (putTimer.current) clearTimeout(putTimer.current);
      putTimer.current = setTimeout(flush, PUT_DEBOUNCE_MS);
    },
    [qc, flush],
  );

  // ── Pins ──
  const isPinned = useCallback((href: string) => pins.includes(href), [pins]);
  const togglePin = useCallback(
    (href: string) => {
      const next = pins.includes(href) ? pins.filter((p) => p !== href) : [...pins, href];
      write({ pins: next });
    },
    [pins, write],
  );
  const movePin = useCallback(
    (href: string, dir: -1 | 1) => {
      const idx = pins.indexOf(href);
      const swap = idx + dir;
      if (idx < 0 || swap < 0 || swap >= pins.length) return;
      const next = [...pins];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      write({ pins: next });
    },
    [pins, write],
  );

  // ── Section expansion (per role) ──
  // The stored open-set for this role, or undefined when the user has never
  // toggled a section here (⇒ the caller falls back to role defaults).
  const expandedOverride: string[] | undefined = role ? sidebar.expanded?.[role] : undefined;
  const setExpanded = useCallback(
    (labels: string[]) => {
      if (!role) return;
      const base = qc.getQueryData<UiPreferences>(QK) ?? {};
      const nextExpanded = { ...(base.sidebar?.expanded ?? {}), [role]: labels };
      write({ expanded: nextExpanded });
    },
    [role, qc, write],
  );

  return {
    ready: query.data !== undefined,
    pins,
    isPinned,
    togglePin,
    movePin,
    expandedOverride,
    setExpanded,
  };
}

export default useSidebarPrefs;
