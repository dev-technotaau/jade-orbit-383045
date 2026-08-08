'use client';

/**
 * CandidateJobCard — full-list job card for the authenticated candidate
 * surface. Extracted verbatim from /candidate/jobs/page.tsx so it can be
 * reused outside the search page (saved jobs, recommendations, etc.)
 * without copy-pasting the same 350-line block.
 *
 * The visual + interaction surface MUST stay byte-equivalent to the
 * original — any divergence is a regression. If you find yourself
 * adjusting markup here, also adjust the public PublicJobCard so the
 * candidate / public surfaces stay visually aligned.
 */

import Link from 'next/link';
import Image from 'next/image';
import {
  MapPin,
  Briefcase,
  Building2,
  Clock,
  Bookmark,
  BookmarkCheck,
  ShieldCheck,
  Users,
  Navigation,
  Flame,
  Zap,
  ExternalLink,
  Send,
  GitCompareArrows,
  CheckCircle,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Tag from '@/components/ui/Tag';
import Tooltip from '@/components/ui/Tooltip';
import HighlightText from '@/components/ui/HighlightText';
import { isOptimisableImageHost } from '@/lib/image-host';
import RatingBadge from '@/components/reviews/RatingBadge';
import { cn, formatRelativeDate, formatSalaryRange, isPostedWithin, truncate } from '@/lib/utils';
import { formatSalaryAsLPA, haversineKm } from '@/utils/format';
import { JOB_TYPE_LABELS, WORK_MODE_LABELS, FUNCTIONAL_AREA_LABELS } from '@/constants/enums';
import { ROUTES } from '@/constants/routes';
import type { Job } from '@/types/job';

export interface CandidateJobCardProps {
  job: Job;
  searchKeyword?: string;
  isSaved: boolean;
  isApplied?: boolean;
  onSave: () => void;
  isSaving: boolean;
  onQuickApply?: () => void;
  isApplying?: boolean;
  candidateSkills?: Set<string>;
  userLat?: number;
  userLng?: number;
  isComparing?: boolean;
  onToggleCompare?: () => void;
}

export default function CandidateJobCard({
  job,
  searchKeyword,
  isSaved,
  isApplied,
  onSave,
  isSaving,
  onQuickApply,
  isApplying,
  candidateSkills,
  userLat,
  userLng,
  isComparing,
  onToggleCompare,
}: CandidateJobCardProps) {
  const showLPA = (job.currency || 'INR').toUpperCase() === 'INR' && job.salaryType === 'ANNUAL';
  const distanceKm =
    userLat && userLng && job.latitude && job.longitude
      ? haversineKm(userLat, userLng, job.latitude, job.longitude)
      : undefined;
  const isNew = isPostedWithin(job.createdAt, 24);
  const isHot =
    (job.urgencyLevel === 'URGENT' || job.urgencyLevel === 'IMMEDIATE') &&
    isPostedWithin(job.createdAt, 72);
  const canQuickApply =
    job.applyMethod === 'IN_PLATFORM' &&
    (!job.screeningQuestions || job.screeningQuestions.length === 0);

  const skillMatchCount =
    candidateSkills?.size && job.skillsRequired?.length
      ? job.skillsRequired.filter((s) => candidateSkills.has(s.toLowerCase())).length
      : 0;
  const skillMatchPct = job.skillsRequired?.length
    ? Math.round((skillMatchCount / job.skillsRequired.length) * 100)
    : 0;

  return (
    <Card className="hover:border-primary/20 transition-all hover:shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-tertiary)]">
            {job.isConfidential ? (
              <Briefcase className="h-6 w-6 text-[var(--text-muted)]" />
            ) : job.company?.logo ? (
              <Image
                src={job.company.logo}
                alt={job.company.companyName}
                width={40}
                height={40}
                sizes="40px"
                loading="lazy"
                unoptimized={!isOptimisableImageHost(job.company.logo)}
                className="h-10 w-10 rounded-lg object-contain"
              />
            ) : (
              <Building2 className="h-6 w-6 text-[var(--text-muted)]" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Tooltip content={`View details for ${job.title}`}>
                <Link
                  href={ROUTES.CANDIDATE.JOB_DETAIL(job.id)}
                  className="hover:text-primary text-base font-semibold text-[var(--text)] transition-colors"
                >
                  <HighlightText text={job.title} highlight={searchKeyword} />
                </Link>
              </Tooltip>
              {isNew && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">
                  <Zap className="h-2.5 w-2.5" />
                  New
                </span>
              )}
              {isHot && (
                <span className="bg-secondary-50 text-secondary inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
                  <Flame className="h-2.5 w-2.5" />
                  Hot
                </span>
              )}
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
              {job.isConfidential ? (
                <span className="text-[var(--text-muted)]">Confidential Company</span>
              ) : (
                <>
                  {job.clientCompanyName ? (
                    <>
                      <HighlightText text={job.clientCompanyName} highlight={searchKeyword} />{' '}
                      <span className="text-xs text-[var(--text-muted)]">
                        via {job.company?.companyName}
                      </span>
                    </>
                  ) : (
                    <HighlightText
                      text={job.company?.companyName || ''}
                      highlight={searchKeyword}
                    />
                  )}
                  {job.company?.isVerified ? (
                    <Tooltip content="This company has been verified via GST registration">
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--success-light)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--success-dark)]">
                        <ShieldCheck className="h-3 w-3" />
                        GST Verified
                      </span>
                    </Tooltip>
                  ) : (
                    <Tooltip content="This company has not been verified">
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
                        Not Verified
                      </span>
                    </Tooltip>
                  )}
                  {((job.company as { totalReviews?: number })?.totalReviews ?? 0) > 0 && (
                    <RatingBadge
                      rating={(job.company as { averageRating?: number })?.averageRating ?? 0}
                      count={(job.company as { totalReviews?: number })?.totalReviews ?? 0}
                      size="xs"
                      href={
                        (job.company as { slug?: string | null })?.slug
                          ? `/companies/${encodeURIComponent((job.company as { slug?: string | null })!.slug!)}/reviews`
                          : undefined
                      }
                    />
                  )}
                </>
              )}
            </p>

            {/* Meta row */}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> {job.location}
                {job.additionalLocations.length > 0 && (
                  <span>+{job.additionalLocations.length}</span>
                )}
              </span>
              <span className="flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5" /> {job.experienceMin}-
                {job.experienceMax || job.experienceMin}+ yrs
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> {formatRelativeDate(job.createdAt)}
              </span>
              {typeof job._applicationCount === 'number' && (
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {job._applicationCount > 50
                    ? '50+ applicants'
                    : job._applicationCount < 10
                      ? '< 10 applicants'
                      : `${job._applicationCount} applicants`}
                </span>
              )}
              {distanceKm != null && (
                <span
                  className={cn(
                    'flex items-center gap-1',
                    distanceKm < 10 ? 'text-emerald-600' : distanceKm < 30 ? 'text-amber-600' : '',
                  )}
                >
                  <Navigation className="h-3.5 w-3.5" />
                  {distanceKm < 1 ? '<1 km' : `${distanceKm.toFixed(1)} km`}
                </span>
              )}
            </div>

            {/* Description snippet */}
            {job.description && (
              <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[var(--text-muted)]">
                {truncate(job.description.replace(/<[^>]+>/g, ''), 200)}
              </p>
            )}

            {/* Badges */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {job.type && (
                <Badge variant="info" size="sm">
                  {JOB_TYPE_LABELS[job.type] || job.type}
                </Badge>
              )}
              {job.workMode && (
                <Badge variant="neutral" size="sm">
                  {WORK_MODE_LABELS[job.workMode] || job.workMode}
                </Badge>
              )}
              {job.urgencyLevel === 'URGENT' && (
                <Badge variant="warning" size="sm">
                  Urgent
                </Badge>
              )}
              {job.urgencyLevel === 'IMMEDIATE' && (
                <Badge variant="error" size="sm">
                  Immediate
                </Badge>
              )}
              {job.isFeatured && (
                <Badge variant="secondary" size="sm">
                  Featured
                </Badge>
              )}
              {job.isPwdFriendly && (
                <Badge variant="success" size="sm">
                  PwD Friendly
                </Badge>
              )}
              {job.visaSponsorshipAvailable && (
                <Badge variant="info" size="sm">
                  Visa Sponsorship
                </Badge>
              )}
              {job.functionalArea && (
                <Badge variant="neutral" size="sm">
                  {FUNCTIONAL_AREA_LABELS[job.functionalArea]}
                </Badge>
              )}
            </div>

            {/* Skills */}
            {(job.skillsRequired?.length ?? 0) > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {skillMatchCount > 0 && (
                  <span
                    className={cn(
                      'mr-1 inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      skillMatchPct >= 70
                        ? 'bg-emerald-50 text-emerald-700'
                        : skillMatchPct >= 40
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-slate-100 text-slate-600',
                    )}
                  >
                    {skillMatchCount}/{job.skillsRequired.length} skills match ({skillMatchPct}%)
                  </span>
                )}
                {job.skillsRequired.slice(0, 6).map((skill) => {
                  const isProfileMatch = candidateSkills?.has(skill.toLowerCase());
                  const isKeywordMatch =
                    !isProfileMatch &&
                    searchKeyword &&
                    searchKeyword
                      .toLowerCase()
                      .split(/[\s,]+/)
                      .some((t) => t.length > 1 && skill.toLowerCase().includes(t));
                  return (
                    <Tag
                      key={skill}
                      label={skill}
                      size="sm"
                      variant={isProfileMatch || isKeywordMatch ? 'success' : 'primary'}
                    />
                  );
                })}
                {job.skillsRequired.length > 6 && (
                  <Tag label={`+${job.skillsRequired.length - 6}`} size="sm" />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right column: salary + actions */}
        <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-2">
          <div className="text-right">
            <p className="text-sm font-semibold text-[var(--text)]">
              {showLPA
                ? formatSalaryAsLPA(job.salaryMin, job.salaryMax)
                : formatSalaryRange(job.salaryMin, job.salaryMax, job.currency)}
            </p>
            {job.salaryType && !showLPA && (
              <span className="text-xs text-[var(--text-muted)]">
                {job.salaryType === 'ANNUAL' ? '/yr' : job.salaryType === 'MONTHLY' ? '/mo' : '/hr'}
              </span>
            )}
            {job.salaryNegotiable && (
              <span className="block text-[10px] text-[var(--success)]">Negotiable</span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Applied indicator / Quick Apply */}
            {isApplied ? (
              <Tooltip content="View your application">
                <Link
                  href={ROUTES.CANDIDATE.APPLICATIONS}
                  className="flex items-center gap-1 rounded-lg bg-[var(--success)]/10 px-2.5 py-1.5 text-xs font-medium text-[var(--success)] transition-colors hover:bg-[var(--success)]/20"
                >
                  <CheckCircle className="h-3 w-3" />
                  Applied
                </Link>
              </Tooltip>
            ) : canQuickApply && onQuickApply ? (
              <Button
                size="sm"
                onClick={onQuickApply}
                isLoading={isApplying}
                className="text-xs"
                tooltip="Apply instantly without screening questions"
              >
                <Send className="mr-1 h-3 w-3" />
                Quick Apply
              </Button>
            ) : null}

            {/* External apply indicator */}
            {!isApplied && job.applyMethod === 'EXTERNAL_URL' && (
              <Tooltip content="Apply on external website">
                <Link
                  href={ROUTES.CANDIDATE.JOB_DETAIL(job.id)}
                  className="bg-primary/10 text-primary hover:bg-primary/20 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  Apply
                </Link>
              </Tooltip>
            )}

            {/* Compare button */}
            {onToggleCompare && (
              <Tooltip content={isComparing ? 'Remove from comparison' : 'Add to comparison'}>
                <button
                  onClick={onToggleCompare}
                  className={cn(
                    'cursor-pointer rounded-lg p-2 transition-colors',
                    isComparing
                      ? 'text-primary bg-primary/10'
                      : 'hover:text-primary text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]',
                  )}
                  aria-label={isComparing ? 'Remove from comparison' : 'Add to comparison'}
                >
                  <GitCompareArrows className="h-5 w-5" />
                </button>
              </Tooltip>
            )}

            {/* Save button */}
            <Tooltip content={isSaved ? 'Unsave job' : 'Save job'}>
              <button
                onClick={onSave}
                disabled={isSaving}
                className={cn(
                  'cursor-pointer rounded-lg p-2 transition-colors disabled:opacity-50',
                  isSaved
                    ? 'text-primary bg-primary/10'
                    : 'hover:text-primary text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]',
                )}
                aria-label={isSaved ? 'Unsave job' : 'Save job'}
              >
                {isSaved ? <BookmarkCheck className="h-5 w-5" /> : <Bookmark className="h-5 w-5" />}
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </Card>
  );
}
