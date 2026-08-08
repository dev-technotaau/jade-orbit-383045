import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

/**
 * Shared FAQ block used across all public pricing pages. Server component
 * (no client state) so it works with `revalidate` on the parent page.
 */
export default function PricingFAQ() {
  return (
    <section className="bg-[var(--bg-secondary)] px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl text-center">
        <h2 className="text-2xl font-bold text-[var(--text)]">Frequently Asked Questions</h2>
        <div className="mt-8 grid grid-cols-1 gap-6 text-left md:grid-cols-2">
          <div>
            <h3 className="font-semibold text-[var(--text)]">Is GST included in the price?</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Yes — all plans listed are inclusive of 18% GST. A tax invoice with HSN code 998314 is
              generated automatically after payment.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-[var(--text)]">
              Can I cancel a plan after purchase?
            </h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Yes. You can cancel auto-renew anytime from your dashboard and keep using the plan
              benefits till validity expires. See our{' '}
              <Link href="/refund-policy" className="text-primary underline underline-offset-2">
                refund policy
              </Link>
              .
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-[var(--text)]">Do you support recurring payments?</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Yes — Vendor Connect is auto-renewed monthly via Razorpay eMandate / UPI AutoPay.
              Other plans support optional auto-renew on the same window.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-[var(--text)]">How do upgrades work mid-cycle?</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              We compute pro-rated credits from your current plan and deduct them from the new plan
              price — you only pay the difference. Unused CV unlocks carry forward (subject to
              caps).
            </p>
          </div>
        </div>
        <Link
          href="/contact"
          className="text-primary mt-10 inline-flex items-center gap-2 hover:underline"
        >
          Need help choosing? Talk to our team
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
