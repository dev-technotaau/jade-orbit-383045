'use client';

/**
 * Super-admin refund REQUEST queue.
 *
 * The sibling `/refunds` page lists money that has already left — refunds
 * initiated by an admin or by the Razorpay dashboard. This page is the step
 * before that: customer-raised requests that are waiting on a human decision.
 * Nothing here has touched Razorpay yet, which is exactly why approving is a
 * deliberate, audited action with a confirmation panel rather than one click.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, XCircle } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import Pagination from '@/components/ui/Pagination';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import { showToast } from '@/components/ui/Toast';
import { superAdminBillingService } from '@/services/super-admin-billing.service';
import { formatPaise } from '@/types/billing';
import {
  REFUND_REQUEST_STATUS_LABEL,
  type AdminRefundRequestRow,
  type RefundRequestStatus,
} from '@/types/refund';
import type { ApiError } from '@/types/api';

// Admins reach this page when granted 'billing.refunds.view'. The role gate must admit
// ADMIN or DashboardLayout redirects them to '/' before the permission
// gate ever runs.
const ROLE = ['ADMIN', 'SUPER_ADMIN'];

const STATUS_META: Record<
  RefundRequestStatus,
  { variant: 'success' | 'warning' | 'error' | 'neutral'; icon: typeof Clock }
> = {
  PENDING: { variant: 'warning', icon: Clock },
  APPROVED: { variant: 'success', icon: CheckCircle2 },
  REJECTED: { variant: 'error', icon: XCircle },
  CANCELLED: { variant: 'neutral', icon: XCircle },
};

const STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Pending review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Declined' },
  { value: 'CANCELLED', label: 'Withdrawn' },
];

function fullName(u: { firstName: string | null; lastName: string | null; email: string }): string {
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  return name || u.email;
}

function fmt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-IN');
}

/** Per-row review state, so two rows can be open at once without interfering. */
interface ReviewDraft {
  notes: string;
  amountRupeesStr: string;
  speed: 'normal' | 'optimum';
  bypassWindow: boolean;
}

const EMPTY_DRAFT: ReviewDraft = {
  notes: '',
  amountRupeesStr: '',
  speed: 'normal',
  bypassWindow: false,
};

export default function SuperAdminRefundRequests() {
  const [items, setItems] = useState<AdminRefundRequestRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [status, setStatus] = useState<RefundRequestStatus | ''>('PENDING');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReviewDraft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState<'APPROVE' | 'REJECT' | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await superAdminBillingService.listRefundRequests({
        status: status || undefined,
        page,
        limit,
      });
      setItems(res.items);
      setTotal(res.total ?? 0);
      setPendingCount(res.pendingCount ?? 0);
    } catch (err) {
      setError((err as Error).message ?? 'Failed to load refund requests');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, page, limit]);

  function openReview(row: AdminRefundRequestRow) {
    setOpenId(row.id);
    setDraft({
      ...EMPTY_DRAFT,
      amountRupeesStr: String(row.amountPaise / 100),
      // Pre-tick the override for out-of-window rows so the reviewer sees the
      // decision they are making rather than hitting a validation wall.
      bypassWindow: !row.withinWindow,
    });
  }

  async function review(row: AdminRefundRequestRow, action: 'APPROVE' | 'REJECT') {
    setSubmitting(action);
    try {
      const rupees = Number(draft.amountRupeesStr);
      const amountPaise =
        action === 'APPROVE' && draft.amountRupeesStr.trim() !== '' && Number.isFinite(rupees)
          ? Math.round(rupees * 100)
          : undefined;

      const res = await superAdminBillingService.reviewRefundRequest(row.id, {
        action,
        reviewNotes: draft.notes.trim() || undefined,
        amountPaise,
        speed: action === 'APPROVE' ? draft.speed : undefined,
        bypassWindow: action === 'APPROVE' ? draft.bypassWindow : undefined,
      });
      showToast.success(
        action === 'APPROVE'
          ? `Refund initiated${res.razorpayRefundId ? ` (${res.razorpayRefundId})` : ''}`
          : 'Request declined — the customer has been notified',
      );
      setOpenId(null);
      setDraft(EMPTY_DRAFT);
      await load();
    } catch (err) {
      showToast.error((err as unknown as ApiError)?.message ?? 'Review failed');
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <DashboardLayout requiredRole={ROLE} requiredPermission="billing.refunds.view">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <BillingNav active="refund-requests" />

        <div className="mt-6 mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text)]">Refund requests</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Customer-raised requests awaiting a decision. Approving initiates the Razorpay refund;
              nothing moves until you do.
            </p>
          </div>
          <div className="flex items-end gap-3">
            {pendingCount > 0 && (
              <Badge variant="warning">
                {pendingCount} pending {pendingCount === 1 ? 'request' : 'requests'}
              </Badge>
            )}
            <div className="w-52">
              <label className="text-xs text-[var(--text-muted)]">Status</label>
              <Select
                value={status}
                onChange={(val) => {
                  setStatus((val ?? '') as RefundRequestStatus | '');
                  setPage(1);
                }}
                options={STATUS_OPTIONS}
                placeholder="All statuses"
                className="mt-1 w-full"
              />
            </div>
            <Link href="/super-admin/billing/refunds">
              <Button variant="outline" size="sm">
                Processed refunds
              </Button>
            </Link>
          </div>
        </div>

        {loading && (
          <Card padding="lg" className="flex items-center justify-center">
            <Spinner />
          </Card>
        )}
        {error && !loading && (
          <Card padding="lg">
            <p className="text-sm text-[var(--error)]">{error}</p>
            <Button variant="outline" className="mt-3" onClick={() => void load()}>
              Retry
            </Button>
          </Card>
        )}

        {!loading && !error && (
          <>
            {items.length === 0 ? (
              <Card padding="lg" className="text-center">
                <CheckCircle2 className="mx-auto h-9 w-9 text-[var(--text-muted)]" />
                <p className="mt-3 text-sm text-[var(--text-muted)]">
                  {status === 'PENDING'
                    ? 'No requests waiting on review.'
                    : 'No refund requests match this filter.'}
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {items.map((row) => {
                  const meta = STATUS_META[row.status];
                  const Icon = meta.icon;
                  const isOpen = openId === row.id;
                  return (
                    <Card key={row.id} padding="lg">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Icon
                              className="h-4 w-4 flex-none text-[var(--text-muted)]"
                              aria-hidden="true"
                            />
                            <span className="text-lg font-bold text-[var(--text)]">
                              {formatPaise(row.amountPaise)}
                            </span>
                            <Badge variant={meta.variant}>
                              {REFUND_REQUEST_STATUS_LABEL[row.status]}
                            </Badge>
                            {!row.withinWindow && <Badge variant="error">Outside {'window'}</Badge>}
                          </div>
                          <p className="text-sm text-[var(--text)]">
                            {row.order.plan.name}{' '}
                            <span className="text-[var(--text-muted)]">
                              · order {row.order.receiptNumber} ·{' '}
                              {formatPaise(row.order.totalPaise, row.order.currency)} paid{' '}
                              {row.order.paidAt ? fmt(row.order.paidAt) : '—'}
                            </span>
                          </p>
                          <p className="text-sm text-[var(--text-muted)]">
                            {fullName(row.user)} · {row.user.email} · {row.user.role}
                          </p>
                          <p className="text-sm text-[var(--text-secondary)]">
                            &ldquo;{row.userReason}&rdquo;
                          </p>
                          <p className="text-xs text-[var(--text-muted)]">
                            Raised {fmt(row.createdAt)}
                            {row.reviewedAt
                              ? ` · reviewed ${fmt(row.reviewedAt)}${
                                  row.reviewedBy ? ` by ${fullName(row.reviewedBy)}` : ''
                                }`
                              : ''}
                          </p>
                          {row.reviewNotes && (
                            <p className="text-sm text-[var(--text)]">
                              <span className="text-[var(--text-muted)]">Reviewer note: </span>
                              {row.reviewNotes}
                            </p>
                          )}
                          {row.refund && (
                            <p className="text-xs text-[var(--text-muted)]">
                              Refund {row.refund.status.toLowerCase()} ·{' '}
                              {formatPaise(row.refund.amountPaise)}
                              {row.refund.processedAt ? ` on ${fmt(row.refund.processedAt)}` : ''}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-none flex-col items-end gap-2">
                          <Link
                            href={`/super-admin/billing/orders/${row.orderId}`}
                            className="text-primary inline-flex items-center gap-1 text-xs"
                          >
                            View order <ExternalLink className="h-3 w-3" />
                          </Link>
                          {row.status === 'PENDING' && !isOpen && (
                            <Button variant="primary" size="sm" onClick={() => openReview(row)}>
                              Review
                            </Button>
                          )}
                        </div>
                      </div>

                      {isOpen && row.status === 'PENDING' && (
                        <div className="mt-5 space-y-4 border-t border-[var(--border)] pt-5">
                          {!row.withinWindow && (
                            <div className="flex items-start gap-2 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
                              <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                              <p>
                                This request arrived after the published refund window. Approving it
                                is a goodwill decision and is recorded as such in the audit log.
                              </p>
                            </div>
                          )}

                          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            <div>
                              <label className="text-xs text-[var(--text-muted)]">
                                Approve amount (₹) — max {row.amountPaise / 100}
                              </label>
                              <input
                                type="number"
                                min={1}
                                max={row.amountPaise / 100}
                                value={draft.amountRupeesStr}
                                onChange={(e) =>
                                  setDraft({ ...draft, amountRupeesStr: e.target.value })
                                }
                                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-[var(--text-muted)]">
                                Refund speed
                              </label>
                              <Select
                                value={draft.speed}
                                onChange={(val) =>
                                  setDraft({ ...draft, speed: val as 'normal' | 'optimum' })
                                }
                                options={[
                                  { value: 'normal', label: 'normal (3-5 days, free)' },
                                  { value: 'optimum', label: 'optimum (instant, fees apply)' },
                                ]}
                                clearable={false}
                                className="mt-1 w-full"
                              />
                            </div>
                            <label className="flex items-end gap-2 pb-2 text-sm">
                              <input
                                type="checkbox"
                                checked={draft.bypassWindow}
                                onChange={(e) =>
                                  setDraft({ ...draft, bypassWindow: e.target.checked })
                                }
                              />
                              <span>Goodwill override (outside window)</span>
                            </label>
                          </div>

                          <Textarea
                            label="Note to the customer"
                            rows={3}
                            maxLength={1000}
                            showCount
                            value={draft.notes}
                            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                            placeholder="Shown to the customer on the decision — required in practice for a decline."
                          />

                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="primary"
                              onClick={() => void review(row, 'APPROVE')}
                              isLoading={submitting === 'APPROVE'}
                              disabled={submitting !== null}
                            >
                              Approve &amp; refund
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => void review(row, 'REJECT')}
                              isLoading={submitting === 'REJECT'}
                              disabled={submitting !== null}
                            >
                              Decline
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setOpenId(null);
                                setDraft(EMPTY_DRAFT);
                              }}
                              disabled={submitting !== null}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}

            <Pagination
              currentPage={page}
              totalPages={Math.max(1, Math.ceil(total / limit))}
              onPageChange={setPage}
              totalItems={total}
              pageSize={limit}
              onPageSizeChange={(s) => {
                setLimit(s);
                setPage(1);
              }}
              className="mt-4"
            />
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
