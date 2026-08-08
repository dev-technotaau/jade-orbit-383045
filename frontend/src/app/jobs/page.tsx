import type { Metadata } from 'next';
import Link from 'next/link';
import PublicLayout from '@/components/layout/PublicLayout';
import PublicJobListingShell from '@/components/job-search/PublicJobListingShell';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import JsonLd from '@/components/seo/JsonLd';
import {
  breadcrumbSchema,
  collectionPageSchema,
  datasetSchema,
  faqPageSchema,
  graph,
  jobPostingListSchema,
  webPageSchema,
} from '@/lib/json-ld';
import { generateMetadata as buildMetadata, PaginationLinks } from '@/components/common/SEO';
import { getPublicJobsFaqs } from '@/data/faqs';

const PAGE_SIZE = 20;

export const revalidate = 300;

interface PublicJobListItem {
  id: string;
  slug?: string | null;
  title: string;
  company?: { companyName?: string | null } | null;
}

interface PublicJobsResponse {
  items: PublicJobListItem[];
  total: number;
}

async function fetchPublicJobs(page: number, limit = 10): Promise<PublicJobsResponse> {
  const apiBase =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:5000/api/v1';
  try {
    const res = await fetch(`${apiBase}/public/jobs?limit=${limit}&page=${page}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return { items: [], total: 0 };
    const body = await res.json();
    return {
      items: (body?.data?.items ?? []) as PublicJobListItem[],
      total: Number(body?.data?.pagination?.total ?? 0),
    };
  } catch {
    return { items: [], total: 0 };
  }
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const pageNum = Math.max(1, Number(sp?.page ?? '1') || 1);
  // Per Phase 14 + §3.5: paginated listing pages emit prev/next link
  // tags (handled inline below) AND set canonical to page 1 to avoid
  // "thin/duplicate content" penalties on later pages.
  const total = (await fetchPublicJobs(pageNum, 1)).total;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const prev = pageNum > 1 ? (pageNum === 2 ? '/jobs' : `/jobs?page=${pageNum - 1}`) : undefined;
  const next = pageNum < totalPages ? `/jobs?page=${pageNum + 1}` : undefined;

  return buildMetadata({
    title:
      pageNum > 1
        ? `Find Jobs in India — Page ${pageNum} of ${totalPages}`
        : 'Find Jobs in India — Latest openings',
    description:
      'Browse the latest jobs in India on Hire Adda. Filter by role, location, experience and skills. Verified employers, fast applications, no scams.',
    url: '/jobs',
    keywords: ['jobs in India', 'job search', 'latest jobs', 'find jobs', 'hire adda jobs'],
    pagination: { prev, next },
  });
}

export default async function JobsListingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const pageNum = Math.max(1, Number(sp?.page ?? '1') || 1);

  const [{ items: topJobs, total }, faqs] = await Promise.all([
    fetchPublicJobs(1, 10),
    Promise.resolve(getPublicJobsFaqs('en', 8)),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const prevHref =
    pageNum > 1 ? (pageNum === 2 ? '/jobs' : `/jobs?page=${pageNum - 1}`) : undefined;
  const nextHref = pageNum < totalPages ? `/jobs?page=${pageNum + 1}` : undefined;

  const jsonLd = graph(
    // CollectionPage — explicit type tells Google this is a listing,
    // not a single article. Pairs with the WebPage fallback below.
    collectionPageSchema({
      url: '/jobs',
      name: 'Find Jobs in India — Hire Adda',
      description:
        'Browse the latest jobs in India. Verified employers, fast applications, no scams.',
      numberOfItems: total,
      speakableCssSelectors: ['h1', '.hero-subtitle', '[data-speakable]'],
    }),
    webPageSchema({
      url: '/jobs',
      name: 'Find Jobs in India — Hire Adda',
      description:
        'Browse the latest jobs in India. Verified employers, fast applications, no scams.',
      speakableCssSelectors: ['h1', '.hero-subtitle', '[data-speakable]'],
    }),
    breadcrumbSchema([
      { name: 'Home', url: '/' },
      { name: 'Jobs', url: '/jobs' },
    ]),
    // ItemList of top 10 currently-live jobs — Google extracts this
    // for the rich "Jobs" SERP carousel (jobs-list rich result).
    jobPostingListSchema(
      '/jobs',
      topJobs.map((j) => ({
        url: j.slug ? `/jobs/${j.slug}` : `/jobs`,
        title: j.title,
        hiringOrganizationName: j.company?.companyName ?? 'Hire Adda',
      })),
    ),
    // FAQPage — surfaces the 8 most-relevant candidate FAQs as a
    // SERP rich result. Same corpus the help center uses.
    faqPageSchema(faqs.map((f) => ({ question: f.question, answer: f.answer }))),
    // Dataset — registers the public job board with Google Dataset
    // Search and structured-data-aware AI engines (Perplexity, GPT
    // search). Hires + recruiters search Dataset Search for live
    // labour-market signals; this surfaces our index there.
    datasetSchema({
      url: '/jobs',
      name: 'Hire Adda — Public Job Board (India)',
      description:
        'Continuously-updated dataset of verified job postings across India. Includes role, company, location, salary range, employment type, and posted date for every active listing.',
      dateModified: new Date().toISOString(),
      datePublished: '2024-01-01',
      spatialCoverage: 'India',
      temporalCoverage: '2024-01-01/..',
      keywords: [
        'jobs',
        'employment',
        'recruitment',
        'India jobs',
        'job board',
        'job postings',
        'hire adda',
        'salary data',
      ],
      size: total,
    }),
  );

  return (
    <PublicLayout>
      <JsonLd id="jsonld-jobs" data={jsonLd} />
      <PaginationLinks prev={prevHref} next={nextHref} />
      <PublicJobListingShell
        heroH1="Find Your Next Job"
        heroSubtitle="Browse 12,000+ openings across India — verified employers, fast hiring, no scams"
        seoIntro="Hire Adda lists jobs across every Indian city and state, from freshers to senior roles. Search by job title, skills, or company; filter by location, experience, salary, work mode, shift, and more. Apply with one click, save jobs for later, and set alerts so the right roles find you."
      />

      {/* ── Server-rendered job links ──
          `topJobs` was already fetched above but reached ONLY the JSON-LD, so
          the crawlable HTML for this page contained zero links to any job —
          the entire job link graph existed only in the sitemap. This renders
          the same data as real anchors.

          Deliberately NOT wrapped in <Suspense>: a boundary here would stream
          this into `<div hidden>` and hide it from non-JS crawlers again,
          which is the bug this change exists to remove. `topJobs` is awaited
          at page level, so React blocks and emits it inline.

          Guarded on length so a failed fetch (the catch returns `items: []`)
          renders nothing rather than an empty, indexable section. */}
      {topJobs.length > 0 && (
        <nav aria-label="Latest jobs" className="border-t border-[var(--border)] bg-white">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <h2 className="text-lg font-semibold text-[var(--text)]">Latest jobs</h2>
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

      {/* Breadcrumbs — bottom placement. Schema is already in the
          page's combined `breadcrumbSchema()` JSON-LD above. */}
      <div className="border-t border-[var(--border)] bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <Breadcrumbs items={[{ name: 'Jobs' }]} withSchema={false} />
        </div>
      </div>
    </PublicLayout>
  );
}
