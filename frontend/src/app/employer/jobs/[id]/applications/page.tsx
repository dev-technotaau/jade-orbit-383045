'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Briefcase,
  Users,
  Clock,
  UserCheck,
  Calendar,
  Star,
  AlertCircle,
  ChevronDown,
  Crown,
  Zap,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Tabs from '@/components/ui/Tabs';
import Pagination from '@/components/ui/Pagination';
import Skeleton from '@/components/ui/Skeleton';
import QuotaBar from '@/components/billing/QuotaBar';
import { useEntitlements } from '@/hooks/use-entitlements';
import { useUpgradeModal } from '@/components/billing/UpgradeModal';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import Tag from '@/components/ui/Tag';
import Textarea from '@/components/ui/Textarea';
import { showToast } from '@/components/ui/Toast';
import Tooltip from '@/components/ui/Tooltip';
import { jobService } from '@/services/job.service';
import { ROUTES } from '@/constants/routes';
import { QUERY_KEYS, PAGINATION } from '@/constants/config';
import { APPLICATION_STATUS_LABELS, APPLICATION_STATUS_COLORS } from '@/constants/enums';
import { formatRelativeDate } from '@/lib/utils';
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
  { key: 'HIRED', label: 'Hired' },
];

interface StatusAction {
  label: string;
  status: string;
  variant: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
}

function getAvailableActions(currentStatus: string): StatusAction[] {
  const actions: StatusAction[] = [];

  if (['APPLIED', 'VIEWED'].includes(currentStatus)) {
    actions.push({ label: 'Shortlist', status: 'SHORTLISTED', variant: 'primary' });
  }
  if (['SHORTLISTED'].includes(currentStatus)) {
    actions.push({ label: 'Select', status: 'SELECTED', variant: 'primary' });
  }
  if (['SELECTED'].includes(currentStatus)) {
    actions.push({ label: 'Offer', status: 'OFFERED', variant: 'primary' });
  }
  if (['OFFERED'].includes(currentStatus)) {
    actions.push({ label: 'Mark Hired', status: 'HIRED', variant: 'primary' });
  }
  if (!['REJECTED', 'HIRED', 'WITHDRAWN'].includes(currentStatus)) {
    actions.push({ label: 'Reject', status: 'REJECTED', variant: 'destructive' });
  }

  return actions;
}

export default function JobApplicationsPage() {
  const params = useParams();
  const jobId = params.id as string;
  const queryClient = useQueryClient();
  const { hasFeature, remaining, allocated } = useEntitlements();
  const upgrade = useUpgradeModal();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGINATION.APPLICATIONS_PER_PAGE);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Quota-exhausted upsell — banner shows when:
  //   - employer doesn't have unlimited applications, AND
  //   - their APPLICATIONS quota is at zero or low (<10% remaining).
  const appsAllocated = allocated('APPLICATIONS');
  const appsRemaining = remaining('APPLICATIONS');
  const isUnlimited = hasFeature('feature.unlimited_applications');
  const showQuotaUpsell =
    !isUnlimited && appsAllocated > 0 && appsRemaining <= Math.max(1, appsAllocated * 0.1);

  const { data: jobData } = useQuery({
    queryKey: QUERY_KEYS.JOBS.DETAIL(jobId),
    queryFn: () => jobService.getJob(jobId),
    enabled: !!jobId,
  });

  const serverStatus = statusFilter === 'ALL' ? undefined : statusFilter;
  const { data: appsData, isLoading } = useQuery({
    queryKey: [...QUERY_KEYS.JOBS.APPLICATIONS(jobId), page, pageSize, serverStatus],
    queryFn: () => jobService.getJobApplications(jobId, page, pageSize, serverStatus),
    enabled: !!jobId,
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({
      applicationId,
      status,
      rejectionReason,
    }: {
      applicationId: string;
      status: string;
      rejectionReason?: string;
    }) => jobService.updateApplicationStatus(applicationId, { status, rejectionReason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.JOBS.APPLICATIONS(jobId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.JOBS.DETAIL(jobId) });
      showToast.success('Application status updated');
      setRejectTarget(null);
      setRejectionReason('');
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to update status');
    },
  });

  const job = jobData?.data;
  const applications = appsData?.data?.items || [];
  const pagination = appsData?.data;

  const filtered = applications;

  const handleStatusChange = (applicationId: string, status: string) => {
    if (status === 'REJECTED') {
      setRejectTarget(applicationId);
      return;
    }
    updateStatusMutation.mutate({ applicationId, status });
  };

  const handleReject = () => {
    if (!rejectTarget) return;
    updateStatusMutation.mutate({
      applicationId: rejectTarget,
      status: 'REJECTED',
      rejectionReason: rejectionReason.trim() || undefined,
    });
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <DashboardLayout requiredRole={['EMPLOYER']}>
      <div className="space-y-6">
        {/* Application quota upsell — shown when employer is at/near the limit */}
        {showQuotaUpsell && (
          <button
            type="button"
            onClick={() => upgrade.open({ feature: 'feature.unlimited_applications' })}
            className="group flex w-full items-start gap-3 rounded-xl bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 p-4 text-left shadow-sm transition-all hover:from-amber-600 hover:via-amber-700 hover:to-orange-700 hover:shadow-md dark:from-amber-700 dark:via-amber-800 dark:to-orange-800"
          >
            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-white/20 text-white shadow-inner ring-1 ring-white/30 backdrop-blur-sm">
              <Crown className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-white">
                {appsRemaining === 0
                  ? `You've used all ${appsAllocated} applications on this plan`
                  : `Only ${appsRemaining} of ${appsAllocated} applications left`}
              </p>
              <p className="mt-0.5 text-sm text-white/90">
                Upgrade to Premium for unlimited applications, 3 job posts, top search visibility,
                and 20 CV unlocks.
              </p>
            </div>
            <span className="inline-flex items-center gap-1 self-center rounded-lg bg-white px-3 py-1.5 text-sm font-semibold whitespace-nowrap text-amber-700 shadow-sm transition-colors group-hover:bg-amber-50">
              <Zap className="h-4 w-4" /> Upgrade
            </span>
          </button>
        )}
        {upgrade.modal}

        {/* Back Button */}
        <Tooltip content="Return to job details">
          <Link
            href={ROUTES.EMPLOYER.JOB_DETAIL(jobId)}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Job Details
          </Link>
        </Tooltip>

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Applications</h1>
            {job && (
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Manage applications for{' '}
                <span className="font-medium text-[var(--text)]">{job.title}</span>
              </p>
            )}
          </div>
          <QuotaBar units={['APPLICATIONS', 'CV_UNLOCK']} />
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
                onStatusChange={(status) => handleStatusChange(app.id, status)}
                isUpdating={updateStatusMutation.isPending}
              />
            ))
          ) : (
            <EmptyState
              icon={Users}
              title={
                statusFilter === 'ALL'
                  ? 'No applications yet'
                  : `No ${APPLICATION_STATUS_LABELS[statusFilter] || statusFilter} applications`
              }
              description="Applications will appear here once candidates apply for this job."
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

        {/* Rejection Reason Modal */}
        <Modal
          isOpen={!!rejectTarget}
          onClose={() => {
            setRejectTarget(null);
            setRejectionReason('');
          }}
          title="Reject Application"
          size="md"
          footer={
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setRejectTarget(null);
                  setRejectionReason('');
                }}
                tooltip="Cancel rejection"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                isLoading={updateStatusMutation.isPending}
                tooltip="Confirm application rejection"
              >
                Reject Application
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-[var(--warning)]" />
              <p className="text-sm text-[var(--text-secondary)]">
                Are you sure you want to reject this application? The candidate will be notified of
                this decision.
              </p>
            </div>
            <Textarea
              label="Rejection Reason (Optional)"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Provide a reason for the rejection..."
              rows={3}
            />
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}

function ApplicationCard({
  application,
  onStatusChange,
  isUpdating,
}: {
  application: JobApplication;
  onStatusChange: (status: string) => void;
  isUpdating: boolean;
}) {
  const [showActions, setShowActions] = useState(false);
  const candidate = application.candidate;
  const user = candidate?.user;
  const name =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
    user?.email ||
    'Unknown Candidate';
  const badgeColor =
    statusColorMap[APPLICATION_STATUS_COLORS[application.status] || 'neutral'] || 'neutral';
  const actions = getAvailableActions(application.status);

  return (
    <Card className="transition-shadow hover:shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        {/* Candidate Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            {/* Avatar */}
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
              {user?.avatar ? (
                <img src={user.avatar} alt={name} className="h-11 w-11 rounded-full object-cover" />
              ) : (
                <span className="text-sm font-semibold text-[var(--text-muted)]">
                  {(user?.firstName?.charAt(0) || '?').toUpperCase()}
                </span>
              )}
            </div>

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
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
                {candidate?.experienceYears !== undefined && (
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-3 w-3" /> {candidate.experienceYears} yrs experience
                  </span>
                )}
                {candidate?.currentCompany && (
                  <span className="flex items-center gap-1">
                    {candidate.currentCompany}
                    {candidate.currentRole ? ` - ${candidate.currentRole}` : ''}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Applied {formatRelativeDate(application.appliedAt)}
                </span>
              </div>

              {/* Skills */}
              {candidate?.skills && candidate.skills.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {candidate.skills.slice(0, 6).map((skill) => (
                    <Tag key={skill} label={skill} size="sm" variant="primary" />
                  ))}
                  {candidate.skills.length > 6 && (
                    <Tag label={`+${candidate.skills.length - 6}`} size="sm" />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Section: Status & Actions */}
        <div className="flex shrink-0 flex-col items-start gap-3 lg:items-end">
          <div className="flex flex-wrap items-center gap-2">
            {application.matchScore !== null && (
              <span className="text-primary flex items-center gap-1 text-xs font-medium">
                <Star className="h-3.5 w-3.5" />
                {Math.round(application.matchScore)}% match
              </span>
            )}
            <Badge variant={badgeColor}>
              {APPLICATION_STATUS_LABELS[application.status] || application.status}
            </Badge>
          </div>

          {/* Action Buttons */}
          {actions.length > 0 && (
            <div className="relative">
              <div className="flex items-center gap-2">
                {/* Show primary action directly */}
                {actions.length > 0 && actions[0].status !== 'REJECTED' && (
                  <Button
                    variant={actions[0].variant}
                    size="sm"
                    onClick={() => onStatusChange(actions[0].status)}
                    disabled={isUpdating}
                    tooltip={`${actions[0].label} this application`}
                  >
                    {actions[0].label}
                  </Button>
                )}

                {/* More actions dropdown */}
                {actions.length > 1 && (
                  <div className="relative">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowActions(!showActions)}
                      rightIcon={<ChevronDown className="h-3.5 w-3.5" />}
                      tooltip="More status actions"
                    >
                      More
                    </Button>
                    {showActions && (
                      <div className="absolute right-0 z-50 mt-1 min-w-[160px] rounded-lg border border-[var(--border)] bg-white py-1 shadow-lg">
                        {actions.slice(actions[0].status !== 'REJECTED' ? 1 : 0).map((action) => (
                          <button
                            key={action.status}
                            type="button"
                            onClick={() => {
                              onStatusChange(action.status);
                              setShowActions(false);
                            }}
                            disabled={isUpdating}
                            className={`flex w-full items-center px-3 py-2 text-sm transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-50 ${
                              action.variant === 'destructive'
                                ? 'text-error hover:bg-[var(--error-light)]'
                                : 'text-[var(--text)]'
                            }`}
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* If only reject is available */}
                {actions.length === 1 && actions[0].status === 'REJECTED' && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => onStatusChange('REJECTED')}
                    disabled={isUpdating}
                    tooltip="Reject this application"
                  >
                    Reject
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
