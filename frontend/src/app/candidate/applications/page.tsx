'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Briefcase, Building2, Clock, MapPin, ChevronRight, AlertCircle } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Tabs from '@/components/ui/Tabs';
import Pagination from '@/components/ui/Pagination';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import Tooltip from '@/components/ui/Tooltip';
import Modal from '@/components/ui/Modal';
import RatingBadge from '@/components/reviews/RatingBadge';
import { showToast } from '@/components/ui/Toast';
import { useAppliedJobs, useWithdrawApplication } from '@/hooks/use-jobs';
import { ROUTES } from '@/constants/routes';
import { APPLICATION_STATUS_LABELS, APPLICATION_STATUS_COLORS } from '@/constants/enums';
import { formatRelativeDate, formatSalaryRange } from '@/lib/utils';
import { PAGINATION } from '@/constants/config';
import type { JobApplication } from '@/types/job';
import type { ApiError } from '@/types/api';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const statusColorMap: Record<string, BadgeVariant> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'error',
  neutral: 'neutral',
};

const statusTabs = [
  { key: 'ALL', label: 'All' },
  { key: 'APPLIED', label: 'Applied' },
  { key: 'VIEWED', label: 'Viewed' },
  { key: 'SHORTLISTED', label: 'Shortlisted' },
  { key: 'SELECTED', label: 'Selected' },
  { key: 'OFFERED', label: 'Offered' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'WITHDRAWN', label: 'Withdrawn' },
];

export default function ApplicationsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGINATION.APPLICATIONS_PER_PAGE);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [withdrawTarget, setWithdrawTarget] = useState<string | null>(null);

  const serverStatus = statusFilter === 'ALL' ? undefined : statusFilter;
  const { data, isLoading } = useAppliedJobs(page, pageSize, serverStatus);
  const withdrawMutation = useWithdrawApplication();

  const applications = data?.data?.items || [];
  const pagination = data?.data;
  const filtered = applications;

  const handleWithdraw = async () => {
    if (!withdrawTarget) return;
    try {
      await withdrawMutation.mutateAsync(withdrawTarget);
      showToast.success('Application withdrawn');
      setWithdrawTarget(null);
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Failed to withdraw');
    }
  };

  return (
    <DashboardLayout requiredRole={['CANDIDATE']}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">My Applications</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Track the status of your job applications
          </p>
        </div>

        {/* Status Tabs */}
        <div className="overflow-x-auto">
          <Tabs
            tabs={statusTabs}
            activeTab={statusFilter}
            onChange={(tab) => {
              setStatusFilter(tab);
              setPage(1);
            }}
          />
        </div>

        {/* Applications List */}
        <div className="space-y-3">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}>
                <Skeleton variant="card" />
              </Card>
            ))
          ) : filtered.length > 0 ? (
            filtered.map((app) => (
              <ApplicationCard
                key={app.id}
                application={app}
                onWithdraw={() => setWithdrawTarget(app.id)}
              />
            ))
          ) : (
            <EmptyState
              icon={Briefcase}
              title={
                statusFilter === 'ALL'
                  ? 'No applications yet'
                  : `No ${APPLICATION_STATUS_LABELS[statusFilter] || statusFilter} applications`
              }
              description="Apply to jobs to see your applications here."
              action={
                <Link href={ROUTES.CANDIDATE.JOBS}>
                  <Button size="sm" tooltip="Browse available jobs">
                    Browse Jobs
                  </Button>
                </Link>
              }
            />
          )}
        </div>

        {pagination && pagination.total > 0 && (
          <Pagination
            currentPage={page}
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

        {/* Withdraw Modal */}
        <Modal
          isOpen={!!withdrawTarget}
          onClose={() => setWithdrawTarget(null)}
          title="Withdraw Application"
          size="sm"
          footer={
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setWithdrawTarget(null)}
                tooltip="Cancel withdrawal"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleWithdraw}
                isLoading={withdrawMutation.isPending}
                tooltip="Confirm withdrawal"
              >
                Withdraw
              </Button>
            </div>
          }
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-[var(--warning)]" />
            <p className="text-sm text-[var(--text-secondary)]">
              Are you sure you want to withdraw this application? This action cannot be undone and
              the employer will be notified.
            </p>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}

function ApplicationCard({
  application,
  onWithdraw,
}: {
  application: JobApplication;
  onWithdraw: () => void;
}) {
  const job = application.job;
  const badgeColor =
    statusColorMap[APPLICATION_STATUS_COLORS[application.status] || 'neutral'] || 'neutral';
  const canWithdraw = ['APPLIED', 'VIEWED', 'SHORTLISTED', 'SELECTED'].includes(application.status);

  return (
    <Card className="transition-shadow hover:shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
            {job?.company?.logo ? (
              <img
                src={job.company.logo}
                alt={job.company?.companyName || 'Company logo'}
                className="h-9 w-9 rounded-md object-contain"
              />
            ) : (
              <Building2 className="h-5 w-5 text-[var(--text-muted)]" />
            )}
          </div>
          <div className="min-w-0">
            <Tooltip content={`View details for ${job?.title || 'this job'}`}>
              <Link
                href={job ? ROUTES.CANDIDATE.JOB_DETAIL(job.id) : '#'}
                className="hover:text-primary font-medium text-[var(--text)] transition-colors"
              >
                {job?.title || 'Job Position'}
              </Link>
            </Tooltip>
            <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-muted)]">
              <span>{job?.company?.companyName}</span>
              {((job?.company as { totalReviews?: number })?.totalReviews ?? 0) > 0 && (
                <RatingBadge
                  rating={(job?.company as { averageRating?: number })?.averageRating ?? 0}
                  count={(job?.company as { totalReviews?: number })?.totalReviews ?? 0}
                  size="xs"
                  href={
                    (job?.company as { slug?: string | null })?.slug
                      ? `/companies/${encodeURIComponent((job?.company as { slug?: string | null }).slug!)}/reviews`
                      : undefined
                  }
                />
              )}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
              {job?.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {job.location}
                </span>
              )}
              {job && (
                <span className="flex items-center gap-1">
                  {formatSalaryRange(job.salaryMin, job.salaryMax, job.currency)}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> Applied {formatRelativeDate(application.appliedAt)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <Badge variant={badgeColor}>
            {APPLICATION_STATUS_LABELS[application.status] || application.status}
          </Badge>
          {canWithdraw && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onWithdraw}
              className="text-[var(--text-muted)]"
              tooltip="Withdraw this application"
            >
              Withdraw
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
