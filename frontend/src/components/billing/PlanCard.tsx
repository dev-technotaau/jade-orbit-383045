'use client';

import { Check, CheckCircle2, Sparkles } from 'lucide-react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useEntitlements } from '@/hooks/use-entitlements';
import { formatPaise, PLAN_BILLING_LABELS, type Plan } from '@/types/billing';
import { isMultiQuantityPlan } from '@/constants/billing';
import PlanVisualBand, { PlanParticles } from '@/components/billing/plan-visuals';
import { getPlanTier, getPlanTierVisual } from '@/components/billing/plan-theme';

interface PlanCardProps {
  plan: Plan;
  /** Highlight a single plan as the recommended one even if `plan.highlight` is false. */
  forceHighlight?: boolean;
  /** Per-card primary CTA text. Default depends on plan type. */
  ctaText?: string;
  /** Override the CTA destination. Default = /billing/checkout/<code> for paid, /auth/register for free. */
  ctaHref?: string;
  /**
   * When true, the CTA switches to the upgrade flow (`/billing/upgrade/<code>`)
   * which previews pro-rata credit + carry-forward instead of starting a fresh
   * checkout. Used when the user already has an active plan.
   */
  upgradeMode?: boolean;
  /**
   * When true, this card is being shown immediately after employer onboarding.
   * Free plans send the user to the dashboard (the EMP_FREE entitlement was
   * auto-granted at signup), and the label is "Continue with Free Plan".
   */
  onboardingMode?: boolean;
  /**
   * Card arrangement.
   *   - `stacked` (default) — the column card used in multi-plan grids.
   *   - `spotlight` — a wide horizontal card for sections that hold a SINGLE
   *     plan (Assisted Hiring, Vendor Connect), where a narrow column card
   *     would leave most of the row empty. Same content and same pricing
   *     logic; only the arrangement changes.
   */
  layout?: 'stacked' | 'spotlight';
  className?: string;
}

export default function PlanCard({
  plan,
  forceHighlight,
  ctaText,
  ctaHref,
  upgradeMode,
  onboardingMode,
  layout = 'stacked',
  className,
}: PlanCardProps) {
  const highlight = forceHighlight ?? plan.highlight;

  // Detect whether THIS plan is the user's CURRENT plan within its
  // category. Entitlements stack (an unexpired Free entitlement stays
  // ACTIVE alongside a freshly bought Standard), so the old "any active
  // entitlement matches this code" check double-badged every card the
  // user had ever activated. The current plan per category is the
  // ACTIVE entitlement with the most recent validFrom (latest purchase
  // wins; ties broken by later validUntil). useEntitlements returns
  // nothing for anonymous visitors → no badge on the marketing page.
  const { snapshot: entSnapshot } = useEntitlements();
  const sameCategoryActive = (entSnapshot?.entitlements ?? []).filter(
    (e) => e.status === 'ACTIVE' && e.planCategory === plan.category,
  );
  const currentInCategory = [...sameCategoryActive].sort(
    (a, b) =>
      new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime() ||
      new Date(b.validUntil).getTime() - new Date(a.validUntil).getTime(),
  )[0];
  const isCurrentPlan = currentInCategory?.planCode === plan.code;

  // Holding a DIFFERENT paid plan in this category? Route through the
  // upgrade flow (pro-rata credit + carry-forward + supersede) instead
  // of fresh checkout — plain Buy used to stack a second active plan
  // next to the old one. Free-tier holders go through normal checkout,
  // where the backend's same-category supersede rule retires the free
  // entitlement on grant (the upgrade flow can't see order-less
  // signup-granted plans). An explicit upgradeMode prop still wins.
  const holdsOtherPaidInCategory = sameCategoryActive.some(
    (e) => e.planCode !== plan.code && (e.planPricePaise ?? 0) > 0,
  );
  const effectiveUpgradeMode = upgradeMode || holdsOtherPaidInCategory;
  // Direction of the change — a card cheaper than the priciest plan the
  // user holds in this category is a DOWNGRADE (scheduled at period end
  // by the upgrade page), so label it honestly.
  const highestHeldPaise = sameCategoryActive.reduce(
    (max, e) => Math.max(max, e.planPricePaise ?? 0),
    0,
  );
  const isDowngradeTarget = effectiveUpgradeMode && plan.basePricePaise < highestHeldPaise;

  // Decide CTA target. When isCurrentPlan on a STACKABLE paid plan, the
  // CTA stays a buy action ("Buy again") — repurchasing the same plan
  // tops up its credits (backend stacks same-plan entitlements
  // deliberately), with a small "Manage plan" link beneath. Current
  // NON-stackable plans keep the "Manage plan" CTA to /billing/credits.
  const isFree = plan.basePricePaise === 0 && !plan.requiresQuote;
  const requiresQuote = plan.requiresQuote;
  const canBuyAgain =
    isCurrentPlan &&
    !isFree &&
    !requiresQuote &&
    plan.billingCycle === 'ONE_TIME' &&
    isMultiQuantityPlan(plan.code);
  const defaultHref = isCurrentPlan
    ? canBuyAgain
      ? `/billing/checkout/${encodeURIComponent(plan.code)}`
      : '/billing/credits'
    : requiresQuote
      ? '/billing/quote'
      : isFree
        ? onboardingMode
          ? '/employer'
          : '/auth/register/employer'
        : effectiveUpgradeMode
          ? `/billing/upgrade/${encodeURIComponent(plan.code)}`
          : `/billing/checkout/${encodeURIComponent(plan.code)}`;
  const href = ctaHref ?? defaultHref;
  const label =
    ctaText ??
    (isCurrentPlan
      ? canBuyAgain
        ? 'Buy again — add credits'
        : 'Manage plan'
      : requiresQuote
        ? 'Contact Sales'
        : isFree
          ? onboardingMode
            ? 'Continue with Free Plan'
            : 'Start Free'
          : effectiveUpgradeMode
            ? isDowngradeTarget
              ? `Downgrade to ${plan.name}`
              : `Upgrade to ${plan.name}`
            : `Buy ${plan.name}`);

  // Human-readable price string (logic unchanged).
  let priceLine: string;
  if (requiresQuote) {
    priceLine = 'Custom';
  } else if (plan.basePricePaise === 0) {
    priceLine = 'Free';
  } else {
    priceLine = formatPaise(plan.basePricePaise, plan.currency);
  }
  const cycleSuffix = requiresQuote
    ? ''
    : plan.basePricePaise === 0
      ? ''
      : PLAN_BILLING_LABELS[plan.billingCycle];

  // Validity blurb (logic unchanged).
  const validityLine =
    plan.billingCycle === 'MONTHLY'
      ? 'Auto-renewed monthly'
      : plan.validityDays
        ? `${plan.validityDays} days validity`
        : 'Custom validity';

  const includedFeatures = plan.features
    .filter((f) => f.included)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  /* Category owns the illustration + hue family; TIER owns how rich the
     treatment is, so Free / Standard / Premium in one category no longer
     render identically. Presentational only — `getPlanTier` falls back to
     price/quote shape for any unseeded code, and `core` resolves to exactly
     the pre-existing category theme. */
  const tier = getPlanTier(plan);
  const visual = getPlanTierVisual(plan.category, tier).theme;

  /* A card that is the recommended pick OR the user's current plan is the
     "selected" card. Per product direction it always wears BRAND PRIMARY —
     outline, tick chips, CTA and accent bar — whatever colour its category
     illustration happens to be, so the chosen option is unmistakable across
     every category. (Current plan previously used emerald here, which made
     "selected" mean two different colours on the same page.) */
  const isSelected = highlight || isCurrentPlan;

  /* ── Shared content blocks ──
     Extracted so the stacked and spotlight layouts render the SAME content
     from the SAME logic — only the arrangement differs. Nothing here is
     layout-aware except where a className is passed in. */

  const backdropBlock = isSelected && (
    <div
      aria-hidden="true"
      className="from-primary/8 via-primary/3 pointer-events-none absolute inset-x-0 top-0 -z-10 h-40 rounded-t-2xl bg-gradient-to-b to-transparent"
    />
  );

  /* Badge ribbons sit at z-20 — ABOVE the illustration band's hover accent bar
     (z-10). Both used to be z-10, and because the bar renders later in the DOM
     it won the tie and clipped the bottom of the ribbon text on hover. Keep the
     ribbons' z-index strictly higher than the bar's. */
  const badgeBlock = isCurrentPlan ? (
    <div className="absolute -top-3.5 left-1/2 z-20 -translate-x-1/2">
      {/* Brand primary, matching the recommended ribbon — the icon and wording
          still tell the two states apart without a second accent colour. */}
      <span className="bg-primary inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold tracking-wider text-white uppercase shadow-md">
        <CheckCircle2 className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
        Current plan
      </span>
    </div>
  ) : (
    plan.badgeText &&
    (highlight ? (
      <div className="absolute -top-3.5 left-1/2 z-20 -translate-x-1/2">
        <span className="bg-primary inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold tracking-wider text-white uppercase shadow-md">
          <Sparkles className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          {plan.badgeText}
        </span>
      </div>
    ) : (
      <div className="absolute -top-3 right-5 z-20">
        <span className="inline-flex items-center rounded-full bg-[var(--bg-secondary)] px-3 py-1 text-xs font-semibold text-[var(--text)] shadow-sm ring-1 ring-[var(--border)]">
          {plan.badgeText}
        </span>
      </div>
    ))
  );

  /** Illustration band. `rounding` differs per layout (top edge when stacked,
   *  top-left only when the band sits in the spotlight's left column). */
  const bandBlock = (rounding: string) => (
    <div className={cn('relative overflow-hidden', rounding)}>
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-x-0 top-0 z-10 h-1 origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100',
          // Selected cards take the brand accent; everyone else keeps their
          // category/tier colour.
          isSelected ? 'bg-primary' : visual.bar,
        )}
      />
      <PlanVisualBand category={plan.category} size="md" tier={tier} />
      {/* Ambient motes — selected card only, so the chosen plan is the one
          thing on the page that moves. Clipped by this wrapper's
          `overflow-hidden`, and removed entirely under reduced motion. */}
      {isSelected && <PlanParticles />}
    </div>
  );

  const headerBlock = (
    <header className="space-y-2">
      <h3 className="text-xl font-bold tracking-tight text-[var(--text)]">{plan.name}</h3>
      {plan.shortDescription && (
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          {plan.shortDescription}
        </p>
      )}
    </header>
  );

  const priceBlock = (
    <div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-4xl font-extrabold tracking-tight text-[var(--text)] sm:text-5xl">
          {priceLine}
        </span>
        {cycleSuffix && (
          <span className="text-sm font-medium text-[var(--text-muted)]">{cycleSuffix}</span>
        )}
      </div>
      {/* Validity + tax-inclusive — surfaced as quiet chips, not body text */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center rounded-full bg-[var(--bg-secondary)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]">
          {validityLine}
        </span>
        {plan.basePricePaise > 0 && (
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200 ring-inset">
            GST inclusive
          </span>
        )}
        {requiresQuote && (
          <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200 ring-inset">
            Quote-based
          </span>
        )}
      </div>
    </div>
  );

  const ctaBlock = (
    <>
      <Link href={href} className="block">
        <Button
          // "Manage plan" on a non-stackable current plan stays a quiet
          // outline — it is not the page's buying action. Every other
          // selected card gets the solid brand CTA.
          variant={isCurrentPlan && !canBuyAgain ? 'outline' : isSelected ? 'primary' : 'outline'}
          size="lg"
          // Labels are `Buy <plan name>` / `Upgrade to <plan name>`, so a long
          // plan name ("HireAdda Vendor Connect") can exceed one line in a
          // narrow column. `size="lg"` pins h-12, which crams a wrapped label
          // against the button edges — so swap to an auto height with a 3rem
          // floor and balanced wrapping. The button grows a line instead of
          // looking broken, at any plan-name length.
          className="h-auto min-h-12 w-full py-2.5 leading-snug text-balance"
          aria-label={label}
        >
          {label}
        </Button>
      </Link>
      {canBuyAgain && (
        <Link
          href="/billing/credits"
          className="-mt-3 block text-center text-xs text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text-secondary)] hover:underline"
        >
          Manage plan & credits
        </Link>
      )}
    </>
  );

  /** Feature list. `listClassName` lets the spotlight layout flow the same
   *  items into two columns instead of one; `wrapperClassName` lets it opt out
   *  of `flex-1` so the block can be vertically centred in its column. */
  const featuresBlock = (
    listClassName: string,
    wrapperClassName = 'flex flex-1 flex-col gap-3',
  ) => (
    <div className={wrapperClassName}>
      <p className="text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
        What&apos;s included
      </p>
      <ul className={listClassName}>
        {includedFeatures.map((f) => (
          <li key={f.key} className="flex items-start gap-2.5 text-sm leading-snug">
            <span
              aria-hidden="true"
              className={cn(
                'mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full',
                // Selected plans (recommended OR current) keep the solid
                // brand tick; others pick up their category+tier accent so
                // the card reads as one themed unit with its band.
                isSelected ? 'bg-primary text-white' : cn(visual.soft, visual.text),
              )}
            >
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
            <span className="text-[var(--text)]">{f.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  // Shell classes are identical for both layouts — same border/ring/hover
  // treatment, so a spotlight card still reads as "highlighted" or "current".
  const shellClassName = cn(
    'group relative isolate flex h-full flex-col rounded-2xl bg-white transition-all duration-300',
    // Selected card outline is ALWAYS brand primary, regardless of the
    // category colour its illustration carries.
    isSelected
      ? 'border-primary ring-primary/30 border-2 shadow-xl ring-2 hover:-translate-y-1.5 hover:shadow-2xl'
      : // Unselected cards sit at a tier-appropriate resting elevation, so a
        // premium rung already reads heavier than a free one before hover.
        cn(
          'hover:border-primary/50 border border-[var(--border)] hover:-translate-y-1.5 hover:shadow-xl',
          tier === 'free' ? 'shadow-xs' : tier === 'core' ? 'shadow-sm' : 'shadow-md',
        ),
    // The lg scale-up only makes sense for a column card sitting beside
    // siblings — a full-width spotlight card has nothing to stand out from,
    // and scaling it would overflow the section gutters.
    layout === 'stacked' && isSelected ? 'lg:scale-[1.03]' : undefined,
    className,
  );

  /* ── Spotlight layout — for sections holding a single plan.
        Identity + price + CTA on the left, features flowing into two columns
        on the right, so a 6-8 feature plan fills the width instead of being
        squeezed into a 448px column with dead space beside it. */
  if (layout === 'spotlight') {
    return (
      <article className={shellClassName}>
        {backdropBlock}
        {badgeBlock}
        {/* 23rem (not 21rem) so a full-width `Buy <plan name>` CTA fits on one
            line for realistic plan names; the features column still gets
            ~40rem at max-w-5xl, comfortably enough for two columns. */}
        <div className="grid flex-1 lg:grid-cols-[minmax(0,23rem)_1fr]">
          {/* Left — identity, price, CTA */}
          <div className="flex flex-col">
            {bandBlock('rounded-t-2xl lg:rounded-tr-none')}
            <div className="flex flex-1 flex-col gap-6 px-6 pt-5 pb-6 sm:px-7">
              {headerBlock}
              {priceBlock}
              <div className="mt-auto">{ctaBlock}</div>
            </div>
          </div>

          {/* Right — feature grid. Divider sits on top (mobile) / left
              (desktop) so the two halves read as one card, not two. The block
              is vertically centred because the left column (band + price + CTA)
              is usually taller — otherwise the features sit top-heavy with a
              gap dumped underneath them. */}
          <div className="flex flex-col justify-center border-t border-[var(--border)] px-6 py-6 sm:px-7 lg:border-t-0 lg:border-l">
            {featuresBlock('grid gap-x-6 gap-y-2.5 sm:grid-cols-2', 'flex flex-col gap-3')}
          </div>
        </div>
      </article>
    );
  }

  /* ── Stacked layout — the default column card. Same blocks as the
        spotlight layout above, just arranged in one vertical column. */
  return (
    <article className={shellClassName}>
      {backdropBlock}
      {badgeBlock}
      {bandBlock('rounded-t-2xl')}

      {/* Card body — header, price, CTA, then features. */}
      <div className="flex flex-1 flex-col gap-6 px-6 pt-5 pb-6 sm:px-7 sm:pb-7">
        {headerBlock}
        {priceBlock}
        {ctaBlock}

        {/* Divider before the feature list — gives the section a clear
            visual break without reading as a "container edge". */}
        <div className="-mx-6 border-t border-[var(--border)] sm:-mx-7" aria-hidden="true" />

        {featuresBlock('space-y-2.5')}
      </div>
    </article>
  );
}
