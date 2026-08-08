'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase,
  Search,
  Building2,
  Eye,
  Calendar,
  CheckCircle,
  XCircle,
  Flag,
  AlertCircle,
  Users,
  Trash2,
  TrendingUp,
  DollarSign,
  Zap,
  Star,
  Pencil,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import DatePicker from '@/components/ui/DatePicker';
import Select from '@/components/ui/Select';
import Pagination from '@/components/ui/Pagination';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import Tooltip from '@/components/ui/Tooltip';
import { showToast } from '@/components/ui/Toast';
import { adminService } from '@/services/admin.service';
import { PAGINATION, QUERY_KEYS } from '@/constants/config';
import { JOB_STATUS_LABELS } from '@/constants/enums';
import { formatDate } from '@/lib/utils';
import type { ApiError } from '@/types/api';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'OPEN', label: 'Open' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'EXPIRED', label: 'Expired' },
];

const urgencyOptions = [
  { value: '', label: 'All Urgency' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'URGENT', label: 'Urgent' },
  { value: 'IMMEDIATE', label: 'Immediate' },
];

const featuredOptions = [
  { value: '', label: 'All Jobs' },
  { value: 'true', label: 'Featured Only' },
  { value: 'false', label: 'Non-Featured' },
];

const confidentialOptions = [
  { value: '', label: 'All Jobs' },
  { value: 'true', label: 'Confidential Only' },
  { value: 'false', label: 'Public Only' },
];

const getStatusBadgeVariant = (status: string): BadgeVariant => {
  switch (status) {
    case 'OPEN':
      return 'success';
    case 'CLOSED':
      return 'neutral';
    case 'DRAFT':
      return 'warning';
    case 'EXPIRED':
      return 'error';
    default:
      return 'neutral';
  }
};

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function SuperAdminJobsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGINATION.DEFAULT_LIMIT);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Advanced filters
  const [urgencyFilter, setUrgencyFilter] = useState('');
  const [featuredFilter, setFeaturedFilter] = useState('');
  const [confidentialFilter, setConfidentialFilter] = useState('');

  // Bulk operations
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);

  // Modals
  const [rejectTarget, setRejectTarget] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [flagTarget, setFlagTarget] = useState<any>(null);
  const [flagReason, setFlagReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showBulkApproveModal, setShowBulkApproveModal] = useState(false);

  const filters: Record<string, string | number | undefined> = {
    keyword: keyword || undefined,
    status: statusFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    urgencyLevel: urgencyFilter || undefined,
    isFeatured: featuredFilter || undefined,
    isConfidential: confidentialFilter || undefined,
    page,
    limit: pageSize,
  };

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.ADMIN.JOBS(filters),
    queryFn: () => adminService.getJobs(filters),
  });

  const jobs = data?.data?.items || [];
  const pagination = data?.data;

  const moderateMutation = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: string; reason?: string }) =>
      adminService.moderateJob(id, { status, reason }),
    onSuccess: () => {
      showToast.success('Job moderated successfully');
      queryClient.invalidateQueries({ queryKey: ['admin', 'jobs'] as const });
      setRejectTarget(null);
      setRejectReason('');
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to moderate job');
    },
  });

  const flagMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminService.flagJob(id, { reason }),
    onSuccess: () => {
      showToast.success('Job flagged successfully');
      queryClient.invalidateQueries({ queryKey: ['admin', 'jobs'] as const });
      setFlagTarget(null);
      setFlagReason('');
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to flag job');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminService.deleteAdminJob(id),
    onSuccess: () => {
      showToast.success('Job deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['admin', 'jobs'] as const });
      setDeleteTarget(null);
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to delete job');
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: async (jobIds: string[]) => {
      // Approve jobs sequentially to ensure proper tracking
      for (const jobId of jobIds) {
        await adminService.moderateJob(jobId, { status: 'OPEN' });
      }
    },
    onSuccess: () => {
      showToast.success(
        `Successfully approved ${selectedJobs.size} job${selectedJobs.size !== 1 ? 's' : ''}`,
      );
      queryClient.invalidateQueries({ queryKey: ['admin', 'jobs'] as const });
      setShowBulkApproveModal(false);
      setSelectedJobs(new Set());
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to bulk approve jobs');
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (jobIds: string[]) => {
      // Delete jobs sequentially to ensure proper tracking
      for (const jobId of jobIds) {
        await adminService.deleteAdminJob(jobId);
      }
    },
    onSuccess: () => {
      showToast.success(
        `Successfully deleted ${selectedJobs.size} job${selectedJobs.size !== 1 ? 's' : ''}`,
      );
      queryClient.invalidateQueries({ queryKey: ['admin', 'jobs'] as const });
      setShowBulkDeleteModal(false);
      setSelectedJobs(new Set());
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to bulk delete jobs');
    },
  });

  const handleApprove = (job: any) => {
    moderateMutation.mutate({ id: job.id, status: 'OPEN' });
  };

  const handleReject = () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    moderateMutation.mutate({ id: rejectTarget.id, status: 'CLOSED', reason: rejectReason.trim() });
  };

  const handleFlag = () => {
    if (!flagTarget || !flagReason.trim()) return;
    flagMutation.mutate({ id: flagTarget.id, reason: flagReason });
  };

  const toggleJobSelection = (jobId: string) => {
    setSelectedJobs((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(jobId)) {
        newSet.delete(jobId);
      } else {
        newSet.add(jobId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedJobs.size === jobs.length && jobs.length > 0) {
      setSelectedJobs(new Set());
    } else {
      setSelectedJobs(new Set(jobs.map((j: any) => j.id)));
    }
  };

  const handleBulkApprove = () => {
    if (selectedJobs.size === 0) return;
    bulkApproveMutation.mutate(Array.from(selectedJobs));
  };

  const handleBulkDelete = () => {
    if (selectedJobs.size === 0) return;
    bulkDeleteMutation.mutate(Array.from(selectedJobs));
  };

  return (
    <DashboardLayout requiredRole={['ADMIN', 'SUPER_ADMIN']} requiredPermission="jobs.listing.view">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Job Management (Super Admin)</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Advanced job moderation with bulk operations and analytics.
          </p>
        </div>

        {/* Bulk Actions Bar */}
        {selectedJobs.size > 0 && (
          <Card className="border-primary">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-[var(--text)]">
                {selectedJobs.size} job{selectedJobs.size !== 1 ? 's' : ''} selected
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBulkApproveModal(true)}
                  tooltip="Approve all selected jobs"
                >
                  Bulk Approve
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowBulkDeleteModal(true)}
                  tooltip="Delete all selected jobs"
                >
                  Bulk Delete
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedJobs(new Set())}
                  tooltip="Deselect all jobs"
                >
                  Clear Selection
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Analytics Widgets */}
        {!isLoading && jobs.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Total Jobs */}
            <Card>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--info-light)]">
                  <Briefcase className="text-primary h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[var(--text)]">{pagination?.total || 0}</p>
                  <p className="text-xs text-[var(--text-muted)]">Total Jobs</p>
                </div>
              </div>
            </Card>

            {/* Featured Jobs */}
            <Card>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--warning-light)]">
                  <Star className="h-5 w-5 text-[var(--warning-dark)]" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[var(--text)]">
                    {jobs.filter((j: any) => j.isFeatured).length}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">Featured</p>
                </div>
              </div>
            </Card>

            {/* Urgent Jobs */}
            <Card>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--error-light)]">
                  <Zap className="h-5 w-5 text-[var(--error-dark)]" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[var(--text)]">
                    {
                      jobs.filter(
                        (j: any) => j.urgencyLevel === 'URGENT' || j.urgencyLevel === 'IMMEDIATE',
                      ).length
                    }
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">Urgent</p>
                </div>
              </div>
            </Card>

            {/* Avg Salary */}
            <Card>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--success-light)]">
                  <DollarSign className="h-5 w-5 text-[var(--success-dark)]" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[var(--text)]">
                    {(() => {
                      const salaries = jobs
                        .filter(
                          (j: any) => j.salaryMax && j.salaryDisclosed && j.currency === 'INR',
                        )
                        .map((j: any) => j.salaryMax);
                      if (salaries.length === 0) return '—';
                      const avg =
                        salaries.reduce((a: number, b: number) => a + b, 0) / salaries.length;
                      return `₹${(avg / 100000).toFixed(1)}L`;
                    })()}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">Avg Salary</p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Filters */}
        <Card>
          <div className="space-y-4">
            {/* Basic Filters Row */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Input
                  placeholder="Search jobs by title or company..."
                  value={keyword}
                  onChange={(e) => {
                    setKeyword(e.target.value);
                    setPage(1);
                  }}
                  leftIcon={<Search className="h-4 w-4" />}
                />
              </div>
              <div className="w-full sm:w-40">
                <Select
                  label="Status"
                  options={statusOptions}
                  value={statusFilter}
                  onChange={(val) => {
                    setStatusFilter(val);
                    setPage(1);
                  }}
                />
              </div>
              <div className="w-full sm:w-40">
                <DatePicker
                  label="From"
                  value={dateFrom}
                  onChange={(val) => {
                    setDateFrom(val);
                    setPage(1);
                  }}
                />
              </div>
              <div className="w-full sm:w-40">
                <DatePicker
                  label="To"
                  value={dateTo}
                  onChange={(val) => {
                    setDateTo(val);
                    setPage(1);
                  }}
                />
              </div>
            </div>

            {/* Advanced Filters Row */}
            <div className="flex flex-col gap-4 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-end">
              <p className="text-sm font-medium text-[var(--text)]">Advanced Filters:</p>
              <div className="w-full sm:w-40">
                <Select
                  label="Urgency"
                  options={urgencyOptions}
                  value={urgencyFilter}
                  onChange={(val) => {
                    setUrgencyFilter(val);
                    setPage(1);
                  }}
                />
              </div>
              <div className="w-full sm:w-40">
                <Select
                  label="Featured"
                  options={featuredOptions}
                  value={featuredFilter}
                  onChange={(val) => {
                    setFeaturedFilter(val);
                    setPage(1);
                  }}
                />
              </div>
              <div className="w-full sm:w-40">
                <Select
                  label="Confidential"
                  options={confidentialOptions}
                  value={confidentialFilter}
                  onChange={(val) => {
                    setConfidentialFilter(val);
                    setPage(1);
                  }}
                />
              </div>
              {(urgencyFilter || featuredFilter || confidentialFilter) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setUrgencyFilter('');
                    setFeaturedFilter('');
                    setConfidentialFilter('');
                    setPage(1);
                  }}
                  tooltip="Reset advanced filters"
                >
                  Clear Advanced
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Job Cards */}
        <div className="space-y-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <Skeleton variant="card" />
              </Card>
            ))
          ) : jobs.length > 0 ? (
            jobs.map((job: any) => (
              <Card key={job.id} className="transition-shadow hover:shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  {/* Checkbox for bulk selection */}
                  <div className="flex items-start">
                    <input
                      type="checkbox"
                      checked={selectedJobs.has(job.id)}
                      onChange={() => toggleJobSelection(job.id)}
                      className="text-primary focus:ring-primary mt-1 h-4 w-4 rounded border-[var(--border)] focus:ring-2"
                    />
                  </div>
                  {/* Job Info */}
                  <div className="flex min-w-0 flex-1 gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
                      {job.company?.logo ? (
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
                      <h3 className="truncate font-medium text-[var(--text)]">{job.title}</h3>
                      <p className="text-sm text-[var(--text-muted)]">
                        {job.company?.companyName || 'Unknown Company'}
                        {job.company?.isVerified ? (
                          <Tooltip content="GST Verified" inline>
                            <span className="ml-1 inline-block">
                              <CheckCircle className="h-3.5 w-3.5 text-[var(--success)]" />
                            </span>
                          </Tooltip>
                        ) : (
                          <Tooltip content="Not Verified" inline>
                            <span className="ml-1 text-[10px] text-[var(--text-muted)]">
                              (Not Verified)
                            </span>
                          </Tooltip>
                        )}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Posted {formatDate(job.createdAt)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          {job.views ?? 0} views
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {job._applicationCount ?? 0} applications
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Status + Actions */}
                  <div className="flex shrink-0 items-center gap-3">
                    <Badge variant={getStatusBadgeVariant(job.status)}>
                      {JOB_STATUS_LABELS[job.status] || job.status}
                    </Badge>
                    <div className="flex items-center gap-2">
                      <Tooltip content="View job details">
                        <Link href={`/super-admin/jobs/${job.id}`}>
                          <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<Eye className="h-3.5 w-3.5" />}
                            tooltip="View job details"
                          >
                            View
                          </Button>
                        </Link>
                      </Tooltip>
                      <Tooltip content="Edit this job">
                        <Link href={`/super-admin/jobs/${job.id}/edit`}>
                          <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<Pencil className="h-3.5 w-3.5" />}
                            tooltip="Edit this job"
                          >
                            Edit
                          </Button>
                        </Link>
                      </Tooltip>
                      <Button
                        variant="outline"
                        size="sm"
                        leftIcon={<CheckCircle className="h-3.5 w-3.5" />}
                        onClick={() => handleApprove(job)}
                        disabled={moderateMutation.isPending}
                        tooltip="Approve and publish this job"
                      >
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        leftIcon={<XCircle className="h-3.5 w-3.5" />}
                        onClick={() => setRejectTarget(job)}
                        className="text-error border-error/30 hover:bg-[var(--error-light)]"
                        tooltip="Reject this job posting"
                      >
                        Reject
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<Flag className="h-3.5 w-3.5" />}
                        onClick={() => setFlagTarget(job)}
                        className="text-[var(--warning)]"
                        tooltip="Flag this job for review"
                      >
                        Flag
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                        onClick={() => setDeleteTarget(job)}
                        className="text-error"
                        tooltip="Delete this job permanently"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <EmptyState
              icon={Briefcase}
              title="No jobs found"
              description="There are no jobs matching your filters."
            />
          )}
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 0 && (
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

        {/* Reject Modal */}
        <Modal
          isOpen={!!rejectTarget}
          onClose={() => {
            setRejectTarget(null);
            setRejectReason('');
          }}
          title="Reject Job"
          size="sm"
          footer={
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setRejectTarget(null);
                  setRejectReason('');
                }}
                tooltip="Cancel rejection"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                isLoading={moderateMutation.isPending}
                disabled={!rejectReason.trim()}
                tooltip="Confirm job rejection"
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
                <span className="font-medium text-[var(--text)]">{rejectTarget?.title}</span>. The
                employer will be notified.
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
          isOpen={!!flagTarget}
          onClose={() => {
            setFlagTarget(null);
            setFlagReason('');
          }}
          title="Flag Job"
          size="sm"
          footer={
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setFlagTarget(null);
                  setFlagReason('');
                }}
                tooltip="Cancel flagging"
              >
                Cancel
              </Button>
              <Button
                onClick={handleFlag}
                isLoading={flagMutation.isPending}
                disabled={!flagReason.trim()}
                tooltip="Confirm flagging this job"
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
                Flag <span className="font-medium text-[var(--text)]">{flagTarget?.title}</span> for
                review. Provide a reason below.
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

        {/* Delete Confirmation Modal */}
        <Modal
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          title="Delete Job"
          size="sm"
          footer={
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setDeleteTarget(null)}
                tooltip="Cancel deletion"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
                isLoading={deleteMutation.isPending}
                tooltip="Permanently delete this job"
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
              <span className="font-medium text-[var(--text)]">{deleteTarget?.title}</span>? This
              action cannot be undone.
            </p>
          </div>
        </Modal>

        {/* Bulk Approve Modal */}
        <Modal
          isOpen={showBulkApproveModal}
          onClose={() => setShowBulkApproveModal(false)}
          title="Bulk Approve Jobs"
          size="sm"
          footer={
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowBulkApproveModal(false)}
                tooltip="Cancel bulk approval"
              >
                Cancel
              </Button>
              <Button
                onClick={handleBulkApprove}
                isLoading={bulkApproveMutation.isPending}
                tooltip="Confirm approving selected jobs"
              >
                Approve {selectedJobs.size} Job{selectedJobs.size !== 1 ? 's' : ''}
              </Button>
            </div>
          }
        >
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 shrink-0 text-[var(--success)]" />
            <p className="text-sm text-[var(--text-secondary)]">
              Are you sure you want to approve {selectedJobs.size} selected job
              {selectedJobs.size !== 1 ? 's' : ''}? They will be published and visible to
              candidates.
            </p>
          </div>
        </Modal>

        {/* Bulk Delete Modal */}
        <Modal
          isOpen={showBulkDeleteModal}
          onClose={() => setShowBulkDeleteModal(false)}
          title="Bulk Delete Jobs"
          size="sm"
          footer={
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowBulkDeleteModal(false)}
                tooltip="Cancel bulk deletion"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleBulkDelete}
                tooltip="Permanently delete selected jobs"
              >
                Delete {selectedJobs.size} Job{selectedJobs.size !== 1 ? 's' : ''}
              </Button>
            </div>
          }
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="text-error h-5 w-5 shrink-0" />
            <p className="text-sm text-[var(--text-secondary)]">
              Are you sure you want to permanently delete {selectedJobs.size} selected job
              {selectedJobs.size !== 1 ? 's' : ''}? This action cannot be undone.
            </p>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
