import type { Request, Response, NextFunction } from 'express';
import { employerService } from '../services/employer.service';
import { candidateService } from '../services/candidate.service';
import { AppError } from '../middleware/error';

// ... (existing imports)

/**
 * Search Candidates
 */
export const searchCandidates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const q = req.query;
    const filters = {
      keyword: typeof q.keyword === 'string' ? q.keyword : undefined,
      keywordScope: typeof q.keywordScope === 'string' ? (q.keywordScope as any) : undefined,
      excludeKeywords:
        typeof q.excludeKeywords === 'string'
          ? q.excludeKeywords
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
      location: typeof q.location === 'string' ? q.location : undefined,
      excludeLocation:
        typeof q.excludeLocation === 'string'
          ? q.excludeLocation
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
      experienceMin: q.experienceMin ? Number(q.experienceMin) : undefined,
      experienceMax: q.experienceMax ? Number(q.experienceMax) : undefined,
      // Operator-aware skills (`,` AND, `|` OR, `!` NOT) — backwards
      // compatible with bare comma-separated lists (legacy URLs still work).
      ...(typeof q.skills === 'string'
        ? (() => {
            const { parseMultiValue, hasOperatorChars } =
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              require('../lib/operator-parser') as {
                parseMultiValue: (s: string) => {
                  must: string[];
                  should: string[];
                  mustNot: string[];
                  op: 'AND' | 'OR';
                };
                hasOperatorChars: (s: string) => boolean;
              };
            if (!hasOperatorChars(q.skills)) {
              return {
                skills: q.skills
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              };
            }
            const parsed = parseMultiValue(q.skills);
            return { skillsBool: parsed };
          })()
        : {}),
      salaryMin: q.salaryMin ? Number(q.salaryMin) : undefined,
      salaryMax: q.salaryMax ? Number(q.salaryMax) : undefined,
      salaryCurrency: typeof q.salaryCurrency === 'string' ? q.salaryCurrency : undefined,
      includeSalaryNotDisclosed:
        q.includeSalaryNotDisclosed === 'true'
          ? true
          : q.includeSalaryNotDisclosed === 'false'
            ? false
            : undefined,
      workStatus: typeof q.workStatus === 'string' ? (q.workStatus as any) : undefined,
      noticePeriod: typeof q.noticePeriod === 'string' ? (q.noticePeriod as any) : undefined,
      servingNoticePeriod:
        q.servingNoticePeriod === 'true'
          ? true
          : q.servingNoticePeriod === 'false'
            ? false
            : undefined,
      gender: typeof q.gender === 'string' ? (q.gender as any) : undefined,
      willingToRelocate:
        q.willingToRelocate === 'true' ? true : q.willingToRelocate === 'false' ? false : undefined,
      preferredWorkMode:
        typeof q.preferredWorkMode === 'string' ? (q.preferredWorkMode as any) : undefined,
      preferredJobType:
        typeof q.preferredJobType === 'string' ? (q.preferredJobType as any) : undefined,
      lastActiveWithin: typeof q.lastActiveWithin === 'string' ? q.lastActiveWithin : undefined,
      currentIndustry: typeof q.currentIndustry === 'string' ? q.currentIndustry : undefined,
      currentCompany: typeof q.currentCompany === 'string' ? q.currentCompany : undefined,
      excludeCompany:
        typeof q.excludeCompany === 'string'
          ? q.excludeCompany
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
      designation: typeof q.designation === 'string' ? q.designation : undefined,
      department: typeof q.department === 'string' ? q.department : undefined,
      ageMin: q.ageMin ? Number(q.ageMin) : undefined,
      ageMax: q.ageMax ? Number(q.ageMax) : undefined,
      hasCareerBreak:
        q.hasCareerBreak === 'true' ? true : q.hasCareerBreak === 'false' ? false : undefined,
      hasResume: q.hasResume === 'true' ? true : q.hasResume === 'false' ? false : undefined,
      verifiedMobile:
        q.verifiedMobile === 'true' ? true : q.verifiedMobile === 'false' ? false : undefined,
      verifiedEmail:
        q.verifiedEmail === 'true' ? true : q.verifiedEmail === 'false' ? false : undefined,
      registeredAfter: typeof q.registeredAfter === 'string' ? q.registeredAfter : undefined,
      modifiedAfter: typeof q.modifiedAfter === 'string' ? q.modifiedAfter : undefined,
      education: typeof q.education === 'string' ? q.education : undefined,
      certifications: typeof q.certifications === 'string' ? q.certifications : undefined,
      disabilityType: typeof q.disabilityType === 'string' ? (q.disabilityType as any) : undefined,
      openToWork: typeof q.openToWork === 'string' ? (q.openToWork as any) : undefined,
      category: typeof q.category === 'string' ? (q.category as any) : undefined,
      isVeteran: q.isVeteran === 'true' ? 'true' : undefined,
      careerBreakType:
        typeof q.careerBreakType === 'string' ? (q.careerBreakType as any) : undefined,
      keywordOperator:
        typeof q.keywordOperator === 'string' ? (q.keywordOperator as any) : undefined,
      itSkill: typeof q.itSkill === 'string' ? q.itSkill : undefined,
      workPermit: typeof q.workPermit === 'string' ? q.workPermit : undefined,
      educationLevel: typeof q.educationLevel === 'string' ? q.educationLevel : undefined,
      experienceLevel: typeof q.experienceLevel === 'string' ? q.experienceLevel : undefined,
      highestEducationLevel:
        typeof q.highestEducationLevel === 'string' ? q.highestEducationLevel : undefined,
      drivingLicenseType:
        typeof q.drivingLicenseType === 'string' ? q.drivingLicenseType : undefined,
      functionalArea: typeof q.functionalArea === 'string' ? q.functionalArea : undefined,
      latitude: q.latitude ? Number(q.latitude) : undefined,
      longitude: q.longitude ? Number(q.longitude) : undefined,
      radiusKm: q.radiusKm ? Number(q.radiusKm) : undefined,
      page: q.page ? Number(q.page) : 1,
      limit: q.limit ? Number(q.limit) : 20,
      sortBy: typeof q.sortBy === 'string' ? (q.sortBy as any) : undefined,
    };

    const result = await candidateService.searchCandidates(
      filters.keyword || '',
      filters,
      req.user.id,
      req.user.role
    );

    const total = result.pagination?.total ?? result.candidates.length;
    const pg = result.pagination ?? { total, page: 1, limit: total || 20, pages: 1 };

    res.status(200).json({
      status: 'success',
      data: {
        items: result.candidates,
        total: pg.total,
        page: pg.page,
        limit: pg.limit,
        totalPages: pg.pages,
        hasMore: pg.page < pg.pages,
        facets: result.facets || {},
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current employer's company profile
 */
export const getMyCompany = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const profile = await employerService.getProfile(req.user.id);

    res.status(200).json({
      status: 'success',
      data: profile,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get public company profile by company ID (no auth required)
 */
export const getPublicCompany = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const profile = await employerService.getPublicProfile(id);

    res.status(200).json({
      status: 'success',
      data: profile,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update company profile
 */
export const updateMyCompany = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const profile = await employerService.updateProfile(req.user.id, req.body);

    res.status(200).json({
      status: 'success',
      data: profile,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Upload Company Logo
 */
export const uploadLogo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    if (!req.file) {
      throw new AppError('No file uploaded', 400);
    }

    const profile = await employerService.uploadLogo(req.user.id, req.file);

    res.status(200).json({
      status: 'success',
      message: 'Company logo uploaded successfully',
      data: {
        logo: profile.logo,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove Company Logo
 */
export const removeLogo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    await employerService.removeLogo(req.user.id);

    res.status(200).json({
      status: 'success',
      message: 'Company logo removed successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Upload Cover Image
 */
export const uploadCoverImage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    if (!req.file) {
      throw new AppError('Cover image file required', 400);
    }

    const coverImage = await employerService.uploadCoverImage(req.user.id, req.file);

    res.status(200).json({
      status: 'success',
      message: 'Cover image uploaded successfully',
      data: { coverImage },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove Cover Image
 */
export const removeCoverImage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    await employerService.removeCoverImage(req.user.id);

    res.status(200).json({
      status: 'success',
      message: 'Cover image removed successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Profile Views (who viewed my company profile)
 */
export const getProfileViews = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { profileViewService } = await import('../services/profile-view.service');
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const result = await profileViewService.getProfileViews(req.user.id, page, limit);
    res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Engagement Metrics
 */
export const getEngagementMetrics = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const data = await employerService.getEngagementMetrics(req.user.id);
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Employer Dashboard Analytics
 */
export const getDashboard = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const analytics = await employerService.getDashboardAnalytics(req.user.id);
    res.status(200).json({ status: 'success', data: analytics });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Employer Analytics (detailed, with date filtering)
 */
export const getAnalytics = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { startDate, endDate, groupBy } = req.query as Record<string, string>;
    const { employerAnalyticsService } = await import('../services/employer-analytics.service');
    const data = await employerAnalyticsService.getAnalytics(req.user.id, {
      startDate,
      endDate,
      groupBy: groupBy as 'day' | 'week' | 'month',
    });
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};

/**
 * Export Employer Analytics as CSV
 */
export const exportAnalytics = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { startDate, endDate } = req.query as Record<string, string>;
    const { employerAnalyticsService } = await import('../services/employer-analytics.service');
    const csv = await employerAnalyticsService.exportAnalyticsCsv(req.user.id, {
      startDate,
      endDate,
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="employer-analytics.csv"');
    res.send(csv);
  } catch (error) {
    next(error);
  }
};

/**
 * Get Company Profile Completeness
 */
export const getProfileCompleteness = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const completeness = await employerService.getProfileCompleteness(req.user.id);
    res.status(200).json({ status: 'success', data: completeness });
  } catch (error) {
    next(error);
  }
};

/**
 * Bulk Export Candidates (CSV/Excel)
 */
export const bulkExportCandidates = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);

    const { candidateIds, format = 'xlsx' } = req.body;

    if (!candidateIds || !Array.isArray(candidateIds) || candidateIds.length === 0) {
      throw new AppError('candidateIds array is required', 400, 'INVALID_INPUT');
    }

    if (candidateIds.length > 1000) {
      throw new AppError('Maximum 1000 candidates per export', 400, 'LIMIT_EXCEEDED');
    }

    if (!['csv', 'xlsx'].includes(format)) {
      throw new AppError('Format must be csv or xlsx', 400, 'INVALID_FORMAT');
    }

    // Queue the export job
    const { addDataExportJob } = await import('../jobs/data-export.queue');
    const job = await addDataExportJob({
      userId: req.user.id,
      exportType: 'CANDIDATE_EXPORT',
      format,
      candidateIds,
      requesterRole: req.user.role,
    });

    res.status(202).json({
      status: 'success',
      message: 'Export queued successfully. You will receive an email when ready.',
      data: { jobId: job.id },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Bulk Export Resumes as ZIP
 */
export const bulkExportResumes = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);

    const { candidateIds } = req.body;

    if (!candidateIds || !Array.isArray(candidateIds) || candidateIds.length === 0) {
      throw new AppError('candidateIds array is required', 400, 'INVALID_INPUT');
    }

    if (candidateIds.length > 100) {
      throw new AppError('Maximum 100 candidates per resume export', 400, 'LIMIT_EXCEEDED');
    }

    // Resume access follows the CONTACT PAYWALL — resumes embed the
    // candidate's phone/email, so each candidate must be an applicant of
    // this employer, unlocked via CV_UNLOCK, or covered by an
    // unlimited-unlock plan. (The old check also accepted free saves, and
    // its saved lookup compared employerId against the company id while
    // saves store the user id — a dead branch.)
    const { getContactVisibilitySet } = await import('../services/cv-unlock.service');
    const { all, visible } = await getContactVisibilitySet(req.user.id, candidateIds);
    const unauthorizedIds = all ? [] : candidateIds.filter((id: string) => !visible.has(id));
    if (unauthorizedIds.length > 0) {
      throw new AppError(
        `Unlock ${unauthorizedIds.length} candidate(s) before exporting their resumes — resumes contain contact details.`,
        403,
        'UNAUTHORIZED_CANDIDATES'
      );
    }

    // Queue the resume export job
    const { addDataExportJob } = await import('../jobs/data-export.queue');
    const job = await addDataExportJob({
      userId: req.user.id,
      exportType: 'RESUME_EXPORT',
      candidateIds,
    });

    res.status(202).json({
      status: 'success',
      message: 'Resume export queued. You will receive an email with a download link when ready.',
      data: { jobId: job.id },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get match score between a candidate and job (13-dimension scoring)
 */
export const getCandidateMatchScore = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);

    const candidateId = req.params.candidateId as string;
    const jobId = req.params.jobId as string;

    if (!candidateId || !jobId) {
      throw new AppError('candidateId and jobId are required', 400, 'INVALID_INPUT');
    }

    const { matchingService } = await import('../services/matching.service');
    const matchScore = await matchingService.calculateCandidateJobMatchScore(candidateId, jobId);

    res.json({
      status: 'success',
      data: matchScore,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get similar candidates using Elasticsearch More Like This
 */
export const getSimilarCandidates = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);

    const { candidateId } = req.params;
    const limit = Math.min(Number(req.query.limit) || 5, 10);

    if (!candidateId) {
      throw new AppError('candidateId is required', 400, 'INVALID_INPUT');
    }

    const elasticClient = (await import('../config/elasticsearch')).default;
    const { ELASTIC_INDICES } = await import('../constants');

    const result = await (elasticClient.search as any)({
      index: ELASTIC_INDICES.CANDIDATES,
      size: limit,
      query: {
        more_like_this: {
          fields: [
            'skills',
            'currentRole',
            'headline',
            'currentIndustry',
            'currentLocation',
            'currentCompany',
          ],
          like: [
            {
              _index: ELASTIC_INDICES.CANDIDATES,
              _id: candidateId,
            },
          ],
          min_term_freq: 1,
          max_query_terms: 25,
          min_doc_freq: 1,
        },
      },
    });

    const candidates = result.hits.hits.map((hit: any) => hit._source);

    res.json({
      status: 'success',
      data: candidates,
    });
  } catch (error) {
    next(error);
  }
};
