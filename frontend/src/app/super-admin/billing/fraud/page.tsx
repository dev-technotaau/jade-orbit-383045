'use client';

import { useEffect, useState } from 'react';
import { Shield, AlertTriangle, CheckCircle2, Settings } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import Select from '@/components/ui/Select';
import Pagination from '@/components/ui/Pagination';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import {
  superAdminBillingService,
  type AdminFraudFlag,
  type AdminFraudRule,
  type FraudSeverity,
  type FraudAction,
} from '@/services/super-admin-billing.service';
import { showToast } from '@/components/ui/Toast';
import { formatPaise } from '@/types/billing';

// Admins reach this page when granted 'billing.fraud.view'. The role gate must admit
// ADMIN or DashboardLayout redirects them to '/' before the permission
// gate ever runs.
const ROLE = ['ADMIN', 'SUPER_ADMIN'];

const SEVERITY_TONE: Record<FraudSeverity, string> = {
  LOW: 'bg-blue-100 text-blue-900',
  MEDIUM: 'bg-yellow-100 text-yellow-900',
  HIGH: 'bg-orange-100 text-orange-900',
  CRITICAL: 'bg-red-100 text-red-900',
};

const ACTIONS: FraudAction[] = ['NONE', 'REVIEW', 'BLOCK', 'REFUND_AND_BLOCK'];

export default function SuperAdminFraud() {
  const [tab, setTab] = useState<'flags' | 'rules'>('flags');

  return (
    <DashboardLayout requiredRole={ROLE} requiredPermission="billing.fraud.view">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <BillingNav active="fraud" />
        <div className="mt-6 mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text)]">Fraud detection</h1>
            <p className="text-sm text-[var(--text-muted)]">Review flagged events + tune rules</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={tab === 'flags' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setTab('flags')}
            >
              <Shield className="mr-2 h-4 w-4" /> Flags
            </Button>
            <Button
              variant={tab === 'rules' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setTab('rules')}
            >
              <Settings className="mr-2 h-4 w-4" /> Rules
            </Button>
          </div>
        </div>

        {tab === 'flags' ? <FlagsPanel /> : <RulesPanel />}
      </div>
    </DashboardLayout>
  );
}

function FlagsPanel() {
  const [items, setItems] = useState<AdminFraudFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewedFilter, setReviewedFilter] = useState<'all' | 'unreviewed'>('unreviewed');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await superAdminBillingService.listFraudFlags({
        reviewed: reviewedFilter === 'unreviewed' ? false : undefined,
        limit,
        page,
      });
      setItems(res.items);
      setTotal(res.total ?? 0);
    } catch (err) {
      setError((err as Error).message ?? 'Failed to load flags');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewedFilter, page, limit]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  async function review(flag: AdminFraudFlag, action?: FraudAction) {
    try {
      await superAdminBillingService.reviewFraudFlag(flag.id, {
        newAction: action,
        notes: 'Reviewed via super-admin panel',
      });
      await load();
    } catch (err) {
      showToast.error((err as Error).message ?? 'Review failed');
    }
  }

  return (
    <>
      <Card padding="md" className="mb-4">
        <Select
          value={reviewedFilter}
          onChange={(val) => {
            setReviewedFilter(val as 'all' | 'unreviewed');
            setPage(1);
          }}
          options={[
            { value: 'unreviewed', label: 'Unreviewed only' },
            { value: 'all', label: 'All flags' },
          ]}
          size="sm"
          clearable={false}
          className="w-48"
        />
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
          {items.map((f) => (
            <Card key={f.id} padding="md">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 flex-none items-center justify-center rounded-lg ${SEVERITY_TONE[f.severity]}`}
                  >
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--text)]">
                      {f.signal.replace(/_/g, ' ').toLowerCase()}
                      <span
                        className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_TONE[f.severity]}`}
                      >
                        {f.severity.toLowerCase()}
                      </span>
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {f.user?.email ?? f.userId ?? 'unknown user'}
                      {f.payment && (
                        <>
                          {' · '}
                          <span className="font-mono">{f.payment.razorpayPaymentId}</span>
                          {' · '}
                          {formatPaise(f.payment.amountPaise)}
                        </>
                      )}
                      {' · '}
                      {new Date(f.createdAt).toLocaleString('en-IN')}
                    </p>
                    {f.notes && <p className="mt-1 text-sm text-[var(--text)]">{f.notes}</p>}
                    {f.reviewedAt && (
                      <p className="mt-1 text-xs text-green-700">
                        <CheckCircle2 className="mr-1 inline h-3 w-3" />
                        Reviewed {new Date(f.reviewedAt).toLocaleString('en-IN')}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      f.action === 'BLOCK' || f.action === 'REFUND_AND_BLOCK'
                        ? 'bg-red-100 text-red-900'
                        : f.action === 'REVIEW'
                          ? 'bg-yellow-100 text-yellow-900'
                          : 'bg-[var(--bg-secondary)] text-[var(--text-muted)]'
                    }`}
                  >
                    {f.action.replace(/_/g, ' ').toLowerCase()}
                  </span>
                  {!f.reviewedAt && (
                    <div className="mt-1 flex gap-1">
                      <button
                        onClick={() => void review(f, 'NONE')}
                        className="text-xs text-green-700 hover:underline"
                        type="button"
                      >
                        Clear
                      </button>
                      <button
                        onClick={() => void review(f, 'BLOCK')}
                        className="text-xs text-red-700 hover:underline"
                        type="button"
                      >
                        Block
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
          {items.length === 0 && (
            <Card padding="lg" className="text-center text-sm text-[var(--text-muted)]">
              No fraud flags match.
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
            />
          )}
        </div>
      )}
    </>
  );
}

function RulesPanel() {
  const [rules, setRules] = useState<AdminFraudRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await superAdminBillingService.listFraudRules();
      setRules(res);
    } catch (err) {
      setError((err as Error).message ?? 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function patch(rule: AdminFraudRule, changes: Partial<AdminFraudRule>) {
    try {
      await superAdminBillingService.updateFraudRule(rule.id, changes);
      await load();
    } catch (err) {
      showToast.error((err as Error).message ?? 'Update failed');
    }
  }

  if (loading) {
    return (
      <Card padding="lg" className="flex items-center justify-center">
        <Spinner />
      </Card>
    );
  }
  if (error) {
    return (
      <Card padding="lg">
        <p className="text-sm text-[var(--error)]">{error}</p>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {rules.map((r) => (
        <Card key={r.id} padding="md">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-semibold text-[var(--text)]">{r.name}</p>
              <p className="text-xs text-[var(--text-muted)]">
                Signal: {r.signal.replace(/_/g, ' ').toLowerCase()} · {r.severity.toLowerCase()} ·
                action {r.action.toLowerCase()}
              </p>
              {r.notes && <p className="mt-1 text-sm text-[var(--text)]">{r.notes}</p>}
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={r.enabled}
                  onChange={(e) => void patch(r, { enabled: e.target.checked })}
                />
                {r.enabled ? 'enabled' : 'disabled'}
              </label>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div>
              <label className="text-xs text-[var(--text-muted)]">Threshold</label>
              <input
                type="number"
                defaultValue={r.threshold}
                onBlur={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!Number.isNaN(v) && v !== r.threshold) void patch(r, { threshold: v });
                }}
                className="mt-1 w-full rounded border border-[var(--border)] px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)]">Window (sec)</label>
              <input
                type="number"
                defaultValue={r.windowSeconds}
                onBlur={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!Number.isNaN(v) && v !== r.windowSeconds)
                    void patch(r, { windowSeconds: v });
                }}
                className="mt-1 w-full rounded border border-[var(--border)] px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)]">Action</label>
              <Select
                value={r.action}
                onChange={(val) => void patch(r, { action: val as FraudAction })}
                options={ACTIONS.map((a) => ({ value: a, label: a.toLowerCase() }))}
                size="sm"
                clearable={false}
                className="mt-1 w-full"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)]">Severity</label>
              <Select
                value={r.severity}
                onChange={(val) => void patch(r, { severity: val as FraudSeverity })}
                options={[
                  { value: 'LOW', label: 'low' },
                  { value: 'MEDIUM', label: 'medium' },
                  { value: 'HIGH', label: 'high' },
                  { value: 'CRITICAL', label: 'critical' },
                ]}
                size="sm"
                clearable={false}
                className="mt-1 w-full"
              />
            </div>
          </div>
        </Card>
      ))}
      {rules.length === 0 && (
        <Card padding="lg" className="text-center text-sm text-[var(--text-muted)]">
          No rules yet — run <code>npm run db:seed:plans</code> to seed defaults.
        </Card>
      )}
    </div>
  );
}
