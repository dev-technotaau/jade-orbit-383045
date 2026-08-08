'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Zap, Crown, Clock, Minus, Plus } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Skeleton from '@/components/ui/Skeleton';
import { showToast } from '@/components/ui/Toast';
import { candidateService } from '@/services/candidate.service';
import { useUpgradeModal } from '@/components/billing/UpgradeModal';
import type { ProfileBoostStatus } from '@/types/candidate';
import type { ApiError } from '@/types/api';

const QUERY_KEY = ['candidate', 'boost-status'] as const;

/**
 * Format a `Date` (or null) into the short "Tue, 4 Jun · 3:42 PM" shape
 * used inside the active-window banner. We render this directly in the
 * card body rather than as a tooltip so the user can plan around it.
 */
function formatExpiry(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  return d.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Convert hours-remaining into a friendly "X hours left" / "less than an
 * hour" string. Falls back gracefully — if the value drops to zero
 * between server snapshots we don't want to flash "0h left".
 */
function formatRemaining(hours: number): string {
  if (hours <= 0) return 'expiring now';
  if (hours === 1) return '1 hour left';
  if (hours < 24) return `${hours} hours left`;
  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  if (days === 1 && rem === 0) return '1 day left';
  if (rem === 0) return `${days} days left`;
  return `${days}d ${rem}h left`;
}

/**
 * Profile-boost dashboard widget for the Candidate Premium plan.
 *
 * Three rendered states based on /candidates/me/boost:
 *
 *   1. Not eligible (no boost feature flag) → upsell CTA opening the
 *      shared UpgradeModal targeting feature.candidate_profile_boost.
 *   2. Eligible + pool empty → "All 7 days used" stat with a quiet
 *      acknowledgement; no activate button.
 *   3. Eligible + pool has days → primary activate button. When a window
 *      is already active, the button label switches to "Extend by 24h"
 *      and the active-window banner is shown above with countdown.
 *
 * Auto-refreshes every 60s while a boost is active so the countdown
 * stays roughly in sync without burning network on idle dashboards.
 */
export default function ProfileBoostCard() {
  const queryClient = useQueryClient();
  const upgrade = useUpgradeModal();
  const [now, setNow] = useState(() => Date.now());
  // Days to spend in this activation — user-controlled via the stepper.
  // Default 1; clamped to [1, daysRemaining] in the handlers below so
  // the value can never overdraw the pool (server re-validates too).
  const [daysToSpend, setDaysToSpend] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => candidateService.getBoostStatus(),
    // Refetch every minute while the boost is active — keeps remaining-
    // hours in sync without spamming. When inactive, normal stale-while-
    // revalidate is fine; the user has to click the button to change state.
    refetchInterval: (query) => {
      const status = query.state.data?.data;
      return status?.isActive ? 60_000 : false;
    },
  });

  // Re-render every minute even without a refetch so the countdown chip
  // ticks down smoothly between server snapshots.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const status: ProfileBoostStatus | undefined = data?.data;

  // Re-derive "hours left" from activeUntil + the ticking `now` so the
  // chip stays accurate between minute-granularity refetches. React
  // Compiler handles memoization automatically — no useMemo needed.
  const liveHoursLeft =
    status?.isActive && status.activeUntil
      ? Math.max(0, Math.ceil((new Date(status.activeUntil).getTime() - now) / (60 * 60 * 1000)))
      : 0;

  const activate = useMutation({
    mutationFn: (days: number) => candidateService.activateBoost(days),
    onSuccess: (res) => {
      const spent = res.data?.daysSpent ?? 1;
      const hours = res.data?.hoursUntilExpiry ?? spent * 24;
      showToast.success(`Profile boost activated for ${spent} day${spent === 1 ? '' : 's'}`, {
        description: `You'll appear higher in recruiter searches for the next ${hours} hours.`,
      });
      // Reset the stepper so a follow-up activation starts at 1 day.
      setDaysToSpend(1);
      // Refresh status + the entitlement snapshot (BOOST_DAYS pool decreased).
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['entitlements'] });
    },
    onError: (err: unknown) => {
      const apiErr = err as unknown as ApiError;
      const code = apiErr?.code;
      const message = apiErr?.message ?? 'Could not activate boost. Please try again.';
      if (code === 'BOOST_NOT_ELIGIBLE') {
        upgrade.open({ feature: 'feature.candidate_profile_boost' });
        return;
      }
      if (code === 'PAYMENT_REQUIRED' || code === 'INSUFFICIENT_BOOST_DAYS') {
        showToast.error('Not enough boost days', { description: message });
        queryClient.invalidateQueries({ queryKey: QUERY_KEY });
        return;
      }
      showToast.error('Boost activation failed', { description: message });
    },
  });

  if (isLoading) {
    return (
      <Card className="border-[var(--border)]">
        <Skeleton className="h-32 w-full" />
      </Card>
    );
  }

  // Defensive — if the snapshot failed to load we hide the card rather
  // than rendering an empty/broken state on the dashboard.
  if (!status) return null;

  // State 1 — not eligible. Show a quiet upsell, NOT a hard block: the
  // candidate dashboard already has a louder premium banner above.
  if (!status.eligible) {
    return (
      <Card className="border-[var(--border)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-[var(--text)]">Profile Boost</h3>
              <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                Get featured at the top of recruiter searches for 24 hours at a time. Candidate
                Premium includes 7 boost days.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => upgrade.open({ feature: 'feature.candidate_profile_boost' })}
          >
            Unlock with Premium
          </Button>
        </div>
        {upgrade.modal}
      </Card>
    );
  }

  // States 2 & 3 — eligible. Active window (if any) renders as a top banner;
  // the stepper + CTA share the bottom row.
  const poolUsed = Math.max(0, status.daysTotal - status.daysRemaining);
  const poolEmpty = status.daysRemaining <= 0;
  // Clamp the stepper value against the live pool. Pure derivation —
  // when daysRemaining drops below the user's chosen count (e.g. after
  // a refetch), the displayed value snaps down without needing an effect.
  const clampedDays = Math.min(Math.max(1, daysToSpend), Math.max(1, status.daysRemaining));
  const canDecrement = !poolEmpty && clampedDays > 1;
  const canIncrement = !poolEmpty && clampedDays < status.daysRemaining;
  const hoursForCta = clampedDays * 24;
  const ctaLabel = status.isActive
    ? `Extend by ${hoursForCta} hour${hoursForCta === 1 ? '' : 's'}`
    : clampedDays === 1
      ? 'Activate boost (1 day)'
      : `Activate boost (${clampedDays} days)`;

  return (
    <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50/60 via-white to-white">
      <div className="space-y-4">
        <header className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <Zap className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-[var(--text)]">Profile Boost</h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                <Crown className="h-3 w-3" />
                Premium
              </span>
            </div>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
              Activate to appear at the top of recruiter searches for 24 hours.
            </p>
          </div>
        </header>

        {/* Active-window banner — only when isActive. Shows expiry +
            countdown so the user knows exactly when to consider extending. */}
        {status.isActive && status.activeUntil && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            <Clock className="h-4 w-4 flex-none" />
            <div className="flex flex-1 flex-wrap items-baseline gap-x-2">
              <span className="font-semibold">Boost active</span>
              <span className="text-emerald-800">until {formatExpiry(status.activeUntil)}</span>
              <span className="ml-auto rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium text-emerald-800">
                {formatRemaining(liveHoursLeft)}
              </span>
            </div>
          </div>
        )}

        {/* Pool counter — stays as the primary "how many do I have" stat. */}
        <div className="text-sm text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text)]">{status.daysRemaining}</span> of{' '}
          {status.daysTotal} boost days remaining
          {poolUsed > 0 && <span className="text-[var(--text-muted)]"> · {poolUsed} used</span>}
        </div>

        {/* Stepper + CTA — pick how many days to spend in this activation.
            Hidden when the pool is empty (the disabled CTA below takes over). */}
        {!poolEmpty && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">
                Spend
              </span>
              <div
                className="inline-flex items-center overflow-hidden rounded-lg border border-[var(--border)] bg-white"
                role="group"
                aria-label="Boost days to spend"
              >
                <button
                  type="button"
                  onClick={() =>
                    setDaysToSpend((d) => Math.max(1, Math.min(d, status.daysRemaining) - 1))
                  }
                  disabled={!canDecrement || activate.isPending}
                  className="flex h-9 w-9 items-center justify-center text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Decrease days"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={status.daysRemaining}
                  value={clampedDays}
                  onChange={(e) => {
                    const raw = Number(e.target.value);
                    if (!Number.isFinite(raw)) return;
                    setDaysToSpend(Math.max(1, Math.min(Math.floor(raw), status.daysRemaining)));
                  }}
                  // No spinner arrows — the buttons handle increment/decrement
                  // for a consistent UI; the native arrows look out of place.
                  className="h-9 w-12 [appearance:textfield] border-x border-[var(--border)] bg-white text-center text-sm font-semibold text-[var(--text)] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  aria-label="Days to spend"
                />
                <button
                  type="button"
                  onClick={() =>
                    setDaysToSpend((d) => Math.min(status.daysRemaining, Math.max(1, d) + 1))
                  }
                  disabled={!canIncrement || activate.isPending}
                  className="flex h-9 w-9 items-center justify-center text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Increase days"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <span className="text-xs text-[var(--text-muted)]">
                day{clampedDays === 1 ? '' : 's'} · {hoursForCta}h
              </span>
            </div>
            <Button
              onClick={() => activate.mutate(clampedDays)}
              disabled={activate.isPending}
              isLoading={activate.isPending}
              // Subtle visual difference between "fresh start" and "extend"
              // — outline when extending so the existing active banner stays
              // the dominant CTA on the card.
              variant={status.isActive ? 'outline' : 'primary'}
            >
              {ctaLabel}
            </Button>
          </div>
        )}

        {poolEmpty && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-[var(--text-muted)]">
              All boost days from your current plan have been used.
            </span>
            <Button disabled variant="outline">
              No boost days left
            </Button>
          </div>
        )}

        {poolEmpty && (
          <p className="text-xs text-[var(--text-muted)]">
            All {status.daysTotal} boost days from your current plan have been used. Renew or
            upgrade your plan to get more.
          </p>
        )}
      </div>
    </Card>
  );
}
