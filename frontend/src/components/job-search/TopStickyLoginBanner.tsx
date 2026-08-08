'use client';

/**
 * TopStickyLoginBanner — thin sticky banner above public listings for
 * guest visitors. Per Phase 17 of the master plan: dismissable for 7
 * days. Visible only when the user is not authenticated.
 *
 *   "Sign up free to apply, save jobs, and set alerts"   [Sign up] [×]
 *
 * Persistence
 * ───────────
 * Dismiss state is stored in localStorage (`ha_top_login_banner_dismissed`)
 * with a 7-day timestamp. After 7 days the banner reappears.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';

const STORAGE_KEY = 'ha_top_login_banner_dismissed';
const DISMISS_DAYS = 7;

export default function TopStickyLoginBanner() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [hidden, setHidden] = useState(true); // start hidden to avoid SSR flash

  useEffect(() => {
    if (isAuthenticated) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHidden(true);
      return;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const ts = Number(raw);
        if (Number.isFinite(ts) && Date.now() - ts < DISMISS_DAYS * 86_400_000) {
          setHidden(true);
          return;
        }
      }
      setHidden(false);
    } catch {
      // localStorage blocked — show the banner.
      setHidden(false);
    }
  }, [isAuthenticated]);

  if (hidden || isAuthenticated) return null;

  const onDismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      // localStorage blocked — dismiss only for this session.
    }
    setHidden(true);
  };

  return (
    <div role="region" aria-label="Sign up call-to-action" className="bg-primary text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 text-xs sm:px-6 sm:text-sm lg:px-8">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0" />
          <span className="truncate">
            <strong>Sign up free</strong> to apply, save jobs, set alerts, and follow companies.
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/auth/register/candidate"
            className="rounded-md bg-white/15 px-2.5 py-1 font-semibold transition-colors hover:bg-white/25"
          >
            Sign up
          </Link>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss banner"
            className="rounded-md p-1 transition-colors hover:bg-white/15"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
