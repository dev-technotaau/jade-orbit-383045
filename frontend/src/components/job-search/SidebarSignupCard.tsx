'use client';

/**
 * Right-rail / sidebar CTA shown on `lg:` and above. Sticky-positioned
 * so it stays visible as the user scrolls through results.
 *
 * Surfaced on the public listing page only (auth users see their saved
 * searches widget instead).
 */

import { Bell, Sparkles, MailPlus } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useAuthGate } from '@/hooks/use-auth-gate';

interface Props {
  /** Headline override — context-aware copy when filters narrow results. */
  headline?: string;
  className?: string;
}

export default function SidebarSignupCard({
  headline = 'Save this search and get daily updates',
  className,
}: Props) {
  const { gatedAction } = useAuthGate();

  return (
    <aside
      className={`sticky top-24 hidden rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm lg:block ${className ?? ''}`}
      aria-label="Save this search"
    >
      <div className="bg-primary-light text-primary mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl">
        <Bell className="h-5 w-5" />
      </div>
      <h3 className="text-base font-bold text-[var(--text)]">{headline}</h3>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        We&apos;ll email new matching jobs daily. Free, no spam, unsubscribe anytime.
      </p>
      <ul className="mt-4 space-y-2 text-xs text-[var(--text-secondary)]">
        <li className="flex items-center gap-1.5">
          <Sparkles className="text-primary h-3.5 w-3.5" /> Email alerts
        </li>
        <li className="flex items-center gap-1.5">
          <Sparkles className="text-primary h-3.5 w-3.5" /> One-click apply
        </li>
        <li className="flex items-center gap-1.5">
          <Sparkles className="text-primary h-3.5 w-3.5" /> Save unlimited jobs
        </li>
      </ul>
      <Button
        variant="primary"
        size="md"
        fullWidth
        className="mt-4"
        onClick={() => gatedAction('create_alert', { surface: 'register-candidate' })}
        leftIcon={<MailPlus className="h-4 w-4" />}
      >
        Sign up free
      </Button>
      <button
        type="button"
        onClick={() => gatedAction('create_alert', { surface: 'login-candidate' })}
        className="text-primary mt-2 w-full text-center text-xs hover:underline"
      >
        Already have an account? Login
      </button>
    </aside>
  );
}
