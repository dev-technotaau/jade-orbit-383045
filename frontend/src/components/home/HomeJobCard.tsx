'use client';

/**
 * HomeJobCard — a polished, enterprise-grade job card used ONLY by the homepage
 * "Latest Jobs" section. It reuses the EXACT same behaviour as the shared
 * PublicJobCard (auth-gated apply/save via useAuthGate, salary computation,
 * new/hot/quick-apply flags, detail href) — only the LAYOUT is redesigned into
 * a clean vertical card that stays readable in the narrow 3-column homepage
 * grid (the shared card's horizontal split wrapped badly there). The shared
 * PublicJobCard is left untouched for every other surface.
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
  Send,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { JOB_TYPE_LABELS, WORK_MODE_LABELS } from '@/constants/enums';
import { formatSalaryAsLPA } from '@/utils/format';
import { formatRelativeDate, formatSalaryRange, truncate } from '@/lib/utils';
import { useAuthGate } from '@/hooks/use-auth-gate';
import type { PublicJobCardData } from '@/components/job-search/PublicJobCard';

interface Props {
  job: PublicJobCardData;
  isGuest?: boolean;
}

// Copied verbatim from PublicJobCard so behaviour is identical.
function isPostedWithin(createdAt: string, hours: number): boolean {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return false;
  return Date.now() - d.getTime() <= hours * 60 * 60 * 1000;
}
function jobDetailHref(job: PublicJobCardData): string {
  return job.slug ? `/jobs/${job.slug}` : `/jobs/${job.id}`;
}

export default function HomeJobCard({ job, isGuest }: Props) {
  const { gatedAction, isAuthenticated } = useAuthGate();
  const guest = isGuest ?? !isAuthenticated;

  const showLPA = (job.currency || 'INR').toUpperCase() === 'INR' && job.salaryType === 'ANNUAL';
  const isNew = isPostedWithin(job.createdAt, 24);
  const isHot =
    (job.urgencyLevel === 'URGENT' || job.urgencyLevel === 'IMMEDIATE') &&
    isPostedWithin(job.createdAt, 72);
  const canQuickApply = job.applyMethod === 'IN_PLATFORM';

  const handleApply = () => {
    if (guest && gatedAction('apply', { redirectTo: jobDetailHref(job) })) return;
  };
  const handleSave = () => {
    if (guest && gatedAction('save', { redirectTo: jobDetailHref(job) })) return;
  };

  const salaryNumMin =
    typeof job.salaryMin === 'string' ? Number(job.salaryMin) : (job.salaryMin ?? null);
  const salaryNumMax =
    typeof job.salaryMax === 'string' ? Number(job.salaryMax) : (job.salaryMax ?? null);
  const salaryLabel = job.salaryNotDisclosed
    ? 'Not disclosed'
    : showLPA
      ? formatSalaryAsLPA(salaryNumMin, salaryNumMax)
      : formatSalaryRange(salaryNumMin, salaryNumMax, job.currency ?? 'INR');

  const skills = job.skillsRequired ?? [];
  const href = jobDetailHref(job);

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[var(--primary)]/40 hover:shadow-xl">
      {/* Top accent bar — wipes in on hover */}
      <span
        aria-hidden="true"
        className="bg-primary absolute inset-x-0 top-0 h-1 origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100"
      />

      {/* Header: logo · title · company · save */}
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
          {job.isConfidential ? (
            <Briefcase className="h-6 w-6 text-[var(--text-muted)]" />
          ) : job.company?.logo ? (
            <Image
              src={job.company.logo}
              alt={job.company.companyName ?? ''}
              width={44}
              height={44}
              sizes="44px"
              loading="lazy"
              unoptimized={!isOptimisableImageHost(job.company.logo)}
              className="h-11 w-11 rounded-lg object-contain"
            />
          ) : (
            <Building2 className="h-6 w-6 text-[var(--text-muted)]" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href={href}
              className="hover:text-primary line-clamp-1 font-semibold text-[var(--text)] transition-colors"
            >
              {job.title}
            </Link>
            {isNew && (
              <span className="inline-flex flex-none items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">
                <Zap className="h-2.5 w-2.5" />
                New
              </span>
            )}
            {isHot && (
              <span className="bg-secondary-50 text-secondary inline-flex flex-none items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
                <Flame className="h-2.5 w-2.5" />
                Hot
              </span>
            )}
          </div>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm text-[var(--text-secondary)]">
            <span className="truncate">
              {job.isConfidential ? 'Confidential Company' : (job.company?.companyName ?? '')}
            </span>
            {!job.isConfidential && job.company?.isVerified && (
              <span className="inline-flex flex-none items-center gap-0.5 rounded-full bg-[var(--success-light)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--success-dark)]">
                <ShieldCheck className="h-3 w-3" />
                GST
              </span>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          aria-label={guest ? 'Sign in to save' : 'Save job'}
          className="hover:text-primary -mt-1 -mr-1 flex-none cursor-pointer rounded-lg p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)]"
        >
          <Bookmark className="h-5 w-5" />
        </button>
      </div>

      {/* Salary */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="bg-primary/10 text-primary inline-flex items-center rounded-lg px-2.5 py-1 text-sm font-bold">
          {salaryLabel}
        </span>
        {job.salaryNegotiable && !job.salaryNotDisclosed && (
          <span className="text-[11px] font-medium text-[var(--success)]">Negotiable</span>
        )}
      </div>

      {/* Meta row */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[var(--text-muted)]">
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
      </div>

      {/* Description */}
      {job.description && (
        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-[var(--text-muted)]">
          {truncate(job.description.replace(/<[^>]+>/g, ''), 160)}
        </p>
      )}

      {/* Tags — type · work mode · top 3 skills */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {job.type && (
          <span className="rounded-md bg-[var(--bg-secondary)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
            {JOB_TYPE_LABELS[job.type] || job.type}
          </span>
        )}
        {job.workMode && (
          <span className="rounded-md bg-[var(--bg-secondary)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
            {WORK_MODE_LABELS[job.workMode] || job.workMode}
          </span>
        )}
        {skills.slice(0, 3).map((skill) => (
          <span
            key={skill}
            className="bg-primary/10 text-primary rounded-md px-2 py-0.5 text-[11px] font-medium"
          >
            {skill}
          </span>
        ))}
        {skills.length > 3 && (
          <span className="rounded-md bg-[var(--bg-secondary)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)]">
            +{skills.length - 3}
          </span>
        )}
      </div>

      {/* Footer — apply / view (pinned to the bottom for equal-height cards) */}
      <div className="mt-auto border-t border-[var(--border)] pt-4">
        {canQuickApply ? (
          <Button
            size="sm"
            fullWidth
            onClick={handleApply}
            leftIcon={<Send className="h-3.5 w-3.5" />}
          >
            {guest ? 'Sign in to apply' : 'Quick Apply'}
          </Button>
        ) : (
          <Link
            href={href}
            className="hover:bg-primary flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text)] transition-colors hover:border-transparent hover:text-white"
          >
            {job.applyMethod === 'EXTERNAL_URL' ? 'View & apply' : 'View job'}
          </Link>
        )}
      </div>
    </div>
  );
}
