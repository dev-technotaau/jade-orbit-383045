// ── Open-conversation permalink + last-thread restore (per device) ───────────
// The open WhatsApp thread lives in the query string — `/whatsapp?c=<id>` — so
// a conversation has an address: it can be bookmarked, pasted into a ticket,
// opened in a second tab, linked to from the contacts table, and walked back
// through with the browser Back button. The selection used to live only in
// localStorage, which meant none of that worked: Back did nothing inside the
// inbox, nothing in the app could link to a thread, and two tabs sharing the
// single storage key yanked each other's selection on reload.
//
// localStorage is kept purely as the "restore my last thread on a bare
// /whatsapp" default, applied once by restoreOpenConv() on mount. After that
// the URL is the only source of truth, so history navigation genuinely moves
// the selection instead of being overridden by the stored id.
//
// Read through useSyncExternalStore (no hydration mismatch, no
// setState-in-effect, no useSearchParams/Suspense build wrinkle).
const OPEN_CONV_KEY = 'wa-open-conversation';

/** Query-string parameter carrying the open conversation id. */
export const OPEN_CONV_PARAM = 'c';

const openConvListeners = new Set<() => void>();

function notifyOpenConv(): void {
  openConvListeners.forEach((cb) => cb());
}

function readStoredConv(): string | null {
  try {
    return window.localStorage.getItem(OPEN_CONV_KEY);
  } catch {
    return null;
  }
}

function writeStoredConv(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(OPEN_CONV_KEY, id);
    else window.localStorage.removeItem(OPEN_CONV_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Put `id` in the address bar. The native history API is picked up by the App
 * Router and costs no server request, which is why this does not go through
 * `router` (and so does not drag `useSearchParams` + a Suspense boundary into
 * the page).
 *
 * `replace` is for the mount-time restore, where there is no user action worth
 * a history entry; every real selection pushes, and that is what makes Back
 * step through the threads the operator opened.
 */
function writeOpenConvUrl(id: string | null, replace: boolean): void {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set(OPEN_CONV_PARAM, id);
  else url.searchParams.delete(OPEN_CONV_PARAM);
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  // Re-selecting the open thread must not stack a duplicate history entry.
  if (next === current) return;
  if (replace) window.history.replaceState(null, '', next);
  else window.history.pushState(null, '', next);
}

export function getOpenConv(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(OPEN_CONV_PARAM) || null;
}

export function setOpenConv(id: string | null, options?: { replace?: boolean }): void {
  if (typeof window !== 'undefined') {
    writeStoredConv(id);
    writeOpenConvUrl(id, options?.replace === true);
  }
  notifyOpenConv();
}

/**
 * Mount-time seeding for the inbox. An explicit `?c=` wins — a shared link has
 * to open the thread it names — otherwise the last thread this device had open
 * is restored and written into the URL, so the bare /whatsapp the operator
 * landed on immediately becomes a shareable address too.
 */
export function restoreOpenConv(): void {
  if (typeof window === 'undefined') return;
  setOpenConv(getOpenConv() ?? readStoredConv(), { replace: true });
}

export function subscribeOpenConv(cb: () => void): () => void {
  openConvListeners.add(cb);
  // Back/Forward rewrite `?c=` without going through setOpenConv, so the store
  // has to re-read the URL whenever the history entry changes.
  if (typeof window !== 'undefined' && openConvListeners.size === 1) {
    window.addEventListener('popstate', notifyOpenConv);
  }
  return () => {
    openConvListeners.delete(cb);
    if (typeof window !== 'undefined' && openConvListeners.size === 0) {
      window.removeEventListener('popstate', notifyOpenConv);
    }
  };
}
