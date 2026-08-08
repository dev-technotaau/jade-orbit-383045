import type { Metadata } from 'next';
import PublicLayout from '@/components/layout/PublicLayout';
import PricingSections, {
  CANDIDATE_PRICING_SECTIONS,
  coveredPlanCategories,
} from '@/components/billing/PricingSections';
// PricingFAQ is hidden on this page (duplicated the accordion FAQ below) —
// restore together with its usage further down.
// import PricingFAQ from '@/components/billing/PricingFAQ';
import AuthSupportFooter from '@/components/support/AuthSupportFooter';
import PageFaqSection from '@/components/support/PageFaqSection';
import { fetchPublicPlans } from '@/lib/pricing.server';
import { generateMetadata as buildMetadata } from '@/components/common/SEO';
import { GraduationCap } from 'lucide-react';

export const metadata: Metadata = buildMetadata({
  title: 'Candidate Premium — Verified Badge, Profile Boost & Top Visibility',
  description:
    'Stand out to recruiters with Hire Adda Candidate Premium — AI Resume, Verified Badge, 7-day Profile Boost, Top Visibility & Priority WhatsApp support.',
  url: '/pricing/candidate',
});

export const revalidate = 300;

export default async function CandidatePricingPage({
  searchParams,
}: {
  searchParams?: Promise<{ upgrade?: string }>;
}) {
  const plans = await fetchPublicPlans();
  const params = (await searchParams) ?? {};
  const upgradeMode = params.upgrade === '1';

  // Uses the shared helper so any future merged category is picked up too.
  const candidateCategories = coveredPlanCategories(CANDIDATE_PRICING_SECTIONS);
  const candidatePlans = plans.filter((p) => candidateCategories.has(p.category));

  return (
    <PublicLayout>
      <div className="bg-[var(--bg)]">
        {/* Hero */}
        <section className="under-public-header bg-gradient-to-b from-[var(--bg-secondary)] to-[var(--bg)] px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <span className="bg-primary-light text-primary inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
              <GraduationCap className="h-3.5 w-3.5" />
              For candidates
            </span>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[var(--text)] sm:text-5xl">
              Stand out and get hired faster
            </h1>
            <p className="mt-5 text-lg text-[var(--text-muted)]">
              Premium gives your profile top visibility in recruiter searches, an AI-polished
              resume, a verified badge and priority WhatsApp support — for the price of two coffees
              a month.
            </p>
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              All prices include 18% GST · Pay via UPI, cards, netbanking, wallets or EMI
            </p>
          </div>
        </section>

        <PricingSections
          plans={candidatePlans}
          sections={CANDIDATE_PRICING_SECTIONS}
          upgradeMode={upgradeMode}
        />

        {candidatePlans.length === 0 && (
          <section className="px-4 py-24 text-center sm:px-6 lg:px-8">
            <p className="text-[var(--text-muted)]">
              Plans are loading. If this persists, please refresh the page.
            </p>
          </section>
        )}

        <PageFaqSection
          pageContext="pricing-candidate"
          audience="candidate"
          heading="Candidate Premium FAQ"
          subheading="What you get for ₹199, how billing works, and how to get help."
          jsonLdId="jsonld-faq-pricing-candidate"
        />

        {/* PricingFAQ (the static, non-accordion Q&A grid) is HIDDEN here —
            it duplicated the PageFaqSection accordion directly above, and
            PageFaqSection's own docs warn that running both also emits
            duplicate FAQPage JSON-LD. Restore by uncommenting this and its
            import if the accordion is ever removed.
        <PricingFAQ />
        */}

        <section className="bg-white px-4 pb-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <AuthSupportFooter
              pageContext="pricing-candidate"
              audience="candidate"
              defaultCategory="BILLING"
            />
          </div>
        </section>
      </div>
    </PublicLayout>
  );
}
