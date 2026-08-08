/**
 * /companies/[slug]/reviews — dedicated reviews page.
 *
 * Server component that:
 *   1. Fetches company + initial stats + first page of reviews on the
 *      server — feeds JSON-LD + metadata for SEO.
 *   2. Renders a client component for the interactive layer (filters,
 *      pagination, voting, share, modal).
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PublicLayout from '@/components/layout/PublicLayout';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import JsonLd from '@/components/seo/JsonLd';
import {
  breadcrumbSchema,
  graph,
  webPageSchema,
  reviewSchema,
  aggregateRatingSchema,
} from '@/lib/json-ld';
import { generateMetadata as buildMetadata } from '@/components/common/SEO';
import ReviewsClient from './ReviewsClient';

export const revalidate = 300;

interface CompanyDetailLite {
  company: {
    id: string;
    slug: string | null;
    companyName: string;
    logo: string | null;
    industry: string | null;
  };
  averageRating?: number;
  totalReviews?: number;
}

async function fetchCompanyBySlug(slug: string): Promise<CompanyDetailLite | null> {
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

interface InitialStats {
  totalReviews: number;
  averageOverall: number;
  averageWorkLifeBalance: number;
  averageSalary: number;
  averagePromotions: number;
  averageJobSecurity: number;
  averageSkillDev: number;
  averageWorkSatisfaction: number;
  averageCompanyCulture: number;
  distribution: { star: number; count: number; percent: number }[];
  men: { count: number; average: number | null; percent: number };
  women: { count: number; average: number | null; percent: number };
  industry: { name: string | null; average: number | null; diff: number | null };
  topJobProfiles: { designation: string; avgRating: number; count: number }[];
}

async function fetchStats(slug: string): Promise<InitialStats | null> {
  const apiBase =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:5000/api/v1';
  try {
    const res = await fetch(
      `${apiBase}/public/companies/${encodeURIComponent(slug)}/reviews/stats`,
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return null;
    const body = await res.json();
    return body?.data ?? null;
  } catch {
    return null;
  }
}

interface InitialList {
  items: Array<{
    id: string;
    overallRating: number;
    likes: string | null;
    dislikes: string | null;
    workDetails: string | null;
    designation: string;
    createdAt: string;
  }>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

async function fetchTopReviews(slug: string): Promise<InitialList | null> {
  const apiBase =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:5000/api/v1';
  try {
    const res = await fetch(
      `${apiBase}/public/companies/${encodeURIComponent(slug)}/reviews?limit=10&sort=helpful`,
      { next: { revalidate: 300 } },
    );
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
    return buildMetadata({
      title: 'Company reviews not found',
      url: `/companies/${slug}/reviews`,
    });
  }
  const c = data.company;
  const avg = data.averageRating ?? 0;
  const total = data.totalReviews ?? 0;
  return buildMetadata({
    title: `${c.companyName} reviews — ratings, salaries, culture`,
    description:
      total > 0
        ? `Read ${total} verified employee reviews of ${c.companyName} on Hire Adda. Overall rating ${avg.toFixed(1)}/5.`
        : `Be the first to share an honest review of ${c.companyName} on Hire Adda.`,
    url: `/companies/${slug}/reviews`,
    image: c.logo || undefined,
  });
}

export default async function CompanyReviewsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [data, stats, topList] = await Promise.all([
    fetchCompanyBySlug(slug),
    fetchStats(slug),
    fetchTopReviews(slug),
  ]);
  if (!data?.company) notFound();

  const company = data.company;
  const totalReviews = stats?.totalReviews ?? 0;
  const averageRating = stats?.averageOverall ?? 0;

  const appOrigin = process.env.NEXT_PUBLIC_APP_URL || 'https://hireadda.com';
  const canonical = `${appOrigin}/companies/${slug}/reviews`;

  const reviewsForLd = (topList?.items ?? []).slice(0, 10);

  const schemas = [
    breadcrumbSchema([
      { name: 'Home', url: appOrigin },
      { name: 'Companies', url: `${appOrigin}/companies` },
      { name: company.companyName, url: `${appOrigin}/companies/${slug}` },
      { name: 'Reviews', url: canonical },
    ]),
    webPageSchema({
      name: `${company.companyName} reviews`,
      url: canonical,
      description:
        totalReviews > 0
          ? `${totalReviews} reviews · overall rating ${averageRating.toFixed(1)}/5`
          : `Be the first to review ${company.companyName}`,
    }),
    ...(totalReviews > 0
      ? [
          aggregateRatingSchema({
            itemName: company.companyName,
            itemType: 'Organization',
            ratingValue: averageRating,
            reviewCount: totalReviews,
          }),
        ]
      : []),
    ...reviewsForLd.map((r) =>
      reviewSchema({
        itemName: company.companyName,
        itemType: 'Organization',
        authorName: 'Anonymous employee',
        reviewBody:
          [r.likes, r.dislikes, r.workDetails]
            .filter((s): s is string => !!s)
            .join('\n\n')
            .slice(0, 500) || `${r.designation} review`,
        ratingValue: r.overallRating,
        datePublished: new Date(r.createdAt).toISOString().slice(0, 10),
      }),
    ),
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Is reviewing on Hire Adda anonymous?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes — reviews are submitted anonymously. Your identity is never shown alongside your review.',
          },
        },
        {
          '@type': 'Question',
          name: 'Who can submit a company review?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Anyone — current employees, former employees, or candidates with experience. One review per company per user.',
          },
        },
        {
          '@type': 'Question',
          name: 'How is the overall rating calculated?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Average of all approved review overall scores (1–5). Reviews flagged or removed by moderation are excluded.',
          },
        },
        {
          '@type': 'Question',
          name: 'Can I delete my review later?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes — logged-in users can delete their own reviews from the candidate review history page.',
          },
        },
      ],
    },
  ];

  return (
    <PublicLayout>
      <JsonLd data={graph(...schemas)} />
      <div className="under-public-header mx-auto max-w-6xl px-4 py-6 sm:py-10">
        <ReviewsClient
          slug={slug}
          companyName={company.companyName}
          companyLogo={company.logo}
          initialStats={stats as InitialStats | null}
          appOrigin={appOrigin}
        />

        {/* Breadcrumbs — bottom placement. Schema is part of the
            page's combined `breadcrumbSchema()` JSON-LD graph above. */}
        <div className="mt-10 border-t border-[var(--border)] pt-4">
          <Breadcrumbs
            items={[
              { name: 'Companies', href: '/companies' },
              { name: company.companyName, href: `/companies/${slug}` },
              { name: 'Reviews' },
            ]}
            withSchema={false}
          />
        </div>
      </div>
    </PublicLayout>
  );
}
