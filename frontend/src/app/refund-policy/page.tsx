import PublicLayout from '@/components/layout/PublicLayout';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import JsonLd from '@/components/seo/JsonLd';
import { generateMetadata as buildMetadata } from '@/components/common/SEO';
import { breadcrumbSchema, graph, webPageSchema } from '@/lib/json-ld';
import type { Metadata } from 'next';

export const metadata: Metadata = buildMetadata({
  title: 'Refund Policy',
  description:
    'Understand the Hire Adda refund and cancellation policy for premium plans and paid services.',
  url: '/refund-policy',
});

const refundJsonLd = graph(
  webPageSchema({
    url: '/refund-policy',
    name: 'Refund Policy',
    description:
      'Refund and cancellation terms for Hire Adda paid plans — Candidate Premium, Employer Standard/Premium, CV Lite/Pro/Enterprise, Assisted Hiring, and Vendor Connect. 2-day refund window, automated via Razorpay.',
    dateModified: '2026-05-12',
    speakableCssSelectors: ['h1'],
  }),
  breadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Refund Policy', url: '/refund-policy' },
  ]),
);

const sections = [
  {
    title: 'Overview',
    content:
      'This Refund Policy governs paid services purchased on Hire Adda — the recruitment platform operated by Opportunity Makers Group (proprietor: Harpreet Kaur, GSTIN 03EBLPK4190M1ZA). It applies to candidate premium plans, employer job-post plans, the CV-database (Talent Vault / HireDex) plans, assisted-hiring orders, and the Vendor Connect subscription. Our refund flow is automated end-to-end through Razorpay: once a refund is approved by our system or our team, the credit is initiated immediately and is returned to your original payment method without manual intervention.',
  },
  {
    title: 'Free plans (no refund needed)',
    content:
      'All candidate features on Hire Adda are free — profile creation, job search, applications, AI-powered recommendations, saved searches, alerts, messaging. The Free Job Post plan for employers (1 job, 7 days, up to 50 applications) is also free of charge. Because no money changes hands for these plans, this policy does not apply to them. If you believe you have been charged for something that should be free, email support@hireadda.in and we will reverse the charge in full.',
  },
  {
    title: 'Refund window — 2 days from purchase',
    content:
      'Self-service refunds are eligible within 2 calendar days (48 hours) of the payment being captured on Razorpay. The window is enforced programmatically: after 48 hours from capture, the automated refund path is closed and the purchase is treated as fully consumed. For situations after the 2-day window, see "Goodwill refunds" below.',
  },
  {
    title: 'Eligible plans',
    content:
      'The refund window applies to: Candidate Premium (₹199 / 30 days); Employer Standard (₹499 / 15 days) and Employer Premium (₹999 / 30 days); CV Lite (₹1,999 / 15 days), CV Pro (₹3,999 / 30 days), and CV Enterprise (custom-quoted); Assisted Hiring (₹1,499 / 7 days); and each monthly auto-renewal of the Vendor Connect employer add-on subscription (₹199 / month). For Vendor Connect specifically, the 2-day window restarts at every auto-renewal — not just at signup.',
  },
  {
    title: 'Cancellation is different from a refund',
    content:
      'Cancellation and refund are two different actions. Cancellation (turning off auto-renew on Vendor Connect, or disabling renewal on a one-time plan) stops future charges and keeps your existing access running until the end of the current validity window — no money is returned. A refund returns the money to your original payment method and immediately revokes the entitlement (any unconsumed resources go back to the pool). The 2-day window applies only to refunds.',
  },
  {
    title: 'Resource consumption and partial refunds',
    content:
      'A refund releases unconsumed entitlement resources — CV unlocks, job-post quota, application quota, search-result quota, vendor leads, etc. — back to the system. If you have already consumed a significant portion of the plan, we may approve a partial refund proportional to the remaining capacity instead of a full one. If the value you have already received from the plan exceeds a fair refund (for example, you have unlocked all 200 CVs on CV Lite), the refund may be declined. Partial-refund decisions are made by our billing team, with super-admin override for genuine exceptional cases.',
  },
  {
    title: 'How to request a refund',
    content:
      'Self-service: open your /billing/orders page, find the order, click "Request refund" within 2 days of purchase, and select a reason (typically "User requested"). The system validates the window and any consumed resources, then submits the refund directly to Razorpay. For orders you cannot find self-service (for example, a specific Vendor Connect monthly cycle), email support@hireadda.in with the receipt number — our billing team will action it on your behalf if you are inside the window.',
  },
  {
    title: 'Refund timeline',
    content:
      'Once approved, our backend calls the Razorpay refund API and the credit flows back to the original payment method. Standard refund speed is 3–5 business days for the credit to reflect on your statement (Razorpay’s "normal" speed; no fee). In urgent cases we can issue an "instant" refund where the credit reflects within minutes — a small Razorpay processing fee applies and we generally absorb it for goodwill cases. You will receive one email when the refund is initiated and a second email once Razorpay confirms it has settled.',
  },
  {
    title: 'Coupons, GST, and credit notes',
    content:
      'If you used a discount coupon, the refund amount is the net amount you actually paid (price minus discount). The coupon redemption is automatically reversed so the coupon usage limit is restored (subject to that coupon’s own rules). Hire Adda prices are tax-inclusive — the 18% GST embedded in each plan is reversed proportionally on the refund, and a credit note is auto-issued under the same GSTIN that received the original tax invoice. The credit note appears in /billing/invoices.',
  },
  {
    title: 'Goodwill refunds (after 2 days)',
    content:
      'Once the 2-day window has passed, the automated path is closed. You can still write to support@hireadda.in with your receipt number and the situation — we review goodwill refund requests case by case. Cases where we typically grant goodwill refunds include: a platform outage that prevented you from using the plan, service quality that fell short of what was promised, a duplicate charge, or a billing error on our end. Goodwill is at the company’s discretion and is not contractually owed.',
  },
  {
    title: 'Non-refundable items',
    content:
      'The following are not eligible for a refund under any circumstance: free plans (you did not pay for them); CV Enterprise quotes once the dedicated CV access has been delivered; any plan whose entitlement has been fully consumed (every CV unlock redeemed, every job post validity fully elapsed, every assisted-hiring CV email delivered); accounts suspended for Terms of Service violations, fraud, or chargeback abuse; promotional plans where the promotion’s own terms explicitly say "non-refundable."',
  },
  {
    title: 'Disputes and chargebacks',
    content:
      'If you believe a charge on your statement is wrong, please contact us before filing a chargeback with your card issuer or bank. We resolve most billing disputes within 2 business days via email, which is much faster than the chargeback process and avoids putting your account into our fraud-review queue. We retain the right to contest chargebacks we believe are unwarranted. Repeated unwarranted chargebacks may lead to account suspension and to a flag in our fraud-detection system that prevents future purchases.',
  },
  {
    title: 'Changes to this policy',
    content:
      'Hire Adda may update this Refund Policy from time to time. Material changes will be communicated to active paying users by email. The revised policy applies only to purchases made on or after the effective date of the change; existing purchases continue under the policy in force at the time of purchase. Minor clarifications (rewording, formatting) take effect immediately when the "Last updated" date at the top of this page changes.',
  },
  {
    title: 'Contact us',
    content:
      'For refund and billing matters, email support@hireadda.in or call +91 80540 50551 (Mon–Fri, 10:00 AM – 6:00 PM IST). You can also write to Opportunity Makers Group (Proprietor: Harpreet Kaur), House No. 302, Village Dhogri Road, Tehsil Nangal Salempur-1, Jalandhar, Punjab 144004, India — GSTIN 03EBLPK4190M1ZA. For general support the same channels work; billing-specific requests get routed to the right person internally.',
  },
];

export default function RefundPolicyPage() {
  return (
    <PublicLayout>
      <JsonLd id="jsonld-refund-policy" data={refundJsonLd} />
      {/* Hero Section */}
      <section className="from-primary-50 under-public-header relative overflow-hidden bg-gradient-to-br via-white to-[var(--accent-light)]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-[var(--text)] sm:text-5xl">
              Refund Policy
            </h1>
            <p className="mt-4 text-[var(--text-secondary)]">
              Last updated:{' '}
              <time dateTime="2026-05-12" className="font-medium">
                12 May 2026
              </time>
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Aligned with the live billing engine — 2-day refund window, Razorpay-mediated
              processing, automatic credit-note + entitlement release
            </p>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="bg-white py-12 sm:py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-[var(--border)] bg-white p-6 sm:p-10">
            <p className="leading-relaxed text-[var(--text-secondary)]">
              This Refund Policy governs all paid services offered on Hire Adda by Opportunity
              Makers Group, a proprietorship of Harpreet Kaur (&quot;Hire Adda,&quot;
              &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). It is aligned with our live
              billing engine — every rule below is enforced in code, not just in prose. Please read
              this carefully before making any purchase on the platform.
            </p>

            <div className="mt-10 space-y-10">
              {sections.map((section, index) => (
                <div key={section.title}>
                  <h2 className="text-xl font-semibold text-[var(--text)]">
                    {index + 1}. {section.title}
                  </h2>
                  <p className="mt-3 leading-relaxed text-[var(--text-secondary)]">
                    {section.content}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-10 border-t border-[var(--border)] pt-6">
              <p className="text-sm text-[var(--text-muted)]">
                This Refund Policy is effective as of 12 May 2026. Hire Adda is operated by
                Opportunity Makers Group, a proprietorship of Harpreet Kaur, registered under the
                laws of India with its principal place of business at Jalandhar, Punjab (GSTIN
                03EBLPK4190M1ZA). All refund decisions are at the sole discretion of Opportunity
                Makers Group acting through Hire Adda, and are final.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Breadcrumbs — bottom placement, narrow rail. */}
      <div className="border-t border-[var(--border)] bg-white">
        <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6 lg:px-8">
          <Breadcrumbs items={[{ name: 'Refund Policy' }]} withSchema={false} />
        </div>
      </div>
    </PublicLayout>
  );
}
