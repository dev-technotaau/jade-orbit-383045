'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import { useCancelSubscription } from '@/hooks/use-subscriptions';
import type { ApiError } from '@/types/api';

interface Props {
  open: boolean;
  subscriptionId: string;
  onClose: () => void;
  onCancelled?: () => void;
}

const REASONS = [
  'Too expensive',
  'Found a better alternative',
  'Hiring needs paused / completed',
  'Missing features',
  'Technical issues',
  'Other',
];

export default function CancelDialog({ open, subscriptionId, onClose, onCancelled }: Props) {
  const [reason, setReason] = useState<string | null>(null);
  const [otherText, setOtherText] = useState('');
  const [immediate, setImmediate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancel = useCancelSubscription();

  const submit = async () => {
    if (!reason) {
      setError('Please select a reason');
      return;
    }
    setError(null);
    const reasonText = reason === 'Other' ? `Other: ${otherText.trim()}` : reason;
    try {
      await cancel.mutateAsync({
        id: subscriptionId,
        reason: reasonText,
        cancelImmediately: immediate,
      });
      onCancelled?.();
      onClose();
    } catch (err) {
      const apiErr = err as unknown as ApiError;
      setError(apiErr?.message ?? 'Failed to cancel');
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="Cancel subscription">
      <p className="text-sm text-[var(--text-secondary)]">
        You&apos;ll keep access until the end of your current period unless you choose to cancel
        immediately.
      </p>

      <fieldset className="mt-4 space-y-2">
        {REASONS.map((r) => (
          <label
            key={r}
            className="flex cursor-pointer items-start gap-2 text-sm text-[var(--text)]"
          >
            <input
              type="radio"
              name="cancel-reason"
              checked={reason === r}
              onChange={() => {
                setReason(r);
                setError(null);
              }}
              className="mt-1"
            />
            <span>{r}</span>
          </label>
        ))}
      </fieldset>

      {reason === 'Other' ? (
        <textarea
          rows={3}
          value={otherText}
          onChange={(e) => setOtherText(e.target.value)}
          placeholder="Tell us more..."
          className="mt-3 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2 text-sm text-[var(--text)]"
        />
      ) : null}

      <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-[var(--text)]">
        <input
          type="checkbox"
          checked={immediate}
          onChange={(e) => setImmediate(e.target.checked)}
          className="mt-1"
        />
        <span>Cancel immediately (lose access now, no refund for unused period)</span>
      </label>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose} disabled={cancel.isPending}>
          Keep subscription
        </Button>
        <Button variant="destructive" onClick={submit} disabled={cancel.isPending || !reason}>
          {cancel.isPending ? <Spinner /> : 'Confirm cancel'}
        </Button>
      </div>
    </Modal>
  );
}
