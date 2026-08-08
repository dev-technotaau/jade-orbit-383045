'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import { subscriptionService } from '@/services/subscription.service';
import type { ApiError } from '@/types/api';
import { AlertTriangle, ArrowLeft } from 'lucide-react';

const REASONS = [
  'Too expensive',
  'Found a better alternative',
  'Hiring needs paused / completed',
  'Missing features',
  'Technical issues',
  'Just wanted to try the platform',
  'Other',
] as const;

type Reason = (typeof REASONS)[number];

export default function CancelSubscriptionPage() {
  const router = useRouter();
  const params = useSearchParams();
  const subscriptionId = params.get('id') ?? '';

  const [reason, setReason] = useState<Reason | null>(null);
  const [otherText, setOtherText] = useState('');
  const [immediate, setImmediate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!subscriptionId) {
    return (
      <DashboardLayout requiredRole={['EMPLOYER', 'CANDIDATE']}>
        <div className="mx-auto max-w-2xl px-4 py-10">
          <Card className="p-6">
            <p className="text-sm text-[var(--text-secondary)]">
              No subscription specified. Open the subscription you want to cancel from your{' '}
              <Link href="/billing/subscriptions" className="text-blue-600 hover:underline">
                subscriptions page
              </Link>
              .
            </p>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const onSubmit = async () => {
    if (!reason) {
      setError('Please select a reason');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const reasonText = reason === 'Other' ? `Other: ${otherText.trim()}` : reason;
      await subscriptionService.cancel(subscriptionId, {
        reason: reasonText,
        cancelImmediately: immediate,
      });
      router.replace(`/billing/subscriptions/${subscriptionId}?cancelled=1`);
    } catch (err) {
      const apiErr = err as unknown as ApiError;
      setError(apiErr?.message ?? 'Failed to cancel — please try again.');
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout requiredRole={['EMPLOYER', 'CANDIDATE']}>
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Link
          href={`/billing/subscriptions/${subscriptionId}`}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text)]"
        >
          <ArrowLeft size={14} /> Back to subscription
        </Link>

        <Card className="p-6 sm:p-8">
          <div className="mb-6 flex items-start gap-3 rounded-lg border-l-4 border-amber-500 bg-amber-50 p-4 text-sm text-stone-900 dark:bg-amber-900/20 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 flex-shrink-0" size={18} />
            <div>
              <strong className="block">Are you sure you want to cancel?</strong>
              You&apos;ll keep access until the end of your current billing period.
            </div>
          </div>

          <h1 className="text-xl font-semibold text-[var(--text)]">
            Tell us why you&apos;re leaving
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Your feedback helps us improve.
          </p>

          <fieldset className="mt-6 space-y-2">
            {REASONS.map((r) => (
              <label
                key={r}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--border)] p-3 hover:bg-[var(--bg-secondary)]"
              >
                <input
                  type="radio"
                  name="cancel-reason"
                  className="mt-0.5"
                  checked={reason === r}
                  onChange={() => {
                    setReason(r);
                    setError(null);
                  }}
                />
                <span className="text-sm text-[var(--text)]">{r}</span>
              </label>
            ))}
          </fieldset>

          {reason === 'Other' ? (
            <textarea
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              rows={3}
              placeholder="Please share more details..."
              className="mt-3 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 text-sm text-[var(--text)] focus:border-blue-500 focus:outline-none"
            />
          ) : null}

          <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
            <input
              type="checkbox"
              checked={immediate}
              onChange={(e) => setImmediate(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-sm text-[var(--text)]">
              <strong>Cancel immediately</strong> — Lose access right now (no refund for unused
              period)
              <span className="block text-xs text-[var(--text-secondary)]">
                If unchecked, your plan stays active until the end of the current billing period.
              </span>
            </span>
          </label>

          {error ? (
            <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
              {error}
            </p>
          ) : null}

          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => router.back()} disabled={submitting}>
              Keep my plan
            </Button>
            <Button variant="destructive" onClick={onSubmit} disabled={submitting || !reason}>
              {submitting ? <Spinner /> : 'Confirm cancellation'}
            </Button>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
