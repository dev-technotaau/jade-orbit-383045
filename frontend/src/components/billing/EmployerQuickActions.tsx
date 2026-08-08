'use client';

import Link from 'next/link';
import Tooltip from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';
import { useEntitlements } from '@/hooks/use-entitlements';
import { ROUTES } from '@/constants/routes';
import type { PlanCategory } from '@/types/billing';

/**
 * EmployerQuickActions — header shortcuts to the three add-on offerings,
 * sitting beside the plan/quota badges.
 *
 * Text-only by design: an icon for "Vendor Connect" or "Assisted Hiring" has no
 * conventional glyph, so the icons read as decoration and the label carried the
 * meaning anyway. Dropping them makes the row narrower at 2xl than the old
 * icon+label pair, which is why the label no longer waits for that breakpoint.
 *
 * Destination depends on whether the employer already holds that category:
 *   · NOT held → the pricing page, deep-linked to that category's section.
 *     The anchor is `category.toLowerCase()`, which is exactly the `id`
 *     PricingSections puts on each section (it also carries `scroll-mt-24`, so
 *     the landing position already clears the sticky header).
 *   · HELD → that category's plan detail page under /billing/plans, so the
 *     shortcut turns into a "manage what I bought" link rather than an upsell.
 *
 * EMPLOYER-ONLY by construction: this component is rendered from the employer
 * branch of DashboardHeader and never mounted for candidates or admins.
 */

const OFFERINGS: {
  category: PlanCategory;
  label: string;
  /** Shown when the employer has not bought into this category yet. */
  upsellHint: string;
  /** Shown once they hold it. */
  ownedHint: string;
}[] = [
  {
    category: 'EMPLOYER_CV_DATABASE',
    label: 'CV Database',
    upsellHint: 'See CV Database plans',
    ownedHint: 'Manage your CV Database plan',
  },
  {
    category: 'VENDOR_CONNECT',
    label: 'Vendor Connect',
    upsellHint: 'See Vendor Connect plans',
    ownedHint: 'Manage your Vendor Connect plan',
  },
  {
    category: 'EMPLOYER_ASSISTED_HIRING',
    label: 'Assisted Hiring',
    upsellHint: 'See Assisted Hiring plans',
    ownedHint: 'Manage your Assisted Hiring plan',
  },
];

export default function EmployerQuickActions() {
  const { snapshot } = useEntitlements();

  /* Categories the employer currently holds. Only ACTIVE counts — an expired
     entitlement should route back to pricing, not to a plan they no longer
     have. Anonymous / still-loading yields an empty set, so every link falls
     back to the pricing page, which is the safe default. */
  const heldCategories = new Set(
    (snapshot?.entitlements ?? [])
      .filter((e) => e.status === 'ACTIVE')
      .map((e) => e.planCategory)
      .filter(Boolean),
  );

  return (
    <div className="hidden items-center gap-1 xl:flex">
      {OFFERINGS.map(({ category, label, upsellHint, ownedHint }) => {
        const owned = heldCategories.has(category);
        const href = owned
          ? ROUTES.BILLING.PLAN_CATEGORY(category)
          : `${ROUTES.BILLING.PRICING_EMPLOYER}#${category.toLowerCase()}`;
        return (
          <Tooltip key={category} content={owned ? ownedHint : upsellHint}>
            <Link
              href={href}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold whitespace-nowrap transition-colors',
                owned
                  ? 'text-primary hover:bg-primary-light'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]',
              )}
            >
              {label}
              {/* A quiet dot marks "you already own this", so the row reads as
                  status at a glance rather than three identical upsells. */}
              {owned && (
                <span
                  className="bg-primary h-1.5 w-1.5 flex-none rounded-full"
                  aria-hidden="true"
                />
              )}
              {/* Suffix only — the label is now real text, so repeating it here
                  would make the link announce "CV Database CV Database …". */}
              <span className="sr-only">{owned ? 'manage your plan' : 'view plans'}</span>
            </Link>
          </Tooltip>
        );
      })}
    </div>
  );
}
