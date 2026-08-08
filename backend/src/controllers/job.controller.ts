import type { Request, Response, NextFunction } from 'express';
import { jobService } from '../services/job.service';
import { AppError } from '../middleware/error';
import type { JobStatus, ApplicationStatus } from '@prisma/client';

/** Convert service result to standard PaginatedData shape */
function toPaginatedData<T>(
  items: T[],
  pagination?: { total: number; page: number; limit: number; pages: number }
) {
  const total = pagination?.total ?? items.length;
  const page = pagination?.page ?? 1;
  const limit = pagination?.limit ?? (items.length || 10);
  const totalPages = pagination?.pages ?? 1;
  return { items, total, page, limit, totalPages, hasMore: page < totalPages };
}

/**
 * Create a new job
 */
export const createJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const result = await jobService.createJob(req.user.id, req.body);

    res.status(201).json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a single job
 */
export const getJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await jobService.getJob(req.params.id as string);

    res.status(200).json({
      status: 'success',
      data: { job },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Search jobs
 */
export const searchJobs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query;
    const filters = {
      keyword: typeof q.keyword === 'string' ? q.keyword : undefined,
      location: typeof q.location === 'string' ? q.location : undefined,
      type: q.type as any,
      industry: typeof q.industry === 'string' ? q.industry : undefined,
      department: typeof q.department === 'string' ? q.department : undefined,
      salaryMin: q.salaryMin ? Number(q.salaryMin) : undefined,
      salaryMax: q.salaryMax ? Number(q.salaryMax) : undefined,
      experience: typeof q.experience === 'string' ? q.experience : undefined,
      experienceLevel:
        typeof q.experienceLevel === 'string' ? (q.experienceLevel as any) : undefined,
      educationRequired:
        typeof q.educationRequired === 'string' ? (q.educationRequired as any) : undefined,
      isRemote: q.isRemote === 'true' ? true : undefined,
      workMode: typeof q.workMode === 'string' ? (q.workMode as any) : undefined,
      shiftType: typeof q.shiftType === 'string' ? (q.shiftType as any) : undefined,
      companyType: typeof q.companyType === 'string' ? q.companyType : undefined,
      companySize: typeof q.companySize === 'string' ? q.companySize : undefined,
      postedAfter: typeof q.postedAfter === 'string' ? q.postedAfter : undefined,
      postedBefore: typeof q.postedBefore === 'string' ? q.postedBefore : undefined,
      tags: typeof q.tags === 'string' ? q.tags.split(',') : undefined,
      urgencyLevel: typeof q.urgencyLevel === 'string' ? (q.urgencyLevel as any) : undefined,
      isFeatured: q.isFeatured === 'true' ? true : undefined,
      isWalkIn: q.isWalkIn === 'true' ? true : undefined,
      sortBy: typeof q.sortBy === 'string' ? (q.sortBy as any) : undefined,
      latitude: q.latitude ? Number(q.latitude) : undefined,
      longitude: q.longitude ? Number(q.longitude) : undefined,
      radiusKm: q.radiusKm ? Number(q.radiusKm) : undefined,
      page: q.page ? Number(q.page) : 1,
      limit: q.limit ? Number(q.limit) : 10,
      // Enterprise filters
      functionalArea: typeof q.functionalArea === 'string' ? (q.functionalArea as any) : undefined,
      noticePeriodPreference:
        typeof q.noticePeriodPreference === 'string'
          ? (q.noticePeriodPreference.split(',') as any)
          : undefined,
      isPwdFriendly: q.isPwdFriendly === 'true' ? true : undefined,
      visaSponsorshipAvailable: q.visaSponsorshipAvailable === 'true' ? true : undefined,
      genderPreference:
        typeof q.genderPreference === 'string' ? (q.genderPreference as any) : undefined,
      diversityTags: typeof q.diversityTags === 'string' ? q.diversityTags.split(',') : undefined,
      postingVisibility:
        typeof q.postingVisibility === 'string' ? (q.postingVisibility as any) : undefined,
    };

    const result = await jobService.searchJobs(filters);

    res.status(200).json({
      status: 'success',
      data: {
        ...toPaginatedData(result.jobs, result.pagination),
        facets: result.facets || {},
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Apply to a job
 */
export const applyToJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const { coverLetter, screeningAnswers } = req.body;
    const jobId = req.params.id as string;

    const application = await jobService.applyToJob(
      req.user.id,
      jobId,
      coverLetter,
      screeningAnswers
    );

    res.status(201).json({
      status: 'success',
      message: 'Application submitted successfully',
      data: { application },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Job Applications (Employer)
 */
export const getJobApplications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const page = req.query.page ? Number(req.query.page) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const status = req.query.status as ApplicationStatus | undefined;
    const data = await jobService.getJobApplications(
      req.user.id,
      req.params.id as string,
      page,
      limit,
      status
    );

    res.status(200).json({
      status: 'success',
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Single Application Detail
 */
export const getApplicationDetail = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const application = await jobService.getApplicationById(
      req.user.id,
      req.params.applicationId as string,
      req.user.role
    );
    res.status(200).json({ status: 'success', data: application });
  } catch (error) {
    next(error);
  }
};

/**
 * Update Application Status (Employer)
 */
/**
 * PATCH /jobs/:id/offline-hires — employer records hires made off-platform.
 * Vacancy fill = HIRED applications + this count, so this is what lets a job
 * filled by a walk-in or referral close correctly.
 */
export const updateOfflineHires = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }
    const { offlineHiresCount } = req.body;
    const updated = await jobService.updateOfflineHires(
      req.user.id,
      req.params.id as string,
      offlineHiresCount
    );
    res.status(200).json({
      status: 'success',
      message: 'Offline hires updated',
      data: { job: updated },
    });
  } catch (error) {
    next(error);
  }
};

export const updateApplicationStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const { status, rejectionReason } = req.body;
    const updated = await jobService.updateApplicationStatus(
      req.user.id,
      req.params.applicationId as string,
      status,
      rejectionReason
    );

    res.status(200).json({
      status: 'success',
      message: 'Application status updated',
      data: { application: updated },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Applied Jobs (Candidate)
 */
export const getAppliedJobs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const page = req.query.page ? Number(req.query.page) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const status = req.query.status as ApplicationStatus | undefined;
    const data = await jobService.getAppliedJobs(req.user.id, page, limit, status);

    res.status(200).json({
      status: 'success',
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Toggle Save Job (Candidate)
 */
export const toggleSaveJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const result = await jobService.toggleSaveJob(req.user.id, req.params.id as string);

    res.status(200).json({
      status: 'success',
      message: result.saved ? 'Job saved' : 'Job removed from saved',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Saved Jobs (Candidate)
 */
export const getSavedJobs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const page = req.query.page ? Number(req.query.page) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const data = await jobService.getSavedJobs(req.user.id, page, limit);

    res.status(200).json({
      status: 'success',
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Withdraw Application (Candidate)
 */
export const withdrawApplication = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const application = await jobService.withdrawApplication(
      req.user.id,
      req.params.applicationId as string
    );
    res
      .status(200)
      .json({ status: 'success', message: 'Application withdrawn', data: { application } });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Employer's Posted Jobs
 */
export const getMyJobs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { status, page, limit } = req.query;
    const result = await jobService.getEmployerJobs(req.user.id, {
      status: status as JobStatus | undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res
      .status(200)
      .json({ status: 'success', data: toPaginatedData(result.jobs, result.pagination) });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a Job Post (Employer)
 */
export const updateJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const job = await jobService.updateJob(req.user.id, req.params.id as string, req.body);
    res.status(200).json({ status: 'success', data: { job } });
  } catch (error) {
    next(error);
  }
};

/**
 * Deactivate a Job Post (Employer)
 */
export const deactivateJob = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const job = await jobService.deactivateJob(req.user.id, req.params.id as string);
    res.status(200).json({ status: 'success', message: 'Job deactivated', data: { job } });
  } catch (error) {
    next(error);
  }
};

/**
 * Clone/Duplicate a Job Post (Employer)
 */
export const cloneJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const job = await jobService.cloneJob(req.user.id, req.params.id as string);
    res.status(201).json({ status: 'success', data: { job } });
  } catch (error) {
    next(error);
  }
};

/**
 * Shortlist a candidate for a job (Employer)
 */
export const shortlistCandidateForJob = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { jobId } = req.body;
    if (!jobId) throw new AppError('jobId is required', 400);
    const application = await jobService.shortlistCandidateForJob(
      req.user.id,
      req.params.candidateId as string,
      jobId
    );
    res
      .status(200)
      .json({ status: 'success', message: 'Candidate shortlisted', data: { application } });
  } catch (error) {
    next(error);
  }
};

/**
 * Select a candidate for a job (Employer)
 */
export const selectCandidateForJob = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { jobId } = req.body;
    if (!jobId) throw new AppError('jobId is required', 400);
    const application = await jobService.selectCandidateForJob(
      req.user.id,
      req.params.candidateId as string,
      jobId
    );
    res
      .status(200)
      .json({ status: 'success', message: 'Candidate selected', data: { application } });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all applications across employer's jobs (Employer)
 */
export const getAllEmployerApplications = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const q = req.query;
    const result = await jobService.getAllEmployerApplications(req.user.id, {
      status: typeof q.status === 'string' ? (q.status as ApplicationStatus) : undefined,
      jobId: typeof q.jobId === 'string' ? q.jobId : undefined,
      candidateId: typeof q.candidateId === 'string' ? q.candidateId : undefined,
      search: typeof q.search === 'string' ? q.search : undefined,
      sortBy:
        typeof q.sortBy === 'string' && ['newest', 'oldest', 'matchScore'].includes(q.sortBy)
          ? (q.sortBy as 'newest' | 'oldest' | 'matchScore')
          : undefined,
      page: q.page ? Number(q.page) : undefined,
      limit: q.limit ? Number(q.limit) : undefined,
    });
    res
      .status(200)
      .json({ status: 'success', data: toPaginatedData(result.applications, result.pagination) });
  } catch (error) {
    next(error);
  }
};
