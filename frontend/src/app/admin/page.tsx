'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Users,
  Briefcase,
  BarChart3,
  Shield,
  ShieldCheck,
  FileText,
  TrendingUp,
  Activity,
  Radio,
  Mail,
  MessageSquare,
  UserPlus,
  Server,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Clock,
  ClipboardList,
  FileBarChart,
  MapPin,
  Zap,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { usePermissions } from '@/hooks/use-permissions';
import { PERM } from '@/constants/permissions';
import Card from '@/components/ui/Card';
import Skeleton from '@/components/ui/Skeleton';
import PieChart from '@/components/charts/PieChart';
import BarChart from '@/components/charts/BarChart';
import AreaChart from '@/components/charts/AreaChart';
import StatsChart from '@/components/charts/StatsChart';
import { adminService } from '@/services/admin.service';
import { QUERY_KEYS } from '@/constants/config';
import { ROUTES } from '@/constants/routes';
import { getGreeting, getDashboardSubtitle } from '@/lib/utils';
import Tooltip from '@/components/ui/Tooltip';
import { useAuth } from '@/hooks/use-auth';
import api from '@/lib/api';
import { API } from '@/constants/api';
import type { RecentActivity } from '@/types/admin';

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

export default function AdminDashboard() {
  const { user } = useAuth();
  const { can, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();

  /**
   * Every panel below asks for its own permission before fetching.
   *
   * The dashboard is the one page every admin lands on, and each of these
   * endpoints carries its own gate on the server. Firing them unconditionally
   * meant a narrowly-scoped admin generated six 403s on every visit — two of
   * them on a `refetchInterval`, so the noise repeated every 15-30 seconds
   * forever. The panels themselves already hide behind the same `can()`
   * checks; this just stops the requests that back them.
   */
  const canOverview = can(PERM.ANALYTICS_OVERVIEW);

  // ── Core Stats (comprehensive) ──
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.ADMIN.COMPREHENSIVE_STATS,
    queryFn: () => adminService.getComprehensiveStats(),
    enabled: canOverview,
  });

  // ── Application Stats ──
  const { data: appStatsData } = useQuery({
    queryKey: QUERY_KEYS.ADMIN.APPLICATION_STATS,
    queryFn: () => adminService.getApplicationStats(),
    enabled: can(PERM.JOBS_APPLICATIONS_STATS),
  });

  // ── Daily Active Users (14 days for sparklines) ──
  const { data: dauData } = useQuery({
    queryKey: [...QUERY_KEYS.ADMIN.DAILY_ACTIVE_USERS, 14],
    queryFn: () => adminService.getDailyActiveUsers(14),
    enabled: can(PERM.ANALYTICS_USERS),
  });

  // ── Recent Activity (UNUSED API - now used!) ──
  const { data: activityData } = useQuery({
    queryKey: QUERY_KEYS.ADMIN.ACTIVITY,
    queryFn: () => adminService.getActivity(),
    enabled: canOverview,
  });

  // ── Live Counters (Firestore) ──
  const { data: liveCountersData } = useQuery({
    queryKey: ['admin', 'live-counters'],
    queryFn: async () => {
      const res = await api.get(API.ADMIN.LIVE_COUNTERS);
      return res.data as { status: string; data: Record<string, number> };
    },
    enabled: can(PERM.ANALYTICS_LIVE),
    refetchInterval: 30000,
  });

  // ── Recent Kafka Events ──
  // `platform.kafka` is superAdminOnly in the registry — never grantable, so
  // this is a role check rather than a `can()`.
  const { data: kafkaEventsData } = useQuery({
    queryKey: ['admin', 'kafka-events'],
    queryFn: async () => {
      const res = await api.get(API.ADMIN.KAFKA_EVENTS, { params: { limit: 10 } });
      return res.data as { status: string; data: KafkaEvent[] };
    },
    enabled: isSuperAdmin,
    refetchInterval: 15000,
  });

  // ── System Health ──
  const { data: healthData } = useQuery({
    queryKey: ['admin', 'system-health'],
    queryFn: () => adminService.getSystemHealth(),
    refetchInterval: 60000,
  });

  const stats = data?.data;
  const appStats = appStatsData?.data;
  const liveCounters = liveCountersData?.data;
  const kafkaEvents = kafkaEventsData?.data ?? [];
  const dauItems = dauData?.data ?? [];
  const activity = activityData?.data as RecentActivity | undefined;
  const healthStatus = healthData?.data ?? healthData;

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

  // ── Stat Cards (10 cards with sparklines & deltas) ──
  const statCards = [
    {
      label: 'Total Users',
      value: stats?.totalUsers ?? 0,
      icon: Users,
      color: 'text-primary bg-primary-light',
      sparkData: dauItems.map((d) => ({ v: d.total })),
      sparkColor: '#1E5CAF',
    },
    {
      label: 'Total Candidates',
      value: stats?.totalCandidates ?? 0,
      icon: Users,
      color: 'text-accent bg-accent-light',
      sparkData: dauItems.map((d) => ({ v: d.candidates })),
      sparkColor: '#0EA5E9',
    },
    {
      label: 'Total Employers',
      value: stats?.totalEmployers ?? 0,
      icon: Briefcase,
      color: 'text-secondary bg-secondary-light',
      sparkData: dauItems.map((d) => ({ v: d.employers })),
      sparkColor: '#F5880A',
    },
    {
      label: 'Active Jobs',
      value: stats?.activeJobs ?? 0,
      icon: Briefcase,
      color: 'text-[var(--success)] bg-[var(--success-light)]',
      sparkData: appStats?.dailyTrend?.map((d) => ({ v: d.count })),
      sparkColor: '#10B981',
    },
    {
      label: 'Total Applications',
      value: stats?.totalApplications ?? 0,
      icon: FileText,
      color: 'text-accent bg-accent-light',
      sparkData: appStats?.dailyTrend?.map((d) => ({ v: d.count })),
      sparkColor: '#0EA5E9',
    },
    {
      label: 'New Today',
      value: stats?.newUsersToday ?? 0,
      icon: UserPlus,
      color: 'text-primary bg-primary-light',
      sparkData: stats?.registrationTrends?.map((d) => ({ v: d.count })),
      sparkColor: '#1E5CAF',
      delta: stats?.newUsersThisWeek
        ? Math.round(((stats.newUsersToday ?? 0) / (stats.newUsersThisWeek / 7)) * 100 - 100)
        : null,
    },
    {
      label: 'New This Week',
      value: stats?.newUsersThisWeek ?? 0,
      icon: TrendingUp,
      color: 'text-[var(--success)] bg-[var(--success-light)]',
      sparkData: stats?.registrationTrends?.slice(-7).map((d) => ({ v: d.count })),
      sparkColor: '#10B981',
    },
    {
      label: 'New This Month',
      value: stats?.newUsersThisMonth ?? 0,
      icon: TrendingUp,
      color: 'text-secondary bg-secondary-light',
      sparkData: stats?.registrationTrends?.map((d) => ({ v: d.count })),
      sparkColor: '#F5880A',
    },
    {
      label: 'Pending Verifications',
      value: stats?.pendingVerifications ?? 0,
      icon: ShieldCheck,
      color: 'text-[var(--error)] bg-[var(--error-light)]',
    },
    {
      label: 'Apps/Job Ratio',
      value: stats?.applicationConversionRate ?? 0,
      icon: Zap,
      color: 'text-[var(--text-muted)] bg-[var(--bg-tertiary)]',
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
      color: 'text-[var(--warning)]',
    },
    {
      label: 'New Jobs This Week',
      value: stats?.newJobsThisWeek ?? 0,
      icon: Briefcase,
      desc: 'Jobs posted in last 7 days',
      color: 'text-[var(--success)]',
    },
    {
      label: 'Verifications Approved',
      value: stats?.verificationsApproved ?? 0,
      icon: ShieldCheck,
      desc: 'Total approved verifications',
      color: 'text-[var(--info)]',
    },
  ];

  // ── Quick Actions ──
  const allQuickLinks: {
    label: string;
    description: string;
    icon: typeof FileBarChart;
    href: string;
    color: string;
    /**
     * Permission the destination page requires. The card is hidden unless
     * the admin holds it, so a Quick Action never leads to a wall.
     */
    permission: string;
  }[] = [
    {
      label: 'Manage Users',
      description: 'View and manage all platform users',
      icon: Users,
      href: ROUTES.ADMIN.USERS,
      color: 'text-primary bg-primary-light',
      permission: PERM.USERS_CANDIDATES_VIEW,
    },
    {
      label: 'Moderate Jobs',
      description: 'Review and moderate job listings',
      icon: Briefcase,
      href: ROUTES.ADMIN.JOBS,
      color: 'text-secondary bg-secondary-light',
      permission: PERM.JOBS_VIEW,
    },
    {
      label: 'View Analytics',
      description: 'Platform analytics and insights',
      icon: BarChart3,
      href: ROUTES.ADMIN.ANALYTICS,
      color: 'text-[var(--success)] bg-[var(--success-light)]',
      permission: PERM.ANALYTICS_OVERVIEW,
    },
    {
      label: 'Audit Logs',
      description: 'Track all admin actions and events',
      icon: Shield,
      href: ROUTES.ADMIN.AUDIT_LOGS,
      color: 'text-accent bg-accent-light',
      permission: PERM.PLATFORM_AUDIT_LOGS_VIEW,
    },
    {
      label: 'Verifications',
      description: 'Review identity & business verifications',
      icon: ShieldCheck,
      href: ROUTES.ADMIN.VERIFICATIONS,
      color: 'text-[var(--error)] bg-[var(--error-light)]',
      permission: PERM.VERIFICATIONS_CANDIDATE_VIEW,
    },
    {
      label: 'Applications',
      description: 'Monitor all job applications',
      icon: ClipboardList,
      href: ROUTES.ADMIN.APPLICATIONS,
      color: 'text-[var(--text-muted)] bg-[var(--bg-tertiary)]',
      permission: PERM.JOBS_APPLICATIONS_VIEW,
    },
    {
      label: 'Support Tickets',
      description: 'Manage user support requests',
      icon: MessageSquare,
      href: ROUTES.ADMIN.TICKETS,
      color: 'text-primary bg-primary-light',
      permission: PERM.SUPPORT_TICKETS_VIEW,
    },
    {
      label: 'Reports',
      description: 'Export users, jobs, analytics data',
      icon: FileBarChart,
      href: ROUTES.ADMIN.REPORTS,
      color: 'text-secondary bg-secondary-light',
      permission: PERM.REPORTS_VIEW,
    },
    {
      label: 'Email Templates',
      description: 'Preview and test email templates',
      icon: Mail,
      href: '/admin/email-templates',
      color: 'text-[var(--success)] bg-[var(--success-light)]',
      permission: PERM.PLATFORM_EMAIL_TEMPLATES_VIEW,
    },
    {
      label: 'Moderation',
      description: 'Keyword filters and content rules',
      icon: Shield,
      href: ROUTES.ADMIN.MODERATION,
      color: 'text-accent bg-accent-light',
      permission: PERM.MODERATION_KEYWORDS_VIEW,
    },
  ];

  /* Cards whose destination the admin cannot open are removed rather than
     rendered as a link to a permission wall. `can()` fails closed while
     grants are in flight, so the grid is skeletoned on `permissionsLoading`
     below — otherwise a freshly-loaded page would flash an empty grid at a
     fully-privileged admin. */
  const quickLinks = allQuickLinks.filter((l) => can(l.permission));

  // `permissionsLoading` is included deliberately: `can()` fails closed while
  // grants are in flight, so without this the grid would paint EMPTY for a
  // fraction of a second even for a fully-privileged admin. The page's own
  // `isLoading` only covers the stats query.
  if (isLoading || permissionsLoading) {
    return (
      <DashboardLayout requiredRole={['ADMIN', 'SUPER_ADMIN']}>
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
    <DashboardLayout requiredRole={['ADMIN', 'SUPER_ADMIN']}>
      <div className="space-y-6">
        {/* ── Header ── */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">
              {getGreeting(user?.firstName)}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {getDashboardSubtitle(user?.role)}
            </p>
          </div>
          {/* Alerts */}
          <div className="flex items-center gap-2">
            {(stats?.pendingVerifications ?? 0) > 0 && (
              <Tooltip content="View and review pending verifications">
                <Link
                  href={ROUTES.ADMIN.VERIFICATIONS}
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-[var(--warning-light)] px-3 py-1.5 text-sm font-medium text-[var(--warning)] transition-colors hover:bg-[var(--warning)]/20"
                >
                  <AlertTriangle className="h-4 w-4" />
                  {stats!.pendingVerifications} pending verification
                  {stats!.pendingVerifications > 1 ? 's' : ''}
                </Link>
              </Tooltip>
            )}
          </div>
        </div>

        {/* ── Stat Cards (10, 5-column grid with sparklines) ── */}
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
                    dataKey="v"
                    color={card.sparkColor}
                    height={40}
                  />
                </div>
              )}
            </Card>
          ))}
        </div>

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

        {/* ── Charts Row: Registration Trends + Application Volume ── */}
        {stats && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card
              header={
                <h2 className="text-lg font-semibold text-[var(--text)]">
                  Registration Trends (30 Days)
                </h2>
              }
            >
              {stats.registrationTrends && stats.registrationTrends.length > 0 ? (
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

        {/* ── Charts Row: Top Skills + Top Locations ── */}
        {stats && (stats.topSkills?.length || stats.topLocations?.length) && (
          <div className="grid gap-6 lg:grid-cols-2">
            {stats.topSkills && stats.topSkills.length > 0 && (
              <Card
                header={
                  <h2 className="text-lg font-semibold text-[var(--text)]">Top Skills in Demand</h2>
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
                    <MapPin className="h-5 w-5 text-[var(--text-muted)]" />
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

        {/* ── Platform Overview Bar + Verification Pipeline ── */}
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
                <h2 className="text-lg font-semibold text-[var(--text)]">Verification Pipeline</h2>
              }
            >
              <div className="space-y-4 py-4">
                {[
                  {
                    label: 'Pending',
                    value: stats.pendingVerifications,
                    color: 'bg-[var(--warning)]',
                    total:
                      (stats.pendingVerifications ?? 0) +
                      (stats.verificationsApproved ?? 0) +
                      (stats.verificationsRejected ?? 0),
                  },
                  {
                    label: 'Approved',
                    value: stats.verificationsApproved ?? 0,
                    color: 'bg-[var(--success)]',
                    total:
                      (stats.pendingVerifications ?? 0) +
                      (stats.verificationsApproved ?? 0) +
                      (stats.verificationsRejected ?? 0),
                  },
                  {
                    label: 'Rejected',
                    value: stats.verificationsRejected ?? 0,
                    color: 'bg-[var(--error)]',
                    total:
                      (stats.pendingVerifications ?? 0) +
                      (stats.verificationsApproved ?? 0) +
                      (stats.verificationsRejected ?? 0),
                  },
                ].map((item) => {
                  const pct = item.total > 0 ? Math.round((item.value / item.total) * 100) : 0;
                  return (
                    <div key={item.label}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-sm font-medium text-[var(--text)]">{item.label}</span>
                        <span className="text-sm text-[var(--text-muted)]">
                          {item.value} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-[var(--bg-tertiary)]">
                        <div
                          className={`h-2 rounded-full ${item.color} transition-all`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}

        {/* ── Recent Activity + Kafka Events ──
            Each card is tied to the permission behind its query: without it
            the panel rendered an eternal "Loading…" that never resolved. */}
        {(canOverview || isSuperAdmin) && (
          <div className="grid gap-6 lg:grid-cols-2">
            {canOverview && (
              /* Recent Activity (previously unused API) */
              <Card
                header={
                  <div className="flex items-center gap-2">
                    <Activity className="text-primary h-5 w-5" />
                    <h2 className="text-lg font-semibold text-[var(--text)]">Recent Activity</h2>
                  </div>
                }
              >
                <div className="space-y-3">
                  {activity?.users?.map((u, i) => (
                    <div key={`u-${u.id}`} className="flex items-center gap-3">
                      <div className="bg-primary-light relative flex h-8 w-8 items-center justify-center rounded-full">
                        <UserPlus className="text-primary h-4 w-4" />
                      </div>
                      {i < activity.users.length - 1 && (
                        <div className="absolute top-10 left-[15px] h-6 w-px bg-[var(--border)]" />
                      )}
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
            )}

            {isSuperAdmin && (
              /* Kafka Events — superAdminOnly, never grantable */
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
            )}
          </div>
        )}

        {/* ── System Health ── */}
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
        </Card>

        {/* ── Quick Actions ── */}
        <div>
          <h2 className="mb-4 text-lg font-semibold text-[var(--text)]">Quick Actions</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {quickLinks.map((link) => (
              <Tooltip key={link.label} content={link.description}>
                <Link href={link.href}>
                  <Card className="group hover:border-primary/30 h-full cursor-pointer transition-all hover:shadow-md">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${link.color}`}
                      >
                        <link.icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="group-hover:text-primary font-medium text-[var(--text)] transition-colors">
                          {link.label}
                        </p>
                        <p className="truncate text-xs text-[var(--text-muted)]">
                          {link.description}
                        </p>
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
