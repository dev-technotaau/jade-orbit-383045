import { prisma } from '../config/prisma';
import logger from '../config/logger';
import { AppError } from '../middleware/error';
import type { CompanyProfile } from '@prisma/client';
import { uploadImage, uploadOptions, deleteImage, extractPublicId } from '../config/cloudinary';
import { searchService } from './search.service';
import {} from '../kafka/producer';
import { publishEvent } from '../kafka/producer';
import { KafkaTopics } from '../kafka/topics';

export class EmployerService {
  /**
   * Get company profile by User ID (Employer)
   */
  async getProfile(userId: string) {
    const profile = await prisma.companyProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            avatar: true,
          },
        },
      },
    });

    // Unlike candidate, if company profile doesn't exist, we might just return null
    // But for consistency let's throw 404 or handle in controller
    if (!profile) {
      throw new AppError('Company profile not found', 404);
    }

    return profile;
  }

  /**
   * Get public company profile by CompanyProfile ID.
   * Excludes sensitive fields (GST, CIN, PAN, contact details, granular address).
   */
  async getPublicProfile(companyId: string) {
    const profile = await prisma.companyProfile.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        userId: true,
        slug: true,
        accountType: true,
        hiringType: true,
        companyName: true,
        companyType: true,
        tagline: true,
        logo: true,
        coverImage: true,
        companyVideoUrl: true,
        industry: true,
        subIndustry: true,
        specialties: true,
        companySize: true,
        employeeCount: true,
        numberOfOffices: true,
        description: true,
        whyWorkForUs: true,
        website: true,
        careersPageUrl: true,
        blogUrl: true,
        foundedYear: true,
        parentCompany: true,
        stockTicker: true,
        isVerified: true,
        annualRevenueRange: true,
        fundingStage: true,
        totalFundingRaised: true,
        investors: true,
        productsServices: true,
        techStack: true,
        companyCulture: true,
        missionStatement: true,
        visionStatement: true,
        coreValues: true,
        diversityStatement: true,
        employeeResourceGroups: true,
        csrInitiatives: true,
        benefits: true,
        structuredPerks: true,
        workplacePolicies: true,
        interviewProcess: true,
        awardsRecognitions: true,
        leadershipTeam: true,
        employeeTestimonials: true,
        officePhotos: true,
        socialLinks: true,
        headquarters: true,
        locations: true,
        city: true,
        state: true,
        country: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!profile) {
      throw new AppError('Company profile not found', 404);
    }

    return profile;
  }

  /**
   * Create or Update Company Profile
   */
  async updateProfile(userId: string, data: Partial<CompanyProfile>) {
    // Strip non-updatable fields and JSON fields that need null-safe handling
    const {
      id: _id,
      userId: _uid,
      createdAt: _ca,
      updatedAt: _ua,
      socialLinks,
      structuredPerks,
      workplacePolicies,
      awardsRecognitions,
      leadershipTeam,
      employeeTestimonials,
      officePhotos,
      notificationPreferences,
      logoVariants: _lv,
      coverVariants: _cv,
      imageVariants: _iv,
      ...rest
    } = data as any;
    const safeData = {
      ...rest,
      ...(socialLinks !== undefined ? { socialLinks: socialLinks ?? undefined } : {}),
      ...(structuredPerks !== undefined ? { structuredPerks: structuredPerks ?? undefined } : {}),
      ...(workplacePolicies !== undefined
        ? { workplacePolicies: workplacePolicies ?? undefined }
        : {}),
      ...(awardsRecognitions !== undefined
        ? { awardsRecognitions: awardsRecognitions ?? undefined }
        : {}),
      ...(leadershipTeam !== undefined ? { leadershipTeam: leadershipTeam ?? undefined } : {}),
      ...(employeeTestimonials !== undefined
        ? { employeeTestimonials: employeeTestimonials ?? undefined }
        : {}),
      ...(officePhotos !== undefined ? { officePhotos: officePhotos ?? undefined } : {}),
      ...(notificationPreferences !== undefined
        ? { notificationPreferences: notificationPreferences ?? undefined }
        : {}),
    };

    // SEO slug — generated from companyName with collision suffixing.
    // Stable once assigned; we only assign if the row doesn't already
    // have a slug, so editing the company name later doesn't invalidate
    // any indexed URL. (Slug regeneration on rename is a deliberate
    // follow-up — out of scope for this delivery.)
    const existing = await prisma.companyProfile.findUnique({
      where: { userId },
      select: { slug: true, accountType: true },
    });

    // Invariant: INDIVIDUAL accounts always hire DIRECT. The hiring-type
    // question is only shown to COMPANY accounts in the UI (onboarding +
    // settings), so enforce the pair server-side too — covers stale
    // clients and legacy INDIVIDUAL rows that still carry CONSULTANCY.
    // Resolution order: the value being written wins; else the stored one.
    const effectiveAccountType = safeData.accountType ?? existing?.accountType ?? null;
    if (effectiveAccountType === 'INDIVIDUAL') {
      safeData.hiringType = 'DIRECT';

      // Auto-fill the contact person for individuals: a proprietor IS
      // the contact person, and the UI hides these org-chart fields for
      // them (onboarding + profile), so nothing client-side ever writes
      // the values. Fill from the account so the data exists in the DB
      // for any future consumer (displays, emails, exports) — per the
      // June 2026 decision to collect-and-store contact fields now and
      // decide on surfacing later. Re-synced on every profile save so a
      // renamed account propagates; individuals can't hand-edit these
      // anyway since the fields aren't rendered for them.
      const owner = await prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
      });
      const ownerName = [owner?.firstName, owner?.lastName].filter(Boolean).join(' ').trim();
      if (ownerName) safeData.contactPersonName = ownerName;
      safeData.contactPersonDesignation = 'Proprietor';
    }
    let companySlug = existing?.slug ?? null;
    if (!companySlug && (safeData.companyName || 'My Company')) {
      const { buildCompanySlug } = await import('../lib/slugs');
      companySlug = await buildCompanySlug(safeData.companyName || 'My Company', {
        isTaken: async (candidate) => {
          const taken = await prisma.companyProfile.findFirst({
            where: { slug: candidate, NOT: { userId } },
            select: { id: true },
          });
          return Boolean(taken);
        },
      });
    }

    const profile = await prisma.companyProfile.upsert({
      where: { userId },
      create: {
        userId,
        companyName: safeData.companyName || 'My Company',
        ...safeData,
        ...(companySlug ? { slug: companySlug } : {}),
      },
      update: {
        ...safeData,
        ...(companySlug && !existing?.slug ? { slug: companySlug } : {}),
      },
    });

    // Index in Elasticsearch
    searchService
      .indexEmployer(profile)
      .catch((err) => logger.error('Failed to index employer', err));

    // Publish Kafka events for analytics/webhooks
    publishEvent(KafkaTopics.PROFILE_UPDATED, userId, { userId, profileId: profile.id }).catch(
      () => {}
    );
    publishEvent(KafkaTopics.COMPANY_PROFILE_UPDATED, userId, {
      userId,
      profileId: profile.id,
    }).catch(() => {});

    // Trigger geocoding if address fields changed
    const geoAddress = [data.city, data.state, data.country, data.headquarters]
      .filter(Boolean)
      .join(', ');
    if (geoAddress) {
      import('../jobs/geocoding.queue')
        .then(({ addGeocodingJob }) =>
          addGeocodingJob({ entityType: 'company', entityId: profile.id, address: geoAddress })
        )
        .catch(() => {});
    }

    // Notify followers when high-signal fields change. Throttled to
    // once per 24h per company in the service layer so fast-iterating
    // employers don't spam followers. Only triggers on fields that
    // followers care about — text-tweaks like description don't fire.
    const HIGH_SIGNAL_FIELDS = [
      'awardsRecognitions',
      'leadershipTeam',
      'employeeTestimonials',
      'officePhotos',
      'companyVideoUrl',
      'fundingStage',
      'investors',
      'productsServices',
      'isVerified',
    ] as const;
    const changedFields = HIGH_SIGNAL_FIELDS.filter((k) => k in (data as Record<string, unknown>));
    if (changedFields.length > 0) {
      const summary = (() => {
        if (changedFields.includes('isVerified') && (data as { isVerified?: boolean }).isVerified) {
          return `${profile.companyName} just got GST-verified.`;
        }
        if (changedFields.includes('awardsRecognitions')) {
          return `${profile.companyName} just added new awards & recognition.`;
        }
        if (changedFields.includes('leadershipTeam')) {
          return `${profile.companyName} updated their leadership team.`;
        }
        if (changedFields.includes('officePhotos') || changedFields.includes('companyVideoUrl')) {
          return `${profile.companyName} added new photos / video to their profile.`;
        }
        if (changedFields.includes('fundingStage') || changedFields.includes('investors')) {
          return `${profile.companyName} updated their funding details.`;
        }
        return `${profile.companyName} updated their profile.`;
      })();
      import('./company-follow.service')
        .then(({ notifyFollowersOfCompanyUpdate }) =>
          notifyFollowersOfCompanyUpdate(profile.id, summary)
        )
        .catch((err) => logger.warn('notifyFollowersOfCompanyUpdate failed', err));
    }

    return profile;
  }

  /**
   * Get dashboard analytics for employer
   */
  async getDashboardAnalytics(userId: string) {
    const companyProfile = await prisma.companyProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!companyProfile) throw new AppError('Company profile not found', 404);

    const [
      totalJobs,
      activeJobs,
      totalApplications,
      recentApplications,
      statusCounts,
      savedCandidatesCount,
      savedSearchesCount,
      profileViewsCount,
      company,
    ] = await prisma.$transaction([
      prisma.jobPost.count({ where: { companyId: companyProfile.id } }),
      prisma.jobPost.count({ where: { companyId: companyProfile.id, status: 'OPEN' } }),
      prisma.jobApplication.count({ where: { job: { companyId: companyProfile.id } } }),
      prisma.jobApplication.findMany({
        where: { job: { companyId: companyProfile.id } },
        include: {
          candidate: {
            include: { user: { select: { firstName: true, lastName: true, email: true } } },
          },
          job: { select: { title: true } },
        },
        take: 10,
        orderBy: { appliedAt: 'desc' },
      }),
      prisma.jobApplication.groupBy({
        by: ['status'],
        where: { job: { companyId: companyProfile.id } },
        orderBy: { status: 'asc' },
        _count: true,
      }),
      prisma.savedCandidate.count({ where: { employerId: userId } }),
      prisma.savedSearch.count({ where: { userId } }),
      prisma.profileView.count({ where: { profileUserId: userId } }),
      prisma.companyProfile.findUnique({
        where: { userId },
        select: { isVerified: true, gstNumber: true },
      }),
    ]);

    // Calculate views from all jobs this week
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const viewsThisWeek = await prisma.jobPost.aggregate({
      where: { companyId: companyProfile.id, updatedAt: { gte: weekAgo } },
      _sum: { views: true },
    });

    return {
      totalJobs,
      activeJobs,
      totalApplications,
      applicationsByStatus: Object.fromEntries(statusCounts.map((s) => [s.status, s._count])),
      recentApplications,
      viewsThisWeek: viewsThisWeek._sum.views || 0,
      savedCandidatesCount,
      savedSearchesCount,
      profileViewsCount,
      verification: {
        isVerified: company?.isVerified || false,
        gstNumber: company?.gstNumber || null,
      },
    };
  }

  /**
   * Get Engagement Metrics (Time-to-Hire, Funnel, Conversion Rates)
   */
  async getEngagementMetrics(userId: string) {
    const companyProfile = await prisma.companyProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!companyProfile) throw new AppError('Company profile not found', 404);

    // Time-to-hire: avg days from appliedAt to hiredAt for HIRED applications
    const hiredApplications = await prisma.jobApplication.findMany({
      where: {
        job: { companyId: companyProfile.id },
        status: 'HIRED',
        hiredAt: { not: null },
      },
      select: { appliedAt: true, hiredAt: true },
    });

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

    // Funnel counts by status
    const statusCounts = await prisma.jobApplication.groupBy({
      by: ['status'],
      where: { job: { companyId: companyProfile.id } },
      _count: true,
    });
    const statusMap: Record<string, number> = {};
    statusCounts.forEach((s) => {
      statusMap[s.status] = s._count;
    });
    const totalApps = Object.values(statusMap).reduce((a, b) => a + b, 0);

    const funnel = {
      applied: totalApps,
      viewed: statusMap['VIEWED'] || 0,
      shortlisted: statusMap['SHORTLISTED'] || 0,
      interviewScheduled: statusMap['INTERVIEW_SCHEDULED'] || 0,
      offered: statusMap['OFFERED'] || 0,
      hired: statusMap['HIRED'] || 0,
      rejected: statusMap['REJECTED'] || 0,
      withdrawn: statusMap['WITHDRAWN'] || 0,
    };

    // Conversion rates
    const pct = (num: number, den: number) =>
      den > 0 ? parseFloat(((num / den) * 100).toFixed(1)) : 0;
    const conversions = {
      appliedToViewed: pct(funnel.viewed, totalApps),
      viewedToShortlisted: pct(funnel.shortlisted, funnel.viewed || totalApps),
      shortlistedToInterview: pct(funnel.interviewScheduled, funnel.shortlisted),
      interviewToOffered: pct(funnel.offered, funnel.interviewScheduled || funnel.shortlisted),
      offeredToHired: pct(funnel.hired, funnel.offered),
      overallHireRate: pct(funnel.hired, totalApps),
    };

    // Hiring velocity: hires in last 6 months
    const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const recentHires = await prisma.jobApplication.count({
      where: {
        job: { companyId: companyProfile.id },
        status: 'HIRED',
        hiredAt: { gte: sixMonthsAgo },
      },
    });
    const hiringVelocity = Math.round((recentHires / 6) * 10) / 10;

    return {
      avgTimeToHireDays,
      funnel,
      conversions,
      hiringVelocity,
      totalHires: hiredApplications.length,
    };
  }

  /**
   * Upload Company Logo
   */
  async uploadLogo(userId: string, file: Express.Multer.File) {
    // Fetch old logo URL for cleanup
    const existing = await prisma.companyProfile.findUnique({
      where: { userId },
      select: { logo: true },
    });

    const uploadResult = await uploadImage(
      profileImageBufferOrPath(file),
      uploadOptions.companyLogo
    );

    // Delete old logo from Cloudinary
    if (existing?.logo) {
      const oldPublicId = extractPublicId(existing.logo);
      if (oldPublicId) deleteImage(oldPublicId).catch(() => {});
    }

    // Slug — only assigned on first-time create. The logo-upload upsert
    // creates the company row with the placeholder name "My Company" if
    // the user hasn't completed their profile yet; we still seed a slug
    // so any subsequent public-search index emit has a stable URL. The
    // slug is stable thereafter (rename in completeProfile won't replace it).
    const existingForSlug = await prisma.companyProfile.findUnique({
      where: { userId },
      select: { slug: true },
    });
    let logoUploadSlug = existingForSlug?.slug ?? null;
    if (!logoUploadSlug) {
      const { buildCompanySlug } = await import('../lib/slugs');
      logoUploadSlug = await buildCompanySlug('My Company', {
        isTaken: async (candidate) => {
          const taken = await prisma.companyProfile.findFirst({
            where: { slug: candidate, NOT: { userId } },
            select: { id: true },
          });
          return Boolean(taken);
        },
      });
    }

    const profile = await prisma.companyProfile.upsert({
      where: { userId },
      create: {
        userId,
        companyName: 'My Company',
        logo: uploadResult.secure_url,
        ...(logoUploadSlug ? { slug: logoUploadSlug } : {}),
      },
      update: {
        logo: uploadResult.secure_url,
      },
    });

    // Queue image variant generation (fire-and-forget)
    import('../jobs/image-processing.queue')
      .then(({ addImageJob }) =>
        addImageJob({
          entityType: 'company',
          entityId: profile.id,
          userId,
          imageUrl: uploadResult.secure_url,
          field: 'logo',
        })
      )
      .catch(() => {});

    return profile;
  }

  /**
   * Remove Company Logo
   */
  async removeLogo(userId: string) {
    // Fetch current logo URL for cleanup
    const existing = await prisma.companyProfile.findUnique({
      where: { userId },
      select: { logo: true },
    });

    await prisma.companyProfile.update({
      where: { userId },
      data: { logo: null },
    });

    // Delete from Cloudinary
    if (existing?.logo) {
      const publicId = extractPublicId(existing.logo);
      if (publicId) deleteImage(publicId).catch(() => {});
    }
  }

  /**
   * Upload Cover Image
   */
  async uploadCoverImage(userId: string, file: Express.Multer.File) {
    const company = await prisma.companyProfile.findUnique({
      where: { userId },
      select: { id: true, coverImage: true },
    });
    if (!company) throw new AppError('Company profile not found', 404);

    // Delete old cover image from Cloudinary if exists
    if (company.coverImage) {
      const oldPublicId = extractPublicId(company.coverImage);
      if (oldPublicId) deleteImage(oldPublicId).catch(() => {});
    }

    // Upload new cover image
    const uploadResult = await uploadImage(
      profileImageBufferOrPath(file),
      uploadOptions.companyCover
    );

    // Update database
    await prisma.companyProfile.update({
      where: { userId },
      data: { coverImage: uploadResult.secure_url },
    });

    return uploadResult.secure_url;
  }

  /**
   * Remove Cover Image
   */
  async removeCoverImage(userId: string) {
    const company = await prisma.companyProfile.findUnique({
      where: { userId },
      select: { id: true, coverImage: true },
    });
    if (!company) throw new AppError('Company profile not found', 404);

    if (company.coverImage) {
      const publicId = extractPublicId(company.coverImage);
      if (publicId) deleteImage(publicId).catch(() => {});
    }

    await prisma.companyProfile.update({
      where: { userId },
      data: { coverImage: null },
    });
  }

  /**
   * Get company profile completeness percentage
   */
  async getProfileCompleteness(userId: string) {
    const profile = await prisma.companyProfile.findUnique({
      where: { userId },
      select: {
        accountType: true,
        companyName: true,
        companyType: true,
        tagline: true,
        logo: true,
        coverImage: true,
        industry: true,
        companySize: true,
        description: true,
        whyWorkForUs: true,
        website: true,
        foundedYear: true,
        gstNumber: true,
        cinNumber: true,
        llpinNumber: true,
        benefits: true,
        techStack: true,
        productsServices: true,
        specialties: true,
        companyCulture: true,
        missionStatement: true,
        coreValues: true,
        socialLinks: true,
        contactEmail: true,
        contactPhone: true,
        contactPersonName: true,
        headquarters: true,
        locations: true,
        addressLine1: true,
        city: true,
        state: true,
        pincode: true,
        leadershipTeam: true,
        employeeTestimonials: true,
        officePhotos: true,
        interviewProcess: true,
        awardsRecognitions: true,
        companyVideoUrl: true,
        careersPageUrl: true,
        diversityStatement: true,
      },
    });
    if (!profile) return { percentage: 0, completed: [], missing: ['Create your company profile'] };

    const isIndividual = profile.accountType === 'INDIVIDUAL';

    const checks: Array<{ field: string; weight: number; check: boolean }> = [
      {
        field: 'Company Basics',
        weight: 15,
        check: isIndividual
          ? !!(profile.companyName && profile.industry)
          : !!(
              profile.companyName &&
              profile.industry &&
              profile.companyType &&
              profile.companySize
            ),
      },
      {
        field: 'Company Description',
        weight: 12,
        check: !!(profile.description && profile.description.length >= 50),
      },
      { field: 'Logo & Branding', weight: 8, check: !!profile.logo },
      { field: 'Website & Links', weight: 8, check: !!profile.website },
      {
        field: 'Contact Info',
        weight: 10,
        check: isIndividual
          ? !!(profile.contactEmail && profile.contactPhone)
          : !!(profile.contactEmail && profile.contactPhone && profile.contactPersonName),
      },
      {
        field: 'Office Location',
        weight: 8,
        check: !!(profile.headquarters || (profile.addressLine1 && profile.city && profile.state)),
      },
      {
        field: 'Why Work For Us',
        weight: isIndividual ? 0 : 8,
        check: !!(profile.whyWorkForUs && profile.whyWorkForUs.length >= 30),
      },
      {
        field: 'Benefits & Perks',
        weight: isIndividual ? 0 : 7,
        check: profile.benefits.length > 0,
      },
      {
        field: 'Culture & Values',
        weight: isIndividual ? 0 : 6,
        check: !!(
          profile.companyCulture ||
          profile.missionStatement ||
          profile.coreValues.length > 0
        ),
      },
      {
        field: 'Social Profiles',
        weight: 5,
        check: !!(
          profile.socialLinks &&
          Object.values(profile.socialLinks as Record<string, string>).some((v) => !!v)
        ),
      },
      {
        field: 'Tech Stack / Products',
        weight: 4,
        check: !!(profile.techStack.length > 0 || profile.productsServices.length > 0),
      },
      {
        // LLPIN counts too — LLPs carry an LLPIN INSTEAD of a CIN, so
        // without it an LLP could never earn this completeness credit.
        // TAN is deliberately excluded: it's a tax-deduction id, not a
        // registration number.
        field: 'Registration (GST/CIN/LLPIN)',
        weight: isIndividual ? 0 : 3,
        check: !!(profile.gstNumber || profile.cinNumber || profile.llpinNumber),
      },
      {
        field: 'Team & Testimonials',
        weight: isIndividual ? 0 : 3,
        check: !!(
          (profile.leadershipTeam as any[])?.length > 0 ||
          (profile.employeeTestimonials as any[])?.length > 0
        ),
      },
      {
        field: 'Media & Photos',
        weight: 3,
        check: !!(
          profile.coverImage ||
          (profile.officePhotos as any[])?.length > 0 ||
          profile.companyVideoUrl
        ),
      },
    ];

    // Filter out zero-weight checks (not applicable for this account type)
    const applicableChecks = checks.filter((c) => c.weight > 0);
    // Normalize weights to sum to exactly 100 (floor + distribute remainder)
    const totalWeight = applicableChecks.reduce((acc, c) => acc + c.weight, 0);
    const normalizedChecks = applicableChecks.map((c) => ({
      ...c,
      weight: Math.floor((c.weight / totalWeight) * 100),
    }));
    // Distribute remainder to avoid sum < 100
    let remainder = 100 - normalizedChecks.reduce((acc, c) => acc + c.weight, 0);
    for (let i = 0; remainder > 0 && i < normalizedChecks.length; i++) {
      normalizedChecks[i].weight++;
      remainder--;
    }

    const completed = normalizedChecks.filter((c) => c.check).map((c) => c.field);
    const missing = normalizedChecks.filter((c) => !c.check).map((c) => c.field);
    const percentage = normalizedChecks.reduce((acc, c) => acc + (c.check ? c.weight : 0), 0);

    return { percentage, completed, missing };
  }
}

// Helper (Shared with Candidate Service, ideally moved to utils)
const profileImageBufferOrPath = (file: Express.Multer.File): string | Buffer => {
  return file.buffer;
};

export const employerService = new EmployerService();
