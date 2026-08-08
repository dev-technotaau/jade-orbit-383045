'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <h2 className="text-xl font-semibold text-[var(--text)]">Something went wrong</h2>
      <p className="text-[var(--text-light)]">{error.message || 'An unexpected error occurred'}</p>
      <button
        onClick={reset}
        className="bg-primary hover:bg-primary/90 rounded-lg px-4 py-2 text-white"
      >
        Try again
      </button>
    </div>
  );
}
