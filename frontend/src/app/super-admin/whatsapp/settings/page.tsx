'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, RefreshCw, Loader2 } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import { showToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { superAdminWhatsappService as svc } from '@/services/super-admin-whatsapp.service';
import WhatsappSettingsForms from '@/components/super-admin/whatsapp/WhatsappSettingsForms';
import NotificationSoundToggle from '@/components/super-admin/whatsapp/NotificationSoundToggle';
import KeywordRulesManager from '@/components/super-admin/whatsapp/KeywordRulesManager';
import FaqManager from '@/components/super-admin/whatsapp/FaqManager';
import SavedRepliesManager from '@/components/super-admin/whatsapp/SavedRepliesManager';
import SuppressionListManager from '@/components/super-admin/whatsapp/SuppressionListManager';
import SavedSegmentsManager from '@/components/super-admin/whatsapp/SavedSegmentsManager';
import type { WaChannel } from '@/types/whatsapp';
import type { ApiError } from '@/types/api';

const QUALITY_COLOR: Record<string, string> = {
  GREEN: 'text-emerald-600',
  YELLOW: 'text-amber-600',
  RED: 'text-red-600',
  UNKNOWN: 'text-gray-500',
};

/**
 * Meta returns either the legacy daily-conversation tier (`TIER_1K`…) for older
 * numbers, or the new per-second throughput level (`STANDARD`/`HIGH`) for numbers
 * on the per-message pricing model. Render whichever is present in human terms.
 */
function formatMessagingTier(tier: string | null): string {
  if (!tier) return '—';
  const map: Record<string, string> = {
    STANDARD: 'Standard · 80 msg/s',
    HIGH: 'High · 1,000 msg/s',
    TIER_50: 'Tier 50 · 50 contacts/day',
    TIER_250: 'Tier 250 · 250 contacts/day',
    TIER_1K: 'Tier 1 · 1K contacts/day',
    TIER_10K: 'Tier 2 · 10K contacts/day',
    TIER_100K: 'Tier 3 · 100K contacts/day',
    TIER_UNLIMITED: 'Unlimited',
  };
  return map[tier] ?? tier;
}

function ChannelCard({ ch }: { ch: WaChannel }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-[var(--text)]">{ch.displayPhone}</span>
        {ch.displayName && (
          <span className="rounded bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
            {ch.displayName}
          </span>
        )}
        {ch.isDefault && (
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
            Default
          </span>
        )}
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold',
            ch.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700',
          )}
        >
          {ch.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-8 gap-y-3">
        <div>
          <p className="text-xs text-[var(--text-muted)]">Messaging tier</p>
          <p className="font-semibold text-[var(--text)]">
            {formatMessagingTier(ch.messagingTier)}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--text-muted)]">Quality rating</p>
          <p className={cn('font-semibold', QUALITY_COLOR[ch.qualityRating])}>{ch.qualityRating}</p>
        </div>
      </div>
    </div>
  );
}

export default function SuperAdminWhatsappSettingsPage() {
  const qc = useQueryClient();

  const {
    data: channelsData,
    isLoading: channelsLoading,
    isError: channelsError,
  } = useQuery({
    queryKey: ['wa-channels'],
    queryFn: () => svc.listChannels(),
  });
  const channels = channelsData?.data ?? [];

  const {
    data: analyticsData,
    isLoading: analyticsLoading,
    isError: analyticsError,
  } = useQuery({
    queryKey: ['wa-analytics'],
    queryFn: () => svc.getAnalytics(),
  });
  const bridgeEnabled = analyticsData?.data?.bridge?.enabled ?? false;

  const syncMut = useMutation({
    mutationFn: () => svc.syncChannelHealth(),
    onSuccess: () => {
      showToast.success('Channel health synced from Meta');
      qc.invalidateQueries({ queryKey: ['wa-channels'] });
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Sync failed'),
  });

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="whatsapp.settings.view"
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]">
              <Settings className="h-6 w-6 text-emerald-600" /> WhatsApp Settings
            </h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Channel health, auto-replies, business hours, opt-out handling and keyword
              auto-responders for the WhatsApp business number.
            </p>
          </div>
          <Button
            variant="secondary"
            leftIcon={
              syncMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )
            }
            onClick={() => syncMut.mutate()}
            disabled={syncMut.isPending}
          >
            Sync health from Meta
          </Button>
        </div>

        {/* ── Channel (read-only health/quality/tier) ── */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--text)]">Channel</h2>
          {channelsLoading && (
            <p className="text-center text-sm text-[var(--text-muted)]">Loading…</p>
          )}
          {channelsError && (
            <p className="rounded-xl border border-[var(--border)] bg-white p-4 text-center text-sm text-red-600">
              Failed to load channels.
            </p>
          )}
          {!channelsLoading && !channelsError && channels.length === 0 && (
            <p className="rounded-xl border border-[var(--border)] bg-white p-8 text-center text-sm text-[var(--text-muted)]">
              No channels configured.
            </p>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            {channels.map((ch) => (
              <ChannelCard key={ch.id} ch={ch} />
            ))}
          </div>
        </section>

        {/* ── Per-device inbox notification sound (localStorage preference) ── */}
        <NotificationSoundToggle />

        {/* ── Editable settings: auto-reply, business hours, opt-out keywords, caps ── */}
        <WhatsappSettingsForms />

        {/* ── Keyword auto-responder rules ── */}
        <KeywordRulesManager />

        {/* ── FAQ menu (interactive list shown to customers) ── */}
        <FaqManager />

        {/* ── Saved replies (reusable composer snippets) ── */}
        <SavedRepliesManager />

        {/* ── Suppression list (global do-not-contact) ── */}
        <SuppressionListManager />

        {/* ── Saved segments (reusable campaign audiences) ── */}
        <SavedSegmentsManager />

        {/* ── Chatwoot bridge (read-only, env-driven) ── */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--text)]">Chatwoot bridge</h2>
          <div className="rounded-xl border border-[var(--border)] bg-white p-4">
            {analyticsLoading && (
              <p className="text-center text-sm text-[var(--text-muted)]">Loading…</p>
            )}
            {analyticsError && (
              <p className="text-center text-sm text-red-600">Failed to load bridge status.</p>
            )}
            {!analyticsLoading && !analyticsError && (
              <>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    bridgeEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600',
                  )}
                >
                  {bridgeEnabled ? 'Enabled' : 'Disabled'}
                </span>
                <p className="mt-3 text-xs text-[var(--text-muted)]">
                  Toggled server-side via WHATSAPP_CHATWOOT_BRIDGE_ENABLED.
                </p>
              </>
            )}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
