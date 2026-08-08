'use client';

/**
 * /super-admin/reviews — moderation queue for company reviews.
 *
 * Three tabs:
 *   - All — every review (including approved + rejected + deleted)
 *   - Flagged — reviews with status=FLAGGED awaiting moderation
 *   - Reports — reviews with reportedCount > 0
 *
 * Per-review actions: Approve / Flag / Reject / Delete. Each action is
 * audit-logged on the backend with the action label
 * `MODERATE_COMPANY_REVIEW_<ACTION>`.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  CheckCircle,
  Flag,
  XCircle,
  Trash2,
  AlertTriangle,
  Search,
  ShieldAlert,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Can from '@/components/common/Can';
import { PERM } from '@/constants/permissions';
import Card from '@/components/ui/Card';
import Tabs from '@/components/ui/Tabs';
import Pagination from '@/components/ui/Pagination';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Tooltip from '@/components/ui/Tooltip';
import { showToast } from '@/components/ui/Toast';
import ReviewCard from '@/components/reviews/ReviewCard';
import { companyReviewService } from '@/services/company-review.service';
import type { AdminReview, ModerationAction, ReviewStatus } from '@/types/review';

const PAGE_SIZE = 20;

type TabKey = 'all' | 'flagged' | 'reports';

const TAB_LABELS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All reviews' },
  { key: 'flagged', label: 'Flagged' },
  { key: 'reports', label: 'Reports' },
];

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

export default function SuperAdminReviewsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams?.get('tab') as TabKey | null) ?? 'flagged';
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE);
  const [q, setQ] = useState('');
  const [moderateTarget, setModerateTarget] = useState<{
    id: string;
    action: ModerationAction;
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['super-admin', 'reviews', tab, page, q, pageSize],
    queryFn: () =>
      companyReviewService.listAdmin({
        tab,
        page,
        limit: pageSize,
        q: q || undefined,
      }),
  });

  const items = data?.items ?? [];
  const total = data?.pagination.total ?? 0;
  const totalPages = data?.pagination.totalPages ?? 0;

  const appOrigin =
    typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || 'https://hireadda.com';

  function handleTabChange(t: string) {
    const tabKey = t as TabKey;
    setTab(tabKey);
    setPage(1);
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('tab', tabKey);
    router.push(`?${params.toString()}`, { scroll: false });
  }

  return (
    <DashboardLayout requiredRole={['ADMIN', 'SUPER_ADMIN']} requiredPermission="reviews.view">
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-[var(--text)]">Reviews moderation</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Approve, flag, reject, or delete company reviews. Every action is audit-logged.
          </p>
        </header>

        <Tabs tabs={TAB_LABELS} activeTab={tab} onChange={handleTabChange} />

        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search by company, designation, department, or review text"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] py-2 pr-3 pl-9 text-sm focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] focus:outline-none"
          />
        </div>

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
            icon={ShieldAlert}
            title={
              tab === 'flagged'
                ? 'No flagged reviews'
                : tab === 'reports'
                  ? 'No reported reviews'
                  : 'No reviews match'
            }
            description="The queue is clear."
          />
        ) : (
          <div className="space-y-3">
            {items.map((review) => (
              <AdminReviewRow
                key={review.id}
                review={review}
                appOrigin={appOrigin}
                onModerate={(action) => setModerateTarget({ id: review.id, action })}
              />
            ))}
          </div>
        )}

        {totalPages > 0 && (
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

      {moderateTarget && (
        <ModerateModal target={moderateTarget} onClose={() => setModerateTarget(null)} />
      )}
    </DashboardLayout>
  );
}

function AdminReviewRow({
  review,
  appOrigin,
  onModerate,
}: {
  review: AdminReview;
  appOrigin: string;
  onModerate: (action: ModerationAction) => void;
}) {
  const status = STATUS_VARIANT[review.status];
  const reviewsHref = review.company?.slug
    ? `/companies/${encodeURIComponent(review.company.slug)}/reviews?focus=${review.id}`
    : '/super-admin/reviews';

  return (
    <div className="space-y-2">
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
        {!review.user && <span className="text-[var(--text-muted)]">guest submission</span>}
        {review.fingerprintHash && (
          <Tooltip content="Fingerprint hash (SHA-256 of IP+UA+day+companyId)">
            <span className="font-mono text-[10px] text-[var(--text-muted)]">
              fp: {review.fingerprintHash.slice(0, 12)}…
            </span>
          </Tooltip>
        )}
      </div>
      <ReviewCard
        review={review}
        shareUrl={`${appOrigin}${reviewsHref}`}
        showCompany={
          review.company
            ? {
                name: review.company.companyName,
                logo: review.company.logo,
                slug: review.company.slug,
              }
            : null
        }
        extra={
          /*
            Per-ACTION gating, not just per-page. The page opens on
            `reviews.view`, which the seeded "Read Only Auditor" role holds —
            without these an auditor saw four fully-enabled moderation
            buttons that all 403 on click. The API enforces the same keys
            (company-review.routes.ts); this keeps the UI honest about it.
          */
          <div className="flex flex-wrap gap-1">
            <Can permission={PERM.REVIEWS_APPROVE}>
              <button
                type="button"
                onClick={() => onModerate('APPROVE')}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
              >
                <CheckCircle className="h-3.5 w-3.5" /> Approve
              </button>
            </Can>
            <Can permission={PERM.REVIEWS_APPROVE}>
              <button
                type="button"
                onClick={() => onModerate('FLAG')}
                className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
              >
                <Flag className="h-3.5 w-3.5" /> Flag
              </button>
            </Can>
            <Can permission={PERM.REVIEWS_APPROVE}>
              <button
                type="button"
                onClick={() => onModerate('REJECT')}
                className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
              >
                <XCircle className="h-3.5 w-3.5" /> Reject
              </button>
            </Can>
            <Can permission={PERM.REVIEWS_DELETE}>
              <button
                type="button"
                onClick={() => onModerate('DELETE')}
                className="inline-flex items-center gap-1 rounded-md bg-[var(--bg-tertiary)] px-2 py-1 text-xs font-medium text-[var(--text-muted)] hover:bg-rose-100 hover:text-rose-700"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </Can>
          </div>
        }
      />
    </div>
  );
}

function ModerateModal({
  target,
  onClose,
}: {
  target: { id: string; action: ModerationAction };
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => companyReviewService.moderate(target.id, target.action, reason || undefined),
    onSuccess: () => {
      showToast.success(`Review ${target.action.toLowerCase()}d`);
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'reviews'] });
      onClose();
    },
    onError: () => {
      showToast.error('Moderation action failed');
    },
  });

  return (
    <Modal isOpen onClose={onClose} title={`${target.action} review`} size="md">
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-stone-900 dark:border-amber-700/40 dark:bg-amber-900/10 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            This action will be audit-logged with your user id. The review&apos;s company aggregate
            will refresh in the background.
          </span>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--text)]">
            Reason (optional)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Internal note for the audit log"
            className="w-full resize-y rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
            variant={
              target.action === 'DELETE' || target.action === 'REJECT' ? 'destructive' : undefined
            }
          >
            Confirm {target.action}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
