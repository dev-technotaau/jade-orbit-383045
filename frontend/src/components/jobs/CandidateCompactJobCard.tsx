'use client';

/**
 * CandidateCompactJobCard — condensed list-row variant for the
 * authenticated candidate surface. Extracted verbatim from
 * /candidate/jobs/page.tsx so the markup is reusable on saved/applied
 * pages without copy-pasting the same 200-line block.
 *
 * The visual + interaction surface MUST stay byte-equivalent to the
 * original (CompactJobCard in candidate/jobs/page.tsx) — any divergence
 * is a regression.
 */

import Link from 'next/link';
import Image from 'next/image';
import {
  MapPin,
  Briefcase,
  Building2,
  Bookmark,
  BookmarkCheck,
  Navigation,
  GitCompareArrows,
  CheckCircle,
} from 'lucide-react';
import Tooltip from '@/components/ui/Tooltip';
import HighlightText from '@/components/ui/HighlightText';
import RatingBadge from '@/components/reviews/RatingBadge';
import { isOptimisableImageHost } from '@/lib/image-host';
import { cn, formatRelativeDate, formatSalaryRange, isPostedWithin } from '@/lib/utils';
import { formatSalaryAsLPA, haversineKm } from '@/utils/format';
import { ROUTES } from '@/constants/routes';
import type { Job } from '@/types/job';

export interface CandidateCompactJobCardProps {
  job: Job;
  searchKeyword?: string;
  isSaved: boolean;
  isApplied?: boolean;
  onSave: () => void;
  isSaving: boolean;
  candidateSkills?: Set<string>;
  userLat?: number;
  userLng?: number;
  isComparing?: boolean;
  onToggleCompare?: () => void;
}

export default function CandidateCompactJobCard({
  job,
  searchKeyword,
  isSaved,
  isApplied,
  onSave,
  isSaving,
  candidateSkills,
  userLat,
  userLng,
  isComparing,
  onToggleCompare,
}: CandidateCompactJobCardProps) {
  const showLPA = (job.currency || 'INR').toUpperCase() === 'INR' && job.salaryType === 'ANNUAL';
  const isNew = isPostedWithin(job.createdAt, 24);
  const distanceKm =
    userLat && userLng && job.latitude && job.longitude
      ? haversineKm(userLat, userLng, job.latitude, job.longitude)
      : undefined;

  const skillMatchCount =
    candidateSkills?.size && job.skillsRequired?.length
      ? job.skillsRequired.filter((s) => candidateSkills.has(s.toLowerCase())).length
      : 0;
  const skillMatchPct = job.skillsRequired?.length
    ? Math.round((skillMatchCount / job.skillsRequired.length) * 100)
    : 0;

  return (
    <div className="group hover:border-primary/20 flex items-center gap-3 rounded-xl border border-[var(--border)] bg-white px-4 py-3 transition-all hover:shadow-sm">
      {/* Logo */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
        {job.isConfidential ? (
          <Briefcase className="h-5 w-5 text-[var(--text-muted)]" />
        ) : job.company?.logo ? (
          <Image
            src={job.company.logo}
            alt={job.company.companyName}
            width={32}
            height={32}
            sizes="32px"
            loading="lazy"
            unoptimized={!isOptimisableImageHost(job.company.logo)}
            className="h-8 w-8 rounded-md object-contain"
          />
        ) : (
          <Building2 className="h-5 w-5 text-[var(--text-muted)]" />
        )}
      </div>

      {/* Main info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Tooltip content={`View details for ${job.title}`}>
            <Link
              href={ROUTES.CANDIDATE.JOB_DETAIL(job.id)}
              className="hover:text-primary truncate text-sm font-semibold text-[var(--text)] transition-colors"
            >
              <HighlightText text={job.title} highlight={searchKeyword} />
            </Link>
          </Tooltip>
          {isNew && (
            <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">
              New
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span className="truncate">
            {job.isConfidential
              ? 'Confidential'
              : job.clientCompanyName
                ? `${job.clientCompanyName} via ${job.company?.companyName}`
                : job.company?.companyName}
          </span>
          {((job.company as { totalReviews?: number })?.totalReviews ?? 0) > 0 && (
            <RatingBadge
              rating={(job.company as { averageRating?: number })?.averageRating ?? 0}
              count={(job.company as { totalReviews?: number })?.totalReviews ?? 0}
              size="xs"
              showCount={false}
              href={
                (job.company as { slug?: string | null })?.slug
                  ? `/companies/${encodeURIComponent((job.company as { slug?: string | null })!.slug!)}/reviews`
                  : undefined
              }
            />
          )}
          <span className="shrink-0">|</span>
          <span className="flex shrink-0 items-center gap-0.5">
            <MapPin className="h-3 w-3" />
            {job.location}
          </span>
          <span className="shrink-0">|</span>
          <span className="shrink-0">
            {showLPA
              ? formatSalaryAsLPA(job.salaryMin, job.salaryMax)
              : formatSalaryRange(job.salaryMin, job.salaryMax, job.currency)}
          </span>
          <span className="shrink-0">|</span>
          <span className="shrink-0">{formatRelativeDate(job.createdAt)}</span>
          {distanceKm != null && (
            <>
              <span className="shrink-0">|</span>
              <span
                className={cn(
                  'flex shrink-0 items-center gap-0.5',
                  distanceKm < 10 ? 'text-emerald-600' : distanceKm < 30 ? 'text-amber-600' : '',
                )}
              >
                <Navigation className="h-3 w-3" />
                {distanceKm < 1 ? '<1 km' : `${distanceKm.toFixed(1)} km`}
              </span>
            </>
          )}
        </div>
        {/* Skills row */}
        {(job.skillsRequired?.length ?? 0) > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {skillMatchCount > 0 && (
              <span
                className={cn(
                  'mr-0.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                  skillMatchPct >= 70
                    ? 'bg-emerald-50 text-emerald-700'
                    : skillMatchPct >= 40
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-slate-100 text-slate-600',
                )}
              >
                {skillMatchPct}%
              </span>
            )}
            {job.skillsRequired.slice(0, 4).map((skill) => {
              const isMatch = candidateSkills?.has(skill.toLowerCase());
              return (
                <span
                  key={skill}
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10px]',
                    isMatch
                      ? 'bg-emerald-50 font-medium text-emerald-700'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]',
                  )}
                >
                  {skill}
                </span>
              );
            })}
            {job.skillsRequired.length > 4 && (
              <span className="text-[10px] text-[var(--text-muted)]">
                +{job.skillsRequired.length - 4}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1.5">
        {isApplied && (
          <span className="flex items-center gap-1 rounded-lg bg-[var(--success)]/10 px-2 py-1 text-[10px] font-medium text-[var(--success)]">
            <CheckCircle className="h-3 w-3" />
            Applied
          </span>
        )}
        <Tooltip content="View job details">
          <Link
            href={ROUTES.CANDIDATE.JOB_DETAIL(job.id)}
            className="bg-primary/10 text-primary hover:bg-primary/20 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
          >
            View
          </Link>
        </Tooltip>
        {onToggleCompare && (
          <Tooltip content={isComparing ? 'Remove from comparison' : 'Compare'}>
            <button
              onClick={onToggleCompare}
              className={cn(
                'cursor-pointer rounded-lg p-1.5 transition-colors',
                isComparing
                  ? 'text-primary bg-primary/10'
                  : 'hover:text-primary text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]',
              )}
              aria-label={isComparing ? 'Remove from comparison' : 'Add to comparison'}
            >
              <GitCompareArrows className="h-4 w-4" />
            </button>
          </Tooltip>
        )}
        <Tooltip content={isSaved ? 'Unsave' : 'Save'}>
          <button
            onClick={onSave}
            disabled={isSaving}
            className={cn(
              'cursor-pointer rounded-lg p-1.5 transition-colors disabled:opacity-50',
              isSaved
                ? 'text-primary bg-primary/10'
                : 'hover:text-primary text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]',
            )}
            aria-label={isSaved ? 'Unsave job' : 'Save job'}
          >
            {isSaved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
