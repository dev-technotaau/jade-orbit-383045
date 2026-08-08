'use client';

import { useEffect, useState } from 'react';
import { MapPin, Plus, Star, Trash2, Edit3, Check } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Checkbox from '@/components/ui/Checkbox';
import { GST_STATES, GST_STATE_OPTIONS } from '@/constants/gst-states';
import { confirmDialog } from '@/components/ui/dialog-service';
import { showToast } from '@/components/ui/Toast';
import {
  billingAddressService,
  type BillingAddress,
  type BillingAddressInput,
} from '@/services/billing-address.service';

const EMPTY_FORM: BillingAddressInput = {
  label: '',
  line1: '',
  line2: '',
  city: '',
  stateName: '',
  stateCode: '',
  pincode: '',
  country: 'India',
  countryCode: 'IN',
  gstNumber: '',
  legalName: '',
  isDefault: false,
};

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/**
 * Saved billing addresses on `/billing/payment-methods`. Used at checkout
 * for GST place-of-supply + legal-name capture, so we expose full CRUD
 * (add / edit / remove / set default) here.
 *
 * State picker is the canonical 2-digit GST list — first two digits of a
 * GSTIN must agree with the address state, so wiring them through a
 * single source of truth avoids dispute risk.
 */
export default function BillingAddressesSection() {
  const [items, setItems] = useState<BillingAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<BillingAddress | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await billingAddressService.list();
      setItems(res);
    } catch (err) {
      setError((err as Error).message ?? 'Failed to load addresses');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function setDefault(id: string) {
    setBusy(id);
    try {
      await billingAddressService.setDefault(id);
      await load();
    } catch (err) {
      showToast.error((err as Error).message ?? 'Failed to set default');
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (
      !(await confirmDialog({
        title: 'Remove billing address',
        message: 'Remove this billing address? Future invoices will fall back to your default.',
        confirmLabel: 'Remove',
        variant: 'danger',
      }))
    )
      return;
    setBusy(id);
    try {
      await billingAddressService.remove(id);
      await load();
    } catch (err) {
      showToast.error((err as Error).message ?? 'Failed to remove address');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-10">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[var(--text)]">Billing addresses</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Used on tax invoices for GST place-of-supply, legal name and GSTIN.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add address
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
      {!loading && !error && items.length === 0 && (
        <Card padding="lg" className="text-center">
          <MapPin className="text-primary mx-auto h-10 w-10" />
          <h3 className="mt-3 text-base font-semibold text-[var(--text)]">No saved addresses</h3>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Add an address now or capture one at checkout — it&apos;ll be saved for future invoices.
          </p>
        </Card>
      )}
      {!loading && !error && items.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((addr) => (
            <AddressCard
              key={addr.id}
              address={addr}
              busy={busy === addr.id}
              onSetDefault={() => void setDefault(addr.id)}
              onRemove={() => void remove(addr.id)}
              onEdit={() => setEditing(addr)}
            />
          ))}
        </div>
      )}

      {(showAdd || editing) && (
        <AddressFormModal
          initial={editing}
          onClose={() => {
            setShowAdd(false);
            setEditing(null);
          }}
          onSaved={async () => {
            setShowAdd(false);
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function AddressCard({
  address,
  busy,
  onSetDefault,
  onRemove,
  onEdit,
}: {
  address: BillingAddress;
  busy: boolean;
  onSetDefault: () => void;
  onRemove: () => void;
  onEdit: () => void;
}) {
  return (
    <Card padding="md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-[var(--text)]">
            {address.label || address.legalName || 'Billing address'}
            {address.isDefault && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-900">
                <Star className="h-3 w-3 fill-current" /> Default
              </span>
            )}
          </p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {address.line1}
            {address.line2 ? `, ${address.line2}` : ''}
          </p>
          <p className="text-sm text-[var(--text-secondary)]">
            {address.city}
            {address.stateName ? `, ${address.stateName}` : ''} {address.pincode}
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            {address.country}
            {address.gstNumber && ` · GSTIN ${address.gstNumber}`}
          </p>
        </div>
        <div className="flex flex-none flex-col gap-2">
          <Button variant="outline" size="sm" onClick={onEdit} aria-label="Edit">
            <Edit3 className="h-4 w-4" />
          </Button>
          {!address.isDefault && (
            <Button
              variant="outline"
              size="sm"
              onClick={onSetDefault}
              isLoading={busy}
              disabled={busy}
              aria-label="Make default"
            >
              <Check className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onRemove}
            isLoading={busy}
            disabled={busy}
            aria-label="Remove"
          >
            <Trash2 className="h-4 w-4 text-[var(--error)]" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

function AddressFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: BillingAddress | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const isEdit = Boolean(initial);
  const [form, setForm] = useState<BillingAddressInput>(() =>
    initial
      ? {
          label: initial.label ?? '',
          line1: initial.line1,
          line2: initial.line2 ?? '',
          city: initial.city,
          stateName: initial.stateName,
          stateCode: initial.stateCode,
          pincode: initial.pincode,
          country: initial.country,
          countryCode: initial.countryCode,
          gstNumber: initial.gstNumber ?? '',
          legalName: initial.legalName ?? '',
          isDefault: initial.isDefault,
        }
      : EMPTY_FORM,
  );
  const [submitting, setSubmitting] = useState(false);
  const [errs, setErrs] = useState<Partial<Record<keyof BillingAddressInput, string>>>({});

  function set<K extends keyof BillingAddressInput>(key: K, value: BillingAddressInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate(): boolean {
    const e: Partial<Record<keyof BillingAddressInput, string>> = {};
    if (!form.line1 || form.line1.trim().length < 3) e.line1 = 'Address line 1 is required';
    if (!form.city || form.city.trim().length < 2) e.city = 'City is required';
    if (!form.stateCode || !/^[0-9]{2}$/.test(form.stateCode)) e.stateCode = 'Select a state';
    if (!form.pincode || !/^[0-9]{6}$/.test(form.pincode)) e.pincode = '6-digit pincode';
    if (form.gstNumber && !GSTIN_RE.test(form.gstNumber.toUpperCase()))
      e.gstNumber = 'Invalid GSTIN format';
    if (form.gstNumber && form.gstNumber.slice(0, 2) !== form.stateCode)
      e.gstNumber = 'GSTIN first two digits must match state';
    setErrs(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload: BillingAddressInput = {
        ...form,
        label: form.label?.trim() || undefined,
        line2: form.line2?.trim() || null,
        gstNumber: form.gstNumber ? form.gstNumber.toUpperCase().trim() : null,
        legalName: form.legalName?.trim() || null,
      };
      if (isEdit && initial) {
        await billingAddressService.update(initial.id, payload);
      } else {
        await billingAddressService.create(payload);
      }
      await onSaved();
    } catch (err) {
      showToast.error((err as Error).message ?? 'Failed to save address');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEdit ? 'Edit billing address' : 'Add billing address'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Label (optional)"
            value={form.label ?? ''}
            onChange={(e) => set('label', e.target.value)}
            placeholder="HQ / Branch / Personal"
          />
          <Input
            label="Legal name (for invoice)"
            value={form.legalName ?? ''}
            onChange={(e) => set('legalName', e.target.value)}
            placeholder="Company / Individual name as on GSTIN"
          />
        </div>
        <Input
          label="Address line 1"
          required
          value={form.line1}
          onChange={(e) => set('line1', e.target.value)}
          error={errs.line1}
        />
        <Input
          label="Address line 2"
          value={form.line2 ?? ''}
          onChange={(e) => set('line2', e.target.value)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="City"
            required
            value={form.city}
            onChange={(e) => set('city', e.target.value)}
            error={errs.city}
          />
          <Select
            label="State"
            required
            options={GST_STATE_OPTIONS}
            value={form.stateCode}
            onChange={(v) => {
              set('stateCode', v);
              set('stateName', GST_STATES[v] ?? '');
            }}
            searchable
            placeholder="Select GST state"
            error={errs.stateCode}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Pincode"
            required
            value={form.pincode}
            onChange={(e) => set('pincode', e.target.value)}
            error={errs.pincode}
            inputMode="numeric"
            maxLength={6}
          />
          <Input
            label="Country"
            value={form.country ?? 'India'}
            onChange={(e) => set('country', e.target.value)}
            disabled
          />
        </div>
        <Input
          label="GSTIN (optional)"
          value={form.gstNumber ?? ''}
          onChange={(e) => set('gstNumber', e.target.value.toUpperCase())}
          error={errs.gstNumber}
          helperText="If provided, you'll be eligible for input tax credit on this invoice."
          maxLength={15}
        />
        <Checkbox
          label="Make this my default billing address"
          checked={Boolean(form.isDefault)}
          onChange={(e) => set('isDefault', e.target.checked)}
        />
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={submitting} disabled={submitting}>
            {isEdit ? 'Save changes' : 'Save address'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
