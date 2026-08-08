'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Sparkles, CheckCircle2, Clock, AlertCircle, Building2 } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import {
  quoteService,
  type MyQuoteRequest,
  type QuoteRequestStatus,
} from '@/services/quote.service';
import { formatPaise } from '@/types/billing';

const STATUS_TONE: Record<QuoteRequestStatus, string> = {
  NEW: 'bg-blue-100 text-blue-900',
  IN_REVIEW: 'bg-yellow-100 text-yellow-900',
  CONTACTED: 'bg-yellow-100 text-yellow-900',
  NEGOTIATING: 'bg-purple-100 text-purple-900',
  ACCEPTED: 'bg-green-100 text-green-900',
  REJECTED: 'bg-[var(--bg-secondary)] text-[var(--text-muted)]',
  CONVERTED: 'bg-green-100 text-green-900',
  WITHDRAWN: 'bg-[var(--bg-secondary)] text-[var(--text-muted)]',
};

export default function MyQuoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? '');
  const [quote, setQuote] = useState<MyQuoteRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    quoteService
      .get(id)
      .then((res) => {
        if (active) setQuote(res);
      })
      .catch((err) => {
        if (active) setError(err?.message ?? 'Failed to load quote');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  async function acceptOffer(offerId: string) {
    setAccepting(offerId);
    try {
      const result = await quoteService.acceptOffer(offerId);
      router.push(`/billing/checkout/${encodeURIComponent(result.planCode)}`);
    } catch (err) {
      setError((err as Error).message ?? 'Failed to accept offer');
      setAccepting(null);
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[40vh] items-center justify-center">
          <Spinner size="lg" />
        </div>
      </DashboardLayout>
    );
  }
  if (!quote) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-2xl px-4 py-12">
          <Card padding="lg">
            <p className="text-[var(--text-muted)]">{error ?? 'Quote not found.'}</p>
            <Link
              href="/billing/quote"
              className="text-primary mt-4 inline-flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" /> Submit a new quote
            </Link>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link
          href="/billing/quote"
          className="text-primary mb-6 inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> All quotes
        </Link>

        <Card padding="lg">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="bg-primary/10 text-primary flex h-12 w-12 flex-none items-center justify-center rounded-xl">
                <Building2 className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-[var(--text)]">{quote.companyName}</h1>
                <p className="text-sm text-[var(--text-muted)]">
                  Submitted {new Date(quote.createdAt).toLocaleString('en-IN')}
                </p>
              </div>
            </div>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_TONE[quote.status]}`}
            >
              {quote.status === 'ACCEPTED' || quote.status === 'CONVERTED' ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : quote.status === 'REJECTED' || quote.status === 'WITHDRAWN' ? (
                <AlertCircle className="h-3.5 w-3.5" />
              ) : (
                <Clock className="h-3.5 w-3.5" />
              )}
              {quote.status.replace(/_/g, ' ').toLowerCase()}
            </span>
          </div>

          <div className="mt-6 space-y-2 text-sm">
            <Row k="Contact" v={`${quote.contactPerson} (${quote.email})`} />
            <Row k="Phone" v={quote.phone} />
            {quote.requiredCvCount && (
              <Row k="CV access needed" v={String(quote.requiredCvCount)} />
            )}
            {quote.validityDays && <Row k="Validity" v={`${quote.validityDays} days`} />}
            {quote.expectedSeats && <Row k="Recruiter seats" v={String(quote.expectedSeats)} />}
            {quote.budgetRange && <Row k="Budget" v={quote.budgetRange} />}
            {quote.hiringNeed && (
              <div className="border-t border-[var(--border)] pt-3 text-sm">
                <p className="text-[var(--text-muted)]">Hiring need</p>
                <p className="mt-1 text-[var(--text)]">{quote.hiringNeed}</p>
              </div>
            )}
          </div>
        </Card>

        {quote.offers.length > 0 && (
          <>
            <h2 className="mt-8 inline-flex items-center gap-2 text-base font-semibold text-[var(--text)]">
              <Sparkles className="text-primary h-5 w-5" /> Offers from our team
            </h2>
            <div className="mt-3 space-y-3">
              {quote.offers.map((offer) => {
                const expired = offer.expiresAt && new Date(offer.expiresAt) < new Date();
                const isAcceptable = offer.status === 'SENT' && !expired;
                return (
                  <Card key={offer.id} padding="lg" variant="bordered">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-2xl font-bold text-[var(--text)]">
                          {formatPaise(offer.basePricePaise, 'INR')}
                        </p>
                        <p className="mt-1 text-sm text-[var(--text-muted)]">
                          {offer.cvUnlocks} CV unlocks · {offer.validityDays} days · {offer.seats}{' '}
                          {offer.seats === 1 ? 'seat' : 'seats'}
                        </p>
                        {offer.expiresAt && (
                          <p className="mt-1 text-xs text-[var(--text-muted)]">
                            {expired
                              ? `Expired ${new Date(offer.expiresAt).toLocaleDateString('en-IN')}`
                              : `Valid till ${new Date(offer.expiresAt).toLocaleDateString('en-IN')}`}
                          </p>
                        )}
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
                          offer.status === 'ACCEPTED'
                            ? 'bg-green-100 text-green-900'
                            : offer.status === 'EXPIRED' || expired
                              ? 'bg-[var(--bg-secondary)] text-[var(--text-muted)]'
                              : offer.status === 'REJECTED'
                                ? 'bg-red-100 text-red-900'
                                : 'bg-blue-100 text-blue-900'
                        }`}
                      >
                        {expired ? 'expired' : offer.status.toLowerCase()}
                      </span>
                    </div>

                    {isAcceptable && (
                      <Button
                        variant="primary"
                        className="mt-4 w-full"
                        onClick={() => void acceptOffer(offer.id)}
                        isLoading={accepting === offer.id}
                      >
                        Accept &amp; pay
                      </Button>
                    )}
                  </Card>
                );
              })}
            </div>
          </>
        )}

        {quote.offers.length === 0 && (
          <Card padding="md" className="mt-6 border-blue-300 bg-blue-50">
            <p className="text-sm text-blue-900">
              Our team is reviewing your request. SLA is 24 hours — you&apos;ll get an email +
              WhatsApp ping when an offer is ready.
            </p>
          </Card>
        )}

        {error && (
          <p className="mt-3 text-sm text-[var(--error)]" role="alert">
            {error}
          </p>
        )}
      </div>
    </DashboardLayout>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-[var(--text-muted)]">{k}</span>
      <span className="text-right font-medium text-[var(--text)]">{v}</span>
    </div>
  );
}
