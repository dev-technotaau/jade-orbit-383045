'use client';

/**
 * Public job-detail view — rendered at /jobs/{slug-with-shortid}.
 *
 * Renders all the public-safe job information (sanitised by the
 * backend). Apply / Save / Contact CTAs route through useAuthGate so
 * guests bounce to login/register with the action intent encoded.
 */

import Link from 'next/link';
import Image from 'next/image';
import { isOptimisableImageHost } from '@/lib/image-host';
import {
  Briefcase,
  MapPin,
  Clock,
  Building2,
  ShieldCheck,
  Send,
  Bookmark,
  Share2,
  ExternalLink,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Tag from '@/components/ui/Tag';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import PublicJobCard from './PublicJobCard';
import RatingBadge from '@/components/reviews/RatingBadge';
import { useAuthGate } from '@/hooks/use-auth-gate';
import { JOB_TYPE_LABELS, WORK_MODE_LABELS } from '@/constants/enums';
import { formatRelativeDate, formatSalaryRange } from '@/lib/utils';
import { formatSalaryAsLPA } from '@/utils/format';
import type { PublicJobDetailResult } from '@/services/public-jobs.service';

interface Props {
  data: PublicJobDetailResult;
}

export default function PublicJobDetailView({ data }: Props) {
  const { gatedAction, isAuthenticated } = useAuthGate();
  const { job, related } = data;

  const showLPA = (job.currency || 'INR').toUpperCase() === 'INR' && job.salaryType === 'ANNUAL';
  const salaryNumMin =
    typeof job.salaryMin === 'string' ? Number(job.salaryMin) : (job.salaryMin ?? null);
  const salaryNumMax =
    typeof job.salaryMax === 'string' ? Number(job.salaryMax) : (job.salaryMax ?? null);

  const onApply = () => {
    if (gatedAction('apply')) return;
    // Auth users — the dashboard would handle the actual apply form.
    // For consistency we still bounce to the dashboard detail page
    // where the apply flow lives.
    window.location.href = `/candidate/jobs/${job.id}?action=apply`;
  };
  const onSave = () => {
    if (gatedAction('save')) return;
    window.location.href = `/candidate/jobs/${job.id}?action=save`;
  };

  return (
    <div className="under-public-header bg-[var(--bg)]">
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Main column */}
          <div className="min-w-0 space-y-6">
            <Card padding="lg">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-1 gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[var(--bg-tertiary)]">
                    {job.company?.logo ? (
                      <Image
                        src={job.company.logo}
                        alt={job.company.companyName ?? ''}
                        width={48}
                        height={48}
                        sizes="48px"
                        priority
                        unoptimized={!isOptimisableImageHost(job.company.logo)}
                        className="h-12 w-12 rounded-xl object-contain"
                      />
                    ) : (
                      <Building2 className="h-8 w-8 text-[var(--text-muted)]" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-2xl font-bold text-[var(--text)] sm:text-3xl">
                      {job.title}
                    </h1>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
                      <Link
                        href={
                          job.company?.slug
                            ? `/companies/${job.company.slug}`
                            : `/company/${job.company?.id ?? ''}`
                        }
                        className="hover:text-primary font-medium"
                      >
                        {job.company?.companyName}
                      </Link>
                      {job.company?.isVerified && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--success-light)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--success-dark)]">
                          <ShieldCheck className="h-3 w-3" />
                          GST Verified
                        </span>
                      )}
                      {((job.company as { totalReviews?: number })?.totalReviews ?? 0) > 0 && (
                        <RatingBadge
                          rating={(job.company as { averageRating?: number })?.averageRating ?? 0}
                          count={(job.company as { totalReviews?: number })?.totalReviews ?? 0}
                          size="xs"
                          href={
                            job.company?.slug
                              ? `/companies/${encodeURIComponent(job.company.slug)}/reviews`
                              : undefined
                          }
                        />
                      )}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> {job.location}
                      </span>
                      <span className="flex items-center gap-1">
                        <Briefcase className="h-3.5 w-3.5" /> {job.experienceMin}-
                        {job.experienceMax ?? job.experienceMin}+ yrs
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" /> Posted {formatRelativeDate(job.createdAt)}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
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
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-stretch gap-2 sm:items-end">
                  <p className="text-right text-base font-bold text-[var(--text)] sm:text-lg">
                    {job.salaryNotDisclosed
                      ? 'Not disclosed'
                      : showLPA
                        ? formatSalaryAsLPA(salaryNumMin, salaryNumMax)
                        : formatSalaryRange(salaryNumMin, salaryNumMax, job.currency ?? 'INR')}
                  </p>
                  {job.applyMethod === 'EXTERNAL_URL' && job.externalApplyUrl ? (
                    <Button
                      variant="primary"
                      size="md"
                      leftIcon={<ExternalLink className="h-4 w-4" />}
                      onClick={() => {
                        if (gatedAction('apply')) return;
                        window.open(job.externalApplyUrl ?? '#', '_blank');
                      }}
                    >
                      Apply on company site
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="md"
                      leftIcon={<Send className="h-4 w-4" />}
                      onClick={onApply}
                    >
                      Apply now
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="md"
                    leftIcon={<Bookmark className="h-4 w-4" />}
                    onClick={onSave}
                  >
                    Save job
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<Share2 className="h-3.5 w-3.5" />}
                    onClick={() => {
                      if (typeof navigator !== 'undefined' && navigator.share) {
                        void navigator.share({
                          title: job.title,
                          url: typeof window !== 'undefined' ? window.location.href : undefined,
                        });
                      }
                    }}
                  >
                    Share
                  </Button>
                </div>
              </div>
            </Card>

            {/* AEO + Speakable answer paragraph — voice assistants and AI
                search engines extract this region as the direct answer
                to "what is <job title> at <company>". Reuses fields
                already rendered, no new data fetch. Kept as plain prose
                for crawler legibility; mirrors values in the card above. */}
            <p
              data-speakable="true"
              className="-mt-3 text-sm leading-relaxed text-[var(--text-secondary)]"
            >
              {`${job.title} at ${job.company?.companyName ?? 'a verified employer'}`}
              {job.location ? ` based in ${job.location}` : ''}
              {job.experienceMin != null
                ? `. Requires ${job.experienceMin}${
                    job.experienceMax && job.experienceMax !== job.experienceMin
                      ? `–${job.experienceMax}`
                      : '+'
                  } years of experience`
                : ''}
              {job.type ? `, ${(JOB_TYPE_LABELS[job.type] || job.type).toLowerCase()}` : ''}
              {job.workMode
                ? ` (${(WORK_MODE_LABELS[job.workMode] || job.workMode).toLowerCase()})`
                : ''}
              . Apply on Hire Adda — verified employer, fast hiring, no scams.
            </p>

            {/* Job description */}
            <Card padding="lg">
              <h2 className="mb-3 text-lg font-bold text-[var(--text)]">Job description</h2>
              {job.description && (
                <div
                  className="prose prose-sm max-w-none text-[var(--text-secondary)]"
                  dangerouslySetInnerHTML={{ __html: job.description }}
                />
              )}
              {job.keyResponsibilities && (
                <div className="mt-5">
                  <h3 className="mb-2 text-sm font-bold tracking-wider text-[var(--text)] uppercase">
                    Key responsibilities
                  </h3>
                  <div
                    className="prose prose-sm max-w-none text-[var(--text-secondary)]"
                    dangerouslySetInnerHTML={{ __html: job.keyResponsibilities }}
                  />
                </div>
              )}
              {job.requirements && (
                <div className="mt-5">
                  <h3 className="mb-2 text-sm font-bold tracking-wider text-[var(--text)] uppercase">
                    Requirements
                  </h3>
                  <div
                    className="prose prose-sm max-w-none text-[var(--text-secondary)]"
                    dangerouslySetInnerHTML={{ __html: job.requirements }}
                  />
                </div>
              )}
              {job.benefits && (
                <div className="mt-5">
                  <h3 className="mb-2 text-sm font-bold tracking-wider text-[var(--text)] uppercase">
                    Benefits
                  </h3>
                  <div
                    className="prose prose-sm max-w-none text-[var(--text-secondary)]"
                    dangerouslySetInnerHTML={{ __html: job.benefits }}
                  />
                </div>
              )}
            </Card>

            {/* Skills */}
            {(job.skillsRequired?.length ?? 0) > 0 && (
              <Card padding="lg">
                <h2 className="mb-3 text-lg font-bold text-[var(--text)]">Skills required</h2>
                <div className="flex flex-wrap gap-1.5">
                  {job.skillsRequired!.map((s) => (
                    <Tag key={s} label={s} size="md" variant="primary" />
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* Right rail */}
          <aside className="space-y-6">
            {/* Guest-only onboarding card. Logged-in users already have
                the top-of-page Apply button + dashboard chrome around
                them, so this duplicate "sign up free" CTA is noise. */}
            {!isAuthenticated && (
              <Card padding="lg">
                <div className="flex items-center gap-3">
                  <div className="bg-primary-light text-primary flex h-10 w-10 items-center justify-center rounded-xl">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[var(--text)]">Apply with one click</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Sign up free — apply faster, save jobs, set alerts
                    </p>
                  </div>
                </div>
                <Button variant="primary" size="md" fullWidth className="mt-3" onClick={onApply}>
                  Sign in to apply
                </Button>
              </Card>
            )}

            {/* Company snippet */}
            {job.company && (
              <Card padding="lg">
                <h3 className="mb-3 text-xs font-bold tracking-wider text-[var(--text-muted)] uppercase">
                  About the company
                </h3>
                <div className="flex items-start gap-3">
                  {job.company.logo ? (
                    <Image
                      src={job.company.logo}
                      alt={job.company.companyName ?? ''}
                      width={48}
                      height={48}
                      sizes="48px"
                      loading="lazy"
                      unoptimized={!isOptimisableImageHost(job.company.logo)}
                      className="h-12 w-12 rounded-lg object-contain"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
                      <Building2 className="h-6 w-6 text-[var(--text-muted)]" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--text)]">{job.company.companyName}</p>
                    {((job.company as { totalReviews?: number }).totalReviews ?? 0) > 0 && (
                      <span className="mt-1 inline-flex">
                        <RatingBadge
                          rating={(job.company as { averageRating?: number }).averageRating ?? 0}
                          count={(job.company as { totalReviews?: number }).totalReviews ?? 0}
                          size="xs"
                          href={
                            job.company.slug
                              ? `/companies/${encodeURIComponent(job.company.slug)}/reviews`
                              : undefined
                          }
                        />
                      </span>
                    )}
                    {job.company.industry && (
                      <p className="text-xs text-[var(--text-muted)]">{job.company.industry}</p>
                    )}
                    {job.company.companySize && (
                      <p className="text-xs text-[var(--text-muted)]">
                        {job.company.companySize} employees
                      </p>
                    )}
                  </div>
                </div>
                <Link
                  href={
                    job.company.slug
                      ? `/companies/${job.company.slug}`
                      : `/company/${job.company.id ?? ''}`
                  }
                  className="text-primary mt-3 inline-flex items-center gap-1 text-sm hover:underline"
                >
                  View full company profile
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </Card>
            )}
          </aside>
        </div>

        {/* Related jobs */}
        {related.length > 0 && (
          <div className="mt-10">
            <h2 className="mb-4 text-xl font-bold text-[var(--text)]">Similar jobs</h2>
            <ul className="space-y-3">
              {related.map((j) => (
                <li key={j.id}>
                  <PublicJobCard job={j} isGuest={!isAuthenticated} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Breadcrumbs — bottom-of-content placement matches Contact /
          Company-detail for visual consistency. JSON-LD BreadcrumbList
          is emitted by the parent page route via `breadcrumbSchema()`
          in its jsonLd graph, so `withSchema={false}` here. */}
      <div className="border-t border-[var(--border)] bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <Breadcrumbs
            items={[{ name: 'Jobs', href: '/jobs' }, { name: job.title }]}
            withSchema={false}
          />
        </div>
      </div>
    </div>
  );
}
