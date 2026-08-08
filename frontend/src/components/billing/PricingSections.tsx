import PlanCard from '@/components/billing/PlanCard';
import { PLAN_CATEGORY_LABELS, type Plan, type PlanCategory } from '@/types/billing';
import { Building2, GraduationCap, Headphones, Search, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface PricingSectionConfig {
  /**
   * Primary category — drives the section's anchor id and heading label.
   * Never change this for an existing section: the id is deep-linked from
   * the homepage, auth headers, plan gates and offering cards.
   */
  category: PlanCategory;
  icon: LucideIcon;
  description: string;
  /**
   * Extra categories whose plans render inside THIS section's card grid
   * instead of getting a section of their own. Used to show the bespoke
   * Enterprise plan alongside the other CV Database tiers, since it is the
   * top tier of the same product rather than a separate offering.
   *
   * Each merged category still gets a hidden anchor inside the section, so
   * any existing `#employer_cv_enterprise_custom` deep link keeps working.
   */
  alsoIncludes?: PlanCategory[];
}

/** Default ordering + copy used by the full /pricing page. */
export const ALL_PRICING_SECTIONS: PricingSectionConfig[] = [
  {
    category: 'EMPLOYER_JOB_POST',
    icon: Building2,
    description: 'Post jobs and reach the right candidates fast.',
  },
  {
    category: 'EMPLOYER_CV_DATABASE',
    icon: Search,
    description:
      'Search and unlock candidate CVs from the Talent Vault / HireDex database — from self-serve tiers to bespoke enterprise access.',
    // Enterprise is the top CV Database tier, so it sits in this grid.
    alsoIncludes: ['EMPLOYER_CV_ENTERPRISE_CUSTOM'],
  },
  {
    category: 'EMPLOYER_ASSISTED_HIRING',
    icon: Headphones,
    description: 'Our team sources matching CVs for your role.',
  },
  {
    category: 'VENDOR_CONNECT',
    icon: Users,
    description:
      'Add vendor powers to your employer account — receive hiring requirements from other companies.',
  },
  {
    category: 'CANDIDATE_PREMIUM',
    icon: GraduationCap,
    description: 'Boost your profile, get verified & stand out to recruiters.',
  },
];

/** Employer-only subset (excludes Candidate Premium). Vendor Connect is
 *  an employer add-on plan, so it belongs to the employer surface.
 *  EMPLOYER_CV_ENTERPRISE_CUSTOM is not listed as its own section — it is
 *  merged into the CV Database section via `alsoIncludes`. */
export const EMPLOYER_PRICING_SECTIONS: PricingSectionConfig[] = ALL_PRICING_SECTIONS.filter(
  (s) =>
    s.category === 'EMPLOYER_JOB_POST' ||
    s.category === 'EMPLOYER_CV_DATABASE' ||
    s.category === 'EMPLOYER_ASSISTED_HIRING' ||
    s.category === 'VENDOR_CONNECT',
);

/** Candidate-only subset. */
export const CANDIDATE_PRICING_SECTIONS: PricingSectionConfig[] = ALL_PRICING_SECTIONS.filter(
  (s) => s.category === 'CANDIDATE_PREMIUM',
);

/**
 * Every plan category a section list renders — primary categories PLUS any
 * `alsoIncludes` merged into them.
 *
 * Pages that narrow `plans` to their own surface MUST filter with this rather
 * than `sections.map((s) => s.category)`: a merged category (e.g. Enterprise
 * inside CV Database) is not a primary category, so the naive version silently
 * drops its plans before they ever reach the grid.
 */
export function coveredPlanCategories(sections: PricingSectionConfig[]): Set<PlanCategory> {
  const covered = new Set<PlanCategory>();
  for (const section of sections) {
    covered.add(section.category);
    for (const merged of section.alsoIncludes ?? []) covered.add(merged);
  }
  return covered;
}

interface PricingSectionsProps {
  plans: Plan[];
  sections: PricingSectionConfig[];
  /** Adds `?upgrade=1` mode to PlanCard CTAs (used by upgrade flow). */
  upgradeMode?: boolean;
  /** Adds `?from=onboarding` mode for the post-employer-onboarding banner. */
  onboardingMode?: boolean;
}

export default function PricingSections({
  plans,
  sections,
  upgradeMode = false,
  onboardingMode = false,
}: PricingSectionsProps) {
  const grouped = new Map<PlanCategory, Plan[]>();
  for (const plan of plans) {
    const list = grouped.get(plan.category) ?? [];
    list.push(plan);
    grouped.set(plan.category, list);
  }

  return (
    <>
      {sections.map(({ category, icon: Icon, description, alsoIncludes }, sectionIndex) => {
        // Merge the primary category with any `alsoIncludes` categories so
        // their plans share one grid (e.g. Enterprise inside CV Database).
        const mergedCategories: PlanCategory[] = [category, ...(alsoIncludes ?? [])];
        const list = mergedCategories
          .flatMap((c) => grouped.get(c) ?? [])
          .sort(
            (a, b) =>
              // Quote-based plans (Enterprise) are the top tier — always last,
              // regardless of their placeholder base price.
              Number(a.requiresQuote ?? false) - Number(b.requiresQuote ?? false) ||
              a.displayOrder - b.displayOrder ||
              a.basePricePaise - b.basePricePaise,
          );
        if (list.length === 0) return null;
        // Single-plan sections switch to the wide spotlight card.
        const isSpotlight = list.length === 1;
        // Alternate background between sections so adjacent groupings
        // read as distinct without needing visible dividers.
        const alternate = sectionIndex % 2 === 1;
        return (
          <section
            key={category}
            id={category.toLowerCase()}
            // `scroll-mt-24` offsets the sticky header (h-20 / 80 px on both
            // the dashboard-chrome and public shells) so deep links to a
            // section anchor (e.g. /pricing/employer#employer_cv_database)
            // land below the header instead of behind it.
            className={`scroll-mt-24 px-4 py-14 sm:px-6 sm:py-16 lg:px-8 ${
              alternate ? 'bg-[var(--bg-secondary)]/40' : 'bg-white'
            }`}
          >
            <div className="mx-auto max-w-7xl">
              {/* Back-compat anchors for categories merged into this section —
                  keeps any existing deep link (e.g.
                  /pricing/employer#employer_cv_enterprise_custom) landing here
                  now that those categories no longer own a section. */}
              {(alsoIncludes ?? []).map((merged) => (
                <span
                  key={merged}
                  id={merged.toLowerCase()}
                  aria-hidden="true"
                  className="block scroll-mt-24"
                />
              ))}

              {/* Section header — centered icon chip, bold title, supporting line.
                  Centered layout reads cleaner across all viewport widths and
                  gives the card grid below a calmer anchor. */}
              <header className="mx-auto mb-10 max-w-2xl text-center sm:mb-12">
                <div className="bg-primary/10 text-primary ring-primary/20 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl ring-1">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-[var(--text)] sm:text-3xl">
                  {PLAN_CATEGORY_LABELS[category]}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)] sm:text-base">
                  {description}
                </p>
              </header>

              {/* Card grid — keeps the same 1/2/3-col responsive behaviour
                  as before, but uses `items-stretch` + `pt-4` so the
                  highlighted-card scale doesn't visually clip the badge
                  ribbon at the top of taller cards. */}
              <div
                className={
                  // A lone plan (Assisted Hiring, Vendor Connect) would look
                  // stranded as a 448px column in a 1280px row, so it renders
                  // as a wide SPOTLIGHT card instead — see PlanCard `layout`.
                  isSpotlight
                    ? 'mx-auto grid max-w-5xl grid-cols-1 gap-6 pt-4'
                    : list.length === 2
                      ? 'mx-auto grid max-w-4xl grid-cols-1 items-stretch gap-6 pt-4 md:grid-cols-2'
                      : 'grid grid-cols-1 items-stretch gap-6 pt-4 md:grid-cols-2 lg:grid-cols-3'
                }
              >
                {list.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    upgradeMode={upgradeMode}
                    onboardingMode={onboardingMode}
                    layout={isSpotlight ? 'spotlight' : 'stacked'}
                  />
                ))}
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}
