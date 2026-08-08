import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { isOptimisableImageHost } from '@/lib/image-host';
import PublicLayout from '@/components/layout/PublicLayout';
import PublicJobCard from '@/components/job-search/PublicJobCard';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import JsonLd from '@/components/seo/JsonLd';
import {
  breadcrumbSchema,
  graph,
  webPageSchema,
  organizationSchema,
  aggregateRatingSchema,
  companySchema,
  localBusinessSchema,
} from '@/lib/json-ld';
import { generateMetadata as buildMetadata } from '@/components/common/SEO';
import { Building2, MapPin, Briefcase, ShieldCheck, Users, Globe, Calendar } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import CompanyDetailTabs from '@/components/company-search/CompanyDetailTabs';
// Helper + type live in a non-'use client' module so this server
// component can import them directly. Importing from CompanyDetailTabs
// (which carries `'use client'`) raises a "client function from server"
// error at SSR time under Next.js 16.
import {
  deriveAvailableCompanyTabs,
  type CompanyTabKey,
} from '@/components/company-search/company-tabs-helpers';
import CompanyJobsTab from '@/components/company-search/CompanyJobsTab';
import CompanyFollowButton from '@/components/company-search/CompanyFollowButton';
import SocialLinksBento from '@/components/common/SocialLinksBento';
// Helper lives in a non-'use client' module so this server component
// can call it during SSR without raising "client function from server".
import { companySocialLinks } from '@/components/common/social-links-helpers';
import ReviewsByJobProfilesPreview from '@/components/reviews/ReviewsByJobProfilesPreview';
import WriteReviewBox from '@/components/reviews/WriteReviewBox';
import RatingBadge from '@/components/reviews/RatingBadge';
import type { PublicCompanyDetailResult } from '@/services/public-companies.service';
import type { TopJobProfile } from '@/types/review';

export const revalidate = 300;

async function fetchCompanyBySlug(slug: string): Promise<PublicCompanyDetailResult | null> {
  const apiBase =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:5000/api/v1';
  try {
    const res = await fetch(`${apiBase}/public/companies/${encodeURIComponent(slug)}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body?.data ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchCompanyBySlug(slug);
  if (!data?.company) {
    return buildMetadata({ title: 'Company not found', url: `/companies/${slug}` });
  }
  const c = data.company;
  return buildMetadata({
    title: `${c.companyName} — Jobs, culture, and reviews`,
    description:
      c.tagline ||
      c.description?.replace(/<[^>]+>/g, '').slice(0, 160) ||
      `Browse ${data.openJobsCount} open jobs at ${c.companyName} on Hire Adda. Verified employer, ${c.industry ?? ''} industry, ${c.companySize ?? ''} employees.`,
    url: `/companies/${slug}`,
  });
}

export default async function CompanyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const data = await fetchCompanyBySlug(slug);
  if (!data?.company) notFound();
  const { company, jobs, openJobsCount } = data;
  const averageRating = (data as { averageRating?: number }).averageRating ?? 0;
  const totalReviews = (data as { totalReviews?: number }).totalReviews ?? 0;
  const topJobProfiles = ((data as { topJobProfiles?: TopJobProfile[] }).topJobProfiles ??
    []) as TopJobProfile[];

  // Tab availability derived from the data — auto-hides empty tabs.
  const availableTabs = deriveAvailableCompanyTabs(company);
  const requested = (sp?.tab as CompanyTabKey | undefined) ?? 'overview';
  const activeTab: CompanyTabKey = availableTabs.has(requested) ? requested : 'overview';
  const socialLinks = companySocialLinks(
    (company as { socialLinks?: Record<string, unknown> | null }).socialLinks,
  );

  // Per-company Organization (or LocalBusiness when address is present)
  // schema. The address fields are populated on `CompanyProfile` and
  // sanitised through the public response, so a city + state combo is
  // enough to upgrade Organization → LocalBusiness for richer SERP cards
  // (e.g. Google Maps integration).
  const hasAddress = !!(company.city && company.state);
  const companyEntity = hasAddress
    ? localBusinessSchema({
        url: `/companies/${slug}`,
        name: company.companyName,
        description: company.tagline ?? company.description ?? undefined,
        logo: company.logo ?? undefined,
        industry: company.industry ?? undefined,
        website: company.website ?? undefined,
        address: {
          addressLocality: company.city as string,
          addressRegion: company.state as string,
          addressCountry: (company as { country?: string | null }).country ?? 'IN',
        },
      })
    : companySchema({
        url: `/companies/${slug}`,
        name: company.companyName,
        description: company.tagline ?? company.description ?? undefined,
        logo: company.logo ?? undefined,
        industry: company.industry ?? undefined,
        website: company.website ?? undefined,
      });

  const jsonLd = graph(
    organizationSchema(),
    companyEntity,
    webPageSchema({
      url: `/companies/${slug}`,
      name: `${company.companyName} — Hire Adda`,
      description: company.tagline ?? `Open jobs at ${company.companyName} on Hire Adda`,
      // Speakable: voice assistants read company name + tagline.
      speakableCssSelectors: ['h1', '[data-speakable]'],
    }),
    breadcrumbSchema([
      { name: 'Home', url: '/' },
      { name: 'Companies', url: '/companies' },
      { name: company.companyName, url: `/companies/${slug}` },
    ]),
    // AggregateRating attached to the company entity — only emitted
    // when there are real reviews (never fake the schema).
    ...(totalReviews > 0
      ? [
          aggregateRatingSchema({
            itemName: company.companyName,
            itemType: hasAddress ? 'LocalBusiness' : 'Organization',
            ratingValue: averageRating,
            reviewCount: totalReviews,
          }),
        ]
      : []),
  );

  return (
    <PublicLayout>
      <JsonLd id="jsonld-company-detail" data={jsonLd} />
      <div className="under-public-header bg-[var(--bg)]">
        {/* ━━━━━━━━━━━━━━━━━━━━ FULL-WIDTH HERO ━━━━━━━━━━━━━━━━━━━━
            Cover band stretches edge-to-edge (breaks out of the
            max-w-7xl content rail) and ALWAYS renders — when a company
            hasn't uploaded a cover, we fall back to a soft branded
            gradient + Building2 silhouette + helper text so the hero
            never collapses. The header card sits below the cover
            inside the constrained content rail with the logo pulled
            up via negative margin to overlap the cover edge — same
            pattern Naukri / LinkedIn / Glassdoor use for company /
            profile hero shells. */}
        <div className="relative h-44 w-full overflow-hidden sm:h-56 lg:h-72">
          {company.coverImage ? (
            <Image
              src={company.coverImage}
              alt={`${company.companyName} cover`}
              fill
              priority
              sizes="100vw"
              unoptimized={!isOptimisableImageHost(company.coverImage)}
              className="object-cover"
            />
          ) : (
            <div
              aria-label="No cover image"
              className="from-primary/15 via-accent/5 flex h-full w-full flex-col items-center justify-center bg-gradient-to-br to-[var(--bg-tertiary)]"
            >
              <Building2 className="h-12 w-12 text-[var(--text-muted)] opacity-30 sm:h-16 sm:w-16" />
              <p className="mt-2 text-xs font-medium tracking-wider text-[var(--text-muted)] uppercase">
                No cover image
              </p>
            </div>
          )}
        </div>

        {/* Header card — full-width container, content constrained.
            The negative top margin pulls the card up over the cover
            band so the logo (which has a further negative margin)
            can overlap the cover bottom edge. */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Card padding="lg" className="relative -mt-12 sm:-mt-14 lg:-mt-16">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
              {/* Logo tile — large, white-ring "cutout" effect over the
                  cover. Falls back to a Building2 icon when the company
                  hasn't uploaded a logo. */}
              <div className="-mt-16 shrink-0 sm:-mt-20 lg:-mt-24">
                <div className="flex h-28 w-28 items-center justify-center rounded-2xl bg-white shadow-md ring-4 ring-white sm:h-32 sm:w-32 lg:h-36 lg:w-36">
                  {company.logo ? (
                    <Image
                      src={company.logo}
                      alt={company.companyName}
                      width={128}
                      height={128}
                      sizes="(max-width: 640px) 96px, (max-width: 1024px) 112px, 128px"
                      priority
                      unoptimized={!isOptimisableImageHost(company.logo)}
                      className="h-24 w-24 rounded-xl object-contain sm:h-28 sm:w-28 lg:h-32 lg:w-32"
                    />
                  ) : (
                    <Building2 className="h-12 w-12 text-[var(--text-muted)] sm:h-14 sm:w-14 lg:h-16 lg:w-16" />
                  )}
                </div>
              </div>

              {/* Middle column — name, badges, tagline, speakable AEO
                  paragraph, meta row, type badges. */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <h1 className="text-2xl font-bold tracking-tight text-[var(--text)] sm:text-3xl lg:text-4xl">
                    {company.companyName}
                  </h1>
                  {company.isVerified && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--success-light)] px-2 py-0.5 text-[11px] font-semibold text-[var(--success-dark)]">
                      <ShieldCheck className="h-3 w-3" />
                      Verified
                    </span>
                  )}
                  <RatingBadge
                    rating={averageRating}
                    count={totalReviews}
                    size="sm"
                    href={`/companies/${encodeURIComponent(company.slug ?? company.id)}/reviews`}
                  />
                </div>
                {company.tagline && (
                  <p className="mt-2 text-sm text-[var(--text-secondary)] sm:text-base">
                    {company.tagline}
                  </p>
                )}
                {/* AEO + Speakable: deterministic one-line answer to
                    "tell me about <company name>". Voice/AI engines
                    read this region (the `[data-speakable]` selector
                    is wired into the WebPage JSON-LD's
                    `speakableCssSelectors`), so we keep the paragraph
                    in the DOM for SEO + crawlers + AI answer engines.
                    Visually hidden with `sr-only` because the same
                    facts (verified, open-jobs count, industry, size,
                    city, founded year, website) are already visible
                    in the badge row + meta row above — leaving it
                    on-screen reads as duplication. */}
                <p data-speakable="true" className="sr-only">
                  {company.companyName}
                  {company.industry ? ` is a ${company.industry} company` : ' is a company'}
                  {company.companySize ? ` with ${company.companySize} employees` : ''}
                  {company.city || company.headquarters
                    ? ` based in ${company.city ?? company.headquarters}`
                    : ''}
                  {company.foundedYear ? `, founded in ${company.foundedYear}` : ''}
                  {`. ${openJobsCount > 0 ? `${openJobsCount} open jobs` : 'No open jobs right now'} on Hire Adda — `}
                  {company.isVerified ? 'GST-verified employer.' : 'verified profile.'}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
                  {company.industry && (
                    <span className="flex items-center gap-1">
                      <Briefcase className="h-3.5 w-3.5" /> {company.industry}
                    </span>
                  )}
                  {company.companySize && (
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" /> {company.companySize}
                    </span>
                  )}
                  {(company.city || company.headquarters) && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {company.city ?? company.headquarters}
                    </span>
                  )}
                  {company.foundedYear && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" /> Founded {company.foundedYear}
                    </span>
                  )}
                  {company.website && (
                    <a
                      href={company.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary flex items-center gap-1 hover:underline"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      Website
                    </a>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {company.companyType && (
                    <Badge variant="info" size="sm">
                      {company.companyType}
                    </Badge>
                  )}
                  {openJobsCount > 0 && (
                    <Badge variant="success" size="sm">
                      {openJobsCount} open jobs
                    </Badge>
                  )}
                </div>
              </div>

              {/* Right column — Follow / Following toggle + follower
                  count. `isFollowing` is intentionally omitted from
                  initialStatus — the public endpoint response is
                  shared across users (auth-fragmented but not per-
                  user) so per-user follow state must come from the
                  dedicated /follow-status endpoint that the button
                  calls on mount (~50ms). followersCount is shared/
                  public, safe to seed from the SSR fetch. On mobile
                  the flex parent stacks, so this lands below the
                  middle column naturally — full-width inside the
                  card. */}
              <div className="shrink-0 sm:self-start">
                <CompanyFollowButton
                  idOrSlug={company.slug ?? company.id}
                  companyOwnerUserId={(company as { userId?: string | null }).userId ?? null}
                  initialStatus={{
                    isFollowing: false,
                    followersCount: Number(
                      (data as { followersCount?: number }).followersCount ?? 0,
                    ),
                  }}
                />
              </div>
            </div>
          </Card>
        </div>

        {/* ━━━━━━━━━━━━━━━━━━━━ MAIN CONTENT GRID ━━━━━━━━━━━━━━━━━━━━
            Tabs + tab panels (left) + persistent sidebar (right).
            Starts BELOW the full-width hero card, so the aside no
            longer runs alongside the company header — it docks below
            it like the user-requested Naukri-style hero pattern. */}
        <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="min-w-0 space-y-6">
              <CompanyDetailTabs openJobsCount={openJobsCount} available={availableTabs} />

              {/* ════════════════ Overview tab ════════════════ */}
              {activeTab === 'overview' && (
                <>
                  {company.description && (
                    <Card padding="lg">
                      <h2 className="mb-3 text-lg font-bold text-[var(--text)]">About</h2>
                      <div
                        className="prose prose-sm max-w-none text-[var(--text-secondary)]"
                        dangerouslySetInnerHTML={{ __html: company.description }}
                      />
                    </Card>
                  )}
                  {(company.techStack?.length ?? 0) > 0 && (
                    <Card padding="lg">
                      <h2 className="mb-3 text-lg font-bold text-[var(--text)]">Tech stack</h2>
                      <div className="flex flex-wrap gap-1.5">
                        {company.techStack!.map((t) => (
                          <Badge key={t} variant="neutral" size="sm">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </Card>
                  )}
                  {(company.specialties?.length ?? 0) > 0 && (
                    <Card padding="lg">
                      <h2 className="mb-3 text-lg font-bold text-[var(--text)]">Specialties</h2>
                      <div className="flex flex-wrap gap-1.5">
                        {company.specialties!.map((s) => (
                          <Badge key={s} variant="neutral" size="sm">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </Card>
                  )}
                  {(company.productsServices?.length ?? 0) > 0 && (
                    <Card padding="lg">
                      <h2 className="mb-3 text-lg font-bold text-[var(--text)]">
                        Products & services
                      </h2>
                      <ul className="grid gap-2 sm:grid-cols-2">
                        {company.productsServices!.map((p) => (
                          <li
                            key={p}
                            className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text)]"
                          >
                            {p}
                          </li>
                        ))}
                      </ul>
                    </Card>
                  )}
                  {socialLinks.length > 0 && (
                    <SocialLinksBento heading="Connect with us" links={socialLinks} />
                  )}

                  {/* ReviewsByJobProfilesPreview + WriteReviewBox moved
                      into the right-rail <aside> below "Quick facts"
                      so the review CTAs are persistently visible across
                      every tab, not just Overview. */}

                  {jobs.length > 0 && (
                    <Card padding="lg">
                      <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-lg font-bold text-[var(--text)]">Open jobs</h2>
                        <Link
                          href={`/companies/${slug}?tab=jobs`}
                          className="text-primary text-xs font-semibold hover:underline"
                        >
                          View all {openJobsCount} jobs →
                        </Link>
                      </div>
                      <ul className="space-y-3">
                        {jobs.slice(0, 3).map((j) => (
                          <li key={j.id}>
                            <PublicJobCard
                              job={{
                                ...j,
                                experienceMin: j.experienceMin ?? 0,
                                company: {
                                  id: company.id,
                                  slug: company.slug,
                                  companyName: company.companyName,
                                  logo: company.logo,
                                  isVerified: company.isVerified,
                                },
                              }}
                            />
                          </li>
                        ))}
                      </ul>
                    </Card>
                  )}
                </>
              )}

              {/* ════════════════ Why work with us ════════════════ */}
              {activeTab === 'why-work-with-us' && company.whyWorkForUs && (
                <Card padding="lg">
                  <h2 className="mb-3 text-lg font-bold text-[var(--text)]">
                    Why work with {company.companyName}
                  </h2>
                  <div className="prose prose-sm max-w-none whitespace-pre-line text-[var(--text-secondary)]">
                    {company.whyWorkForUs}
                  </div>
                </Card>
              )}

              {/* ════════════════ Culture ════════════════ */}
              {activeTab === 'culture' && (
                <>
                  {company.missionStatement && (
                    <Card padding="lg">
                      <h2 className="mb-3 text-lg font-bold text-[var(--text)]">Our mission</h2>
                      <p className="text-sm leading-relaxed whitespace-pre-line text-[var(--text-secondary)]">
                        {company.missionStatement}
                      </p>
                    </Card>
                  )}
                  {company.visionStatement && (
                    <Card padding="lg">
                      <h2 className="mb-3 text-lg font-bold text-[var(--text)]">Our vision</h2>
                      <p className="text-sm leading-relaxed whitespace-pre-line text-[var(--text-secondary)]">
                        {company.visionStatement}
                      </p>
                    </Card>
                  )}
                  {(company.coreValues?.length ?? 0) > 0 && (
                    <Card padding="lg">
                      <h2 className="mb-3 text-lg font-bold text-[var(--text)]">Core values</h2>
                      <ul className="grid gap-2 sm:grid-cols-2">
                        {company.coreValues!.map((v) => (
                          <li
                            key={v}
                            className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text)]"
                          >
                            {v}
                          </li>
                        ))}
                      </ul>
                    </Card>
                  )}
                  {company.companyCulture && (
                    <Card padding="lg">
                      <h2 className="mb-3 text-lg font-bold text-[var(--text)]">
                        Working at {company.companyName}
                      </h2>
                      <p className="text-sm leading-relaxed whitespace-pre-line text-[var(--text-secondary)]">
                        {company.companyCulture}
                      </p>
                    </Card>
                  )}
                  {company.diversityStatement && (
                    <Card padding="lg">
                      <h2 className="mb-3 text-lg font-bold text-[var(--text)]">
                        Diversity & inclusion
                      </h2>
                      <p className="text-sm leading-relaxed whitespace-pre-line text-[var(--text-secondary)]">
                        {company.diversityStatement}
                      </p>
                    </Card>
                  )}
                  {company.csrInitiatives && (
                    <Card padding="lg">
                      <h2 className="mb-3 text-lg font-bold text-[var(--text)]">Social impact</h2>
                      <p className="text-sm leading-relaxed whitespace-pre-line text-[var(--text-secondary)]">
                        {company.csrInitiatives}
                      </p>
                    </Card>
                  )}
                </>
              )}

              {/* ════════════════ Benefits ════════════════ */}
              {activeTab === 'benefits' && (
                <>
                  {(company.benefits?.length ?? 0) > 0 && (
                    <Card padding="lg">
                      <h2 className="mb-3 text-lg font-bold text-[var(--text)]">Benefits</h2>
                      <ul className="grid gap-2 sm:grid-cols-2">
                        {company.benefits!.map((b) => (
                          <li
                            key={b}
                            className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text)]"
                          >
                            {b}
                          </li>
                        ))}
                      </ul>
                    </Card>
                  )}
                  {Array.isArray(company.workplacePolicies) &&
                    company.workplacePolicies.length > 0 && (
                      <Card padding="lg">
                        <h2 className="mb-3 text-lg font-bold text-[var(--text)]">
                          Workplace policies
                        </h2>
                        <ul className="space-y-3">
                          {(
                            company.workplacePolicies as Array<{
                              title?: string;
                              description?: string;
                            }>
                          ).map((p, i) => (
                            <li
                              key={`${p.title ?? 'policy'}-${i}`}
                              className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3"
                            >
                              {p.title && (
                                <p className="text-sm font-semibold text-[var(--text)]">
                                  {p.title}
                                </p>
                              )}
                              {p.description && (
                                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                                  {p.description}
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </Card>
                    )}
                </>
              )}

              {/* ════════════════ People ════════════════ */}
              {activeTab === 'people' && (
                <>
                  {Array.isArray(company.leadershipTeam) && company.leadershipTeam.length > 0 && (
                    <Card padding="lg">
                      <h2 className="mb-3 text-lg font-bold text-[var(--text)]">Leadership</h2>
                      <ul className="grid gap-3 sm:grid-cols-2">
                        {(
                          company.leadershipTeam as Array<{
                            name?: string;
                            designation?: string;
                            imageUrl?: string;
                            bio?: string;
                            linkedinUrl?: string;
                          }>
                        ).map((p, i) => (
                          <li
                            key={`${p.name ?? 'leader'}-${i}`}
                            className="flex gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3"
                          >
                            {p.imageUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={p.imageUrl}
                                alt={p.name ?? 'Leader'}
                                className="h-14 w-14 shrink-0 rounded-full object-cover"
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-[var(--text)]">{p.name}</p>
                              {p.designation && (
                                <p className="text-xs text-[var(--text-muted)]">{p.designation}</p>
                              )}
                              {p.bio && (
                                <p className="mt-1 line-clamp-3 text-xs text-[var(--text-secondary)]">
                                  {p.bio}
                                </p>
                              )}
                              {p.linkedinUrl && (
                                <a
                                  href={p.linkedinUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary mt-1 inline-block text-xs font-semibold hover:underline"
                                >
                                  LinkedIn ↗
                                </a>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  )}
                  {Array.isArray(company.employeeTestimonials) &&
                    company.employeeTestimonials.length > 0 && (
                      <Card padding="lg">
                        <h2 className="mb-3 text-lg font-bold text-[var(--text)]">
                          What our team says
                        </h2>
                        <ul className="space-y-3">
                          {(
                            company.employeeTestimonials as Array<{
                              name?: string;
                              designation?: string;
                              quote?: string;
                              imageUrl?: string;
                            }>
                          ).map((t, i) => (
                            <li
                              key={`${t.name ?? 'testimonial'}-${i}`}
                              className="rounded-lg border-l-2 border-[var(--primary)] bg-[var(--bg-secondary)] p-3"
                            >
                              {t.quote && (
                                <p className="text-sm text-[var(--text-secondary)] italic">
                                  &ldquo;{t.quote}&rdquo;
                                </p>
                              )}
                              <p className="mt-2 text-xs font-semibold text-[var(--text)]">
                                — {t.name}
                                {t.designation ? `, ${t.designation}` : ''}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </Card>
                    )}
                </>
              )}

              {/* ════════════════ Gallery ════════════════ */}
              {activeTab === 'gallery' && (
                <>
                  {company.companyVideoUrl && (
                    <Card padding="lg">
                      <h2 className="mb-3 text-lg font-bold text-[var(--text)]">Company video</h2>
                      <div className="aspect-video overflow-hidden rounded-xl bg-black">
                        {/* Inline iframe — supports YouTube/Vimeo embed
                            URLs out of the box. */}
                        <iframe
                          src={company.companyVideoUrl}
                          title={`${company.companyName} video`}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          className="h-full w-full"
                        />
                      </div>
                    </Card>
                  )}
                  {Array.isArray(company.officePhotos) && company.officePhotos.length > 0 && (
                    <Card padding="lg">
                      <h2 className="mb-3 text-lg font-bold text-[var(--text)]">Office photos</h2>
                      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {(
                          company.officePhotos as Array<{
                            url?: string;
                            caption?: string;
                            location?: string;
                          }>
                        ).map((p, i) => (
                          <li key={`photo-${i}`} className="overflow-hidden rounded-xl">
                            {p.url && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={p.url}
                                alt={p.caption ?? `${company.companyName} office`}
                                className="aspect-video w-full object-cover"
                              />
                            )}
                            {(p.caption || p.location) && (
                              <p className="mt-1 px-1 text-xs text-[var(--text-muted)]">
                                {p.caption}
                                {p.location ? ` · ${p.location}` : ''}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </Card>
                  )}
                </>
              )}

              {/* ════════════════ Hiring process ════════════════ */}
              {activeTab === 'hiring' && company.interviewProcess && (
                <Card padding="lg">
                  <h2 className="mb-3 text-lg font-bold text-[var(--text)]">Hiring process</h2>
                  <p className="text-sm leading-relaxed whitespace-pre-line text-[var(--text-secondary)]">
                    {company.interviewProcess}
                  </p>
                </Card>
              )}

              {/* ════════════════ Jobs ════════════════
                  Filterable + paginated. Filter pills auto-populate
                  from this company's actual job-set so visitors only
                  see options that exist (per Phase 19 + the "dynamic
                  filter options" brief). */}
              {activeTab === 'jobs' && (
                <CompanyJobsTab
                  slug={slug}
                  company={{
                    id: company.id,
                    slug: company.slug,
                    companyName: company.companyName,
                    logo: company.logo,
                    isVerified: company.isVerified,
                  }}
                />
              )}
            </div>

            <aside className="space-y-6">
              <Card padding="lg">
                <h3 className="mb-2 text-xs font-bold tracking-wider text-[var(--text-muted)] uppercase">
                  Quick facts
                </h3>
                <dl className="space-y-2 text-sm">
                  {company.foundedYear && (
                    <div className="flex justify-between">
                      <dt className="text-[var(--text-muted)]">Founded</dt>
                      <dd className="font-medium text-[var(--text)]">{company.foundedYear}</dd>
                    </div>
                  )}
                  {company.companySize && (
                    <div className="flex justify-between">
                      <dt className="text-[var(--text-muted)]">Size</dt>
                      <dd className="font-medium text-[var(--text)]">{company.companySize}</dd>
                    </div>
                  )}
                  {company.industry && (
                    <div className="flex justify-between">
                      <dt className="text-[var(--text-muted)]">Industry</dt>
                      <dd className="font-medium text-[var(--text)]">{company.industry}</dd>
                    </div>
                  )}
                  {(company.city || company.headquarters) && (
                    <div className="flex justify-between">
                      <dt className="text-[var(--text-muted)]">Location</dt>
                      <dd className="font-medium text-[var(--text)]">
                        {company.city ?? company.headquarters}
                      </dd>
                    </div>
                  )}
                </dl>
              </Card>

              {/* Reviews-by-job-profiles preview + write-a-review CTA
                  live here (sidebar) instead of in the Overview tab body
                  so they stay visible across every tab. The right rail
                  is the natural home for review-driven CTAs since it's
                  also where Quick facts surface the rating context. */}
              <ReviewsByJobProfilesPreview
                companySlug={company.slug ?? company.id}
                topJobProfiles={topJobProfiles}
                totalReviews={totalReviews}
              />
              <WriteReviewBox
                companySlug={company.slug ?? company.id}
                companyName={company.companyName}
              />
            </aside>
          </div>
        </section>

        {/* Breadcrumbs — sit at the bottom of the page (above the
            site footer) instead of the traditional top placement, for
            visual consistency with Contact / Job-detail / etc. The
            JSON-LD BreadcrumbList is already emitted via
            `breadcrumbSchema()` inside the `jsonLd` graph above, so
            we pass `withSchema={false}` to avoid duplicate schema. */}
        <div className="border-t border-[var(--border)] bg-white">
          <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
            <Breadcrumbs
              items={[{ name: 'Companies', href: '/companies' }, { name: company.companyName }]}
              withSchema={false}
            />
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
