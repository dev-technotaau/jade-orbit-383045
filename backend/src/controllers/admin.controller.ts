import type { Request, Response, NextFunction } from 'express';
import { adminService } from '../services/admin.service';
import { moderationService } from '../services/moderation.service';
import { Role } from '@prisma/client';
import { AppError } from '../middleware/error';
import { assertPermission, hasPermission } from '../middleware/require-permission';
import { schedulerQueue } from '../jobs/scheduler.queue';
import prisma from '../config/prisma';
import { getOnlineCount } from '../utils/online-users';
import { getTrendingJobs, getTrendingSearches } from '../utils/trending';

/**
 * Get Dashboard Stats
 */
export const getDashboardStats = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await adminService.getDashboardStats();
    res.status(200).json({
      status: 'success',
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Recent Activity
 */
export const getRecentActivity = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const activity = await adminService.getRecentActivity();
    res.status(200).json({
      status: 'success',
      data: activity,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Users
 */
export const getUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const role = req.query.role as Role | undefined;

    // Parse filters
    const filters: any = {};

    // Search filter
    if (req.query.search) {
      filters.search = req.query.search as string;
    }

    // Status filter
    if (req.query.status) {
      filters.status = req.query.status as 'active' | 'suspended' | 'inactive';
    }

    // Profile completeness filter
    if (req.query.profileCompletenessMin || req.query.profileCompletenessMax) {
      filters.profileCompleteness = {};
      if (req.query.profileCompletenessMin) {
        filters.profileCompleteness.min = Number(req.query.profileCompletenessMin);
      }
      if (req.query.profileCompletenessMax) {
        filters.profileCompleteness.max = Number(req.query.profileCompletenessMax);
      }
    }

    // Last active filter
    if (req.query.lastActive) {
      filters.lastActive = req.query.lastActive as 'week' | 'month' | 'quarter' | 'inactive';
    }

    // Verification filters
    if (req.query.verified) {
      const verifiedArray = Array.isArray(req.query.verified)
        ? req.query.verified
        : [req.query.verified];
      filters.verified = verifiedArray as ('email' | 'mobile' | 'whatsapp')[];
    }

    // Employer account type / hiring type filters
    if (req.query.accountType) {
      filters.accountType = req.query.accountType as 'COMPANY' | 'INDIVIDUAL';
    }
    if (req.query.hiringType) {
      filters.hiringType = req.query.hiringType as 'DIRECT' | 'CONSULTANCY';
    }

    // ── Subject narrowing ──
    // The route admits either subject's view permission; here we resolve
    // which ones the caller actually holds and hand the service an explicit
    // allow-list. This is what makes "grant candidates but not employers"
    // real in the list view rather than only in the registry.
    // Super-admins pass both checks, so they see everything.
    const canCandidates = await hasPermission(req, 'users.candidates.account.view');
    const canEmployers = await hasPermission(req, 'users.employers.account.view');

    if (!canCandidates && !canEmployers) {
      throw new AppError('You do not have permission to view users.', 403, 'PERMISSION_DENIED');
    }

    const allowedRoles: Role[] = [
      ...(canCandidates ? [Role.CANDIDATE] : []),
      ...(canEmployers ? [Role.EMPLOYER] : []),
    ];

    // Asking for a subject you cannot see is an explicit 403 rather than a
    // silently-empty list, so a mis-scoped UI surfaces as an error instead
    // of looking like "no users exist".
    if (role && !allowedRoles.includes(role)) {
      throw new AppError(
        'You do not have permission to view users of that type.',
        403,
        'PERMISSION_DENIED'
      );
    }

    const result = await adminService.getUsers(
      role,
      page,
      limit,
      Object.keys(filters).length > 0 ? filters : undefined,
      allowedRoles
    );

    res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete User
 */
export const deleteUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    await adminService.deleteUser(req.params.id as string, req.user.id);

    res.status(200).json({
      status: 'success',
      message: 'User deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Moderate Job (Update Status)
 */
export const moderateJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body;

    // Per-action permission. The route gate is `jobs.moderation.approve`;
    // without this branch it also covered rejection, leaving
    // `jobs.moderation.reject` as a registry node that enforced nothing.
    // Approving a post and killing one are different trust decisions, which
    // is why the registry separates them.
    if (status === 'REJECTED' || status === 'CLOSED') {
      await assertPermission(req, 'jobs.moderation.reject');
    }

    const job = await adminService.updateJobStatus(req.params.id as string, status);

    res.status(200).json({
      status: 'success',
      message: 'Job status updated',
      data: { job },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Suspend User
 */
export const suspendUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { reason } = req.body;
    await adminService.suspendUser(req.params.id as string, req.user.id, reason);
    res.status(200).json({ status: 'success', message: 'User suspended' });
  } catch (error) {
    next(error);
  }
};

/**
 * Activate User
 */
export const activateUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    await adminService.activateUser(req.params.id as string, req.user.id);
    res.status(200).json({ status: 'success', message: 'User activated' });
  } catch (error) {
    next(error);
  }
};

/**
 * Update User Role
 */
export const updateUserRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { role } = req.body;
    await adminService.updateUserRole(req.params.id as string, role, req.user.id);
    res.status(200).json({ status: 'success', message: 'User role updated' });
  } catch (error) {
    next(error);
  }
};

/**
 * Get User Details
 */
export const getUserDetails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // The attached profiles are separate registry keys from the account
    // record — `account.view` says "you may look this person up", not "you
    // may read their CV" or "you may read the company's private contact
    // line". Resolve that scope before the read so only permitted columns
    // are ever selected. Super-admins pass `undefined` = full payload.
    const scope =
      req.user?.role === Role.SUPER_ADMIN
        ? undefined
        : {
            candidateProfile: await hasPermission(req, 'users.candidates.profile.view'),
            companyProfile: await hasPermission(req, 'users.employers.company.view'),
            companyContact: await hasPermission(req, 'users.employers.company.contact'),
          };

    const user = await adminService.getUserDetails(req.params.id as string, scope);

    // `requireSubjectPermission` on the route already resolved the subject
    // from the target's role, so this is a belt-and-braces re-check for the
    // callers that reach this handler through a different route (the
    // super-admin router mounts the same controller).
    await assertPermission(
      req,
      (user as { role?: Role }).role === Role.EMPLOYER
        ? 'users.employers.account.view'
        : 'users.candidates.account.view'
    );

    res.status(200).json({ status: 'success', data: user });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Detailed Analytics
 */
export const getDetailedAnalytics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const period = (req.query.period as 'week' | 'month' | 'quarter') || 'month';
    const analytics = await adminService.getDetailedAnalytics(period);
    res.status(200).json({ status: 'success', data: analytics });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Audit Logs
 */
export const getAuditLogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      action: req.query.action as string | undefined,
      entity: req.query.entity as string | undefined,
      performedBy: req.query.performedBy as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      requesterRole: req.user?.role,
    };

    // ── Two ways in ──
    // `platform.audit_logs.view` opens the whole trail. The narrower
    // `users.{candidates,employers}.activity.audit` opens ONE account's
    // entries — that is the "Activity" tab on a user detail page, which
    // calls this same endpoint with `performedBy` pinned. Without this the
    // per-subject keys enforced nothing (nothing named them) and the tab
    // demanded platform-wide audit access to show a single user's history.
    if (
      req.user?.role !== Role.SUPER_ADMIN &&
      !(await hasPermission(req, 'platform.audit_logs.view'))
    ) {
      if (!filters.performedBy) {
        // Unfiltered read of the whole trail — platform key only.
        await assertPermission(req, 'platform.audit_logs.view');
      }
      const subject = await prisma.user.findUnique({
        where: { id: filters.performedBy! },
        select: { role: true },
      });
      // An admin's or super-admin's own trail is never delegable — that is
      // admin oversight, which lives in the super-admin control centre.
      if (!subject || subject.role === Role.ADMIN || subject.role === Role.SUPER_ADMIN) {
        await assertPermission(req, 'platform.audit_logs.view');
      } else {
        await assertPermission(
          req,
          subject.role === Role.EMPLOYER
            ? 'users.employers.activity.audit'
            : 'users.candidates.activity.audit'
        );
      }
    }

    const result = await adminService.getAuditLogs(filters);
    res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Comprehensive Stats
 */
export const getComprehensiveStats = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await adminService.getComprehensiveStats();
    res.status(200).json({ status: 'success', data: stats });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Daily Active Users
 */
export const getDailyActiveUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const days = req.query.days ? Math.min(parseInt(req.query.days as string, 10), 90) : 30;
    const data = await adminService.getDailyActiveUsers(days);
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};

/**
 * Get All Jobs (Admin)
 */
export const getAllJobs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      keyword: req.query.keyword as string | undefined,
      status: req.query.status as string | undefined,
      companyId: req.query.companyId as string | undefined,
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    };
    const result = await adminService.getAllJobs(filters);
    res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete Job (Admin)
 */
export const deleteJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    await adminService.deleteJob(req.params.id as string, req.user.id);
    res.status(200).json({ status: 'success', message: 'Job deleted successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * Flag Job
 */
export const flagJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { reason } = req.body;
    await adminService.flagJob(req.params.id as string, reason, req.user.id);
    res.status(200).json({ status: 'success', message: 'Job flagged' });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Moderation Keywords
 */
export const getModerationKeywords = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const keywords = moderationService.getBlockedKeywords();
    res.status(200).json({ status: 'success', data: keywords });
  } catch (error) {
    next(error);
  }
};

/**
 * Add Moderation Keyword
 */
export const addModerationKeyword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { keyword } = req.body;
    if (!keyword || typeof keyword !== 'string') throw new AppError('Keyword is required', 400);
    moderationService.addKeyword(keyword);
    res.status(200).json({ status: 'success', message: 'Keyword added' });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove Moderation Keyword
 */
export const removeModerationKeyword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { keyword } = req.params;
    if (!keyword) throw new AppError('Keyword is required', 400);
    moderationService.removeKeyword(decodeURIComponent(keyword as string));
    res.status(200).json({ status: 'success', message: 'Keyword removed' });
  } catch (error) {
    next(error);
  }
};

/**
 * Get All Applications (Admin)
 */
export const getApplications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      keyword: req.query.keyword as string | undefined,
      status: req.query.status as string | undefined,
      jobId: req.query.jobId as string | undefined,
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    };
    const result = await adminService.getApplications(filters);
    res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Application Stats (Admin)
 */
export const getApplicationStats = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await adminService.getApplicationStats();
    res.status(200).json({ status: 'success', data: stats });
  } catch (error) {
    next(error);
  }
};

// ── Export Job Monitoring ──

/**
 * List export jobs (active, waiting, completed, failed)
 */
export const getExportJobs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = (req.query.status as string) || 'active';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const start = (page - 1) * limit;
    const end = start + limit - 1;

    let jobs;
    switch (status) {
      case 'active':
        jobs = await schedulerQueue.getActive(start, end);
        break;
      case 'waiting':
        jobs = await schedulerQueue.getWaiting(start, end);
        break;
      case 'completed':
        jobs = await schedulerQueue.getCompleted(start, end);
        break;
      case 'failed':
        jobs = await schedulerQueue.getFailed(start, end);
        break;
      default:
        throw new AppError('Invalid status. Use: active, waiting, completed, failed', 400);
    }

    // Filter to export-data jobs only and enrich with user info
    const exportJobs = jobs.filter((j) => j.name === 'export-data');

    const userIds = [...new Set(exportJobs.map((j) => j.data?.userId).filter(Boolean))];
    const users =
      userIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true, email: true, role: true },
          })
        : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const items = exportJobs.map((j) => {
      const user = userMap.get(j.data?.userId);
      return {
        jobId: j.id,
        exportType: j.data?.exportType,
        format: j.data?.format,
        candidateCount: j.data?.candidateIds?.length || 0,
        userId: j.data?.userId,
        userName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : null,
        userEmail: user?.email,
        userRole: user?.role,
        status,
        createdAt: j.timestamp ? new Date(j.timestamp).toISOString() : null,
        processedAt: j.processedOn ? new Date(j.processedOn).toISOString() : null,
        finishedAt: j.finishedOn ? new Date(j.finishedOn).toISOString() : null,
        failedReason: j.failedReason || null,
        attempts: j.attemptsMade,
      };
    });

    const counts = await schedulerQueue.getJobCounts('active', 'waiting', 'completed', 'failed');

    res.status(200).json({
      status: 'success',
      data: { items, counts, page, limit },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cancel/remove a specific export job
 */
export const cancelExportJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const jobId = req.params.jobId as string;
    if (!jobId) throw new AppError('Job ID is required', 400);

    const job = await schedulerQueue.getJob(jobId);
    if (!job || job.name !== 'export-data') {
      throw new AppError('Export job not found', 404);
    }

    const state = await job.getState();

    if (state === 'active') {
      // Move to failed state so the worker stops processing
      await job.moveToFailed(new Error('Cancelled by admin'), job.token || '0');
    } else if (state === 'waiting' || state === 'delayed') {
      await job.remove();
    } else {
      throw new AppError(`Cannot cancel job in "${state}" state`, 400);
    }

    res.status(200).json({
      status: 'success',
      message: `Export job ${jobId} ${state === 'active' ? 'stopped' : 'removed'}`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get user's applications
 */
export const getUserApplications = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const result = await adminService.getUserApplications(userId, page, limit);
    res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * Get user's jobs
 */
export const getUserJobs = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const result = await adminService.getUserJobs(userId, page, limit);
    res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * Get user's verifications
 */
export const getUserVerifications = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const result = await adminService.getUserVerifications(userId, page, limit);
    res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * Update verification status
 */
export const updateVerificationStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const verificationId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { status, reason } = req.body;

    // Same per-subject, per-action resolution as
    // `verificationController.reviewVerification`. This is the SECOND route
    // that reviews a verification (the super-admin one), and it was still
    // OR-gated: an admin scoped to candidates could approve a company's GST
    // request through it, and `verifications.*.reject` enforced nothing.
    const target = await prisma.verificationRequest.findUnique({
      where: { id: verificationId as string },
      select: { user: { select: { role: true } } },
    });
    if (target) {
      const subject = target.user.role === Role.EMPLOYER ? 'employer' : 'candidate';
      const action = status === 'REJECTED' ? 'reject' : 'approve';
      await assertPermission(req, `verifications.${subject}.${action}`);
    }

    await adminService.updateVerificationStatus(verificationId, status, req.user.id, reason);
    res.status(200).json({ status: 'success', message: 'Verification updated' });
  } catch (error) {
    next(error);
  }
};

/**
 * Update candidate profile (admin edit)
 */
export const updateCandidateProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await adminService.updateCandidateProfile(userId, req.body, req.user.id);
    res.status(200).json({ status: 'success', message: 'Candidate profile updated' });
  } catch (error) {
    next(error);
  }
};

/**
 * Update company profile (admin edit)
 */
export const updateCompanyProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await adminService.updateCompanyProfile(userId, req.body, req.user.id);
    res.status(200).json({ status: 'success', message: 'Company profile updated' });
  } catch (error) {
    next(error);
  }
};

/**
 * Bulk export users
 */
export const bulkExportUsers = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { userIds, format } = req.body;
    const result = await adminService.bulkExportUsers(userIds, req.user.id, format, req.user.role);
    res.status(200).json({
      status: 'success',
      data: result,
      message: 'Export queued. You will receive an email.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Bulk notify users
 */
export const bulkNotifyUsers = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { userIds, notification } = req.body;
    const result = await adminService.bulkNotifyUsers(
      userIds,
      req.user.id,
      notification,
      req.user.role
    );
    res.status(200).json({
      status: 'success',
      data: result,
      message: `Notifications sent to ${result.count} users`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Bulk suspend users
 */
export const bulkSuspendUsers = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { userIds, reason } = req.body;
    const result = await adminService.bulkSuspendUsers(userIds, req.user.id, reason, req.user.role);
    res
      .status(200)
      .json({ status: 'success', data: result, message: `${result.count} users suspended` });
  } catch (error) {
    next(error);
  }
};

/**
 * Bulk activate users
 */
export const bulkActivateUsers = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { userIds } = req.body;
    const result = await adminService.bulkActivateUsers(userIds, req.user.id, req.user.role);
    res
      .status(200)
      .json({ status: 'success', data: result, message: `${result.count} users activated` });
  } catch (error) {
    next(error);
  }
};

/**
 * Get online user stats
 */
export const getOnlineStats = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const count = await getOnlineCount();
    res.status(200).json({ status: 'success', data: { onlineUsers: count } });
  } catch (error) {
    next(error);
  }
};

/**
 * Get trending jobs and searches
 */
export const getTrending = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const [trendingJobs, trendingSearches] = await Promise.all([
      getTrendingJobs(limit),
      getTrendingSearches(limit),
    ]);

    // Enrich trending jobs with basic info
    const jobIds = trendingJobs.map((t) => t.jobId);
    const jobs =
      jobIds.length > 0
        ? await prisma.jobPost.findMany({
            where: { id: { in: jobIds } },
            select: {
              id: true,
              title: true,
              location: true,
              company: { select: { companyName: true, logo: true } },
            },
          })
        : [];
    const jobMap = new Map(jobs.map((j) => [j.id, j]));

    const enrichedJobs = trendingJobs
      .map((t) => {
        const job = jobMap.get(t.jobId);
        if (!job) return null;
        return { ...job, viewCount: t.score };
      })
      .filter(Boolean);

    res.status(200).json({
      status: 'success',
      data: { trendingJobs: enrichedJobs, trendingSearches },
    });
  } catch (error) {
    next(error);
  }
};
