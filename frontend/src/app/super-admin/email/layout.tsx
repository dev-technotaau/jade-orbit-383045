import type { ReactNode } from 'react';
import EmailAlertListener from '@/components/super-admin/email/EmailAlertListener';

/**
 * Restores native wheel/trackpad scrolling for the email section's nested
 * overflow panels (inbox list, thread, tables) — the global Lenis smooth-scroll
 * provider ignores any subtree marked `data-lenis-prevent`. `contents` keeps the
 * wrapper layout-neutral. Mirrors the WhatsApp section layout. Also mounts the
 * deliverability-alert toast listener once for the whole email section.
 */
export default function EmailSectionLayout({ children }: { children: ReactNode }) {
  return (
    <div className="contents" data-lenis-prevent>
      <EmailAlertListener />
      {children}
    </div>
  );
}
