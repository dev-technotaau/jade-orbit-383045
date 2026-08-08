'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Briefcase,
  Search,
  Clock,
  UserCheck,
  Star,
  ChevronDown,
  ArrowUpDown,
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
import Textarea from '@/components/ui/Textarea';
import { showToast } from '@/components/ui/Toast';
import Tooltip from '@/components/ui/Tooltip';
import Select from '@/components/ui/Select';
import { employerService } from '@/services/employer.service';
import { jobService } from '@/services/job.service';
import { ROUTES } from '@/constants/routes';
import { QUERY_KEYS, PAGINATION } from '@/constants/config';
import { APPLICATION_STATUS_LABELS, APPLICATION_STATUS_COLORS } from '@/constants/enums';
import { formatRelativeDate } from '@/lib/utils';
import type { JobApplication, ApplicationStatus } from '@/types/job';
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

export default function EmployerApplicationsDashboard() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGINATION.APPLICATIONS_PER_PAGE);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'matchScore'>('newest');
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: [
      ...QUERY_KEYS.EMPLOYERS.APPLICATIONS,
      statusFilter,
      searchQuery,
      sortBy,
      page,
      pageSize,
    ],
    queryFn: () =>
      employerService.getAllApplications({
        status: statusFilter !== 'ALL' ? (statusFilter as ApplicationStatus) : undefined,
        search: searchQuery || undefined,
        sortBy,
        page,
        limit: pageSize,
      }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({
      applicationId,
      status,
      rejectionReason: reason,
    }: {
      applicationId: string;
      status: string;
      rejectionReason?: string;
    }) => jobService.updateApplicationStatus(applicationId, { status, rejectionReason: reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.EMPLOYERS.APPLICATIONS });
      showToast.success('Application status updated');
      setRejectTarget(null);
      setRejectionReason('');
    },
    onError: (err) => {
      const e = err as unknown as ApiError;
      showToast.error(e.message || 'Failed to update status');
    },
  });

  const applications = data?.data?.items || [];
  const pagination = data?.data;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput);
    setPage(1);
  };

  return (
    <DashboardLayout requiredRole={['EMPLOYER']}>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">All Applications</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Manage applications across all your job postings
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <form onSubmit={handleSearch} className="relative max-w-md flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search by candidate name..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="focus:border-primary w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] py-2 pr-3 pl-10 text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none"
            />
          </form>
          <div className="flex items-center gap-2">
            <Select
              options={[
                { value: 'newest', label: 'Newest First' },
                { value: 'oldest', label: 'Oldest First' },
                { value: 'matchScore', label: 'Match Score' },
              ]}
              value={sortBy}
              onChange={(v) => {
                setSortBy(v as typeof sortBy);
                setPage(1);
              }}
            />
          </div>
        </div>

        {/* Status Tabs */}
        <Tabs
          tabs={statusTabs}
          activeTab={statusFilter}
          onChange={(tab) => {
            setStatusFilter(tab);
            setPage(1);
          }}
        />

        {/* Applications List */}
        <div className="space-y-3">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}>
                <Skeleton variant="card" />
              </Card>
            ))
          ) : applications.length > 0 ? (
            applications.map((app: JobApplication) => {
              const candidate = app.candidate;
              const name = candidate?.user
                ? `${candidate.user.firstName || ''} ${candidate.user.lastName || ''}`.trim()
                : 'Unknown';
              const badgeColor =
                statusColorMap[APPLICATION_STATUS_COLORS[app.status] || 'neutral'] || 'neutral';
              const actions = getAvailableActions(app.status);

              return (
                <Card
                  key={app.id}
                  className="hover:border-primary/20 transition-all hover:shadow-sm"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 flex-1 gap-3">
                      <div className="bg-primary-light flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
                        {candidate?.user?.avatar ? (
                          <img
                            src={candidate.user.avatar}
                            alt={name}
                            className="h-10 w-10 rounded-full object-cover"
                          />
                        ) : (
                          <Users className="text-primary h-5 w-5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--text)]">
                          <Tooltip content="View candidate profile">
                            <Link
                              href={ROUTES.EMPLOYER.CANDIDATE_DETAIL(candidate?.id || '')}
                              className="hover:text-primary transition-colors"
                            >
                              {name}
                            </Link>
                          </Tooltip>
                        </p>
                        {candidate?.headline && (
                          <p className="line-clamp-1 text-sm text-[var(--text-secondary)]">
                            {candidate.headline}
                          </p>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                          <span className="flex items-center gap-1">
                            <Briefcase className="h-3.5 w-3.5" />
                            <Tooltip content="View job details">
                              <Link
                                href={ROUTES.EMPLOYER.JOB_DETAIL(app.jobId)}
                                className="hover:text-primary"
                              >
                                {app.job?.title || 'Unknown Job'}
                              </Link>
                            </Tooltip>
                          </span>
                          {candidate?.experienceYears !== undefined && (
                            <span>{candidate.experienceYears} yrs exp</span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" /> Applied{' '}
                            {formatRelativeDate(app.appliedAt)}
                          </span>
                        </div>
                        {candidate?.skills && candidate.skills.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {candidate.skills.slice(0, 4).map((skill) => (
                              <span
                                key={skill}
                                className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]"
                              >
                                {skill}
                              </span>
                            ))}
                            {candidate.skills.length > 4 && (
                              <span className="text-[10px] text-[var(--text-muted)]">
                                +{candidate.skills.length - 4}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={badgeColor} size="sm">
                          {APPLICATION_STATUS_LABELS[app.status] || app.status}
                        </Badge>
                        {app.matchScore != null && (
                          <span className="text-primary text-xs font-medium">
                            {Math.round(app.matchScore)}% match
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {actions.slice(0, 2).map((action) => (
                          <Button
                            key={action.status}
                            size="sm"
                            variant={action.variant === 'destructive' ? 'outline' : action.variant}
                            onClick={() => {
                              if (action.status === 'REJECTED') {
                                setRejectTarget(app.id);
                              } else {
                                updateStatusMutation.mutate({
                                  applicationId: app.id,
                                  status: action.status,
                                });
                              }
                            }}
                            disabled={updateStatusMutation.isPending}
                            tooltip={`${action.label} this application`}
                          >
                            {action.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })
          ) : (
            <EmptyState
              icon={Users}
              title="No applications found"
              description={
                statusFilter !== 'ALL'
                  ? `No applications with status "${APPLICATION_STATUS_LABELS[statusFilter]}".`
                  : 'You have not received any applications yet.'
              }
            />
          )}
        </div>

        {/* Pagination */}
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

        {/* Rejection Modal */}
        <Modal
          isOpen={!!rejectTarget}
          onClose={() => {
            setRejectTarget(null);
            setRejectionReason('');
          }}
          title="Reject Application"
        >
          <div className="space-y-4">
            <Textarea
              label="Rejection Reason (optional)"
              placeholder="Provide a reason for rejecting this application..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
            />
            <div className="flex justify-end gap-2">
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
                onClick={() => {
                  if (rejectTarget) {
                    updateStatusMutation.mutate({
                      applicationId: rejectTarget,
                      status: 'REJECTED',
                      rejectionReason: rejectionReason || undefined,
                    });
                  }
                }}
                isLoading={updateStatusMutation.isPending}
                tooltip="Confirm application rejection"
              >
                Reject
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
