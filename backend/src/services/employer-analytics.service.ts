import { prisma } from '../config/prisma';
import logger from '../config/logger';

interface AnalyticsFilters {
  startDate?: string;
  endDate?: string;
  groupBy?: 'day' | 'week' | 'month';
}

interface EmployerAnalytics {
  summary: {
    totalJobsPosted: number;
    activeJobs: number;
    totalApplications: number;
    avgTimeToHireDays: number | null;
    overallHireRate: number;
    profileViews: number;
    savedCandidates: number;
    hiringVelocity: number;
  };
  previousPeriodSummary: {
    totalJobsPosted: number;
    totalApplications: number;
    profileViews: number;
  } | null;
  funnel: Record<string, number>;
  trends: Array<{ period: string; applications: number; profileViews: number; jobsPosted: number }>;
  statusDistribution: Array<{ status: string; count: number }>;
  sourceDistribution: Array<{ source: string; count: number }>;
  topSkillsInDemand: Array<{ skill: string; count: number }>;
  salaryCompetitiveness: {
    yourAvg: { min: number; max: number };
    platformAvg: { min: number; max: number };
  };
  jobPerformance: Array<{
    jobId: string;
    title: string;
    views: number;
    applications: number;
    hiredCount: number;
    conversionRate: number;
  }>;
  recentActivity: Array<{
    candidateName: string;
    jobTitle: string;
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
  timeToHireDistribution: Array<{ bucket: string; count: number }>;
}

function emptyAnalytics(): EmployerAnalytics {
  return {
    summary: {
      totalJobsPosted: 0,
      activeJobs: 0,
      totalApplications: 0,
      avgTimeToHireDays: null,
      overallHireRate: 0,
      profileViews: 0,
      savedCandidates: 0,
      hiringVelocity: 0,
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
    salaryCompetitiveness: { yourAvg: { min: 0, max: 0 }, platformAvg: { min: 0, max: 0 } },
    jobPerformance: [],
    recentActivity: [],
    dayOfWeekDistribution: [],
    responseTimeDistribution: [],
    sourceEffectiveness: [],
    locationDistribution: [],
    timeToHireDistribution: [],
  };
}

export const employerAnalyticsService = {
  async getAnalytics(userId: string, filters: AnalyticsFilters = {}): Promise<EmployerAnalytics> {
    const { startDate, endDate, groupBy = 'week' } = filters;

    const companyProfile = await prisma.companyProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!companyProfile) return emptyAnalytics();
    const companyId = companyProfile.id;

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

    const [
      totalJobsPosted,
      activeJobs,
      statusCounts,
      sourceCounts,
      profileViewsCount,
      savedCandidatesCount,
      hiredApplications,
      jobPosts,
      recentApps,
      platformSalaryAvg,
      allApplications,
      viewedApps,
      prevApplicationsCount,
      prevProfileViewsCount,
      prevJobsPostedCount,
    ] = await Promise.all([
      prisma.jobPost.count({ where: { companyId } }),
      prisma.jobPost.count({ where: { companyId, status: 'OPEN' } }),
      prisma.jobApplication.groupBy({
        by: ['status'],
        where: { job: { companyId }, ...appliedAtFilter },
        _count: { id: true },
      }),
      prisma.jobApplication.groupBy({
        by: ['source'],
        where: { job: { companyId }, ...appliedAtFilter },
        _count: { id: true },
      }),
      prisma.profileView.count({
        where: {
          profileUserId: userId,
          ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
        },
      }),
      prisma.savedCandidate.count({ where: { employerId: userId } }),
      prisma.jobApplication.findMany({
        where: { job: { companyId }, status: 'HIRED', hiredAt: { not: null } },
        select: { appliedAt: true, hiredAt: true },
      }),
      prisma.jobPost.findMany({
        where: { companyId },
        select: {
          id: true,
          title: true,
          views: true,
          location: true,
          skillsRequired: true,
          salaryMin: true,
          salaryMax: true,
          _count: { select: { applications: true } },
        },
      }),
      prisma.jobApplication.findMany({
        where: { job: { companyId }, ...appliedAtFilter },
        select: {
          status: true,
          updatedAt: true,
          job: { select: { title: true } },
          candidate: {
            select: { user: { select: { firstName: true, lastName: true } } },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
      prisma.jobPost.aggregate({
        _avg: { salaryMin: true, salaryMax: true },
        where: { salaryMin: { not: null }, status: 'OPEN' },
      }),

      // All applications with source+status (for source effectiveness & day-of-week)
      prisma.jobApplication.findMany({
        where: { job: { companyId }, ...appliedAtFilter },
        select: { status: true, source: true, appliedAt: true },
      }),

      // Viewed applications (for response time distribution)
      prisma.jobApplication.findMany({
        where: { job: { companyId }, viewedAt: { not: null }, ...appliedAtFilter },
        select: { appliedAt: true, viewedAt: true },
      }),

      // Previous period: application count
      prisma.jobApplication.count({
        where: { job: { companyId }, appliedAt: prevDateFilter },
      }),

      // Previous period: profile views count
      prisma.profileView.count({
        where: { profileUserId: userId, createdAt: prevDateFilter },
      }),

      // Previous period: jobs posted count
      prisma.jobPost.count({
        where: { companyId, createdAt: prevDateFilter },
      }),
    ]);

    // --- Summary ---
    const statusMap = new Map<string, number>();
    for (const sc of statusCounts) {
      statusMap.set(sc.status, sc._count.id);
    }
    const totalApplications = Array.from(statusMap.values()).reduce((a, b) => a + b, 0);
    const hiredCount = statusMap.get('HIRED') || 0;

    // Avg time to hire
    const avgTimeToHireDays =
      hiredApplications.length > 0
        ? Math.round(
            hiredApplications.reduce((sum, app) => {
              return (
                sum + (app.hiredAt!.getTime() - app.appliedAt.getTime()) / (1000 * 60 * 60 * 24)
              );
            }, 0) / hiredApplications.length
          )
        : null;

    // Hiring velocity: hires in last 6 months / 6
    const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const recentHiresCount = hiredApplications.filter((a) => a.hiredAt! >= sixMonthsAgo).length;
    const hiringVelocity = Math.round((recentHiresCount / 6) * 10) / 10;

    const overallHireRate =
      totalApplications > 0 ? parseFloat(((hiredCount / totalApplications) * 100).toFixed(1)) : 0;

    // --- Funnel (cumulative) ---
    const funnel: Record<string, number> = {
      applied: totalApplications,
      viewed: statusMap.get('VIEWED') || 0,
      shortlisted: statusMap.get('SHORTLISTED') || 0,
      interviewScheduled: statusMap.get('INTERVIEW_SCHEDULED') || 0,
      offered: statusMap.get('OFFERED') || 0,
      hired: hiredCount,
      rejected: statusMap.get('REJECTED') || 0,
      withdrawn: statusMap.get('WITHDRAWN') || 0,
    };
    funnel.viewed += funnel.shortlisted + funnel.interviewScheduled + funnel.offered + funnel.hired;
    funnel.shortlisted += funnel.interviewScheduled + funnel.offered + funnel.hired;
    funnel.interviewScheduled += funnel.offered + funnel.hired;
    funnel.offered += funnel.hired;

    // --- Status distribution ---
    const statusDistribution = statusCounts.map((sc) => ({
      status: sc.status,
      count: sc._count.id,
    }));

    // --- Source distribution ---
    const sourceDistribution = sourceCounts.map((sc) => ({
      source: sc.source || 'DIRECT',
      count: sc._count.id,
    }));

    // --- Top skills in demand ---
    const skillFrequency = new Map<string, number>();
    for (const job of jobPosts) {
      for (const skill of job.skillsRequired) {
        skillFrequency.set(skill, (skillFrequency.get(skill) || 0) + 1);
      }
    }
    const topSkillsInDemand = Array.from(skillFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([skill, count]) => ({ skill, count }));

    // --- Salary competitiveness ---
    const employerSalaries = jobPosts.filter(
      (j) => j.salaryMin !== null && j.salaryMin !== undefined
    );
    const yourAvg = {
      min:
        employerSalaries.length > 0
          ? Math.round(
              employerSalaries.reduce((s, j) => s + Number(j.salaryMin!), 0) /
                employerSalaries.length
            )
          : 0,
      max:
        employerSalaries.length > 0
          ? Math.round(
              employerSalaries.reduce((s, j) => s + Number(j.salaryMax || j.salaryMin!), 0) /
                employerSalaries.length
            )
          : 0,
    };

    // --- Job performance (top 10 by applications) ---
    // Build from jobPosts _count + per-job hired
    const jobAppsByJob = await prisma.jobApplication.groupBy({
      by: ['jobId'],
      where: { job: { companyId }, status: 'HIRED' },
      _count: { id: true },
    });
    const hiredByJob = new Map<string, number>();
    for (const row of jobAppsByJob) {
      hiredByJob.set(row.jobId, row._count.id);
    }

    const jobPerformance = jobPosts
      .map((job) => {
        const apps = job._count.applications;
        const jobHired = hiredByJob.get(job.id) || 0;
        return {
          jobId: job.id,
          title: job.title,
          views: job.views,
          applications: apps,
          hiredCount: jobHired,
          conversionRate: apps > 0 ? parseFloat(((jobHired / apps) * 100).toFixed(1)) : 0,
        };
      })
      .sort((a, b) => b.applications - a.applications)
      .slice(0, 10);

    // --- Recent activity ---
    const recentActivity = recentApps.map((app) => ({
      candidateName:
        `${app.candidate?.user?.firstName || ''} ${app.candidate?.user?.lastName || ''}`.trim() ||
        'Unknown',
      jobTitle: app.job.title,
      status: app.status,
      date: app.updatedAt.toISOString(),
    }));

    // --- Previous period comparison ---
    const previousPeriodSummary = {
      totalJobsPosted: prevJobsPostedCount,
      totalApplications: prevApplicationsCount,
      profileViews: prevProfileViewsCount,
    };

    // --- Day of week distribution ---
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayCounts = Array(7).fill(0) as number[];
    for (const app of allApplications) {
      dayCounts[new Date(app.appliedAt).getDay()]++;
    }
    const dayOfWeekDistribution = dayNames.map((day, i) => ({ day, count: dayCounts[i] }));

    // --- Response time distribution ---
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

    // --- Source effectiveness ---
    const INTERVIEW_STATUSES = new Set(['INTERVIEW_SCHEDULED', 'OFFERED', 'HIRED']);
    const OFFER_STATUSES = new Set(['OFFERED', 'HIRED']);
    const sourceStats = new Map<
      string,
      { total: number; interviews: number; offers: number; hires: number }
    >();
    for (const app of allApplications) {
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

    // --- Location distribution ---
    const locationMap = new Map<string, number>();
    for (const job of jobPosts) {
      const loc = job.location || 'Remote';
      const appCount = job._count.applications;
      locationMap.set(loc, (locationMap.get(loc) || 0) + appCount);
    }
    const locationDistribution = Array.from(locationMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([location, count]) => ({ location, count }));

    // --- Time-to-hire distribution ---
    const tthBuckets: Record<string, number> = {
      '< 1 Week': 0,
      '1-2 Weeks': 0,
      '2-4 Weeks': 0,
      '1-2 Months': 0,
      '2-3 Months': 0,
      '3+ Months': 0,
    };
    for (const app of hiredApplications) {
      const days = (app.hiredAt!.getTime() - app.appliedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (days < 7) tthBuckets['< 1 Week']++;
      else if (days <= 14) tthBuckets['1-2 Weeks']++;
      else if (days <= 28) tthBuckets['2-4 Weeks']++;
      else if (days <= 60) tthBuckets['1-2 Months']++;
      else if (days <= 90) tthBuckets['2-3 Months']++;
      else tthBuckets['3+ Months']++;
    }
    const timeToHireDistribution = Object.entries(tthBuckets).map(([bucket, count]) => ({
      bucket,
      count,
    }));

    return {
      summary: {
        totalJobsPosted,
        activeJobs,
        totalApplications,
        avgTimeToHireDays,
        overallHireRate,
        profileViews: profileViewsCount,
        savedCandidates: savedCandidatesCount,
        hiringVelocity,
      },
      previousPeriodSummary,
      funnel,
      trends: await buildTrends(companyId, userId, groupBy, dateFilter),
      statusDistribution,
      sourceDistribution,
      topSkillsInDemand,
      salaryCompetitiveness: {
        yourAvg,
        platformAvg: {
          min: Math.round(Number(platformSalaryAvg._avg.salaryMin || 0)),
          max: Math.round(Number(platformSalaryAvg._avg.salaryMax || 0)),
        },
      },
      jobPerformance,
      recentActivity,
      dayOfWeekDistribution,
      responseTimeDistribution,
      sourceEffectiveness,
      locationDistribution,
      timeToHireDistribution,
    };
  },

  async exportAnalyticsCsv(userId: string, filters: AnalyticsFilters = {}): Promise<string> {
    const analytics = await this.getAnalytics(userId, filters);
    const rows: string[] = [];

    rows.push('Section,Metric,Value');
    rows.push(`Summary,Total Jobs Posted,${analytics.summary.totalJobsPosted}`);
    rows.push(`Summary,Active Jobs,${analytics.summary.activeJobs}`);
    rows.push(`Summary,Total Applications,${analytics.summary.totalApplications}`);
    rows.push(`Summary,Avg Time to Hire (days),${analytics.summary.avgTimeToHireDays ?? 'N/A'}`);
    rows.push(`Summary,Hire Rate,${analytics.summary.overallHireRate}%`);
    rows.push(`Summary,Profile Views,${analytics.summary.profileViews}`);
    rows.push(`Summary,Saved Candidates,${analytics.summary.savedCandidates}`);
    rows.push(`Summary,Hiring Velocity,${analytics.summary.hiringVelocity}/month`);
    rows.push('');

    rows.push('Status,Count');
    for (const s of analytics.statusDistribution) {
      rows.push(`${s.status},${s.count}`);
    }
    rows.push('');

    rows.push('Source,Count');
    for (const s of analytics.sourceDistribution) {
      rows.push(`${s.source},${s.count}`);
    }
    rows.push('');

    rows.push('Period,Applications,Profile Views,Jobs Posted');
    for (const t of analytics.trends) {
      rows.push(`${t.period},${t.applications},${t.profileViews},${t.jobsPosted}`);
    }
    rows.push('');

    rows.push('Skill,Demand Count');
    for (const s of analytics.topSkillsInDemand) {
      rows.push(`"${s.skill}",${s.count}`);
    }
    rows.push('');

    rows.push('Job Title,Views,Applications,Hired,Conversion Rate');
    for (const j of analytics.jobPerformance) {
      rows.push(`"${j.title}",${j.views},${j.applications},${j.hiredCount},${j.conversionRate}%`);
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
    rows.push('');

    // Time-to-hire distribution
    rows.push('Time to Hire,Count');
    for (const t of analytics.timeToHireDistribution) {
      rows.push(`"${t.bucket}",${t.count}`);
    }

    return rows.join('\n');
  },
};

async function buildTrends(
  companyId: string,
  userId: string,
  groupBy: string,
  dateFilter: { gte?: Date; lte?: Date }
): Promise<
  Array<{ period: string; applications: number; profileViews: number; jobsPosted: number }>
> {
  try {
    const appliedAtFilter = Object.keys(dateFilter).length > 0 ? { appliedAt: dateFilter } : {};
    const createdAtFilter = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

    const [apps, views, jobs] = await Promise.all([
      prisma.jobApplication.findMany({
        where: { job: { companyId }, ...appliedAtFilter },
        select: { appliedAt: true },
        orderBy: { appliedAt: 'asc' },
      }),
      prisma.profileView.findMany({
        where: { profileUserId: userId, ...createdAtFilter },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.jobPost.findMany({
        where: { companyId, ...createdAtFilter },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const appsByPeriod = new Map<string, number>();
    const viewsByPeriod = new Map<string, number>();
    const jobsByPeriod = new Map<string, number>();

    for (const app of apps) {
      const key = formatPeriod(app.appliedAt, groupBy);
      appsByPeriod.set(key, (appsByPeriod.get(key) || 0) + 1);
    }
    for (const view of views) {
      const key = formatPeriod(view.createdAt, groupBy);
      viewsByPeriod.set(key, (viewsByPeriod.get(key) || 0) + 1);
    }
    for (const job of jobs) {
      const key = formatPeriod(job.createdAt, groupBy);
      jobsByPeriod.set(key, (jobsByPeriod.get(key) || 0) + 1);
    }

    const allPeriods = new Set([
      ...appsByPeriod.keys(),
      ...viewsByPeriod.keys(),
      ...jobsByPeriod.keys(),
    ]);
    const sorted = Array.from(allPeriods).sort();

    return sorted.map((period) => ({
      period,
      applications: appsByPeriod.get(period) || 0,
      profileViews: viewsByPeriod.get(period) || 0,
      jobsPosted: jobsByPeriod.get(period) || 0,
    }));
  } catch {
    logger.debug('Failed to build employer analytics trends');
    return [];
  }
}

function formatPeriod(date: Date, groupBy: string): string {
  const d = new Date(date);
  if (groupBy === 'day') return d.toISOString().slice(0, 10);
  if (groupBy === 'month') return d.toISOString().slice(0, 7);
  // week: use Monday of that week
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  return `W${monday.toISOString().slice(0, 10)}`;
}
