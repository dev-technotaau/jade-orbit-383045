import type { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import { jobService } from '../services/job.service';
import { superAdminJobsService } from '../services/super-admin-jobs.service';
import { AppError } from '../middleware/error';
import { assertUnmodified } from '../utils/optimistic-lock';

/**
 * Super-admin job controller — post / edit a job on behalf of a company.
 * Plan-gating is bypassed (admin override) inside the service; this layer
 * just wires the validated request to the right service call.
 */

/** GET /super-admin/companies?q= — company picker for the job poster. */
export const listCompanies = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const data = await superAdminJobsService.listCompanies({ q, page, limit });
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};

/** GET /super-admin/jobs/:id — full editable job payload (no view increment). */
export const getJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await superAdminJobsService.getJobForEdit(String(req.params.id));
    res.status(200).json({ status: 'success', data: { job } });
  } catch (error) {
    next(error);
  }
};

/** POST /super-admin/jobs — create a job for `companyId` (admin override). */
export const createJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { companyId, ...jobData } = req.body as { companyId: string } & Record<string, unknown>;
    const result = await jobService.createJobForCompany(
      companyId,
      jobData as unknown as Parameters<typeof jobService.createJobForCompany>[1],
      req.user.id
    );
    res.status(201).json({ status: 'success', data: { job: result.job } });
  } catch (error) {
    next(error);
  }
};

/** PUT /super-admin/jobs/:id — edit any job (no ownership scope). */
export const updateJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);

    const jobId = String(req.params.id);
    const { expectedUpdatedAt, ...payload } = req.body as Record<string, unknown> & {
      expectedUpdatedAt?: string;
    };

    // ── Optimistic concurrency ──
    // Two admins can legitimately have this job open at once; the soft lock
    // discourages it but cannot prevent it (expired locks, a second tab, a
    // script). This is the check that actually protects the data: if the row
    // moved since the client loaded it, refuse with 409 and let the UI show
    // a reload/overwrite choice rather than destroying the other edit.
    const current = await prisma.jobPost.findUnique({
      where: { id: jobId },
      select: { updatedAt: true },
    });
    assertUnmodified(current, expectedUpdatedAt, 'Job');

    const updated = await jobService.updateJobForCompany(jobId, payload, req.user.id);
    res.status(200).json({ status: 'success', data: { job: updated } });
  } catch (error) {
    next(error);
  }
};
