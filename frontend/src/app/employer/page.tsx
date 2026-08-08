'use client';

import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Briefcase,
  Users,
  Eye,
  UserCheck,
  ArrowRight,
  TrendingUp,
  Plus,
  HelpCircle,
  Timer,
  Target,
  Zap,
  Search,
  Bookmark,
  BarChart3,
  Settings,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
  Trophy,
  AlertTriangle,
  Info,
  CheckCircle,
  XCircle,
  Activity,
  Bell,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import ProgressBar from '@/components/ui/ProgressBar';
import Skeleton from '@/components/ui/Skeleton';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import Tooltip from '@/components/ui/Tooltip';
import PlanStatusBanner from '@/components/billing/PlanStatusBanner';
import EmployerHelplineBanner from '@/components/support/EmployerHelplineBanner';
import WhatsappSupportCard from '@/components/support/WhatsappSupportCard';
import WelcomeScreen from '@/components/common/WelcomeScreen';
import BarChart from '@/components/charts/BarChart';
import AreaChart from '@/components/charts/AreaChart';
import PieChart from '@/components/charts/PieChart';
import { employerService } from '@/services/employer.service';
import { QUERY_KEYS } from '@/constants/config';
import { ROUTES } from '@/constants/routes';
import { APPLICATION_STATUS_LABELS, APPLICATION_STATUS_COLORS } from '@/constants/enums';
import {
  formatRelativeDate,
  getGreeting,
  getDashboardSubtitle,
  formatSalaryRange,
} from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useNotifications } from '@/hooks/use-notifications';
import { wasOnboardingSkipped } from '@/hooks/use-onboarding';
import type { ApiError } from '@/types/api';

// Maps backend completeness field names → employer profile ?section= values
const COMPLETENESS_SECTION_MAP: Record<string, string> = {
  'Company Basics': 'company',
  'Company Description': 'about',
  'Logo & Branding': 'company',
  'Website & Links': 'company',
  'Contact Info': 'contact',
  'Office Location': 'address',
  'Why Work For Us': 'about',
  'Benefits & Perks': 'benefits',
  'Culture & Values': 'culture',
  'Social Profiles': 'social',
  'Tech Stack / Products': 'tech',
  'Registration (GST/CIN)': 'legal',
  'Team & Testimonials': 'people',
  'Media & Photos': 'company',
};

// Map activity status to timeline dot color
const activityDotColor = (status: string) => {
  const map: Record<string, string> = {
    APPLIED: 'bg-[#3B82F6]',
    VIEWED: 'bg-[#6366F1]',
    SHORTLISTED: 'bg-[#10B981]',
    OFFERED: 'bg-[#059669]',
    HIRED: 'bg-[#059669]',
    REJECTED: 'bg-[#EF4444]',
    WITHDRAWN: 'bg-[#6B7280]',
  };
  return map[status] || 'bg-[#6B7280]';
};

const notificationTypeIcon = (type: string) => {
  switch (type) {
    case 'SUCCESS':
      return CheckCircle;
    case 'WARNING':
      return AlertTriangle;
    case 'ERROR':
      return XCircle;
    default:
      return Info;
  }
};

const notificationTypeColor = (type: string) => {
  switch (type) {
    case 'SUCCESS':
      return 'text-[var(--success)]';
    case 'WARNING':
      return 'text-[var(--warning)]';
    case 'ERROR':
      return 'text-[var(--error)]';
    default:
      return 'text-[var(--info)]';
  }
};

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';
const statusColorMap: Record<string, BadgeVariant> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'error',
  neutral: 'neutral',
};

export default function EmployerDashboard() {
  const { user } = useAuth();
  const router = useRouter();

  const { data: dashboard, isLoading } = useQuery({
    queryKey: QUERY_KEYS.EMPLOYERS.DASHBOARD,
    queryFn: () => employerService.getDashboard(),
  });

  // Redirect first-time employers to onboarding
  const {
    data: companyData,
    isLoading: companyLoading,
    isError: companyError,
    error: companyErrorObj,
  } = useQuery({
    queryKey: QUERY_KEYS.EMPLOYERS.COMPANY,
    queryFn: () => employerService.getCompany(),
    retry: false,
  });

  const { data: completeness, isLoading: compLoading } = useQuery({
    queryKey: QUERY_KEYS.EMPLOYERS.COMPLETENESS,
    queryFn: () => employerService.getCompleteness(),
  });

  // `description` is a required onboarding step and never pre-filled from registration,
  // so its absence is the most reliable signal that onboarding hasn't been completed.
  //
  // The `_skipped` flag is USER-scoped (`ha_employer_onboarding_<userId>_skipped`)
  // — it used to be browser-global, letting one account's completion suppress the
  // wizard for every later account on this browser (see candidate dashboard for
  // the full rationale). `user?.id` guard avoids deciding during auth hydration;
  // the 404-only error check keeps transient 5xx/network failures from bouncing
  // an onboarded employer (on a flag-less device) back into the wizard.
  const companyMissing = (companyErrorObj as unknown as ApiError | null)?.statusCode === 404;
  const needsOnboarding =
    !!user?.id &&
    !companyLoading &&
    !wasOnboardingSkipped(`ha_employer_onboarding_${user.id}`) &&
    ((companyError && companyMissing) || (companyData?.data && !companyData.data.description));

  useEffect(() => {
    if (needsOnboarding) {
      router.replace(ROUTES.EMPLOYER.ONBOARDING);
    }
  }, [needsOnboarding, router]);

  const { data: metricsData, isLoading: metricsLoading } = useQuery({
    queryKey: ['employers', 'engagement-metrics'],
    queryFn: () => employerService.getEngagementMetrics(),
  });
  const metrics = metricsData?.data;

  const { data: analyticsData } = useQuery({
    queryKey: QUERY_KEYS.EMPLOYERS.ANALYTICS({ groupBy: 'week' }),
    queryFn: () => employerService.getAnalytics({ groupBy: 'week' }),
  });
  const analytics = analyticsData?.data;

  // Fetch recent notifications for preview card
  const { data: notificationsData } = useNotifications({ limit: 5 });
  const notifications = notificationsData?.data?.items || [];

  const stats = dashboard?.data;

  // Week-over-week change deltas for stat cards
  const weekDeltas = useMemo(() => {
    if (!analytics?.trends || analytics.trends.length < 2) return null;
    const curr = analytics.trends[analytics.trends.length - 1];
    const prev = analytics.trends[analytics.trends.length - 2];
    const delta = (c: number, p: number) =>
      p > 0 ? Math.round(((c - p) / p) * 100) : c > 0 ? 100 : 0;
    return {
      applications: delta(curr.applications, prev.applications),
      profileViews: delta(curr.profileViews, prev.profileViews),
    };
  }, [analytics?.trends]);

  // Top performing job (highest conversion rate)
  const topJob = useMemo(() => {
    if (!analytics?.jobPerformance?.length) return null;
    return [...analytics.jobPerformance].sort((a, b) => b.conversionRate - a.conversionRate)[0];
  }, [analytics?.jobPerformance]);

  // Pipeline bottleneck detector
  const bottleneck = useMemo(() => {
    if (!metrics?.conversions) return null;
    const stages = [
      { from: 'Applied', to: 'Viewed', rate: metrics.conversions.appliedToViewed },
      { from: 'Viewed', to: 'Shortlisted', rate: metrics.conversions.viewedToShortlisted },
      { from: 'Shortlisted', to: 'Offered', rate: metrics.conversions.shortlistedToInterview },
      { from: 'Offered', to: 'Hired', rate: metrics.conversions.offeredToHired },
    ];
    return stages.reduce((min, s) => (s.rate < min.rate ? s : min), stages[0]);
  }, [metrics?.conversions]);

  const statCards = [
    {
      label: 'Active Jobs',
      value: stats?.activeJobsCount ?? 0,
      icon: Briefcase,
      color: 'text-primary bg-primary-light',
      href: ROUTES.EMPLOYER.MY_JOBS,
    },
    {
      label: 'Total Applications',
      value: stats?.totalApplications ?? 0,
      icon: Users,
      color: 'text-[var(--success)] bg-[var(--success-light)]',
      href: ROUTES.EMPLOYER.MY_JOBS,
      deltaKey: 'applications' as const,
    },
    {
      label: 'Shortlisted',
      value: stats?.shortlistedCount ?? 0,
      icon: UserCheck,
      color: 'text-secondary bg-secondary-light',
      href: ROUTES.EMPLOYER.MY_JOBS,
    },
    {
      label: 'Profile Views',
      value: stats?.profileViews ?? 0,
      icon: Eye,
      color: 'text-accent bg-accent-light',
      href: ROUTES.EMPLOYER.PROFILE,
      deltaKey: 'profileViews' as const,
    },
    {
      // Total all-time job postings — relocated here from the former
      // "KPI Insights" row (removed along with the Avg Time to Hire /
      // Hire Rate / Hiring Velocity cards) so the dashboard shows a
      // single balanced row of stat cards. Sourced from analytics (not
      // the dashboard stats payload), so it fills in once analytics
      // resolves.
      label: 'Total Jobs Posted',
      value: analytics?.summary?.totalJobsPosted ?? 0,
      icon: FileText,
      color: 'text-[var(--info)] bg-[var(--info-light)]',
      href: ROUTES.EMPLOYER.MY_JOBS,
    },
  ];

  // Sparkline points from trends data
  const sparkline = useMemo(() => {
    if (!analytics?.trends?.length) return null;
    const recent = analytics.trends.slice(-6);
    const appValues = recent.map((t) => t.applications);
    const viewValues = recent.map((t) => t.profileViews);
    const toPoints = (vals: number[], w: number, h: number) => {
      const max = Math.max(...vals, 1);
      return vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - (v / max) * h}`).join(' ');
    };
    return { applications: toPoints(appValues, 60, 20), views: toPoints(viewValues, 60, 20) };
  }, [analytics?.trends]);

  // Source distribution pie
  const sourcePieData = useMemo(() => {
    if (!analytics?.sourceDistribution?.length) return [];
    const sourceColors: Record<string, string> = {
      SEARCH: '#3B82F6',
      RECOMMENDATION: '#10B981',
      DIRECT: '#F59E0B',
      JOB_ALERT: '#8B5CF6',
      REFERRAL: '#EC4899',
    };
    return analytics.sourceDistribution.map((s) => ({
      name: s.source.replace(/_/g, ' '),
      value: s.count,
      color: sourceColors[s.source] || '#6B7280',
    }));
  }, [analytics?.sourceDistribution]);

  // Status distribution pie
  const statusPieData = useMemo(() => {
    if (!analytics?.statusDistribution?.length) return [];
    const sc: Record<string, string> = {
      APPLIED: '#3B82F6',
      VIEWED: '#8B5CF6',
      SHORTLISTED: '#F59E0B',
      OFFERED: '#10B981',
      HIRED: '#059669',
      REJECTED: '#EF4444',
      WITHDRAWN: '#6B7280',
    };
    return analytics.statusDistribution.map((s) => ({
      name: APPLICATION_STATUS_LABELS[s.status] || s.status,
      value: s.count,
      color: sc[s.status] || '#6B7280',
    }));
  }, [analytics?.statusDistribution]);

  // Top skills bar data
  const skillsBarData = useMemo(() => {
    if (!analytics?.topSkillsInDemand?.length) return [];
    return analytics.topSkillsInDemand.slice(0, 10).map((s) => ({
      skill: s.skill.length > 15 ? `${s.skill.slice(0, 15)}...` : s.skill,
      count: s.count,
    }));
  }, [analytics?.topSkillsInDemand]);

  // Block rendering until the onboarding check completes. The previous
  // version wrapped the spinner in <DashboardLayout>, which painted the
  // full dashboard chrome (sidebar + header + main padding) for a frame
  // before the redirect-to-onboarding useEffect fired — visually
  // identical to the real dashboard, just briefly, which looked like
  // onboarding was being skipped. Strip the chrome here so the only
  // thing the user sees is a centered spinner on a neutral background;
  // it then fades into either the wizard (on redirect) or the real
  // dashboard (when the company profile resolves with a description).
  if (!user?.id || companyLoading || needsOnboarding) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-secondary)]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <DashboardLayout requiredRole={['EMPLOYER']}>
      {/* First-login full-screen welcome — self-gating via localStorage
          per (user, role). Auto-dismisses after 6s, fires confetti, shows
          a time-based greeting + name. No-op on subsequent visits. */}
      <WelcomeScreen />
      <div className="space-y-6">
        {/* `signedIn` — this is the employer dashboard, so it surfaces the
            dedicated employer helpline (public/auth/pricing show toll-free). */}
        <EmployerHelplineBanner compact variant="rounded" signedIn />
        {/* WhatsApp support — auto-shown to plans that include WhatsApp
            support (Standard, Premium, CV Pro, Assisted Hiring). Hidden
            for free-tier employers. */}
        <WhatsappSupportCard />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">
              {getGreeting(user?.firstName)}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {getDashboardSubtitle(user?.role)}
            </p>
          </div>
          <Tooltip content="Create a new job listing">
            <Link href={ROUTES.EMPLOYER.POST_JOB}>
              <Button variant="highlight" tooltip="Create a new job listing">
                <Plus className="mr-1.5 h-4 w-4" /> Post a Job
              </Button>
            </Link>
          </Tooltip>
        </div>

        {/* Active plan summary + quotas — or "Choose a plan" CTA */}
        <PlanStatusBanner highlightUnits={['JOB_POST', 'CV_UNLOCK', 'APPLICATIONS']} />

        {/* Account Type Setup Prompt */}
        {companyData?.data && !companyData.data.accountType && (
          <Card className="border-amber-200 bg-amber-50/50">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-[var(--text)]">Set Up Your Account Type</h3>
                  <p className="text-sm text-[var(--text-muted)]">
                    Tell us if you&apos;re a company or individual, and whether you hire directly or
                    as a staffing agency.
                  </p>
                </div>
              </div>
              <Link href={`${ROUTES.EMPLOYER.SETTINGS}?tab=account`}>
                <Button size="sm" variant="secondary">
                  <Settings className="mr-1.5 h-4 w-4" /> Set Up Now
                </Button>
              </Link>
            </div>
          </Card>
        )}

        {/* Profile Completeness */}
        {!compLoading && completeness?.data && completeness.data.score < 100 && (
          <Card className="border-primary/20 bg-primary-50/30">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <TrendingUp className="text-primary h-5 w-5" />
                  <h3 className="font-semibold text-[var(--text)]">
                    Complete Your Company Profile
                  </h3>
                </div>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  A complete company profile attracts 5x more qualified candidates.
                </p>
                <ProgressBar
                  value={completeness.data.score}
                  color={
                    completeness.data.score >= 80
                      ? 'success'
                      : completeness.data.score >= 50
                        ? 'warning'
                        : 'error'
                  }
                  className="mt-3"
                />
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {completeness.data.score}% complete
                </p>
                {completeness.data.sections.filter((s) => !s.completed).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {completeness.data.sections
                      .filter((s) => !s.completed)
                      .map((s) => (
                        <Tooltip key={s.name} content={`Complete your ${s.name} section`}>
                          <Link
                            href={`${ROUTES.EMPLOYER.PROFILE}?section=${COMPLETENESS_SECTION_MAP[s.name] || 'company'}`}
                          >
                            <span className="border-primary/20 text-primary hover:bg-primary inline-flex cursor-pointer items-center gap-1 rounded-full border bg-white px-3 py-1 text-xs font-medium transition-colors hover:text-white">
                              + {s.name}
                            </span>
                          </Link>
                        </Tooltip>
                      ))}
                  </div>
                )}
              </div>
              <Tooltip content="Go to your company profile settings">
                <Link href={ROUTES.EMPLOYER.PROFILE} className="shrink-0 self-start">
                  <Button size="sm" tooltip="Edit your company profile">
                    Update Profile
                  </Button>
                </Link>
              </Tooltip>
            </div>
          </Card>
        )}

        {/* Stats — single balanced row of 5 cards (4 core stats + Total
            Jobs Posted, relocated from the removed KPI Insights row). */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {isLoading
            ? Array.from({ length: 5 }).map((_, i) => (
                <Card key={i}>
                  <Skeleton variant="card" />
                </Card>
              ))
            : statCards.map((stat) => (
                <Tooltip key={stat.label} content={`View ${stat.label} details`}>
                  <Link href={stat.href}>
                    <Card className="cursor-pointer transition-shadow hover:shadow-md">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div
                            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${stat.color}`}
                          >
                            <stat.icon className="h-6 w-6" />
                          </div>
                          <div>
                            <p className="text-2xl font-bold text-[var(--text)]">{stat.value}</p>
                            <p className="text-sm text-[var(--text-muted)]">{stat.label}</p>
                            {weekDeltas &&
                              stat.deltaKey &&
                              weekDeltas[stat.deltaKey] !== undefined && (
                                <span
                                  className={`mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-medium ${weekDeltas[stat.deltaKey] >= 0 ? 'text-[var(--success)]' : 'text-[var(--error)]'}`}
                                >
                                  {weekDeltas[stat.deltaKey] >= 0 ? (
                                    <ArrowUpRight className="h-3 w-3" />
                                  ) : (
                                    <ArrowDownRight className="h-3 w-3" />
                                  )}
                                  {Math.abs(weekDeltas[stat.deltaKey])}% vs last week
                                </span>
                              )}
                          </div>
                        </div>
                        {sparkline &&
                          (stat.label === 'Total Applications' ||
                            stat.label === 'Profile Views') && (
                            <svg width="60" height="20" className="shrink-0 opacity-60">
                              <polyline
                                points={
                                  stat.label === 'Total Applications'
                                    ? sparkline.applications
                                    : sparkline.views
                                }
                                fill="none"
                                stroke={stat.label === 'Total Applications' ? '#10B981' : '#3B82F6'}
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                      </div>
                    </Card>
                  </Link>
                </Tooltip>
              ))}
        </div>

        {/* Top Performing Job Highlight */}
        {topJob && (
          <Card className="border-[var(--success)]/20 bg-[var(--success-light)]/20">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--success-light)]">
                <Trophy className="h-6 w-6 text-[var(--success)]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-[10px] font-semibold tracking-wider text-[var(--success)] uppercase">
                    Best Performing
                  </span>
                </div>
                <Tooltip content="View job details">
                  <Link
                    href={ROUTES.EMPLOYER.JOB_DETAIL(topJob.jobId)}
                    className="hover:text-primary text-lg font-semibold text-[var(--text)] transition-colors"
                  >
                    {topJob.title}
                  </Link>
                </Tooltip>
                <div className="mt-3 grid grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Views</p>
                    <p className="text-lg font-bold text-[var(--text)]">{topJob.views}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Applications</p>
                    <p className="text-lg font-bold text-[var(--text)]">{topJob.applications}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Hired</p>
                    <p className="text-lg font-bold text-[var(--success)]">{topJob.hiredCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Conversion</p>
                    <p className="text-primary text-lg font-bold">{topJob.conversionRate}%</p>
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
                  <div
                    className="h-full rounded-full bg-[var(--success)] transition-all"
                    style={{ width: `${Math.min(topJob.conversionRate, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Hiring Trends Chart */}
        {analytics?.trends && analytics.trends.length > 1 && (
          <Card
            header={
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="text-primary h-5 w-5" />
                  <h2 className="text-lg font-semibold text-[var(--text)]">Hiring Trends</h2>
                </div>
                <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-[#3B82F6]" /> Applications
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-[#8B5CF6]" /> Profile
                    Views
                  </span>
                </div>
              </div>
            }
          >
            <AreaChart
              data={analytics.trends as unknown as Record<string, unknown>[]}
              xKey="period"
              yKey="applications"
              yKey2="profileViews"
              color="#3B82F6"
              color2="#8B5CF6"
              height={280}
            />
          </Card>
        )}

        {/* Source Distribution + Status Distribution */}
        {analytics && (sourcePieData.length > 0 || statusPieData.length > 0) && (
          <div className="grid gap-6 lg:grid-cols-2">
            {sourcePieData.length > 0 && (
              <Card
                header={
                  <h2 className="text-lg font-semibold text-[var(--text)]">Application Sources</h2>
                }
              >
                <PieChart data={sourcePieData} height={250} innerRadius={45} />
              </Card>
            )}
            {statusPieData.length > 0 && (
              <Card
                header={
                  <h2 className="text-lg font-semibold text-[var(--text)]">Status Distribution</h2>
                }
              >
                <PieChart data={statusPieData} height={250} innerRadius={45} />
              </Card>
            )}
          </div>
        )}

        {/* Top Skills in Jobs */}
        {skillsBarData.length > 0 && (
          <Card
            header={
              <div className="flex items-center gap-2">
                <Target className="text-primary h-5 w-5" />
                <h2 className="text-lg font-semibold text-[var(--text)]">
                  Top Skills in Your Jobs
                </h2>
              </div>
            }
          >
            <BarChart
              data={skillsBarData as unknown as Record<string, unknown>[]}
              xKey="skill"
              bars={[{ key: 'count', color: '#3B82F6', name: 'Jobs Requiring' }]}
              height={280}
            />
          </Card>
        )}

        {/* Salary Competitiveness */}
        {analytics?.salaryCompetitiveness && (
          <Card
            header={
              <div className="flex items-center gap-2">
                <TrendingUp className="text-primary h-5 w-5" />
                <h2 className="text-lg font-semibold text-[var(--text)]">Salary Competitiveness</h2>
              </div>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-[var(--bg-secondary)] p-5">
                <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">
                  Your Avg Offered
                </p>
                <p className="text-xl font-bold text-[var(--text)]">
                  {formatSalaryRange(
                    analytics.salaryCompetitiveness.yourAvg?.min,
                    analytics.salaryCompetitiveness.yourAvg?.max,
                  )}
                </p>
              </div>
              <div className="rounded-xl bg-[var(--bg-secondary)] p-5">
                <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">
                  Platform Average
                </p>
                <p className="text-primary text-xl font-bold">
                  {formatSalaryRange(
                    analytics.salaryCompetitiveness.platformAvg?.min,
                    analytics.salaryCompetitiveness.platformAvg?.max,
                  )}
                </p>
              </div>
            </div>
            {analytics.salaryCompetitiveness.yourAvg?.min > 0 &&
              analytics.salaryCompetitiveness.platformAvg?.min > 0 &&
              (() => {
                const yourMid =
                  (analytics.salaryCompetitiveness.yourAvg.min +
                    analytics.salaryCompetitiveness.yourAvg.max) /
                  2;
                const platMid =
                  (analytics.salaryCompetitiveness.platformAvg.min +
                    analytics.salaryCompetitiveness.platformAvg.max) /
                  2;
                const ratio = platMid > 0 ? (yourMid / platMid) * 100 : 0;
                const isCompetitive = ratio >= 100;
                return (
                  <div className="mt-4 flex items-center gap-3">
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
                      <div
                        className={`h-full rounded-full transition-all ${isCompetitive ? 'bg-[#10B981]' : 'bg-[#F59E0B]'}`}
                        style={{ width: `${Math.min(ratio, 100)}%` }}
                      />
                    </div>
                    <span
                      className={`text-sm font-medium ${isCompetitive ? 'text-[var(--success)]' : 'text-[var(--warning)]'}`}
                    >
                      {Math.round(ratio)}%
                    </span>
                  </div>
                );
              })()}
          </Card>
        )}

        {/* Recruitment Tools */}
        <Card
          header={
            <div className="flex items-center gap-2">
              <Users className="text-primary h-5 w-5" />
              <h2 className="text-lg font-semibold text-[var(--text)]">Recruitment Tools</h2>
            </div>
          }
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Tooltip content="Search candidates in the talent pool">
              <Link href={ROUTES.EMPLOYER.CANDIDATES}>
                <div className="group hover:border-primary/30 flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--border)] p-4 transition-all hover:shadow-sm">
                  <div className="bg-primary-light flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                    <Search className="text-primary h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="group-hover:text-primary text-sm font-medium text-[var(--text)] transition-colors">
                      Search Candidates
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">Browse the talent pool</p>
                  </div>
                </div>
              </Link>
            </Tooltip>
            <Tooltip content="View your saved candidates">
              <Link href={ROUTES.EMPLOYER.SAVED_CANDIDATES}>
                <div className="group hover:border-primary/30 flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--border)] p-4 transition-all hover:shadow-sm">
                  <div className="bg-secondary-light flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                    <Bookmark className="text-secondary h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="group-hover:text-primary text-sm font-medium text-[var(--text)] transition-colors">
                      Saved Candidates
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Review your shortlisted talent
                    </p>
                  </div>
                </div>
              </Link>
            </Tooltip>
            <Tooltip content="Manage all job applications">
              <Link href={ROUTES.EMPLOYER.APPLICATIONS}>
                <div className="group border-primary/20 bg-primary-50/20 hover:border-primary/40 flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-all hover:shadow-sm">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--success-light)]">
                    <FileText className="h-5 w-5 text-[var(--success)]" />
                  </div>
                  <div className="min-w-0">
                    <p className="group-hover:text-primary text-sm font-medium text-[var(--text)] transition-colors">
                      All Applications
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Manage applications across all jobs
                    </p>
                  </div>
                </div>
              </Link>
            </Tooltip>
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recent Applications */}
          <Card
            header={
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[var(--text)]">Recent Applications</h2>
                <Tooltip content="View all your job listings">
                  <Link
                    href={ROUTES.EMPLOYER.MY_JOBS}
                    className="text-primary text-sm hover:underline"
                  >
                    View All <ArrowRight className="ml-1 inline h-3.5 w-3.5" />
                  </Link>
                </Tooltip>
              </div>
            }
          >
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} variant="card" />
                ))}
              </div>
            ) : stats?.recentApplications && stats.recentApplications.length > 0 ? (
              <div className="divide-y divide-[var(--border)]">
                {stats.recentApplications.map((app) => {
                  const badgeColor =
                    statusColorMap[APPLICATION_STATUS_COLORS[app.status] || 'neutral'] || 'neutral';
                  return (
                    <div
                      key={app.id}
                      className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-[var(--text)]">
                          {app.candidateName}
                        </p>
                        <p className="text-sm text-[var(--text-muted)]">{app.jobTitle}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <Badge variant={badgeColor} size="sm">
                          {APPLICATION_STATUS_LABELS[app.status] || app.status}
                        </Badge>
                        <span className="hidden text-xs text-[var(--text-muted)] sm:block">
                          {formatRelativeDate(app.appliedAt)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={Users}
                title="No applications yet"
                description="Post a job to start receiving applications."
              />
            )}
          </Card>

          {/* Job Performance */}
          <Card
            header={<h2 className="text-lg font-semibold text-[var(--text)]">Job Performance</h2>}
          >
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} variant="card" />
                ))}
              </div>
            ) : stats?.jobPerformance && stats.jobPerformance.length > 0 ? (
              <div className="divide-y divide-[var(--border)]">
                {stats.jobPerformance.map((job) => (
                  <Tooltip key={job.jobId} content="View job performance details">
                    <Link
                      href={ROUTES.EMPLOYER.JOB_DETAIL(job.jobId)}
                      className="-mx-2 flex items-center justify-between rounded-lg px-2 py-3 transition-colors first:pt-0 last:pb-0 hover:bg-[var(--bg-secondary)]"
                    >
                      <p className="truncate font-medium text-[var(--text)]">{job.jobTitle}</p>
                      <div className="flex shrink-0 items-center gap-4 text-sm">
                        <span className="flex items-center gap-1 text-[var(--text-muted)]">
                          <Eye className="h-3.5 w-3.5" /> {job.views}
                        </span>
                        <span className="text-primary flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" /> {job.applications}
                        </span>
                      </div>
                    </Link>
                  </Tooltip>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={TrendingUp}
                title="No jobs posted"
                description="Post your first job to see performance data."
              />
            )}
          </Card>
        </div>

        {/* Job Performance Chart (enhanced with hired + conversion) */}
        {!isLoading && stats?.jobPerformance && stats.jobPerformance.length > 0 && (
          <Card
            header={
              <div className="flex items-center gap-2">
                <TrendingUp className="text-primary h-5 w-5" />
                <h2 className="text-lg font-semibold text-[var(--text)]">Job Performance Chart</h2>
              </div>
            }
          >
            <BarChart
              data={stats.jobPerformance.map((job) => ({
                name: job.jobTitle.length > 20 ? `${job.jobTitle.slice(0, 20)}...` : job.jobTitle,
                views: job.views,
                applications: job.applications,
              }))}
              xKey="name"
              bars={[
                { key: 'views', color: '#6366F1', name: 'Views' },
                { key: 'applications', color: '#1E5CAF', name: 'Applications' },
              ]}
              height={300}
            />
          </Card>
        )}

        {/* Enhanced Job Performance Table (from analytics) */}
        {analytics?.jobPerformance && analytics.jobPerformance.length > 0 && (
          <Card
            header={
              <div className="flex items-center gap-2">
                <Target className="text-primary h-5 w-5" />
                <h2 className="text-lg font-semibold text-[var(--text)]">
                  Hiring Performance by Job
                </h2>
              </div>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="pb-3 text-left font-medium text-[var(--text-secondary)]">
                      Job Title
                    </th>
                    <th className="pb-3 text-right font-medium text-[var(--text-secondary)]">
                      Views
                    </th>
                    <th className="pb-3 text-right font-medium text-[var(--text-secondary)]">
                      Applications
                    </th>
                    <th className="pb-3 text-right font-medium text-[var(--text-secondary)]">
                      Hired
                    </th>
                    <th className="pb-3 text-right font-medium text-[var(--text-secondary)]">
                      Conversion
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {analytics.jobPerformance.slice(0, 10).map((job) => (
                    <tr
                      key={job.jobId}
                      className="transition-colors hover:bg-[var(--bg-secondary)]"
                    >
                      <td className="py-3 pr-4">
                        <Tooltip content="View job details">
                          <Link
                            href={ROUTES.EMPLOYER.JOB_DETAIL(job.jobId)}
                            className="hover:text-primary block max-w-[200px] truncate font-medium text-[var(--text)]"
                          >
                            {job.title}
                          </Link>
                        </Tooltip>
                      </td>
                      <td className="py-3 text-right text-[var(--text-muted)]">{job.views}</td>
                      <td className="py-3 text-right text-[var(--text-muted)]">
                        {job.applications}
                      </td>
                      <td className="py-3 text-right">
                        <span className="font-medium text-[var(--success)]">{job.hiredCount}</span>
                      </td>
                      <td className="py-3 text-right">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            job.conversionRate >= 10
                              ? 'bg-[var(--success-light)] text-[var(--success)]'
                              : job.conversionRate >= 5
                                ? 'bg-[var(--warning-light)] text-[var(--warning)]'
                                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
                          }`}
                        >
                          {job.conversionRate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Engagement Metrics */}
        <Card
          header={
            <div className="flex items-center gap-2">
              <Target className="text-primary h-5 w-5" />
              <h2 className="text-lg font-semibold text-[var(--text)]">Hiring Metrics</h2>
            </div>
          }
        >
          {metricsLoading ? (
            <Skeleton variant="rect" height={200} />
          ) : metrics ? (
            <div className="space-y-6">
              {/* Metric Cards */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl bg-[var(--bg-secondary)] p-4 text-center">
                  <div className="bg-primary-light mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg">
                    <Timer className="text-primary h-5 w-5" />
                  </div>
                  <p className="text-2xl font-bold text-[var(--text)]">
                    {metrics.avgTimeToHireDays !== null ? `${metrics.avgTimeToHireDays}d` : '—'}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">Avg. Time to Hire</p>
                </div>
                <div className="rounded-xl bg-[var(--bg-secondary)] p-4 text-center">
                  <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--success-light)]">
                    <Target className="h-5 w-5 text-[var(--success)]" />
                  </div>
                  <p className="text-2xl font-bold text-[var(--text)]">
                    {metrics.conversions.overallHireRate}%
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">Overall Hire Rate</p>
                </div>
                <div className="rounded-xl bg-[var(--bg-secondary)] p-4 text-center">
                  <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--warning-light)]">
                    <Zap className="h-5 w-5 text-[var(--warning)]" />
                  </div>
                  <p className="text-2xl font-bold text-[var(--text)]">
                    {metrics.hiringVelocity}/mo
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">Hiring Velocity</p>
                </div>
              </div>

              {/* Hiring Funnel */}
              {metrics.funnel.applied > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-medium text-[var(--text-secondary)]">
                    Hiring Funnel
                  </h3>
                  <div className="space-y-2">
                    {[
                      { label: 'Applied', value: metrics.funnel.applied, color: 'bg-blue-500' },
                      {
                        label: 'Viewed',
                        value: metrics.funnel.viewed,
                        rate: metrics.conversions.appliedToViewed,
                        color: 'bg-blue-400',
                      },
                      {
                        label: 'Shortlisted',
                        value: metrics.funnel.shortlisted,
                        rate: metrics.conversions.viewedToShortlisted,
                        color: 'bg-indigo-500',
                      },
                      {
                        label: 'Offered',
                        value: metrics.funnel.offered,
                        rate: metrics.conversions.shortlistedToInterview,
                        color: 'bg-green-500',
                      },
                      {
                        label: 'Hired',
                        value: metrics.funnel.hired,
                        rate: metrics.conversions.offeredToHired,
                        color: 'bg-emerald-600',
                      },
                    ].map((stage) => {
                      const widthPct =
                        metrics.funnel.applied > 0
                          ? Math.max((stage.value / metrics.funnel.applied) * 100, 2)
                          : 0;
                      return (
                        <div key={stage.label} className="flex items-center gap-3">
                          <span className="w-20 shrink-0 text-xs text-[var(--text-secondary)]">
                            {stage.label}
                          </span>
                          <div className="h-6 flex-1 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
                            <div
                              className={`h-full rounded-full ${stage.color} transition-all`}
                              style={{
                                width: `${widthPct}%`,
                              }}
                            />
                          </div>
                          <span className="w-10 shrink-0 text-right text-xs font-semibold text-[var(--text)]">
                            {stage.value}
                          </span>
                          {stage.rate !== undefined && (
                            <span className="w-12 text-right text-[10px] text-[var(--text-muted)]">
                              {stage.rate}%
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              icon={Target}
              title="No hiring data yet"
              description="Engagement metrics will appear once you start receiving applications."
            />
          )}
        </Card>

        {/* Pipeline Bottleneck Alert */}
        {bottleneck && bottleneck.rate < 100 && (
          <Card className="border-[var(--warning)]/20 bg-[var(--warning-light)]/20">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--warning-light)]">
                <AlertTriangle className="h-5 w-5 text-[var(--warning)]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--text)]">
                  Pipeline Bottleneck Detected
                </h3>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Biggest drop-off: <span className="font-semibold">{bottleneck.rate}%</span>{' '}
                  conversion from <span className="font-medium">{bottleneck.from}</span> →{' '}
                  <span className="font-medium">{bottleneck.to}</span>. Consider reviewing your{' '}
                  {bottleneck.to.toLowerCase()} process to improve throughput.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Recent Activity Timeline */}
        {analytics?.recentActivity && analytics.recentActivity.length > 0 && (
          <Card
            header={
              <div className="flex items-center gap-2">
                <Activity className="text-primary h-5 w-5" />
                <h2 className="text-lg font-semibold text-[var(--text)]">Recent Activity</h2>
              </div>
            }
          >
            <div className="space-y-0">
              {analytics.recentActivity.slice(0, 5).map((activity, i) => {
                const badgeColor =
                  statusColorMap[APPLICATION_STATUS_COLORS[activity.status] || 'neutral'] ||
                  'neutral';
                return (
                  <div
                    key={i}
                    className="flex gap-3 border-b border-[var(--border)] py-3 last:border-0"
                  >
                    <div className="relative flex flex-col items-center">
                      <div
                        className={`mt-1.5 h-2.5 w-2.5 rounded-full ${activityDotColor(activity.status)}`}
                      />
                      {i < Math.min(analytics.recentActivity.length, 5) - 1 && (
                        <div className="mt-1 w-px flex-1 bg-[var(--border)]" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-[var(--text)]">
                        <span className="font-medium">{activity.candidateName}</span> —{' '}
                        <span className="font-medium">{activity.jobTitle}</span>
                      </p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <Badge variant={badgeColor} size="sm">
                          {APPLICATION_STATUS_LABELS[activity.status] || activity.status}
                        </Badge>
                        <span className="text-xs text-[var(--text-muted)]">
                          {formatRelativeDate(activity.date)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Notifications Preview */}
        {notifications.length > 0 && (
          <Card
            header={
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="text-primary h-5 w-5" />
                  <h2 className="text-lg font-semibold text-[var(--text)]">Notifications</h2>
                </div>
                <Tooltip content="View all notifications">
                  <Link
                    href={ROUTES.NOTIFICATIONS}
                    className="text-primary text-sm hover:underline"
                  >
                    View All <ArrowRight className="ml-1 inline h-3.5 w-3.5" />
                  </Link>
                </Tooltip>
              </div>
            }
          >
            <div className="divide-y divide-[var(--border)]">
              {notifications.slice(0, 5).map((n) => {
                const NIcon = notificationTypeIcon(n.type);
                return (
                  <div key={n.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                    <div className={`mt-0.5 shrink-0 ${notificationTypeColor(n.type)}`}>
                      <NIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-[var(--text)]">{n.title}</p>
                        {!n.isRead && (
                          <span className="bg-primary mt-1.5 h-2 w-2 shrink-0 rounded-full" />
                        )}
                      </div>
                      <p className="line-clamp-1 text-xs text-[var(--text-muted)]">{n.message}</p>
                      <span className="text-[10px] text-[var(--text-muted)]">
                        {formatRelativeDate(n.createdAt)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Quick Actions */}
        <div>
          <h2 className="mb-3 text-lg font-semibold text-[var(--text)]">Quick Actions</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Tooltip content="Create a new job listing">
              <Link href={ROUTES.EMPLOYER.POST_JOB}>
                <Card className="group hover:border-primary/30 cursor-pointer transition-all hover:shadow-md">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary-light flex h-10 w-10 items-center justify-center rounded-lg">
                      <Plus className="text-primary h-5 w-5" />
                    </div>
                    <div>
                      <p className="group-hover:text-primary font-medium text-[var(--text)] transition-colors">
                        Post a Job
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">Create a new listing</p>
                    </div>
                  </div>
                </Card>
              </Link>
            </Tooltip>
            <Tooltip content="Search the talent pool for candidates">
              <Link href={ROUTES.EMPLOYER.CANDIDATES}>
                <Card className="group hover:border-primary/30 cursor-pointer transition-all hover:shadow-md">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--success-light)]">
                      <Users className="h-5 w-5 text-[var(--success)]" />
                    </div>
                    <div>
                      <p className="group-hover:text-primary font-medium text-[var(--text)] transition-colors">
                        Find Candidates
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">Search talent pool</p>
                    </div>
                  </div>
                </Card>
              </Link>
            </Tooltip>
            <Tooltip content="Review your shortlisted talent">
              <Link href={ROUTES.EMPLOYER.SAVED_CANDIDATES}>
                <Card className="group hover:border-primary/30 cursor-pointer transition-all hover:shadow-md">
                  <div className="flex items-center gap-3">
                    <div className="bg-secondary-light flex h-10 w-10 items-center justify-center rounded-lg">
                      <Bookmark className="text-secondary h-5 w-5" />
                    </div>
                    <div>
                      <p className="group-hover:text-primary font-medium text-[var(--text)] transition-colors">
                        Saved Candidates
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Review your shortlisted talent
                      </p>
                    </div>
                  </div>
                </Card>
              </Link>
            </Tooltip>
            <Tooltip content="Track your hiring performance analytics">
              <Link href={ROUTES.EMPLOYER.ANALYTICS}>
                <Card className="group hover:border-primary/30 cursor-pointer transition-all hover:shadow-md">
                  <div className="flex items-center gap-3">
                    <div className="bg-accent-light flex h-10 w-10 items-center justify-center rounded-lg">
                      <BarChart3 className="text-accent h-5 w-5" />
                    </div>
                    <div>
                      <p className="group-hover:text-primary font-medium text-[var(--text)] transition-colors">
                        Analytics
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Track your hiring performance
                      </p>
                    </div>
                  </div>
                </Card>
              </Link>
            </Tooltip>
            <Tooltip content="Manage account, security and preferences">
              <Link href={ROUTES.EMPLOYER.SETTINGS}>
                <Card className="group hover:border-primary/30 cursor-pointer transition-all hover:shadow-md">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
                      <Settings className="h-5 w-5 text-[var(--text-muted)]" />
                    </div>
                    <div>
                      <p className="group-hover:text-primary font-medium text-[var(--text)] transition-colors">
                        Settings
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Account, security & preferences
                      </p>
                    </div>
                  </div>
                </Card>
              </Link>
            </Tooltip>
            <Tooltip content="Get help with FAQs and support tickets">
              <Link href={ROUTES.EMPLOYER.HELP}>
                <Card className="group hover:border-primary/30 cursor-pointer transition-all hover:shadow-md">
                  <div className="flex items-center gap-3">
                    <div className="bg-accent-light flex h-10 w-10 items-center justify-center rounded-lg">
                      <HelpCircle className="text-accent h-5 w-5" />
                    </div>
                    <div>
                      <p className="group-hover:text-primary font-medium text-[var(--text)] transition-colors">
                        Help & Support
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">FAQs and support tickets</p>
                    </div>
                  </div>
                </Card>
              </Link>
            </Tooltip>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
