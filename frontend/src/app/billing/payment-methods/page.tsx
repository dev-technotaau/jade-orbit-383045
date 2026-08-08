'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CreditCard,
  Smartphone,
  Building,
  Check,
  Trash2,
  Star,
  Plus,
  ArrowLeft,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import BillingAddressesSection from '@/components/billing/BillingAddressesSection';
import { paymentMethodService } from '@/services/payment-method.service';
import { usePricingHref } from '@/lib/pricing-href';
import { confirmDialog } from '@/components/ui/dialog-service';
import { showToast } from '@/components/ui/Toast';
import type { PaymentMethodToken } from '@/types/payment-method';

export default function PaymentMethodsPage() {
  const [items, setItems] = useState<PaymentMethodToken[]>([]);
  const [loading, setLoading] = useState(true);
  const pricingHref = usePricingHref();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await paymentMethodService.list();
      setItems(res);
    } catch (err) {
      setError((err as Error).message ?? 'Failed to load payment methods');
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
      await paymentMethodService.setDefault(id);
      await load();
    } catch (err) {
      showToast.error((err as Error).message ?? 'Failed to update default');
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (
      !(await confirmDialog({
        title: 'Remove payment method',
        message: 'Remove this payment method? Auto-renew subscriptions using it will fail.',
        confirmLabel: 'Remove',
        variant: 'danger',
      }))
    )
      return;
    setBusy(id);
    try {
      await paymentMethodService.remove(id);
      await load();
    } catch (err) {
      showToast.error((err as Error).message ?? 'Failed to remove');
    } finally {
      setBusy(null);
    }
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link
          href="/billing/orders"
          className="text-primary mb-6 inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Back to billing
        </Link>

        <div className="mb-8 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text)]">Payment methods</h1>
            <p className="text-sm text-[var(--text-muted)]">
              Saved cards, UPI handles and net-banking mandates used for auto-renew.
            </p>
          </div>
          <Link href={pricingHref}>
            <Button variant="outline">
              <Plus className="mr-2 h-4 w-4" /> Add via new purchase
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

        {!loading && !error && items.length === 0 && (
          <Card padding="lg" className="text-center">
            <CreditCard className="text-primary mx-auto h-10 w-10" />
            <h2 className="mt-3 text-lg font-semibold text-[var(--text)]">No saved methods</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Saved methods are added automatically when you set up auto-renew on a subscription.
              Subscribe to Vendor Connect to register your first eMandate or UPI AutoPay.
            </p>
            <Link href="/pricing#vendor_connect" className="mt-4 inline-block">
              <Button variant="primary">View pricing</Button>
            </Link>
          </Card>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="space-y-3">
            {items.map((m) => (
              <MethodRow
                key={m.id}
                method={m}
                busy={busy === m.id}
                onSetDefault={() => void setDefault(m.id)}
                onRemove={() => void remove(m.id)}
              />
            ))}
            <p className="text-xs text-[var(--text-muted)]">
              Methods are saved on Razorpay&apos;s PCI-compliant vault. Hire Adda only stores
              tokenized references — never your full card number.
            </p>
          </div>
        )}

        <BillingAddressesSection />
      </div>
    </DashboardLayout>
  );
}

function MethodRow({
  method,
  busy,
  onSetDefault,
  onRemove,
}: {
  method: PaymentMethodToken;
  busy: boolean;
  onSetDefault: () => void;
  onRemove: () => void;
}) {
  const Icon = method.type === 'CARD' ? CreditCard : method.type === 'VPA' ? Smartphone : Building;
  const label =
    method.type === 'CARD' && method.last4
      ? `${method.network ?? 'Card'} •• ${method.last4}`
      : method.type === 'VPA' && method.vpaHandle
        ? method.vpaHandle
        : method.type === 'NETBANKING' && method.bankCode
          ? method.bankCode
          : method.type.toLowerCase();
  const expires =
    method.expiryMonth && method.expiryYear
      ? `${String(method.expiryMonth).padStart(2, '0')}/${method.expiryYear}`
      : null;
  return (
    <Card padding="md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="bg-primary/10 text-primary flex h-12 w-12 flex-none items-center justify-center rounded-xl">
            <Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-[var(--text)]">
              {label}
              {method.isDefault && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-900">
                  <Star className="h-3 w-3 fill-current" /> Default
                </span>
              )}
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              {method.type.toLowerCase()}
              {expires && ` · expires ${expires}`}
              {' · added '}
              {new Date(method.createdAt).toLocaleDateString('en-IN')}
            </p>
          </div>
        </div>
        <div className="flex flex-none gap-2">
          {!method.isDefault && (
            <Button
              variant="outline"
              size="sm"
              onClick={onSetDefault}
              isLoading={busy}
              disabled={busy}
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
