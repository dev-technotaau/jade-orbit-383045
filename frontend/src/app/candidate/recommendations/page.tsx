'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Crown,
  WandSparkles,
  MapPin,
  Briefcase,
  DollarSign,
  Clock,
  X,
  ExternalLink,
  Bookmark,
  Building2,
  RefreshCw,
  CheckCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import { useEntitlements } from '@/hooks/use-entitlements';
import { useUpgradeModal } from '@/components/billing/UpgradeModal';
import Pagination from '@/components/ui/Pagination';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import Tooltip from '@/components/ui/Tooltip';
import RatingBadge from '@/components/reviews/RatingBadge';
import { recommendationService } from '@/services/recommendation.service';
import { useAppliedJobs } from '@/hooks/use-jobs';
import { QUERY_KEYS } from '@/constants/config';
import { ROUTES } from '@/constants/routes';
import type { Job } from '@/types/job';
import type { PaginatedResponse } from '@/types/api';

type RecommendedJob = Job & { matchScore?: number };

const workModeOptions = [
  { value: '', label: 'All Modes' },
  { value: 'REMOTE', label: 'Remote' },
  { value: 'ONSITE', label: 'On-site' },
  { value: 'HYBRID', label: 'Hybrid' },
];

const typeOptions = [
  { value: '', label: 'All Types' },
  { value: 'FULL_TIME', label: 'Full Time' },
  { value: 'PART_TIME', label: 'Part Time' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'INTERNSHIP', label: 'Internship' },
];

const experienceOptions = [
  { value: '', label: 'All Levels' },
  { value: 'ENTRY', label: 'Entry Level' },
  { value: 'MID', label: 'Mid Level' },
  { value: 'SENIOR', label: 'Senior' },
  { value: 'LEAD', label: 'Lead' },
];

function formatSalary(n: number): string {
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toString();
}

function getMatchColor(score: number): string {
  if (score >= 80) return 'text-[var(--success)]';
  if (score >= 60) return 'text-primary';
  if (score >= 40) return 'text-[var(--warning)]';
  return 'text-[var(--text-muted)]';
}

function getMatchBg(score: number): string {
  if (score >= 80) return 'bg-[var(--success-light)]';
  if (score >= 60) return 'bg-primary-light';
  if (score >= 40) return 'bg-[var(--warning-light)]';
  return 'bg-[var(--bg-secondary)]';
}

export default function RecommendationsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [workMode, setWorkMode] = useState('');
  const [type, setType] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);

  // Track applied jobs
  const { data: appliedJobsData } = useAppliedJobs(1, 500);
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const appliedItems = appliedJobsData?.data?.items;
    if (appliedItems && appliedItems.length > 0) {
      queueMicrotask(() =>
        setAppliedJobIds(new Set(appliedItems.map((a: { jobId: string }) => a.jobId))),
      );
    }
  }, [appliedJobsData]);

  const filters = {
    ...(workMode && { workMode }),
    ...(type && { type }),
    ...(experienceLevel && { experienceLevel }),
    page: String(page),
    limit: String(pageSize),
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: QUERY_KEYS.RECOMMENDATIONS.FEED(filters as Record<string, unknown>),
    queryFn: () => recommendationService.getRecommendationFeed(filters),
  });

  const feedData = data?.data;
  const jobs: RecommendedJob[] = feedData?.items ?? [];
  const totalPages = feedData?.totalPages || 1;

  const dismissMutation = useMutation({
    mutationFn: (jobId: string) => recommendationService.dismissRecommendation(jobId),
    onMutate: async (jobId) => {
      // Optimistic update
      await queryClient.cancelQueries({
        queryKey: QUERY_KEYS.RECOMMENDATIONS.FEED(filters as Record<string, unknown>),
      });
      const prevData = queryClient.getQueryData(
        QUERY_KEYS.RECOMMENDATIONS.FEED(filters as Record<string, unknown>),
      );
      queryClient.setQueryData(
        QUERY_KEYS.RECOMMENDATIONS.FEED(filters as Record<string, unknown>),
        (old: PaginatedResponse<RecommendedJob> | undefined) => {
          if (!old?.data) return old;
          const items = old.data.items;
          const filtered = items?.filter((j) => j.id !== jobId) || [];
          return { ...old, data: { ...old.data, items: filtered } };
        },
      );
      return { prevData };
    },
    onError: (_err, _jobId, context) => {
      if (context?.prevData) {
        queryClient.setQueryData(
          QUERY_KEYS.RECOMMENDATIONS.FEED(filters as Record<string, unknown>),
          context.prevData,
        );
      }
    },
  });

  const handleRefresh = () => {
    setPage(1);
    refetch();
  };

  return (
    <DashboardLayout requiredRole={['CANDIDATE']}>
      <CandidatePremiumBanner />
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Recommended Jobs</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              AI-matched jobs based on your skills, experience, and preferences.
            </p>
          </div>
          <Button variant="outline" onClick={handleRefresh} tooltip="Refresh recommendations">
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="w-full sm:w-40">
              <Select
                label="Work Mode"
                options={workModeOptions}
                value={workMode}
                onChange={(val) => {
                  setWorkMode(val);
                  setPage(1);
                }}
              />
            </div>
            <div className="w-full sm:w-40">
              <Select
                label="Job Type"
                options={typeOptions}
                value={type}
                onChange={(val) => {
                  setType(val);
                  setPage(1);
                }}
              />
            </div>
            <div className="w-full sm:w-40">
              <Select
                label="Experience"
                options={experienceOptions}
                value={experienceLevel}
                onChange={(val) => {
                  setExperienceLevel(val);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </Card>

        {/* Job Cards */}
        {isLoading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <Skeleton variant="rect" height={180} />
              </Card>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <Card>
            <EmptyState
              icon={WandSparkles}
              title="No recommendations yet"
              description="Update your profile with skills, experience, and preferences to get better job matches."
              action={
                <Button
                  onClick={() => router.push(ROUTES.CANDIDATE.PROFILE)}
                  tooltip="Go to profile settings"
                >
                  Update Profile
                </Button>
              }
            />
          </Card>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              {jobs.map((job) => (
                <Card key={job.id} className="relative">
                  {/* Dismiss button */}
                  <Tooltip content="Not interested">
                    <button
                      onClick={() => dismissMutation.mutate(job.id)}
                      className="absolute top-3 right-3 cursor-pointer rounded-full p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </Tooltip>

                  <div className="space-y-3 pr-8">
                    {/* Title + Company */}
                    <div>
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <h3 className="text-base font-semibold text-[var(--text)]">
                            {job.title}
                          </h3>
                          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-[var(--text-secondary)]">
                            <Building2 className="h-3.5 w-3.5" />
                            <span>
                              {job.isConfidential
                                ? 'Confidential Company'
                                : job.company?.companyName || 'Company'}
                            </span>
                            {!job.isConfidential &&
                              ((job.company as { totalReviews?: number })?.totalReviews ?? 0) >
                                0 && (
                                <RatingBadge
                                  rating={
                                    (job.company as { averageRating?: number })?.averageRating ?? 0
                                  }
                                  count={
                                    (job.company as { totalReviews?: number })?.totalReviews ?? 0
                                  }
                                  size="xs"
                                  href={
                                    (job.company as { slug?: string | null })?.slug
                                      ? `/companies/${encodeURIComponent((job.company as { slug?: string | null }).slug!)}/reviews`
                                      : undefined
                                  }
                                />
                              )}
                          </p>
                        </div>
                        {/* Match Score */}
                        {(job.matchScore ?? 0) > 0 && (
                          <div
                            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${getMatchBg(job.matchScore!)}`}
                          >
                            <span className={`text-sm font-bold ${getMatchColor(job.matchScore!)}`}>
                              {Math.round(job.matchScore!)}%
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Meta info */}
                    <div className="flex flex-wrap gap-3 text-xs text-[var(--text-muted)]">
                      {job.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {job.location}
                        </span>
                      )}
                      {job.type && (
                        <span className="flex items-center gap-1">
                          <Briefcase className="h-3 w-3" /> {job.type.replace('_', ' ')}
                        </span>
                      )}
                      {job.workMode && (
                        <Badge variant="info" size="sm">
                          {job.workMode}
                        </Badge>
                      )}
                      {job.experienceMin != null && (
                        <span>
                          {job.experienceMin}-{job.experienceMax || job.experienceMin}+ yrs
                        </span>
                      )}
                      {(job.salaryMin || job.salaryMax) && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          {(job.currency || 'INR').toUpperCase() === 'INR' &&
                          job.salaryType === 'ANNUAL'
                            ? `${job.salaryMin ? formatSalary(job.salaryMin) : ''}${job.salaryMin && job.salaryMax ? ' - ' : ''}${job.salaryMax ? formatSalary(job.salaryMax) : ''} LPA`
                            : `${job.salaryMin ? formatSalary(job.salaryMin) : ''}${job.salaryMin && job.salaryMax ? ' - ' : ''}${job.salaryMax ? formatSalary(job.salaryMax) : ''}`}
                          {job.salaryNegotiable && (
                            <span className="text-[var(--success)]">(Negotiable)</span>
                          )}
                        </span>
                      )}
                      {job.createdAt && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(job.createdAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {/* Enterprise badges */}
                    {(job.isFeatured || job.isPwdFriendly || job.visaSponsorshipAvailable) && (
                      <div className="flex flex-wrap gap-1.5">
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
                      </div>
                    )}

                    {/* Skills */}
                    {job.skillsRequired && job.skillsRequired.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {job.skillsRequired.slice(0, 8).map((skill: string) => (
                          <span
                            key={skill}
                            className="inline-flex items-center rounded-md bg-[var(--bg-secondary)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]"
                          >
                            {skill}
                          </span>
                        ))}
                        {job.skillsRequired.length > 8 && (
                          <span className="text-xs text-[var(--text-muted)]">
                            +{job.skillsRequired.length - 8} more
                          </span>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-1">
                      {appliedJobIds.has(job.id) ? (
                        <Tooltip content="View your application">
                          <Link
                            href={ROUTES.CANDIDATE.APPLICATIONS}
                            className="flex items-center gap-1 rounded-lg bg-[var(--success)]/10 px-3 py-1.5 text-xs font-medium text-[var(--success)] transition-colors hover:bg-[var(--success)]/20"
                          >
                            <CheckCircle className="h-3.5 w-3.5" /> Applied
                          </Link>
                        </Tooltip>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => router.push(ROUTES.CANDIDATE.JOB_DETAIL(job.id))}
                          tooltip="View job details and apply"
                        >
                          <ExternalLink className="mr-1 h-3.5 w-3.5" />
                          View & Apply
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {/* Pagination */}
            {totalPages >= 1 && (
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={(p) => {
                  setPage(p);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                totalItems={feedData?.total}
                pageSize={pageSize}
                onPageSizeChange={(s) => {
                  setPageSize(s);
                  setPage(1);
                }}
              />
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

/**
 * Inline upsell banner — only renders if the candidate is NOT on a Premium plan.
 * Premium grants priority placement, AI Resume Premium, verified badge, etc.
 */
function CandidatePremiumBanner() {
  const { hasFeature } = useEntitlements();
  const upgrade = useUpgradeModal();
  if (hasFeature('feature.candidate_top_visibility')) return null;
  return (
    <>
      <div className="mb-4 rounded-xl border border-[var(--border)] bg-gradient-to-r from-blue-50 to-indigo-50 p-4 dark:from-blue-950/20 dark:to-indigo-950/20">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Crown size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-[var(--text)]">
                Get to the top — 7 days Profile Boost
              </h3>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                Boosted profiles get 4× more recruiter views. Includes Verified badge, AI Resume
                Premium, top search visibility and priority WhatsApp support — ₹199/month.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => upgrade.open({ feature: 'feature.candidate_profile_boost' })}
            className="flex-shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            Boost my profile →
          </button>
        </div>
      </div>
      {upgrade.modal}
    </>
  );
}
