'use client';

import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

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

  if (!isOffline) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[200] flex items-center justify-center gap-2 bg-[var(--warning)] px-4 py-2 text-sm font-medium text-white shadow-md">
      <WifiOff className="h-4 w-4" />
      You are offline. Some features may be unavailable.
    </div>
  );
}
