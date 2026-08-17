'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// Aliased: this file already imports recharts' `Tooltip` for charts.
import UiTooltip from '@/components/ui/Tooltip';
import {
  BarChart3,
  RefreshCw,
  Loader2,
  IndianRupee,
  AlertCircle,
  Star,
  Target,
  Download,
  MousePointerClick,
  Megaphone,
  UserMinus,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import { showToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { WaHeatmapDirection } from '@/services/whatsapp.service';
import MetaAnalyticsSection from '@/components/whatsapp/MetaAnalyticsSection';
import SegmentPerformanceSection from '@/components/whatsapp/SegmentPerformanceSection';
import CohortRetentionSection from '@/components/whatsapp/CohortRetentionSection';
import type { ApiError } from '@/types/api';

/**
 * Percentage change vs. the previous period, or null when there is nothing
 * meaningful to compare against.
 *
 * A jump from 0 is deliberately NOT rendered as "+∞%" or "+100%" — the first
 * campaign of a quarter would otherwise report an impossible-looking number.
 */
function delta(current: number, previous: number | undefined): number | null {
  if (previous === undefined || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function DeltaChip({ value, invert }: { value: number | null; invert?: boolean }) {
  if (value === null || value === 0) return null;
  // `invert` marks a metric where up is bad (failures): the arrow still points
  // the way the number moved, the colour reflects whether that is good news.
  const good = invert ? value < 0 : value > 0;
  return (
    <span className={cn('text-[10px] font-semibold', good ? 'text-emerald-600' : 'text-red-600')}>
      {value > 0 ? '▲' : '▼'} {Math.abs(value)}%
    </span>
  );
}

function Stat({
  label,
  value,
  hint,
  change,
  invertChange,
}: {
  label: string;
  value: number | string;
  hint?: string;
  /** Percentage change vs. the previous window; omitted for lifetime totals. */
  change?: number | null;
  invertChange?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-4">
      <div className="flex items-baseline gap-1.5">
        <p className="text-2xl font-bold text-[var(--text)]">{value}</p>
        <DeltaChip value={change ?? null} invert={invertChange} />
      </div>
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      {hint && <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{hint}</p>}
    </div>
  );
}

/** Inline error + retry block for an analytics section that failed to load. */
function SectionError({ onRetry, label }: { onRetry: () => void; label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
      <AlertCircle className="h-5 w-5 text-red-600" />
      <p className="text-xs text-[var(--text-muted)]">{label ?? 'Failed to load data.'}</p>
      <Button
        variant="secondary"
        size="sm"
        leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
        onClick={onRetry}
      >
        Retry
      </Button>
    </div>
  );
}

/**
 * Minutes as a table cell. An em dash rather than "0m" for null — an agent who
 * has not answered anything yet has NO response time, and printing zero reads as
 * an instant reply, which is the opposite of the truth.
 */
function mins(value: number | null): string {
  if (value === null || value === undefined) return '—';
  if (value < 60) return `${value}m`;
  const h = Math.floor(value / 60);
  const m = value % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => h);

// Numeric mapping for the channel-health quality line (3 = best, 1 = worst).
const QUALITY_SCORE: Record<string, number> = { GREEN: 3, YELLOW: 2, RED: 1 };
const QUALITY_SCORE_LABEL: Record<number, string> = { 3: 'GREEN', 2: 'YELLOW', 1: 'RED' };

/** Map a heatmap cell count to a green tint based on its share of the max. */
function heatColor(count: number, max: number): string {
  if (count <= 0 || max <= 0) return 'var(--bg-secondary)';
  const ratio = count / max;
  // Emerald hue, opacity scaled so larger counts read darker.
  const alpha = 0.12 + ratio * 0.78;
  return `rgba(16, 185, 129, ${alpha.toFixed(3)})`;
}

const QUALITY_COLOR: Record<string, string> = {
  GREEN: 'text-emerald-600',
  YELLOW: 'text-amber-600',
  RED: 'text-red-600',
  UNKNOWN: 'text-gray-500',
};

// Funnel bar colors, keyed by metric.
const FUNNEL_COLORS: Record<string, string> = {
  inbound: '#6366f1',
  outbound: '#0ea5e9',
  delivered: '#10b981',
  read: '#22c55e',
  failed: '#ef4444',
};

// Categorical palette reused for status breakdown charts.
const PALETTE = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
];

const TOOLTIP_STYLE = {
  borderRadius: '8px',
  border: '1px solid var(--border)',
  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
} as const;

/** Preset windows, in days. `null` is the lifetime view. */
const RANGE_PRESETS: Array<{ days: number | null; label: string }> = [
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
  { days: 365, label: '1y' },
  { days: null, label: 'All time' },
];

export default function SuperAdminWhatsappAnalyticsPage() {
  // Every panel on this page used to be hardcoded to 30 days or to a lifetime
  // total, so "how did last month compare to this one" had no answer and the
  // lifetime rates drifted as retention pruning deleted old messages.
  const [days, setDays] = useState<number | null>(30);
  const [customDays, setCustomDays] = useState('');
  // The daily/hourly charts are windowed by construction — there is no "all
  // time" bucket list — so the lifetime view draws them over the widest range
  // the backend will clamp to.
  const seriesDays = days ?? 365;
  const rangeLabel = days === null ? 'all time' : `last ${days} days`;
  // Which connected number the message figures are about. Empty = all of them.
  //
  // Every aggregate on this page was cross-channel with no way to split it, so a
  // deployment running a support number and a marketing number saw one blended
  // volume, one blended cost and one blended delivery rate — and could not tell
  // which number produced either half, which is the first question anyone asks
  // when the numbers move.
  const [channelId, setChannelId] = useState('');
  const channelParam = channelId || undefined;

  const {
    data,
    isLoading,
    isError: overviewError,
    refetch: refetchOverview,
  } = useQuery({
    queryKey: ['wa-analytics', days, channelId],
    queryFn: () => svc.getAnalytics(days ?? undefined, channelParam),
    refetchInterval: 30_000,
  });
  const a = data?.data ?? null;
  const prev = a?.previousMessages ?? null;
  const qc = useQueryClient();

  // There was no export of any kind, so reporting on a client's campaigns meant
  // screenshotting this page. CSV because that is what a stakeholder pastes into
  // a spreadsheet; ?format=json serves the same report for a pipeline.
  const exportMut = useMutation({
    mutationFn: () => svc.exportAnalytics(seriesDays, 'csv'),
    onSuccess: () => showToast.success('Analytics exported'),
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Export failed'),
  });

  const ctwaExportMut = useMutation({
    mutationFn: () => svc.exportCtwaContacts(seriesDays),
    onSuccess: () => showToast.success('CTWA contacts exported'),
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Export failed'),
  });

  const syncMut = useMutation({
    mutationFn: () => svc.syncChannelHealth(),
    onSuccess: () => {
      showToast.success('Channel health synced from Meta');
      qc.invalidateQueries({ queryKey: ['wa-analytics'] });
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Sync failed'),
  });

  // ── Enterprise analytics: time-series, SLA, agents, cost, opt-out ──
  const {
    data: timeSeriesData,
    isError: timeSeriesError,
    refetch: refetchTimeSeries,
  } = useQuery({
    queryKey: ['wa-analytics-timeseries', seriesDays, channelId],
    queryFn: () => svc.getTimeSeries(seriesDays, channelParam),
    refetchInterval: 30_000,
  });
  const timeSeries = timeSeriesData?.data ?? [];
  // The series is zero-filled server-side, so inside a window it is never empty and
  // a row count can no longer stand in for "there is something to show". Read it off
  // the counts instead — otherwise a brand-new install draws a flat line pinned to
  // zero rather than saying there is no activity yet. Every other series is a subset
  // of inbound + outbound, so those two settle it.
  const hasMessageActivity = timeSeries.some((p) => p.inbound > 0 || p.outbound > 0);

  const {
    data: slaData,
    isError: slaError,
    refetch: refetchSla,
  } = useQuery({
    queryKey: ['wa-analytics-sla', days],
    queryFn: () => svc.getSlaMetrics(days ?? undefined),
    refetchInterval: 30_000,
  });
  const sla = slaData?.data ?? null;

  const {
    data: agentsData,
    isError: agentsError,
    refetch: refetchAgents,
  } = useQuery({
    queryKey: ['wa-analytics-agents', days],
    queryFn: () => svc.getAgentProductivity(days ?? undefined),
    refetchInterval: 30_000,
  });
  const agents = agentsData?.data ?? [];

  const {
    data: costData,
    isError: costError,
    refetch: refetchCost,
  } = useQuery({
    queryKey: ['wa-analytics-cost', days, channelId],
    queryFn: () => svc.getCostSummary(days ?? undefined, channelParam),
    refetchInterval: 30_000,
  });
  const cost = costData?.data ?? null;
  // Server-computed. This used to be a client-side reduce over
  // `listCampaigns({ limit: 100 })`, so the headline "total estimated spend" simply
  // stopped counting past the 100th campaign — while a second, correct total from
  // this very endpoint was rendered further down the same page. Two different
  // numbers under the same label, and the wrong one was on top.
  const totalCostPaise = cost?.totalEstimatedCostPaise ?? 0;
  const totalCostRupees = (totalCostPaise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const {
    data: optOutData,
    isError: optOutError,
    refetch: refetchOptOut,
  } = useQuery({
    queryKey: ['wa-analytics-optout', seriesDays],
    queryFn: () => svc.getOptOutTrend(seriesDays),
    refetchInterval: 30_000,
  });
  const optOut = optOutData?.data ?? [];
  // Zero-filled server-side too, so the same rule applies.
  const hasOptOutActivity = optOut.some((p) => p.count > 0 || p.optIns > 0);

  // Opt-out RATE and per-campaign attribution. A raw count answers nothing on
  // its own — 40 opt-outs is excellent after a 200k send and alarming after a 2k
  // one — and without the campaign split an operator can see the spike but not
  // which send caused it.
  const {
    data: optOutSummaryData,
    isError: optOutSummaryError,
    refetch: refetchOptOutSummary,
  } = useQuery({
    queryKey: ['wa-analytics-optout-summary', seriesDays],
    queryFn: () => svc.getOptOutSummary(seriesDays),
    refetchInterval: 60_000,
  });
  const optOutSummary = optOutSummaryData?.data ?? null;

  // Short-link clicks over time. Clicks were collected and then discarded: no
  // CTR appeared anywhere in the product, per campaign or overall.
  const {
    data: clickData,
    isError: clickError,
    refetch: refetchClicks,
  } = useQuery({
    queryKey: ['wa-analytics-clicks', seriesDays],
    queryFn: () => svc.getClickSeries(seriesDays),
    refetchInterval: 60_000,
  });
  const clicks = clickData?.data ?? [];

  // Click-to-WhatsApp acquisition. The referral payload has always been captured
  // on every inbound message and never read back, so paid ad spend had no
  // "conversations by ad" report to point at.
  const {
    data: ctwaData,
    isError: ctwaError,
    refetch: refetchCtwa,
  } = useQuery({
    queryKey: ['wa-analytics-ctwa', seriesDays],
    queryFn: () => svc.getCtwaReport(seriesDays),
    refetchInterval: 60_000,
  });
  const ctwa = ctwaData?.data ?? null;

  // ── P3 advanced analytics: heatmap, keywords, health history, CSAT ──
  // Inbound by default. The grid is read to pick a send window, and a single
  // large campaign blast owns its busiest cell for as long as the window lasts —
  // so the mixed view answered "when did we send" and was acted on as if it
  // answered "when is the audience awake".
  const [heatDirection, setHeatDirection] = useState<WaHeatmapDirection>('INBOUND');
  const {
    data: heatmapData,
    isError: heatmapError,
    refetch: refetchHeatmap,
  } = useQuery({
    queryKey: ['wa-analytics-heatmap', seriesDays, heatDirection, channelId],
    queryFn: () => svc.getHeatmap(seriesDays, heatDirection, channelParam),
    refetchInterval: 60_000,
  });
  const heatmap = heatmapData?.data ?? [];

  const {
    data: keywordsData,
    isError: keywordsError,
    refetch: refetchKeywords,
  } = useQuery({
    queryKey: ['wa-analytics-keywords', seriesDays, channelId],
    queryFn: () => svc.getKeywords(seriesDays, channelParam),
    // Polled on the server's cache TTL, not the 60s the other panels use: this
    // one is a Postgres-side tokenizing aggregate over every inbound message in
    // the window, cached for 5 minutes, so a faster interval only re-fetches a
    // byte-identical answer.
    refetchInterval: 5 * 60_000,
  });
  const keywords = keywordsData?.data ?? [];

  // Health snapshots are written per connected number, so the chart has to name
  // which one it is drawing. Empty = whichever number is the default.
  const [healthChannel, setHealthChannel] = useState('');
  const { data: channelsData } = useQuery({
    queryKey: ['wa-channels'],
    queryFn: () => svc.listChannels(),
    staleTime: 5 * 60_000,
  });
  const channels = channelsData?.data ?? [];

  const {
    data: healthHistoryData,
    isError: healthHistoryError,
    refetch: refetchHealthHistory,
  } = useQuery({
    queryKey: ['wa-analytics-health-history', seriesDays, healthChannel],
    queryFn: () => svc.getHealthHistory(seriesDays, healthChannel || undefined),
    refetchInterval: 60_000,
  });
  const healthHistory = healthHistoryData?.data ?? [];

  const {
    data: csatData,
    isError: csatError,
    refetch: refetchCsat,
  } = useQuery({
    queryKey: ['wa-analytics-csat', days],
    queryFn: () => svc.getCsat(days ?? undefined),
    refetchInterval: 60_000,
  });
  const csat = csatData?.data ?? null;

  // Conversion summary — total recorded conversions + summed value (paise).
  const {
    data: conversionData,
    isError: conversionError,
    refetch: refetchConversion,
  } = useQuery({
    queryKey: ['wa-analytics-conversions', days],
    queryFn: () => svc.getConversionSummary(days ?? undefined),
    refetchInterval: 60_000,
  });
  const conversion = conversionData?.data ?? null;

  // Rupee formatter for paise amounts.
  const paiseToRupees = (paise: number) =>
    (paise / 100).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const totalClicks = clicks.reduce((s, c) => s + c.clicks, 0);
  const totalUniqueClickers = clicks.reduce((s, c) => s + c.uniqueClickers, 0);

  // Message funnel data for the BarChart.
  const funnelData = a
    ? [
        { name: 'Inbound', key: 'inbound', count: a.messages.inbound },
        { name: 'Outbound', key: 'outbound', count: a.messages.outbound },
        { name: 'Delivered', key: 'delivered', count: a.messages.delivered },
        { name: 'Read', key: 'read', count: a.messages.read },
        { name: 'Failed', key: 'failed', count: a.messages.failed },
      ]
    : [];

  const campaignChartData = a ? a.campaigns.map((c) => ({ name: c.status, value: c.count })) : [];
  const templateChartData = a ? a.templates.map((t) => ({ name: t.status, count: t.count })) : [];

  // Heatmap: build a 7×24 lookup keyed by `dow-hour`, plus the busiest count
  // for color scaling.
  const heatLookup = new Map<string, number>();
  for (const p of heatmap) heatLookup.set(`${p.dow}-${p.hour}`, p.count);
  const heatMax = heatmap.reduce((m, p) => (p.count > m ? p.count : m), 0);
  // Every label the grid renders has to name the direction, or the toggle silently
  // changes what the numbers mean.
  const heatNoun =
    heatDirection === 'INBOUND' ? 'inbound' : heatDirection === 'OUTBOUND' ? 'outbound' : '';

  // Keyword breakdown: top 12 inbound words, sorted desc.
  const keywordChartData = [...keywords]
    .sort((x, y) => y.count - x.count)
    .slice(0, 12)
    .map((k) => ({ word: k.word, count: k.count }));

  // Channel-health history → numeric quality line (with date + tier carried for
  // the tooltip / change markers).
  const healthChartData = healthHistory.map((h) => ({
    date: h.date,
    score: QUALITY_SCORE[h.quality] ?? 0,
    quality: h.quality,
    tier: h.tier,
  }));
  // Indices where the tier changed vs. the previous snapshot (for annotation).
  const tierChangeDates = new Set<string>();
  for (let i = 1; i < healthHistory.length; i++) {
    if (healthHistory[i].tier !== healthHistory[i - 1].tier && healthHistory[i].tier != null) {
      tierChangeDates.add(healthHistory[i].date);
    }
  }

  // CSAT: render whole/half stars from the 1-5 average, plus a 1→5 bar list.
  const csatAvg = csat?.averageScore ?? null;
  const csatStars = Array.from({ length: 5 }, (_, i) => {
    const slot = i + 1;
    if (csatAvg == null) return 'empty' as const;
    if (csatAvg >= slot) return 'full' as const;
    if (csatAvg >= slot - 0.5) return 'half' as const;
    return 'empty' as const;
  });
  const csatDist = [5, 4, 3, 2, 1].map((score) => ({
    score,
    count: csat?.distribution?.find((d) => d.score === score)?.count ?? 0,
  }));
  const csatDistMax = csatDist.reduce((m, d) => (d.count > m ? d.count : m), 0);

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="whatsapp.analytics.view"
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]">
              <BarChart3 className="h-6 w-6 text-emerald-600" /> WhatsApp Analytics
            </h1>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Showing {rangeLabel}. Contact, template and campaign counts are current totals, not
              windowed.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex rounded-lg border border-[var(--border)] bg-white p-0.5"
              role="group"
              aria-label="Date range"
            >
              {RANGE_PRESETS.map((r) => (
                <button
                  key={r.label}
                  type="button"
                  aria-pressed={days === r.days}
                  onClick={() => {
                    setDays(r.days);
                    setCustomDays('');
                  }}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    days === r.days
                      ? 'bg-emerald-600 text-white'
                      : 'text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]',
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {/* Only worth the space once a second number is connected. */}
            {channels.length > 1 && (
              <div className="min-w-[190px]">
                <Select
                  size="sm"
                  clearable={false}
                  value={channelId}
                  onChange={setChannelId}
                  aria-label="WhatsApp number"
                  options={[
                    { value: '', label: 'All numbers' },
                    ...channels.map((c) => ({
                      value: c.id,
                      label: c.displayName || c.displayPhone,
                    })),
                  ]}
                />
              </div>
            )}
            <input
              type="number"
              min={1}
              max={365}
              value={customDays}
              aria-label="Custom range in days"
              placeholder="Custom days"
              onChange={(e) => setCustomDays(e.target.value)}
              onBlur={() => {
                const n = parseInt(customDays, 10);
                if (Number.isFinite(n) && n > 0) setDays(Math.min(n, 365));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              className="h-8 w-28 rounded-lg border border-[var(--border)] bg-white px-2 text-xs text-[var(--text)]"
            />
            <Button
              variant="secondary"
              leftIcon={
                exportMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )
              }
              onClick={() => exportMut.mutate()}
              disabled={exportMut.isPending}
            >
              Export CSV
            </Button>
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
              Sync health
            </Button>
          </div>
        </div>
        {isLoading && !overviewError && (
          <p className="text-center text-sm text-[var(--text-muted)]">Loading…</p>
        )}
        {overviewError && (
          <div className="rounded-xl border border-[var(--border)] bg-white">
            <SectionError
              onRetry={() => void refetchOverview()}
              label="Couldn't load analytics overview."
            />
          </div>
        )}

        {a && (
          <>
            {a.channel && (
              <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border border-[var(--border)] bg-white p-4">
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Number</p>
                  <p className="font-semibold text-[var(--text)]">{a.channel.displayPhone}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Quality</p>
                  <p className={cn('font-semibold', QUALITY_COLOR[a.channel.qualityRating])}>
                    {a.channel.qualityRating}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Messaging tier</p>
                  <p className="font-semibold text-[var(--text)]">
                    {a.channel.messagingTier ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Status</p>
                  <p
                    className={cn(
                      'font-semibold',
                      a.channel.isActive ? 'text-emerald-600' : 'text-red-600',
                    )}
                  >
                    {a.channel.isActive ? 'Active' : 'Inactive'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Chatwoot bridge</p>
                  <p
                    className={cn(
                      'font-semibold',
                      a.bridge.enabled ? 'text-emerald-600' : 'text-gray-500',
                    )}
                  >
                    {a.bridge.enabled ? 'On' : 'Off'}
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat
                label="Inbound"
                value={a.messages.inbound}
                change={delta(a.messages.inbound, prev?.inbound)}
              />
              <Stat
                label="Outbound"
                value={a.messages.outbound}
                change={delta(a.messages.outbound, prev?.outbound)}
              />
              <Stat
                label="Delivered"
                value={a.messages.delivered}
                change={delta(a.messages.delivered, prev?.delivered)}
              />
              <Stat
                label="Read"
                value={a.messages.read}
                change={delta(a.messages.read, prev?.read)}
              />
              <Stat
                label="Failed"
                value={a.messages.failed}
                change={delta(a.messages.failed, prev?.failed)}
                invertChange
              />
              <Stat
                label="Conversations"
                value={a.conversations.total}
                hint={`${a.conversations.open} open`}
              />
            </div>

            {/* Estimated campaign spend */}
            <div className="rounded-xl border border-[var(--border)] bg-white p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                <IndianRupee className="h-4 w-4 text-emerald-600" /> Estimated campaign spend
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-2xl font-bold text-[var(--text)]">₹{totalCostRupees}</p>
                  <p className="text-xs text-[var(--text-muted)]">Total estimated spend</p>
                </div>
                <div>
                  {/* Server-side count over the SAME campaigns the total sums. This
                      used to be `listCampaigns({ limit: 100 }).length`, so a
                      deployment with 300 campaigns showed a total over all of them
                      sitting next to the caption "Campaigns counted: 100". */}
                  <p className="text-2xl font-bold text-[var(--text)]">
                    {(cost?.campaignCount ?? 0).toLocaleString('en-IN')}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">Launched campaigns</p>
                </div>
              </div>
            </div>

            {/* Conversion summary — total recorded conversions + value */}
            <div className="rounded-xl border border-[var(--border)] bg-white p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                <Target className="h-4 w-4 text-amber-500" /> Conversions
              </div>
              {conversionError ? (
                <SectionError
                  onRetry={() => void refetchConversion()}
                  label="Couldn't load conversion summary."
                />
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Stat
                    label="Total conversions"
                    value={(conversion?.count ?? 0).toLocaleString('en-IN')}
                    hint={`recorded attributions, ${rangeLabel}`}
                  />
                  <Stat
                    label="Total value"
                    value={`₹${paiseToRupees(conversion?.totalValuePaise ?? 0)}`}
                    hint={`summed conversion value, ${rangeLabel}`}
                  />
                </div>
              )}
              {/* Which campaign actually converted. The server has always
                  computed this breakdown and the page threw it away, so the one
                  question conversion tracking exists to answer — where to spend
                  the next send — had no answer anywhere in the console. */}
              {!conversionError && conversion && conversion.byCampaign.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">
                    Which campaign converted — most conversions first
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-[var(--text-muted)]">
                        <tr>
                          <th className="py-1 pr-3 font-medium">Campaign</th>
                          <th className="py-1 pr-3 text-right font-medium">Conversions</th>
                          <th className="py-1 pr-3 text-right font-medium">Value</th>
                          <th className="py-1 text-right font-medium">Per recipient</th>
                        </tr>
                      </thead>
                      <tbody>
                        {conversion.byCampaign.map((r) => (
                          <tr key={r.campaignId} className="border-t border-[var(--border)]">
                            <td className="py-1.5 pr-3 text-[var(--text)]">{r.name}</td>
                            <td className="py-1.5 pr-3 text-right">
                              {r.count.toLocaleString('en-IN')}
                            </td>
                            <td className="py-1.5 pr-3 text-right text-[var(--text-muted)]">
                              ₹{paiseToRupees(r.valuePaise)}
                            </td>
                            {/* Blank rather than ₹0.00 when the campaign has no
                                recorded sends: a zero here reads as "earned
                                nothing per recipient", which is a different
                                claim from "we cannot divide yet". */}
                            <td className="py-1.5 text-right font-semibold text-emerald-600">
                              {r.sent > 0 ? `₹${paiseToRupees(r.valuePerRecipientPaise)}` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Message funnel BarChart (replaces the CSS RateBar component) */}
            <div className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-4">
              <h2 className="text-sm font-semibold text-[var(--text)]">Message funnel</h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={funnelData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--border)' }}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--bg-secondary)' }} />
                  <Bar dataKey="count" name="Messages" radius={[4, 4, 0, 0]}>
                    {funnelData.map((d) => (
                      <Cell key={d.key} fill={FUNNEL_COLORS[d.key]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-3 gap-3 text-xs text-[var(--text-secondary)]">
                <span>
                  Delivery rate:{' '}
                  <span className="font-semibold text-[var(--text)]">
                    {a.messages.deliveryRate}%
                  </span>
                </span>
                <span>
                  Read rate:{' '}
                  <span className="font-semibold text-[var(--text)]">{a.messages.readRate}%</span>
                </span>
                <span>
                  Fail rate:{' '}
                  <span className="font-semibold text-[var(--text)]">{a.messages.failRate}%</span>
                </span>
              </div>
            </div>

            {/* Messages over time — multi-series line chart */}
            <div className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-4">
              <h2 className="text-sm font-semibold text-[var(--text)]">
                Messages over time (last {seriesDays} days){a?.tz ? ` · times in ${a.tz}` : ''}
              </h2>
              {timeSeriesError ? (
                <SectionError onRetry={() => void refetchTimeSeries()} />
              ) : !hasMessageActivity ? (
                <p className="text-xs text-[var(--text-muted)]">No message activity yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={timeSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--border)' }}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="inbound"
                      name="Inbound"
                      stroke={FUNNEL_COLORS.inbound}
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="outbound"
                      name="Outbound"
                      stroke={FUNNEL_COLORS.outbound}
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="delivered"
                      name="Delivered"
                      stroke={FUNNEL_COLORS.delivered}
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="read"
                      name="Read"
                      stroke={FUNNEL_COLORS.read}
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="failed"
                      name="Failed"
                      stroke={FUNNEL_COLORS.failed}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* SLA card row */}
            {slaError ? (
              <div className="rounded-xl border border-[var(--border)] bg-white">
                <SectionError
                  onRetry={() => void refetchSla()}
                  label="Couldn't load SLA metrics."
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat
                  label="Avg first response"
                  value={sla?.avgFirstResponseMins != null ? `${sla.avgFirstResponseMins}m` : '—'}
                  hint="time to first agent reply"
                />
                <Stat
                  label="Avg resolution"
                  value={sla?.avgResolutionMins != null ? `${sla.avgResolutionMins}m` : '—'}
                  hint="time to resolved"
                />
                <Stat label="Open" value={sla?.openCount ?? 0} hint="conversations" />
                <Stat label="Resolved" value={sla?.resolvedCount ?? 0} hint="conversations" />
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Opt-out trend — area chart */}
              <div className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-4">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text)]">
                  <UserMinus className="h-4 w-4 text-red-500" /> Opt-out trend (last {seriesDays}{' '}
                  days){a?.tz ? ` · times in ${a.tz}` : ''}
                </h2>
                {optOutSummaryError ? (
                  <SectionError onRetry={() => void refetchOptOutSummary()} />
                ) : (
                  optOutSummary && (
                    <div className="grid grid-cols-3 gap-2">
                      <Stat label="Opt-outs" value={optOutSummary.optOuts} />
                      <Stat label="Opt-ins" value={optOutSummary.optIns} hint="re-subscribed" />
                      <Stat
                        label="Rate"
                        value={optOutSummary.ratePer1000}
                        hint="per 1,000 delivered"
                      />
                    </div>
                  )
                )}
                {optOutError ? (
                  <SectionError onRetry={() => void refetchOptOut()} />
                ) : !hasOptOutActivity ? (
                  <p className="text-xs text-[var(--text-muted)]">No opt-outs in this window.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={optOut}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                        tickLine={false}
                        axisLine={{ stroke: 'var(--border)' }}
                      />
                      <YAxis
                        tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Area
                        type="monotone"
                        dataKey="count"
                        name="Opt-outs"
                        stroke="#ef4444"
                        fill="#ef4444"
                        fillOpacity={0.15}
                        strokeWidth={2}
                      />
                      <Area
                        type="monotone"
                        dataKey="optIns"
                        name="Opt-ins"
                        stroke="#10b981"
                        fill="#10b981"
                        fillOpacity={0.12}
                        strokeWidth={2}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
                {optOutSummary && optOutSummary.byCampaign.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">
                      Which campaign burned the list — worst rate first
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="text-[var(--text-muted)]">
                          <tr>
                            <th className="py-1 pr-3 font-medium">Campaign</th>
                            <th className="py-1 pr-3 text-right font-medium">Opt-outs</th>
                            <th className="py-1 pr-3 text-right font-medium">Delivered</th>
                            <th className="py-1 text-right font-medium">Per 1,000</th>
                          </tr>
                        </thead>
                        <tbody>
                          {optOutSummary.byCampaign.slice(0, 8).map((r) => (
                            <tr key={r.campaignId} className="border-t border-[var(--border)]">
                              <td className="py-1.5 pr-3 text-[var(--text)]">{r.name}</td>
                              <td className="py-1.5 pr-3 text-right">{r.optOuts}</td>
                              <td className="py-1.5 pr-3 text-right text-[var(--text-muted)]">
                                {r.delivered.toLocaleString('en-IN')}
                              </td>
                              <td className="py-1.5 text-right font-semibold text-red-600">
                                {r.ratePer1000}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {optOutSummary.unattributed > 0 && (
                      <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">
                        {optOutSummary.unattributed} opt-out(s) could not be attributed to a
                        campaign (organic STOP, manual or import).
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Actual vs estimated cost summary */}
              <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                  <IndianRupee className="h-4 w-4 text-emerald-600" /> Actual vs. estimated spend
                </div>
                {costError ? (
                  <SectionError
                    onRetry={() => void refetchCost()}
                    label="Couldn't load cost data."
                  />
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {/* The unit comes from the data, not from the page.
                        Meta bills in the WABA's own currency and quotes 4-6
                        decimals per message, so a hardcoded ₹ printed foreign
                        cents as rupees, and the stored whole-minor-unit rounding
                        turned 0.0383 into 4 — several percent out per message,
                        compounding over every row. The exact decimal total is
                        shown when Meta reported one. */}
                    <Stat
                      label="Actual billed"
                      value={
                        cost?.totalActualCostPaise == null
                          ? '—'
                          : cost.actualCurrency && cost.actualCurrency !== 'INR'
                            ? `${cost.totalActualCostAmount ?? paiseToRupees(cost.totalActualCostPaise)} ${cost.actualCurrency}`
                            : `₹${cost.totalActualCostAmount ?? paiseToRupees(cost.totalActualCostPaise)}`
                      }
                      hint={
                        cost?.totalActualCostPaise == null
                          ? 'not reported by Meta webhooks'
                          : cost.actualCurrency === 'MIXED'
                            ? 'several billing currencies in this window — not a single total'
                            : cost.actualComparable === false
                              ? `billed in ${cost.actualCurrency} — not comparable with the ₹ estimate`
                              : 'summed message pricing'
                      }
                    />
                    <Stat
                      label="Estimated"
                      value={`₹${paiseToRupees(cost?.totalEstimatedCostPaise ?? 0)}`}
                      hint="campaign projections"
                    />
                  </div>
                )}
                {!costError && cost?.meta?.available && (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">
                      Meta billed vs. our estimate
                      {cost.meta.currency ? ` · ${cost.meta.currency}` : ''}
                    </p>
                    {/* A conversation-billed (CBP) WABA has no per-message
                        pricing rows at all, so this block used to render a
                        header row over an empty table while the account's entire
                        Meta spend sat in the two conversation fields. */}
                    {cost.meta.conversationCount > 0 && (
                      <div className="mb-2 flex items-center justify-between rounded-lg bg-[var(--bg-secondary)] px-3 py-2 text-xs">
                        <span className="text-[var(--text-secondary)]">
                          Conversation-based billing ·{' '}
                          {cost.meta.conversationCount.toLocaleString('en-IN')} conversations
                        </span>
                        <span className="font-semibold text-[var(--text)]">
                          {paiseToRupees(cost.meta.conversationCostMinor)}{' '}
                          {cost.meta.currency ?? ''}
                        </span>
                      </div>
                    )}
                    {cost.meta.byCategory.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="text-[var(--text-muted)]">
                            <tr>
                              <th className="py-1 pr-3 font-medium">Category</th>
                              <th className="py-1 pr-3 text-right font-medium">Msgs</th>
                              <th className="py-1 pr-3 text-right font-medium">Meta rate</th>
                              <th className="py-1 pr-3 text-right font-medium">Our estimate</th>
                              <th className="py-1 text-right font-medium">Variance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cost.meta.byCategory.map((r) => (
                              <tr key={r.category} className="border-t border-[var(--border)]">
                                <td className="py-1.5 pr-3 text-[var(--text)] capitalize">
                                  {r.category.toLowerCase()}
                                </td>
                                <td className="py-1.5 pr-3 text-right">
                                  {r.volume.toLocaleString('en-IN')}
                                </td>
                                <td className="py-1.5 pr-3 text-right">
                                  {r.observedRateMinor == null
                                    ? '—'
                                    : paiseToRupees(r.observedRateMinor)}
                                </td>
                                <td className="py-1.5 pr-3 text-right text-[var(--text-muted)]">
                                  {paiseToRupees(r.estimatedRatePaise)}
                                </td>
                                <td
                                  className={cn(
                                    'py-1.5 text-right font-semibold',
                                    r.variancePct == null
                                      ? 'text-[var(--text-muted)]'
                                      : Math.abs(r.variancePct) > 15
                                        ? 'text-red-600'
                                        : 'text-emerald-600',
                                  )}
                                >
                                  {r.variancePct == null
                                    ? '—'
                                    : `${r.variancePct > 0 ? '+' : ''}${r.variancePct}%`}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">
                      {cost.meta.byCategory.length > 0
                        ? `Rates are per message in ${cost.meta.currency ?? 'your billing currency'}. `
                        : ''}
                      {cost.meta.estimateComparable
                        ? 'Estimates above this line are priced from the observed Meta rate once it is known.'
                        : `Meta bills this account in ${cost.meta.currency ?? 'a currency we could not read'}, so the ₹ estimates cannot be compared with it and the variance is withheld.`}
                      {cost.meta.lastSyncedAt
                        ? ` Last synced ${new Date(cost.meta.lastSyncedAt).toLocaleString('en-IN')}.`
                        : ''}
                    </p>
                  </div>
                )}
                {!costError && cost && cost.byCategory.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">
                      Actual by category
                    </p>
                    <div className="space-y-1.5">
                      {cost.byCategory.map((c) => (
                        <div key={c.category} className="flex items-center justify-between text-sm">
                          <span className="text-[var(--text-secondary)] capitalize">
                            {c.category}
                          </span>
                          <span className="font-semibold text-[var(--text)]">
                            ₹{paiseToRupees(c.costPaise)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Per-agent productivity table */}
            <div className="rounded-xl border border-[var(--border)] bg-white p-4">
              <h2 className="mb-1 text-sm font-semibold text-[var(--text)]">Agent productivity</h2>
              <p className="mb-3 text-xs text-[var(--text-muted)]">
                {days ? `Last ${days} days` : 'All time'} · top 50 by messages sent. Reply times are
                per conversation, so p90 is this agent&rsquo;s slowest thread.
              </p>
              {agentsError ? (
                <SectionError onRetry={() => void refetchAgents()} />
              ) : agents.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">No agent activity yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                        <th className="py-2 pr-4 font-medium">Agent</th>
                        <th className="py-2 pr-4 text-right font-medium">Messages sent</th>
                        <th className="py-2 pr-4 text-right font-medium">Assigned</th>
                        <th className="py-2 pr-4 text-right font-medium">Resolved</th>
                        <th
                          className="py-2 pr-4 text-right font-medium"
                          title="Mean time to an agent reply"
                        >
                          Avg reply
                        </th>
                        <th
                          className="py-2 pr-4 text-right font-medium"
                          title="Median time to an agent reply"
                        >
                          p50
                        </th>
                        <th
                          className="py-2 pr-4 text-right font-medium"
                          title="90th-percentile reply time — the slow tail an SLA is written against"
                        >
                          p90
                        </th>
                        <th className="py-2 pr-4 text-right font-medium">Avg resolution</th>
                        <th className="py-2 text-right font-medium" title="Mean CSAT (1-5)">
                          CSAT
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {agents.map((ag) => (
                        <tr
                          key={ag.userId}
                          className="border-b border-[var(--border)] last:border-0"
                        >
                          <td className="py-2 pr-4 font-medium text-[var(--text)]">{ag.name}</td>
                          <td className="py-2 pr-4 text-right text-[var(--text-secondary)]">
                            {ag.messagesSent}
                          </td>
                          <td className="py-2 pr-4 text-right text-[var(--text-secondary)]">
                            {ag.conversationsAssigned}
                          </td>
                          <td className="py-2 pr-4 text-right text-[var(--text-secondary)]">
                            {ag.conversationsResolved}
                          </td>
                          <td className="py-2 pr-4 text-right text-[var(--text-secondary)]">
                            {mins(ag.avgResponseMins)}
                          </td>
                          <td className="py-2 pr-4 text-right text-[var(--text-secondary)]">
                            {mins(ag.p50ResponseMins)}
                          </td>
                          <td className="py-2 pr-4 text-right text-[var(--text-secondary)]">
                            {mins(ag.p90ResponseMins)}
                          </td>
                          <td className="py-2 pr-4 text-right text-[var(--text-secondary)]">
                            {mins(ag.avgResolutionMins)}
                          </td>
                          {/* The rating count rides along: a 5.0 from one survey
                              and a 4.6 from ninety are not the same claim. */}
                          <td className="py-2 text-right text-[var(--text-secondary)]">
                            {ag.csatCount > 0 ? (
                              <>
                                {ag.csatAvg?.toFixed(1)}
                                <span className="text-[var(--text-muted)]"> ({ag.csatCount})</span>
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">Contacts</h2>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Total" value={a.contacts.total} />
                  <Stat label="Opted in" value={a.contacts.optedIn} />
                  <Stat label="Opted out" value={a.contacts.optedOut} />
                  <Stat label="Blocked" value={a.contacts.blocked} />
                </div>
              </div>

              {/* Templates by status — BarChart */}
              <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">
                  Templates by status
                </h2>
                {templateChartData.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">No templates.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={templateChartData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                        tickLine={false}
                        axisLine={{ stroke: 'var(--border)' }}
                        allowDecimals={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={90}
                        tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        cursor={{ fill: 'var(--bg-secondary)' }}
                      />
                      <Bar dataKey="count" name="Templates" radius={[0, 4, 4, 0]}>
                        {templateChartData.map((d, i) => (
                          <Cell key={d.name} fill={PALETTE[i % PALETTE.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Campaigns by status — PieChart */}
              <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">
                  Campaigns by status
                </h2>
                {campaignChartData.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">No campaigns.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={campaignChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                      >
                        {campaignChartData.map((d, i) => (
                          <Cell key={d.name} fill={PALETTE[i % PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* ── P3: Busiest-hours heatmap ── */}
            <div className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-[var(--text)]">
                  Busiest hours (last {seriesDays} days){a?.tz ? ` · times in ${a.tz}` : ''}
                </h2>
                <div className="min-w-[170px]">
                  <Select
                    size="sm"
                    clearable={false}
                    value={heatDirection}
                    onChange={(v) => setHeatDirection(v as WaHeatmapDirection)}
                    options={[
                      { value: 'INBOUND', label: 'Inbound (customers)' },
                      { value: 'OUTBOUND', label: 'Outbound (us)' },
                      { value: 'ALL', label: 'All messages' },
                    ]}
                  />
                </div>
                {heatMax > 0 && (
                  <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                    <span>Less</span>
                    <div className="flex h-3 overflow-hidden rounded">
                      {[0.15, 0.35, 0.55, 0.75, 1].map((r) => (
                        <span
                          key={r}
                          className="h-3 w-4"
                          style={{ backgroundColor: heatColor(Math.round(r * heatMax), heatMax) }}
                        />
                      ))}
                    </div>
                    <span>More</span>
                  </div>
                )}
              </div>
              {heatmapError ? (
                <SectionError onRetry={() => void refetchHeatmap()} />
              ) : heatMax === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">
                  No {heatNoun && `${heatNoun} `}message activity yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="border-separate border-spacing-1" role="grid">
                    <thead>
                      <tr>
                        <th className="w-9" aria-hidden="true" />
                        {HOUR_LABELS.map((h) => (
                          <th
                            key={h}
                            scope="col"
                            className="w-5 text-center text-[9px] font-normal text-[var(--text-muted)]"
                          >
                            {h % 3 === 0 ? h : ''}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {DOW_LABELS.map((day, dow) => (
                        <tr key={day}>
                          <th
                            scope="row"
                            className="pr-1 text-right text-[10px] font-medium text-[var(--text-muted)]"
                          >
                            {day}
                          </th>
                          {HOUR_LABELS.map((hour) => {
                            const count = heatLookup.get(`${dow}-${hour}`) ?? 0;
                            const cellLabel = `${day} ${hour}:00 — ${count} ${
                              heatNoun ? `${heatNoun} ` : ''
                            }message${count === 1 ? '' : 's'}`;
                            return (
                              <td key={hour} aria-label={cellLabel} className="p-0">
                                <UiTooltip content={cellLabel} inline>
                                  <span
                                    className="block h-5 w-5 rounded-sm border border-[var(--border)]"
                                    style={{ backgroundColor: heatColor(count, heatMax) }}
                                  />
                                </UiTooltip>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* ── P3: Keyword breakdown ── */}
              <div className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-4">
                <h2 className="text-sm font-semibold text-[var(--text)]">
                  Top inbound keywords (last {seriesDays} days)
                </h2>
                {keywordsError ? (
                  <SectionError onRetry={() => void refetchKeywords()} />
                ) : keywordChartData.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">No inbound keywords yet.</p>
                ) : (
                  <ResponsiveContainer
                    width="100%"
                    height={Math.max(240, keywordChartData.length * 28)}
                  >
                    <BarChart data={keywordChartData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                        tickLine={false}
                        axisLine={{ stroke: 'var(--border)' }}
                        allowDecimals={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="word"
                        width={110}
                        tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        cursor={{ fill: 'var(--bg-secondary)' }}
                      />
                      <Bar
                        dataKey="count"
                        name="Mentions"
                        radius={[0, 4, 4, 0]}
                        fill={FUNNEL_COLORS.inbound}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* ── P3: CSAT summary ── */}
              <div className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-4">
                <h2 className="text-sm font-semibold text-[var(--text)]">Customer satisfaction</h2>
                {csatError ? (
                  <SectionError onRetry={() => void refetchCsat()} label="Couldn't load CSAT." />
                ) : !csat || csat.ratedCount === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">No CSAT ratings yet.</p>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-baseline gap-3">
                      <span className="text-3xl font-bold text-[var(--text)]">
                        {csatAvg != null ? csatAvg.toFixed(1) : '—'}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">out of 5</span>
                    </div>
                    <div
                      className="flex items-center gap-1"
                      role="img"
                      aria-label={`Average rating ${csatAvg != null ? csatAvg.toFixed(1) : 0} of 5 from ${csat.ratedCount} ratings`}
                    >
                      {csatStars.map((kind, i) => (
                        <span key={i} className="relative inline-block h-6 w-6">
                          <Star className="absolute inset-0 h-6 w-6 text-[var(--border)]" />
                          {kind !== 'empty' && (
                            <span
                              className="absolute inset-0 overflow-hidden"
                              style={{ width: kind === 'half' ? '50%' : '100%' }}
                            >
                              <Star className="h-6 w-6 fill-amber-400 text-amber-400" />
                            </span>
                          )}
                        </span>
                      ))}
                      <span className="ml-2 text-xs text-[var(--text-muted)]">
                        {csat.ratedCount} rated
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {csatDist.map((d) => (
                        <div key={d.score} className="flex items-center gap-2 text-xs">
                          <span className="flex w-8 items-center gap-0.5 text-[var(--text-secondary)]">
                            {d.score}
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                          </span>
                          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
                            <div
                              className="h-full rounded-full bg-amber-400"
                              style={{
                                width: `${csatDistMax > 0 ? (d.count / csatDistMax) * 100 : 0}%`,
                              }}
                            />
                          </div>
                          <span className="w-8 text-right font-medium text-[var(--text)]">
                            {d.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── P3: Channel health history ── */}
            <div className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-[var(--text)]">
                  Channel health history (last {seriesDays} days)
                </h2>
                {/* Only worth screen space once a second number is connected —
                    with one channel there is nothing to choose between. */}
                {channels.length > 1 && (
                  <div className="min-w-[180px]">
                    <Select
                      size="sm"
                      clearable={false}
                      value={healthChannel}
                      onChange={setHealthChannel}
                      options={[
                        { value: '', label: 'Default number' },
                        ...channels.map((c) => ({
                          value: c.id,
                          label: c.displayName || c.displayPhone,
                        })),
                      ]}
                    />
                  </div>
                )}
              </div>
              {healthHistoryError ? (
                <SectionError onRetry={() => void refetchHealthHistory()} />
              ) : healthChartData.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">No health snapshots yet.</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={healthChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                        tickLine={false}
                        axisLine={{ stroke: 'var(--border)' }}
                      />
                      <YAxis
                        domain={[0, 3]}
                        ticks={[1, 2, 3]}
                        tickFormatter={(v: number) => QUALITY_SCORE_LABEL[v] ?? ''}
                        tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                        tickLine={false}
                        axisLine={false}
                        width={64}
                      />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(value, _name, item) => {
                          const score = Number(value);
                          const tier = (item?.payload as { tier?: string | null } | undefined)
                            ?.tier;
                          return [
                            `${QUALITY_SCORE_LABEL[score] ?? 'UNKNOWN'}${tier ? ` · ${tier}` : ''}`,
                            'Quality',
                          ];
                        }}
                      />
                      <Line
                        type="stepAfter"
                        dataKey="score"
                        name="Quality"
                        stroke={FUNNEL_COLORS.delivered}
                        strokeWidth={2}
                        dot={(props) => {
                          const { cx, cy, payload, index } = props as {
                            cx: number;
                            cy: number;
                            index: number;
                            payload: { date: string };
                          };
                          const isChange = tierChangeDates.has(payload.date);
                          return (
                            <circle
                              key={index}
                              cx={cx}
                              cy={cy}
                              r={isChange ? 5 : 2.5}
                              fill={isChange ? '#f59e0b' : FUNNEL_COLORS.delivered}
                              stroke="white"
                              strokeWidth={isChange ? 2 : 0}
                            />
                          );
                        }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  {tierChangeDates.size > 0 && (
                    <p className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                      <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
                      Amber markers indicate a messaging-tier change.
                    </p>
                  )}
                </>
              )}
            </div>

            {/* ── Link click-through ── */}
            <div className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text)]">
                  <MousePointerClick className="h-4 w-4 text-purple-500" /> Link clicks (last{' '}
                  {seriesDays} days)
                </h2>
                <span className="text-xs text-[var(--text-muted)]">
                  {totalClicks.toLocaleString('en-IN')} clicks ·{' '}
                  {totalUniqueClickers.toLocaleString('en-IN')} unique clickers
                </span>
              </div>
              {clickError ? (
                <SectionError onRetry={() => void refetchClicks()} />
              ) : clicks.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">
                  No tracked clicks in this window. Add a trackable link to a campaign to start
                  measuring click-through.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={clicks}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--border)' }}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area
                      type="monotone"
                      dataKey="clicks"
                      name="Clicks"
                      stroke="#a855f7"
                      fill="#a855f7"
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="uniqueClickers"
                      name="Unique clickers"
                      stroke="#6366f1"
                      fill="#6366f1"
                      fillOpacity={0.12}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* ── Click-to-WhatsApp ad acquisition ── */}
            <div className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text)]">
                  <Megaphone className="h-4 w-4 text-sky-500" /> Click-to-WhatsApp ads (last{' '}
                  {seriesDays} days)
                </h2>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={
                    ctwaExportMut.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )
                  }
                  onClick={() => ctwaExportMut.mutate()}
                  disabled={ctwaExportMut.isPending || !ctwa || ctwa.totalContacts === 0}
                >
                  Export ctwa_clid
                </Button>
              </div>
              {ctwaError ? (
                <SectionError onRetry={() => void refetchCtwa()} />
              ) : !ctwa || ctwa.rows.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">
                  No contacts arrived from a click-to-WhatsApp ad in this window.
                </p>
              ) : (
                <>
                  <p className="text-xs text-[var(--text-muted)]">
                    {ctwa.totalContacts.toLocaleString('en-IN')} contact(s) acquired from{' '}
                    {ctwa.rows.length} ad source(s). Export the ctwa_clid column to upload offline
                    conversions back to Meta Ads Manager.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-[var(--text-muted)]">
                        <tr>
                          <th className="py-1 pr-3 font-medium">Source</th>
                          <th className="py-1 pr-3 font-medium">Headline</th>
                          <th className="py-1 pr-3 text-right font-medium">Contacts</th>
                          <th className="py-1 pr-3 text-right font-medium">Conversations</th>
                          <th className="py-1 pr-3 text-right font-medium">Conversions</th>
                          <th className="py-1 text-right font-medium">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ctwa.rows.slice(0, 20).map((r) => (
                          <tr
                            key={`${r.sourceId ?? ''}-${r.sourceType ?? ''}-${r.headline ?? ''}`}
                            className="border-t border-[var(--border)]"
                          >
                            <td className="py-1.5 pr-3 text-[var(--text)]">
                              {r.sourceType ?? 'ad'}
                              {r.sourceId ? (
                                <span className="ml-1 text-[var(--text-muted)]">{r.sourceId}</span>
                              ) : null}
                            </td>
                            <td className="max-w-[16rem] truncate py-1.5 pr-3 text-[var(--text-muted)]">
                              {r.headline ?? '—'}
                            </td>
                            <td className="py-1.5 pr-3 text-right">{r.contacts}</td>
                            <td className="py-1.5 pr-3 text-right">{r.conversations}</td>
                            <td className="py-1.5 pr-3 text-right">{r.conversions}</td>
                            <td className="py-1.5 text-right font-semibold text-[var(--text)]">
                              ₹{paiseToRupees(r.conversionValuePaise)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* ── Per-audience reporting ──
                Every panel above is global or per-number: the dashboard could say
                what the deployment did and never which audience did it, so "does
                segment A convert better than segment B" and "are the contacts we
                acquired in March still talking to us" had no answer at all. The
                segment table honours the page's range and number; the cohort table
                carries its own month control, because a retention curve over a
                seven-day window is a single point. */}
            <SegmentPerformanceSection days={days} channelId={channelParam} />
            <CohortRetentionSection channelId={channelParam} />

            {/* ── Official Meta Graph analytics (templates / conversations / pricing) ── */}
            <MetaAnalyticsSection days={seriesDays} />
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
