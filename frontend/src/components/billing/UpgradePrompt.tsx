'use client';

import Link from 'next/link';
import { type ReactNode } from 'react';
import { Lock, Zap, AlertCircle, ArrowRight } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

interface UpgradePromptProps {
  feature?: string;
  reason: 'no_plan' | 'feature_missing' | 'quota_exhausted' | 'expired';
  /** Override the upgrade href. By default we send the user to /pricing
   *  and tag the URL with `?from=<feature>` so super-admin analytics can
   *  attribute conversions to the gate that triggered them. */
  href?: string;
  className?: string;
  compact?: boolean;
}

function buildPricingHref(reason: UpgradePromptProps['reason'], feature?: string): string {
  const fromTag = feature ? feature.replace(/^feature\./, '').replace(/[^a-z0-9_]/gi, '_') : reason;
  return `/pricing?from=${encodeURIComponent(fromTag)}`;
}

export default function UpgradePrompt({
  feature,
  reason,
  href,
  className,
  compact,
}: UpgradePromptProps) {
  const copy = COPY[reason];
  const targetHref = href ?? buildPricingHref(reason, feature);
  if (compact) {
    return (
      <div className={className}>
        <Link href={targetHref} className="text-primary inline-flex items-center gap-1 text-sm">
          {copy.icon}
          {copy.compact(feature)}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    );
  }
  return (
    <Card padding="lg" className={`text-center ${className ?? ''}`}>
      <div className="bg-primary/10 text-primary mx-auto flex h-12 w-12 items-center justify-center rounded-xl">
        {copy.icon}
      </div>
      <h2 className="mt-4 text-xl font-semibold text-[var(--text)]">{copy.heading(feature)}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-muted)]">{copy.body(feature)}</p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <Link href={targetHref}>
          <Button variant="primary">{copy.cta}</Button>
        </Link>
        <Link href="/billing/orders">
          <Button variant="outline">View orders</Button>
        </Link>
      </div>
    </Card>
  );
}

const COPY: Record<
  UpgradePromptProps['reason'],
  {
    icon: ReactNode;
    heading: (feature?: string) => string;
    body: (feature?: string) => string;
    cta: string;
    compact: (feature?: string) => string;
  }
> = {
  no_plan: {
    icon: <Lock className="h-6 w-6" />,
    heading: () => 'Choose a plan to continue',
    body: (feature) =>
      feature
        ? `Posting jobs, unlocking CVs and reaching candidates need an active plan. Pick a plan that fits your hiring stage.`
        : `You need an active plan to access this area. Pick one that matches your hiring stage.`,
    cta: 'View plans',
    compact: () => 'Pick a plan',
  },
  feature_missing: {
    icon: <Zap className="h-6 w-6" />,
    heading: (f) => (f ? `${prettify(f)} isn't on your current plan` : 'Upgrade required'),
    body: (f) =>
      f
        ? `Upgrade to a plan that includes ${prettify(f)} — your unused credit will carry forward.`
        : `Upgrade to a higher plan to unlock this feature.`,
    cta: 'Upgrade plan',
    compact: (f) => (f ? `Upgrade for ${prettify(f)}` : 'Upgrade'),
  },
  quota_exhausted: {
    icon: <AlertCircle className="h-6 w-6" />,
    heading: (f) => (f ? `You've used all your ${prettify(f)}` : 'Quota reached'),
    body: (f) =>
      f
        ? `Upgrade to top-up your ${prettify(f)} quota — unused balance carries forward to the new plan.`
        : `You've reached your quota for this period. Upgrade to continue.`,
    cta: 'Top-up plan',
    compact: () => 'Top up',
  },
  expired: {
    icon: <AlertCircle className="h-6 w-6" />,
    heading: () => 'Your plan has expired',
    body: () => 'Renew or upgrade to continue using this feature.',
    cta: 'Renew',
    compact: () => 'Renew',
  },
};

function prettify(key: string): string {
  return key
    .replace(/^feature\./, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
