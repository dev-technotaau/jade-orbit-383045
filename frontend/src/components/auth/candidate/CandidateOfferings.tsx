'use client';

import { motion } from 'framer-motion';
import { Sparkles, Search, FileText } from 'lucide-react';
import OfferingCard, { type OfferingCardData } from '@/components/auth/OfferingCard';
import { ROUTES } from '@/constants/routes';

/**
 * "What Hire Adda Offers" — the candidate (job-seeker) auth (login/register)
 * offerings section. Presents the candidate offering *categories* as premium
 * cards: the paid Premium plan (deep-links to the candidate pricing section)
 * alongside the core free offerings, each with its own contextual CTA.
 *
 * Light-mode only. Sibling of EmployerOfferings.
 */
const CATEGORIES: OfferingCardData[] = [
  {
    title: 'Premium Profile',
    description: 'Stand out to recruiters with a verified, boosted profile and premium-only perks.',
    features: [
      'Priority recruiter visibility',
      'Verified badge & profile boost',
      'Premium-only perks',
    ],
    href: `${ROUTES.BILLING.PRICING_CANDIDATE}#candidate_premium`,
    ctaLabel: 'View plans',
    icon: Sparkles,
    accent: 'violet',
    badge: 'Premium',
    highlight: true,
  },
  {
    title: 'Search & Apply',
    description: 'Browse thousands of live jobs across India and apply in a single click.',
    features: ['Thousands of live jobs', 'One-click apply', 'Smart job alerts'],
    href: ROUTES.PUBLIC.JOBS,
    ctaLabel: 'Browse jobs',
    icon: Search,
    accent: 'blue',
  },
  {
    title: 'AI Resume Builder',
    description:
      'Create a polished, ATS-friendly resume in minutes — free, no design skills needed.',
    features: ['ATS-friendly templates', 'Build in minutes', 'Free to use'],
    href: ROUTES.BILLING.PRICING_CANDIDATE,
    ctaLabel: 'Learn more',
    icon: FileText,
    accent: 'emerald',
  },
];

export default function CandidateOfferings() {
  return (
    <section id="candidate-offerings" className="bg-[var(--bg)] px-4 py-16 sm:py-20">
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
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            For job seekers
          </span>
          <h2 className="mt-4 text-3xl font-extrabold text-[var(--text)] sm:text-4xl">
            What Hire Adda Offers
          </h2>
          <p className="mt-3 text-base leading-relaxed text-[var(--text-muted)]">
            Everything you need to land your next job — go Premium to get discovered, search and
            apply to live jobs, and build a standout resume for free.
          </p>
        </motion.div>

        {/* ── Category cards ── */}
        <div className="mt-12 grid grid-cols-1 items-stretch gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
