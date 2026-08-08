'use client';

/**
 * Public-surface JobCard.
 *
 * Visual parity with the private candidate JobCard (logo, title,
 * company, badges, skills, salary, save/apply CTAs) but every gated
 * action routes through `useAuthGate` so guests bounce to login/
 * register with the action intent encoded.
 *
 * The card links to `/jobs/{slug}` (public detail URL) instead of the
 * private `/candidate/jobs/{id}` so search engines crawl the canonical
 * SEO URL.
 */

import Link from 'next/link';
import Image from 'next/image';
import { isOptimisableImageHost } from '@/lib/image-host';
import {
  Briefcase,
  Building2,
  MapPin,
  Clock,
  Bookmark,
  ShieldCheck,
  Zap,
  Flame,
  Users,
  Send,
  ExternalLink,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Tag from '@/components/ui/Tag';
import Tooltip from '@/components/ui/Tooltip';
import HighlightText from '@/components/ui/HighlightText';
import { JOB_TYPE_LABELS, WORK_MODE_LABELS, FUNCTIONAL_AREA_LABELS } from '@/constants/enums';
import { formatSalaryAsLPA } from '@/utils/format';
import { formatRelativeDate, formatSalaryRange, truncate, cn } from '@/lib/utils';
import { useAuthGate } from '@/hooks/use-auth-gate';
import RatingBadge from '@/components/reviews/RatingBadge';

/**
 * The public JobCard accepts a relaxed Job shape — server-side
 * sanitisation strips contact fields, so we don't try to render them.
 */
export interface PublicJobCardData {
  id: string;
  slug?: string | null;
  title: string;
  description?: string;
  location: string;
  additionalLocations?: string[];
  experienceMin: number;
  experienceMax?: number | null;
  salaryMin?: number | string | null;
  salaryMax?: number | string | null;
  salaryDisclosed?: boolean;
  salaryNotDisclosed?: boolean;
  salaryNegotiable?: boolean;
  salaryType?: 'ANNUAL' | 'MONTHLY' | 'HOURLY' | string | null;
  currency?: string | null;
  type?: string | null;
  workMode?: string | null;
  urgencyLevel?: string | null;
  isFeatured?: boolean | null;
  isPwdFriendly?: boolean | null;
  visaSponsorshipAvailable?: boolean | null;
  isConfidential?: boolean | null;
  functionalArea?: string | null;
  skillsRequired?: string[];
  applyMethod?: string | null;
  externalApplyUrl?: string | null;
  createdAt: string;
  clientCompanyName?: string | null;
  _applicationCount?: number;
  company?: {
    id?: string;
    slug?: string | null;
    companyName?: string;
    logo?: string | null;
    isVerified?: boolean | null;
    averageRating?: number;
    totalReviews?: number;
  } | null;
}

interface Props {
  job: PublicJobCardData;
  searchKeyword?: string;
  /**
   * Forces the guest CTA variant ("Sign in to apply", etc.). Leave
   * undefined to auto-detect from the live auth state via useAuthGate —
   * the right choice for server-rendered pages that double as
   * in-app surfaces (company detail, public job listing) so logged-in
   * users see the action-label variant instead of "Sign in to apply".
   */
  isGuest?: boolean;
}

function isPostedWithin(createdAt: string, hours: number): boolean {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return false;
  return Date.now() - d.getTime() <= hours * 60 * 60 * 1000;
}

function jobDetailHref(job: PublicJobCardData): string {
  return job.slug ? `/jobs/${job.slug}` : `/jobs/${job.id}`;
}

export default function PublicJobCard({ job, searchKeyword, isGuest }: Props) {
  const { gatedAction, isAuthenticated } = useAuthGate();
  // Resolved guest flag — explicit prop wins, otherwise derive from
  // live auth state. Means callers can keep passing `isGuest` for
  // legacy/test reasons but server components don't have to.
  const guest = isGuest ?? !isAuthenticated;

  const showLPA = (job.currency || 'INR').toUpperCase() === 'INR' && job.salaryType === 'ANNUAL';
  const isNew = isPostedWithin(job.createdAt, 24);
  const isHot =
    (job.urgencyLevel === 'URGENT' || job.urgencyLevel === 'IMMEDIATE') &&
    isPostedWithin(job.createdAt, 72);
  const canQuickApply = job.applyMethod === 'IN_PLATFORM';

  const handleApply = () => {
    // Guest → bounce to register/login with action=apply preserved.
    if (guest && gatedAction('apply', { redirectTo: jobDetailHref(job) })) return;
    // Auth users — let the link handle navigation.
  };
  const handleSave = () => {
    if (guest && gatedAction('save', { redirectTo: jobDetailHref(job) })) return;
    // Auth: actual save happens on the detail page (kept simple here).
  };

  const salaryNumMin =
    typeof job.salaryMin === 'string' ? Number(job.salaryMin) : (job.salaryMin ?? null);
  const salaryNumMax =
    typeof job.salaryMax === 'string' ? Number(job.salaryMax) : (job.salaryMax ?? null);

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
                alt={job.company.companyName ?? ''}
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
                  href={jobDetailHref(job)}
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
                      text={job.company?.companyName ?? ''}
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
                  {(job.company?.totalReviews ?? 0) > 0 && (
                    <RatingBadge
                      rating={job.company?.averageRating ?? 0}
                      count={job.company?.totalReviews ?? 0}
                      size="xs"
                      href={
                        job.company?.slug
                          ? `/companies/${encodeURIComponent(job.company.slug)}/reviews`
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
                {(job.additionalLocations?.length ?? 0) > 0 && (
                  <span>+{job.additionalLocations!.length}</span>
                )}
              </span>
              <span className="flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5" /> {job.experienceMin}-
                {job.experienceMax ?? job.experienceMin}+ yrs
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
                  {FUNCTIONAL_AREA_LABELS[job.functionalArea] || job.functionalArea}
                </Badge>
              )}
            </div>

            {/* Skills */}
            {(job.skillsRequired?.length ?? 0) > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {job.skillsRequired!.slice(0, 6).map((skill) => {
                  const isKeywordMatch =
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
                      variant={isKeywordMatch ? 'success' : 'primary'}
                    />
                  );
                })}
                {job.skillsRequired!.length > 6 && (
                  <Tag label={`+${job.skillsRequired!.length - 6}`} size="sm" />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right column: salary + actions */}
        <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-2">
          <div className="text-right">
            <p className="text-sm font-semibold text-[var(--text)]">
              {job.salaryNotDisclosed
                ? 'Not disclosed'
                : showLPA
                  ? formatSalaryAsLPA(salaryNumMin, salaryNumMax)
                  : formatSalaryRange(salaryNumMin, salaryNumMax, job.currency ?? 'INR')}
            </p>
            {job.salaryType && !showLPA && !job.salaryNotDisclosed && (
              <span className="text-xs text-[var(--text-muted)]">
                {job.salaryType === 'ANNUAL' ? '/yr' : job.salaryType === 'MONTHLY' ? '/mo' : '/hr'}
              </span>
            )}
            {job.salaryNegotiable && (
              <span className="block text-[10px] text-[var(--success)]">Negotiable</span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {canQuickApply && (
              <Button
                size="sm"
                onClick={handleApply}
                className="text-xs"
                tooltip={guest ? 'Sign in to apply' : 'Apply to this job'}
              >
                <Send className="mr-1 h-3 w-3" />
                {guest ? 'Sign in to apply' : 'Quick Apply'}
              </Button>
            )}

            {job.applyMethod === 'EXTERNAL_URL' && (
              <Tooltip content="View details + apply on external website">
                <Link
                  href={jobDetailHref(job)}
                  className="bg-primary/10 text-primary hover:bg-primary/20 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  Apply
                </Link>
              </Tooltip>
            )}

            <Tooltip content={guest ? 'Sign in to save' : 'Save job'}>
              <button
                onClick={handleSave}
                className={cn(
                  'cursor-pointer rounded-lg p-2 transition-colors',
                  'hover:text-primary text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]',
                )}
                aria-label={guest ? 'Sign in to save' : 'Save job'}
              >
                <Bookmark className="h-5 w-5" />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </Card>
  );
}
