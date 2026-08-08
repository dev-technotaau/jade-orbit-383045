'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Send, X, Sparkles } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import DatePicker from '@/components/ui/DatePicker';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import {
  superAdminBillingService,
  type AdminQuoteRow,
} from '@/services/super-admin-billing.service';
import { promptDialog } from '@/components/ui/dialog-service';
import { showToast } from '@/components/ui/Toast';
import { formatPaise } from '@/types/billing';

// Admins reach this page when granted 'billing.quotes.view'. The role gate must admit
// ADMIN or DashboardLayout redirects them to '/' before the permission
// gate ever runs.
const ROLE = ['ADMIN', 'SUPER_ADMIN'];

export default function QuoteDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? '');
  const [quote, setQuote] = useState<AdminQuoteRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOffer, setShowOffer] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Offer form state
  const [offer, setOffer] = useState({
    basePriceRupees: '',
    validityDays: 90,
    cvUnlocks: 1000,
    seats: 5,
    expiresAt: '',
  });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await superAdminBillingService.getQuoteAdmin(id);
      setQuote(res);
    } catch (err) {
      setError((err as Error).message ?? 'Failed to load quote');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (!id) return;
    void load();
  }, [id]);

  async function markContacted() {
    try {
      await superAdminBillingService.markQuoteContacted(id, 'Contacted via super-admin');
      await load();
    } catch (err) {
      showToast.error((err as Error).message ?? 'Action failed');
    }
  }

  async function reject() {
    const reason = await promptDialog({
      title: 'Reject quote',
      label: 'Rejection reason (visible to employer):',
      multiline: true,
    });
    if (!reason) return;
    try {
      await superAdminBillingService.rejectQuote(id, reason);
      await load();
    } catch (err) {
      showToast.error((err as Error).message ?? 'Action failed');
    }
  }

  async function createOffer() {
    setSubmitting(true);
    try {
      await superAdminBillingService.createOffer(id, {
        basePricePaise: Math.round(parseFloat(offer.basePriceRupees) * 100),
        validityDays: offer.validityDays,
        cvUnlocks: offer.cvUnlocks,
        seats: offer.seats,
        expiresAt: offer.expiresAt ? new Date(offer.expiresAt).toISOString() : undefined,
      });
      setShowOffer(false);
      await load();
    } catch (err) {
      showToast.error((err as Error).message ?? 'Offer creation failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout requiredRole={ROLE} requiredPermission="billing.quotes.view">
        <div className="flex min-h-[40vh] items-center justify-center">
          <Spinner size="lg" />
        </div>
      </DashboardLayout>
    );
  }

  if (!quote) {
    return (
      <DashboardLayout requiredRole={ROLE} requiredPermission="billing.quotes.view">
        <div className="px-6 py-8">
          <Card padding="lg">
            <p className="text-[var(--text-muted)]">{error ?? 'Quote not found.'}</p>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout requiredRole={ROLE} requiredPermission="billing.quotes.view">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <BillingNav active="quotes" />
        <Link
          href="/super-admin/billing/quotes"
          className="text-primary mt-6 inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Back to quotes
        </Link>
        <h1 className="mt-4 mb-1 text-3xl font-bold text-[var(--text)]">{quote.companyName}</h1>
        <p className="mb-6 text-sm text-[var(--text-muted)]">
          Submitted {new Date(quote.createdAt).toLocaleString('en-IN')} · Status:{' '}
          {quote.status.toLowerCase()}
        </p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_280px]">
          <div className="space-y-4">
            <Card padding="lg">
              <h2 className="mb-3 text-lg font-semibold text-[var(--text)]">Contact</h2>
              <div className="space-y-1 text-sm">
                <Row k="Person" v={quote.contactPerson} />
                <Row k="Email" v={quote.email} />
                <Row k="Phone" v={quote.phone} />
                {quote.user?.email && <Row k="Hire Adda account" v={quote.user.email} />}
              </div>
            </Card>

            <Card padding="lg">
              <h2 className="mb-3 text-lg font-semibold text-[var(--text)]">Requirement</h2>
              <div className="space-y-1 text-sm">
                {quote.requiredCvCount && <Row k="CV access" v={`${quote.requiredCvCount} CVs`} />}
                {quote.validityDays && <Row k="Validity" v={`${quote.validityDays} days`} />}
                {quote.expectedSeats && <Row k="Seats" v={String(quote.expectedSeats)} />}
                {quote.budgetRange && <Row k="Budget" v={quote.budgetRange} />}
              </div>
              {quote.hiringNeed && (
                <div className="mt-4 border-t border-[var(--border)] pt-3 text-sm">
                  <p className="text-[var(--text-muted)]">Hiring need:</p>
                  <p className="mt-1 text-[var(--text)]">{quote.hiringNeed}</p>
                </div>
              )}
              {quote.additionalNotes && (
                <div className="mt-3 text-sm">
                  <p className="text-[var(--text-muted)]">Notes:</p>
                  <p className="mt-1 text-[var(--text)]">{quote.additionalNotes}</p>
                </div>
              )}
            </Card>

            {quote.offers && quote.offers.length > 0 && (
              <Card padding="lg">
                <h2 className="mb-3 text-lg font-semibold text-[var(--text)]">Offers sent</h2>
                <ul className="space-y-2 text-sm">
                  {quote.offers.map((o) => (
                    <li
                      key={o.id}
                      className="flex justify-between rounded-lg border border-[var(--border)] p-3"
                    >
                      <div>
                        <p className="font-semibold">
                          {formatPaise(o.basePricePaise)} · {o.cvUnlocks} CVs · {o.validityDays}{' '}
                          days · {o.seats} {o.seats === 1 ? 'seat' : 'seats'}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          Sent {new Date(o.createdAt).toLocaleString('en-IN')}
                          {o.expiresAt &&
                            ` · expires ${new Date(o.expiresAt).toLocaleDateString('en-IN')}`}
                        </p>
                      </div>
                      <span className="text-xs text-[var(--text-muted)]">
                        {o.status.toLowerCase()}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {showOffer && (
              <Card padding="lg">
                <h2 className="mb-3 text-lg font-semibold text-[var(--text)]">
                  Create custom plan offer
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Price (₹, tax-inclusive)">
                    <input
                      type="number"
                      step="0.01"
                      value={offer.basePriceRupees}
                      onChange={(e) => setOffer({ ...offer, basePriceRupees: e.target.value })}
                      placeholder="9999"
                      className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="Validity (days)">
                    <input
                      type="number"
                      value={offer.validityDays}
                      onChange={(e) =>
                        setOffer({ ...offer, validityDays: parseInt(e.target.value, 10) })
                      }
                      className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="CV unlocks">
                    <input
                      type="number"
                      value={offer.cvUnlocks}
                      onChange={(e) =>
                        setOffer({ ...offer, cvUnlocks: parseInt(e.target.value, 10) })
                      }
                      className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="Seats">
                    <input
                      type="number"
                      value={offer.seats}
                      onChange={(e) => setOffer({ ...offer, seats: parseInt(e.target.value, 10) })}
                      className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                    />
                  </Field>
                  <div className="col-span-2">
                    <Field label="Offer expires at (default 7 days)">
                      <DatePicker
                        mode="datetime"
                        value={offer.expiresAt}
                        onChange={(v) => setOffer({ ...offer, expiresAt: v })}
                      />
                    </Field>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="primary"
                    onClick={() => void createOffer()}
                    isLoading={submitting}
                    disabled={!offer.basePriceRupees}
                  >
                    <Send className="mr-2 h-4 w-4" /> Send offer
                  </Button>
                  <Button variant="outline" onClick={() => setShowOffer(false)}>
                    Cancel
                  </Button>
                </div>
              </Card>
            )}
          </div>

          <Card padding="lg" className="self-start">
            <h2 className="mb-3 text-base font-semibold text-[var(--text)]">Actions</h2>
            <div className="space-y-2">
              <Button
                variant="primary"
                className="w-full"
                onClick={() => setShowOffer(true)}
                disabled={showOffer || quote.status === 'REJECTED'}
              >
                <Sparkles className="mr-2 h-4 w-4" /> Send custom offer
              </Button>
              {quote.status === 'NEW' || quote.status === 'IN_REVIEW' ? (
                <Button variant="outline" className="w-full" onClick={() => void markContacted()}>
                  Mark contacted
                </Button>
              ) : null}
              {quote.status !== 'REJECTED' && quote.status !== 'ACCEPTED' && (
                <Button variant="outline" className="w-full" onClick={() => void reject()}>
                  <X className="mr-2 h-4 w-4" /> Reject
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-[var(--text-muted)]">{k}</span>
      <span className="font-medium text-[var(--text)]">{v}</span>
    </div>
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
