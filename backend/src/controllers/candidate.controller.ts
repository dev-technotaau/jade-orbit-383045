import type { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { candidateService } from '../services/candidate.service';
import { candidateAnalyticsService } from '../services/candidate-analytics.service';
import { AppError } from '../middleware/error';
import { assertPermission, hasPermission } from '../middleware/require-permission';
import { startResumeFlow } from '../jobs/resume-flow';
import prisma from '../config/prisma';

/**
 * Get current user's candidate profile
 */
export const getMyProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const profile = await candidateService.getProfile(req.user.id);

    res.status(200).json({
      status: 'success',
      data: profile,
    });
  } catch (error) {
    // If profile doesn't exist yet, return empty object or specific message?
    // Service throws 404 if not found.
    // For /me endpoint, it might be better to return null or create one?
    // For now, let's bubble up the 404 from service.
    next(error);
  }
};

/**
 * Update candidate profile
 */
export const updateMyProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const profile = await candidateService.updateProfile(req.user.id, req.body);

    res.status(200).json({
      status: 'success',
      data: profile,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Upload Resume
 */
export const uploadResume = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    if (!req.file) {
      throw new AppError('No file uploaded', 400);
    }

    const profile = await candidateService.uploadResume(req.user.id, req.file);

    res.status(200).json({
      status: 'success',
      message: 'Resume uploaded successfully',
      data: {
        resume: profile.resume,
        resumeOriginalName: profile.resumeOriginalName,
        resumeSize: profile.resumeSize,
        resumeMimeType: profile.resumeMimeType,
        resumeUploadedAt: profile.resumeUploadedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Upload Profile Image/Avatar
 */
export const uploadAvatar = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    if (!req.file) {
      throw new AppError('No file uploaded', 400);
    }

    const profile = await candidateService.uploadProfileImage(req.user.id, req.file);

    res.status(200).json({
      status: 'success',
      message: 'Avatar uploaded successfully',
      data: {
        profileImage: profile.profileImage,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove Profile Image/Avatar
 */
export const removeAvatar = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    await candidateService.removeProfileImage(req.user.id);

    res.status(200).json({
      status: 'success',
      message: 'Avatar removed successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete Resume (uploaded and/or generated)
 */
export const deleteResume = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    // Optional query param to specify which resume to delete: uploaded, generated, or both (default)
    const resumeType = (req.query.type as 'uploaded' | 'generated' | 'both') || 'both';

    if (!['uploaded', 'generated', 'both'].includes(resumeType)) {
      throw new AppError('Invalid resume type. Must be: uploaded, generated, or both', 400);
    }

    await candidateService.deleteResume(req.user.id, resumeType);

    res.status(200).json({
      status: 'success',
      message: 'Resume deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Profile Completeness (Candidate)
 */
export const getProfileCompleteness = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const completeness = await candidateService.getProfileCompleteness(req.user.id);
    res.status(200).json({ status: 'success', data: completeness });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Candidate Dashboard
 */
export const getDashboard = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const dashboard = await candidateService.getCandidateDashboard(req.user.id);
    res.status(200).json({ status: 'success', data: dashboard });
  } catch (error) {
    next(error);
  }
};

/**
 * List available resume templates (free + premium). Frontend picker uses
 * this to render the gallery and decide which cards are locked behind the
 * `feature.candidate_ai_resume_premium` upsell.
 */
export const listResumeTemplates = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { resumeGenerator } = await import('../services/resume-generator.service');
    const templates = resumeGenerator.listTemplates();
    res.status(200).json({ status: 'success', data: templates });
  } catch (error) {
    next(error);
  }
};

/**
 * Get resume generation readiness status
 */
export const getResumeReadiness = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const profile = await candidateService.getProfile(req.user.id);
    const { resumeGenerator } = await import('../services/resume-generator.service');
    const readiness = resumeGenerator.validateResumeReadiness(profile);
    res.status(200).json({ status: 'success', data: readiness });
  } catch (error) {
    next(error);
  }
};

/**
 * Generate Resume PDF from profile
 */
export const generateResumePdf = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const profile = await candidateService.getProfile(req.user.id);
    const { resumeGenerator } = await import('../services/resume-generator.service');

    // Validate readiness
    const readiness = resumeGenerator.validateResumeReadiness(profile);
    if (!readiness.canGenerate) {
      throw new AppError(
        'Profile incomplete — add required fields before generating resume',
        400,
        'RESUME_NOT_READY'
      );
    }

    const resumeData = {
      fullName: `${profile.user.firstName || ''} ${profile.user.lastName || ''}`.trim(),
      email: profile.user.email,
      phone: profile.phone || '',
      location: profile.currentLocation || '',
      headline: profile.headline || undefined,
      linkedin: profile.linkedinProfile || undefined,
      portfolio: profile.portfolioUrl || undefined,
      github: profile.githubProfile || undefined,
      summary: profile.bio || undefined,
      experience: profile.experience
        ? (profile.experience as any[]).map((e) => ({
            title: e.role,
            company: e.company,
            location: e.location || '',
            startDate: e.startDate,
            endDate: e.endDate || 'Present',
            description: e.description || '',
            highlights: e.keyAchievements?.length ? e.keyAchievements : undefined,
          }))
        : undefined,
      education: profile.education
        ? (profile.education as any[]).map((e) => ({
            institution: e.institution || e.college,
            degree: e.degree,
            field: e.field || '',
            year: e.year || e.endDate || '',
            grade: e.grade || undefined,
          }))
        : undefined,
      skills: profile.skills.length > 0 ? profile.skills : undefined,
      certifications: profile.certifications
        ? (profile.certifications as any[]).map((c) => ({
            name: c.name,
            issuer: c.issuer,
            date: c.issueDate || '',
            credentialId: c.credentialId || undefined,
            url: c.url || undefined,
          }))
        : undefined,
      projects: profile.projects
        ? (profile.projects as any[]).map((p) => ({
            name: p.name,
            description: p.description || '',
            technologies: p.technologies || [],
            url: p.url || undefined,
            role: p.role || undefined,
          }))
        : undefined,
      awards: profile.awards
        ? (profile.awards as any[]).map((a) => ({
            title: a.title,
            issuer: a.issuer || '',
            date: a.date || '',
            description: a.description || undefined,
          }))
        : undefined,
      languages: profile.languageProficiency
        ? (profile.languageProficiency as any[]).map((l) => ({
            language: l.language,
            proficiency: l.proficiency,
          }))
        : undefined,
    };
    const templateId = typeof req.query.template === 'string' ? req.query.template : undefined;
    const pdfBuffer = await resumeGenerator.generateResume(resumeData, {
      templateId,
      userId: req.user.id,
    });

    // Delete old generated resume from R2
    const { uploadFileToR2, extractR2KeyFromUrl, deleteFileFromR2 } =
      await import('../services/storage.service');
    if (profile.generatedResumeUrl) {
      const oldKey = extractR2KeyFromUrl(profile.generatedResumeUrl as string);
      if (oldKey) deleteFileFromR2(oldKey).catch(() => {});
    }

    // Save to R2
    const filename = `resume-${profile.user.firstName || 'candidate'}-${Date.now()}.pdf`;
    const { url } = await uploadFileToR2(
      pdfBuffer,
      filename,
      'generated-resumes',
      'application/pdf'
    );

    // Persist URL in profile
    await prisma.candidateProfile.update({
      where: { userId: req.user.id },
      data: { generatedResumeUrl: url, generatedResumeAt: new Date() },
    });

    res.status(200).json({
      status: 'success',
      data: { url, generatedAt: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Set generated resume as the active profile resume
 */
export const useGeneratedResume = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);

    const profile = await prisma.candidateProfile.findUnique({ where: { userId: req.user.id } });
    if (!profile?.generatedResumeUrl) {
      throw new AppError(
        'No generated resume found — generate one first',
        400,
        'NO_GENERATED_RESUME'
      );
    }

    // Delete old uploaded resume from R2 (skip if it's the same as generated)
    if (profile.resume && profile.resume !== profile.generatedResumeUrl) {
      const { extractR2KeyFromUrl, deleteFileFromR2 } = await import('../services/storage.service');
      const oldKey = extractR2KeyFromUrl(profile.resume);
      if (oldKey) deleteFileFromR2(oldKey).catch(() => {});
    }

    await prisma.candidateProfile.update({
      where: { userId: req.user.id },
      data: {
        resume: profile.generatedResumeUrl,
        resumeOriginalName: 'Generated Resume.pdf',
        resumeSize: null,
        resumeMimeType: 'application/pdf',
        resumeUploadedAt: new Date(),
      },
    });

    res.status(200).json({
      status: 'success',
      message: 'Generated resume set as profile resume',
      data: { resume: profile.generatedResumeUrl },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Candidate Public Profile (Employer viewing candidate)
 */
export const getCandidateProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const candidateUserId = req.params.id as string;

    // Reading a candidate's record is `users.candidates.profile.view`; seeing
    // their phone/email is the separate, `sensitive` `.contact` key — the same
    // split already applied to employers (`users.employers.company.contact`)
    // and to the resume download two handlers below. Previously BOTH came free
    // with the ADMIN role, so a help-desk admin could harvest the contact
    // details of every candidate on the platform.
    const isAdmin = req.user.role === Role.ADMIN;
    if (isAdmin) await assertPermission(req, 'users.candidates.profile.view');

    const profile = await candidateService.getCandidatePublicProfile(candidateUserId, {
      id: req.user.id,
      role: req.user.role,
      privileged: isAdmin
        ? await hasPermission(req, 'users.candidates.profile.contact')
        : undefined,
    });

    // Track profile view
    try {
      const { profileViewService } = await import('../services/profile-view.service');
      await profileViewService.trackView(req.user.id, candidateUserId, 'CANDIDATE_PROFILE');
    } catch {
      /* non-critical */
    }

    res.status(200).json({ status: 'success', data: profile });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Profile Views (who viewed my profile)
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
 * Search Candidates (Employer only)
 */
export const searchCandidates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // ── The CV database is a PERMISSION, not a role ──
    // This route admits EMPLOYER and ADMIN. For an employer it is metered and
    // paywalled by their plan; for an ADMIN the service skipped both
    // (`isPrivilegedSearcher`), so role alone let ANY admin — including one
    // holding zero grants — page through every candidate on the platform.
    // Same key the admin user-detail payload already uses for the candidate
    // profile block, so the two surfaces agree. SUPER_ADMIN short-circuits
    // inside `assertPermission`; EMPLOYER never enters this branch.
    if (req.user?.role === Role.ADMIN) {
      await assertPermission(req, 'users.candidates.profile.view');
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
      // Skills — operator-aware parse (`,` AND, `|` OR, `!` NOT). When no
      // operators are present the comma-separated array path stays
      // backwards-compatible with the legacy URL grammar.
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
      latitude: q.latitude ? Number(q.latitude) : undefined,
      longitude: q.longitude ? Number(q.longitude) : undefined,
      radiusKm: q.radiusKm ? Number(q.radiusKm) : undefined,
      sortBy: typeof q.sortBy === 'string' ? (q.sortBy as any) : undefined,
      page: q.page ? Number(q.page) : 1,
      limit: q.limit ? Number(q.limit) : 10,
    };

    const result = await candidateService.searchCandidates(
      filters.keyword || '',
      filters,
      req.user?.id,
      req.user?.role
    );

    const total = result.pagination?.total ?? result.candidates.length;
    const pg = result.pagination ?? { total, page: 1, limit: total || 10, pages: 1 };

    res.status(200).json({
      status: 'success',
      data: {
        items: result.candidates,
        total: pg.total,
        page: pg.page,
        limit: pg.limit,
        totalPages: pg.pages,
        hasMore: pg.page < pg.pages,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/candidates/me/resume/parse
 * Trigger AI parsing of the current resume.
 */
export const triggerResumeParse = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const profile = await prisma.candidateProfile.findUnique({
      where: { userId: req.user.id },
      select: { id: true, resume: true, resumeOriginalName: true },
    });

    if (!profile?.resume) {
      throw new AppError('No resume uploaded. Please upload a resume first.', 400, 'NO_RESUME');
    }

    const mimeType = profile.resumeOriginalName?.endsWith('.docx')
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : profile.resumeOriginalName?.endsWith('.doc')
        ? 'application/msword'
        : 'application/pdf';

    const flowJobId = await startResumeFlow(req.user.id, profile.id, profile.resume, mimeType);

    res.status(202).json({
      status: 'success',
      message: 'Resume parsing started. You will be notified when complete.',
      data: { flowJobId },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/candidates/me/analytics
 * Get candidate analytics & insights.
 */
export const getAnalytics = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { startDate, endDate, groupBy } = req.query as Record<string, string>;
    const data = await candidateAnalyticsService.getAnalytics(req.user.id, {
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
 * GET /api/v1/candidates/me/analytics/export
 * Export candidate analytics as CSV.
 */
export const exportAnalytics = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { startDate, endDate } = req.query as Record<string, string>;
    const csv = await candidateAnalyticsService.exportAnalyticsCsv(req.user.id, {
      startDate,
      endDate,
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="analytics.csv"');
    res.send(csv);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/candidates/me/resume/parsed
 * Get parsed resume data.
 */
export const getParsedResumeData = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const profile = await prisma.candidateProfile.findUnique({
      where: { userId: req.user.id },
      select: { parsedResumeData: true },
    });

    res.status(200).json({
      status: 'success',
      data: profile?.parsedResumeData || null,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/candidates/:id/resume
 * Secure resume download — returns a short-lived signed URL.
 * Candidates can download their own; employers/admins who have a relationship can download others'.
 */
export const getResumeDownloadUrl = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);

    // Accept either User.id or CandidateProfile.id — pages link with both
    // forms, and a strict user-id comparison made valid downloads 403.
    const rawCandidateId = req.params.id as string;
    let candidateUserId = rawCandidateId;
    const candidateUser = await prisma.user.findFirst({
      where: { id: rawCandidateId, role: Role.CANDIDATE },
      select: { id: true },
    });
    if (!candidateUser) {
      const prof = await prisma.candidateProfile.findUnique({
        where: { id: rawCandidateId },
        select: { userId: true },
      });
      if (prof) candidateUserId = prof.userId;
    }
    const isSelf = req.user.id === candidateUserId;

    // If not self, must be EMPLOYER or ADMIN
    if (
      !isSelf &&
      req.user.role !== Role.EMPLOYER &&
      req.user.role !== Role.ADMIN &&
      req.user.role !== Role.SUPER_ADMIN
    ) {
      throw new AppError('Not authorized to access this resume', 403);
    }

    // For ADMINS, resume access is a granted permission rather than a
    // property of the role. A resume embeds the candidate's phone, email and
    // address, so `users.candidates.profile.resume` is marked `sensitive` in
    // the registry — it should not come free with any help-desk grant.
    // SUPER_ADMIN short-circuits inside `assertPermission`.
    if (!isSelf && req.user.role === Role.ADMIN) {
      await assertPermission(req, 'users.candidates.profile.resume');
    }

    // For employers, resume access follows the CONTACT PAYWALL — resumes
    // embed the candidate's phone/email, so the same visibility rule
    // applies: the candidate applied to one of your jobs, you spent a CV
    // unlock on them, or your plan has unlimited unlocks. Saving a
    // candidate is free and deliberately does NOT grant resume access.
    if (!isSelf && req.user.role === Role.EMPLOYER) {
      const { canViewContact } = await import('../services/cv-unlock.service');
      const allowed = await canViewContact(req.user.id, candidateUserId);
      if (!allowed) {
        throw new AppError(
          'Unlock this candidate (1 CV unlock) to download their resume.',
          403,
          'RESUME_LOCKED'
        );
      }
    }

    // Determine which resume URL to use — query param `snapshot` for application resume
    const applicationId = req.query.applicationId as string | undefined;
    let resumeUrl: string | null = null;

    if (applicationId) {
      const application = await prisma.jobApplication.findUnique({
        where: { id: applicationId },
        select: { resumeSnapshot: true, candidate: { select: { resume: true } } },
      });
      resumeUrl = application?.resumeSnapshot || application?.candidate?.resume || null;
    } else {
      const profile = await prisma.candidateProfile.findFirst({
        where: { userId: candidateUserId },
        select: { resume: true },
      });
      resumeUrl = profile?.resume || null;
    }

    if (!resumeUrl) {
      throw new AppError('No resume found', 404);
    }

    // Extract R2 key and generate signed URL
    const { extractR2KeyFromUrl, getSignedDownloadUrl } =
      await import('../services/storage.service');
    const key = extractR2KeyFromUrl(resumeUrl);

    if (!key) {
      // Fallback: if URL is not R2 (e.g. Cloudinary legacy), redirect directly
      res.status(200).json({ status: 'success', data: { url: resumeUrl } });
      return;
    }

    const signedUrl = await getSignedDownloadUrl(key, 300); // 5 minutes
    res.status(200).json({ status: 'success', data: { url: signedUrl } });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /candidates/me/boost — read profile-boost status.
 * Returns eligibility (feature flag), pool size, days remaining,
 * whether a window is currently active, and (if so) its expiry.
 */
export const getMyBoostStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const status = await candidateService.getBoostStatus(req.user.id);
    res.status(200).json({ status: 'success', data: status });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /candidates/me/boost/activate — spend N BOOST_DAYS (default 1)
 * and set/extend the active-until window by N × 24 hours.
 *
 * Body: `{ days?: number }` — integer in [1, daysRemaining]. The service
 * re-validates the value against the live pool so a tampered client
 * can't overdraw.
 */
export const activateMyBoost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const rawDays = (req.body as { days?: unknown })?.days;
    const days =
      typeof rawDays === 'number'
        ? rawDays
        : typeof rawDays === 'string' && rawDays.trim() !== ''
          ? Number(rawDays)
          : undefined;
    const result = await candidateService.activateProfileBoost(
      req.user.id,
      { days },
      { ipAddress: req.ip, userAgent: req.get('user-agent') ?? undefined }
    );
    res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
};
