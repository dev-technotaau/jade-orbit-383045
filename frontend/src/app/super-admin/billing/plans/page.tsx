'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Eye, Archive, CheckCircle2 } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import Tooltip from '@/components/ui/Tooltip';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import { superAdminBillingService } from '@/services/super-admin-billing.service';
import { confirmDialog } from '@/components/ui/dialog-service';
import { showToast } from '@/components/ui/Toast';
import { formatPaise, type AdminPlan } from '@/types/billing';

// Admins reach this page when granted 'billing.plans.view'. The role gate must admit
// ADMIN or DashboardLayout redirects them to '/' before the permission
// gate ever runs.
const ROLE = ['ADMIN', 'SUPER_ADMIN'];

const STATUS_TONE: Record<string, string> = {
  DRAFT: 'bg-[var(--bg-secondary)] text-[var(--text-muted)]',
  ACTIVE: 'bg-green-100 text-green-900',
  ARCHIVED: 'bg-red-100 text-red-900',
  HIDDEN: 'bg-yellow-100 text-yellow-900',
};

export default function SuperAdminPlans() {
  const [items, setItems] = useState<AdminPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await superAdminBillingService.listPlansAdmin({ includeArchived: true });
      setItems(res);
    } catch (err) {
      setError((err as Error).message ?? 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function publish(id: string) {
    if (
      !(await confirmDialog({
        title: 'Publish plan',
        message: 'Publish this plan to public catalog?',
        confirmLabel: 'Publish',
        variant: 'warning',
      }))
    )
      return;
    try {
      await superAdminBillingService.publishPlanAdmin(id);
      await load();
    } catch (err) {
      showToast.error((err as Error).message ?? 'Publish failed');
    }
  }

  async function archive(id: string) {
    if (
      !(await confirmDialog({
        title: 'Archive plan',
        message: 'Archive this plan? It will be removed from public catalog.',
        confirmLabel: 'Archive',
        variant: 'danger',
      }))
    )
      return;
    try {
      await superAdminBillingService.archivePlanAdmin(id);
      await load();
    } catch (err) {
      showToast.error((err as Error).message ?? 'Archive failed');
    }
  }

  return (
    <DashboardLayout requiredRole={ROLE} requiredPermission="billing.plans.view">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <BillingNav active="plans" />
        <div className="mt-6 mb-4 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-[var(--text)]">Plans</h1>
          <Link href="/super-admin/billing/plans/new">
            <Button variant="primary">
              <Plus className="mr-2 h-4 w-4" /> Create plan
            </Button>
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
        {!loading && !error && (
          <Card padding="md">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)] uppercase">
                <tr>
                  <th className="py-2">Code</th>
                  <th className="py-2">Name</th>
                  <th className="py-2">Category</th>
                  <th className="py-2">Cycle</th>
                  <th className="py-2 text-right">Price</th>
                  <th className="py-2">Validity</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Public</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2.5 font-mono text-xs">{p.code}</td>
                    <td className="py-2.5 font-medium">{p.name}</td>
                    <td className="py-2.5 text-xs text-[var(--text-muted)]">
                      {p.category.replace(/_/g, ' ').toLowerCase()}
                    </td>
                    <td className="py-2.5 text-xs">{p.billingCycle.toLowerCase()}</td>
                    <td className="py-2.5 text-right font-semibold">
                      {p.requiresQuote ? 'Custom' : formatPaise(p.basePricePaise, p.currency)}
                    </td>
                    <td className="py-2.5 text-xs">{p.validityDays ?? '—'} days</td>
                    <td className="py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[p.status]}`}
                      >
                        {p.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="py-2.5">
                      {p.isPublic ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">private</span>
                      )}
                    </td>
                    <td className="py-2.5">
                      <div className="flex gap-1">
                        <Tooltip content="Edit">
                          <Link
                            href={`/super-admin/billing/plans/${p.id}/edit`}
                            className="text-primary text-xs hover:underline"
                            aria-label="Edit"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Tooltip>
                        {p.status === 'DRAFT' && (
                          <Tooltip content="Publish">
                            <button
                              type="button"
                              onClick={() => void publish(p.id)}
                              className="text-xs text-green-700 hover:underline"
                              aria-label="Publish"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </button>
                          </Tooltip>
                        )}
                        {p.status !== 'ARCHIVED' && (
                          <Tooltip content="Archive">
                            <button
                              type="button"
                              onClick={() => void archive(p.id)}
                              className="text-xs text-red-700 hover:underline"
                              aria-label="Archive"
                            >
                              <Archive className="h-4 w-4" />
                            </button>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 && (
              <p className="py-8 text-center text-sm text-[var(--text-muted)]">
                No plans yet. Run <code>npm run db:seed:plans</code> or click Create plan.
              </p>
            )}
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
