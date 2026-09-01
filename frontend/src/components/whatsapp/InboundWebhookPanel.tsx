'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw, Radio, X, RotateCw } from 'lucide-react';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import DialogShell from '@/components/ui/DialogShell';
import { showToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { WaInboundWebhookEvent } from '@/types/whatsapp';

/** Human "3 minutes ago" for a minute count, kept deliberately coarse. */
function formatAge(minutes: number | null): string {
  if (minutes === null) return 'never';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

/** Abandoned / processed / deferred / pending, as a single readable state chip. */
function eventState(e: WaInboundWebhookEvent): { label: string; className: string } {
  // Checked FIRST, and deliberately so. Giving up on an event used to be recorded
  // by stamping `processedAt` — the success field — so a webhook that was never
  // handled showed a green "Processed" chip here, no filter could find it, and
  // its payload was pruned at 14 days. An abandoned MESSAGE event means a
  // customer wrote to us and it was never stored; that has to be red.
  if (e.abandonedAt) return { label: 'Abandoned', className: 'bg-red-100 text-red-700' };
  if (e.processedAt) return { label: 'Processed', className: 'bg-emerald-100 text-emerald-700' };
  if (e.deferAttempts > 0) return { label: 'Deferred', className: 'bg-amber-100 text-amber-800' };
  return { label: 'Pending', className: 'bg-gray-100 text-gray-600' };
}

function EventDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['wa-webhook-event', id],
    queryFn: () => svc.getInboundWebhookEvent(id),
  });
  const event = data?.data ?? null;

  return (
    <DialogShell onClose={onClose} label="Raw webhook event">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text)]">Raw webhook event</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 hover:bg-[var(--bg-secondary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {isLoading && <p className="text-sm text-[var(--text-muted)]">Loading…</p>}
        {isError && <p className="text-sm text-red-600">Failed to load the event.</p>}
        {event && (
          <>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
              <div>
                <dt className="text-[var(--text-muted)]">Type</dt>
                <dd className="font-mono text-[var(--text)]">{event.eventType}</dd>
              </div>
              <div>
                <dt className="text-[var(--text-muted)]">Received</dt>
                <dd className="text-[var(--text)]">{formatWhen(event.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-[var(--text-muted)]">WAMID</dt>
                <dd className="truncate font-mono text-[var(--text)]">{event.wamid ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[var(--text-muted)]">Processed</dt>
                <dd className="text-[var(--text)]">{formatWhen(event.processedAt)}</dd>
              </div>
              <div>
                <dt className="text-[var(--text-muted)]">Defer attempts</dt>
                <dd className="text-[var(--text)]">{event.deferAttempts}</dd>
              </div>
              <div>
                <dt className="text-[var(--text-muted)]">Last attempt</dt>
                <dd className="text-[var(--text)]">{formatWhen(event.lastAttemptAt)}</dd>
              </div>
            </dl>
            {/* The payload carries customer message content, which is why fetching
                this detail view writes an audit row. */}
            <pre className="mt-4 max-h-80 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3 font-mono text-[11px] text-[var(--text)]">
              {JSON.stringify(event.payload ?? {}, null, 2)}
            </pre>
          </>
        )}
      </div>
    </DialogShell>
  );
}

/**
 * Inbound webhook (Meta → us) health and raw-event viewer.
 *
 * `WaWebhookEvent` was write-only: when a message did not appear in the inbox,
 * "Meta never delivered it", "the signature failed" and "it is sitting
 * unprocessed" were indistinguishable without a psql session on the server. And
 * a subscription Meta has disabled produces no error at all — just an inbox that
 * goes quiet, which is what this panel exists to make visible.
 */
export default function InboundWebhookPanel() {
  const qc = useQueryClient();
  const [checkSubscription, setCheckSubscription] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const [state, setState] = useState('');
  const [eventType, setEventType] = useState('');
  const [openEventId, setOpenEventId] = useState<string | null>(null);

  /**
   * Replay a stuck event. Seeing that one was stuck was already possible; doing
   * anything about it was not — an event that failed for a reason since fixed
   * (a Postgres blip mid-parse, a template row that arrived late) stayed
   * unprocessed forever, and the customer message inside it never reached the
   * inbox. Safe to press twice: inbound processing dedups on WAMID.
   */
  const reprocessMut = useMutation({
    mutationFn: (id: string) => svc.reprocessInboundWebhookEvent(id),
    onSuccess: (res) => {
      showToast.success(
        res.data?.requeued
          ? 'Event queued for reprocessing'
          : 'Already queued — it is waiting to be processed',
      );
      qc.invalidateQueries({ queryKey: ['wa-webhook-events'] });
      qc.invalidateQueries({ queryKey: ['wa-webhook-health'] });
    },
    onError: (e) => showToast.error(errorMessage(e, 'Could not reprocess the event')),
  });

  const {
    data: healthData,
    isLoading: healthLoading,
    isError: healthError,
    isFetching: healthFetching,
    refetch: refetchHealth,
  } = useQuery({
    queryKey: ['wa-webhook-health', checkSubscription],
    queryFn: () => svc.getInboundWebhookHealth(checkSubscription),
    refetchInterval: 60_000,
  });
  const health = healthData?.data ?? null;

  const {
    data: eventsData,
    isLoading: eventsLoading,
    isError: eventsError,
  } = useQuery({
    queryKey: ['wa-webhook-events', state, eventType],
    queryFn: () =>
      svc.listInboundWebhookEvents({
        state: state || undefined,
        eventType: eventType || undefined,
        limit: 25,
      }),
    enabled: showEvents,
  });
  const events = eventsData?.data?.items ?? [];
  const totalEvents = eventsData?.data?.total ?? 0;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-[var(--text)]">Inbound webhook</h2>
      <p className="text-xs text-[var(--text-muted)]">
        Everything the inbox receives arrives through Meta&apos;s webhook. Meta disables the
        subscription after sustained delivery failures and does not backfill, so silence here is
        indistinguishable from a slow day unless it is measured.
      </p>

      <div className="rounded-xl border border-[var(--border)] bg-white p-4">
        {healthLoading && <p className="text-center text-sm text-[var(--text-muted)]">Loading…</p>}
        {healthError && (
          <p className="text-center text-sm text-red-600">Failed to load webhook health.</p>
        )}
        {health && (
          <>
            {health.stale && (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <div className="text-xs text-red-800">
                  <p className="font-semibold">
                    No signed webhook event for {formatAge(health.ageMinutes)}.
                  </p>
                  <p className="mt-0.5">
                    Anything longer than {health.staleAfterMinutes} minutes is treated as broken.
                    Check that the callback URL is reachable, its TLS certificate is valid, and the
                    subscription is still active in the Meta app.
                  </p>
                </div>
              </div>
            )}
            {health.subscribed === false && (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <p className="text-xs text-red-800">
                  Meta no longer lists a subscribed app for this WABA — re-subscribe the webhook, or
                  no inbound message will ever arrive.
                </p>
              </div>
            )}
            {health.signatureFailures24h > 0 && (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-xs text-amber-800">
                  {health.signatureFailures24h} webhook
                  {health.signatureFailures24h === 1 ? ' was' : 's were'} rejected for a bad
                  signature in the last 24h (most recent {formatWhen(health.lastSignatureFailureAt)}
                  ). That is what an app-secret rotation that never reached META_WHATSAPP_APP_SECRET
                  looks like — every inbound message is being dropped.
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              <div>
                <p className="text-xs text-[var(--text-muted)]">Last event</p>
                <p
                  className={cn(
                    'font-semibold',
                    health.stale ? 'text-red-600' : 'text-[var(--text)]',
                  )}
                >
                  {formatAge(health.ageMinutes)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">Unprocessed backlog</p>
                <p
                  className={cn(
                    'font-semibold',
                    health.unprocessed > 0 ? 'text-amber-600' : 'text-[var(--text)]',
                  )}
                >
                  {health.unprocessed}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">Bad signatures (24h)</p>
                <p
                  className={cn(
                    'font-semibold',
                    health.signatureFailures24h > 0 ? 'text-red-600' : 'text-[var(--text)]',
                  )}
                >
                  {health.signatureFailures24h}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">Meta subscription</p>
                <p className="font-semibold text-[var(--text)]">
                  {health.subscribed === null
                    ? 'Not checked'
                    : health.subscribed
                      ? 'Active'
                      : 'Missing'}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<Radio className={cn('h-4 w-4', healthFetching && 'animate-pulse')} />}
                onClick={() => {
                  // Opt-in: the subscription check is a Graph round trip, so the
                  // 60s poll deliberately skips it.
                  setCheckSubscription(true);
                  void refetchHealth();
                }}
              >
                Check subscription with Meta
              </Button>
              <Button
                size="sm"
                variant="ghost"
                leftIcon={<RefreshCw className="h-4 w-4" />}
                onClick={() => setShowEvents((v) => !v)}
              >
                {showEvents ? 'Hide raw events' : 'View raw events'}
              </Button>
            </div>
          </>
        )}
      </div>

      {showEvents && (
        <div className="rounded-xl border border-[var(--border)] bg-white p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-48">
              <Select
                label="State"
                options={[
                  { value: '', label: 'All' },
                  { value: 'processed', label: 'Processed' },
                  { value: 'unprocessed', label: 'Unprocessed' },
                  { value: 'deferred', label: 'Deferred (retrying)' },
                  { value: 'abandoned', label: 'Abandoned (given up)' },
                ]}
                value={state}
                onChange={(v) => setState(v)}
                clearable={false}
              />
            </div>
            <div className="w-56">
              <Select
                label="Event type"
                options={[
                  { value: '', label: 'All' },
                  { value: 'message', label: 'message' },
                  { value: 'status', label: 'status' },
                  { value: 'message_template_status_update', label: 'template status' },
                  { value: 'message_template_quality_update', label: 'template quality' },
                  { value: 'phone_number_quality_update', label: 'number quality' },
                  { value: 'user_preferences', label: 'user preferences' },
                  { value: 'account_update', label: 'account update' },
                ]}
                value={eventType}
                onChange={(v) => setEventType(v)}
                clearable={false}
              />
            </div>
            <p className="pb-2 text-xs text-[var(--text-muted)]">
              {totalEvents} matching event{totalEvents === 1 ? '' : 's'} (newest 25 shown)
            </p>
          </div>

          {eventsLoading && (
            <p className="mt-3 text-center text-sm text-[var(--text-muted)]">Loading…</p>
          )}
          {eventsError && (
            <p className="mt-3 text-center text-sm text-red-600">Failed to load events.</p>
          )}
          {!eventsLoading && !eventsError && events.length === 0 && (
            <p className="mt-3 text-center text-sm text-[var(--text-muted)]">
              No events match this filter.
            </p>
          )}
          {events.length > 0 && (
            <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--border)]">
              <table className="w-full text-xs">
                <thead className="bg-[var(--bg-secondary)] text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Type</th>
                    <th className="px-3 py-2 text-left font-medium">WAMID</th>
                    <th className="px-3 py-2 text-left font-medium">State</th>
                    <th className="px-3 py-2 text-left font-medium">Received</th>
                    <th className="px-3 py-2 text-right font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {events.map((e) => {
                    const st = eventState(e);
                    return (
                      <tr key={e.id}>
                        <td className="px-3 py-2 font-mono text-[var(--text)]">{e.eventType}</td>
                        <td className="max-w-[14rem] truncate px-3 py-2 font-mono text-[var(--text-muted)]">
                          {e.wamid ?? '—'}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                              st.className,
                            )}
                          >
                            {st.label}
                          </span>
                          {e.deferAttempts > 0 && (
                            <span className="ml-1 text-[10px] text-[var(--text-muted)]">
                              ×{e.deferAttempts}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-[var(--text-muted)]">
                          {formatWhen(e.createdAt)}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {/* Only offered where it can help: a processed event has
                              nothing to recover, and replaying it would re-run
                              the parse for no reason. */}
                          {!e.processedAt && (
                            <Button
                              size="sm"
                              variant="ghost"
                              leftIcon={<RotateCw className="h-3.5 w-3.5" />}
                              isLoading={reprocessMut.isPending && reprocessMut.variables === e.id}
                              onClick={() => reprocessMut.mutate(e.id)}
                            >
                              Reprocess
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setOpenEventId(e.id)}>
                            Payload
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {openEventId && <EventDetailModal id={openEventId} onClose={() => setOpenEventId(null)} />}
    </section>
  );
}
