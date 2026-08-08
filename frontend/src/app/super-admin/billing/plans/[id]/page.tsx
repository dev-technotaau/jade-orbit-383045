'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Edit3, CheckCircle2, Archive, Eye, EyeOff, Sparkles, Tag } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import StatusBadge from '@/components/super-admin/billing/StatusBadge';
import AdminConfirmModal from '@/components/super-admin/billing/AdminConfirmModal';
import AdminDetailCard from '@/components/super-admin/billing/AdminDetailCard';
import { superAdminBillingService } from '@/services/super-admin-billing.service';
import { formatPaise, type AdminPlan } from '@/types/billing';

type DialogKind = null | 'publish' | 'archive';

export default function SuperAdminPlanDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? '');
  const [plan, setPlan] = useState<AdminPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await superAdminBillingService.getPlanAdmin(id);
      setPlan(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plan');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onPublish = async () => {
    await superAdminBillingService.publishPlanAdmin(id);
    setActionMsg('Plan published — now visible in public catalog.');
    await reload();
  };
  const onArchive = async () => {
    await superAdminBillingService.archivePlanAdmin(id);
    setActionMsg('Plan archived — removed from public catalog.');
    await reload();
  };

  if (loading) {
    return (
      <DashboardLayout
        requiredRole={['ADMIN', 'SUPER_ADMIN']}
        requiredPermission="billing.plans.view"
      >
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      </DashboardLayout>
    );
  }
  if (error || !plan) {
    return (
      <DashboardLayout
        requiredRole={['ADMIN', 'SUPER_ADMIN']}
        requiredPermission="billing.plans.view"
      >
        <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
          <BillingNav active="plans" />
          <Card padding="lg">
            <p className="text-sm text-red-600">{error ?? 'Plan not found.'}</p>
            <Link
              href="/super-admin/billing/plans"
              className="mt-3 inline-block text-sm text-blue-600 hover:underline"
            >
              ← Back
            </Link>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="billing.plans.view"
    >
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <BillingNav active="plans" />

        <Link
          href="/super-admin/billing/plans"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text)]"
        >
          <ArrowLeft size={14} /> All plans
        </Link>

        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate text-2xl font-bold text-[var(--text)] sm:text-3xl">
                {plan.name}
              </h1>
              <StatusBadge status={plan.status} pretty />
              {plan.isPublic ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                  <Eye size={12} /> Public
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                  <EyeOff size={12} /> Hidden
                </span>
              )}
              {plan.highlight ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  <Sparkles size={12} /> Featured
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              <code className="font-mono">{plan.code}</code> · slug <code>{plan.slug}</code>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href={`/super-admin/billing/plans/${plan.id}/edit`}>
              <Button variant="outline">
                <Edit3 size={14} /> Edit
              </Button>
            </Link>
            {plan.status === 'DRAFT' ? (
              <Button variant="primary" onClick={() => setDialog('publish')}>
                <CheckCircle2 size={14} /> Publish
              </Button>
            ) : null}
            {plan.status !== 'ARCHIVED' ? (
              <Button variant="destructive" onClick={() => setDialog('archive')}>
                <Archive size={14} /> Archive
              </Button>
            ) : null}
          </div>
        </header>

        {actionMsg ? (
          <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-900/20 dark:text-blue-200">
            {actionMsg}
          </div>
        ) : null}

        <Card padding="lg">
          <h2 className="text-base font-semibold text-[var(--text)]">Pricing</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">Base price</dt>
              <dd className="mt-1 text-2xl font-extrabold">
                {plan.requiresQuote ? 'Custom' : formatPaise(plan.basePricePaise, plan.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">GST</dt>
              <dd className="mt-1 text-base font-semibold">
                {plan.gstRatePercent}% {plan.gstInclusive ? '(inclusive)' : '(exclusive)'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">Validity</dt>
              <dd className="mt-1 text-base font-semibold">
                {plan.validityDays ? `${plan.validityDays} days` : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">Trial</dt>
              <dd className="mt-1 text-base font-semibold">
                {plan.trialDays ? `${plan.trialDays} days` : 'None'}
              </dd>
            </div>
          </dl>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AdminDetailCard
            title="Catalog metadata"
            rows={[
              { label: 'Code', value: plan.code, mono: true },
              { label: 'Slug', value: plan.slug, mono: true },
              { label: 'Category', value: plan.category.replace(/_/g, ' ').toLowerCase() },
              { label: 'Cycle', value: plan.billingCycle.replace(/_/g, ' ').toLowerCase() },
              { label: 'HSN code', value: plan.hsnCode, mono: true },
              { label: 'Currency', value: plan.currency },
              { label: 'Display order', value: plan.displayOrder },
              { label: 'Custom plan', value: plan.isCustom ? 'Yes' : 'No' },
              { label: 'Requires quote', value: plan.requiresQuote ? 'Yes' : 'No' },
            ]}
          />
          <AdminDetailCard
            title="Razorpay link"
            rows={[
              {
                label: 'Razorpay plan ID',
                value: plan.razorpayPlanId ?? '— (one-time plan)',
                mono: true,
              },
              {
                label: 'Created',
                value: plan.createdAt ? new Date(plan.createdAt).toLocaleString('en-IN') : '—',
              },
              {
                label: 'Updated',
                value: plan.updatedAt ? new Date(plan.updatedAt).toLocaleString('en-IN') : '—',
              },
            ]}
          />
        </div>

        <Card padding="lg">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">
            <Tag size={16} /> Features ({plan.features?.length ?? 0})
          </h2>
          {plan.features && plan.features.length > 0 ? (
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-secondary)] uppercase">
                  <th className="py-2 pr-3">Key</th>
                  <th className="py-2 pr-3">Label</th>
                  <th className="py-2 pr-3">Kind</th>
                  <th className="py-2 pr-3 text-right">Limit / value</th>
                  <th className="py-2 pr-3">Included</th>
                </tr>
              </thead>
              <tbody>
                {plan.features.map((f) => (
                  <tr key={f.key} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs">{f.key}</td>
                    <td className="py-2 pr-3">{f.label}</td>
                    <td className="py-2 pr-3 text-xs">{f.kind}</td>
                    <td className="py-2 pr-3 text-right text-xs">
                      {f.kind === 'COUNTABLE'
                        ? (f.countableLimit ?? '∞')
                        : f.kind === 'ENUM'
                          ? (f.enumValue ?? '—')
                          : f.kind === 'TEXT'
                            ? (f.textValue ?? '—')
                            : '—'}
                    </td>
                    <td className="py-2 pr-3">
                      {f.included ? (
                        <CheckCircle2 className="text-emerald-600" size={14} />
                      ) : (
                        <span className="text-[var(--text-secondary)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-4 text-sm text-[var(--text-secondary)]">No features defined.</p>
          )}
        </Card>

        <Card padding="lg">
          <h2 className="text-base font-semibold text-[var(--text)]">
            Resources ({plan.resources?.length ?? 0})
          </h2>
          {plan.resources && plan.resources.length > 0 ? (
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-secondary)] uppercase">
                  <th className="py-2 pr-3">Unit</th>
                  <th className="py-2 pr-3 text-right">Quantity</th>
                  <th className="py-2 pr-3">Reset per period</th>
                  <th className="py-2 pr-3 text-right">Carry-forward cap</th>
                  <th className="py-2 pr-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {plan.resources.map((r) => (
                  <tr key={r.unit} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs">{r.unit}</td>
                    <td className="py-2 pr-3 text-right font-medium">{r.quantity}</td>
                    <td className="py-2 pr-3 text-xs">{r.perPeriodReset ? 'Yes' : 'No'}</td>
                    <td className="py-2 pr-3 text-right text-xs">
                      {r.carryForwardCap ?? 'Unlimited'}
                    </td>
                    <td className="py-2 pr-3 text-xs text-[var(--text-secondary)]">
                      {r.notes ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-4 text-sm text-[var(--text-secondary)]">No resources defined.</p>
          )}
        </Card>

        {plan.descriptionHtml ? (
          <Card padding="lg">
            <h2 className="text-base font-semibold text-[var(--text)]">Description</h2>
            <div
              className="prose prose-sm dark:prose-invert mt-4 max-w-none text-[var(--text)]"
              dangerouslySetInnerHTML={{ __html: plan.descriptionHtml }}
            />
          </Card>
        ) : null}
      </div>

      <AdminConfirmModal
        isOpen={dialog === 'publish'}
        onClose={() => setDialog(null)}
        onConfirm={onPublish}
        title="Publish this plan?"
        description="The plan will appear in the public /pricing catalog and customers can buy it."
        confirmLabel="Publish"
        intent="primary"
      />
      <AdminConfirmModal
        isOpen={dialog === 'archive'}
        onClose={() => setDialog(null)}
        onConfirm={onArchive}
        title="Archive this plan?"
        description="The plan will be removed from the public catalog. Existing entitlements stay valid until expiry."
        confirmLabel="Archive"
        intent="danger"
      />
    </DashboardLayout>
  );
}
