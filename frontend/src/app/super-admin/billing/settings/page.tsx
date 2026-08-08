'use client';

import { useEffect, useState } from 'react';
import { Settings, ShieldAlert, Save, Activity, Database } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import StatusBadge from '@/components/super-admin/billing/StatusBadge';
import EmptyState from '@/components/super-admin/billing/EmptyState';
import Select from '@/components/ui/Select';
import {
  superAdminBillingService,
  type AdminFraudRule,
  type FraudAction,
  type FraudSeverity,
} from '@/services/super-admin-billing.service';

const ENV_HINTS: Array<{ key: string; description: string; defaultValue: string }> = [
  {
    key: 'BILLING_REFUND_WINDOW_DAYS',
    description: 'How many days post-purchase a buyer can request a self-service refund.',
    defaultValue: '2',
  },
  {
    key: 'BILLING_AUTO_RENEW_RETRY_MAX',
    description: 'Max dunning retry attempts on a failed renewal (T+0/+1d/+3d/+7d).',
    defaultValue: '4',
  },
  {
    key: 'BILLING_GRACE_PERIOD_DAYS',
    description: 'Days of grace access after renewal failure.',
    defaultValue: '3',
  },
  {
    key: 'BILLING_EMI_MIN_AMOUNT_PAISE',
    description: 'Minimum order amount (paise) for EMI to be offered at checkout.',
    defaultValue: '300000',
  },
  {
    key: 'BILLING_ORDER_EXPIRY_MINUTES',
    description: 'Pending orders auto-expire after this many minutes.',
    defaultValue: '30',
  },
  {
    key: 'BILLING_INVOICE_PDF_RETENTION_DAYS',
    description: 'How long to keep invoice PDFs in R2 (regulatory).',
    defaultValue: '2555',
  },
  {
    key: 'BILLING_FRAUD_ENABLED',
    description: 'Master toggle — set to false to bypass all fraud rules.',
    defaultValue: 'true',
  },
  {
    key: 'BILLING_BIGQUERY_SYNC_ENABLED',
    description: 'Stream billing events to BigQuery for analytics.',
    defaultValue: 'false',
  },
  {
    key: 'HA_GST_RATE_PERCENT',
    description: 'Default GST rate. SaaS service classification SAC 998314.',
    defaultValue: '18',
  },
  {
    key: 'HA_E_INVOICE_REQUIRED',
    description: 'Generate IRN/QR via IRP — required when turnover crosses ₹5 crore.',
    defaultValue: 'false',
  },
];

export default function SuperAdminBillingSettingsPage() {
  const [rules, setRules] = useState<AdminFraudRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, Partial<AdminFraudRule>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await superAdminBillingService.listFraudRules();
      setRules(r);
      setDraft({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fraud rules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const updateDraft = (id: string, patch: Partial<AdminFraudRule>) => {
    setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  };

  const saveRule = async (id: string) => {
    const patch = draft[id];
    if (!patch) return;
    setSavingId(id);
    setError(null);
    try {
      await superAdminBillingService.updateFraudRule(id, patch);
      setActionMsg('Rule saved.');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="billing.settings.view"
    >
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <BillingNav active="settings" />

        <header>
          <h1 className="text-2xl font-bold text-[var(--text)] sm:text-3xl">
            <Settings className="mr-2 inline" size={24} /> Billing settings
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Tune fraud rules in-place. Other operational toggles are environment-controlled — review
            the env list at the bottom and update via your deploy pipeline.
          </p>
        </header>

        {actionMsg ? (
          <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-900/20 dark:text-blue-200">
            {actionMsg}
          </div>
        ) : null}

        <Card padding="lg">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">
            <ShieldAlert size={16} /> Fraud rules ({rules.length})
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Each rule fires when its threshold is crossed within the time window. Severity feeds the
            order&apos;s fraud score; action drives the auto-response.
          </p>

          {loading ? (
            <div className="mt-6 flex justify-center">
              <Spinner />
            </div>
          ) : error ? (
            <p className="mt-4 text-sm text-red-600">{error}</p>
          ) : rules.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="No fraud rules configured"
                description="Run npm run db:seed:fraud-rules to seed the defaults."
                icon={ShieldAlert}
              />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {rules.map((r) => {
                const d = draft[r.id] ?? {};
                const enabled = d.enabled ?? r.enabled;
                const threshold = d.threshold ?? r.threshold;
                const windowSeconds = d.windowSeconds ?? r.windowSeconds;
                const action = d.action ?? r.action;
                const severity = d.severity ?? r.severity;
                const dirty = Object.keys(d).length > 0;

                return (
                  <div
                    key={r.id}
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-mono text-sm font-semibold">{r.signal}</h3>
                          <StatusBadge status={severity} pretty />
                          <StatusBadge status={action} pretty />
                          {!enabled ? <StatusBadge status="DISABLED" tone="neutral" /> : null}
                        </div>
                        {r.notes ? (
                          <p className="mt-1 text-xs text-[var(--text-secondary)]">{r.notes}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        <label className="flex cursor-pointer items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(e) => updateDraft(r.id, { enabled: e.target.checked })}
                          />
                          Enabled
                        </label>
                        {dirty ? (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => saveRule(r.id)}
                            disabled={savingId === r.id}
                          >
                            {savingId === r.id ? (
                              <Spinner />
                            ) : (
                              <>
                                <Save size={12} /> Save
                              </>
                            )}
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
                      <Field label="Threshold">
                        <input
                          type="number"
                          min={0}
                          value={threshold}
                          onChange={(e) => updateDraft(r.id, { threshold: Number(e.target.value) })}
                          className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1 text-sm"
                        />
                      </Field>
                      <Field label="Window (seconds)">
                        <input
                          type="number"
                          min={0}
                          value={windowSeconds}
                          onChange={(e) =>
                            updateDraft(r.id, { windowSeconds: Number(e.target.value) })
                          }
                          className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1 text-sm"
                        />
                      </Field>
                      <Field label="Severity">
                        <Select
                          value={severity}
                          onChange={(val) => updateDraft(r.id, { severity: val as FraudSeverity })}
                          options={[
                            { value: 'LOW', label: 'LOW' },
                            { value: 'MEDIUM', label: 'MEDIUM' },
                            { value: 'HIGH', label: 'HIGH' },
                            { value: 'CRITICAL', label: 'CRITICAL' },
                          ]}
                          size="sm"
                          clearable={false}
                          className="w-full"
                        />
                      </Field>
                      <Field label="Action">
                        <Select
                          value={action}
                          onChange={(val) => updateDraft(r.id, { action: val as FraudAction })}
                          options={[
                            { value: 'NONE', label: 'NONE' },
                            { value: 'REVIEW', label: 'REVIEW' },
                            { value: 'BLOCK', label: 'BLOCK' },
                            { value: 'REFUND_AND_BLOCK', label: 'REFUND_AND_BLOCK' },
                          ]}
                          size="sm"
                          clearable={false}
                          className="w-full"
                        />
                      </Field>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card padding="lg">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">
            <Database size={16} /> Environment-controlled toggles
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            These values live in the deploy environment (kubernetes secret). Update via your
            Helm/SealedSecret pipeline — the app picks them up at next pod restart.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-secondary)] uppercase">
                  <th className="py-2 pr-3">Env var</th>
                  <th className="py-2 pr-3">Description</th>
                  <th className="py-2 pr-3 text-right">Default</th>
                </tr>
              </thead>
              <tbody>
                {ENV_HINTS.map((env) => (
                  <tr key={env.key} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs">{env.key}</td>
                    <td className="py-2 pr-3 text-xs text-[var(--text-secondary)]">
                      {env.description}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-xs">{env.defaultValue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card padding="md">
          <p className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
            <Activity className="mt-0.5 flex-shrink-0" size={14} />
            <span>
              Plan, coupon, and HSN/SAC settings are managed from their respective pages in this
              section (Plans, Coupons). e-Invoice (IRN) generation is controlled by{' '}
              <code className="font-mono">HA_E_INVOICE_REQUIRED</code> in env.
            </span>
          </p>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium tracking-wide text-[var(--text-secondary)] uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}
