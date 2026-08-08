'use client';

import { WifiOff, RefreshCw } from 'lucide-react';
import Tooltip from '@/components/ui/Tooltip';

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <div className="text-center">
        <WifiOff className="mx-auto h-16 w-16 text-[var(--text-muted)]" />
        <h1 className="mt-6 text-2xl font-bold text-[var(--text)]">You&apos;re Offline</h1>
        <p className="mt-2 text-[var(--text-secondary)]">
          Please check your internet connection and try again.
        </p>
        <Tooltip content="Refresh the page and check your connection">
          <button
            onClick={() => window.location.reload()}
            className="bg-primary mt-6 inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
