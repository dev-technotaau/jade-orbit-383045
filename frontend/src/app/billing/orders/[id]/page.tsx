'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Receipt, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import RefundRequestPanel from '@/components/billing/RefundRequestPanel';
import { orderService } from '@/services/order.service';
import { formatPaise } from '@/types/billing';
import type { OrderDetail, OrderStatus } from '@/types/order';

const STATUS_TONE: Record<
  OrderStatus,
  { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' }
> = {
  CREATED: { label: 'Awaiting payment', tone: 'warn' },
  ATTEMPTED: { label: 'Payment in progress', tone: 'warn' },
  PAID: { label: 'Paid', tone: 'good' },
  FAILED: { label: 'Failed', tone: 'bad' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  EXPIRED: { label: 'Expired', tone: 'neutral' },
  REFUND_PENDING: { label: 'Refund pending', tone: 'warn' },
  REFUNDED: { label: 'Refunded', tone: 'neutral' },
  PARTIALLY_REFUNDED: { label: 'Partially refunded', tone: 'neutral' },
  DISPUTED: { label: 'Disputed', tone: 'bad' },
  FRAUD_FLAGGED: { label: 'Flagged for review', tone: 'bad' },
};

/** Orders that took money, and can therefore host refund controls. */
const REFUNDABLE_ORDER_STATUSES = new Set<OrderStatus>([
  'PAID',
  'PARTIALLY_REFUNDED',
  'REFUND_PENDING',
  'REFUNDED',
]);

export default function OrderDetailPage() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const id = String(params?.id ?? '');
  const fromCheckout = search?.get('from') === 'checkout';

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    orderService
      .get(id)
      .then((res) => {
        if (active) setOrder(res);
      })
      .catch((err) => {
        if (active) setError(err?.message ?? 'Failed to load order');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  async function cancel() {
    if (!order) return;
    setCancelling(true);
    try {
      await orderService.cancel(order.id);
      const refreshed = await orderService.get(order.id);
      setOrder(refreshed);
    } catch (err) {
      setError((err as Error).message ?? 'Failed to cancel');
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Spinner size="lg" />
        </div>
      </DashboardLayout>
    );
  }
  if (!order) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-2xl px-4 py-12">
          <Card padding="lg">
            <p className="text-[var(--text-muted)]">{error ?? 'Order not found.'}</p>
            <Link
              href="/billing/orders"
              className="text-primary mt-4 inline-flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" /> Back to orders
            </Link>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const tone = STATUS_TONE[order.status];

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl px-4 py-10">
        <Link
          href="/billing/orders"
          className="text-primary mb-6 inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Back to orders
        </Link>

        {fromCheckout && order.status === 'PAID' && (
          <Card padding="lg" className="border-green-300 bg-green-50">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-green-700" />
              <div>
                <p className="font-semibold text-green-900">Payment successful</p>
                <p className="text-sm text-green-800">
                  Your plan is active. We&apos;ve sent a tax invoice to your email.
                </p>
              </div>
            </div>
          </Card>
        )}

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-[1fr_320px]">
          <Card padding="lg">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs tracking-wide text-[var(--text-muted)] uppercase">
                  Order receipt
                </p>
                <h1 className="mt-1 text-2xl font-bold text-[var(--text)]">
                  {order.receiptNumber}
                </h1>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Placed {new Date(order.createdAt).toLocaleString('en-IN')}
                </p>
              </div>
              <StatusBadge label={tone.label} tone={tone.tone} />
            </div>

            <div className="mt-6 space-y-2 text-sm">
              <Row k="Plan" v={order.plan?.name ?? 'Plan'} />
              <Row k="Plan code" v={order.plan?.code ?? '—'} />
              {(order.quantity ?? 1) > 1 && <Row k="Quantity" v={`× ${order.quantity}`} />}
              <Row k="Place of supply" v={order.placeOfSupplyState ?? '—'} />
              <Row k="Tax region" v={order.taxRegion.replace(/_/g, ' ')} />
              {order.razorpayOrderId && <Row k="Razorpay order" v={order.razorpayOrderId} />}
            </div>

            <h2 className="mt-8 text-base font-semibold text-[var(--text)]">Pricing breakdown</h2>
            <table className="mt-2 w-full text-sm">
              <tbody>
                <Money k="Subtotal (taxable)" v={order.taxableAmountPaise} c={order.currency} />
                {order.discountPaise > 0 && (
                  <Money k="Discount" v={-order.discountPaise} c={order.currency} />
                )}
                {order.prorationPaise > 0 && (
                  <Money k="Pro-ration credit" v={-order.prorationPaise} c={order.currency} />
                )}
                {order.cgstPaise > 0 && (
                  <Money k="CGST 9%" v={order.cgstPaise} c={order.currency} />
                )}
                {order.sgstPaise > 0 && (
                  <Money k="SGST 9%" v={order.sgstPaise} c={order.currency} />
                )}
                {order.igstPaise > 0 && (
                  <Money k="IGST 18%" v={order.igstPaise} c={order.currency} />
                )}
                <Money k="Total" v={order.totalPaise} c={order.currency} bold />
              </tbody>
            </table>

            {order.payments.length > 0 && (
              <>
                <h2 className="mt-8 text-base font-semibold text-[var(--text)]">Payments</h2>
                <ul className="mt-2 space-y-2 text-sm">
                  {order.payments.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between rounded-lg border border-[var(--border)] p-3"
                    >
                      <div>
                        <p className="font-medium text-[var(--text)]">
                          {p.method.toLowerCase()} ·{' '}
                          {p.cardLast4
                            ? `${p.cardNetwork ?? 'Card'} ••${p.cardLast4}`
                            : p.vpa
                              ? p.vpa
                              : p.bank
                                ? p.bank
                                : (p.wallet ?? 'payment')}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {p.razorpayPaymentId} · {new Date(p.createdAt).toLocaleString('en-IN')}
                        </p>
                      </div>
                      <span className="font-semibold text-[var(--text)]">
                        {formatPaise(p.amountPaise, p.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* Refund controls — only for orders that actually took money.
                Raising a request queues it for review; it never refunds
                automatically. Same component as the plan detail page. */}
            {REFUNDABLE_ORDER_STATUSES.has(order.status) && (
              <div className="mt-8 border-t border-[var(--border)] pt-6">
                <RefundRequestPanel orderId={order.id} />
              </div>
            )}
          </Card>

          <Card padding="lg" className="self-start">
            <h2 className="text-base font-semibold text-[var(--text)]">Actions</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {order.status === 'CREATED' && 'Order awaiting payment.'}
              {order.status === 'ATTEMPTED' && 'Last payment attempt is being processed.'}
              {order.status === 'PAID' && 'Plan is active. Manage from the dashboard.'}
              {order.status === 'CANCELLED' && 'Cancelled — no charges.'}
              {order.status === 'EXPIRED' && 'Order expired before payment.'}
            </p>

            <div className="mt-4 space-y-2">
              {(order.status === 'CREATED' || order.status === 'ATTEMPTED') && (
                <>
                  <Link href={`/billing/checkout/order/${order.id}`} className="block">
                    <Button variant="primary" className="w-full">
                      Resume payment
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => void cancel()}
                    isLoading={cancelling}
                  >
                    Cancel order
                  </Button>
                </>
              )}
              {order.status === 'PAID' && (
                <>
                  <Link href="/billing/invoices" className="block">
                    <Button variant="outline" className="w-full">
                      <Receipt className="mr-2 h-4 w-4" /> View invoice
                    </Button>
                  </Link>
                  <Button variant="outline" className="w-full" onClick={() => router.push('/')}>
                    Go to dashboard
                  </Button>
                </>
              )}
              {(order.status === 'FAILED' ||
                order.status === 'EXPIRED' ||
                order.status === 'CANCELLED') &&
                order.plan?.code && (
                  <Link href={`/billing/checkout/${order.plan.code}`} className="block">
                    <Button variant="primary" className="w-full">
                      Buy this plan again
                    </Button>
                  </Link>
                )}
            </div>

            {error && (
              <p className="mt-3 text-sm text-[var(--error)]" role="alert">
                {error}
              </p>
            )}
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-[var(--text-muted)]">{k}</span>
      <span className="text-right font-medium text-[var(--text)]">{v}</span>
    </div>
  );
}

function Money({ k, v, c, bold }: { k: string; v: number; c: string; bold?: boolean }) {
  return (
    <tr className={bold ? 'border-t border-[var(--border)]' : ''}>
      <td className={`py-1.5 ${bold ? 'font-semibold' : 'text-[var(--text-muted)]'}`}>{k}</td>
      <td className={`py-1.5 text-right ${bold ? 'font-bold text-[var(--text)]' : ''}`}>
        {v < 0 ? `- ${formatPaise(Math.abs(v), c)}` : formatPaise(v, c)}
      </td>
    </tr>
  );
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
}) {
  const cls = {
    good: 'bg-green-100 text-green-900',
    warn: 'bg-yellow-100 text-yellow-900',
    bad: 'bg-red-100 text-red-900',
    neutral: 'bg-[var(--bg-secondary)] text-[var(--text-muted)]',
  }[tone];
  const Icon = tone === 'good' ? CheckCircle2 : tone === 'warn' ? Clock : AlertCircle;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cls}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}
