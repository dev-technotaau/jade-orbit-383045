'use client';

/**
 * /candidate/reviews — candidate's own review history.
 *
 * Lists every review the user has submitted (auth-bound; guests don't
 * have history since their reviews are dedup'd by fingerprint, not
 * userId). Each row links back to the public reviews page focused on
 * that review id. Delete is supported; edit is not (reviews are
 * immutable post-submit).
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { PenLine, Trash2, ExternalLink, Star } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import Pagination from '@/components/ui/Pagination';
import Badge from '@/components/ui/Badge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { showToast } from '@/components/ui/Toast';
import ReviewCard from '@/components/reviews/ReviewCard';
import { companyReviewService } from '@/services/company-review.service';
import type { OwnReview, ReviewStatus } from '@/types/review';

const PAGE_SIZE = 10;

const STATUS_VARIANT: Record<
  ReviewStatus,
  { variant: 'success' | 'warning' | 'error' | 'info' | 'neutral'; label: string }
> = {
  APPROVED: { variant: 'success', label: 'Visible' },
  PENDING: { variant: 'info', label: 'Pending review' },
  FLAGGED: { variant: 'warning', label: 'Flagged' },
  REJECTED: { variant: 'error', label: 'Rejected' },
  DELETED: { variant: 'neutral', label: 'Deleted' },
};

export default function CandidateReviewsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['candidate', 'reviews', page, pageSize],
    queryFn: () => companyReviewService.listOwn(page, pageSize),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => companyReviewService.deleteOwn(id),
    onSuccess: () => {
      showToast.success('Review deleted');
      queryClient.invalidateQueries({ queryKey: ['candidate', 'reviews'] });
    },
    onError: () => {
      showToast.error('Failed to delete review');
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
    <DashboardLayout requiredRole={['CANDIDATE']}>
      <div className="space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">My reviews</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Reviews you&apos;ve shared on companies — visible to other candidates after
              moderation.
            </p>
          </div>
          <Link
            href="/reviews/write"
            className="inline-flex items-center gap-2 rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white shadow"
          >
            <PenLine className="h-4 w-4" />
            Write a new review
          </Link>
        </header>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} padding="lg">
                <Skeleton variant="text" lines={5} />
              </Card>
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Star}
            title="You haven't submitted any reviews yet"
            description="Help other candidates by sharing your experience at a company you've worked at."
            action={
              <Link
                href="/reviews/write"
                className="inline-flex items-center gap-2 rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white"
              >
                <PenLine className="h-4 w-4" />
                Write your first review
              </Link>
            }
          />
        ) : (
          <div className="space-y-4">
            {items.map((review) => (
              <ReviewCardWithStatus
                key={review.id}
                review={review}
                appOrigin={appOrigin}
                onDelete={() => setConfirmDeleteId(review.id)}
              />
            ))}
          </div>
        )}

        {total > 0 && (
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
        )}
      </div>

      <ConfirmDialog
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          if (confirmDeleteId) {
            deleteMutation.mutate(confirmDeleteId);
            setConfirmDeleteId(null);
          }
        }}
        title="Delete this review?"
        message="This will permanently remove your review. You won't be able to edit it later — but you can submit a new one."
        confirmLabel="Delete"
        variant="danger"
      />
    </DashboardLayout>
  );
}

function ReviewCardWithStatus({
  review,
  appOrigin,
  onDelete,
}: {
  review: OwnReview;
  appOrigin: string;
  onDelete: () => void;
}) {
  const status = STATUS_VARIANT[review.status];
  const reviewsHref = `/companies/${encodeURIComponent(review.company.slug ?? review.company.id)}/reviews?focus=${review.id}`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={status.variant} size="sm">
          {status.label}
        </Badge>
        <Link
          href={reviewsHref}
          className="inline-flex items-center gap-1 text-xs text-[var(--primary)] hover:underline"
        >
          View on company page
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <ReviewCard
        review={review}
        shareUrl={`${appOrigin}${reviewsHref}`}
        showCompany={{
          name: review.company.companyName,
          logo: review.company.logo,
          slug: review.company.slug,
        }}
        extra={
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:bg-rose-50 hover:text-rose-700"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        }
      />
    </div>
  );
}
