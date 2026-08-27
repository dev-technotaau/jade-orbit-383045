/**
 * Per-conversation composer drafts, persisted across reloads.
 *
 * The composer used to hold ONE draft string for the whole inbox. Switching
 * conversations did not clear it — the switch block resets eleven other pieces
 * of state and never touched this one — so half-typed text for customer A stayed
 * in the box when the operator opened customer B, and a single Enter sent it.
 * The Cloud API has no unsend, so that is unrecoverable.
 *
 * Keying by conversation removes the hazard by construction rather than by
 * remembering to reset: a switch derives an empty box because the map has no
 * entry for that id yet, exactly as `mediaPick` already scopes itself by
 * `convId`.
 *
 * Persistence is a second, smaller win: the composer unmounts when the 24h
 * window closes and on any reload, and the text was simply gone.
 */

const KEY = 'wa-drafts';

/** Drop drafts older than this so the key cannot grow without bound. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Never let one runaway draft (a pasted document) blow the storage quota. */
const MAX_DRAFT_CHARS = 8000;

interface StoredDraft {
  text: string;
  at: number;
}

/**
 * Read the saved drafts, pruning anything stale.
 *
 * Every access is guarded: localStorage throws in a private window, when site
 * data is blocked, and during SSR there is no `window` at all. A composer that
 * cannot restore a draft must still open.
 */
export function loadDrafts(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const cutoff = Date.now() - MAX_AGE_MS;
    const out: Record<string, string> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, StoredDraft>)) {
      if (!value || typeof value.text !== 'string' || typeof value.at !== 'number') continue;
      if (value.at < cutoff || !value.text) continue;
      out[id] = value.text.slice(0, MAX_DRAFT_CHARS);
    }
    return out;
  } catch {
    return {};
  }
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Save the map, debounced.
 *
 * Called on every keystroke, so the write itself is deferred — a synchronous
 * localStorage write per character is the kind of thing that makes a composer
 * feel heavy on a long message.
 */
export function persistDrafts(drafts: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    try {
      const at = Date.now();
      const payload: Record<string, StoredDraft> = {};
      for (const [id, text] of Object.entries(drafts)) {
        if (!text) continue;
        payload[id] = { text: text.slice(0, MAX_DRAFT_CHARS), at };
      }
      window.localStorage.setItem(KEY, JSON.stringify(payload));
    } catch {
      // Quota or a blocked store — the in-memory map still works for this session.
    }
  }, 400);
}
