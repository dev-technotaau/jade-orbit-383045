'use client';

/**
 * PER-PLAN detail — one plan code inside one category: what it granted, how
 * much is left, what it cost, and every action available on it.
 *
 * This is the page the quota view, the header quick-actions and the category
 * page all funnel into, so it deliberately answers the whole question in one
 * screen: entitlement state (validity / status / source), quota meters, the
 * plan's feature sheet, the payments that paid for it, and the plan actions
 * (renew, upgrade, auto-renew, invoices).
 *
 * A single plan code can back MORE THAN ONE entitlement — a top-up, a
 * quantity>1 purchase or a re-buy after expiry each add a row. Those are
 * called "grants" here and rendered individually, with the quota pooled above.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownCircle,
  ArrowLeft,
  ArrowUpCircle,
  Coins,
  FileText,
  Receipt,
  RefreshCw,
  Repeat,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import { showToast } from '@/components/ui/Toast';
import PlanVisualBand, { PlanParticles } from '@/components/billing/plan-visuals';
import RefundRequestPanel from '@/components/billing/RefundRequestPanel';
import { NoPaymentsArt } from '@/components/billing/plan-detail-art';
import { getPlanTier, getPlanTierVisual, type PlanTier } from '@/components/billing/plan-theme';
import {
  EntitlementQuotas,
  EntitlementStatusBadge,
  FeatureList,
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
import { useMySubscriptions } from '@/hooks/use-subscriptions';
import { usePricingHref } from '@/lib/pricing-href';
import { planService } from '@/services/plan.service';
import { orderService } from '@/services/order.service';
import { invoiceService } from '@/services/invoice.service';
import { upgradeService } from '@/services/upgrade.service';
import { ROUTES } from '@/constants/routes';
import { PLAN_BILLING_LABELS, formatPaise } from '@/types/billing';
import type { ApiError } from '@/types/api';
import type { ResolvedEntitlement, ResourceUnit } from '@/types/entitlement';
import type { OrderStatus } from '@/types/order';

/** How the tier ladder reads to a user, so the badge is not internal jargon. */
const TIER_LABEL: Record<PlanTier, string> = {
  free: 'Free tier',
  core: 'Standard tier',
  pro: 'Premium tier',
  apex: 'Enterprise tier',
};

/** Order statuses worth calling out on the payments list. */
const ORDER_STATUS_LABEL: Partial<Record<OrderStatus, string>> = {
  PAID: 'Paid',
  REFUND_PENDING: 'Refund pending',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partially refunded',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  DISPUTED: 'Disputed',
};

/**
 * Orders that actually took money and can therefore host refund controls.
 * PARTIALLY_REFUNDED stays in: there is still a balance to claim.
 */
const REFUNDABLE_ORDER_STATUSES = new Set<OrderStatus>([
  'PAID',
  'PARTIALLY_REFUNDED',
  'REFUND_PENDING',
  'REFUNDED',
]);

function orderTone(status: OrderStatus): 'success' | 'warning' | 'error' | 'neutral' {
  if (status === 'PAID') return 'success';
  if (status === 'REFUND_PENDING' || status === 'PARTIALLY_REFUNDED') return 'warning';
  if (status === 'FAILED' || status === 'DISPUTED' || status === 'FRAUD_FLAGGED') return 'error';
  return 'neutral';
}

/** Pool this plan's resources across all of its grants. */
function poolGrants(grants: ResolvedEntitlement[]) {
  const byUnit = new Map<
    ResourceUnit,
    { unit: ResourceUnit; allocated: number; consumed: number; carried: number; remaining: number }
  >();
  for (const g of grants) {
    for (const r of g.resources) {
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

export default function PlanDetailPage() {
  const params = useParams();
  const slug = String(params?.category ?? '');
  const rawCode = String(params?.code ?? '');
  const code = decodeURIComponent(rawCode);
  const category = parseCategorySlug(slug);

  const { snapshot, isLoading, isError, error, refetch } = useEntitlements();
  const pricingHref = usePricingHref();
  const queryClient = useQueryClient();
  const [renderedAt] = useState(() => Date.now());

  /* Catalogue row for this code — gives the marketing name, price, billing
     cycle and validity even when the held entitlement predates a rename. */
  const { data: plan } = useQuery({
    queryKey: ['plans', 'code', code],
    queryFn: () => planService.getByCode(code),
    enabled: Boolean(code),
    staleTime: 5 * 60_000,
  });

  /* Payments that bought this plan. The orders endpoint has no plan filter, so
     we pull a page and filter client-side; 50 covers any realistic history for
     one plan code, and the full list stays one click away. */
  const { data: ordersPage } = useQuery({
    queryKey: ['billing', 'orders', 'for-plan', code],
    queryFn: () => orderService.list({ page: 1, limit: 50 }),
    staleTime: 60_000,
  });
  const planOrders = (ordersPage?.items ?? []).filter((o) => o.plan?.code === code);
  const orderIds = new Set(planOrders.map((o) => o.id));

  const { data: invoicesPage } = useQuery({
    queryKey: ['billing', 'invoices', 'for-plan', code],
    queryFn: () => invoiceService.list({ page: 1, limit: 50 }),
    staleTime: 60_000,
  });
  const planInvoices = (invoicesPage?.items ?? []).filter(
    (inv) => inv.orderId && orderIds.has(inv.orderId),
  );

  /* Subscription backing this plan, if it is a recurring one — surfaces
     auto-renew management without duplicating the subscriptions page. */
  const { data: subscriptions } = useMySubscriptions();
  const subscription = (subscriptions ?? []).find((s) => s.plan?.code === code);

  const held = (snapshot?.entitlements ?? []).filter(
    (e) => e.planCode === code && (!category || e.planCategory === category),
  );
  // Newest grant first — the one whose validity the header should report.
  const grants = [...held].sort(
    (a, b) => new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime(),
  );
  const primary = grants[0];

  /* Scheduled downgrade on the newest grant — same data the credits page
     shows, cancellable here too so this page is not a read-only dead end. */
  const { data: pendingDowngrade } = useQuery({
    queryKey: ['billing', 'pending-downgrade', primary?.id],
    queryFn: () => upgradeService.getPendingDowngrade(primary!.id),
    enabled: Boolean(primary?.id),
    staleTime: 60_000,
  });
  const cancelDowngrade = useMutation({
    mutationFn: () => upgradeService.cancelPendingDowngrade(primary!.id),
    onSuccess: () => {
      showToast.success('Scheduled downgrade cancelled');
      void queryClient.invalidateQueries({
        queryKey: ['billing', 'pending-downgrade', primary?.id],
      });
    },
    onError: (err) => {
      showToast.error(
        (err as unknown as ApiError)?.message ?? 'Could not cancel the scheduled downgrade',
      );
    },
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
              {(error as Error)?.message ?? 'Failed to load this plan.'}
            </p>
            <Button variant="outline" className="mt-3" onClick={() => void refetch()}>
              Retry
            </Button>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const displayName = primary?.planName ?? plan?.name ?? code;
  const tier = getPlanTier({
    code,
    basePricePaise: primary?.planPricePaise ?? plan?.basePricePaise ?? 0,
    requiresQuote: plan?.requiresQuote ?? null,
  });
  const { theme } = getPlanTierVisual(category, tier);
  const anyActive = grants.some((g) => g.status === 'ACTIVE');
  const pooled = poolGrants(grants);
  const left = daysLeft(primary?.validUntil, renderedAt);
  const totalPaid = planOrders
    .filter((o) => o.status === 'PAID' || o.status === 'PARTIALLY_REFUNDED')
    .reduce((sum, o) => sum + o.totalPaise, 0);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
        <Link
          href={ROUTES.BILLING.PLAN_CATEGORY(category)}
          className="text-primary inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Back to {categoryLabel(category)}
        </Link>

        <PlanBreadcrumb
          trail={[
            { label: 'My plans', href: ROUTES.BILLING.MY_PLANS },
            { label: categoryLabel(category), href: ROUTES.BILLING.PLAN_CATEGORY(category) },
            { label: displayName },
          ]}
        />

        {/* ---------------- Plan header ---------------- */}
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
              <div className="min-w-0">
                <p className="text-xs font-semibold tracking-wider text-[var(--text-muted)] uppercase">
                  {categoryLabel(category)}
                </p>
                <h1 className="text-2xl font-bold text-[var(--text)]">{displayName}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${theme.soft} ${theme.text}`}
                  >
                    {TIER_LABEL[tier]}
                  </span>
                  <span className="rounded-full bg-[var(--bg-secondary)] px-2 py-0.5 font-mono text-xs text-[var(--text-muted)]">
                    {code}
                  </span>
                  {plan?.badgeText && <Badge variant="info">{plan.badgeText}</Badge>}
                </div>
              </div>
              {primary ? (
                <EntitlementStatusBadge status={primary.status} />
              ) : (
                <Badge variant="neutral">Not held</Badge>
              )}
            </div>

            {plan?.shortDescription && (
              <p className="text-sm text-[var(--text-secondary)]">{plan.shortDescription}</p>
            )}

            <dl className="grid grid-cols-2 gap-4 border-t border-[var(--border)] pt-4 sm:grid-cols-4">
              <Stat label="Valid until">
                {fmtDate(primary?.validUntil)}
                {left != null && left <= 7 && (
                  <span className="text-[var(--warning-dark)]"> · {left}d left</span>
                )}
              </Stat>
              <Stat label="Started">{fmtDate(primary?.validFrom)}</Stat>
              <Stat label="List price">
                {plan
                  ? plan.requiresQuote
                    ? 'On request'
                    : `${formatPaise(plan.basePricePaise, plan.currency)} ${
                        PLAN_BILLING_LABELS[plan.billingCycle]
                      }`
                  : primary?.planPricePaise != null
                    ? formatPaise(primary.planPricePaise)
                    : '—'}
              </Stat>
              <Stat label="Auto-renew">
                {subscription
                  ? subscription.autoRenew
                    ? 'On'
                    : 'Off'
                  : primary?.autoRenew
                    ? 'On'
                    : 'Off'}
              </Stat>
            </dl>

            {/* ---------------- Plan actions ---------------- */}
            <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
              {plan && !plan.requiresQuote && (
                <Link href={ROUTES.BILLING.CHECKOUT(code)}>
                  <Button size="sm" leftIcon={<RefreshCw className="h-4 w-4" />}>
                    {anyActive ? 'Renew or top up' : 'Buy again'}
                  </Button>
                </Link>
              )}
              <Link href={pricingHref}>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<ArrowUpCircle className="h-4 w-4" />}
                >
                  Compare &amp; upgrade
                </Button>
              </Link>
              <Link href={ROUTES.BILLING.CREDITS}>
                <Button variant="outline" size="sm" leftIcon={<Coins className="h-4 w-4" />}>
                  Live usage
                </Button>
              </Link>
              {subscription && (
                <Link href={ROUTES.BILLING.SUBSCRIPTION_DETAIL(subscription.id)}>
                  <Button variant="outline" size="sm" leftIcon={<Repeat className="h-4 w-4" />}>
                    Manage auto-renew
                  </Button>
                </Link>
              )}
              <Link href={ROUTES.BILLING.ORDERS}>
                <Button variant="outline" size="sm" leftIcon={<Receipt className="h-4 w-4" />}>
                  All orders
                </Button>
              </Link>
            </div>
          </div>
        </Panel>

        {/* ---------------- Scheduled downgrade ---------------- */}
        {pendingDowngrade && (
          <Card padding="md" className="border-yellow-300 bg-yellow-50">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-yellow-900">
              <p className="flex items-start gap-2">
                <ArrowDownCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
                <span>
                  Downgrades to{' '}
                  <strong>{pendingDowngrade.toPlanName ?? pendingDowngrade.toPlanCode}</strong> when
                  this plan ends on {fmtDate(pendingDowngrade.effectiveAt)} — we&apos;ll send a
                  checkout link then.
                </span>
              </p>
              {new Date(pendingDowngrade.lockAfter).getTime() >= renderedAt && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => cancelDowngrade.mutate()}
                  isLoading={cancelDowngrade.isPending}
                  disabled={cancelDowngrade.isPending}
                >
                  Cancel downgrade
                </Button>
              )}
            </div>
          </Card>
        )}

        {/* ---------------- Quota + features ---------------- */}
        <div className="grid gap-5 lg:grid-cols-2">
          <Card padding="lg">
            <h2 className="text-base font-semibold text-[var(--text)]">
              Quota from this plan
              {grants.length > 1 && (
                <span className="ml-1 text-sm font-normal text-[var(--text-muted)]">
                  ({grants.length} grants pooled)
                </span>
              )}
            </h2>
            <div className="mt-4">
              {pooled.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  {primary
                    ? 'This plan grants access rather than a counted quota.'
                    : 'You do not currently hold this plan.'}
                </p>
              ) : (
                <div className="space-y-3">
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
              )}
            </div>
          </Card>

          <Card padding="lg">
            <h2 className="text-base font-semibold text-[var(--text)]">What&apos;s included</h2>
            <div className="mt-4">
              {primary ? (
                <FeatureList features={primary.features} />
              ) : plan ? (
                <ul className="space-y-2">
                  {plan.features.map((f) => (
                    <li key={f.key} className="text-sm text-[var(--text)]">
                      {f.label}
                      {f.kind === 'COUNTABLE' && f.countableLimit != null && (
                        <span className="text-[var(--text-muted)]"> — {f.countableLimit}</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">No feature details available.</p>
              )}
            </div>
          </Card>
        </div>

        {/* ---------------- Individual grants ---------------- */}
        {grants.length > 1 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[var(--text)]">
              Individual grants ({grants.length})
            </h2>
            <p className="text-sm text-[var(--text-muted)]">
              Each purchase, top-up or credit on this plan is tracked separately and consumed in
              expiry order.
            </p>
            <div className="space-y-3">
              {grants.map((g) => (
                <Panel key={g.id} className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--text)]">
                          {fmtDate(g.validFrom)} → {fmtDate(g.validUntil)}
                        </span>
                        <EntitlementStatusBadge status={g.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                        Source: {g.source.toLowerCase().replace(/_/g, ' ')}
                        {g.autoRenew ? ' · auto-renews' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <EntitlementQuotas resources={g.resources} />
                  </div>
                </Panel>
              ))}
            </div>
          </section>
        )}

        {/* ---------------- Payments ---------------- */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-lg font-semibold text-[var(--text)]">Payments for this plan</h2>
            {totalPaid > 0 && (
              <p className="text-sm text-[var(--text-muted)]">
                Total paid <strong className="text-[var(--text)]">{formatPaise(totalPaid)}</strong>
              </p>
            )}
          </div>

          {planOrders.length === 0 ? (
            <Card padding="lg" className="text-center">
              <NoPaymentsArt className="mx-auto h-28 w-auto" />
              <p className="mt-3 text-sm text-[var(--text-muted)]">
                No payments recorded against this plan in your recent orders.
              </p>
              <Link href={ROUTES.BILLING.ORDERS} className="mt-3 inline-block">
                <Button variant="outline" size="sm">
                  Open full order history
                </Button>
              </Link>
            </Card>
          ) : (
            <div className="space-y-3">
              {planOrders.map((order) => (
                <Panel key={order.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-[var(--text-muted)]">
                          {order.receiptNumber}
                        </span>
                        <Badge variant={orderTone(order.status)}>
                          {ORDER_STATUS_LABEL[order.status] ?? order.status}
                        </Badge>
                        {(order.quantity ?? 1) > 1 && (
                          <Badge variant="neutral">×{order.quantity}</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-[var(--text)]">
                        <strong>{formatPaise(order.totalPaise, order.currency)}</strong>
                        <span className="text-[var(--text-muted)]">
                          {' '}
                          ·{' '}
                          {order.paidAt
                            ? `paid ${fmtDate(order.paidAt)}`
                            : fmtDate(order.createdAt)}
                        </span>
                      </p>
                      {order.refundedAt && (
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                          Refunded {fmtDate(order.refundedAt)}
                        </p>
                      )}
                    </div>
                    <Link href={ROUTES.BILLING.ORDER_DETAIL(order.id)} className="flex-none">
                      <Button variant="outline" size="sm">
                        Order details
                      </Button>
                    </Link>
                  </div>

                  {/* Refund controls live per PAYMENT, not per plan: refunds are
                      always against one order's captured payment. Only shown for
                      orders that actually took money. */}
                  {REFUNDABLE_ORDER_STATUSES.has(order.status) && (
                    <div className="mt-4 border-t border-[var(--border)] pt-4">
                      <RefundRequestPanel orderId={order.id} />
                    </div>
                  )}
                </Panel>
              ))}
            </div>
          )}
        </section>

        {/* ---------------- Invoices ---------------- */}
        {planInvoices.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[var(--text)]">Invoices</h2>
            <div className="space-y-2">
              {planInvoices.map((inv) => (
                <Panel key={inv.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      <FileText className="text-primary h-4 w-4 flex-none" aria-hidden="true" />
                      <span className="font-mono text-xs text-[var(--text-muted)]">
                        {inv.invoiceNumber}
                      </span>
                      <span className="font-medium text-[var(--text)]">
                        {formatPaise(inv.totalPaise, inv.currency)}
                      </span>
                      <span className="text-[var(--text-muted)]">{fmtDate(inv.issuedAt)}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href={ROUTES.BILLING.INVOICE_DETAIL(inv.id)}>
                        <Button variant="outline" size="sm">
                          View
                        </Button>
                      </Link>
                      <a href={invoiceService.pdfUrl(inv.id)} target="_blank" rel="noopener">
                        <Button variant="outline" size="sm">
                          PDF
                        </Button>
                      </a>
                    </div>
                  </div>
                </Panel>
              ))}
            </div>
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
