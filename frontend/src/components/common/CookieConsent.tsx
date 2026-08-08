'use client';

import { useState, useEffect, useCallback } from 'react';
import Cookies from 'js-cookie';
import { Cookie } from 'lucide-react';
import Button from '@/components/ui/Button';
import Switch from '@/components/ui/Switch';
import Tooltip from '@/components/ui/Tooltip';

export const CONSENT_COOKIE = 'ha_cookie_consent';
const OPEN_EVENT = 'ha:open-cookie-settings';

/**
 * Fired whenever this banner shows or hides, with `detail.visible`. Consumed
 * by other bottom-anchored widgets so they can yield the bottom edge.
 */
export const CONSENT_VISIBILITY_EVENT = 'ha:cookie-consent-visibility';

interface CookiePreferences {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
}

/** Dispatch this to re-open the cookie preferences panel from anywhere. */
export function openCookieSettings() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [prefs, setPrefs] = useState<CookiePreferences>({
    necessary: true,
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    const consent = Cookies.get(CONSENT_COOKIE);
    if (!consent) {
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  /* Broadcast open/closed state. This banner is `fixed inset-x-0 bottom-0` at
     z-100, so it covers the full width of the bottom edge — anything else
     anchored there (the WhatsApp channel CTA) has to stand down while it is
     up. Emitting the state keeps that coordination in one place instead of
     having other widgets re-derive it from the cookie. */
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(CONSENT_VISIBILITY_EVENT, { detail: { visible } }));
  }, [visible]);

  // Listen for re-open requests (e.g. from Footer "Manage Cookies" button)
  useEffect(() => {
    const handleOpen = () => {
      const raw = Cookies.get(CONSENT_COOKIE);
      if (raw) {
        try {
          const saved = JSON.parse(raw) as CookiePreferences;
          setPrefs({ necessary: true, analytics: !!saved.analytics, marketing: !!saved.marketing });
        } catch {
          /* use defaults */
        }
      }
      setShowDetails(true);
      setDismissing(false);
      setVisible(true);
    };
    window.addEventListener(OPEN_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_EVENT, handleOpen);
  }, []);

  const dismiss = useCallback((preferences: CookiePreferences) => {
    const prev = Cookies.get(CONSENT_COOKIE);
    Cookies.set(CONSENT_COOKIE, JSON.stringify(preferences), { expires: 365 });
    setDismissing(true);
    setTimeout(() => {
      setVisible(false);
      // Reload if preferences changed so analytics scripts respect the new choice
      if (prev && prev !== JSON.stringify(preferences)) {
        window.location.reload();
      }
    }, 300);
  }, []);

  const acceptAll = () => {
    dismiss({ necessary: true, analytics: true, marketing: true });
  };

  const acceptSelected = () => {
    dismiss(prefs);
  };

  const rejectAll = () => {
    dismiss({ necessary: true, analytics: false, marketing: false });
  };

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-[100] p-4 transition-all duration-300 sm:p-6 ${
        dismissing ? 'translate-y-full opacity-0' : 'translate-y-0 opacity-100'
      }`}
    >
      <div className="mx-auto max-w-2xl rounded-2xl border border-[var(--border)] bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <div className="bg-primary-light flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
            <Cookie className="text-primary h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-[var(--text)]">We value your privacy</h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              We use cookies to enhance your browsing experience, serve personalized content, and
              analyze our traffic. By clicking &quot;Accept All&quot;, you consent to our use of
              cookies.
            </p>

            {showDetails && (
              <div className="mt-4 space-y-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[var(--text)]">Essential Cookies</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Required for the platform to function
                    </p>
                  </div>
                  <Switch checked disabled onChange={() => {}} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[var(--text)]">Analytics Cookies</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Help us understand how visitors use the site
                    </p>
                  </div>
                  <Switch
                    checked={prefs.analytics}
                    onChange={() => setPrefs((p) => ({ ...p, analytics: !p.analytics }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[var(--text)]">Marketing Cookies</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Used to deliver relevant advertisements
                    </p>
                  </div>
                  <Switch
                    checked={prefs.marketing}
                    onChange={() => setPrefs((p) => ({ ...p, marketing: !p.marketing }))}
                  />
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button size="sm" onClick={acceptAll} tooltip="Accept all cookie categories">
                Accept All
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={rejectAll}
                tooltip="Reject all optional cookies"
              >
                Reject All
              </Button>
              {showDetails ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={acceptSelected}
                  tooltip="Save your cookie preferences"
                >
                  Save Preferences
                </Button>
              ) : (
                <Tooltip content="Customize cookie preferences">
                  <button
                    onClick={() => setShowDetails(true)}
                    className="text-primary text-sm hover:underline"
                  >
                    Customize
                  </button>
                </Tooltip>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
