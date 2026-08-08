'use client';

/**
 * /employer/reviews — employer's tracking dashboard for their own
 * company's reviews.
 *
 *   - KPI cards: average overall, total reviews, distribution
 *   - Filters + sort identical to the public reviews page
 *   - Per-review report button (employer can flag suspicious reviews
 *     for super-admin moderation)
 */
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Star, Flag, AlertCircle } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import { showToast } from '@/components/ui/Toast';
import RatingDistributionBar from '@/components/reviews/RatingDistributionBar';
import CriteriaBars from '@/components/reviews/CriteriaBars';
import ReviewFiltersBar from '@/components/reviews/ReviewFiltersBar';
import ReviewCard from '@/components/reviews/ReviewCard';
import { companyReviewService } from '@/services/company-review.service';
import type { ReviewChip, ReviewSort } from '@/types/review';

const PAGE_SIZE = 10;

export default function EmployerReviewsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE);
  const [chip, setChip] = useState<ReviewChip | undefined>(undefined);
  const [sort, setSort] = useState<ReviewSort>('latest');
  const [reportTarget, setReportTarget] = useState<string | null>(null);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['employer', 'reviews', 'stats'],
    queryFn: () => companyReviewService.getEmployerStats(),
  });

  const { data: list, isLoading: listLoading } = useQuery({
    queryKey: ['employer', 'reviews', 'list', page, sort, chip, pageSize],
    queryFn: () =>
      companyReviewService.listEmployer({
        page,
        limit: pageSize,
        sort,
        chip,
      }),
  });

  const items = list?.items ?? [];
  const total = list?.pagination.total ?? 0;
  const totalPages = list?.pagination.totalPages ?? 0;

  const appOrigin =
    typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || 'https://hireadda.com';

  return (
    <DashboardLayout requiredRole={['EMPLOYER']}>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-[var(--text)]">Reviews & ratings</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            How candidates perceive your company. Reviews are anonymous and moderated. Suspicious
            reviews can be flagged for the Hire Adda team to investigate.
          </p>
        </header>

        {/* KPI cards */}
        {statsLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} padding="lg">
                <Skeleton variant="text" lines={3} />
              </Card>
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card padding="lg">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">
                  Overall rating
                </span>
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              </div>
              <div className="mt-1 text-3xl font-bold text-[var(--text)]">
                {stats.averageOverall ? stats.averageOverall.toFixed(1) : '—'}
              </div>
              <div className="text-xs text-[var(--text-secondary)]">
                from {stats.totalReviews.toLocaleString()}{' '}
                {stats.totalReviews === 1 ? 'review' : 'reviews'}
              </div>
            </Card>
            <Card padding="lg">
              <div className="text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">
                Distribution
              </div>
              <div className="mt-2">
                <RatingDistributionBar distribution={stats.distribution} showCounts />
              </div>
            </Card>
            <Card padding="lg">
              <div className="text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">
                vs Industry
              </div>
              <div className="mt-1 text-3xl font-bold text-[var(--text)]">
                {stats.industry.diff != null
                  ? `${stats.industry.diff > 0 ? '+' : ''}${stats.industry.diff.toFixed(1)}`
                  : '—'}
              </div>
              <div className="text-xs text-[var(--text-secondary)]">
                {stats.industry.average != null && stats.industry.name
                  ? `${stats.industry.name} avg ${stats.industry.average.toFixed(1)}`
                  : 'Industry data unavailable'}
              </div>
            </Card>
          </div>
        ) : null}

        {stats && stats.totalReviews > 0 && (
          <Card padding="lg">
            <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">Average per criteria</h2>
            <CriteriaBars
              criteria={[
                { label: 'Work-life balance', value: stats.averageWorkLifeBalance },
                { label: 'Salary', value: stats.averageSalary },
                { label: 'Promotions', value: stats.averagePromotions },
                { label: 'Job security', value: stats.averageJobSecurity },
                { label: 'Skill development', value: stats.averageSkillDev },
                { label: 'Work satisfaction', value: stats.averageWorkSatisfaction },
                { label: 'Company culture', value: stats.averageCompanyCulture },
              ]}
            />
          </Card>
        )}

        <ReviewFiltersBar
          totalReviews={total}
          activeChip={chip}
          activeSort={sort}
          onChipClick={(c) => {
            setChip(c);
            setPage(1);
          }}
          onSortChange={(s) => {
            setSort(s);
            setPage(1);
          }}
        />

        {listLoading ? (
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
            title="No reviews yet"
            description="Reviews will show up here as candidates share their experience working at your company."
          />
        ) : (
          <div className="space-y-3">
            {items.map((review) => (
              <ReviewCard
                key={review.id}
                review={review}
                shareUrl={`${appOrigin}/companies/?focus=${review.id}`}
                extra={
                  <button
                    type="button"
                    onClick={() => setReportTarget(review.id)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:bg-amber-50 hover:text-amber-700"
                  >
                    <Flag className="h-3.5 w-3.5" />
                    Report
                  </button>
                }
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

      {reportTarget && (
        <ReportReviewModal reviewId={reportTarget} onClose={() => setReportTarget(null)} />
      )}
    </DashboardLayout>
  );
}

function ReportReviewModal({ reviewId, onClose }: { reviewId: string; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');

  const reportMutation = useMutation({
    mutationFn: () => companyReviewService.employerReport(reviewId, reason, details),
    onSuccess: () => {
      showToast.success('Report submitted — our team will review it.');
      onClose();
    },
    onError: () => {
      showToast.error('Failed to submit report. Please try again.');
    },
  });

  return (
    <Modal isOpen onClose={onClose} title="Report review" size="md">
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-stone-900 dark:border-amber-700/40 dark:bg-amber-900/10 dark:text-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Reports are reviewed by Hire Adda&apos;s moderation team. Reviews removed without cause
            will be reinstated.
          </span>
        </div>
        <div>
          <label
            htmlFor="report-reason"
            className="mb-1 block text-sm font-medium text-[var(--text)]"
          >
            Reason
          </label>
          <Select
            id="report-reason"
            value={reason}
            onChange={(val) => setReason(val)}
            placeholder="Select a reason"
            clearable={false}
            options={[
              { value: 'false_employment', label: 'False or fabricated employment' },
              { value: 'defamation', label: 'Defamation / personal attacks' },
              { value: 'confidential_info', label: 'Discloses confidential information' },
              { value: 'spam', label: 'Spam or promotional content' },
              { value: 'other', label: 'Other' },
            ]}
            className="w-full"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--text)]">
            Details (optional)
          </label>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Provide context that helps our team review this report"
            rows={4}
            maxLength={1000}
            className="w-full resize-y rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!reason || reportMutation.isPending}
            onClick={() => reportMutation.mutate()}
          >
            Submit report
          </Button>
        </div>
      </div>
    </Modal>
  );
}
