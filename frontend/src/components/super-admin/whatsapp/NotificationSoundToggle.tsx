'use client';

import { useSyncExternalStore } from 'react';
import { Volume2, VolumeX, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import Tooltip from '@/components/ui/Tooltip';
import {
  isInboxSoundEnabled,
  setInboxSoundEnabled,
  subscribeInboxSound,
  playTestBeep,
} from './wa-notify';

/**
 * WhatsApp Settings toggle for the inbox new-message sound. The preference is a
 * per-device setting stored in localStorage (a notification sound is inherently
 * per-listener/per-browser), defaulting to ON. The inbox reads it via
 * `playBeep()` in wa-notify.ts. Read here through useSyncExternalStore so the
 * server snapshot (default ON) matches SSR — avoiding a hydration mismatch — and
 * the live value updates without a setState-in-effect.
 */
export default function NotificationSoundToggle() {
  const enabled = useSyncExternalStore(
    subscribeInboxSound,
    () => isInboxSoundEnabled(),
    () => true,
  );

  const toggle = () => {
    const next = !enabled;
    setInboxSoundEnabled(next); // persists + notifies subscribers → re-render
    if (next) playTestBeep(); // quick confirmation beep when turning it on
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
    </section>
  );
}
