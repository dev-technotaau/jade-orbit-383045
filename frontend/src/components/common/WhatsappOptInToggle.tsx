'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import BrandIcon from '@/components/common/BrandIcon';
import Card from '@/components/ui/Card';
import { showToast } from '@/components/ui/Toast';
import { selfServeWhatsappOptIn } from '@/services/super-admin-whatsapp.service';
import type { ApiError } from '@/types/api';

/**
 * Self-serve WhatsApp opt-in toggle.
 *
 * There is no GET for the current opt-in state, so this renders as an action:
 * the toggle defaults to unchecked ("not set") and simply sends the user's
 * choice on each change. The local `optedIn` state reflects the last value the
 * user confirmed via a successful request — on error we revert.
 */
export default function WhatsappOptInToggle() {
  const [optedIn, setOptedIn] = useState(false);

  const mutation = useMutation({
    mutationFn: (next: boolean) => selfServeWhatsappOptIn(next),
    onSuccess: (_data, next) => {
      setOptedIn(next);
      showToast.success(
        next ? "You're opted in to WhatsApp updates" : "You've opted out of WhatsApp updates",
      );
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error?.message || 'Failed to update your WhatsApp preference');
    },
  });

  const handleToggle = () => {
    if (mutation.isPending) return;
    mutation.mutate(!optedIn);
  };

  return (
    <Card variant="bordered">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
          <BrandIcon name="whatsapp" className="h-5 w-5 text-green-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--text)]">WhatsApp Updates</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Manage whether we can message you on WhatsApp
          </p>
        </div>
      </div>

      <label
        className={`flex items-center justify-between rounded-lg border border-[var(--border)] p-4 transition-colors hover:bg-[var(--bg-secondary)] ${
          mutation.isPending ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
        }`}
      >
        <div className="flex items-center gap-3">
          <BrandIcon name="whatsapp" className="h-5 w-5 text-[var(--text-muted)]" />
          <div>
            <p className="text-sm font-medium text-[var(--text)]">Receive updates on WhatsApp</p>
            <p className="text-xs text-[var(--text-muted)]">
              We&apos;ll message you about your applications/jobs on WhatsApp. You can opt out
              anytime.
            </p>
          </div>
        </div>
        <div className="relative shrink-0">
          <input
            type="checkbox"
            role="switch"
            checked={optedIn}
            disabled={mutation.isPending}
            onChange={handleToggle}
            className="peer sr-only"
          />
          <div className="peer-checked:bg-primary peer-focus-visible:ring-primary h-6 w-11 rounded-full bg-[var(--border)] transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2" />
          <div className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
        </div>
      </label>
    </Card>
  );
}
