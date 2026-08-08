'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Pause, Play, X, Repeat, ExternalLink, ArrowUpRight } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import Switch from '@/components/ui/Switch';
import { subscriptionService } from '@/services/subscription.service';
import { formatPaise } from '@/types/billing';
import { ROUTES } from '@/constants/routes';
import type { SubscriptionDetail } from '@/types/subscription';

export default function SubscriptionDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? '');

  const [sub, setSub] = useState<SubscriptionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'pause' | 'resume' | 'autorenew' | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    subscriptionService
      .get(id)
      .then((res) => {
        if (active) setSub(res);
      })
      .catch((err) => {
        if (active) setError(err?.message ?? 'Failed to load subscription');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  async function refresh() {
    const fresh = await subscriptionService.get(id);
    setSub(fresh);
  }

  async function handlePause() {
    setBusy('pause');
    try {
      await subscriptionService.pause(id);
      await refresh();
    } catch (err) {
      setError((err as Error).message ?? 'Failed to pause');
    } finally {
      setBusy(null);
    }
  }

  async function handleResume() {
    setBusy('resume');
    try {
      await subscriptionService.resume(id);
      await refresh();
    } catch (err) {
      setError((err as Error).message ?? 'Failed to resume');
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleAutoRenew(next: boolean) {
    setBusy('autorenew');
    try {
      await subscriptionService.toggleAutoRenew(id, next);
      await refresh();
    } catch (err) {
      setError((err as Error).message ?? 'Failed to update auto-renew');
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Spinner size="lg" />
        </div>
      </DashboardLayout>
    );
  }
  if (!sub) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-2xl px-4 py-12">
          <Card padding="lg">
            <p className="text-[var(--text-muted)]">{error ?? 'Subscription not found.'}</p>
            <Link
              href="/billing/subscriptions"
              className="text-primary mt-4 inline-flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" /> Back to subscriptions
            </Link>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const isActive = sub.status === 'ACTIVE' || sub.status === 'AUTHENTICATED';
  const isPaused = sub.status === 'PAUSED';
  const isTerminated =
    sub.status === 'CANCELLED' || sub.status === 'COMPLETED' || sub.status === 'EXPIRED';

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl px-4 py-10">
        <Link
          href="/billing/subscriptions"
          className="text-primary mb-6 inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Back to subscriptions
        </Link>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_320px]">
          <Card padding="lg">
            <div className="flex items-start gap-3">
              <div className="bg-primary/10 text-primary flex h-12 w-12 items-center justify-center rounded-xl">
                <Repeat className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-[var(--text)]">{sub.plan.name}</h1>
                <p className="text-sm text-[var(--text-muted)]">
                  {formatPaise(sub.plan.basePricePaise, sub.plan.currency)} ·{' '}
                  {sub.plan.billingCycle.toLowerCase()}
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-2 text-sm">
              <Row k="Status" v={sub.status.replace(/_/g, ' ').toLowerCase()} />
              <Row k="Auto-renew" v={sub.autoRenew ? 'On' : 'Off'} />
              <Row k="Cycles paid" v={`${sub.paidCount} / ${sub.totalCount ?? '∞'}`} />
              <Row
                k="Current cycle"
                v={
                  sub.currentStart && sub.currentEnd
                    ? `${new Date(sub.currentStart).toLocaleDateString('en-IN')} → ${new Date(sub.currentEnd).toLocaleDateString('en-IN')}`
                    : '—'
                }
              />
              <Row
                k="Next charge"
                v={
                  sub.nextChargeAt
                    ? new Date(sub.nextChargeAt).toLocaleString('en-IN')
                    : 'No further charges'
                }
              />
              {sub.gracePeriodUntil && (
                <Row
                  k="Grace period until"
                  v={new Date(sub.gracePeriodUntil).toLocaleString('en-IN')}
                />
              )}
              {sub.cancelAtCycleEnd && (
                <Row k="Cancellation" v="Will cancel at end of current cycle" />
              )}
            </div>

            {sub.mandate && (
              <>
                <h2 className="mt-8 text-base font-semibold text-[var(--text)]">Payment mandate</h2>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {sub.mandate.method === 'UPI_AUTOPAY' && sub.mandate.vpa
                    ? `UPI AutoPay · ${sub.mandate.vpa}`
                    : sub.mandate.method === 'CARD' && sub.mandate.cardLast4
                      ? `${sub.mandate.network ?? 'Card'} ••${sub.mandate.cardLast4}`
                      : sub.mandate.method === 'EMANDATE' && sub.mandate.bankName
                        ? `Net banking · ${sub.mandate.bankName}`
                        : `${sub.mandate.method.toLowerCase().replace('_', ' ')} · ${sub.mandate.status.toLowerCase()}`}
                </p>
              </>
            )}

            {sub.payments && sub.payments.length > 0 && (
              <>
                <h2 className="mt-8 text-base font-semibold text-[var(--text)]">Recent payments</h2>
                <ul className="mt-2 space-y-2 text-sm">
                  {sub.payments.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between rounded-lg border border-[var(--border)] p-3"
                    >
                      <div>
                        <p className="font-medium text-[var(--text)]">
                          {p.method.toLowerCase()} ·{' '}
                          {p.cardLast4
                            ? `${p.cardNetwork ?? 'Card'} ••${p.cardLast4}`
                            : p.vpa
                              ? p.vpa
                              : p.bank
                                ? p.bank
                                : (p.wallet ?? 'payment')}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {new Date(p.createdAt).toLocaleString('en-IN')}
                        </p>
                      </div>
                      <span className="font-semibold text-[var(--text)]">
                        {formatPaise(p.amountPaise, p.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          <Card padding="lg" className="self-start">
            <h2 className="text-base font-semibold text-[var(--text)]">Manage</h2>

            {sub.shortUrl && (sub.status === 'CREATED' || sub.status === 'AUTHENTICATED') && (
              <Link href={sub.shortUrl} target="_blank" className="mt-3 block">
                <Button variant="primary" className="w-full">
                  <ExternalLink className="mr-2 h-4 w-4" /> Authorise mandate
                </Button>
              </Link>
            )}

            {!isTerminated && (
              <div className="mt-4 flex items-center justify-between rounded-lg border border-[var(--border)] p-3">
                <div>
                  <p className="text-sm font-medium text-[var(--text)]">Auto-renew</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {sub.autoRenew ? 'Plan renews automatically' : 'Plan will not renew'}
                  </p>
                </div>
                <Switch
                  checked={sub.autoRenew}
                  onChange={(e) => void handleToggleAutoRenew(e.target.checked)}
                  disabled={busy !== null}
                />
              </div>
            )}

            <div className="mt-3 space-y-2">
              {isActive && (
                <Link href="/pricing?upgrade=1" className="block">
                  <Button variant="primary" className="w-full">
                    <ArrowUpRight className="mr-2 h-4 w-4" /> Change plan
                  </Button>
                </Link>
              )}
              {isActive && !sub.cancelAtCycleEnd && (
                <Link href={ROUTES.BILLING.CANCEL_SUBSCRIPTION(id)} className="block">
                  <Button variant="outline" className="w-full">
                    <X className="mr-2 h-4 w-4" /> Cancel subscription
                  </Button>
                </Link>
              )}
              {isActive && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => void handlePause()}
                  isLoading={busy === 'pause'}
                >
                  <Pause className="mr-2 h-4 w-4" /> Pause
                </Button>
              )}
              {isPaused && (
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => void handleResume()}
                  isLoading={busy === 'resume'}
                >
                  <Play className="mr-2 h-4 w-4" /> Resume
                </Button>
              )}
            </div>

            {error && (
              <p className="mt-3 text-sm text-[var(--error)]" role="alert">
                {error}
              </p>
            )}

            <p className="mt-6 text-xs text-[var(--text-muted)]">
              Cancellation keeps your plan active until{' '}
              {sub.currentEnd
                ? new Date(sub.currentEnd).toLocaleDateString('en-IN')
                : 'the end of this cycle'}
              . You can re-subscribe anytime.
            </p>
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
      <span className="text-right font-medium text-[var(--text)]">{v}</span>
    </div>
  );
}
