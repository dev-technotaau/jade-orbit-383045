'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  BarChart3,
  ShieldCheck,
  Download,
  AlertTriangle,
  GitCompare,
  MonitorSmartphone,
  Globe,
  Trophy,
  TrendingUp,
  Mailbox,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import DatePicker from '@/components/ui/DatePicker';
import Pagination from '@/components/ui/Pagination';
import { superAdminEmailService as svc } from '@/services/super-admin-email.service';
import { showToast } from '@/components/ui/Toast';
import type { EmailNameCount } from '@/types/email';

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-4">
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="text-2xl font-bold text-[var(--text)]">{value}</p>
      {sub && <p className="text-xs text-[var(--text-muted)]">{sub}</p>}
    </div>
  );
}

function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
        {icon}
        {title}
      </h2>
      {children}
    </div>
  );
}

/** Horizontal proportional bar list for categorical counts. */
function BarList({
  items,
  color = '#6366f1',
  empty,
}: {
  items: EmailNameCount[];
  color?: string;
  empty: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  if (items.length === 0) return <p className="text-sm text-[var(--text-muted)]">{empty}</p>;
  return (
    <div className="space-y-2">
      {items.map((i) => (
        <div key={i.name} className="flex items-center gap-2 text-sm">
          <span className="w-28 shrink-0 truncate text-[var(--text-secondary)]" title={i.name}>
            {i.name}
          </span>
          <div className="h-4 flex-1 overflow-hidden rounded bg-[var(--bg-secondary)]">
            <div
              className="h-full rounded"
              style={{ width: `${(i.count / max) * 100}%`, backgroundColor: color }}
            />
          </div>
          <span className="w-12 shrink-0 text-right text-[var(--text-muted)] tabular-nums">
            {i.count.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_COMPARE = 5;
// Deliverability thresholds (industry rule-of-thumb): warn/critical.
const BOUNCE_WARN = 2;
const BOUNCE_CRIT = 5;
const COMPLAINT_WARN = 0.1;
const COMPLAINT_CRIT = 0.3;

function toIso(dateValue: string, endOfDay: boolean): string | undefined {
  if (!dateValue) return undefined;
  const d = new Date(`${dateValue}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export default function SuperAdminEmailAnalyticsPage() {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const from = toIso(fromDate, false);
  const to = toIso(toDate, true);
  // Admin's timezone — used only in query params (not rendered) to avoid SSR mismatch.
  const tz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }, []);
  const range = useMemo(() => ({ from, to, tz }), [from, to, tz]);

  const [bounceType, setBounceType] = useState<'' | 'BOUNCE' | 'COMPLAINT'>('');
  const [bouncePage, setBouncePage] = useState(1);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<
    import('@/types/email').EmailCampaignComparison[] | null
  >(null);
  const [comparing, setComparing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const rk = [range.from, range.to, range.tz];

  const ovQ = useQuery({
    queryKey: ['ea-overview', ...rk],
    queryFn: () => svc.overview(range),
    refetchInterval: 30_000,
  });
  const tsQ = useQuery({
    queryKey: ['ea-timeseries', ...rk],
    queryFn: () => svc.timeseries(range),
    refetchInterval: 30_000,
  });
  const delQ = useQuery({
    queryKey: ['ea-deliverability', ...rk],
    queryFn: () => svc.deliverability(range),
  });
  const hmQ = useQuery({ queryKey: ['ea-heatmap', ...rk], queryFn: () => svc.heatmap(range) });
  const tlQ = useQuery({
    queryKey: ['ea-toplinks', ...rk],
    queryFn: () => svc.topLinks({ ...range, limit: 10 }),
  });
  const clientsQ = useQuery({
    queryKey: ['ea-clients', ...rk],
    queryFn: () => svc.analyticsClients(range),
  });
  const domainsQ = useQuery({
    queryKey: ['ea-domains', ...rk],
    queryFn: () => svc.analyticsDomains(range),
  });
  const lbQ = useQuery({
    queryKey: ['ea-leaderboard'],
    queryFn: () => svc.analyticsLeaderboard(15),
  });
  const growthQ = useQuery({
    queryKey: ['ea-growth', ...rk],
    queryFn: () => svc.analyticsListGrowth(range),
  });
  const brQ = useQuery({
    queryKey: ['ea-bounce-reasons', ...rk],
    queryFn: () => svc.analyticsBounceReasons(range),
  });

  const bounceDataQ = useQuery({
    queryKey: ['ea-bounces', bounceType, bouncePage],
    queryFn: () =>
      svc.analyticsBounces({ type: bounceType || undefined, page: bouncePage, limit: 25 }),
  });
  const campaignsQ = useQuery({
    queryKey: ['ea-compare-campaigns'],
    queryFn: () => svc.listCampaigns({ limit: 50 }),
  });

  const o = ovQ.data?.data;
  const series = tsQ.data?.data ?? [];
  const deliver = delQ.data?.data;
  const heat = hmQ.data?.data?.matrix ?? [];
  const heatTz = hmQ.data?.data?.tz ?? tz;
  const links = tlQ.data?.data ?? [];
  const clients = clientsQ.data?.data;
  const domains = domainsQ.data?.data ?? [];
  const leaderboard = lbQ.data?.data;
  const growth = growthQ.data?.data ?? [];
  const bounceReasons = brQ.data?.data;
  const maxHeat = Math.max(1, ...heat.flat());

  const bounces = bounceDataQ.data?.data?.items ?? [];
  const bounceTotal = bounceDataQ.data?.data?.total ?? 0;
  const bounceLimit = bounceDataQ.data?.data?.limit ?? 25;
  const bounceTotalPages = Math.max(1, Math.ceil(bounceTotal / bounceLimit));
  const campaigns = campaignsQ.data?.data?.items ?? [];

  // Deliverability alert level.
  const alert = useMemo(() => {
    if (!deliver) return null;
    const b = deliver.rates.bounce;
    const c = deliver.rates.complaint;
    if (b >= BOUNCE_CRIT || c >= COMPLAINT_CRIT) return 'critical' as const;
    if (b >= BOUNCE_WARN || c >= COMPLAINT_WARN) return 'warning' as const;
    return null;
  }, [deliver]);

  async function exportCsv() {
    setExporting(true);
    try {
      const blob = await svc.analyticsExport({ from, to });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'email-analytics.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      showToast.error('Could not export CSV');
    } finally {
      setExporting(false);
    }
  }

  function toggleCampaign(id: string) {
    if (selectedIds.includes(id)) setSelectedIds(selectedIds.filter((x) => x !== id));
    else if (selectedIds.length < MAX_COMPARE) setSelectedIds([...selectedIds, id]);
    else showToast.error(`Select up to ${MAX_COMPARE} campaigns`);
  }

  async function runCompare() {
    if (selectedIds.length < 2) {
      showToast.error('Select at least 2 campaigns');
      return;
    }
    setComparing(true);
    try {
      const res = await svc.compareCampaigns(selectedIds);
      setComparison(res.data ?? []);
    } catch {
      showToast.error('Could not compare campaigns');
    } finally {
      setComparing(false);
    }
  }

  // Funnel stages from overview totals.
  const funnel = o
    ? [
        { label: 'Sent', value: o.totals.sent, color: '#6366f1' },
        { label: 'Delivered', value: o.totals.delivered, color: '#0ea5e9' },
        { label: 'Opened', value: o.totals.opened, color: '#10b981' },
        { label: 'Clicked', value: o.totals.clicked, color: '#f59e0b' },
      ]
    : [];
  const funnelMax = Math.max(1, ...funnel.map((f) => f.value));

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="email.analytics.view"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]">
            <BarChart3 className="h-6 w-6 text-blue-600" /> Email Analytics
          </h1>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Download className="h-4 w-4" />}
            isLoading={exporting}
            onClick={exportCsv}
          >
            Export CSV
          </Button>
        </div>

        {/* Date range */}
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border)] bg-white p-4">
          <div className="w-44">
            <DatePicker label="From" value={fromDate} onChange={setFromDate} inputSize="sm" />
          </div>
          <div className="w-44">
            <DatePicker label="To" value={toDate} onChange={setToDate} inputSize="sm" />
          </div>
          {(fromDate || toDate) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFromDate('');
                setToDate('');
              }}
            >
              Clear
            </Button>
          )}
          <span className="ml-auto text-xs text-[var(--text-muted)]">Times shown in {tz}</span>
        </div>

        {ovQ.isError && <p className="text-sm text-red-600">Could not load overview metrics.</p>}

        {o && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Sent" value={o.totals.sent.toLocaleString()} />
            <Stat
              label="Delivered"
              value={`${o.rates.delivery}%`}
              sub={`${o.totals.delivered.toLocaleString()} delivered`}
            />
            <Stat
              label="Open rate"
              value={`${o.rates.open}%`}
              sub={`${o.totals.opened.toLocaleString()} opens`}
            />
            <Stat
              label="Click rate"
              value={`${o.rates.click}%`}
              sub={`${o.totals.clicked.toLocaleString()} clicks`}
            />
            <Stat label="Click-to-open" value={`${o.rates.clickToOpen}%`} />
            <Stat
              label="Bounce rate"
              value={`${o.rates.bounce}%`}
              sub={`${o.totals.bounced.toLocaleString()} bounced`}
            />
            <Stat
              label="Complaints"
              value={`${o.rates.complaint}%`}
              sub={`${o.totals.complained.toLocaleString()}`}
            />
            <Stat
              label="Unsubscribes"
              value={o.totals.unsubscribed.toLocaleString()}
              sub={`${o.rates.unsubscribe}%`}
            />
          </div>
        )}
        {o && (
          <p className="text-xs text-[var(--text-muted)]">
            {o.counts.contacts.toLocaleString()} contacts · {o.counts.suppressed.toLocaleString()}{' '}
            suppressed · {(o.machineOpens ?? 0).toLocaleString()} machine opens excluded (Apple MPP
            / proxies)
          </p>
        )}

        {/* Funnel */}
        {o && (
          <Card title="Conversion funnel">
            <div className="space-y-2">
              {funnel.map((f, i) => {
                const prev = i > 0 ? funnel[i - 1].value : f.value;
                const stepPct = prev > 0 ? Math.round((f.value / prev) * 1000) / 10 : 0;
                return (
                  <div key={f.label} className="flex items-center gap-3 text-sm">
                    <span className="w-20 shrink-0 text-[var(--text-secondary)]">{f.label}</span>
                    <div className="h-6 flex-1 overflow-hidden rounded bg-[var(--bg-secondary)]">
                      <div
                        className="flex h-full items-center rounded px-2 text-xs font-medium text-white"
                        style={{
                          width: `${Math.max(4, (f.value / funnelMax) * 100)}%`,
                          backgroundColor: f.color,
                        }}
                      >
                        {f.value.toLocaleString()}
                      </div>
                    </div>
                    <span className="w-16 shrink-0 text-right text-xs text-[var(--text-muted)]">
                      {i > 0 ? `${stepPct}%` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Volume + engagement charts */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="Send volume">
            <div className="h-56">
              <ResponsiveContainer width="100%" height={224} minHeight={224}>
                <AreaChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="sent"
                    stroke="#6366f1"
                    fill="#6366f120"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="delivered"
                    stroke="#0ea5e9"
                    fill="#0ea5e920"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card title="Engagement over time">
            <div className="h-56">
              <ResponsiveContainer width="100%" height={224} minHeight={224}>
                <LineChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="open"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="click"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="bounce"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="unsubscribe"
                    stroke="#a855f7"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Deliverability */}
        {deliver && (
          <Card title="Deliverability" icon={<ShieldCheck className="h-4 w-4 text-emerald-600" />}>
            {alert && (
              <div
                className={`mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${alert === 'critical' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}
              >
                <AlertTriangle className="h-4 w-4" />
                {alert === 'critical'
                  ? 'Critical: bounce or complaint rate is above safe thresholds — pause sending and clean the list.'
                  : 'Warning: bounce or complaint rate is elevated — review list hygiene.'}
              </div>
            )}
            <div className="mb-3 flex flex-wrap gap-4 text-sm text-[var(--text-muted)]">
              <span>
                Bounce rate:{' '}
                <strong
                  className={
                    deliver.rates.bounce >= BOUNCE_WARN ? 'text-red-600' : 'text-[var(--text)]'
                  }
                >
                  {deliver.rates.bounce}%
                </strong>
              </span>
              <span>
                Complaint rate:{' '}
                <strong
                  className={
                    deliver.rates.complaint >= COMPLAINT_WARN
                      ? 'text-red-600'
                      : 'text-[var(--text)]'
                  }
                >
                  {deliver.rates.complaint}%
                </strong>
              </span>
              <span>
                Suppressed:{' '}
                <strong className="text-[var(--text)]">{deliver.suppression.total}</strong>
              </span>
            </div>
            <div className="space-y-2">
              {deliver.senders.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] p-2 text-sm"
                >
                  <span className="flex-1 font-medium text-[var(--text)]">{s.fromEmail}</span>
                  <Badge variant={s.spfVerified ? 'success' : 'error'} size="sm">
                    SPF
                  </Badge>
                  <Badge variant={s.dkimVerified ? 'success' : 'error'} size="sm">
                    DKIM
                  </Badge>
                  <Badge variant={s.dmarcVerified ? 'success' : 'error'} size="sm">
                    DMARC
                  </Badge>
                  <Badge variant={s.mtaStsVerified ? 'success' : 'neutral'} size="sm">
                    MTA-STS
                  </Badge>
                  <Badge variant={s.tlsRptVerified ? 'success' : 'neutral'} size="sm">
                    TLS-RPT
                  </Badge>
                  {s.reputationScore != null && (
                    <span className="text-xs text-[var(--text-muted)]">
                      score {s.reputationScore}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Heatmap + top links */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title={`Open heatmap (day × hour, ${heatTz})`}>
            <div className="overflow-x-auto">
              <table className="border-separate" style={{ borderSpacing: 2 }}>
                <tbody>
                  {heat.map((row, d) => (
                    <tr key={d}>
                      <td className="pr-2 text-right text-[10px] text-[var(--text-muted)]">
                        {DOW[d]}
                      </td>
                      {row.map((v, h) => (
                        <td key={h}>
                          <div
                            title={`${DOW[d]} ${h}:00 — ${v} opens`}
                            className="h-3.5 w-3.5 rounded-sm"
                            style={{
                              backgroundColor: v
                                ? `rgba(37,99,235,${0.15 + (v / maxHeat) * 0.85})`
                                : '#f1f5f9',
                            }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Top links">
            {links.length === 0 && (
              <p className="text-sm text-[var(--text-muted)]">No clicks recorded in this window.</p>
            )}
            <div className="space-y-1.5">
              {links.map((l) => (
                <div key={l.id} className="flex items-center gap-2 text-sm">
                  <span
                    className="min-w-0 flex-1 truncate text-[var(--text-secondary)]"
                    title={l.url}
                  >
                    {l.label || l.url}
                  </span>
                  {l.uniqueClicks != null && (
                    <span className="text-xs text-[var(--text-muted)]">{l.uniqueClicks} uniq</span>
                  )}
                  <Badge variant="info" size="sm">
                    {l.clicks}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Email clients + devices */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="Email clients" icon={<Mailbox className="h-4 w-4 text-indigo-600" />}>
            <BarList
              items={clients?.clients ?? []}
              color="#6366f1"
              empty="No opens/clicks with a known client yet."
            />
          </Card>
          <Card
            title="Devices (clicks)"
            icon={<MonitorSmartphone className="h-4 w-4 text-sky-600" />}
          >
            <BarList
              items={clients?.devices ?? []}
              color="#0ea5e9"
              empty="No clicks recorded yet."
            />
          </Card>
        </div>

        {/* Recipient domains */}
        <Card title="Recipient domains" icon={<Globe className="h-4 w-4 text-emerald-600" />}>
          {domains.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No sends in this window.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                    <th className="px-2 py-2 font-medium">Domain</th>
                    <th className="px-2 py-2 font-medium">Sent</th>
                    <th className="px-2 py-2 font-medium">Open %</th>
                    <th className="px-2 py-2 font-medium">Click %</th>
                    <th className="px-2 py-2 font-medium">Bounce %</th>
                  </tr>
                </thead>
                <tbody>
                  {domains.map((d) => (
                    <tr key={d.domain} className="border-b border-[var(--border)]">
                      <td className="px-2 py-2 font-medium text-[var(--text)]">{d.domain}</td>
                      <td className="px-2 py-2 text-[var(--text-secondary)]">
                        {d.sent.toLocaleString()}
                      </td>
                      <td className="px-2 py-2 text-[var(--text-secondary)]">{d.openRate}%</td>
                      <td className="px-2 py-2 text-[var(--text-secondary)]">{d.clickRate}%</td>
                      <td
                        className={`px-2 py-2 ${d.bounceRate >= BOUNCE_WARN ? 'text-red-600' : 'text-[var(--text-secondary)]'}`}
                      >
                        {d.bounceRate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Leaderboard + list growth */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="Most engaged contacts" icon={<Trophy className="h-4 w-4 text-amber-500" />}>
            {(leaderboard?.top?.length ?? 0) === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">No engagement recorded yet.</p>
            ) : (
              <>
                <div className="space-y-1">
                  {leaderboard!.top.map((c) => (
                    <div key={c.contactId} className="flex items-center gap-2 text-sm">
                      <span
                        className="min-w-0 flex-1 truncate text-[var(--text-secondary)]"
                        title={c.email ?? ''}
                      >
                        {c.name || c.email || c.contactId}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">{c.opens} opens</span>
                      <Badge variant="info" size="sm">
                        {c.clicks} clicks
                      </Badge>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-[var(--text-muted)]">
                  {leaderboard!.neverEngaged.toLocaleString()} contacts sent-to but never engaged.
                </p>
              </>
            )}
          </Card>
          <Card title="List growth" icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}>
            <div className="h-56">
              <ResponsiveContainer width="100%" height={224} minHeight={224}>
                <AreaChart data={growth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="added"
                    name="Added"
                    stroke="#10b981"
                    fill="#10b98120"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="unsubscribed"
                    name="Unsubscribed"
                    stroke="#ef4444"
                    fill="#ef444420"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Bounce reasons */}
        {bounceReasons && bounceReasons.total > 0 && (
          <Card title="Bounce reasons" icon={<AlertTriangle className="h-4 w-4 text-orange-500" />}>
            <div className="mb-3 flex gap-4 text-sm text-[var(--text-muted)]">
              <span>
                Hard: <strong className="text-[var(--text)]">{bounceReasons.split.hard}</strong>
              </span>
              <span>
                Soft: <strong className="text-[var(--text)]">{bounceReasons.split.soft}</strong>
              </span>
              <span>
                Total: <strong className="text-[var(--text)]">{bounceReasons.total}</strong>
              </span>
            </div>
            <BarList
              items={bounceReasons.categories}
              color="#f97316"
              empty="No bounces in this window."
            />
          </Card>
        )}

        {/* Bounces & complaints drill-down */}
        <Card
          title="Bounces & complaints"
          icon={<AlertTriangle className="h-4 w-4 text-orange-500" />}
        >
          <div className="mb-3 flex justify-end">
            <div className="w-44">
              <Select
                size="sm"
                clearable={false}
                value={bounceType}
                onChange={(v) => {
                  setBounceType(v as '' | 'BOUNCE' | 'COMPLAINT');
                  setBouncePage(1);
                }}
                options={[
                  { value: '', label: 'All events' },
                  { value: 'BOUNCE', label: 'Bounces' },
                  { value: 'COMPLAINT', label: 'Complaints' },
                ]}
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-2 py-2 font-medium">Email</th>
                  <th className="px-2 py-2 font-medium">Type</th>
                  <th className="px-2 py-2 font-medium">Bounce type</th>
                  <th className="px-2 py-2 font-medium">Reason</th>
                  <th className="px-2 py-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {bounceDataQ.isLoading && (
                  <tr>
                    <td colSpan={5} className="px-2 py-6 text-center text-[var(--text-muted)]">
                      Loading…
                    </td>
                  </tr>
                )}
                {!bounceDataQ.isLoading && bounces.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-2 py-6 text-center text-[var(--text-muted)]">
                      No bounce or complaint events.
                    </td>
                  </tr>
                )}
                {bounces.map((b) => (
                  <tr key={b.id} className="border-b border-[var(--border)]">
                    <td className="max-w-[220px] truncate px-2 py-2 font-medium text-[var(--text)]">
                      {b.email ?? '—'}
                    </td>
                    <td className="px-2 py-2">
                      <Badge variant={b.eventType === 'COMPLAINT' ? 'error' : 'warning'} size="sm">
                        {b.eventType}
                      </Badge>
                    </td>
                    <td className="px-2 py-2 text-[var(--text-secondary)]">
                      {b.bounceType ?? '—'}
                    </td>
                    <td
                      className="max-w-[280px] truncate px-2 py-2 text-[var(--text-secondary)]"
                      title={b.reason ?? ''}
                    >
                      {b.reason ?? '—'}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-[var(--text-muted)]">
                      {new Date(b.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {bounceTotal > 0 && (
            <Pagination
              className="mt-3"
              currentPage={bouncePage}
              totalPages={bounceTotalPages}
              onPageChange={setBouncePage}
              totalItems={bounceTotal}
              pageSize={bounceLimit}
            />
          )}
        </Card>

        {/* Compare campaigns */}
        <Card title="Compare campaigns" icon={<GitCompare className="h-4 w-4 text-indigo-600" />}>
          <div className="mb-3 flex items-center justify-end">
            <Button variant="primary" size="sm" isLoading={comparing} onClick={runCompare}>
              Compare ({selectedIds.length})
            </Button>
          </div>
          <p className="mb-3 text-xs text-[var(--text-muted)]">
            Select up to {MAX_COMPARE} campaigns to compare their performance.
          </p>
          <div className="mb-4 max-h-52 space-y-1 overflow-y-auto rounded-lg border border-[var(--border)] p-2">
            {campaigns.length === 0 && (
              <p className="p-3 text-center text-sm text-[var(--text-muted)]">
                No campaigns found.
              </p>
            )}
            {campaigns.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[var(--bg-secondary)]"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(c.id)}
                  onChange={() => toggleCampaign(c.id)}
                  className="h-4 w-4"
                />
                <span className="flex-1 truncate text-[var(--text)]">{c.name}</span>
                <Badge variant="neutral" size="sm">
                  {c.status}
                </Badge>
              </label>
            ))}
          </div>
          {comparison && comparison.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                    <th className="px-2 py-2 font-medium">Campaign</th>
                    <th className="px-2 py-2 font-medium">Sent</th>
                    <th className="px-2 py-2 font-medium">Delivery</th>
                    <th className="px-2 py-2 font-medium">Open</th>
                    <th className="px-2 py-2 font-medium">Click</th>
                    <th className="px-2 py-2 font-medium">CTOR</th>
                    <th className="px-2 py-2 font-medium">Bounce</th>
                    <th className="px-2 py-2 font-medium">Complaint</th>
                    <th className="px-2 py-2 font-medium">Unsub</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((c) => (
                    <tr key={c.id} className="border-b border-[var(--border)]">
                      <td className="max-w-[220px] truncate px-2 py-2 font-medium text-[var(--text)]">
                        {c.name}
                      </td>
                      <td className="px-2 py-2 text-[var(--text-secondary)]">
                        {c.sent.toLocaleString()}
                      </td>
                      <td className="px-2 py-2 text-[var(--text-secondary)]">{c.deliveryRate}%</td>
                      <td className="px-2 py-2 text-[var(--text-secondary)]">{c.openRate}%</td>
                      <td className="px-2 py-2 text-[var(--text-secondary)]">{c.clickRate}%</td>
                      <td className="px-2 py-2 text-[var(--text-secondary)]">
                        {c.clickToOpenRate}%
                      </td>
                      <td className="px-2 py-2 text-[var(--text-secondary)]">{c.bounceRate}%</td>
                      <td className="px-2 py-2 text-[var(--text-secondary)]">{c.complaintRate}%</td>
                      <td className="px-2 py-2 text-[var(--text-secondary)]">
                        {c.unsubscribeRate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
