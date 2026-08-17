/**
 * Offline outbox for the WhatsApp inbox composer.
 *
 * The console is an installable PWA whose service worker skips every non-GET
 * request, so a reply typed with no connection produced a red bubble the
 * operator had to remember to retry by hand — and that bubble lived in page
 * state, which is dropped the moment they switch conversations or reload. The
 * reply was simply gone, with nothing anywhere to say a customer had been left
 * waiting.
 *
 * This is the durable half: entries survive reload and tab close in IndexedDB,
 * and are drained by the page when connectivity returns. Deliberately NOT the
 * Background Sync API — that is Chromium-only, and replaying the send from the
 * service worker would mean rebuilding the CSRF header the axios client attaches,
 * so the drain runs in the page against the ordinary authenticated client.
 */

const DB_NAME = 'ha-wa-outbox';
const DB_VERSION = 1;
const STORE = 'messages';

/** Cross-tab mutual exclusion for the drain (see `drainOutbox`). */
const DRAIN_LOCK = 'ha-wa-outbox-drain';

/**
 * How long a queued reply stays sendable.
 *
 * WhatsApp only accepts a free-form reply inside the 24-hour customer-service
 * window, so an entry older than that cannot be delivered as typed — draining it
 * would spend a request to earn a WA_WINDOW_CLOSED rejection. Expired entries are
 * reported to the caller instead, which is the only chance the operator gets to
 * learn the reply never went out.
 */
export const OUTBOX_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Entries kept at most. A long offline session on a busy console must not grow
 * unbounded in the origin's storage quota; past this the OLDEST entry is
 * dropped, because it is the one closest to expiring anyway.
 */
export const OUTBOX_MAX = 200;

/** Transport failures tolerated before an entry is given up on. */
const MAX_ATTEMPTS = 5;

export interface OutboxMessage {
  /** Also the optimistic bubble's id, so the thread renders it in place. */
  id: string;
  conversationId: string;
  text: string;
  contextWamid?: string;
  /** ISO timestamp of when the operator pressed Send. */
  createdAt: string;
  /** Drain attempts made so far. */
  attempts: number;
}

/** Why an entry left the outbox without being delivered. */
export type OutboxDropReason = 'expired' | 'rejected' | 'exhausted';

export interface OutboxDrop {
  entry: OutboxMessage;
  reason: OutboxDropReason;
  /** Server message, for a `rejected` drop. */
  message?: string;
}

export interface DrainResult {
  sent: number;
  /** Entries removed without being delivered — the operator has to be told. */
  dropped: OutboxDrop[];
  /** Entries still queued afterwards (transport is still down). */
  remaining: number;
}

/**
 * Change notifications, so a surface that does not own the queue (the global
 * offline banner) can show what is waiting without polling IndexedDB on a timer.
 * Same-tab only — a drain in another tab is that tab's business.
 */
const listeners = new Set<() => void>();

export function subscribeOutbox(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifyOutboxChanged(): void {
  for (const fn of listeners) fn();
}

/** IndexedDB is absent in SSR and in a few privacy modes; the outbox degrades to off. */
export function outboxSupported(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase | null> {
  if (!outboxSupported()) return Promise.resolve(null);
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    // A blocked or failed open must never take the composer down with it —
    // resolving null falls back to the old in-memory FAILED bubble.
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

async function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise<T | null>((resolve) => {
    const close = () => {
      try {
        db.close();
      } catch {
        /* already closing */
      }
    };
    try {
      const transaction = db.transaction(STORE, mode);
      const request = run(transaction.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      transaction.oncomplete = close;
      transaction.onabort = () => {
        close();
        resolve(null);
      };
    } catch {
      close();
      resolve(null);
    }
  });
}

/** Everything queued, oldest first — the order it has to be sent in. */
export async function listOutbox(): Promise<OutboxMessage[]> {
  const rows = (await tx<OutboxMessage[]>('readonly', (s) => s.getAll())) ?? [];
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function enqueueOutbox(
  entry: Omit<OutboxMessage, 'attempts'> & { attempts?: number },
): Promise<void> {
  await tx('readwrite', (s) => s.put({ attempts: 0, ...entry }));
  const all = await listOutbox();
  // Oldest first, so trimming the head sheds the entries closest to expiring.
  for (const stale of all.slice(0, Math.max(0, all.length - OUTBOX_MAX))) {
    await removeOutbox(stale.id);
  }
  notifyOutboxChanged();
}

export async function removeOutbox(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
  notifyOutboxChanged();
}

export async function clearOutbox(): Promise<void> {
  await tx('readwrite', (s) => s.clear());
  notifyOutboxChanged();
}

/**
 * Send everything queued, oldest first. Resolves `null` when another tab already
 * holds the drain lock and this call did nothing.
 *
 * `send` is the page's authenticated send call. It must reject with the API
 * client's shape: `statusCode: 0` means the request never reached the server
 * (still offline — stop and keep the rest queued), any other code is a real
 * server answer and the entry is dropped rather than retried forever.
 *
 * Stops at the first transport failure. Sending out of order would reorder the
 * operator's own replies in the customer's chat, which reads as a different
 * conversation than the one they wrote.
 */
export async function drainOutbox(
  send: (entry: OutboxMessage) => Promise<unknown>,
): Promise<DrainResult | null> {
  const run = async (): Promise<DrainResult> => {
    // Listed INSIDE the lock: another tab may have drained and removed entries
    // between this call being scheduled and the lock being granted.
    const queued = await listOutbox();
    const now = Date.now();
    const sentDropped: OutboxDrop[] = [];
    let sent = 0;

    for (const entry of queued) {
      if (now - new Date(entry.createdAt).getTime() > OUTBOX_TTL_MS) {
        await removeOutbox(entry.id);
        sentDropped.push({ entry, reason: 'expired' });
        continue;
      }
      try {
        await send(entry);
        await removeOutbox(entry.id);
        sent++;
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 0 || statusCode === undefined) {
          // Never left the machine. Bank the attempt and stop — the entries
          // behind it would fail identically, and each failure costs a timeout.
          const attempts = entry.attempts + 1;
          if (attempts >= MAX_ATTEMPTS) {
            await removeOutbox(entry.id);
            sentDropped.push({ entry, reason: 'exhausted' });
          } else {
            await tx('readwrite', (s) => s.put({ ...entry, attempts }));
          }
          break;
        }
        // A real rejection (window closed, contact blocked, validation): a retry
        // reproduces it exactly, so surface it once and let it go.
        await removeOutbox(entry.id);
        sentDropped.push({
          entry,
          reason: 'rejected',
          message: (err as { message?: string })?.message,
        });
      }
    }
    return { sent, dropped: sentDropped, remaining: (await listOutbox()).length };
  };

  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) return run();
  // ifAvailable: a second tab that finds the lock held does NOTHING rather than
  // waiting its turn and then re-sending — the send endpoint carries no
  // idempotency key, so a double drain puts the same reply in front of the
  // customer twice.
  return locks.request(DRAIN_LOCK, { ifAvailable: true }, (lock) => (lock ? run() : null));
}
