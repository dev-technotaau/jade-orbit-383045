import type { Metadata } from 'next';
import { generateMetadata as buildMetadata } from '@/components/common/SEO';
import JsonLd from '@/components/seo/JsonLd';
import { breadcrumbSchema, contactPageSchema, graph } from '@/lib/json-ld';
import QuoteRequestForm from './QuoteRequestForm';

/**
 * `/billing/quote` — enterprise "Contact Sales" surface.
 *
 * Public so guests can submit a quote without first creating an account
 * (industry standard for B2B pricing pages). Authenticated users still get
 * the DashboardLayout chrome + redirect to the auth-gated detail page;
 * guests get a marketing-shell layout + inline thank-you confirmation.
 *
 * SEO note: this URL sits under `/billing/*`, which is globally disallowed
 * in robots.txt. An explicit `Allow: /billing/quote` exception is added
 * in `app/robots.txt/route.ts::PUBLIC_ALLOW_PATHS` to surface this page
 * to crawlers while keeping the rest of /billing/* private.
 *
 * Page is a server component so we can export `metadata` + emit JSON-LD;
 * the interactive form is rendered by the `'use client'` child below.
 */

export const metadata: Metadata = buildMetadata({
  title: 'Enterprise Quote — Contact Sales',
  description:
    'Get a custom enterprise CV access quote from Hire Adda — bulk CV unlocks, multi-user seats, dedicated account manager. 24-hour response from our sales team.',
  keywords: [
    'enterprise hiring quote',
    'bulk cv access pricing',
    'hire adda contact sales',
    'custom recruitment plan',
    'enterprise hiring india',
    'cv database enterprise plan',
    'large team hiring solutions',
  ],
  url: '/billing/quote',
});

export default function QuoteRequestPage() {
  // Build JSON-LD: ContactPage + Breadcrumb. Helps Google render the
  // page as a "contact" sitelink and surfaces breadcrumb trail in SERP.
  const breadcrumb = breadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Pricing', url: '/pricing' },
    { name: 'Enterprise Quote', url: '/billing/quote' },
  ]);
  const jsonLd = graph(
    contactPageSchema({
      url: '/billing/quote',
      name: 'Enterprise Quote — Contact Sales | Hire Adda',
      description:
        'Submit an enterprise CV access quote request — bulk unlocks, multi-user seats, dedicated support. Sales team responds within 24 hours.',
      breadcrumb,
      speakableCssSelectors: ['h1'],
    }),
    breadcrumb,
  );

  return (
    <>
      <JsonLd id="jsonld-billing-quote" data={jsonLd} />
      <QuoteRequestForm />
    </>
  );
}
