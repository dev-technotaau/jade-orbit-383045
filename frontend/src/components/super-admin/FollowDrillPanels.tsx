'use client';

/**
 * Reusable super-admin follow drill-down panels.
 *
 *   - <UserFollowingPanel userId> — shows companies a candidate follows.
 *     Drop this into /super-admin/users/[id] to give the admin a
 *     follow-graph view per user.
 *
 *   - <CompanyFollowersPanel companyId> — shows candidates following
 *     a company. Drop into /super-admin/teams/[companyId].
 *
 * Both panels are paginated, lazy-load on first render via TanStack
 * Query, and expose a heading + count badge.
 */

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { Building2, Heart, ShieldCheck, Users } from 'lucide-react';
import Card from '@/components/ui/Card';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import Avatar from '@/components/ui/Avatar';
import Pagination from '@/components/ui/Pagination';
import { isOptimisableImageHost } from '@/lib/image-host';
import { superAdminFollowsService } from '@/services/super-admin-follows.service';

const PAGE_SIZE = 10;

export function UserFollowingPanel({ userId }: { userId: string }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE);
  const { data, isLoading } = useQuery({
    queryKey: ['super-admin-user-following', userId, page, pageSize],
    queryFn: () => superAdminFollowsService.userFollowing(userId, page, pageSize),
    staleTime: 60 * 1000,
  });

  return (
    <Card padding="md">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">
          <Heart className="text-primary h-4 w-4" />
          Following
          {data?.pagination?.total != null && (
            <span className="rounded-full bg-[var(--primary)]/10 px-2 py-0.5 text-xs font-bold text-[var(--primary)]">
              {data.pagination.total.toLocaleString('en-IN')}
            </span>
          )}
        </h2>
      </header>
      {isLoading ? (
        <Skeleton variant="rect" height={200} />
      ) : !data?.items?.length ? (
        <EmptyState title="Not following anyone" />
      ) : (
        <>
          <ul role="list" className="space-y-2">
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
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
          {data.pagination.totalPages > 0 && (
            <div className="mt-3">
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
            </div>
          )}
        </>
      )}
    </Card>
  );
}

export function CompanyFollowersPanel({ companyId }: { companyId: string }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE);
  const { data, isLoading } = useQuery({
    queryKey: ['super-admin-company-followers', companyId, page, pageSize],
    queryFn: () => superAdminFollowsService.companyFollowers(companyId, page, pageSize),
    staleTime: 60 * 1000,
  });

  return (
    <Card padding="md">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">
          <Users className="text-primary h-4 w-4" />
          Followers
          {data?.pagination?.total != null && (
            <span className="rounded-full bg-[var(--primary)]/10 px-2 py-0.5 text-xs font-bold text-[var(--primary)]">
              {data.pagination.total.toLocaleString('en-IN')}
            </span>
          )}
        </h2>
      </header>
      {isLoading ? (
        <Skeleton variant="rect" height={200} />
      ) : !data?.items?.length ? (
        <EmptyState title="No followers yet" />
      ) : (
        <>
          <ul role="list" className="space-y-2">
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
                  {u.isSuspended && (
                    <span className="shrink-0 rounded-full bg-[var(--error)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--error)]">
                      Suspended
                    </span>
                  )}
                  <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
                    {new Date(row.followedAt).toLocaleDateString('en-IN', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
          {data.pagination.totalPages > 0 && (
            <div className="mt-3">
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
            </div>
          )}
        </>
      )}
    </Card>
  );
}
