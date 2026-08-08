'use client';

import { useState } from 'react';
import { useToggleAutoRenew } from '@/hooks/use-subscriptions';
import Spinner from '@/components/ui/Spinner';
import type { ApiError } from '@/types/api';

interface Props {
  subscriptionId: string;
  initialValue: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
}

export default function AutoRenewToggle({
  subscriptionId,
  initialValue,
  onChange,
  disabled,
}: Props) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const toggle = useToggleAutoRenew();

  const onClick = async () => {
    if (disabled) return;
    const next = !value;
    setValue(next); // optimistic
    setError(null);
    try {
      await toggle.mutateAsync({ id: subscriptionId, autoRenew: next });
      onChange?.(next);
    } catch (err) {
      setValue(!next); // revert
      const apiErr = err as unknown as ApiError;
      setError(apiErr?.message ?? 'Failed to update');
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || toggle.isPending}
        aria-pressed={value}
        aria-label="Toggle auto-renew"
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
          value ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'
        } ${disabled ? 'opacity-50' : ''}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
            value ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
        {toggle.isPending ? (
          <span className="absolute inset-0 flex items-center justify-center">
            <Spinner />
          </span>
        ) : null}
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
