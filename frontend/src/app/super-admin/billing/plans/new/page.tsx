'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import Select from '@/components/ui/Select';
import { superAdminBillingService } from '@/services/super-admin-billing.service';
import type { Plan, AdminPlan } from '@/types/billing';

// Admins reach this page when granted 'billing.plans.create'. The role gate must admit
// ADMIN or DashboardLayout redirects them to '/' before the permission
// gate ever runs.
const ROLE = ['ADMIN', 'SUPER_ADMIN'];

const CATEGORIES = [
  'CANDIDATE_PREMIUM',
  'EMPLOYER_JOB_POST',
  'EMPLOYER_CV_DATABASE',
  'EMPLOYER_ASSISTED_HIRING',
  'VENDOR_CONNECT',
  'EMPLOYER_CV_ENTERPRISE_CUSTOM',
] as const;
const CYCLES = ['ONE_TIME', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM'] as const;

export default function NewPlanPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<AdminPlan> & { basePriceRupees?: string }>({
    code: '',
    name: '',
    category: 'EMPLOYER_JOB_POST',
    billingCycle: 'ONE_TIME',
    basePricePaise: 0,
    basePriceRupees: '',
    currency: 'INR',
    gstRatePercent: 18,
    gstInclusive: true,
    hsnCode: '998314',
    validityDays: 30,
    trialDays: 0,
    displayOrder: 100,
    highlight: false,
    isPublic: true,
    isCustom: false,
    requiresQuote: false,
    shortDescription: '',
  });

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const basePricePaise = Math.round(parseFloat(form.basePriceRupees ?? '0') * 100);
      const created = await superAdminBillingService.createPlanAdmin({
        ...form,
        basePricePaise,
      });
      router.replace(`/super-admin/billing/plans/${created.id}/edit`);
    } catch (err) {
      setError((err as Error).message ?? 'Plan creation failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardLayout requiredRole={ROLE} requiredPermission="billing.plans.create">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <BillingNav active="plans" />
        <Link
          href="/super-admin/billing/plans"
          className="text-primary mt-6 inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Back to plans
        </Link>
        <h1 className="mt-4 mb-6 text-3xl font-bold text-[var(--text)]">Create plan</h1>

        <Card padding="lg">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Code (UPPER_SNAKE)" required>
              <input
                type="text"
                value={form.code ?? ''}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="MY_PLAN"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Name" required>
              <input
                type="text"
                value={form.name ?? ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Premium"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Category">
              <Select
                value={form.category ?? ''}
                onChange={(val) => setForm({ ...form, category: val as Plan['category'] })}
                options={CATEGORIES.map((c) => ({
                  value: c,
                  label: c.replace(/_/g, ' ').toLowerCase(),
                }))}
                clearable={false}
                className="w-full"
              />
            </Field>
            <Field label="Billing cycle">
              <Select
                value={form.billingCycle ?? ''}
                onChange={(val) => setForm({ ...form, billingCycle: val as Plan['billingCycle'] })}
                options={CYCLES.map((c) => ({ value: c, label: c.toLowerCase() }))}
                clearable={false}
                className="w-full"
              />
            </Field>
            <Field label="Base price (₹, tax-inclusive)">
              <input
                type="number"
                step="0.01"
                value={form.basePriceRupees}
                onChange={(e) => setForm({ ...form, basePriceRupees: e.target.value })}
                placeholder="499"
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
            <Field label="GST %">
              <input
                type="number"
                value={form.gstRatePercent}
                onChange={(e) => setForm({ ...form, gstRatePercent: parseInt(e.target.value, 10) })}
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
            <Field label="Display order">
              <input
                type="number"
                value={form.displayOrder}
                onChange={(e) => setForm({ ...form, displayOrder: parseInt(e.target.value, 10) })}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Trial days">
              <input
                type="number"
                value={form.trialDays}
                onChange={(e) => setForm({ ...form, trialDays: parseInt(e.target.value, 10) })}
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
                checked={form.isPublic}
                onChange={(e) => setForm({ ...form, isPublic: e.target.checked })}
              />
            </Field>
            <Field label="Highlight">
              <input
                type="checkbox"
                checked={form.highlight}
                onChange={(e) => setForm({ ...form, highlight: e.target.checked })}
              />
            </Field>
            <Field label="Custom (hidden / quote)">
              <input
                type="checkbox"
                checked={form.isCustom}
                onChange={(e) => setForm({ ...form, isCustom: e.target.checked })}
              />
            </Field>
            <Field label="Requires quote">
              <input
                type="checkbox"
                checked={form.requiresQuote}
                onChange={(e) => setForm({ ...form, requiresQuote: e.target.checked })}
              />
            </Field>
          </div>

          {error && (
            <p className="mt-3 text-sm text-[var(--error)]" role="alert">
              {error}
            </p>
          )}
          <div className="mt-6 flex gap-2">
            <Button
              variant="primary"
              onClick={() => void submit()}
              isLoading={submitting}
              disabled={!form.code || !form.name}
            >
              Create plan (DRAFT)
            </Button>
            <Link href="/super-admin/billing/plans">
              <Button variant="outline">Cancel</Button>
            </Link>
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Plans are created as DRAFT — publish from the list page after adding features and
            resources. Feature/resource editing UI is planned for the [id]/edit page (Phase 11.5).
          </p>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-[var(--text-muted)]">
        {label} {required && <span className="text-[var(--error)]">*</span>}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
