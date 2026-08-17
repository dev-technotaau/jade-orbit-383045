import type { ReactNode } from 'react';
import WaNotificationsProvider from '@/components/whatsapp/WaNotificationsProvider';

/**
 * Lenis (the global smooth-scroll provider in components/common/SmoothScroll.tsx)
 * intercepts wheel/trackpad events and applies them to the page scroll. That
 * broke every nested overflow panel in the WhatsApp UI — the inbox conversation
 * list, the message thread, the conversation-details panel, the composer-tool
 * dropdowns, and the data tables on the campaign/contact/template/settings pages
 * — so they only scrolled when dragging the scrollbar thumb, never with the
 * wheel or trackpad.
 *
 * Lenis ignores any wheel event whose composed path contains an element with
 * `data-lenis-prevent`, so this single layout-neutral wrapper restores native
 * scrolling for ALL current and future WhatsApp inner containers — scoped to
 * the WhatsApp section only (other dashboards keep Lenis untouched).
 * `display: contents` (Tailwind `contents`) keeps the wrapper from affecting
 * layout. Portaled shared Modals already carry their own `data-lenis-prevent`.
 *
 * It also mounts WaNotificationsProvider, which is the module-wide inbound
 * alerting listener: it belongs here rather than on the inbox page so an
 * operator working on campaigns/contacts/settings still hears about a new
 * customer message.
 */
export default function WhatsappSectionLayout({ children }: { children: ReactNode }) {
  return (
    <div className="contents" data-lenis-prevent>
      <WaNotificationsProvider />
      {children}
    </div>
  );
}
