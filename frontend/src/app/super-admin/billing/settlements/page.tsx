'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import Pagination from '@/components/ui/Pagination';
import {
  superAdminBillingService,
  type AdminSettlement,
} from '@/services/super-admin-billing.service';
import { showToast } from '@/components/ui/Toast';
import { formatPaise } from '@/types/billing';

// Admins reach this page when granted 'billing.settlements.view'. The role gate must admit
// ADMIN or DashboardLayout redirects them to '/' before the permission
// gate ever runs.
const ROLE = ['ADMIN', 'SUPER_ADMIN'];

const TONE: Record<AdminSettlement['status'], string> = {
  SCHEDULED: 'bg-yellow-100 text-yellow-900',
  PROCESSED: 'bg-green-100 text-green-900',
  FAILED: 'bg-red-100 text-red-900',
};

export default function SuperAdminSettlements() {
  const [items, setItems] = useState<AdminSettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(100);
  const [total, setTotal] = useState(0);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await superAdminBillingService.listSettlementsAdmin({ page, limit });
      setItems(res.items);
      setTotal(res.total ?? 0);
    } catch (err) {
      setError((err as Error).message ?? 'Failed to load settlements');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit]);

  async function sync() {
    setSyncing(true);
    try {
      await superAdminBillingService.syncSettlements();
      await load();
    } catch (err) {
      showToast.error((err as Error).message ?? 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  const totalNet = items.reduce((s, x) => s + x.netPaise, 0);

  return (
    <DashboardLayout requiredRole={ROLE} requiredPermission="billing.settlements.view">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <BillingNav active="settlements" />
        <div className="mt-6 mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text)]">Settlements</h1>
            <p className="text-sm text-[var(--text-muted)]">
              Net (this page): <strong>{formatPaise(totalNet)}</strong>
            </p>
          </div>
          <Button variant="outline" onClick={() => void sync()} isLoading={syncing}>
            <RefreshCw className="mr-2 h-4 w-4" /> Sync from Razorpay
          </Button>
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
        {!loading && !error && (
          <Card padding="md">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)] uppercase">
                <tr>
                  <th className="py-2">Razorpay id</th>
                  <th className="py-2">Settled on</th>
                  <th className="py-2">UTR</th>
                  <th className="py-2 text-right">Gross</th>
                  <th className="py-2 text-right">Fees</th>
                  <th className="py-2 text-right">Tax</th>
                  <th className="py-2 text-right">Net</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2.5 font-mono text-xs">{s.razorpaySettlementId}</td>
                    <td className="py-2.5 text-xs">
                      {new Date(s.settledOnDate).toLocaleDateString('en-IN')}
                    </td>
                    <td className="py-2.5 font-mono text-xs">{s.utr ?? '—'}</td>
                    <td className="py-2.5 text-right">{formatPaise(s.amountPaise)}</td>
                    <td className="py-2.5 text-right text-[var(--text-muted)]">
                      {formatPaise(s.feesPaise)}
                    </td>
                    <td className="py-2.5 text-right text-[var(--text-muted)]">
                      {formatPaise(s.taxPaise)}
                    </td>
                    <td className="py-2.5 text-right font-semibold">{formatPaise(s.netPaise)}</td>
                    <td className="py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TONE[s.status]}`}
                      >
                        {s.status.toLowerCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 && (
              <p className="py-8 text-center text-sm text-[var(--text-muted)]">
                No settlements yet — they appear T+2/T+3 after Razorpay payouts.
              </p>
            )}
            {total > 0 && (
              <div className="mt-4 border-t border-[var(--border)] pt-4">
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
                />
              </div>
            )}
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
