'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import DashboardHeader from './DashboardHeader';
import MobileSidebar from './MobileSidebar';
import Sidebar from './Sidebar';
import EmployerPlanGuard from '@/components/billing/EmployerPlanGuard';
import { useAuth } from '@/hooks/use-auth';
import { useSessionTimeout } from '@/hooks/use-session-timeout';
import { usePermissions } from '@/hooks/use-permissions';
import Spinner from '@/components/ui/Spinner';
import AdminMfaRequired from '@/components/auth/AdminMfaRequired';
import SuperAdminMfaSetup from '@/components/auth/SuperAdminMfaSetup';
import PermissionDenied from '@/components/admin/PermissionDenied';
import { ROUTES } from '@/constants/routes';

interface DashboardLayoutProps {
  children: React.ReactNode;
  requiredRole?: string[];
  /**
   * Admin PBAC key required to open this page. Super-admins always pass;
   * an ADMIN without the permission gets an explanatory screen rather than
   * a silent redirect (a bounce to `/` reads as a broken link).
   *
   * Pair this with `requiredRole={['ADMIN', 'SUPER_ADMIN']}` on pages that
   * used to be super-admin-only — that combination is what lets a granted
   * admin open the very page a super-admin uses, instead of maintaining a
   * duplicate under `/admin`.
   *
   * Client-side only. The API re-checks every request, so this controls
   * what is RENDERED, never what is reachable.
   */
  requiredPermission?: string;
  /** Pass when any ONE of several permissions is sufficient. */
  requiredAnyPermission?: string[];
}

export default function DashboardLayout({
  children,
  requiredRole,
  requiredPermission,
  requiredAnyPermission,
}: DashboardLayoutProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { can, canAny, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const router = useRouter();
  const pathname = usePathname();

  useSessionTimeout();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Pick the role-specific login surface based on which dashboard the
      // user is trying to reach. Admin/super-admin go to the portal; the
      // public roles each have their own dedicated login page; anything
      // else (e.g. /billing/*) falls back to the chooser at /auth/login.
      const isAdminPath = pathname.startsWith('/admin') || pathname.startsWith('/super-admin');
      const loginUrl = isAdminPath
        ? ROUTES.PORTAL.LOGIN
        : pathname.startsWith('/employer')
          ? ROUTES.AUTH.LOGIN_EMPLOYER
          : pathname.startsWith('/candidate')
            ? ROUTES.AUTH.LOGIN_CANDIDATE
            : ROUTES.AUTH.LOGIN;
      router.push(`${loginUrl}?redirect=${encodeURIComponent(window.location.pathname)}`);
    }
  }, [isLoading, isAuthenticated, router, pathname]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && requiredRole && user?.role) {
      if (!requiredRole.includes(user.role)) {
        router.push('/');
      }
    }
  }, [isLoading, isAuthenticated, requiredRole, user, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  const isAdminRoute = requiredRole?.some((r) => r === 'ADMIN' || r === 'SUPER_ADMIN');
  if (isAdminRoute && !user.mfaEnabled) {
    if (user.role === 'ADMIN') return <AdminMfaRequired />;
    if (user.role === 'SUPER_ADMIN') return <SuperAdminMfaSetup />;
  }

  // ── Permission gate ──
  // Evaluated after MFA (an admin without MFA should be told to set it up,
  // not told they lack permission) and only for non-super-admins.
  if ((requiredPermission || requiredAnyPermission?.length) && !isSuperAdmin) {
    if (permissionsLoading) {
      return (
        <div className="flex h-screen items-center justify-center">
          <Spinner size="lg" />
        </div>
      );
    }
    const allowed =
      (!requiredPermission || can(requiredPermission)) &&
      (!requiredAnyPermission?.length || canAny(...requiredAnyPermission));
    if (!allowed) {
      return <PermissionDenied permissionKey={requiredPermission ?? requiredAnyPermission?.[0]} />;
    }
  }

  // Per payment.md: "employer shouldn't get access to dashboard or any
  // employer page until he purchase a plan". EmployerPlanGuard fires only
  // for EMPLOYER role pages and short-circuits to /pricing when the user
  // has no active entitlement. New employers are auto-granted EMP_FREE on
  // signup so this only triggers after expiry / revoke.
  const needsEmployerGuard = requiredRole?.length === 1 && requiredRole[0] === 'EMPLOYER';

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
          {needsEmployerGuard ? <EmployerPlanGuard>{children}</EmployerPlanGuard> : children}
        </main>
      </div>
    </div>
  );
}
