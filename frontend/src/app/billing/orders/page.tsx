'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Receipt, ChevronRight, FileText } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import Button from '@/components/ui/Button';
import Pagination from '@/components/ui/Pagination';
import { orderService } from '@/services/order.service';
import { usePricingHref } from '@/lib/pricing-href';
import { formatPaise } from '@/types/billing';
import type { OrderListItem, OrdersListResponse, OrderStatus } from '@/types/order';

const STATUS_PILL: Record<OrderStatus, string> = {
  CREATED: 'bg-[var(--bg-secondary)] text-[var(--text-muted)]',
  ATTEMPTED: 'bg-yellow-100 text-yellow-900',
  PAID: 'bg-green-100 text-green-900',
  FAILED: 'bg-red-100 text-red-900',
  CANCELLED: 'bg-[var(--bg-secondary)] text-[var(--text-muted)]',
  EXPIRED: 'bg-[var(--bg-secondary)] text-[var(--text-muted)]',
  REFUND_PENDING: 'bg-orange-100 text-orange-900',
  REFUNDED: 'bg-blue-100 text-blue-900',
  PARTIALLY_REFUNDED: 'bg-blue-100 text-blue-900',
  DISPUTED: 'bg-purple-100 text-purple-900',
  FRAUD_FLAGGED: 'bg-red-100 text-red-900',
};

export default function OrderHistoryPage() {
  const [orders, setOrders] = useState<OrdersListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const pricingHref = usePricingHref();
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  useEffect(() => {
    let active = true;
    orderService
      .list({ page, limit })
      .then((res) => {
        if (active) setOrders(res);
      })
      .catch((err) => {
        if (active) setError(err?.message ?? 'Failed to load orders');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, limit]);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-8 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text)]">Order history</h1>
            <p className="text-sm text-[var(--text-muted)]">
              Every plan purchase, with payment status and invoices.
            </p>
          </div>
          <Link href={pricingHref}>
            <Button variant="outline">Browse plans</Button>
          </Link>
        </div>

        {loading && (
          <Card padding="lg" className="flex items-center justify-center">
            <Spinner />
          </Card>
        )}

        {error && (
          <Card padding="lg">
            <p className="text-sm text-[var(--error)]">{error}</p>
          </Card>
        )}

        {!loading && !error && (orders?.items.length ?? 0) === 0 && (
          <Card padding="lg" className="text-center">
            <Receipt className="text-primary mx-auto h-10 w-10" />
            <h2 className="mt-3 text-lg font-semibold text-[var(--text)]">No orders yet</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Pick a plan to get started.</p>
            <Link href={pricingHref} className="mt-4 inline-block">
              <Button variant="primary">View plans</Button>
            </Link>
          </Card>
        )}

        {!loading && !error && (orders?.items.length ?? 0) > 0 && (
          <div className="space-y-3">
            {orders!.items.map((order) => (
              <OrderRow key={order.id} order={order} />
            ))}

            <Pagination
              currentPage={page}
              totalPages={orders!.totalPages}
              onPageChange={setPage}
              totalItems={orders!.total}
              pageSize={limit}
              onPageSizeChange={(s) => {
                setLimit(s);
                setPage(1);
              }}
              className="pt-2"
            />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function OrderRow({ order }: { order: OrderListItem }) {
  const created = new Date(order.createdAt).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const planName = order.plan?.name ?? 'Plan';
  return (
    <Link href={`/billing/orders/${order.id}`} className="block">
      <Card padding="md" className="hover:border-[var(--border-hover)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="bg-primary/10 text-primary flex h-10 w-10 flex-none items-center justify-center rounded-lg">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold text-[var(--text)]">{planName}</p>
              <p className="text-xs text-[var(--text-muted)]">
                {order.receiptNumber} · {created}
              </p>
            </div>
          </div>
          <div className="flex flex-none items-center gap-3">
            <span className="text-right text-sm font-semibold text-[var(--text)]">
              {formatPaise(order.totalPaise, order.currency)}
            </span>
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL[order.status]}`}
            >
              {order.status.replace(/_/g, ' ').toLowerCase()}
            </span>
            <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
          </div>
        </div>
      </Card>
    </Link>
  );
}
