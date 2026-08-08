'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Webhook, CheckCircle2, AlertTriangle, RotateCw, ExternalLink } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import StatusBadge from '@/components/super-admin/billing/StatusBadge';
import EmptyState from '@/components/super-admin/billing/EmptyState';
import Tooltip from '@/components/ui/Tooltip';
import Pagination from '@/components/super-admin/billing/Pagination';
import AdminFilterBar from '@/components/super-admin/billing/AdminFilterBar';
import { superAdminBillingService } from '@/services/super-admin-billing.service';

const PAGE_SIZE = 50;

const STATUS_OPTIONS = [
  { label: 'All statuses', value: '' },
  { label: 'Received', value: 'RECEIVED' },
  { label: 'Processing', value: 'PROCESSING' },
  { label: 'Processed', value: 'PROCESSED' },
  { label: 'Skipped', value: 'SKIPPED' },
  { label: 'Failed', value: 'FAILED' },
  { label: 'Replayed', value: 'REPLAYED' },
];

const EVENT_OPTIONS = [
  { label: 'All events', value: '' },
  { label: 'payment.captured', value: 'payment.captured' },
  { label: 'payment.failed', value: 'payment.failed' },
  { label: 'payment.authorized', value: 'payment.authorized' },
  { label: 'order.paid', value: 'order.paid' },
  { label: 'subscription.activated', value: 'subscription.activated' },
  { label: 'subscription.charged', value: 'subscription.charged' },
  { label: 'subscription.charged_failed', value: 'subscription.charged_failed' },
  { label: 'subscription.cancelled', value: 'subscription.cancelled' },
  { label: 'refund.created', value: 'refund.created' },
  { label: 'refund.processed', value: 'refund.processed' },
  { label: 'refund.failed', value: 'refund.failed' },
  { label: 'dispute.created', value: 'dispute.created' },
  { label: 'mandate.confirmed', value: 'mandate.confirmed' },
  { label: 'invoice.paid', value: 'invoice.paid' },
];

interface WebhookRow {
  id: string;
  razorpayEventId: string;
  event: string;
  status: string;
  retryCount: number;
  replayCount: number;
  receivedAt: string;
  processedAt: string | null;
  errorMessage: string | null;
}

export default function SuperAdminWebhooksPage() {
  const [items, setItems] = useState<WebhookRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE);
  const [status, setStatus] = useState('');
  const [event, setEvent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await superAdminBillingService.listWebhookEvents({
        page,
        limit: pageSize,
        status: status || undefined,
        event: event || undefined,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load webhook events');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, status, event]);

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="billing.webhooks.view"
    >
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <BillingNav active="webhooks" />

        <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)] sm:text-3xl">
              <Webhook className="mr-2 inline" size={24} /> Razorpay webhooks
            </h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Every signed event Razorpay has sent us. Failed events auto-retry; you can also replay
              any event manually from the detail view.
            </p>
          </div>
        </header>

        <Card padding="md">
          <AdminFilterBar
            filters={[
              {
                key: 'status',
                label: 'Status',
                value: status,
                options: STATUS_OPTIONS,
                onChange: (v) => {
                  setStatus(v);
                  setPage(1);
                },
              },
              {
                key: 'event',
                label: 'Event',
                value: event,
                options: EVENT_OPTIONS,
                onChange: (v) => {
                  setEvent(v);
                  setPage(1);
                },
              },
            ]}
          />

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-secondary)] uppercase">
                  <th className="py-2.5 pr-3">Event</th>
                  <th className="py-2.5 pr-3">Razorpay event ID</th>
                  <th className="py-2.5 pr-3">Status</th>
                  <th className="py-2.5 pr-3 text-right">Retries</th>
                  <th className="py-2.5 pr-3 text-right">Replays</th>
                  <th className="py-2.5 pr-3">Received</th>
                  <th className="py-2.5 pr-3">Error</th>
                  <th className="py-2.5 pr-3" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center">
                      <Spinner />
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-sm text-red-600">
                      {error}
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-2">
                      <EmptyState title="No webhook events match your filters" icon={Webhook} />
                    </td>
                  </tr>
                ) : (
                  items.map((w) => (
                    <tr
                      key={w.id}
                      className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-secondary)]"
                    >
                      <td className="py-2.5 pr-3 font-mono text-xs">{w.event}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-[var(--text-secondary)]">
                        {w.razorpayEventId.slice(-16)}
                      </td>
                      <td className="py-2.5 pr-3">
                        <StatusBadge status={w.status} pretty />
                      </td>
                      <td className="py-2.5 pr-3 text-right text-xs">{w.retryCount}</td>
                      <td className="py-2.5 pr-3 text-right text-xs">{w.replayCount}</td>
                      <td className="py-2.5 pr-3 text-xs text-[var(--text-secondary)]">
                        {new Date(w.receivedAt).toLocaleString('en-IN')}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-red-600">
                        {w.errorMessage ? (
                          <Tooltip content={w.errorMessage}>
                            <span className="block max-w-xs truncate">{w.errorMessage}</span>
                          </Tooltip>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2.5 pr-3">
                        <Link
                          href={`/super-admin/billing/webhooks/${w.id}`}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                        >
                          View <ExternalLink size={12} />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!loading && !error && items.length > 0 ? (
            <div className="mt-3">
              <Pagination
                page={page}
                pageSize={pageSize}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
                total={total}
                onChange={(next) => setPage(next)}
              />
            </div>
          ) : null}
        </Card>
      </div>
    </DashboardLayout>
  );
}
