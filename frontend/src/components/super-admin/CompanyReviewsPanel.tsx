'use client';

/**
 * CompanyReviewsPanel — embedded super-admin drill-down panel for the
 * `/super-admin/teams/[companyId]` page.
 *
 * Renders a paginated list of reviews scoped to a single company,
 * including all statuses (APPROVED / FLAGGED / REJECTED / DELETED) so
 * admins can audit the full history. Per-row moderation actions
 * (Approve / Flag / Reject / Delete) hit the same backend endpoint as
 * the dedicated /super-admin/reviews page.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Flag, XCircle, Trash2, ShieldAlert, Star } from 'lucide-react';
import Card from '@/components/ui/Card';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';
import Badge from '@/components/ui/Badge';
import { showToast } from '@/components/ui/Toast';
import ReviewCard from '@/components/reviews/ReviewCard';
import Tooltip from '@/components/ui/Tooltip';
import { companyReviewService } from '@/services/company-review.service';
import type { ModerationAction, ReviewStatus } from '@/types/review';

const PAGE_SIZE = 10;

const STATUS_VARIANT: Record<
  ReviewStatus,
  { variant: 'success' | 'warning' | 'error' | 'info' | 'neutral'; label: string }
> = {
  APPROVED: { variant: 'success', label: 'Approved' },
  PENDING: { variant: 'info', label: 'Pending' },
  FLAGGED: { variant: 'warning', label: 'Flagged' },
  REJECTED: { variant: 'error', label: 'Rejected' },
  DELETED: { variant: 'neutral', label: 'Deleted' },
};

interface Props {
  companyId: string;
}

export default function CompanyReviewsPanel({ companyId }: Props) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE);

  const { data, isLoading } = useQuery({
    queryKey: ['super-admin', 'company-reviews', companyId, page, pageSize],
    queryFn: () =>
      companyReviewService.listAdminForCompany(companyId, {
        page,
        limit: pageSize,
        status: 'ALL',
        sort: 'latest',
      }),
    enabled: !!companyId,
  });

  const moderateMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: ModerationAction }) =>
      companyReviewService.moderate(id, action),
    onSuccess: (_, vars) => {
      showToast.success(`Review ${vars.action.toLowerCase()}d`);
      queryClient.invalidateQueries({
        queryKey: ['super-admin', 'company-reviews', companyId],
      });
    },
    onError: () => {
      showToast.error('Moderation action failed');
    },
  });

  const items = data?.items ?? [];
  const total = data?.pagination.total ?? 0;
  const totalPages = data?.pagination.totalPages ?? 0;

  const appOrigin =
    typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || 'https://hireadda.com';

  return (
    <Card padding="lg">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
          <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
          Reviews ({total.toLocaleString()})
        </h2>
        <div className="text-xs text-[var(--text-muted)]">
          Showing all statuses for this company
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} variant="text" lines={4} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="No reviews on this company"
          description="Reviews will appear here once candidates submit them."
        />
      ) : (
        <div className="space-y-3">
          {items.map((review) => {
            const status = STATUS_VARIANT[review.status];
            return (
              <div key={review.id} className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant={status.variant} size="sm">
                    {status.label}
                  </Badge>
                  {review.reportedCount > 0 && (
                    <Badge variant="warning" size="sm">
                      <Flag className="mr-1 h-3 w-3" />
                      {review.reportedCount} {review.reportedCount === 1 ? 'report' : 'reports'}
                    </Badge>
                  )}
                  {review.user && (
                    <span className="text-[var(--text-muted)]">
                      user: <strong>{review.user.email}</strong>
                    </span>
                  )}
                  {!review.user && <span className="text-[var(--text-muted)]">guest</span>}
                  {review.fingerprintHash && (
                    <Tooltip content="Fingerprint hash">
                      <span className="font-mono text-[10px] text-[var(--text-muted)]">
                        fp: {review.fingerprintHash.slice(0, 12)}…
                      </span>
                    </Tooltip>
                  )}
                </div>
                <ReviewCard
                  review={review}
                  shareUrl={`${appOrigin}/companies?focus=${review.id}`}
                  extra={
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        disabled={moderateMutation.isPending}
                        onClick={() =>
                          moderateMutation.mutate({ id: review.id, action: 'APPROVE' })
                        }
                        className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                      >
                        <CheckCircle className="h-3.5 w-3.5" /> Approve
                      </button>
                      <button
                        type="button"
                        disabled={moderateMutation.isPending}
                        onClick={() => moderateMutation.mutate({ id: review.id, action: 'FLAG' })}
                        className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                      >
                        <Flag className="h-3.5 w-3.5" /> Flag
                      </button>
                      <button
                        type="button"
                        disabled={moderateMutation.isPending}
                        onClick={() => moderateMutation.mutate({ id: review.id, action: 'REJECT' })}
                        className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
                      >
                        <XCircle className="h-3.5 w-3.5" /> Reject
                      </button>
                      <button
                        type="button"
                        disabled={moderateMutation.isPending}
                        onClick={() => moderateMutation.mutate({ id: review.id, action: 'DELETE' })}
                        className="inline-flex items-center gap-1 rounded-md bg-[var(--bg-tertiary)] px-2 py-1 text-xs font-medium text-[var(--text-muted)] hover:bg-rose-100 hover:text-rose-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  }
                />
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 0 && (
        <div className="mt-4">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={total}
            pageSize={pageSize}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        </div>
      )}
    </Card>
  );
}
