'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, RefreshCw } from 'lucide-react';
import Button from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import type { ApiResponse } from '@/types/api';
import type { WaInboundWebhookHealth } from '@/types/whatsapp';

/** One BullMQ queue's live depth. Mirrors QueueSnapshot in backend/src/jobs/worker-leader.ts. */
interface QueueSnapshot {
  name: string;
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  /** False when Redis would not answer — the counts are then meaningless, not zero. */
  reachable: boolean;
}

interface LeaderState {
  held: boolean;
  isThisInstance: boolean;
  ttlSeconds: number | null;
}

interface ChannelStatus {
  id: string;
  displayPhone: string;
  displayName: string | null;
  isDefault: boolean;
  qualityRating: string;
  messagingTier: string | null;
  healthStatus: string | null;
  tokenValid: boolean | null;
  tokenExpiresAt: string | null;
}

interface SystemStatus {
  generatedAt: string;
  leader: LeaderState;
  queues: QueueSnapshot[];
  webhook: WaInboundWebhookHealth;
  channels: ChannelStatus[];
}

/** Queue depth that turns a row amber — normal fan-out, sustained backlog. */
const BACKLOG_WARN = 500;

/** Human "3 minutes ago" for a minute count, kept deliberately coarse. */
function formatAge(minutes: number | null): string {
  if (minutes === null) return 'never';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const QUALITY_CLASS: Record<string, string> = {
  GREEN: 'bg-emerald-100 text-emerald-700',
  YELLOW: 'bg-amber-100 text-amber-800',
  RED: 'bg-red-100 text-red-700',
  UNKNOWN: 'bg-gray-100 text-gray-600',
};

/**
 * Operations status: queue depth, worker leadership, webhook silence and channel
 * quality.
 *
 * Every number here is also a Prometheus series (see deploy/alerts.yml), but a
 * Prometheus is external tooling this product cannot assume — on a managed host
 * there is no scrape target at all. Without this panel the three ways message
 * delivery stops WITHOUT anything erroring (no worker leader, so nothing drains
 * the queues; a queue backing up; the inbound webhook going silent) were
 * invisible from the only place an operator actually looks.
 */
export default function SystemStatusPanel() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['wa-system-status'],
    // Called straight through the shared API client: this panel is the only
    // consumer of the endpoint, so the call lives next to the types it fills.
    queryFn: async () => {
      const res = await api.get('/whatsapp/system-status');
      return res.data as ApiResponse<SystemStatus>;
    },
    refetchInterval: 30_000,
  });
  const status = data?.data ?? null;

  const busiest = status
    ? status.queues.reduce((max, q) => Math.max(max, q.waiting), 0)
    : 0;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
          <Activity className="h-4 w-4 text-emerald-600" /> System status
        </h2>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => refetch()}
          isLoading={isFetching}
          leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
        >
          Refresh
        </Button>
      </div>
      <p className="text-xs text-[var(--text-muted)]">
        Sending stops in three ways that log no error: no worker leader, a queue that stops
        draining, or Meta&apos;s webhook going quiet. Polled every 30 seconds.
      </p>

      <div className="space-y-4 rounded-xl border border-[var(--border)] bg-white p-4">
        {isLoading && <p className="text-center text-sm text-[var(--text-muted)]">Loading…</p>}
        {isError && (
          <p className="text-center text-sm text-red-600">Failed to load system status.</p>
        )}

        {status && (
          <>
            {!status.leader.held && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <div className="text-xs text-red-800">
                  <p className="font-semibold">No worker leader — nothing is draining the queues.</p>
                  <p className="mt-0.5">
                    Inbound processing, auto-replies, campaigns and scheduled sends are all stopped
                    while the API keeps answering normally. Leadership is a Redis lock renewed every
                    10 seconds; check that Redis is reachable from the worker instance.
                  </p>
                </div>
              </div>
            )}
            {busiest > BACKLOG_WARN && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-xs text-amber-800">
                  {busiest} jobs are waiting. A campaign fan-out clears in seconds — a backlog that
                  persists across refreshes means the workers are not keeping up.
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              <div>
                <p className="text-xs text-[var(--text-muted)]">Workers</p>
                <p
                  className={cn(
                    'font-semibold',
                    status.leader.held ? 'text-[var(--text)]' : 'text-red-600',
                  )}
                >
                  {status.leader.held ? 'Leader active' : 'No leader'}
                  {status.leader.held && status.leader.ttlSeconds !== null && (
                    <span className="ml-1 text-xs font-normal text-[var(--text-muted)]">
                      (lock renews in {status.leader.ttlSeconds}s)
                    </span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">Last webhook</p>
                <p
                  className={cn(
                    'font-semibold',
                    status.webhook.stale ? 'text-red-600' : 'text-[var(--text)]',
                  )}
                >
                  {formatAge(status.webhook.ageMinutes)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">Unprocessed events</p>
                <p
                  className={cn(
                    'font-semibold',
                    status.webhook.unprocessed > 0 ? 'text-amber-600' : 'text-[var(--text)]',
                  )}
                >
                  {status.webhook.unprocessed}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[11px] font-semibold text-[var(--text-muted)]">
                    <th className="px-2 py-2">Queue</th>
                    <th className="px-2 py-2 text-right">Waiting</th>
                    <th className="px-2 py-2 text-right">Active</th>
                    <th className="px-2 py-2 text-right">Delayed</th>
                    <th className="px-2 py-2 text-right">Failed</th>
                  </tr>
                </thead>
                <tbody>
                  {status.queues.map((q) => (
                    <tr key={q.name} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-2 py-2 text-[var(--text)]">
                        {q.name}
                        {!q.reachable && (
                          <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700">
                            unreachable
                          </span>
                        )}
                      </td>
                      <td
                        className={cn(
                          'px-2 py-2 text-right tabular-nums',
                          q.waiting > BACKLOG_WARN
                            ? 'font-semibold text-amber-600'
                            : 'text-[var(--text)]',
                        )}
                      >
                        {q.reachable ? q.waiting : '—'}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-[var(--text)]">
                        {q.reachable ? q.active : '—'}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-[var(--text)]">
                        {q.reachable ? q.delayed : '—'}
                      </td>
                      <td
                        className={cn(
                          'px-2 py-2 text-right tabular-nums',
                          q.failed > 0 ? 'font-semibold text-red-600' : 'text-[var(--text)]',
                        )}
                      >
                        {q.reachable ? q.failed : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {status.channels.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[var(--text-muted)]">Numbers</p>
                {status.channels.map((ch) => (
                  <div
                    key={ch.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-xs"
                  >
                    <span className="font-medium text-[var(--text)]">
                      {ch.displayName ? `${ch.displayName} · ` : ''}
                      {ch.displayPhone}
                    </span>
                    {ch.isDefault && (
                      <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[11px] text-gray-700">
                        default
                      </span>
                    )}
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[11px] font-medium',
                        QUALITY_CLASS[ch.qualityRating] ?? QUALITY_CLASS.UNKNOWN,
                      )}
                    >
                      quality {ch.qualityRating.toLowerCase()}
                    </span>
                    <span className="text-[var(--text-muted)]">tier {ch.messagingTier ?? '—'}</span>
                    {ch.healthStatus && ch.healthStatus !== 'AVAILABLE' && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                        {ch.healthStatus.toLowerCase()}
                      </span>
                    )}
                    {/* An expired credential fails every send with an OAuth error that
                        otherwise surfaces only as per-message FAILED rows. */}
                    {ch.tokenValid === false && (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700">
                        token invalid
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <p className="text-[11px] text-[var(--text-muted)]">
              Read at {new Date(status.generatedAt).toLocaleTimeString()}. This is a point-in-time
              view with no history — deploy/alerts.yml carries the Prometheus rules for the same
              signals.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
