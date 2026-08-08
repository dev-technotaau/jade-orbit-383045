'use client';

/**
 * Plan CATEGORY detail — everything the user holds inside one plan family
 * (Job Posting / CV Database / Vendor Connect / ...), with the category's
 * pooled quota at the top and each individual holding below it.
 *
 * Why a category level at all: entitlements stack. A top-up, a quantity-2
 * purchase or a pro-rated upgrade all leave MORE THAN ONE entitlement row in
 * the same category, and the number a user cares about ("how many CV unlocks
 * do I have left?") is the pooled one. The per-plan pages under this route
 * then answer "which purchase did that come from, and what can I do about it".
 *
 * Reads only from the entitlements snapshot plus the public plan catalogue —
 * no new backend endpoints.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Coins, Receipt, ShoppingBag } from 'lucide-react';
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
  PlanBreadcrumb,
  QuotaMeter,
  Stat,
  categoryLabel,
  daysLeft,
  fmtDate,
  parseCategorySlug,
  unitLabel,
} from '@/components/billing/plan-detail-parts';
import { useEntitlements } from '@/hooks/use-entitlements';
import { usePricingHref } from '@/lib/pricing-href';
import { planService } from '@/services/plan.service';
import { ROUTES } from '@/constants/routes';
import { PLAN_BILLING_LABELS, formatPaise } from '@/types/billing';
import type { ResolvedEntitlement, ResourceUnit } from '@/types/entitlement';

/** One pooled row per resource unit across every holding in the category. */
interface PooledResource {
  unit: ResourceUnit;
  allocated: number;
  consumed: number;
  carried: number;
  remaining: number;
}

/**
 * Pool the category's resources. Sums across entitlements rather than reading
 * `snapshot.resources`, because that map is account-wide — a CV_UNLOCK total
 * there can include units granted by a plan in another category.
 */
function poolResources(ents: ResolvedEntitlement[]): PooledResource[] {
  const byUnit = new Map<ResourceUnit, PooledResource>();
  for (const ent of ents) {
    for (const r of ent.resources) {
      const row = byUnit.get(r.unit) ?? {
        unit: r.unit,
        allocated: 0,
        consumed: 0,
        carried: 0,
        remaining: 0,
      };
      row.allocated += r.allocated;
      row.consumed += r.consumed;
      row.carried += r.carriedForward;
      row.remaining += r.remaining;
      byUnit.set(r.unit, row);
    }
  }
  return [...byUnit.values()];
}

export default function PlanCategoryPage() {
  const params = useParams();
  const slug = String(params?.category ?? '');
  const category = parseCategorySlug(slug);

  const { snapshot, isLoading, isError, error, refetch } = useEntitlements();
  const pricingHref = usePricingHref();
  const [renderedAt] = useState(() => Date.now());

  /* Catalogue for this category — powers the "other plans in this family"
     upsell. Failure is non-fatal: the held-plan content above it still renders. */
  const { data: catalogue = [] } = useQuery({
    queryKey: ['plans', 'category', category],
    queryFn: () => planService.list({ category: category! }),
    enabled: Boolean(category),
    staleTime: 5 * 60_000,
  });

  if (!category) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-3xl px-4 py-10">
          <Card padding="lg" className="text-center">
            <h1 className="text-lg font-semibold text-[var(--text)]">Unknown plan category</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              &ldquo;{slug}&rdquo; is not a plan category we recognise.
            </p>
            <Link href={ROUTES.BILLING.MY_PLANS} className="mt-4 inline-block">
              <Button variant="outline">Back to my plans</Button>
            </Link>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

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

  const held = (snapshot?.entitlements ?? []).filter((e) => e.planCategory === category);
  // Newest purchase first — the one a user is most likely acting on.
  const sorted = [...held].sort(
    (a, b) => new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime(),
  );
  const primary = sorted[0];
  const anyActive = held.some((e) => e.status === 'ACTIVE');
  const pooled = poolResources(held);
  const heldCodes = new Set(held.map((e) => e.planCode));
  const otherPlans = catalogue.filter((p) => !heldCodes.has(p.code));

  const tier = primary
    ? getPlanTier({ code: primary.planCode, basePricePaise: primary.planPricePaise ?? 0 })
    : 'core';
  const { theme } = getPlanTierVisual(category, tier);

  /* Latest expiry across the category — the date the family actually lapses,
     which is what the header should promise (an older stacked entitlement
     expiring first does not end access). */
  const latestExpiry = held.reduce<string | null>((acc, e) => {
    if (!e.validUntil) return acc;
    if (!acc) return e.validUntil;
    return new Date(e.validUntil).getTime() > new Date(acc).getTime() ? e.validUntil : acc;
  }, null);
  const left = daysLeft(latestExpiry, renderedAt);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
        <Link
          href={ROUTES.BILLING.MY_PLANS}
          className="text-primary inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Back to my plans
        </Link>

        <PlanBreadcrumb
          trail={[
            { label: 'My plans', href: ROUTES.BILLING.MY_PLANS },
            { label: categoryLabel(category) },
          ]}
        />

        {/* ---------------- Category header ---------------- */}
        <Panel className="group">
          <div className="relative">
            <PlanVisualBand category={category} size="lg" tier={tier} />
            {anyActive && <PlanParticles />}
            <span
              aria-hidden="true"
              className={`absolute inset-x-0 top-0 h-1 ${anyActive ? 'bg-primary' : theme.bar}`}
            />
          </div>
          <div className="space-y-5 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold tracking-wider text-[var(--text-muted)] uppercase">
                  Plan category
                </p>
                <h1 className="text-2xl font-bold text-[var(--text)]">{categoryLabel(category)}</h1>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {held.length === 0
                    ? 'You do not hold a plan in this category yet.'
                    : `${held.length} plan${held.length === 1 ? '' : 's'} in this category${
                        left != null ? ` · access through ${fmtDate(latestExpiry)}` : ''
                      }`}
                </p>
              </div>
              {primary && <EntitlementStatusBadge status={primary.status} />}
            </div>

            {held.length > 0 && (
              <dl className="grid grid-cols-2 gap-4 border-t border-[var(--border)] pt-4 sm:grid-cols-4">
                <Stat label="Access until">
                  {fmtDate(latestExpiry)}
                  {left != null && left <= 7 && (
                    <span className="text-[var(--warning-dark)]"> · {left}d left</span>
                  )}
                </Stat>
                <Stat label="Current plan">{primary?.planName ?? '—'}</Stat>
                <Stat label="Auto-renew">{held.some((e) => e.autoRenew) ? 'On' : 'Off'}</Stat>
                <Stat label="Status">{anyActive ? 'Active' : 'Not active'}</Stat>
              </dl>
            )}

            <div className="flex flex-wrap gap-2">
              <Link href={ROUTES.BILLING.CREDITS}>
                <Button variant="outline" size="sm" leftIcon={<Coins className="h-4 w-4" />}>
                  Live usage
                </Button>
              </Link>
              <Link href={ROUTES.BILLING.ORDERS}>
                <Button variant="outline" size="sm" leftIcon={<Receipt className="h-4 w-4" />}>
                  Order history
                </Button>
              </Link>
              <Link href={pricingHref}>
                <Button size="sm" leftIcon={<ShoppingBag className="h-4 w-4" />}>
                  {held.length === 0 ? 'View plans' : 'Upgrade or top up'}
                </Button>
              </Link>
            </div>
          </div>
        </Panel>

        {/* ---------------- Pooled quota ---------------- */}
        {pooled.length > 0 && (
          <Card padding="lg">
            <h2 className="text-base font-semibold text-[var(--text)]">
              Pooled quota in this category
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Combined across all {held.length} holding{held.length === 1 ? '' : 's'} here.
            </p>
            <div className="mt-4 space-y-3">
              {pooled.map((r) => (
                <QuotaMeter
                  key={r.unit}
                  label={unitLabel(r.unit)}
                  remaining={r.remaining}
                  total={r.allocated + r.carried}
                  consumed={r.consumed}
                  carried={r.carried}
                />
              ))}
            </div>
          </Card>
        )}

        {/* ---------------- Held plans ---------------- */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-[var(--text)]">Your plans here</h2>
          {sorted.length === 0 ? (
            <Card padding="lg" className="text-center">
              <EmptyPlansArt className="mx-auto h-28 w-auto" />
              <p className="mt-3 text-sm text-[var(--text-muted)]">
                Nothing purchased in this category yet.
              </p>
              <Link href={pricingHref} className="mt-3 inline-block">
                <Button size="sm">See {categoryLabel(category)} plans</Button>
              </Link>
            </Card>
          ) : (
            <div className="space-y-3">
              {sorted.map((ent) => {
                const entTier = getPlanTier({
                  code: ent.planCode,
                  basePricePaise: ent.planPricePaise ?? 0,
                });
                const entTheme = getPlanTierVisual(category, entTier).theme;
                const entLeft = daysLeft(ent.validUntil, renderedAt);
                return (
                  <Panel key={ent.id}>
                    <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-bold text-[var(--text)]">{ent.planName}</h3>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${entTheme.soft} ${entTheme.text}`}
                          >
                            {ent.planCode}
                          </span>
                          <EntitlementStatusBadge status={ent.status} />
                        </div>
                        <p className="mt-1 text-sm text-[var(--text-muted)]">
                          {fmtDate(ent.validFrom)} → {fmtDate(ent.validUntil)}
                          {entLeft != null && entLeft <= 7 && (
                            <span className="text-[var(--warning-dark)]"> · {entLeft}d left</span>
                          )}
                          {ent.source !== 'PLAN' && (
                            <span className="text-[var(--text-muted)]">
                              {' '}
                              · {ent.source.toLowerCase().replace(/_/g, ' ')}
                            </span>
                          )}
                        </p>
                      </div>
                      <Link
                        href={ROUTES.BILLING.PLAN_DETAIL(category, ent.planCode)}
                        className="flex-none"
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          rightIcon={<ArrowRight className="h-4 w-4" />}
                        >
                          Plan details
                        </Button>
                      </Link>
                    </div>
                  </Panel>
                );
              })}
            </div>
          )}
        </section>

        {/* ---------------- Rest of the family ---------------- */}
        {otherPlans.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[var(--text)]">
              Also in {categoryLabel(category)}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {otherPlans.map((plan) => (
                <Panel key={plan.code} className="flex flex-col justify-between gap-3 p-5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-[var(--text)]">{plan.name}</h3>
                      {plan.badgeText && (
                        <span className="bg-primary-light text-primary rounded-full px-2 py-0.5 text-xs font-semibold">
                          {plan.badgeText}
                        </span>
                      )}
                    </div>
                    {plan.shortDescription && (
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        {plan.shortDescription}
                      </p>
                    )}
                    <p className="mt-2 text-sm font-semibold text-[var(--text)]">
                      {plan.requiresQuote
                        ? 'Custom pricing'
                        : `${formatPaise(plan.basePricePaise, plan.currency)} ${
                            PLAN_BILLING_LABELS[plan.billingCycle]
                          }`}
                    </p>
                  </div>
                  <Link href={pricingHref} className="block">
                    <Button variant="outline" size="sm" className="w-full">
                      See plan
                    </Button>
                  </Link>
                </Panel>
              ))}
            </div>
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
