'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import LockBanner, { StaleWriteNotice } from '@/components/admin/LockBanner';
import { useResourceLock } from '@/hooks/use-resource-lock';
import Select from '@/components/ui/Select';
import { superAdminBillingService } from '@/services/super-admin-billing.service';
import { formatPaise, type AdminPlan } from '@/types/billing';

// Admins reach this page when granted 'billing.plans.edit'. The role gate must admit
// ADMIN or DashboardLayout redirects them to '/' before the permission
// gate ever runs.
const ROLE = ['ADMIN', 'SUPER_ADMIN'];

export default function EditPlanPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? '');
  const [plan, setPlan] = useState<AdminPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<AdminPlan> & { basePriceRupees?: string }>({});
  const [staleConflict, setStaleConflict] = useState(false);

  /**
   * Plan pricing is exactly the kind of record two admins reach at once, and
   * this form POSTs every field — so a concurrent edit silently reverts the
   * other person's change. `expectedUpdatedAt` already made that SAFE (the
   * server 409s); the lock makes it VISIBLE, and the notice below turns the
   * 409 from a red string into a reload-or-overwrite choice.
   */
  const lock = useResourceLock('Plan', id);
  const editHeld = useRef(false);

  /** Claim the exclusive edit hold on the first real keystroke. */
  const claimEdit = () => {
    if (lock.isReadOnly) return false;
    if (!editHeld.current) {
      editHeld.current = true;
      void lock.beginEdit().then((ok) => {
        if (!ok) editHeld.current = false;
      });
    }
    return true;
  };

  useEffect(() => {
    if (!id) return;
    let active = true;
    superAdminBillingService
      .getPlanAdmin(id)
      .then((res) => {
        if (!active) return;
        setPlan(res);
        setForm({
          name: res.name,
          slug: res.slug,
          basePriceRupees: (res.basePricePaise / 100).toFixed(2),
          gstRatePercent: res.gstRatePercent,
          gstInclusive: res.gstInclusive,
          hsnCode: res.hsnCode,
          validityDays: res.validityDays,
          trialDays: res.trialDays,
          displayOrder: res.displayOrder,
          highlight: res.highlight,
          badgeText: res.badgeText,
          shortDescription: res.shortDescription,
          isPublic: res.isPublic,
          status: res.status,
        });
      })
      .catch((err) => setError(err?.message ?? 'Failed to load plan'))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  async function save(forceOverwrite = false) {
    if (!plan) return;
    setSaving(true);
    setError(null);
    setStaleConflict(false);
    try {
      const basePricePaise = Math.round(parseFloat(form.basePriceRupees ?? '0') * 100);
      await superAdminBillingService.updatePlanAdmin(plan.id, {
        ...form,
        basePricePaise,
        // Optimistic concurrency: this form posts every field, so a
        // concurrent edit would silently revert someone else's pricing
        // change. The server 409s instead.
        // Omitted on an explicit overwrite — the operator has seen the other
        // version and chosen to replace it.
        expectedUpdatedAt: forceOverwrite ? undefined : plan.updatedAt,
      });
      editHeld.current = false;
      void lock.endEdit();
      router.replace('/super-admin/billing/plans');
    } catch (err) {
      const e = err as { code?: string; message?: string };
      if (e.code === 'STALE_WRITE') {
        setStaleConflict(true);
      } else {
        setError(e.message ?? 'Save failed');
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout requiredRole={ROLE} requiredPermission="billing.plans.edit">
        <div className="flex min-h-[40vh] items-center justify-center">
          <Spinner size="lg" />
        </div>
      </DashboardLayout>
    );
  }

  if (!plan) {
    return (
      <DashboardLayout requiredRole={ROLE} requiredPermission="billing.plans.edit">
        <div className="px-6 py-8">
          <Card padding="lg">
            <p className="text-[var(--text-muted)]">{error ?? 'Plan not found.'}</p>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout requiredRole={ROLE} requiredPermission="billing.plans.edit">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <BillingNav active="plans" />
        <LockBanner lock={lock} entityLabel="plan" />
        {/* One focus handler claims the exclusive edit hold for the whole
            form — cheaper and less error-prone than threading claimEdit()
            through every field's onChange. */}
        <div onFocusCapture={() => claimEdit()}>
          <Link
            href="/super-admin/billing/plans"
            className="text-primary mt-6 inline-flex items-center gap-2 text-sm"
          >
            <ArrowLeft className="h-4 w-4" /> Back to plans
          </Link>

          <h1 className="mt-4 mb-1 text-3xl font-bold text-[var(--text)]">{plan.name}</h1>
          <p className="mb-6 text-sm text-[var(--text-muted)]">
            {plan.code} · {plan.category.replace(/_/g, ' ').toLowerCase()} · current price{' '}
            {formatPaise(plan.basePricePaise, plan.currency)}
          </p>

          <Card padding="lg">
            <h2 className="mb-3 text-lg font-semibold text-[var(--text)]">Edit attributes</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Name">
                <input
                  type="text"
                  value={form.name ?? ''}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Slug">
                <input
                  type="text"
                  value={form.slug ?? ''}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Base price (₹)">
                <input
                  type="number"
                  step="0.01"
                  value={form.basePriceRupees}
                  onChange={(e) => setForm({ ...form, basePriceRupees: e.target.value })}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Validity days">
                <input
                  type="number"
                  value={form.validityDays ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      validityDays: e.target.value ? parseInt(e.target.value, 10) : null,
                    })
                  }
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Display order">
                <input
                  type="number"
                  value={form.displayOrder ?? 100}
                  onChange={(e) => setForm({ ...form, displayOrder: parseInt(e.target.value, 10) })}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Status">
                <Select
                  value={form.status ?? plan.status}
                  onChange={(val) => setForm({ ...form, status: val as AdminPlan['status'] })}
                  options={[
                    { value: 'DRAFT', label: 'DRAFT' },
                    { value: 'ACTIVE', label: 'ACTIVE' },
                    { value: 'HIDDEN', label: 'HIDDEN' },
                    { value: 'ARCHIVED', label: 'ARCHIVED' },
                  ]}
                  clearable={false}
                  className="w-full"
                />
              </Field>
              <Field label="Badge text">
                <input
                  type="text"
                  value={form.badgeText ?? ''}
                  onChange={(e) => setForm({ ...form, badgeText: e.target.value })}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </Field>
              <Field label="HSN/SAC">
                <input
                  type="text"
                  value={form.hsnCode ?? ''}
                  onChange={(e) => setForm({ ...form, hsnCode: e.target.value })}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="Short description">
                  <textarea
                    value={form.shortDescription ?? ''}
                    onChange={(e) => setForm({ ...form, shortDescription: e.target.value })}
                    rows={2}
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  />
                </Field>
              </div>
              <Field label="Public">
                <input
                  type="checkbox"
                  checked={form.isPublic ?? plan.isPublic}
                  onChange={(e) => setForm({ ...form, isPublic: e.target.checked })}
                />
              </Field>
              <Field label="Highlight">
                <input
                  type="checkbox"
                  checked={form.highlight ?? plan.highlight}
                  onChange={(e) => setForm({ ...form, highlight: e.target.checked })}
                />
              </Field>
            </div>
            {staleConflict && (
              <div className="mt-3">
                <StaleWriteNotice
                  entityLabel="plan"
                  onReload={() => window.location.reload()}
                  onOverwrite={() => void save(true)}
                />
              </div>
            )}
            {error && (
              <p className="mt-3 text-sm text-[var(--error)]" role="alert">
                {error}
              </p>
            )}
            <div className="mt-6 flex gap-2">
              <Button
                variant="primary"
                onClick={() => void save()}
                isLoading={saving}
                disabled={lock.isReadOnly}
              >
                Save
              </Button>
              <Link href="/super-admin/billing/plans">
                <Button variant="outline">Cancel</Button>
              </Link>
            </div>
          </Card>

          <Card padding="lg" className="mt-4">
            <h2 className="mb-3 text-base font-semibold text-[var(--text)]">Features</h2>
            {plan.features.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">No features defined yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {plan.features.map((f) => (
                  <li
                    key={f.key}
                    className="flex justify-between gap-2 border-b border-[var(--border)] py-1.5 last:border-0"
                  >
                    <span>
                      <span className="font-mono text-xs text-[var(--text-muted)]">{f.key}</span>
                      <span className="ml-2 text-[var(--text)]">{f.label}</span>
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">
                      {f.kind === 'COUNTABLE'
                        ? `${f.countableLimit ?? '—'} units`
                        : f.kind.toLowerCase()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              Feature/resource editing UI lands in Phase 11.5. For now, edit via DB seed script +
              redeploy.
            </p>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-[var(--text-muted)]">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
