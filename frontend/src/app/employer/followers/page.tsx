'use client';

/**
 * /employer/followers — list of candidates following the employer's
 * company.
 *
 * Paginated. Click a follower's row to see their full profile in the
 * employer-side candidate detail view (subject to existing CV-unlock
 * gating). Followed-at timestamp surfaces freshness.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSocket } from '@/hooks/use-socket';
import { Users, Briefcase, MapPin, Building2, Sparkles } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import Pagination from '@/components/ui/Pagination';
import Avatar from '@/components/ui/Avatar';
import Select from '@/components/ui/Select';
import { isOptimisableImageHost } from '@/lib/image-host';
import { companyFollowService } from '@/services/company-follow.service';
import { ROUTES } from '@/constants/routes';
import { formatRelativeDate } from '@/lib/utils';

const PAGE_SIZE = 20;

export default function EmployerFollowersPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'recent' | 'name'>('recent');
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const { data, isLoading } = useQuery({
    queryKey: ['employer-followers', page, debouncedQ, sort, pageSize],
    queryFn: () =>
      companyFollowService.listFollowers(page, pageSize, {
        q: debouncedQ || undefined,
        sort,
      }),
    staleTime: 60 * 1000,
  });

  // Real-time updates — when a candidate follows the company, the
  // backend emits 'company:follower:added' on the user-room socket.
  // Invalidate the list query so the new follower appears without a
  // manual refresh. The notification bell + sidebar badge also
  // refresh via the bell's own polling (no extra wiring needed).
  const queryClient = useQueryClient();
  const { socket } = useSocket();
  useEffect(() => {
    if (!socket) return;
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['employer-followers'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    };
    socket.on('company:follower:added', handler);
    return () => {
      socket.off('company:follower:added', handler);
    };
  }, [socket, queryClient]);

  const items = data?.items ?? [];
  const pagination = data?.pagination;

  return (
    <DashboardLayout requiredRole={['EMPLOYER']}>
      <div className="space-y-6">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]">
              <Users className="text-primary h-6 w-6" />
              Followers
              {pagination && (
                <span className="bg-primary/10 text-primary rounded-full px-2.5 py-0.5 text-sm font-bold">
                  {pagination.total.toLocaleString('en-IN')}
                </span>
              )}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Candidates following your company. They get notified the moment you post a new job.
            </p>
          </div>
        </header>

        {/* Search + sort row — visible whenever there's data or a
            filter is active (so admins aren't trapped on a 0-result
            search page). */}
        {(items.length > 0 || debouncedQ.length > 0 || sort !== 'recent') && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name, email, or headline"
              className="flex-1 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:outline-none"
            />
            <Select
              value={sort}
              onChange={(val) => {
                setSort(val as typeof sort);
                setPage(1);
              }}
              options={[
                { value: 'recent', label: 'Recently followed' },
                { value: 'name', label: 'Name (A → Z)' },
              ]}
              size="sm"
              clearable={false}
              className="w-52 sm:shrink-0"
            />
          </div>
        )}

        {isLoading ? (
          <ul role="list" className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} role="listitem">
                <Skeleton variant="rect" height={88} />
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          debouncedQ.length > 0 || sort !== 'recent' ? (
            <EmptyState
              title="No matches"
              description="No followers match your search. Try clearing the filter."
            />
          ) : (
            <EmptyState
              icon={Sparkles}
              title="No followers yet"
              description="Once candidates follow your company, they'll appear here. Tip — keep your profile fresh and post regularly to attract followers."
              action={
                <Link
                  href={ROUTES.EMPLOYER.PROFILE}
                  className="bg-primary inline-flex items-center gap-1 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-hover)]"
                >
                  Improve company profile
                </Link>
              }
            />
          )
        ) : (
          <>
            <ul role="list" className="space-y-3">
              {items.map((row) => {
                const u = row.user;
                const fullName =
                  [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || 'Candidate';
                const headline =
                  u.candidateProfile?.headline ||
                  [u.candidateProfile?.currentRole, u.candidateProfile?.currentCompany]
                    .filter(Boolean)
                    .join(' at ') ||
                  null;
                const detailHref = `/employer/candidates/${u.id}`;
                return (
                  <li key={u.id} role="listitem">
                    <Card padding="md">
                      <Link href={detailHref} className="flex items-start gap-3 transition-colors">
                        {u.avatar ? (
                          <Image
                            src={u.avatar}
                            alt={fullName}
                            width={48}
                            height={48}
                            sizes="48px"
                            unoptimized={!isOptimisableImageHost(u.avatar)}
                            className="h-12 w-12 shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <Avatar firstName={u.firstName} lastName={u.lastName} size="md" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-[var(--text)]">{fullName}</p>
                          {headline && (
                            <p className="line-clamp-1 text-xs text-[var(--text-secondary)]">
                              {headline}
                            </p>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[var(--text-muted)]">
                            {u.candidateProfile?.experienceYears != null && (
                              <span className="flex items-center gap-0.5">
                                <Briefcase className="h-3 w-3" />
                                {u.candidateProfile.experienceYears} yrs
                              </span>
                            )}
                            {u.candidateProfile?.currentLocation && (
                              <span className="flex items-center gap-0.5">
                                <MapPin className="h-3 w-3" />
                                {u.candidateProfile.currentLocation}
                              </span>
                            )}
                            {u.candidateProfile?.currentCompany && (
                              <span className="flex items-center gap-0.5">
                                <Building2 className="h-3 w-3" />
                                {u.candidateProfile.currentCompany}
                              </span>
                            )}
                            <span>Followed {formatRelativeDate(row.followedAt)}</span>
                          </div>
                        </div>
                      </Link>
                    </Card>
                  </li>
                );
              })}
            </ul>
            {pagination && pagination.total > 0 && (
              <Pagination
                currentPage={pagination.page}
                totalPages={pagination.totalPages}
                onPageChange={setPage}
                totalItems={pagination.total}
                pageSize={pageSize}
                onPageSizeChange={(s) => {
                  setPageSize(s);
                  setPage(1);
                }}
              />
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
