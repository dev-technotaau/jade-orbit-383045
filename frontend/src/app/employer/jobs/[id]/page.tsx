'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase,
  MapPin,
  Eye,
  Users,
  Star,
  Clock,
  Pencil,
  Power,
  AlertCircle,
  UserCheck,
  UserX,
  Calendar,
  ChevronRight,
  Sparkles,
  WandSparkles,
  Copy,
  Shield,
  Accessibility,
  Globe,
  FileText,
  CheckCircle,
} from 'lucide-react';
import DOMPurify from 'isomorphic-dompurify';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Breadcrumb from '@/components/ui/Breadcrumb';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import Modal from '@/components/ui/Modal';
import Tag from '@/components/ui/Tag';
import Tooltip from '@/components/ui/Tooltip';
import { showToast } from '@/components/ui/Toast';
import { jobService } from '@/services/job.service';
import { useRecommendedCandidates } from '@/hooks/use-recommendations';
import { ROUTES } from '@/constants/routes';
import { QUERY_KEYS, PAGINATION } from '@/constants/config';
import {
  JOB_STATUS_LABELS,
  JOB_TYPE_LABELS,
  WORK_MODE_LABELS,
  SHIFT_TYPE_LABELS,
  EXPERIENCE_LEVEL_LABELS,
  SALARY_TYPE_LABELS,
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_COLORS,
  FUNCTIONAL_AREA_LABELS,
  NOTICE_PERIOD_PREFERENCE_LABELS,
  GENDER_PREFERENCE_LABELS,
  DRIVING_LICENSE_TYPE_LABELS,
  POSTING_VISIBILITY_LABELS,
  APPLY_METHOD_LABELS,
  EDUCATION_LEVEL_LABELS,
  SPECIFIC_DEGREE_LABELS,
  URGENCY_LEVEL_LABELS,
} from '@/constants/enums';
import { formatRelativeDate, formatDate, formatSalaryRange } from '@/lib/utils';
import { formatSalaryAsLPA } from '@/utils/format';
import type { ApiError } from '@/types/api';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const statusBadgeMap: Record<string, BadgeVariant> = {
  OPEN: 'success',
  CLOSED: 'neutral',
  DRAFT: 'warning',
  EXPIRED: 'error',
};

const statusColorMap: Record<string, BadgeVariant> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'error',
  neutral: 'neutral',
};

export default function JobDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);

  const { data: jobData, isLoading: jobLoading } = useQuery({
    queryKey: QUERY_KEYS.JOBS.DETAIL(id),
    queryFn: () => jobService.getJob(id),
    enabled: !!id,
  });

  const { data: applicationsData, isLoading: appsLoading } = useQuery({
    queryKey: [...QUERY_KEYS.JOBS.APPLICATIONS(id), 1, 5],
    queryFn: () => jobService.getJobApplications(id, 1, 5),
    enabled: !!id,
  });

  const { data: aiCandidatesData } = useRecommendedCandidates(id);
  const aiCandidates = aiCandidatesData?.data || [];

  const deactivateMutation = useMutation({
    mutationFn: () => jobService.deactivateJob(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.JOBS.DETAIL(id) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.JOBS.MY_JOBS });
      showToast.success('Job deactivated successfully');
      setShowDeactivateModal(false);
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to deactivate job');
    },
  });

  /* Offline hires — the only way to represent a seat filled outside Hire Adda
     (walk-in, referral, agency), which has no application row to mark HIRED.
     Absolute count, so repeated saves are idempotent. The server clamps it
     against on-platform hires and auto-closes the job when it tips to full. */
  const [offlineHiresInput, setOfflineHiresInput] = useState<string>('');
  const offlineHiresMutation = useMutation({
    mutationFn: (count: number) => jobService.updateOfflineHires(id, count),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.JOBS.DETAIL(id) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.JOBS.MY_JOBS });
      const closed = res.data?.job?.status === 'CLOSED';
      showToast.success(
        closed
          ? 'Offline hires saved — all openings are filled, so this job has been closed.'
          : 'Offline hires updated',
      );
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to update offline hires');
    },
  });

  const cloneMutation = useMutation({
    mutationFn: () => jobService.cloneJob(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.JOBS.MY_JOBS });
      showToast.success('Job cloned as draft');
      router.push(ROUTES.EMPLOYER.JOB_EDIT(res.data.id));
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to clone job');
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ applicationId, status }: { applicationId: string; status: string }) =>
      jobService.updateApplicationStatus(applicationId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.JOBS.APPLICATIONS(id) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.JOBS.DETAIL(id) });
      showToast.success('Status updated');
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to update status');
    },
  });

  const job = jobData?.data;
  const applications = applicationsData?.data?.items || [];
  const applicationsPagination = applicationsData?.data;

  // Use statusCounts from API response if available, otherwise estimate from visible applications
  const statusCounts = (applicationsData?.data as unknown as Record<string, unknown>)
    ?.statusCounts as Record<string, number> | undefined;
  const shortlistedCount =
    statusCounts?.SHORTLISTED ?? applications.filter((a) => a.status === 'SHORTLISTED').length;
  const selectedCount =
    statusCounts?.SELECTED ?? applications.filter((a) => a.status === 'SELECTED').length;
  const rejectedCount =
    statusCounts?.REJECTED ?? applications.filter((a) => a.status === 'REJECTED').length;

  if (jobLoading) {
    return (
      <DashboardLayout requiredRole={['EMPLOYER']}>
        <div className="space-y-6">
          <Skeleton variant="line" width="200px" height="32px" />
          <Skeleton variant="rect" height="200px" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} variant="rect" height="100px" />
            ))}
          </div>
          <Skeleton variant="rect" height="300px" />
        </div>
      </DashboardLayout>
    );
  }

  if (!job) {
    return (
      <DashboardLayout requiredRole={['EMPLOYER']}>
        <div className="flex flex-col items-center justify-center py-20">
          <Briefcase className="h-12 w-12 text-[var(--text-muted)]" />
          <h2 className="mt-4 text-lg font-semibold text-[var(--text)]">Job not found</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            The job you are looking for does not exist.
          </p>
          <Tooltip content="Return to your job listings">
            <Link href={ROUTES.EMPLOYER.MY_JOBS} className="mt-4">
              <Button variant="outline" size="sm" tooltip="Go back to My Jobs">
                Back to My Jobs
              </Button>
            </Link>
          </Tooltip>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout requiredRole={['EMPLOYER']}>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb
          items={[
            { label: 'Dashboard', href: ROUTES.EMPLOYER.DASHBOARD },
            { label: 'My Jobs', href: ROUTES.EMPLOYER.MY_JOBS },
            { label: job.title },
          ]}
        />

        {/* Job Header */}
        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-xl font-bold text-[var(--text)]">{job.title}</h1>
                <Badge variant={statusBadgeMap[job.status] || 'neutral'}>
                  {JOB_STATUS_LABELS[job.status] || job.status}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[var(--text-muted)]">
                {job.location && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" /> {job.location}
                  </span>
                )}
                {job.type && (
                  <span className="flex items-center gap-1.5">
                    <Briefcase className="h-4 w-4" /> {JOB_TYPE_LABELS[job.type] || job.type}
                  </span>
                )}
                {job.workMode && (
                  <span className="flex items-center gap-1.5">
                    {WORK_MODE_LABELS[job.workMode] || job.workMode}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <Eye className="h-4 w-4" /> {job.views} views
                </span>
                <span className="flex items-center gap-1.5">
                  <Users className="h-4 w-4" /> {job._applicationCount ?? 0} applications
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" /> Posted {formatRelativeDate(job.createdAt)}
                </span>
              </div>
              {job.salaryMin || job.salaryMax ? (
                <p className="mt-2 text-sm font-medium text-[var(--text)]">
                  {formatSalaryRange(job.salaryMin, job.salaryMax, job.currency)}
                  {job.salaryType === 'ANNUAL'
                    ? ' / year'
                    : job.salaryType === 'MONTHLY'
                      ? ' / month'
                      : job.salaryType === 'HOURLY'
                        ? ' / hour'
                        : ''}
                  {(job.currency || 'INR').toUpperCase() === 'INR' &&
                    job.salaryType === 'ANNUAL' && (
                      <span className="ml-2 text-xs text-[var(--text-muted)]">
                        ({formatSalaryAsLPA(job.salaryMin, job.salaryMax)})
                      </span>
                    )}
                  {job.salaryNegotiable && (
                    <span className="ml-2 text-xs text-[var(--success)]">Negotiable</span>
                  )}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {job.isConfidential && <Badge variant="warning">Confidential</Badge>}
                {job.scheduledPublishAt && job.status === 'DRAFT' && (
                  <Badge variant="info">Scheduled: {formatDate(job.scheduledPublishAt)}</Badge>
                )}
                {job.referenceCode && <Badge variant="neutral">Ref: {job.referenceCode}</Badge>}
                {job.postingVisibility !== 'PUBLIC' && (
                  <Badge variant="info">{POSTING_VISIBILITY_LABELS[job.postingVisibility]}</Badge>
                )}
                {job.applyMethod !== 'IN_PLATFORM' && (
                  <Badge variant="neutral">{APPLY_METHOD_LABELS[job.applyMethod]}</Badge>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Tooltip content="Find candidates that match this job">
                <Link
                  href={`${ROUTES.EMPLOYER.CANDIDATES}?${(() => {
                    const params = new URLSearchParams();
                    if (job.skillsRequired?.length)
                      params.set('skills', job.skillsRequired.join(','));
                    if (job.location) params.set('location', job.location);
                    if (job.experienceMin != null)
                      params.set('experienceMin', job.experienceMin.toString());
                    if (job.experienceMax != null)
                      params.set('experienceMax', job.experienceMax.toString());
                    if (job.experienceLevel) params.set('experienceLevel', job.experienceLevel);
                    if (job.educationRequired)
                      params.set('highestEducationLevel', job.educationRequired);
                    if (job.workMode) params.set('preferredWorkMode', job.workMode);
                    if (job.type) params.set('preferredJobType', job.type);
                    if (job.industry) params.set('industry', job.industry);
                    if (job.department) params.set('department', job.department);
                    return params.toString();
                  })()}`}
                >
                  <Button variant="primary" size="sm" leftIcon={<Users className="h-4 w-4" />}>
                    Find Candidates
                  </Button>
                </Link>
              </Tooltip>
              <Tooltip content="Clone this job as a new draft">
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Copy className="h-4 w-4" />}
                  onClick={() => cloneMutation.mutate()}
                  isLoading={cloneMutation.isPending}
                >
                  Clone
                </Button>
              </Tooltip>
              <Tooltip
                content={
                  job.status === 'CLOSED' || job.status === 'EXPIRED'
                    ? 'Cannot edit a closed or expired job'
                    : 'Edit job details'
                }
              >
                <Link href={ROUTES.EMPLOYER.JOB_EDIT(job.id)}>
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<Pencil className="h-4 w-4" />}
                    disabled={job.status === 'CLOSED' || job.status === 'EXPIRED'}
                  >
                    Edit
                  </Button>
                </Link>
              </Tooltip>
              <Tooltip
                content={
                  job.status !== 'OPEN'
                    ? 'Only open jobs can be deactivated'
                    : 'Close this job listing'
                }
              >
                <Button
                  variant="destructive"
                  size="sm"
                  leftIcon={<Power className="h-4 w-4" />}
                  onClick={() => setShowDeactivateModal(true)}
                  disabled={job.status !== 'OPEN'}
                >
                  Deactivate
                </Button>
              </Tooltip>
            </div>
          </div>
        </Card>

        {/* Vacancy tracker — visible whenever the job declares openings. Lets the
            employer record hires made off-platform, which is the only way those
            seats can ever be reflected: there is no application row to mark
            HIRED for a walk-in or referral. */}
        {job.numberOfOpenings != null && (
          <Card>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-[var(--text)]">Vacancies</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  <strong className="text-[var(--text)]">
                    {(job._hiredCount ?? 0) + (job.offlineHiresCount ?? 0)}
                  </strong>{' '}
                  of <strong className="text-[var(--text)]">{job.numberOfOpenings}</strong> filled
                  {' — '}
                  {job._hiredCount ?? 0} through Hire Adda, {job.offlineHiresCount ?? 0} offline.
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Only candidates you mark as <strong>Hired</strong> count automatically. Record
                  anyone hired outside Hire Adda here so the listing closes at the right time.
                </p>
              </div>
              <div className="flex shrink-0 items-end gap-2">
                <Input
                  label="Offline hires"
                  type="number"
                  min={0}
                  max={job.numberOfOpenings}
                  className="w-32"
                  value={
                    offlineHiresInput !== ''
                      ? offlineHiresInput
                      : String(job.offlineHiresCount ?? 0)
                  }
                  onChange={(e) => setOfflineHiresInput(e.target.value)}
                />
                <Button
                  size="sm"
                  isLoading={offlineHiresMutation.isPending}
                  disabled={
                    offlineHiresInput === '' ||
                    Number(offlineHiresInput) === (job.offlineHiresCount ?? 0)
                  }
                  onClick={() => {
                    const next = Number(offlineHiresInput);
                    if (!Number.isFinite(next) || next < 0) {
                      showToast.error('Enter a valid number of offline hires');
                      return;
                    }
                    offlineHiresMutation.mutate(next);
                  }}
                  tooltip="Save the number of hires made outside Hire Adda"
                >
                  Save
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* All Openings Filled Banner */}
        {job.status === 'OPEN' &&
          job.numberOfOpenings != null &&
          (job._hiredCount ?? 0) + (job.offlineHiresCount ?? 0) >= job.numberOfOpenings && (
            <Card className="border-[var(--warning)]/30 bg-[var(--warning-light)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 shrink-0 text-[var(--warning)]" />
                  <p className="text-sm text-[var(--text)]">
                    All <strong>{job.numberOfOpenings}</strong> opening
                    {job.numberOfOpenings > 1 ? 's have' : ' has'} been filled. Consider closing
                    this job to stop receiving new applications.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Power className="h-4 w-4" />}
                  onClick={() => setShowDeactivateModal(true)}
                  className="shrink-0"
                >
                  Close Job
                </Button>
              </div>
            </Card>
          )}

        {/* Quick Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--info-light)]">
                <Eye className="text-primary h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-[var(--text)]">{job.views}</p>
                <p className="text-xs text-[var(--text-muted)]">Total Views</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--info-light)]">
                <Users className="text-primary h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-[var(--text)]">
                  {applicationsPagination?.total ?? job._applicationCount ?? 0}
                </p>
                <p className="text-xs text-[var(--text-muted)]">Applications</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--success-light)]">
                <UserCheck className="h-5 w-5 text-[var(--success-dark)]" />
              </div>
              <div>
                <p className="text-2xl font-bold text-[var(--text)]">{shortlistedCount}</p>
                <p className="text-xs text-[var(--text-muted)]">Shortlisted</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--success-light)]">
                <Sparkles className="h-5 w-5 text-[var(--success-dark)]" />
              </div>
              <div>
                <p className="text-2xl font-bold text-[var(--text)]">{selectedCount}</p>
                <p className="text-xs text-[var(--text-muted)]">Selected</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--error-light)]">
                <UserX className="h-5 w-5 text-[var(--error-dark)]" />
              </div>
              <div>
                <p className="text-2xl font-bold text-[var(--text)]">{rejectedCount}</p>
                <p className="text-xs text-[var(--text-muted)]">Rejected</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Application Pipeline */}
        <Card>
          <h2 className="mb-4 text-base font-semibold text-[var(--text)]">Application Pipeline</h2>
          <div className="flex items-center gap-1 overflow-x-auto">
            {[
              { label: 'Applied', status: 'APPLIED', color: 'bg-blue-500' },
              { label: 'Shortlisted', status: 'SHORTLISTED', color: 'bg-yellow-500' },
              { label: 'Selected', status: 'SELECTED', color: 'bg-emerald-500' },
              { label: 'Offered', status: 'OFFERED', color: 'bg-purple-500' },
              { label: 'Hired', status: 'HIRED', color: 'bg-green-600' },
            ].map((stage, i) => {
              const count =
                statusCounts?.[stage.status] ??
                applications.filter((a) => a.status === stage.status).length;
              return (
                <div key={stage.status} className="flex items-center">
                  {i > 0 && <div className="mx-1 h-px w-4 bg-[var(--border)]" />}
                  <Tooltip content={`View ${stage.label} applications`}>
                    <Link
                      href={`${ROUTES.EMPLOYER.JOB_APPLICATIONS(job.id)}?status=${stage.status}`}
                      className="hover:border-primary/30 flex flex-col items-center rounded-lg border border-[var(--border)] px-4 py-3 transition-colors hover:bg-[var(--bg-secondary)]"
                    >
                      <div className={`mb-1 h-2 w-2 rounded-full ${stage.color}`} />
                      <p className="text-lg font-bold text-[var(--text)]">{count}</p>
                      <p className="text-[10px] whitespace-nowrap text-[var(--text-muted)]">
                        {stage.label}
                      </p>
                    </Link>
                  </Tooltip>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Job Details */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {/* Description */}
            {job.description && (
              <Card>
                <h2 className="mb-3 text-base font-semibold text-[var(--text)]">Description</h2>
                <div
                  className="prose prose-sm max-w-none text-sm text-[var(--text-secondary)]"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.description) }}
                />
              </Card>
            )}

            {/* Key Responsibilities */}
            {job.keyResponsibilities && (
              <Card>
                <h2 className="mb-3 text-base font-semibold text-[var(--text)]">
                  Key Responsibilities
                </h2>
                <div
                  className="prose prose-sm max-w-none text-sm text-[var(--text-secondary)]"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.keyResponsibilities) }}
                />
              </Card>
            )}

            {/* Requirements */}
            {job.requirements && (
              <Card>
                <h2 className="mb-3 text-base font-semibold text-[var(--text)]">Requirements</h2>
                <div
                  className="prose prose-sm max-w-none text-sm text-[var(--text-secondary)]"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.requirements) }}
                />
              </Card>
            )}

            {/* Benefits */}
            {job.benefits && (
              <Card>
                <h2 className="mb-3 text-base font-semibold text-[var(--text)]">Benefits</h2>
                <div
                  className="prose prose-sm max-w-none text-sm text-[var(--text-secondary)]"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.benefits) }}
                />
                {job.relocationAssistance && (
                  <p className="mt-3 flex items-center gap-1 text-sm text-[var(--success)]">
                    <CheckCircle className="h-4 w-4" /> Relocation assistance available
                  </p>
                )}
              </Card>
            )}

            {/* Interview Process */}
            {job.interviewProcess && (
              <Card>
                <h2 className="mb-3 text-base font-semibold text-[var(--text)]">
                  Interview Process
                </h2>
                <p className="text-sm whitespace-pre-wrap text-[var(--text-secondary)]">
                  {job.interviewProcess}
                </p>
              </Card>
            )}
          </div>

          {/* Sidebar Info */}
          <div className="space-y-6">
            {/* Skills */}
            {(job.skillsRequired?.length ?? 0) > 0 && (
              <Card>
                <h2 className="mb-3 text-base font-semibold text-[var(--text)]">Required Skills</h2>
                <div className="flex flex-wrap gap-1.5">
                  {job.skillsRequired.map((skill) => (
                    <Tag key={skill} label={skill} size="sm" variant="primary" />
                  ))}
                </div>
              </Card>
            )}

            {/* Tags */}
            {job.tags.length > 0 && (
              <Card>
                <h2 className="mb-3 text-base font-semibold text-[var(--text)]">Keywords</h2>
                <div className="flex flex-wrap gap-1.5">
                  {job.tags.map((tag) => (
                    <Tag key={tag} label={tag} size="sm" />
                  ))}
                </div>
              </Card>
            )}

            {/* Job Info */}
            <Card>
              <h2 className="mb-3 text-base font-semibold text-[var(--text)]">Job Information</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Experience</span>
                  <span className="text-[var(--text)]">
                    {job.experienceMin}-{job.experienceMax || job.experienceMin}+ years
                  </span>
                </div>
                {job.experienceLevel && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Level</span>
                    <span className="text-[var(--text)]">
                      {EXPERIENCE_LEVEL_LABELS[job.experienceLevel]}
                    </span>
                  </div>
                )}
                {job.numberOfOpenings && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Openings</span>
                    <span className="text-[var(--text)]">
                      {(job._hiredCount ?? 0) + (job.offlineHiresCount ?? 0)}/{job.numberOfOpenings}{' '}
                      filled
                    </span>
                  </div>
                )}
                {job.industry && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Industry</span>
                    <span className="text-[var(--text)]">{job.industry}</span>
                  </div>
                )}
                {job.department && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Department</span>
                    <span className="text-[var(--text)]">{job.department}</span>
                  </div>
                )}
                {job.functionalArea && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Functional Area</span>
                    <span className="text-[var(--text)]">
                      {FUNCTIONAL_AREA_LABELS[job.functionalArea]}
                    </span>
                  </div>
                )}
                {job.roleCategory && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Role Category</span>
                    <span className="text-[var(--text)]">{job.roleCategory}</span>
                  </div>
                )}
                {job.educationRequired && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Education</span>
                    <span className="text-[var(--text)]">
                      {EDUCATION_LEVEL_LABELS[job.educationRequired]}
                    </span>
                  </div>
                )}
                {job.preferredEducationField && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Education Field</span>
                    <span className="text-[var(--text)]">{job.preferredEducationField}</span>
                  </div>
                )}
                {job.ugRequired && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">UG Required</span>
                    <span className="text-[var(--text)]">
                      {EDUCATION_LEVEL_LABELS[job.ugRequired]}
                    </span>
                  </div>
                )}
                {job.pgRequired && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">PG Required</span>
                    <span className="text-[var(--text)]">
                      {EDUCATION_LEVEL_LABELS[job.pgRequired]}
                    </span>
                  </div>
                )}
                {job.shiftType && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Shift</span>
                    <span className="text-[var(--text)]">{SHIFT_TYPE_LABELS[job.shiftType]}</span>
                  </div>
                )}
                {job.isRemote && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Remote</span>
                    <span className="text-[var(--success)]">Yes</span>
                  </div>
                )}
                {job.travelRequired && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Travel</span>
                    <span className="text-[var(--text)]">Required</span>
                  </div>
                )}
                {job.genderPreference && job.genderPreference !== 'ANY' && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Gender Pref.</span>
                    <span className="text-[var(--text)]">
                      {GENDER_PREFERENCE_LABELS[job.genderPreference]}
                    </span>
                  </div>
                )}
                {job.drivingLicenseRequired && job.drivingLicenseRequired !== 'NONE' && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Driving License</span>
                    <span className="text-[var(--text)]">
                      {DRIVING_LICENSE_TYPE_LABELS[job.drivingLicenseRequired]}
                    </span>
                  </div>
                )}
                {(job.ageMin || job.ageMax) && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Age</span>
                    <span className="text-[var(--text)]">
                      {job.ageMin || '—'} – {job.ageMax || '—'} years
                    </span>
                  </div>
                )}
                {job.urgencyLevel && job.urgencyLevel !== 'NORMAL' && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Urgency</span>
                    <Badge
                      variant={
                        job.urgencyLevel === 'IMMEDIATE'
                          ? 'error'
                          : job.urgencyLevel === 'URGENT'
                            ? 'warning'
                            : 'neutral'
                      }
                      size="sm"
                    >
                      {URGENCY_LEVEL_LABELS[job.urgencyLevel]}
                    </Badge>
                  </div>
                )}
                {job.isFeatured && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Featured</span>
                    <span className="text-[var(--success)]">Yes</span>
                  </div>
                )}
                {job.applicationDeadline && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Deadline</span>
                    <span className="text-[var(--text)]">
                      {formatDate(job.applicationDeadline)}
                    </span>
                  </div>
                )}
                {job.expiresAt && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Expires</span>
                    <span className="text-[var(--text)]">{formatDate(job.expiresAt)}</span>
                  </div>
                )}
                {job.contactPerson && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Contact</span>
                    <span className="text-[var(--text)]">{job.contactPerson}</span>
                  </div>
                )}
                {job.contactEmail && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Contact Email</span>
                    <span className="text-[var(--text)]">{job.contactEmail}</span>
                  </div>
                )}
                {job.externalApplyUrl && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">External URL</span>
                    <Tooltip content="Open external application URL in new tab">
                      <a
                        href={job.externalApplyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary max-w-[180px] truncate"
                      >
                        {job.externalApplyUrl}
                      </a>
                    </Tooltip>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Created</span>
                  <span className="text-[var(--text)]">{formatDate(job.createdAt)}</span>
                </div>
              </div>
            </Card>

            {/* Enterprise Badges */}
            {(job.diversityTags.length > 0 ||
              job.isPwdFriendly ||
              job.visaSponsorshipAvailable ||
              job.backgroundCheckRequired ||
              job.passportRequired ||
              job.accommodationProvided) && (
              <Card>
                <h2 className="mb-3 text-base font-semibold text-[var(--text)]">
                  Inclusion & Requirements
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {job.isPwdFriendly && <Badge variant="success">PwD Friendly</Badge>}
                  {job.visaSponsorshipAvailable && <Badge variant="info">Visa Sponsorship</Badge>}
                  {job.accommodationProvided && <Badge variant="info">Accommodation</Badge>}
                  {job.backgroundCheckRequired && <Badge variant="warning">Background Check</Badge>}
                  {job.passportRequired && <Badge variant="warning">Passport Required</Badge>}
                  {job.diversityTags.map((tag) => (
                    <Badge key={tag} variant="neutral">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </Card>
            )}

            {/* Notice Period */}
            {job.noticePeriodPreference.length > 0 && (
              <Card>
                <h2 className="mb-3 text-base font-semibold text-[var(--text)]">Notice Period</h2>
                <div className="flex flex-wrap gap-1.5">
                  {job.noticePeriodPreference.map((np) => (
                    <Tag key={np} label={NOTICE_PERIOD_PREFERENCE_LABELS[np] || np} size="sm" />
                  ))}
                </div>
              </Card>
            )}

            {/* Specific Degrees */}
            {job.specificDegrees.length > 0 && (
              <Card>
                <h2 className="mb-3 text-base font-semibold text-[var(--text)]">
                  Specific Degrees
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {job.specificDegrees.map((d) => (
                    <Tag key={d} label={SPECIFIC_DEGREE_LABELS[d] || d} size="sm" />
                  ))}
                </div>
              </Card>
            )}

            {/* Additional Locations */}
            {job.additionalLocations.length > 0 && (
              <Card>
                <h2 className="mb-3 text-base font-semibold text-[var(--text)]">
                  Additional Locations
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {job.additionalLocations.map((loc) => (
                    <Tag key={loc} label={loc} size="sm" />
                  ))}
                </div>
              </Card>
            )}

            {/* Nice-to-Have Skills */}
            {(job.niceToHaveSkills?.length ?? 0) > 0 && (
              <Card>
                <h2 className="mb-3 text-base font-semibold text-[var(--text)]">
                  Nice-to-Have Skills
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {job.niceToHaveSkills.map((skill) => (
                    <Tag key={skill} label={skill} size="sm" />
                  ))}
                </div>
              </Card>
            )}

            {/* Certifications */}
            {(job.certificationsRequired?.length ?? 0) > 0 && (
              <Card>
                <h2 className="mb-3 text-base font-semibold text-[var(--text)]">
                  Certifications Required
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {job.certificationsRequired.map((cert) => (
                    <Tag key={cert} label={cert} size="sm" />
                  ))}
                </div>
              </Card>
            )}

            {/* Languages */}
            {(job.languagesRequired?.length ?? 0) > 0 && (
              <Card>
                <h2 className="mb-3 text-base font-semibold text-[var(--text)]">
                  Languages Required
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {job.languagesRequired.map((lang) => (
                    <Tag key={lang} label={lang} size="sm" />
                  ))}
                </div>
              </Card>
            )}

            {/* Job Perks */}
            {(job.jobPerks?.length ?? 0) > 0 && (
              <Card>
                <h2 className="mb-3 text-base font-semibold text-[var(--text)]">Job Perks</h2>
                <div className="flex flex-wrap gap-1.5">
                  {job.jobPerks.map((perk) => (
                    <Tag key={perk} label={perk} size="sm" variant="primary" />
                  ))}
                </div>
              </Card>
            )}

            {/* Degree Specializations */}
            {(job.degreeSpecializations?.length ?? 0) > 0 && (
              <Card>
                <h2 className="mb-3 text-base font-semibold text-[var(--text)]">
                  Degree Specializations
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {job.degreeSpecializations.map((spec) => (
                    <Tag key={spec} label={spec} size="sm" />
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>

        {/* Screening Questions */}
        {(job.screeningQuestions?.length ?? 0) > 0 && (
          <Card>
            <h2 className="mb-3 text-base font-semibold text-[var(--text)]">
              Screening Questions ({job.screeningQuestions!.length})
            </h2>
            <div className="space-y-3">
              {job.screeningQuestions!.map((q, idx) => (
                <div key={q.id} className="rounded-lg border border-[var(--border)] p-3">
                  <p className="text-sm font-medium text-[var(--text)]">
                    {idx + 1}. {q.question}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <span>{q.questionType}</span>
                    {q.isRequired && (
                      <Badge variant="warning" size="sm">
                        Required
                      </Badge>
                    )}
                    {q.isDealBreaker && (
                      <Badge variant="error" size="sm">
                        Deal Breaker
                      </Badge>
                    )}
                    {q.idealAnswer && <span>Ideal: {q.idealAnswer}</span>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Walk-in Details */}
        {job.isWalkIn && job.walkInVenue && (
          <Card>
            <h2 className="mb-3 text-base font-semibold text-[var(--text)]">Walk-in Details</h2>
            <div className="space-y-2 text-sm">
              {job.walkInStartDate && (
                <p>
                  <span className="text-[var(--text-muted)]">Date:</span>{' '}
                  {formatDate(job.walkInStartDate)}
                  {job.walkInEndDate ? ` – ${formatDate(job.walkInEndDate)}` : ''}
                </p>
              )}
              {job.walkInTime && (
                <p>
                  <span className="text-[var(--text-muted)]">Time:</span> {job.walkInTime}
                </p>
              )}
              <p>
                <span className="text-[var(--text-muted)]">Venue:</span> {job.walkInVenue}
              </p>
              {job.walkInContactPerson && (
                <p>
                  <span className="text-[var(--text-muted)]">Contact:</span>{' '}
                  {job.walkInContactPerson}{' '}
                  {job.walkInContactPhone && `(${job.walkInContactPhone})`}
                </p>
              )}
              {job.walkInInstructions && (
                <p>
                  <span className="text-[var(--text-muted)]">Instructions:</span>{' '}
                  {job.walkInInstructions}
                </p>
              )}
            </div>
          </Card>
        )}

        {/* Bond Details */}
        {job.bondDetails && (
          <Card>
            <h2 className="mb-3 text-base font-semibold text-[var(--text)]">
              Bond / Service Agreement
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">{job.bondDetails}</p>
          </Card>
        )}

        {/* AI Recommended Candidates */}
        {aiCandidates.length > 0 && (
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <WandSparkles className="text-primary h-5 w-5" />
                <h2 className="text-base font-semibold text-[var(--text)]">
                  AI Recommended Candidates
                </h2>
              </div>
              <Tooltip content="View all AI-matched candidates">
                <Link
                  href={`${ROUTES.EMPLOYER.CANDIDATES}?${(() => {
                    const params = new URLSearchParams();
                    if (job.skillsRequired?.length)
                      params.set('skills', job.skillsRequired.join(','));
                    if (job.location) params.set('location', job.location);
                    if (job.experienceMin != null)
                      params.set('experienceMin', job.experienceMin.toString());
                    if (job.experienceMax != null)
                      params.set('experienceMax', job.experienceMax.toString());
                    if (job.experienceLevel) params.set('experienceLevel', job.experienceLevel);
                    if (job.educationRequired)
                      params.set('highestEducationLevel', job.educationRequired);
                    if (job.workMode) params.set('preferredWorkMode', job.workMode);
                    if (job.type) params.set('preferredJobType', job.type);
                    if (job.industry) params.set('industry', job.industry);
                    if (job.department) params.set('department', job.department);
                    return params.toString();
                  })()}`}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    rightIcon={<ChevronRight className="h-4 w-4" />}
                    tooltip="Browse all matching candidates"
                  >
                    View All Matches
                  </Button>
                </Link>
              </Tooltip>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {aiCandidates.slice(0, 4).map((candidate, i) => {
                const name =
                  [candidate.user?.firstName, candidate.user?.lastName].filter(Boolean).join(' ') ||
                  'Candidate';
                return (
                  <div
                    key={candidate.id || i}
                    className="border-primary/20 bg-primary-50/20 rounded-lg border p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <p className="font-medium text-[var(--text)]">{name}</p>
                        {candidate.headline ? (
                          <p className="truncate text-sm text-[var(--text-muted)]">
                            {candidate.headline}
                          </p>
                        ) : null}
                        {candidate.experienceYears !== undefined ? (
                          <p className="mt-1 text-xs text-[var(--text-muted)]">
                            {candidate.experienceYears} yrs experience
                          </p>
                        ) : null}
                      </div>
                      {candidate.matchScore ? (
                        <span className="bg-primary/10 text-primary shrink-0 rounded-full px-2 py-0.5 text-xs font-medium">
                          {Math.round(candidate.matchScore)}% match
                        </span>
                      ) : null}
                    </div>
                    {candidate.skills?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {candidate.skills.slice(0, 4).map((skill) => (
                          <span
                            key={skill}
                            className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-xs text-[var(--text-muted)]"
                          >
                            {skill}
                          </span>
                        ))}
                        {candidate.skills.length > 4 && (
                          <span className="text-xs text-[var(--text-muted)]">
                            +{candidate.skills.length - 4} more
                          </span>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Recent Applications */}
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-[var(--text)]">Recent Applications</h2>
            <Tooltip content="View all applications for this job">
              <Link href={ROUTES.EMPLOYER.JOB_APPLICATIONS(job.id)}>
                <Button
                  variant="ghost"
                  size="sm"
                  rightIcon={<ChevronRight className="h-4 w-4" />}
                  tooltip="View all applications"
                >
                  View All
                </Button>
              </Link>
            </Tooltip>
          </div>

          {appsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} variant="card" />
              ))}
            </div>
          ) : applications.length > 0 ? (
            <div className="space-y-3">
              {applications.map((app) => {
                const candidate = app.candidate;
                const user = candidate?.user;
                const name =
                  [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
                  user?.email ||
                  'Unknown';
                const badgeColor =
                  statusColorMap[APPLICATION_STATUS_COLORS[app.status] || 'neutral'] || 'neutral';

                return (
                  <div
                    key={app.id}
                    className="flex flex-col gap-3 rounded-lg border border-[var(--border)] p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <Tooltip content="View candidate profile">
                        <Link
                          href={ROUTES.EMPLOYER.CANDIDATE_DETAIL(candidate?.id || '')}
                          className="hover:text-primary font-medium text-[var(--text)] hover:underline"
                        >
                          {name}
                        </Link>
                      </Tooltip>
                      {candidate?.headline && (
                        <p className="text-sm text-[var(--text-muted)]">{candidate.headline}</p>
                      )}
                      <div className="mt-1 flex items-center gap-3 text-xs text-[var(--text-muted)]">
                        {candidate?.experienceYears !== undefined && (
                          <span>{candidate.experienceYears} yrs exp</span>
                        )}
                        <span>Applied {formatRelativeDate(app.appliedAt)}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {app.matchScore !== null && (
                        <span className="text-primary text-xs font-medium">
                          {Math.round(app.matchScore)}% match
                        </span>
                      )}
                      <Badge variant={badgeColor} size="sm">
                        {APPLICATION_STATUS_LABELS[app.status] || app.status}
                      </Badge>
                      {app.status === 'APPLIED' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            statusMutation.mutate({ applicationId: app.id, status: 'SHORTLISTED' })
                          }
                          disabled={statusMutation.isPending}
                          tooltip="Shortlist this candidate"
                        >
                          <Star className="mr-1 h-3 w-3" /> Shortlist
                        </Button>
                      )}
                      {app.status === 'SHORTLISTED' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            statusMutation.mutate({ applicationId: app.id, status: 'SELECTED' })
                          }
                          disabled={statusMutation.isPending}
                          tooltip="Select this candidate"
                        >
                          <UserCheck className="mr-1 h-3 w-3" /> Select
                        </Button>
                      )}
                      {['APPLIED', 'SHORTLISTED', 'SELECTED'].includes(app.status) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            statusMutation.mutate({ applicationId: app.id, status: 'REJECTED' })
                          }
                          disabled={statusMutation.isPending}
                          className="text-[var(--error)]"
                          tooltip="Reject this candidate"
                        >
                          <UserX className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-[var(--text-muted)]">
              No applications received yet.
            </p>
          )}
        </Card>

        {/* Deactivate Modal */}
        <Modal
          isOpen={showDeactivateModal}
          onClose={() => setShowDeactivateModal(false)}
          title="Deactivate Job"
          size="sm"
          footer={
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowDeactivateModal(false)}
                tooltip="Cancel deactivation"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => deactivateMutation.mutate()}
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
