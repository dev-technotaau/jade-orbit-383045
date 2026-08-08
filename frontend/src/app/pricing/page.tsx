import type { Metadata } from 'next';
import Link from 'next/link';
import PublicLayout from '@/components/layout/PublicLayout';
import PricingSections, { ALL_PRICING_SECTIONS } from '@/components/billing/PricingSections';
import PageFaqSection from '@/components/support/PageFaqSection';
import AuthSupportFooter from '@/components/support/AuthSupportFooter';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import { fetchPublicPlans } from '@/lib/pricing.server';
import { generateMetadata as buildMetadata } from '@/components/common/SEO';
import JsonLd from '@/components/seo/JsonLd';
import {
  breadcrumbSchema,
  collectionPageSchema,
  graph,
  itemListSchema,
  productSchema,
} from '@/lib/json-ld';
import { ArrowRight, Sparkles } from 'lucide-react';

export const metadata: Metadata = buildMetadata({
  title: 'Pricing & Plans',
  description:
    'Choose the right Hire Adda plan for your hiring or career goals — Standard, Premium, CV Database, Assisted Hiring & Vendor Connect.',
  url: '/pricing',
});

// 5-minute revalidation — matches backend cache TTL
export const revalidate = 300;

export default async function PricingPage({
  searchParams,
}: {
  searchParams?: Promise<{ upgrade?: string; from?: string }>;
}) {
  const plans = await fetchPublicPlans();
  const params = (await searchParams) ?? {};
  const upgradeMode = params.upgrade === '1';
  const onboardingMode = params.from === 'onboarding';

  // JSON-LD: CollectionPage + ItemList of plans + per-plan Product entries.
  // Each Product carries an Offer so search engines can render the price
  // directly in SERP rich-result cards. ACTIVE plans only — DRAFT /
  // ARCHIVED / HIDDEN never enter the structured-data graph.
  const visiblePlans = plans.filter((p) => p.status === 'ACTIVE');
  const pricingJsonLd = graph(
    collectionPageSchema({
      url: '/pricing',
      name: 'Pricing & Plans — Hire Adda',
      description:
        'Compare every Hire Adda plan: free job posts, paid employer tiers, CV-database access, assisted hiring, vendor connect, and candidate Premium.',
      numberOfItems: visiblePlans.length,
      speakableCssSelectors: ['h1', '[data-speakable]'],
    }),
    breadcrumbSchema([
      { name: 'Home', url: '/' },
      { name: 'Pricing', url: '/pricing' },
    ]),
    itemListSchema({
      url: '/pricing',
      name: 'Hire Adda plans',
      itemListOrder: 'Unordered',
      items: visiblePlans.map((p) => ({
        url: `/pricing/${p.slug}`,
        name: p.name,
        description: p.shortDescription ?? `${p.name} — ${p.category} plan from Hire Adda.`,
      })),
    }),
    ...visiblePlans.map((p) =>
      productSchema({
        url: `/pricing/${p.slug}`,
        name: p.name,
        description:
          p.shortDescription ?? `${p.name} — ${p.category} subscription plan from Hire Adda.`,
        category: p.category,
        sku: p.code,
        offers: {
          pricePaise: p.basePricePaise,
          currency: p.currency,
          availability: 'https://schema.org/InStock',
          url: `/pricing/${p.slug}`,
        },
      }),
    ),
  );

  return (
    <PublicLayout>
      <JsonLd id="jsonld-pricing" data={pricingJsonLd} />
      <div className="under-public-header bg-[var(--bg)]">
        {/* Post-onboarding banner — shown right after the employer wizard so
            new employers can either purchase a paid plan immediately or fall
            through to the dashboard on the auto-granted Free plan. */}
        {onboardingMode && (
          <section className="border-b border-[var(--border)] bg-emerald-50 px-4 py-6 sm:px-6 lg:px-8 dark:bg-emerald-900/20">
            <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-800/40 dark:text-emerald-300">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-emerald-900 dark:text-emerald-100">
                    Welcome to Hire Adda — pick a plan to get started
                  </h2>
                  <p className="mt-1 text-sm text-emerald-900/80 dark:text-emerald-200/80">
                    Buy a plan now to unlock CV-database access, more job posts and premium
                    visibility — or continue with the free 7-day plan that&apos;s already active on
                    your account.
                  </p>
                </div>
              </div>
              <Link
                href="/employer"
                className="inline-flex flex-none items-center gap-2 rounded-lg border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-900 transition-colors hover:bg-emerald-700 hover:text-white dark:text-emerald-100 dark:hover:bg-emerald-800"
              >
                Continue with Free Plan
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </section>
        )}

        {/* Hero */}
        <section className="bg-gradient-to-b from-[var(--bg-secondary)] to-[var(--bg)] px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <h1 className="text-4xl font-extrabold tracking-tight text-[var(--text)] sm:text-5xl">
              Plans designed for every hiring journey
            </h1>
            <p className="mt-5 text-lg text-[var(--text-muted)]">
              Hire Adda offers free job posts, paid employer plans, CV-database access, assisted
              hiring, vendor connect & a candidate Premium tier — all on a single platform.
            </p>
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              All prices include 18% GST · Pay via UPI, cards, netbanking, wallets or EMI ·
              Auto-renew with eMandate / UPI AutoPay
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm">
              <Link
                href="/pricing/employer"
                className="hover:border-primary hover:text-primary inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-white px-4 py-1.5 font-medium text-[var(--text)] transition-colors dark:bg-[var(--bg-secondary)]"
              >
                For employers <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                href="/pricing/candidate"
                className="hover:border-primary hover:text-primary inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-white px-4 py-1.5 font-medium text-[var(--text)] transition-colors dark:bg-[var(--bg-secondary)]"
              >
                For candidates <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </section>

        {/* Sections */}
        <PricingSections
          plans={plans}
          sections={ALL_PRICING_SECTIONS}
          upgradeMode={upgradeMode}
          onboardingMode={onboardingMode}
        />

        {/* Empty state */}
        {plans.length === 0 && (
          <section className="px-4 py-24 text-center sm:px-6 lg:px-8">
            <p className="text-[var(--text-muted)]">
              Plans are loading. If this persists, please refresh the page.
            </p>
          </section>
        )}

        {/* FAQ — the shared accordion block (search + locale picker + its own
            FAQPage JSON-LD), replacing the old static PricingFAQ grid so all
            three pricing pages use one consistent FAQ system.
            `audience="all"` because this catch-all page lists employer,
            candidate and add-on plans together. */}
        <PageFaqSection
          pageContext="pricing"
          audience="all"
          heading="Pricing FAQ"
          subheading="Answers about plans, GST, billing cycles and refunds."
          jsonLdId="jsonld-faq-pricing"
        />

        {/* Catch-all pricing already has its own FAQ section above, so we
            suppress the Help button here and only surface Contact. The
            employer helpline is shown because the catch-all page lists
            employer plans alongside others. */}
        <section className="bg-[var(--bg-secondary)] px-4 pb-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <AuthSupportFooter
              pageContext="pricing"
              audience="employer"
              showHelp={false}
              defaultCategory="BILLING"
            />
          </div>
        </section>

        {/* Breadcrumbs — bottom placement. Schema already in JsonLd. */}
        <div className="border-t border-[var(--border)] bg-white">
          <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
            <Breadcrumbs items={[{ name: 'Pricing' }]} withSchema={false} />
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
