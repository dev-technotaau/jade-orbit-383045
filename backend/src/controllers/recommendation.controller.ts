import type { Request, Response, NextFunction } from 'express';
import { talentMatchingService } from '../services/talent-matching.service';
import { AppError } from '../middleware/error';
import prisma from '../config/prisma';

/**
 * GET /api/v1/recommendations/jobs
 * AI-recommended jobs for the authenticated candidate.
 * Supports pagination, filters, and excludes dismissed recommendations.
 */
export const getRecommendedJobs = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);

    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 20;

    const profile = await prisma.candidateProfile.findUnique({
      where: { userId: req.user.id },
      select: {
        skills: true,
        currentRole: true,
        currentLocation: true,
        experienceYears: true,
        preferredWorkMode: true,
        preferredIndustries: true,
        preferredJobType: true,
        experienceLevel: true,
        highestEducationLevel: true,
        noticePeriod: true,
        expectedSalaryMin: true,
        expectedSalaryMax: true,
      },
    });

    if (!profile) {
      res.status(200).json({
        status: 'success',
        data: { items: [], total: 0, page, limit, totalPages: 0, hasMore: false },
      });
      return;
    }

    // Get dismissed job IDs for this user
    const dismissed = await prisma.dismissedRecommendation.findMany({
      where: { userId: req.user.id },
      select: { jobId: true },
    });
    const dismissedIds = new Set(dismissed.map((d) => d.jobId));

    const recommendations = await talentMatchingService.getAIRecommendedJobs({
      ...profile,
      expectedSalaryMin: profile.expectedSalaryMin ? Number(profile.expectedSalaryMin) : null,
      expectedSalaryMax: profile.expectedSalaryMax ? Number(profile.expectedSalaryMax) : null,
    });

    if (recommendations.length === 0) {
      res.status(200).json({
        status: 'success',
        data: { items: [], total: 0, page, limit, totalPages: 0, hasMore: false },
      });
      return;
    }

    // Filter out dismissed and fetch full job details
    const filteredRecs = recommendations.filter((r) => !dismissedIds.has(r.jobId));
    const jobIds = filteredRecs.map((r) => r.jobId);

    // Build Prisma where clause with optional filters
    const whereClause: Record<string, unknown> = { id: { in: jobIds }, status: 'OPEN' };
    if (req.query.workMode && typeof req.query.workMode === 'string') {
      whereClause.workMode = req.query.workMode;
    }
    if (req.query.type && typeof req.query.type === 'string') whereClause.type = req.query.type;
    if (req.query.experienceLevel && typeof req.query.experienceLevel === 'string') {
      whereClause.experienceLevel = req.query.experienceLevel;
    }

    const jobs = await prisma.jobPost.findMany({
      where: whereClause,
      include: { company: { select: { companyName: true, logo: true } } },
    });

    const jobsWithScores = jobs.map((job) => ({
      ...job,
      matchScore: filteredRecs.find((r) => r.jobId === job.id)?.matchScore || 0,
    }));

    jobsWithScores.sort((a, b) => b.matchScore - a.matchScore);

    // Paginate
    const total = jobsWithScores.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const paginatedJobs = jobsWithScores.slice(start, start + limit);

    res.status(200).json({
      status: 'success',
      data: {
        items: paginatedJobs,
        total,
        page,
        limit,
        totalPages,
        hasMore: page < totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/recommendations/jobs/:jobId/dismiss
 * Dismiss a job recommendation for the authenticated candidate.
 */
export const dismissRecommendation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);

    const jobId = req.params.jobId as string;

    // Verify job exists
    const job = await prisma.jobPost.findUnique({ where: { id: jobId }, select: { id: true } });
    if (!job) throw new AppError('Job not found', 404, 'JOB_NOT_FOUND');

    await prisma.dismissedRecommendation.upsert({
      where: { userId_jobId: { userId: req.user.id, jobId } },
      create: { userId: req.user.id, jobId },
      update: {},
    });

    res.status(200).json({ status: 'success', message: 'Recommendation dismissed' });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/recommendations/candidates/:jobId
 * AI-recommended candidates for a specific job (employer view).
 */
export const getRecommendedCandidates = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);

    const jobId = req.params.jobId as string;

    const job = await prisma.jobPost.findFirst({
      where: { id: jobId, company: { userId: req.user.id } },
      select: {
        title: true,
        skillsRequired: true,
        location: true,
        experienceMin: true,
        experienceMax: true,
        industry: true,
        workMode: true,
        experienceLevel: true,
        educationRequired: true,
        type: true,
      },
    });

    if (!job) {
      throw new AppError('Job not found', 404, 'JOB_NOT_FOUND');
    }

    const recommendations = await talentMatchingService.getAIRecommendedCandidates({
      title: job.title,
      skills: job.skillsRequired,
      location: job.location,
      experienceMin: job.experienceMin,
      experienceMax: job.experienceMax,
      industry: job.industry,
      workMode: job.workMode,
      experienceLevel: job.experienceLevel,
      educationRequired: job.educationRequired,
      type: job.type,
    });

    if (recommendations.length === 0) {
      res.status(200).json({ status: 'success', data: [] });
      return;
    }

    // Fetch full candidate profiles for the recommended IDs
    const candidateIds = recommendations.map((r) => r.candidateId);
    const scoreMap = new Map(recommendations.map((r) => [r.candidateId, r.matchScore]));

    const candidates = await prisma.candidateProfile.findMany({
      where: { id: { in: candidateIds } },
      select: {
        id: true,
        userId: true,
        headline: true,
        currentRole: true,
        currentCompany: true,
        experienceYears: true,
        skills: true,
        currentLocation: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });

    const enriched = candidates.map((c) => ({
      id: c.id,
      userId: c.userId,
      headline: c.headline,
      currentRole: c.currentRole,
      currentCompany: c.currentCompany,
      experienceYears: c.experienceYears,
      skills: c.skills,
      currentLocation: c.currentLocation,
      matchScore: scoreMap.get(c.id) || 0,
      user: c.user ? { firstName: c.user.firstName, lastName: c.user.lastName } : undefined,
    }));

    enriched.sort((a, b) => b.matchScore - a.matchScore);

    res.status(200).json({
      status: 'success',
      data: enriched,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/recommendations/candidates
 * AI-recommended candidates for employer based on their recent open jobs.
 */
export const getRecommendedCandidatesForEmployer = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);

    const limit = Math.min(Number(req.query.limit) || 10, 20);

    // Get employer's company
    const company = await prisma.companyProfile.findUnique({
      where: { userId: req.user.id },
      select: { id: true, industry: true },
    });

    if (!company) {
      res.status(200).json({ status: 'success', data: [] });
      return;
    }

    // Get recent open jobs
    const recentJobs = await prisma.jobPost.findMany({
      where: { companyId: company.id, status: 'OPEN' },
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        skillsRequired: true,
        location: true,
        workMode: true,
        type: true,
      },
    });

    if (recentJobs.length === 0) {
      res.status(200).json({ status: 'success', data: [] });
      return;
    }

    // Aggregate skills from all recent jobs
    const allSkills = recentJobs.flatMap((j) => (j.skillsRequired as string[]) || []);
    const aggregatedSkills = [...new Set(allSkills)];

    // Get most common location and work mode
    const locationCounts = new Map<string, number>();
    const workModeCounts = new Map<string, number>();

    for (const job of recentJobs) {
      if (job.location) {
        locationCounts.set(job.location, (locationCounts.get(job.location) || 0) + 1);
      }
      if (job.workMode) {
        workModeCounts.set(job.workMode, (workModeCounts.get(job.workMode) || 0) + 1);
      }
    }

    const mostCommonLocation =
      locationCounts.size > 0
        ? [...locationCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
        : null;
    const mostCommonWorkMode =
      workModeCounts.size > 0
        ? [...workModeCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
        : null;

    const recommendations = await talentMatchingService.getAIRecommendedCandidates({
      title: 'Aggregated from recent jobs',
      skills: aggregatedSkills,
      location: mostCommonLocation,
      industry: company.industry,
      workMode: mostCommonWorkMode as any,
    });

    if (recommendations.length === 0) {
      res.status(200).json({ status: 'success', data: [] });
      return;
    }

    // Fetch full candidate profiles
    const candidateIds = recommendations.slice(0, limit).map((r) => r.candidateId);
    const scoreMap = new Map(recommendations.map((r) => [r.candidateId, r.matchScore]));

    const candidates = await prisma.candidateProfile.findMany({
      where: { id: { in: candidateIds } },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatar: true,
            lastActiveAt: true,
          },
        },
      },
    });

    const enriched = candidates.map((c) => ({
      ...c,
      matchScore: scoreMap.get(c.id) || 0,
    }));

    enriched.sort((a, b) => b.matchScore - a.matchScore);

    res.status(200).json({
      status: 'success',
      data: enriched,
    });
  } catch (error) {
    next(error);
  }
};
