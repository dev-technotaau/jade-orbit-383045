'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { X, LogOut } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useUIStore } from '@/store/ui.store';
import { ROLE_DASHBOARDS } from '@/constants/routes';
import { ROLE_LABELS } from '@/constants/enums';
import { QUERY_KEYS } from '@/constants/config';
import { employerService } from '@/services/employer.service';
import { useEntitlements } from '@/hooks/use-entitlements';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import Tooltip from '@/components/ui/Tooltip';
import Logo from '@/components/common/Logo';
import { usePermissions } from '@/hooks/use-permissions';
import {
  getNavStructure,
  filterStructureByFeature,
  buildNavFilter,
  SidebarNavTree,
} from './Sidebar';
import type { Role } from '@/types/auth';

const ROLE_BADGE_VARIANT: Record<string, 'info' | 'success' | 'warning' | 'error'> = {
  CANDIDATE: 'info',
  EMPLOYER: 'success',
  ADMIN: 'warning',
  SUPER_ADMIN: 'error',
};

// Share the same sessionStorage key as the desktop Sidebar so the
// position persists when the user resizes between mobile/desktop
// breakpoints (or rotates a tablet) inside the same session.
const SIDEBAR_SCROLL_KEY = 'ha:sidebar-scroll';

export default function MobileSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  const navRef = useRef<HTMLElement>(null);

  const { data: companyData } = useQuery({
    queryKey: QUERY_KEYS.EMPLOYERS.COMPANY,
    queryFn: () => employerService.getCompany(),
    enabled: user?.role === 'EMPLOYER',
    staleTime: 10 * 60 * 1000,
  });
  const companyLogo = companyData?.data?.logo;

  const dashboardPath = user?.role ? ROLE_DASHBOARDS[user.role as Role] : '/';
  const { hasFeature, isLoading: entitlementsLoading } = useEntitlements();
  const { can, canAny, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  // Same predicate as the desktop sidebar so the two can never disagree
  // about what a given admin is allowed to see.
  const structure = filterStructureByFeature(
    getNavStructure(user?.role),
    buildNavFilter({
      hasFeature,
      entitlementsLoading,
      can,
      canAny,
      isSuperAdmin,
      permissionsLoading,
    }),
  );

  // Close on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname, setSidebarOpen]);

  // Restore the saved scroll position whenever the drawer opens (the
  // <nav> element only exists in the DOM while the drawer is open).
  // RAF defer so the items list has its final height before we clamp.
  useEffect(() => {
    if (!sidebarOpen) return;
    const nav = navRef.current;
    if (!nav || typeof window === 'undefined') return;
    const saved = window.sessionStorage.getItem(SIDEBAR_SCROLL_KEY);
    if (saved === null) return;
    const top = Number(saved);
    if (!Number.isFinite(top)) return;
    const id = window.requestAnimationFrame(() => {
      if (nav.isConnected) nav.scrollTop = top;
    });
    return () => window.cancelAnimationFrame(id);
  }, [sidebarOpen]);

  // Close on Escape
  useEffect(() => {
    if (!sidebarOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [sidebarOpen, setSidebarOpen]);

  // Body scroll lock
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [sidebarOpen]);

  return (
    <div
      className={cn(
        'fixed inset-0 z-[60] lg:hidden',
        sidebarOpen ? 'pointer-events-auto' : 'pointer-events-none',
      )}
    >
      {/* Backdrop */}
      <div
        className={cn(
          'absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300',
          sidebarOpen ? 'opacity-100' : 'opacity-0',
        )}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        className={cn(
          'absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl transition-transform duration-300 ease-in-out',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
      >
        {/* Header */}
        <div className="flex h-20 items-center justify-between border-b border-[var(--border)] px-4">
          <Logo size="sm" href={dashboardPath} />
          <Tooltip content="Close sidebar">
            <button
              onClick={() => setSidebarOpen(false)}
              className="rounded-lg p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          </Tooltip>
        </div>

        {/* User info */}
        {user && (
          <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
            {companyLogo && (
              <img
                src={companyLogo}
                alt="Company"
                className="h-8 w-8 rounded-md border border-[var(--border)] object-contain"
              />
            )}
            <Avatar
              src={user.avatar}
              firstName={user.firstName}
              lastName={user.lastName}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--text)]">
                {user.firstName} {user.lastName}
              </p>
              <Badge variant={ROLE_BADGE_VARIANT[user.role] || 'info'} size="sm">
                {ROLE_LABELS[user.role] || user.role}
              </Badge>
            </div>
          </div>
        )}

        {/* Nav items */}
        <nav
          ref={navRef}
          data-lenis-prevent
          onScroll={(e) => {
            if (typeof window === 'undefined') return;
            window.sessionStorage.setItem(
              SIDEBAR_SCROLL_KEY,
              String((e.currentTarget as HTMLElement).scrollTop),
            );
          }}
          className="flex-1 overflow-y-auto overscroll-contain px-3 py-4"
        >
          <SidebarNavTree
            structure={structure}
            pathname={pathname}
            collapsed={false}
            role={user?.role}
            onNavigate={() => setSidebarOpen(false)}
          />
        </nav>

        {/* Footer */}
        <div className="border-t border-[var(--border)] p-3">
          <Tooltip content="Sign out of your account">
            <button
              onClick={() => {
                setSidebarOpen(false);
                logout();
              }}
              className="text-error hover:bg-error-light flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
            >
              <LogOut className="h-5 w-5" />
              Logout
            </button>
          </Tooltip>
        </div>
      </aside>
    </div>
  );
}
