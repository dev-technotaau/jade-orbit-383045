'use client';

/**
 * AuthRoleTabs — pill-style Candidate / Employer toggle that sits at the
 * top of the login + register form cards on the dedicated role pages.
 *
 * Behaviour:
 *   - The tab matching the current `active` prop is rendered as a non-
 *     clickable button (no-op when the user clicks the tab they're
 *     already on — matches the request).
 *   - The other tab is a Next.js <Link> that navigates to that role's
 *     equivalent page (login → /auth/login/<role>, register →
 *     /auth/register/<role>).
 *
 * Visual matches the pre-cutover unified login page exactly:
 *   - container: rounded-lg bg-[var(--bg-tertiary)] p-1, two flex-1 cells
 *   - active: bg-white text-[var(--text)] shadow-sm
 *   - inactive: text-[var(--text-muted)] hover:text-[var(--text-secondary)]
 */

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/constants/routes';

interface AuthRoleTabsProps {
  mode: 'login' | 'register';
  active: 'candidate' | 'employer';
  className?: string;
}

const HREF: Record<'login' | 'register', Record<'candidate' | 'employer', string>> = {
  login: {
    candidate: ROUTES.AUTH.LOGIN_CANDIDATE,
    employer: ROUTES.AUTH.LOGIN_EMPLOYER,
  },
  register: {
    candidate: ROUTES.AUTH.REGISTER_CANDIDATE,
    employer: ROUTES.AUTH.REGISTER_EMPLOYER,
  },
};

export default function AuthRoleTabs({ mode, active, className }: AuthRoleTabsProps) {
  const tabs: Array<{ key: 'candidate' | 'employer'; label: string }> = [
    { key: 'candidate', label: 'Candidate' },
    { key: 'employer', label: 'Employer' },
  ];

  return (
    <div
      role="tablist"
      aria-label="Account type"
      className={cn('mb-6 flex rounded-lg bg-[var(--bg-tertiary)] p-1', className)}
    >
      {tabs.map(({ key, label }) => {
        const isActive = key === active;
        const baseClass = cn(
          'flex-1 rounded-md py-2 text-center text-sm font-medium transition-all',
          isActive
            ? 'bg-white text-[var(--text)] shadow-sm'
            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
        );
        if (isActive) {
          // Same-page tab is a no-op: rendered as a disabled <button> so it
          // still announces correctly to screen readers as the selected tab
          // but the user can't trigger a self-navigation loop.
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected
              aria-current="page"
              disabled
              tabIndex={-1}
              className={cn(baseClass, 'cursor-default')}
            >
              {label}
            </button>
          );
        }
        return (
          <Link
            key={key}
            href={HREF[mode][key]}
            role="tab"
            aria-selected={false}
            className={baseClass}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
