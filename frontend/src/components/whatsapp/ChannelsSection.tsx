'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  RefreshCw,
  Loader2,
  KeyRound,
  Star,
  Power,
  PlugZap,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Switch from '@/components/ui/Switch';
import { showToast } from '@/components/ui/Toast';
import { confirmDialog } from '@/components/ui/dialog-service';
import { cn } from '@/lib/utils';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { WaChannel, WaChannelTestResult } from '@/types/whatsapp';
import type { ApiError } from '@/types/api';

/**
 * GET /whatsapp/channels attaches the pinned Meta Graph API version to every
 * channel (see getChannels). It is deployment-wide rather than per number, so it
 * is not part of the shared `WaChannel` shape — but it belongs on this card,
 * because "which API version is this number being called on" is only ever asked
 * while looking at the number.
 */
type WaChannelWithGraph = WaChannel & { graphVersion?: string };

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

/** Below this many days to expiry the token is called out as needing replacing. */
const TOKEN_EXPIRY_WARN_DAYS = 7;

/**
 * What Meta's `debug_token` said about the credential, in one line.
 *
 * A number can answer every health check and still be days from failing every
 * send: an access token is the one part of the setup that expires on its own,
 * and until now nothing in the product ever said when.
 */
function describeToken(ch: WaChannel): { label: string; tone: 'ok' | 'warn' | 'bad' } | null {
  if (!ch.tokenCheckedAt) return null;
  if (ch.tokenValid === false) {
    return { label: 'Token rejected by Meta', tone: 'bad' };
  }
  if (!ch.tokenExpiresAt) return { label: 'Token never expires', tone: 'ok' };
  const days = Math.floor((new Date(ch.tokenExpiresAt).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { label: 'Token expired', tone: 'bad' };
  return {
    label: `Token expires in ${days} day${days === 1 ? '' : 's'}`,
    tone: days <= TOKEN_EXPIRY_WARN_DAYS ? 'warn' : 'ok',
  };
}

const TONE_STYLE: Record<'ok' | 'warn' | 'bad', string> = {
  ok: 'bg-emerald-50 text-emerald-700',
  warn: 'bg-amber-100 text-amber-800',
  bad: 'bg-red-100 text-red-700',
};

/** AVAILABLE / LIMITED / BLOCKED, Meta's own answer to 'can this number send?'. */
const HEALTH_TONE: Record<string, 'ok' | 'warn' | 'bad'> = {
  AVAILABLE: 'ok',
  LIMITED: 'warn',
  BLOCKED: 'bad',
};

const errText = (e: unknown, fallback: string) => (e as unknown as ApiError)?.message || fallback;

/** Add a number, or rotate an existing one's token. */
function ChannelFormModal({
  channel,
  onClose,
}: {
  /** Null = connect a new number; a channel = edit that one. */
  channel: WaChannel | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const editing = channel !== null;
  const [phoneNumberId, setPhoneNumberId] = useState(channel?.phoneNumberId ?? '');
  const [wabaId, setWabaId] = useState(channel?.wabaId ?? '');
  const [displayName, setDisplayName] = useState(channel?.displayName ?? '');
  const [accessToken, setAccessToken] = useState('');
  const [makeDefault, setMakeDefault] = useState(false);

  const saveMut = useMutation({
    mutationFn: () =>
      editing
        ? svc.updateChannel(channel.id, {
            wabaId: wabaId.trim() || undefined,
            displayName: displayName.trim() || null,
            // Left blank on an edit means "leave the stored token alone" — the
            // token is never echoed back, so an empty box is not an instruction
            // to clear it.
            ...(accessToken.trim() ? { accessToken: accessToken.trim() } : {}),
          })
        : svc.createChannel({
            phoneNumberId: phoneNumberId.trim(),
            wabaId: wabaId.trim() || undefined,
            displayName: displayName.trim() || undefined,
            accessToken: accessToken.trim() || undefined,
            isDefault: makeDefault || undefined,
          }),
    onSuccess: () => {
      showToast.success(editing ? 'Channel updated' : 'Number connected');
      qc.invalidateQueries({ queryKey: ['wa-channels'] });
      onClose();
    },
    onError: (e) => showToast.error(errText(e, 'Could not save the channel')),
  });

  const canSave = editing || phoneNumberId.trim().length > 4;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={editing ? `Edit ${channel.displayPhone}` : 'Connect a WhatsApp number'}
      size="md"
    >
      <div className="space-y-3">
        <Input
          label="Phone number ID"
          value={phoneNumberId}
          onChange={(e) => setPhoneNumberId(e.target.value)}
          placeholder="123456789012345"
          disabled={editing}
          helperText={
            editing
              ? 'Meta’s identifier for this number. It is the row’s key and cannot be changed.'
              : 'From Meta’s WhatsApp Manager, under the number’s API setup. Digits only.'
          }
          required={!editing}
        />
        <Input
          label="WhatsApp Business Account ID"
          value={wabaId}
          onChange={(e) => setWabaId(e.target.value)}
          placeholder="Defaults to META_WHATSAPP_WABA_ID"
        />
        <Input
          label="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Filled in automatically by the next health sync"
        />
        <Input
          label={editing ? 'Replace access token' : 'Access token'}
          type="password"
          autoComplete="new-password"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          placeholder={
            editing && channel.hasToken ? 'Leave blank to keep the current token' : 'Optional'
          }
          helperText="Only needed for a number on a different WhatsApp Business Account. Left empty, this number sends with META_WHATSAPP_TOKEN. Stored encrypted and never shown again."
        />
        {!editing && (
          <Switch
            label="Make this the default sending number"
            checked={makeDefault}
            onChange={(e) => setMakeDefault(e.target.checked)}
          />
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => saveMut.mutate()}
            isLoading={saveMut.isPending}
            disabled={!canSave}
          >
            {editing ? 'Save changes' : 'Connect number'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ChannelCard({
  ch,
  onEdit,
  test,
}: {
  ch: WaChannelWithGraph;
  onEdit: () => void;
  test: WaChannelTestResult | undefined;
}) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['wa-channels'] });

  const defaultMut = useMutation({
    mutationFn: () => svc.setDefaultChannel(ch.id),
    onSuccess: () => {
      showToast.success(`${ch.displayPhone} is now the default sender`);
      refresh();
    },
    onError: (e) => showToast.error(errText(e, 'Could not change the default')),
  });

  const activeMut = useMutation({
    mutationFn: (isActive: boolean) => svc.updateChannel(ch.id, { isActive }),
    onSuccess: (_r, isActive) => {
      showToast.success(isActive ? 'Channel activated' : 'Channel deactivated');
      refresh();
    },
    onError: (e) => showToast.error(errText(e, 'Could not change the channel')),
  });

  const syncMut = useMutation({
    mutationFn: () => svc.syncChannelHealth(ch.id),
    onSuccess: () => {
      showToast.success('Health synced from Meta');
      refresh();
    },
    onError: (e) => showToast.error(errText(e, 'Sync failed')),
  });

  const token = describeToken(ch);

  const confirmDeactivate = async () => {
    const ok = await confirmDialog({
      title: `Deactivate ${ch.displayPhone}?`,
      message:
        'Existing conversations on this number stay in the inbox. It stops being offered as a sender until you activate it again.',
      confirmLabel: 'Deactivate',
      variant: 'warning',
    });
    if (ok) activeMut.mutate(false);
  };

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
        <span
          title={
            ch.hasToken
              ? 'Sends with its own access token'
              : 'Sends with the token in META_WHATSAPP_TOKEN'
          }
          className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-secondary)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)]"
        >
          <KeyRound className="h-3 w-3" aria-hidden="true" />
          {ch.hasToken ? 'Own token' : 'Env token'}
        </span>
        {token && (
          <span
            title={
              ch.tokenScopes?.length
                ? `Scopes: ${ch.tokenScopes.join(', ')}`
                : 'Checked against Meta’s debug_token endpoint'
            }
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
              TONE_STYLE[token.tone],
            )}
          >
            <Clock className="h-3 w-3" aria-hidden="true" />
            {token.label}
          </span>
        )}
        {ch.healthStatus && (
          <span
            title="Meta’s own send eligibility for this number (health_status)"
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
              TONE_STYLE[HEALTH_TONE[ch.healthStatus] ?? 'warn'],
            )}
          >
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            {ch.healthStatus}
          </span>
        )}
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
        {/* Webhook-created channels have no display number yet, so both cards read
            the same until Meta health sync fills one in — the phone-number id is
            what actually tells two connected numbers apart. */}
        <div>
          <p className="text-xs text-[var(--text-muted)]">Phone number ID</p>
          <p className="font-mono text-xs font-semibold text-[var(--text)]">{ch.phoneNumberId}</p>
        </div>
        {/* Newer capabilities (blocking a number, flows, template features) exist
            only from a given Graph version onwards, so a pin that predates one
            answers 404 for it and nothing on screen says why. */}
        {ch.graphVersion && (
          <div>
            <p className="text-xs text-[var(--text-muted)]">Graph API</p>
            <p className="font-mono text-xs font-semibold text-[var(--text)]">{ch.graphVersion}</p>
          </div>
        )}
      </div>

      {/* An expiring token is the failure that arrives with no warning at all:
          the console works normally until the hour it lapses, then every send
          answers OAuth 190 and the only trace is a screen of FAILED rows. */}
      {token && token.tone !== 'ok' && (
        <div
          className={cn(
            'mt-3 flex items-start gap-2 rounded-lg border p-2.5 text-xs',
            token.tone === 'bad'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-amber-200 bg-amber-50 text-amber-800',
          )}
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            {token.label}. Replace it with a <strong>system-user</strong> token from Meta Business
            Settings — user tokens last 24 hours or 60 days and stop every send when they lapse.
          </span>
        </div>
      )}

      {/* Meta will refuse to send from an ineligible number while still reporting
          a GREEN quality rating, so this cannot be inferred from the rating. */}
      {ch.healthStatus && ch.healthStatus !== 'AVAILABLE' && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
          <p className="flex items-start gap-2 font-semibold">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Meta reports this number as {ch.healthStatus} — campaigns launched now will fail.
          </p>
          <ul className="mt-1 space-y-0.5 pl-5">
            {(ch.healthEntities ?? [])
              .filter((e) => e.canSend !== 'AVAILABLE')
              .map((e, i) => (
                <li key={`${e.type}-${e.id ?? i}`}>
                  {e.type}: {e.canSend}
                  {e.errors.length > 0 && ` — ${e.errors.map((x) => x.description).join('; ')}`}
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* A failed test is the signal the module never had: an expired token used
          to surface only as a generic error from the health sync. */}
      {test && (
        <div
          className={cn(
            'mt-3 flex items-start gap-2 rounded-lg border p-2.5 text-xs',
            test.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-800',
          )}
        >
          {test.ok ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )}
          <span>
            {test.ok
              ? `Meta answered for ${test.displayPhone ?? ch.displayPhone} (quality ${test.qualityRating ?? 'UNKNOWN'}) using the ${test.usingEnvToken ? 'environment' : 'channel'} token.`
              : `Meta refused this number: ${test.error}`}
          </span>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={onEdit}
          leftIcon={<KeyRound className="h-4 w-4" />}
        >
          Edit / rotate token
        </Button>
        {!ch.isDefault && ch.isActive && (
          <Button
            size="sm"
            variant="ghost"
            isLoading={defaultMut.isPending}
            onClick={() => defaultMut.mutate()}
            leftIcon={<Star className="h-4 w-4" />}
          >
            Make default
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          isLoading={syncMut.isPending}
          onClick={() => syncMut.mutate()}
          leftIcon={<RefreshCw className="h-4 w-4" />}
        >
          Sync health
        </Button>
        {ch.isActive ? (
          <Button
            size="sm"
            variant="ghost"
            isLoading={activeMut.isPending}
            onClick={() => void confirmDeactivate()}
            leftIcon={<Power className="h-4 w-4" />}
          >
            Deactivate
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            isLoading={activeMut.isPending}
            onClick={() => activeMut.mutate(true)}
            leftIcon={<Power className="h-4 w-4" />}
          >
            Activate
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Connected WhatsApp business numbers.
 *
 * This section used to be a read-only card per number: `isDefault`/`isActive`
 * were dead columns, the sending number came from META_WHATSAPP_PHONE_ID, and a
 * client onboarding a second number or holding an expired token had to have
 * someone redeploy the backend with new environment variables. Everything here
 * writes to the database instead, and the connection test names the credential
 * when Meta refuses it.
 */
export default function ChannelsSection() {
  const qc = useQueryClient();
  const [formFor, setFormFor] = useState<{ channel: WaChannel | null } | null>(null);
  const [tests, setTests] = useState<Record<string, WaChannelTestResult>>({});

  const { data, isLoading, isError } = useQuery({
    queryKey: ['wa-channels'],
    queryFn: () => svc.listChannels(),
  });
  const channels = data?.data ?? [];

  const testMut = useMutation({
    mutationFn: (id: string) => svc.testChannel(id),
    onSuccess: (res, id) => {
      if (res.data) setTests((t) => ({ ...t, [id]: res.data as WaChannelTestResult }));
      // A successful test also refreshes what Meta says the number is called.
      if (res.data?.ok) qc.invalidateQueries({ queryKey: ['wa-channels'] });
    },
    onError: (e) => showToast.error(errText(e, 'Could not reach Meta')),
  });

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--text)]">
          Channels{channels.length > 1 ? ` (${channels.length})` : ''}
        </h2>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            isLoading={testMut.isPending}
            onClick={() => channels.forEach((ch) => testMut.mutate(ch.id))}
            disabled={channels.length === 0}
            leftIcon={<PlugZap className="h-4 w-4" />}
          >
            Test connections
          </Button>
          <Button
            size="sm"
            onClick={() => setFormFor({ channel: null })}
            leftIcon={<Plus className="h-4 w-4" />}
          >
            Connect a number
          </Button>
        </div>
      </div>
      <p className="text-xs text-[var(--text-muted)]">
        Replies go out from the number the customer messaged. The Default badge marks the number
        campaigns and console-started conversations use — it is stored here, not in the environment,
        so changing it takes effect immediately.
      </p>

      {isLoading && (
        <p className="flex items-center justify-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      )}
      {isError && (
        <p className="rounded-xl border border-[var(--border)] bg-white p-4 text-center text-sm text-red-600">
          Failed to load channels.
        </p>
      )}
      {!isLoading && !isError && channels.length === 0 && (
        <p className="rounded-xl border border-[var(--border)] bg-white p-8 text-center text-sm text-[var(--text-muted)]">
          No channels configured. Connect a number to start sending.
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {channels.map((ch) => (
          <ChannelCard
            key={ch.id}
            ch={ch}
            test={tests[ch.id]}
            onEdit={() => setFormFor({ channel: ch })}
          />
        ))}
      </div>

      {formFor && <ChannelFormModal channel={formFor.channel} onClose={() => setFormFor(null)} />}
    </section>
  );
}
