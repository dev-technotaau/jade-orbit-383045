// ── Open-conversation persistence (per device) ───────────────────────────────
// Keep the open WhatsApp thread selected across reloads so a refresh doesn't
// dump the agent back to the empty inbox — and let other pages (e.g. the
// Platform Users list) deep-link straight into a conversation. Backed by
// localStorage + a tiny subscribable store, read through useSyncExternalStore
// (no hydration mismatch, no setState-in-effect, no useSearchParams/Suspense
// build wrinkle).
const OPEN_CONV_KEY = 'wa-open-conversation';
const openConvListeners = new Set<() => void>();

export function getOpenConv(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(OPEN_CONV_KEY);
  } catch {
    return null;
  }
}

export function setOpenConv(id: string | null): void {
  if (typeof window !== 'undefined') {
    try {
      if (id) window.localStorage.setItem(OPEN_CONV_KEY, id);
      else window.localStorage.removeItem(OPEN_CONV_KEY);
    } catch {
      /* ignore */
    }
  }
  openConvListeners.forEach((cb) => cb());
}

export function subscribeOpenConv(cb: () => void): () => void {
  openConvListeners.add(cb);
  return () => {
    openConvListeners.delete(cb);
  };
}
