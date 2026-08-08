'use client';

/**
 * Full-width "Login to see more" interstitial rendered after the 30th
 * result on the public listing surface. Shown only to guests; auth
 * users see a normal pagination control instead.
 *
 * The CTA preserves the current filter URL via `useAuthGate('fetch_more')`
 * so post-login the user lands on the next page of the same search.
 */

import { useState } from 'react';
import { LogIn, Sparkles, ArrowRight, Lock } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useAuthGate } from '@/hooks/use-auth-gate';

interface Props {
  /** Total result count so the strapline can be honest about how many more. */
  totalAvailable: number;
  /** Cap actually shown to the guest (typically 30). */
  shown: number;
  /** Optional extra Tailwind classes. */
  className?: string;
}

export default function LoginToContinueBanner({ totalAvailable, shown, className }: Props) {
  const { gatedAction } = useAuthGate();
  const [busy, setBusy] = useState(false);

  const remaining = Math.max(totalAvailable - shown, 0);

  return (
    <div
      className={`relative my-6 overflow-hidden rounded-2xl border border-[var(--primary)]/20 bg-gradient-to-br from-[var(--primary-light)] via-white to-[var(--accent-light)] p-6 sm:p-8 ${className ?? ''}`}
      role="region"
      aria-label="Login to continue"
    >
      <div className="grid items-center gap-6 sm:grid-cols-[auto_1fr_auto]">
        <div className="bg-primary flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-md sm:h-16 sm:w-16">
          <Lock className="h-7 w-7" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--text)] sm:text-2xl">
            {remaining > 0
              ? `${remaining.toLocaleString('en-IN')}+ more matching jobs are waiting for you`
              : 'See every matching job after free signup'}
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)] sm:text-base">
            Sign up free to unlock unlimited job results, save searches, get email alerts, and apply
            with one click.
          </p>
          <ul className="mt-3 grid gap-1 text-xs text-[var(--text-secondary)] sm:grid-cols-2 sm:text-sm">
            <li className="flex items-center gap-1.5">
              <Sparkles className="text-primary h-3.5 w-3.5" /> Unlimited results
            </li>
            <li className="flex items-center gap-1.5">
              <Sparkles className="text-primary h-3.5 w-3.5" /> Save jobs &amp; searches
            </li>
            <li className="flex items-center gap-1.5">
              <Sparkles className="text-primary h-3.5 w-3.5" /> Daily job alerts
            </li>
            <li className="flex items-center gap-1.5">
              <Sparkles className="text-primary h-3.5 w-3.5" /> One-click apply
            </li>
          </ul>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              setBusy(true);
              gatedAction('fetch_more', { surface: 'register-candidate' });
            }}
            disabled={busy}
            rightIcon={<ArrowRight className="h-4 w-4" />}
          >
            Sign up free
          </Button>
          <button
            type="button"
            onClick={() => {
              setBusy(true);
              gatedAction('fetch_more', { surface: 'login-candidate' });
            }}
            className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
          >
            <LogIn className="h-3.5 w-3.5" />
            Already have an account? Login
          </button>
        </div>
      </div>
    </div>
  );
}
