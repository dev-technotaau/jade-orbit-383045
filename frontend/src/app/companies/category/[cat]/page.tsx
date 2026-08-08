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
  params: Promise<{ cat: string }>;
}): Promise<Metadata> {
  const { cat } = await params;
  const label = titleCase(cat);
  return buildMetadata({
    title: `${label} Companies`,
    description: `Browse ${label} companies hiring in India. Verified employers, open roles, and culture insights — all in one place on Hire Adda.`,
    url: `/companies/category/${cat}`,
  });
}

export default async function CompanyCategoryPage({
  params,
}: {
  params: Promise<{ cat: string }>;
}) {
  const { cat } = await params;
  const label = titleCase(cat);

  const jsonLd = graph(
    collectionPageSchema({
      url: `/companies/category/${cat}`,
      name: `${label} Companies — Hire Adda`,
      description: `Discover verified ${label} companies hiring in India.`,
      speakableCssSelectors: ['h1', '.hero-subtitle', '[data-speakable]'],
    }),
    breadcrumbSchema([
      { name: 'Home', url: '/' },
      { name: 'Companies', url: '/companies' },
      { name: label, url: `/companies/category/${cat}` },
    ]),
  );

  return (
    <PublicLayout>
      <JsonLd id="jsonld-companies-category" data={jsonLd} />
      <PublicCompanyListingShell
        initialFilters={{ category: label }}
        heroH1={`${label} Companies`}
        heroSubtitle={`Verified ${label} employers hiring across India`}
        seoIntro={`Hire Adda lists ${label} companies actively hiring across India. Browse open jobs, view culture and benefits, and apply with one click — all free for candidates. Filter by location and company size to narrow results.`}
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
