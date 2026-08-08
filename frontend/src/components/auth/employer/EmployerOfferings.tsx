'use client';

import { motion } from 'framer-motion';
import { Package, Building2, Database, Headphones, Handshake } from 'lucide-react';
import OfferingCard, { type OfferingCardData } from '@/components/auth/OfferingCard';
import { ROUTES } from '@/constants/routes';

/**
 * "What Hire Adda Offers" — the employer auth (login/register) offerings
 * section. Instead of listing every individual plan, it presents the four
 * employer service *categories* as premium cards. Each card deep-links to the
 * matching section of the employer pricing page (the same destinations the
 * header "Our Offerings" menu uses), so the visitor can jump straight to the
 * plans for the offering they care about.
 *
 * Light-mode only. Static content — no plans API dependency.
 */
const CATEGORIES: OfferingCardData[] = [
  {
    title: 'Job Posting',
    description: 'Post jobs and reach the right candidates across India, fast.',
    features: [
      'Reach lakhs of active job seekers',
      'Featured & urgent job boosts',
      'Applicant tracking dashboard',
    ],
    href: `${ROUTES.BILLING.PRICING_EMPLOYER}#employer_job_post`,
    ctaLabel: 'View plans',
    icon: Building2,
    accent: 'blue',
    badge: 'Popular',
  },
  {
    title: 'CV Database / HireDex',
    description: 'Search and unlock verified candidate CVs from the Talent Vault.',
    features: [
      'Advanced search & filters',
      'Unlock candidate contact details',
      'Save searches & get alerts',
    ],
    href: `${ROUTES.BILLING.PRICING_EMPLOYER}#employer_cv_database`,
    ctaLabel: 'View plans',
    icon: Database,
    accent: 'violet',
  },
  {
    title: 'Assisted Hiring',
    description: 'Let our hiring specialists source matching CVs for your open roles.',
    features: ['Dedicated hiring specialist', 'Hand-picked matching CVs', 'Faster shortlisting'],
    href: `${ROUTES.BILLING.PRICING_EMPLOYER}#employer_assisted_hiring`,
    ctaLabel: 'View plans',
    icon: Headphones,
    accent: 'emerald',
  },
  {
    title: 'Vendor Connect',
    description: 'Grow your recruitment business — receive hiring leads from client companies.',
    features: [
      'Receive client hiring leads',
      'List in the vendor directory',
      'Connect with hiring companies',
    ],
    href: `${ROUTES.BILLING.PRICING_EMPLOYER}#vendor_connect`,
    ctaLabel: 'View plans',
    icon: Handshake,
    accent: 'amber',
  },
];

export default function EmployerOfferings() {
  return (
    <section id="offerings" className="bg-[var(--bg)] px-4 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl">
        {/* ── Header ── */}
        <motion.div
          className="mx-auto max-w-2xl text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <span className="bg-primary-light text-primary inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
            <Package className="h-3.5 w-3.5" aria-hidden="true" />
            Employer Offerings
          </span>
          <h2 className="mt-4 text-3xl font-extrabold text-[var(--text)] sm:text-4xl">
            What Hire Adda Offers
          </h2>
          <p className="mt-3 text-base leading-relaxed text-[var(--text-muted)]">
            Pick the offering that fits your hiring — job posting, CV database access, assisted
            hiring or vendor connect — and view its plans in seconds.
          </p>
        </motion.div>

        {/* ── Category cards ── */}
        <div className="mt-12 grid grid-cols-1 items-stretch gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map((category, i) => (
            <motion.div
              key={category.title}
              className="h-full"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4, delay: Math.min(i * 0.08, 0.4) }}
            >
              <OfferingCard {...category} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
