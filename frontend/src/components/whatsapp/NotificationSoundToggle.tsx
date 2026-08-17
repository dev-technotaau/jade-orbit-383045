'use client';

import { useSyncExternalStore } from 'react';
import { Volume2, VolumeX, Play, Bell, BellOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import Tooltip from '@/components/ui/Tooltip';
import {
  isInboxSoundEnabled,
  setInboxSoundEnabled,
  subscribeInboxSound,
  playTestBeep,
  getNotificationPermission,
  requestNotificationPermission,
  subscribeNotificationPermission,
  showBrowserNotification,
  type NotificationPermissionState,
} from './wa-notify';

/**
 * WhatsApp Settings "Notifications" section: the inbox new-message sound and the
 * browser desktop-notification permission.
 *
 * The sound preference is a per-device setting stored in localStorage (a
 * notification sound is inherently per-listener/per-browser), defaulting to ON.
 * The inbox reads it via `playBeep()` in wa-notify.ts. Read here through
 * useSyncExternalStore so the server snapshot (default ON) matches SSR —
 * avoiding a hydration mismatch — and the live value updates without a
 * setState-in-effect.
 *
 * The permission prompt is deliberately behind this button: it used to fire
 * automatically when the inbox mounted, and Chrome auto-denies a gesture-less
 * prompt, which permanently disabled notifications with nothing in the UI to
 * re-ask or even show that they were off.
 */
export default function NotificationSoundToggle() {
  const enabled = useSyncExternalStore(
    subscribeInboxSound,
    () => isInboxSoundEnabled(),
    () => true,
  );
  const permission = useSyncExternalStore(
    subscribeNotificationPermission,
    () => getNotificationPermission(),
    () => 'default' as NotificationPermissionState,
  );

  const toggle = () => {
    const next = !enabled;
    setInboxSoundEnabled(next); // persists + notifies subscribers → re-render
    if (next) playTestBeep(); // quick confirmation beep when turning it on
  };

  const enableNotifications = async () => {
    const next = await requestNotificationPermission();
    if (next === 'granted') {
      showBrowserNotification(
        'WhatsApp notifications are on',
        'New customer messages will show up here.',
      );
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-[var(--text)]">Notifications</h2>
      <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-white p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className={cn('mt-0.5', enabled ? 'text-emerald-600' : 'text-[var(--text-muted)]')}>
            {enabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--text)]">New-message sound</p>
            <p className="text-xs text-[var(--text-muted)]">
              Play a short beep when a new WhatsApp message arrives while you’re not viewing that
              conversation. Saved on this device.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Tooltip content="Play a test sound">
            <button
              type="button"
              onClick={() => playTestBeep()}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
            >
              <Play className="h-3.5 w-3.5" /> Test
            </button>
          </Tooltip>
          <button
            type="button"
            onClick={toggle}
            role="switch"
            aria-checked={enabled}
            aria-label="Toggle new-message sound"
            className={cn(
              'relative inline-flex h-6 w-11 items-center rounded-full transition',
              enabled ? 'bg-emerald-600' : 'bg-gray-300',
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white shadow transition',
                enabled ? 'translate-x-6' : 'translate-x-1',
              )}
            />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-white p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              'mt-0.5',
              permission === 'granted' ? 'text-emerald-600' : 'text-[var(--text-muted)]',
            )}
          >
            {permission === 'granted' ? (
              <Bell className="h-5 w-5" />
            ) : (
              <BellOff className="h-5 w-5" />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--text)]">Desktop notifications</p>
            <p className="text-xs text-[var(--text-muted)]">
              {permission === 'unsupported'
                ? 'This browser does not support desktop notifications.'
                : permission === 'denied'
                  ? 'Blocked for this site. Allow notifications in your browser’s site settings, then reload.'
                  : 'Show an alert for a new message on any WhatsApp page. Click it to open that conversation. Granted per browser.'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {permission === 'granted' ? (
            <>
              <Tooltip content="Show a test notification">
                <button
                  type="button"
                  onClick={() =>
                    showBrowserNotification(
                      'WhatsApp inbox',
                      'This is what a new-message notification looks like.',
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                >
                  <Play className="h-3.5 w-3.5" /> Test
                </button>
              </Tooltip>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                Enabled
              </span>
            </>
          ) : permission === 'default' ? (
            <button
              type="button"
              onClick={() => void enableNotifications()}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
            >
              <Bell className="h-3.5 w-3.5" /> Enable
            </button>
          ) : (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              {permission === 'denied' ? 'Blocked' : 'Unavailable'}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
