'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useActionTrigger } from '@/hooks/use-action-trigger';
import Link from 'next/link';
import {
  MapPin,
  Briefcase,
  Clock,
  Building2,
  Bookmark,
  Share2,
  ArrowLeft,
  Users,
  GraduationCap,
  Globe,
  IndianRupee,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Mail,
  Accessibility,
  Shield,
  Calendar,
  ShieldCheck,
  Ban,
  ChevronRight,
} from 'lucide-react';
import DOMPurify from 'isomorphic-dompurify';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Tag from '@/components/ui/Tag';
import Tabs from '@/components/ui/Tabs';
import Modal from '@/components/ui/Modal';
import Skeleton from '@/components/ui/Skeleton';
import { showToast } from '@/components/ui/Toast';
import Tooltip from '@/components/ui/Tooltip';
import PresenceIndicator from '@/components/ui/PresenceIndicator';
import ScreeningQuestionForm from '@/components/ui/ScreeningQuestionForm';
import RatingBadge from '@/components/reviews/RatingBadge';
import { useJob, useApplyJob, useToggleSaveJob, useAppliedJobs } from '@/hooks/use-jobs';
import { ROUTES } from '@/constants/routes';
import {
  JOB_TYPE_LABELS,
  WORK_MODE_LABELS,
  EXPERIENCE_LEVEL_LABELS,
  SHIFT_TYPE_LABELS,
  SALARY_TYPE_LABELS,
  EDUCATION_LEVEL_LABELS,
  COMPANY_TYPE_LABELS,
  URGENCY_LEVEL_LABELS,
  NOTICE_PERIOD_PREFERENCE_LABELS,
  FUNCTIONAL_AREA_LABELS,
  SPECIFIC_DEGREE_LABELS,
  GENDER_PREFERENCE_LABELS,
  DRIVING_LICENSE_TYPE_LABELS,
} from '@/constants/enums';
import { formatSalaryRange, formatDate, formatRelativeDate, getExperienceLabel } from '@/lib/utils';
import { formatSalaryAsLPA } from '@/utils/format';
import type { ApiError } from '@/types/api';
import type { Job, JobType, SalaryType, ScreeningAnswerInput } from '@/types/job';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://hireadda.in';

const JOB_TYPE_TO_SCHEMA: Record<JobType, string> = {
  FULL_TIME: 'FULL_TIME',
  PART_TIME: 'PART_TIME',
  CONTRACT: 'CONTRACTOR',
  INTERNSHIP: 'INTERN',
  FREELANCE: 'TEMPORARY',
};

const SALARY_UNIT_MAP: Record<SalaryType, string> = {
  ANNUAL: 'YEAR',
  MONTHLY: 'MONTH',
  HOURLY: 'HOUR',
};

function buildJobPostingJsonLd(job: Job) {
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: job.description,
    datePosted: job.createdAt,
    ...(job.applicationDeadline && { validThrough: job.applicationDeadline }),
    ...(job.expiresAt && !job.applicationDeadline && { validThrough: job.expiresAt }),
    employmentType: JOB_TYPE_TO_SCHEMA[job.type] || 'FULL_TIME',
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: job.location,
        addressCountry: 'IN',
      },
    },
    ...(job.isRemote && {
      jobLocationType: 'TELECOMMUTE',
    }),
    url: `${APP_URL}/candidate/jobs/${job.id}`,
  };

  // Salary
  if (job.salaryDisclosed && job.salaryMin) {
    jsonLd.baseSalary = {
      '@type': 'MonetaryAmount',
      currency: job.currency || 'INR',
      value: {
        '@type': 'QuantitativeValue',
        ...(job.salaryMax && job.salaryMax !== job.salaryMin
          ? { minValue: job.salaryMin, maxValue: job.salaryMax }
          : { value: job.salaryMin }),
        unitText: SALARY_UNIT_MAP[job.salaryType || 'ANNUAL'],
      },
    };
  }

  // Experience
  if (job.experienceMin > 0 || job.experienceMax) {
    jsonLd.experienceRequirements = {
      '@type': 'OccupationalExperienceRequirements',
      monthsOfExperience: (job.experienceMin || 0) * 12,
    };
  }

  // Education
  if (job.educationRequired) {
    jsonLd.educationRequirements = {
      '@type': 'EducationalOccupationalCredential',
      credentialCategory: job.educationRequired,
    };
  }

  // Skills
  if (job.skillsRequired.length > 0) {
    jsonLd.skills = job.skillsRequired.join(', ');
  }

  // Industry
  if (job.industry) {
    jsonLd.industry = job.industry;
  }

  // Number of openings
  if (job.numberOfOpenings) {
    jsonLd.totalJobOpenings = job.numberOfOpenings;
  }

  // Hiring organization
  if (job.company && !job.isConfidential) {
    jsonLd.hiringOrganization = {
      '@type': 'Organization',
      name: job.company.companyName,
      ...(job.company.logo && { logo: job.company.logo }),
      ...(job.company.website && { sameAs: job.company.website }),
    };
  } else {
    jsonLd.hiringOrganization = { '@type': 'Organization', name: 'Confidential' };
  }

  return jsonLd;
}

export default function JobDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const { data, isLoading } = useJob(id);
  const applyMutation = useApplyJob();
  const saveMutation = useToggleSaveJob();
  const { data: appliedJobsData } = useAppliedJobs(1, 500);

  const [activeTab, setActiveTab] = useState('description');
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [coverLetter, setCoverLetter] = useState('');
  const [screeningAnswers, setScreeningAnswers] = useState<Record<string, string>>({});
  const [justApplied, setJustApplied] = useState(false);

  const job = data?.data;

  const isApplied = useMemo(() => {
    if (justApplied) return true;
    const items = appliedJobsData?.data?.items;
    if (!items) return false;
    return items.some((a: { jobId: string }) => a.jobId === id);
  }, [appliedJobsData, id, justApplied]);

  const isFullyFilled = useMemo(
    () => job?.numberOfOpenings != null && (job._hiredCount ?? 0) >= job.numberOfOpenings,
    [job?.numberOfOpenings, job?._hiredCount],
  );

  const handleApply = async () => {
    // Validate required screening questions
    const requiredQs = (job?.screeningQuestions || []).filter((q) => q.isRequired);
    for (const q of requiredQs) {
      if (!screeningAnswers[q.id]?.trim()) {
        showToast.error(`Please answer: "${q.question}"`);
        return;
      }
    }
    try {
      const answers: ScreeningAnswerInput[] = Object.entries(screeningAnswers)
        .filter(([, val]) => val.trim())
        .map(([questionId, answer]) => ({ questionId, answer }));
      await applyMutation.mutateAsync({
        jobId: id,
        coverLetter: coverLetter || undefined,
        screeningAnswers: answers.length > 0 ? answers : undefined,
      });
      setShowApplyModal(false);
      setCoverLetter('');
      setScreeningAnswers({});
      setJustApplied(true);
      showToast.success('Application submitted successfully!');
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Failed to apply');
    }
  };

  const handleSave = async () => {
    try {
      await saveMutation.mutateAsync(id);
      showToast.success('Job saved!');
    } catch {
      showToast.error('Failed to save job');
    }
  };

  // Post-auth action triggers — when a guest bounces through login from
  // a public job CTA (?action=apply / ?action=save), open the matching
  // form/modal automatically. The hook strips the param after firing.
  useActionTrigger('apply', () => setShowApplyModal(true));
  useActionTrigger('save', () => {
    void handleSave();
  });

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: job?.title, url });
    } else {
      await navigator.clipboard.writeText(url);
      showToast.success('Link copied to clipboard!');
    }
  };

  const tabs = [
    { key: 'description', label: 'Description' },
    { key: 'requirements', label: 'Requirements' },
    { key: 'benefits', label: 'Benefits' },
    { key: 'company', label: 'Company' },
  ];

  if (isLoading) {
    return (
      <DashboardLayout requiredRole={['CANDIDATE']}>
        <div className="space-y-6">
          <Skeleton variant="rect" height={200} />
          <Skeleton variant="text" lines={5} />
        </div>
      </DashboardLayout>
    );
  }

  if (!job) {
    return (
      <DashboardLayout requiredRole={['CANDIDATE']}>
        <div className="flex flex-col items-center justify-center py-20">
          <AlertCircle className="h-12 w-12 text-[var(--text-muted)]" />
          <h2 className="mt-4 text-lg font-semibold text-[var(--text)]">Job Not Found</h2>
          <Link href={ROUTES.CANDIDATE.JOBS}>
            <Button variant="outline" className="mt-4" tooltip="Return to job listings">
              Back to Jobs
            </Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout requiredRole={['CANDIDATE']}>
      {/* JobPosting structured data for Google for Jobs */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildJobPostingJsonLd(job)) }}
      />
      <div className="space-y-6">
        {/* Back */}
        <Tooltip content="Back to job listings">
          <Link
            href={ROUTES.CANDIDATE.JOBS}
            className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Jobs
          </Link>
        </Tooltip>

        {/* Header */}
        <Card>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-tertiary)]">
                {job.isConfidential ? (
                  <Shield className="h-8 w-8 text-[var(--text-muted)]" />
                ) : job.company?.logo ? (
                  <img
                    src={job.company.logo}
                    alt={job.company.companyName}
                    className="h-14 w-14 rounded-lg object-contain"
                  />
                ) : (
                  <Building2 className="h-8 w-8 text-[var(--text-muted)]" />
                )}
              </div>
              <div>
                <h1 className="text-xl font-bold text-[var(--text)] sm:text-2xl">{job.title}</h1>
                <p className="mt-1 text-[var(--text-secondary)]">
                  {job.isConfidential ? (
                    'Confidential Company'
                  ) : (
                    <>
                      {job.clientCompanyName ? (
                        <>
                          {job.clientCompanyName}{' '}
                          <span className="text-xs text-[var(--text-muted)]">
                            via {job.company?.companyName}
                          </span>
                        </>
                      ) : (
                        job.company?.companyName
                      )}
                    </>
                  )}
                  {!job.isConfidential && job.company?.isVerified && (
                    <CheckCircle className="ml-1.5 inline h-4 w-4 text-[var(--success)]" />
                  )}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[var(--text-muted)]">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" /> {job.location}
                  </span>
                  {job.additionalLocations.length > 0 && (
                    <span className="text-xs">{job.additionalLocations.join(', ')}</span>
                  )}
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-4 w-4" /> {getExperienceLabel(job.experienceMin)}
                    {job.experienceMax ? ` - ${getExperienceLabel(job.experienceMax)}` : '+'}
                  </span>
                  <span className="flex items-center gap-1">
                    <IndianRupee className="h-4 w-4" />
                    {(job.currency || 'INR').toUpperCase() === 'INR' && job.salaryType === 'ANNUAL'
                      ? formatSalaryAsLPA(job.salaryMin, job.salaryMax)
                      : formatSalaryRange(job.salaryMin, job.salaryMax, job.currency)}
                    {job.salaryNegotiable && (
                      <span className="ml-1 text-[var(--success)]">(Negotiable)</span>
                    )}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" /> {formatRelativeDate(job.createdAt)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {job.type && <Badge variant="info">{JOB_TYPE_LABELS[job.type]}</Badge>}
                  {job.workMode && (
                    <Badge variant="neutral">{WORK_MODE_LABELS[job.workMode]}</Badge>
                  )}
                  {job.shiftType && (
                    <Badge variant="neutral">{SHIFT_TYPE_LABELS[job.shiftType]}</Badge>
                  )}
                  {job.urgencyLevel && job.urgencyLevel !== 'NORMAL' && (
                    <Badge variant={job.urgencyLevel === 'URGENT' ? 'warning' : 'error'}>
                      {URGENCY_LEVEL_LABELS[job.urgencyLevel]}
                    </Badge>
                  )}
                  {job.isFeatured && <Badge variant="secondary">Featured</Badge>}
                  {job.isPwdFriendly && <Badge variant="success">PwD Friendly</Badge>}
                  {job.visaSponsorshipAvailable && <Badge variant="info">Visa Sponsorship</Badge>}
                  {job.functionalArea && (
                    <Badge variant="neutral">{FUNCTIONAL_AREA_LABELS[job.functionalArea]}</Badge>
                  )}
                </div>
                {job.diversityTags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {job.diversityTags.map((tag) => (
                      <Badge key={tag} variant="neutral">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex shrink-0 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSave}
                disabled={saveMutation.isPending}
                tooltip="Save this job for later"
              >
                <Bookmark className="mr-1.5 h-4 w-4" /> Save
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleShare}
                tooltip="Share this job listing"
              >
                <Share2 className="mr-1.5 h-4 w-4" /> Share
              </Button>
              {isApplied ? (
                <Tooltip content="View your application">
                  <Link href={ROUTES.CANDIDATE.APPLICATIONS}>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-[var(--success)]/30 text-[var(--success)]"
                    >
                      <CheckCircle className="mr-1.5 h-4 w-4" /> Applied
                    </Button>
                  </Link>
                </Tooltip>
              ) : isFullyFilled ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled
                  className="opacity-60"
                  tooltip="All openings for this position have been filled"
                >
                  <Ban className="mr-1.5 h-4 w-4" /> Positions Filled
                </Button>
              ) : job.applyMethod === 'EXTERNAL_URL' && job.externalApplyUrl ? (
                <a href={job.externalApplyUrl} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" tooltip="Apply on external website">
                    <ExternalLink className="mr-1.5 h-4 w-4" /> Apply Externally
                  </Button>
                </a>
              ) : job.applyMethod === 'EMAIL' && job.contactEmail ? (
                <a
                  href={`mailto:${job.contactEmail}?subject=Application for ${encodeURIComponent(job.title)}`}
                >
                  <Button size="sm" tooltip="Send application via email">
                    <Mail className="mr-1.5 h-4 w-4" /> Apply via Email
                  </Button>
                </a>
              ) : (
                <Button
                  size="sm"
                  onClick={() => setShowApplyModal(true)}
                  tooltip="Submit your application"
                >
                  Apply Now
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Key Details */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: 'Openings',
              value: job.numberOfOpenings
                ? `${job._hiredCount ?? 0}/${job.numberOfOpenings} filled`
                : 'N/A',
              icon: Users,
            },
            {
              label: 'Education',
              value: job.educationRequired ? EDUCATION_LEVEL_LABELS[job.educationRequired] : 'Any',
              icon: GraduationCap,
            },
            {
              label: 'Experience Level',
              value: job.experienceLevel ? EXPERIENCE_LEVEL_LABELS[job.experienceLevel] : 'Any',
              icon: Briefcase,
            },
            {
              label: 'Salary Type',
              value: job.salaryType ? SALARY_TYPE_LABELS[job.salaryType] : 'N/A',
              icon: IndianRupee,
            },
          ].map((item) => (
            <Card key={item.label} padding="sm">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
                  <item.icon className="h-4 w-4 text-[var(--text-muted)]" />
                </div>
                <div>
                  <p className="text-xs text-[var(--text-muted)]">{item.label}</p>
                  <p className="text-sm font-medium text-[var(--text)]">{item.value}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Skills */}
        {((job.skillsRequired?.length ?? 0) > 0 || (job.niceToHaveSkills?.length ?? 0) > 0) && (
          <Card>
            {(job.skillsRequired?.length ?? 0) > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">Required Skills</h3>
                <div className="flex flex-wrap gap-1.5">
                  {job.skillsRequired.map((skill) => (
                    <Tag key={skill} label={skill} variant="primary" />
                  ))}
                </div>
              </div>
            )}
            {(job.niceToHaveSkills?.length ?? 0) > 0 && (
              <div className={(job.skillsRequired?.length ?? 0) > 0 ? 'mt-4' : ''}>
                <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">Nice to Have</h3>
                <div className="flex flex-wrap gap-1.5">
                  {job.niceToHaveSkills.map((skill) => (
                    <Tag key={skill} label={skill} variant="outline" />
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Job Details */}
        <Card>
          <h3 className="mb-3 text-base font-semibold text-[var(--text)]">Job Details</h3>
          <div className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            {job.industry && (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Industry</span>
                <span className="text-[var(--text)]">{job.industry}</span>
              </div>
            )}
            {job.department && (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Department</span>
                <span className="text-[var(--text)]">{job.department}</span>
              </div>
            )}
            {job.roleCategory && (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Role Category</span>
                <span className="text-[var(--text)]">{job.roleCategory}</span>
              </div>
            )}
            {job.preferredEducationField && (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Education Field</span>
                <span className="text-[var(--text)]">{job.preferredEducationField}</span>
              </div>
            )}
            {job.ugRequired && (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">UG Required</span>
                <span className="text-[var(--text)]">{EDUCATION_LEVEL_LABELS[job.ugRequired]}</span>
              </div>
            )}
            {job.pgRequired && (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">PG Required</span>
                <span className="text-[var(--text)]">{EDUCATION_LEVEL_LABELS[job.pgRequired]}</span>
              </div>
            )}
            {job.isRemote && (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Remote</span>
                <span className="text-[var(--success)]">Yes</span>
              </div>
            )}
            {job.travelRequired && (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Travel</span>
                <span className="text-[var(--text)]">Required</span>
              </div>
            )}
            {job.accommodationProvided && (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Accommodation</span>
                <span className="text-[var(--success)]">Provided</span>
              </div>
            )}
            {job.genderPreference && job.genderPreference !== 'ANY' && (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Gender Pref.</span>
                <span className="text-[var(--text)]">
                  {GENDER_PREFERENCE_LABELS[job.genderPreference]}
                </span>
              </div>
            )}
            {job.drivingLicenseRequired && job.drivingLicenseRequired !== 'NONE' && (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Driving License</span>
                <span className="text-[var(--text)]">
                  {DRIVING_LICENSE_TYPE_LABELS[job.drivingLicenseRequired]}
                </span>
              </div>
            )}
            {(job.ageMin || job.ageMax) && (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Age</span>
                <span className="text-[var(--text)]">
                  {job.ageMin || '—'} – {job.ageMax || '—'} years
                </span>
              </div>
            )}
            {job.backgroundCheckRequired && (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Background Check</span>
                <span className="text-[var(--text)]">Required</span>
              </div>
            )}
            {job.passportRequired && (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Passport</span>
                <span className="text-[var(--text)]">Required</span>
              </div>
            )}
            {job.applicationDeadline && (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Deadline</span>
                <span className="text-[var(--text)]">{formatDate(job.applicationDeadline)}</span>
              </div>
            )}
          </div>

          {/* Specific Degrees */}
          {(job.specificDegrees?.length ?? 0) > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs text-[var(--text-muted)]">Accepted Degrees</p>
              <div className="flex flex-wrap gap-1.5">
                {job.specificDegrees.map((d) => (
                  <Tag key={d} label={SPECIFIC_DEGREE_LABELS[d] || d} size="sm" />
                ))}
              </div>
            </div>
          )}

          {/* Degree Specializations */}
          {(job.degreeSpecializations?.length ?? 0) > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs text-[var(--text-muted)]">Degree Specializations</p>
              <div className="flex flex-wrap gap-1.5">
                {job.degreeSpecializations.map((spec) => (
                  <Tag key={spec} label={spec} size="sm" />
                ))}
              </div>
            </div>
          )}

          {/* Languages Required */}
          {(job.languagesRequired?.length ?? 0) > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs text-[var(--text-muted)]">Languages Required</p>
              <div className="flex flex-wrap gap-1.5">
                {job.languagesRequired.map((lang) => (
                  <Tag key={lang} label={lang} size="sm" />
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {(job.tags?.length ?? 0) > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs text-[var(--text-muted)]">Keywords</p>
              <div className="flex flex-wrap gap-1.5">
                {job.tags.map((tag) => (
                  <Tag key={tag} label={tag} size="sm" />
                ))}
              </div>
            </div>
          )}

          {/* Job Perks */}
          {(job.jobPerks?.length ?? 0) > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs text-[var(--text-muted)]">Job Perks</p>
              <div className="flex flex-wrap gap-1.5">
                {job.jobPerks.map((perk) => (
                  <Tag key={perk} label={perk} size="sm" variant="success" />
                ))}
              </div>
            </div>
          )}

          {/* Bond Details */}
          {job.bondDetails && (
            <div className="mt-3">
              <p className="mb-1 text-xs text-[var(--text-muted)]">Bond / Service Agreement</p>
              <p className="text-sm text-[var(--text)]">{job.bondDetails}</p>
            </div>
          )}
        </Card>

        {/* Walk-in Details */}
        {job.isWalkIn && job.walkInVenue && (
          <Card>
            <h3 className="mb-3 text-base font-semibold text-[var(--text)]">Walk-in Details</h3>
            <div className="space-y-2 text-sm text-[var(--text-secondary)]">
              {job.walkInStartDate && (
                <p>
                  <span className="text-[var(--text-muted)]">Date:</span>{' '}
                  {formatDate(job.walkInStartDate)}
                  {job.walkInEndDate ? ` – ${formatDate(job.walkInEndDate)}` : ''}
                </p>
              )}
              {job.walkInTime && (
                <p>
                  <span className="text-[var(--text-muted)]">Time:</span> {job.walkInTime}
                </p>
              )}
              <p>
                <span className="text-[var(--text-muted)]">Venue:</span> {job.walkInVenue}
              </p>
              {job.walkInContactPerson && (
                <p>
                  <span className="text-[var(--text-muted)]">Contact:</span>{' '}
                  {job.walkInContactPerson}
                  {job.walkInContactPhone ? ` (${job.walkInContactPhone})` : ''}
                </p>
              )}
              {job.walkInInstructions && (
                <p>
                  <span className="text-[var(--text-muted)]">Instructions:</span>{' '}
                  {job.walkInInstructions}
                </p>
              )}
            </div>
          </Card>
        )}

        {/* Notice Period */}
        {job.noticePeriodPreference.length > 0 && (
          <Card padding="sm">
            <p className="mb-1.5 text-xs text-[var(--text-muted)]">Notice Period Preference</p>
            <div className="flex flex-wrap gap-1.5">
              {job.noticePeriodPreference.map((np) => (
                <Badge key={np} variant="neutral">
                  {NOTICE_PERIOD_PREFERENCE_LABELS[np]}
                </Badge>
              ))}
            </div>
          </Card>
        )}

        {/* Tabs Content */}
        <Card>
          <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
          <div className="mt-4">
            {activeTab === 'description' && (
              <div className="prose prose-sm max-w-none text-[var(--text-secondary)]">
                <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.description) }} />
                {job.keyResponsibilities && (
                  <>
                    <h3 className="mt-6 text-base font-semibold text-[var(--text)]">
                      Key Responsibilities
                    </h3>
                    <div
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(job.keyResponsibilities),
                      }}
                    />
                  </>
                )}
                {job.interviewProcess && (
                  <>
                    <h3 className="mt-6 text-base font-semibold text-[var(--text)]">
                      Interview Process
                    </h3>
                    <p className="whitespace-pre-wrap">{job.interviewProcess}</p>
                  </>
                )}
              </div>
            )}
            {activeTab === 'requirements' && (
              <div className="prose prose-sm max-w-none text-[var(--text-secondary)]">
                {job.requirements ? (
                  <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.requirements) }} />
                ) : (
                  <p className="text-[var(--text-muted)]">No specific requirements listed.</p>
                )}
                {job.certificationsRequired.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-base font-semibold text-[var(--text)]">
                      Required Certifications
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {job.certificationsRequired.map((cert) => (
                        <Tag key={cert} label={cert} variant="outline" />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {activeTab === 'benefits' && (
              <div className="prose prose-sm max-w-none text-[var(--text-secondary)]">
                {job.benefits ? (
                  <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.benefits) }} />
                ) : (
                  <p className="text-[var(--text-muted)]">No benefits information listed.</p>
                )}
                {job.jobPerks.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-base font-semibold text-[var(--text)]">Perks</h3>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {job.jobPerks.map((perk) => (
                        <Tag key={perk} label={perk} variant="primary" />
                      ))}
                    </div>
                  </div>
                )}
                {job.relocationAssistance && (
                  <p className="mt-3 flex items-center gap-1 text-sm text-[var(--success)]">
                    <CheckCircle className="h-4 w-4" /> Relocation assistance available
                  </p>
                )}
              </div>
            )}
            {activeTab === 'company' && (
              <div>
                {job.isConfidential ? (
                  <div className="flex items-center gap-4 py-6">
                    <Shield className="h-10 w-10 text-[var(--text-muted)]" />
                    <div>
                      <h3 className="font-semibold text-[var(--text)]">Confidential Company</h3>
                      <p className="text-sm text-[var(--text-muted)]">
                        Company details are hidden for this listing. They will be shared after your
                        application is reviewed.
                      </p>
                    </div>
                  </div>
                ) : job.company ? (
                  <div className="space-y-4">
                    {/* Cover Image Banner */}
                    {job.company.coverImage && (
                      <div className="relative -mx-6 -mt-6 mb-6 h-48 w-[calc(100%+3rem)] overflow-hidden rounded-t-lg">
                        <img
                          src={job.company.coverImage}
                          alt={`${job.company.companyName} cover`}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}

                    <div className="flex items-center gap-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--bg-tertiary)]">
                        {job.company.logo ? (
                          <img
                            src={job.company.logo}
                            alt={job.company?.companyName || 'Company logo'}
                            className="h-12 w-12 rounded-lg object-contain"
                          />
                        ) : (
                          <Building2 className="h-7 w-7 text-[var(--text-muted)]" />
                        )}
                      </div>
                      <div>
                        <h3 className="flex flex-wrap items-center gap-2 font-semibold text-[var(--text)]">
                          {job.company.companyName}
                          {job.company.isVerified ? (
                            <Badge variant="success" size="sm">
                              <ShieldCheck className="mr-0.5 h-3 w-3" /> Verified
                            </Badge>
                          ) : (
                            <Badge variant="neutral" size="sm">
                              Not Verified
                            </Badge>
                          )}
                          <RatingBadge
                            rating={(job.company as { averageRating?: number }).averageRating ?? 0}
                            count={(job.company as { totalReviews?: number }).totalReviews ?? 0}
                            size="xs"
                            href={
                              (job.company as { slug?: string | null }).slug
                                ? `/companies/${encodeURIComponent((job.company as { slug?: string | null }).slug!)}/reviews`
                                : undefined
                            }
                          />
                          <PresenceIndicator userId={job.company.userId} showLabel size="sm" />
                        </h3>
                        {job.company.tagline && (
                          <p className="text-sm text-[var(--text-secondary)]">
                            {job.company.tagline}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--text-muted)]">
                          {job.company.companyType && (
                            <span>{COMPANY_TYPE_LABELS[job.company.companyType]}</span>
                          )}
                          {job.company.companySize && (
                            <span className="flex items-center gap-1">
                              <Users className="h-3.5 w-3.5" /> {job.company.companySize}
                              {job.company.employeeCount
                                ? ` (${job.company.employeeCount.toLocaleString()})`
                                : ''}
                            </span>
                          )}
                          {job.company.industry && (
                            <span>
                              {job.company.industry}
                              {job.company.subIndustry ? ` · ${job.company.subIndustry}` : ''}
                            </span>
                          )}
                          {(job.company.headquarters || job.company.city) && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />{' '}
                              {job.company.headquarters ||
                                [job.company.city, job.company.state].filter(Boolean).join(', ')}
                            </span>
                          )}
                          {job.company.foundedYear && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" /> Founded {job.company.foundedYear}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* View full company profile — links to the public
                        SEO surface when a slug exists, or the legacy
                        /company/{id} route which 301-redirects to the
                        slug URL when available. Plan §13 risk #25:
                        "Job → Company tab → Profile button entry path". */}
                    <div>
                      <Link
                        href={
                          job.company.slug
                            ? `/companies/${job.company.slug}`
                            : `/company/${job.company.id}`
                        }
                        className="bg-primary/10 text-primary hover:bg-primary/20 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                      >
                        View full company profile
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                    {job.company.description && (
                      <p className="line-clamp-4 text-sm leading-relaxed text-[var(--text-secondary)]">
                        {job.company.description}
                      </p>
                    )}
                    {job.company.website && (
                      <Tooltip content="Visit company website">
                        <a
                          href={job.company.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
                        >
                          <Globe className="h-3.5 w-3.5" />{' '}
                          {job.company.website.replace(/^https?:\/\//, '')}
                        </a>
                      </Tooltip>
                    )}
                    {job.company.locations && job.company.locations.length > 0 && (
                      <div>
                        <h4 className="mb-1.5 text-sm font-medium text-[var(--text)]">
                          Office Locations
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {job.company.locations.map((loc: string) => (
                            <span
                              key={loc}
                              className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-secondary)]"
                            >
                              <MapPin className="h-3 w-3" /> {loc}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* View Full Profile */}
                    <Tooltip content="View the full company profile">
                      <Link
                        href={ROUTES.PUBLIC.COMPANY(job.company.id)}
                        className="text-primary mt-2 inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
                      >
                        <Building2 className="h-4 w-4" /> View Full Company Profile
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </Tooltip>
                  </div>
                ) : (
                  <p className="text-[var(--text-muted)]">Company information not available.</p>
                )}
              </div>
            )}
          </div>
        </Card>

        {/* Sticky Apply */}
        {job.applyMethod === 'IN_PLATFORM' && (
          <div className="fixed right-0 bottom-0 left-0 z-40 border-t border-[var(--border)] bg-white p-4 sm:hidden">
            {isApplied ? (
              <Link href={ROUTES.CANDIDATE.APPLICATIONS}>
                <Button
                  fullWidth
                  variant="outline"
                  className="border-[var(--success)]/30 text-[var(--success)]"
                  tooltip="View your applications"
                >
                  <CheckCircle className="mr-1.5 h-4 w-4" /> Applied — View Applications
                </Button>
              </Link>
            ) : isFullyFilled ? (
              <Button
                fullWidth
                variant="outline"
                disabled
                className="opacity-60"
                tooltip="All openings for this position have been filled"
              >
                <Ban className="mr-1.5 h-4 w-4" /> Positions Filled
              </Button>
            ) : (
              <Button
                fullWidth
                onClick={() => setShowApplyModal(true)}
                tooltip="Submit your application"
              >
                Apply Now
              </Button>
            )}
          </div>
        )}

        {/* Apply Modal */}
        <Modal
          isOpen={showApplyModal}
          onClose={() => setShowApplyModal(false)}
          title="Apply to this Job"
          size="md"
          footer={
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowApplyModal(false)}
                tooltip="Cancel application"
              >
                Cancel
              </Button>
              <Button
                onClick={handleApply}
                isLoading={applyMutation.isPending}
                tooltip="Submit your application"
              >
                Submit Application
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-[var(--text)]">{job.title}</h3>
              <p className="text-sm text-[var(--text-muted)]">
                {job.isConfidential ? 'Confidential Company' : job.company?.companyName} ·{' '}
                {job.location}
              </p>
            </div>

            {/* Screening Questions */}
            {(job.screeningQuestions?.length ?? 0) > 0 && (
              <ScreeningQuestionForm
                questions={job.screeningQuestions!}
                answers={screeningAnswers}
                onChange={setScreeningAnswers}
              />
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                Cover Letter <span className="text-[var(--text-muted)]">(optional)</span>
              </label>
              <textarea
                value={coverLetter}
                onChange={(e) => setCoverLetter(e.target.value)}
                rows={4}
                placeholder="Tell the employer why you're a great fit for this role..."
                className="focus:border-primary focus:ring-primary/20 w-full resize-none rounded-lg border border-[var(--border)] bg-white p-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:ring-2 focus:outline-none"
              />
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Your profile and resume will be shared with the employer.
            </p>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
