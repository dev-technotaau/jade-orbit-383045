'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import DatePicker from '@/components/ui/DatePicker';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import {
  superAdminBillingService,
  type CouponType,
  type CouponScope,
} from '@/services/super-admin-billing.service';
import type { AdminPlan } from '@/types/billing';

// Admins reach this page when granted 'billing.coupons.create'. The role gate must admit
// ADMIN or DashboardLayout redirects them to '/' before the permission
// gate ever runs.
const ROLE = ['ADMIN', 'SUPER_ADMIN'];

const ROLE_OPTIONS = [
  { value: 'CANDIDATE', label: 'Candidate' },
  { value: 'EMPLOYER', label: 'Employer' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'SUPER_ADMIN', label: 'Super-admin' },
] as const;

export default function NewCouponPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [form, setForm] = useState({
    code: '',
    name: '',
    type: 'PERCENT' as CouponType,
    valuePercent: 10,
    valuePaise: 0,
    maxDiscountPaise: 0,
    trialExtendDays: 0,
    minOrderAmountPaise: 0,
    maxRedemptions: 100,
    maxRedemptionsPerUser: 1,
    scope: 'GLOBAL' as CouponScope,
    startsAt: '',
    endsAt: '',
    descriptionHtml: '',
    internalNotes: '',
    autoApply: false,
    stackable: false,
    comboAllowed: false,
    // Targeting (per payment.md "discount coupon role-wise access control")
    allowedRoles: [] as string[],
    allowedPlanIds: [] as string[],
    excludedPlanIds: [] as string[],
    /** Newline-separated UUIDs in the textarea; submitted as array. */
    allowedUserIdsText: '',
  });

  // Load plan catalog so the targeting selects can render real names + codes.
  useEffect(() => {
    let active = true;
    superAdminBillingService
      .listPlansAdmin({ includeArchived: true })
      .then((res) => {
        if (active) setPlans(res);
      })
      .catch(() => {
        /* targeting selects degrade to disabled if fetch fails */
      });
    return () => {
      active = false;
    };
  }, []);

  function toggleRole(role: string) {
    setForm((f) => ({
      ...f,
      allowedRoles: f.allowedRoles.includes(role)
        ? f.allowedRoles.filter((r) => r !== role)
        : [...f.allowedRoles, role],
    }));
  }

  function togglePlanIn(field: 'allowedPlanIds' | 'excludedPlanIds', planId: string) {
    setForm((f) => ({
      ...f,
      [field]: f[field].includes(planId)
        ? f[field].filter((p) => p !== planId)
        : [...f[field], planId],
    }));
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const allowedUserIds = form.allowedUserIdsText
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      await superAdminBillingService.createCouponAdmin({
        code: form.code.toUpperCase(),
        name: form.name,
        type: form.type,
        scope: form.scope,
        valuePercent: form.type === 'PERCENT' ? form.valuePercent : null,
        valuePaise: form.type === 'FLAT' ? form.valuePaise : null,
        maxDiscountPaise: form.maxDiscountPaise || null,
        trialExtendDays: form.type === 'TRIAL_EXTEND' ? form.trialExtendDays : null,
        minOrderAmountPaise: form.minOrderAmountPaise,
        maxRedemptions: form.maxRedemptions || null,
        maxRedemptionsPerUser: form.maxRedemptionsPerUser,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        descriptionHtml: form.descriptionHtml || null,
        internalNotes: form.internalNotes || null,
        autoApply: form.autoApply,
        stackable: form.stackable,
        comboAllowed: form.comboAllowed,
        allowedRoles: form.allowedRoles,
        allowedPlanIds: form.allowedPlanIds,
        excludedPlanIds: form.excludedPlanIds,
        allowedUserIds,
      });
      router.replace('/super-admin/billing/coupons');
    } catch (err) {
      setError((err as Error).message ?? 'Coupon creation failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardLayout requiredRole={ROLE} requiredPermission="billing.coupons.create">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <BillingNav active="coupons" />
        <Link
          href="/super-admin/billing/coupons"
          className="text-primary mt-6 inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Back to coupons
        </Link>
        <h1 className="mt-4 mb-6 text-3xl font-bold text-[var(--text)]">Create coupon</h1>

        <Card padding="lg">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Code (3-40 chars, A-Z 0-9 _ -)" required>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="WELCOME10"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Name" required>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Welcome 10% off"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Type">
              <Select
                value={form.type}
                onChange={(val) => setForm({ ...form, type: val as CouponType })}
                options={[
                  { value: 'PERCENT', label: 'Percent off' },
                  { value: 'FLAT', label: 'Flat off' },
                  { value: 'TRIAL_EXTEND', label: 'Trial extend' },
                  { value: 'FREE_PLAN', label: 'Free plan' },
                  { value: 'FIRST_MONTH_FREE', label: 'First month free' },
                ]}
                clearable={false}
                className="w-full"
              />
            </Field>
            <Field label="Scope">
              <Select
                value={form.scope}
                onChange={(val) => setForm({ ...form, scope: val as CouponScope })}
                options={[
                  { value: 'GLOBAL', label: 'Global' },
                  { value: 'ROLE_TARGETED', label: 'Role-targeted' },
                  { value: 'USER_TARGETED', label: 'User-targeted' },
                  { value: 'PLAN_TARGETED', label: 'Plan-targeted' },
                ]}
                clearable={false}
                className="w-full"
              />
            </Field>
            {form.type === 'PERCENT' && (
              <>
                <Field label="Percent value">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={form.valuePercent}
                    onChange={(e) =>
                      setForm({ ...form, valuePercent: parseInt(e.target.value, 10) })
                    }
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  />
                </Field>
                <Field label="Max discount (paise)">
                  <input
                    type="number"
                    value={form.maxDiscountPaise}
                    onChange={(e) =>
                      setForm({ ...form, maxDiscountPaise: parseInt(e.target.value, 10) || 0 })
                    }
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  />
                </Field>
              </>
            )}
            {form.type === 'FLAT' && (
              <Field label="Flat value (paise)">
                <input
                  type="number"
                  value={form.valuePaise}
                  onChange={(e) =>
                    setForm({ ...form, valuePaise: parseInt(e.target.value, 10) || 0 })
                  }
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </Field>
            )}
            {form.type === 'TRIAL_EXTEND' && (
              <Field label="Trial extend days">
                <input
                  type="number"
                  value={form.trialExtendDays}
                  onChange={(e) =>
                    setForm({ ...form, trialExtendDays: parseInt(e.target.value, 10) || 0 })
                  }
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </Field>
            )}
            <Field label="Min order amount (paise)">
              <input
                type="number"
                value={form.minOrderAmountPaise}
                onChange={(e) =>
                  setForm({ ...form, minOrderAmountPaise: parseInt(e.target.value, 10) || 0 })
                }
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Max total redemptions">
              <input
                type="number"
                value={form.maxRedemptions}
                onChange={(e) =>
                  setForm({ ...form, maxRedemptions: parseInt(e.target.value, 10) || 0 })
                }
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Max per user">
              <input
                type="number"
                value={form.maxRedemptionsPerUser}
                onChange={(e) =>
                  setForm({
                    ...form,
                    maxRedemptionsPerUser: parseInt(e.target.value, 10) || 1,
                  })
                }
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Starts at">
              <DatePicker
                mode="datetime"
                value={form.startsAt}
                onChange={(v) => setForm({ ...form, startsAt: v })}
              />
            </Field>
            <Field label="Ends at">
              <DatePicker
                mode="datetime"
                value={form.endsAt}
                onChange={(v) => setForm({ ...form, endsAt: v })}
              />
            </Field>
            <div className="md:col-span-2">
              <Field label="Description (HTML)">
                <textarea
                  value={form.descriptionHtml}
                  onChange={(e) => setForm({ ...form, descriptionHtml: e.target.value })}
                  rows={2}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </Field>
            </div>
            <Field label="Auto-apply">
              <input
                type="checkbox"
                checked={form.autoApply}
                onChange={(e) => setForm({ ...form, autoApply: e.target.checked })}
              />
            </Field>
            <Field label="Stackable">
              <input
                type="checkbox"
                checked={form.stackable}
                onChange={(e) => setForm({ ...form, stackable: e.target.checked })}
              />
            </Field>
            <Field label="Combo allowed">
              <input
                type="checkbox"
                checked={form.comboAllowed}
                onChange={(e) => setForm({ ...form, comboAllowed: e.target.checked })}
              />
            </Field>
          </div>

          {/* ---- Targeting (role / plan / user) ---- */}
          <div className="mt-8 border-t border-[var(--border)] pt-6">
            <h2 className="mb-1 text-base font-semibold text-[var(--text)]">Targeting</h2>
            <p className="mb-4 text-xs text-[var(--text-muted)]">
              Restrict who can redeem this coupon. Leave a section empty to allow everyone for that
              dimension. The validator AND-combines all four — a user must pass every non-empty
              filter to redeem.
            </p>

            <Field label="Allowed roles (empty = all roles)">
              <div className="flex flex-wrap gap-2">
                {ROLE_OPTIONS.map((opt) => {
                  const checked = form.allowedRoles.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleRole(opt.value)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        checked
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-[var(--border)] bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Allowed plans (empty = all plans)">
              <div
                data-lenis-prevent
                className="max-h-44 overflow-y-auto rounded-lg border border-[var(--border)] bg-white p-2"
              >
                {plans.length === 0 ? (
                  <p className="px-2 py-1 text-xs text-[var(--text-muted)]">Loading plans…</p>
                ) : (
                  plans.map((p) => (
                    <label
                      key={p.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-[var(--bg-secondary)]"
                    >
                      <input
                        type="checkbox"
                        checked={form.allowedPlanIds.includes(p.id)}
                        onChange={() => togglePlanIn('allowedPlanIds', p.id)}
                      />
                      <span className="font-mono text-xs text-[var(--text-muted)]">{p.code}</span>
                      <span>{p.name}</span>
                    </label>
                  ))
                )}
              </div>
            </Field>

            <Field label="Excluded plans (cannot redeem on these)">
              <div
                data-lenis-prevent
                className="max-h-44 overflow-y-auto rounded-lg border border-[var(--border)] bg-white p-2"
              >
                {plans.length === 0 ? (
                  <p className="px-2 py-1 text-xs text-[var(--text-muted)]">Loading plans…</p>
                ) : (
                  plans.map((p) => (
                    <label
                      key={p.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-[var(--bg-secondary)]"
                    >
                      <input
                        type="checkbox"
                        checked={form.excludedPlanIds.includes(p.id)}
                        onChange={() => togglePlanIn('excludedPlanIds', p.id)}
                      />
                      <span className="font-mono text-xs text-[var(--text-muted)]">{p.code}</span>
                      <span>{p.name}</span>
                    </label>
                  ))
                )}
              </div>
            </Field>

            <Field label="Allowed user IDs (one per line — UUIDs)">
              <textarea
                rows={3}
                value={form.allowedUserIdsText}
                onChange={(e) => setForm({ ...form, allowedUserIdsText: e.target.value })}
                placeholder="Leave empty to allow all users"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-xs"
              />
            </Field>
          </div>

          <div className="mt-6">
            <Field label="Internal notes (super-admin only)">
              <textarea
                rows={2}
                value={form.internalNotes}
                onChange={(e) => setForm({ ...form, internalNotes: e.target.value })}
                placeholder="Why this coupon was created, link to ticket, etc."
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
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
              Create coupon
            </Button>
            <Link href="/super-admin/billing/coupons">
              <Button variant="outline">Cancel</Button>
            </Link>
          </div>
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
