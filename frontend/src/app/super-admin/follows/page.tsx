'use client';

/**
 * Super-admin overview of the candidate↔company follow graph.
 *
 *   - Three big-number cards: totalFollows, uniqueFollowers,
 *     uniqueFollowedCompanies
 *   - Top 20 followed companies (table) — click → drill-down panel
 *   - Top 20 following candidates (table) — click → drill-down panel
 *
 * Drill-down lives inline as a side modal-ish panel so the admin can
 * scan a follower list without losing the overview.
 */

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { Heart, Users, Building2, ShieldCheck, TrendingUp, Eye } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import Avatar from '@/components/ui/Avatar';
import Pagination from '@/components/ui/Pagination';
import Tooltip from '@/components/ui/Tooltip';
import { isOptimisableImageHost } from '@/lib/image-host';
import { superAdminFollowsService } from '@/services/super-admin-follows.service';

const PAGE_SIZE = 20;

export default function SuperAdminFollowsPage() {
  const [drillCompany, setDrillCompany] = useState<string | null>(null);
  const [drillUser, setDrillUser] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['super-admin-follows-stats'],
    queryFn: () => superAdminFollowsService.stats(),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <DashboardLayout requiredRole={['ADMIN', 'SUPER_ADMIN']} requiredPermission="follows.view">
      <div className="space-y-6">
        <header>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]">
            <Heart className="text-primary h-6 w-6" />
            Follow graph
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Audit candidate ↔ company follow relationships across the platform. Read-only —
            super-admins cannot follow / unfollow on a user&apos;s behalf.
          </p>
        </header>

        {/* Totals */}
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            icon={Heart}
            label="Total follows"
            value={data?.totals.totalFollows}
            isLoading={isLoading}
          />
          <StatCard
            icon={Users}
            label="Unique followers"
            value={data?.totals.uniqueFollowers}
            isLoading={isLoading}
          />
          <StatCard
            icon={Building2}
            label="Unique companies followed"
            value={data?.totals.uniqueFollowedCompanies}
            isLoading={isLoading}
          />
        </div>

        {/* Top followed companies + Top following candidates */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card padding="md">
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-[var(--text)]">
              <TrendingUp className="text-primary h-4 w-4" />
              Top followed companies
            </h2>
            {isLoading ? (
              <Skeleton variant="rect" height={300} />
            ) : !data?.topFollowedCompanies?.length ? (
              <EmptyState
                title="No follows yet"
                description="Stats will populate once candidates start following companies."
              />
            ) : (
              <ul role="list" className="space-y-2">
                {data.topFollowedCompanies.map((row, i) => {
                  const c = row.company;
                  return (
                    <li
                      key={c.id}
                      className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-2.5"
                    >
                      <span className="w-5 text-right text-xs font-bold text-[var(--text-muted)]">
                        {i + 1}
                      </span>
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
                        {c.logo ? (
                          <Image
                            src={c.logo}
                            alt=""
                            width={28}
                            height={28}
                            sizes="28px"
                            unoptimized={!isOptimisableImageHost(c.logo)}
                            className="h-7 w-7 rounded-md object-contain"
                          />
                        ) : (
                          <Building2 className="h-4 w-4 text-[var(--text-muted)]" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <Link
                            href={c.slug ? `/companies/${c.slug}` : `/super-admin/teams/${c.id}`}
                            className="hover:text-primary truncate text-sm font-semibold text-[var(--text)]"
                          >
                            {c.companyName ?? '—'}
                          </Link>
                          {c.isVerified && (
                            <ShieldCheck
                              className="h-3 w-3 text-[var(--success)]"
                              aria-label="Verified"
                            />
                          )}
                        </div>
                        {c.industry && (
                          <p className="truncate text-[11px] text-[var(--text-muted)]">
                            {c.industry}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-full bg-[var(--primary)]/10 px-2.5 py-0.5 text-xs font-bold text-[var(--primary)]">
                        {row.followers.toLocaleString('en-IN')}
                      </span>
                      <Tooltip content="View followers">
                        <button
                          type="button"
                          onClick={() => setDrillCompany(c.id)}
                          className="rounded-full p-1 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
                          aria-label="View followers"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </Tooltip>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card padding="md">
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-[var(--text)]">
              <TrendingUp className="text-primary h-4 w-4" />
              Top following candidates
            </h2>
            {isLoading ? (
              <Skeleton variant="rect" height={300} />
            ) : !data?.topFollowingCandidates?.length ? (
              <EmptyState
                title="No follows yet"
                description="Stats will populate once candidates start following companies."
              />
            ) : (
              <ul role="list" className="space-y-2">
                {data.topFollowingCandidates.map((row, i) => {
                  const u = row.user;
                  const fullName =
                    [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email;
                  return (
                    <li
                      key={u.id}
                      className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-2.5"
                    >
                      <span className="w-5 text-right text-xs font-bold text-[var(--text-muted)]">
                        {i + 1}
                      </span>
                      <Avatar
                        src={u.avatar}
                        firstName={u.firstName}
                        lastName={u.lastName}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/super-admin/users/${u.id}`}
                          className="hover:text-primary truncate text-sm font-semibold text-[var(--text)]"
                        >
                          {fullName}
                        </Link>
                        {u.candidateProfile?.headline && (
                          <p className="truncate text-[11px] text-[var(--text-muted)]">
                            {u.candidateProfile.headline}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-full bg-[var(--primary)]/10 px-2.5 py-0.5 text-xs font-bold text-[var(--primary)]">
                        {row.following.toLocaleString('en-IN')}
                      </span>
                      <Tooltip content="View following">
                        <button
                          type="button"
                          onClick={() => setDrillUser(u.id)}
                          className="rounded-full p-1 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
                          aria-label="View following"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </Tooltip>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {drillCompany && (
        <CompanyFollowersDrillModal
          companyId={drillCompany}
          onClose={() => setDrillCompany(null)}
        />
      )}
      {drillUser && (
        <UserFollowingDrillModal userId={drillUser} onClose={() => setDrillUser(null)} />
      )}
    </DashboardLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Drill-down modals
// ─────────────────────────────────────────────────────────────────────

function CompanyFollowersDrillModal({
  companyId,
  onClose,
}: {
  companyId: string;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE);
  const { data, isLoading } = useQuery({
    queryKey: ['super-admin-company-followers', companyId, page, pageSize],
    queryFn: () => superAdminFollowsService.companyFollowers(companyId, page, pageSize),
    staleTime: 60 * 1000,
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={data?.company ? `Followers · ${data.company.companyName}` : 'Followers'}
      size="xl"
    >
      {isLoading ? (
        <Skeleton variant="rect" height={400} />
      ) : !data?.items?.length ? (
        <EmptyState title="No followers" />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-muted)]">
            {data.pagination.total.toLocaleString('en-IN')} total followers
          </p>
          <ul data-lenis-prevent role="list" className="max-h-[60vh] space-y-2 overflow-y-auto">
            {data.items.map((row) => {
              const u = row.user;
              const fullName =
                [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email;
              return (
                <li
                  key={u.id}
                  className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-2.5"
                >
                  <Avatar src={u.avatar} firstName={u.firstName} lastName={u.lastName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/super-admin/users/${u.id}`}
                      className="hover:text-primary truncate text-sm font-semibold text-[var(--text)]"
                    >
                      {fullName}
                    </Link>
                    {u.candidateProfile?.headline && (
                      <p className="truncate text-[11px] text-[var(--text-muted)]">
                        {u.candidateProfile.headline}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
                    {new Date(row.followedAt).toLocaleDateString('en-IN', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
          {data.pagination.totalPages > 0 && (
            <Pagination
              currentPage={data.pagination.page}
              totalPages={data.pagination.totalPages}
              onPageChange={setPage}
              totalItems={data.pagination.total}
              pageSize={pageSize}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setPage(1);
              }}
            />
          )}
        </div>
      )}
    </Modal>
  );
}

function UserFollowingDrillModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE);
  const { data, isLoading } = useQuery({
    queryKey: ['super-admin-user-following', userId, page, pageSize],
    queryFn: () => superAdminFollowsService.userFollowing(userId, page, pageSize),
    staleTime: 60 * 1000,
  });

  const u = data?.user;
  const userLabel = u
    ? [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email
    : 'User';

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={data?.user ? `Following · ${userLabel}` : 'Following'}
      size="xl"
    >
      {isLoading ? (
        <Skeleton variant="rect" height={400} />
      ) : !data?.items?.length ? (
        <EmptyState title="Not following anyone" />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-muted)]">
            Following {data.pagination.total.toLocaleString('en-IN')} companies
          </p>
          <ul data-lenis-prevent role="list" className="max-h-[60vh] space-y-2 overflow-y-auto">
            {data.items.map((row) => {
              const c = row.company;
              return (
                <li
                  key={c.id}
                  className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-2.5"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
                    {c.logo ? (
                      <Image
                        src={c.logo}
                        alt=""
                        width={28}
                        height={28}
                        sizes="28px"
                        unoptimized={!isOptimisableImageHost(c.logo)}
                        className="h-7 w-7 rounded-md object-contain"
                      />
                    ) : (
                      <Building2 className="h-4 w-4 text-[var(--text-muted)]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <Link
                        href={c.slug ? `/companies/${c.slug}` : `/super-admin/teams/${c.id}`}
                        className="hover:text-primary truncate text-sm font-semibold text-[var(--text)]"
                      >
                        {c.companyName}
                      </Link>
                      {c.isVerified && (
                        <ShieldCheck
                          className="h-3 w-3 text-[var(--success)]"
                          aria-label="Verified"
                        />
                      )}
                    </div>
                    {c.industry && (
                      <p className="truncate text-[11px] text-[var(--text-muted)]">{c.industry}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
                    {c.openJobsCount > 0 ? `${c.openJobsCount} open` : 'No open jobs'}
                  </span>
                  <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
                    {new Date(row.followedAt).toLocaleDateString('en-IN', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
          {data.pagination.totalPages > 0 && (
            <Pagination
              currentPage={data.pagination.page}
              totalPages={data.pagination.totalPages}
              onPageChange={setPage}
              totalItems={data.pagination.total}
              pageSize={pageSize}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setPage(1);
              }}
            />
          )}
        </div>
      )}
    </Modal>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  isLoading,
}: {
  icon: typeof Heart;
  label: string;
  value: number | undefined;
  isLoading: boolean;
}) {
  return (
    <Card padding="md">
      <div className="flex items-start gap-3">
        <span className="bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wider text-[var(--text-muted)] uppercase">
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold text-[var(--text)]">
            {isLoading ? '—' : (value ?? 0).toLocaleString('en-IN')}
          </p>
        </div>
      </div>
    </Card>
  );
}
