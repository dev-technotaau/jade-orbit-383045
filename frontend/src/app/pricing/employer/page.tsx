import type { Metadata } from 'next';
import PublicLayout from '@/components/layout/PublicLayout';
import PricingSections, {
  EMPLOYER_PRICING_SECTIONS,
  coveredPlanCategories,
} from '@/components/billing/PricingSections';
// PricingFAQ is hidden on this page (duplicated the accordion FAQ below) —
// restore together with its usage further down.
// import PricingFAQ from '@/components/billing/PricingFAQ';
import AuthSupportFooter from '@/components/support/AuthSupportFooter';
import PageFaqSection from '@/components/support/PageFaqSection';
import EmployerHelplineBanner from '@/components/support/EmployerHelplineBanner';
import WelcomeScreen from '@/components/common/WelcomeScreen';
import { fetchPublicPlans } from '@/lib/pricing.server';
import { generateMetadata as buildMetadata } from '@/components/common/SEO';
import JsonLd from '@/components/seo/JsonLd';
import { breadcrumbSchema, graph, serviceSchema } from '@/lib/json-ld';
import { GENERIC_HELPLINE_HOURS, resolveEmployerHelpline } from '@/constants/support';
import { Building2 } from 'lucide-react';

// Public pricing page → shared toll-free helpline (not the dashboard-only
// dedicated employer line), so the schema matches what the page renders.
const PUBLIC_HELPLINE = resolveEmployerHelpline(false);
// schema.org `telephone` wants a dashed/E.164-ish form, not a tel: URI.
const PUBLIC_HELPLINE_E164 = PUBLIC_HELPLINE.href.replace(/^tel:/, '');

export const metadata: Metadata = buildMetadata({
  title: 'Employer Pricing — Job Posts, CV Database & Assisted Hiring',
  description:
    'Hire Adda employer plans — start with a free job post or scale with Standard, Premium, CV Database, Enterprise, and Assisted Hiring plans.',
  url: '/pricing/employer',
});

export const revalidate = 300;

export default async function EmployerPricingPage({
  searchParams,
}: {
  searchParams?: Promise<{ upgrade?: string; from?: string }>;
}) {
  const plans = await fetchPublicPlans();
  const params = (await searchParams) ?? {};
  const upgradeMode = params.upgrade === '1';
  // The employer onboarding wizard redirects here (`?from=onboarding`)
  // instead of the dashboard, so this is the new employer's first-touch
  // landing. Candidates land on their dashboard and get the celebratory
  // WelcomeScreen there; without firing it here too, employers only ever
  // see the welcome when they later click the dashboard tab in the
  // sidebar. Render the self-gating overlay so it fires automatically
  // right after onboarding — parity with the candidate experience.
  const onboardingMode = params.from === 'onboarding';

  // Filter plans to only the employer categories rendered by this page so
  // empty-state / counts reflect what the user actually sees.
  // Includes merged categories (Enterprise lives inside the CV Database
  // section), which a plain `.map((s) => s.category)` would drop.
  const employerCategories = coveredPlanCategories(EMPLOYER_PRICING_SECTIONS);
  const employerPlans = plans.filter((p) => employerCategories.has(p.category));

  // Service schema — surfaces the helpline as structured data so it can
  // appear in Google Knowledge Panels and Service rich results when users
  // search for "hire adda employer support phone" etc. This is a PUBLIC
  // page, so it advertises the shared toll-free number — matching what the
  // page actually renders (the dedicated employer line is dashboard-only).
  // Builds an Offer for each plan so the SERP card can list pricing.
  const employerServiceJsonLd = graph(
    serviceSchema({
      name: 'Hire Adda — Employer Hiring Solutions',
      description: `End-to-end recruitment platform for Indian employers — job posts, CV database, assisted hiring, and team-managed accounts. Toll-free helpline (${PUBLIC_HELPLINE.display}) for sales and support, ${GENERIC_HELPLINE_HOURS}.`,
      url: '/pricing/employer',
      serviceType: 'Recruitment & Talent Acquisition',
      audienceType: 'Employer',
      telephone: { display: PUBLIC_HELPLINE.display, uri: PUBLIC_HELPLINE_E164 },
      hours: {
        days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        opens: '09:00',
        closes: '18:00',
      },
      offers: employerPlans
        .filter((p) => !p.requiresQuote && p.basePricePaise > 0)
        .map((p) => ({
          name: p.name,
          pricePaise: p.basePricePaise,
          currency: p.currency,
          url: `/pricing/${p.slug}`,
        })),
    }),
    breadcrumbSchema([
      { name: 'Home', url: '/' },
      { name: 'Pricing', url: '/pricing' },
      { name: 'Employer', url: '/pricing/employer' },
    ]),
  );

  return (
    <PublicLayout>
      <JsonLd id="jsonld-pricing-employer-service" data={employerServiceJsonLd} />
      {/* First-login full-screen welcome — only after the onboarding
          wizard redirects here. Self-gates per (user, role) via
          localStorage, fires once, and auto-dismisses to reveal the
          pricing page underneath. No-op for guests / non-onboarding
          visits and on every subsequent visit. */}
      {onboardingMode && <WelcomeScreen />}
      <div className="under-public-header bg-[var(--bg)]">
        <EmployerHelplineBanner />

        {/* Hero */}
        <section className="bg-gradient-to-b from-[var(--bg-secondary)] to-[var(--bg)] px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <span className="bg-primary-light text-primary inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
              <Building2 className="h-3.5 w-3.5" />
              For employers
            </span>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[var(--text)] sm:text-5xl">
              Hire faster with the right plan
            </h1>
            <p className="mt-5 text-lg text-[var(--text-muted)]">
              Free job posts to start, or scale up with paid plans for top visibility, CV database
              access, and assisted sourcing — pay only for what you need.
            </p>
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              All prices include 18% GST · UPI, cards, netbanking, wallets, EMI · Optional
              auto-renew via eMandate / UPI AutoPay
            </p>
          </div>
        </section>

        <PricingSections
          plans={employerPlans}
          sections={EMPLOYER_PRICING_SECTIONS}
          upgradeMode={upgradeMode}
        />

        {employerPlans.length === 0 && (
          <section className="px-4 py-24 text-center sm:px-6 lg:px-8">
            <p className="text-[var(--text-muted)]">
              Plans are loading. If this persists, please refresh the page.
            </p>
          </section>
        )}

        {/* Curated employer-pricing FAQ — driven by shared FAQ corpus
            (employer + billing FAQs filtered for this page context). */}
        <PageFaqSection
          pageContext="pricing-employer"
          audience="employer"
          heading="Employer Pricing FAQ"
          subheading="Quick answers about plans, billing, and what each tier includes."
          jsonLdId="jsonld-faq-pricing-employer"
        />

        {/* PricingFAQ (the static, non-accordion Q&A grid) is HIDDEN here —
            it duplicated the PageFaqSection accordion directly above, and
            PageFaqSection's own docs warn that running both also emits
            duplicate FAQPage JSON-LD. Restore by uncommenting this and its
            import if the accordion is ever removed.
        <PricingFAQ />
        */}

        {/* Employer-only support strip — helpline + modal triggers. */}
        <section className="bg-white px-4 pb-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <AuthSupportFooter
              pageContext="pricing-employer"
              audience="employer"
              defaultCategory="BILLING"
            />
          </div>
        </section>
      </div>
    </PublicLayout>
  );
}
