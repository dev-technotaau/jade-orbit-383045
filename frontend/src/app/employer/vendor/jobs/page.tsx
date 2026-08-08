'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  Bookmark,
  BookmarkCheck,
  Briefcase,
  Building2,
  CheckCircle2,
  Crown,
  ExternalLink,
  Lock,
  Mail,
  MapPin,
  Phone,
  Search,
  UserRound,
  Wallet,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Pagination from '@/components/ui/Pagination';
import Tooltip from '@/components/ui/Tooltip';
import BrandIcon from '@/components/common/BrandIcon';
import { showToast } from '@/components/ui/Toast';
import {
  vendorService,
  type VendorBoardJob,
  type VendorJobContact,
} from '@/services/vendor.service';
import { useEntitlements } from '@/hooks/use-entitlements';
import { ROUTES } from '@/constants/routes';
import type { ApiError } from '@/types/api';

/**
 * Vendor job board — hiring requirements from OTHER employers. Each
 * posting's contact panel is hidden until the vendor reveals it (spends
 * 1 lead); reveals are deduped + audited server-side. Vendors can also
 * bookmark postings and filter by engagement (new / contacted / saved).
 * The backend gates everything on `feature.vendor_leads`; this page
 * mirrors that gate with an upsell card.
 */

const INR = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

const TYPE_OPTIONS = [
  { value: '', label: 'Any type' },
  { value: 'FULL_TIME', label: 'Full time' },
  { value: 'PART_TIME', label: 'Part time' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'INTERNSHIP', label: 'Internship' },
  { value: 'FREELANCE', label: 'Freelance' },
];

const WORK_MODE_OPTIONS = [
  { value: '', label: 'Any mode' },
  { value: 'ON_SITE', label: 'On-site' },
  { value: 'REMOTE', label: 'Remote' },
  { value: 'HYBRID', label: 'Hybrid' },
];

const EXPERIENCE_OPTIONS = [
  { value: '', label: 'Any experience' },
  { value: 'FRESHER', label: 'Fresher' },
  { value: 'ENTRY', label: 'Entry' },
  { value: 'MID', label: 'Mid' },
  { value: 'SENIOR', label: 'Senior' },
  { value: 'LEAD', label: 'Lead' },
  { value: 'EXECUTIVE', label: 'Executive' },
];

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Featured first' },
  { value: 'newest', label: 'Newest' },
  { value: 'salary', label: 'Highest salary' },
];

const ENGAGEMENT_TABS: { value: 'all' | 'new' | 'contacted' | 'saved'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'saved', label: 'Saved' },
];

function formatSalary(job: VendorBoardJob): string | null {
  if (!job.salaryDisclosed) return null;
  const min = job.salaryMin != null ? Number(job.salaryMin) : null;
  const max = job.salaryMax != null ? Number(job.salaryMax) : null;
  if (min == null && max == null) return null;
  const fmt = (n: number) => `₹${INR.format(n)}`;
  const range =
    min != null && max != null ? `${fmt(min)} – ${fmt(max)}` : fmt((min ?? max) as number);
  const cycle =
    job.salaryType === 'MONTHLY' ? '/month' : job.salaryType === 'HOURLY' ? '/hour' : '/year';
  return `${range}${cycle}`;
}

function formatExperience(job: VendorBoardJob): string {
  if (job.experienceMax != null) return `${job.experienceMin}–${job.experienceMax} yrs`;
  if (job.experienceMin > 0) return `${job.experienceMin}+ yrs`;
  return 'Fresher friendly';
}

function ContactPanel({
  contact,
  companyName,
}: {
  contact: VendorJobContact;
  companyName: string;
}) {
  const hasAny =
    contact.contactEmail ||
    contact.contactPhone ||
    contact.contactPersonName ||
    contact.contactPersonDesignation;
  if (!hasAny) {
    return (
      <p className="text-xs text-[var(--text-muted)]">
        {companyName} hasn&apos;t added contact details yet — reach them via their company page.
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      {contact.contactPersonName && (
        <p className="flex items-center gap-2 text-sm text-[var(--text)]">
          <UserRound className="h-3.5 w-3.5 flex-none text-[var(--text-muted)]" />
          <span className="font-medium">{contact.contactPersonName}</span>
          {contact.contactPersonDesignation && (
            <span className="text-xs text-[var(--text-muted)]">
              · {contact.contactPersonDesignation}
            </span>
          )}
        </p>
      )}
      {contact.contactEmail && (
        <p className="flex items-center gap-2 text-sm">
          <Mail className="h-3.5 w-3.5 flex-none text-[var(--text-muted)]" />
          <a href={`mailto:${contact.contactEmail}`} className="text-primary hover:underline">
            {contact.contactEmail}
          </a>
        </p>
      )}
      {contact.contactPhone && (
        <p className="flex items-center gap-2 text-sm">
          <Phone className="h-3.5 w-3.5 flex-none text-[var(--text-muted)]" />
          <a href={`tel:${contact.contactPhone}`} className="text-primary hover:underline">
            {contact.contactPhone}
          </a>
          <a
            href={`https://wa.me/${contact.contactPhone.replace(/\D/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline"
          >
            <BrandIcon name="whatsapp" className="h-3.5 w-3.5" /> WhatsApp
          </a>
        </p>
      )}
    </div>
  );
}

export default function VendorJobBoardPage() {
  const {
    hasFeature,
    remaining,
    refetch: refetchEntitlements,
    isLoading: entLoading,
  } = useEntitlements();
  const hasAccess = hasFeature('feature.vendor_leads');

  // Filters that apply on submit (text) vs immediately (dropdowns/tabs).
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('');
  const [applied, setApplied] = useState({ keyword: '', location: '' });
  const [type, setType] = useState('');
  const [workMode, setWorkMode] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('');
  const [sortBy, setSortBy] = useState<'relevance' | 'newest' | 'salary'>('relevance');
  const [engagement, setEngagement] = useState<'all' | 'new' | 'contacted' | 'saved'>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);

  // Local overrides so a reveal/save reflects instantly without refetch.
  const [revealMap, setRevealMap] = useState<Record<string, VendorJobContact>>({});
  const [savedMap, setSavedMap] = useState<Record<string, boolean>>({});
  const [revealing, setRevealing] = useState<Record<string, boolean>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const queryKey = [
    'vendor',
    'job-board',
    applied,
    type,
    workMode,
    experienceLevel,
    sortBy,
    engagement,
    page,
    pageSize,
  ];

  const { data, isLoading, isFetching } = useQuery({
    queryKey,
    queryFn: () =>
      vendorService.listJobBoard({
        keyword: applied.keyword || undefined,
        location: applied.location || undefined,
        type: type || undefined,
        workMode: workMode || undefined,
        experienceLevel: experienceLevel || undefined,
        engagement,
        sortBy,
        page,
        limit: pageSize,
      }),
    enabled: hasAccess,
    placeholderData: keepPreviousData,
  });

  function applyTextFilters(e?: React.FormEvent) {
    e?.preventDefault();
    setApplied({ keyword: keyword.trim(), location: location.trim() });
    setPage(1);
  }

  function changeFilter(setter: (v: string) => void, value: string) {
    setter(value);
    setPage(1);
  }

  async function handleReveal(job: VendorBoardJob) {
    setRevealing((m) => ({ ...m, [job.id]: true }));
    try {
      const res = await vendorService.revealJobContact(job.id);
      setRevealMap((m) => ({
        ...m,
        [job.id]: {
          contactEmail: res.contactEmail,
          contactPhone: res.contactPhone,
          contactPersonName: res.contactPersonName,
          contactPersonDesignation: res.contactPersonDesignation,
        },
      }));
      showToast.success(
        res.cached ? 'Already revealed — no lead used' : 'Contact revealed (1 lead)',
      );
      if (!res.cached) void refetchEntitlements();
    } catch (err) {
      showToast.error((err as unknown as ApiError)?.message ?? 'Failed to reveal contact');
    } finally {
      setRevealing((m) => ({ ...m, [job.id]: false }));
    }
  }

  async function handleToggleSave(job: VendorBoardJob, currentlySaved: boolean) {
    setSavingId(job.id);
    try {
      if (currentlySaved) {
        await vendorService.unsaveBoardJob(job.id);
        setSavedMap((m) => ({ ...m, [job.id]: false }));
        showToast.success('Removed from saved');
      } else {
        await vendorService.saveBoardJob(job.id);
        setSavedMap((m) => ({ ...m, [job.id]: true }));
        showToast.success('Saved to pitch later');
      }
    } catch (err) {
      showToast.error((err as unknown as ApiError)?.message ?? 'Failed to update saved');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <DashboardLayout requiredRole={['EMPLOYER']}>
      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Hiring job board</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Open hiring requirements from other companies. Reveal the employer&apos;s contact to
              pitch your candidates directly.
            </p>
          </div>
          {hasAccess && (
            <Badge variant="neutral" className="shrink-0">
              {remaining('VENDOR_LEAD')} leads left
            </Badge>
          )}
        </div>

        {!entLoading && !hasAccess && (
          <Card padding="lg" className="border-blue-200 bg-blue-50/50">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-blue-600 text-white">
                  <Crown className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold text-blue-900">
                    Vendor Connect subscription required
                  </h2>
                  <p className="mt-1 text-sm text-blue-800">
                    Subscribe to Hire Adda Vendor Connect (₹199/month) to browse hiring requirements
                    from other employers and reveal their contact details.
                  </p>
                </div>
              </div>
              <Link href="/billing/checkout/VENDOR_CONNECT">
                <Button variant="primary">Subscribe</Button>
              </Link>
            </div>
          </Card>
        )}

        {hasAccess && (
          <>
            {/* Engagement tabs */}
            <div className="flex flex-wrap gap-1.5">
              {ENGAGEMENT_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => {
                    setEngagement(tab.value);
                    setPage(1);
                  }}
                  className={
                    engagement === tab.value
                      ? 'bg-primary rounded-full px-4 py-1.5 text-sm font-medium text-white'
                      : 'rounded-full border border-[var(--border)] px-4 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
                  }
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Filters */}
            <form onSubmit={applyTextFilters} className="space-y-3" role="search">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Input
                    label="Keyword"
                    placeholder="Job title, skill or company"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    leftIcon={<Search className="h-4 w-4" />}
                  />
                </div>
                <div className="flex-1">
                  <Input
                    label="Location"
                    placeholder="City or region"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    leftIcon={<MapPin className="h-4 w-4" />}
                  />
                </div>
                <Button type="submit" variant="primary" isLoading={isFetching && !isLoading}>
                  Search
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Select
                  size="sm"
                  clearable={false}
                  options={TYPE_OPTIONS}
                  value={type}
                  onChange={(v) => changeFilter(setType, v)}
                />
                <Select
                  size="sm"
                  clearable={false}
                  options={WORK_MODE_OPTIONS}
                  value={workMode}
                  onChange={(v) => changeFilter(setWorkMode, v)}
                />
                <Select
                  size="sm"
                  clearable={false}
                  options={EXPERIENCE_OPTIONS}
                  value={experienceLevel}
                  onChange={(v) => changeFilter(setExperienceLevel, v)}
                />
                <Select
                  size="sm"
                  clearable={false}
                  options={SORT_OPTIONS}
                  value={sortBy}
                  onChange={(v) => {
                    setSortBy(v as 'relevance' | 'newest' | 'salary');
                    setPage(1);
                  }}
                />
              </div>
            </form>

            {isLoading ? (
              <div className="flex min-h-[30vh] items-center justify-center">
                <Spinner size="lg" />
              </div>
            ) : (data?.items.length ?? 0) === 0 ? (
              <Card padding="lg" className="text-center">
                <Briefcase className="mx-auto h-10 w-10 text-[var(--text-muted)]" />
                <p className="mt-3 font-medium text-[var(--text)]">No postings found</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {engagement === 'saved'
                    ? "You haven't saved any postings yet."
                    : engagement === 'contacted'
                      ? "You haven't revealed any employer contacts yet."
                      : 'Try clearing your filters — new hiring requirements appear here as other employers post jobs.'}
                </p>
              </Card>
            ) : (
              <div className="space-y-4">
                {data?.items.map((job) => {
                  const salary = formatSalary(job);
                  const revealedContact = revealMap[job.id] ?? job.contact;
                  const isRevealed = Boolean(revealedContact) || job.contactRevealed;
                  const isSaved = savedMap[job.id] ?? job.saved;
                  return (
                    <Card key={job.id} padding="lg">
                      <div className="flex flex-col gap-4 lg:flex-row">
                        {/* Job details */}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-lg font-semibold text-[var(--text)]">
                              {job.title}
                            </h2>
                            {job.isFeatured && <Badge variant="info">Featured</Badge>}
                            {job.urgencyLevel === 'URGENT' && (
                              <Badge variant="error">Urgent hiring</Badge>
                            )}
                            {job.isWalkIn && <Badge variant="warning">Walk-in</Badge>}
                            {isRevealed && (
                              <Badge variant="success" className="inline-flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Contacted
                              </Badge>
                            )}
                          </div>
                          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--text-muted)]">
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="h-3.5 w-3.5" />
                              {job.company.companyName}
                              {job.company.isVerified && (
                                <Badge variant="success" className="ml-1">
                                  Verified
                                </Badge>
                              )}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              {job.location}
                              {job.isRemote ? ' · Remote' : ''}
                            </span>
                            {salary && (
                              <span className="inline-flex items-center gap-1">
                                <Wallet className="h-3.5 w-3.5" />
                                {salary}
                              </span>
                            )}
                          </p>
                          <p className="mt-2 line-clamp-2 text-sm text-[var(--text-secondary)]">
                            {job.description}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            <Badge variant="neutral">{job.type.replace(/_/g, ' ')}</Badge>
                            {job.workMode && (
                              <Badge variant="neutral">{job.workMode.replace(/_/g, ' ')}</Badge>
                            )}
                            <Badge variant="neutral">{formatExperience(job)}</Badge>
                            {job.numberOfOpenings != null && job.numberOfOpenings > 1 && (
                              <Badge variant="neutral">{job.numberOfOpenings} openings</Badge>
                            )}
                            {job.skillsRequired.slice(0, 5).map((skill) => (
                              <Badge key={skill} variant="neutral">
                                {skill}
                              </Badge>
                            ))}
                          </div>
                          <p className="mt-2 text-xs text-[var(--text-muted)]">
                            Posted {new Date(job.createdAt).toLocaleDateString('en-IN')}
                            {job.applicationDeadline &&
                              ` · Apply by ${new Date(job.applicationDeadline).toLocaleDateString('en-IN')}`}
                          </p>
                        </div>

                        {/* Employer contact panel — revealed on demand */}
                        <div className="w-full flex-none rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 lg:w-80">
                          <div className="mb-2 flex items-center justify-between">
                            <h3 className="text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">
                              Employer contact
                            </h3>
                            <Tooltip
                              content={isSaved ? 'Remove from saved' : 'Save to pitch later'}
                            >
                              <button
                                type="button"
                                onClick={() => void handleToggleSave(job, isSaved)}
                                disabled={savingId === job.id}
                                aria-label={isSaved ? 'Remove from saved' : 'Save to pitch later'}
                                className="hover:text-primary text-[var(--text-muted)] disabled:opacity-50"
                              >
                                {isSaved ? (
                                  <BookmarkCheck className="text-primary h-4 w-4" />
                                ) : (
                                  <Bookmark className="h-4 w-4" />
                                )}
                              </button>
                            </Tooltip>
                          </div>

                          {isRevealed && revealedContact ? (
                            <ContactPanel
                              contact={revealedContact}
                              companyName={job.company.companyName}
                            />
                          ) : (
                            <div className="space-y-2">
                              <p className="text-xs text-[var(--text-muted)]">
                                Reveal the employer&apos;s contact person, email and phone to reach
                                out directly.
                              </p>
                              <Button
                                variant="primary"
                                size="sm"
                                className="w-full"
                                onClick={() => void handleReveal(job)}
                                isLoading={Boolean(revealing[job.id])}
                                disabled={Boolean(revealing[job.id])}
                                tooltip={`Uses 1 lead · ${remaining('VENDOR_LEAD')} left`}
                              >
                                <Lock className="mr-1.5 h-3.5 w-3.5 flex-none" /> Reveal contact (1
                                lead)
                              </Button>
                            </div>
                          )}

                          <div className="mt-3 flex items-center gap-3 border-t border-[var(--border)] pt-3">
                            <Link
                              href={ROUTES.PUBLIC.JOB_DETAIL(job.slug)}
                              target="_blank"
                              className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
                            >
                              View posting <ExternalLink className="h-3 w-3" />
                            </Link>
                            {job.company.slug && (
                              <Link
                                href={ROUTES.PUBLIC.COMPANY_PUBLIC(job.company.slug)}
                                target="_blank"
                                className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
                              >
                                Company page <ExternalLink className="h-3 w-3" />
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}

                <Pagination
                  currentPage={page}
                  totalPages={data?.pagination.pages ?? 1}
                  onPageChange={setPage}
                  totalItems={data?.pagination.total}
                  pageSize={pageSize}
                  onPageSizeChange={(s) => {
                    setPageSize(s);
                    setPage(1);
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
