'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Repeat,
  Pause,
  Play,
  XCircle,
  Calendar,
  Activity,
  ExternalLink,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import StatusBadge from '@/components/super-admin/billing/StatusBadge';
import AdminConfirmModal from '@/components/super-admin/billing/AdminConfirmModal';
import AdminDetailCard from '@/components/super-admin/billing/AdminDetailCard';
import { subscriptionService } from '@/services/subscription.service';
import { superAdminBillingService } from '@/services/super-admin-billing.service';
import { formatPaise } from '@/types/billing';

interface AdminSubscriptionDetail {
  id: string;
  razorpaySubscriptionId: string | null;
  status: string;
  autoRenew: boolean;
  cancelAtCycleEnd: boolean;
  totalCount: number | null;
  paidCount: number;
  remainingCount: number | null;
  nextChargeAt: string | null;
  currentStart: string | null;
  currentEnd: string | null;
  endedAt: string | null;
  pausedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  failureCount: number | null;
  gracePeriodUntil: string | null;
  createdAt: string;
  updatedAt: string;
  planSnapshot: Record<string, unknown> | null;
  plan?: { id: string; code: string; name: string };
  user?: { id: string; email: string; firstName: string | null; lastName: string | null };
  mandate?: {
    id: string;
    status: string;
    method: string;
    cardLast4: string | null;
    vpa: string | null;
    bankName: string | null;
    maxAmountPaise: number;
    expiresAt: string | null;
  } | null;
  events?: Array<{
    id: string;
    kind: string;
    happenedAt: string;
  }>;
}

type DialogKind = null | 'pause' | 'resume' | 'cancel-soft' | 'cancel-hard';

export default function SuperAdminSubscriptionDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? '');
  const [sub, setSub] = useState<AdminSubscriptionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = (await superAdminBillingService.getSubscription(
        id,
      )) as unknown as AdminSubscriptionDetail;
      setSub(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscription');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) void reload();
  }, [id, reload]);

  const onPause = async (reason?: string) => {
    await subscriptionService.pause(id, reason);
    setActionMsg('Subscription paused.');
    await reload();
  };
  const onResume = async () => {
    await subscriptionService.resume(id);
    setActionMsg('Subscription resumed.');
    await reload();
  };
  const onCancelSoft = async (reason?: string) => {
    await subscriptionService.cancel(id, { reason, cancelImmediately: false });
    setActionMsg('Cancelled at cycle end. User keeps access until current period ends.');
    await reload();
  };
  const onCancelHard = async (reason?: string) => {
    await subscriptionService.cancel(id, { reason, cancelImmediately: true });
    setActionMsg('Cancelled immediately. User has lost access.');
    await reload();
  };

  if (loading) {
    return (
      <DashboardLayout
        requiredRole={['ADMIN', 'SUPER_ADMIN']}
        requiredPermission="billing.subscriptions.view"
      >
        <div className="mx-auto flex max-w-5xl justify-center px-4 py-16">
          <Spinner />
        </div>
      </DashboardLayout>
    );
  }
  if (error || !sub) {
    return (
      <DashboardLayout
        requiredRole={['ADMIN', 'SUPER_ADMIN']}
        requiredPermission="billing.subscriptions.view"
      >
        <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
          <BillingNav active="subscriptions" />
          <Card padding="lg">
            <p className="text-sm text-red-600">{error ?? 'Subscription not found.'}</p>
            <Link
              href="/super-admin/billing/subscriptions"
              className="mt-3 inline-block text-sm text-blue-600 hover:underline"
            >
              ← Back
            </Link>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const userName = `${sub.user?.firstName ?? ''} ${sub.user?.lastName ?? ''}`.trim();
  const isActive = sub.status === 'ACTIVE';
  const isPaused = sub.status === 'PAUSED';
  const isHalted = sub.status === 'HALTED';
  const canCancel = !['CANCELLED', 'COMPLETED', 'EXPIRED'].includes(sub.status);
  const planSnap = (sub.planSnapshot ?? {}) as {
    name?: string;
    basePricePaise?: number;
    currency?: string;
  };

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="billing.subscriptions.view"
    >
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <BillingNav active="subscriptions" />

        <Link
          href="/super-admin/billing/subscriptions"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text)]"
        >
          <ArrowLeft size={14} /> All subscriptions
        </Link>

        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="truncate text-2xl font-bold text-[var(--text)] sm:text-3xl">
                {sub.plan?.name ?? planSnap.name ?? 'Subscription'}
              </h1>
              <StatusBadge status={sub.status} pretty />
            </div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Razorpay {sub.razorpaySubscriptionId ?? '—'} · Started{' '}
              {sub.currentStart ? new Date(sub.currentStart).toLocaleDateString('en-IN') : '—'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {isActive ? (
              <Button variant="outline" onClick={() => setDialog('pause')}>
                <Pause size={14} /> Pause
              </Button>
            ) : null}
            {isPaused || isHalted ? (
              <Button variant="primary" onClick={() => setDialog('resume')}>
                <Play size={14} /> Resume
              </Button>
            ) : null}
            {canCancel ? (
              <>
                <Button variant="outline" onClick={() => setDialog('cancel-soft')}>
                  Cancel at cycle end
                </Button>
                <Button variant="destructive" onClick={() => setDialog('cancel-hard')}>
                  <XCircle size={14} /> Cancel now
                </Button>
              </>
            ) : null}
          </div>
        </header>

        {actionMsg ? (
          <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-900/20 dark:text-blue-200">
            {actionMsg}
          </div>
        ) : null}

        {(sub.failureCount ?? 0) > 0 ? (
          <div className="rounded-lg border-l-4 border-amber-500 bg-amber-50 p-4 dark:bg-amber-900/20">
            <p className="font-semibold text-amber-900 dark:text-amber-200">
              {sub.failureCount} consecutive renewal failure{sub.failureCount === 1 ? '' : 's'}
            </p>
            {sub.gracePeriodUntil ? (
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
                Grace period ends{' '}
                {new Date(sub.gracePeriodUntil).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
                .
              </p>
            ) : null}
          </div>
        ) : null}

        <Card padding="lg">
          <h2 className="text-base font-semibold text-[var(--text)]">Billing summary</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">Per cycle</dt>
              <dd className="mt-1 text-lg font-semibold">
                {planSnap.basePricePaise
                  ? formatPaise(planSnap.basePricePaise, planSnap.currency)
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">Cycles paid</dt>
              <dd className="mt-1 text-lg font-semibold">
                {sub.paidCount} / {sub.totalCount ?? '∞'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">Next charge</dt>
              <dd className="mt-1 text-base font-semibold">
                {sub.nextChargeAt
                  ? new Date(sub.nextChargeAt).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">Period ends</dt>
              <dd className="mt-1 text-base font-semibold">
                {sub.currentEnd
                  ? new Date(sub.currentEnd).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })
                  : '—'}
              </dd>
            </div>
          </dl>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AdminDetailCard
            title="User"
            rows={[
              { label: 'Email', value: sub.user?.email ?? '—' },
              { label: 'Name', value: userName || '—' },
              {
                label: 'User ID',
                value: sub.user?.id ? (
                  <Link
                    href={`/super-admin/billing/users/${sub.user.id}`}
                    className="font-mono text-xs text-blue-600 hover:underline"
                  >
                    {sub.user.id}
                  </Link>
                ) : (
                  '—'
                ),
                mono: true,
              },
            ]}
          />
          <AdminDetailCard
            title="Mandate"
            rows={
              sub.mandate
                ? [
                    { label: 'Status', value: <StatusBadge status={sub.mandate.status} pretty /> },
                    { label: 'Method', value: sub.mandate.method },
                    {
                      label: 'Card / VPA',
                      value: sub.mandate.cardLast4
                        ? `····${sub.mandate.cardLast4}`
                        : (sub.mandate.vpa ?? '—'),
                    },
                    { label: 'Bank', value: sub.mandate.bankName ?? '—' },
                    {
                      label: 'Max amount',
                      value: formatPaise(sub.mandate.maxAmountPaise, planSnap.currency),
                    },
                    {
                      label: 'Expires',
                      value: sub.mandate.expiresAt
                        ? new Date(sub.mandate.expiresAt).toLocaleDateString('en-IN')
                        : 'Never',
                    },
                  ]
                : [{ label: 'Status', value: 'No mandate attached' }]
            }
          />
        </div>

        <Card padding="lg">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">
            <Activity size={16} /> Lifecycle events ({sub.events?.length ?? 0})
          </h2>
          {sub.events && sub.events.length > 0 ? (
            <ol className="mt-4 space-y-3">
              {sub.events.map((ev) => (
                <li
                  key={ev.id}
                  className="flex items-start gap-3 border-l-2 border-[var(--border)] pl-3"
                >
                  <Calendar
                    className="mt-0.5 flex-shrink-0 text-[var(--text-secondary)]"
                    size={14}
                  />
                  <div className="flex-1">
                    <p className="font-mono text-xs text-[var(--text)]">{ev.kind}</p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {new Date(ev.happenedAt).toLocaleString('en-IN')}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 text-sm text-[var(--text-secondary)]">No lifecycle events yet.</p>
          )}
        </Card>
      </div>

      <AdminConfirmModal
        isOpen={dialog === 'pause'}
        onClose={() => setDialog(null)}
        onConfirm={onPause}
        title="Pause subscription?"
        description="Razorpay will stop charging this customer until you resume. Existing access stays until the current period ends."
        inputLabel="Reason for pause"
        inputPlaceholder="Why are we pausing?"
        inputMinLength={3}
        inputMaxLength={500}
        confirmLabel="Pause"
        intent="warning"
      />
      <AdminConfirmModal
        isOpen={dialog === 'resume'}
        onClose={() => setDialog(null)}
        onConfirm={onResume}
        title="Resume subscription?"
        description="Razorpay will resume charging on the next cycle. The user will be notified."
        confirmLabel="Resume"
        intent="primary"
      />
      <AdminConfirmModal
        isOpen={dialog === 'cancel-soft'}
        onClose={() => setDialog(null)}
        onConfirm={onCancelSoft}
        title="Cancel at cycle end?"
        description="The user keeps access until the current period ends, then auto-renew stops."
        inputLabel="Reason for cancellation"
        inputPlaceholder="Customer requested, plan deprecated, etc."
        inputType="textarea"
        inputMinLength={3}
        inputMaxLength={500}
        confirmLabel="Cancel at cycle end"
        intent="warning"
      />
      <AdminConfirmModal
        isOpen={dialog === 'cancel-hard'}
        onClose={() => setDialog(null)}
        onConfirm={onCancelHard}
        title="Cancel immediately?"
        description={
          <div>
            <p>The user loses access right now. No automatic refund is issued.</p>
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              For an immediate-cancel-with-refund, cancel here and then issue a manual refund from
              the underlying payment.
            </p>
          </div>
        }
        inputLabel="Reason for immediate cancellation"
        inputType="textarea"
        inputMinLength={5}
        inputMaxLength={500}
        confirmLabel="Cancel now"
        intent="danger"
      />
    </DashboardLayout>
  );
}
