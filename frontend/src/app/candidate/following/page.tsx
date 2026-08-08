'use client';

/**
 * /candidate/following — companies the candidate follows.
 *
 * Three tabs:
 *   - Companies — paginated list of followed companies (unfollow inline)
 *   - Jobs      — aggregated job feed from all followed companies
 *   - Updates   — notifications scoped to follow-related categories
 *                 ("New jobs from followed companies" + "Followed
 *                 company updates")
 *
 * URL-driven tab via ?tab=jobs|updates. Pagination per tab via ?page=N.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Briefcase,
  Bell,
  ShieldCheck,
  MapPin,
  X,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Tabs from '@/components/ui/Tabs';
import EmptyState from '@/components/ui/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import Pagination from '@/components/ui/Pagination';
import Badge from '@/components/ui/Badge';
import Select from '@/components/ui/Select';
import PublicJobCard from '@/components/job-search/PublicJobCard';
import RatingBadge from '@/components/reviews/RatingBadge';
import { isOptimisableImageHost } from '@/lib/image-host';
import { companyFollowService } from '@/services/company-follow.service';
import { showToast } from '@/components/ui/Toast';
import { useNotifications, useMarkAsRead } from '@/hooks/use-notifications';
import { formatRelativeDate } from '@/lib/utils';
import type { Job } from '@/types/job';

type FollowingTab = 'companies' | 'jobs' | 'updates';

const TAB_DEFS = [
  { key: 'companies', label: 'Companies', icon: Building2 },
  { key: 'jobs', label: 'Jobs', icon: Briefcase },
  { key: 'updates', label: 'Updates', icon: Bell },
];

const PAGE_SIZE = 20;

export default function CandidateFollowingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = (searchParams?.get('tab') ?? 'companies') as FollowingTab;
  const activeTab: FollowingTab = ['companies', 'jobs', 'updates'].includes(tabParam)
    ? tabParam
    : 'companies';
  const [page, setPage] = useState(Math.max(1, Number(searchParams?.get('page') ?? '1') || 1));

  const handleTabChange = (next: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (next === 'companies') params.delete('tab');
    else params.set('tab', next);
    params.delete('page');
    setPage(1);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : '?', { scroll: false });
  };

  return (
    <DashboardLayout requiredRole={['CANDIDATE']}>
      <div className="space-y-6">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Following</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Companies you follow, the jobs they post, and updates from them — all in one place.
            </p>
          </div>
        </header>

        <Tabs
          tabs={TAB_DEFS}
          activeTab={activeTab}
          onChange={(v) => handleTabChange(v as FollowingTab)}
        />

        {activeTab === 'companies' && <CompaniesTab page={page} onPageChange={setPage} />}
        {activeTab === 'jobs' && <JobsTab page={page} onPageChange={setPage} />}
        {activeTab === 'updates' && <UpdatesTab page={page} onPageChange={setPage} />}
      </div>
    </DashboardLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Companies tab
// ─────────────────────────────────────────────────────────────────────
function CompaniesTab({ page, onPageChange }: { page: number; onPageChange: (n: number) => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'recent' | 'name' | 'open_jobs'>('recent');
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE);
  // Debounce the search input — 300ms is the sweet spot between
  // responsiveness and not hammering the backend on every keystroke.
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const { data, isLoading } = useQuery({
    queryKey: ['candidate-following', 'companies', page, pageSize, debouncedQ, sort],
    queryFn: () =>
      companyFollowService.listFollowing(page, pageSize, {
        q: debouncedQ || undefined,
        sort,
      }),
    staleTime: 60 * 1000,
  });

  const unfollowMut = useMutation({
    mutationFn: (companyIdOrSlug: string) => companyFollowService.unfollow(companyIdOrSlug),
    onSuccess: () => {
      showToast.success('Unfollowed');
      qc.invalidateQueries({ queryKey: ['candidate-following'] });
      qc.invalidateQueries({ queryKey: ['company-follow-status'] });
    },
    onError: () => {
      showToast.error('Could not unfollow. Please try again.');
    },
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="rect" height={140} />
        ))}
      </div>
    );
  }

  const items = data?.items ?? [];
  const pagination = data?.pagination;
  const isFiltering = debouncedQ.length > 0 || sort !== 'recent';

  return (
    <>
      {/* Search + sort row — visible whenever there's data OR when
          a filter is active (so users aren't trapped after a search
          returns 0 results). Hidden in true zero-state to keep the
          empty-state CTA prominent. */}
      {(items.length > 0 || isFiltering) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              onPageChange(1);
            }}
            placeholder="Search by name or industry"
            className="flex-1 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:outline-none"
          />
          <Select
            value={sort}
            onChange={(val) => {
              setSort(val as typeof sort);
              onPageChange(1);
            }}
            options={[
              { value: 'recent', label: 'Recently followed' },
              { value: 'name', label: 'Name (A → Z)' },
              { value: 'open_jobs', label: 'Most open jobs' },
            ]}
            size="sm"
            clearable={false}
            className="w-52 sm:shrink-0"
          />
        </div>
      )}

      {items.length === 0 ? (
        isFiltering ? (
          <EmptyState
            title="No matches"
            description="No followed companies match your search. Try clearing the filter."
          />
        ) : (
          <EmptyState
            icon={Sparkles}
            title="You're not following any companies yet"
            description="Click Follow on any company profile to track new jobs and updates here."
            action={
              <Link
                href="/companies"
                className="bg-primary inline-flex items-center gap-1 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-hover)]"
              >
                Browse companies
              </Link>
            }
          />
        )
      ) : (
        <>
          <ul role="list" className="grid gap-4 sm:grid-cols-2">
            {items.map((row) => {
              const c = row.company;
              const href = c.slug ? `/companies/${c.slug}` : `/company/${c.id}`;
              return (
                <li key={c.id} role="listitem">
                  <Card padding="md">
                    <div className="flex gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-tertiary)]">
                        {c.logo ? (
                          <Image
                            src={c.logo}
                            alt={c.companyName}
                            width={40}
                            height={40}
                            sizes="40px"
                            unoptimized={!isOptimisableImageHost(c.logo)}
                            className="h-10 w-10 rounded-lg object-contain"
                          />
                        ) : (
                          <Building2 className="h-6 w-6 text-[var(--text-muted)]" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1">
                          <Link
                            href={href}
                            className="hover:text-primary line-clamp-1 text-sm font-bold text-[var(--text)]"
                          >
                            {c.companyName}
                          </Link>
                          {c.isVerified && (
                            <ShieldCheck
                              className="h-3.5 w-3.5 shrink-0 text-[var(--success)]"
                              aria-label="Verified"
                            />
                          )}
                          {((c as { totalReviews?: number }).totalReviews ?? 0) > 0 && (
                            <RatingBadge
                              rating={(c as { averageRating?: number }).averageRating ?? 0}
                              count={(c as { totalReviews?: number }).totalReviews ?? 0}
                              size="xs"
                              href={
                                c.slug
                                  ? `/companies/${encodeURIComponent(c.slug)}/reviews`
                                  : undefined
                              }
                            />
                          )}
                        </div>
                        {c.tagline && (
                          <p className="line-clamp-1 text-xs text-[var(--text-muted)]">
                            {c.tagline}
                          </p>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[var(--text-muted)]">
                          {c.industry && <span>{c.industry}</span>}
                          {(c.city || c.headquarters) && (
                            <span className="flex items-center gap-0.5">
                              <MapPin className="h-3 w-3" />
                              {c.city ?? c.headquarters}
                            </span>
                          )}
                          <span>Followed {formatRelativeDate(row.followedAt)}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          {c.openJobsCount > 0 ? (
                            <Link
                              href={`${href}?tab=jobs`}
                              className="bg-primary/10 text-primary hover:bg-primary/20 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                            >
                              <Briefcase className="h-3 w-3" />
                              {c.openJobsCount} open {c.openJobsCount === 1 ? 'job' : 'jobs'}
                            </Link>
                          ) : (
                            <Badge variant="neutral" size="sm">
                              No open jobs
                            </Badge>
                          )}
                          <button
                            type="button"
                            onClick={() => unfollowMut.mutate(c.slug ?? c.id)}
                            disabled={unfollowMut.isPending}
                            className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--error)]"
                            aria-label={`Unfollow ${c.companyName}`}
                          >
                            <X className="h-3 w-3" />
                            Unfollow
                          </button>
                        </div>
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
          {pagination && (
            <Pagination
              currentPage={pagination.page}
              totalPages={pagination.totalPages}
              onPageChange={onPageChange}
              pageSize={pageSize}
              onPageSizeChange={(s) => {
                setPageSize(s);
                onPageChange(1);
              }}
            />
          )}
        </>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Jobs tab — aggregated job feed
// ─────────────────────────────────────────────────────────────────────
function JobsTab({ page, onPageChange }: { page: number; onPageChange: (n: number) => void }) {
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE);
  const { data, isLoading } = useQuery({
    queryKey: ['candidate-following', 'jobs', page, pageSize],
    queryFn: () => companyFollowService.listFollowedJobs(page, pageSize),
    staleTime: 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="rect" height={140} />
        ))}
      </div>
    );
  }

  const items = data?.items ?? [];
  const pagination = data?.pagination;

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Briefcase}
        title="No jobs from followed companies yet"
        description="When companies you follow post new openings, they'll show up here."
        action={
          <Link
            href="/companies"
            className="bg-primary inline-flex items-center gap-1 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-hover)]"
          >
            Browse companies
          </Link>
        }
      />
    );
  }

  return (
    <>
      <ul role="list" className="space-y-3">
        {items.map((j) => (
          <li key={j.id} role="listitem">
            <PublicJobCard
              job={
                {
                  ...j,
                  experienceMin: j.experienceMin ?? 0,
                } as unknown as Job & {
                  company: { id: string; slug: string | null; companyName: string };
                }
              }
              isGuest={false}
            />
          </li>
        ))}
      </ul>
      {pagination && (
        <Pagination
          currentPage={pagination.page}
          totalPages={pagination.totalPages}
          onPageChange={onPageChange}
          pageSize={pageSize}
          onPageSizeChange={(s) => {
            setPageSize(s);
            onPageChange(1);
          }}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Updates tab — notifications scoped to follow categories
// ─────────────────────────────────────────────────────────────────────
function UpdatesTab({ page, onPageChange }: { page: number; onPageChange: (n: number) => void }) {
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE);
  const { data, isLoading } = useNotifications({
    page,
    limit: pageSize,
    category: 'followed_company_new_job',
  });
  const markRead = useMarkAsRead();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="rect" height={80} />
        ))}
      </div>
    );
  }

  const notifications = data?.data?.items ?? [];
  const pagination = data?.data;

  if (notifications.length === 0) {
    return (
      <EmptyState
        icon={Bell}
        title="No updates yet"
        description="When companies you follow post new jobs, you'll see notifications here."
      />
    );
  }

  return (
    <>
      <ul role="list" className="space-y-2">
        {notifications.map((n) => (
          <li key={n.id} role="listitem">
            <Card padding="md" className={n.isRead ? '' : 'border-l-4 border-l-[var(--primary)]'}>
              <div className="flex items-start gap-3">
                <span className="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                  <Briefcase className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--text)]">{n.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{n.message}</p>
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                    {formatRelativeDate(n.createdAt)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {n.link && (
                    <Link
                      href={n.link}
                      onClick={() => !n.isRead && markRead.mutate(n.id)}
                      className="text-primary inline-flex items-center gap-0.5 text-xs font-semibold hover:underline"
                    >
                      View <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                  {!n.isRead && (
                    <button
                      type="button"
                      onClick={() => markRead.mutate(n.id)}
                      className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text)]"
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {pagination && (
        <Pagination
          currentPage={pagination.page}
          totalPages={pagination.totalPages}
          onPageChange={onPageChange}
          pageSize={pageSize}
          onPageSizeChange={(s) => {
            setPageSize(s);
            onPageChange(1);
          }}
        />
      )}
    </>
  );
}
