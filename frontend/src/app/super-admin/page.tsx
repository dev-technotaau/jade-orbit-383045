'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Shield,
  Users,
  Briefcase,
  BarChart3,
  FileText,
  TrendingUp,
  Activity,
  Radio,
  Settings,
  MessageSquare,
  ToggleLeft,
  UserPlus,
  Server,
  Mail,
  ShieldCheck,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Clock,
  Zap,
  MapPin,
  Code,
  RefreshCw,
  Play,
  Database,
  Wifi,
  Search,
  Eye,
  RotateCcw,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import DatePicker from '@/components/ui/DatePicker';
import Pagination from '@/components/ui/Pagination';
import Skeleton from '@/components/ui/Skeleton';
import PieChart from '@/components/charts/PieChart';
import BarChart from '@/components/charts/BarChart';
import AreaChart from '@/components/charts/AreaChart';
import StatsChart from '@/components/charts/StatsChart';
import TeamsVendorsWidget from '@/components/super-admin/TeamsVendorsWidget';
import { adminService } from '@/services/admin.service';
import { QUERY_KEYS } from '@/constants/config';
import { ROUTES } from '@/constants/routes';
import { getGreeting, getDashboardSubtitle } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import Tooltip from '@/components/ui/Tooltip';
import api from '@/lib/api';
import { API } from '@/constants/api';
import type {
  RecentActivity,
  KafkaDlqMessage,
  TrendingData,
  OnlineStats,
  HealthReadyResponse,
  KafkaLagInfo,
} from '@/types/admin';

interface KafkaEvent {
  eventType: string;
  topic: string;
  key: string | null;
  timestamp: string;
}

const PIPELINE_STAGES = ['PENDING', 'REVIEWING', 'SHORTLISTED', 'INTERVIEW', 'OFFERED', 'HIRED'];
const PIPELINE_NAMES: Record<string, string> = {
  PENDING: 'Pending',
  REVIEWING: 'Reviewing',
  SHORTLISTED: 'Shortlisted',
  INTERVIEW: 'Interview',
  OFFERED: 'Offered',
  HIRED: 'Hired',
};

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

export default function SuperAdminDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ── DLQ & Replay State ──
  const [dlqPage, setDlqPage] = useState(1);
  const [dlqLimit, setDlqLimit] = useState(10);
  const [dlqFilter, setDlqFilter] = useState<'all' | 'pending' | 'replayed'>('all');
  const [replayStart, setReplayStart] = useState('');
  const [replayEnd, setReplayEnd] = useState('');
  const [replayEventTypes, setReplayEventTypes] = useState('');

  // ── Core Stats (comprehensive) ──
  const { data: statsData, isLoading } = useQuery({
    queryKey: ['super-admin', 'comprehensive-stats'],
    queryFn: () => adminService.getComprehensiveStats(),
  });

  // ── Application Stats ──
  const { data: appStatsData } = useQuery({
    queryKey: QUERY_KEYS.ADMIN.APPLICATION_STATS,
    queryFn: () => adminService.getApplicationStats(),
  });

  // ── Daily Active Users (30 days) ──
  const { data: dauData } = useQuery({
    queryKey: [...QUERY_KEYS.ADMIN.DAILY_ACTIVE_USERS, 30],
    queryFn: () => adminService.getDailyActiveUsers(30),
  });

  // ── Recent Activity ──
  const { data: activityData } = useQuery({
    queryKey: QUERY_KEYS.ADMIN.ACTIVITY,
    queryFn: () => adminService.getActivity(),
  });

  // ── Live Counters (Firestore) ──
  const { data: liveCountersData } = useQuery({
    queryKey: ['admin', 'live-counters'],
    queryFn: async () => {
      const res = await api.get(API.ADMIN.LIVE_COUNTERS);
      return res.data as { status: string; data: Record<string, number> };
    },
    refetchInterval: 30000,
  });

  // ── Recent Kafka Events ──
  const { data: kafkaEventsData } = useQuery({
    queryKey: ['admin', 'kafka-events'],
    queryFn: async () => {
      const res = await api.get(API.ADMIN.KAFKA_EVENTS, { params: { limit: 10 } });
      return res.data as { status: string; data: KafkaEvent[] };
    },
    refetchInterval: 15000,
  });

  // ── Analytics Trend (30 days) ──
  const { data: analyticsData } = useQuery({
    queryKey: ['super-admin', 'analytics-trend'],
    queryFn: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 30);
      return adminService.getAnalytics({
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
        groupBy: 'day',
      });
    },
  });

  // ── System Health ──
  const { data: healthData } = useQuery({
    queryKey: ['admin', 'system-health'],
    queryFn: () => adminService.getSystemHealth(),
    refetchInterval: 60000,
  });

  // ── Online Stats ──
  const { data: onlineStatsData } = useQuery({
    queryKey: ['admin', 'online-stats'],
    queryFn: () => adminService.getOnlineStats(),
    refetchInterval: 30000,
  });

  // ── Trending ──
  const { data: trendingData } = useQuery({
    queryKey: ['admin', 'trending'],
    queryFn: () => adminService.getTrending(),
    refetchInterval: 60000,
  });

  // ── Kafka DLQ ──
  const { data: dlqData, isLoading: dlqLoading } = useQuery({
    queryKey: ['admin', 'kafka-dlq', dlqPage, dlqFilter, dlqLimit],
    queryFn: () =>
      adminService.getDlqMessages(
        dlqPage,
        dlqLimit,
        dlqFilter === 'all' ? undefined : dlqFilter === 'replayed',
      ),
  });

  // ── Health Ready (Kafka Lag) ──
  const { data: healthReadyData } = useQuery({
    queryKey: ['admin', 'health-ready'],
    queryFn: () => adminService.getHealthReady(),
    refetchInterval: 60000,
  });

  // ── DLQ Replay Mutation ──
  const replayDlqMutation = useMutation({
    mutationFn: (id: string) => adminService.replayDlqMessage(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'kafka-dlq'] });
    },
  });

  // ── Event Replay Mutation ──
  const replayEventsMutation = useMutation({
    mutationFn: () =>
      adminService.replayEvents(
        replayStart,
        replayEnd,
        replayEventTypes ? replayEventTypes.split(',').map((s) => s.trim()) : undefined,
      ),
  });

  const stats = statsData?.data;
  const appStats = appStatsData?.data;
  const liveCounters = liveCountersData?.data;
  const kafkaEvents = kafkaEventsData?.data ?? [];
  const dauItems = dauData?.data ?? [];
  const trendData = analyticsData?.data ?? [];
  const activity = activityData?.data as RecentActivity | undefined;
  const healthStatus = healthData?.data ?? healthData;
  const onlineStats = onlineStatsData?.data as OnlineStats | undefined;
  const trending = trendingData?.data as TrendingData | undefined;
  const dlqMessages =
    (dlqData as unknown as { data?: { items?: KafkaDlqMessage[] } })?.data?.items ?? [];
  const dlqTotal = (dlqData as unknown as { data?: { total?: number } })?.data?.total ?? 0;
  const healthReady = healthReadyData as HealthReadyResponse | undefined;
  const kafkaLag = healthReady?.checks?.kafka as KafkaLagInfo | undefined;

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
      from: PIPELINE_NAMES[PIPELINE_STAGES[worstIdx - 1]],
      to: PIPELINE_NAMES[PIPELINE_STAGES[worstIdx]],
      rate: Math.round(worstRate * 100),
    };
  }, [appStats]);

  // ── Growth Velocity ──
  const growthVelocity = useMemo(() => {
    if (dauItems.length < 2) return null;
    const last7 = dauItems.slice(-7);
    const prev7 = dauItems.slice(-14, -7);
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
    return { wowGrowth, engagementRate, jobFillRate, avgDAU: Math.round(last7Avg) };
  }, [dauItems, stats]);

  // ── Application Day-of-Week Distribution ──
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
  }, [appStats]);

  // ── Compute period-over-period deltas ──
  const computeDelta = (
    items: typeof trendData,
    key: keyof (typeof trendData)[0],
  ): number | null => {
    if (items.length < 2) return null;
    const mid = Math.floor(items.length / 2);
    const first = items.slice(0, mid).reduce((s, d) => s + ((d[key] as number) || 0), 0);
    const second = items.slice(mid).reduce((s, d) => s + ((d[key] as number) || 0), 0);
    if (first === 0) return null;
    return Math.round(((second - first) / first) * 100);
  };

  const regDelta = computeDelta(trendData, 'registrations');
  const appDelta = computeDelta(trendData, 'applications');

  // ── Application status distribution ──
  const statusPieData = Object.entries(appStats?.byStatus ?? {}).map(([name, value]) => {
    const colors: Record<string, string> = {
      PENDING: '#F59E0B',
      REVIEWING: '#3B82F6',
      SHORTLISTED: '#8B5CF6',
      INTERVIEW: '#06B6D4',
      OFFERED: '#10B981',
      HIRED: '#059669',
      REJECTED: '#EF4444',
      WITHDRAWN: '#6B7280',
    };
    return { name, value, color: colors[name] || '#9CA3AF' };
  });

  // ── Verification pipeline ──
  const verificationTotal =
    (stats?.pendingVerifications ?? 0) +
    (stats?.verificationsApproved ?? 0) +
    (stats?.verificationsRejected ?? 0);

  // ── Stat Cards (10 cards with sparklines & deltas) ──
  const statCards = [
    {
      label: 'Total Users',
      value: stats?.totalUsers ?? 0,
      icon: Users,
      color: 'text-primary bg-primary-light',
      sparkData: dauItems.map((d) => ({ v: d.total })),
      sparkKey: 'v',
      sparkColor: '#1E5CAF',
      delta: regDelta,
    },
    {
      label: 'Total Candidates',
      value: stats?.totalCandidates ?? 0,
      icon: Users,
      color: 'text-accent bg-accent-light',
      sparkData: dauItems.map((d) => ({ v: d.candidates })),
      sparkKey: 'v',
      sparkColor: '#0EA5E9',
    },
    {
      label: 'Total Employers',
      value: stats?.totalEmployers ?? 0,
      icon: Briefcase,
      color: 'text-secondary bg-secondary-light',
      sparkData: dauItems.map((d) => ({ v: d.employers })),
      sparkKey: 'v',
      sparkColor: '#F5880A',
    },
    {
      label: 'Total Jobs',
      value: stats?.totalJobs ?? 0,
      icon: Server,
      color: 'text-[var(--text-muted)] bg-[var(--bg-tertiary)]',
      sparkData: appStats?.dailyTrend?.map((d) => ({ v: d.count })),
      sparkKey: 'v',
      sparkColor: '#6B7280',
    },
    {
      label: 'Active Jobs',
      value: stats?.activeJobs ?? 0,
      icon: Briefcase,
      color: 'text-[var(--success)] bg-[var(--success-light)]',
      sparkData: appStats?.dailyTrend?.map((d) => ({ v: d.count })),
      sparkKey: 'v',
      sparkColor: '#10B981',
    },
    {
      label: 'Total Applications',
      value: stats?.totalApplications ?? 0,
      icon: FileText,
      color: 'text-accent bg-accent-light',
      sparkData: appStats?.dailyTrend?.map((d) => ({ v: d.count })),
      sparkKey: 'v',
      sparkColor: '#0EA5E9',
      delta: appDelta,
    },
    {
      label: 'New Today',
      value: stats?.newUsersToday ?? 0,
      icon: UserPlus,
      color: 'text-primary bg-primary-light',
      sparkData: stats?.registrationTrends?.map((d) => ({ v: d.count })),
      sparkKey: 'v',
      sparkColor: '#1E5CAF',
    },
    {
      label: 'New This Week',
      value: stats?.newUsersThisWeek ?? 0,
      icon: TrendingUp,
      color: 'text-[var(--success)] bg-[var(--success-light)]',
      sparkData: stats?.registrationTrends?.slice(-7).map((d) => ({ v: d.count })),
      sparkKey: 'v',
      sparkColor: '#10B981',
    },
    {
      label: 'New This Month',
      value: stats?.newUsersThisMonth ?? 0,
      icon: TrendingUp,
      color: 'text-secondary bg-secondary-light',
      sparkData: stats?.registrationTrends?.map((d) => ({ v: d.count })),
      sparkKey: 'v',
      sparkColor: '#F5880A',
    },
    {
      label: 'Pending Verifications',
      value: stats?.pendingVerifications ?? 0,
      icon: ShieldCheck,
      color: 'text-[var(--error)] bg-[var(--error-light)]',
    },
  ];

  // ── KPI Insight Cards ──
  const kpiCards = [
    {
      label: 'Active This Week',
      value: stats?.activeThisWeek ?? 0,
      icon: Activity,
      desc: 'Users active in last 7 days',
      color: 'text-primary',
      sparkData: dauItems.slice(-7).map((d) => ({ v: d.total })),
      sparkColor: '#1E5CAF',
    },
    {
      label: 'Expired Jobs',
      value: stats?.expiredJobs ?? 0,
      icon: Clock,
      desc: 'Jobs past their deadline',
      color: 'text-secondary',
    },
    {
      label: 'Admin Users',
      value: stats?.totalAdmins ?? 0,
      icon: Shield,
      desc: 'Admin & super-admin accounts',
      color: 'text-accent',
    },
    {
      label: 'Apps/Job Ratio',
      value: stats?.applicationConversionRate ?? 0,
      icon: Zap,
      desc: 'Applications per job posted',
      color: 'text-[var(--success)]',
    },
  ];

  // ── Quick Actions ──
  const quickActions = [
    {
      label: 'Manage Admins',
      desc: 'Create or remove admin accounts',
      icon: Shield,
      href: ROUTES.SUPER_ADMIN.ADMINS,
      color: 'text-primary bg-primary-light',
    },
    {
      label: 'System Config',
      desc: 'Manage system-wide settings',
      icon: Settings,
      href: ROUTES.SUPER_ADMIN.CONFIG,
      color: 'text-secondary bg-secondary-light',
    },
    {
      label: 'User Management',
      desc: 'Full user control — create, edit, suspend',
      icon: Users,
      href: ROUTES.SUPER_ADMIN.USERS,
      color: 'text-[var(--success)] bg-[var(--success-light)]',
    },
    {
      label: 'Platform Analytics',
      desc: 'Deep analytics with BigQuery insights',
      icon: BarChart3,
      href: ROUTES.SUPER_ADMIN.ANALYTICS,
      color: 'text-accent bg-accent-light',
    },
    {
      label: 'Feature Flags',
      desc: 'Firebase Remote Config flags',
      icon: ToggleLeft,
      href: ROUTES.SUPER_ADMIN.FEATURE_FLAGS,
      color: 'text-[var(--text-muted)] bg-[var(--bg-tertiary)]',
    },
    {
      label: 'Ticket Analytics',
      desc: 'Support ticket stats and insights',
      icon: MessageSquare,
      href: ROUTES.SUPER_ADMIN.TICKETS,
      color: 'text-primary bg-primary-light',
    },
    {
      label: 'Audit Logs',
      desc: 'Track all system activity',
      icon: Activity,
      href: ROUTES.ADMIN.AUDIT_LOGS,
      color: 'text-accent bg-accent-light',
    },
    {
      label: 'Security Settings',
      desc: 'MFA and security management',
      icon: Shield,
      href: ROUTES.SUPER_ADMIN.SETTINGS,
      color: 'text-[var(--error)] bg-[var(--error-light)]',
    },
    {
      label: 'Email Templates',
      desc: 'Preview and test email templates',
      icon: Mail,
      href: '/admin/email-templates',
      color: 'text-secondary bg-secondary-light',
    },
    {
      label: 'View Reports',
      desc: 'Export users, jobs, analytics reports',
      icon: FileText,
      href: ROUTES.ADMIN.REPORTS,
      color: 'text-[var(--success)] bg-[var(--success-light)]',
    },
    {
      label: 'Queue Monitor',
      desc: 'BullMQ job queues dashboard',
      icon: Server,
      href: `${process.env.NEXT_PUBLIC_API_URL}/admin/queues`,
      color: 'text-[var(--text-muted)] bg-[var(--bg-tertiary)]',
    },
  ];

  if (isLoading) {
    return (
      <DashboardLayout requiredRole={['SUPER_ADMIN']}>
        <div className="space-y-6">
          <Skeleton variant="rect" height={60} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} variant="rect" height={100} />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton variant="rect" height={300} />
            <Skeleton variant="rect" height={300} />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout requiredRole={['SUPER_ADMIN']}>
      <div className="space-y-6">
        {/* ── Header with alerts ── */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">
              {getGreeting(user?.firstName)}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {getDashboardSubtitle(user?.role)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onlineStats && (
              <div className="flex items-center gap-1.5 rounded-lg bg-[var(--success-light)] px-3 py-1.5">
                <Wifi className="h-4 w-4 text-[var(--success)]" />
                <span className="text-sm font-medium text-[var(--success)]">
                  {onlineStats.onlineUsers} online
                </span>
              </div>
            )}
            {(stats?.pendingVerifications ?? 0) > 0 && (
              <Tooltip content="View pending verifications">
                <Link
                  href={ROUTES.ADMIN.VERIFICATIONS}
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-[var(--warning-light)] px-3 py-1.5 text-sm font-medium text-[var(--warning)] transition-colors hover:bg-[var(--warning)]/20"
                >
                  <AlertTriangle className="h-4 w-4" />
                  {stats!.pendingVerifications} pending
                </Link>
              </Tooltip>
            )}
            {regDelta !== null && (
              <div className="flex items-center gap-1 rounded-lg bg-[var(--bg-secondary)] px-3 py-1.5">
                {regDelta >= 0 ? (
                  <ArrowUpRight className="h-4 w-4 text-[var(--success)]" />
                ) : (
                  <ArrowDownRight className="h-4 w-4 text-[var(--error)]" />
                )}
                <span
                  className={`text-sm font-medium ${regDelta >= 0 ? 'text-[var(--success)]' : 'text-[var(--error)]'}`}
                >
                  {regDelta > 0 ? '+' : ''}
                  {regDelta}%
                </span>
                <span className="text-xs text-[var(--text-muted)]">registrations</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Stat Cards (10, 5-column with sparklines & deltas) ── */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {statCards.map((card) => (
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
                      {(card.value ?? 0).toLocaleString()}
                    </p>
                    {'delta' in card && card.delta !== null && card.delta !== undefined && (
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
                    dataKey={card.sparkKey!}
                    color={card.sparkColor}
                    height={40}
                  />
                </div>
              )}
            </Card>
          ))}
        </div>

        {/* ── Teams & Vendors widget ── */}
        <TeamsVendorsWidget />

        {/* ── KPI Insight Cards ── */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpiCards.map((kpi) => (
            <Card key={kpi.label} padding="sm">
              <div className="flex items-center gap-3">
                <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                <div>
                  <p className="text-lg font-bold text-[var(--text)]">
                    {(kpi.value ?? 0).toLocaleString()}
                  </p>
                  <p className="text-sm font-medium text-[var(--text)]">{kpi.label}</p>
                  <p className="text-xs text-[var(--text-muted)]">{kpi.desc}</p>
                </div>
              </div>
              {'sparkData' in kpi &&
                kpi.sparkData &&
                (kpi.sparkData as { v: number }[]).length > 1 && (
                  <div className="mt-2">
                    <StatsChart
                      data={kpi.sparkData as { v: number }[]}
                      dataKey="v"
                      color={kpi.sparkColor}
                      height={36}
                    />
                  </div>
                )}
            </Card>
          ))}
        </div>

        {/* ── Pipeline Bottleneck Alert ── */}
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
                  <strong>{bottleneck.to}</strong> at <strong>{bottleneck.rate}%</strong> conversion
                  rate
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* ── Growth Velocity & Platform Health ── */}
        {growthVelocity && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card padding="sm">
              <div className="flex items-center gap-3">
                <div className="bg-primary-light flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                  <TrendingUp className="text-primary h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xl font-bold text-[var(--text)]">
                      {growthVelocity.wowGrowth > 0 ? '+' : ''}
                      {growthVelocity.wowGrowth}%
                    </p>
                    {growthVelocity.wowGrowth >= 0 ? (
                      <ArrowUpRight className="h-4 w-4 text-[var(--success)]" />
                    ) : (
                      <ArrowDownRight className="h-4 w-4 text-[var(--error)]" />
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">Week-over-Week Growth</p>
                </div>
              </div>
            </Card>
            <Card padding="sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--success-light)]">
                  <Activity className="h-5 w-5 text-[var(--success)]" />
                </div>
                <div>
                  <p className="text-xl font-bold text-[var(--text)]">
                    {growthVelocity.engagementRate}%
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">User Engagement Rate</p>
                  <div className="mt-1 h-1.5 w-24 rounded-full bg-[var(--bg-tertiary)]">
                    <div
                      className="h-1.5 rounded-full bg-[var(--success)] transition-all"
                      style={{ width: `${Math.min(growthVelocity.engagementRate, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </Card>
            <Card padding="sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--info-light)]">
                  <Briefcase className="h-5 w-5 text-[var(--info)]" />
                </div>
                <div>
                  <p className="text-xl font-bold text-[var(--text)]">
                    {growthVelocity.jobFillRate}%
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">Active Jobs Rate</p>
                  <div className="mt-1 h-1.5 w-24 rounded-full bg-[var(--bg-tertiary)]">
                    <div
                      className="h-1.5 rounded-full bg-[var(--info)] transition-all"
                      style={{ width: `${Math.min(growthVelocity.jobFillRate, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </Card>
            <Card padding="sm">
              <div className="flex items-center gap-3">
                <div className="bg-secondary-light flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                  <BarChart3 className="text-secondary h-5 w-5" />
                </div>
                <div>
                  <p className="text-xl font-bold text-[var(--text)]">
                    {growthVelocity.avgDAU.toLocaleString()}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">Avg Daily Active Users (7d)</p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ── Application Day-of-Week Pattern ── */}
        {dayOfWeekData.length > 0 && (
          <Card
            header={
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-[var(--text-muted)]" />
                <h2 className="text-lg font-semibold text-[var(--text)]">
                  Applications by Day of Week
                </h2>
                <span className="ml-auto text-xs text-[var(--text-muted)]">Avg per day</span>
              </div>
            }
          >
            <BarChart
              data={dayOfWeekData}
              xKey="day"
              bars={[{ key: 'avg', color: '#8B5CF6', name: 'Avg Applications' }]}
              height={200}
            />
          </Card>
        )}

        {/* ── Live Counters (Firestore) ── */}
        {liveCounters && Object.keys(liveCounters).length > 0 && (
          <Card
            header={
              <div className="flex items-center gap-2">
                <Radio className="h-5 w-5 text-[var(--success)]" />
                <h2 className="text-lg font-semibold text-[var(--text)]">Live Counters</h2>
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
                { key: 'activeUsers', label: 'Active Users', icon: Users, highlight: true },
                { key: 'newUsersToday', label: 'New Users Today', icon: UserPlus },
                { key: 'jobsPostedToday', label: 'Jobs Posted Today', icon: Briefcase },
                { key: 'applicationsToday', label: 'Applications Today', icon: FileText },
              ].map(({ key, label, icon: Icon, highlight }) => (
                <div
                  key={key}
                  className={`flex items-center gap-3 rounded-lg p-3 ${highlight ? 'bg-primary-light' : 'bg-[var(--bg-secondary)]'}`}
                >
                  <Icon
                    className={`h-5 w-5 ${highlight ? 'text-primary' : 'text-[var(--text-muted)]'}`}
                  />
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

        {/* ── Trending Jobs & Searches ── */}
        {trending &&
          (trending.trendingJobs?.length > 0 || trending.trendingSearches?.length > 0) && (
            <div className="grid gap-6 lg:grid-cols-2">
              {trending.trendingJobs?.length > 0 && (
                <Card
                  header={
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-[var(--warning)]" />
                      <h2 className="text-lg font-semibold text-[var(--text)]">Trending Jobs</h2>
                      <span className="ml-auto text-xs text-[var(--text-muted)]">Last 24h</span>
                    </div>
                  }
                >
                  <div className="space-y-2">
                    {trending.trendingJobs.slice(0, 8).map((job, i) => (
                      <div
                        key={job.id}
                        className="flex items-center justify-between rounded-lg bg-[var(--bg-secondary)] px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="text-xs font-bold text-[var(--text-muted)]">
                            #{i + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-[var(--text)]">
                              {job.title}
                            </p>
                            <p className="text-xs text-[var(--text-muted)]">
                              {job.company.companyName} · {job.location}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                          <Eye className="h-3.5 w-3.5" />
                          {job.viewCount}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
              {trending.trendingSearches?.length > 0 && (
                <Card
                  header={
                    <div className="flex items-center gap-2">
                      <Search className="h-5 w-5 text-[var(--info)]" />
                      <h2 className="text-lg font-semibold text-[var(--text)]">
                        Trending Searches
                      </h2>
                      <span className="ml-auto text-xs text-[var(--text-muted)]">Last 24h</span>
                    </div>
                  }
                >
                  <div className="space-y-2">
                    {trending.trendingSearches.slice(0, 10).map((s, i) => (
                      <div
                        key={s.query}
                        className="flex items-center justify-between rounded-lg bg-[var(--bg-secondary)] px-3 py-2"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-[var(--text-muted)]">
                            #{i + 1}
                          </span>
                          <span className="text-sm font-medium text-[var(--text)]">{s.query}</span>
                        </div>
                        <span className="text-xs text-[var(--text-muted)]">
                          {Math.round(s.score)} searches
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}

        {/* ── Charts Row: Platform Trend + Application Volume ── */}
        {stats && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card
              header={
                <h2 className="text-lg font-semibold text-[var(--text)]">
                  Platform Trends (30 Days)
                </h2>
              }
            >
              {trendData.length > 0 ? (
                <AreaChart
                  data={trendData.map((d) => ({
                    period: d.period,
                    Registrations: d.registrations,
                    Applications: d.applications,
                  }))}
                  xKey="period"
                  yKey="Registrations"
                  yKey2="Applications"
                  color="#1E5CAF"
                  color2="#10B981"
                  height={280}
                />
              ) : (
                <div className="flex h-[280px] items-center justify-center text-sm text-[var(--text-muted)]">
                  No trend data available
                </div>
              )}
            </Card>

            <Card
              header={
                <h2 className="text-lg font-semibold text-[var(--text)]">
                  Daily Application Volume
                </h2>
              }
            >
              {appStats?.dailyTrend && appStats.dailyTrend.length > 0 ? (
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
                <div className="flex h-[280px] items-center justify-center text-sm text-[var(--text-muted)]">
                  No application data available
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ── Charts Row: User Distribution + Application Status ── */}
        {stats && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card
              header={
                <h2 className="text-lg font-semibold text-[var(--text)]">User Distribution</h2>
              }
            >
              <PieChart
                data={[
                  { name: 'Candidates', value: stats.totalCandidates, color: '#1E5CAF' },
                  { name: 'Employers', value: stats.totalEmployers, color: '#F59E0B' },
                ]}
                height={280}
                innerRadius={50}
              />
            </Card>

            <Card
              header={
                <h2 className="text-lg font-semibold text-[var(--text)]">
                  Application Status Distribution
                </h2>
              }
            >
              {statusPieData.length > 0 ? (
                <PieChart data={statusPieData} height={280} innerRadius={50} />
              ) : (
                <div className="flex h-[280px] items-center justify-center text-sm text-[var(--text-muted)]">
                  No application status data
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ── Top Skills + Top Locations ── */}
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

        {/* ── Registration Trends + Verification Pipeline ── */}
        {stats && (
          <div className="grid gap-6 lg:grid-cols-2">
            {stats.registrationTrends && stats.registrationTrends.length > 0 && (
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
              {verificationTotal > 0 ? (
                <div className="space-y-4 py-2">
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
              ) : (
                <div className="flex h-[280px] items-center justify-center text-sm text-[var(--text-muted)]">
                  No verifications submitted yet
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ── Platform Overview Bar + DAU ── */}
        {stats && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card
              header={
                <h2 className="text-lg font-semibold text-[var(--text)]">Platform Overview</h2>
              }
            >
              <BarChart
                data={[
                  { metric: 'Users', count: stats.totalUsers },
                  { metric: 'Candidates', count: stats.totalCandidates },
                  { metric: 'Employers', count: stats.totalEmployers },
                  { metric: 'Active Jobs', count: stats.activeJobs },
                  { metric: 'Applications', count: stats.totalApplications },
                ]}
                xKey="metric"
                bars={[{ key: 'count', color: '#1E5CAF', name: 'Count' }]}
                height={280}
              />
            </Card>

            <Card
              header={
                <h2 className="text-lg font-semibold text-[var(--text)]">
                  Daily Active Users (30 Days)
                </h2>
              }
            >
              {dauItems.length > 0 ? (
                <AreaChart
                  data={dauItems.map((d) => ({
                    date: new Date(d.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    }),
                    Total: d.total,
                    Candidates: d.candidates,
                  }))}
                  xKey="date"
                  yKey="Total"
                  yKey2="Candidates"
                  color="#1E5CAF"
                  color2="#10B981"
                  height={280}
                />
              ) : (
                <div className="flex h-[280px] items-center justify-center text-sm text-[var(--text-muted)]">
                  No DAU data available
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ── Recent Activity + Kafka Events ── */}
        <div className="grid gap-6 lg:grid-cols-2">
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
            </div>
          </Card>

          <Card
            header={
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5 text-[var(--text-muted)]" />
                <h2 className="text-lg font-semibold text-[var(--text)]">System Events</h2>
                <span className="ml-auto text-xs text-[var(--text-muted)]">
                  Last 10 Kafka events
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
              <div className="flex h-40 items-center justify-center text-sm text-[var(--text-muted)]">
                No recent events
              </div>
            )}
          </Card>
        </div>

        {/* ── System Health (Enhanced with Kafka Lag) ── */}
        <Card
          header={
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-[var(--text-muted)]" />
              <h2 className="text-lg font-semibold text-[var(--text)]">System Health</h2>
            </div>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { label: 'Total Jobs', value: stats?.totalJobs ?? 0, icon: Server },
              { label: 'Total Applications', value: stats?.totalApplications ?? 0, icon: FileText },
              {
                label: 'Apps This Week',
                value: stats?.applicationsThisWeek ?? 0,
                icon: TrendingUp,
              },
              { label: 'Active Users (Week)', value: stats?.activeThisWeek ?? 0, icon: Users },
              {
                label: 'Health Status',
                value:
                  (healthStatus as Record<string, unknown>)?.status === 'ok' ? 'Healthy' : 'Check',
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

          {/* Kafka Lag Details */}
          {kafkaLag && (
            <div className="mt-4 border-t border-[var(--border)] pt-4">
              <div className="mb-3 flex items-center gap-2">
                <Database className="h-4 w-4 text-[var(--text-muted)]" />
                <h3 className="text-sm font-semibold text-[var(--text)]">Kafka Consumer Lag</h3>
                <span
                  className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
                    kafkaLag.healthy
                      ? 'bg-[var(--success-light)] text-[var(--success)]'
                      : 'bg-[var(--error-light)] text-[var(--error)]'
                  }`}
                >
                  {kafkaLag.healthy ? 'Healthy' : 'Unhealthy'}
                </span>
                {!kafkaLag.connected && (
                  <span className="rounded-full bg-[var(--error-light)] px-2 py-0.5 text-xs font-medium text-[var(--error)]">
                    Disconnected
                  </span>
                )}
              </div>
              {kafkaLag.lag && Object.keys(kafkaLag.lag).length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {Object.entries(kafkaLag.lag).map(([topic, lag]) => (
                    <div
                      key={topic}
                      className="flex items-center justify-between rounded-lg bg-[var(--bg-secondary)] px-3 py-2"
                    >
                      <span className="truncate text-xs text-[var(--text-muted)]">{topic}</span>
                      <span
                        className={`ml-2 text-sm font-bold ${
                          lag > 100
                            ? 'text-[var(--error)]'
                            : lag > 10
                              ? 'text-[var(--warning)]'
                              : 'text-[var(--success)]'
                        }`}
                      >
                        {lag}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between rounded-lg bg-[var(--bg-tertiary)] px-3 py-2">
                    <span className="text-xs font-medium text-[var(--text)]">Total Lag</span>
                    <span
                      className={`text-sm font-bold ${
                        kafkaLag.totalLag > 500
                          ? 'text-[var(--error)]'
                          : kafkaLag.totalLag > 50
                            ? 'text-[var(--warning)]'
                            : 'text-[var(--success)]'
                      }`}
                    >
                      {kafkaLag.totalLag}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">
                  {kafkaLag.connected ? 'No lag data available' : 'Kafka not connected'}
                </p>
              )}
            </div>
          )}
        </Card>

        {/* ── Kafka DLQ Viewer ── */}
        <Card
          header={
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[var(--error)]" />
              <h2 className="text-lg font-semibold text-[var(--text)]">Dead Letter Queue</h2>
              {dlqTotal > 0 && (
                <span className="ml-2 rounded-full bg-[var(--error-light)] px-2 py-0.5 text-xs font-medium text-[var(--error)]">
                  {dlqTotal} messages
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                {(['all', 'pending', 'replayed'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => {
                      setDlqFilter(f);
                      setDlqPage(1);
                    }}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                      dlqFilter === f
                        ? 'bg-primary text-white'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]'
                    }`}
                  >
                    {f === 'all' ? 'All' : f === 'pending' ? 'Pending' : 'Replayed'}
                  </button>
                ))}
              </div>
            </div>
          }
        >
          {dlqLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} variant="rect" height={48} />
              ))}
            </div>
          ) : dlqMessages.length > 0 ? (
            <div className="space-y-2">
              {dlqMessages.map((msg) => (
                <div
                  key={msg.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="rounded-md bg-[var(--error-light)] px-2 py-0.5 text-xs font-medium text-[var(--error)]">
                        {msg.originalTopic}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">
                        P{msg.partition}:O{msg.offset}
                      </span>
                      {msg.replayed ? (
                        <span className="flex items-center gap-1 text-xs text-[var(--success)]">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Replayed
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-[var(--warning)]">
                          <XCircle className="h-3.5 w-3.5" />
                          Pending
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--text-muted)]">
                        {formatTimestamp(msg.timestamp)}
                      </span>
                      {!msg.replayed && (
                        <button
                          onClick={() => replayDlqMutation.mutate(msg.id)}
                          disabled={replayDlqMutation.isPending}
                          className="bg-primary hover:bg-primary/90 flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-white transition-colors disabled:opacity-50"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Replay
                        </button>
                      )}
                    </div>
                  </div>
                  {msg.error && (
                    <p className="mt-2 truncate text-xs text-[var(--error)]">{msg.error}</p>
                  )}
                </div>
              ))}
              {/* DLQ Pagination */}
              <div className="pt-2">
                <Pagination
                  currentPage={dlqPage}
                  totalPages={Math.max(1, Math.ceil(dlqTotal / dlqLimit))}
                  onPageChange={setDlqPage}
                  totalItems={dlqTotal}
                  pageSize={dlqLimit}
                  onPageSizeChange={(s) => {
                    setDlqLimit(s);
                    setDlqPage(1);
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="flex h-32 items-center justify-center text-sm text-[var(--text-muted)]">
              No dead letter messages
            </div>
          )}
        </Card>

        {/* ── Event Replay ── */}
        <Card
          header={
            <div className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-[var(--info)]" />
              <h2 className="text-lg font-semibold text-[var(--text)]">Event Replay</h2>
              <span className="ml-auto text-xs text-[var(--text-muted)]">
                Re-publish stored Kafka events by time range
              </span>
            </div>
          }
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
                Start Time
              </label>
              <DatePicker mode="datetime" value={replayStart} onChange={setReplayStart} />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
                End Time
              </label>
              <DatePicker mode="datetime" value={replayEnd} onChange={setReplayEnd} />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
                Event Types (comma-separated, optional)
              </label>
              <input
                type="text"
                value={replayEventTypes}
                onChange={(e) => setReplayEventTypes(e.target.value)}
                placeholder="e.g. JOB_CREATED, USER_REGISTERED"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
              />
            </div>
            <button
              onClick={() => replayEventsMutation.mutate()}
              disabled={!replayStart || !replayEnd || replayEventsMutation.isPending}
              className="flex items-center gap-2 rounded-lg bg-[var(--info)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--info)]/90 disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              {replayEventsMutation.isPending ? 'Replaying...' : 'Replay Events'}
            </button>
          </div>
          {replayEventsMutation.isSuccess && (
            <div className="mt-3 rounded-lg bg-[var(--success-light)] p-3 text-sm text-[var(--success)]">
              Successfully replayed{' '}
              {(replayEventsMutation.data as { data?: { replayed?: number } })?.data?.replayed ?? 0}{' '}
              events
            </div>
          )}
          {replayEventsMutation.isError && (
            <div className="mt-3 rounded-lg bg-[var(--error-light)] p-3 text-sm text-[var(--error)]">
              Replay failed. Please check the time range and try again.
            </div>
          )}
        </Card>

        {/* ── Quick Actions ── */}
        <div>
          <h2 className="mb-4 text-lg font-semibold text-[var(--text)]">Quick Actions</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {quickActions.map((action) => (
              <Tooltip key={action.label} content={action.desc}>
                <Link href={action.href}>
                  <Card className="group hover:border-primary/30 h-full cursor-pointer transition-all hover:shadow-md">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${action.color}`}
                      >
                        <action.icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="group-hover:text-primary font-medium text-[var(--text)] transition-colors">
                          {action.label}
                        </p>
                        <p className="truncate text-xs text-[var(--text-muted)]">{action.desc}</p>
                      </div>
                    </div>
                  </Card>
                </Link>
              </Tooltip>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
