'use client';

import type { ReactNode } from 'react';
import Sidebar from './Sidebar';
import AccountAlertBanner from '@/components/whatsapp/AccountAlertBanner';

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
  /**
   * Accepted and ignored, for the same reason as `requiredRole` — the PBAC
   * layer this named is gone and `usePermissions` answers yes to everything.
   * Twelve call sites still pass it; declaring it here beats editing all of
   * them to remove a prop that costs nothing.
   *
   * @deprecated no longer has any effect
   */
  requiredPermission?: string;
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
    <div className="flex min-h-dvh bg-[var(--bg-secondary)]">
      <Sidebar />
      {/* pt-14 on mobile clears the fixed hamburger the sidebar renders.
          Extra bottom padding keeps the last row — pagination especially —
          clear of the fixed BackToTop button. */}
      <main className="flex min-w-0 flex-1 flex-col overflow-x-hidden p-4 pt-16 pb-20 sm:p-6 sm:pb-20 lg:p-8 lg:pt-8 lg:pb-20">
        {/* Meta's policy warnings and restriction notices. Mounted in the shell
            rather than on a page because there is no page an operator is
            guaranteed to open, and these decide whether the number keeps
            working. Renders nothing when there is nothing to say. */}
        <AccountAlertBanner />
        {children}
      </main>
    </div>
  );
}
