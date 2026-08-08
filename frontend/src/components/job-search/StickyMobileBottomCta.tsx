'use client';

/**
 * Mobile-only sticky bottom CTA. Visible to guests on the public
 * listing surface; auto-hides for auth users. Persists dismiss in
 * sessionStorage so closing it sticks for the session.
 */

import { useEffect, useState } from 'react';
import { LogIn, X, Sparkles } from 'lucide-react';
import { useAuthGate } from '@/hooks/use-auth-gate';

const DISMISS_KEY = 'ha_sticky_cta_dismissed';

export default function StickyMobileBottomCta() {
  const { isAuthenticated, gatedAction } = useAuthGate();
  const [dismissed, setDismissed] = useState(true); // Default hidden until hydrated

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  if (isAuthenticated || dismissed) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-white shadow-lg sm:hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="bg-primary flex h-9 w-9 flex-none items-center justify-center rounded-full text-white">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-[var(--text)]">Sign up free to apply</p>
          <p className="truncate text-[11px] text-[var(--text-muted)]">
            Save jobs · email alerts · one-click apply
          </p>
        </div>
        <button
          type="button"
          onClick={() => gatedAction('save_search', { surface: 'register-candidate' })}
          className="bg-primary inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-white"
        >
          <LogIn className="h-3 w-3" />
          Sign up
        </button>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            try {
              sessionStorage.setItem(DISMISS_KEY, '1');
            } catch {
              /* sessionStorage blocked — UI stays hidden until refresh */
            }
            setDismissed(true);
          }}
          className="rounded-full p-1 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
