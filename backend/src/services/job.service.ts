import { prisma } from '../config/prisma';
import logger from '../config/logger';
import { AppError } from '../middleware/error';
import type {
  JobType,
  WorkMode,
  ShiftType,
  ExperienceLevel,
  EducationLevel,
  SalaryType,
  FunctionalArea,
  NoticePeriodPreference,
  SpecificDegree,
  GenderPreference,
  DrivingLicenseType,
  PostingVisibility,
  ApplyMethod,
} from '@prisma/client';
import {
  Prisma,
  JobStatus,
  ApplicationStatus,
  Role,
  ScreeningQuestionType,
  UrgencyLevel,
} from '@prisma/client';
import { searchService } from './search.service';
import { PAGINATION } from '@/constants';
import {} from '../kafka/producer';
import { publishEvent } from '../kafka/producer';
import { KafkaTopics } from '../kafka/topics';
import { trackEvent, getClientId } from './analytics.service';
import { notificationService } from './notification.service';
import { moderationService } from './moderation.service';
import { talentMatchingService } from './talent-matching.service';
import { withLock } from '../utils/distributed-lock';
import { addReindexJob } from '../jobs/es-reindex.queue';
import redis from '../config/redis';
import { trackJobView } from '../utils/trending';

interface ScreeningQuestionInput {
  question: string;
  questionType?: ScreeningQuestionType;
  isRequired?: boolean;
  isDealBreaker?: boolean;
  options?: string[];
  idealAnswer?: string;
  displayOrder?: number;
}

interface ScreeningAnswerInput {
  questionId: string;
  answer: string;
}

interface CreateJobDto {
  title: string;
  description: string;
  requirements?: string;
  benefits?: string;
  keyResponsibilities?: string;
  type: JobType;
  industry?: string;
  department?: string;
  roleCategory?: string;
  location: string;
  isRemote?: boolean;
  workMode?: WorkMode;
  shiftType?: ShiftType;
  experienceMin?: number;
  experienceMax?: number;
  experienceLevel?: ExperienceLevel;
  educationRequired?: EducationLevel;
  preferredEducationField?: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  salaryType?: SalaryType;
  salaryDisclosed?: boolean;
  jobPerks?: string[];
  skillsRequired?: string[];
  niceToHaveSkills?: string[];
  certificationsRequired?: string[];
  languagesRequired?: any;
  tags?: string[];
  numberOfOpenings?: number;
  urgencyLevel?: UrgencyLevel;
  isFeatured?: boolean;
  isPremium?: boolean;
  travelRequired?: boolean;
  relocationAssistance?: boolean;
  expiresAt?: Date | string;
  applicationDeadline?: Date | string;
  interviewProcess?: string;
  isWalkIn?: boolean;
  walkInDetails?: any;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  // Enterprise fields
  functionalArea?: FunctionalArea;
  ugRequired?: EducationLevel;
  pgRequired?: EducationLevel;
  specificDegrees?: SpecificDegree[];
  degreeSpecializations?: string[];
  salaryNegotiable?: boolean;
  noticePeriodPreference?: NoticePeriodPreference[];
  isConfidential?: boolean;
  referenceCode?: string;
  additionalLocations?: string[];
  accommodationProvided?: boolean;
  walkInStartDate?: string;
  walkInEndDate?: string;
  walkInTime?: string;
  walkInVenue?: string;
  walkInContactPerson?: string;
  walkInContactPhone?: string;
  walkInInstructions?: string;
  diversityTags?: string[];
  visaSponsorshipAvailable?: boolean;
  backgroundCheckRequired?: boolean;
  isPwdFriendly?: boolean;
  passportRequired?: boolean;
  bondDetails?: string;
  drivingLicenseRequired?: DrivingLicenseType;
  ageMin?: number;
  ageMax?: number;
  genderPreference?: GenderPreference;
  postingVisibility?: PostingVisibility;
  applyMethod?: ApplyMethod;
  externalApplyUrl?: string;
  scheduledPublishAt?: string;
  screeningQuestions?: ScreeningQuestionInput[];
}

interface JobSearchFilters {
  keyword?: string;
  location?: string;
  type?: JobType;
  industry?: string;
  department?: string;
  salaryMin?: number;
  salaryMax?: number;
  experience?: string | number;
  experienceLevel?: ExperienceLevel;
  educationRequired?: EducationLevel;
  isRemote?: boolean;
  workMode?: WorkMode;
  shiftType?: ShiftType;
  companyType?: string;
  companySize?: string;
  postedAfter?: string;
  postedBefore?: string;
  tags?: string[];
  urgencyLevel?: UrgencyLevel;
  isFeatured?: boolean;
  isWalkIn?: boolean;
  sortBy?: 'relevance' | 'date' | 'salary' | 'distance';
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  page?: number;
  limit?: number;
  // Enterprise filters
  functionalArea?: FunctionalArea;
  noticePeriodPreference?: NoticePeriodPreference[];
  isPwdFriendly?: boolean;
  visaSponsorshipAvailable?: boolean;
  genderPreference?: GenderPreference;
  diversityTags?: string[];
  postingVisibility?: PostingVisibility;
}

/**
 * Seats filled on a posting = on-platform HIRED applications + hires the
 * employer recorded as happening off-platform.
 *
 * Kept as one helper because three call sites must agree on the definition:
 * the apply-time guard, the post-hire auto-close, and the employer's own
 * vacancy view. They used to each count HIRED applications inline, which meant
 * an off-platform hire was invisible to all of them.
 */
export async function getFilledSeats(jobId: string, offlineHiresCount = 0): Promise<number> {
  const hiredCount = await prisma.jobApplication.count({
    where: { jobId, status: 'HIRED' },
  });
  return hiredCount + Math.max(0, offlineHiresCount);
}

/**
 * Close a posting once every opening is filled.
 *
 * Previously a fully-filled job stayed OPEN: it kept appearing in search, job
 * alerts and cards while REJECTING every applicant with "All openings have
 * been filled" — the worst of both worlds. It now moves to CLOSED with
 * `closedReason: 'FILLED'`, which is the value the schema always documented
 * but which only the dev seed ever wrote.
 *
 * Safe to call repeatedly: it only acts on a job that is still OPEN and
 * genuinely full, so a second hire (or an offline-count edit) is a no-op.
 * Returns whether it closed anything, so callers can decide about notifying.
 */
export async function closeJobIfFilled(jobId: string): Promise<boolean> {
  const job = await prisma.jobPost.findUnique({
    where: { id: jobId },
    select: { id: true, status: true, numberOfOpenings: true, offlineHiresCount: true },
  });
  // No declared opening count means "unlimited" — nothing to fill up.
  if (!job || job.status !== 'OPEN' || !job.numberOfOpenings) return false;

  const filled = await getFilledSeats(jobId, job.offlineHiresCount);
  if (filled < job.numberOfOpenings) return false;

  await prisma.jobPost.update({
    where: { id: jobId },
    data: { status: JobStatus.CLOSED, closedReason: 'FILLED', closedAt: new Date() },
  });

  // Drop it out of search immediately — a closed job showing in results is the
  // same bug in a different place. Same `delete` action the expiry worker uses
  // for the same reason.
  try {
    const { addReindexJob } = await import('../jobs/es-reindex.queue');
    await addReindexJob({ indexType: 'job', documentId: jobId, action: 'delete' }).catch(() => {});
  } catch (err) {
    logger.error('Failed to queue reindex after auto-close', err);
  }

  return true;
}

export class JobService {
  /**
   * Create a new job post
   */
  async createJob(userId: string, data: CreateJobDto) {
    // 1. Get Company Profile ID
    const company = await prisma.companyProfile.findUnique({
      where: { userId },
      select: { id: true, isVerified: true },
    });

    if (!company) {
      throw new AppError(
        'Company profile not found. Please complete your employer profile first.',
        404
      );
    }

    // Plan-promise enforcement: respect feature.job_locations countable
    // (Free plan = 1 Location). Total locations = primary + additional.
    // Skipped when the user's plan doesn't declare a cap (= no limit).
    const additional = Array.isArray(
      (data as { additionalLocations?: string[] }).additionalLocations
    )
      ? (data as { additionalLocations?: string[] }).additionalLocations!.length
      : 0;
    const totalLocations = 1 + additional;
    const { getActiveEntitlementsForUser } = await import('./entitlement.service');
    const planSnapshot = await getActiveEntitlementsForUser(userId);
    const allFeatures = planSnapshot.entitlements.flatMap((e) => e.features);
    const maxLimitOf = (key: string): number | null =>
      allFeatures
        .filter((f) => f.key === key && f.included && f.countableLimit !== null)
        .reduce<number | null>((max, f) => {
          const limit = f.countableLimit ?? 0;
          return max == null ? limit : Math.max(max, limit);
        }, null);

    // Locations cap (Free=1)
    if (totalLocations > 1) {
      const cap = maxLimitOf('feature.job_locations');
      if (cap !== null && totalLocations > cap) {
        throw new AppError(
          `Your current plan allows ${cap} location${cap === 1 ? '' : 's'} per job. Upgrade to post jobs in more locations.`,
          402,
          'LOCATIONS_LIMIT_EXCEEDED'
        );
      }
    }

    // Urgent Hiring Badge — gated to Premium ₹999 plan (feature.urgent_hiring_badge).
    // If user requested URGENT/IMMEDIATE without entitlement, downgrade to NORMAL
    // so the post still goes through but doesn't get the priority badge unfairly.
    const requestedUrgency = (data as { urgencyLevel?: UrgencyLevel }).urgencyLevel;
    const hasUrgentBadge = Boolean(planSnapshot.features['feature.urgent_hiring_badge']);
    if (
      (requestedUrgency === UrgencyLevel.URGENT || requestedUrgency === UrgencyLevel.IMMEDIATE) &&
      !hasUrgentBadge
    ) {
      (data as { urgencyLevel?: UrgencyLevel }).urgencyLevel = UrgencyLevel.NORMAL;
    }

    // Plan-derived `expiresAt` — Free=7d, Standard=15d, Premium=30d. Read max
    // countableLimit on `feature.job_validity` from snapshot. Skipped (no
    // expiry) when no plan declares a validity cap.
    const validityDays = maxLimitOf('feature.job_validity');
    const planExpiry =
      validityDays !== null ? new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000) : undefined;

    /* The employer's chosen expiry, CLAMPED to what their plan allows.
       Previously the form had an "Expires on" date picker whose value was
       simply dropped on this path — the plan value always won, so the control
       was decorative and silently lied to the employer. Now:
         · pick a date inside the plan window  -> honoured (shorter is fine)
         · pick a date beyond the plan window  -> clamped to the plan cap
         · pick nothing                        -> plan cap, as before
       A plan with no validity cap means no expiry, so a chosen date is
       honoured as-is there. Past dates are ignored rather than creating a
       job that is born expired. */
    const requestedExpiry = data.expiresAt ? new Date(data.expiresAt) : undefined;
    const requestedIsUsable =
      requestedExpiry && !Number.isNaN(requestedExpiry.getTime()) && requestedExpiry > new Date();
    const expiresAtFromPlan = !requestedIsUsable
      ? planExpiry
      : planExpiry && requestedExpiry! > planExpiry
        ? planExpiry
        : requestedExpiry;

    // Plan-derived listing/search visibility. Standard=Top Listing Boost
    // (isFeatured=true → +15 ES weight). Premium=Top Search Visibility
    // (isPremium=true → +20 ES weight). Both keys are BOOLEAN features.
    const planIsFeatured = Boolean(planSnapshot.features['feature.top_listing_boost']);
    const planIsPremium = Boolean(planSnapshot.features['feature.top_search_visibility']);

    return this._persistNewJob({
      companyId: company.id,
      data,
      expiresAt: expiresAtFromPlan,
      isFeatured: planIsFeatured || Boolean(data.isFeatured),
      isPremium: planIsPremium || Boolean(data.isPremium),
      actorUserId: userId,
      notifyUserId: userId,
      consumeQuota: true,
    });
  }

  /**
   * Create a job ON BEHALF of a company (super-admin tool).
   *
   * Differs from the employer `createJob` only in the framing, not the
   * downstream effects: the company is chosen explicitly (not derived from
   * the actor) and plan-gating is bypassed entirely (admin override) — no
   * job-post quota is consumed, location/validity/urgency caps don't apply,
   * and `isFeatured`/`isPremium` honour the form's explicit values. All the
   * real work (moderation, slug, indexing, geocoding, matching, follower
   * notifications, IndexNow, Kafka, Cloud Talent sync) runs identically via
   * the shared `_persistNewJob`. The company OWNER is notified, and the
   * acting super-admin is recorded for analytics/audit.
   */
  async createJobForCompany(companyId: string, data: CreateJobDto, actorUserId: string) {
    const company = await prisma.companyProfile.findUnique({
      where: { id: companyId },
      select: { id: true, userId: true },
    });
    if (!company) {
      throw new AppError('Company not found', 404, 'COMPANY_NOT_FOUND');
    }
    return this._persistNewJob({
      companyId: company.id,
      data,
      // Admin override — no plan to derive validity/visibility from; honour
      // whatever the form set (expiry optional, featured/premium explicit).
      expiresAt: (data as { expiresAt?: string }).expiresAt
        ? new Date((data as { expiresAt?: string }).expiresAt as string)
        : undefined,
      isFeatured: Boolean(data.isFeatured),
      isPremium: Boolean(data.isPremium),
      actorUserId,
      notifyUserId: company.userId, // tell the company owner a job was posted for them
      consumeQuota: false,
    });
  }

  /**
   * Shared core for job creation — persists the record + screening questions
   * and fires every downstream side effect. Both the employer (`createJob`,
   * plan-gated) and super-admin (`createJobForCompany`, plan-bypassed) paths
   * funnel through here so the indexing / Kafka / Cloud-Talent / notification
   * logic lives in exactly one place.
   */
  private async _persistNewJob(params: {
    companyId: string;
    data: CreateJobDto;
    expiresAt: Date | undefined;
    isFeatured: boolean;
    isPremium: boolean;
    actorUserId: string;
    /** Employer/company owner to notify + (optionally) charge quota against. */
    notifyUserId: string | null;
    /** When true, consume 1 JOB_POST credit from `notifyUserId`'s pool. */
    consumeQuota: boolean;
  }): Promise<{ job: any; suggestedFilters: any }> {
    const {
      companyId,
      data,
      expiresAt,
      isFeatured,
      isPremium,
      actorUserId,
      notifyUserId,
      consumeQuota,
    } = params;

    // Content moderation screening
    const contentToScreen = [data.title, data.description, data.requirements]
      .filter(Boolean)
      .join(' ');
    const moderationResult = moderationService.screenContent(contentToScreen);
    if (moderationResult.severity === 'high' || moderationResult.severity === 'medium') {
      throw new AppError(
        `Job content contains prohibited terms: ${moderationResult.flaggedTerms.join(', ')}. Please revise your listing.`,
        400,
        'CONTENT_FLAGGED'
      );
    }

    // Extract screening questions (created separately)
    const { screeningQuestions: sqInput, ...jobData } = data;

    // Convert date strings to Date objects
    const dateFields: Record<string, Date | undefined> = {};
    if (jobData.walkInStartDate) dateFields.walkInStartDate = new Date(jobData.walkInStartDate);
    if (jobData.walkInEndDate) dateFields.walkInEndDate = new Date(jobData.walkInEndDate);
    if (jobData.scheduledPublishAt) {
      dateFields.scheduledPublishAt = new Date(jobData.scheduledPublishAt);
    }

    // If scheduled for future, keep as DRAFT
    const statusOverride = jobData.scheduledPublishAt ? { status: JobStatus.DRAFT } : {};

    // SEO slug — kebab-cased {title}-{company}-{city}-{shortid8}. The
    // shortid suffix makes collisions effectively impossible without
    // needing a DB pre-check, while keeping URLs human-readable.
    // Reused on the public /jobs/{slug} route for canonical detail pages.
    const { buildJobSlug } = await import('../lib/slugs');
    const companyForSlug = await prisma.companyProfile.findUnique({
      where: { id: companyId },
      select: { slug: true, companyName: true },
    });
    const jobSlug = buildJobSlug({
      title: data.title,
      companyName: companyForSlug?.companyName,
      companySlug: companyForSlug?.slug,
      city: data.location,
    });

    const job = await prisma.jobPost.create({
      data: {
        companyId,
        ...jobData,
        ...dateFields,
        ...statusOverride,
        salaryMin: jobData.salaryMin ? Number(jobData.salaryMin) : undefined,
        salaryMax: jobData.salaryMax ? Number(jobData.salaryMax) : undefined,
        experienceMin: jobData.experienceMin ? Number(jobData.experienceMin) : 0,
        experienceMax: jobData.experienceMax ? Number(jobData.experienceMax) : undefined,
        isRemote: Boolean(jobData.isRemote),
        expiresAt,
        isFeatured,
        isPremium,
        slug: jobSlug,
      },
    });

    // Bulk-create screening questions
    if (sqInput && sqInput.length > 0) {
      await prisma.screeningQuestion.createMany({
        data: sqInput.map((q, idx) => ({
          jobId: job.id,
          question: q.question,
          questionType: q.questionType || ScreeningQuestionType.TEXT,
          isRequired: q.isRequired ?? false,
          isDealBreaker: q.isDealBreaker ?? false,
          options: q.options || undefined,
          idealAnswer: q.idealAnswer,
          displayOrder: q.displayOrder ?? idx,
        })),
      });
    }

    // INDEXING: Queue ES reindex (async via BullMQ)
    addReindexJob({ indexType: 'job', documentId: job.id, action: 'index' }).catch((err: any) =>
      logger.error('Failed to queue ES reindex for job', err)
    );

    // Fetch full job for Cloud Talent sync + Kafka enrichment
    const jobForIndex = await prisma.jobPost.findUnique({
      where: { id: job.id },
      include: {
        company: {
          select: { id: true, companyName: true },
        },
      },
    });

    // Trigger geocoding if location provided
    if (data.location) {
      import('../jobs/geocoding.queue')
        .then(({ addGeocodingJob }) =>
          addGeocodingJob({ entityType: 'job', entityId: job.id, address: data.location })
        )
        .catch(() => {});
    }

    // Trigger candidate matching
    try {
      const { matchingQueue } = await import('../jobs/matching.queue');
      await matchingQueue.add('match-candidates', { jobId: job.id });
    } catch (err) {
      logger.error('Failed to enqueue matching job', err);
    }

    // Fan-out follow notifications — every candidate following this
    // company gets an in-app notification ("New job from {company}").
    // Fire-and-forget; failures don't block the job-creation response.
    if (job.status === 'OPEN' && job.publicSearchable) {
      try {
        const { enqueueFollowerNotify } = await import('../jobs/follower-notify.queue');
        await enqueueFollowerNotify({ companyId, jobId: job.id });
      } catch (err) {
        logger.warn('Failed to enqueue follower-notify (non-fatal)', err);
      }

      // Instant-indexing ping — Bing/Yandex/Naver pick up the new job
      // within minutes instead of waiting for the next sitemap crawl.
      try {
        const { notifyJobChanged } = await import('./indexnow.service');
        notifyJobChanged(job.slug);
      } catch {
        // never fatal — IndexNow is best-effort
      }
    }

    // Publish Kafka event (enriched for BigQuery analytics)
    publishEvent(KafkaTopics.JOB_POSTED, job.id, {
      jobId: job.id,
      companyId,
      title: data.title,
      skills: data.skillsRequired || [],
      salary_min: data.salaryMin ? Number(data.salaryMin) : null,
      salary_max: data.salaryMax ? Number(data.salaryMax) : null,
      industry: data.industry || null,
      location: data.location || null,
    });

    // Consume JOB_POST quota — Phase 13 plan-gating wiring. Skipped for the
    // super-admin override path (consumeQuota=false). Best-effort: if the
    // user has no entitlement, the consume call throws 402 PAYMENT_REQUIRED
    // but we swallow it here because the gate runs upstream in middleware/UI.
    if (consumeQuota && notifyUserId) {
      const quotaUserId = notifyUserId;
      void (async () => {
        try {
          const { consumeResource } = await import('./entitlement.service');
          await consumeResource({
            userId: quotaUserId,
            unit: 'JOB_POST',
            amount: 1,
            refType: 'JOB_POST',
            refId: job.id,
            notes: `Job created: ${data.title}`,
          });
        } catch (err) {
          // Don't break job creation on quota errors; log for the audit trail.
          logger.warn('JOB_POST quota consumption skipped', {
            userId: quotaUserId,
            jobId: job.id,
            err: err instanceof Error ? err.message : err,
          });
        }
      })();
    }

    // GA4: track job_posted (attributed to the actor — employer or super-admin)
    trackEvent(getClientId(actorUserId), {
      name: 'job_posted',
      params: { job_id: job.id, job_type: data.type },
    }).catch(() => {});

    // Notify the employer/company owner (email + in-app)
    if (notifyUserId) {
      notificationService.notifyJobPosted(notifyUserId, data.title, job.id).catch(() => {});
    }

    // Sync to Cloud Talent for AI recommendations
    if (jobForIndex) {
      talentMatchingService
        .syncJobToTalent({
          id: jobForIndex.id,
          title: jobForIndex.title,
          description: jobForIndex.description,
          location: jobForIndex.location,
          company: jobForIndex.company
            ? { id: jobForIndex.company.id, companyName: jobForIndex.company.companyName }
            : null,
          skills: (jobForIndex as any).skillsRequired || [],
          jobType: (jobForIndex as any).type || '',
          workMode: (jobForIndex as any).workMode,
          experienceLevel: (jobForIndex as any).experienceLevel,
          industry: (jobForIndex as any).industry,
          salaryMin: (jobForIndex as any).salaryMin ? Number((jobForIndex as any).salaryMin) : null,
          salaryMax: (jobForIndex as any).salaryMax ? Number((jobForIndex as any).salaryMax) : null,
          currency: (jobForIndex as any).currency,
        })
        .catch(() => {});
    }

    // Build suggested candidate search filters from job requirements
    const suggestedFilters = {
      skills: data.skillsRequired || [],
      location: data.location,
      experienceMin: data.experienceMin,
      experienceMax: data.experienceMax,
      experienceLevel: data.experienceLevel,
      educationRequired: data.educationRequired,
      preferredWorkMode: data.workMode,
      preferredJobType: data.type,
      industry: data.industry,
      department: data.department,
      noticePeriod: data.noticePeriodPreference,
      expectedSalaryMax: data.salaryMax ? Number(data.salaryMax) : undefined,
    };

    return { job, suggestedFilters };
  }

  /**
   * Get a single job by ID (and increment views)
   */
  async getJob(id: string) {
    const job = await prisma.jobPost.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            id: true,
            slug: true,
            companyName: true,
            companyType: true,
            logo: true,
            coverImage: true,
            tagline: true,
            industry: true,
            subIndustry: true,
            companySize: true,
            employeeCount: true,
            foundedYear: true,
            website: true,
            headquarters: true,
            city: true,
            state: true,
            locations: true,
            description: true,
            isVerified: true,
            userId: true,
          },
        },
        screeningQuestions: {
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    if (!job) {
      throw new AppError('Job not found', 404);
    }

    // Increment view counter in Redis (batch-flushed to DB every 5 min)
    redis.incr(`job:views:${id}`).catch(() => {});

    // Track in trending sorted set (fire-and-forget)
    trackJobView(id).catch(() => {});

    const _hiredCount = await prisma.jobApplication.count({
      where: { jobId: id, status: 'HIRED' },
    });

    // Attach company review aggregate so the Company tab on the
    // candidate job-detail page can render the rating badge.
    let companyWithReviews = job.company as typeof job.company & {
      averageRating?: number;
      totalReviews?: number;
    };
    if (job.company?.id) {
      const { getAggregatesForCompanyIds } = await import('./review-aggregate.service');
      const aggMap = await getAggregatesForCompanyIds([job.company.id]);
      const agg = aggMap.get(job.company.id);
      companyWithReviews = {
        ...job.company,
        averageRating: agg?.averageRating ?? 0,
        totalReviews: agg?.totalReviews ?? 0,
      };
    }

    return { ...job, company: companyWithReviews, _hiredCount };
  }

  /**
   * Search Jobs with Filters (Elasticsearch + Prisma Fallback)
   */
  async searchJobs(filters: JobSearchFilters) {
    const page = filters.page || PAGINATION.DEFAULT_PAGE;
    const limit = filters.limit || PAGINATION.DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    // 1. Try Elasticsearch — use ES whenever any filter is set (not just keyword/location)
    const ignoreKeys = new Set(['page', 'limit', 'sortBy']);
    const hasSearchCriteria = Object.entries(filters).some(
      ([key, val]) => !ignoreKeys.has(key) && val !== undefined && val !== null && val !== ''
    );
    if (hasSearchCriteria) {
      try {
        const { hits, total, facets } = await searchService.searchJobs(filters.keyword, {
          ...filters,
          from: skip,
          size: limit,
        });

        return {
          jobs: hits,
          pagination: { total, page, limit, pages: Math.ceil(total / limit) },
          facets: facets || {},
        };
      } catch (error) {
        logger.warn('Elasticsearch failed, falling back to database search', error);
      }
    }

    // 2. Prisma Fallback
    const where: any = { status: JobStatus.OPEN };

    if (filters.keyword) {
      where.OR = [
        { title: { contains: filters.keyword, mode: 'insensitive' } },
        { description: { contains: filters.keyword, mode: 'insensitive' } },
        { company: { companyName: { contains: filters.keyword, mode: 'insensitive' } } },
      ];
    }
    if (filters.location) {
      where.location = { contains: filters.location, mode: 'insensitive' };
    }
    if (filters.type) {
      where.type = filters.type;
    }
    if (filters.industry) {
      where.industry = { contains: filters.industry, mode: 'insensitive' };
    }
    if (filters.isRemote) {
      where.isRemote = true;
    }
    if (filters.workMode) {
      where.workMode = filters.workMode;
    }
    if (filters.shiftType) {
      where.shiftType = filters.shiftType;
    }
    if (filters.experienceLevel) {
      where.experienceLevel = filters.experienceLevel;
    }
    if (filters.educationRequired) {
      where.educationRequired = filters.educationRequired;
    }
    if (filters.salaryMin) {
      where.salaryMax = { ...where.salaryMax, gte: filters.salaryMin };
    }
    if (filters.salaryMax) {
      where.salaryMin = { ...where.salaryMin, lte: filters.salaryMax };
    }
    if (filters.experience !== undefined) {
      const expStr = String(filters.experience);
      const rangeMatch = expStr.match(/^(\d+)-(\d+)$/);
      const plusMatch = expStr.match(/^(\d+)\+$/);
      if (rangeMatch) {
        where.experienceMin = { lte: Number(rangeMatch[2]) };
        where.experienceMax = { gte: Number(rangeMatch[1]) };
      } else if (plusMatch) {
        where.experienceMax = { gte: Number(plusMatch[1]) };
      } else {
        const num = Number(expStr);
        if (!isNaN(num)) where.experienceMin = { lte: num };
      }
    }
    if (filters.urgencyLevel) {
      where.urgencyLevel = filters.urgencyLevel;
    }
    if (filters.isFeatured !== undefined) {
      where.isFeatured = filters.isFeatured;
    }
    if (filters.isWalkIn !== undefined) {
      where.isWalkIn = filters.isWalkIn;
    }
    if (filters.department) {
      where.department = { contains: filters.department, mode: 'insensitive' };
    }
    if (filters.postedAfter) {
      where.createdAt = { ...where.createdAt, gte: new Date(filters.postedAfter) };
    }
    if (filters.postedBefore) {
      where.createdAt = { ...where.createdAt, lte: new Date(filters.postedBefore) };
    }
    if (filters.tags && filters.tags.length > 0) {
      where.tags = { hasSome: filters.tags };
    }
    // Enterprise filters (Prisma fallback)
    if (filters.functionalArea) {
      where.functionalArea = filters.functionalArea;
    }
    if (filters.noticePeriodPreference && filters.noticePeriodPreference.length > 0) {
      where.noticePeriodPreference = { hasSome: filters.noticePeriodPreference };
    }
    if (filters.isPwdFriendly !== undefined) {
      where.isPwdFriendly = filters.isPwdFriendly;
    }
    if (filters.visaSponsorshipAvailable !== undefined) {
      where.visaSponsorshipAvailable = filters.visaSponsorshipAvailable;
    }
    if (filters.genderPreference) {
      where.genderPreference = filters.genderPreference;
    }
    if (filters.diversityTags && filters.diversityTags.length > 0) {
      where.diversityTags = { hasSome: filters.diversityTags };
    }
    // Filter out INTERNAL-only postings for non-employer searches
    if (!filters.postingVisibility) {
      where.postingVisibility = { in: ['PUBLIC', 'BOTH'] };
    } else {
      where.postingVisibility = filters.postingVisibility;
    }

    // Sort — 'relevance' and 'distance' need ES; in DB fallback, default to newest
    let orderBy: any = { createdAt: 'desc' };
    if (filters.sortBy === 'salary') {
      orderBy = { salaryMax: 'desc' };
    } else if (filters.sortBy === 'date') {
      orderBy = { createdAt: 'desc' };
    }

    const [rawJobs, total] = await prisma.$transaction([
      prisma.jobPost.findMany({
        where,
        include: {
          company: {
            select: {
              companyName: true,
              slug: true,
              logo: true,
              id: true,
              industry: true,
              companyType: true,
              companySize: true,
              isVerified: true,
              locations: true,
            },
          },
          applications: { where: { status: 'HIRED' }, select: { id: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.jobPost.count({ where }),
    ]);

    const jobs = rawJobs.map(({ applications, ...job }) => ({
      ...job,
      _hiredCount: applications.length,
    }));

    return {
      jobs,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  /**
   * Apply to a Job
   */
  async applyToJob(
    userId: string,
    jobId: string,
    coverLetter?: string,
    screeningAnswers?: ScreeningAnswerInput[]
  ) {
    // Check job exists and is accepting applications
    const jobPost = await prisma.jobPost.findUnique({
      where: { id: jobId },
      select: {
        status: true,
        numberOfOpenings: true,
        offlineHiresCount: true,
        companyId: true,
        company: { select: { userId: true } },
      },
    });
    if (!jobPost) throw new AppError('Job not found', 404);
    if (jobPost.status !== 'OPEN') {
      throw new AppError('This job is no longer accepting applications', 400);
    }
    if (jobPost.numberOfOpenings) {
      // Counts offline hires as well — previously an employer who filled the
      // role off-platform still had to accept applications for a seat that no
      // longer existed.
      const filled = await getFilledSeats(jobId, jobPost.offlineHiresCount);
      if (filled >= jobPost.numberOfOpenings) {
        throw new AppError('All openings for this position have been filled', 400);
      }
    }

    // Plan-promise enforcement: per-job applications cap. Free=50, Standard=250.
    // Premium ₹999 grants `feature.unlimited_applications` which bypasses.
    // No cap applied when poster has no plan (legacy/test data).
    if (jobPost.company?.userId) {
      try {
        const { getActiveEntitlementsForUser } = await import('./entitlement.service');
        const posterSnap = await getActiveEntitlementsForUser(jobPost.company.userId);
        const unlimited = Boolean(posterSnap.features['feature.unlimited_applications']);
        if (!unlimited) {
          const cap = posterSnap.entitlements
            .flatMap((e) => e.features)
            .filter(
              (f) => f.key === 'feature.applications' && f.included && f.countableLimit !== null
            )
            .reduce<number | null>((max, f) => {
              const v = f.countableLimit ?? 0;
              return max == null ? v : Math.max(max, v);
            }, null);
          if (cap !== null) {
            const currentApps = await prisma.jobApplication.count({ where: { jobId } });
            if (currentApps >= cap) {
              throw new AppError(
                'This job has reached the maximum number of applications.',
                400,
                'JOB_APP_CAP_REACHED'
              );
            }
          }
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
        // Snapshot lookup failure shouldn't block applies — log and continue.
        logger.warn('applyToJob — application cap check failed', {
          jobId,
          err: err instanceof Error ? err.message : err,
        });
      }
    }

    const candidate = await prisma.candidateProfile.findUnique({
      where: { userId },
      select: { id: true, resume: true },
    });

    if (!candidate) {
      throw new AppError('Candidate profile not found. Please complete your profile first.', 404);
    }

    let application;
    try {
      application = await prisma.jobApplication.create({
        data: {
          jobId,
          candidateId: candidate.id,
          coverLetter,
          resumeSnapshot: candidate.resume || null,
          status: ApplicationStatus.APPLIED,
        },
      });
    } catch (err) {
      // Unique constraint on jobId_candidateId catches concurrent duplicate applies
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError('You have already applied to this job', 400);
      }
      throw err;
    }

    // Bulk-create screening answers
    if (screeningAnswers && screeningAnswers.length > 0) {
      await prisma.screeningAnswer.createMany({
        data: screeningAnswers.map((a) => ({
          applicationId: application.id,
          questionId: a.questionId,
          answer: a.answer,
        })),
      });
    }

    // Publish Kafka event
    publishEvent(KafkaTopics.APPLICATION_SUBMITTED, application.id, {
      applicationId: application.id,
      jobId,
      candidateId: candidate.id,
      userId,
    });

    // Decrement the poster's APPLICATIONS pool. Best-effort and never
    // blocks a candidate's apply — the per-job cap above is the
    // enforcement; this keeps the employer's credits page truthful.
    const posterUserId = jobPost.company?.userId;
    if (posterUserId) {
      void (async () => {
        try {
          const { consumeResource } = await import('./entitlement.service');
          await consumeResource({
            userId: posterUserId,
            unit: 'APPLICATIONS',
            amount: 1,
            refType: 'APPLICATION',
            refId: application.id,
            notes: `Application received on job ${jobId}`,
          });
        } catch (err) {
          logger.warn('APPLICATIONS quota consumption skipped', {
            jobId,
            applicationId: application.id,
            err: err instanceof Error ? err.message : err,
          });
        }
      })();
    }

    // GA4: track application_submitted
    trackEvent(getClientId(userId), {
      name: 'application_submitted',
      params: { job_id: jobId },
    }).catch(() => {});

    // Notify employer about the new application
    const jobWithCompany = await prisma.jobPost.findUnique({
      where: { id: jobId },
      select: { title: true, company: { select: { userId: true, companyName: true } } },
    });
    if (jobWithCompany?.company?.userId) {
      const candidateUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
      });
      const candidateName =
        [candidateUser?.firstName, candidateUser?.lastName].filter(Boolean).join(' ') ||
        'A candidate';
      notificationService
        .notifyNewApplication(
          jobWithCompany.company.userId,
          candidateName,
          jobWithCompany.title,
          jobId,
          application.id
        )
        .catch(() => {});

      // Confirm submission to candidate
      notificationService
        .notifyApplicationSubmitted(
          userId,
          jobWithCompany.title,
          jobWithCompany.company.companyName,
          jobId
        )
        .catch(() => {});

      // "More roles like this" — DELAYED, and keyed on the candidate so a
      // burst of applications in one session collapses into a single
      // follow-up. Sending it instantly would land on top of the submission
      // confirmation, which reads as spam rather than help.
      void (async () => {
        try {
          const [{ matchingQueue }, { safeJobId }] = await Promise.all([
            import('../jobs/matching.queue'),
            import('../jobs/job-id'),
          ]);
          await matchingQueue.add(
            'notify-similar-jobs',
            { userId, jobId, reason: 'applied' },
            { jobId: safeJobId('similar-jobs', userId), delay: 24 * 60 * 60 * 1000 }
          );
        } catch {
          /* best effort — a missed nudge must never fail the application */
        }
      })();
    }

    return application;
  }

  /**
   * Get Applications for a Job (Employer)
   */
  async getJobApplications(
    userId: string,
    jobId: string,
    page: number = PAGINATION.DEFAULT_PAGE,
    limit: number = PAGINATION.DEFAULT_LIMIT,
    status?: ApplicationStatus
  ) {
    const job = await prisma.jobPost.findFirst({
      where: { id: jobId, company: { userId } },
    });

    if (!job) {
      throw new AppError('Job not found or access denied', 404);
    }

    const cappedLimit = Math.min(limit, PAGINATION.MAX_LIMIT);
    const skip = (page - 1) * cappedLimit;
    const where = { jobId, ...(status ? { status } : {}) };

    const [applications, total] = await prisma.$transaction([
      prisma.jobApplication.findMany({
        where,
        include: {
          candidate: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  avatar: true,
                },
              },
            },
          },
          screeningAnswers: {
            include: { question: true },
          },
        },
        orderBy: { appliedAt: 'desc' },
        skip,
        take: cappedLimit,
      }),
      prisma.jobApplication.count({ where }),
    ]);

    // Strip raw R2 URLs — employers must use the signed download endpoint
    const items = applications.map((app) => ({
      ...app,
      resumeSnapshot: app.resumeSnapshot ? true : null,
      candidate: {
        ...app.candidate,
        resume: app.candidate.resume ? true : null,
        generatedResumeUrl: app.candidate.generatedResumeUrl ? true : null,
      },
    }));

    const totalPages = Math.ceil(total / cappedLimit) || 1;
    return { items, total, page, limit: cappedLimit, totalPages, hasMore: page < totalPages };
  }

  /**
   * Get Single Application by ID
   */
  async getApplicationById(userId: string, applicationId: string, userRole: Role) {
    const application = await prisma.jobApplication.findUnique({
      where: { id: applicationId },
      include: {
        job: {
          include: {
            company: {
              select: { id: true, userId: true, companyName: true, logo: true },
            },
          },
        },
        candidate: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                avatar: true,
              },
            },
          },
        },
        screeningAnswers: {
          include: { question: true },
          orderBy: { question: { displayOrder: 'asc' } },
        },
      },
    });

    if (!application) {
      throw new AppError('Application not found', 404);
    }

    // Authorization
    const isAdmin = userRole === Role.ADMIN || userRole === Role.SUPER_ADMIN;
    const isCandidate = application.candidate.userId === userId;
    const isEmployer = application.job.company.userId === userId;

    if (!isAdmin && !isCandidate && !isEmployer) {
      throw new AppError('Not authorized to view this application', 403);
    }

    // Strip R2 URLs for non-candidate access
    if (!isCandidate) {
      return {
        ...application,
        resumeSnapshot: application.resumeSnapshot ? true : null,
        candidate: {
          ...application.candidate,
          resume: application.candidate.resume ? true : null,
          generatedResumeUrl: application.candidate.generatedResumeUrl ? true : null,
        },
      };
    }

    return application;
  }

  /**
   * Update Application Status (Employer)
   */
  /**
   * Record hires made OFF the platform for a posting.
   *
   * The only way an employer can represent a seat filled by a walk-in,
   * referral or agency placement — those have no application row, so there is
   * nothing to mark HIRED. Absolute count, not a delta, so repeated saves from
   * a form are idempotent.
   *
   * Guards:
   *  · ownership — only the posting company's own user may set it
   *  · cannot exceed numberOfOpenings, and cannot drop below the number of
   *    on-platform hires already recorded (that would claim seats back that
   *    real candidates hold)
   * Closes the job when this tips it to full, exactly like an on-platform hire.
   */
  async updateOfflineHires(userId: string, jobId: string, offlineHiresCount: number) {
    const job = await prisma.jobPost.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        numberOfOpenings: true,
        company: { select: { userId: true, companyName: true } },
        title: true,
      },
    });
    if (!job) throw new AppError('Job not found', 404);
    if (job.company.userId !== userId) {
      throw new AppError('Not authorized to update this job', 403);
    }
    if (offlineHiresCount < 0) {
      throw new AppError('Offline hires cannot be negative', 400);
    }

    const onPlatformHires = await prisma.jobApplication.count({
      where: { jobId, status: 'HIRED' },
    });

    if (job.numberOfOpenings) {
      const maxOffline = job.numberOfOpenings - onPlatformHires;
      if (offlineHiresCount > maxOffline) {
        throw new AppError(
          `Only ${Math.max(0, maxOffline)} opening(s) remain after ${onPlatformHires} on-platform hire(s)`,
          400
        );
      }
    }

    const updated = await prisma.jobPost.update({
      where: { id: jobId },
      data: { offlineHiresCount },
      select: { id: true, numberOfOpenings: true, offlineHiresCount: true, status: true },
    });

    // May tip the posting to fully filled — same close path as a platform hire.
    const closed = await closeJobIfFilled(jobId).catch((err) => {
      logger.error('Auto-close after offline-hire update failed', err);
      return false;
    });

    return { ...updated, status: closed ? JobStatus.CLOSED : updated.status, onPlatformHires };
  }

  async updateApplicationStatus(
    userId: string,
    applicationId: string,
    status: ApplicationStatus,
    rejectionReason?: string
  ) {
    // Distributed lock prevents concurrent status updates on the same application
    const result = await withLock(`lock:app:${applicationId}`, 30, async () => {
      const application = await prisma.jobApplication.findUnique({
        where: { id: applicationId },
        include: { job: { include: { company: true } } },
      });

      if (!application) {
        throw new AppError('Application not found', 404);
      }

      if (application.job.company.userId !== userId) {
        throw new AppError('Not authorized to update this application', 403);
      }

      const updated = await prisma.jobApplication.update({
        where: { id: applicationId },
        data: {
          status,
          ...(status === 'REJECTED' && rejectionReason ? { rejectionReason } : {}),
          ...(status === 'VIEWED' && !application.viewedAt ? { viewedAt: new Date() } : {}),
          ...(status === 'SELECTED' ? { selectedAt: new Date() } : {}),
          ...(status === 'OFFERED' ? { offeredAt: new Date() } : {}),
          ...(status === 'HIRED' ? { hiredAt: new Date() } : {}),
        },
      });

      // Publish Kafka event
      publishEvent(KafkaTopics.APPLICATION_STATUS_CHANGED, applicationId, {
        applicationId,
        status,
        jobId: application.job.id,
        candidateId: application.candidateId,
      });

      // Notify Candidate (multi-channel: in_app, fcm, web_push, email, whatsapp)
      const appWithCandidate = await prisma.jobApplication.findUnique({
        where: { id: applicationId },
        include: { candidate: true, job: { include: { company: true } } },
      });

      if (appWithCandidate) {
        void import('./notification.service')
          .then(({ notificationService: ns }) => {
            return ns.notifyApplicationStatusChange(
              appWithCandidate.candidate.userId,
              appWithCandidate.job.title,
              appWithCandidate.job.company.companyName,
              status,
              appWithCandidate.job.id
            );
          })
          .catch((err: any) => logger.error('Failed to send status notification', err));
      }

      // ── Rejection: point them at other live roles ──
      // A rejection is the moment a candidate is most likely to disengage
      // entirely, and it is where Naukri/LinkedIn surface alternatives. Same
      // delayed, candidate-keyed, policy-gated nudge as the apply path — so a
      // recruiter clearing ten applications at once still produces at most one
      // message, and never on top of the rejection itself.
      if (status === 'REJECTED' && appWithCandidate) {
        void (async () => {
          try {
            const [{ matchingQueue }, { safeJobId }] = await Promise.all([
              import('../jobs/matching.queue'),
              import('../jobs/job-id'),
            ]);
            await matchingQueue.add(
              'notify-similar-jobs',
              {
                userId: appWithCandidate.candidate.userId,
                jobId: appWithCandidate.job.id,
                reason: 'rejected',
              },
              {
                jobId: safeJobId('similar-jobs', appWithCandidate.candidate.userId),
                delay: 24 * 60 * 60 * 1000,
              }
            );
          } catch {
            /* best effort — never fail a status change over a nudge */
          }
        })();
      }

      // Check if all openings are now filled and notify employer
      if (status === 'HIRED' && application.job.numberOfOpenings) {
        const filled = await getFilledSeats(application.job.id, application.job.offlineHiresCount);
        if (filled >= application.job.numberOfOpenings) {
          // Close the listing before notifying. It used to only notify and
          // leave the job OPEN, so it kept being surfaced while rejecting
          // every applicant.
          await closeJobIfFilled(application.job.id).catch((err) =>
            logger.error('Auto-close after hire failed', err)
          );
          notificationService
            .notifyAllOpeningsFilled(
              application.job.company.userId,
              application.job.title,
              application.job.id,
              filled,
              application.job.numberOfOpenings
            )
            .catch(() => {});
        }
      }

      return updated;
    });

    if (result === null) {
      throw new AppError(
        'Application is currently being updated by another request',
        409,
        'RESOURCE_LOCKED'
      );
    }

    return result;
  }

  /**
   * Get Applied Jobs (Candidate)
   */
  async getAppliedJobs(
    userId: string,
    page: number = PAGINATION.DEFAULT_PAGE,
    limit: number = PAGINATION.DEFAULT_LIMIT,
    status?: ApplicationStatus
  ) {
    const candidate = await prisma.candidateProfile.findUnique({ where: { userId } });
    if (!candidate) throw new AppError('Candidate profile not found', 404);

    const cappedLimit = Math.min(limit, PAGINATION.MAX_LIMIT);
    const skip = (page - 1) * cappedLimit;
    const where = { candidateId: candidate.id, ...(status ? { status } : {}) };

    const [items, total] = await prisma.$transaction([
      prisma.jobApplication.findMany({
        where,
        include: {
          job: {
            include: {
              company: {
                select: { id: true, companyName: true, logo: true, locations: true },
              },
            },
          },
        },
        orderBy: { appliedAt: 'desc' },
        skip,
        take: cappedLimit,
      }),
      prisma.jobApplication.count({ where }),
    ]);

    const totalPages = Math.ceil(total / cappedLimit) || 1;
    return { items, total, page, limit: cappedLimit, totalPages, hasMore: page < totalPages };
  }

  /**
   * Toggle Save Job (Candidate)
   */
  async toggleSaveJob(userId: string, jobId: string) {
    const existing = await prisma.savedJob.findUnique({
      where: {
        userId_jobId: {
          userId,
          jobId,
        },
      },
    });

    if (existing) {
      await prisma.savedJob.delete({
        where: { id: existing.id },
      });
      return { saved: false };
    } else {
      await prisma.savedJob.create({
        data: { userId, jobId },
      });
      return { saved: true };
    }
  }

  /**
   * Get Saved Jobs (Candidate)
   */
  async getSavedJobs(
    userId: string,
    page: number = PAGINATION.DEFAULT_PAGE,
    limit: number = PAGINATION.DEFAULT_LIMIT
  ) {
    const cappedLimit = Math.min(limit, PAGINATION.MAX_LIMIT);
    const skip = (page - 1) * cappedLimit;

    const [saved, total] = await prisma.$transaction([
      prisma.savedJob.findMany({
        where: { userId },
        include: {
          job: {
            include: {
              company: {
                select: { id: true, companyName: true, logo: true, locations: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: cappedLimit,
      }),
      prisma.savedJob.count({ where: { userId } }),
    ]);

    const items = saved.map((s) => ({ ...s.job, savedAt: s.createdAt, savedJobId: s.id }));
    const totalPages = Math.ceil(total / cappedLimit) || 1;
    return { items, total, page, limit: cappedLimit, totalPages, hasMore: page < totalPages };
  }

  /**
   * Withdraw Application (Candidate)
   */
  async withdrawApplication(userId: string, applicationId: string) {
    const candidate = await prisma.candidateProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!candidate) throw new AppError('Candidate profile not found', 404);

    const application = await prisma.jobApplication.findFirst({
      where: { id: applicationId, candidateId: candidate.id },
      include: { job: { select: { title: true, company: { select: { userId: true } } } } },
    });

    if (!application) throw new AppError('Application not found', 404);
    if (['WITHDRAWN', 'HIRED', 'REJECTED'].includes(application.status)) {
      throw new AppError(`Cannot withdraw application with status: ${application.status}`, 400);
    }

    const updated = await prisma.jobApplication.update({
      where: { id: applicationId },
      data: { status: ApplicationStatus.WITHDRAWN },
    });

    // Notify employer about withdrawal
    try {
      const { notificationService } = await import('./notification.service');
      const candidateUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
      });
      const candidateName =
        [candidateUser?.firstName, candidateUser?.lastName].filter(Boolean).join(' ') ||
        'A candidate';
      await notificationService.notifyApplicationWithdrawn(
        application.job.company.userId,
        candidateName,
        application.job.title,
        application.jobId
      );
    } catch {
      /* non-critical */
    }

    publishEvent(KafkaTopics.APPLICATION_STATUS_CHANGED, applicationId, {
      applicationId,
      status: 'WITHDRAWN',
      jobId: application.jobId,
    });

    return updated;
  }

  /**
   * Get employer's posted jobs with pagination
   */
  async getEmployerJobs(
    userId: string,
    filters: { status?: JobStatus; page?: number; limit?: number }
  ) {
    const company = await prisma.companyProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!company) throw new AppError('Company profile not found', 404);

    const page = filters.page || PAGINATION.DEFAULT_PAGE;
    const cappedLimit = Math.min(filters.limit || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
    const skip = (page - 1) * cappedLimit;
    const where: any = { companyId: company.id };
    if (filters.status) where.status = filters.status;

    const [rawJobs, total] = await prisma.$transaction([
      prisma.jobPost.findMany({
        where,
        include: {
          _count: { select: { applications: true } },
          applications: { where: { status: 'HIRED' }, select: { id: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: cappedLimit,
      }),
      prisma.jobPost.count({ where }),
    ]);
    const jobs = rawJobs.map(({ applications, ...job }) => ({
      ...job,
      _hiredCount: applications.length,
    }));
    return {
      jobs,
      pagination: { total, page, limit: cappedLimit, pages: Math.ceil(total / cappedLimit) },
    };
  }

  /**
   * Update a job post (employer must own it)
   */
  async updateJob(userId: string, jobId: string, data: any) {
    const job = await prisma.jobPost.findFirst({ where: { id: jobId, company: { userId } } });
    if (!job) throw new AppError('Job not found or access denied', 404);
    return this._persistJobUpdate(jobId, data, userId);
  }

  /**
   * Update ANY job (super-admin tool) — same effects as the employer update
   * but without the `company: { userId }` ownership scope, since a super-admin
   * edits on behalf of the company. The acting super-admin is recorded on the
   * Kafka event for audit.
   */
  async updateJobForCompany(jobId: string, data: any, actorUserId: string) {
    const job = await prisma.jobPost.findFirst({ where: { id: jobId } });
    if (!job) throw new AppError('Job not found', 404);
    return this._persistJobUpdate(jobId, data, actorUserId);
  }

  /** Shared core for job updates — used by both employer + super-admin paths. */
  private async _persistJobUpdate(jobId: string, data: any, actorUserId: string) {
    // Extract screening questions for separate handling
    const { screeningQuestions: sqInput, ...updateData } = data;

    // Convert date strings to Date objects
    if (updateData.walkInStartDate) {
      updateData.walkInStartDate = new Date(updateData.walkInStartDate);
    }
    if (updateData.walkInEndDate) updateData.walkInEndDate = new Date(updateData.walkInEndDate);
    if (updateData.scheduledPublishAt) {
      updateData.scheduledPublishAt = new Date(updateData.scheduledPublishAt);
    }

    const updated = await prisma.jobPost.update({ where: { id: jobId }, data: updateData });

    // Replace screening questions if provided (delete all + recreate)
    if (sqInput !== undefined) {
      await prisma.screeningQuestion.deleteMany({ where: { jobId } });
      if (sqInput.length > 0) {
        await prisma.screeningQuestion.createMany({
          data: sqInput.map((q: ScreeningQuestionInput, idx: number) => ({
            jobId,
            question: q.question,
            questionType: q.questionType || ScreeningQuestionType.TEXT,
            isRequired: q.isRequired ?? false,
            isDealBreaker: q.isDealBreaker ?? false,
            options: q.options || undefined,
            idealAnswer: q.idealAnswer,
            displayOrder: q.displayOrder ?? idx,
          })),
        });
      }
    }

    // Re-index in ES (async via BullMQ)
    addReindexJob({ indexType: 'job', documentId: jobId, action: 'index' }).catch((err) =>
      logger.error('Failed to queue ES reindex for job update', err)
    );

    // Fetch full job for Cloud Talent sync + Kafka enrichment
    const jobForIndex = await prisma.jobPost.findUnique({
      where: { id: jobId },
      include: {
        company: {
          select: { id: true, companyName: true },
        },
      },
    });

    // Trigger geocoding if location changed
    if (data.location) {
      import('../jobs/geocoding.queue')
        .then(({ addGeocodingJob }) =>
          addGeocodingJob({ entityType: 'job', entityId: jobId, address: data.location })
        )
        .catch(() => {});
    }

    publishEvent(KafkaTopics.JOB_UPDATED, jobId, {
      jobId,
      userId: actorUserId,
      title: jobForIndex?.title || data.title,
      skills: data.skillsRequired ?? jobForIndex?.skillsRequired ?? [],
      salary_min: data.salaryMin
        ? Number(data.salaryMin)
        : jobForIndex?.salaryMin
          ? Number(jobForIndex.salaryMin)
          : null,
      salary_max: data.salaryMax
        ? Number(data.salaryMax)
        : jobForIndex?.salaryMax
          ? Number(jobForIndex.salaryMax)
          : null,
      industry: data.industry ?? jobForIndex?.industry ?? null,
      location: data.location ?? jobForIndex?.location ?? null,
    });

    // Re-sync to Cloud Talent
    if (jobForIndex) {
      talentMatchingService
        .syncJobToTalent({
          id: jobForIndex.id,
          title: jobForIndex.title,
          description: jobForIndex.description,
          location: jobForIndex.location,
          company: jobForIndex.company
            ? { id: jobForIndex.company.id, companyName: jobForIndex.company.companyName }
            : null,
          skills: (jobForIndex as any).skillsRequired || [],
          jobType: (jobForIndex as any).type || '',
          workMode: (jobForIndex as any).workMode,
          experienceLevel: (jobForIndex as any).experienceLevel,
          industry: (jobForIndex as any).industry,
          salaryMin: (jobForIndex as any).salaryMin ? Number((jobForIndex as any).salaryMin) : null,
          salaryMax: (jobForIndex as any).salaryMax ? Number((jobForIndex as any).salaryMax) : null,
          currency: (jobForIndex as any).currency,
        })
        .catch(() => {});
    }

    return updated;
  }

  /**
   * Deactivate/close a job
   */
  async deactivateJob(userId: string, jobId: string) {
    const job = await prisma.jobPost.findFirst({
      where: { id: jobId, company: { userId } },
      select: { id: true, title: true, company: { select: { companyName: true } } },
    });
    if (!job) throw new AppError('Job not found or access denied', 404);

    const updated = await prisma.jobPost.update({
      where: { id: jobId },
      data: { status: JobStatus.CLOSED },
    });

    // Remove from ES (async via BullMQ)
    addReindexJob({ indexType: 'job', documentId: jobId, action: 'delete' }).catch((err) =>
      logger.error('Failed to queue ES delete for job', err)
    );

    publishEvent(KafkaTopics.JOB_CLOSED, jobId, {
      jobId,
      userId,
      title: job.title,
      skills: (updated as any).skillsRequired || [],
      salary_min: (updated as any).salaryMin ? Number((updated as any).salaryMin) : null,
      salary_max: (updated as any).salaryMax ? Number((updated as any).salaryMax) : null,
      industry: (updated as any).industry || null,
      location: (updated as any).location || null,
    });

    // GA4: track job_closed
    trackEvent(getClientId(userId), { name: 'job_closed', params: { job_id: jobId } }).catch(
      () => {}
    );

    // Notify applicants (email + in-app)
    notificationService.notifyJobClosed(jobId, job.title, job.company.companyName).catch(() => {});

    // Remove from Cloud Talent index
    talentMatchingService.deleteJobFromTalent(jobId).catch(() => {});

    return updated;
  }

  /**
   * Clone/duplicate an existing job as DRAFT
   */
  async cloneJob(userId: string, jobId: string) {
    const company = await prisma.companyProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!company) throw new AppError('Company profile not found', 404);

    const original = await prisma.jobPost.findFirst({
      where: { id: jobId, companyId: company.id },
      include: { screeningQuestions: { orderBy: { displayOrder: 'asc' } } },
    });
    if (!original) throw new AppError('Job not found or access denied', 404);

    const origQuestions = original.screeningQuestions;

    // Build a fresh slug for the clone — preserves SEO friendliness while
    // avoiding any conflict with the original's unique slug.
    const { buildJobSlug: _buildJobSlugForClone } = await import('../lib/slugs');
    const companyForClone = await prisma.companyProfile.findUnique({
      where: { id: company.id },
      select: { slug: true, companyName: true },
    });
    const clonedSlug = _buildJobSlugForClone({
      title: `${original.title} (Copy)`,
      companyName: companyForClone?.companyName,
      companySlug: companyForClone?.slug,
      city: original.location,
    });

    const cloned = await prisma.jobPost.create({
      data: {
        companyId: company.id,
        status: JobStatus.DRAFT,
        title: `${original.title} (Copy)`,
        slug: clonedSlug,
        publicSearchable: original.publicSearchable,
        description: original.description,
        keyResponsibilities: original.keyResponsibilities,
        requirements: original.requirements,
        benefits: original.benefits,
        type: original.type,
        workMode: original.workMode,
        shiftType: original.shiftType,
        industry: original.industry,
        department: original.department,
        roleCategory: original.roleCategory,
        experienceMin: original.experienceMin,
        experienceMax: original.experienceMax,
        experienceLevel: original.experienceLevel,
        educationRequired: original.educationRequired,
        preferredEducationField: original.preferredEducationField,
        location: original.location,
        isRemote: original.isRemote,
        salaryMin: original.salaryMin,
        salaryMax: original.salaryMax,
        currency: original.currency,
        salaryType: original.salaryType,
        salaryDisclosed: original.salaryDisclosed,
        skillsRequired: original.skillsRequired,
        niceToHaveSkills: original.niceToHaveSkills,
        certificationsRequired: original.certificationsRequired,
        languagesRequired:
          original.languagesRequired !== null ? original.languagesRequired : undefined,
        numberOfOpenings: original.numberOfOpenings,
        urgencyLevel: original.urgencyLevel,
        isFeatured: original.isFeatured,
        isPremium: original.isPremium,
        tags: original.tags,
        jobPerks: original.jobPerks,
        travelRequired: original.travelRequired,
        relocationAssistance: original.relocationAssistance,
        interviewProcess: original.interviewProcess,
        isWalkIn: original.isWalkIn,
        walkInDetails: original.walkInDetails !== null ? original.walkInDetails : undefined,
        contactPerson: original.contactPerson,
        contactEmail: original.contactEmail,
        contactPhone: original.contactPhone,
        // Enterprise fields
        functionalArea: original.functionalArea,
        ugRequired: original.ugRequired,
        pgRequired: original.pgRequired,
        specificDegrees: original.specificDegrees,
        degreeSpecializations: original.degreeSpecializations,
        salaryNegotiable: original.salaryNegotiable,
        noticePeriodPreference: original.noticePeriodPreference,
        isConfidential: original.isConfidential,
        referenceCode: original.referenceCode,
        additionalLocations: original.additionalLocations,
        accommodationProvided: original.accommodationProvided,
        diversityTags: original.diversityTags,
        visaSponsorshipAvailable: original.visaSponsorshipAvailable,
        backgroundCheckRequired: original.backgroundCheckRequired,
        isPwdFriendly: original.isPwdFriendly,
        passportRequired: original.passportRequired,
        bondDetails: original.bondDetails,
        drivingLicenseRequired: original.drivingLicenseRequired,
        ageMin: original.ageMin,
        ageMax: original.ageMax,
        genderPreference: original.genderPreference,
        postingVisibility: original.postingVisibility,
        applyMethod: original.applyMethod,
        externalApplyUrl: original.externalApplyUrl,
      },
    });

    // Clone screening questions
    if (origQuestions.length > 0) {
      await prisma.screeningQuestion.createMany({
        data: origQuestions.map((q) => ({
          jobId: cloned.id,
          question: q.question,
          questionType: q.questionType,
          isRequired: q.isRequired,
          isDealBreaker: q.isDealBreaker,
          options: q.options || undefined,
          idealAnswer: q.idealAnswer,
          displayOrder: q.displayOrder,
        })),
      });
    }

    return cloned;
  }

  /**
   * Employer shortlists a candidate for a specific job
   */
  async shortlistCandidateForJob(
    employerUserId: string,
    candidateProfileId: string,
    jobId: string
  ) {
    const job = await prisma.jobPost.findFirst({
      where: { id: jobId, company: { userId: employerUserId } },
      include: { company: { select: { companyName: true, userId: true } } },
    });
    if (!job) throw new AppError('Job not found or access denied', 404);

    const candidate = await prisma.candidateProfile.findUnique({
      where: { id: candidateProfileId },
      select: { id: true, userId: true },
    });
    if (!candidate) throw new AppError('Candidate not found', 404);

    // Lock the application to prevent concurrent shortlist/select race conditions
    const lockKey = `lock:app:${jobId}:${candidateProfileId}`;
    const result = await withLock(lockKey, 30, async () => {
      const existing = await prisma.jobApplication.findUnique({
        where: { jobId_candidateId: { jobId, candidateId: candidateProfileId } },
      });

      let application;
      if (existing) {
        if (
          ['SHORTLISTED', 'SELECTED', 'INTERVIEW_SCHEDULED', 'OFFERED', 'HIRED'].includes(
            existing.status
          )
        ) {
          throw new AppError(
            `Candidate is already ${existing.status.toLowerCase().replace('_', ' ')} for this job`,
            400
          );
        }
        application = await prisma.jobApplication.update({
          where: { id: existing.id },
          data: { status: ApplicationStatus.SHORTLISTED },
        });
      } else {
        application = await prisma.jobApplication.create({
          data: {
            jobId,
            candidateId: candidateProfileId,
            status: ApplicationStatus.SHORTLISTED,
            source: 'EMPLOYER_SHORTLISTED',
          },
        });
      }

      publishEvent(KafkaTopics.APPLICATION_STATUS_CHANGED, application.id, {
        applicationId: application.id,
        status: 'SHORTLISTED',
        jobId,
        candidateId: candidateProfileId,
      });

      notificationService
        .notifyApplicationStatusChange(
          candidate.userId,
          job.title,
          job.company.companyName,
          'SHORTLISTED',
          jobId
        )
        .catch((err: any) => logger.error('Failed to send shortlist notification', err));

      return application;
    });

    if (result === null) {
      throw new AppError(
        'Application is currently being updated by another request',
        409,
        'RESOURCE_LOCKED'
      );
    }

    return result;
  }

  /**
   * Employer selects a candidate for a specific job
   */
  async selectCandidateForJob(employerUserId: string, candidateProfileId: string, jobId: string) {
    const job = await prisma.jobPost.findFirst({
      where: { id: jobId, company: { userId: employerUserId } },
      include: { company: { select: { companyName: true, userId: true } } },
    });
    if (!job) throw new AppError('Job not found or access denied', 404);

    const candidate = await prisma.candidateProfile.findUnique({
      where: { id: candidateProfileId },
      select: { id: true, userId: true },
    });
    if (!candidate) throw new AppError('Candidate not found', 404);

    // Lock the application to prevent concurrent select/shortlist race conditions
    const lockKey = `lock:app:${jobId}:${candidateProfileId}`;
    const result = await withLock(lockKey, 30, async () => {
      const existing = await prisma.jobApplication.findUnique({
        where: { jobId_candidateId: { jobId, candidateId: candidateProfileId } },
      });

      let application;
      if (existing) {
        if (['SELECTED', 'INTERVIEW_SCHEDULED', 'OFFERED', 'HIRED'].includes(existing.status)) {
          throw new AppError(
            `Candidate is already ${existing.status.toLowerCase().replace('_', ' ')} for this job`,
            400
          );
        }
        application = await prisma.jobApplication.update({
          where: { id: existing.id },
          data: { status: ApplicationStatus.SELECTED, selectedAt: new Date() },
        });
      } else {
        application = await prisma.jobApplication.create({
          data: {
            jobId,
            candidateId: candidateProfileId,
            status: ApplicationStatus.SELECTED,
            selectedAt: new Date(),
            source: 'EMPLOYER_SELECTED',
          },
        });
      }

      publishEvent(KafkaTopics.APPLICATION_STATUS_CHANGED, application.id, {
        applicationId: application.id,
        status: 'SELECTED',
        jobId,
        candidateId: candidateProfileId,
      });

      notificationService
        .notifyApplicationStatusChange(
          candidate.userId,
          job.title,
          job.company.companyName,
          'SELECTED',
          jobId
        )
        .catch((err: any) => logger.error('Failed to send select notification', err));

      return application;
    });

    if (result === null) {
      throw new AppError(
        'Application is currently being updated by another request',
        409,
        'RESOURCE_LOCKED'
      );
    }

    return result;
  }

  /**
   * Get all applications across employer's jobs with pagination and filters
   */
  async getAllEmployerApplications(
    employerUserId: string,
    filters: {
      status?: ApplicationStatus;
      jobId?: string;
      candidateId?: string;
      search?: string;
      sortBy?: 'newest' | 'oldest' | 'matchScore';
      page?: number;
      limit?: number;
    }
  ) {
    const company = await prisma.companyProfile.findUnique({
      where: { userId: employerUserId },
      select: { id: true },
    });
    if (!company) throw new AppError('Company profile not found', 404);

    const page = filters.page || PAGINATION.DEFAULT_PAGE;
    const cappedLimit = Math.min(filters.limit || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
    const skip = (page - 1) * cappedLimit;

    const where: any = { job: { companyId: company.id } };
    if (filters.status) where.status = filters.status;
    if (filters.jobId) where.jobId = filters.jobId;
    if (filters.candidateId) where.candidateId = filters.candidateId;
    if (filters.search) {
      where.candidate = {
        user: {
          OR: [
            { firstName: { contains: filters.search, mode: 'insensitive' } },
            { lastName: { contains: filters.search, mode: 'insensitive' } },
            { email: { contains: filters.search, mode: 'insensitive' } },
          ],
        },
      };
    }

    const orderBy: any =
      filters.sortBy === 'oldest'
        ? { appliedAt: 'asc' }
        : filters.sortBy === 'matchScore'
          ? { matchScore: 'desc' }
          : { appliedAt: 'desc' };

    const [applications, total] = await prisma.$transaction([
      prisma.jobApplication.findMany({
        where,
        include: {
          job: { select: { id: true, title: true, location: true, status: true } },
          candidate: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  avatar: true,
                },
              },
            },
          },
        },
        orderBy,
        skip,
        take: cappedLimit,
      }),
      prisma.jobApplication.count({ where }),
    ]);

    return {
      applications,
      pagination: { total, page, limit: cappedLimit, pages: Math.ceil(total / cappedLimit) },
    };
  }
}

export const jobService = new JobService();
