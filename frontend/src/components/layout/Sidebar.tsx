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
  CalendarClock,
  Webhook,
  Workflow,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSocket } from '@/hooks/use-socket';
import { useAuth } from '@/hooks/use-auth';
import { useUIStore } from '@/store/ui.store';
import Logo from '@/components/common/Logo';
import DialogShell from '@/components/ui/DialogShell';
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
  { label: 'Scheduled', href: '/whatsapp/scheduled', icon: CalendarClock },
  { label: 'Analytics', href: '/whatsapp/analytics', icon: BarChart3 },
  { label: 'Audit trail', href: '/whatsapp/audit', icon: FileClock },
  { label: 'Flows', href: '/whatsapp/flows', icon: Workflow },
  { label: 'Webhooks', href: '/whatsapp/webhooks', icon: Webhook },
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
    // Trailing-debounced.
    //
    // The badge is a SUM over every non-archived conversation, which no index can
    // answer, and this fired on EVERY wa:message — including every outbound message
    // a campaign sends. A campaign at 15/s meant 15 full-table aggregates per second
    // per open browser tab, against the same pool the campaign worker was already
    // saturating.
    let bumpTimer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (bumpTimer) clearTimeout(bumpTimer);
      bumpTimer = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ['wa-inbox-unread-total'] });
      }, 5000);
    };
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
    // min-h-0 is load-bearing. A flex item defaults to min-height:auto, so it
    // refuses to shrink below its content and overflow-y-auto never engages —
    // the nav would push the footer off the rail instead of scrolling. Scrolling
    // here rather than on <aside> keeps the logo and the Online/Lock controls
    // pinned while a long nav scrolls between them.
    <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-3" aria-label="Main">
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
        onClick={() => {
          // Purge anything the service worker cached before dropping the session.
          // Lock used to leave Cache Storage untouched, so message bodies and
          // customer media stayed readable on the machine after locking.
          try {
            navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_CACHES' });
          } catch {
            // An unregistered or unsupported SW is not an error.
          }
          void logout();
        }}
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
      {/* sticky + h-dvh, not a bare flex child. As a stretch item of the
          min-h-dvh row in DashboardLayout, the rail inherited the PAGE height:
          on a long page it grew with the content, so its footer sat at the very
          bottom of the document and the logo and tabs scrolled out of view.
          A definite height also opts it out of align-items: stretch, which is
          what makes top-0 mean anything here. */}
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-[var(--border)] bg-white lg:flex">
        <div className="flex h-14 items-center border-b border-[var(--border)] px-4">
          <Logo size="sm" />
        </div>
        <NavList />
        <SidebarFooter />
      </aside>

      {/* Mobile drawer.

          DialogShell, not a hand-rolled backdrop + aside. The drawer announced
          itself as a dialog but behaved like ordinary page content: Tab walked
          straight out of the nav into the page underneath, Escape did nothing,
          the page scrolled behind it and focus was never returned to the
          hamburger on close. The shell owns role/aria-modal, the Tab trap, the
          scroll lock, click-away and focus restore; its own wrapper is
          display:contents, so the panel below is a direct flex child of the
          backdrop and stays left-anchored. */}
      {sidebarOpen && (
        <DialogShell
          onClose={() => setSidebarOpen(false)}
          label="Menu"
          className="fixed inset-0 z-50 flex bg-black/40 lg:hidden"
        >
          <aside className="flex h-full w-64 flex-col bg-white shadow-xl">
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
        </DialogShell>
      )}
    </>
  );
}
