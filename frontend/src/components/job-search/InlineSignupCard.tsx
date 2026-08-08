'use client';

/**
 * Compact signup card interleaved between job cards every N items
 * (default 8). Visible only to guests. Visually distinct from real
 * job cards so users don't confuse it with a listing.
 */

import { Sparkles, ArrowRight } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useAuthGate } from '@/hooks/use-auth-gate';

interface Props {
  className?: string;
  /** Override the headline copy for context-aware variants. */
  headline?: string;
  /** Override the subheadline. */
  subheadline?: string;
}

export default function InlineSignupCard({
  className,
  headline = 'Get the latest jobs delivered to your inbox',
  subheadline = 'Sign up free to save jobs, set alerts, and apply with one click.',
}: Props) {
  const { gatedAction } = useAuthGate();

  return (
    <div
      className={`from-primary-light to-accent-light flex flex-col items-start gap-3 rounded-xl border-l-4 border-[var(--primary)] bg-gradient-to-r p-4 sm:flex-row sm:items-center sm:gap-4 ${className ?? ''}`}
      role="region"
      aria-label="Sign up suggestion"
    >
      <div className="bg-primary flex h-10 w-10 flex-none items-center justify-center rounded-full text-white shadow">
        <Sparkles className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--text)]">{headline}</p>
        <p className="mt-0.5 text-xs text-[var(--text-muted)] sm:text-sm">{subheadline}</p>
      </div>
      <Button
        size="sm"
        variant="primary"
        onClick={() => gatedAction('save_search', { surface: 'register-candidate' })}
        rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
      >
        Sign up free
      </Button>
    </div>
  );
}
