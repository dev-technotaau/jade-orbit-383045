// ── Inbox filters in the address bar ─────────────────────────────────────────
//
// Every inbox filter used to be a bare `useState`, which meant none of them had
// an address. An operator who narrowed to "unassigned, awaiting reply, billing
// label" could not bookmark that queue, could not paste it to a colleague, could
// not open it in a second tab, and could not Back out of one filter change — the
// browser's Back button walked them off the page instead. A reload put them back
// at the unfiltered inbox with no sign anything had been lost.
//
// Modelled on `wa-open-conv.ts`: the query string is the single source of truth,
// read through `useSyncExternalStore`, written with the native history API. No
// `useSearchParams`, so no Suspense boundary is dragged into the page.

/** Which slice of the inbox is shown. Mirrors the page's `ScopeFilter`. */
export type InboxScope = 'active' | 'archived' | 'snoozed' | 'all';
/** Conversation ordering. Mirrors the server's `ConversationSort`. */
export type InboxSort = 'recent' | 'oldest' | 'waiting';

export interface WaInboxFilterState {
  q: string;
  unread: boolean;
  searchMessages: boolean;
  /** 'all' = any status; otherwise a WaConversationStatus. */
  status: string;
  /** 'all' | 'me' | 'unassigned' — the page's own vocabulary, kept verbatim. */
  assignee: string;
  label: string;
  channel: string;
  scope: InboxScope;
  sort: InboxSort;
  awaiting: boolean;
  /** Inclusive YYYY-MM-DD bounds on last activity; '' = unbounded. */
  from: string;
  to: string;
}

/**
 * The unfiltered inbox.
 *
 * Frozen and module-level because it doubles as the `useSyncExternalStore`
 * SERVER snapshot — that call must return the same reference every time or React
 * loops forever comparing it with `Object.is`.
 */
export const DEFAULT_INBOX_FILTERS: WaInboxFilterState = Object.freeze({
  q: '',
  unread: false,
  searchMessages: false,
  status: 'all',
  assignee: 'all',
  label: '',
  channel: '',
  scope: 'active',
  sort: 'recent',
  awaiting: false,
  from: '',
  to: '',
});

/** Query-string keys, short because they share the bar with `?c=`. */
const KEYS = {
  q: 'q',
  unread: 'unread',
  searchMessages: 'msgs',
  status: 'status',
  assignee: 'assignee',
  label: 'label',
  channel: 'channel',
  scope: 'scope',
  sort: 'sort',
  awaiting: 'awaiting',
  from: 'from',
  to: 'to',
} as const;

const SCOPES: InboxScope[] = ['active', 'archived', 'snoozed', 'all'];
const SORTS: InboxSort[] = ['recent', 'oldest', 'waiting'];

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((cb) => cb());
}

/**
 * The last parsed snapshot, keyed by the search string it came from.
 *
 * `useSyncExternalStore` compares snapshots with `Object.is`, so returning a
 * freshly-built object on every call is an infinite render loop — the store
 * would look changed on every check. The cache makes the reference stable for as
 * long as the URL is.
 */
let cache: { search: string; value: WaInboxFilterState } | null = null;

function parse(search: string): WaInboxFilterState {
  const p = new URLSearchParams(search);
  const scope = p.get(KEYS.scope) as InboxScope | null;
  const sort = p.get(KEYS.sort) as InboxSort | null;
  return {
    q: p.get(KEYS.q) ?? '',
    unread: p.get(KEYS.unread) === '1',
    searchMessages: p.get(KEYS.searchMessages) === '1',
    status: p.get(KEYS.status) ?? 'all',
    assignee: p.get(KEYS.assignee) ?? 'all',
    label: p.get(KEYS.label) ?? '',
    channel: p.get(KEYS.channel) ?? '',
    // An unrecognised value falls back to the default rather than being trusted:
    // the URL is user-editable and a hand-typed `scope=archive` should show the
    // active inbox, not an empty list nothing explains.
    scope: scope && SCOPES.includes(scope) ? scope : 'active',
    sort: sort && SORTS.includes(sort) ? sort : 'recent',
    awaiting: p.get(KEYS.awaiting) === '1',
    from: p.get(KEYS.from) ?? '',
    to: p.get(KEYS.to) ?? '',
  };
}

/** Current filters, from the address bar. */
export function getInboxFilters(): WaInboxFilterState {
  if (typeof window === 'undefined') return DEFAULT_INBOX_FILTERS;
  const search = window.location.search;
  if (cache && cache.search === search) return cache.value;
  const value = parse(search);
  cache = { search, value };
  return value;
}

/**
 * Merge a partial change into the address bar.
 *
 * Only keys that DIFFER from the default are written; the rest are deleted, so
 * an unfiltered inbox has a clean URL and a shared link carries exactly the
 * filters the sender could see.
 *
 * `?c=` is never touched — the open thread and the filters are independent, and
 * changing a filter must not close the conversation being read.
 *
 * `replace` is for changes that stream (typing in the search box): pushing one
 * history entry per keystroke would make Back useless. Discrete choices push, so
 * Back steps through them.
 */
export function setInboxFilters(
  patch: Partial<WaInboxFilterState>,
  opts: { replace?: boolean } = {}
): void {
  if (typeof window === 'undefined') return;
  const next: WaInboxFilterState = { ...getInboxFilters(), ...patch };
  const url = new URL(window.location.href);

  const put = (key: string, value: string, isDefault: boolean) => {
    if (isDefault) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  };

  put(KEYS.q, next.q, !next.q);
  put(KEYS.unread, '1', !next.unread);
  put(KEYS.searchMessages, '1', !next.searchMessages);
  put(KEYS.status, next.status, !next.status || next.status === 'all');
  put(KEYS.assignee, next.assignee, !next.assignee || next.assignee === 'all');
  put(KEYS.label, next.label, !next.label);
  put(KEYS.channel, next.channel, !next.channel);
  put(KEYS.scope, next.scope, next.scope === 'active');
  put(KEYS.sort, next.sort, next.sort === 'recent');
  put(KEYS.awaiting, '1', !next.awaiting);
  put(KEYS.from, next.from, !next.from);
  put(KEYS.to, next.to, !next.to);

  const target = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (target === current) return;
  if (opts.replace) window.history.replaceState(window.history.state, '', target);
  else window.history.pushState(window.history.state, '', target);
  notify();
}

export function subscribeInboxFilters(cb: () => void): () => void {
  listeners.add(cb);
  // Back/Forward rewrite the query string without going through
  // `setInboxFilters`, so the store has to re-read the URL on a history change.
  if (typeof window !== 'undefined' && listeners.size === 1) {
    window.addEventListener('popstate', notify);
  }
  return () => {
    listeners.delete(cb);
    if (typeof window !== 'undefined' && listeners.size === 0) {
      window.removeEventListener('popstate', notify);
    }
  };
}

/** Whether anything is narrowed — drives the "Clear filters" affordance. */
export function hasActiveInboxFilters(f: WaInboxFilterState): boolean {
  return (
    !!f.q ||
    f.unread ||
    f.searchMessages ||
    (!!f.status && f.status !== 'all') ||
    (!!f.assignee && f.assignee !== 'all') ||
    !!f.label ||
    !!f.channel ||
    f.scope !== 'active' ||
    f.sort !== 'recent' ||
    f.awaiting ||
    !!f.from ||
    !!f.to
  );
}
