import prisma from '../config/prisma';
import type { ApplicationStatus } from '@prisma/client';
import logger from '../config/logger';

interface AnalyticsFilters {
  startDate?: string;
  endDate?: string;
  groupBy?: 'day' | 'week' | 'month';
}

interface CandidateAnalytics {
  summary: {
    totalApplications: number;
    activeApplications: number;
    interviewRate: number;
    offerRate: number;
    profileViews: number;
    profileScore: number;
    savedJobs: number;
    avgResponseDays: number | null;
  };
  previousPeriodSummary: { totalApplications: number; profileViews: number } | null;
  funnel: Record<string, number>;
  trends: Array<{ period: string; applications: number; profileViews: number }>;
  statusDistribution: Array<{ status: string; count: number }>;
  sourceDistribution: Array<{ source: string; count: number }>;
  topSkillsInDemand: Array<{ skill: string; count: number; youHave: boolean }>;
  salaryInsights: {
    yourExpected: { min: number; max: number };
    appliedJobsAvg: { min: number; max: number };
    offeredAvg: number | null;
  };
  recentActivity: Array<{
    jobTitle: string;
    companyName: string;
    status: string;
    date: string;
  }>;
  dayOfWeekDistribution: Array<{ day: string; count: number }>;
  responseTimeDistribution: Array<{ bucket: string; count: number }>;
  sourceEffectiveness: Array<{
    source: string;
    total: number;
    interviews: number;
    offers: number;
    hires: number;
    interviewRate: number;
  }>;
  locationDistribution: Array<{ location: string; count: number }>;
}

const TERMINAL_STATUSES: ApplicationStatus[] = ['REJECTED', 'WITHDRAWN', 'HIRED'];

export const candidateAnalyticsService = {
  async getAnalytics(userId: string, filters: AnalyticsFilters = {}): Promise<CandidateAnalytics> {
    const { startDate, endDate, groupBy = 'week' } = filters;

    const profile = await prisma.candidateProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        skills: true,
        expectedSalaryMin: true,
        expectedSalaryMax: true,
        profileCompleteness: true,
      },
    });

    if (!profile) {
      return emptyAnalytics();
    }

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    const appliedAtFilter = Object.keys(dateFilter).length > 0 ? { appliedAt: dateFilter } : {};

    // Compute previous period date range for comparison
    const hasDates = dateFilter.gte && dateFilter.lte;
    const rangeDays = hasDates
      ? Math.ceil((dateFilter.lte!.getTime() - dateFilter.gte!.getTime()) / (1000 * 60 * 60 * 24))
      : 30;
    const prevEnd = new Date((dateFilter.gte || new Date()).getTime());
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd.getTime() - rangeDays * 24 * 60 * 60 * 1000);
    const prevDateFilter = { gte: prevStart, lte: prevEnd };

    // Run all queries in parallel
    const [
      applications,
      statusCounts,
      sourceCounts,
      savedJobsCount,
      profileViewsCount,
      recentApps,
      appliedJobDetails,
      viewedApps,
      prevApplicationsCount,
      prevProfileViewsCount,
    ] = await Promise.all([
      // All applications for this candidate
      prisma.jobApplication.findMany({
        where: { candidateId: profile.id, ...appliedAtFilter },
        select: {
          id: true,
          status: true,
          source: true,
          appliedAt: true,
          viewedAt: true,
          updatedAt: true,
          job: {
            select: {
              title: true,
              skillsRequired: true,
              salaryMin: true,
              salaryMax: true,
              company: { select: { companyName: true } },
            },
          },
        },
        orderBy: { appliedAt: 'desc' },
      }),

      // Status distribution
      prisma.jobApplication.groupBy({
        by: ['status'],
        where: { candidateId: profile.id, ...appliedAtFilter },
        _count: { id: true },
      }),

      // Source distribution
      prisma.jobApplication.groupBy({
        by: ['source'],
        where: { candidateId: profile.id, ...appliedAtFilter },
        _count: { id: true },
      }),

      // Saved jobs count
      prisma.savedJob.count({ where: { userId } }),

      // Profile views count
      prisma.profileView.count({
        where: {
          profileUserId: userId,
          ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
        },
      }),

      // Recent activity (last 10)
      prisma.jobApplication.findMany({
        where: { candidateId: profile.id },
        select: {
          status: true,
          updatedAt: true,
          job: {
            select: {
              title: true,
              company: { select: { companyName: true } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),

      // Jobs applied to (for salary, skills, location analysis)
      prisma.jobApplication.findMany({
        where: { candidateId: profile.id, ...appliedAtFilter },
        select: {
          job: {
            select: {
              skillsRequired: true,
              salaryMin: true,
              salaryMax: true,
              location: true,
            },
          },
        },
      }),

      // Applications that were viewed (for response time calc)
      prisma.jobApplication.findMany({
        where: {
          candidateId: profile.id,
          viewedAt: { not: null },
          ...appliedAtFilter,
        },
        select: { appliedAt: true, viewedAt: true },
      }),

      // Previous period: application count
      prisma.jobApplication.count({
        where: { candidateId: profile.id, appliedAt: prevDateFilter },
      }),

      // Previous period: profile views count
      prisma.profileView.count({
        where: { profileUserId: userId, createdAt: prevDateFilter },
      }),
    ]);

    const total = applications.length;

    // Summary calculations
    const statusMap = new Map<string, number>();
    for (const sc of statusCounts) {
      statusMap.set(sc.status, sc._count.id);
    }

    const interviewCount =
      (statusMap.get('INTERVIEW_SCHEDULED') || 0) +
      (statusMap.get('OFFERED') || 0) +
      (statusMap.get('HIRED') || 0);
    const offerCount = (statusMap.get('OFFERED') || 0) + (statusMap.get('HIRED') || 0);
    const activeCount =
      total - applications.filter((a) => TERMINAL_STATUSES.includes(a.status)).length;

    // Average response time (days from APPLIED to VIEWED)
    let avgResponseDays: number | null = null;
    if (viewedApps.length > 0) {
      const totalDays = viewedApps.reduce((sum, app) => {
        const days =
          (new Date(app.viewedAt!).getTime() - new Date(app.appliedAt).getTime()) /
          (1000 * 60 * 60 * 24);
        return sum + days;
      }, 0);
      avgResponseDays = Math.round((totalDays / viewedApps.length) * 10) / 10;
    }

    // Funnel
    const funnel: Record<string, number> = {
      applied: total,
      viewed: statusMap.get('VIEWED') || 0,
      shortlisted: statusMap.get('SHORTLISTED') || 0,
      interviewScheduled: statusMap.get('INTERVIEW_SCHEDULED') || 0,
      offered: statusMap.get('OFFERED') || 0,
      hired: statusMap.get('HIRED') || 0,
      rejected: statusMap.get('REJECTED') || 0,
      withdrawn: statusMap.get('WITHDRAWN') || 0,
    };
    // Funnel should be cumulative (viewed includes shortlisted, etc.)
    funnel.viewed += funnel.shortlisted + funnel.interviewScheduled + funnel.offered + funnel.hired;
    funnel.shortlisted += funnel.interviewScheduled + funnel.offered + funnel.hired;
    funnel.interviewScheduled += funnel.offered + funnel.hired;
    funnel.offered += funnel.hired;

    // Status distribution
    const statusDistribution = statusCounts.map((sc) => ({
      status: sc.status,
      count: sc._count.id,
    }));

    // Source distribution
    const sourceDistribution = sourceCounts.map((sc) => ({
      source: sc.source || 'DIRECT',
      count: sc._count.id,
    }));

    // Skills demand analysis
    const skillFrequency = new Map<string, number>();
    for (const app of appliedJobDetails) {
      for (const skill of app.job.skillsRequired) {
        skillFrequency.set(skill, (skillFrequency.get(skill) || 0) + 1);
      }
    }
    const candidateSkills = new Set(profile.skills.map((s) => s.toLowerCase()));
    const topSkillsInDemand = Array.from(skillFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([skill, count]) => ({
        skill,
        count,
        youHave: candidateSkills.has(skill.toLowerCase()),
      }));

    // Salary insights
    const jobSalaries = appliedJobDetails
      .filter((a) => a.job.salaryMin !== null && a.job.salaryMin !== undefined)
      .map((a) => ({
        min: Number(a.job.salaryMin!),
        max: Number(a.job.salaryMax || a.job.salaryMin!),
      }));

    const salaryInsights = {
      yourExpected: {
        min: Number(profile.expectedSalaryMin || 0),
        max: Number(profile.expectedSalaryMax || 0),
      },
      appliedJobsAvg: {
        min:
          jobSalaries.length > 0
            ? Math.round(jobSalaries.reduce((s, j) => s + j.min, 0) / jobSalaries.length)
            : 0,
        max:
          jobSalaries.length > 0
            ? Math.round(jobSalaries.reduce((s, j) => s + j.max, 0) / jobSalaries.length)
            : 0,
      },
      offeredAvg: null as number | null,
    };

    // Recent activity
    const recentActivity = recentApps.map((app) => ({
      jobTitle: app.job.title,
      companyName: app.job.company?.companyName || 'Unknown',
      status: app.status,
      date: app.updatedAt.toISOString(),
    }));

    // Previous period comparison
    const previousPeriodSummary = {
      totalApplications: prevApplicationsCount,
      profileViews: prevProfileViewsCount,
    };

    // Day of week distribution
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayCounts = Array(7).fill(0) as number[];
    for (const app of applications) {
      dayCounts[new Date(app.appliedAt).getDay()]++;
    }
    const dayOfWeekDistribution = dayNames.map((day, i) => ({ day, count: dayCounts[i] }));

    // Response time distribution
    const rtBuckets: Record<string, number> = {
      'Same Day': 0,
      '1-3 Days': 0,
      '4-7 Days': 0,
      '1-2 Weeks': 0,
      '2+ Weeks': 0,
    };
    for (const app of viewedApps) {
      const days =
        (new Date(app.viewedAt!).getTime() - new Date(app.appliedAt).getTime()) /
        (1000 * 60 * 60 * 24);
      if (days < 1) rtBuckets['Same Day']++;
      else if (days <= 3) rtBuckets['1-3 Days']++;
      else if (days <= 7) rtBuckets['4-7 Days']++;
      else if (days <= 14) rtBuckets['1-2 Weeks']++;
      else rtBuckets['2+ Weeks']++;
    }
    const responseTimeDistribution = Object.entries(rtBuckets).map(([bucket, count]) => ({
      bucket,
      count,
    }));

    // Source effectiveness (cross-tabulation: source × outcome)
    const INTERVIEW_STATUSES = new Set(['INTERVIEW_SCHEDULED', 'OFFERED', 'HIRED']);
    const OFFER_STATUSES = new Set(['OFFERED', 'HIRED']);
    const sourceStats = new Map<
      string,
      { total: number; interviews: number; offers: number; hires: number }
    >();
    for (const app of applications) {
      const src = app.source || 'DIRECT';
      const s = sourceStats.get(src) || { total: 0, interviews: 0, offers: 0, hires: 0 };
      s.total++;
      if (INTERVIEW_STATUSES.has(app.status)) s.interviews++;
      if (OFFER_STATUSES.has(app.status)) s.offers++;
      if (app.status === 'HIRED') s.hires++;
      sourceStats.set(src, s);
    }
    const sourceEffectiveness = Array.from(sourceStats.entries()).map(([source, s]) => ({
      source,
      total: s.total,
      interviews: s.interviews,
      offers: s.offers,
      hires: s.hires,
      interviewRate: s.total > 0 ? Math.round((s.interviews / s.total) * 100) : 0,
    }));

    // Location distribution
    const locationMap = new Map<string, number>();
    for (const app of appliedJobDetails) {
      const loc = app.job.location || 'Remote';
      locationMap.set(loc, (locationMap.get(loc) || 0) + 1);
    }
    const locationDistribution = Array.from(locationMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([location, count]) => ({ location, count }));

    return {
      summary: {
        totalApplications: total,
        activeApplications: activeCount,
        interviewRate: total > 0 ? Math.round((interviewCount / total) * 100) : 0,
        offerRate: total > 0 ? Math.round((offerCount / total) * 100) : 0,
        profileViews: profileViewsCount,
        profileScore: profile.profileCompleteness,
        savedJobs: savedJobsCount,
        avgResponseDays,
      },
      previousPeriodSummary,
      funnel,
      trends: await buildTrendsAsync(profile.id, groupBy, dateFilter, userId),
      statusDistribution,
      sourceDistribution,
      topSkillsInDemand,
      salaryInsights,
      recentActivity,
      dayOfWeekDistribution,
      responseTimeDistribution,
      sourceEffectiveness,
      locationDistribution,
    };
  },

  async exportAnalyticsCsv(userId: string, filters: AnalyticsFilters = {}): Promise<string> {
    const analytics = await this.getAnalytics(userId, filters);
    const rows: string[] = [];

    // Summary section
    rows.push('Section,Metric,Value');
    rows.push(`Summary,Total Applications,${analytics.summary.totalApplications}`);
    rows.push(`Summary,Active Applications,${analytics.summary.activeApplications}`);
    rows.push(`Summary,Interview Rate,${analytics.summary.interviewRate}%`);
    rows.push(`Summary,Offer Rate,${analytics.summary.offerRate}%`);
    rows.push(`Summary,Profile Views,${analytics.summary.profileViews}`);
    rows.push(`Summary,Profile Score,${analytics.summary.profileScore}%`);
    rows.push(`Summary,Saved Jobs,${analytics.summary.savedJobs}`);
    rows.push(`Summary,Avg Response Days,${analytics.summary.avgResponseDays ?? 'N/A'}`);
    rows.push('');

    // Status distribution
    rows.push('Status,Count');
    for (const s of analytics.statusDistribution) {
      rows.push(`${s.status},${s.count}`);
    }
    rows.push('');

    // Trends
    rows.push('Period,Applications,Profile Views');
    for (const t of analytics.trends) {
      rows.push(`${t.period},${t.applications},${t.profileViews}`);
    }
    rows.push('');

    // Skills demand
    rows.push('Skill,Demand Count,You Have');
    for (const s of analytics.topSkillsInDemand) {
      rows.push(`"${s.skill}",${s.count},${s.youHave ? 'Yes' : 'No'}`);
    }
    rows.push('');

    // Day of week distribution
    rows.push('Day,Applications');
    for (const d of analytics.dayOfWeekDistribution) {
      rows.push(`${d.day},${d.count}`);
    }
    rows.push('');

    // Response time distribution
    rows.push('Response Time,Count');
    for (const r of analytics.responseTimeDistribution) {
      rows.push(`"${r.bucket}",${r.count}`);
    }
    rows.push('');

    // Source effectiveness
    rows.push('Source,Total,Interviews,Offers,Hires,Interview Rate');
    for (const s of analytics.sourceEffectiveness) {
      rows.push(
        `${s.source},${s.total},${s.interviews},${s.offers},${s.hires},${s.interviewRate}%`
      );
    }
    rows.push('');

    // Location distribution
    rows.push('Location,Applications');
    for (const l of analytics.locationDistribution) {
      rows.push(`"${l.location}",${l.count}`);
    }

    return rows.join('\n');
  },
};

function emptyAnalytics(): CandidateAnalytics {
  return {
    summary: {
      totalApplications: 0,
      activeApplications: 0,
      interviewRate: 0,
      offerRate: 0,
      profileViews: 0,
      profileScore: 0,
      savedJobs: 0,
      avgResponseDays: null,
    },
    previousPeriodSummary: null,
    funnel: {
      applied: 0,
      viewed: 0,
      shortlisted: 0,
      interviewScheduled: 0,
      offered: 0,
      hired: 0,
      rejected: 0,
      withdrawn: 0,
    },
    trends: [],
    statusDistribution: [],
    sourceDistribution: [],
    topSkillsInDemand: [],
    salaryInsights: {
      yourExpected: { min: 0, max: 0 },
      appliedJobsAvg: { min: 0, max: 0 },
      offeredAvg: null,
    },
    recentActivity: [],
    dayOfWeekDistribution: [],
    responseTimeDistribution: [],
    sourceEffectiveness: [],
    locationDistribution: [],
  };
}

// Build trends grouped by day/week/month
async function buildTrendsAsync(
  candidateId: string,
  groupBy: string,
  dateFilter: { gte?: Date; lte?: Date },
  userId: string
): Promise<Array<{ period: string; applications: number; profileViews: number }>> {
  try {
    // Get applications grouped by date
    const appliedAtFilter = Object.keys(dateFilter).length > 0 ? { appliedAt: dateFilter } : {};
    const apps = await prisma.jobApplication.findMany({
      where: { candidateId, ...appliedAtFilter },
      select: { appliedAt: true },
      orderBy: { appliedAt: 'asc' },
    });

    const viewFilter = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};
    const views = await prisma.profileView.findMany({
      where: { profileUserId: userId, ...viewFilter },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const appsByPeriod = new Map<string, number>();
    const viewsByPeriod = new Map<string, number>();

    for (const app of apps) {
      const key = formatPeriod(app.appliedAt, groupBy);
      appsByPeriod.set(key, (appsByPeriod.get(key) || 0) + 1);
    }

    for (const view of views) {
      const key = formatPeriod(view.createdAt, groupBy);
      viewsByPeriod.set(key, (viewsByPeriod.get(key) || 0) + 1);
    }

    const allPeriods = new Set([...appsByPeriod.keys(), ...viewsByPeriod.keys()]);
    const sorted = Array.from(allPeriods).sort();

    return sorted.map((period) => ({
      period,
      applications: appsByPeriod.get(period) || 0,
      profileViews: viewsByPeriod.get(period) || 0,
    }));
  } catch {
    logger.debug('Failed to build analytics trends');
    return [];
  }
}

function formatPeriod(date: Date, groupBy: string): string {
  const d = new Date(date);
  if (groupBy === 'day') {
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
  }
  if (groupBy === 'month') {
    return d.toISOString().slice(0, 7); // YYYY-MM
  }
  // week: use Monday of that week
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  return `W${monday.toISOString().slice(0, 10)}`;
}
