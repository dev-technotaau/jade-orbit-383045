'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Clock, CheckCircle2, XCircle } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import Pagination from '@/components/ui/Pagination';
import {
  superAdminBillingService,
  type AdminDispute,
} from '@/services/super-admin-billing.service';
import { formatPaise } from '@/types/billing';

// Admins reach this page when granted 'billing.disputes.view'. The role gate must admit
// ADMIN or DashboardLayout redirects them to '/' before the permission
// gate ever runs.
const ROLE = ['ADMIN', 'SUPER_ADMIN'];

const TONE: Record<AdminDispute['status'], string> = {
  OPEN: 'bg-red-100 text-red-900',
  UNDER_REVIEW: 'bg-yellow-100 text-yellow-900',
  WON: 'bg-green-100 text-green-900',
  LOST: 'bg-[var(--bg-secondary)] text-[var(--text-muted)]',
  ACCEPTED: 'bg-[var(--bg-secondary)] text-[var(--text-muted)]',
};

export default function SuperAdminDisputes() {
  const [items, setItems] = useState<AdminDispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [total, setTotal] = useState(0);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await superAdminBillingService.listDisputesAdmin({ page, limit });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      setError((err as Error)?.message ?? 'Failed to load disputes');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit]);

  const totalPages = Math.ceil(total / limit);

  return (
    <DashboardLayout requiredRole={ROLE} requiredPermission="billing.disputes.view">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <BillingNav active="disputes" />
        <h1 className="mt-6 mb-4 text-3xl font-bold text-[var(--text)]">Disputes</h1>

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
        {!loading && !error && (
          <div className="space-y-3">
            {items.map((d) => (
              <Card key={d.id} padding="md">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--text)]">
                      {d.razorpayDisputeId}
                      {d.dueByAt && new Date(d.dueByAt) < new Date() && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-900">
                          <AlertCircle className="h-3 w-3" /> overdue
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Payment: <span className="font-mono">{d.paymentId}</span> ·{' '}
                      {formatPaise(d.amountPaise)} · {d.reasonCode ?? 'no reason code'}
                    </p>
                    {d.reasonDescription && (
                      <p className="mt-1 text-sm text-[var(--text)]">{d.reasonDescription}</p>
                    )}
                    {d.dueByAt && (
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        <Clock className="mr-1 inline h-3 w-3" />
                        Respond by {new Date(d.dueByAt).toLocaleString('en-IN')}
                      </p>
                    )}
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${TONE[d.status]}`}
                  >
                    {d.status === 'WON' ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : d.status === 'LOST' || d.status === 'ACCEPTED' ? (
                      <XCircle className="h-3 w-3" />
                    ) : (
                      <AlertCircle className="h-3 w-3" />
                    )}
                    {d.status.replace(/_/g, ' ').toLowerCase()}
                  </span>
                </div>
              </Card>
            ))}
            {items.length === 0 && (
              <Card padding="lg" className="text-center text-sm text-[var(--text-muted)]">
                No disputes — keep it that way.
              </Card>
            )}
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
              totalItems={total}
              pageSize={limit}
              onPageSizeChange={(s) => {
                setLimit(s);
                setPage(1);
              }}
            />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
