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
import { showToast } from '@/components/ui/Toast';
import { adminService } from '@/services/admin.service';
import { PAGINATION, QUERY_KEYS } from '@/constants/config';
import { JOB_STATUS_LABELS } from '@/constants/enums';
import { formatDate } from '@/lib/utils';
import type { ApiError } from '@/types/api';
import Tooltip from '@/components/ui/Tooltip';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'OPEN', label: 'Open' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'EXPIRED', label: 'Expired' },
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

export default function JobModerationPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGINATION.DEFAULT_LIMIT);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Modals
  const [rejectTarget, setRejectTarget] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [flagTarget, setFlagTarget] = useState<any>(null);
  const [flagReason, setFlagReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  const filters: Record<string, string | number | undefined> = {
    keyword: keyword || undefined,
    status: statusFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    limit: pageSize,
  };

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.ADMIN.JOBS(filters as Record<string, unknown>),
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

  return (
    <DashboardLayout requiredRole={['ADMIN', 'SUPER_ADMIN']} requiredPermission="jobs.listing.view">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Job Management</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Review, approve, reject, flag, and delete job listings.
          </p>
        </div>

        {/* Filters */}
        <Card>
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
                        <Link href={`/admin/jobs/${job.id}`}>
                          <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<Eye className="h-3.5 w-3.5" />}
                          >
                            View
                          </Button>
                        </Link>
                      </Tooltip>
                      <Button
                        variant="outline"
                        size="sm"
                        tooltip="Approve this job listing"
                        leftIcon={<CheckCircle className="h-3.5 w-3.5" />}
                        onClick={() => handleApprove(job)}
                        disabled={moderateMutation.isPending}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        tooltip="Reject this job listing"
                        leftIcon={<XCircle className="h-3.5 w-3.5" />}
                        onClick={() => setRejectTarget(job)}
                        className="text-error border-error/30 hover:bg-[var(--error-light)]"
                      >
                        Reject
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        tooltip="Flag this job for review"
                        leftIcon={<Flag className="h-3.5 w-3.5" />}
                        onClick={() => setFlagTarget(job)}
                        className="text-[var(--warning)]"
                      >
                        Flag
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        tooltip="Delete this job listing"
                        leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                        onClick={() => setDeleteTarget(job)}
                        className="text-error"
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
        {pagination && (
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
                tooltip="Cancel rejection"
                onClick={() => {
                  setRejectTarget(null);
                  setRejectReason('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                tooltip="Confirm job rejection"
                onClick={handleReject}
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
                tooltip="Cancel flagging"
                onClick={() => {
                  setFlagTarget(null);
                  setFlagReason('');
                }}
              >
                Cancel
              </Button>
              <Button
                tooltip="Confirm flagging this job"
                onClick={handleFlag}
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
                tooltip="Cancel deletion"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                tooltip="Permanently delete this job"
                onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
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
              <span className="font-medium text-[var(--text)]">{deleteTarget?.title}</span>? This
              action cannot be undone.
            </p>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
