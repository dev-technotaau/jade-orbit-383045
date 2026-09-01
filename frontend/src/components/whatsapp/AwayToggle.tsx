'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { showToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/api';
import BrandIcon from '@/components/common/BrandIcon';
import { whatsappService as svc } from '@/services/whatsapp.service';

/**
 * Quick Online/Away status toggle for the inbox. "Away" forces the away
 * auto-reply on inbound messages regardless of business hours (the agent has
 * stepped out); "Online" reverts to the automatic business-hours behavior.
 * Backed by the singleton WhatsApp settings (shares the `wa-settings` query so
 * the Settings page stays in sync). The away message must be configured + auto-
 * reply enabled in Settings for it to actually send.
 */
export default function AwayToggle() {
  const qc = useQueryClient();
  // The host platform gated this on WA_SETTINGS_VIEW / WA_SETTINGS_EDIT. There
  // is one operator behind one app password here, so there is nothing to gate:
  // reaching this component at all means the settings endpoints are reachable.
  const { data } = useQuery({
    queryKey: ['wa-settings'],
    queryFn: () => svc.getSettings(),
  });
  const settings = data?.data ?? null;
  const away = settings?.awayMode ?? false;

  const mut = useMutation({
    mutationFn: (next: boolean) => svc.updateSettings({ awayMode: next }),
    onSuccess: (_r, next) => {
      qc.invalidateQueries({ queryKey: ['wa-settings'] });
      // Away ALONE does nothing.
      //
      // The engine needs autoReplyEnabled AND a configured awayMessage before a
      // single customer sees anything. Confirming "Status set to Away" while either
      // was unset told the operator the customer-facing behaviour had changed when
      // nothing had — the worst kind of success message.
      // Read the FRESH server object, not the render closure, so a settings change
      // made in another tab is reflected.
      const fresh = _r?.data ?? settings;
      if (next && (!fresh?.autoReplyEnabled || !fresh?.awayMessage?.trim())) {
        showToast.warning(
          'Away is set, but no away auto-reply will be sent - automatic replies are off, or no away message is configured. Set both in Settings.',
        );
      } else {
        showToast.success(next ? 'Status set to Away' : 'Status set to Online');
      }
    },
    onError: (e) => showToast.error(errorMessage(e, 'Failed to update status')),
  });

  if (!settings) return null;

  // A one-off toast is not a state. The misconfiguration persists across reloads,
  // and it can also be created from the OTHER side — turning automatic replies off
  // in Settings while Away is on — where no toast fires at all. Render it.
  const misconfigured = away && (!settings.autoReplyEnabled || !settings.awayMessage?.trim());

  return (
    <button
      type="button"
      role="switch"
      aria-checked={!away}
      onClick={() => mut.mutate(!away)}
      disabled={mut.isPending}
      aria-label={
        misconfigured
          ? 'WhatsApp status: Away, but no away auto-reply will send — automatic replies are off or no away message is set. Tap to go Online.'
          : away
            ? 'WhatsApp status: Away — tap to go Online'
            : 'WhatsApp status: Online — tap to set Away'
      }
      title={
        misconfigured
          ? 'WhatsApp — Away is set, but nothing will be sent: turn on automatic replies and set an away message in Settings.'
          : away
            ? 'WhatsApp — Away: away auto-reply is forced on inbound. Tap to go Online.'
            : 'WhatsApp — Online: normal business-hours behavior. Tap to set Away.'
      }
      className={cn(
        'inline-flex shrink-0 items-center gap-2 rounded-full border py-1 pr-1 pl-2 text-xs font-semibold transition-colors disabled:opacity-60',
        misconfigured
          ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
          : away
            ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
            : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
      )}
    >
      {/* WhatsApp brand mark — identifies which channel this status controls. */}
      <BrandIcon name="whatsapp" brandColor className="h-4 w-4 shrink-0" title="WhatsApp" />
      {misconfigured && <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      <span className="hidden sm:inline">{away ? 'Away' : 'Online'}</span>
      {/* Sliding-knob track — makes it read as an interactive switch, not a
          status chip. Knob right + green = Online; knob left + amber = Away. */}
      <span
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
          away ? 'bg-amber-400' : 'bg-emerald-500',
        )}
      >
        <span
          className={cn(
            'inline-flex h-4 w-4 items-center justify-center rounded-full bg-white shadow-sm transition-transform',
            away ? 'translate-x-0.5' : 'translate-x-[18px]',
          )}
        >
          {mut.isPending && <Loader2 className="h-3 w-3 animate-spin text-[var(--text-muted)]" />}
        </span>
      </span>
    </button>
  );
}
