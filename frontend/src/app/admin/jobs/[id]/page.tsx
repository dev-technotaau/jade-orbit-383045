'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase,
  MapPin,
  Eye,
  Users,
  Clock,
  AlertCircle,
  Calendar,
  CheckCircle,
  XCircle,
  Flag,
  Trash2,
  Building2,
  FileText,
  Shield,
  Globe,
  ArrowLeft,
  Activity,
} from 'lucide-react';
import DOMPurify from 'isomorphic-dompurify';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Breadcrumb from '@/components/ui/Breadcrumb';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import Modal from '@/components/ui/Modal';
import Tag from '@/components/ui/Tag';
import Tooltip from '@/components/ui/Tooltip';
import Input from '@/components/ui/Input';
import Tabs from '@/components/ui/Tabs';
import Pagination from '@/components/ui/Pagination';
import EmptyState from '@/components/ui/EmptyState';
import { showToast } from '@/components/ui/Toast';
import { adminService } from '@/services/admin.service';
import { jobService } from '@/services/job.service';
import { ROUTES } from '@/constants/routes';
import { QUERY_KEYS } from '@/constants/config';
import {
  JOB_STATUS_LABELS,
  JOB_TYPE_LABELS,
  WORK_MODE_LABELS,
  SHIFT_TYPE_LABELS,
  EXPERIENCE_LEVEL_LABELS,
  SALARY_TYPE_LABELS,
  FUNCTIONAL_AREA_LABELS,
  NOTICE_PERIOD_PREFERENCE_LABELS,
  GENDER_PREFERENCE_LABELS,
  DRIVING_LICENSE_TYPE_LABELS,
  POSTING_VISIBILITY_LABELS,
  APPLY_METHOD_LABELS,
  EDUCATION_LEVEL_LABELS,
  SPECIFIC_DEGREE_LABELS,
  URGENCY_LEVEL_LABELS,
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_COLORS,
} from '@/constants/enums';
import { formatRelativeDate, formatDate, formatSalaryRange } from '@/lib/utils';
import { formatSalaryAsLPA } from '@/utils/format';
import type { ApiError, PaginatedData } from '@/types/api';
import type { Job, JobApplication } from '@/types/job';
import type { AuditLog } from '@/types/admin';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';
type TabKey = 'overview' | 'requirements' | 'applications' | 'activity';

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

export default function AdminJobDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  const validTabs: TabKey[] = ['overview', 'requirements', 'applications', 'activity'];
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [applicationsPage, setApplicationsPage] = useState(1);
  const [applicationsPageSize, setApplicationsPageSize] = useState(20);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && validTabs.includes(tab as TabKey)) {
      setActiveTab(tab as TabKey);
    }
  }, [searchParams]);

  const handleTabChange = (key: string) => {
    setActiveTab(key as TabKey);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', key);
    window.history.replaceState({}, '', url.toString());
  };
  const [activityPage, setActivityPage] = useState(1);
  const [activityPageSize, setActivityPageSize] = useState(20);

  // Modals
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [flagReason, setFlagReason] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const { data: jobData, isLoading: jobLoading } = useQuery({
    queryKey: ['admin', 'job-detail', id],
    queryFn: () => jobService.getJob(id),
    enabled: !!id,
  });

  const { data: applicationsData, isLoading: appsLoading } = useQuery({
    queryKey: ['admin', 'job-applications', id, applicationsPage, applicationsPageSize],
    queryFn: () => jobService.getJobApplications(id, applicationsPage, applicationsPageSize),
    enabled: !!id && activeTab === 'applications',
  });

  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: [
      'admin',
      'audit-logs',
      { entity: 'JobPost', page: activityPage, limit: activityPageSize },
    ],
    queryFn: () =>
      adminService.getAuditLogs({
        entity: 'JobPost',
        page: activityPage,
        limit: activityPageSize,
      }),
    enabled: !!id && activeTab === 'activity',
  });

  const moderateMutation = useMutation({
    mutationFn: ({ status, reason }: { status: string; reason?: string }) =>
      adminService.moderateJob(id, { status, reason }),
    onSuccess: () => {
      showToast.success('Job moderated successfully');
      queryClient.invalidateQueries({ queryKey: ['admin', 'job-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'jobs'] });
      setShowApproveModal(false);
      setShowRejectModal(false);
      setRejectReason('');
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to moderate job');
    },
  });

  const flagMutation = useMutation({
    mutationFn: (reason: string) => adminService.flagJob(id, { reason }),
    onSuccess: () => {
      showToast.success('Job flagged successfully');
      queryClient.invalidateQueries({ queryKey: ['admin', 'job-detail', id] });
      setShowFlagModal(false);
      setFlagReason('');
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to flag job');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => adminService.deleteAdminJob(id),
    onSuccess: () => {
      showToast.success('Job deleted successfully');
      router.push(ROUTES.ADMIN.JOBS);
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to delete job');
    },
  });

  const job = jobData?.data;
  const applications = applicationsData?.data?.items || [];
  const applicationsPagination = applicationsData?.data;
  const activityLogs = activityData?.data?.items || [];
  const activityPagination = activityData?.data;

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'requirements', label: 'Requirements' },
    { key: 'applications', label: `Applications (${applicationsPagination?.total || 0})` },
    { key: 'activity', label: 'Activity' },
  ];

  if (jobLoading) {
    return (
      <DashboardLayout
        requiredRole={['ADMIN', 'SUPER_ADMIN']}
        requiredPermission="jobs.listing.view"
      >
        <div className="space-y-6">
          <Skeleton variant="line" width="200px" height="32px" />
          <Skeleton variant="rect" height="200px" />
          <Skeleton variant="rect" height="300px" />
        </div>
      </DashboardLayout>
    );
  }

  if (!job) {
    return (
      <DashboardLayout
        requiredRole={['ADMIN', 'SUPER_ADMIN']}
        requiredPermission="jobs.listing.view"
      >
        <div className="flex flex-col items-center justify-center py-20">
          <Briefcase className="h-12 w-12 text-[var(--text-muted)]" />
          <h2 className="mt-4 text-lg font-semibold text-[var(--text)]">Job not found</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            The job you are looking for does not exist.
          </p>
          <Tooltip content="Return to jobs list">
            <Link href={ROUTES.ADMIN.JOBS} className="mt-4">
              <Button variant="outline" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
                Back to Jobs
              </Button>
            </Link>
          </Tooltip>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout requiredRole={['ADMIN', 'SUPER_ADMIN']} requiredPermission="jobs.listing.view">
      <div className="space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb
          items={[
            { label: 'Dashboard', href: ROUTES.ADMIN.DASHBOARD },
            { label: 'Jobs', href: ROUTES.ADMIN.JOBS },
            { label: job.title },
          ]}
        />

        {/* Job Header */}
        <Card>
          <div className="flex flex-col gap-4">
            {/* Title & Status */}
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-bold text-[var(--text)]">{job.title}</h1>
              <Badge variant={statusBadgeMap[job.status] || 'neutral'}>
                {JOB_STATUS_LABELS[job.status] || job.status}
              </Badge>
              {job.isConfidential && <Badge variant="warning">Confidential</Badge>}
              {job.isFeatured && <Badge variant="info">Featured</Badge>}
              {job.isPremium && <Badge variant="success">Premium</Badge>}
            </div>

            {/* Company Info */}
            <div className="flex items-center gap-3">
              {job.company?.logo ? (
                <img
                  src={job.company.logo}
                  alt={job.company.companyName}
                  className="h-12 w-12 rounded-lg border border-[var(--border)] object-contain"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
                  <Building2 className="h-6 w-6 text-[var(--text-muted)]" />
                </div>
              )}
              <div>
                <p className="font-medium text-[var(--text)]">{job.company?.companyName}</p>
                <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                  {job.company?.industry && <span>{job.company.industry}</span>}
                  {job.company?.companySize && (
                    <>
                      <span>•</span>
                      <span>{job.company.companySize}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[var(--text-muted)]">
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
                  <Globe className="h-4 w-4" /> {WORK_MODE_LABELS[job.workMode] || job.workMode}
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

            {/* Salary */}
            {(job.salaryMin || job.salaryMax) && job.salaryDisclosed && (
              <p className="text-sm font-medium text-[var(--text)]">
                {formatSalaryRange(job.salaryMin, job.salaryMax, job.currency)}
                {job.salaryType === 'ANNUAL'
                  ? ' / year'
                  : job.salaryType === 'MONTHLY'
                    ? ' / month'
                    : job.salaryType === 'HOURLY'
                      ? ' / hour'
                      : ''}
                {(job.currency || 'INR').toUpperCase() === 'INR' && job.salaryType === 'ANNUAL' && (
                  <span className="ml-2 text-xs text-[var(--text-muted)]">
                    ({formatSalaryAsLPA(job.salaryMin, job.salaryMax)})
                  </span>
                )}
                {job.salaryNegotiable && (
                  <span className="ml-2 text-xs text-[var(--success)]">Negotiable</span>
                )}
              </p>
            )}

            {/* Moderation Actions */}
            <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
              <Button
                variant="outline"
                size="sm"
                tooltip="Approve this job listing"
                leftIcon={<CheckCircle className="h-4 w-4" />}
                onClick={() => setShowApproveModal(true)}
                className="border-[var(--success)]/30 text-[var(--success)]"
              >
                Approve
              </Button>
              <Button
                variant="outline"
                size="sm"
                tooltip="Reject this job listing"
                leftIcon={<XCircle className="h-4 w-4" />}
                onClick={() => setShowRejectModal(true)}
                className="text-error border-error/30"
              >
                Reject
              </Button>
              <Button
                variant="ghost"
                size="sm"
                tooltip="Flag this job for review"
                leftIcon={<Flag className="h-4 w-4" />}
                onClick={() => setShowFlagModal(true)}
                className="text-[var(--warning)]"
              >
                Flag
              </Button>
              <Button
                variant="ghost"
                size="sm"
                tooltip="Delete this job listing"
                leftIcon={<Trash2 className="h-4 w-4" />}
                onClick={() => setShowDeleteModal(true)}
                className="text-error"
              >
                Delete
              </Button>
              {job.company?.userId && (
                <Tooltip content="View employer profile">
                  <Link href={ROUTES.ADMIN.USER_DETAIL(job.company.userId)}>
                    <Button variant="outline" size="sm" leftIcon={<Users className="h-4 w-4" />}>
                      View Employer
                    </Button>
                  </Link>
                </Tooltip>
              )}
            </div>
          </div>
        </Card>

        {/* Tabs */}
        <Tabs tabs={tabs} activeTab={activeTab} onChange={handleTabChange} variant="underline" />

        {/* Tab Content */}
        <div className="space-y-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && <OverviewTab job={job} />}

          {/* Requirements Tab */}
          {activeTab === 'requirements' && <RequirementsTab job={job} />}

          {/* Applications Tab */}
          {activeTab === 'applications' && (
            <ApplicationsTab
              applications={applications}
              isLoading={appsLoading}
              pagination={applicationsPagination}
              page={applicationsPage}
              onPageChange={setApplicationsPage}
              pageSize={applicationsPageSize}
              onPageSizeChange={(s) => {
                setApplicationsPageSize(s);
                setApplicationsPage(1);
              }}
            />
          )}

          {/* Activity Tab */}
          {activeTab === 'activity' && (
            <ActivityTab
              logs={activityLogs}
              isLoading={activityLoading}
              pagination={activityPagination}
              page={activityPage}
              onPageChange={setActivityPage}
              pageSize={activityPageSize}
              onPageSizeChange={(s) => {
                setActivityPageSize(s);
                setActivityPage(1);
              }}
            />
          )}
        </div>

        {/* Approve Modal */}
        <Modal
          isOpen={showApproveModal}
          onClose={() => setShowApproveModal(false)}
          title="Approve Job"
          size="sm"
          footer={
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                tooltip="Cancel approval"
                onClick={() => setShowApproveModal(false)}
              >
                Cancel
              </Button>
              <Button
                tooltip="Confirm job approval"
                onClick={() => moderateMutation.mutate({ status: 'OPEN' })}
                isLoading={moderateMutation.isPending}
              >
                Approve
              </Button>
            </div>
          }
        >
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 shrink-0 text-[var(--success)]" />
            <p className="text-sm text-[var(--text-secondary)]">
              Are you sure you want to approve{' '}
              <span className="font-medium text-[var(--text)]">{job.title}</span>? The job will be
              published and visible to candidates.
            </p>
          </div>
        </Modal>

        {/* Reject Modal */}
        <Modal
          isOpen={showRejectModal}
          onClose={() => {
            setShowRejectModal(false);
            setRejectReason('');
          }}
          title="Reject Job"
          size="sm"
          footer={
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                tooltip="Cancel rejection"
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectReason('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                tooltip="Confirm job rejection"
                onClick={() => moderateMutation.mutate({ status: 'CLOSED', reason: rejectReason })}
                isLoading={moderateMutation.isPending}
                disabled={!rejectReason.trim()}
              >
                Reject
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-error h-5 w-5 shrink-0" />
              <p className="text-sm text-[var(--text-secondary)]">
                You are about to reject{' '}
                <span className="font-medium text-[var(--text)]">{job.title}</span>. The employer
                will be notified.
              </p>
            </div>
            <Input
              label="Reason"
              placeholder="Enter reason for rejection..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              required
            />
          </div>
        </Modal>

        {/* Flag Modal */}
        <Modal
          isOpen={showFlagModal}
          onClose={() => {
            setShowFlagModal(false);
            setFlagReason('');
          }}
          title="Flag Job"
          size="sm"
          footer={
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                tooltip="Cancel flagging"
                onClick={() => {
                  setShowFlagModal(false);
                  setFlagReason('');
                }}
              >
                Cancel
              </Button>
              <Button
                tooltip="Confirm flagging this job"
                onClick={() => flagMutation.mutate(flagReason)}
                isLoading={flagMutation.isPending}
                disabled={!flagReason.trim()}
              >
                Flag Job
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Flag className="h-5 w-5 shrink-0 text-[var(--warning)]" />
              <p className="text-sm text-[var(--text-secondary)]">
                Flag <span className="font-medium text-[var(--text)]">{job.title}</span> for review.
                Provide a reason below.
              </p>
            </div>
            <Input
              label="Reason"
              placeholder="Why are you flagging this job?"
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              required
            />
          </div>
        </Modal>

        {/* Delete Modal */}
        <Modal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          title="Delete Job"
          size="sm"
          footer={
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                tooltip="Cancel deletion"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                tooltip="Permanently delete this job"
                onClick={() => deleteMutation.mutate()}
                isLoading={deleteMutation.isPending}
              >
                Delete
              </Button>
            </div>
          }
        >
          <div className="flex items-start gap-3">
            <Trash2 className="text-error h-5 w-5 shrink-0" />
            <p className="text-sm text-[var(--text-secondary)]">
              Are you sure you want to permanently delete{' '}
              <span className="font-medium text-[var(--text)]">{job.title}</span>? This action
              cannot be undone.
            </p>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}

// ============================================================================
// Overview Tab Component
// ============================================================================

function OverviewTab({ job }: { job: Job }) {
  return (
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
            <h2 className="mb-3 text-base font-semibold text-[var(--text)]">Interview Process</h2>
            <p className="text-sm whitespace-pre-wrap text-[var(--text-secondary)]">
              {job.interviewProcess}
            </p>
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
      </div>

      {/* Sidebar */}
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
            <InfoRow label="Job ID" value={job.id.substring(0, 8) + '...'} />
            <InfoRow
              label="Experience"
              value={`${job.experienceMin}-${job.experienceMax || job.experienceMin}+ years`}
            />
            {job.experienceLevel && (
              <InfoRow label="Level" value={EXPERIENCE_LEVEL_LABELS[job.experienceLevel]} />
            )}
            {job.numberOfOpenings && (
              <InfoRow
                label="Openings"
                value={`${job._hiredCount ?? 0}/${job.numberOfOpenings} filled`}
              />
            )}
            {job.industry && <InfoRow label="Industry" value={job.industry} />}
            {job.department && <InfoRow label="Department" value={job.department} />}
            {job.functionalArea && (
              <InfoRow label="Functional Area" value={FUNCTIONAL_AREA_LABELS[job.functionalArea]} />
            )}
            {job.roleCategory && <InfoRow label="Role Category" value={job.roleCategory} />}
            {job.educationRequired && (
              <InfoRow label="Education" value={EDUCATION_LEVEL_LABELS[job.educationRequired]} />
            )}
            {job.preferredEducationField && (
              <InfoRow label="Education Field" value={job.preferredEducationField} />
            )}
            {job.ugRequired && (
              <InfoRow label="UG Required" value={EDUCATION_LEVEL_LABELS[job.ugRequired]} />
            )}
            {job.pgRequired && (
              <InfoRow label="PG Required" value={EDUCATION_LEVEL_LABELS[job.pgRequired]} />
            )}
            {job.shiftType && <InfoRow label="Shift" value={SHIFT_TYPE_LABELS[job.shiftType]} />}
            {job.isRemote && <InfoRow label="Remote" value="Yes" valueColor="success" />}
            {job.travelRequired && <InfoRow label="Travel" value="Required" />}
            {job.genderPreference && job.genderPreference !== 'ANY' && (
              <InfoRow
                label="Gender Pref."
                value={GENDER_PREFERENCE_LABELS[job.genderPreference]}
              />
            )}
            {job.drivingLicenseRequired && job.drivingLicenseRequired !== 'NONE' && (
              <InfoRow
                label="Driving License"
                value={DRIVING_LICENSE_TYPE_LABELS[job.drivingLicenseRequired]}
              />
            )}
            {(job.ageMin || job.ageMax) && (
              <InfoRow label="Age" value={`${job.ageMin || '—'} – ${job.ageMax || '—'} years`} />
            )}
            {job.urgencyLevel && job.urgencyLevel !== 'NORMAL' && (
              <InfoRow label="Urgency" value={URGENCY_LEVEL_LABELS[job.urgencyLevel]} />
            )}
            {job.applicationDeadline && (
              <InfoRow label="Deadline" value={formatDate(job.applicationDeadline)} />
            )}
            {job.expiresAt && <InfoRow label="Expires" value={formatDate(job.expiresAt)} />}
            {job.contactPerson && <InfoRow label="Contact" value={job.contactPerson} />}
            {job.contactEmail && <InfoRow label="Contact Email" value={job.contactEmail} />}
            {job.externalApplyUrl && (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">External URL</span>
                <Tooltip content="Open external application link">
                  <a
                    href={job.externalApplyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary max-w-[180px] truncate text-xs"
                  >
                    {job.externalApplyUrl}
                  </a>
                </Tooltip>
              </div>
            )}
            {job.referenceCode && <InfoRow label="Reference" value={job.referenceCode} />}
            {job.postingVisibility !== 'PUBLIC' && (
              <InfoRow
                label="Visibility"
                value={POSTING_VISIBILITY_LABELS[job.postingVisibility]}
              />
            )}
            {job.applyMethod !== 'IN_PLATFORM' && (
              <InfoRow label="Apply Method" value={APPLY_METHOD_LABELS[job.applyMethod]} />
            )}
            {job.scheduledPublishAt && job.status === 'DRAFT' && (
              <InfoRow label="Scheduled" value={formatDate(job.scheduledPublishAt)} />
            )}
            <InfoRow label="Created" value={formatDate(job.createdAt)} />
            <InfoRow label="Updated" value={formatDate(job.updatedAt)} />
          </div>
        </Card>

        {/* Inclusion & Requirements */}
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
            <h2 className="mb-3 text-base font-semibold text-[var(--text)]">Specific Degrees</h2>
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
            <h2 className="mb-3 text-base font-semibold text-[var(--text)]">Nice-to-Have Skills</h2>
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
            <h2 className="mb-3 text-base font-semibold text-[var(--text)]">Languages Required</h2>
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
  );
}

// ============================================================================
// Requirements Tab Component
// ============================================================================

function RequirementsTab({ job }: { job: Job }) {
  return (
    <div className="space-y-6">
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

      {/* Empty State */}
      {(job.screeningQuestions?.length ?? 0) === 0 && (
        <Card>
          <EmptyState
            icon={FileText}
            title="No Screening Questions"
            description="This job does not have any screening questions configured."
          />
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// Applications Tab Component
// ============================================================================

function ApplicationsTab({
  applications,
  isLoading,
  pagination,
  page,
  onPageChange,
  pageSize,
  onPageSizeChange,
}: {
  applications: JobApplication[];
  isLoading: boolean;
  pagination: PaginatedData<JobApplication> | undefined;
  page: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
}) {
  if (isLoading) {
    return (
      <Card>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} variant="rect" height={80} />
          ))}
        </div>
      </Card>
    );
  }

  if (applications.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Users}
          title="No Applications"
          description="This job hasn't received any applications yet."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card padding="sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                  Candidate
                </th>
                <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                  Applied
                </th>
                <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                  Match
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
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
                  <tr key={app.id} className="transition-colors hover:bg-[var(--bg-secondary)]">
                    <td className="px-4 py-3">
                      <p className="font-medium text-[var(--text)]">{name}</p>
                      {candidate?.headline && (
                        <p className="text-xs text-[var(--text-muted)]">{candidate.headline}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">
                      {formatRelativeDate(app.appliedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={badgeColor} size="sm">
                        {APPLICATION_STATUS_LABELS[app.status] || app.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">
                      {app.matchScore !== null ? `${Math.round(app.matchScore)}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {pagination && (
        <Pagination
          currentPage={page}
          totalPages={pagination.totalPages}
          onPageChange={onPageChange}
          totalItems={pagination.total}
          pageSize={pageSize}
          onPageSizeChange={onPageSizeChange}
        />
      )}
    </div>
  );
}

// ============================================================================
// Activity Tab Component
// ============================================================================

function ActivityTab({
  logs,
  isLoading,
  pagination,
  page,
  onPageChange,
  pageSize,
  onPageSizeChange,
}: {
  logs: AuditLog[];
  isLoading: boolean;
  pagination: PaginatedData<AuditLog> | undefined;
  page: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
}) {
  if (isLoading) {
    return (
      <Card>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} variant="rect" height={60} />
          ))}
        </div>
      </Card>
    );
  }

  if (logs.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Activity}
          title="No Activity"
          description="No audit logs found for this job."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-4 text-base font-semibold text-[var(--text)]">
          Activity Log ({pagination?.total || 0} actions)
        </h3>
        <div className="space-y-3">
          {logs.map((log) => (
            <div key={log.id} className="border-primary border-l-2 py-2 pl-4">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[var(--text)]">{log.action}</span>
                <span className="text-xs text-[var(--text-muted)]">
                  {formatRelativeDate(log.createdAt)}
                </span>
              </div>
              <p className="text-sm text-[var(--text-muted)]">
                {log.entity} {log.entityId && `(${log.entityId.substring(0, 8)}...)`}
              </p>
              {log.details && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-[var(--text-muted)]">
                    View Details
                  </summary>
                  <pre className="mt-1 overflow-x-auto rounded bg-[var(--bg-secondary)] p-2 text-xs">
                    {JSON.stringify(log.details, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      </Card>

      {pagination && (
        <Pagination
          currentPage={page}
          totalPages={pagination.totalPages}
          onPageChange={onPageChange}
          totalItems={pagination.total}
          pageSize={pageSize}
          onPageSizeChange={onPageSizeChange}
        />
      )}
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

function InfoRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: 'success' | 'error';
}) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span
        className={
          valueColor === 'success'
            ? 'text-[var(--success)]'
            : valueColor === 'error'
              ? 'text-error'
              : 'text-[var(--text)]'
        }
      >
        {value}
      </span>
    </div>
  );
}
