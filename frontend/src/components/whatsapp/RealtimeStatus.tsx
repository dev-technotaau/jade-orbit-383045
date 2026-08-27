'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, ZapOff } from 'lucide-react';
import { useSocket } from '@/hooks/use-socket';
import { cn } from '@/lib/utils';

/**
 * Whether live updates are actually arriving.
 *
 * The socket can be down while the inbox still looks alive: the conversation
 * list polls every 60s and the sidebar badge refetches on focus, so the row
 * preview and unread count keep advancing — but the open thread has no
 * `refetchInterval`, so it simply stops. The operator sees a queue that moves
 * above a conversation that does not, with nothing anywhere saying push is down.
 *
 * Deliberately quiet: nothing renders while connected, and nothing renders for
 * the first few seconds of a reconnect either, because Socket.IO drops and
 * recovers routinely and a chip that flickers on every blip is noise the
 * operator learns to ignore.
 *
 * `OfflineBanner` answers a different question — the BROWSER is offline. This
 * one fires when the browser is online and the realtime channel still is not,
 * which is the case nothing covered.
 */

/** Don't say anything until a disconnect has lasted this many ticks. */
const QUIET_SECONDS = 3;

/** Past this, stop calling it a reconnect and offer the manual escape. */
const STALE_SECONDS = 30;

export default function RealtimeStatus({ onRetry }: { onRetry?: () => void }) {
  const { status } = useSocket();

  // Counted in ticks rather than measured against a clock: reading `Date.now()`
  // during render is impure (the same render could produce two answers), and
  // resetting the count from an effect renders once with the stale value first.
  // Deriving the reset from the status transition — the prev-value pattern the
  // inbox already uses for `prevSelectedId` — avoids both.
  const [prevStatus, setPrevStatus] = useState(status);
  const [secondsDown, setSecondsDown] = useState(0);
  if (status !== prevStatus) {
    setPrevStatus(status);
    setSecondsDown(0);
  }

  useEffect(() => {
    if (status === 'connected') return;
    const id = setInterval(() => setSecondsDown((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  if (status === 'connected' || secondsDown < QUIET_SECONDS) return null;

  const stale = secondsDown >= STALE_SECONDS;

  return (
    <div
      // `polite`, not `alert`: this is ambient state, and a screen reader should
      // not have the operator's typing interrupted by it.
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium',
        stale ? 'bg-amber-100 text-amber-800' : 'bg-[var(--bg-secondary)] text-[var(--text-muted)]',
      )}
    >
      {stale ? (
        <>
          <ZapOff className="h-3 w-3 shrink-0" />
          <span>Live updates unavailable</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="ml-0.5 font-semibold underline underline-offset-2 hover:no-underline"
            >
              Refresh
            </button>
          )}
        </>
      ) : (
        <>
          <RefreshCw className="h-3 w-3 shrink-0 animate-spin" />
          <span>Reconnecting…</span>
        </>
      )}
    </div>
  );
}
