import type { Metadata } from 'next';
import PublicLayout from '@/components/layout/PublicLayout';
import PublicCompanyListingShell from '@/components/company-search/PublicCompanyListingShell';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import JsonLd from '@/components/seo/JsonLd';
import { breadcrumbSchema, collectionPageSchema, graph } from '@/lib/json-ld';
import { generateMetadata as buildMetadata } from '@/components/common/SEO';

export const revalidate = 300;

const titleCase = (s: string) =>
  s
    .split('-')
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ind: string }>;
}): Promise<Metadata> {
  const { ind } = await params;
  const label = titleCase(ind);
  return buildMetadata({
    title: `${label} Industry Companies`,
    description: `Discover ${label} companies hiring in India. View open roles, culture, benefits, and apply with one click on Hire Adda.`,
    url: `/companies/industry/${ind}`,
  });
}

export default async function CompanyByIndustryPage({
  params,
}: {
  params: Promise<{ ind: string }>;
}) {
  const { ind } = await params;
  const label = titleCase(ind);

  const jsonLd = graph(
    collectionPageSchema({
      url: `/companies/industry/${ind}`,
      name: `${label} Industry Companies — Hire Adda`,
      description: `Verified ${label} companies hiring across India.`,
      speakableCssSelectors: ['h1', '.hero-subtitle', '[data-speakable]'],
    }),
    breadcrumbSchema([
      { name: 'Home', url: '/' },
      { name: 'Companies', url: '/companies' },
      { name: label, url: `/companies/industry/${ind}` },
    ]),
  );

  return (
    <PublicLayout>
      <JsonLd id="jsonld-companies-industry" data={jsonLd} />
      <PublicCompanyListingShell
        initialFilters={{ industry: label }}
        heroH1={`${label} Industry Companies`}
        heroSubtitle={`Verified ${label} employers hiring across India`}
        seoIntro={`Browse verified ${label} companies on Hire Adda — view open jobs, company culture, benefits, and tech stack. Filter by location and size to find the right fit. Apply with one click using your saved profile.`}
      />

      {/* Breadcrumbs — bottom placement. Schema already in JsonLd. */}
      <div className="border-t border-[var(--border)] bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <Breadcrumbs
            items={[{ name: 'Companies', href: '/companies' }, { name: label }]}
            withSchema={false}
          />
        </div>
      </div>
    </PublicLayout>
  );
}
