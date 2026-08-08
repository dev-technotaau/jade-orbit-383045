'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  Crown,
  Trash2,
  CheckCircle,
  Clock,
  AlertCircle,
  Activity,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import { promptDialog } from '@/components/ui/dialog-service';
import Button from '@/components/ui/Button';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import { showToast } from '@/components/ui/Toast';
import { superAdminTeamsService, type SaTeamMember } from '@/services/super-admin-teams.service';
import { CompanyFollowersPanel } from '@/components/super-admin/FollowDrillPanels';
import CompanyReviewsPanel from '@/components/super-admin/CompanyReviewsPanel';
import type { ApiError } from '@/types/api';

export default function SuperAdminTeamDetailPage() {
  const params = useParams();
  const companyId = String(params?.companyId ?? '');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['super-admin', 'teams', companyId],
    queryFn: () => superAdminTeamsService.detail(companyId),
    enabled: Boolean(companyId),
  });

  const revoke = useMutation({
    mutationFn: ({ memberId, reason }: { memberId: string; reason: string }) =>
      superAdminTeamsService.forceRevoke(memberId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'teams', companyId] });
      showToast.success('Team member revoked');
    },
    onError: (err) => {
      const apiErr = err as unknown as ApiError;
      showToast.error(apiErr.message || 'Failed to revoke');
    },
  });

  if (isLoading) {
    return (
      <DashboardLayout requiredRole={['ADMIN', 'SUPER_ADMIN']} requiredPermission="teams.view">
        <div className="flex min-h-[40vh] items-center justify-center">
          <Spinner size="lg" />
        </div>
      </DashboardLayout>
    );
  }

  if (!data) {
    return (
      <DashboardLayout requiredRole={['ADMIN', 'SUPER_ADMIN']} requiredPermission="teams.view">
        <Card padding="lg">
          <p className="text-sm text-[var(--text-muted)]">Team not found.</p>
          <Link
            href="/super-admin/teams"
            className="text-primary mt-3 inline-flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="h-4 w-4" /> Back to teams
          </Link>
        </Card>
      </DashboardLayout>
    );
  }

  const { company, members, audit } = data;

  return (
    <DashboardLayout requiredRole={['ADMIN', 'SUPER_ADMIN']} requiredPermission="teams.view">
      <div className="space-y-6">
        <Link
          href="/super-admin/teams"
          className="text-primary inline-flex items-center gap-1.5 text-sm hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to teams
        </Link>

        <Card padding="lg">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 flex-none items-center justify-center overflow-hidden rounded-xl bg-[var(--bg-secondary)]">
              {company.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={company.logo}
                  alt={company.companyName}
                  className="h-full w-full object-contain"
                />
              ) : (
                <Building2 className="h-7 w-7 text-[var(--text-muted)]" />
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[var(--text)]">
                {company.companyName}
                {company.isVerified && (
                  <CheckCircle
                    className="ml-2 inline h-5 w-5 text-blue-600"
                    aria-label="Verified"
                  />
                )}
              </h1>
              <p className="text-sm text-[var(--text-muted)]">
                Owned by{' '}
                {[company.user.firstName, company.user.lastName].filter(Boolean).join(' ') ||
                  company.user.email}{' '}
                · {company.user.email}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Created {new Date(company.createdAt).toLocaleDateString('en-IN')}
              </p>
            </div>
          </div>
        </Card>

        <Card padding="lg">
          <h2 className="text-lg font-semibold text-[var(--text)]">Members</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {members.length} member{members.length === 1 ? '' : 's'}. Owner is shared
            entitlement-pool root; other seats consume from their quotas.
          </p>
          <ul className="mt-4 divide-y divide-[var(--border)]">
            {members.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                busy={revoke.isPending && revoke.variables?.memberId === m.id}
                onRevoke={(reason) => revoke.mutate({ memberId: m.id, reason })}
              />
            ))}
          </ul>
        </Card>

        <Card padding="lg">
          <h2 className="text-lg font-semibold text-[var(--text)]">Audit history</h2>
          {audit.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--text-muted)]">No audit entries yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {audit.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 text-sm">
                  <Activity className="mt-0.5 h-4 w-4 text-[var(--text-muted)]" />
                  <div className="flex-1">
                    <p>
                      <span className="font-mono text-xs text-[var(--text-muted)]">
                        {new Date(entry.createdAt).toLocaleString('en-IN')}
                      </span>{' '}
                      <strong>{entry.action.replace(/_/g, ' ').toLowerCase()}</strong>
                      {entry.details ? (
                        <span className="text-[var(--text-muted)]">
                          {' '}
                          — {summariseDetails(entry.details)}
                        </span>
                      ) : null}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Follow-graph drill-down — candidates following this company. */}
        <CompanyFollowersPanel companyId={companyId} />

        {/* Reviews drill-down — paginated reviews + per-row moderation
            actions (Approve / Flag / Reject / Delete). All statuses
            shown so admins can audit the full history. */}
        <CompanyReviewsPanel companyId={companyId} />
      </div>
    </DashboardLayout>
  );
}

function MemberRow({
  member,
  busy,
  onRevoke,
}: {
  member: SaTeamMember;
  busy: boolean;
  onRevoke: (reason: string) => void;
}) {
  const usageEntries = Object.entries(member.usage30d.perUnit);
  return (
    <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Avatar
          src={member.avatar}
          firstName={member.name.split(' ')[0]}
          lastName={member.name.split(' ').slice(1).join(' ')}
          size="md"
        />
        <div>
          <p className="font-semibold text-[var(--text)]">
            {member.name}
            {member.isOwner && (
              <Badge variant="warning" size="sm" className="ml-2">
                <Crown className="mr-1 h-3 w-3" /> Owner
              </Badge>
            )}
            {!member.isOwner && (
              <Badge
                variant={member.role === 'ADMIN' ? 'info' : 'neutral'}
                size="sm"
                className="ml-2"
              >
                {member.role.toLowerCase()}
              </Badge>
            )}
          </p>
          <p className="text-sm text-[var(--text-muted)]">{member.email}</p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
            {member.status === 'ACTIVE' && (
              <>
                <CheckCircle className="h-3 w-3 text-emerald-600" /> Active
              </>
            )}
            {member.status === 'PENDING' && (
              <>
                <Clock className="h-3 w-3 text-amber-600" /> Invited
              </>
            )}
            {member.status === 'EXPIRED' && (
              <>
                <AlertCircle className="h-3 w-3 text-red-600" /> Expired
              </>
            )}
            {member.status === 'REVOKED' && (
              <>
                <Trash2 className="h-3 w-3 text-[var(--text-muted)]" /> Revoked
              </>
            )}
            {member.usage30d.total > 0 && (
              <span>
                · 30d consumption: <strong>{member.usage30d.total}</strong> (
                {usageEntries.map(([u, n]) => `${prettyUnit(u)}: ${n}`).join(', ')})
              </span>
            )}
          </p>
        </div>
      </div>
      {!member.isOwner && member.status === 'ACTIVE' && (
        <Button
          variant="outline"
          size="sm"
          isLoading={busy}
          disabled={busy}
          onClick={async () => {
            const reason = await promptDialog({
              title: 'Force-revoke member',
              label: `Force-revoke ${member.name}? Optionally enter a reason for the audit log:`,
              defaultValue: '',
            });
            if (reason !== null) onRevoke(reason);
          }}
        >
          <Trash2 className="mr-1.5 h-4 w-4 text-[var(--error)]" /> Revoke
        </Button>
      )}
    </li>
  );
}

function summariseDetails(d: unknown): string {
  if (!d || typeof d !== 'object') return '';
  const keys = Object.keys(d as Record<string, unknown>);
  return keys
    .filter((k) => k !== 'requestId')
    .slice(0, 4)
    .map((k) => `${k}=${truncate(String((d as Record<string, unknown>)[k] ?? ''))}`)
    .join(' · ');
}

function truncate(s: string): string {
  return s.length > 40 ? s.slice(0, 37) + '…' : s;
}

function prettyUnit(unit: string): string {
  return unit
    .toLowerCase()
    .split('_')
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join(' ');
}
