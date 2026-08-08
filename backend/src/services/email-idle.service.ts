import { ImapFlow } from 'imapflow';
import logger from '../config/logger';
import type { ImapCreds } from './email-imap-pool';

/**
 * Real-time new-mail push for the one-on-one webmail. Holds a dedicated IMAP
 * connection per (account, folder) that keeps the mailbox open; imapflow
 * auto-enters IDLE and emits `exists`/`expunge`/`flags`, which we relay to
 * subscribed sockets. Ref-counted: the connection is torn down when the last
 * subscriber leaves, and transparently reconnects while subscribers remain.
 */

export interface MailboxUpdate {
  folder: string;
  type: 'exists' | 'expunge' | 'flags';
  count?: number;
}

type UpdateCb = (u: MailboxUpdate) => void;

interface Watcher {
  client: ImapFlow | null;
  accountId: string;
  folder: string;
  cbs: Set<UpdateCb>;
  closing: boolean;
  reconnectTimer: NodeJS.Timeout | null;
}

const WATCHERS = new Map<string, Watcher>(); // key: `${accountId}::${folder}`
const MAX_WATCHERS = 60;

const keyOf = (accountId: string, folder: string): string => `${accountId}::${folder}`;

function makeIdleClient(creds: ImapCreds): ImapFlow {
  return new ImapFlow({
    host: creds.host,
    port: creds.port,
    secure: creds.secure,
    auth: { user: creds.user, pass: creds.pass },
    logger: false,
    // Break + restart IDLE periodically so long-lived NAT/firewall paths and
    // servers that cap IDLE duration don't silently drop the connection.
    maxIdleTime: 4 * 60 * 1000,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
  });
}

async function startClient(creds: ImapCreds, w: Watcher): Promise<void> {
  const client = makeIdleClient(creds);
  w.client = client;

  const fire = (type: MailboxUpdate['type'], count?: number) => {
    for (const cb of w.cbs) {
      try {
        cb({ folder: w.folder, type, count });
      } catch {
        /* a bad subscriber must not break the others */
      }
    }
  };

  client.on('exists', (d: { count: number }) => fire('exists', d.count));
  client.on('expunge', () => fire('expunge'));
  client.on('flags', () => fire('flags'));
  client.on('error', (err: Error) =>
    logger.debug(`IMAP idle ${w.accountId} error: ${err.message}`)
  );
  client.on('close', () => {
    if (w.closing || w.cbs.size === 0) return;
    if (!w.reconnectTimer) {
      w.reconnectTimer = setTimeout(() => {
        w.reconnectTimer = null;
        if (w.closing || w.cbs.size === 0) return;
        startClient(creds, w).catch((err) =>
          logger.debug(`IMAP idle reconnect ${w.accountId} failed: ${(err as Error).message}`)
        );
      }, 5_000);
    }
  });

  await client.connect();
  await client.mailboxOpen(w.folder);
  // imapflow auto-idles now (autoidle) and emits exists/expunge/flags.
}

/**
 * Subscribe to live updates for an account's folder. Returns an unsubscribe fn.
 * Multiple subscribers share one connection; the last to leave closes it.
 */
export async function watchMailbox(
  creds: ImapCreds,
  folder: string,
  cb: UpdateCb
): Promise<() => void> {
  const key = keyOf(creds.id, folder);
  let w = WATCHERS.get(key);

  if (!w) {
    if (WATCHERS.size >= MAX_WATCHERS) {
      logger.warn(`IMAP idle watcher cap reached (${MAX_WATCHERS}); not watching ${key}`);
      return () => {};
    }
    w = {
      client: null,
      accountId: creds.id,
      folder,
      cbs: new Set(),
      closing: false,
      reconnectTimer: null,
    };
    WATCHERS.set(key, w);
    try {
      await startClient(creds, w);
    } catch (err) {
      WATCHERS.delete(key);
      logger.debug(`IMAP idle start ${key} failed: ${(err as Error).message}`);
      return () => {};
    }
  }

  w.cbs.add(cb);
  return () => {
    const cur = WATCHERS.get(key);
    if (!cur) return;
    cur.cbs.delete(cb);
    if (cur.cbs.size === 0) stopWatcher(key);
  };
}

function stopWatcher(key: string): void {
  const w = WATCHERS.get(key);
  if (!w) return;
  w.closing = true;
  if (w.reconnectTimer) clearTimeout(w.reconnectTimer);
  WATCHERS.delete(key);
  w.client?.logout().catch(() => {});
}

/** Drop all watchers for an account (e.g. creds changed / account deleted). */
export function stopAccountWatchers(accountId: string): void {
  for (const key of [...WATCHERS.keys()]) {
    if (key.startsWith(`${accountId}::`)) stopWatcher(key);
  }
}

/** Graceful shutdown — logout every idle connection. */
export async function closeAllWatchers(): Promise<void> {
  const ws = [...WATCHERS.values()];
  WATCHERS.clear();
  await Promise.allSettled(
    ws.map((w) => {
      w.closing = true;
      if (w.reconnectTimer) clearTimeout(w.reconnectTimer);
      return w.client?.logout().catch(() => {});
    })
  );
}
