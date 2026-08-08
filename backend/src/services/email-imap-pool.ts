import { ImapFlow } from 'imapflow';
import logger from '../config/logger';

/**
 * A tiny per-account IMAP connection pool for the one-on-one webmail client.
 * Holds one long-lived ImapFlow per account (TLS handshake is expensive), runs
 * operations serialized per account (a promise chain — so concurrent webmail
 * requests never corrupt the shared connection's selected-mailbox state), and
 * logs the connection out after an idle period.
 */

export interface ImapCreds {
  id: string; // account id — the pool key
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

interface PoolEntry {
  client: ImapFlow;
  evictTimer: NodeJS.Timeout | null;
}

const POOL = new Map<string, PoolEntry>();
// Per-account serialization chains, keyed by the STABLE account id (not the
// mutable PoolEntry) so a mid-flight reconnect can never reset serialization.
const CHAINS = new Map<string, Promise<unknown>>();
const IDLE_MS = 5 * 60 * 1000;

function makeClient(creds: ImapCreds): ImapFlow {
  return new ImapFlow({
    host: creds.host,
    port: creds.port,
    secure: creds.secure,
    auth: { user: creds.user, pass: creds.pass },
    logger: false,
    // Keep webmail responsive; drop dead sockets rather than hang a request.
    socketTimeout: 90_000,
    greetingTimeout: 20_000,
    connectionTimeout: 20_000,
  });
}

async function connect(creds: ImapCreds): Promise<PoolEntry> {
  const client = makeClient(creds);
  client.on('error', (err: Error) => logger.debug(`IMAP pool ${creds.id} error: ${err.message}`));
  client.on('close', () => {
    const e = POOL.get(creds.id);
    if (e && e.client === client) POOL.delete(creds.id);
  });
  await client.connect();
  const entry: PoolEntry = { client, evictTimer: null };
  POOL.set(creds.id, entry);
  return entry;
}

async function ensureEntry(creds: ImapCreds): Promise<PoolEntry> {
  const existing = POOL.get(creds.id);
  if (existing && existing.client.usable) return existing;
  if (existing) POOL.delete(creds.id);
  return connect(creds);
}

function scheduleEvict(id: string): void {
  const entry = POOL.get(id);
  if (!entry) return;
  if (entry.evictTimer) clearTimeout(entry.evictTimer);
  entry.evictTimer = setTimeout(() => {
    const e = POOL.get(id);
    if (e) {
      POOL.delete(id);
      CHAINS.delete(id);
      e.client.logout().catch(() => {});
    }
  }, IDLE_MS);
}

/**
 * Run an IMAP operation against the account connection, serialized per account.
 * Reconnects transparently if the pooled connection has dropped.
 */
export async function withImap<T>(
  creds: ImapCreds,
  fn: (client: ImapFlow) => Promise<T>
): Promise<T> {
  let entry = await ensureEntry(creds);
  if (entry.evictTimer) {
    clearTimeout(entry.evictTimer);
    entry.evictTimer = null;
  }

  const prev = CHAINS.get(creds.id) ?? Promise.resolve();
  const run = prev.then(async () => {
    if (!entry.client.usable) entry = await ensureEntry(creds);
    return fn(entry.client);
  });
  // Keep the chain alive across failures so serialization never breaks; keyed by
  // the stable id so a reconnect swapping the PoolEntry can't reset it.
  CHAINS.set(
    creds.id,
    run.then(
      () => undefined,
      () => undefined
    )
  );

  try {
    return (await run) as T;
  } catch (err) {
    if (!entry.client.usable) POOL.delete(creds.id);
    throw err;
  } finally {
    scheduleEvict(creds.id);
  }
}

/** Drop a pooled connection (e.g. after credentials change / account delete). */
export function evictImap(id: string): void {
  const e = POOL.get(id);
  CHAINS.delete(id);
  if (e) {
    if (e.evictTimer) clearTimeout(e.evictTimer);
    POOL.delete(id);
    e.client.logout().catch(() => {});
  }
}

/** Graceful shutdown — logout every pooled connection. */
export async function closeAllImap(): Promise<void> {
  const entries = [...POOL.values()];
  POOL.clear();
  CHAINS.clear();
  await Promise.allSettled(
    entries.map((e) => {
      if (e.evictTimer) clearTimeout(e.evictTimer);
      return e.client.logout().catch(() => {});
    })
  );
}
