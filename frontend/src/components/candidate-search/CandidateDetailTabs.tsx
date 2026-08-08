'use client';

/**
 * Tab navigation for the candidate-detail surface.
 *
 * Used by:
 *   - /candidate/profile/preview — candidate self-preview
 *   - /employer/candidates/[id]   — employer-side candidate view
 *
 * Seven possible tabs (auto-hidden when no data):
 *   - overview       — bio, summary, current role, basic info
 *   - experience     — experience array
 *   - education      — education array
 *   - skills         — skills, itSkills, languages, languageProficiency
 *   - projects       — projects, publications, patents
 *   - achievements   — awards, certifications, courses, testScores
 *   - more           — volunteerExperience, professionalMemberships,
 *                      references, hobbies, interests
 *
 * Tab state is URL-driven via `?tab=key` so external links + bookmarks
 * preserve the active tab.
 */

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  User,
  Briefcase,
  GraduationCap,
  Code,
  FolderOpen,
  Trophy,
  MoreHorizontal,
  type LucideIcon,
} from 'lucide-react';

export type CandidateTabKey =
  | 'overview'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'achievements'
  | 'more';

interface TabDef {
  key: CandidateTabKey;
  label: string;
  icon: LucideIcon;
}

const ALL_TABS: TabDef[] = [
  { key: 'overview', label: 'Overview', icon: User },
  { key: 'experience', label: 'Experience', icon: Briefcase },
  { key: 'education', label: 'Education', icon: GraduationCap },
  { key: 'skills', label: 'Skills', icon: Code },
  { key: 'projects', label: 'Projects', icon: FolderOpen },
  { key: 'achievements', label: 'Achievements', icon: Trophy },
  { key: 'more', label: 'More', icon: MoreHorizontal },
];

interface Props {
  /**
   * Set/array of tab keys that should appear. Overview is always
   * forced visible inside the component for sane defaults.
   */
  available?: ReadonlySet<CandidateTabKey> | CandidateTabKey[];
}

export default function CandidateDetailTabs({ available }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = (searchParams?.get('tab') ?? 'overview') as CandidateTabKey;

  const availableSet = new Set<CandidateTabKey>(
    available
      ? available instanceof Set
        ? Array.from(available)
        : available
      : ALL_TABS.map((t) => t.key),
  );
  availableSet.add('overview');

  const active: CandidateTabKey = availableSet.has(requested) ? requested : 'overview';
  const visibleTabs = ALL_TABS.filter((t) => availableSet.has(t.key));

  return (
    <nav
      aria-label="Candidate sections"
      role="tablist"
      className="sticky top-0 z-10 -mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-[var(--border)] bg-white/95 px-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
    >
      {visibleTabs.map((t) => {
        const Icon = t.icon;
        const isActive = active === t.key;
        const params = new URLSearchParams(searchParams?.toString() ?? '');
        if (t.key === 'overview') params.delete('tab');
        else params.set('tab', t.key);
        const qs = params.toString();
        const href = qs ? `${pathname}?${qs}` : pathname;
        return (
          <Link
            key={t.key}
            href={href}
            role="tab"
            aria-selected={isActive}
            scroll={false}
            replace
            className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-semibold whitespace-nowrap transition-colors ${
              isActive
                ? 'text-primary border-[var(--primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            <Icon className="h-4 w-4" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Helper — given a candidate-shaped object, return the set of tab
 * keys that have content.
 */
export function deriveAvailableCandidateTabs(p: {
  experience?: unknown;
  education?: unknown;
  skills?: string[] | null;
  itSkills?: unknown;
  skillsWithProficiency?: unknown;
  languages?: string[] | null;
  languageProficiency?: unknown;
  projects?: unknown;
  publications?: unknown;
  patents?: unknown;
  awards?: unknown;
  certifications?: unknown;
  courses?: unknown;
  testScores?: unknown;
  volunteerExperience?: unknown;
  professionalMemberships?: unknown;
  references?: unknown;
  hobbies?: string[] | null;
  interests?: string[] | null;
}): Set<CandidateTabKey> {
  const set = new Set<CandidateTabKey>(['overview']);
  const hasArray = (v: unknown) => Array.isArray(v) && v.length > 0;

  if (hasArray(p.experience)) set.add('experience');
  if (hasArray(p.education)) set.add('education');
  if (
    (p.skills?.length ?? 0) > 0 ||
    hasArray(p.itSkills) ||
    hasArray(p.skillsWithProficiency) ||
    (p.languages?.length ?? 0) > 0 ||
    hasArray(p.languageProficiency)
  ) {
    set.add('skills');
  }
  if (hasArray(p.projects) || hasArray(p.publications) || hasArray(p.patents)) {
    set.add('projects');
  }
  if (
    hasArray(p.awards) ||
    hasArray(p.certifications) ||
    hasArray(p.courses) ||
    hasArray(p.testScores)
  ) {
    set.add('achievements');
  }
  if (
    hasArray(p.volunteerExperience) ||
    hasArray(p.professionalMemberships) ||
    hasArray(p.references) ||
    (p.hobbies?.length ?? 0) > 0 ||
    (p.interests?.length ?? 0) > 0
  ) {
    set.add('more');
  }
  return set;
}
