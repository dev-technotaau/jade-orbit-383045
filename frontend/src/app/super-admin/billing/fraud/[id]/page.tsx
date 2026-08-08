'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ShieldAlert, CheckCircle2, AlertTriangle } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import Select from '@/components/ui/Select';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import StatusBadge from '@/components/super-admin/billing/StatusBadge';
import AdminConfirmModal from '@/components/super-admin/billing/AdminConfirmModal';
import AdminDetailCard from '@/components/super-admin/billing/AdminDetailCard';
import {
  superAdminBillingService,
  type AdminFraudFlag,
  type FraudAction,
} from '@/services/super-admin-billing.service';
import { formatPaise } from '@/types/billing';

export default function SuperAdminFraudFlagDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? '');
  const [flag, setFlag] = useState<AdminFraudFlag | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewAction, setReviewAction] = useState<FraudAction | ''>('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      // No single getFlag endpoint — use list with limit 1 by ID
      const res = await superAdminBillingService.listFraudFlags({ limit: 100 });
      const found = res.items.find((f) => f.id === id) ?? null;
      if (!found) throw new Error('Fraud flag not found in recent 100');
      setFlag(found);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fraud flag');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onReview = async (notes?: string) => {
    if (!reviewAction) throw new Error('Pick an action');
    await superAdminBillingService.reviewFraudFlag(id, {
      newAction: reviewAction as FraudAction,
      notes,
    });
    setActionMsg(`Flag reviewed → ${reviewAction}.`);
    setReviewAction('');
    await reload();
  };

  if (loading) {
    return (
      <DashboardLayout
        requiredRole={['ADMIN', 'SUPER_ADMIN']}
        requiredPermission="billing.fraud.view"
      >
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      </DashboardLayout>
    );
  }
  if (error || !flag) {
    return (
      <DashboardLayout
        requiredRole={['ADMIN', 'SUPER_ADMIN']}
        requiredPermission="billing.fraud.view"
      >
        <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
          <BillingNav active="fraud" />
          <Card padding="lg">
            <p className="text-sm text-red-600">{error ?? 'Fraud flag not found.'}</p>
            <Link
              href="/super-admin/billing/fraud"
              className="mt-3 inline-block text-sm text-blue-600 hover:underline"
            >
              ← Back
            </Link>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const evidenceObj = (flag.evidence ?? {}) as Record<string, unknown>;

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="billing.fraud.view"
    >
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <BillingNav active="fraud" />

        <Link
          href="/super-admin/billing/fraud"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text)]"
        >
          <ArrowLeft size={14} /> Fraud queue
        </Link>

        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-[var(--text)] sm:text-3xl">
                <ShieldAlert className="mr-2 inline" size={24} />
                {flag.signal.replace(/_/g, ' ')}
              </h1>
              <StatusBadge status={flag.severity} pretty />
              <StatusBadge status={flag.action} pretty />
              {flag.reviewedAt ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                  <CheckCircle2 size={12} /> Reviewed
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Triggered {new Date(flag.createdAt).toLocaleString('en-IN')}
              {flag.reviewedAt
                ? ` · Reviewed ${new Date(flag.reviewedAt).toLocaleString('en-IN')}`
                : ''}
            </p>
          </div>

          {!flag.reviewedAt ? (
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={reviewAction}
                onChange={(val) => setReviewAction(val as FraudAction | '')}
                options={[
                  { value: 'NONE', label: 'NONE — clear flag, allow user' },
                  { value: 'REVIEW', label: 'REVIEW — keep flagged, watch' },
                  { value: 'BLOCK', label: 'BLOCK — deny new orders' },
                  { value: 'REFUND_AND_BLOCK', label: 'REFUND_AND_BLOCK' },
                ]}
                placeholder="— Pick action —"
                size="sm"
                className="min-w-[16rem]"
              />
              <Button
                variant="primary"
                onClick={() => setReviewOpen(true)}
                disabled={!reviewAction}
              >
                Resolve
              </Button>
            </div>
          ) : null}
        </header>

        {actionMsg ? (
          <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-900/20 dark:text-blue-200">
            {actionMsg}
          </div>
        ) : null}

        {flag.severity === 'CRITICAL' || flag.severity === 'HIGH' ? (
          <div className="rounded-lg border-l-4 border-red-500 bg-red-50 p-4 dark:bg-red-900/20">
            <p className="flex items-start gap-2 text-sm font-semibold text-red-900 dark:text-red-200">
              <AlertTriangle className="mt-0.5 flex-shrink-0" size={16} />
              <span>
                High-severity fraud signal — review the user&apos;s history before deciding on
                action.
              </span>
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AdminDetailCard
            title="Signal"
            rows={[
              { label: 'Signal type', value: flag.signal.replace(/_/g, ' '), mono: true },
              { label: 'Severity', value: <StatusBadge status={flag.severity} pretty /> },
              { label: 'Suggested action', value: <StatusBadge status={flag.action} pretty /> },
              { label: 'Notes', value: flag.notes ?? '—' },
              {
                label: 'Reviewed by',
                value: flag.reviewedById ? flag.reviewedById.slice(-8) : '—',
                mono: true,
              },
            ]}
          />
          <AdminDetailCard
            title="Linked entities"
            rows={[
              {
                label: 'User',
                value: flag.user?.email ? (
                  <Link
                    href={`/super-admin/billing/users/${flag.userId}`}
                    className="text-blue-600 hover:underline"
                  >
                    {flag.user.email}
                  </Link>
                ) : flag.userId ? (
                  flag.userId.slice(-8)
                ) : (
                  '—'
                ),
              },
              {
                label: 'Order',
                value: flag.orderId ? (
                  <Link
                    href={`/super-admin/billing/orders/${flag.orderId}`}
                    className="font-mono text-blue-600 hover:underline"
                  >
                    {flag.orderId.slice(-8)}
                  </Link>
                ) : (
                  '—'
                ),
                mono: true,
              },
              {
                label: 'Payment',
                value: flag.paymentId ? (
                  <Link
                    href={`/super-admin/billing/transactions/${flag.paymentId}`}
                    className="font-mono text-blue-600 hover:underline"
                  >
                    {flag.payment?.razorpayPaymentId ?? flag.paymentId.slice(-8)}
                  </Link>
                ) : (
                  '—'
                ),
                mono: true,
              },
              {
                label: 'Payment amount',
                value: flag.payment ? formatPaise(flag.payment.amountPaise) : '—',
              },
            ]}
          />
        </div>

        <Card padding="lg">
          <h2 className="text-base font-semibold text-[var(--text)]">Evidence</h2>
          {Object.keys(evidenceObj).length === 0 ? (
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              No evidence attached to this flag.
            </p>
          ) : (
            <pre
              data-lenis-prevent
              className="mt-4 max-h-96 overflow-auto rounded-lg bg-[var(--bg)] p-4 font-mono text-xs text-[var(--text)]"
            >
              {JSON.stringify(evidenceObj, null, 2)}
            </pre>
          )}
        </Card>
      </div>

      <AdminConfirmModal
        isOpen={reviewOpen}
        onClose={() => setReviewOpen(false)}
        onConfirm={onReview}
        title={`Resolve flag → ${reviewAction}?`}
        description={
          reviewAction === 'BLOCK' || reviewAction === 'REFUND_AND_BLOCK' ? (
            <p>
              This will <strong>block the user from new orders</strong>
              {reviewAction === 'REFUND_AND_BLOCK' ? ' and auto-refund the payment' : ''}. Make sure
              you&apos;ve verified the fraud signal.
            </p>
          ) : (
            <p>Mark this flag as reviewed with the chosen action.</p>
          )
        }
        inputLabel="Review notes (audit trail)"
        inputType="textarea"
        inputRequired={false}
        inputMinLength={0}
        inputMaxLength={2000}
        confirmLabel="Resolve"
        intent={
          reviewAction === 'BLOCK' || reviewAction === 'REFUND_AND_BLOCK' ? 'danger' : 'primary'
        }
      />
    </DashboardLayout>
  );
}
