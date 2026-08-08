'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Bookmark,
  Building2,
  MapPin,
  Briefcase,
  Clock,
  BookmarkX,
  CheckCircle,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Tag from '@/components/ui/Tag';
import Pagination from '@/components/ui/Pagination';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import Tooltip from '@/components/ui/Tooltip';
import { showToast } from '@/components/ui/Toast';
import { useSavedJobs, useToggleSaveJob, useAppliedJobs } from '@/hooks/use-jobs';
import { ROUTES } from '@/constants/routes';
import { JOB_TYPE_LABELS, WORK_MODE_LABELS, FUNCTIONAL_AREA_LABELS } from '@/constants/enums';
import { formatSalaryRange, formatRelativeDate } from '@/lib/utils';
import { formatSalaryAsLPA } from '@/utils/format';
import { PAGINATION } from '@/constants/config';

export default function SavedJobsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGINATION.JOBS_PER_PAGE);
  const { data, isLoading } = useSavedJobs(page, pageSize);
  const toggleSave = useToggleSaveJob();

  // Track applied jobs
  const { data: appliedJobsData } = useAppliedJobs(1, 500);
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const appliedItems = appliedJobsData?.data?.items;
    if (appliedItems && appliedItems.length > 0) {
      queueMicrotask(() =>
        setAppliedJobIds(new Set(appliedItems.map((a: { jobId: string }) => a.jobId))),
      );
    }
  }, [appliedJobsData]);

  const jobs = data?.data?.items || [];
  const pagination = data?.data;

  const handleUnsave = async (jobId: string) => {
    try {
      await toggleSave.mutateAsync(jobId);
      showToast.success('Job removed from saved');
    } catch {
      showToast.error('Failed to remove job');
    }
  };

  return (
    <DashboardLayout requiredRole={['CANDIDATE']}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Saved Jobs</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Jobs you&apos;ve bookmarked for later
          </p>
        </div>

        <div className="space-y-3">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}>
                <Skeleton variant="card" />
              </Card>
            ))
          ) : jobs.length > 0 ? (
            jobs.map((job) => (
              <Card key={job.id} className="transition-shadow hover:shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-1 gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
                      {job.isConfidential ? (
                        <Briefcase className="h-5 w-5 text-[var(--text-muted)]" />
                      ) : job.company?.logo ? (
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
                      <Tooltip content={`View details for ${job.title}`}>
                        <Link
                          href={ROUTES.CANDIDATE.JOB_DETAIL(job.id)}
                          className="hover:text-primary font-medium text-[var(--text)] transition-colors"
                        >
                          {job.title}
                        </Link>
                      </Tooltip>
                      <p className="text-sm text-[var(--text-muted)]">
                        {job.isConfidential ? 'Confidential Company' : job.company?.companyName}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {job.location}
                        </span>
                        <span className="flex items-center gap-1">
                          <Briefcase className="h-3 w-3" /> {job.experienceMin}-
                          {job.experienceMax || job.experienceMin}+ yrs
                        </span>
                        <span>
                          {(job.currency || 'INR').toUpperCase() === 'INR' &&
                          job.salaryType === 'ANNUAL'
                            ? formatSalaryAsLPA(job.salaryMin, job.salaryMax)
                            : formatSalaryRange(job.salaryMin, job.salaryMax, job.currency)}
                          {job.salaryNegotiable && (
                            <span className="ml-1 text-[var(--success)]">(Negotiable)</span>
                          )}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {formatRelativeDate(job.createdAt)}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {job.type && (
                          <Badge variant="info" size="sm">
                            {JOB_TYPE_LABELS[job.type]}
                          </Badge>
                        )}
                        {job.workMode && (
                          <Badge variant="neutral" size="sm">
                            {WORK_MODE_LABELS[job.workMode]}
                          </Badge>
                        )}
                        {job.isFeatured && (
                          <Badge variant="secondary" size="sm">
                            Featured
                          </Badge>
                        )}
                        {job.isPwdFriendly && (
                          <Badge variant="success" size="sm">
                            PwD Friendly
                          </Badge>
                        )}
                        {job.visaSponsorshipAvailable && (
                          <Badge variant="info" size="sm">
                            Visa Sponsorship
                          </Badge>
                        )}
                      </div>
                      {(job.skillsRequired?.length ?? 0) > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {job.skillsRequired.slice(0, 4).map((s) => (
                            <Tag key={s} label={s} size="sm" variant="primary" />
                          ))}
                          {job.skillsRequired.length > 4 && (
                            <Tag label={`+${job.skillsRequired.length - 4}`} size="sm" />
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {appliedJobIds.has(job.id) && (
                      <Tooltip content="View your application">
                        <Link
                          href={ROUTES.CANDIDATE.APPLICATIONS}
                          className="flex items-center gap-1 rounded-lg bg-[var(--success)]/10 px-2.5 py-1.5 text-xs font-medium text-[var(--success)] transition-colors hover:bg-[var(--success)]/20"
                        >
                          <CheckCircle className="h-3 w-3" /> Applied
                        </Link>
                      </Tooltip>
                    )}
                    <Link href={ROUTES.CANDIDATE.JOB_DETAIL(job.id)}>
                      <Button size="sm" tooltip="View job details">
                        View
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleUnsave(job.id)}
                      disabled={toggleSave.isPending}
                      className="text-[var(--error)]"
                      tooltip="Remove from saved jobs"
                    >
                      <BookmarkX className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <EmptyState
              icon={Bookmark}
              title="No saved jobs"
              description="Save jobs you're interested in to review them later."
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
      </div>
    </DashboardLayout>
  );
}
