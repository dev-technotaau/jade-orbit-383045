'use client';

import type { ReactNode } from 'react';
import DashboardHeader from './DashboardHeader';
import MobileSidebar from './MobileSidebar';
import Sidebar from './Sidebar';

interface DashboardLayoutProps {
  children: ReactNode;
  /**
   * Accepted and ignored.
   *
   * The host application gated pages here on role (`['ADMIN','SUPER_ADMIN']`),
   * MFA enrolment, PBAC permission keys and an employer plan guard. This module
   * has no users, roles or permissions — a single app password gates everything,
   * and it is enforced server-side by `requireAppPassword`. A client-side check
   * would be decoration, not security.
   *
   * The prop is kept so the ~16 existing call sites still compile. Remove them
   * at leisure; passing it changes nothing.
   *
   * @deprecated no longer has any effect
   */
  requiredRole?: string[];
}

/**
 * Chrome for the operator UI: header, sidebar, content well.
 *
 * Deliberately does NOT gate. If the app password is wrong or absent, every API
 * call returns 401 and the pages surface that — there is no session to check on
 * the client and nothing to redirect to.
 */
export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-[var(--bg-secondary)]">
      <DashboardHeader />
      <MobileSidebar />
      <div className="flex flex-1">
        <Sidebar />
        {/* Extra bottom padding (pb-20 at every breakpoint, set after each p-* so
            the responsive shorthand can't override it) keeps the last row of
            content — pagination especially — clear of the fixed BackToTop button
            in the bottom-right corner. */}
        <main className="flex flex-1 flex-col overflow-x-hidden p-4 pb-20 sm:p-6 sm:pb-20 lg:p-8 lg:pb-20">
          {children}
        </main>
      </div>
    </div>
  );
}
