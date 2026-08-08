'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowLeft,
  Building2,
  MapPin,
  Users,
  Globe,
  Calendar,
  ShieldCheck,
  Mail,
  Phone,
  User,
  Linkedin,
  ExternalLink,
  Heart,
  Trophy,
  Cpu,
  Quote,
  Camera,
  Rocket,
  Eye,
  Target,
  Gem,
  Handshake,
  Youtube,
  Instagram,
  Facebook,
  Play,
  TrendingUp,
  DollarSign,
  Briefcase,
  BookOpen,
  Home,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import Tooltip from '@/components/ui/Tooltip';
import CompanyDetailTabs from '@/components/company-search/CompanyDetailTabs';
import {
  deriveAvailableCompanyTabs,
  type CompanyTabKey,
} from '@/components/company-search/company-tabs-helpers';
import CompanyTabPanels from '@/components/company-search/CompanyTabPanels';
import CompanyJobsTab from '@/components/company-search/CompanyJobsTab';
import CompanyFollowButton from '@/components/company-search/CompanyFollowButton';
import SocialLinksBento, { companySocialLinks } from '@/components/common/SocialLinksBento';
import { employerService } from '@/services/employer.service';
import { jobService } from '@/services/job.service';
import { companyReviewService } from '@/services/company-review.service';
import ReviewsByJobProfilesPreview from '@/components/reviews/ReviewsByJobProfilesPreview';
import RatingBadge from '@/components/reviews/RatingBadge';
import { QUERY_KEYS } from '@/constants/config';
import { ROUTES } from '@/constants/routes';
import { FUNDING_STAGE_LABELS } from '@/constants/enums';
import type { CompanyProfile } from '@/types/employer';

export default function CompanyProfilePreviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = (searchParams?.get('tab') ?? 'overview') as CompanyTabKey;

  const { data: companyData, isLoading } = useQuery({
    queryKey: QUERY_KEYS.EMPLOYERS.COMPANY,
    queryFn: () => employerService.getCompany(),
  });

  const company = companyData?.data as CompanyProfile | undefined;
  const isIndividual = company?.accountType === 'INDIVIDUAL';

  // Reviews stats — used for the rating badge in the hero + the
  // top-job-profiles preview. Independent fetch so it doesn't block
  // the company query.
  const { data: reviewStats } = useQuery({
    queryKey: ['employer', 'reviews', 'stats'],
    queryFn: () => companyReviewService.getEmployerStats(),
    enabled: !!company,
  });

  // Tab availability derived from the data so we hide tabs the
  // employer hasn't filled in yet (matches what candidates would see).
  const availableTabs = company
    ? deriveAvailableCompanyTabs(company)
    : new Set<CompanyTabKey>(['overview', 'jobs']);
  const activeTab: CompanyTabKey = availableTabs.has(requestedTab) ? requestedTab : 'overview';

  // Jobs tab data — only fetch when tab is active to avoid unnecessary
  // network on initial Overview-tab landing.
  const { data: myJobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ['employer-preview-jobs'],
    queryFn: () => jobService.getMyJobs(1, 50, 'OPEN'),
    enabled: activeTab === 'jobs',
    staleTime: 60 * 1000,
  });

  const myJobs = myJobsData?.data?.items ?? [];
  const totalOpenJobs = myJobsData?.data?.total ?? 0;

  return (
    <DashboardLayout requiredRole={['EMPLOYER']}>
      <div className="space-y-6">
        {/* Top Bar */}
        <div className="flex items-center justify-between rounded-lg bg-[var(--bg-secondary)] p-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(ROUTES.EMPLOYER.PROFILE)}
              tooltip="Back to edit profile"
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Edit
            </Button>
            <span className="text-sm font-medium text-[var(--text-secondary)]">
              Profile Preview — This is how candidates see your company
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-6">
            <Card>
              <Skeleton variant="rect" height={200} />
            </Card>
            <Card>
              <Skeleton variant="rect" height={150} />
            </Card>
            <Card>
              <Skeleton variant="rect" height={200} />
            </Card>
          </div>
        ) : company ? (
          <>
            {/* Cover Image Banner */}
            {company.coverImage && (
              <div className="relative h-64 w-full overflow-hidden rounded-xl">
                <img
                  src={company.coverImage}
                  alt={`${company.companyName} cover`}
                  className="h-full w-full object-cover"
                />
              </div>
            )}

            {/* Company Header */}
            <Card>
              <div className="flex flex-col gap-6 sm:flex-row">
                {/* Logo */}
                <div className="flex shrink-0 items-start">
                  {company.logo ? (
                    <img
                      src={company.logo}
                      alt={`${company.companyName} logo`}
                      className="h-28 w-28 rounded-xl border-2 border-[var(--bg-secondary)] object-contain"
                    />
                  ) : (
                    <div className="bg-primary-light flex h-28 w-28 items-center justify-center rounded-xl">
                      <Building2 className="text-primary h-12 w-12" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 space-y-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-2xl font-bold text-[var(--text)]">
                        {company.companyName}
                      </h1>
                      {company.isVerified ? (
                        <Badge variant="success" size="sm">
                          <ShieldCheck className="mr-1 h-3 w-3" /> Verified
                        </Badge>
                      ) : (
                        <Badge variant="neutral" size="sm">
                          Not Verified
                        </Badge>
                      )}
                      <RatingBadge
                        rating={reviewStats?.averageOverall ?? 0}
                        count={reviewStats?.totalReviews ?? 0}
                        size="sm"
                        href="/employer/reviews"
                      />
                    </div>
                    {company.tagline && (
                      <p className="mt-0.5 text-base text-[var(--text-secondary)]">
                        {company.tagline}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-3 text-sm text-[var(--text-secondary)]">
                    {company.industry && (
                      <span className="flex items-center gap-1">
                        <Building2 className="h-4 w-4" /> {company.industry}
                        {company.subIndustry ? ` · ${company.subIndustry}` : ''}
                      </span>
                    )}
                    {!isIndividual && company.companySize && (
                      <span className="flex items-center gap-1">
                        <Users className="h-4 w-4" /> {company.companySize}
                        {company.employeeCount
                          ? ` (${company.employeeCount.toLocaleString()})`
                          : ''}
                      </span>
                    )}
                    {(company.headquarters || company.city) && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />{' '}
                        {company.headquarters ||
                          [company.city, company.state].filter(Boolean).join(', ')}
                      </span>
                    )}
                    {company.foundedYear && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" /> Founded {company.foundedYear}
                      </span>
                    )}
                    {!isIndividual && company.numberOfOffices && (
                      <span className="flex items-center gap-1">
                        <Home className="h-4 w-4" /> {company.numberOfOffices}{' '}
                        {company.numberOfOffices === 1 ? 'office' : 'offices'}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {company.companyType && (
                      <Badge variant="neutral" size="sm">
                        {company.companyType.replace(/_/g, ' ')}
                      </Badge>
                    )}
                    {company.parentCompany && (
                      <Badge variant="neutral" size="sm">
                        Subsidiary of {company.parentCompany}
                      </Badge>
                    )}
                    {company.stockTicker && (
                      <Badge variant="neutral" size="sm">
                        <TrendingUp className="mr-1 h-3 w-3" /> {company.stockTicker}
                      </Badge>
                    )}
                  </div>

                  {company.website && (
                    <Tooltip content="Visit company website">
                      <a
                        href={company.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
                      >
                        <Globe className="h-3.5 w-3.5" />{' '}
                        {company.website.replace(/^https?:\/\//, '')}
                      </a>
                    </Tooltip>
                  )}
                  {/* Follow button — shows the same control candidates
                      see. The self-follow guard inside the component
                      hides the button entirely for the company owner,
                      so what the employer sees here is the followers
                      count badge alone. */}
                  <div className="mt-3">
                    <CompanyFollowButton
                      idOrSlug={company.slug ?? company.id}
                      companyOwnerUserId={company.userId}
                    />
                  </div>
                </div>
              </div>
            </Card>

            {/* Tab nav — same 8-tab structure candidates see on
                /companies/{slug}. Tab keys auto-hide when the employer
                hasn't filled the relevant fields. */}
            <CompanyDetailTabs openJobsCount={totalOpenJobs} available={availableTabs} />

            {/* Per-tab content for tabs OTHER than Overview — shared
                with the public detail page via CompanyTabPanels.
                Overview is handled by the legacy block below (which
                shows the employer-extras the public surface hides). */}
            {activeTab !== 'overview' && activeTab !== 'jobs' && (
              <CompanyTabPanels
                activeTab={activeTab}
                company={{
                  companyName: company.companyName,
                  description: company.description,
                  whyWorkForUs: company.whyWorkForUs,
                  missionStatement: company.missionStatement,
                  visionStatement: company.visionStatement,
                  coreValues: company.coreValues,
                  companyCulture: company.companyCulture,
                  diversityStatement: company.diversityStatement,
                  csrInitiatives: company.csrInitiatives,
                  benefits: company.benefits,
                  structuredPerks: company.structuredPerks,
                  workplacePolicies: company.workplacePolicies,
                  leadershipTeam: company.leadershipTeam,
                  employeeTestimonials: company.employeeTestimonials,
                  officePhotos: company.officePhotos,
                  companyVideoUrl: company.companyVideoUrl,
                  techStack: company.techStack,
                  productsServices: company.productsServices,
                  specialties: company.specialties,
                  interviewProcess: company.interviewProcess,
                  socialLinks: company.socialLinks as Record<string, unknown> | null | undefined,
                }}
              />
            )}

            {/* ════════════════ Legacy Overview block ════════════════
                Below content is rendered ONLY when the active tab is
                "overview" — it duplicates fields the shared
                CompanyTabPanels also surfaces, but adds the
                employer-side extras (awards/funding/contact/etc.) that
                the public surface intentionally hides. Hidden when any
                other tab is active. */}
            {activeTab === 'overview' && (
              <>
                {/* About */}
                {(company.description || company.whyWorkForUs) && (
                  <Card
                    header={<h2 className="text-lg font-semibold text-[var(--text)]">About</h2>}
                  >
                    <div className="space-y-4">
                      {company.description && (
                        <p className="text-sm leading-relaxed whitespace-pre-line text-[var(--text-secondary)]">
                          {company.description}
                        </p>
                      )}
                      {company.whyWorkForUs && (
                        <div>
                          <h3 className="mb-1 text-sm font-semibold text-[var(--text)]">
                            Why Work With Us
                          </h3>
                          <p className="text-sm leading-relaxed whitespace-pre-line text-[var(--text-secondary)]">
                            {company.whyWorkForUs}
                          </p>
                        </div>
                      )}
                    </div>
                  </Card>
                )}

                {/* Reviews preview — same component used on the public
                surface. WriteReviewBox is intentionally omitted; an
                employer can't review their own company. */}
                <ReviewsByJobProfilesPreview
                  companySlug={company.slug ?? company.id}
                  topJobProfiles={reviewStats?.topJobProfiles ?? []}
                  totalReviews={reviewStats?.totalReviews ?? 0}
                />

                {/* Company Video */}
                {company.companyVideoUrl && (
                  <Card
                    header={
                      <div className="flex items-center gap-2">
                        <Play className="h-5 w-5 text-[var(--error)]" />
                        <h2 className="text-lg font-semibold text-[var(--text)]">Company Video</h2>
                      </div>
                    }
                  >
                    <Tooltip content="Watch company video">
                      <a
                        href={company.companyVideoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary inline-flex items-center gap-2 text-sm hover:underline"
                      >
                        <Play className="h-4 w-4" /> Watch our company video
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </Tooltip>
                  </Card>
                )}

                {/* Mission & Vision */}
                {(company.missionStatement || company.visionStatement) && (
                  <div className="grid gap-6 sm:grid-cols-2">
                    {company.missionStatement && (
                      <Card
                        header={
                          <div className="flex items-center gap-2">
                            <Target className="text-primary h-5 w-5" />
                            <h2 className="text-lg font-semibold text-[var(--text)]">Mission</h2>
                          </div>
                        }
                      >
                        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                          {company.missionStatement}
                        </p>
                      </Card>
                    )}
                    {company.visionStatement && (
                      <Card
                        header={
                          <div className="flex items-center gap-2">
                            <Eye className="text-accent h-5 w-5" />
                            <h2 className="text-lg font-semibold text-[var(--text)]">Vision</h2>
                          </div>
                        }
                      >
                        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                          {company.visionStatement}
                        </p>
                      </Card>
                    )}
                  </div>
                )}

                {/* Culture & Values */}
                {(company.companyCulture ||
                  (company.coreValues && company.coreValues.length > 0) ||
                  company.diversityStatement) && (
                  <Card
                    header={
                      <div className="flex items-center gap-2">
                        <Heart className="h-5 w-5 text-[var(--error)]" />
                        <h2 className="text-lg font-semibold text-[var(--text)]">
                          Culture & Values
                        </h2>
                      </div>
                    }
                  >
                    <div className="space-y-4">
                      {company.companyCulture && (
                        <p className="text-sm leading-relaxed whitespace-pre-line text-[var(--text-secondary)]">
                          {company.companyCulture}
                        </p>
                      )}
                      {company.coreValues && company.coreValues.length > 0 && (
                        <div>
                          <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">
                            Core Values
                          </h3>
                          <div className="flex flex-wrap gap-2">
                            {company.coreValues.map((value) => (
                              <span
                                key={value}
                                className="bg-primary-light text-primary inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium"
                              >
                                <Gem className="mr-1.5 h-3.5 w-3.5" /> {value}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {company.diversityStatement && (
                        <div>
                          <h3 className="mb-1 text-sm font-semibold text-[var(--text)]">
                            Diversity & Inclusion
                          </h3>
                          <p className="text-sm text-[var(--text-secondary)]">
                            {company.diversityStatement}
                          </p>
                        </div>
                      )}
                      {company.employeeResourceGroups &&
                        company.employeeResourceGroups.length > 0 && (
                          <div>
                            <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">
                              Employee Resource Groups
                            </h3>
                            <div className="flex flex-wrap gap-2">
                              {company.employeeResourceGroups.map((erg) => (
                                <Badge key={erg} variant="neutral" size="sm">
                                  {erg}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                    </div>
                  </Card>
                )}

                {/* Benefits & Perks */}
                {company.benefits && company.benefits.length > 0 && (
                  <Card
                    header={
                      <div className="flex items-center gap-2">
                        <Handshake className="h-5 w-5 text-[var(--success)]" />
                        <h2 className="text-lg font-semibold text-[var(--text)]">
                          Benefits & Perks
                        </h2>
                      </div>
                    }
                  >
                    <div className="space-y-6">
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {company.benefits.map((benefit) => (
                          <div
                            key={benefit}
                            className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-secondary)]"
                          >
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--success)]" />
                            {benefit}
                          </div>
                        ))}
                      </div>

                      {/* Structured Perks by Category */}
                      {company.structuredPerks && company.structuredPerks.length > 0 && (
                        <div className="space-y-4">
                          {company.structuredPerks.map((cat) => (
                            <div key={cat.category}>
                              <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">
                                {cat.category}
                              </h3>
                              <div className="flex flex-wrap gap-2">
                                {cat.perks.map((perk) => (
                                  <span
                                    key={perk}
                                    className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)]"
                                  >
                                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--success)]" />
                                    {perk}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </Card>
                )}

                {/* Structured Perks standalone (when no flat benefits) */}
                {(!company.benefits || company.benefits.length === 0) &&
                  company.structuredPerks &&
                  company.structuredPerks.length > 0 && (
                    <Card
                      header={
                        <div className="flex items-center gap-2">
                          <Handshake className="h-5 w-5 text-[var(--success)]" />
                          <h2 className="text-lg font-semibold text-[var(--text)]">Perks</h2>
                        </div>
                      }
                    >
                      <div className="space-y-4">
                        {company.structuredPerks.map((cat) => (
                          <div key={cat.category}>
                            <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">
                              {cat.category}
                            </h3>
                            <div className="flex flex-wrap gap-2">
                              {cat.perks.map((perk) => (
                                <span
                                  key={perk}
                                  className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)]"
                                >
                                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--success)]" />
                                  {perk}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                {/* Products & Services */}
                {company.productsServices && company.productsServices.length > 0 && (
                  <Card
                    header={
                      <div className="flex items-center gap-2">
                        <Rocket className="text-secondary h-5 w-5" />
                        <h2 className="text-lg font-semibold text-[var(--text)]">
                          Products & Services
                        </h2>
                      </div>
                    }
                  >
                    <div className="flex flex-wrap gap-2">
                      {company.productsServices.map((ps) => (
                        <Badge key={ps} variant="neutral" size="sm">
                          {ps}
                        </Badge>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Tech Stack */}
                {company.techStack && company.techStack.length > 0 && (
                  <Card
                    header={
                      <div className="flex items-center gap-2">
                        <Cpu className="text-primary h-5 w-5" />
                        <h2 className="text-lg font-semibold text-[var(--text)]">Tech Stack</h2>
                      </div>
                    }
                  >
                    <div className="flex flex-wrap gap-2">
                      {company.techStack.map((tech) => (
                        <span
                          key={tech}
                          className="bg-primary-light text-primary inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium"
                        >
                          {tech}
                        </span>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Interview Process */}
                {company.interviewProcess && (
                  <Card
                    header={
                      <h2 className="text-lg font-semibold text-[var(--text)]">
                        Interview Process
                      </h2>
                    }
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-line text-[var(--text-secondary)]">
                      {company.interviewProcess}
                    </p>
                  </Card>
                )}

                {/* Leadership Team — Company only */}
                {!isIndividual && company.leadershipTeam && company.leadershipTeam.length > 0 && (
                  <Card
                    header={
                      <div className="flex items-center gap-2">
                        <Users className="text-accent h-5 w-5" />
                        <h2 className="text-lg font-semibold text-[var(--text)]">
                          Leadership Team
                        </h2>
                      </div>
                    }
                  >
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {company.leadershipTeam.map((leader, i) => (
                        <div
                          key={i}
                          className="flex gap-3 rounded-lg border border-[var(--border)] p-4"
                        >
                          {leader.imageUrl ? (
                            <img
                              src={leader.imageUrl}
                              alt={leader.name}
                              className="h-12 w-12 shrink-0 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
                              <User className="h-6 w-6 text-[var(--text-muted)]" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              <h3 className="truncate font-semibold text-[var(--text)]">
                                {leader.name}
                              </h3>
                              {leader.linkedinUrl && (
                                <Tooltip content="View LinkedIn profile">
                                  <a
                                    href={leader.linkedinUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label="View LinkedIn profile"
                                  >
                                    <Linkedin className="h-3.5 w-3.5 text-[#0A66C2]" />
                                  </a>
                                </Tooltip>
                              )}
                            </div>
                            <p className="text-sm text-[var(--text-secondary)]">
                              {leader.designation}
                            </p>
                            {leader.bio && (
                              <p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">
                                {leader.bio}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Employee Testimonials — Company only */}
                {!isIndividual &&
                  company.employeeTestimonials &&
                  company.employeeTestimonials.length > 0 && (
                    <Card
                      header={
                        <div className="flex items-center gap-2">
                          <Quote className="h-5 w-5 text-[#8B5CF6]" />
                          <h2 className="text-lg font-semibold text-[var(--text)]">
                            Employee Testimonials
                          </h2>
                        </div>
                      }
                    >
                      <div className="grid gap-4 sm:grid-cols-2">
                        {company.employeeTestimonials.map((testimonial, i) => (
                          <div key={i} className="rounded-lg border border-[var(--border)] p-4">
                            <p className="text-sm text-[var(--text-secondary)] italic">
                              &ldquo;{testimonial.quote}&rdquo;
                            </p>
                            <div className="mt-3 flex items-center gap-3">
                              {testimonial.imageUrl ? (
                                <img
                                  src={testimonial.imageUrl}
                                  alt={testimonial.name}
                                  className="h-8 w-8 rounded-full object-cover"
                                />
                              ) : (
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
                                  <User className="h-4 w-4 text-[var(--text-muted)]" />
                                </div>
                              )}
                              <div>
                                <p className="text-sm font-medium text-[var(--text)]">
                                  {testimonial.name}
                                </p>
                                <p className="text-xs text-[var(--text-muted)]">
                                  {[testimonial.designation, testimonial.department]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                {/* Awards & Recognitions */}
                {company.awardsRecognitions && company.awardsRecognitions.length > 0 && (
                  <Card
                    header={
                      <div className="flex items-center gap-2">
                        <Trophy className="text-secondary h-5 w-5" />
                        <h2 className="text-lg font-semibold text-[var(--text)]">
                          Awards & Recognitions
                        </h2>
                      </div>
                    }
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      {company.awardsRecognitions.map((award, i) => (
                        <div key={i} className="rounded-lg border border-[var(--border)] p-3">
                          <h3 className="font-medium text-[var(--text)]">{award.title}</h3>
                          <p className="text-xs text-[var(--text-muted)]">
                            {[award.issuer, award.year].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Funding & Investors — Company only */}
                {!isIndividual &&
                  (company.fundingStage ||
                    company.totalFundingRaised ||
                    company.annualRevenueRange ||
                    (company.investors && company.investors.length > 0)) && (
                    <Card
                      header={
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-5 w-5 text-[var(--success)]" />
                          <h2 className="text-lg font-semibold text-[var(--text)]">
                            Funding & Investors
                          </h2>
                        </div>
                      }
                    >
                      <div className="space-y-4">
                        <div className="flex flex-wrap gap-4 text-sm text-[var(--text-secondary)]">
                          {company.fundingStage && (
                            <span className="flex items-center gap-1.5">
                              <span className="font-medium text-[var(--text)]">Stage:</span>{' '}
                              {FUNDING_STAGE_LABELS[company.fundingStage] || company.fundingStage}
                            </span>
                          )}
                          {company.totalFundingRaised && (
                            <span className="flex items-center gap-1.5">
                              <span className="font-medium text-[var(--text)]">Total Raised:</span>{' '}
                              {company.totalFundingRaised}
                            </span>
                          )}
                          {company.annualRevenueRange && (
                            <span className="flex items-center gap-1.5">
                              <span className="font-medium text-[var(--text)]">
                                Annual Revenue:
                              </span>{' '}
                              {company.annualRevenueRange}
                            </span>
                          )}
                        </div>
                        {company.investors && company.investors.length > 0 && (
                          <div>
                            <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">
                              Investors
                            </h3>
                            <div className="flex flex-wrap gap-2">
                              {company.investors.map((investor) => (
                                <Badge key={investor} variant="neutral" size="sm">
                                  {investor}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </Card>
                  )}

                {/* Workplace Policies */}
                {company.workplacePolicies && Object.keys(company.workplacePolicies).length > 0 && (
                  <Card
                    header={
                      <div className="flex items-center gap-2">
                        <Briefcase className="text-primary h-5 w-5" />
                        <h2 className="text-lg font-semibold text-[var(--text)]">
                          Workplace Policies
                        </h2>
                      </div>
                    }
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      {Object.entries(company.workplacePolicies).map(([key, value]) => (
                        <div
                          key={key}
                          className="rounded-lg border border-[var(--border)] px-3 py-2"
                        >
                          <span className="text-sm font-medium text-[var(--text)]">
                            {key
                              .replace(/([A-Z])/g, ' $1')
                              .replace(/^./, (s) => s.toUpperCase())
                              .trim()}
                          </span>
                          <p className="text-sm text-[var(--text-secondary)]">{value}</p>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Office Photos */}
                {company.officePhotos && company.officePhotos.length > 0 && (
                  <Card
                    header={
                      <div className="flex items-center gap-2">
                        <Camera className="text-accent h-5 w-5" />
                        <h2 className="text-lg font-semibold text-[var(--text)]">Office Photos</h2>
                      </div>
                    }
                  >
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {company.officePhotos.map((photo, i) => (
                        <div
                          key={i}
                          className="overflow-hidden rounded-lg border border-[var(--border)]"
                        >
                          <img
                            src={photo.url}
                            alt={photo.caption || 'Office photo'}
                            className="aspect-video w-full object-cover"
                          />
                          {(photo.caption || photo.location) && (
                            <div className="px-3 py-2">
                              {photo.caption && (
                                <p className="text-sm text-[var(--text)]">{photo.caption}</p>
                              )}
                              {photo.location && (
                                <p className="text-xs text-[var(--text-muted)]">
                                  <MapPin className="mr-0.5 inline h-3 w-3" />
                                  {photo.location}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Locations */}
                {((company.locations && company.locations.length > 0) || company.addressLine1) && (
                  <Card
                    header={
                      <div className="flex items-center gap-2">
                        <MapPin className="h-5 w-5 text-[var(--error)]" />
                        <h2 className="text-lg font-semibold text-[var(--text)]">
                          Office Locations
                        </h2>
                      </div>
                    }
                  >
                    <div className="space-y-4">
                      {company.addressLine1 && (
                        <div className="text-sm text-[var(--text-secondary)]">
                          <h3 className="mb-1 text-sm font-semibold text-[var(--text)]">
                            Primary Address
                          </h3>
                          <p>
                            {[
                              company.addressLine1,
                              company.addressLine2,
                              company.city,
                              company.state,
                              company.pincode,
                              company.country,
                            ]
                              .filter(Boolean)
                              .join(', ')}
                          </p>
                        </div>
                      )}
                      {company.locations && company.locations.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {company.locations.map((loc) => (
                            <span
                              key={loc}
                              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)]"
                            >
                              <MapPin className="h-3.5 w-3.5" /> {loc}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </Card>
                )}

                {/* Social Links — bento-grid display via the shared
                SocialLinksBento component. Replaces the previous
                flat-list layout. Careers + blog URLs are rendered
                as separate plain-link badges below since they
                don't fit the social-platform schema. */}
                <SocialLinksBento
                  heading="Connect with us"
                  links={companySocialLinks(
                    company.socialLinks as Record<string, unknown> | null | undefined,
                  )}
                />
                {(company.careersPageUrl || company.blogUrl) && (
                  <div className="flex flex-wrap gap-3">
                    {company.careersPageUrl && (
                      <Tooltip content="Visit careers page">
                        <a
                          href={company.careersPageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
                        >
                          <ExternalLink className="text-primary h-4 w-4" /> Careers Page
                        </a>
                      </Tooltip>
                    )}
                    {company.blogUrl && (
                      <Tooltip content="Visit company blog">
                        <a
                          href={company.blogUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
                        >
                          <BookOpen className="text-secondary h-4 w-4" /> Blog
                        </a>
                      </Tooltip>
                    )}
                  </div>
                )}

                {/* Contact Information */}
                {(company.contactEmail || company.contactPhone || company.contactPersonName) && (
                  <Card
                    header={
                      <div className="flex items-center gap-2">
                        <Mail className="text-accent h-5 w-5" />
                        <h2 className="text-lg font-semibold text-[var(--text)]">
                          Contact Information
                        </h2>
                      </div>
                    }
                  >
                    <div className="flex flex-wrap gap-6 text-sm text-[var(--text-secondary)]">
                      {company.contactPersonName && (
                        <span className="flex items-center gap-2">
                          <User className="h-4 w-4 text-[var(--text-muted)]" />
                          <span>
                            {company.contactPersonName}
                            {company.contactPersonDesignation && (
                              <span className="text-[var(--text-muted)]">
                                {' '}
                                · {company.contactPersonDesignation}
                              </span>
                            )}
                          </span>
                        </span>
                      )}
                      {company.contactEmail && (
                        <span className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-[var(--text-muted)]" />{' '}
                          {company.contactEmail}
                        </span>
                      )}
                      {company.contactPhone && (
                        <span className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-[var(--text-muted)]" />{' '}
                          {company.contactPhone}
                        </span>
                      )}
                    </div>
                  </Card>
                )}

                {/* CSR Initiatives */}
                {company.csrInitiatives && (
                  <Card
                    header={
                      <h2 className="text-lg font-semibold text-[var(--text)]">CSR Initiatives</h2>
                    }
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-line text-[var(--text-secondary)]">
                      {company.csrInitiatives}
                    </p>
                  </Card>
                )}

                {/* Specialties */}
                {company.specialties && company.specialties.length > 0 && (
                  <Card
                    header={
                      <h2 className="text-lg font-semibold text-[var(--text)]">Specialties</h2>
                    }
                  >
                    <div className="flex flex-wrap gap-2">
                      {company.specialties.map((spec) => (
                        <Badge key={spec} variant="neutral" size="sm">
                          {spec}
                        </Badge>
                      ))}
                    </div>
                  </Card>
                )}
              </>
            )}
            {/* ════════════════ /Overview tab ════════════════ */}

            {/* Jobs tab — when the company has a slug we use the
                same filterable + paginated CompanyJobsTab candidates
                see (so the preview is exactly what a candidate sees).
                For brand-new employers without a slug yet, we fall
                back to the simpler in-place list of the employer's
                own jobs. */}
            {activeTab === 'jobs' &&
              (company.slug ? (
                <CompanyJobsTab
                  slug={company.slug}
                  company={{
                    id: company.id,
                    slug: company.slug,
                    companyName: company.companyName,
                    logo: company.logo,
                    isVerified: company.isVerified,
                  }}
                  isGuest={false}
                />
              ) : (
                <Card
                  header={
                    <h2 className="text-lg font-semibold text-[var(--text)]">
                      Open jobs ({totalOpenJobs})
                    </h2>
                  }
                >
                  {jobsLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} variant="rect" height={88} />
                      ))}
                    </div>
                  ) : myJobs.length === 0 ? (
                    <EmptyState
                      title="No open jobs yet"
                      description="Post your first job and candidates will see it listed here."
                      action={
                        <Link
                          href={ROUTES.EMPLOYER.POST_JOB}
                          className="bg-primary inline-flex items-center gap-1 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-hover)]"
                        >
                          Post a job
                        </Link>
                      }
                    />
                  ) : (
                    <ul className="space-y-3">
                      {myJobs.map((j) => (
                        <li key={j.id}>
                          <Link
                            href={ROUTES.EMPLOYER.JOB_DETAIL(j.id)}
                            className="hover:border-primary/40 flex items-start justify-between gap-3 rounded-lg border border-[var(--border)] bg-white p-4 transition-colors"
                          >
                            <div className="min-w-0 flex-1">
                              <h3 className="line-clamp-1 text-sm font-bold text-[var(--text)]">
                                {j.title}
                              </h3>
                              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                                {j.location}
                                {j.workMode ? ` · ${j.workMode}` : ''}
                                {' · '}
                                {j.experienceMin}
                                {j.experienceMax ? `–${j.experienceMax}` : '+'} yrs
                              </p>
                            </div>
                            <Badge variant="success" size="sm">
                              {j.status}
                            </Badge>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              ))}
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
