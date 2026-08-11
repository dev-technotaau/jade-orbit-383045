'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MessageCircle,
  FileText,
  Users,
  Send,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  FileClock,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSocket } from '@/hooks/use-socket';
import { useAuth } from '@/hooks/use-auth';
import { useUIStore } from '@/store/ui.store';
import Logo from '@/components/common/Logo';
import AwayToggle from '@/components/whatsapp/AwayToggle';
import { whatsappService } from '@/services/whatsapp.service';

/**
 * The only chrome.
 *
 * DashboardHeader (632 lines) was removed and everything worth keeping moved
 * here: the logo, the WhatsApp Online/Away toggle and sign-out. The rest of the
 * header was host-application surface — candidate and employer search bars,
 * quota bars, billing alert badges, employer quick actions, the notification
 * bell, role labels and an account dropdown.
 *
 * The header also owned the mobile hamburger, so this now provides its own
 * trigger and drawer rather than relying on a separate MobileSidebar.
 *
 * The Ctrl+K command palette was removed too — with six destinations there was
 * nothing worth searching — so the nav compatibility exports it needed
 * (getNavStructure, buildNavFilter, filterStructureByFeature, flattenNav) and
 * the NavStructure/NavGroup shapes went with it.
 */

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Renders the live unread-conversation count next to the label. */
  whatsappUnread?: boolean;
}

const NAV: NavItem[] = [
  { label: 'Inbox', href: '/whatsapp', icon: MessageCircle, whatsappUnread: true },
  { label: 'Templates', href: '/whatsapp/templates', icon: FileText },
  { label: 'Contacts', href: '/whatsapp/contacts', icon: Users },
  { label: 'Campaigns', href: '/whatsapp/campaigns', icon: Send },
  { label: 'Analytics', href: '/whatsapp/analytics', icon: BarChart3 },
  { label: 'Audit trail', href: '/whatsapp/audit', icon: FileClock },
  { label: 'Security', href: '/whatsapp/security', icon: ShieldCheck },
  { label: 'Settings', href: '/whatsapp/settings', icon: Settings },
];

/* ── Live unread badge ─────────────────────────────────────────── */

function WhatsappUnreadBadge() {
  const { socket } = useSocket();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['wa-inbox-unread-total'],
    queryFn: () => whatsappService.getUnreadTotal(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  // Push beats polling: an inbound message invalidates immediately, so the count
  // is live rather than up to 60s stale.
  useEffect(() => {
    if (!socket) return;
    const bump = () => qc.invalidateQueries({ queryKey: ['wa-inbox-unread-total'] });
    socket.on('wa:message', bump);
    socket.on('wa:read', bump);
    return () => {
      socket.off('wa:message', bump);
      socket.off('wa:read', bump);
    };
  }, [socket, qc]);

  const total = data?.data?.total ?? 0;
  if (!total) return null;

  return (
    <span className="bg-primary ml-auto inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white">
      {total > 99 ? '99+' : total}
    </span>
  );
}

/* ── Nav body, shared by the desktop rail and the mobile drawer ── */

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-0.5 p-3" aria-label="Main">
      {NAV.map((item) => {
        const Icon = item.icon;
        // Exact match for the inbox, so it does not stay highlighted on every
        // /whatsapp/* child route.
        const active =
          item.href === '/whatsapp' ? pathname === item.href : pathname?.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-primary-light text-primary'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.label}</span>
            {item.whatsappUnread && <WhatsappUnreadBadge />}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter() {
  const { logout } = useAuth();

  return (
    <div className="mt-auto space-y-2 border-t border-[var(--border)] p-3">
      {/* Online / Away — forces the away auto-reply regardless of business
          hours. Lived in the header; it belongs with the operator controls. */}
      <AwayToggle />
      <button
        type="button"
        onClick={() => void logout()}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-red-50 hover:text-red-700"
      >
        <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
        Lock
      </button>
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);

  // Close the drawer on navigation — otherwise it stays open over the new page.
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname, setSidebarOpen]);

  return (
    <>
      {/* Mobile trigger. The header used to own the hamburger. */}
      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        aria-label="Open menu"
        className="fixed top-3 left-3 z-40 rounded-lg border border-[var(--border)] bg-white p-2 shadow-sm lg:hidden"
      >
        <Menu className="h-5 w-5 text-[var(--text-secondary)]" />
      </button>

      {/* Desktop rail */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-[var(--border)] bg-white lg:flex">
        <div className="flex h-14 items-center border-b border-[var(--border)] px-4">
          <Logo size="sm" />
        </div>
        <NavList />
        <SidebarFooter />
      </aside>

      {/* Mobile drawer */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-white shadow-xl lg:hidden"
            role="dialog"
            aria-label="Menu"
          >
            <div className="flex h-14 items-center justify-between border-b border-[var(--border)] px-4">
              <Logo size="sm" />
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close menu"
                className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavList onNavigate={() => setSidebarOpen(false)} />
            <SidebarFooter />
          </aside>
        </>
      )}
    </>
  );
}
