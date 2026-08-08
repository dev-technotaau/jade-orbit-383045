'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { showToast } from '@/components/ui/Toast';
import BrandIcon from '@/components/common/BrandIcon';
import { usePermissions } from '@/hooks/use-permissions';
import { PERM } from '@/constants/permissions';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { ApiError } from '@/types/api';

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
  // Permission-gated, not role-gated: this control is mounted globally in
  // DashboardHeader and self-gates, so a role check meant a granted admin
  // running the WhatsApp inbox could not see or change the away status even
  // though the endpoints behind it accept them.
  const { can } = usePermissions();
  const canView = can(PERM.WA_SETTINGS_VIEW);
  const canEdit = can(PERM.WA_SETTINGS_EDIT);
  const { data } = useQuery({
    queryKey: ['wa-settings'],
    queryFn: () => svc.getSettings(),
    enabled: canView,
  });
  const settings = data?.data ?? null;
  const away = settings?.awayMode ?? false;

  const mut = useMutation({
    mutationFn: (next: boolean) => svc.updateSettings({ awayMode: next }),
    onSuccess: (_r, next) => {
      qc.invalidateQueries({ queryKey: ['wa-settings'] });
      showToast.success(next ? 'Status set to Away' : 'Status set to Online');
    },
    onError: (e) =>
      showToast.error((e as unknown as ApiError).message || 'Failed to update status'),
  });

  if (!canView || !settings) return null;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={!away}
      onClick={() => mut.mutate(!away)}
      disabled={mut.isPending || !canEdit}
      aria-label={
        away
          ? 'WhatsApp status: Away — tap to go Online'
          : 'WhatsApp status: Online — tap to set Away'
      }
      title={
        away
          ? 'WhatsApp — Away: away auto-reply is forced on inbound. Tap to go Online.'
          : 'WhatsApp — Online: normal business-hours behavior. Tap to set Away.'
      }
      className={cn(
        'inline-flex shrink-0 items-center gap-2 rounded-full border py-1 pr-1 pl-2 text-xs font-semibold transition-colors disabled:opacity-60',
        away
          ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
          : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
      )}
    >
      {/* WhatsApp brand mark — identifies which channel this status controls. */}
      <BrandIcon name="whatsapp" brandColor className="h-4 w-4 shrink-0" title="WhatsApp" />
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
