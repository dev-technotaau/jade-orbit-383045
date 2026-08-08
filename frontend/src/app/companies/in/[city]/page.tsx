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
  params: Promise<{ city: string }>;
}): Promise<Metadata> {
  const { city } = await params;
  const label = titleCase(city);
  return buildMetadata({
    title: `Companies in ${label}`,
    description: `Browse verified companies hiring in ${label}. Filter by industry and size, view open roles, culture, and benefits — all on Hire Adda.`,
    url: `/companies/in/${city}`,
  });
}

export default async function CompanyByCityPage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  const label = titleCase(city);

  const jsonLd = graph(
    collectionPageSchema({
      url: `/companies/in/${city}`,
      name: `Companies in ${label} — Hire Adda`,
      description: `Discover verified companies hiring in ${label}.`,
      speakableCssSelectors: ['h1', '.hero-subtitle', '[data-speakable]'],
    }),
    breadcrumbSchema([
      { name: 'Home', url: '/' },
      { name: 'Companies', url: '/companies' },
      { name: label, url: `/companies/in/${city}` },
    ]),
  );

  return (
    <PublicLayout>
      <JsonLd id="jsonld-companies-city" data={jsonLd} />
      <PublicCompanyListingShell
        initialFilters={{ location: label }}
        heroH1={`Companies in ${label}`}
        heroSubtitle={`Verified employers hiring in ${label}`}
        seoIntro={`Hire Adda lists verified employers hiring in ${label} across IT, sales, marketing, finance, healthcare, manufacturing and more. View company culture, benefits, and open jobs on each company profile. Apply with one click — all free.`}
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
