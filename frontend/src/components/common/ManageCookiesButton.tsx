'use client';

import { openCookieSettings } from '@/components/common/CookieConsent';
import Tooltip from '@/components/ui/Tooltip';

export default function ManageCookiesButton() {
  return (
    <Tooltip content="Open cookie preferences">
      <button
        type="button"
        onClick={openCookieSettings}
        className="hover:text-primary text-left text-sm text-[var(--text-secondary)] transition-colors"
      >
        Manage Cookies
      </button>
    </Tooltip>
  );
}
