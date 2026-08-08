'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Briefcase,
  TrendingUp,
  Eye,
  Target,
  Users,
  Clock,
  CalendarDays,
  Download,
  DollarSign,
  Zap,
  XCircle,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  MapPin,
  Layers,
  Timer,
  Hourglass,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import DatePicker from '@/components/ui/DatePicker';
import Select from '@/components/ui/Select';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import AreaChart from '@/components/charts/AreaChart';
import BarChart from '@/components/charts/BarChart';
import PieChart from '@/components/charts/PieChart';
import { employerService } from '@/services/employer.service';
import { QUERY_KEYS } from '@/constants/config';

const groupByOptions = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

const STATUS_COLORS: Record<string, string> = {
  APPLIED: '#3B82F6',
  VIEWED: '#8B5CF6',
  SHORTLISTED: '#F59E0B',
  OFFERED: '#10B981',
  HIRED: '#059669',
  REJECTED: '#EF4444',
  WITHDRAWN: '#6B7280',
};

const STATUS_LABELS: Record<string, string> = {
  APPLIED: 'Applied',
  VIEWED: 'Viewed',
  SHORTLISTED: 'Shortlisted',
  OFFERED: 'Offered',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};

const RESPONSE_TIME_COLORS: Record<string, string> = {
  'Same Day': '#10B981',
  '1-3 Days': '#3B82F6',
  '4-7 Days': '#F59E0B',
  '1-2 Weeks': '#F97316',
  '2+ Weeks': '#EF4444',
};

const TTH_COLORS: Record<string, string> = {
  '< 1 Week': '#10B981',
  '1-2 Weeks': '#3B82F6',
  '2-4 Weeks': '#6366F1',
  '1-2 Months': '#F59E0B',
  '2-3 Months': '#F97316',
  '3+ Months': '#EF4444',
};

function getDatePresetRange(preset: string): { start: string; end: string } {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  let start: Date;

  switch (preset) {
    case '7d':
      start = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      start = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      start = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case 'quarter': {
      const qMonth = Math.floor(today.getMonth() / 3) * 3;
      start = new Date(today.getFullYear(), qMonth, 1);
      break;
    }
    case 'year':
      start = new Date(today.getFullYear(), 0, 1);
      break;
    default:
      start = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  return { start: start.toISOString().slice(0, 10), end };
}

const DATE_PRESETS = [
  { key: '7d', label: 'Last 7 Days' },
  { key: '30d', label: 'Last 30 Days' },
  { key: '90d', label: 'Last 90 Days' },
  { key: 'quarter', label: 'This Quarter' },
  { key: 'year', label: 'This Year' },
];

function computeDelta(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function formatSalary(n: number): string {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(0)}K`;
  return `₹${n}`;
}

export default function EmployerAnalyticsPage() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('week');
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const handlePreset = (key: string) => {
    const range = getDatePresetRange(key);
    setStartDate(range.start);
    setEndDate(range.end);
    setActivePreset(key);
  };

  const filters = {
    ...(startDate && { startDate }),
    ...(endDate && { endDate }),
    groupBy,
  };

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.EMPLOYERS.ANALYTICS(filters as Record<string, unknown>),
    queryFn: () => employerService.getAnalytics(filters),
  });

  const analytics = data?.data;

  // Period-over-period deltas
  const deltas = useMemo(() => {
    if (!analytics?.previousPeriodSummary) return null;
    const prev = analytics.previousPeriodSummary;
    return {
      totalJobsPosted: computeDelta(analytics.summary.totalJobsPosted, prev.totalJobsPosted),
      totalApplications: computeDelta(analytics.summary.totalApplications, prev.totalApplications),
      profileViews: computeDelta(analytics.summary.profileViews, prev.profileViews),
    };
  }, [analytics?.summary, analytics?.previousPeriodSummary]);

  const handleExport = async () => {
    try {
      const blob = await employerService.exportAnalytics({
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'employer-analytics.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // handled by global error
    }
  };

  const summaryCards = analytics
    ? [
        {
          label: 'Total Jobs Posted',
          value: analytics.summary.totalJobsPosted,
          icon: Briefcase,
          color: 'text-primary bg-primary-light',
          deltaKey: 'totalJobsPosted' as const,
        },
        {
          label: 'Active Jobs',
          value: analytics.summary.activeJobs,
          icon: Briefcase,
          color: 'text-[var(--info)] bg-[var(--info-light)]',
        },
        {
          label: 'Total Applications',
          value: analytics.summary.totalApplications,
          icon: Users,
          color: 'text-[var(--success)] bg-[var(--success-light)]',
          deltaKey: 'totalApplications' as const,
        },
        {
          label: 'Avg. Time to Hire',
          value:
            analytics.summary.avgTimeToHireDays !== null
              ? `${analytics.summary.avgTimeToHireDays}d`
              : 'N/A',
          icon: Clock,
          color: 'text-[var(--warning)] bg-[var(--warning-light)]',
        },
        {
          label: 'Hire Rate',
          value: `${analytics.summary.overallHireRate}%`,
          icon: Target,
          color: 'text-[var(--success)] bg-[var(--success-light)]',
        },
        {
          label: 'Profile Views',
          value: analytics.summary.profileViews,
          icon: Eye,
          color: 'text-[#8B5CF6] bg-[#EDE9FE]',
          deltaKey: 'profileViews' as const,
        },
        {
          label: 'Saved Candidates',
          value: analytics.summary.savedCandidates,
          icon: Users,
          color: 'text-[var(--warning)] bg-[var(--warning-light)]',
        },
        {
          label: 'Hiring Velocity',
          value: `${analytics.summary.hiringVelocity}/mo`,
          icon: Zap,
          color: 'text-[var(--info)] bg-[var(--info-light)]',
        },
      ]
    : [];

  const funnelSteps = analytics
    ? [
        { key: 'applied', label: 'Applied', color: '#3B82F6' },
        { key: 'viewed', label: 'Viewed', color: '#8B5CF6' },
        { key: 'shortlisted', label: 'Shortlisted', color: '#F59E0B' },
        { key: 'offered', label: 'Offered', color: '#10B981' },
        { key: 'hired', label: 'Hired', color: '#059669' },
      ]
    : [];

  const statusPieData =
    analytics?.statusDistribution.map((s) => ({
      name: STATUS_LABELS[s.status] || s.status,
      value: s.count,
      color: STATUS_COLORS[s.status] || '#6B7280',
    })) || [];

  const sourceBarData =
    analytics?.sourceDistribution.map((s) => ({
      source: s.source,
      count: s.count,
    })) || [];

  const skillsBarData =
    analytics?.topSkillsInDemand.map((s) => ({
      skill: s.skill.length > 12 ? s.skill.slice(0, 12) + '...' : s.skill,
      count: s.count,
    })) || [];

  return (
    <DashboardLayout requiredRole={['EMPLOYER']}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Hiring Analytics</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Track your hiring pipeline performance and identify bottlenecks.
            </p>
          </div>
          <Button variant="outline" onClick={handleExport} disabled={isLoading || !analytics}>
            <Download className="mr-1.5 h-4 w-4" />
            Export CSV
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <div className="space-y-4">
            {/* Quick Date Presets */}
            <div className="flex flex-wrap gap-2">
              {DATE_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  onClick={() => handlePreset(preset.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    activePreset === preset.key
                      ? 'bg-primary text-white'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
              {(startDate || endDate) && (
                <button
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                    setActivePreset(null);
                  }}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="w-full sm:w-48">
                <DatePicker
                  label="Start Date"
                  value={startDate}
                  onChange={(v) => {
                    setStartDate(v);
                    setActivePreset(null);
                  }}
                  leftIcon={<CalendarDays className="h-4 w-4" />}
                />
              </div>
              <div className="w-full sm:w-48">
                <DatePicker
                  label="End Date"
                  value={endDate}
                  onChange={(v) => {
                    setEndDate(v);
                    setActivePreset(null);
                  }}
                  leftIcon={<CalendarDays className="h-4 w-4" />}
                />
              </div>
              <div className="w-full sm:w-48">
                <Select
                  label="Group By"
                  options={groupByOptions}
                  value={groupBy}
                  onChange={(val) => setGroupBy(val as 'day' | 'week' | 'month')}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Summary Cards */}
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i}>
                <Skeleton variant="rect" height={80} />
              </Card>
            ))}
          </div>
        ) : analytics ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {summaryCards.map((card) => {
              const deltaVal = deltas && card.deltaKey ? deltas[card.deltaKey] : null;
              return (
                <Card key={card.label}>
                  <div className="flex items-center gap-4">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${card.color}`}
                    >
                      <card.icon className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-[var(--text)]">
                        {typeof card.value === 'number' ? formatNumber(card.value) : card.value}
                      </p>
                      <p className="text-sm text-[var(--text-muted)]">{card.label}</p>
                      {deltaVal !== null && deltaVal !== undefined && (
                        <span
                          className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${deltaVal >= 0 ? 'text-[var(--success)]' : 'text-[var(--error)]'}`}
                        >
                          {deltaVal >= 0 ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3" />
                          )}
                          {Math.abs(deltaVal)}% vs prior period
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : null}

        {/* Hiring Funnel */}
        {isLoading ? (
          <Card
            header={<h2 className="text-lg font-semibold text-[var(--text)]">Hiring Funnel</h2>}
          >
            <Skeleton variant="rect" height={200} />
          </Card>
        ) : analytics && analytics.summary.totalApplications > 0 ? (
          <Card
            header={
              <div className="flex items-center gap-2">
                <TrendingUp className="text-primary h-5 w-5" />
                <h2 className="text-lg font-semibold text-[var(--text)]">Hiring Funnel</h2>
              </div>
            }
          >
            <div className="space-y-3">
              {funnelSteps.map((step, i) => {
                const count = analytics.funnel[step.key] || 0;
                const total = analytics.funnel.applied || 1;
                const pct = Math.round((count / total) * 100);
                const prevCount = i > 0 ? analytics.funnel[funnelSteps[i - 1].key] || 1 : total;
                const conversionRate = i > 0 ? Math.round((count / prevCount) * 100) : 100;

                return (
                  <div key={step.key} className="flex items-center gap-4">
                    <div className="w-28 shrink-0 text-sm font-medium text-[var(--text)]">
                      {step.label}
                    </div>
                    <div className="flex-1">
                      <div className="h-8 overflow-hidden rounded-lg bg-[var(--bg-secondary)]">
                        <div
                          className="h-full rounded-lg transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: step.color }}
                        />
                      </div>
                    </div>
                    <div className="w-24 shrink-0 text-right">
                      <span className="text-sm font-semibold text-[var(--text)]">{count}</span>
                      <span className="ml-1 text-xs text-[var(--text-muted)]">({pct}%)</span>
                      {i > 0 && (
                        <div className="text-[10px] text-[var(--text-muted)]">
                          conv. {conversionRate}%
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="mt-2 flex gap-4 border-t border-[var(--border)] pt-3">
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <XCircle className="h-4 w-4 text-[var(--error)]" />
                  Rejected: {analytics.funnel.rejected || 0}
                </div>
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <ArrowRight className="h-4 w-4 text-[var(--text-muted)]" />
                  Withdrawn: {analytics.funnel.withdrawn || 0}
                </div>
              </div>
            </div>
          </Card>
        ) : null}

        {/* Charts Grid */}
        {isLoading ? (
          <div className="grid gap-6 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <Skeleton variant="rect" height={300} />
              </Card>
            ))}
          </div>
        ) : analytics ? (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Application Trends */}
            <Card
              header={
                <div className="flex items-center gap-2">
                  <TrendingUp className="text-primary h-5 w-5" />
                  <h2 className="text-lg font-semibold text-[var(--text)]">Application Trends</h2>
                </div>
              }
            >
              {analytics.trends.length > 0 ? (
                <AreaChart
                  data={analytics.trends as unknown as Record<string, unknown>[]}
                  xKey="period"
                  yKey="applications"
                  yKey2="profileViews"
                  color="#3B82F6"
                  color2="#8B5CF6"
                  height={280}
                />
              ) : (
                <EmptyState
                  icon={TrendingUp}
                  title="No trend data"
                  description="Trends will appear once you receive applications."
                />
              )}
            </Card>

            {/* Status Distribution */}
            <Card
              header={
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-[var(--info)]" />
                  <h2 className="text-lg font-semibold text-[var(--text)]">Status Distribution</h2>
                </div>
              }
            >
              {statusPieData.length > 0 ? (
                <PieChart data={statusPieData} height={280} innerRadius={55} />
              ) : (
                <EmptyState
                  icon={BarChart3}
                  title="No status data"
                  description="Status breakdown will appear as applications come in."
                />
              )}
            </Card>

            {/* Application Sources */}
            <Card
              header={
                <div className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-[var(--success)]" />
                  <h2 className="text-lg font-semibold text-[var(--text)]">Application Sources</h2>
                </div>
              }
            >
              {sourceBarData.length > 0 ? (
                <BarChart
                  data={sourceBarData as unknown as Record<string, unknown>[]}
                  xKey="source"
                  bars={[{ key: 'count', color: '#3B82F6', name: 'Applications' }]}
                  height={280}
                />
              ) : (
                <EmptyState
                  icon={Briefcase}
                  title="No source data"
                  description="Source distribution will appear as you receive applications."
                />
              )}
            </Card>

            {/* Top Skills in Demand */}
            <Card
              header={
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-[var(--warning)]" />
                  <h2 className="text-lg font-semibold text-[var(--text)]">
                    Top Skills in Your Jobs
                  </h2>
                </div>
              }
            >
              {skillsBarData.length > 0 ? (
                <BarChart
                  data={skillsBarData as unknown as Record<string, unknown>[]}
                  xKey="skill"
                  bars={[{ key: 'count', color: '#8B5CF6', name: 'Jobs Requiring' }]}
                  height={280}
                />
              ) : (
                <EmptyState
                  icon={Target}
                  title="No skills data"
                  description="Skills demand will appear based on your job postings."
                />
              )}
            </Card>
          </div>
        ) : null}

        {/* Salary Competitiveness */}
        {isLoading ? (
          <Card>
            <Skeleton variant="rect" height={120} />
          </Card>
        ) : analytics &&
          (analytics.salaryCompetitiveness.yourAvg.min > 0 ||
            analytics.salaryCompetitiveness.platformAvg.min > 0) ? (
          <Card
            header={
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-[var(--warning)]" />
                <h2 className="text-lg font-semibold text-[var(--text)]">Salary Competitiveness</h2>
              </div>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-[var(--bg-secondary)] p-4 text-center">
                <p className="text-sm text-[var(--text-muted)]">Your Avg Salary Range</p>
                <p className="text-primary mt-1 text-xl font-bold">
                  {analytics.salaryCompetitiveness.yourAvg.min > 0
                    ? `${formatSalary(analytics.salaryCompetitiveness.yourAvg.min)} - ${formatSalary(analytics.salaryCompetitiveness.yourAvg.max)}`
                    : 'Not disclosed'}
                </p>
              </div>
              <div className="rounded-xl bg-[var(--bg-secondary)] p-4 text-center">
                <p className="text-sm text-[var(--text-muted)]">Platform Average</p>
                <p className="mt-1 text-xl font-bold text-[var(--success)]">
                  {analytics.salaryCompetitiveness.platformAvg.min > 0
                    ? `${formatSalary(analytics.salaryCompetitiveness.platformAvg.min)} - ${formatSalary(analytics.salaryCompetitiveness.platformAvg.max)}`
                    : 'N/A'}
                </p>
              </div>
            </div>
          </Card>
        ) : null}

        {/* Job Performance */}
        {isLoading ? (
          <Card>
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} variant="rect" height={40} />
              ))}
            </div>
          </Card>
        ) : analytics && analytics.jobPerformance.length > 0 ? (
          <Card
            header={
              <div className="flex items-center gap-2">
                <Briefcase className="text-primary h-5 w-5" />
                <h2 className="text-lg font-semibold text-[var(--text)]">Job Performance</h2>
                <span className="ml-auto text-xs text-[var(--text-muted)]">
                  Top 10 by applications
                </span>
              </div>
            }
            padding="sm"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                      Job Title
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-[var(--text-secondary)]">
                      Views
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-[var(--text-secondary)]">
                      Applications
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-[var(--text-secondary)]">
                      Hired
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-[var(--text-secondary)]">
                      Conversion
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {analytics.jobPerformance.map((job) => (
                    <tr
                      key={job.jobId}
                      className="transition-colors hover:bg-[var(--bg-secondary)]"
                    >
                      <td className="max-w-[200px] truncate px-4 py-3 font-medium text-[var(--text)]">
                        {job.title}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--text-secondary)]">
                        {formatNumber(job.views)}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--text-secondary)]">
                        {formatNumber(job.applications)}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--text-secondary)]">
                        {job.hiredCount}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Badge
                          variant={
                            job.conversionRate > 10
                              ? 'success'
                              : job.conversionRate > 0
                                ? 'warning'
                                : 'neutral'
                          }
                          size="sm"
                        >
                          {job.conversionRate}%
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}

        {/* Advanced Analytics Grid */}
        {isLoading ? (
          <div className="grid gap-6 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={`adv-${i}`}>
                <Skeleton variant="rect" height={300} />
              </Card>
            ))}
          </div>
        ) : analytics ? (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Day of Week Distribution */}
            {analytics.dayOfWeekDistribution && analytics.dayOfWeekDistribution.length > 0 && (
              <Card
                header={
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-5 w-5 text-[var(--info)]" />
                    <h2 className="text-lg font-semibold text-[var(--text)]">
                      Applications by Day of Week
                    </h2>
                  </div>
                }
              >
                <BarChart
                  data={analytics.dayOfWeekDistribution as unknown as Record<string, unknown>[]}
                  xKey="day"
                  bars={[{ key: 'count', color: '#6366F1', name: 'Applications' }]}
                  height={280}
                />
              </Card>
            )}

            {/* Response Time Distribution */}
            {analytics.responseTimeDistribution &&
              analytics.responseTimeDistribution.some((r) => r.count > 0) && (
                <Card
                  header={
                    <div className="flex items-center gap-2">
                      <Timer className="h-5 w-5 text-[var(--warning)]" />
                      <h2 className="text-lg font-semibold text-[var(--text)]">
                        Your Response Time
                      </h2>
                    </div>
                  }
                >
                  <PieChart
                    data={analytics.responseTimeDistribution
                      .filter((r) => r.count > 0)
                      .map((r) => ({
                        name: r.bucket,
                        value: r.count,
                        color: RESPONSE_TIME_COLORS[r.bucket] || '#6B7280',
                      }))}
                    height={280}
                    innerRadius={55}
                  />
                </Card>
              )}

            {/* Source Effectiveness */}
            {analytics.sourceEffectiveness && analytics.sourceEffectiveness.length > 0 && (
              <Card
                header={
                  <div className="flex items-center gap-2">
                    <Layers className="h-5 w-5 text-[var(--success)]" />
                    <h2 className="text-lg font-semibold text-[var(--text)]">
                      Source Effectiveness
                    </h2>
                  </div>
                }
              >
                <BarChart
                  data={
                    analytics.sourceEffectiveness.map((s) => ({
                      source: s.source,
                      applied: s.total - s.offers,
                      offers: s.offers - s.hires,
                      hires: s.hires,
                    })) as unknown as Record<string, unknown>[]
                  }
                  xKey="source"
                  bars={[
                    { key: 'applied', color: '#3B82F6', name: 'Applied' },
                    { key: 'offers', color: '#F59E0B', name: 'Offers' },
                    { key: 'hires', color: '#10B981', name: 'Hires' },
                  ]}
                  height={280}
                  stacked
                />
              </Card>
            )}

            {/* Location Distribution */}
            {analytics.locationDistribution && analytics.locationDistribution.length > 0 && (
              <Card
                header={
                  <div className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-[var(--error)]" />
                    <h2 className="text-lg font-semibold text-[var(--text)]">
                      Applications by Location
                    </h2>
                  </div>
                }
              >
                <BarChart
                  data={
                    analytics.locationDistribution.map((l) => ({
                      location:
                        l.location.length > 15 ? l.location.slice(0, 15) + '...' : l.location,
                      count: l.count,
                    })) as unknown as Record<string, unknown>[]
                  }
                  xKey="location"
                  bars={[{ key: 'count', color: '#EC4899', name: 'Applications' }]}
                  height={280}
                />
              </Card>
            )}

            {/* Time-to-Hire Distribution */}
            {analytics.timeToHireDistribution &&
              analytics.timeToHireDistribution.some((t) => t.count > 0) && (
                <Card
                  header={
                    <div className="flex items-center gap-2">
                      <Hourglass className="h-5 w-5 text-[#8B5CF6]" />
                      <h2 className="text-lg font-semibold text-[var(--text)]">
                        Time-to-Hire Distribution
                      </h2>
                    </div>
                  }
                >
                  <BarChart
                    data={
                      analytics.timeToHireDistribution
                        .filter((t) => t.count > 0)
                        .map((t) => ({
                          bucket: t.bucket,
                          count: t.count,
                        })) as unknown as Record<string, unknown>[]
                    }
                    xKey="bucket"
                    bars={[{ key: 'count', color: '#8B5CF6', name: 'Hires' }]}
                    height={280}
                  />
                </Card>
              )}
          </div>
        ) : null}

        {/* Recent Activity */}
        {isLoading ? (
          <Card>
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} variant="rect" height={40} />
              ))}
            </div>
          </Card>
        ) : analytics && analytics.recentActivity.length > 0 ? (
          <Card
            header={<h2 className="text-lg font-semibold text-[var(--text)]">Recent Activity</h2>}
            padding="sm"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                      Candidate
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                      Job Title
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-[var(--text-secondary)]">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {analytics.recentActivity.map((activity, idx) => (
                    <tr key={idx} className="transition-colors hover:bg-[var(--bg-secondary)]">
                      <td className="px-4 py-3 font-medium text-[var(--text)]">
                        {activity.candidateName}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">
                        {activity.jobTitle}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            activity.status === 'HIRED' || activity.status === 'OFFERED'
                              ? 'success'
                              : activity.status === 'REJECTED'
                                ? 'error'
                                : activity.status === 'WITHDRAWN'
                                  ? 'neutral'
                                  : 'warning'
                          }
                          size="sm"
                        >
                          {STATUS_LABELS[activity.status] || activity.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--text-muted)]">
                        {new Date(activity.date).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : !isLoading && analytics ? (
          <Card>
            <EmptyState
              icon={BarChart3}
              title="No activity yet"
              description="Hiring activity will appear here once candidates start applying to your jobs."
            />
          </Card>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
