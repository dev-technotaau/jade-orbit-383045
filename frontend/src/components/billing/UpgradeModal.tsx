'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Crown, Check, Zap, ArrowRight, Sparkles } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { ROUTES } from '@/constants/routes';
import { usePricingHref } from '@/lib/pricing-href';
import { PLAN_CODE_CATEGORY } from '@/constants/billing';
import { useEntitlements } from '@/hooks/use-entitlements';

/**
 * Feature → recommended plan + benefit copy. Drives the upgrade modal so
 * each entry point gets context-tailored messaging instead of a generic
 * "go to /pricing" prompt.
 *
 * Mirrors `seed-plans.ts` — adding a new feature means a row here so the
 * upsell modal can market it correctly.
 */
interface UpgradeMeta {
  /** Plan code to deep-link the primary CTA into checkout. */
  planCode: string;
  planName: string;
  pricePaise: number;
  /** Headline above the value list. */
  title: string;
  /** Sub-headline / value statement. */
  subtitle: string;
  /** 4-6 bullet-point benefits the user gets when they upgrade. */
  bullets: string[];
  /** Pricing line shown above the CTA, e.g. "₹199 / month". */
  priceLabel: string;
}

const UPGRADE_PRESETS: Record<string, UpgradeMeta> = {
  // ─── Candidate Premium (₹199 / 30d) ──────────────────────────
  'feature.candidate_ai_resume_premium': {
    planCode: 'CAND_PREMIUM',
    planName: 'Candidate Premium',
    pricePaise: 19_900,
    priceLabel: '₹199 / month',
    title: 'Unlock 4 premium resume templates',
    subtitle:
      'Choose from Modern, Executive, Minimal and Tech templates — designed to get more recruiter callbacks.',
    bullets: [
      '5 stunning resume templates (vs. 1 on free)',
      'Verified Badge on your profile and search results',
      '7 days of Profile Boost — appear at the top',
      'Top visibility in recruiter searches',
      'Priority support over WhatsApp',
    ],
  },
  'feature.candidate_verified_badge': {
    planCode: 'CAND_PREMIUM',
    planName: 'Candidate Premium',
    pricePaise: 19_900,
    priceLabel: '₹199 / month',
    title: 'Get the Verified Badge',
    subtitle:
      'Stand out from the crowd. Verified candidates get up to 3× more recruiter views and faster shortlists.',
    bullets: [
      'Trust badge shown to every recruiter',
      '5 premium resume templates',
      '7 days of Profile Boost',
      'Top visibility in candidate search',
      'Priority WhatsApp support',
    ],
  },
  'feature.candidate_profile_boost': {
    planCode: 'CAND_PREMIUM',
    planName: 'Candidate Premium',
    pricePaise: 19_900,
    priceLabel: '₹199 / month',
    title: 'Boost your profile to the top',
    subtitle:
      '7 days of priority placement in recruiter searches. Boosted profiles get 4× more views.',
    bullets: [
      '7 days Profile Boost included',
      'Verified Badge on every listing',
      'Top visibility in search results',
      '5 premium resume templates',
      'Priority WhatsApp support',
    ],
  },
  'feature.candidate_top_visibility': {
    planCode: 'CAND_PREMIUM',
    planName: 'Candidate Premium',
    pricePaise: 19_900,
    priceLabel: '₹199 / month',
    title: 'Reach recruiters first',
    subtitle:
      'Premium profiles surface at the top of every recruiter search. Get noticed before the competition.',
    bullets: [
      'Top of recruiter search results',
      'Verified Badge for instant trust',
      '7 days Profile Boost',
      '5 premium resume templates',
      'Priority WhatsApp support',
    ],
  },

  // ─── Employer Premium (₹999 / 30d) ───────────────────────────
  'feature.urgent_hiring_badge': {
    planCode: 'EMP_PREMIUM',
    planName: 'Employer Premium',
    pricePaise: 99_900,
    priceLabel: '₹999 / 30 days',
    title: 'Mark jobs as Urgent Hiring',
    subtitle:
      'Urgent jobs are highlighted with a red badge and shown above standard listings. Fill roles up to 5× faster.',
    bullets: [
      'Urgent Hiring badge on every job',
      'Top search visibility for all your jobs',
      '3 job posts (vs. 1 free), 30 days each',
      '20 CV unlocks included',
      'Unlimited applications + priority support',
    ],
  },
  'feature.top_listing_boost': {
    planCode: 'EMP_STANDARD',
    planName: 'Employer Standard',
    pricePaise: 49_900,
    priceLabel: '₹499 / 15 days',
    title: 'Boost your job to the top',
    subtitle:
      'Boosted jobs sit above standard listings on the candidate search results page — 3× more applications on average.',
    bullets: [
      'Top Listing Boost included',
      '10 CV database unlocks',
      '250 applications per job',
      'Candidate contact details access',
      'WhatsApp support',
    ],
  },
  'feature.top_search_visibility': {
    planCode: 'EMP_PREMIUM',
    planName: 'Employer Premium',
    pricePaise: 99_900,
    priceLabel: '₹999 / 30 days',
    title: 'Top of every search',
    subtitle:
      'Premium jobs always rank first in candidate search. The first 3 listings receive ~70% of clicks.',
    bullets: [
      'Top Search Visibility on every job',
      'Urgent Hiring badge available',
      '3 job posts, 30 days live',
      '20 CV unlocks + contact access',
      'Unlimited applications',
    ],
  },
  'feature.unlimited_applications': {
    planCode: 'EMP_PREMIUM',
    planName: 'Employer Premium',
    pricePaise: 99_900,
    priceLabel: '₹999 / 30 days',
    title: 'Remove the application limit',
    subtitle:
      'Free and Standard plans cap applications. Premium employers receive unlimited applications per job.',
    bullets: [
      'Unlimited applications per job',
      '3 job posts, 30 days live',
      '20 CV unlocks included',
      'Top search visibility + Urgent badge',
      'Priority WhatsApp support',
    ],
  },

  // ─── CV Database (₹1 999 / 15d, ₹3 999 / 30d) ───────────────
  'feature.cv_db_access': {
    planCode: 'CVDB_PRO',
    planName: 'CV Pro',
    pricePaise: 3_99_900,
    priceLabel: '₹3 999 / 30 days',
    title: 'Access the full CV database',
    subtitle:
      'Search across thousands of vetted candidate profiles, unlock contact details and reach out directly.',
    bullets: [
      '500 CV unlocks included',
      'Up to 1500 search results',
      'Advanced filters (skills, location, salary)',
      'Direct contact details for unlocked candidates',
      'Priority support, 30 days validity',
    ],
  },
  'feature.advanced_filters': {
    planCode: 'CVDB_PRO',
    planName: 'CV Pro',
    pricePaise: 3_99_900,
    priceLabel: '₹3 999 / 30 days',
    title: 'Unlock advanced filters',
    subtitle:
      'Drill down by salary range, notice period, certifications, projects and more. Find the right fit faster.',
    bullets: [
      'Advanced filters (salary, notice, certs, projects)',
      '500 CV unlocks (vs. 200 on Lite)',
      'Up to 1500 search results',
      'Direct contact details',
      'Priority support',
    ],
  },
  'feature.contact_details': {
    planCode: 'CVDB_LITE',
    planName: 'CV Lite',
    pricePaise: 1_99_900,
    priceLabel: '₹1 999 / 15 days',
    title: 'See candidate contact details',
    subtitle:
      'Free plans show only profile previews. Unlock email and phone with any CV plan and reach out instantly.',
    bullets: [
      '200 CV unlocks included',
      'Direct candidate email + phone',
      'Up to 500 search results',
      'Basic search filters',
      '15 days validity',
    ],
  },
  'feature.bulk_download': {
    planCode: 'CVDB_ENTERPRISE',
    planName: 'CV Enterprise',
    pricePaise: 0,
    priceLabel: 'Custom pricing',
    title: 'Bulk-download candidate CVs',
    subtitle:
      'Enterprise teams can export thousands of CVs at once. Talk to our sales team for custom pricing.',
    bullets: [
      '1000+ CV access (custom volume)',
      'Bulk CV download',
      'Multi-user team seats',
      'Unlimited search results',
      'Dedicated account manager',
    ],
  },
  'feature.multi_seat': {
    planCode: 'CVDB_ENTERPRISE',
    planName: 'CV Enterprise',
    pricePaise: 0,
    priceLabel: 'Custom pricing',
    title: 'Add team members to your account',
    subtitle:
      'Multi-seat access lets recruiters across your team search and unlock CVs together — usage shared from one quota pool.',
    bullets: [
      'Multiple recruiter seats',
      '1000+ CV access (custom volume)',
      'Bulk CV download',
      'Unlimited search results',
      'Dedicated account manager',
    ],
  },

  // ─── Assisted Hiring (₹1 499 / 7d) ───────────────────────────
  'feature.assisted_hiring': {
    planCode: 'ASSIST_HIRING',
    planName: 'Assisted Hiring',
    pricePaise: 1_49_900,
    priceLabel: '₹1 499 one-time',
    title: 'Let our team find matching CVs for you',
    subtitle:
      'Tell us the role — we source 4-5 vetted matching CVs and email them to you within 7 days. No need to search yourself.',
    bullets: [
      'Requirement discussion call with our team',
      '4-5 matching CVs delivered to your inbox',
      'Job post setup assistance',
      'Fast candidate sourcing',
      'WhatsApp support throughout',
    ],
  },

  // ─── Priority support (CAND_PREMIUM / EMP_PREMIUM / CVDB_PRO) ──
  'feature.whatsapp_priority': {
    planCode: 'CAND_PREMIUM',
    planName: 'Candidate Premium',
    pricePaise: 19_900,
    priceLabel: '₹199 / month',
    title: 'Get priority WhatsApp support',
    subtitle:
      'Premium members get replies on WhatsApp in under 30 minutes — versus 24h on the free tier. Plus all other Premium perks.',
    bullets: [
      'Priority WhatsApp support — under 30 min replies',
      'Verified Badge on your profile',
      '5 premium resume templates',
      '7 days Profile Boost',
      'Top visibility in recruiter searches',
    ],
  },
  'feature.priority_support': {
    planCode: 'CVDB_PRO',
    planName: 'CV Pro',
    pricePaise: 3_99_900,
    priceLabel: '₹3 999 / 30 days',
    title: 'Get priority recruiter support',
    subtitle:
      'CV Pro and higher plans include priority email + WhatsApp support — your tickets get triaged ahead of free-tier requests.',
    bullets: [
      'Priority support across email + WhatsApp',
      '500 CV unlocks, 1500 search results',
      'Advanced filters (salary, notice, certs, projects)',
      'Direct contact details for all unlocks',
      '30 days validity',
    ],
  },
};

const FALLBACK: UpgradeMeta = {
  planCode: 'CAND_PREMIUM',
  planName: 'Premium plan',
  pricePaise: 19_900,
  priceLabel: '₹199 / month',
  title: 'Upgrade to unlock this feature',
  subtitle: 'Pick a plan that fits — your unused credit carries forward when you upgrade later.',
  bullets: ['Unlock premium features', 'Stand out from free users', 'Priority support'],
};

interface OpenArgs {
  /** Feature key, e.g. 'feature.candidate_verified_badge'. Drives copy + plan. */
  feature?: string;
  /** Override plan code if you want to push a specific plan regardless of feature. */
  targetPlanCode?: string;
  /** Override title — useful for resource-quota-exhausted prompts. */
  title?: string;
  /** Override subtitle. */
  subtitle?: string;
}

interface ModalState extends OpenArgs {
  isOpen: boolean;
}

/**
 * Hook that returns the modal element and an `open(args)` handler.
 *
 * Usage:
 *   const upgrade = useUpgradeModal();
 *   return (
 *     <>
 *       <button onClick={() => upgrade.open({ feature: 'feature.candidate_verified_badge' })}>...
 *       {upgrade.modal}
 *     </>
 *   );
 *
 * Render `upgrade.modal` once anywhere in the tree. Any descendant can call
 * `open()` to surface the upsell — the modal is portalled so DOM position
 * doesn't matter.
 */
export function useUpgradeModal() {
  const [state, setState] = useState<ModalState>({ isOpen: false });

  const open = useCallback((args: OpenArgs = {}) => {
    setState({ isOpen: true, ...args });
  }, []);
  const close = useCallback(() => {
    setState((s) => ({ ...s, isOpen: false }));
  }, []);

  const meta = useMemo(() => {
    const base = state.feature ? UPGRADE_PRESETS[state.feature] : null;
    return base ?? FALLBACK;
  }, [state.feature]);

  const planCode = state.targetPlanCode ?? meta.planCode;
  const title = state.title ?? meta.title;
  const subtitle = state.subtitle ?? meta.subtitle;

  const modal = (
    <Modal isOpen={state.isOpen} onClose={close} size="lg">
      <UpgradeModalContent
        title={title}
        subtitle={subtitle}
        bullets={meta.bullets}
        planName={meta.planName}
        priceLabel={meta.priceLabel}
        planCode={planCode}
        onClose={close}
      />
    </Modal>
  );

  return { open, close, modal };
}

interface UpgradeModalContentProps {
  title: string;
  subtitle: string;
  bullets: string[];
  planName: string;
  priceLabel: string;
  planCode: string;
  onClose: () => void;
}

function UpgradeModalContent({
  title,
  subtitle,
  bullets,
  planName,
  priceLabel,
  planCode,
  onClose,
}: UpgradeModalContentProps) {
  // CV Enterprise → quote flow. Holders of a DIFFERENT paid plan in the
  // target's category → the pro-rata upgrade flow (full-price checkout
  // would silently forfeit their remaining credit — the same transition
  // from a pricing PlanCard already routes via /billing/upgrade). Everyone
  // else → plain checkout.
  const { snapshot: entSnapshot } = useEntitlements();
  const targetCategory = PLAN_CODE_CATEGORY[planCode];
  const holdsOtherPaidInCategory = Boolean(
    targetCategory &&
    entSnapshot?.entitlements?.some(
      (e) =>
        e.status === 'ACTIVE' &&
        e.planCategory === targetCategory &&
        e.planCode !== planCode &&
        (e.planPricePaise ?? 0) > 0,
    ),
  );
  const checkoutHref =
    planCode === 'CVDB_ENTERPRISE'
      ? ROUTES.BILLING.QUOTE
      : holdsOtherPaidInCategory
        ? `/billing/upgrade/${encodeURIComponent(planCode)}`
        : ROUTES.BILLING.CHECKOUT(planCode);
  // "View all plans" → role-scoped pricing surface
  // (/pricing/candidate or /pricing/employer based on the logged-in
  // user's role; vendors / unauthenticated fall back to /pricing).
  const allPlansHref = usePricingHref();

  return (
    <div>
      {/* Hero with gradient backdrop.
          Modal content area is `px-6 py-4`, so the bleed margins
          here MUST be `-mx-6 -mt-4` (not `-mt-6`) — otherwise the
          gradient pulls 8 px past the modal's top and the rounded
          corner clip visually crops the crown / title row.

          Note: NO custom close button here — the Modal shell renders
          its own X at `absolute top-4 right-4 z-10` whenever no
          `title` prop is passed. Adding a second one duplicated the
          affordance. The `pr-10` reserve below keeps long titles
          from running under that built-in X. */}
      <div className="relative -mx-6 -mt-4 overflow-hidden bg-gradient-to-br from-amber-100 via-orange-50 to-rose-50 px-6 py-7 dark:from-amber-900/30 dark:via-orange-900/20 dark:to-rose-900/20">
        {/* Blurred accent glow — the same depth treatment the plan cards use
            behind their category illustration. Decorative only. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-amber-400/30 blur-3xl"
        />
        {/* Crown + title on one row instead of stacked — fills the
            hero block visually and avoids the previous "small icon
            floating in the top-left, title hanging below" look. The
            `pr-10` reserve keeps the title from colliding with the
            Modal shell's built-in close button. */}
        <div className="relative flex items-start gap-4 pr-10">
          <div className="flex h-14 w-14 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md ring-1 ring-black/5">
            <Crown className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold tracking-tight text-[var(--text)] sm:text-2xl">
              {title}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">
              {subtitle}
            </p>
          </div>
        </div>
      </div>

      {/* Benefits */}
      <div className="px-1 py-5">
        <p className="mb-3 text-xs font-semibold tracking-wider text-[var(--text-muted)] uppercase">
          What you get with {planName}
        </p>
        <ul className="space-y-2.5">
          {bullets.map((bullet) => (
            <li key={bullet} className="flex items-start gap-2.5 text-sm text-[var(--text)]">
              {/* White check on saturated emerald = strong figure /
                  ground separation. The earlier emerald-100 / emerald-700
                  combo washed both the icon stroke and the chip
                  background into a single hue, so the check read as
                  a vague green smudge instead of a tick. */}
              <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm dark:bg-emerald-600">
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Pricing strip + CTAs.
          Same margin-math caveat as the hero — Modal's vertical
          padding is `py-4`, so the bleed here is `-mb-4` (was
          `-mb-6` which over-shot and visually clipped the
          "Tax inclusive · Cancel anytime" line at the modal's
          rounded bottom). */}
      <div className="-mx-6 -mb-4 border-t border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
              {planName}
            </p>
            <p className="mt-0.5 text-lg font-bold text-[var(--text)]">{priceLabel}</p>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
              Tax inclusive · Cancel anytime
            </p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <Link href={allPlansHref} onClick={onClose}>
              <Button variant="ghost" size="md">
                View all plans
              </Button>
            </Link>
            <Link href={checkoutHref} onClick={onClose}>
              <Button variant="primary" size="md">
                {planCode === 'CVDB_ENTERPRISE' ? (
                  <>
                    <Sparkles className="mr-1.5 h-4 w-4" /> Talk to sales
                  </>
                ) : (
                  <>
                    <Zap className="mr-1.5 h-4 w-4" /> Upgrade to{' '}
                    {planName.replace(/^Candidate |^Employer /, '')}
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </>
                )}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default useUpgradeModal;
