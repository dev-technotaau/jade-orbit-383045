'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ClipboardList, ChevronRight, Filter, RefreshCw } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import Select from '@/components/ui/Select';
import Pagination from '@/components/ui/Pagination';
import { showToast } from '@/components/ui/Toast';
import {
  assistedHiringService,
  type AssistedHiringStatus,
} from '@/services/assisted-hiring.service';
import type { ApiError } from '@/types/api';

const STATUS_OPTIONS: { value: AssistedHiringStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'CALL_SCHEDULED', label: 'Call scheduled' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const STATUS_BADGE: Record<AssistedHiringStatus, string> = {
  PENDING: 'bg-slate-100 text-slate-700',
  CALL_SCHEDULED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  DELIVERED: 'bg-emerald-100 text-emerald-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

export default function SuperAdminAssistedHiringPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<AssistedHiringStatus | ''>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['super-admin', 'assisted-hiring', { status, page, pageSize }],
    queryFn: () =>
      assistedHiringService.superAdmin.list({
        status: status || undefined,
        page,
        limit: pageSize,
      }),
  });

  const claim = useMutation({
    mutationFn: (id: string) => assistedHiringService.superAdmin.claim(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admin', 'assisted-hiring'] });
      showToast.success('Request claimed', 'You are now the dedicated specialist.');
    },
    onError: (err) => {
      const apiErr = err as unknown as ApiError;
      showToast.error(apiErr.message || 'Could not claim request');
    },
  });

  const totalPages = data?.pagination?.pages ?? 1;

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="assisted_hiring.view"
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Assisted hiring queue</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Paid sourcing requests waiting on a call, sourcing, or delivery.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-[var(--text-muted)]" />
              <Select
                options={STATUS_OPTIONS}
                value={status}
                onChange={(v) => {
                  setStatus(v as AssistedHiringStatus | '');
                  setPage(1);
                }}
              />
            </div>
            <Button
              variant="ghost"
              onClick={() => qc.invalidateQueries({ queryKey: ['super-admin', 'assisted-hiring'] })}
              disabled={isFetching}
            >
              <RefreshCw className={`mr-1 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
        </div>

        <Card padding="lg">
          {isLoading && (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          )}
          {!isLoading && (data?.items?.length ?? 0) === 0 && (
            <EmptyState
              icon={ClipboardList}
              title="No requests in this view"
              description="When employers buy the Assisted Hiring plan, their requests will land here."
            />
          )}
          {!isLoading && (data?.items?.length ?? 0) > 0 && (
            <ul className="divide-y divide-[var(--border)]">
              {data!.items.map((req) => (
                <li key={req.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                          STATUS_BADGE[req.status]
                        }`}
                      >
                        {req.status.replace('_', ' ')}
                      </span>
                      <h3 className="text-base font-semibold text-[var(--text)]">
                        {req.roleTitle}
                      </h3>
                      {req.matchedCount > 0 && (
                        <span className="text-xs text-[var(--text-muted)]">
                          · {req.matchedCount} profile{req.matchedCount === 1 ? '' : 's'} matched
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-[var(--text-muted)]">
                      {req.requirementText}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
                      <span>
                        Employer: {req.employer?.firstName ?? ''} {req.employer?.lastName ?? ''} ·{' '}
                        {req.employer?.email}
                      </span>
                      {req.preferredLocation && <span>📍 {req.preferredLocation}</span>}
                      {req.budgetRange && <span>💰 {req.budgetRange}</span>}
                      {req.assignedAdmin ? (
                        <span>
                          Owner: {req.assignedAdmin.firstName ?? ''}{' '}
                          {req.assignedAdmin.lastName ?? ''}
                        </span>
                      ) : (
                        <span className="font-semibold text-amber-700">Unclaimed</span>
                      )}
                      <span>· started {new Date(req.startedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!req.assignedAdminId && (
                      <Button
                        variant="outline"
                        onClick={() => claim.mutate(req.id)}
                        disabled={claim.isPending}
                      >
                        Claim
                      </Button>
                    )}
                    <Link href={`/super-admin/assisted-hiring/${req.id}`}>
                      <Button variant="primary">
                        Open <ChevronRight className="ml-1 h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {(data?.items?.length ?? 0) > 0 && (
            <div className="mt-4 flex justify-end">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
                pageSize={pageSize}
                onPageSizeChange={(s) => {
                  setPageSize(s);
                  setPage(1);
                }}
              />
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
