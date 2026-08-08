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
  ToggleLeft,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSocket } from '@/hooks/use-socket';
import { whatsappService } from '@/services/whatsapp.service';

/**
 * Operator sidebar.
 *
 * The host application's sidebar was 1,731 lines: nav trees per role
 * (candidate / employer / admin / super-admin), PBAC permission gating on every
 * item, feature-flag filtering, pinning, collapsible groups, billing sub-navs and
 * notification-category badges. This module has one role, one section and seven
 * pages, so the whole structure collapses to a flat list.
 *
 * `getNavStructure`, `buildNavFilter` and `filterStructureByFeature` are kept as
 * exports because KeyboardShortcuts.tsx (the Ctrl+K palette) imports them. They
 * now return the flat list and pass everything through — the palette keeps
 * working without needing to know any of this changed.
 */

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Renders the live unread-conversation count next to the label. */
  whatsappUnread?: boolean;
}

export interface NavGroup {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

export interface NavStructure {
  top: NavItem[];
  groups: NavGroup[];
}

const NAV: NavItem[] = [
  { label: 'Inbox', href: '/whatsapp', icon: MessageCircle, whatsappUnread: true },
  { label: 'Templates', href: '/whatsapp/templates', icon: FileText },
  { label: 'Contacts', href: '/whatsapp/contacts', icon: Users },
  { label: 'Campaigns', href: '/whatsapp/campaigns', icon: Send },
  { label: 'Analytics', href: '/whatsapp/analytics', icon: BarChart3 },
  { label: 'Settings', href: '/whatsapp/settings', icon: Settings },
  { label: 'Feature Flags', href: '/feature-flags', icon: ToggleLeft },
];

/* ── Compatibility exports for the Ctrl+K palette ─────────────── */

/** One structure regardless of argument — there are no roles left. */
export function getNavStructure(_role?: string | undefined): NavStructure {
  return { top: NAV, groups: [] };
}

/** No permissions or feature flags to filter on: allow everything. */
export function buildNavFilter(_opts?: unknown): (item: NavItem) => boolean {
  return () => true;
}

/** Pass-through. Kept so the palette's call site is untouched. */
export function filterStructureByFeature(structure: NavStructure): NavStructure {
  return structure;
}

export function flattenNav(structure: NavStructure): NavItem[] {
  return [...structure.top, ...structure.groups.flatMap((g) => g.items)];
}

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

  // Push beats polling: an inbound message invalidates immediately so the count
  // is live rather than up-to-60s stale.
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

/* ── Sidebar ───────────────────────────────────────────────────── */

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 border-r border-[var(--border)] bg-white lg:block">
      <nav className="flex flex-col gap-0.5 p-3" aria-label="Main">
        {NAV.map((item) => {
          const Icon = item.icon;
          // Exact match for the inbox so it does not stay highlighted on every
          // /whatsapp/* child route.
          const active =
            item.href === '/whatsapp' ? pathname === item.href : pathname?.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary-light text-primary'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{item.label}</span>
              {item.whatsappUnread && <WhatsappUnreadBadge />}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
