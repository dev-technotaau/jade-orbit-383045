'use client';

/**
 * RefundRequestPanel — the customer's refund controls for ONE order.
 *
 * Deliberately honest about the flow: raising a request moves no money and
 * promises no outcome. Every request is reviewed by a human, so the panel
 * shows (a) whether the order is eligible and until when, (b) the request's
 * current state once raised, and (c) a withdraw action while it is pending.
 *
 * Mounted from the plan detail page (per payment) and from the order detail
 * page, both of which pass the same `orderId`.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock, RotateCcw, XCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Textarea from '@/components/ui/Textarea';
import Spinner from '@/components/ui/Spinner';
import { showToast } from '@/components/ui/Toast';
import { refundRequestService } from '@/services/refund-request.service';
import { formatPaise } from '@/types/billing';
import { REFUND_REQUEST_STATUS_LABEL, type RefundRequestStatus } from '@/types/refund';
import type { ApiError } from '@/types/api';

const MIN_REASON = 10;

const STATUS_META: Record<
  RefundRequestStatus,
  { variant: 'success' | 'warning' | 'error' | 'neutral'; icon: typeof Clock }
> = {
  PENDING: { variant: 'warning', icon: Clock },
  APPROVED: { variant: 'success', icon: CheckCircle2 },
  REJECTED: { variant: 'error', icon: XCircle },
  CANCELLED: { variant: 'neutral', icon: RotateCcw },
};

function fmt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface Props {
  orderId: string;
}

export default function RefundRequestPanel({ orderId }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  const eligibilityKey = ['billing', 'refund-eligibility', orderId];
  const requestsKey = ['billing', 'refund-requests', orderId];

  const { data: eligibility, isLoading: eligibilityLoading } = useQuery({
    queryKey: eligibilityKey,
    queryFn: () => refundRequestService.getEligibility(orderId),
    staleTime: 30_000,
  });

  const { data: requests = [] } = useQuery({
    queryKey: requestsKey,
    queryFn: () => refundRequestService.list({ orderId }),
    staleTime: 30_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: eligibilityKey });
    void queryClient.invalidateQueries({ queryKey: requestsKey });
  };

  const createRequest = useMutation({
    mutationFn: () => refundRequestService.create({ orderId, userReason: reason.trim() }),
    onSuccess: () => {
      showToast.success('Refund request submitted — we review requests within 2 business days');
      setOpen(false);
      setReason('');
      invalidate();
    },
    onError: (err) => {
      showToast.error(
        (err as unknown as ApiError)?.message ?? 'Could not submit your refund request',
      );
    },
  });

  const cancelRequest = useMutation({
    mutationFn: (id: string) => refundRequestService.cancel(id),
    onSuccess: () => {
      showToast.success('Refund request withdrawn');
      invalidate();
    },
    onError: (err) => {
      showToast.error((err as unknown as ApiError)?.message ?? 'Could not withdraw the request');
    },
  });

  if (eligibilityLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <Spinner /> Checking refund eligibility…
      </div>
    );
  }

  const latest = requests[0];
  const canRequest = eligibility?.canRequest ?? false;
  const reasonTooShort = reason.trim().length < MIN_REASON;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-[var(--text)]">Refunds &amp; cancellation</h3>

      {/* ---- History: every request raised on this order ---- */}
      {requests.length > 0 && (
        <ul className="space-y-2">
          {requests.map((r) => {
            const meta = STATUS_META[r.status];
            const Icon = meta.icon;
            return (
              <li
                key={r.id}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Icon
                        className="h-4 w-4 flex-none text-[var(--text-muted)]"
                        aria-hidden="true"
                      />
                      <span className="text-sm font-semibold text-[var(--text)]">
                        {formatPaise(r.amountPaise)}
                      </span>
                      <Badge variant={meta.variant}>{REFUND_REQUEST_STATUS_LABEL[r.status]}</Badge>
                      {!r.withinWindow && r.status === 'PENDING' && (
                        <Badge variant="neutral">Goodwill review</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Raised {fmt(r.createdAt)}
                      {r.reviewedAt ? ` · reviewed ${fmt(r.reviewedAt)}` : ''}
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      &ldquo;{r.userReason}&rdquo;
                    </p>
                    {r.reviewNotes && (
                      <p className="mt-1 text-sm text-[var(--text)]">
                        <span className="text-[var(--text-muted)]">Our response: </span>
                        {r.reviewNotes}
                      </p>
                    )}
                    {r.refund && (
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        Refund {r.refund.status.toLowerCase()}
                        {r.refund.processedAt ? ` on ${fmt(r.refund.processedAt)}` : ''} — allow 5–7
                        business days to reflect on your statement.
                      </p>
                    )}
                  </div>
                  {r.status === 'PENDING' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => cancelRequest.mutate(r.id)}
                      isLoading={cancelRequest.isPending}
                      disabled={cancelRequest.isPending}
                    >
                      Withdraw
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* ---- Action / explanation ---- */}
      {canRequest ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            Request a refund
          </Button>
          <p className="text-xs text-[var(--text-muted)]">
            Up to {formatPaise(eligibility?.refundablePaise ?? 0)} refundable
            {eligibility?.withinWindow
              ? eligibility.windowEndsAt
                ? ` until ${fmt(eligibility.windowEndsAt)}`
                : ''
              : ' — outside the standard window, reviewed as a goodwill request'}
            .
          </p>
        </div>
      ) : (
        !latest && (
          <p className="text-xs text-[var(--text-muted)]">
            {eligibility?.blockedReason ?? 'This order is not eligible for a refund.'}
          </p>
        )
      )}

      {/* ---- Request modal ---- */}
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Request a refund"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createRequest.mutate()}
              isLoading={createRequest.isPending}
              disabled={reasonTooShort || createRequest.isPending}
            >
              Submit request
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
            <p>
              Every request is reviewed by our billing team — nothing is charged back automatically.
              We&apos;ll email you the decision, usually within 2 business days.
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-[var(--text-muted)]">Refundable amount</dt>
              <dd className="font-semibold text-[var(--text)]">
                {formatPaise(eligibility?.refundablePaise ?? 0)}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--text-muted)]">Refund window</dt>
              <dd className="font-semibold text-[var(--text)]">
                {eligibility?.windowDays ?? 0} days
                {eligibility && !eligibility.withinWindow && (
                  <span className="text-[var(--warning-dark)]"> · elapsed</span>
                )}
              </dd>
            </div>
          </dl>

          {eligibility && !eligibility.withinWindow && (
            <p className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
              This purchase is past the {eligibility.windowDays}-day window. You can still ask — it
              will be reviewed as a goodwill request, which we approve at our discretion.
            </p>
          )}

          <Textarea
            label="Why are you requesting a refund?"
            required
            rows={4}
            maxLength={1000}
            showCount
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Tell us what went wrong or why the plan isn't right for you. The more specific, the faster we can decide."
            helperText={
              reasonTooShort
                ? `Please write at least ${MIN_REASON} characters.`
                : 'This is sent to the reviewer as-is.'
            }
          />

          <p className="text-xs text-[var(--text-muted)]">
            If approved, any quota already used on this plan is clawed back and the refund is sent
            to your original payment method. See our{' '}
            <Link href="/refund-policy" target="_blank" className="text-primary underline">
              refund policy
            </Link>
            .
          </p>
        </div>
      </Modal>
    </div>
  );
}
