'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { History, FileText, ShieldCheck, ChevronRight } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import EmptyState from '@/components/super-admin/billing/EmptyState';
import Pagination from '@/components/super-admin/billing/Pagination';
import AdminFilterBar from '@/components/super-admin/billing/AdminFilterBar';
import { superAdminBillingService } from '@/services/super-admin-billing.service';

const PAGE_SIZE = 50;

const ACTION_OPTIONS = [
  { label: 'All actions', value: '' },
  { label: 'BILLING_ORDER_CREATED', value: 'BILLING_ORDER_CREATED' },
  { label: 'BILLING_PAYMENT_CAPTURED', value: 'BILLING_PAYMENT_CAPTURED' },
  { label: 'BILLING_REFUND_INITIATED', value: 'BILLING_REFUND_INITIATED' },
  { label: 'BILLING_SUBSCRIPTION_CANCELLED', value: 'BILLING_SUBSCRIPTION_CANCELLED' },
  { label: 'BILLING_PLAN_CREATED', value: 'BILLING_PLAN_CREATED' },
  { label: 'BILLING_COUPON_CREATED', value: 'BILLING_COUPON_CREATED' },
  { label: 'BILLING_USER_PLAN_GRANTED', value: 'BILLING_USER_PLAN_GRANTED' },
  { label: 'BILLING_FRAUD_FLAG', value: 'BILLING_FRAUD_FLAG' },
  { label: 'BILLING_INVOICE_VOIDED', value: 'BILLING_INVOICE_VOIDED' },
  { label: 'BILLING_MARK_PAID_MANUAL', value: 'BILLING_MARK_PAID_MANUAL' },
  { label: 'MARK_ORDER_PAID', value: 'MARK_ORDER_PAID' },
  { label: 'INITIATE_REFUND', value: 'INITIATE_REFUND' },
  { label: 'REPLAY_WEBHOOK_EVENT', value: 'REPLAY_WEBHOOK_EVENT' },
];

const ENTITY_OPTIONS = [
  { label: 'All entities', value: '' },
  { label: 'Order', value: 'Order' },
  { label: 'Payment', value: 'Payment' },
  { label: 'Refund', value: 'Refund' },
  { label: 'Subscription', value: 'Subscription' },
  { label: 'Plan', value: 'Plan' },
  { label: 'Coupon', value: 'Coupon' },
  { label: 'Invoice', value: 'Invoice' },
  { label: 'FraudSignalEvent', value: 'FraudSignalEvent' },
  { label: 'BillingAddress', value: 'BillingAddress' },
  { label: 'Mandate', value: 'Mandate' },
  { label: 'Entitlement', value: 'Entitlement' },
];

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  performedBy: string | null;
  createdAt: string;
  details: Record<string, unknown> | null;
  user?: { email: string; firstName: string | null; lastName: string | null };
}

export default function SuperAdminBillingAuditPage() {
  const [items, setItems] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE);
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    superAdminBillingService
      .listBillingAudit({
        page,
        limit: pageSize,
        action: action || undefined,
        entity: entity || undefined,
      })
      .then((res) => {
        if (!active) return;
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load audit log');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, pageSize, action, entity]);

  const entityHref = (e: string, id: string | null) => {
    if (!id) return null;
    const map: Record<string, string> = {
      Order: `/super-admin/billing/orders/${id}`,
      Payment: `/super-admin/billing/transactions/${id}`,
      Refund: `/super-admin/billing/refunds/${id}`,
      // The request queue has no per-id route — the list is the destination.
      RefundRequest: `/super-admin/billing/refund-requests`,
      Subscription: `/super-admin/billing/subscriptions/${id}`,
      Plan: `/super-admin/billing/plans/${id}`,
      Coupon: `/super-admin/billing/coupons/${id}`,
      FraudSignalEvent: `/super-admin/billing/fraud/${id}`,
      RazorpayWebhookEvent: `/super-admin/billing/webhooks/${id}`,
    };
    return map[e] ?? null;
  };

  return (
    <DashboardLayout requiredRole={['ADMIN', 'SUPER_ADMIN']} requiredPermission="billing.audit">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <BillingNav active="audit" />

        <header className="flex items-center gap-3">
          <ShieldCheck className="text-blue-600" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)] sm:text-3xl">Audit log</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Every billing action — order creation, payment capture, refund, subscription change,
              fraud flag, plan/coupon edits, and god-mode operations — with SHA-256 integrity
              checksums.
            </p>
          </div>
        </header>

        <Card padding="md">
          <AdminFilterBar
            filters={[
              {
                key: 'action',
                label: 'Action',
                value: action,
                options: ACTION_OPTIONS,
                onChange: (v) => {
                  setAction(v);
                  setPage(1);
                },
              },
              {
                key: 'entity',
                label: 'Entity',
                value: entity,
                options: ENTITY_OPTIONS,
                onChange: (v) => {
                  setEntity(v);
                  setPage(1);
                },
              },
            ]}
          />

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-secondary)] uppercase">
                  <th className="w-8 py-2.5 pr-3" />
                  <th className="py-2.5 pr-3">Timestamp</th>
                  <th className="py-2.5 pr-3">Action</th>
                  <th className="py-2.5 pr-3">Entity</th>
                  <th className="py-2.5 pr-3">Entity ID</th>
                  <th className="py-2.5 pr-3">Performed by</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center">
                      <Spinner />
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-sm text-red-600">
                      {error}
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-2">
                      <EmptyState
                        title="No audit events match your filters"
                        description="The billing audit log starts populating after the first order, payment, or admin action."
                        icon={History}
                      />
                    </td>
                  </tr>
                ) : (
                  items.flatMap((row) => {
                    const isOpen = expanded === row.id;
                    const href = entityHref(row.entity, row.entityId);
                    return [
                      <tr
                        key={row.id}
                        className="border-b border-[var(--border)] hover:bg-[var(--bg-secondary)]"
                      >
                        <td className="py-2.5 pr-1">
                          <button
                            type="button"
                            onClick={() => setExpanded(isOpen ? null : row.id)}
                            aria-label={isOpen ? 'Collapse details' : 'Expand details'}
                            className="rounded p-0.5 hover:bg-[var(--bg)]"
                          >
                            <ChevronRight
                              size={14}
                              className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}
                            />
                          </button>
                        </td>
                        <td className="py-2.5 pr-3 text-xs text-[var(--text-secondary)]">
                          {new Date(row.createdAt).toLocaleString('en-IN')}
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-xs">{row.action}</td>
                        <td className="py-2.5 pr-3 text-xs">{row.entity}</td>
                        <td className="py-2.5 pr-3 font-mono text-xs">
                          {row.entityId ? (
                            href ? (
                              <Link href={href} className="text-blue-600 hover:underline">
                                {row.entityId.slice(-8)}
                              </Link>
                            ) : (
                              row.entityId.slice(-8)
                            )
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-2.5 pr-3 text-xs">
                          {row.user?.email ? (
                            <Link
                              href={`/super-admin/billing/users/${row.performedBy}`}
                              className="text-blue-600 hover:underline"
                            >
                              {row.user.email}
                            </Link>
                          ) : row.performedBy === 'system' ? (
                            <span className="text-[var(--text-secondary)]">system</span>
                          ) : (
                            <span className="text-[var(--text-secondary)]">
                              {row.performedBy?.slice(-8) ?? '—'}
                            </span>
                          )}
                        </td>
                      </tr>,
                      isOpen && row.details ? (
                        <tr key={`${row.id}-details`} className="bg-[var(--bg-secondary)]">
                          <td colSpan={6} className="px-4 py-3">
                            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] uppercase">
                              <FileText size={12} /> Details
                            </div>
                            <pre className="mt-2 overflow-x-auto rounded-md bg-[var(--bg)] p-3 font-mono text-xs">
                              {JSON.stringify(row.details, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      ) : null,
                    ];
                  })
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
