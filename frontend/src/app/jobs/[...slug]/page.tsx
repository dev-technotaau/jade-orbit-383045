import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import PublicLayout from '@/components/layout/PublicLayout';
import PublicJobListingShell from '@/components/job-search/PublicJobListingShell';
import PublicJobDetailView from '@/components/job-search/PublicJobDetailView';
import JsonLd from '@/components/seo/JsonLd';
import {
  breadcrumbSchema,
  collectionPageSchema,
  companySchema,
  faqPageSchema,
  graph,
  jobPostingListSchema,
  webPageSchema,
  jobPostingSchema,
} from '@/lib/json-ld';
import { generateMetadata as buildMetadata, PaginationLinks } from '@/components/common/SEO';

const LISTING_PAGE_SIZE = 20;
import {
  parseJobSearchSlug,
  presetFromSlug,
  defaultHeroFromSlug,
  type JobSearchSlugMatch,
} from '@/lib/job-slug-resolver';
import { getPublicJobsFaqs } from '@/data/faqs';

export const revalidate = 300;

async function fetchJobBySlug(slug: string) {
  const apiBase =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:5000/api/v1';
  try {
    const res = await fetch(`${apiBase}/public/jobs/${encodeURIComponent(slug)}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body?.data ?? null;
  } catch {
    return null;
  }
}

interface PublicJobListItem {
  id: string;
  slug?: string | null;
  title: string;
  company?: { companyName?: string | null } | null;
}

async function fetchTopJobsForPreset(
  preset: Record<string, string>,
  limit = 10,
): Promise<PublicJobListItem[]> {
  const apiBase =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:5000/api/v1';
  const qs = new URLSearchParams({ limit: String(limit), page: '1', ...preset });
  try {
    const res = await fetch(`${apiBase}/public/jobs?${qs.toString()}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const body = await res.json();
    return (body?.data?.items ?? []) as PublicJobListItem[];
  } catch {
    return [];
  }
}

async function fetchTotalForPreset(preset: Record<string, string>): Promise<number> {
  const apiBase =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:5000/api/v1';
  const qs = new URLSearchParams({ limit: '1', page: '1', ...preset });
  try {
    const res = await fetch(`${apiBase}/public/jobs?${qs.toString()}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return 0;
    const body = await res.json();
    return Number(body?.data?.pagination?.total ?? 0);
  } catch {
    return 0;
  }
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const { slug } = await params;
  const sp = await searchParams;
  const segments = slug ?? [];
  const match = parseJobSearchSlug(segments);

  if (match.kind === 'detail') {
    const data = await fetchJobBySlug(match.fullSlug);
    if (!data?.job) {
      return buildMetadata({ title: 'Job not found', url: `/jobs/${segments.join('/')}` });
    }
    const j = data.job;
    return buildMetadata({
      title: `${j.title} at ${j.company?.companyName ?? 'Hire Adda'}`,
      description:
        j.description?.replace(/<[^>]+>/g, '').slice(0, 160) ??
        `Apply for ${j.title} at ${j.company?.companyName ?? 'Hire Adda'} — verified employer, fast hiring.`,
      url: `/jobs/${match.fullSlug}`,
    });
  }

  const hero = defaultHeroFromSlug(match);
  // Canonical URL: every role+city alias collapses to the gold-standard
  // `{role}-jobs-in-{city}` form; everything else uses its own URL.
  const canonical =
    match.kind === 'role-city'
      ? `/jobs/${match.role}-jobs-in-${match.city}`
      : `/jobs/${segments.join('/')}`;

  // Pagination link tags for the listing variants — same canonical
  // points to page 1 to avoid duplicate-content; prev/next encode the
  // adjacent pages so Bing/Yandex/screen-readers can navigate.
  const pageNum = Math.max(1, Number(sp?.page ?? '1') || 1);
  const preset = presetFromSlug(match);
  const total = await fetchTotalForPreset(preset);
  const totalPages = Math.max(1, Math.ceil(total / LISTING_PAGE_SIZE));
  const prev =
    pageNum > 1 ? (pageNum === 2 ? canonical : `${canonical}?page=${pageNum - 1}`) : undefined;
  const next = pageNum < totalPages ? `${canonical}?page=${pageNum + 1}` : undefined;

  return buildMetadata({
    title: pageNum > 1 ? `${hero.h1} — Page ${pageNum} of ${totalPages}` : hero.h1,
    description: `${hero.h1}. ${hero.subtitle}. Apply on Hire Adda — verified employers, no scams.`,
    url: canonical,
    pagination: { prev, next },
  });
}

export default async function JobsCatchAllPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const pageNum = Math.max(1, Number(sp?.page ?? '1') || 1);
  const segments = slug ?? [];
  const match = parseJobSearchSlug(segments);

  if (match.kind === 'unknown' && segments.length === 0) {
    notFound();
  }

  // Job detail page — slug ends in 8-char shortid.
  if (match.kind === 'detail') {
    const data = await fetchJobBySlug(match.fullSlug);
    if (!data?.job) notFound();
    const jsonLd = graph(
      // Speakable on the detail page → voice answer query is "tell me about
      // <job title> at <company>". Read H1 + intro + the job-summary card.
      webPageSchema({
        url: `/jobs/${match.fullSlug}`,
        name: `${data.job.title} at ${data.job.company?.companyName ?? 'Hire Adda'}`,
        description:
          data.job.description?.replace(/<[^>]+>/g, '').slice(0, 160) ??
          `Apply for ${data.job.title} on Hire Adda`,
        speakableCssSelectors: ['h1', '[data-speakable]'],
      }),
      jobPostingSchema({
        url: `/jobs/${match.fullSlug}`,
        title: data.job.title,
        description: data.job.description ?? '',
        datePosted: data.job.createdAt,
        validThrough: (data.job as { expiresAt?: string }).expiresAt,
        employmentType: (data.job.type ?? 'FULL_TIME') as 'FULL_TIME',
        hiringOrganization: {
          name: data.job.company?.companyName ?? 'Hire Adda',
          url: data.job.company?.slug ? `/companies/${data.job.company.slug}` : undefined,
          logo: data.job.company?.logo ?? undefined,
        },
        jobLocation: {
          addressLocality: data.job.location,
          addressCountry: 'IN',
        },
        baseSalary:
          data.job.salaryMin && data.job.salaryMax
            ? {
                currency: data.job.currency ?? 'INR',
                min: Number(data.job.salaryMin),
                max: Number(data.job.salaryMax),
                unitText:
                  data.job.salaryType === 'MONTHLY'
                    ? 'MONTH'
                    : data.job.salaryType === 'HOURLY'
                      ? 'HOUR'
                      : 'YEAR',
              }
            : undefined,
      }),
      // Standalone Organization payload for the hiring company —
      // §8.2 of the master plan calls for both JobPosting (with inline
      // hiringOrganization) AND a top-level Organization so Google
      // can link the job to the company's knowledge-graph entry.
      ...(data.job.company?.companyName
        ? [
            companySchema({
              url: data.job.company.slug
                ? `/companies/${data.job.company.slug}`
                : `/jobs/${match.fullSlug}`,
              name: data.job.company.companyName,
              logo: data.job.company.logo ?? undefined,
            }),
          ]
        : []),
      breadcrumbSchema([
        { name: 'Home', url: '/' },
        { name: 'Jobs', url: '/jobs' },
        { name: data.job.title, url: `/jobs/${match.fullSlug}` },
      ]),
    );
    return (
      <PublicLayout inAppForLoggedIn>
        <JsonLd id="jsonld-job-detail" data={jsonLd} />
        <PublicJobDetailView data={data} />
      </PublicLayout>
    );
  }

  // Listing variant — apply preset filters + custom H1/SEO copy.
  const preset = presetFromSlug(match);
  const hero = defaultHeroFromSlug(match);
  const seoIntro = composeSeoIntro(match);

  // Canonical URL: every role+city alias collapses to the gold-standard
  // `{role}-jobs-in-{city}` form. Other listing variants use their path.
  const canonical =
    match.kind === 'role-city'
      ? `/jobs/${match.role}-jobs-in-${match.city}`
      : `/jobs/${segments.join('/')}`;

  // Concurrent fetch — top 10 results for ItemList JSON-LD + total
  // count for pagination prev/next link tags.
  const [topJobs, faqs, total] = await Promise.all([
    fetchTopJobsForPreset(preset, 10),
    Promise.resolve(getPublicJobsFaqs('en', 6)),
    fetchTotalForPreset(preset),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / LISTING_PAGE_SIZE));
  const prevHref =
    pageNum > 1 ? (pageNum === 2 ? canonical : `${canonical}?page=${pageNum - 1}`) : undefined;
  const nextHref = pageNum < totalPages ? `${canonical}?page=${pageNum + 1}` : undefined;

  // Curated landings (category, department, qualification, collection,
  // curated, role, city) get CollectionPage; role+city + role+exp variants
  // are tightly-scoped search-result pages. Use WebPage for both — Google
  // maps both shapes equally well.
  const usesCollectionPage =
    match.kind === 'category' ||
    match.kind === 'department' ||
    match.kind === 'qualification' ||
    match.kind === 'collection' ||
    match.kind === 'curated' ||
    match.kind === 'city';

  const pageSchemaInput = {
    url: canonical,
    name: `${hero.h1} — Hire Adda`,
    description: `${hero.h1}. ${hero.subtitle}.`,
    speakableCssSelectors: ['h1', '.hero-subtitle', '[data-speakable]'],
  };

  const jsonLd = graph(
    usesCollectionPage
      ? collectionPageSchema({ ...pageSchemaInput, numberOfItems: topJobs.length })
      : webPageSchema(pageSchemaInput),
    breadcrumbSchema([
      { name: 'Home', url: '/' },
      { name: 'Jobs', url: '/jobs' },
      { name: hero.h1, url: canonical },
    ]),
    // ItemList of top results — Google extracts this for the
    // jobs-rich-result SERP carousel.
    jobPostingListSchema(
      canonical,
      topJobs.map((j) => ({
        url: j.slug ? `/jobs/${j.slug}` : `/jobs`,
        title: j.title,
        hiringOrganizationName: j.company?.companyName ?? 'Hire Adda',
      })),
    ),
    // FAQPage on every listing variant — boosts AEO/SERP rich results.
    faqPageSchema(faqs.map((f) => ({ question: f.question, answer: f.answer }))),
  );

  return (
    <PublicLayout>
      <JsonLd id="jsonld-jobs-listing" data={jsonLd} />
      <PaginationLinks prev={prevHref} next={nextHref} />
      <PublicJobListingShell
        initialFilters={preset}
        heroH1={hero.h1}
        heroSubtitle={hero.subtitle}
        seoIntro={seoIntro}
      />

      {/* ── Server-rendered job links ──
          Same fix as /jobs. `topJobs` was already fetched above but reached
          ONLY the ItemList JSON-LD, so all ~648 programmatic listing pages
          shipped zero crawlable links to any job.

          These are PRESET-FILTERED (`fetchTopJobsForPreset(preset, 10)`), so
          each role/city page gets its own set. That also gives these pages
          genuine differentiation — they were otherwise near-identical to one
          another, which is its own indexing problem.

          Deliberately NOT wrapped in <Suspense>: a boundary would stream this
          into `<div hidden>` and hide it from non-JS crawlers again, which is
          the bug this change exists to remove. Guarded on length so a failed
          fetch renders nothing rather than an empty indexable section. */}
      {topJobs.length > 0 && (
        <nav aria-label={`Latest ${hero.h1}`} className="border-t border-[var(--border)] bg-white">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <h2 className="text-lg font-semibold text-[var(--text)]">Latest {hero.h1}</h2>
            <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              {topJobs
                .filter((j) => j.slug)
                .map((j) => (
                  <li key={j.id} className="text-sm">
                    <Link
                      href={`/jobs/${j.slug}`}
                      className="text-primary hover:underline focus-visible:underline"
                    >
                      {j.title}
                    </Link>
                    {j.company?.companyName ? (
                      <span className="text-[var(--text-muted)]"> — {j.company.companyName}</span>
                    ) : null}
                  </li>
                ))}
            </ul>
          </div>
        </nav>
      )}
    </PublicLayout>
  );
}

/**
 * Compose a 40–60-word answer-friendly intro paragraph for AEO. Search
 * engines + AI crawlers extract this as the direct answer to queries
 * like "web developer jobs in noida".
 */
function composeSeoIntro(match: JobSearchSlugMatch): string {
  // Each branch must produce a 40–60 word, answer-friendly paragraph.
  // Voice assistants + AI search engines extract this as the direct
  // answer to user queries. Use plain prose, name the surface
  // explicitly, and end with the value-prop.
  const dehyphen = (s: string) => s.replace(/-/g, ' ').trim();
  switch (match.kind) {
    case 'role-city':
      return `Browse the latest ${dehyphen(match.role)} jobs in ${dehyphen(match.city)} on Hire Adda. Apply to verified employers in seconds — Indian salary ranges, GST-compliant employers, fast hiring. Filter by experience, work mode, salary, and shift to find your perfect match.`;
    case 'role-experience':
      return `Looking for ${dehyphen(match.role)} jobs with ${match.experienceYears}+ years of experience? Hire Adda has verified openings across India tailored to your seniority. Filter by location, salary, and work mode. Apply with your saved profile in one click — no scams, no recruiter spam.`;
    case 'city':
      return `Find the latest jobs in ${dehyphen(match.city)} on Hire Adda. Verified employers across IT, sales, marketing, finance, healthcare, manufacturing and more. Apply with one click, save jobs, and get email alerts for new openings — all free for candidates.`;
    case 'role':
      return `Looking for ${dehyphen(match.role)} jobs? Hire Adda lists verified ${dehyphen(match.role)} openings across India, from freshers to senior leadership. Filter by city, experience, and salary to narrow the results. Apply with your saved profile in one click — no scams, no spam.`;
    case 'curated':
      return `Browse ${dehyphen(match.preset)} on Hire Adda — a hand-curated collection of verified job openings across India. Filter by location, experience, and salary. Save searches, set alerts, apply with one click — all free for candidates.`;
    case 'category':
      return `Explore ${dehyphen(match.category)} jobs across India on Hire Adda. Verified employers in ${dehyphen(match.category)} hire freshers and experienced candidates here. Filter by city, salary, and work mode; apply in one click using your saved Hire Adda profile.`;
    case 'department':
      return `Browse ${dehyphen(match.department)} jobs across India on Hire Adda. Verified companies hire ${dehyphen(match.department)} talent at every level — from junior roles to leadership. Filter by location, salary, and work mode. Save jobs, set alerts, apply in one click — all free.`;
    case 'qualification':
      return `Find jobs requiring ${dehyphen(match.qualification)} qualifications on Hire Adda. Verified employers hiring across IT, finance, healthcare, sales, and more. Filter by city, experience, and salary; apply in one click with your saved profile — no scams, no recruiter spam.`;
    case 'collection':
      return `Explore the ${dehyphen(match.collection)} collection on Hire Adda — a hand-picked set of verified openings updated daily. Filter by location, experience, and salary. Save the search to revisit, set alerts, and apply with one click using your saved profile.`;
    default:
      return 'Browse the latest jobs on Hire Adda — India’s leading job portal with verified employers, no scams, GST-compliant companies, and one-click applications. Search by job title, skills, or company; filter by location, experience, salary, and work mode. Free for all candidates.';
  }
}
