'use client';

/**
 * NarrowResultsCta — appears at the bottom of the filter sidebar when
 * the active filter set narrows results below 10. Per Phase 17 of the
 * master plan: "Set up an alert for this niche search".
 *
 * Visible only to guests; auth users get the in-app SavedSearch UI.
 */

import Link from 'next/link';
import { Bell, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';

interface Props {
  resultCount: number;
  /** Pass-through redirect URL — preserves the current filter state. */
  redirectIntent?: string;
}

const NARROW_THRESHOLD = 10;

export default function NarrowResultsCta({ resultCount, redirectIntent }: Props) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isAuthenticated) return null;
  if (resultCount > NARROW_THRESHOLD) return null;
  if (resultCount === 0) {
    // Empty results show their own EmptyState; don't pile a CTA on top.
    return null;
  }

  const intent = redirectIntent
    ? `?redirect=${encodeURIComponent(redirectIntent)}&action=create_alert`
    : '?action=create_alert';

  return (
    <aside
      role="complementary"
      aria-label="Save search alert call-to-action"
      className="mt-4 rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/5 p-4"
    >
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="text-primary h-4 w-4" />
        <h3 className="text-sm font-semibold text-[var(--text)]">Niche search? Set up an alert.</h3>
      </div>
      <p className="mb-3 text-xs text-[var(--text-secondary)]">
        Only {resultCount} {resultCount === 1 ? 'job matches' : 'jobs match'} these filters. Sign up
        free and we&apos;ll notify you the moment new matching jobs are posted.
      </p>
      <Link
        href={`/auth/register/candidate${intent}`}
        className="bg-primary inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--primary-hover)]"
      >
        <Bell className="h-3 w-3" />
        Create job alert
      </Link>
    </aside>
  );
}
