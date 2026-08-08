'use client';

import { useState } from 'react';
import { Mail, Phone, Lock, Sparkles, Crown, CheckCircle2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { showToast } from '@/components/ui/Toast';
import { cvUnlockService, type UnlockResult } from '@/services/cv-unlock.service';
import { useEntitlements } from '@/hooks/use-entitlements';
import { useUpgradeModal } from '@/components/billing/UpgradeModal';
import type { ApiError } from '@/types/api';

interface UnlockContactButtonProps {
  candidateId: string;
  /** When the button is rendered next to existing locked-state placeholders. */
  className?: string;
  /**
   * Compact mode for toolbars and list cards — a small inline button
   * instead of the full-width button + caption, and a slim "Unlocked"
   * chip after success instead of the contact reveal card (the parent
   * displays the contacts via `onUnlocked`).
   */
  compact?: boolean;
  /** Fired with the unlock result (also on cached re-unlocks). */
  onUnlocked?: (result: UnlockResult) => void;
}

/**
 * Reveals candidate email + phone after consuming 1 CV_UNLOCK quota unit.
 *
 * Behaviour:
 *   - When `feature.cv_db_access` not present → "Unlock contact" button that
 *     opens the upgrade modal pre-filled for `feature.contact_details`.
 *   - When CV_UNLOCK remaining = 0 → similar locked button → upgrade modal
 *     pre-filled for `feature.cv_db_access` (top-up via a CV plan).
 *   - Else: button → backend POST → reveals contact (cached if already unlocked).
 *
 * Backend dedup: server returns `cached: true` if this employer has
 * unlocked this candidate before (or they applied) — no quota consumed.
 */
export default function UnlockContactButton({
  candidateId,
  className,
  compact = false,
  onUnlocked,
}: UnlockContactButtonProps) {
  const { hasFeature, remaining, refetch } = useEntitlements();
  const upgrade = useUpgradeModal();
  const [revealed, setRevealed] = useState<UnlockResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const noFeature = !hasFeature('feature.cv_db_access') && !hasFeature('feature.contact_details');
  const noQuota = remaining('CV_UNLOCK') === 0 && !revealed;

  if (noFeature || noQuota) {
    const featureForModal = noFeature ? 'feature.contact_details' : 'feature.cv_db_access';
    if (compact) {
      return (
        <span className={className}>
          <Button
            variant="primary"
            size="sm"
            className="whitespace-nowrap"
            onClick={() => upgrade.open({ feature: featureForModal })}
            tooltip={noFeature ? 'Upgrade required' : 'Quota exhausted — top up to continue'}
          >
            <Crown className="mr-1.5 h-3.5 w-3.5 flex-none" /> Unlock
          </Button>
          {upgrade.modal}
        </span>
      );
    }
    return (
      <div className={className}>
        <Button
          variant="primary"
          className="w-full whitespace-nowrap"
          onClick={() => upgrade.open({ feature: featureForModal })}
        >
          <Crown className="mr-2 h-4 w-4 flex-none" /> Unlock contact
        </Button>
        <p className="mt-1.5 text-center text-xs text-[var(--text-muted)]">
          {noFeature ? 'Upgrade required' : 'Quota exhausted — top up to continue'}
        </p>
        {upgrade.modal}
      </div>
    );
  }

  if (revealed) {
    if (compact) {
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-900 ${className ?? ''}`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" /> Unlocked
        </span>
      );
    }
    return (
      <Card padding="md" className={`border-green-300 bg-green-50 ${className ?? ''}`}>
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 flex-none text-green-700" />
          <div className="text-sm">
            <p className="font-semibold text-green-900">
              Contact unlocked{revealed.cached ? ' (already used)' : ''}
            </p>
            <p className="mt-1 inline-flex items-center gap-1 text-green-900">
              <Mail className="h-3 w-3" />{' '}
              <a href={`mailto:${revealed.email}`} className="underline">
                {revealed.email}
              </a>
            </p>
            {revealed.phone && (
              <p className="mt-0.5 inline-flex items-center gap-1 text-green-900">
                <Phone className="h-3 w-3" />{' '}
                <a href={`tel:${revealed.phone}`} className="underline">
                  {revealed.phone}
                </a>
              </p>
            )}
          </div>
        </div>
      </Card>
    );
  }

  async function unlock() {
    setBusy(true);
    setError(null);
    try {
      const result = await cvUnlockService.unlock(candidateId);
      setRevealed(result);
      onUnlocked?.(result);
      if (compact) {
        showToast.success(
          result.cached ? 'Already unlocked — no credit used' : 'Contact unlocked (1 CV unlock)',
        );
      }
      // Refresh entitlements snapshot so quota indicators update without waiting for socket
      void refetch();
    } catch (err) {
      const apiErr = err as unknown as ApiError;
      const message = apiErr?.message ?? 'Failed to unlock';
      setError(message);
      if (compact) showToast.error(message);
    } finally {
      setBusy(false);
    }
  }

  if (compact) {
    return (
      <span className={className}>
        <Button
          variant="primary"
          size="sm"
          className="whitespace-nowrap"
          onClick={() => void unlock()}
          isLoading={busy}
          disabled={busy}
          tooltip={`Uses 1 CV unlock · ${remaining('CV_UNLOCK')} left`}
        >
          <Lock className="mr-1.5 h-3.5 w-3.5 flex-none" /> Unlock
        </Button>
      </span>
    );
  }

  return (
    <div className={className}>
      <Button
        variant="primary"
        className="w-full whitespace-nowrap"
        onClick={() => void unlock()}
        isLoading={busy}
        disabled={busy}
      >
        <Lock className="mr-2 h-4 w-4 flex-none" /> Unlock contact
      </Button>
      <p className="mt-1.5 text-center text-xs text-[var(--text-muted)]">
        Uses 1 CV unlock · {remaining('CV_UNLOCK')} left
      </p>
      {error && (
        <p className="mt-2 text-xs text-[var(--error)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
