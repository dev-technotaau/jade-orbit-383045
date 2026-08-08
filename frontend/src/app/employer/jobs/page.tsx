'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase,
  MapPin,
  Eye,
  Users,
  Clock,
  Plus,
  Pencil,
  Power,
  AlertCircle,
  MoreVertical,
  UserCheck,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Tabs from '@/components/ui/Tabs';
import Pagination from '@/components/ui/Pagination';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import Dropdown from '@/components/ui/Dropdown';
import { showToast } from '@/components/ui/Toast';
import Tooltip from '@/components/ui/Tooltip';
import { useEntitlements } from '@/hooks/use-entitlements';
import { useUpgradeModal } from '@/components/billing/UpgradeModal';
import { jobService } from '@/services/job.service';
import { ROUTES } from '@/constants/routes';
import { QUERY_KEYS, PAGINATION } from '@/constants/config';
import { JOB_STATUS_LABELS, JOB_TYPE_LABELS, WORK_MODE_LABELS } from '@/constants/enums';
import { formatRelativeDate, formatSalaryRange } from '@/lib/utils';
import { formatSalaryAsLPA } from '@/utils/format';
import type { Job } from '@/types/job';
import type { ApiError } from '@/types/api';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const statusBadgeMap: Record<string, BadgeVariant> = {
  OPEN: 'success',
  CLOSED: 'neutral',
  DRAFT: 'warning',
  EXPIRED: 'error',
};

const statusTabs = [
  { key: 'ALL', label: 'All' },
  ...Object.entries(JOB_STATUS_LABELS).map(([key, label]) => ({ key, label })),
];

export default function MyJobsPage() {
  const queryClient = useQueryClient();
  const { remaining, allocated, hasFeature } = useEntitlements();
  const upgrade = useUpgradeModal();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGINATION.JOBS_PER_PAGE);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [deactivateTarget, setDeactivateTarget] = useState<string | null>(null);

  // Job-post quota state — drives the upsell banner. Hidden when the user
  // has plenty of capacity left or has urgent_hiring_badge (EMP_PREMIUM).
  const jobPostsRemaining = remaining('JOB_POST');
  const jobPostsAllocated = allocated('JOB_POST');
  const isPremium = hasFeature('feature.urgent_hiring_badge');
  const showJobQuotaUpsell = !isPremium && jobPostsAllocated > 0 && jobPostsRemaining === 0;

  const serverStatus = statusFilter === 'ALL' ? undefined : statusFilter;
  const { data, isLoading } = useQuery({
    queryKey: [...QUERY_KEYS.JOBS.MY_JOBS, page, pageSize, serverStatus],
    queryFn: () => jobService.getMyJobs(page, pageSize, serverStatus),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => jobService.deactivateJob(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.JOBS.MY_JOBS });
      showToast.success('Job deactivated successfully');
      setDeactivateTarget(null);
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to deactivate job');
    },
  });

  const jobs = data?.data?.items || [];
  const pagination = data?.data;

  const handleDeactivate = () => {
    if (!deactivateTarget) return;
    deactivateMutation.mutate(deactivateTarget);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <DashboardLayout requiredRole={['EMPLOYER']}>
      <div className="space-y-6">
        {/* Job-post quota upsell — shown when employer is at the cap */}
        {showJobQuotaUpsell && (
          <button
            type="button"
            onClick={() => upgrade.open({ feature: 'feature.urgent_hiring_badge' })}
            // Shared upsell-banner visual language — see candidate page
            // for the rationale; white-on-saturated-amber for highest
            // perceived contrast on warm marketing CTAs.
            className="group flex w-full items-start gap-3 rounded-xl bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 p-4 text-left shadow-sm transition-all hover:from-amber-600 hover:via-amber-700 hover:to-orange-700 hover:shadow-md dark:from-amber-700 dark:via-amber-800 dark:to-orange-800"
          >
            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-white/20 text-white shadow-inner ring-1 ring-white/30 backdrop-blur-sm">
              <Plus className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-white">
                You&apos;ve used all {jobPostsAllocated} job post
                {jobPostsAllocated === 1 ? '' : 's'} on your plan
              </p>
              <p className="mt-0.5 text-sm text-white/90">
                Upgrade to Premium for 3 job posts (30 days each), top search visibility, urgent
                hiring badge and 20 CV unlocks.
              </p>
            </div>
            <span className="hidden items-center gap-1 self-center rounded-lg bg-white px-3 py-1.5 text-sm font-semibold whitespace-nowrap text-amber-700 shadow-sm transition-colors group-hover:bg-amber-50 sm:inline-flex">
              Upgrade
            </span>
          </button>
        )}
        {upgrade.modal}

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">My Jobs</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Manage your posted job listings</p>
          </div>
          <Tooltip content="Create a new job listing">
            <Link href={ROUTES.EMPLOYER.POST_JOB}>
              <Button leftIcon={<Plus className="h-4 w-4" />} tooltip="Create a new job listing">
                Post New Job
              </Button>
            </Link>
          </Tooltip>
        </div>

        {/* Status Tabs */}
        <div className="overflow-x-auto">
          <Tabs
            tabs={statusTabs}
            activeTab={statusFilter}
            onChange={(key) => {
              setStatusFilter(key);
              setPage(1);
            }}
          />
        </div>

        {/* Jobs List */}
        <div className="space-y-3">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}>
                <Skeleton variant="card" />
              </Card>
            ))
          ) : jobs.length > 0 ? (
            jobs.map((job) => (
              <JobCard key={job.id} job={job} onDeactivate={() => setDeactivateTarget(job.id)} />
            ))
          ) : (
            <EmptyState
              icon={Briefcase}
              title={
                statusFilter === 'ALL'
                  ? 'No jobs posted yet'
                  : `No ${JOB_STATUS_LABELS[statusFilter] || statusFilter} jobs`
              }
              description="Post your first job to start receiving applications from top candidates."
              action={
                <Tooltip content="Create your first job listing">
                  <Link href={ROUTES.EMPLOYER.POST_JOB}>
                    <Button
                      size="sm"
                      leftIcon={<Plus className="h-4 w-4" />}
                      tooltip="Post your first job"
                    >
                      Post a Job
                    </Button>
                  </Link>
                </Tooltip>
              }
            />
          )}
        </div>

        {/* Pagination */}
        {pagination && pagination.total > 0 && (
          <Pagination
            currentPage={page}
            totalPages={pagination.totalPages}
            onPageChange={handlePageChange}
            totalItems={pagination.total}
            pageSize={pageSize}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        )}

        {/* Deactivate Confirmation Modal */}
        <Modal
          isOpen={!!deactivateTarget}
          onClose={() => setDeactivateTarget(null)}
          title="Deactivate Job"
          size="sm"
          footer={
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setDeactivateTarget(null)}
                tooltip="Cancel deactivation"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeactivate}
                isLoading={deactivateMutation.isPending}
                tooltip="Confirm job deactivation"
              >
                Deactivate
              </Button>
            </div>
          }
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-[var(--warning)]" />
            <p className="text-sm text-[var(--text-secondary)]">
              Are you sure you want to deactivate this job? It will no longer be visible to
              candidates and no new applications will be accepted.
            </p>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}

function JobCard({ job, onDeactivate }: { job: Job; onDeactivate: () => void }) {
  const badgeVariant = statusBadgeMap[job.status] || 'neutral';

  const dropdownItems = [
    {
      label: 'View Details',
      onClick: () => {
        window.location.href = ROUTES.EMPLOYER.JOB_DETAIL(job.id);
      },
      icon: Eye,
    },
    {
      label: 'Edit Job',
      onClick: () => {
        window.location.href = ROUTES.EMPLOYER.JOB_EDIT(job.id);
      },
      icon: Pencil,
      disabled: job.status === 'CLOSED' || job.status === 'EXPIRED',
    },
    {
      label: 'View Applications',
      onClick: () => {
        window.location.href = ROUTES.EMPLOYER.JOB_APPLICATIONS(job.id);
      },
      icon: Users,
    },
    { label: '', onClick: () => {}, separator: true },
    {
      label: 'Deactivate',
      onClick: onDeactivate,
      icon: Power,
      destructive: true,
      disabled: job.status !== 'OPEN',
    },
  ];

  return (
    <Card className="transition-shadow hover:shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
              <Briefcase className="h-5 w-5 text-[var(--text-muted)]" />
            </div>
            <div className="min-w-0">
              <Tooltip content="View job details">
                <Link
                  href={ROUTES.EMPLOYER.JOB_DETAIL(job.id)}
                  className="hover:text-primary font-medium text-[var(--text)] transition-colors"
                >
                  {job.title}
                </Link>
              </Tooltip>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
                {job.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {job.location}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" /> {job.views} views
                </span>
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" /> {job._applicationCount ?? 0} applications
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Posted {formatRelativeDate(job.createdAt)}
                </span>
                {job.numberOfOpenings && (
                  <span className="flex items-center gap-1">
                    <UserCheck className="h-3 w-3" /> {job._hiredCount ?? 0}/{job.numberOfOpenings}{' '}
                    filled
                  </span>
                )}
              </div>
              {(job.salaryMin || job.salaryMax) && (
                <p className="mt-1 text-xs text-[var(--text)]">
                  {(job.currency || 'INR').toUpperCase() === 'INR' && job.salaryType === 'ANNUAL'
                    ? formatSalaryAsLPA(job.salaryMin, job.salaryMax)
                    : formatSalaryRange(job.salaryMin, job.salaryMax, job.currency)}
                  {job.salaryNegotiable && (
                    <span className="ml-1 text-[var(--success)]">(Negotiable)</span>
                  )}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant={badgeVariant} size="sm">
                  {JOB_STATUS_LABELS[job.status] || job.status}
                </Badge>
                {job.type && (
                  <Badge variant="info" size="sm">
                    {JOB_TYPE_LABELS[job.type] || job.type}
                  </Badge>
                )}
                {job.workMode && (
                  <Badge variant="neutral" size="sm">
                    {WORK_MODE_LABELS[job.workMode] || job.workMode}
                  </Badge>
                )}
                {job.isConfidential && (
                  <Badge variant="warning" size="sm">
                    Confidential
                  </Badge>
                )}
                {job.isFeatured && (
                  <Badge variant="success" size="sm">
                    Featured
                  </Badge>
                )}
                {job.scheduledPublishAt && job.status === 'DRAFT' && (
                  <Badge variant="info" size="sm">
                    Scheduled
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Tooltip content="View job details">
            <Link href={ROUTES.EMPLOYER.JOB_DETAIL(job.id)}>
              <Button variant="outline" size="sm" tooltip="View job details">
                View
              </Button>
            </Link>
          </Tooltip>
          <Tooltip content="Edit this job listing">
            <Link href={ROUTES.EMPLOYER.JOB_EDIT(job.id)}>
              <Button
                variant="ghost"
                size="sm"
                disabled={job.status === 'CLOSED' || job.status === 'EXPIRED'}
                tooltip="Edit job listing"
              >
                Edit
              </Button>
            </Link>
          </Tooltip>
          <Dropdown
            trigger={
              <Tooltip content="More actions">
                <button
                  type="button"
                  className="cursor-pointer rounded-lg p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </Tooltip>
            }
            items={dropdownItems}
            align="right"
          />
        </div>
      </div>
    </Card>
  );
}
