'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, RotateCw, Webhook, AlertTriangle, ShieldCheck } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import StatusBadge from '@/components/super-admin/billing/StatusBadge';
import AdminConfirmModal from '@/components/super-admin/billing/AdminConfirmModal';
import AdminDetailCard from '@/components/super-admin/billing/AdminDetailCard';
import { superAdminBillingService } from '@/services/super-admin-billing.service';

interface WebhookDetail {
  id: string;
  razorpayEventId: string;
  event: string;
  accountId: string | null;
  signatureValid: boolean;
  status: string;
  retryCount: number;
  replayCount: number;
  receivedAt: string;
  processedAt: string | null;
  lastReplayedAt: string | null;
  errorMessage: string | null;
  payload: Record<string, unknown> | null;
  payloadHash: string | null;
}

export default function SuperAdminWebhookDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? '');
  const [data, setData] = useState<WebhookDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replayOpen, setReplayOpen] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = (await superAdminBillingService.getWebhookEvent(id)) as unknown as WebhookDetail;
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load webhook event');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) void reload();
  }, [id, reload]);

  const onReplay = async () => {
    await superAdminBillingService.replayWebhookEvent(id);
    setActionMsg('Replay triggered. The event handler will run again — refresh to see status.');
    await reload();
  };

  if (loading) {
    return (
      <DashboardLayout
        requiredRole={['ADMIN', 'SUPER_ADMIN']}
        requiredPermission="billing.webhooks.view"
      >
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      </DashboardLayout>
    );
  }
  if (error || !data) {
    return (
      <DashboardLayout
        requiredRole={['ADMIN', 'SUPER_ADMIN']}
        requiredPermission="billing.webhooks.view"
      >
        <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
          <BillingNav active="webhooks" />
          <Card padding="lg">
            <p className="text-sm text-red-600">{error ?? 'Webhook event not found.'}</p>
            <Link
              href="/super-admin/billing/webhooks"
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
      requiredPermission="billing.webhooks.view"
    >
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <BillingNav active="webhooks" />

        <Link
          href="/super-admin/billing/webhooks"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text)]"
        >
          <ArrowLeft size={14} /> All webhooks
        </Link>

        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-[var(--text)] sm:text-3xl">
                <Webhook className="mr-2 inline" size={22} />
                {data.event}
              </h1>
              <StatusBadge status={data.status} pretty />
              {data.signatureValid ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                  <ShieldCheck size={12} /> Signed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                  <AlertTriangle size={12} /> Invalid signature
                </span>
              )}
            </div>
            <p className="mt-1 font-mono text-xs text-[var(--text-secondary)]">
              {data.razorpayEventId}
            </p>
          </div>

          <Button variant="primary" onClick={() => setReplayOpen(true)}>
            <RotateCw size={14} /> Replay
          </Button>
        </header>

        {actionMsg ? (
          <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-900/20 dark:text-blue-200">
            {actionMsg}
          </div>
        ) : null}

        {data.errorMessage ? (
          <div className="rounded-lg border-l-4 border-red-500 bg-red-50 p-4 dark:bg-red-900/20">
            <p className="font-semibold text-red-900 dark:text-red-200">Error message</p>
            <pre className="mt-2 overflow-x-auto font-mono text-xs whitespace-pre-wrap text-red-800 dark:text-red-300">
              {data.errorMessage}
            </pre>
          </div>
        ) : null}

        <AdminDetailCard
          title="Lifecycle"
          rows={[
            { label: 'Razorpay event ID', value: data.razorpayEventId, mono: true },
            { label: 'Event type', value: data.event, mono: true },
            { label: 'Signature', value: data.signatureValid ? 'Valid' : 'Invalid' },
            { label: 'Status', value: <StatusBadge status={data.status} pretty /> },
            { label: 'Retries', value: data.retryCount },
            { label: 'Replays', value: data.replayCount },
            { label: 'Received', value: new Date(data.receivedAt).toLocaleString('en-IN') },
            {
              label: 'Processed',
              value: data.processedAt ? new Date(data.processedAt).toLocaleString('en-IN') : '—',
            },
            {
              label: 'Last replayed',
              value: data.lastReplayedAt
                ? new Date(data.lastReplayedAt).toLocaleString('en-IN')
                : 'Never',
            },
            { label: 'Account ID', value: data.accountId ?? '—', mono: true },
            { label: 'Payload SHA-256', value: data.payloadHash ?? '—', mono: true },
          ]}
        />

        <Card padding="lg">
          <h2 className="text-base font-semibold text-[var(--text)]">Raw payload</h2>
          <pre
            data-lenis-prevent
            className="mt-4 max-h-[600px] overflow-auto rounded-lg bg-[var(--bg)] p-4 font-mono text-xs text-[var(--text)]"
          >
            {JSON.stringify(data.payload ?? {}, null, 2)}
          </pre>
        </Card>
      </div>

      <AdminConfirmModal
        isOpen={replayOpen}
        onClose={() => setReplayOpen(false)}
        onConfirm={onReplay}
        title="Replay this webhook?"
        description={
          <div>
            <p>
              The event handler will run again with the originally received payload. State changes
              are idempotent (event.id dedup), but downstream side-effects like notifications may be
              re-issued only if their dedup row was cleared.
            </p>
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              Use this to reprocess events that failed due to transient errors.
            </p>
          </div>
        }
        confirmLabel="Replay event"
        intent="primary"
      />
    </DashboardLayout>
  );
}
