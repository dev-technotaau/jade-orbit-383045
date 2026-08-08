'use client';

/**
 * "My Plans" — the master view of what the user actually HOLDS, as distinct
 * from the pricing catalogue (`/pricing/*`) and from `/billing/credits`, which
 * shows quota numbers but nothing about the plans behind them.
 *
 * Built entirely from the existing entitlements snapshot — no new backend.
 * Groups holdings by plan CATEGORY, because that is the unit users think in
 * ("my CV Database plan"), and a category can legitimately hold several
 * stacked entitlements after top-ups or an upgrade.
 *
 * Role-agnostic like the rest of /billing: a candidate sees their candidate
 * categories, an employer theirs, with no role branching needed.
 */

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Coins, Layers, ShoppingBag } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import PlanVisualBand, { PlanParticles } from '@/components/billing/plan-visuals';
import { EmptyPlansArt } from '@/components/billing/plan-detail-art';
import { getPlanTier, getPlanTierVisual } from '@/components/billing/plan-theme';
import {
  EntitlementStatusBadge,
  Panel,
  QuotaMeter,
  Stat,
  categoryLabel,
  daysLeft,
  fmtDate,
  unitLabel,
} from '@/components/billing/plan-detail-parts';
import { useEntitlements } from '@/hooks/use-entitlements';
import { usePricingHref } from '@/lib/pricing-href';
import { ROUTES } from '@/constants/routes';
import { formatPaise } from '@/types/billing';
import type { ResolvedEntitlement } from '@/types/entitlement';

/** How many quota meters to preview on a category card before "view details". */
const PREVIEW_METERS = 2;

export default function MyPlansPage() {
  const { snapshot, isLoading, isError, error, refetch } = useEntitlements();
  const pricingHref = usePricingHref();
  // Stable "now" for the render, matching the credits page: day-counts round
  // to first paint, and entitlement Socket events refetch anyway.
  const [renderedAt] = useState(() => Date.now());

  const entitlements = snapshot?.entitlements ?? [];

  /* Group by category. Entitlements stack (a top-up adds a second row in the
     same category), so each group is a list rather than a single plan. */
  const groups = entitlements.reduce<Record<string, ResolvedEntitlement[]>>((acc, e) => {
    const key = e.planCategory || 'OTHER';
    (acc[key] ??= []).push(e);
    return acc;
  }, {});
  const categories = Object.keys(groups).sort();

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[40vh] items-center justify-center">
          <Spinner size="lg" />
        </div>
      </DashboardLayout>
    );
  }

  if (isError) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-3xl px-4 py-10">
          <Card padding="lg">
            <p className="text-[var(--error)]">
              {(error as Error)?.message ?? 'Failed to load your plans.'}
            </p>
            <Button variant="outline" className="mt-3" onClick={() => void refetch()}>
              Retry
            </Button>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold text-[var(--text)]">
              <Layers className="text-primary h-7 w-7" aria-hidden="true" /> My plans
            </h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Everything you currently hold, grouped by category. Open a category for quotas,
              validity, payments and plan actions.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={ROUTES.BILLING.CREDITS}>
              <Button variant="outline" size="sm" leftIcon={<Coins className="h-4 w-4" />}>
                Credits &amp; quotas
              </Button>
            </Link>
            <Link href={pricingHref}>
              <Button size="sm" leftIcon={<ShoppingBag className="h-4 w-4" />}>
                Browse plans
              </Button>
            </Link>
          </div>
        </div>

        {categories.length === 0 ? (
          <Card padding="lg" className="text-center">
            <EmptyPlansArt className="mx-auto h-32 w-auto" />
            <h2 className="mt-3 text-lg font-semibold text-[var(--text)]">No plans yet</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-[var(--text-muted)]">
              Once you buy a plan it appears here with its quotas, validity, payment history and
              refund options.
            </p>
            <Link href={pricingHref} className="mt-4 inline-block">
              <Button variant="primary">View plans</Button>
            </Link>
          </Card>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {categories.map((category) => {
              const held = groups[category];
              // Newest first, so the headline plan is the most recent purchase.
              const sorted = [...held].sort(
                (a, b) => new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime(),
              );
              const primary = sorted[0];
              const anyActive = held.some((e) => e.status === 'ACTIVE');
              const tier = getPlanTier({
                code: primary.planCode,
                basePricePaise: primary.planPricePaise ?? 0,
              });
              const { theme } = getPlanTierVisual(category, tier);
              const left = daysLeft(primary.validUntil, renderedAt);
              const meters = primary.resources.slice(0, PREVIEW_METERS);
              const extraMeters = primary.resources.length - meters.length;

              return (
                <Panel key={category} className="group flex flex-col">
                  {/* Reuses the pricing tier/category art so this page reads as
                      the same product family as the plan cards. Particles mark
                      an active holding, matching the highlighted plan card.
                      `lg`, not `sm`: the art is authored 240x96 and sized by
                      HEIGHT, so on a half-width dashboard card a short band
                      leaves the illustration floating in empty gradient —
                      verified side-by-side in a compiled preview. */}
                  <div className="relative">
                    <PlanVisualBand category={category} size="lg" tier={tier} />
                    {anyActive && <PlanParticles />}
                    <span
                      aria-hidden="true"
                      className={`absolute inset-x-0 top-0 h-1 ${anyActive ? 'bg-primary' : theme.bar}`}
                    />
                  </div>

                  <div className="flex flex-1 flex-col gap-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold tracking-wider text-[var(--text-muted)] uppercase">
                          {categoryLabel(category)}
                        </p>
                        <h2 className="truncate text-lg font-bold text-[var(--text)]">
                          {primary.planName}
                        </h2>
                      </div>
                      <EntitlementStatusBadge status={primary.status} />
                    </div>

                    <dl className="grid grid-cols-2 gap-3">
                      <Stat label="Valid until">
                        {fmtDate(primary.validUntil)}
                        {left != null && left <= 7 && (
                          <span className="text-[var(--warning-dark)]"> · {left}d left</span>
                        )}
                      </Stat>
                      <Stat label="Paid">
                        {primary.planPricePaise != null ? formatPaise(primary.planPricePaise) : '—'}
                      </Stat>
                      <Stat label="Plans in category">{held.length}</Stat>
                      <Stat label="Auto-renew">{primary.autoRenew ? 'On' : 'Off'}</Stat>
                    </dl>

                    {meters.length > 0 && (
                      <div className="space-y-3 border-t border-[var(--border)] pt-4">
                        {meters.map((r) => (
                          <QuotaMeter
                            key={r.unit}
                            label={unitLabel(r.unit)}
                            remaining={r.remaining}
                            total={r.allocated + r.carriedForward}
                            consumed={r.consumed}
                            carried={r.carriedForward}
                          />
                        ))}
                        {extraMeters > 0 && (
                          <p className="text-xs text-[var(--text-muted)]">
                            +{extraMeters} more quota{extraMeters === 1 ? '' : 's'} in details
                          </p>
                        )}
                      </div>
                    )}

                    <Link
                      href={ROUTES.BILLING.PLAN_CATEGORY(category)}
                      className="mt-auto block pt-1"
                    >
                      <Button
                        variant="outline"
                        className="w-full"
                        rightIcon={<ArrowRight className="h-4 w-4" />}
                      >
                        View details
                      </Button>
                    </Link>
                  </div>
                </Panel>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
