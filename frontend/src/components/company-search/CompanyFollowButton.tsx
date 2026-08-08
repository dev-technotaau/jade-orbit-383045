'use client';

/**
 * Company Follow / Following toggle button + follower count.
 *
 * Three render states:
 *   1. Guest (unauthenticated) — clicking bounces through useAuthGate
 *      with intent='follow' so post-login the user lands back on the
 *      company page and the follow action auto-completes.
 *   2. Authenticated, not following — primary "Follow" button.
 *   3. Authenticated, following — outline "Following" button that
 *      flips to "Unfollow" on hover/focus and unfollows on click.
 *
 * Self-follow guard — when the viewer's user.id matches the company's
 * employer userId, the button is hidden entirely (employer can't
 * follow their own company; backend also rejects with 400).
 *
 * Optimistic UI — toggle the local state immediately and reconcile
 * with the server response. Errors revert the state.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Check, X, Users, Loader2 } from 'lucide-react';
import Tooltip from '@/components/ui/Tooltip';
import { useAuthStore } from '@/store/auth.store';
import { useAuthGate } from '@/hooks/use-auth-gate';
import { useActionTrigger } from '@/hooks/use-action-trigger';
import { companyFollowService, type FollowStatus } from '@/services/company-follow.service';
import { showToast } from '@/components/ui/Toast';

interface Props {
  /** The company's id OR slug — both are accepted by the backend. */
  idOrSlug: string;
  /** Optional initial status — populated server-side for SSR pages
   *  so the first paint already shows the correct button label. */
  initialStatus?: FollowStatus;
  /**
   * The userId of the company's owner (employer). When the current
   * viewer matches, the button is hidden — employers shouldn't
   * follow their own company.
   */
  companyOwnerUserId?: string | null;
  /** Tone — "primary" on the company hero, "outline" inside cards. */
  variant?: 'primary' | 'outline';
  /** Compact = icon-only button + count to the side. */
  compact?: boolean;
  className?: string;
}

export default function CompanyFollowButton({
  idOrSlug,
  initialStatus,
  companyOwnerUserId,
  variant = 'primary',
  compact = false,
  className,
}: Props) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const viewerId = useAuthStore((s) => s.user?.id);
  const isOwner = !!companyOwnerUserId && companyOwnerUserId === viewerId;
  const { gatedAction } = useAuthGate();
  const qc = useQueryClient();

  // Hover state for the "Following → Unfollow" affordance.
  const [hover, setHover] = useState(false);

  // Server-truth — drives the badge after server reconciliation.
  const { data: status } = useQuery<FollowStatus>({
    queryKey: ['company-follow-status', idOrSlug],
    queryFn: () => companyFollowService.getStatus(idOrSlug),
    initialData: initialStatus,
    staleTime: 30 * 1000,
    enabled: !!idOrSlug,
  });

  const isFollowing = status?.isFollowing ?? false;
  const followersCount = status?.followersCount ?? 0;

  const followMut = useMutation({
    mutationFn: () => companyFollowService.follow(idOrSlug),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['company-follow-status', idOrSlug] });
      const prev = qc.getQueryData<FollowStatus>(['company-follow-status', idOrSlug]);
      qc.setQueryData<FollowStatus>(['company-follow-status', idOrSlug], (old) => ({
        isFollowing: true,
        followersCount: (old?.followersCount ?? 0) + 1,
      }));
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(['company-follow-status', idOrSlug], ctx.prev);
      }
      showToast.error('Could not follow this company. Please try again.');
    },
    onSuccess: (data) => {
      qc.setQueryData(['company-follow-status', idOrSlug], data);
      // Invalidate the candidate's following lists so they refresh.
      qc.invalidateQueries({ queryKey: ['candidate-following'] });
    },
  });

  const unfollowMut = useMutation({
    mutationFn: () => companyFollowService.unfollow(idOrSlug),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['company-follow-status', idOrSlug] });
      const prev = qc.getQueryData<FollowStatus>(['company-follow-status', idOrSlug]);
      qc.setQueryData<FollowStatus>(['company-follow-status', idOrSlug], (old) => ({
        isFollowing: false,
        followersCount: Math.max(0, (old?.followersCount ?? 1) - 1),
      }));
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(['company-follow-status', idOrSlug], ctx.prev);
      }
      showToast.error('Could not unfollow this company. Please try again.');
    },
    onSuccess: (data) => {
      qc.setQueryData(['company-follow-status', idOrSlug], data);
      qc.invalidateQueries({ queryKey: ['candidate-following'] });
    },
  });

  // Post-auth action trigger — when a guest bounces through login
  // with `?action=follow&redirect=…/companies/[slug]`, on landing
  // back here authenticated, fire the follow mutation automatically
  // so the user's intent is honoured without requiring a second click.
  useActionTrigger('follow', () => {
    if (!isFollowing && !isOwner) {
      followMut.mutate();
    }
  });

  // Owner view — show ONLY the followers count badge (no follow
  // button — employers can't follow their own company). Lets the
  // employer preview surface their follower count without offering
  // the action button.
  if (isOwner) {
    return (
      <Tooltip content={`${followersCount} ${followersCount === 1 ? 'follower' : 'followers'}`}>
        <span
          className={`inline-flex items-center gap-1 rounded-full bg-[var(--bg-secondary)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)] ${className ?? ''}`}
        >
          <Users className="h-3 w-3" />
          {followersCount.toLocaleString('en-IN')} {followersCount === 1 ? 'follower' : 'followers'}
        </span>
      </Tooltip>
    );
  }

  const isPending = followMut.isPending || unfollowMut.isPending;

  const handleClick = () => {
    if (!isAuthenticated) {
      // Auth-gate bounce — login/register, then return here and the
      // useActionTrigger hook on this page (added in companion change)
      // auto-fires the follow action.
      if (gatedAction('follow')) return;
    }
    if (isFollowing) unfollowMut.mutate();
    else followMut.mutate();
  };

  // ── Render ──────────────────────────────────────────────────────
  const baseBtnClass =
    'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60';

  // States:
  //   - guest                     → primary outlined (calls gatedAction)
  //   - authed + not following    → primary filled
  //   - authed + following        → outlined; on hover changes to "Unfollow" (red)
  let btnClass: string;
  let label: React.ReactNode;
  let Icon = Plus;

  if (!isFollowing) {
    btnClass =
      variant === 'primary'
        ? `${baseBtnClass} bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]`
        : `${baseBtnClass} border border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary)]/5`;
    label = 'Follow';
    Icon = Plus;
  } else if (hover) {
    btnClass = `${baseBtnClass} border border-[var(--error)] text-[var(--error)] hover:bg-[var(--error)]/5`;
    label = 'Unfollow';
    Icon = X;
  } else {
    btnClass = `${baseBtnClass} border border-[var(--border)] bg-white text-[var(--text)] hover:bg-[var(--bg-secondary)]`;
    label = 'Following';
    Icon = Check;
  }

  return (
    <div className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <button
        type="button"
        onClick={handleClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        disabled={isPending}
        aria-pressed={isFollowing}
        aria-label={
          isFollowing
            ? `Unfollow this company (currently ${followersCount} followers)`
            : `Follow this company (${followersCount} followers)`
        }
        className={btnClass}
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
        {!compact && <span>{label}</span>}
      </button>

      {/* Followers count badge — always visible, even pre-auth */}
      <Tooltip content={`${followersCount} ${followersCount === 1 ? 'follower' : 'followers'}`}>
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-secondary)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">
          <Users className="h-3 w-3" />
          {followersCount.toLocaleString('en-IN')}
        </span>
      </Tooltip>
    </div>
  );
}
