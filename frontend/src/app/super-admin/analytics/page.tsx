'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Users,
  UserPlus,
  Briefcase,
  FileText,
  TrendingUp,
  Eye,
  CalendarDays,
  Download,
  Code,
  DollarSign,
  Target,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  Clock,
  Zap,
  Radio,
  Shield,
  MapPin,
  AlertTriangle,
  Server,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import TeamsVendorsWidget from '@/components/super-admin/TeamsVendorsWidget';
import Card from '@/components/ui/Card';
import DatePicker from '@/components/ui/DatePicker';
import Select from '@/components/ui/Select';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import AreaChart from '@/components/charts/AreaChart';
import BarChart from '@/components/charts/BarChart';
import PieChart from '@/components/charts/PieChart';
import StatsChart from '@/components/charts/StatsChart';
import { adminService } from '@/services/admin.service';
import { advancedAnalyticsService } from '@/services/analytics.service';
import { QUERY_KEYS } from '@/constants/config';
import api from '@/lib/api';
import { API } from '@/constants/api';
import type { AnalyticsFilters, RecentActivity } from '@/types/admin';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const groupByOptions = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

const DATE_PRESETS = [
  { key: '7d', label: 'Last 7 Days' },
  { key: '30d', label: 'Last 30 Days' },
  { key: '90d', label: 'Last 90 Days' },
  { key: 'quarter', label: 'This Quarter' },
  { key: 'year', label: 'This Year' },
];

const STATUS_COLORS: Record<string, string> = {
  APPLIED: '#3B82F6',
  VIEWED: '#8B5CF6',
  SHORTLISTED: '#F59E0B',
  OFFERED: '#10B981',
  HIRED: '#059669',
  REJECTED: '#EF4444',
  WITHDRAWN: '#6B7280',
  PENDING: '#F59E0B',
  REVIEWING: '#3B82F6',
  INTERVIEW: '#06B6D4',
};

const STATUS_LABELS: Record<string, string> = {
  APPLIED: 'Applied',
  VIEWED: 'Viewed',
  SHORTLISTED: 'Shortlisted',
  OFFERED: 'Offered',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
  PENDING: 'Pending',
  REVIEWING: 'Reviewing',
  INTERVIEW: 'Interview',
};

const FUNNEL_COLORS = [
  '#3B82F6',
  '#8B5CF6',
  '#F59E0B',
  '#6366F1',
  '#10B981',
  '#059669',
  '#EF4444',
  '#6B7280',
];

const PIPELINE_STAGES = ['PENDING', 'REVIEWING', 'SHORTLISTED', 'INTERVIEW', 'OFFERED', 'HIRED'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDatePresetRange(preset: string): { start: string; end: string } {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  let start: Date;
  switch (preset) {
    case '7d':
      start = new Date(today.getTime() - 7 * 86400000);
      break;
    case '30d':
      start = new Date(today.getTime() - 30 * 86400000);
      break;
    case '90d':
      start = new Date(today.getTime() - 90 * 86400000);
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
      start = new Date(today.getTime() - 30 * 86400000);
  }
  return { start: start.toISOString().slice(0, 10), end };
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function computeDelta(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

interface KafkaEvent {
  eventType: string;
  topic: string;
  key: string | null;
  timestamp: string;
}

function getEventColor(eventType: string): string {
  if (eventType.includes('JOB')) return 'bg-[var(--warning-light)] text-[var(--warning)]';
  if (eventType.includes('APPLICATION')) return 'bg-[var(--info-light)] text-[var(--info)]';
  if (eventType.includes('USER')) return 'bg-primary-light text-primary';
  if (eventType.includes('PROFILE')) return 'bg-[var(--success-light)] text-[var(--success)]';
  return 'bg-[var(--bg-secondary)] text-[var(--text-muted)]';
}

function getStatusColor(status: string): string {
  const m: Record<string, string> = {
    PENDING: 'bg-[var(--warning-light)] text-[var(--warning)]',
    REVIEWING: 'bg-[var(--info-light)] text-[var(--info)]',
    SHORTLISTED: 'bg-purple-100 text-purple-700',
    INTERVIEW: 'bg-cyan-100 text-cyan-700',
    OFFERED: 'bg-[var(--success-light)] text-[var(--success)]',
    HIRED: 'bg-emerald-100 text-emerald-700',
    REJECTED: 'bg-[var(--error-light)] text-[var(--error)]',
    WITHDRAWN: 'bg-gray-100 text-gray-600',
  };
  return m[status] || 'bg-[var(--bg-secondary)] text-[var(--text-muted)]';
}

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SuperAdminAnalyticsPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'applications' | 'advanced' | 'system'>(
    'overview',
  );
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('week');
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [exportingType, setExportingType] = useState<string | null>(null);

  const handlePreset = (key: string) => {
    const range = getDatePresetRange(key);
    setStartDate(range.start);
    setEndDate(range.end);
    setActivePreset(key);
  };

  const filters: AnalyticsFilters = {
    ...(startDate && { startDate }),
    ...(endDate && { endDate }),
    groupBy,
  };

  // ── Queries ──

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: QUERY_KEYS.ADMIN.COMPREHENSIVE_STATS,
    queryFn: () => adminService.getComprehensiveStats(),
  });

  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: QUERY_KEYS.ADMIN.ANALYTICS(filters as unknown as Record<string, unknown>),
    queryFn: () => adminService.getAnalytics(filters),
  });

  const { data: appStatsData, isLoading: appStatsLoading } = useQuery({
    queryKey: QUERY_KEYS.ADMIN.APPLICATION_STATS,
    queryFn: () => adminService.getApplicationStats(),
  });

  const { data: dauData, isLoading: dauLoading } = useQuery({
    queryKey: QUERY_KEYS.ADMIN.DAILY_ACTIVE_USERS,
    queryFn: () => adminService.getDailyActiveUsers(30),
  });

  const { data: liveCountersData } = useQuery({
    queryKey: QUERY_KEYS.ADMIN.LIVE_COUNTERS,
    queryFn: () => adminService.getLiveCounters(),
    refetchInterval: 30000,
  });

  const { data: kafkaEventsData } = useQuery({
    queryKey: QUERY_KEYS.ADMIN.KAFKA_EVENTS,
    queryFn: async () => {
      const res = await api.get(API.ADMIN.KAFKA_EVENTS, { params: { limit: 15 } });
      return res.data as { status: string; data: KafkaEvent[] };
    },
    refetchInterval: 15000,
    enabled: activeTab === 'system',
  });

  const { data: verificationStatsData } = useQuery({
    queryKey: QUERY_KEYS.VERIFICATIONS.STATS,
    queryFn: async () => {
      const res = await api.get(API.VERIFICATIONS.STATS);
      return res.data as {
        data: {
          byStatus?: Record<string, number>;
          byType?: Record<string, number>;
        };
      };
    },
    enabled: activeTab === 'system',
  });

  const { data: activityData } = useQuery({
    queryKey: QUERY_KEYS.ADMIN.ACTIVITY,
    queryFn: () => adminService.getActivity(),
    enabled: activeTab === 'system',
  });

  const { data: healthData } = useQuery({
    queryKey: ['super-admin', 'system-health'],
    queryFn: () => adminService.getSystemHealth(),
    refetchInterval: 60000,
    enabled: activeTab === 'system',
  });

  // BigQuery queries (lazy-loaded)
  const { data: skillsData, isLoading: skillsLoading } = useQuery({
    queryKey: QUERY_KEYS.ADVANCED_ANALYTICS.SKILLS,
    queryFn: () => advancedAnalyticsService.getPopularSkills(20),
    enabled: activeTab === 'advanced',
  });

  const { data: funnelData, isLoading: funnelLoading } = useQuery({
    queryKey: QUERY_KEYS.ADVANCED_ANALYTICS.FUNNEL(startDate, endDate),
    queryFn: () =>
      advancedAnalyticsService.getApplicationFunnel(startDate || undefined, endDate || undefined),
    enabled: activeTab === 'advanced' || activeTab === 'applications',
  });

  const { data: userGrowthData, isLoading: growthLoading } = useQuery({
    queryKey: QUERY_KEYS.ADVANCED_ANALYTICS.USER_GROWTH(startDate, endDate),
    queryFn: () =>
      advancedAnalyticsService.getUserGrowth(startDate || undefined, endDate || undefined),
    enabled: activeTab === 'advanced',
  });

  const { data: salaryData, isLoading: salaryLoading } = useQuery({
    queryKey: QUERY_KEYS.ADVANCED_ANALYTICS.SALARY,
    queryFn: () => advancedAnalyticsService.getSalaryTrends(),
    enabled: activeTab === 'advanced',
  });

  const { data: jobTrendsData, isLoading: jobTrendsLoading } = useQuery({
    queryKey: QUERY_KEYS.ADVANCED_ANALYTICS.JOB_TRENDS(startDate, endDate),
    queryFn: () =>
      advancedAnalyticsService.getJobTrends(startDate || undefined, endDate || undefined),
    enabled: activeTab === 'advanced',
  });

  // ── Derived data ──

  const stats = statsData?.data;
  const analytics = analyticsData?.data || [];
  const appStats = appStatsData?.data;
  const dailyActiveUsers = dauData?.data || [];
  const liveCounters = (liveCountersData as { data?: Record<string, number> })?.data;
  const kafkaEvents = kafkaEventsData?.data ?? [];
  const verificationStats = verificationStatsData?.data;
  const activity = activityData?.data as RecentActivity | undefined;
  const healthStatus = healthData?.data ?? healthData;
  const popularSkills = skillsData?.data || [];
  const applicationFunnel = funnelData?.data || [];
  const userGrowth = userGrowthData?.data || [];
  const salaryTrends = salaryData?.data || [];
  const jobTrends = jobTrendsData?.data || [];

  const totals = useMemo(
    () =>
      analytics.reduce(
        (acc, item) => ({
          registrations: acc.registrations + item.registrations,
          jobPostings: acc.jobPostings + item.jobPostings,
          applications: acc.applications + item.applications,
        }),
        { registrations: 0, jobPostings: 0, applications: 0 },
      ),
    [analytics],
  );

  // Period-over-period deltas
  const deltas = useMemo(() => {
    if (analytics.length < 2) return null;
    const mid = Math.floor(analytics.length / 2);
    const firstHalf = analytics.slice(0, mid);
    const secondHalf = analytics.slice(mid);
    const sum = (arr: typeof analytics, key: keyof (typeof analytics)[0]) =>
      arr.reduce((s, i) => s + (i[key] as number), 0);
    return {
      registrations: computeDelta(
        sum(secondHalf, 'registrations'),
        sum(firstHalf, 'registrations'),
      ),
      jobPostings: computeDelta(sum(secondHalf, 'jobPostings'), sum(firstHalf, 'jobPostings')),
      applications: computeDelta(sum(secondHalf, 'applications'), sum(firstHalf, 'applications')),
    };
  }, [analytics]);

  // Application status pie data
  const statusPieData = useMemo(() => {
    if (!appStats?.byStatus) return [];
    return Object.entries(appStats.byStatus)
      .filter(([, count]) => count > 0)
      .map(([status, count]) => ({
        name: STATUS_LABELS[status] || status,
        value: count,
        color: STATUS_COLORS[status] || '#6B7280',
      }));
  }, [appStats?.byStatus]);

  // User distribution pie
  const userDistPieData = stats
    ? [
        { name: 'Candidates', value: stats.totalCandidates, color: '#3B82F6' },
        { name: 'Employers', value: stats.totalEmployers, color: '#F59E0B' },
        ...(stats.totalAdmins
          ? [{ name: 'Admins', value: stats.totalAdmins, color: '#8B5CF6' }]
          : []),
      ]
    : [];

  // Funnel visualization
  const funnelSteps = useMemo(() => {
    if (applicationFunnel.length === 0) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return applicationFunnel.map((item: any) => ({
      status: item.status,
      count: item.count ?? 0,
    }));
  }, [applicationFunnel]);

  const funnelTotal = funnelSteps.length > 0 ? Math.max(funnelSteps[0].count, 1) : 1;

  // Status breakdown table data (sorted by count)
  const statusTableData = useMemo(() => {
    if (!appStats?.byStatus) return [];
    const total = Object.values(appStats.byStatus).reduce((s, c) => s + c, 0);
    return Object.entries(appStats.byStatus)
      .sort(([, a], [, b]) => b - a)
      .map(([status, count]) => ({
        status,
        count,
        pct: total > 0 ? ((count / total) * 100).toFixed(1) : '0',
      }));
  }, [appStats?.byStatus]);

  // Verification pipeline
  const verificationTotal =
    (stats?.pendingVerifications ?? 0) +
    (stats?.verificationsApproved ?? 0) +
    (stats?.verificationsRejected ?? 0);

  // ── Pipeline Bottleneck Detection ──
  const bottleneck = useMemo(() => {
    if (!appStats?.byStatus) return null;
    const counts = PIPELINE_STAGES.map((s) => appStats.byStatus[s] ?? 0);
    let worstIdx = -1;
    let worstRate = Infinity;
    for (let i = 1; i < counts.length; i++) {
      if (counts[i - 1] > 0) {
        const rate = counts[i] / counts[i - 1];
        if (rate < worstRate) {
          worstRate = rate;
          worstIdx = i;
        }
      }
    }
    if (worstIdx < 0) return null;
    return {
      from: STATUS_LABELS[PIPELINE_STAGES[worstIdx - 1]] || PIPELINE_STAGES[worstIdx - 1],
      to: STATUS_LABELS[PIPELINE_STAGES[worstIdx]] || PIPELINE_STAGES[worstIdx],
      rate: Math.round(worstRate * 100),
    };
  }, [appStats?.byStatus]);

  // ── Growth Velocity ──
  const growthVelocity = useMemo(() => {
    if (dailyActiveUsers.length < 2) return null;
    const last7 = dailyActiveUsers.slice(-7);
    const prev7 = dailyActiveUsers.slice(-14, -7);
    const last7Avg = last7.reduce((s, d) => s + d.total, 0) / last7.length;
    const prev7Avg = prev7.length > 0 ? prev7.reduce((s, d) => s + d.total, 0) / prev7.length : 0;
    const wowGrowth = prev7Avg > 0 ? Math.round(((last7Avg - prev7Avg) / prev7Avg) * 100) : 0;
    const engagementRate = stats?.totalUsers
      ? Math.round(((stats.activeThisWeek ?? 0) / stats.totalUsers) * 100)
      : 0;
    const jobFillRate =
      stats?.totalJobs && stats.totalJobs > 0
        ? Math.round((stats.activeJobs / stats.totalJobs) * 100)
        : 0;
    const appsPerJob =
      stats?.activeJobs && stats.activeJobs > 0
        ? Math.round(stats.totalApplications / stats.activeJobs)
        : 0;
    return { wowGrowth, engagementRate, jobFillRate, avgDAU: Math.round(last7Avg), appsPerJob };
  }, [dailyActiveUsers, stats]);

  // ── Day-of-Week Application Pattern ──
  const dayOfWeekData = useMemo(() => {
    if (!appStats?.dailyTrend || appStats.dailyTrend.length === 0) return [];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const buckets = days.map(() => ({ count: 0, weeks: 0 }));
    appStats.dailyTrend.forEach((d) => {
      const dow = new Date(d.date).getDay();
      buckets[dow].count += d.count;
      buckets[dow].weeks++;
    });
    return days.map((day, i) => ({
      day,
      avg: buckets[i].weeks > 0 ? Math.round(buckets[i].count / buckets[i].weeks) : 0,
    }));
  }, [appStats?.dailyTrend]);

  // ── Registration Day-of-Week Pattern ──
  const regDayOfWeekData = useMemo(() => {
    if (!stats?.registrationTrends || stats.registrationTrends.length === 0) return [];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const buckets = days.map(() => ({ count: 0, weeks: 0 }));
    stats.registrationTrends.forEach((d) => {
      const dow = new Date(d.date).getDay();
      buckets[dow].count += d.count;
      buckets[dow].weeks++;
    });
    return days.map((day, i) => ({
      day,
      avg: buckets[i].weeks > 0 ? Math.round(buckets[i].count / buckets[i].weeks) : 0,
    }));
  }, [stats?.registrationTrends]);

  // ── Export handlers ──

  const handleExport = async (type: 'users' | 'jobs' | 'analytics') => {
    setExportingType(type);
    try {
      const blob = await adminService.exportReport({ type, period: 'month' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}-report.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // handled by global error
    } finally {
      setExportingType(null);
    }
  };

  // ── Summary cards with sparklines and deltas ──

  const summaryCards = stats
    ? [
        {
          label: 'Total Users',
          value: stats.totalUsers,
          icon: Users,
          color: 'text-primary bg-primary-light',
          sparkData: dailyActiveUsers.map((d) => ({ v: d.total })),
          sparkColor: '#1E5CAF',
          delta: deltas?.registrations,
        },
        {
          label: 'Candidates',
          value: stats.totalCandidates,
          icon: Users,
          color: 'text-[var(--info)] bg-[var(--info-light)]',
          sparkData: dailyActiveUsers.map((d) => ({ v: d.candidates })),
          sparkColor: '#3B82F6',
        },
        {
          label: 'Employers',
          value: stats.totalEmployers,
          icon: Briefcase,
          color: 'text-[var(--warning)] bg-[var(--warning-light)]',
          sparkData: dailyActiveUsers.map((d) => ({ v: d.employers })),
          sparkColor: '#F59E0B',
        },
        {
          label: 'Active Jobs',
          value: stats.activeJobs,
          icon: Briefcase,
          color: 'text-[var(--success)] bg-[var(--success-light)]',
        },
        {
          label: 'Total Applications',
          value: stats.totalApplications,
          icon: FileText,
          color: 'text-[#8B5CF6] bg-[#EDE9FE]',
          sparkData: appStats?.dailyTrend?.map((d) => ({ v: d.count })),
          sparkColor: '#8B5CF6',
          delta: deltas?.applications,
        },
        {
          label: 'New This Week',
          value: stats.newUsersThisWeek,
          icon: UserPlus,
          color: 'text-primary bg-primary-light',
        },
        {
          label: 'New This Month',
          value: stats.newUsersThisMonth,
          icon: TrendingUp,
          color: 'text-[var(--success)] bg-[var(--success-light)]',
        },
        {
          label: 'Active This Week',
          value: stats.activeThisWeek ?? 0,
          icon: Activity,
          color: 'text-[var(--info)] bg-[var(--info-light)]',
        },
        {
          label: 'Pending Verifications',
          value: stats.pendingVerifications,
          icon: ShieldCheck,
          color: 'text-[var(--warning)] bg-[var(--warning-light)]',
        },
        {
          label: 'Apps/Job Ratio',
          value: stats.applicationConversionRate ?? 0,
          icon: Zap,
          color: 'text-[var(--text-muted)] bg-[var(--bg-tertiary)]',
        },
      ]
    : [];

  const tabs = [
    { key: 'overview' as const, label: 'Platform Overview' },
    { key: 'applications' as const, label: 'Applications & Hiring' },
    { key: 'advanced' as const, label: 'Advanced Intelligence (BigQuery)' },
    { key: 'system' as const, label: 'System & Events' },
  ];

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="analytics.overview"
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Platform Analytics</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Enterprise-grade analytics, real-time intelligence, and BigQuery-powered insights.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['analytics', 'users', 'jobs'] as const).map((type) => (
              <Button
                key={type}
                variant="outline"
                size="sm"
                onClick={() => handleExport(type)}
                isLoading={exportingType === type}
                disabled={!!exportingType}
                tooltip={`Export ${type} data as CSV`}
              >
                <Download className="mr-1.5 h-4 w-4" />
                Export {type.charAt(0).toUpperCase() + type.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg bg-[var(--bg-secondary)] p-1">
          {tabs.map((tab) => (
            <Tooltip key={tab.key} content={`View ${tab.label.toLowerCase()} analytics`}>
              <button
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 cursor-pointer rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-white text-[var(--text)] shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                {tab.label}
              </button>
            </Tooltip>
          ))}
        </div>

        {/* Filters */}
        <Card>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {DATE_PRESETS.map((preset) => (
                <Tooltip key={preset.key} content={`Filter by ${preset.label.toLowerCase()}`}>
                  <button
                    onClick={() => handlePreset(preset.key)}
                    className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      activePreset === preset.key
                        ? 'bg-primary text-white'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                    }`}
                  >
                    {preset.label}
                  </button>
                </Tooltip>
              ))}
              {(startDate || endDate) && (
                <Tooltip content="Clear date filter">
                  <button
                    onClick={() => {
                      setStartDate('');
                      setEndDate('');
                      setActivePreset(null);
                    }}
                    className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
                  >
                    Clear
                  </button>
                </Tooltip>
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

        {/* ════════════════════════════════════════════════════════════
                    TAB 1: Platform Overview
                   ════════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <>
            {/* Summary Cards with sparklines and deltas */}
            {statsLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {Array.from({ length: 10 }).map((_, i) => (
                  <Card key={i}>
                    <Skeleton variant="rect" height={100} />
                  </Card>
                ))}
              </div>
            ) : stats ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {summaryCards.map((card) => (
                  <Card key={card.label} padding="sm">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.color}`}
                      >
                        <card.icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-[var(--text-muted)]">{card.label}</p>
                        <div className="flex items-center gap-1.5">
                          <p className="text-xl font-bold text-[var(--text)]">
                            {formatNumber(card.value)}
                          </p>
                          {card.delta !== undefined && card.delta !== null && (
                            <span
                              className={`flex items-center text-xs font-medium ${card.delta >= 0 ? 'text-[var(--success)]' : 'text-[var(--error)]'}`}
                            >
                              {card.delta >= 0 ? (
                                <ArrowUpRight className="h-3 w-3" />
                              ) : (
                                <ArrowDownRight className="h-3 w-3" />
                              )}
                              {Math.abs(card.delta)}%
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {card.sparkData && card.sparkData.length > 1 && (
                      <div className="mt-2">
                        <StatsChart
                          data={card.sparkData}
                          dataKey="v"
                          color={card.sparkColor}
                          height={40}
                        />
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            ) : null}

            {/* Live Counters */}
            {liveCounters && Object.keys(liveCounters).length > 0 && (
              <Card
                header={
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-[var(--success)]" />
                    <h2 className="text-lg font-semibold text-[var(--text)]">Real-Time Counters</h2>
                    <span className="relative ml-2 flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--success)] opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--success)]" />
                    </span>
                    <span className="ml-auto text-xs text-[var(--text-muted)]">
                      Auto-refreshes every 30s
                    </span>
                  </div>
                }
              >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    {
                      key: 'activeUsers',
                      label: 'Active Users',
                      icon: Activity,
                      color: 'text-[var(--success)]',
                      highlight: true,
                    },
                    {
                      key: 'newUsersToday',
                      label: 'New Users Today',
                      icon: UserPlus,
                      color: 'text-primary',
                    },
                    {
                      key: 'jobsPostedToday',
                      label: 'Jobs Posted Today',
                      icon: Briefcase,
                      color: 'text-[var(--warning)]',
                    },
                    {
                      key: 'applicationsToday',
                      label: 'Applications Today',
                      icon: FileText,
                      color: 'text-[var(--info)]',
                    },
                  ].map(({ key, label, icon: Icon, color, highlight }) => (
                    <div
                      key={key}
                      className={`flex items-center gap-3 rounded-lg p-4 ${highlight ? 'bg-primary-light' : 'bg-[var(--bg-secondary)]'}`}
                    >
                      <Icon className={`h-5 w-5 ${color}`} />
                      <div>
                        <p
                          className={`text-xl font-bold ${highlight ? 'text-primary' : 'text-[var(--text)]'}`}
                        >
                          {liveCounters[key] ?? 0}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">{label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Platform Trends + Activity Breakdown */}
            {analyticsLoading ? (
              <div className="grid gap-6 lg:grid-cols-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Card key={i}>
                    <Skeleton variant="rect" height={300} />
                  </Card>
                ))}
              </div>
            ) : analytics.length > 0 ? (
              <div className="grid gap-6 lg:grid-cols-2">
                <Card
                  header={
                    <div className="flex items-center gap-2">
                      <TrendingUp className="text-primary h-5 w-5" />
                      <h2 className="text-lg font-semibold text-[var(--text)]">
                        Registrations & Applications
                      </h2>
                    </div>
                  }
                >
                  <AreaChart
                    data={analytics as unknown as Record<string, unknown>[]}
                    xKey="period"
                    yKey="registrations"
                    yKey2="applications"
                    color="#1E5CAF"
                    color2="#10B981"
                    height={280}
                  />
                </Card>
                <Card
                  header={
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-[var(--success)]" />
                      <h2 className="text-lg font-semibold text-[var(--text)]">
                        Activity Breakdown
                      </h2>
                    </div>
                  }
                >
                  <BarChart
                    data={analytics as unknown as Record<string, unknown>[]}
                    xKey="period"
                    bars={[
                      { key: 'registrations', color: '#1E5CAF', name: 'Registrations' },
                      { key: 'jobPostings', color: '#10B981', name: 'Job Postings' },
                      { key: 'applications', color: '#F59E0B', name: 'Applications' },
                    ]}
                    height={280}
                  />
                </Card>
              </div>
            ) : (
              <Card>
                <EmptyState
                  icon={TrendingUp}
                  title="No trend data"
                  description="Select a date range to view platform activity trends."
                />
              </Card>
            )}

            {/* Application Status Distribution + User Distribution */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Card
                header={
                  <div className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-[var(--info)]" />
                    <h2 className="text-lg font-semibold text-[var(--text)]">
                      Application Status Distribution
                    </h2>
                  </div>
                }
              >
                {appStatsLoading ? (
                  <Skeleton variant="rect" height={280} />
                ) : statusPieData.length > 0 ? (
                  <PieChart data={statusPieData} height={280} innerRadius={55} />
                ) : (
                  <EmptyState
                    icon={Target}
                    title="No application data"
                    description="Application status distribution will appear as applications are submitted."
                  />
                )}
              </Card>
              <Card
                header={
                  <div className="flex items-center gap-2">
                    <Users className="text-primary h-5 w-5" />
                    <h2 className="text-lg font-semibold text-[var(--text)]">User Distribution</h2>
                  </div>
                }
              >
                {statsLoading ? (
                  <Skeleton variant="rect" height={280} />
                ) : userDistPieData.length > 0 ? (
                  <PieChart data={userDistPieData} height={280} innerRadius={55} />
                ) : (
                  <EmptyState
                    icon={Users}
                    title="No user data"
                    description="User distribution will appear as users register."
                  />
                )}
              </Card>
            </div>

            {/* Top Skills + Top Locations (from comprehensive stats) */}
            {stats && (stats.topSkills?.length || stats.topLocations?.length) && (
              <div className="grid gap-6 lg:grid-cols-2">
                {stats.topSkills && stats.topSkills.length > 0 && (
                  <Card
                    header={
                      <div className="flex items-center gap-2">
                        <Code className="text-primary h-5 w-5" />
                        <h2 className="text-lg font-semibold text-[var(--text)]">
                          Top Skills in Demand
                        </h2>
                      </div>
                    }
                  >
                    <BarChart
                      data={stats.topSkills
                        .slice(0, 10)
                        .map((s) => ({ skill: s.skill, count: s.count }))}
                      xKey="skill"
                      bars={[{ key: 'count', color: '#1E5CAF', name: 'Candidates' }]}
                      height={280}
                    />
                  </Card>
                )}
                {stats.topLocations && stats.topLocations.length > 0 && (
                  <Card
                    header={
                      <div className="flex items-center gap-2">
                        <MapPin className="h-5 w-5 text-[var(--success)]" />
                        <h2 className="text-lg font-semibold text-[var(--text)]">
                          Top Candidate Locations
                        </h2>
                      </div>
                    }
                  >
                    <BarChart
                      data={stats.topLocations
                        .slice(0, 10)
                        .map((l) => ({ location: l.location, count: l.count }))}
                      xKey="location"
                      bars={[{ key: 'count', color: '#10B981', name: 'Candidates' }]}
                      height={280}
                    />
                  </Card>
                )}
              </div>
            )}

            {/* Registration Trends (from comprehensive stats) + Daily Application Volume */}
            <div className="grid gap-6 lg:grid-cols-2">
              {stats?.registrationTrends && stats.registrationTrends.length > 0 && (
                <Card
                  header={
                    <h2 className="text-lg font-semibold text-[var(--text)]">
                      Registration Trends (30 Days)
                    </h2>
                  }
                >
                  <AreaChart
                    data={stats.registrationTrends.map((d) => ({
                      date: new Date(d.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      }),
                      Registrations: d.count,
                    }))}
                    xKey="date"
                    yKey="Registrations"
                    color="#1E5CAF"
                    height={280}
                  />
                </Card>
              )}
              {appStats && appStats.dailyTrend.length > 0 && (
                <Card
                  header={
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-[#8B5CF6]" />
                      <h2 className="text-lg font-semibold text-[var(--text)]">
                        Daily Application Volume
                      </h2>
                      <span className="ml-auto text-sm font-medium text-[var(--text)]">
                        {formatNumber(appStats.total)} total
                      </span>
                    </div>
                  }
                >
                  <AreaChart
                    data={appStats.dailyTrend as unknown as Record<string, unknown>[]}
                    xKey="date"
                    yKey="count"
                    color="#8B5CF6"
                    height={280}
                  />
                </Card>
              )}
            </div>

            {/* Verification Pipeline */}
            {stats && verificationTotal > 0 && (
              <Card
                header={
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-[var(--warning)]" />
                    <h2 className="text-lg font-semibold text-[var(--text)]">
                      Verification Pipeline
                    </h2>
                    {(stats.pendingVerifications ?? 0) > 0 && (
                      <span className="ml-2 flex items-center gap-1 text-xs text-[var(--warning)]">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {stats.pendingVerifications} pending
                      </span>
                    )}
                  </div>
                }
              >
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="space-y-4">
                    {[
                      {
                        label: 'Pending',
                        value: stats.pendingVerifications ?? 0,
                        color: 'bg-[var(--warning)]',
                      },
                      {
                        label: 'Approved',
                        value: stats.verificationsApproved ?? 0,
                        color: 'bg-[var(--success)]',
                      },
                      {
                        label: 'Rejected',
                        value: stats.verificationsRejected ?? 0,
                        color: 'bg-[var(--error)]',
                      },
                    ].map((item) => {
                      const pct =
                        verificationTotal > 0
                          ? Math.round((item.value / verificationTotal) * 100)
                          : 0;
                      return (
                        <div key={item.label}>
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-sm font-medium text-[var(--text)]">
                              {item.label}
                            </span>
                            <span className="text-sm text-[var(--text-muted)]">
                              {item.value} ({pct}%)
                            </span>
                          </div>
                          <div className="h-2.5 w-full rounded-full bg-[var(--bg-tertiary)]">
                            <div
                              className={`h-2.5 rounded-full ${item.color} transition-all`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <PieChart
                    data={[
                      { name: 'Pending', value: stats.pendingVerifications ?? 0, color: '#F59E0B' },
                      {
                        name: 'Approved',
                        value: stats.verificationsApproved ?? 0,
                        color: '#10B981',
                      },
                      {
                        name: 'Rejected',
                        value: stats.verificationsRejected ?? 0,
                        color: '#EF4444',
                      },
                    ]}
                    height={200}
                    innerRadius={40}
                  />
                </div>
              </Card>
            )}

            {/* Daily Active Users */}
            <Card
              header={
                <div className="flex items-center gap-2">
                  <Eye className="text-primary h-5 w-5" />
                  <h2 className="text-lg font-semibold text-[var(--text)]">
                    Daily Active Users (Last 30 Days)
                  </h2>
                </div>
              }
            >
              {dauLoading ? (
                <Skeleton variant="rect" height={340} />
              ) : dailyActiveUsers.length > 0 ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      {
                        label: "Today's Total",
                        value: dailyActiveUsers[dailyActiveUsers.length - 1]?.total ?? 0,
                        color: 'text-[var(--text)]',
                      },
                      {
                        label: 'Candidates',
                        value: dailyActiveUsers[dailyActiveUsers.length - 1]?.candidates ?? 0,
                        color: 'text-primary',
                      },
                      {
                        label: 'Employers',
                        value: dailyActiveUsers[dailyActiveUsers.length - 1]?.employers ?? 0,
                        color: 'text-[var(--success)]',
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="rounded-lg bg-[var(--bg-secondary)] p-3 text-center"
                      >
                        <p className={`text-2xl font-bold ${item.color}`}>
                          {formatNumber(item.value)}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">{item.label}</p>
                      </div>
                    ))}
                  </div>
                  <AreaChart
                    data={dailyActiveUsers as unknown as Record<string, unknown>[]}
                    xKey="date"
                    yKey="total"
                    yKey2="candidates"
                    color="#1E5CAF"
                    color2="#10B981"
                    height={280}
                  />
                </div>
              ) : (
                <EmptyState
                  icon={Eye}
                  title="No active user data"
                  description="Daily active user data will appear as users interact with the platform."
                />
              )}
            </Card>

            {/* ── Growth Velocity & Platform Health ── */}
            {growthVelocity && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  {
                    label: 'WoW Growth',
                    value: `${growthVelocity.wowGrowth > 0 ? '+' : ''}${growthVelocity.wowGrowth}%`,
                    icon: TrendingUp,
                    color:
                      growthVelocity.wowGrowth >= 0
                        ? 'text-[var(--success)] bg-[var(--success-light)]'
                        : 'text-[var(--error)] bg-[var(--error-light)]',
                  },
                  {
                    label: 'User Engagement',
                    value: `${growthVelocity.engagementRate}%`,
                    icon: Activity,
                    color: 'text-primary bg-primary-light',
                    bar: growthVelocity.engagementRate,
                  },
                  {
                    label: 'Active Jobs Rate',
                    value: `${growthVelocity.jobFillRate}%`,
                    icon: Briefcase,
                    color: 'text-[var(--info)] bg-[var(--info-light)]',
                    bar: growthVelocity.jobFillRate,
                  },
                  {
                    label: 'Apps Per Active Job',
                    value: growthVelocity.appsPerJob.toString(),
                    icon: Target,
                    color: 'text-[var(--warning)] bg-[var(--warning-light)]',
                  },
                  {
                    label: 'Avg DAU (7d)',
                    value: formatNumber(growthVelocity.avgDAU),
                    icon: Eye,
                    color: 'text-[var(--text-muted)] bg-[var(--bg-tertiary)]',
                  },
                ].map((item) => (
                  <Card key={item.label} padding="sm">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${item.color}`}
                      >
                        <item.icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-lg font-bold text-[var(--text)]">{item.value}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">{item.label}</p>
                        {'bar' in item && item.bar !== undefined && (
                          <div className="mt-1 h-1 w-full rounded-full bg-[var(--bg-tertiary)]">
                            <div
                              className="h-1 rounded-full bg-current transition-all"
                              style={{ width: `${Math.min(item.bar, 100)}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {/* ── Day-of-Week Patterns ── */}
            {(dayOfWeekData.length > 0 || regDayOfWeekData.length > 0) && (
              <div className="grid gap-6 lg:grid-cols-2">
                {dayOfWeekData.length > 0 && (
                  <Card
                    header={
                      <div className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-[#8B5CF6]" />
                        <h2 className="text-lg font-semibold text-[var(--text)]">
                          Application Day-of-Week Pattern
                        </h2>
                      </div>
                    }
                  >
                    <BarChart
                      data={dayOfWeekData}
                      xKey="day"
                      bars={[{ key: 'avg', color: '#8B5CF6', name: 'Avg Applications' }]}
                      height={220}
                    />
                  </Card>
                )}
                {regDayOfWeekData.length > 0 && (
                  <Card
                    header={
                      <div className="flex items-center gap-2">
                        <Clock className="text-primary h-5 w-5" />
                        <h2 className="text-lg font-semibold text-[var(--text)]">
                          Registration Day-of-Week Pattern
                        </h2>
                      </div>
                    }
                  >
                    <BarChart
                      data={regDayOfWeekData}
                      xKey="day"
                      bars={[{ key: 'avg', color: '#1E5CAF', name: 'Avg Registrations' }]}
                      height={220}
                    />
                  </Card>
                )}
              </div>
            )}

            {/* Period Breakdown Table */}
            <Card
              header={
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-[var(--text-muted)]" />
                  <h2 className="text-lg font-semibold text-[var(--text)]">Period Breakdown</h2>
                </div>
              }
              padding="sm"
            >
              {analyticsLoading ? (
                <div className="space-y-3 p-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} variant="rect" height={40} />
                  ))}
                </div>
              ) : analytics.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                          Period
                        </th>
                        <th className="px-4 py-3 text-right font-medium text-[var(--text-secondary)]">
                          Registrations
                        </th>
                        <th className="px-4 py-3 text-right font-medium text-[var(--text-secondary)]">
                          Job Postings
                        </th>
                        <th className="px-4 py-3 text-right font-medium text-[var(--text-secondary)]">
                          Applications
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {analytics.map((item, idx) => (
                        <tr key={idx} className="transition-colors hover:bg-[var(--bg-secondary)]">
                          <td className="px-4 py-3 font-medium text-[var(--text)]">
                            {item.period}
                          </td>
                          <td className="px-4 py-3 text-right text-[var(--text-secondary)]">
                            {item.registrations.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right text-[var(--text-secondary)]">
                            {item.jobPostings.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right text-[var(--text-secondary)]">
                            {item.applications.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-[var(--bg-secondary)] font-semibold">
                        <td className="px-4 py-3 text-[var(--text)]">Total</td>
                        {(['registrations', 'jobPostings', 'applications'] as const).map((key) => (
                          <td key={key} className="px-4 py-3 text-right text-[var(--text)]">
                            {totals[key].toLocaleString()}
                            {deltas && (
                              <span
                                className={`ml-2 inline-flex items-center gap-0.5 text-[10px] font-medium ${deltas[key] >= 0 ? 'text-[var(--success)]' : 'text-[var(--error)]'}`}
                              >
                                {deltas[key] >= 0 ? (
                                  <ArrowUpRight className="h-3 w-3" />
                                ) : (
                                  <ArrowDownRight className="h-3 w-3" />
                                )}
                                {Math.abs(deltas[key])}%
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  icon={BarChart3}
                  title="No analytics data"
                  description="Select a date range to view period breakdown."
                />
              )}
            </Card>

            {/* Teams & Vendors aggregate metrics — same data the SA
                dashboard shows, surfaced here so the analytics page
                covers the full platform. */}
            <TeamsVendorsWidget />
          </>
        )}

        {/* ════════════════════════════════════════════════════════════
                    TAB 2: Applications & Hiring
                   ════════════════════════════════════════════════════════════ */}
        {activeTab === 'applications' && (
          <div className="space-y-6">
            {/* Application KPIs */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  label: 'Total Applications',
                  value: appStats?.total ?? 0,
                  icon: FileText,
                  color: 'text-primary bg-primary-light',
                },
                {
                  label: 'Applications This Week',
                  value: stats?.applicationsThisWeek ?? 0,
                  icon: TrendingUp,
                  color: 'text-[var(--success)] bg-[var(--success-light)]',
                },
                {
                  label: 'Apps/Job Ratio',
                  value: stats?.applicationConversionRate ?? 0,
                  icon: Zap,
                  color: 'text-[var(--warning)] bg-[var(--warning-light)]',
                },
                {
                  label: 'Expired Jobs',
                  value: stats?.expiredJobs ?? 0,
                  icon: Clock,
                  color: 'text-[var(--error)] bg-[var(--error-light)]',
                },
              ].map((kpi) => (
                <Card key={kpi.label} padding="sm">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${kpi.color}`}
                    >
                      <kpi.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xl font-bold text-[var(--text)]">
                        {(kpi.value ?? 0).toLocaleString()}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">{kpi.label}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {/* Application Volume + Status Distribution */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Card
                header={
                  <h2 className="text-lg font-semibold text-[var(--text)]">
                    Daily Application Volume
                  </h2>
                }
              >
                {appStatsLoading ? (
                  <Skeleton variant="rect" height={280} />
                ) : appStats?.dailyTrend && appStats.dailyTrend.length > 0 ? (
                  <AreaChart
                    data={appStats.dailyTrend.map((d) => ({
                      date: new Date(d.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      }),
                      Applications: d.count,
                    }))}
                    xKey="date"
                    yKey="Applications"
                    color="#8B5CF6"
                    height={280}
                  />
                ) : (
                  <EmptyState
                    icon={FileText}
                    title="No data"
                    description="Application volume data will appear as applications are submitted."
                  />
                )}
              </Card>

              <Card
                header={
                  <h2 className="text-lg font-semibold text-[var(--text)]">Status Distribution</h2>
                }
              >
                {appStatsLoading ? (
                  <Skeleton variant="rect" height={280} />
                ) : statusPieData.length > 0 ? (
                  <PieChart data={statusPieData} height={280} innerRadius={55} />
                ) : (
                  <EmptyState
                    icon={Target}
                    title="No data"
                    description="Status distribution will appear as applications are processed."
                  />
                )}
              </Card>
            </div>

            {/* Pipeline Bottleneck Alert */}
            {bottleneck && (
              <Card padding="sm">
                <div className="flex items-center gap-3 rounded-lg border border-[var(--warning)]/30 bg-[var(--warning-light)] p-4">
                  <AlertTriangle className="h-6 w-6 shrink-0 text-[var(--warning)]" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-[var(--text)]">
                      Pipeline Bottleneck Detected
                    </p>
                    <p className="text-sm text-[var(--text-secondary)]">
                      Lowest conversion: <strong>{bottleneck.from}</strong> →{' '}
                      <strong>{bottleneck.to}</strong> at <strong>{bottleneck.rate}%</strong>.
                      Consider reviewing your {bottleneck.to.toLowerCase()} process.
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {/* Hiring Funnel with conversion rates */}
            <Card
              header={
                <div className="flex items-center gap-2">
                  <TrendingUp className="text-primary h-5 w-5" />
                  <h2 className="text-lg font-semibold text-[var(--text)]">
                    Platform Hiring Funnel
                  </h2>
                </div>
              }
            >
              {funnelLoading ? (
                <Skeleton variant="rect" height={300} />
              ) : funnelSteps.length > 0 ? (
                <div className="space-y-3">
                  {funnelSteps.map((step: { status: string; count: number }, i: number) => {
                    const pct = Math.round((step.count / funnelTotal) * 100);
                    const prevCount = i > 0 ? funnelSteps[i - 1].count : step.count;
                    const conversionRate =
                      prevCount > 0 ? Math.round((step.count / prevCount) * 100) : 100;
                    return (
                      <div key={step.status} className="flex items-center gap-4">
                        <div className="w-28 shrink-0 text-sm font-medium text-[var(--text)]">
                          {STATUS_LABELS[step.status] || step.status}
                        </div>
                        <div className="flex-1">
                          <div className="relative h-8 overflow-hidden rounded-lg bg-[var(--bg-secondary)]">
                            <div
                              className="absolute inset-y-0 left-0 rounded-lg transition-all duration-500"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: FUNNEL_COLORS[i % FUNNEL_COLORS.length],
                              }}
                            />
                            <span className="absolute inset-y-0 left-3 flex items-center text-xs font-semibold text-white mix-blend-difference">
                              {formatNumber(step.count)}
                            </span>
                          </div>
                        </div>
                        <div className="w-14 shrink-0 text-right">
                          <Badge
                            variant={pct > 50 ? 'success' : pct > 20 ? 'warning' : 'neutral'}
                            size="sm"
                          >
                            {pct}%
                          </Badge>
                        </div>
                        <div className="w-16 shrink-0 text-right text-xs text-[var(--text-muted)]">
                          {i > 0 ? `${conversionRate}% conv` : ''}
                        </div>
                      </div>
                    );
                  })}
                  {/* Rejected/Withdrawn summary */}
                  {funnelSteps.some(
                    (s: { status: string }) => s.status === 'REJECTED' || s.status === 'WITHDRAWN',
                  ) && (
                    <div className="mt-4 flex gap-4 rounded-lg bg-[var(--bg-secondary)] p-3">
                      {funnelSteps
                        .filter(
                          (s: { status: string }) =>
                            s.status === 'REJECTED' || s.status === 'WITHDRAWN',
                        )
                        .map((s: { status: string; count: number }) => (
                          <div key={s.status} className="flex items-center gap-2">
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${s.status === 'REJECTED' ? 'bg-[var(--error)]' : 'bg-gray-400'}`}
                            />
                            <span className="text-sm text-[var(--text)]">
                              {STATUS_LABELS[s.status] || s.status}:{' '}
                              <strong>{formatNumber(s.count)}</strong>
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState
                  icon={TrendingUp}
                  title="No funnel data"
                  description="Hiring funnel data No data available yet."
                />
              )}
            </Card>

            {/* Application Funnel Bar + Status Breakdown Table */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Card
                header={
                  <h2 className="text-lg font-semibold text-[var(--text)]">Funnel Bar Chart</h2>
                }
              >
                {funnelLoading ? (
                  <Skeleton variant="rect" height={280} />
                ) : applicationFunnel.length > 0 ? (
                  <BarChart
                    data={applicationFunnel as unknown as Record<string, unknown>[]}
                    xKey="status"
                    bars={[{ key: 'count', color: '#10B981', name: 'Applications' }]}
                    height={280}
                  />
                ) : (
                  <EmptyState
                    icon={BarChart3}
                    title="No data"
                    description="Funnel chart No data available yet."
                  />
                )}
              </Card>

              <Card
                header={
                  <h2 className="text-lg font-semibold text-[var(--text)]">Status Breakdown</h2>
                }
                padding="sm"
              >
                {appStatsLoading ? (
                  <Skeleton variant="rect" height={280} />
                ) : statusTableData.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)]">
                          <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                            Status
                          </th>
                          <th className="px-4 py-3 text-right font-medium text-[var(--text-secondary)]">
                            Count
                          </th>
                          <th className="px-4 py-3 text-right font-medium text-[var(--text-secondary)]">
                            %
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {statusTableData.map((row) => (
                          <tr
                            key={row.status}
                            className="transition-colors hover:bg-[var(--bg-secondary)]"
                          >
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <span
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{
                                    backgroundColor: STATUS_COLORS[row.status] || '#6B7280',
                                  }}
                                />
                                <span className="font-medium text-[var(--text)]">
                                  {STATUS_LABELS[row.status] || row.status}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right text-[var(--text-secondary)]">
                              {row.count.toLocaleString()}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <Badge variant="neutral" size="sm">
                                {row.pct}%
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    icon={Target}
                    title="No data"
                    description="Status breakdown will appear as applications are processed."
                  />
                )}
              </Card>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════
                    TAB 3: Advanced Intelligence (BigQuery)
                   ════════════════════════════════════════════════════════════ */}
        {activeTab === 'advanced' && (
          <div className="space-y-6">
            {/* Skill Demand + Application Funnel Bar */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Card
                header={
                  <div className="flex items-center gap-2">
                    <Code className="text-primary h-5 w-5" />
                    <h2 className="text-lg font-semibold text-[var(--text)]">
                      Top Skills in Demand
                    </h2>
                    <span className="ml-auto text-xs text-[var(--text-muted)]">
                      BigQuery-powered
                    </span>
                  </div>
                }
              >
                {skillsLoading ? (
                  <Skeleton variant="rect" height={280} />
                ) : popularSkills.length > 0 ? (
                  <BarChart
                    data={popularSkills as unknown as Record<string, unknown>[]}
                    xKey="skill"
                    bars={[{ key: 'demand_count', color: '#1E5CAF', name: 'Demand' }]}
                    height={280}
                  />
                ) : (
                  <EmptyState
                    icon={Code}
                    title="No skill data"
                    description="Skill demand data No data available yet."
                  />
                )}
              </Card>

              <Card
                header={
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-[var(--info)]" />
                    <h2 className="text-lg font-semibold text-[var(--text)]">
                      Application Funnel (Chart)
                    </h2>
                  </div>
                }
              >
                {funnelLoading ? (
                  <Skeleton variant="rect" height={280} />
                ) : applicationFunnel.length > 0 ? (
                  <BarChart
                    data={applicationFunnel as unknown as Record<string, unknown>[]}
                    xKey="status"
                    bars={[{ key: 'count', color: '#10B981', name: 'Applications' }]}
                    height={280}
                  />
                ) : (
                  <EmptyState
                    icon={FileText}
                    title="No funnel data"
                    description="Application funnel chart No data available yet."
                  />
                )}
              </Card>
            </div>

            {/* User Growth + Job Posting Trends */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Card
                header={
                  <div className="flex items-center gap-2">
                    <UserPlus className="text-primary h-5 w-5" />
                    <h2 className="text-lg font-semibold text-[var(--text)]">User Growth</h2>
                  </div>
                }
              >
                {growthLoading ? (
                  <Skeleton variant="rect" height={280} />
                ) : userGrowth.length > 0 ? (
                  <AreaChart
                    data={userGrowth as unknown as Record<string, unknown>[]}
                    xKey="date"
                    yKey="registrations"
                    color="#1E5CAF"
                    height={280}
                  />
                ) : (
                  <EmptyState
                    icon={UserPlus}
                    title="No growth data"
                    description="User growth data No data available yet."
                  />
                )}
              </Card>

              <Card
                header={
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-5 w-5 text-[var(--success)]" />
                    <h2 className="text-lg font-semibold text-[var(--text)]">Job Posting Trends</h2>
                  </div>
                }
              >
                {jobTrendsLoading ? (
                  <Skeleton variant="rect" height={280} />
                ) : jobTrends.length > 0 ? (
                  <AreaChart
                    data={jobTrends as unknown as Record<string, unknown>[]}
                    xKey="date"
                    yKey="jobs_posted"
                    color="#10B981"
                    height={280}
                  />
                ) : (
                  <EmptyState
                    icon={Briefcase}
                    title="No job trends data"
                    description="Job posting trends No data available yet."
                  />
                )}
              </Card>
            </div>

            {/* Salary Trends */}
            <Card
              header={
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-[var(--warning)]" />
                  <h2 className="text-lg font-semibold text-[var(--text)]">Salary Trends</h2>
                </div>
              }
            >
              {salaryLoading ? (
                <Skeleton variant="rect" height={280} />
              ) : salaryTrends.length > 0 ? (
                <AreaChart
                  data={salaryTrends as unknown as Record<string, unknown>[]}
                  xKey="month"
                  yKey="avg_min_salary"
                  yKey2="avg_max_salary"
                  color="#F59E0B"
                  color2="#EF4444"
                  height={280}
                />
              ) : (
                <EmptyState
                  icon={DollarSign}
                  title="No salary data"
                  description="Salary trend data No data available yet."
                />
              )}
            </Card>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════
                    TAB 4: System & Events
                   ════════════════════════════════════════════════════════════ */}
        {activeTab === 'system' && (
          <div className="space-y-6">
            {/* System Health */}
            <Card
              header={
                <div className="flex items-center gap-2">
                  <Server className="h-5 w-5 text-[var(--text-muted)]" />
                  <h2 className="text-lg font-semibold text-[var(--text)]">System Health</h2>
                  <span className="ml-auto text-xs text-[var(--text-muted)]">
                    Auto-refreshes every 60s
                  </span>
                </div>
              }
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  { label: 'Total Jobs', value: stats?.totalJobs ?? 0, icon: Briefcase },
                  {
                    label: 'Total Applications',
                    value: stats?.totalApplications ?? 0,
                    icon: FileText,
                  },
                  {
                    label: 'Apps This Week',
                    value: stats?.applicationsThisWeek ?? 0,
                    icon: TrendingUp,
                  },
                  { label: 'Active Users (Week)', value: stats?.activeThisWeek ?? 0, icon: Users },
                  {
                    label: 'Health Status',
                    value:
                      (healthStatus as Record<string, unknown>)?.status === 'ok'
                        ? 'Healthy'
                        : 'Check',
                    icon: Activity,
                    isText: true,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center gap-3 rounded-lg bg-[var(--bg-secondary)] p-3"
                  >
                    <item.icon className="h-5 w-5 text-[var(--text-muted)]" />
                    <div>
                      <p className="text-lg font-bold text-[var(--text)]">
                        {'isText' in item
                          ? String(item.value)
                          : (item.value as number).toLocaleString()}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">{item.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Verification Stats */}
            {verificationStats && (verificationStats.byStatus || verificationStats.byType) && (
              <Card
                header={
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-[var(--warning)]" />
                    <h2 className="text-lg font-semibold text-[var(--text)]">
                      Verification Pipeline
                    </h2>
                  </div>
                }
              >
                {/* By Status */}
                {verificationStats.byStatus &&
                  Object.keys(verificationStats.byStatus).length > 0 && (
                    <div className="mb-4">
                      <p className="mb-2 text-xs font-medium tracking-wider text-[var(--text-muted)] uppercase">
                        By Status
                      </p>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {Object.entries(verificationStats.byStatus).map(([key, value]) => (
                          <div
                            key={`status-${key}`}
                            className="rounded-lg bg-[var(--bg-secondary)] p-4 text-center"
                          >
                            <p className="text-2xl font-bold text-[var(--text)]">
                              {formatNumber(value)}
                            </p>
                            <p className="mt-1 text-xs text-[var(--text-muted)] capitalize">
                              {key.replace(/_/g, ' ').toLowerCase()}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                {/* By Type */}
                {verificationStats.byType && Object.keys(verificationStats.byType).length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium tracking-wider text-[var(--text-muted)] uppercase">
                      By Type
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      {Object.entries(verificationStats.byType).map(([key, value]) => (
                        <div
                          key={`type-${key}`}
                          className="rounded-lg bg-[var(--bg-secondary)] p-4 text-center"
                        >
                          <p className="text-2xl font-bold text-[var(--text)]">
                            {formatNumber(value)}
                          </p>
                          <p className="mt-1 text-xs text-[var(--text-muted)] capitalize">
                            {key.replace(/_/g, ' ').toLowerCase()}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            )}

            {/* Live Counters */}
            {liveCounters && Object.keys(liveCounters).length > 0 && (
              <Card
                header={
                  <div className="flex items-center gap-2">
                    <Radio className="h-5 w-5 text-[var(--success)]" />
                    <h2 className="text-lg font-semibold text-[var(--text)]">
                      Firestore Live Counters
                    </h2>
                    <span className="relative ml-2 flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--success)] opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--success)]" />
                    </span>
                    <span className="ml-auto text-xs text-[var(--text-muted)]">
                      Auto-refreshes every 30s
                    </span>
                  </div>
                }
              >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {Object.entries(liveCounters).map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-center gap-3 rounded-lg bg-[var(--bg-secondary)] p-4"
                    >
                      <Activity className="h-5 w-5 text-[var(--text-muted)]" />
                      <div>
                        <p className="text-xl font-bold text-[var(--text)]">{value}</p>
                        <p className="text-xs text-[var(--text-muted)] capitalize">
                          {key.replace(/([A-Z])/g, ' $1').trim()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Recent Activity + Kafka Events */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Recent Activity */}
              <Card
                header={
                  <div className="flex items-center gap-2">
                    <Activity className="text-primary h-5 w-5" />
                    <h2 className="text-lg font-semibold text-[var(--text)]">Recent Activity</h2>
                  </div>
                }
              >
                <div className="space-y-3">
                  {activity?.users?.map((u) => (
                    <div key={`u-${u.id}`} className="flex items-center gap-3">
                      <div className="bg-primary-light flex h-8 w-8 items-center justify-center rounded-full">
                        <UserPlus className="text-primary h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--text)]">
                          {u.firstName || u.email}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          New {u.role.toLowerCase()} registered
                        </p>
                      </div>
                      <span className="text-xs text-[var(--text-muted)]">
                        {formatTimestamp(u.createdAt)}
                      </span>
                    </div>
                  ))}
                  {activity?.jobs?.map((j) => (
                    <div key={`j-${j.id}`} className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--warning-light)]">
                        <Briefcase className="h-4 w-4 text-[var(--warning)]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--text)]">{j.title}</p>
                        <p className="text-xs text-[var(--text-muted)]">
                          New job by {j.company?.companyName || 'Unknown'}
                        </p>
                      </div>
                      <span className="text-xs text-[var(--text-muted)]">
                        {formatTimestamp(j.createdAt)}
                      </span>
                    </div>
                  ))}
                  {activity?.applications?.map((a) => (
                    <div key={`a-${a.id}`} className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--info-light)]">
                        <FileText className="h-4 w-4 text-[var(--info)]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--text)]">
                          {a.job?.title || 'Job Application'}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {a.candidate?.user?.email || 'Candidate'}
                          <span
                            className={`ml-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${getStatusColor(a.status)}`}
                          >
                            {a.status}
                          </span>
                        </p>
                      </div>
                    </div>
                  ))}
                  {!activity && (
                    <div className="flex h-40 items-center justify-center text-sm text-[var(--text-muted)]">
                      Loading activity...
                    </div>
                  )}
                  {activity &&
                    !activity.users?.length &&
                    !activity.jobs?.length &&
                    !activity.applications?.length && (
                      <EmptyState
                        icon={Activity}
                        title="No recent activity"
                        description="Recent platform activity will appear here."
                      />
                    )}
                </div>
              </Card>

              {/* Kafka Events */}
              <Card
                header={
                  <div className="flex items-center gap-2">
                    <Server className="h-5 w-5 text-[var(--text-muted)]" />
                    <h2 className="text-lg font-semibold text-[var(--text)]">
                      Recent Kafka Events
                    </h2>
                    <span className="ml-auto text-xs text-[var(--text-muted)]">
                      Last 15 events &middot; Auto-refreshes every 15s
                    </span>
                  </div>
                }
              >
                {kafkaEvents.length > 0 ? (
                  <div className="space-y-2">
                    {kafkaEvents.map((event, i) => (
                      <div
                        key={`${event.timestamp}-${i}`}
                        className="flex items-center justify-between rounded-lg bg-[var(--bg-secondary)] px-3 py-2"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`rounded-md px-2 py-0.5 text-xs font-medium ${getEventColor(event.eventType)}`}
                          >
                            {event.eventType}
                          </span>
                          <span className="text-xs text-[var(--text-muted)]">{event.topic}</span>
                        </div>
                        <span className="text-xs text-[var(--text-muted)]">
                          {formatTimestamp(event.timestamp)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={Activity}
                    title="No recent events"
                    description="Kafka events will appear as platform activity occurs."
                  />
                )}
              </Card>
            </div>

            {/* Platform Health Overview */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Platform Stats Summary */}
              <Card
                header={
                  <div className="flex items-center gap-2">
                    <Shield className="text-primary h-5 w-5" />
                    <h2 className="text-lg font-semibold text-[var(--text)]">Platform Summary</h2>
                  </div>
                }
              >
                {statsLoading ? (
                  <Skeleton variant="rect" height={200} />
                ) : stats ? (
                  <div className="space-y-3">
                    {[
                      { label: 'Total Users', value: stats.totalUsers, color: 'text-primary' },
                      {
                        label: 'Admin Users',
                        value: stats.totalAdmins ?? 0,
                        color: 'text-[#8B5CF6]',
                      },
                      {
                        label: 'Total Jobs',
                        value: stats.totalJobs,
                        color: 'text-[var(--success)]',
                      },
                      {
                        label: 'Active Jobs',
                        value: stats.activeJobs,
                        color: 'text-[var(--warning)]',
                      },
                      {
                        label: 'Total Applications',
                        value: stats.totalApplications,
                        color: 'text-[var(--info)]',
                      },
                      {
                        label: 'New Users Today',
                        value: stats.newUsersToday,
                        color: 'text-primary',
                      },
                      {
                        label: 'New This Week',
                        value: stats.newUsersThisWeek,
                        color: 'text-[var(--success)]',
                      },
                      {
                        label: 'Pending Verifications',
                        value: stats.pendingVerifications,
                        color: 'text-[var(--warning)]',
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center justify-between rounded-lg bg-[var(--bg-secondary)] px-4 py-2.5"
                      >
                        <span className="text-sm text-[var(--text-secondary)]">{item.label}</span>
                        <span className={`font-semibold ${item.color}`}>
                          {formatNumber(item.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </Card>

              {/* User Composition (includes Admins) */}
              <Card
                header={
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-[var(--info)]" />
                    <h2 className="text-lg font-semibold text-[var(--text)]">User Composition</h2>
                  </div>
                }
              >
                {statsLoading ? (
                  <Skeleton variant="rect" height={280} />
                ) : userDistPieData.length > 0 ? (
                  <PieChart data={userDistPieData} height={280} innerRadius={55} />
                ) : (
                  <EmptyState
                    icon={Users}
                    title="No user data"
                    description="User composition will appear as users register."
                  />
                )}
              </Card>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
