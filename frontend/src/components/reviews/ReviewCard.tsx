'use client';

/**
 * ReviewCard — full review-card surface used on the dedicated reviews
 * page, the candidate review history page, the employer panel, and
 * super-admin moderation.
 *
 * Sections:
 *   - Top: overall rating + designation + location + review date,
 *     department + employment-type meta row
 *   - Top-right badges: Latest (createdAt ≥ now-30d), Detailed (isDetailed)
 *   - Middle: 7-criteria bar grid (CriteriaBars)
 *   - Body: Likes / Dislikes / Work details (each with a heading)
 *   - Footer: Helpful / Not-helpful / Share / (optional) admin action slot
 *
 * The `extra` prop slot lets callers inject role-specific actions
 * (super-admin Approve/Flag/Reject/Delete buttons; candidate Delete).
 */
import { useState } from 'react';
import { ThumbsUp, ThumbsDown, Calendar, Briefcase, MapPin, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import StarRating from './StarRating';
import CriteriaBars from './CriteriaBars';
import ShareReviewMenu from './ShareReviewMenu';
import type { Review } from '@/types/review';

interface Props {
  review: Review;
  /** Public absolute URL for the review (drives the Share menu copy-link). */
  shareUrl: string;
  onVote?: (reviewId: string, helpful: boolean) => Promise<void> | void;
  onChipClick?: (chip: 'latest' | 'detailed') => void;
  /** Optional action slot — admin/employer specific buttons rendered in the footer. */
  extra?: React.ReactNode;
  /** When true, renders the company name + logo in the header. Used on candidate-history + super-admin views. */
  showCompany?: { name: string; logo: string | null; slug: string | null } | null;
  highlight?: boolean;
}

const EMPLOYMENT_LABEL: Record<string, string> = {
  PERMANENT: 'Permanent',
  CONTRACT: 'Contract',
  INTERNSHIP: 'Internship',
  TRAINEE: 'Trainee',
  PART_TIME: 'Part-time',
  TEMPORARY: 'Temporary',
  FREELANCE: 'Freelance',
};

const WORK_POLICY_LABEL: Record<string, string> = {
  PERMANENT_WFH: 'Remote',
  WORKING_FROM_OFFICE: 'On-site',
  HYBRID: 'Hybrid',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

function isLatest(iso: string): boolean {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  return d.getTime() >= Date.now() - 30 * 24 * 60 * 60 * 1000;
}

export default function ReviewCard({
  review,
  shareUrl,
  onVote,
  onChipClick,
  extra,
  showCompany,
  highlight,
}: Props) {
  const [voting, setVoting] = useState(false);
  const [optimistic, setOptimistic] = useState<{
    helpfulCount: number;
    notHelpfulCount: number;
    myVote: boolean | null;
  }>({
    helpfulCount: review.helpfulCount,
    notHelpfulCount: review.notHelpfulCount,
    myVote: review.myVote ?? null,
  });

  async function handleVote(helpful: boolean) {
    if (!onVote) return;
    if (voting) return;
    setVoting(true);
    // Optimistic update — toggle if same direction, flip if different.
    setOptimistic((prev) => {
      const same = prev.myVote === helpful;
      if (same) {
        return {
          ...prev,
          myVote: null,
          helpfulCount: prev.helpfulCount - (helpful ? 1 : 0),
          notHelpfulCount: prev.notHelpfulCount - (helpful ? 0 : 1),
        };
      }
      const flip = prev.myVote != null;
      return {
        myVote: helpful,
        helpfulCount: prev.helpfulCount + (helpful ? 1 : 0) - (flip && !helpful ? 1 : 0),
        notHelpfulCount: prev.notHelpfulCount + (helpful ? 0 : 1) - (flip && helpful ? 1 : 0),
      };
    });
    try {
      await onVote(review.id, helpful);
    } catch {
      // Revert on failure.
      setOptimistic({
        helpfulCount: review.helpfulCount,
        notHelpfulCount: review.notHelpfulCount,
        myVote: review.myVote ?? null,
      });
    } finally {
      setVoting(false);
    }
  }

  const latest = isLatest(review.createdAt);
  const detailed = review.isDetailed;

  return (
    <article
      id={`review-${review.id}`}
      className={cn(
        'relative rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 sm:p-5',
        highlight && 'ring-2 ring-[var(--primary)]',
      )}
    >
      {/* Top-right badges */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        {latest && (
          <button
            type="button"
            onClick={() => onChipClick?.('latest')}
            className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-700 uppercase transition-colors hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300"
            aria-label="Filter to latest reviews"
          >
            Latest
          </button>
        )}
        {detailed && (
          <button
            type="button"
            onClick={() => onChipClick?.('detailed')}
            className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-blue-700 uppercase transition-colors hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300"
            aria-label="Filter to detailed reviews"
          >
            Detailed
          </button>
        )}
      </div>

      {/* Header */}
      <header className="mb-3 pr-20">
        {showCompany && (
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)]">
            {showCompany.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={showCompany.logo}
                alt=""
                className="h-6 w-6 rounded bg-white object-contain"
              />
            )}
            <span>{showCompany.name}</span>
          </div>
        )}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-sm font-semibold text-amber-900 dark:border-amber-700/30 dark:bg-amber-900/10 dark:text-amber-200">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            {review.overallRating.toFixed(1)}
          </span>
          <span className="font-semibold text-[var(--text)]">{review.designation}</span>
          {review.workLocation && (
            <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {review.workLocation}
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
            <Calendar className="h-3 w-3" aria-hidden="true" />
            {formatDate(review.createdAt)}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--text-secondary)]">
          <span className="inline-flex items-center gap-1">
            <Briefcase className="h-3 w-3" aria-hidden="true" />
            {review.department}
          </span>
          <span>·</span>
          <span>{EMPLOYMENT_LABEL[review.employmentType] ?? review.employmentType}</span>
          <span>·</span>
          <span>{WORK_POLICY_LABEL[review.workPolicy] ?? review.workPolicy}</span>
          <span>·</span>
          <span>{review.currentlyWorking ? 'Currently works here' : 'Former employee'}</span>
        </div>
      </header>

      {/* Criteria bars */}
      <CriteriaBars
        criteria={[
          { label: 'Work-life balance', value: review.ratingWorkLifeBalance },
          { label: 'Salary', value: review.ratingSalary },
          { label: 'Promotions', value: review.ratingPromotions },
          { label: 'Job security', value: review.ratingJobSecurity },
          { label: 'Skill development', value: review.ratingSkillDev },
          { label: 'Work satisfaction', value: review.ratingWorkSatisfaction },
          { label: 'Company culture', value: review.ratingCompanyCulture },
        ]}
        className="mb-4"
      />

      {/* Body */}
      {(review.likes || review.dislikes || review.workDetails) && (
        <div className="space-y-3">
          {review.likes && <BodySection heading="Likes" content={review.likes} accent="emerald" />}
          {review.dislikes && (
            <BodySection heading="Dislikes" content={review.dislikes} accent="rose" />
          )}
          {review.workDetails && (
            <BodySection heading="Work details" content={review.workDetails} accent="blue" />
          )}
        </div>
      )}

      {/* Footer */}
      <footer className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3 text-sm">
        <button
          type="button"
          onClick={() => handleVote(true)}
          disabled={voting || !onVote}
          aria-pressed={optimistic.myVote === true}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
            optimistic.myVote === true
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]',
            (voting || !onVote) && 'cursor-not-allowed opacity-60',
          )}
        >
          <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Helpful</span>
          <span className="tabular-nums">({optimistic.helpfulCount})</span>
        </button>
        <button
          type="button"
          onClick={() => handleVote(false)}
          disabled={voting || !onVote}
          aria-pressed={optimistic.myVote === false}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
            optimistic.myVote === false
              ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]',
            (voting || !onVote) && 'cursor-not-allowed opacity-60',
          )}
        >
          <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Not helpful</span>
          <span className="tabular-nums">({optimistic.notHelpfulCount})</span>
        </button>
        <ShareReviewMenu
          url={shareUrl}
          title={`${review.designation} review`}
          excerpt={review.likes ?? review.workDetails ?? undefined}
        />
        {extra && <div className="ml-auto flex items-center gap-2">{extra}</div>}
      </footer>

      {/* Star rating + emoji label sub-row — invisible visually but
          provides structured data for screen-readers. */}
      <span className="sr-only">
        <StarRating value={review.overallRating} readonly />
      </span>
    </article>
  );
}

function BodySection({
  heading,
  content,
  accent,
}: {
  heading: string;
  content: string;
  accent: 'emerald' | 'rose' | 'blue';
}) {
  const accentClass =
    accent === 'emerald'
      ? 'border-l-emerald-400'
      : accent === 'rose'
        ? 'border-l-rose-400'
        : 'border-l-blue-400';
  return (
    <div className={cn('border-l-4 pl-3', accentClass)}>
      <h4 className="text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">
        {heading}
      </h4>
      <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-[var(--text)]">
        {content}
      </p>
    </div>
  );
}
