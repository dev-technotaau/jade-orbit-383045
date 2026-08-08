'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Mail,
  Trash2,
  Crown,
  Plus,
  Clock,
  AlertCircle,
  KeyRound,
  BarChart3,
} from 'lucide-react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import Badge from '@/components/ui/Badge';
import { showToast } from '@/components/ui/Toast';
import { confirmDialog } from '@/components/ui/dialog-service';
import Avatar from '@/components/ui/Avatar';
import { useEntitlements } from '@/hooks/use-entitlements';
import { useUpgradeModal } from '@/components/billing/UpgradeModal';
import { teamService, type TeamRole, type TeamMember } from '@/services/team.service';
import type { ApiError } from '@/types/api';

const ROLE_OPTIONS: { value: TeamRole; label: string }[] = [
  { value: 'RECRUITER', label: 'Recruiter — search & shortlist' },
  { value: 'ADMIN', label: 'Admin — manage jobs + team' },
];

export default function EmployerTeamPage() {
  const queryClient = useQueryClient();
  const { hasFeature } = useEntitlements();
  const upgrade = useUpgradeModal();
  const hasMultiSeatPlan = hasFeature('feature.multi_seat');

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<TeamRole>('RECRUITER');

  const { data, isLoading } = useQuery({
    queryKey: ['employer', 'team'],
    queryFn: () => teamService.list(),
  });
  // RBAC — only OWNER/ADMIN see the invite + manage UI. RECRUITER sees the
  // member list read-only.
  const canManage = data?.canManage ?? false;
  const canInvite = hasMultiSeatPlan && canManage;

  const inviteMutation = useMutation({
    mutationFn: () => teamService.invite({ email: inviteEmail.trim(), role: inviteRole }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employer', 'team'] });
      showToast.success('Invitation sent', `An email is on its way to ${inviteEmail.trim()}.`);
      setInviteEmail('');
    },
    onError: (err) => {
      const apiErr = err as unknown as ApiError;
      showToast.error(apiErr.message || 'Failed to send invitation');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => teamService.remove(memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employer', 'team'] });
      showToast.success('Team member removed');
    },
    onError: (err) => {
      const apiErr = err as unknown as ApiError;
      showToast.error(apiErr.message || 'Failed to remove member');
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: TeamRole }) =>
      teamService.changeRole(memberId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employer', 'team'] });
      showToast.success('Role updated');
    },
    onError: (err) => {
      const apiErr = err as unknown as ApiError;
      showToast.error(apiErr.message || 'Failed to update role');
    },
  });

  const transferMutation = useMutation({
    mutationFn: (targetUserId: string) => teamService.transferOwnership(targetUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employer', 'team'] });
      queryClient.invalidateQueries({ queryKey: ['billing', 'me', 'entitlements'] });
      showToast.success('Ownership transferred', 'You are now an Admin on this team.');
    },
    onError: (err) => {
      const apiErr = err as unknown as ApiError;
      showToast.error(apiErr.message || 'Failed to transfer ownership');
    },
  });

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!canInvite) {
      upgrade.open({ feature: 'feature.multi_seat' });
      return;
    }
    if (!inviteEmail.trim()) {
      showToast.error('Email is required');
      return;
    }
    inviteMutation.mutate();
  }

  return (
    <DashboardLayout requiredRole={['EMPLOYER']}>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Team</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Invite recruiters from your company so they share quotas (CV unlocks, search results).
            </p>
          </div>
          {canManage && (
            <Link href="/employer/team/usage">
              <Button variant="outline">
                <BarChart3 className="mr-1.5 h-4 w-4" /> View usage
              </Button>
            </Link>
          )}
        </div>

        {/* Multi-seat upsell — visible only when the employer doesn't have it. */}
        {!canInvite && (
          <button
            type="button"
            onClick={() => upgrade.open({ feature: 'feature.multi_seat' })}
            className="group flex w-full items-start gap-3 rounded-xl bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 p-4 text-left shadow-sm transition-all hover:from-amber-600 hover:via-amber-700 hover:to-orange-700 hover:shadow-md dark:from-amber-700 dark:via-amber-800 dark:to-orange-800"
          >
            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-white/20 text-white shadow-inner ring-1 ring-white/30 backdrop-blur-sm">
              <Crown className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-white">Add team members with CV Enterprise</p>
              <p className="mt-0.5 text-sm text-white/90">
                Multi-seat access lets your recruiters share one quota pool. Custom pricing — talk
                to our sales team.
              </p>
            </div>
            <span className="hidden items-center gap-1 self-center rounded-lg bg-white px-3 py-1.5 text-sm font-semibold whitespace-nowrap text-amber-700 shadow-sm transition-colors group-hover:bg-amber-50 sm:inline-flex">
              Talk to sales
            </span>
          </button>
        )}
        {upgrade.modal}

        {/* Invite form — only visible to OWNER/ADMIN. RECRUITERs see read-only
            member list below. Disabled-but-visible to non-Enterprise managers
            so they see the feature; submitting opens the upgrade modal. */}
        {canManage && (
          <Card padding="lg">
            <h2 className="text-lg font-semibold text-[var(--text)]">Invite a teammate</h2>
            <form onSubmit={handleInvite} className="mt-4 grid gap-3 md:grid-cols-[1fr_220px_auto]">
              <Input
                type="email"
                placeholder="recruiter@yourcompany.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                leftIcon={<Mail className="h-4 w-4" />}
                required
              />
              <Select
                options={ROLE_OPTIONS}
                value={inviteRole}
                onChange={(v) => setInviteRole(v as TeamRole)}
                placeholder="Role"
              />
              <Button
                type="submit"
                variant="primary"
                isLoading={inviteMutation.isPending}
                disabled={inviteMutation.isPending}
              >
                <Plus className="mr-1.5 h-4 w-4" /> Invite
              </Button>
            </form>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              They&apos;ll receive an email with an acceptance link valid for 7 days.
            </p>
          </Card>
        )}

        {/* Members list */}
        <Card padding="lg">
          <h2 className="text-lg font-semibold text-[var(--text)]">Members</h2>
          {isLoading && (
            <div className="mt-4 flex justify-center py-8">
              <Spinner />
            </div>
          )}
          {!isLoading && data && data.members.length === 0 && (
            <EmptyState
              icon={Users}
              title="No team members yet"
              description="Invite a teammate above to get started."
            />
          )}
          {!isLoading && data && data.members.length > 0 && (
            <ul className="mt-4 divide-y divide-[var(--border)]">
              {data.members.map((m) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  canManage={canManage}
                  isOwnerViewing={data.viewerRole === 'OWNER'}
                  busy={
                    removeMutation.variables === m.id ||
                    roleMutation.variables?.memberId === m.id ||
                    transferMutation.variables === m.user?.id
                  }
                  onRemove={async () => {
                    if (m.isOwner) return;
                    if (
                      await confirmDialog({
                        title: 'Remove team member',
                        message: `Remove ${m.user?.firstName ?? m.invitedEmail} from your team? They'll lose access immediately.`,
                        confirmLabel: 'Remove',
                        variant: 'danger',
                      })
                    ) {
                      removeMutation.mutate(m.id);
                    }
                  }}
                  onRoleChange={(role) => roleMutation.mutate({ memberId: m.id, role })}
                  onTransferOwnership={async () => {
                    if (!m.user?.id || m.isOwner) return;
                    if (
                      await confirmDialog({
                        title: 'Transfer ownership',
                        message: `Transfer company ownership to ${m.user.firstName ?? m.invitedEmail}? You'll be demoted to Admin and lose owner-only privileges. This cannot be reversed automatically.`,
                        confirmLabel: 'Transfer',
                        variant: 'warning',
                      })
                    ) {
                      transferMutation.mutate(m.user.id);
                    }
                  }}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}

function MemberRow({
  member,
  canManage,
  isOwnerViewing,
  busy,
  onRemove,
  onRoleChange,
  onTransferOwnership,
}: {
  member: TeamMember;
  canManage: boolean;
  isOwnerViewing: boolean;
  busy: boolean;
  onRemove: () => void;
  onRoleChange: (role: TeamRole) => void;
  onTransferOwnership: () => void;
}) {
  const displayName =
    [member.user?.firstName, member.user?.lastName].filter(Boolean).join(' ') ||
    member.invitedEmail;

  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <Avatar
          src={member.user?.avatar ?? null}
          firstName={member.user?.firstName ?? null}
          lastName={member.user?.lastName ?? null}
          size="md"
        />
        <div>
          <p className="font-semibold text-[var(--text)]">
            {displayName}
            {member.isOwner && (
              <Badge variant="warning" size="sm" className="ml-2">
                <Crown className="mr-1 h-3 w-3" /> Owner
              </Badge>
            )}
          </p>
          <p className="text-sm text-[var(--text-muted)]">{member.invitedEmail}</p>
          {member.status === 'PENDING' && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-amber-700">
              <Clock className="h-3 w-3" /> Invitation sent
            </p>
          )}
          {member.status === 'EXPIRED' && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-red-700">
              <AlertCircle className="h-3 w-3" /> Expired — re-invite to refresh
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canManage && !member.isOwner && member.status === 'ACTIVE' && (
          <Select
            options={ROLE_OPTIONS}
            value={member.role}
            onChange={(v) => onRoleChange(v as TeamRole)}
            disabled={busy}
            className="w-44"
          />
        )}
        {/* Transfer ownership — owner-only, only on ACTIVE seats with a real userId */}
        {isOwnerViewing && !member.isOwner && member.status === 'ACTIVE' && member.user?.id && (
          <Button
            variant="outline"
            size="sm"
            onClick={onTransferOwnership}
            isLoading={busy}
            disabled={busy}
            tooltip="Transfer ownership to this member"
          >
            <KeyRound className="h-4 w-4" />
          </Button>
        )}
        {canManage && !member.isOwner && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRemove}
            isLoading={busy}
            disabled={busy}
            aria-label="Remove"
          >
            <Trash2 className="h-4 w-4 text-[var(--error)]" />
          </Button>
        )}
      </div>
    </li>
  );
}
