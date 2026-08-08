import { permanentRedirect } from 'next/navigation';
import JsonLd from '@/components/seo/JsonLd';
import { generateMetadata as buildMetadata } from '@/components/common/SEO';
import { breadcrumbSchema, companySchema, graph } from '@/lib/json-ld';
import type { Metadata } from 'next';
import type { CompanyProfile } from '@/types/employer';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';
const INTERNAL_API_URL = process.env.BACKEND_INTERNAL_URL || API_URL;

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

/**
 * Server-side fetch of the public company profile.
 *
 * Runs at build time (for SSG) or at request time (for ISR) — either way
 * on the server, so the SEO payload is already in the HTML response.
 *
 * Returns `null` on any error — the page still renders (via the client
 * component), but metadata falls back to generic values and JSON-LD is
 * skipped (never emit stub data — Google penalises inaccurate schema).
 */
async function fetchCompany(id: string): Promise<CompanyProfile | null> {
  try {
    const res = await fetch(`${API_URL}/employers/${id}/public`, {
      // Cache for 10 minutes at the edge; revalidate asynchronously.
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.data ?? null) as CompanyProfile | null;
  } catch {
    return null;
  }
}

/**
 * Quick slug-only lookup against the public companies API. Skips the
 * full profile payload — we only need the slug to decide whether to
 * 301 to the canonical /companies/{slug} URL.
 */
async function lookupCompanySlugById(id: string): Promise<string | null> {
  try {
    const res = await fetch(`${INTERNAL_API_URL}/employers/${id}/public`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const slug = json?.data?.slug;
    return typeof slug === 'string' && slug.length > 0 ? slug : null;
  } catch {
    return null;
  }
}

/**
 * Per-company dynamic metadata.
 *
 *   - Title is company name (falls back to "Company Profile")
 *   - Description drawn from `description` / `tagline` / industry
 *   - OG image uses the company logo when available, otherwise site default
 *   - Canonical URL points at the /company/[id] path
 *   - Keywords include company name + industry for long-tail SEO
 */
export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { id } = await params;
  const company = await fetchCompany(id);

  if (!company) {
    return buildMetadata({
      title: 'Company Profile',
      description: 'View the public company profile on Hire Adda.',
      url: `/company/${id}`,
    });
  }

  const title = `${company.companyName}${company.industry ? ` — ${company.industry}` : ''}`;
  const description =
    company.description?.slice(0, 300) ||
    company.tagline ||
    `Public profile for ${company.companyName} on Hire Adda — open roles, culture, benefits, and company information.`;

  return buildMetadata({
    title,
    description,
    url: `/company/${id}`,
    keywords: [
      company.companyName,
      ...(company.industry ? [company.industry, `${company.industry} jobs`] : []),
      'company profile',
      'jobs at ' + company.companyName,
      'hire adda',
    ],
    image: company.logo
      ? [{ url: company.logo, width: 1200, height: 1200, alt: `${company.companyName} logo` }]
      : undefined,
  });
}

/**
 * Public company profile layout — injects:
 *   - Dynamic metadata (handled above)
 *   - Organization JSON-LD @graph with BreadcrumbList
 *
 * The inner client page component handles UI / interactions. SEO
 * payload is SSR'd here so crawlers see it on first HTML response.
 */
export default async function CompanyProfileLayout({ children, params }: LayoutProps) {
  const { id } = await params;

  // Backward-compat redirect — if the company has a slug, 301 to the
  // canonical public URL `/companies/{slug}` so search engines, bookmarks,
  // and old job-card links converge on one URL. permanentRedirect throws
  // a NEXT_REDIRECT signal that Next.js converts into an HTTP 308 with a
  // permanent cache hint (functionally equivalent to 301 for crawlers).
  const slug = await lookupCompanySlugById(id);
  if (slug) {
    permanentRedirect(`/companies/${slug}`);
  }

  const company = await fetchCompany(id);

  // Only emit schema when we have real data — never ship placeholder JSON-LD.
  const companyJsonLd = company
    ? graph(
        companySchema({
          url: `/company/${id}`,
          name: company.companyName,
          description: company.description ?? undefined,
          logo: company.logo ?? undefined,
          foundingDate: company.foundedYear ? String(company.foundedYear) : undefined,
          industry: company.industry ?? undefined,
          website: company.website ?? undefined,
          numberOfEmployees: company.employeeCount ?? undefined,
        }),
        breadcrumbSchema([
          { name: 'Home', url: '/' },
          { name: 'Companies', url: '/companies' },
          { name: company.companyName, url: `/company/${id}` },
        ]),
      )
    : null;

  return (
    <>
      {companyJsonLd && <JsonLd id="jsonld-company" data={companyJsonLd} />}
      {children}
    </>
  );
}
