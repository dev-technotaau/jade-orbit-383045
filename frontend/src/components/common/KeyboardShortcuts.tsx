'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Search, CornerDownLeft } from 'lucide-react';
import { cn, resolveActiveNavHref } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { useEntitlements } from '@/hooks/use-entitlements';
import { usePermissions } from '@/hooks/use-permissions';
import { useSidebarPrefs } from '@/hooks/use-sidebar-prefs';
import {
  getNavStructure,
  filterStructureByFeature,
  buildNavFilter,
} from '@/components/layout/Sidebar';
import type { LucideIcon } from 'lucide-react';

interface PaletteItem {
  label: string;
  href: string;
  icon: LucideIcon;
  group: string;
}

const RECENT_KEY = 'ha:sidebar-recent';
const RECENT_MAX = 8;

function readRecents(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function pushRecent(href: string): void {
  if (typeof window === 'undefined') return;
  try {
    const next = [href, ...readRecents().filter((h) => h !== href)].slice(0, RECENT_MAX);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/**
 * ⌘/Ctrl+K command palette. Indexes EVERY sidebar destination for the current
 * role straight from `getNavStructure` (so it can never drift from the real
 * nav), honouring entitlement gating. Empty query surfaces the user's pinned +
 * recent destinations; typing fuzzy-matches label + section.
 */
export default function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const { hasFeature, isLoading: entLoading } = useEntitlements();
  const { can, canAny, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const { pins } = useSidebarPrefs(user?.role);

  /**
   * The palette indexes the SAME nav tree as the sidebar, so it must apply
   * the SAME filter. It previously evaluated only `requiresFeature`, which
   * meant Ctrl+K listed every super-admin destination — "Manage Admins",
   * "Admin Control Centre" and ~70 others — to any admin, regardless of
   * grants. Reusing `buildNavFilter` guarantees the two can never diverge
   * again.
   *
   * The permission inputs must stay in the dep array: `can`/`canAny` are
   * `useCallback`s whose identity changes exactly when grants arrive, and
   * the filter is pessimistic while loading — omitting them would freeze an
   * empty list.
   */
  const allItems = useMemo<PaletteItem[]>(() => {
    const structure = filterStructureByFeature(
      getNavStructure(user?.role),
      buildNavFilter({
        hasFeature,
        entitlementsLoading: entLoading,
        can,
        canAny,
        isSuperAdmin,
        permissionsLoading,
      }),
    );
    const items: PaletteItem[] = [];
    structure.top.forEach((i) =>
      items.push({ label: i.label, href: i.href, icon: i.icon, group: '' }),
    );
    structure.groups.forEach((g) =>
      g.items.forEach((i) =>
        items.push({ label: i.label, href: i.href, icon: i.icon, group: g.label }),
      ),
    );
    return items;
  }, [user?.role, hasFeature, entLoading, can, canAny, isSuperAdmin, permissionsLoading]);

  const byHref = useMemo(() => new Map(allItems.map((i) => [i.href, i])), [allItems]);

  // Record the current route (resolved to its nav destination) as recent.
  useEffect(() => {
    const active = resolveActiveNavHref(
      allItems.map((i) => i.href),
      pathname,
    );
    if (active) pushRecent(active);
  }, [pathname, allItems]);

  // ⌘/Ctrl+K toggles the palette.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((p) => !p);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      queueMicrotask(() => setSelected(0));
      setTimeout(() => inputRef.current?.focus(), 40);
    } else {
      queueMicrotask(() => setQuery(''));
    }
  }, [open]);

  const q = query.trim().toLowerCase();
  const results = useMemo<PaletteItem[]>(() => {
    if (!q) {
      const pinned = pins.map((h) => byHref.get(h)).filter((i): i is PaletteItem => Boolean(i));
      const seen = new Set(pinned.map((i) => i.href));
      const merged = [...pinned];
      readRecents().forEach((h) => {
        const item = byHref.get(h);
        if (item && !seen.has(h)) {
          seen.add(h);
          merged.push(item);
        }
      });
      return merged.slice(0, 8);
    }
    return allItems.filter(
      (i) => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q),
    );
  }, [q, allItems, pins, byHref]);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const go = (href: string) => {
    setOpen(false);
    pushRecent(href);
    router.push(href);
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter' && results[selected]) {
      e.preventDefault();
      go(results[selected].href);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[500] flex items-start justify-center pt-[15vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      <div className="animate-scale-in relative z-10 w-full max-w-xl rounded-2xl border border-[var(--border)] bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
          <Search className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Jump to any page…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            onKeyDown={onKeyDown}
            className="flex-1 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
          />
          <kbd className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
            Esc
          </kbd>
        </div>

        <div data-lenis-prevent className="max-h-80 overflow-y-auto p-2">
          {!q && results.length > 0 && (
            <p className="px-3 pt-1 pb-1.5 text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">
              Quick access
            </p>
          )}
          {results.length > 0 ? (
            results.map((item, i) => {
              const Icon = item.icon;
              const isSel = i === selected;
              return (
                <button
                  key={item.href}
                  ref={isSel ? selectedRef : undefined}
                  onClick={() => go(item.href)}
                  onMouseMove={() => setSelected(i)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                    isSel
                      ? 'bg-[var(--bg-secondary)] text-[var(--text)]'
                      : 'text-[var(--text-secondary)]',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.group && (
                    <span className="truncate text-xs text-[var(--text-muted)]">{item.group}</span>
                  )}
                  {isSel && (
                    <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                  )}
                </button>
              );
            })
          ) : (
            <p className="px-3 py-8 text-center text-sm text-[var(--text-muted)]">
              {q ? 'No matching pages' : 'Start typing to search pages'}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--text-muted)]">
          <span className="flex items-center gap-1">
            <kbd className="rounded bg-[var(--bg-secondary)] px-1 py-0.5 font-mono">↑</kbd>
            <kbd className="rounded bg-[var(--bg-secondary)] px-1 py-0.5 font-mono">↓</kbd>
            to navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded bg-[var(--bg-secondary)] px-1 py-0.5 font-mono">↵</kbd>
            to open
          </span>
        </div>
      </div>
    </div>
  );
}
