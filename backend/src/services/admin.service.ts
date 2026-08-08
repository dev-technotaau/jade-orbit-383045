import { prisma } from '../config/prisma';
import { Role, JobStatus, VerificationStatus } from '@prisma/client';
import { AppError } from '../middleware/error';
import {} from '../kafka/producer';
import { publishEvent } from '../kafka/producer';
import { KafkaTopics } from '../kafka/topics';

const VALID_AUDIT_ACTIONS = new Set([
  'PASSWORD_CHANGE',
  'REQUEST_ACCOUNT_DELETION',
  'DELETE_USER',
  'SUSPEND_USER',
  'ACTIVATE_USER',
  'UPDATE_USER_ROLE',
  'CREATE_USER',
  'UPDATE_USER_PROFILE',
  'SEND_PASSWORD_RESET_OTP',
  'ADMIN_RESET_PASSWORD',
  'DEACTIVATE_USER',
  'UPLOAD_USER_AVATAR',
  'REMOVE_USER_AVATAR',
  'REVOKE_USER_SESSIONS',
  'PROFILE_UPDATE',
  'RESUME_UPLOAD',
  'JOB_CREATE',
  'JOB_UPDATE',
  'JOB_CLOSE',
  'DELETE_JOB',
  'MODERATE_JOB',
  'FLAG_JOB',
  'APPLICATION_SHORTLIST',
  'APPLICATION_SELECT',
  'VERIFICATION_APPROVE',
  'VERIFICATION_REJECT',
  'VERIFICATION_REQUEST_CHANGES',
  'VERIFICATION_ESCALATE',
  'VERIFICATION_LEVEL_APPROVE',
  'EMPLOYMENT_VERIFICATION_CONTACT',
  'TICKET_ASSIGN',
  'TICKET_STATUS_CHANGE',
]);

const VALID_AUDIT_ENTITIES = new Set([
  'User',
  'CandidateProfile',
  'CompanyProfile',
  'JobPost',
  'JobApplication',
  'Verification',
  'SupportTicket',
]);

export class AdminService {
  /**
   * Get High-Level Dashboard Stats
   */
  async getDashboardStats() {
    const [
      totalCandidates,
      totalEmployers,
      totalJobs,
      activeJobs,
      totalApplications,
      pendingVerifications,
    ] = await prisma.$transaction([
      prisma.user.count({ where: { role: Role.CANDIDATE } }),
      prisma.user.count({ where: { role: Role.EMPLOYER } }),
      prisma.jobPost.count(),
      prisma.jobPost.count({ where: { status: JobStatus.OPEN } }),
      prisma.jobApplication.count(),
      prisma.verificationRequest.count({ where: { status: VerificationStatus.PENDING } }),
    ]);

    return {
      users: {
        candidates: totalCandidates,
        employers: totalEmployers,
        total: totalCandidates + totalEmployers, // excludes admins roughly
      },
      jobs: {
        total: totalJobs,
        active: activeJobs,
        closed: totalJobs - activeJobs, // simple approx
      },
      applications: {
        total: totalApplications,
      },
      verifications: {
        pending: pendingVerifications,
      },
    };
  }

  /**
   * Get Recent Activity
   */
  async getRecentActivity() {
    const [recentUsers, recentJobs, recentApplications] = await prisma.$transaction([
      prisma.user.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, role: true, createdAt: true, firstName: true },
      }),
      prisma.jobPost.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          company: { select: { companyName: true } },
          createdAt: true,
        },
      }),
      prisma.jobApplication.findMany({
        take: 5,
        orderBy: { appliedAt: 'desc' },
        select: {
          id: true,
          status: true,
          job: { select: { title: true } },
          candidate: { select: { user: { select: { email: true } } } },
        },
      }),
    ]);

    return {
      users: recentUsers,
      jobs: recentJobs,
      applications: recentApplications,
    };
  }

  /**
   * Get All Users (Admin)
   */
  async getUsers(
    role?: Role,
    page = 1,
    limit = 10,
    filters?: {
      search?: string;
      status?: 'active' | 'suspended' | 'inactive';
      profileCompleteness?: { min?: number; max?: number };
      lastActive?: 'week' | 'month' | 'quarter' | 'inactive';
      verified?: ('email' | 'mobile' | 'whatsapp')[];
      accountType?: 'COMPANY' | 'INDIVIDUAL';
      hiringType?: 'DIRECT' | 'CONSULTANCY';
    },
    /**
     * The subjects the CALLER is permitted to see, derived from their
     * `users.candidates.account.view` / `users.employers.account.view`
     * grants. This is what makes "grant candidates but not employers"
     * actually mean something in the list — without it, a candidates-only
     * admin sees every employer row.
     *
     * Omitted for super-admins, who see both.
     */
    allowedRoles?: Role[]
  ) {
    const skip = (page - 1) * limit;

    // Admin and super-admin accounts are never listed here — they are
    // managed exclusively from Manage Admins.
    const visibleRoles: Role[] = (allowedRoles ?? [Role.CANDIDATE, Role.EMPLOYER]).filter(
      (r) => r !== Role.ADMIN && r !== Role.SUPER_ADMIN
    );

    const where: any = { role: { in: visibleRoles } };

    // A `role` query param may only NARROW the permitted set. Previously
    // this assigned `where.role = role` unconditionally, which OVERWROTE
    // the exclusion above — so `?role=ADMIN` enumerated every admin account.
    if (role && visibleRoles.includes(role)) {
      where.role = role;
    }

    // Search by name or email
    if (filters?.search) {
      where.OR = [
        { email: { contains: filters.search, mode: 'insensitive' } },
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    // Status filter
    if (filters?.status === 'active') {
      where.isActive = true;
      where.isSuspended = false;
    } else if (filters?.status === 'suspended') {
      where.isSuspended = true;
    } else if (filters?.status === 'inactive') {
      where.isActive = false;
    }

    // Email/Mobile/WhatsApp verification filters
    if (filters?.verified?.includes('email')) where.isEmailVerified = true;
    if (filters?.verified?.includes('mobile')) where.isMobileVerified = true;
    if (filters?.verified?.includes('whatsapp')) where.isWhatsappVerified = true;

    // Last active filter
    if (filters?.lastActive) {
      const now = new Date();
      const cutoffDays =
        filters.lastActive === 'week'
          ? 7
          : filters.lastActive === 'month'
            ? 30
            : filters.lastActive === 'quarter'
              ? 90
              : 0;

      if (cutoffDays > 0) {
        where.lastActiveAt = { gte: new Date(now.getTime() - cutoffDays * 24 * 60 * 60 * 1000) };
      } else if (filters.lastActive === 'inactive') {
        // Avoid overwriting search's OR clause
        const inactiveCondition = [
          { lastActiveAt: null },
          { lastActiveAt: { lt: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) } },
        ];
        if (where.OR) {
          where.AND = [{ OR: where.OR }, { OR: inactiveCondition }];
          delete where.OR;
        } else {
          where.OR = inactiveCondition;
        }
      }
    }

    // Profile completeness filter (only for candidates)
    if (filters?.profileCompleteness && (role === Role.CANDIDATE || !role)) {
      const { min, max } = filters.profileCompleteness;
      const completenessWhere: any = {};
      if (min !== undefined) completenessWhere.gte = min;
      if (max !== undefined) completenessWhere.lte = max;
      where.candidateProfile = { profileCompleteness: completenessWhere };
    }

    // Employer account type / hiring type filters
    if (filters?.accountType || filters?.hiringType) {
      const companyWhere: any = {};
      if (filters.accountType) companyWhere.accountType = filters.accountType;
      if (filters.hiringType) companyWhere.hiringType = filters.hiringType;
      where.companyProfile = { ...where.companyProfile, ...companyWhere };
    }

    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          role: true,
          firstName: true,
          lastName: true,
          isActive: true,
          isSuspended: true,
          mfaEnabled: true,
          isEmailVerified: true,
          isMobileVerified: true,
          isWhatsappVerified: true,
          lastLoginAt: true,
          lastActiveAt: true,
          createdAt: true,
          candidateProfile: {
            select: { profileCompleteness: true },
          },
          companyProfile: {
            select: { id: true, accountType: true, hiringType: true },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;
    return { items: users, total, page, limit, totalPages, hasMore: page < totalPages };
  }

  /**
   * Delete User (Admin)
   */
  async deleteUser(userId: string, requestingAdminId: string) {
    if (userId === requestingAdminId) {
      throw new AppError('Cannot delete your own account', 400);
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);
    if (user.role === Role.SUPER_ADMIN) {
      throw new AppError('Cannot delete a super admin', 403);
    }
    await prisma.user.delete({ where: { id: userId } });
  }

  /**
   * Moderate Job (Admin)
   */
  async updateJobStatus(jobId: string, status: JobStatus) {
    const result = await prisma.jobPost.update({
      where: { id: jobId },
      data: { status },
    });

    // Publish Kafka event for admin-moderated jobs (closed/draft)
    if (status === JobStatus.CLOSED || status === JobStatus.DRAFT) {
      publishEvent(KafkaTopics.ADMIN_JOB_REJECTED, jobId, {
        jobId,
        status,
      }).catch(() => {});
    }

    return result;
  }

  /**
   * Suspend User
   */
  async suspendUser(userId: string, adminId: string, reason?: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);
    if (user.role === Role.SUPER_ADMIN) throw new AppError('Cannot suspend a super admin', 403);
    if (user.id === adminId) throw new AppError('Cannot suspend yourself', 400);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { isSuspended: true, suspendedAt: new Date(), suspendedBy: adminId },
      }),
      prisma.auditLog.create({
        data: {
          action: 'SUSPEND_USER',
          entity: 'User',
          entityId: userId,
          performedBy: adminId,
          details: reason ? { reason } : undefined,
        },
      }),
    ]);

    // Notify the suspended user
    void import('./notification.service')
      .then(({ notificationService }) => {
        return notificationService.notifyUserSuspended(userId);
      })
      .catch(() => {});

    // Publish Kafka event
    publishEvent(KafkaTopics.ADMIN_USER_SUSPENDED, userId, {
      userId,
      suspendedBy: adminId,
      reason,
    }).catch(() => {});
  }

  /**
   * Activate User
   */
  async activateUser(userId: string, adminId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);
    // Matches the guard its `deleteUser` and `suspendUser` siblings already
    // carry. Without it, un-suspending a super-admin was reachable here
    // even though suspending one is refused.
    if (user.role === Role.SUPER_ADMIN) throw new AppError('Cannot modify a super admin', 403);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { isSuspended: false, isActive: true, suspendedAt: null, suspendedBy: null },
      }),
      prisma.auditLog.create({
        data: { action: 'ACTIVATE_USER', entity: 'User', entityId: userId, performedBy: adminId },
      }),
    ]);

    // Notify the reactivated user
    void import('./notification.service')
      .then(({ notificationService }) => {
        return notificationService.notifyUserActivated(userId);
      })
      .catch(() => {});
  }

  /**
   * Update User Role
   */
  async updateUserRole(userId: string, newRole: Role, adminId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);
    if (user.role === Role.SUPER_ADMIN) throw new AppError('Cannot change super admin role', 403);

    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (admin?.role !== Role.SUPER_ADMIN && newRole === Role.ADMIN) {
      throw new AppError('Only super admin can promote to admin', 403);
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { role: newRole } }),
      prisma.auditLog.create({
        data: {
          action: 'UPDATE_USER_ROLE',
          entity: 'User',
          entityId: userId,
          performedBy: adminId,
          details: { oldRole: user.role, newRole },
        },
      }),
    ]);

    // Publish Kafka event
    publishEvent(KafkaTopics.ADMIN_ROLE_CHANGED, userId, {
      userId,
      oldRole: user.role,
      newRole,
      changedBy: adminId,
    }).catch(() => {});
  }

  /**
   * Get User Details
   *
   * `scope` narrows the attached profile to what the caller may actually
   * see. `/users/:id` is gated on `account.view` — "the account record" —
   * but returned the full candidate profile (CV, salary history, notice
   * period) and the full company record (private contact email and phone)
   * alongside it. Those are separate registry keys precisely because a
   * help-desk admin resolving a sign-in problem has no business reading
   * either; passing `scope` is what finally makes them mean something.
   *
   * Omitted `scope` (the super-admin path) keeps the full payload.
   */
  async getUserDetails(
    userId: string,
    scope?: { candidateProfile: boolean; companyProfile: boolean; companyContact: boolean }
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        avatar: true,
        isEmailVerified: true,
        isMobileVerified: true,
        isWhatsappVerified: true,
        isActive: true,
        isSuspended: true,
        suspendedAt: true,
        mobileNumber: true,
        mfaEnabled: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
        lastLoginIp: true,
        lastActiveAt: true,
        loginAttempts: true,
        lockUntil: true,
        candidateProfile: true,
        companyProfile: true,
        _count: { select: { savedJobs: true, verificationRequests: true, sessions: true } },
      },
    });
    if (!user) throw new AppError('User not found', 404);
    if (!scope) return user;

    // Drop rather than blank the whole profile so the client can tell
    // "no profile on this account" (null) from "you may not read it"
    // (absent + the redaction flags below).
    const { candidateProfile, companyProfile, ...rest } = user;
    return {
      ...rest,
      candidateProfile: scope.candidateProfile ? candidateProfile : undefined,
      candidateProfileRedacted: !scope.candidateProfile && candidateProfile != null,
      companyProfile: scope.companyProfile
        ? scope.companyContact
          ? companyProfile
          : companyProfile && {
              ...companyProfile,
              contactEmail: null,
              contactPhone: null,
              contactPersonName: null,
              contactPersonDesignation: null,
              contactRedacted: true,
            }
        : undefined,
      companyProfileRedacted: !scope.companyProfile && companyProfile != null,
    };
  }

  /**
   * Get Detailed Analytics
   */
  async getDetailedAnalytics(period: 'week' | 'month' | 'quarter') {
    const now = new Date();
    let startDate: Date;
    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'quarter':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
    }

    const [
      newRegistrations,
      activeUsers,
      newJobs,
      totalApplications,
      applicationsByStatus,
      candidateProfiles,
    ] = await prisma.$transaction([
      prisma.user.count({ where: { createdAt: { gte: startDate } } }),
      prisma.user.count({ where: { lastLoginAt: { gte: startDate } } }),
      prisma.jobPost.count({ where: { createdAt: { gte: startDate } } }),
      prisma.jobApplication.count({ where: { appliedAt: { gte: startDate } } }),
      prisma.jobApplication.groupBy({ by: ['status'], orderBy: { status: 'asc' }, _count: true }),
      prisma.candidateProfile.findMany({
        select: { skills: true, currentLocation: true },
        take: 1000,
      }),
    ]);

    // Aggregate top skills
    const skillCounts: Record<string, number> = {};
    const locationCounts: Record<string, number> = {};
    candidateProfiles.forEach((p) => {
      p.skills.forEach((s) => {
        skillCounts[s] = (skillCounts[s] || 0) + 1;
      });
      if (p.currentLocation) {
        locationCounts[p.currentLocation] = (locationCounts[p.currentLocation] || 0) + 1;
      }
    });

    const topSkills = Object.entries(skillCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([skill, count]) => ({ skill, count }));
    const topLocations = Object.entries(locationCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([location, count]) => ({ location, count }));

    return {
      period,
      startDate: startDate.toISOString(),
      endDate: now.toISOString(),
      newRegistrations,
      activeUsers,
      newJobs,
      totalApplications,
      applicationsByStatus: Object.fromEntries(
        applicationsByStatus.map((s) => [s.status, s._count])
      ),
      topSkills,
      topLocations,
    };
  }

  /**
   * Get Audit Logs
   */
  async getAuditLogs(filters: {
    action?: string;
    entity?: string;
    performedBy?: string;
    page?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
    requesterRole?: Role;
  }) {
    const page = filters.page || 1;
    const cappedLimit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * cappedLimit;
    const where: any = {};

    // WhatsApp audit rows describe customer-communication actions and are only
    // for SUPER_ADMIN (the sole role that can access the WhatsApp data itself).
    // Hide WA_* actions and Wa* entities from lower-privileged ADMIN auditors so
    // the audit viewer can't be used as a side-channel into WhatsApp activity.
    if (filters.requesterRole !== Role.SUPER_ADMIN) {
      where.NOT = [{ action: { startsWith: 'WA_' } }, { entity: { startsWith: 'Wa' } }];
    }

    if (filters.action) {
      if (!VALID_AUDIT_ACTIONS.has(filters.action)) {
        throw new AppError('Invalid audit action filter', 400, 'INVALID_AUDIT_ACTION');
      }
      where.action = filters.action;
    }
    if (filters.entity) {
      if (!VALID_AUDIT_ENTITIES.has(filters.entity)) {
        throw new AppError('Invalid audit entity filter', 400, 'INVALID_AUDIT_ENTITY');
      }
      where.entity = filters.entity;
    }
    if (filters.performedBy) where.performedBy = filters.performedBy;
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
    }

    const [logs, total] = await prisma.$transaction([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { email: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: cappedLimit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    const totalPages = Math.ceil(total / cappedLimit) || 1;
    return { items: logs, total, page, limit: cappedLimit, totalPages, hasMore: page < totalPages };
  }

  /**
   * Get Comprehensive Platform Statistics
   */
  async getComprehensiveStats() {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      totalCandidates,
      totalEmployers,
      totalAdmins,
      newUsersWeek,
      newUsersMonth,
      totalJobs,
      activeJobs,
      expiredJobs,
      newJobsWeek,
      newJobsMonth,
      totalApplications,
      appsWeek,
      verificationsPending,
      verificationsApproved,
      verificationsRejected,
      activeUsersWeek,
      candidateProfiles,
    ] = await prisma.$transaction([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'CANDIDATE' } }),
      prisma.user.count({ where: { role: 'EMPLOYER' } }),
      prisma.user.count({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } } }),
      prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.user.count({ where: { createdAt: { gte: monthAgo } } }),
      prisma.jobPost.count(),
      prisma.jobPost.count({ where: { status: 'OPEN' } }),
      prisma.jobPost.count({ where: { status: 'EXPIRED' } }),
      prisma.jobPost.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.jobPost.count({ where: { createdAt: { gte: monthAgo } } }),
      prisma.jobApplication.count(),
      prisma.jobApplication.count({ where: { appliedAt: { gte: weekAgo } } }),
      prisma.verificationRequest.count({ where: { status: 'PENDING' } }),
      prisma.verificationRequest.count({ where: { status: 'APPROVED' } }),
      prisma.verificationRequest.count({ where: { status: 'REJECTED' } }),
      prisma.user.count({ where: { lastActiveAt: { gte: weekAgo } } }),
      prisma.candidateProfile.findMany({
        select: { skills: true, currentLocation: true },
        take: 1000,
      }),
    ]);

    // Aggregate top skills and top locations
    const skillCounts: Record<string, number> = {};
    const locationCounts: Record<string, number> = {};
    candidateProfiles.forEach((p) => {
      p.skills.forEach((s) => {
        skillCounts[s] = (skillCounts[s] || 0) + 1;
      });
      if (p.currentLocation) {
        locationCounts[p.currentLocation] = (locationCounts[p.currentLocation] || 0) + 1;
      }
    });
    const topSkills = Object.entries(skillCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([skill, count]) => ({ skill, count }));
    const topLocations = Object.entries(locationCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([location, count]) => ({ location, count }));

    // Registration trends (daily for last 30 days)
    const registrationTrends: { date: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      registrationTrends.push({ date: dayStart.toISOString().split('T')[0], count: 0 });
    }
    const recentUsers = await prisma.user.findMany({
      where: { createdAt: { gte: monthAgo } },
      select: { createdAt: true },
    });
    recentUsers.forEach((u) => {
      const dateKey = u.createdAt.toISOString().split('T')[0];
      const entry = registrationTrends.find((t) => t.date === dateKey);
      if (entry) entry.count++;
    });

    return {
      users: {
        total: totalUsers,
        candidates: totalCandidates,
        employers: totalEmployers,
        admins: totalAdmins,
        newThisWeek: newUsersWeek,
        newThisMonth: newUsersMonth,
        activeThisWeek: activeUsersWeek,
      },
      jobs: {
        total: totalJobs,
        active: activeJobs,
        expired: expiredJobs,
        newThisWeek: newJobsWeek,
        newThisMonth: newJobsMonth,
      },
      applications: {
        total: totalApplications,
        thisWeek: appsWeek,
        conversionRate: totalJobs > 0 ? +(totalApplications / totalJobs).toFixed(2) : 0,
      },
      verifications: {
        pending: verificationsPending,
        approved: verificationsApproved,
        rejected: verificationsRejected,
      },
      topSkills,
      topLocations,
      registrationTrends,
    };
  }

  /**
   * Get Daily Active Users Breakdown
   */
  async getDailyActiveUsers(days: number = 30) {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1);
    const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const activeUsers = await prisma.user.findMany({
      where: { lastActiveAt: { gte: startDate, lt: endDate } },
      select: { lastActiveAt: true, role: true },
    });

    const results: { date: string; total: number; candidates: number; employers: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const dateStr = dayStart.toISOString().split('T')[0];

      let total = 0,
        candidates = 0,
        employers = 0;
      for (const u of activeUsers) {
        if (u.lastActiveAt && u.lastActiveAt >= dayStart && u.lastActiveAt < dayEnd) {
          total++;
          if (u.role === 'CANDIDATE') candidates++;
          else if (u.role === 'EMPLOYER') employers++;
        }
      }
      results.push({ date: dateStr, total, candidates, employers });
    }

    return results;
  }

  /**
   * Get All Jobs (Admin) - Server-side filtering
   */
  async getAllJobs(filters: {
    keyword?: string;
    status?: string;
    companyId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const skip = (page - 1) * limit;
    const where: any = {};

    if (filters.keyword) {
      where.OR = [
        { title: { contains: filters.keyword, mode: 'insensitive' } },
        { company: { companyName: { contains: filters.keyword, mode: 'insensitive' } } },
      ];
    }
    if (filters.status) where.status = filters.status;
    if (filters.companyId) where.companyId = filters.companyId;
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
    }

    const [jobs, total] = await prisma.$transaction([
      prisma.jobPost.findMany({
        where,
        include: {
          company: { select: { id: true, companyName: true, logo: true, isVerified: true } },
          _count: { select: { applications: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.jobPost.count({ where }),
    ]);

    return {
      items: jobs.map((j) => ({
        ...j,
        _applicationCount: j._count.applications,
        _count: undefined,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      hasMore: page < (Math.ceil(total / limit) || 1),
    };
  }

  /**
   * Delete Job (Admin)
   */
  async deleteJob(jobId: string, adminId: string) {
    const job = await prisma.jobPost.findUnique({ where: { id: jobId } });
    if (!job) throw new AppError('Job not found', 404);

    await prisma.$transaction([
      prisma.jobPost.delete({ where: { id: jobId } }),
      prisma.auditLog.create({
        data: {
          action: 'DELETE_JOB',
          entity: 'JobPost',
          entityId: jobId,
          performedBy: adminId,
          details: { title: job.title },
        },
      }),
    ]);

    // Clean up ES index (fire-and-forget)
    const { searchService } = await import('./search.service');
    searchService.deleteJob(jobId).catch(() => {});
  }

  /**
   * Flag Job
   */
  async flagJob(jobId: string, reason: string, adminId: string) {
    const job = await prisma.jobPost.findUnique({ where: { id: jobId } });
    if (!job) throw new AppError('Job not found', 404);

    await prisma.$transaction([
      prisma.jobPost.update({ where: { id: jobId }, data: { status: JobStatus.DRAFT } }),
      prisma.auditLog.create({
        data: {
          action: 'FLAG_JOB',
          entity: 'JobPost',
          entityId: jobId,
          performedBy: adminId,
          details: { reason },
        },
      }),
    ]);
  }

  /**
   * Get All Applications (Admin) - Server-side filtering
   */
  async getApplications(filters: {
    keyword?: string;
    status?: string;
    jobId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const skip = (page - 1) * limit;
    const where: any = {};

    if (filters.status) where.status = filters.status;
    if (filters.jobId) where.jobId = filters.jobId;
    if (filters.dateFrom || filters.dateTo) {
      where.appliedAt = {};
      if (filters.dateFrom) where.appliedAt.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.appliedAt.lte = new Date(filters.dateTo);
    }
    if (filters.keyword) {
      where.OR = [
        { job: { title: { contains: filters.keyword, mode: 'insensitive' } } },
        { candidate: { user: { email: { contains: filters.keyword, mode: 'insensitive' } } } },
        { candidate: { user: { firstName: { contains: filters.keyword, mode: 'insensitive' } } } },
      ];
    }

    const [applications, total] = await prisma.$transaction([
      prisma.jobApplication.findMany({
        where,
        include: {
          job: { select: { id: true, title: true, company: { select: { companyName: true } } } },
          candidate: {
            select: {
              user: { select: { id: true, email: true, firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { appliedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.jobApplication.count({ where }),
    ]);

    return {
      items: applications.map((a) => ({
        id: a.id,
        status: a.status,
        appliedAt: a.appliedAt,
        jobTitle: a.job.title,
        companyName: a.job.company?.companyName || 'Unknown',
        candidateName:
          [a.candidate.user.firstName, a.candidate.user.lastName].filter(Boolean).join(' ') ||
          'Unknown',
        candidateEmail: a.candidate.user.email,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      hasMore: page < (Math.ceil(total / limit) || 1),
    };
  }

  /**
   * Get Application Stats (Admin)
   */
  async getApplicationStats() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [total, byStatus, dailyTrend] = await prisma.$transaction([
      prisma.jobApplication.count(),
      prisma.jobApplication.groupBy({ by: ['status'], orderBy: { status: 'asc' }, _count: true }),
      prisma.jobApplication.findMany({
        where: { appliedAt: { gte: thirtyDaysAgo } },
        select: { appliedAt: true },
      }),
    ]);

    // Build daily trend
    const dailyCounts: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      dailyCounts[d.toISOString().split('T')[0]] = 0;
    }
    dailyTrend.forEach((a) => {
      const key = a.appliedAt.toISOString().split('T')[0];
      if (dailyCounts[key] !== undefined) dailyCounts[key]++;
    });

    return {
      total,
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      dailyTrend: Object.entries(dailyCounts).map(([date, count]) => ({ date, count })),
    };
  }

  /**
   * Get candidate's job applications with pagination
   */
  async getUserApplications(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    // Verify user exists and is a candidate
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, candidateProfile: { select: { id: true } } },
    });
    if (!user) throw new AppError('User not found', 404);
    if (user.role !== Role.CANDIDATE || !user.candidateProfile) {
      return { items: [], total: 0, page, limit, totalPages: 0, hasMore: false };
    }

    const [applications, total] = await prisma.$transaction([
      prisma.jobApplication.findMany({
        where: { candidate: { userId } },
        include: {
          job: {
            select: {
              id: true,
              title: true,
              location: true,
              type: true,
              status: true,
              company: {
                select: { id: true, companyName: true, logo: true, industry: true },
              },
            },
          },
          candidate: {
            select: {
              userId: true,
              user: { select: { email: true, firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { appliedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.jobApplication.count({ where: { candidate: { userId } } }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;
    return {
      items: applications,
      total,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages,
    };
  }

  /**
   * Get employer's job posts with pagination
   */
  async getUserJobs(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    // Verify user exists and is an employer
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, companyProfile: { select: { id: true } } },
    });
    if (!user) throw new AppError('User not found', 404);
    if (user.role !== Role.EMPLOYER || !user.companyProfile) {
      return { items: [], total: 0, page, limit, totalPages: 0, hasMore: false };
    }

    const [jobs, total] = await prisma.$transaction([
      prisma.jobPost.findMany({
        where: { company: { userId } },
        include: {
          company: {
            select: {
              id: true,
              companyName: true,
              logo: true,
              industry: true,
              companySize: true,
            },
          },
          _count: {
            select: {
              applications: true,
              savedBy: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.jobPost.count({ where: { company: { userId } } }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;
    return {
      items: jobs.map((j) => ({
        ...j,
        _applicationCount: j._count.applications,
        _savedCount: j._count.savedBy,
        _count: undefined,
      })),
      total,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages,
    };
  }

  /**
   * Get user's verification requests
   */
  async getUserVerifications(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [verifications, total] = await prisma.$transaction([
      prisma.verificationRequest.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.verificationRequest.count({ where: { userId } }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;
    return { items: verifications, total, page, limit, totalPages, hasMore: page < totalPages };
  }

  /**
   * Approve/reject verification request
   */
  async updateVerificationStatus(
    verificationId: string,
    status: 'APPROVED' | 'REJECTED',
    adminId: string,
    reason?: string
  ) {
    const verification = await prisma.verificationRequest.findUnique({
      where: { id: verificationId },
    });
    if (!verification) throw new AppError('Verification request not found', 404);

    await prisma.$transaction([
      prisma.verificationRequest.update({
        where: { id: verificationId },
        data: {
          status,
          reviewedBy: adminId,
          reviewedAt: new Date(),
          adminComments: reason || null,
        },
      }),
      prisma.auditLog.create({
        data: {
          action: `VERIFICATION_${status}`,
          entity: 'VerificationRequest',
          entityId: verificationId,
          performedBy: adminId,
          details: { userId: verification.userId, type: verification.type, reason },
        },
      }),
    ]);

    // Fire-and-forget notification
    void import('./notification.service')
      .then(({ notificationService }) =>
        notificationService.send({
          userId: verification.userId,
          title: `Verification ${status === 'APPROVED' ? 'Approved' : 'Rejected'}`,
          message:
            status === 'APPROVED'
              ? 'Your verification request has been approved.'
              : `Your verification request was rejected. ${reason || ''}`,
          type: status === 'APPROVED' ? ('SUCCESS' as any) : ('WARNING' as any),
          category: 'verification',
          channels: ['in_app', 'email'],
        })
      )
      .catch(() => {});
  }

  /**
   * Update candidate profile (admin edit)
   */
  async updateCandidateProfile(userId: string, data: any, adminId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, candidateProfile: { select: { id: true } } },
    });

    if (!user) throw new AppError('User not found', 404);
    if (user.role !== Role.CANDIDATE || !user.candidateProfile) {
      throw new AppError('Candidate profile not found', 404);
    }

    await prisma.$transaction([
      prisma.candidateProfile.update({
        where: { userId },
        data,
      }),
      prisma.auditLog.create({
        data: {
          action: 'UPDATE_CANDIDATE_PROFILE',
          entity: 'CandidateProfile',
          entityId: userId,
          performedBy: adminId,
          details: { fields: Object.keys(data), updates: data },
        },
      }),
    ]);

    return { success: true };
  }

  /**
   * Update company profile (admin edit)
   */
  async updateCompanyProfile(userId: string, data: any, adminId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, companyProfile: { select: { id: true } } },
    });

    if (!user) throw new AppError('User not found', 404);
    if (user.role !== Role.EMPLOYER || !user.companyProfile) {
      throw new AppError('Company profile not found', 404);
    }

    await prisma.$transaction([
      prisma.companyProfile.update({
        where: { userId },
        data,
      }),
      prisma.auditLog.create({
        data: {
          action: 'UPDATE_COMPANY_PROFILE',
          entity: 'CompanyProfile',
          entityId: userId,
          performedBy: adminId,
          details: { fields: Object.keys(data), updates: data },
        },
      }),
    ]);

    return { success: true };
  }

  /**
   * Bulk export users (queues data export job)
   */
  /**
   * Target restriction shared by every bulk operation.
   *
   * `denyAdminTargets` guards the per-record routes by inspecting `:id`, but
   * bulk endpoints carry their targets in the BODY, so that middleware never
   * fires. Without this, an admin holding `users.bulk.suspend` could post a
   * peer admin's id and lock them out of the console — the same privilege
   * attack, just through a different door. `bulkExportUsers` was worse: it
   * would export the admin roster itself.
   *
   * Super-admins are unrestricted; everyone else sees candidates and
   * employers only.
   */
  private bulkTargetScope(actorRole?: Role) {
    if (actorRole === Role.SUPER_ADMIN) return { role: { not: Role.SUPER_ADMIN } };
    return { role: { in: [Role.CANDIDATE, Role.EMPLOYER] } };
  }

  async bulkExportUsers(
    userIds: string[],
    adminId: string,
    format: 'csv' | 'xlsx' = 'csv',
    actorRole?: Role
  ) {
    // Validate user IDs
    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, ...this.bulkTargetScope(actorRole) },
      select: { id: true, email: true, role: true },
    });

    if (users.length === 0) throw new AppError('No valid users found', 404);

    // Queue data export job
    await prisma.auditLog.create({
      data: {
        action: 'BULK_EXPORT_USERS',
        entity: 'User',
        performedBy: adminId,
        details: { userIds, count: users.length, format },
      },
    });

    // TODO: Implement actual export queue job that sends email with CSV/XLSX attachment
    // For now, just create audit log - admin will be notified via audit system

    return { success: true, count: users.length };
  }

  /**
   * Bulk send notifications
   */
  async bulkNotifyUsers(
    userIds: string[],
    adminId: string,
    notification: { title: string; message: string; type?: string },
    actorRole?: Role
  ) {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, ...this.bulkTargetScope(actorRole) },
      select: { id: true },
    });

    if (users.length === 0) throw new AppError('No valid users found', 404);

    // Create audit log
    await prisma.auditLog.create({
      data: {
        action: 'BULK_NOTIFY_USERS',
        entity: 'User',
        performedBy: adminId,
        details: { userIds, count: users.length, notification },
      },
    });

    // Fire-and-forget: send notifications to all users
    void import('./notification.service')
      .then(({ notificationService }) => {
        return Promise.all(
          users.map((user) =>
            notificationService
              .send({
                userId: user.id,
                title: notification.title,
                message: notification.message,
                type: (notification.type || 'INFO') as any,
                category: 'admin',
                channels: ['in_app', 'email'],
              })
              .catch(() => {})
          )
        );
      })
      .catch(() => {});

    return { success: true, count: users.length };
  }

  /**
   * Bulk suspend users
   */
  async bulkSuspendUsers(userIds: string[], adminId: string, reason?: string, actorRole?: Role) {
    // Cannot suspend yourself, a super-admin, or — unless you ARE a
    // super-admin — a peer admin.
    const users = await prisma.user.findMany({
      where: {
        id: { in: userIds },
        ...this.bulkTargetScope(actorRole),
        NOT: { id: adminId },
      },
      select: { id: true, email: true },
    });

    if (users.length === 0) throw new AppError('No valid users to suspend', 404);

    // Bulk update
    await prisma.$transaction([
      prisma.user.updateMany({
        where: { id: { in: users.map((u) => u.id) } },
        data: { isSuspended: true, suspendedAt: new Date(), suspendedBy: adminId },
      }),
      prisma.auditLog.create({
        data: {
          action: 'BULK_SUSPEND_USERS',
          entity: 'User',
          performedBy: adminId,
          details: { userIds: users.map((u) => u.id), count: users.length, reason },
        },
      }),
    ]);

    // Fire-and-forget: notify users
    void import('./notification.service')
      .then(({ notificationService }) => {
        return Promise.all(
          users.map((user) => notificationService.notifyUserSuspended(user.id).catch(() => {}))
        );
      })
      .catch(() => {});

    return { success: true, count: users.length };
  }

  /**
   * Bulk activate users
   */
  async bulkActivateUsers(userIds: string[], adminId: string, actorRole?: Role) {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, isSuspended: true, ...this.bulkTargetScope(actorRole) },
      select: { id: true, email: true },
    });

    if (users.length === 0) throw new AppError('No suspended users found', 404);

    // Bulk update
    await prisma.$transaction([
      prisma.user.updateMany({
        where: { id: { in: users.map((u) => u.id) } },
        data: { isSuspended: false, suspendedAt: null, suspendedBy: null },
      }),
      prisma.auditLog.create({
        data: {
          action: 'BULK_ACTIVATE_USERS',
          entity: 'User',
          performedBy: adminId,
          details: { userIds: users.map((u) => u.id), count: users.length },
        },
      }),
    ]);

    return { success: true, count: users.length };
  }
}

export const adminService = new AdminService();
