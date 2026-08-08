'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  MapPin,
  Briefcase,
  GraduationCap,
  Mail,
  Phone,
  Globe,
  Github,
  Linkedin,
  Code,
  Award,
  BookOpen,
  Calendar,
  Building2,
  Clock,
  CheckCircle,
  ExternalLink,
  Languages,
  Trophy,
  Heart,
  FolderKanban,
  Palette,
  FileText,
  Users,
  Download,
  Video,
  Car,
  Shield,
  Accessibility,
  Activity,
  Pencil,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import BrandIcon from '@/components/common/BrandIcon';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Tag from '@/components/ui/Tag';
import ProgressBar from '@/components/ui/ProgressBar';
import Skeleton from '@/components/ui/Skeleton';
import Tooltip from '@/components/ui/Tooltip';
import { candidateService } from '@/services/candidate.service';
import { QUERY_KEYS } from '@/constants/config';
import { ROUTES } from '@/constants/routes';
import {
  WORK_STATUS_LABELS,
  NOTICE_PERIOD_LABELS,
  WORK_MODE_LABELS,
  JOB_TYPE_LABELS,
  SHIFT_TYPE_LABELS,
  OPEN_TO_WORK_LABELS,
  CAREER_BREAK_TYPE_LABELS,
  DISABILITY_TYPE_LABELS,
  COURSE_TYPE_LABELS,
  GRADE_TYPE_LABELS,
  PATENT_STATUS_LABELS,
} from '@/constants/enums';
import { formatRelativeDate } from '@/lib/utils';
import { formatSalaryAsLPA } from '@/utils/format';
import type { CandidateProfile } from '@/types/candidate';
import VerifiedBadge from '@/components/billing/VerifiedBadge';
import CandidateDetailTabs, {
  deriveAvailableCandidateTabs,
  type CandidateTabKey,
} from '@/components/candidate-search/CandidateDetailTabs';
import SocialLinksBento, { candidateSocialLinks } from '@/components/common/SocialLinksBento';

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function formatFullDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function ProfilePreviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = (searchParams?.get('tab') ?? 'overview') as CandidateTabKey;

  const { data: profileData, isLoading } = useQuery({
    queryKey: QUERY_KEYS.CANDIDATES.PROFILE,
    queryFn: () => candidateService.getProfile(),
  });

  const { data: completenessData } = useQuery({
    queryKey: QUERY_KEYS.CANDIDATES.COMPLETENESS,
    queryFn: () => candidateService.getCompleteness(),
  });

  const profile = profileData?.data as CandidateProfile | undefined;
  const completeness = completenessData?.data;

  // Tab availability — auto-hide tabs the candidate hasn't filled in.
  const availableTabs = profile
    ? deriveAvailableCandidateTabs(profile)
    : new Set<CandidateTabKey>(['overview']);
  const activeTab: CandidateTabKey = availableTabs.has(requestedTab) ? requestedTab : 'overview';

  return (
    <DashboardLayout requiredRole={['CANDIDATE']}>
      <div className="space-y-6">
        {/* Top Bar */}
        <div className="flex items-center justify-between rounded-lg bg-[var(--bg-secondary)] p-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(ROUTES.CANDIDATE.PROFILE)}
              tooltip="Back to edit profile"
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Edit
            </Button>
            <span className="text-sm font-medium text-[var(--text-secondary)]">
              Profile Preview — This is how employers see your profile
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
        ) : profile ? (
          <>
            {/* Profile Header */}
            <Card>
              <div className="flex flex-col gap-6 sm:flex-row">
                <div className="flex shrink-0 flex-col items-center gap-3">
                  {profile.profileImage ? (
                    <img
                      src={profile.profileImage}
                      alt={`${profile.user?.firstName || 'Candidate'}'s photo`}
                      className="h-28 w-28 rounded-full border-4 border-[var(--bg-secondary)] object-cover"
                    />
                  ) : (
                    <div className="bg-primary-light text-primary flex h-28 w-28 items-center justify-center rounded-full text-3xl font-bold">
                      {profile.user?.firstName?.[0] || 'C'}
                    </div>
                  )}
                  {completeness && (
                    <div className="w-28">
                      <ProgressBar
                        value={completeness.score}
                        color={
                          completeness.score >= 80
                            ? 'success'
                            : completeness.score >= 50
                              ? 'warning'
                              : 'error'
                        }
                        size="sm"
                      />
                      <p className="mt-1 text-center text-xs text-[var(--text-muted)]">
                        {completeness.score}% complete
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-2xl font-bold text-[var(--text)]">
                        {profile.user?.firstName} {profile.user?.lastName}
                      </h1>
                      <VerifiedBadge isOwnProfile size="md" />
                    </div>
                    {profile.pronouns && (
                      <span className="text-sm text-[var(--text-muted)]">({profile.pronouns})</span>
                    )}
                    {profile.headline && (
                      <p className="mt-0.5 text-base text-[var(--text-secondary)]">
                        {profile.headline}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-3 text-sm text-[var(--text-secondary)]">
                    {profile.currentLocation && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" /> {profile.currentLocation}
                      </span>
                    )}
                    {profile.experienceYears > 0 && (
                      <span className="flex items-center gap-1">
                        <Briefcase className="h-4 w-4" /> {profile.experienceYears} yrs experience
                      </span>
                    )}
                    {profile.currentCompany && (
                      <span className="flex items-center gap-1">
                        <Building2 className="h-4 w-4" /> {profile.currentCompany}
                      </span>
                    )}
                    {profile.currentRole && (
                      <span className="text-[var(--text)]">{profile.currentRole}</span>
                    )}
                    {profile.noticePeriod && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" /> {NOTICE_PERIOD_LABELS[profile.noticePeriod]}
                        {profile.servingNoticePeriod && ' (Serving)'}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {profile.openToWork && (
                      <Badge
                        variant={
                          profile.openToWork === 'ACTIVELY_LOOKING'
                            ? 'success'
                            : profile.openToWork === 'OPEN_TO_OFFERS'
                              ? 'info'
                              : 'neutral'
                        }
                        size="sm"
                      >
                        {OPEN_TO_WORK_LABELS[profile.openToWork]}
                      </Badge>
                    )}
                    {profile.workStatus && WORK_STATUS_LABELS[profile.workStatus] && (
                      <Badge
                        variant={profile.workStatus === 'ACTIVELY_LOOKING' ? 'success' : 'neutral'}
                        size="sm"
                      >
                        {WORK_STATUS_LABELS[profile.workStatus]}
                      </Badge>
                    )}
                    {profile.user?.isEmailVerified && (
                      <Badge variant="success" size="sm">
                        <CheckCircle className="mr-0.5 h-3 w-3" /> Email Verified
                      </Badge>
                    )}
                    {profile.user?.isMobileVerified && (
                      <Badge variant="success" size="sm">
                        <CheckCircle className="mr-0.5 h-3 w-3" /> Mobile Verified
                      </Badge>
                    )}
                    {profile.user?.isWhatsappVerified && (
                      <Badge variant="success" size="sm">
                        <BrandIcon name="whatsapp" className="mr-0.5 h-3 w-3" /> WhatsApp Verified
                      </Badge>
                    )}
                    {profile.isVeteran && (
                      <Badge variant="info" size="sm">
                        <Shield className="mr-0.5 h-3 w-3" /> Veteran
                      </Badge>
                    )}
                    {profile.isPhysicallyChallenged && (
                      <Badge variant="info" size="sm">
                        <Accessibility className="mr-0.5 h-3 w-3" /> PwD
                        {profile.disabilityType &&
                          profile.disabilityType !== 'NONE' &&
                          ` — ${DISABILITY_TYPE_LABELS[profile.disabilityType]}`}
                        {profile.disabilityPercentage ? ` (${profile.disabilityPercentage}%)` : ''}
                      </Badge>
                    )}
                    {profile.hasCareerBreak && (
                      <Badge variant="warning" size="sm">
                        Career Break
                        {profile.careerBreakType &&
                          ` — ${CAREER_BREAK_TYPE_LABELS[profile.careerBreakType]}`}
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-4 text-sm text-[var(--text-muted)]">
                    {profile.user?.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="h-3.5 w-3.5" /> {profile.user.email}
                      </span>
                    )}
                    {profile.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" /> {profile.phone}
                      </span>
                    )}
                  </div>

                  {/* Activity & Modification timestamps */}
                  <div className="flex flex-wrap gap-4 text-xs text-[var(--text-muted)]">
                    {profile.user?.lastActiveAt && (
                      <span className="flex items-center gap-1">
                        <Activity className="h-3.5 w-3.5" /> Active{' '}
                        {formatRelativeDate(profile.user.lastActiveAt)}
                      </span>
                    )}
                    {profile.updatedAt && (
                      <span className="flex items-center gap-1">
                        <Pencil className="h-3.5 w-3.5" /> Profile modified{' '}
                        {formatRelativeDate(profile.updatedAt)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            {/* Tab nav — 7 tabs, auto-hidden when no data. Drives
                the content sections below via `activeTab` guards. */}
            <CandidateDetailTabs available={availableTabs} />

            <div className="grid gap-6 lg:grid-cols-3">
              {/* Main Content */}
              <div className="space-y-6 lg:col-span-2">
                {/* About / Bio — Overview tab */}
                {activeTab === 'overview' && profile.bio && (
                  <Card>
                    <h2 className="mb-3 text-lg font-semibold text-[var(--text)]">About</h2>
                    <p className="text-sm leading-relaxed whitespace-pre-line text-[var(--text-secondary)]">
                      {profile.bio}
                    </p>
                  </Card>
                )}

                {/* Experience — Experience tab */}
                {activeTab === 'experience' &&
                  profile.experience &&
                  profile.experience.length > 0 && (
                    <Card>
                      <div className="mb-4 flex items-center gap-2">
                        <Briefcase className="text-accent h-5 w-5" />
                        <h2 className="text-lg font-semibold text-[var(--text)]">Experience</h2>
                      </div>
                      <div className="space-y-6">
                        {profile.experience.map((exp, i) => (
                          <div key={i} className="relative border-l-2 border-[var(--border)] pl-6">
                            <div className="absolute top-1 -left-[7px] h-3 w-3 rounded-full border-2 border-[var(--border)] bg-white" />
                            <h3 className="font-semibold text-[var(--text)]">{exp.role}</h3>
                            <p className="text-sm text-[var(--text-secondary)]">
                              {exp.company}
                              {exp.location && ` · ${exp.location}`}
                              {exp.employmentType && ` · ${exp.employmentType}`}
                            </p>
                            <p className="text-xs text-[var(--text-muted)]">
                              {formatDate(exp.startDate)} —{' '}
                              {exp.isCurrent ? 'Present' : formatDate(exp.endDate)}
                            </p>
                            {(exp.industry || exp.department) && (
                              <p className="mt-1 text-xs text-[var(--text-muted)]">
                                {exp.industry && `Industry: ${exp.industry}`}
                                {exp.industry && exp.department && ' · '}
                                {exp.department && `Dept: ${exp.department}`}
                              </p>
                            )}
                            {exp.description && (
                              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                                {exp.description}
                              </p>
                            )}
                            {exp.keyAchievements && exp.keyAchievements.length > 0 && (
                              <ul className="mt-2 list-inside list-disc text-sm text-[var(--text-secondary)]">
                                {exp.keyAchievements.map((a, j) => (
                                  <li key={j}>{a}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                {/* Education — Education tab */}
                {activeTab === 'education' && profile.education && profile.education.length > 0 && (
                  <Card>
                    <div className="mb-4 flex items-center gap-2">
                      <GraduationCap className="text-secondary h-5 w-5" />
                      <h2 className="text-lg font-semibold text-[var(--text)]">Education</h2>
                    </div>
                    <div className="space-y-4">
                      {profile.education.map((edu, i) => (
                        <div key={i} className="flex gap-4">
                          <div className="bg-secondary-light flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                            <GraduationCap className="text-secondary h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-[var(--text)]">
                              {edu.degree} {edu.field ? `in ${edu.field}` : ''}
                            </h3>
                            <p className="text-sm text-[var(--text-secondary)]">
                              {edu.institution}
                            </p>
                            <p className="text-xs text-[var(--text-muted)]">
                              {formatDate(edu.startDate)} — {formatDate(edu.endDate)}
                              {edu.grade &&
                                ` · ${edu.gradeType ? GRADE_TYPE_LABELS[edu.gradeType] || edu.gradeType : 'Grade'}: ${edu.grade}`}
                              {edu.courseType && ` · ${COURSE_TYPE_LABELS[edu.courseType]}`}
                            </p>
                            {edu.specialization && (
                              <p className="text-xs text-[var(--text-muted)]">
                                Specialization: {edu.specialization}
                              </p>
                            )}
                            {edu.activities && (
                              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                                {edu.activities}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Projects — Projects tab */}
                {activeTab === 'projects' && profile.projects && profile.projects.length > 0 && (
                  <Card>
                    <div className="mb-4 flex items-center gap-2">
                      <FolderKanban className="text-primary h-5 w-5" />
                      <h2 className="text-lg font-semibold text-[var(--text)]">Projects</h2>
                    </div>
                    <div className="space-y-4">
                      {profile.projects.map((proj, i) => (
                        <div key={i} className="rounded-lg border border-[var(--border)] p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="font-semibold text-[var(--text)]">{proj.name}</h3>
                              {proj.role && (
                                <p className="text-sm text-[var(--text-secondary)]">
                                  Role: {proj.role}
                                </p>
                              )}
                            </div>
                            {proj.url && (
                              <Tooltip content="View project">
                                <a
                                  href={proj.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline"
                                  aria-label="View project"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </Tooltip>
                            )}
                          </div>
                          <p className="text-xs text-[var(--text-muted)]">
                            {proj.startDate && formatDate(proj.startDate)}
                            {proj.startDate &&
                              (proj.isCurrent
                                ? ' — Present'
                                : proj.endDate
                                  ? ` — ${formatDate(proj.endDate)}`
                                  : '')}
                            {proj.client && ` · Client: ${proj.client}`}
                            {proj.teamSize && ` · Team: ${proj.teamSize}`}
                          </p>
                          {proj.description && (
                            <p className="mt-2 text-sm text-[var(--text-secondary)]">
                              {proj.description}
                            </p>
                          )}
                          {proj.technologies && proj.technologies.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {proj.technologies.map((tech) => (
                                <Tag key={tech} label={tech} size="sm" />
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Certifications */}
                {activeTab === 'achievements' &&
                  profile.certifications &&
                  profile.certifications.length > 0 && (
                    <Card>
                      <div className="mb-4 flex items-center gap-2">
                        <Award className="h-5 w-5 text-[var(--success)]" />
                        <h2 className="text-lg font-semibold text-[var(--text)]">Certifications</h2>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {profile.certifications.map((cert, i) => (
                          <div key={i} className="rounded-lg border border-[var(--border)] p-3">
                            <h3 className="font-medium text-[var(--text)]">{cert.name}</h3>
                            <p className="text-sm text-[var(--text-secondary)]">{cert.issuer}</p>
                            <p className="text-xs text-[var(--text-muted)]">
                              {cert.issueDate && formatDate(cert.issueDate)}
                              {cert.expiryDate && !cert.doesNotExpire
                                ? ` — ${formatDate(cert.expiryDate)}`
                                : ''}
                              {cert.doesNotExpire ? ' · No expiry' : ''}
                            </p>
                            {cert.credentialId && (
                              <p className="text-xs text-[var(--text-muted)]">
                                ID: {cert.credentialId}
                              </p>
                            )}
                            {cert.url && (
                              <Tooltip content="Verify certification">
                                <a
                                  href={cert.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary mt-1 inline-flex items-center gap-1 text-xs hover:underline"
                                >
                                  <ExternalLink className="h-3 w-3" /> Verify
                                </a>
                              </Tooltip>
                            )}
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                {/* Publications & Patents */}
                {activeTab === 'projects' &&
                  ((profile.publications && profile.publications.length > 0) ||
                    (profile.patents && profile.patents.length > 0)) && (
                    <Card>
                      <div className="mb-4 flex items-center gap-2">
                        <BookOpen className="h-5 w-5 text-[#8B5CF6]" />
                        <h2 className="text-lg font-semibold text-[var(--text)]">
                          Publications & Patents
                        </h2>
                      </div>
                      <div className="space-y-3">
                        {profile.publications?.map((pub, i) => (
                          <div
                            key={`pub-${i}`}
                            className="rounded-lg border border-[var(--border)] p-3"
                          >
                            <h3 className="font-medium text-[var(--text)]">{pub.title}</h3>
                            {pub.publisher && (
                              <p className="text-sm text-[var(--text-secondary)]">
                                {pub.publisher}
                              </p>
                            )}
                            {pub.authors && (
                              <p className="text-xs text-[var(--text-muted)]">
                                Authors: {pub.authors}
                              </p>
                            )}
                            {pub.publicationDate && (
                              <p className="text-xs text-[var(--text-muted)]">
                                {formatDate(pub.publicationDate)}
                              </p>
                            )}
                            {pub.description && (
                              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                                {pub.description}
                              </p>
                            )}
                            {pub.url && (
                              <Tooltip content="View publication">
                                <a
                                  href={pub.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary mt-1 inline-flex items-center gap-1 text-xs hover:underline"
                                >
                                  <ExternalLink className="h-3 w-3" /> View
                                </a>
                              </Tooltip>
                            )}
                          </div>
                        ))}
                        {profile.patents?.map((pat, i) => (
                          <div
                            key={`pat-${i}`}
                            className="rounded-lg border border-[var(--border)] p-3"
                          >
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium text-[var(--text)]">{pat.title}</h3>
                              {pat.status && (
                                <Badge variant="info" size="sm">
                                  {PATENT_STATUS_LABELS[pat.status] || pat.status}
                                </Badge>
                              )}
                            </div>
                            {pat.patentOffice && (
                              <p className="text-sm text-[var(--text-secondary)]">
                                {pat.patentOffice}
                              </p>
                            )}
                            {pat.patentNumber && (
                              <p className="text-xs text-[var(--text-muted)]">
                                Patent #{pat.patentNumber}
                              </p>
                            )}
                            {pat.inventors && (
                              <p className="text-xs text-[var(--text-muted)]">
                                Inventors: {pat.inventors}
                              </p>
                            )}
                            <p className="text-xs text-[var(--text-muted)]">
                              {pat.filingDate && `Filed: ${formatFullDate(pat.filingDate)}`}
                              {pat.issueDate && ` · Issued: ${formatFullDate(pat.issueDate)}`}
                            </p>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                {/* Awards */}
                {activeTab === 'achievements' && profile.awards && profile.awards.length > 0 && (
                  <Card>
                    <div className="mb-4 flex items-center gap-2">
                      <Trophy className="text-secondary h-5 w-5" />
                      <h2 className="text-lg font-semibold text-[var(--text)]">Awards</h2>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {profile.awards.map((award, i) => (
                        <div key={i} className="rounded-lg border border-[var(--border)] p-3">
                          <h3 className="font-medium text-[var(--text)]">{award.title}</h3>
                          {award.issuer && (
                            <p className="text-sm text-[var(--text-secondary)]">{award.issuer}</p>
                          )}
                          {award.date && (
                            <p className="text-xs text-[var(--text-muted)]">
                              {formatDate(award.date)}
                            </p>
                          )}
                          {award.description && (
                            <p className="mt-1 text-sm text-[var(--text-secondary)]">
                              {award.description}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Courses & Test Scores */}
                {activeTab === 'achievements' &&
                  ((profile.courses && profile.courses.length > 0) ||
                    (profile.testScores && profile.testScores.length > 0)) && (
                    <Card>
                      <div className="mb-4 flex items-center gap-2">
                        <GraduationCap className="text-primary h-5 w-5" />
                        <h2 className="text-lg font-semibold text-[var(--text)]">
                          Courses & Test Scores
                        </h2>
                      </div>
                      {profile.courses && profile.courses.length > 0 && (
                        <div className="space-y-2">
                          <h3 className="text-sm font-medium text-[var(--text)]">
                            Courses Completed
                          </h3>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {profile.courses.map((course, i) => (
                              <div key={i} className="rounded border border-[var(--border)] p-2.5">
                                <p className="text-sm font-medium text-[var(--text)]">
                                  {course.name}
                                </p>
                                {course.provider && (
                                  <p className="text-xs text-[var(--text-secondary)]">
                                    {course.provider}
                                  </p>
                                )}
                                {course.completionDate && (
                                  <p className="text-xs text-[var(--text-muted)]">
                                    {formatDate(course.completionDate)}
                                  </p>
                                )}
                                {course.url && (
                                  <Tooltip content="View course">
                                    <a
                                      href={course.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-primary text-xs hover:underline"
                                    >
                                      View
                                    </a>
                                  </Tooltip>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {profile.testScores && profile.testScores.length > 0 && (
                        <div
                          className={`space-y-2 ${profile.courses && profile.courses.length > 0 ? 'mt-4' : ''}`}
                        >
                          <h3 className="text-sm font-medium text-[var(--text)]">Test Scores</h3>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {profile.testScores.map((test, i) => (
                              <div key={i} className="rounded border border-[var(--border)] p-2.5">
                                <p className="text-sm font-medium text-[var(--text)]">
                                  {test.testName}
                                </p>
                                <p className="text-primary text-sm font-semibold">
                                  Score: {test.score}
                                </p>
                                {test.dateOfExam && (
                                  <p className="text-xs text-[var(--text-muted)]">
                                    {formatFullDate(test.dateOfExam)}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </Card>
                  )}

                {/* Volunteering */}
                {activeTab === 'more' &&
                  profile.volunteerExperience &&
                  profile.volunteerExperience.length > 0 && (
                    <Card>
                      <div className="mb-4 flex items-center gap-2">
                        <Heart className="h-5 w-5 text-[var(--error)]" />
                        <h2 className="text-lg font-semibold text-[var(--text)]">Volunteering</h2>
                      </div>
                      <div className="space-y-3">
                        {profile.volunteerExperience.map((vol, i) => (
                          <div key={i} className="border-l-2 border-[var(--border)] pl-4">
                            <h3 className="font-medium text-[var(--text)]">{vol.role}</h3>
                            <p className="text-sm text-[var(--text-secondary)]">
                              {vol.organization}
                            </p>
                            {vol.cause && (
                              <p className="text-xs text-[var(--text-muted)]">Cause: {vol.cause}</p>
                            )}
                            <p className="text-xs text-[var(--text-muted)]">
                              {vol.startDate && formatDate(vol.startDate)}
                              {vol.startDate &&
                                (vol.isCurrent
                                  ? ' — Present'
                                  : vol.endDate
                                    ? ` — ${formatDate(vol.endDate)}`
                                    : '')}
                            </p>
                            {vol.description && (
                              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                                {vol.description}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                {/* Professional Memberships */}
                {activeTab === 'more' &&
                  profile.professionalMemberships &&
                  profile.professionalMemberships.length > 0 && (
                    <Card>
                      <div className="mb-4 flex items-center gap-2">
                        <Users className="text-accent h-5 w-5" />
                        <h2 className="text-lg font-semibold text-[var(--text)]">
                          Professional Memberships
                        </h2>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {profile.professionalMemberships.map((mem, i) => (
                          <div key={i} className="rounded-lg border border-[var(--border)] p-3">
                            <h3 className="font-medium text-[var(--text)]">{mem.organization}</h3>
                            {mem.role && (
                              <p className="text-sm text-[var(--text-secondary)]">{mem.role}</p>
                            )}
                            <p className="text-xs text-[var(--text-muted)]">
                              {mem.startDate && formatDate(mem.startDate)}
                              {mem.endDate && ` — ${formatDate(mem.endDate)}`}
                            </p>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                {/* References — More tab */}
                {activeTab === 'more' && profile.references && profile.references.length > 0 && (
                  <Card>
                    <div className="mb-3 flex items-center gap-2">
                      <Users className="text-primary h-5 w-5" />
                      <h2 className="text-lg font-semibold text-[var(--text)]">References</h2>
                    </div>
                    <ul className="space-y-3">
                      {profile.references.map((r, i) => (
                        <li
                          key={`ref-${i}`}
                          className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3 text-sm"
                        >
                          <p className="font-semibold text-[var(--text)]">{r.name}</p>
                          {(r.designation || r.organization) && (
                            <p className="text-xs text-[var(--text-muted)]">
                              {r.designation}
                              {r.designation && r.organization ? ' · ' : ''}
                              {r.organization}
                            </p>
                          )}
                          {r.relationship && (
                            <p className="text-xs text-[var(--text-secondary)]">{r.relationship}</p>
                          )}
                          {(r.email || r.phone) && (
                            <p className="mt-1 text-xs text-[var(--text-muted)]">
                              {r.email}
                              {r.email && r.phone ? ' · ' : ''}
                              {r.phone}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}

                {/* Skills — Skills tab (full main-column view) */}
                {activeTab === 'skills' && (
                  <>
                    {profile.skills.length > 0 && (
                      <Card>
                        <div className="mb-3 flex items-center gap-2">
                          <Code className="text-primary h-5 w-5" />
                          <h2 className="text-lg font-semibold text-[var(--text)]">Skills</h2>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {profile.skills.map((skill) => (
                            <Tag key={skill} label={skill} variant="primary" />
                          ))}
                        </div>
                      </Card>
                    )}
                    {profile.skillsWithProficiency && profile.skillsWithProficiency.length > 0 && (
                      <Card>
                        <h2 className="mb-3 text-lg font-semibold text-[var(--text)]">
                          Skill proficiency
                        </h2>
                        <ul className="space-y-2">
                          {profile.skillsWithProficiency.map((s, i) => (
                            <li
                              key={`prof-${i}`}
                              className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm"
                            >
                              <span className="font-medium text-[var(--text)]">{s.skill}</span>
                              <span className="flex items-center gap-2">
                                {typeof s.yearsOfExperience === 'number' && (
                                  <span className="text-xs text-[var(--text-muted)]">
                                    {s.yearsOfExperience} yrs
                                  </span>
                                )}
                                <Badge variant="info" size="sm">
                                  {s.proficiency}
                                </Badge>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </Card>
                    )}
                    {profile.itSkills && profile.itSkills.length > 0 && (
                      <Card>
                        <h2 className="mb-3 text-lg font-semibold text-[var(--text)]">IT skills</h2>
                        <ul className="space-y-2">
                          {profile.itSkills.map((it, i) => (
                            <li
                              key={`it-${i}`}
                              className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm"
                            >
                              <p className="font-medium text-[var(--text)]">
                                {it.technology}
                                {it.version ? ` (${it.version})` : ''}
                              </p>
                              <p className="text-xs text-[var(--text-muted)]">
                                {typeof it.experienceYears === 'number'
                                  ? `${it.experienceYears} years`
                                  : ''}
                                {it.proficiency ? ` · ${it.proficiency}` : ''}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </Card>
                    )}
                    {profile.languageProficiency && profile.languageProficiency.length > 0 && (
                      <Card>
                        <h2 className="mb-3 text-lg font-semibold text-[var(--text)]">Languages</h2>
                        <ul className="space-y-2">
                          {profile.languageProficiency.map((l, i) => (
                            <li
                              key={`lang-${i}`}
                              className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm"
                            >
                              <span className="font-medium text-[var(--text)]">{l.language}</span>
                              <Badge variant="info" size="sm">
                                {l.proficiency}
                                {l.readWrite ? ' · R/W' : ''}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      </Card>
                    )}
                  </>
                )}

                {/* Hobbies & Interests — More tab */}
                {activeTab === 'more' &&
                  ((profile.interests?.length ?? 0) > 0 || (profile.hobbies?.length ?? 0) > 0) && (
                    <Card>
                      <div className="mb-3 flex items-center gap-2">
                        <Heart className="text-primary h-5 w-5" />
                        <h2 className="text-lg font-semibold text-[var(--text)]">
                          Interests & hobbies
                        </h2>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {profile.interests.map((it) => (
                          <Tag key={`i-${it}`} label={it} variant="default" />
                        ))}
                        {profile.hobbies.map((h) => (
                          <Tag key={`h-${h}`} label={h} variant="default" />
                        ))}
                      </div>
                    </Card>
                  )}

                {/* Work facts — wide row-style cards live in the main
                    column (mirrors the employer-facing candidate detail
                    page; chip-style cards stay in the sidebar). */}
                {(profile.currentIndustry ||
                  profile.currentDepartment ||
                  profile.functionalArea ||
                  profile.expectedSalaryMin ||
                  profile.expectedSalaryMax ||
                  profile.dateOfAvailability) && (
                  <Card>
                    <h2 className="mb-3 text-base font-semibold text-[var(--text)]">
                      Work Details
                    </h2>
                    <div className="space-y-2.5 text-sm">
                      {profile.currentIndustry && (
                        <div className="flex justify-between">
                          <span className="text-[var(--text-muted)]">Industry</span>
                          <span className="text-[var(--text)]">{profile.currentIndustry}</span>
                        </div>
                      )}
                      {profile.currentDepartment && (
                        <div className="flex justify-between">
                          <span className="text-[var(--text-muted)]">Department</span>
                          <span className="text-[var(--text)]">{profile.currentDepartment}</span>
                        </div>
                      )}
                      {profile.functionalArea && (
                        <div className="flex justify-between">
                          <span className="text-[var(--text-muted)]">Functional Area</span>
                          <span className="text-[var(--text)]">{profile.functionalArea}</span>
                        </div>
                      )}
                      {(profile.expectedSalaryMin || profile.expectedSalaryMax) && (
                        <div className="flex justify-between">
                          <span className="text-[var(--text-muted)]">Expected CTC</span>
                          <span className="font-medium text-[var(--text)]">
                            {(profile.salaryCurrency || 'INR').toUpperCase() === 'INR'
                              ? formatSalaryAsLPA(
                                  profile.expectedSalaryMin,
                                  profile.expectedSalaryMax,
                                )
                              : `${profile.expectedSalaryMin?.toLocaleString() || ''} - ${profile.expectedSalaryMax?.toLocaleString() || ''} ${profile.salaryCurrency}`}
                          </span>
                        </div>
                      )}
                      {profile.dateOfAvailability && (
                        <div className="flex justify-between">
                          <span className="text-[var(--text-muted)]">Available From</span>
                          <span className="text-[var(--text)]">
                            {formatFullDate(profile.dateOfAvailability)}
                          </span>
                        </div>
                      )}
                    </div>
                  </Card>
                )}

                {/* Preferences */}
                {(profile.preferredJobType.length > 0 ||
                  profile.preferredWorkMode.length > 0 ||
                  profile.preferredLocations.length > 0) && (
                  <Card>
                    <h2 className="mb-3 text-base font-semibold text-[var(--text)]">Preferences</h2>
                    <div className="space-y-3">
                      {profile.preferredJobType.length > 0 && (
                        <div>
                          <p className="mb-1 text-xs text-[var(--text-muted)]">Job Types</p>
                          <div className="flex flex-wrap gap-1.5">
                            {profile.preferredJobType.map((jt) => (
                              <Badge key={jt} variant="info" size="sm">
                                {JOB_TYPE_LABELS[jt] || jt}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {profile.preferredWorkMode.length > 0 && (
                        <div>
                          <p className="mb-1 text-xs text-[var(--text-muted)]">Work Modes</p>
                          <div className="flex flex-wrap gap-1.5">
                            {profile.preferredWorkMode.map((wm) => (
                              <Badge key={wm} variant="neutral" size="sm">
                                {WORK_MODE_LABELS[wm] || wm}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {profile.preferredShift && (
                        <div className="flex justify-between text-sm">
                          <span className="text-[var(--text-muted)]">Shift</span>
                          <span className="text-[var(--text)]">
                            {SHIFT_TYPE_LABELS[profile.preferredShift]}
                          </span>
                        </div>
                      )}
                      {profile.preferredLocations.length > 0 && (
                        <div>
                          <p className="mb-1 text-xs text-[var(--text-muted)]">
                            Preferred Locations
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {profile.preferredLocations.map((loc) => (
                              <Tag key={loc} label={loc} size="sm" />
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="space-y-1.5 text-sm">
                        {profile.willingToRelocate && (
                          <p className="flex items-center gap-1 text-[var(--success)]">
                            <CheckCircle className="h-3.5 w-3.5" /> Willing to relocate
                          </p>
                        )}
                        {profile.travelWillingnessPercent != null &&
                          profile.travelWillingnessPercent > 0 && (
                            <div className="flex justify-between">
                              <span className="text-[var(--text-muted)]">Travel</span>
                              <span className="text-[var(--text)]">
                                {profile.travelWillingnessPercent}%
                              </span>
                            </div>
                          )}
                      </div>
                    </div>
                  </Card>
                )}

                {/* Additional Info */}
                {(profile.visaStatus ||
                  profile.workPermitStatus ||
                  profile.hasDrivingLicense ||
                  profile.ownVehicle) && (
                  <Card>
                    <h2 className="mb-3 text-base font-semibold text-[var(--text)]">
                      Additional Info
                    </h2>
                    <div className="space-y-2 text-sm">
                      {profile.visaStatus && (
                        <div className="flex justify-between">
                          <span className="text-[var(--text-muted)]">Visa Status</span>
                          <span className="text-[var(--text)]">{profile.visaStatus}</span>
                        </div>
                      )}
                      {profile.workPermitStatus && (
                        <div className="flex justify-between">
                          <span className="text-[var(--text-muted)]">Work Permit</span>
                          <span className="text-[var(--text)]">{profile.workPermitStatus}</span>
                        </div>
                      )}
                      {profile.hasDrivingLicense && (
                        <p className="flex items-center gap-1 text-[var(--success)]">
                          <Car className="h-3.5 w-3.5" /> Has driving license
                        </p>
                      )}
                      {profile.ownVehicle && (
                        <p className="flex items-center gap-1 text-[var(--text)]">
                          <Car className="h-3.5 w-3.5" /> Owns vehicle
                        </p>
                      )}
                    </div>
                  </Card>
                )}
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* Skills */}
                {profile.skills.length > 0 && (
                  <Card>
                    <div className="mb-3 flex items-center gap-2">
                      <Code className="text-primary h-5 w-5" />
                      <h2 className="text-base font-semibold text-[var(--text)]">Skills</h2>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.skills.map((skill) => (
                        <Tag key={skill} label={skill} variant="primary" />
                      ))}
                    </div>
                  </Card>
                )}

                {/* Languages (simple array) */}
                {profile.languages && profile.languages.length > 0 && (
                  <Card>
                    <div className="mb-3 flex items-center gap-2">
                      <Languages className="text-accent h-5 w-5" />
                      <h2 className="text-base font-semibold text-[var(--text)]">Languages</h2>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.languages.map((lang, i) => (
                        <Tag key={i} label={lang} variant="default" />
                      ))}
                    </div>
                  </Card>
                )}

                {/* IT Skills */}
                {profile.itSkills && profile.itSkills.length > 0 && (
                  <Card>
                    <h2 className="mb-3 text-base font-semibold text-[var(--text)]">IT Skills</h2>
                    <div className="space-y-2">
                      {profile.itSkills.map((it, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-[var(--text)]">
                            {it.technology}
                            {it.version && (
                              <span className="text-[var(--text-muted)]"> v{it.version}</span>
                            )}
                          </span>
                          <div className="flex items-center gap-2">
                            {it.proficiency && (
                              <Badge variant="neutral" size="sm">
                                {it.proficiency}
                              </Badge>
                            )}
                            {it.experienceYears != null && (
                              <span className="text-xs text-[var(--text-muted)]">
                                {it.experienceYears}yr
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Language Proficiency (detailed) */}
                {profile.languageProficiency && profile.languageProficiency.length > 0 && (
                  <Card>
                    <div className="mb-3 flex items-center gap-2">
                      <Languages className="text-accent h-5 w-5" />
                      <h2 className="text-base font-semibold text-[var(--text)]">
                        Language Proficiency
                      </h2>
                    </div>
                    <div className="space-y-2">
                      {profile.languageProficiency.map((lang, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-[var(--text)]">{lang.language}</span>
                          <Badge variant="neutral" size="sm">
                            {lang.proficiency}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Interests & Hobbies */}
                {(profile.interests.length > 0 || profile.hobbies.length > 0) && (
                  <Card>
                    <div className="mb-3 flex items-center gap-2">
                      <Palette className="text-secondary h-5 w-5" />
                      <h2 className="text-base font-semibold text-[var(--text)]">
                        Interests & Hobbies
                      </h2>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.interests.map((i) => (
                        <Tag key={i} label={i} size="sm" variant="primary" />
                      ))}
                      {profile.hobbies.map((h) => (
                        <Tag key={h} label={h} size="sm" />
                      ))}
                    </div>
                  </Card>
                )}

                {/* Social Links — bento-grid display via shared
                    SocialLinksBento component. Replaces the previous
                    flat-list layout. Per the plan brief: bento-grid
                    is required since the social-links system is
                    already implemented. */}
                <SocialLinksBento heading="Social links" links={candidateSocialLinks(profile)} />

                {/* Documents */}
                {(profile.resume || profile.videoResumeUrl) && (
                  <Card>
                    <h2 className="mb-3 text-base font-semibold text-[var(--text)]">Documents</h2>
                    <div className="space-y-2">
                      {profile.resume && (
                        <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] p-3 text-sm text-[var(--text-secondary)]">
                          <FileText className="text-primary h-4 w-4" />
                          <span className="flex-1">{profile.resumeOriginalName || 'Resume'}</span>
                          <CheckCircle className="h-4 w-4 text-[var(--success)]" />
                        </div>
                      )}
                      {profile.videoResumeUrl && (
                        <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] p-3 text-sm text-[var(--text-secondary)]">
                          <Video className="h-4 w-4 text-[var(--error)]" />
                          <span className="flex-1">Video Resume</span>
                          <CheckCircle className="h-4 w-4 text-[var(--success)]" />
                        </div>
                      )}
                    </div>
                  </Card>
                )}
              </div>
            </div>

            {/* Profile Improvement Suggestions */}
            {completeness && completeness.sections.some((s) => !s.completed) && (
              <Card>
                <div className="mb-3 flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-[var(--success)]" />
                  <h2 className="text-lg font-semibold text-[var(--text)]">Improve Your Profile</h2>
                </div>
                <p className="mb-3 text-sm text-[var(--text-muted)]">
                  Complete these sections to increase your visibility to employers:
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {completeness.sections
                    .filter((s) => !s.completed)
                    .map((section) => (
                      <div
                        key={section.name}
                        className="flex items-center gap-2 rounded-lg bg-[var(--warning-light)] px-3 py-2 text-sm text-[var(--warning-dark)]"
                      >
                        <Palette className="h-4 w-4 shrink-0" />
                        {section.name}
                      </div>
                    ))}
                </div>
              </Card>
            )}
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
