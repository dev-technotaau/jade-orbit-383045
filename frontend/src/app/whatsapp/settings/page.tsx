'use client';

import { useQuery } from '@tanstack/react-query';
import { Settings } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { cn } from '@/lib/utils';
import { whatsappService as svc } from '@/services/whatsapp.service';
import WhatsappSettingsForms from '@/components/whatsapp/WhatsappSettingsForms';
import NotificationSoundToggle from '@/components/whatsapp/NotificationSoundToggle';
import KeywordRulesManager from '@/components/whatsapp/KeywordRulesManager';
import BotFlowsManager from '@/components/whatsapp/BotFlowsManager';
import MediaArchiveFailures from '@/components/whatsapp/MediaArchiveFailures';
import FaqManager from '@/components/whatsapp/FaqManager';
import SavedRepliesManager from '@/components/whatsapp/SavedRepliesManager';
import SuppressionListManager from '@/components/whatsapp/SuppressionListManager';
import SavedSegmentsManager from '@/components/whatsapp/SavedSegmentsManager';
import InboundWebhookPanel from '@/components/whatsapp/InboundWebhookPanel';
import SystemStatusPanel from '@/components/whatsapp/SystemStatusPanel';
import ChannelsSection from '@/components/whatsapp/ChannelsSection';
import BusinessProfileSection from '@/components/whatsapp/BusinessProfileSection';
import CommerceSection from '@/components/whatsapp/CommerceSection';
import ConversationalAutomationSection from '@/components/whatsapp/ConversationalAutomationSection';

export default function SuperAdminWhatsappSettingsPage() {
  const {
    data: analyticsData,
    isLoading: analyticsLoading,
    isError: analyticsError,
  } = useQuery({
    queryKey: ['wa-analytics'],
    queryFn: () => svc.getAnalytics(),
  });
  const bridgeEnabled = analyticsData?.data?.bridge?.enabled ?? false;

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="whatsapp.settings.view"
    >
      <div className="space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]">
            <Settings className="h-6 w-6 text-emerald-600" /> WhatsApp Settings
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Connected numbers, the profile customers see, catalog and cart, auto-replies, business
            hours, opt-out handling and keyword auto-responders.
          </p>
        </div>

        {/* ── Channels: connect a number, choose the default, rotate a token ── */}
        <ChannelsSection />

        {/* ── The number's customer-facing identity + registration / two-step PIN ── */}
        <BusinessProfileSection />

        {/* ── Catalog binding + cart visibility (product messages, CATALOG buttons) ── */}
        <CommerceSection />

        {/* ── Ice breakers, commands and Meta's welcome-message hook ── */}
        <ConversationalAutomationSection />

        {/* ── Queue depth, worker leadership, webhook silence, channel quality ── */}
        <SystemStatusPanel />

        {/* ── Inbound webhook health + raw-event viewer ── */}
        <InboundWebhookPanel />

        {/* ── Per-device alerting: inbox sound + desktop-notification permission ── */}
        <NotificationSoundToggle />

        {/* ── Editable settings: auto-reply, business hours, opt-out keywords, caps ── */}
        <WhatsappSettingsForms />

        {/* ── Inbound media whose durable archive failed (hidden when there is none) ── */}
        <MediaArchiveFailures />

        {/* ── Multi-step bot flows (stateful automation) ── */}
        <BotFlowsManager />

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
