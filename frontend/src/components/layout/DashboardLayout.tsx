'use client';

import type { ReactNode } from 'react';
import Sidebar from './Sidebar';

interface DashboardLayoutProps {
  children: ReactNode;
  /**
   * Accepted and ignored.
   *
   * The host application gated pages here on role, MFA enrolment, PBAC keys and
   * an employer plan guard. None of those exist: a single app password gates
   * everything and it is enforced server-side by `requireAppPassword`. A
   * client-side check would be decoration, not security.
   *
   * Kept so the existing call sites still compile.
   *
   * @deprecated no longer has any effect
   */
  requiredRole?: string[];
}

/**
 * Chrome for the operator UI.
 *
 * There is no header. DashboardHeader (632 lines) and MobileSidebar were removed
 * and the parts worth keeping — logo, Online/Away toggle, lock — moved into the
 * sidebar, which now also owns the mobile drawer and its trigger.
 *
 * Deliberately does NOT gate. If the password is wrong or absent every API call
 * returns 401 and the pages surface it; there is no client session to check.
 */
export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="flex min-h-screen bg-[var(--bg-secondary)]">
      <Sidebar />
      {/* pt-14 on mobile clears the fixed hamburger the sidebar renders.
          Extra bottom padding keeps the last row — pagination especially —
          clear of the fixed BackToTop button. */}
      <main className="flex min-w-0 flex-1 flex-col overflow-x-hidden p-4 pt-16 pb-20 sm:p-6 sm:pb-20 lg:p-8 lg:pt-8 lg:pb-20">
        {children}
      </main>
    </div>
  );
}
