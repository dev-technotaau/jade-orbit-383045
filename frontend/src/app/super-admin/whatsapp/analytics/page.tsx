'use client';

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
import { showToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { superAdminWhatsappService as svc } from '@/services/super-admin-whatsapp.service';
import MetaAnalyticsSection from '@/components/super-admin/whatsapp/MetaAnalyticsSection';
import type { ApiError } from '@/types/api';

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-4">
      <p className="text-2xl font-bold text-[var(--text)]">{value}</p>
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

export default function SuperAdminWhatsappAnalyticsPage() {
  const {
    data,
    isLoading,
    isError: overviewError,
    refetch: refetchOverview,
  } = useQuery({
    queryKey: ['wa-analytics'],
    queryFn: () => svc.getAnalytics(),
    refetchInterval: 30_000,
  });
  const a = data?.data ?? null;
  const qc = useQueryClient();

  // Cost summary — sum estimated spend across campaigns.
  const { data: campaignsData } = useQuery({
    queryKey: ['wa-analytics-campaigns-cost'],
    queryFn: () => svc.listCampaigns({ limit: 100 }),
    refetchInterval: 30_000,
  });
  const campaigns = campaignsData?.data?.items ?? [];
  const totalCostPaise = campaigns.reduce((sum, c) => sum + (c.estimatedCostPaise ?? 0), 0);
  const totalCostRupees = (totalCostPaise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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
    queryKey: ['wa-analytics-timeseries'],
    queryFn: () => svc.getTimeSeries(30),
    refetchInterval: 30_000,
  });
  const timeSeries = timeSeriesData?.data ?? [];

  const {
    data: slaData,
    isError: slaError,
    refetch: refetchSla,
  } = useQuery({
    queryKey: ['wa-analytics-sla'],
    queryFn: () => svc.getSlaMetrics(),
    refetchInterval: 30_000,
  });
  const sla = slaData?.data ?? null;

  const {
    data: agentsData,
    isError: agentsError,
    refetch: refetchAgents,
  } = useQuery({
    queryKey: ['wa-analytics-agents'],
    queryFn: () => svc.getAgentProductivity(),
    refetchInterval: 30_000,
  });
  const agents = agentsData?.data ?? [];

  const {
    data: costData,
    isError: costError,
    refetch: refetchCost,
  } = useQuery({
    queryKey: ['wa-analytics-cost'],
    queryFn: () => svc.getCostSummary(),
    refetchInterval: 30_000,
  });
  const cost = costData?.data ?? null;

  const {
    data: optOutData,
    isError: optOutError,
    refetch: refetchOptOut,
  } = useQuery({
    queryKey: ['wa-analytics-optout'],
    queryFn: () => svc.getOptOutTrend(30),
    refetchInterval: 30_000,
  });
  const optOut = optOutData?.data ?? [];

  // ── P3 advanced analytics: heatmap, keywords, health history, CSAT ──
  const {
    data: heatmapData,
    isError: heatmapError,
    refetch: refetchHeatmap,
  } = useQuery({
    queryKey: ['wa-analytics-heatmap'],
    queryFn: () => svc.getHeatmap(30),
    refetchInterval: 60_000,
  });
  const heatmap = heatmapData?.data ?? [];

  const {
    data: keywordsData,
    isError: keywordsError,
    refetch: refetchKeywords,
  } = useQuery({
    queryKey: ['wa-analytics-keywords'],
    queryFn: () => svc.getKeywords(30),
    refetchInterval: 60_000,
  });
  const keywords = keywordsData?.data ?? [];

  const {
    data: healthHistoryData,
    isError: healthHistoryError,
    refetch: refetchHealthHistory,
  } = useQuery({
    queryKey: ['wa-analytics-health-history'],
    queryFn: () => svc.getHealthHistory(30),
    refetchInterval: 60_000,
  });
  const healthHistory = healthHistoryData?.data ?? [];

  const {
    data: csatData,
    isError: csatError,
    refetch: refetchCsat,
  } = useQuery({
    queryKey: ['wa-analytics-csat'],
    queryFn: () => svc.getCsat(),
    refetchInterval: 60_000,
  });
  const csat = csatData?.data ?? null;

  // Conversion summary — total recorded conversions + summed value (paise).
  const {
    data: conversionData,
    isError: conversionError,
    refetch: refetchConversion,
  } = useQuery({
    queryKey: ['wa-analytics-conversions'],
    queryFn: () => svc.getConversionSummary(),
    refetchInterval: 60_000,
  });
  const conversion = conversionData?.data ?? null;

  // Rupee formatter for paise amounts.
  const paiseToRupees = (paise: number) =>
    (paise / 100).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

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
  const csatAvg = csat?.average ?? null;
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
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]">
            <BarChart3 className="h-6 w-6 text-emerald-600" /> WhatsApp Analytics
          </h1>
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
              <Stat label="Inbound" value={a.messages.inbound} />
              <Stat label="Outbound" value={a.messages.outbound} />
              <Stat label="Delivered" value={a.messages.delivered} />
              <Stat label="Read" value={a.messages.read} />
              <Stat label="Failed" value={a.messages.failed} />
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
                  <p className="text-2xl font-bold text-[var(--text)]">{campaigns.length}</p>
                  <p className="text-xs text-[var(--text-muted)]">Campaigns counted</p>
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
                    hint="recorded attributions"
                  />
                  <Stat
                    label="Total value"
                    value={`₹${paiseToRupees(conversion?.totalValuePaise ?? 0)}`}
                    hint="summed conversion value"
                  />
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
                Messages over time (last 30 days)
              </h2>
              {timeSeriesError ? (
                <SectionError onRetry={() => void refetchTimeSeries()} />
              ) : timeSeries.length === 0 ? (
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
                <h2 className="text-sm font-semibold text-[var(--text)]">
                  Opt-out trend (last 30 days)
                </h2>
                {optOutError ? (
                  <SectionError onRetry={() => void refetchOptOut()} />
                ) : optOut.length === 0 ? (
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
                    </AreaChart>
                  </ResponsiveContainer>
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
                    <Stat
                      label="Actual billed"
                      value={`₹${paiseToRupees(cost?.totalActualCostPaise ?? 0)}`}
                      hint="summed message pricing"
                    />
                    <Stat
                      label="Estimated"
                      value={`₹${paiseToRupees(cost?.totalEstimatedCostPaise ?? 0)}`}
                      hint="campaign projections"
                    />
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
              <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">Agent productivity</h2>
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
                        <th className="py-2 text-right font-medium">Conversations assigned</th>
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
                          <td className="py-2 text-right text-[var(--text-secondary)]">
                            {ag.conversationsAssigned}
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
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-[var(--text)]">
                  Busiest hours (last 30 days)
                </h2>
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
                <p className="text-xs text-[var(--text-muted)]">No message activity yet.</p>
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
                            const cellLabel = `${day} ${hour}:00 — ${count} message${
                              count === 1 ? '' : 's'
                            }`;
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
                  Top inbound keywords (last 30 days)
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
                ) : !csat || csat.count === 0 ? (
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
                      aria-label={`Average rating ${csatAvg != null ? csatAvg.toFixed(1) : 0} of 5 from ${csat.count} ratings`}
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
                        {csat.count} rated
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
              <h2 className="text-sm font-semibold text-[var(--text)]">
                Channel health history (last 30 days)
              </h2>
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

            {/* ── Official Meta Graph analytics (templates / conversations / pricing) ── */}
            <MetaAnalyticsSection />
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
