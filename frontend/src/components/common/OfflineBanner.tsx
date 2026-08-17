'use client';

import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';
import { listOutbox, subscribeOutbox } from '@/lib/offline-queue';

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  // Replies the operator typed with no connection. The banner used to say only
  // that features "may be unavailable", which gave no hint that work already
  // done was sitting in a queue rather than sent.
  const [queued, setQueued] = useState(0);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => {
      // Brief delay so user sees the "back online" state
      setIsOffline(false);
    };

    // Check initial state
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      queueMicrotask(() => setIsOffline(true));
    }

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  useEffect(() => {
    const refresh = () => {
      void listOutbox().then((items) => setQueued(items.length));
    };
    refresh();
    return subscribeOutbox(refresh);
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[200] flex items-center justify-center gap-2 bg-[var(--warning)] px-4 py-2 text-sm font-medium text-white shadow-md">
      <WifiOff className="h-4 w-4" />
      You are offline. Some features may be unavailable.
      {queued > 0 && (
        <span>
          {queued} message{queued > 1 ? 's' : ''} queued — {queued > 1 ? 'they' : 'it'} will send
          when you reconnect.
        </span>
      )}
    </div>
  );
}
