'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Building2, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Select from '@/components/ui/Select';
import Spinner from '@/components/ui/Spinner';
import Pagination from '@/components/ui/Pagination';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import {
  superAdminBillingService,
  type AdminQuoteRow,
} from '@/services/super-admin-billing.service';

// Admins reach this page when granted 'billing.quotes.view'. The role gate must admit
// ADMIN or DashboardLayout redirects them to '/' before the permission
// gate ever runs.
const ROLE = ['ADMIN', 'SUPER_ADMIN'];
type Status = AdminQuoteRow['status'];

const TONE: Record<Status, string> = {
  NEW: 'bg-blue-100 text-blue-900',
  IN_REVIEW: 'bg-yellow-100 text-yellow-900',
  CONTACTED: 'bg-yellow-100 text-yellow-900',
  NEGOTIATING: 'bg-purple-100 text-purple-900',
  ACCEPTED: 'bg-green-100 text-green-900',
  REJECTED: 'bg-[var(--bg-secondary)] text-[var(--text-muted)]',
  CONVERTED: 'bg-green-100 text-green-900',
  WITHDRAWN: 'bg-[var(--bg-secondary)] text-[var(--text-muted)]',
};

export default function SuperAdminQuotes() {
  const [items, setItems] = useState<AdminQuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | ''>('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await superAdminBillingService.listQuotesAdmin({
        status: (status || undefined) as Status | undefined,
        page,
        limit,
      });
      setItems(res.items);
      setTotal(res.total ?? 0);
    } catch (err) {
      setError((err as Error).message ?? 'Failed to load quotes');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [status, page, limit]);

  return (
    <DashboardLayout requiredRole={ROLE} requiredPermission="billing.quotes.view">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <BillingNav active="quotes" />
        <h1 className="mt-6 mb-4 text-3xl font-bold text-[var(--text)]">CV Enterprise quotes</h1>

        <Card padding="md" className="mb-4">
          <div className="flex gap-3">
            <div>
              <label htmlFor="quote-status" className="text-xs text-[var(--text-muted)]">
                Status
              </label>
              <Select
                id="quote-status"
                value={status}
                onChange={(val) => {
                  setStatus(val as Status | '');
                  setPage(1);
                }}
                options={[
                  { value: '', label: 'All' },
                  { value: 'NEW', label: 'New' },
                  { value: 'IN_REVIEW', label: 'In review' },
                  { value: 'CONTACTED', label: 'Contacted' },
                  { value: 'NEGOTIATING', label: 'Negotiating' },
                  { value: 'ACCEPTED', label: 'Accepted' },
                  { value: 'REJECTED', label: 'Rejected' },
                  { value: 'CONVERTED', label: 'Converted' },
                ]}
                clearable={false}
                className="mt-1 w-44"
              />
            </div>
          </div>
        </Card>

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
            {items.map((q) => {
              const slaBreached =
                q.slaDueAt && new Date(q.slaDueAt) < new Date() && q.status === 'NEW';
              return (
                <Link key={q.id} href={`/super-admin/billing/quotes/${q.id}`} className="block">
                  <Card padding="md" className="hover:border-[var(--border-hover)]">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <div
                          className={`flex h-10 w-10 flex-none items-center justify-center rounded-lg ${
                            slaBreached ? 'bg-red-100 text-red-700' : 'bg-primary/10 text-primary'
                          }`}
                        >
                          <Building2 className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[var(--text)]">
                            {q.companyName}
                          </p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {q.contactPerson} · {q.email}
                            {q.requiredCvCount && ` · ${q.requiredCvCount} CVs`}
                            {q.budgetRange && ` · ${q.budgetRange}`}
                          </p>
                          {q.slaDueAt && q.status === 'NEW' && (
                            <p
                              className={`mt-0.5 text-xs ${slaBreached ? 'font-semibold text-red-700' : 'text-[var(--text-muted)]'}`}
                            >
                              {slaBreached ? (
                                <>
                                  <AlertCircle className="mr-1 inline h-3 w-3" />
                                  SLA breached: due {new Date(q.slaDueAt).toLocaleString('en-IN')}
                                </>
                              ) : (
                                <>
                                  <Clock className="mr-1 inline h-3 w-3" />
                                  SLA due {new Date(q.slaDueAt).toLocaleString('en-IN')}
                                </>
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-none items-center gap-3">
                        {q.offers && q.offers.length > 0 && (
                          <span className="text-xs text-[var(--text-muted)]">
                            {q.offers.length} offer{q.offers.length === 1 ? '' : 's'}
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${TONE[q.status]}`}
                        >
                          {q.status === 'ACCEPTED' || q.status === 'CONVERTED' ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : null}
                          {q.status.replace(/_/g, ' ').toLowerCase()}
                        </span>
                        <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
            {items.length === 0 && (
              <Card padding="lg" className="text-center text-sm text-[var(--text-muted)]">
                No quote requests yet.
              </Card>
            )}
            {total > 0 && (
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
                className="pt-2"
              />
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
