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
  params: Promise<{ coll: string }>;
}): Promise<Metadata> {
  const { coll } = await params;
  const label = titleCase(coll);
  return buildMetadata({
    title: label,
    description: `Hand-curated set of companies (${label}) hiring on Hire Adda. View open jobs and apply with one click.`,
    url: `/companies/collection/${coll}`,
  });
}

export default async function CompanyByCollectionPage({
  params,
}: {
  params: Promise<{ coll: string }>;
}) {
  const { coll } = await params;
  const label = titleCase(coll);

  const jsonLd = graph(
    collectionPageSchema({
      url: `/companies/collection/${coll}`,
      name: `${label} — Hire Adda`,
      description: `Hand-curated companies on Hire Adda — ${label}.`,
      speakableCssSelectors: ['h1', '.hero-subtitle', '[data-speakable]'],
    }),
    breadcrumbSchema([
      { name: 'Home', url: '/' },
      { name: 'Companies', url: '/companies' },
      { name: label, url: `/companies/collection/${coll}` },
    ]),
  );

  return (
    <PublicLayout>
      <JsonLd id="jsonld-companies-collection" data={jsonLd} />
      <PublicCompanyListingShell
        initialFilters={{ collection: coll }}
        heroH1={label}
        heroSubtitle={`A hand-picked Hire Adda collection of companies hiring now`}
        seoIntro={`Hire Adda's ${label} collection is hand-curated and refreshed daily. View company culture, benefits, open jobs, and tech stack on every profile. Apply with one click — all free for candidates, no scams, no recruiter spam.`}
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
