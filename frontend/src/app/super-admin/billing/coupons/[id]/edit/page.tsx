'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Spinner from '@/components/ui/Spinner';
import DatePicker from '@/components/ui/DatePicker';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import LockBanner, { StaleWriteNotice } from '@/components/admin/LockBanner';
import { useResourceLock } from '@/hooks/use-resource-lock';
import {
  superAdminBillingService,
  type AdminCoupon,
  type CouponStatus,
  type CouponScope,
} from '@/services/super-admin-billing.service';

export default function EditCouponPage() {
  const params = useParams();
  const id = String(params?.id ?? '');
  const router = useRouter();
  const [coupon, setCoupon] = useState<AdminCoupon | null>(null);
  const [staleConflict, setStaleConflict] = useState(false);

  /**
   * A coupon is a live money lever — two admins narrowing the same code at
   * once is a real scenario. `expectedUpdatedAt` already blocked the silent
   * overwrite; the lock surfaces the collision before either wastes the edit,
   * and the notice turns the resulting 409 into a real choice.
   */
  const lock = useResourceLock('Coupon', id);
  const editHeld = useRef(false);

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [plans, setPlans] = useState<import('@/types/billing').AdminPlan[]>([]);
  const [form, setForm] = useState({
    name: '',
    valuePercent: 0,
    valuePaise: 0,
    maxDiscountPaise: 0,
    trialExtendDays: 0,
    minOrderAmountPaise: 0,
    maxRedemptions: 0,
    maxRedemptionsPerUser: 1,
    scope: 'GLOBAL' as CouponScope,
    status: 'ACTIVE' as CouponStatus,
    startsAt: '',
    endsAt: '',
    autoApply: false,
    stackable: false,
    comboAllowed: false,
    descriptionHtml: '',
    internalNotes: '',
    // Targeting
    allowedRoles: [] as string[],
    allowedPlanIds: [] as string[],
    excludedPlanIds: [] as string[],
    allowedUserIdsText: '',
  });

  // Load plan catalog for the targeting selects (idempotent — fires once)
  useEffect(() => {
    let active = true;
    superAdminBillingService
      .listPlansAdmin({ includeArchived: true })
      .then((res) => {
        if (active) setPlans(res);
      })
      .catch(() => {
        /* selects degrade gracefully */
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    superAdminBillingService
      .getCouponAdmin(id)
      .then((c) => {
        if (!active) return;
        setCoupon(c);
        setForm({
          name: c.name,
          valuePercent: c.valuePercent ?? 0,
          valuePaise: c.valuePaise ?? 0,
          maxDiscountPaise: c.maxDiscountPaise ?? 0,
          trialExtendDays: c.trialExtendDays ?? 0,
          minOrderAmountPaise: c.minOrderAmountPaise,
          maxRedemptions: c.maxRedemptions ?? 0,
          maxRedemptionsPerUser: c.maxRedemptionsPerUser,
          scope: c.scope,
          status: c.status,
          startsAt: c.startsAt ? c.startsAt.slice(0, 16) : '',
          endsAt: c.endsAt ? c.endsAt.slice(0, 16) : '',
          autoApply: c.autoApply,
          stackable: c.stackable,
          comboAllowed: c.comboAllowed,
          descriptionHtml: c.descriptionHtml ?? '',
          internalNotes: c.internalNotes ?? '',
          allowedRoles: c.allowedRoles,
          allowedPlanIds: c.allowedPlanIds,
          excludedPlanIds: c.excludedPlanIds,
          allowedUserIdsText: c.allowedUserIds.join('\n'),
        });
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  const submit = async (forceOverwrite = false) => {
    if (!coupon) return;
    setSubmitting(true);
    setError(null);
    setStaleConflict(false);
    try {
      const allowedUserIds = form.allowedUserIdsText
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      await superAdminBillingService.updateCouponAdmin(id, {
        // Whole-form replace — see the plan editor for why this matters.
        expectedUpdatedAt: forceOverwrite ? undefined : coupon.updatedAt,
        name: form.name,
        valuePercent: coupon.type === 'PERCENT' ? form.valuePercent : null,
        valuePaise: coupon.type === 'FLAT' ? form.valuePaise : null,
        maxDiscountPaise: form.maxDiscountPaise || null,
        trialExtendDays: coupon.type === 'TRIAL_EXTEND' ? form.trialExtendDays : null,
        minOrderAmountPaise: form.minOrderAmountPaise,
        maxRedemptions: form.maxRedemptions || null,
        maxRedemptionsPerUser: form.maxRedemptionsPerUser,
        scope: form.scope,
        status: form.status,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        autoApply: form.autoApply,
        stackable: form.stackable,
        comboAllowed: form.comboAllowed,
        descriptionHtml: form.descriptionHtml || null,
        internalNotes: form.internalNotes || null,
        allowedRoles: form.allowedRoles,
        allowedPlanIds: form.allowedPlanIds,
        excludedPlanIds: form.excludedPlanIds,
        allowedUserIds,
      });
      editHeld.current = false;
      void lock.endEdit();
      router.push(`/super-admin/billing/coupons/${id}`);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (err.code === 'STALE_WRITE') setStaleConflict(true);
      else setError(e instanceof Error ? e.message : 'Failed to save');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout
        requiredRole={['ADMIN', 'SUPER_ADMIN']}
        requiredPermission="billing.coupons.edit"
      >
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      </DashboardLayout>
    );
  }
  if (!coupon) {
    return (
      <DashboardLayout
        requiredRole={['ADMIN', 'SUPER_ADMIN']}
        requiredPermission="billing.coupons.edit"
      >
        <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
          <Card padding="lg">
            <p className="text-sm text-red-600">Coupon not found.</p>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="billing.coupons.edit"
    >
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
        <BillingNav active="coupons" />
        <LockBanner lock={lock} entityLabel="coupon" />
        {/* One focus handler claims the exclusive edit hold for the whole
            form — cheaper and less error-prone than threading claimEdit()
            through every field's onChange. */}
        <div onFocusCapture={() => claimEdit()}>
          {staleConflict && (
            <StaleWriteNotice
              entityLabel="coupon"
              onReload={() => window.location.reload()}
              onOverwrite={() => void submit(true)}
            />
          )}

          <Link
            href={`/super-admin/billing/coupons/${id}`}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text)]"
          >
            <ArrowLeft size={14} /> Coupon detail
          </Link>

          <header>
            <h1 className="text-2xl font-bold text-[var(--text)] sm:text-3xl">
              Edit <code className="font-mono">{coupon.code}</code>
            </h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Code, type, and creator are immutable. Edit values, status, dates, and rules below.
            </p>
          </header>

          <Card padding="lg">
            <div className="space-y-5">
              <Field label="Internal name">
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-blue-500 focus:outline-none"
                />
              </Field>

              {coupon.type === 'PERCENT' ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Discount %">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={form.valuePercent}
                      onChange={(e) => setForm({ ...form, valuePercent: Number(e.target.value) })}
                      className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="Max discount cap (paise, 0 = no cap)">
                    <input
                      type="number"
                      min={0}
                      value={form.maxDiscountPaise}
                      onChange={(e) =>
                        setForm({ ...form, maxDiscountPaise: Number(e.target.value) })
                      }
                      className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                    />
                  </Field>
                </div>
              ) : null}

              {coupon.type === 'FLAT' ? (
                <Field label="Flat discount (paise)">
                  <input
                    type="number"
                    min={0}
                    value={form.valuePaise}
                    onChange={(e) => setForm({ ...form, valuePaise: Number(e.target.value) })}
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                  />
                </Field>
              ) : null}

              {coupon.type === 'TRIAL_EXTEND' ? (
                <Field label="Trial extend (days)">
                  <input
                    type="number"
                    min={1}
                    value={form.trialExtendDays}
                    onChange={(e) => setForm({ ...form, trialExtendDays: Number(e.target.value) })}
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                  />
                </Field>
              ) : null}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Min order amount (paise)">
                  <input
                    type="number"
                    min={0}
                    value={form.minOrderAmountPaise}
                    onChange={(e) =>
                      setForm({ ...form, minOrderAmountPaise: Number(e.target.value) })
                    }
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                  />
                </Field>
                <Field label="Max redemptions (0 = unlimited)">
                  <input
                    type="number"
                    min={0}
                    value={form.maxRedemptions}
                    onChange={(e) => setForm({ ...form, maxRedemptions: Number(e.target.value) })}
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                  />
                </Field>
                <Field label="Max per user">
                  <input
                    type="number"
                    min={1}
                    value={form.maxRedemptionsPerUser}
                    onChange={(e) =>
                      setForm({ ...form, maxRedemptionsPerUser: Number(e.target.value) })
                    }
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                  />
                </Field>
                <Field label="Status">
                  <Select
                    value={form.status}
                    onChange={(val) => setForm({ ...form, status: val as CouponStatus })}
                    options={[
                      { value: 'ACTIVE', label: 'ACTIVE' },
                      { value: 'PAUSED', label: 'PAUSED' },
                      { value: 'EXPIRED', label: 'EXPIRED' },
                      { value: 'ARCHIVED', label: 'ARCHIVED' },
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
                      { value: 'GLOBAL', label: 'GLOBAL' },
                      { value: 'ROLE_TARGETED', label: 'ROLE_TARGETED' },
                      { value: 'USER_TARGETED', label: 'USER_TARGETED' },
                      { value: 'PLAN_TARGETED', label: 'PLAN_TARGETED' },
                      { value: 'COMBO', label: 'COMBO' },
                    ]}
                    clearable={false}
                    className="w-full"
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
              </div>

              <div className="flex flex-wrap gap-4 border-t border-[var(--border)] pt-4">
                <Toggle
                  label="Auto-apply"
                  value={form.autoApply}
                  onChange={(v) => setForm({ ...form, autoApply: v })}
                />
                <Toggle
                  label="Stackable"
                  value={form.stackable}
                  onChange={(v) => setForm({ ...form, stackable: v })}
                />
                <Toggle
                  label="Combo allowed"
                  value={form.comboAllowed}
                  onChange={(v) => setForm({ ...form, comboAllowed: v })}
                />
              </div>

              {/* ---- Targeting ---- */}
              <div className="border-t border-[var(--border)] pt-4">
                <h3 className="mb-1 text-sm font-semibold text-[var(--text)]">Targeting</h3>
                <p className="mb-3 text-xs text-[var(--text-muted)]">
                  Restrict who can redeem this coupon. Empty section = no restriction on that
                  dimension.
                </p>

                <Field label="Allowed roles">
                  <div className="flex flex-wrap gap-2">
                    {(['CANDIDATE', 'EMPLOYER', 'ADMIN', 'SUPER_ADMIN'] as const).map((role) => {
                      const checked = form.allowedRoles.includes(role);
                      return (
                        <button
                          key={role}
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              allowedRoles: checked
                                ? form.allowedRoles.filter((r) => r !== role)
                                : [...form.allowedRoles, role],
                            })
                          }
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                            checked
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-[var(--border)] bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
                          }`}
                        >
                          {role.replace('_', ' ').toLowerCase()}
                        </button>
                      );
                    })}
                  </div>
                </Field>

                <Field label="Allowed plans">
                  <div
                    data-lenis-prevent
                    className="max-h-44 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--bg)] p-2"
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
                            onChange={() =>
                              setForm({
                                ...form,
                                allowedPlanIds: form.allowedPlanIds.includes(p.id)
                                  ? form.allowedPlanIds.filter((x) => x !== p.id)
                                  : [...form.allowedPlanIds, p.id],
                              })
                            }
                          />
                          <span className="font-mono text-xs text-[var(--text-muted)]">
                            {p.code}
                          </span>
                          <span>{p.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                </Field>

                <Field label="Excluded plans">
                  <div
                    data-lenis-prevent
                    className="max-h-44 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--bg)] p-2"
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
                            onChange={() =>
                              setForm({
                                ...form,
                                excludedPlanIds: form.excludedPlanIds.includes(p.id)
                                  ? form.excludedPlanIds.filter((x) => x !== p.id)
                                  : [...form.excludedPlanIds, p.id],
                              })
                            }
                          />
                          <span className="font-mono text-xs text-[var(--text-muted)]">
                            {p.code}
                          </span>
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
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-xs"
                  />
                </Field>
              </div>

              <Field label="Public description (HTML)">
                <textarea
                  rows={3}
                  value={form.descriptionHtml}
                  onChange={(e) => setForm({ ...form, descriptionHtml: e.target.value })}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                />
              </Field>

              <Field label="Internal notes">
                <textarea
                  rows={3}
                  value={form.internalNotes}
                  onChange={(e) => setForm({ ...form, internalNotes: e.target.value })}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                />
              </Field>

              {error ? (
                <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-200">
                  {error}
                </p>
              ) : null}

              <div className="flex flex-col-reverse gap-2 border-t border-[var(--border)] pt-4 sm:flex-row sm:justify-end">
                <Button
                  variant="ghost"
                  onClick={() => router.push(`/super-admin/billing/coupons/${id}`)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={() => void submit()}
                  disabled={submitting || lock.isReadOnly}
                >
                  {submitting ? (
                    <Spinner />
                  ) : (
                    <>
                      <Save size={14} /> Save changes
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
        </div>
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

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text)]">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
