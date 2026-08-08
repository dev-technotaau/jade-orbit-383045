import { prisma } from '../config/prisma';
import logger from '../config/logger';
import { redis } from '../config/redis';
import { AppError } from '../middleware/error';
import type { CandidateProfile } from '@prisma/client';
import { uploadImage, uploadOptions, deleteImage, extractPublicId } from '../config/cloudinary';
import { searchService } from './search.service';
import { PAGINATION } from '@/constants';
import {} from '../kafka/producer';
import { publishEvent } from '../kafka/producer';
import { KafkaTopics } from '../kafka/topics';
import { trackEvent, getClientId } from './analytics.service';
import { moderationService } from './moderation.service';
import { addReindexJob } from '../jobs/es-reindex.queue';

/**
 * How long a candidate stays "already charged" against a searcher's
 * SEARCH_RESULT pool. Re-viewing within this window is free; once it lapses
 * (after inactivity) the dedup set expires and a fresh view re-bills. The
 * window is refreshed on every new charge, so an actively-searching
 * employer keeps their dedup history for the life of their plan. 60 days
 * comfortably covers monthly / quarterly plan periods.
 */
const SEARCH_RESULT_DEDUP_TTL_SECONDS = 60 * 24 * 60 * 60;

export class CandidateService {
  /**
   * Get candidate profile by User ID
   */
  async getProfile(userId: string) {
    const profile = await prisma.candidateProfile.findUnique({
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

    if (!profile) {
      throw new AppError('Candidate profile not found', 404);
    }

    return profile;
  }

  /**
   * Create or Update Candidate Profile
   */
  async updateProfile(userId: string, data: Partial<CandidateProfile>) {
    // Content moderation screening for text fields
    const screenableFields = [data.bio, data.headline].filter(Boolean).join(' ');
    if (screenableFields) {
      const modResult = moderationService.screenContent(screenableFields);
      if (modResult.severity === 'high' || modResult.severity === 'medium') {
        throw new AppError(
          'Profile content contains prohibited terms. Please revise your bio or headline.',
          400,
          'CONTENT_FLAGGED'
        );
      }
    }

    const profile = await prisma.candidateProfile.upsert({
      where: { userId },
      create: {
        userId,
        ...(data as any),
      },
      update: {
        ...(() => {
          const { userId: _userId, ...rest } = data as any;
          return rest;
        })(),
      },
      include: { user: true },
    });

    // INDEXING (async via BullMQ)
    if (profile) {
      addReindexJob({ indexType: 'candidate', documentId: profile.id, action: 'index' }).catch(
        (err: unknown) => logger.error('Failed to queue ES reindex for candidate', err)
      );
    }

    // Update cached completeness score
    const completeness = await this.getProfileCompleteness(userId);
    if (completeness.percentage !== profile.profileCompleteness) {
      await prisma.candidateProfile.update({
        where: { userId },
        data: { profileCompleteness: completeness.percentage },
      });

      // GA4: track profile_completed when 100%
      if (completeness.percentage >= 100) {
        trackEvent(getClientId(userId), {
          name: 'profile_completed',
          params: { completeness: 100 },
        }).catch(() => {});
      }
    }

    // Trigger geocoding if location fields changed
    const locationAddress = [data.currentLocation, data.city, data.state, data.country]
      .filter(Boolean)
      .join(', ');
    if (locationAddress) {
      import('../jobs/geocoding.queue')
        .then(({ addGeocodingJob }) =>
          addGeocodingJob({ entityType: 'candidate', entityId: userId, address: locationAddress })
        )
        .catch(() => {});
    }

    // Trigger job matching
    try {
      const { matchingQueue } = await import('../jobs/matching.queue');
      await matchingQueue.add('match-jobs', { userId });
    } catch (err) {
      logger.error('Failed to enqueue matching job', err);
    }

    // Publish Kafka event
    publishEvent(KafkaTopics.PROFILE_UPDATED, userId, { userId, profileId: profile.id });

    return profile;
  }

  /**
   * Upload Resume to R2
   */
  async uploadResume(userId: string, file: Express.Multer.File) {
    const { uploadFileToR2, extractR2KeyFromUrl, deleteFileFromR2 } =
      await import('./storage.service');

    // Delete old resume from R2 if it exists
    const existing = await prisma.candidateProfile.findUnique({
      where: { userId },
      select: { resume: true, generatedResumeUrl: true },
    });
    if (existing?.resume && existing.resume !== existing.generatedResumeUrl) {
      const oldKey = extractR2KeyFromUrl(existing.resume);
      if (oldKey) deleteFileFromR2(oldKey).catch(() => {});
    }

    const { url } = await uploadFileToR2(file.buffer, file.originalname, 'resumes', file.mimetype);

    const profile = await prisma.candidateProfile.upsert({
      where: { userId },
      create: {
        userId,
        resume: url,
        resumeOriginalName: file.originalname,
        resumeSize: file.size,
        resumeMimeType: file.mimetype,
        resumeUploadedAt: new Date(),
      },
      update: {
        resume: url,
        resumeOriginalName: file.originalname,
        resumeSize: file.size,
        resumeMimeType: file.mimetype,
        resumeUploadedAt: new Date(),
      },
      include: { user: true },
    });

    // Sync with Search (async via BullMQ)
    if (profile) {
      addReindexJob({ indexType: 'candidate', documentId: profile.id, action: 'index' }).catch(
        (err: unknown) =>
          logger.error('Failed to queue ES reindex for candidate (resume upload)', err)
      );
    }

    // GA4: track resume_uploaded
    trackEvent(getClientId(userId), { name: 'resume_uploaded' }).catch(() => {});

    // Publish Kafka event
    publishEvent(KafkaTopics.RESUME_UPLOADED, userId, { userId }).catch(() => {});

    return profile;
  }

  /**
   * Upload Profile Image (Avatar)
   */
  async uploadProfileImage(userId: string, file: Express.Multer.File) {
    // Fetch old image URL before uploading new one
    const existing = await prisma.candidateProfile.findUnique({
      where: { userId },
      select: { profileImage: true },
    });

    const uploadResult = await uploadImage(
      profileImageBufferOrPath(file),
      uploadOptions.profileImage
    );

    // Delete old image from Cloudinary
    if (existing?.profileImage) {
      const oldPublicId = extractPublicId(existing.profileImage);
      if (oldPublicId) deleteImage(oldPublicId).catch(() => {});
    }

    // Transaction to ensure both update
    const [candidateProfile] = await prisma.$transaction([
      prisma.candidateProfile.upsert({
        where: { userId },
        create: {
          userId,
          profileImage: uploadResult.secure_url,
        },
        update: {
          profileImage: uploadResult.secure_url,
        },
        include: { user: true },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { avatar: uploadResult.secure_url },
      }),
    ]);

    // Sync with Search (async via BullMQ)
    if (candidateProfile) {
      addReindexJob({
        indexType: 'candidate',
        documentId: candidateProfile.id,
        action: 'index',
      }).catch((err: unknown) =>
        logger.error('Failed to queue ES reindex for candidate (image upload)', err)
      );
    }

    // Publish Kafka event
    publishEvent(KafkaTopics.AVATAR_CHANGED, userId, { userId }).catch(() => {});

    // Queue image variant generation (fire-and-forget)
    import('../jobs/image-processing.queue')
      .then(({ addImageJob }) =>
        addImageJob({
          entityType: 'candidate',
          entityId: candidateProfile.id,
          userId,
          imageUrl: candidateProfile.profileImage || uploadResult.secure_url,
          field: 'avatar',
        })
      )
      .catch(() => {});

    return candidateProfile;
  }

  /**
   * Remove Profile Image (Avatar)
   */
  async removeProfileImage(userId: string) {
    // Fetch current image URL for cleanup
    const existing = await prisma.candidateProfile.findUnique({
      where: { userId },
      select: { profileImage: true },
    });

    await prisma.$transaction([
      prisma.candidateProfile.update({
        where: { userId },
        data: { profileImage: null },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { avatar: null },
      }),
    ]);

    // Delete from Cloudinary
    if (existing?.profileImage) {
      const publicId = extractPublicId(existing.profileImage);
      if (publicId) deleteImage(publicId).catch(() => {});
    }
  }

  /**
   * Delete Resume (both uploaded and generated)
   */
  async deleteResume(userId: string, resumeType: 'uploaded' | 'generated' | 'both' = 'both') {
    const { extractR2KeyFromUrl, deleteFileFromR2 } = await import('./storage.service');

    // Fetch current resume URLs for cleanup
    const existing = await prisma.candidateProfile.findUnique({
      where: { userId },
      select: {
        resume: true,
        generatedResumeUrl: true,
        resumeOriginalName: true,
      },
    });

    if (!existing) {
      throw new AppError('Candidate profile not found', 404);
    }

    // Determine which resumes to delete
    const deleteUploadedResume = resumeType === 'uploaded' || resumeType === 'both';
    const deleteGeneratedResume = resumeType === 'generated' || resumeType === 'both';

    const updateData: any = {};

    // Handle uploaded resume deletion
    if (deleteUploadedResume && existing.resume) {
      const isGeneratedResume = existing.resume === existing.generatedResumeUrl;

      if (!isGeneratedResume) {
        // It's a manually uploaded resume - delete from R2
        const resumeKey = extractR2KeyFromUrl(existing.resume);
        if (resumeKey) deleteFileFromR2(resumeKey).catch(() => {});

        // Clear uploaded resume fields
        updateData.resume = null;
        updateData.resumeOriginalName = null;
        updateData.resumeSize = null;
        updateData.resumeMimeType = null;
        updateData.resumeUploadedAt = null;
      } else if (resumeType === 'uploaded' && isGeneratedResume) {
        // User wants to delete "active" resume which is generated - just clear the reference
        updateData.resume = null;
      }
    }

    // Handle generated resume deletion
    if (deleteGeneratedResume && existing.generatedResumeUrl) {
      const generatedKey = extractR2KeyFromUrl(existing.generatedResumeUrl);
      if (generatedKey) deleteFileFromR2(generatedKey).catch(() => {});

      updateData.generatedResumeUrl = null;
      updateData.generatedResumeAt = null;

      // If active resume is the generated one, clear it too
      if (existing.resume === existing.generatedResumeUrl) {
        updateData.resume = null;
      }
    }

    // Update database
    const profile = await prisma.candidateProfile.update({
      where: { userId },
      data: updateData,
      include: { user: true },
    });

    // Sync with Elasticsearch (async via BullMQ)
    if (profile) {
      addReindexJob({ indexType: 'candidate', documentId: profile.id, action: 'index' }).catch(
        (err: unknown) =>
          logger.error('Failed to queue ES reindex for candidate (resume deletion)', err)
      );
    }

    // GA4: track resume_deleted
    trackEvent(getClientId(userId), {
      name: 'resume_deleted',
      params: { resumeType },
    }).catch(() => {});

    // Publish Kafka event
    publishEvent(KafkaTopics.PROFILE_UPDATED, userId, {
      userId,
      profileId: profile.id,
      action: 'resume_deleted',
      resumeType,
    });

    return profile;
  }

  /**
   * Search Candidates (Employer Only)
   */
  async searchCandidates(
    query: string,
    filters: {
      skills?: string[];
      location?: string;
      excludeLocation?: string[];
      experienceMin?: number;
      experienceMax?: number;
      salaryMin?: number;
      salaryMax?: number;
      salaryCurrency?: string;
      includeSalaryNotDisclosed?: boolean;
      keyword?: string;
      keywordScope?: string;
      excludeKeywords?: string[];
      workStatus?: string;
      noticePeriod?: string;
      servingNoticePeriod?: boolean;
      gender?: string;
      willingToRelocate?: boolean;
      preferredWorkMode?: string;
      preferredJobType?: string;
      lastActiveWithin?: string;
      currentIndustry?: string;
      currentCompany?: string;
      excludeCompany?: string[];
      designation?: string;
      department?: string;
      ageMin?: number;
      ageMax?: number;
      hasCareerBreak?: boolean;
      hasResume?: boolean;
      verifiedMobile?: boolean;
      verifiedEmail?: boolean;
      registeredAfter?: string;
      modifiedAfter?: string;
      education?: string;
      certifications?: string;
      disabilityType?: string;
      openToWork?: string;
      category?: string;
      isVeteran?: string;
      careerBreakType?: string;
      keywordOperator?: string;
      itSkill?: string;
      workPermit?: string;
      educationLevel?: string;
      experienceLevel?: string;
      highestEducationLevel?: string;
      drivingLicenseType?: string;
      functionalArea?: string;
      latitude?: number;
      longitude?: number;
      radiusKm?: number;
      sortBy?: string;
      page?: number;
      limit?: number;
    },
    /**
     * Searcher's userId — used to enforce the plan-level
     * `feature.search_result` countable cap. CV Lite caps at 500 results,
     * CV Pro at 1500, CV Enterprise unlimited (`feature.search_unlimited`).
     * Optional so super-admin / internal callers stay uncapped.
     */
    searcherUserId?: string,
    /** Searcher's role — ADMIN/SUPER_ADMIN skip metering + contact paywall. */
    searcherRole?: string
  ) {
    const page = filters.page || PAGINATION.DEFAULT_PAGE;
    const cappedLimit = Math.min(filters.limit || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
    const skip = (page - 1) * cappedLimit;

    // Resolve the searcher's plan-level result cap. Returns `null` when
    // no cap applies (no plan, or plan grants `feature.search_unlimited`).
    const resultCap = searcherUserId ? await getSearchResultCap(searcherUserId) : null;

    // CV Pro / Enterprise unlock advanced filters (age, salary, current
    // company, last active, etc.). CV Lite or no-plan callers get the
    // basic filter set — advanced keys are stripped silently before they
    // reach ES / Prisma so results are correct for the plan they bought.
    if (searcherUserId) {
      const canUseAdvanced = await hasAdvancedFilters(searcherUserId);
      if (!canUseAdvanced) {
        filters = stripAdvancedFilters(filters) as typeof filters;
      }
    }

    const isPrivilegedSearcher = searcherRole === 'ADMIN' || searcherRole === 'SUPER_ADMIN';

    /**
     * Post-process a page of results before it leaves the service:
     *
     *  1. SEARCH_RESULT metering — plans sell a consumable pool of
     *     viewable results (CV Lite 500, CV Pro 1500). Every row served
     *     burns 1 unit; when the pool can't cover the page we clamp the
     *     page to what's left. Searchers with `feature.search_unlimited`
     *     or no SEARCH_RESULT pool at all (admins, legacy accounts) are
     *     not metered. The route-level 60s cache means an identical
     *     repeat search isn't double-charged.
     *  2. Contact paywall — strip email/phone from every candidate the
     *     searcher hasn't unlocked (and who hasn't applied to them), the
     *     same rule as the detail endpoint. Without this, search results
     *     hand out contacts for free and CV unlocks never get consumed.
     */
    const finalizeResultsPage = async (rows: any[]): Promise<any[]> => {
      if (isPrivilegedSearcher || !searcherUserId || rows.length === 0) return rows;
      let out = rows;

      try {
        const { getActiveEntitlementsForUser, consumeResource } =
          await import('./entitlement.service');
        const snap = await getActiveEntitlementsForUser(searcherUserId);
        if (!snap.features['feature.search_unlimited']) {
          const pool = snap.resources.SEARCH_RESULT;
          if (pool) {
            const remaining = Math.max(0, pool.totalRemaining);

            // Per-candidate dedup. The SEARCH_RESULT pool reflects the
            // UNIQUE candidates this searcher has accessed — NOT raw row
            // impressions. Re-viewing the same candidate across pages,
            // filter tweaks, refetches, or repeat searches must not
            // re-consume; without dedup the pool drains far faster than the
            // distinct candidates actually viewed (which reads as "the whole
            // result set got consumed"). Within a single forward-paginated
            // search every row is unique, so this still bills ~per page.
            const dedupKey = `search:charged:${searcherUserId}`;
            const pageIds = out
              .map((r) => (r.userId ?? r.user?.id) as string | undefined)
              .filter((id): id is string => Boolean(id));
            let alreadyCharged = new Set<string>();
            try {
              if (pageIds.length > 0) {
                // ioredis auto-pipelines these into a single round-trip.
                const flags = await Promise.all(pageIds.map((id) => redis.sismember(dedupKey, id)));
                alreadyCharged = new Set(pageIds.filter((_, i) => Number(flags[i]) === 1));
              }
            } catch {
              // Redis unavailable — degrade to "nothing pre-charged" so the
              // page is billed as before rather than served free.
              alreadyCharged = new Set();
            }

            // Walk the page in order: already-charged rows are free to
            // re-view; each NEW candidate spends 1 unit until the pool budget
            // runs out; new candidates past the budget are dropped so the
            // pool can never be over-spent (replaces the old blanket page
            // truncation, while still letting paid-for rows stay visible).
            let budget = remaining;
            const toCharge: string[] = [];
            const kept: any[] = [];
            for (const row of out) {
              const cid: string | undefined = row.userId ?? row.user?.id;
              if (cid && alreadyCharged.has(cid)) {
                kept.push(row);
                continue;
              }
              if (budget > 0) {
                kept.push(row);
                budget -= 1;
                if (cid) toCharge.push(cid);
              }
              // else: new candidate but pool exhausted — drop from this page
            }
            out = kept;

            if (toCharge.length > 0) {
              try {
                await consumeResource({
                  userId: searcherUserId,
                  unit: 'SEARCH_RESULT',
                  amount: toCharge.length,
                  refType: 'SEARCH',
                  notes: `Candidate search — ${toCharge.length} new result(s) charged (page ${page})`,
                });
                // Mark as charged only AFTER a successful consume, so a lost
                // race doesn't hand out free future views. Best-effort — a
                // missed marker just risks re-charging that candidate later.
                try {
                  await redis.sadd(dedupKey, ...toCharge);
                  await redis.expire(dedupKey, SEARCH_RESULT_DEDUP_TTL_SECONDS);
                } catch {
                  /* dedup marker is best-effort */
                }
              } catch (err) {
                // Results already assembled — a lost race here under-counts
                // one page rather than failing the search.
                logger.warn('SEARCH_RESULT consumption failed', {
                  searcherUserId,
                  count: toCharge.length,
                  err: err instanceof Error ? err.message : err,
                });
              }
            }
          }
        }
      } catch (err) {
        logger.warn('SEARCH_RESULT metering skipped — snapshot read failed', {
          searcherUserId,
          err: err instanceof Error ? err.message : err,
        });
      }

      try {
        const { getContactVisibilitySet } = await import('./cv-unlock.service');
        const ids = out.map((r) => r.userId ?? r.user?.id).filter(Boolean) as string[];
        const { all, visible } = await getContactVisibilitySet(searcherUserId, ids);
        out = out.map((r) => {
          const cid: string | undefined = r.userId ?? r.user?.id;
          const ok = all || (cid ? visible.has(cid) : false);
          if (ok) return { ...r, contactUnlocked: true };
          return {
            ...r,
            // ES hits carry flat copies of these alongside the nested user
            email: null,
            mobileNumber: null,
            whatsappNumber: null,
            phone: null,
            alternatePhone: null,
            alternateEmail: null,
            user: r.user
              ? { ...r.user, email: null, mobileNumber: null, whatsappNumber: null }
              : r.user,
            contactUnlocked: false,
          };
        });
      } catch (err) {
        // Fail closed — hide contacts on every row rather than leak them.
        logger.warn('Contact visibility lookup failed — stripping all contacts', {
          searcherUserId,
          err: err instanceof Error ? err.message : err,
        });
        out = out.map((r) => ({
          ...r,
          email: null,
          mobileNumber: null,
          whatsappNumber: null,
          phone: null,
          alternatePhone: null,
          alternateEmail: null,
          user: r.user
            ? { ...r.user, email: null, mobileNumber: null, whatsappNumber: null }
            : r.user,
          contactUnlocked: false,
        }));
      }

      return out;
    };

    // 1. Try Elasticsearch — only when actual search criteria exist (not just page/limit/sortBy)
    const ignoreKeys = new Set(['page', 'limit', 'sortBy']);
    const hasSearchCriteria = Object.entries(filters).some(
      ([key, val]) => !ignoreKeys.has(key) && val !== undefined && val !== null && val !== ''
    );
    if (query || hasSearchCriteria) {
      try {
        const { hits, total, facets } = await searchService.searchCandidates(
          query || filters.keyword,
          {
            ...filters,
            from: skip,
            size: cappedLimit,
          }
        );

        // The ES `_source` doesn't carry the profile image, so the hit
        // serialiser returns user.avatar = null and every result card falls
        // back to the placeholder icon. Hydrate avatars from the User table in
        // one batch query — matches exactly what the Prisma fallback selects.
        type AvatarHit = { user?: { id?: string; avatar?: string | null } };
        const avatarUserIds = (hits as AvatarHit[])
          .map((h) => h.user?.id)
          .filter((id): id is string => !!id);
        if (avatarUserIds.length > 0) {
          const avatarUsers = await prisma.user.findMany({
            where: { id: { in: avatarUserIds } },
            select: { id: true, avatar: true },
          });
          const avatarById = new Map(avatarUsers.map((u) => [u.id, u.avatar]));
          for (const h of hits as AvatarHit[]) {
            if (h.user?.id && !h.user.avatar) {
              h.user.avatar = avatarById.get(h.user.id) ?? null;
            }
          }
        }

        // Inject Premium markers for each candidate hit (single batch query).
        // ES hits include `userId` per the existing serialiser.
        const enrichedHits = await finalizeResultsPage(await enrichWithVerifiedBadge(hits));

        // Plan-level result cap — if the searcher's plan limits
        // SEARCH_RESULT, clamp total + pages so they can't paginate past it.
        const cappedTotal = resultCap !== null ? Math.min(total, resultCap) : total;
        return {
          candidates: enrichedHits,
          pagination: {
            total: cappedTotal,
            page,
            limit: cappedLimit,
            pages: Math.ceil(cappedTotal / cappedLimit) || 1,
            cap: resultCap,
          },
          facets,
        };
      } catch (error) {
        logger.warn('Elasticsearch candidate search failed, falling back to DB', error);
      }
    }

    // 2. Prisma DB fallback — used when no search criteria or when ES fails
    {
      const where: any = {};

      if (filters.keyword) {
        const kw = filters.keyword;
        const scopeMap: Record<string, any[]> = {
          all: [
            { user: { firstName: { contains: kw, mode: 'insensitive' } } },
            { user: { lastName: { contains: kw, mode: 'insensitive' } } },
            { bio: { contains: kw, mode: 'insensitive' } },
            { headline: { contains: kw, mode: 'insensitive' } },
            { currentRole: { contains: kw, mode: 'insensitive' } },
            { currentCompany: { contains: kw, mode: 'insensitive' } },
          ],
          title: [
            { headline: { contains: kw, mode: 'insensitive' } },
            { currentRole: { contains: kw, mode: 'insensitive' } },
          ],
          skills: [], // skills are string[] — handled by hasSome below
          designation: [
            { currentRole: { contains: kw, mode: 'insensitive' } },
            { headline: { contains: kw, mode: 'insensitive' } },
          ],
          company: [{ currentCompany: { contains: kw, mode: 'insensitive' } }],
        };
        const scope = filters.keywordScope || 'all';
        if (scope === 'skills') {
          // For skills scope, add keyword as a skill filter
          where.skills = { ...where.skills, hasSome: [kw] };
        } else {
          where.OR = scopeMap[scope] || scopeMap.all;
        }
      }
      if (filters.location) {
        where.currentLocation = { contains: filters.location, mode: 'insensitive' };
      }
      if (filters.excludeLocation && filters.excludeLocation.length > 0) {
        const locNots = filters.excludeLocation.map((loc: string) => ({
          currentLocation: { contains: loc, mode: 'insensitive' as const },
        }));
        where.NOT = [...(where.NOT || []), ...locNots];
      }
      if (filters.experienceMin) {
        where.experienceYears = { ...where.experienceYears, gte: filters.experienceMin };
      }
      if (filters.experienceMax) {
        where.experienceYears = { ...where.experienceYears, lte: filters.experienceMax };
      }
      if (filters.skills && filters.skills.length > 0) {
        where.skills = { ...where.skills, hasSome: filters.skills };
      }
      if (filters.salaryCurrency) {
        where.salaryCurrency = filters.salaryCurrency;
      }
      if (filters.salaryMax) {
        if (filters.includeSalaryNotDisclosed) {
          // Include candidates with matching salary OR those who didn't disclose
          where.OR = [
            ...(where.OR || []),
            { expectedSalaryMin: { lte: filters.salaryMax } },
            { expectedSalaryMin: null },
          ];
        } else {
          where.expectedSalaryMin = { lte: filters.salaryMax };
        }
      }
      if (filters.workStatus) {
        where.workStatus = filters.workStatus;
      }
      if (filters.noticePeriod) {
        where.noticePeriod = filters.noticePeriod;
      }
      if (filters.gender) {
        where.gender = filters.gender;
      }
      if (filters.willingToRelocate !== undefined) {
        where.willingToRelocate = filters.willingToRelocate;
      }
      if (filters.preferredWorkMode) {
        where.preferredWorkMode = { has: filters.preferredWorkMode };
      }
      if (filters.currentIndustry) {
        where.currentIndustry = { contains: filters.currentIndustry, mode: 'insensitive' };
      }
      if (filters.hasCareerBreak !== undefined) {
        where.hasCareerBreak = filters.hasCareerBreak;
      }
      if (filters.disabilityType) {
        where.disabilityType = filters.disabilityType;
      }
      // --- 13 new Naukri Resdex-level filters (DB fallback) ---
      if (filters.excludeKeywords && filters.excludeKeywords.length > 0) {
        where.NOT = filters.excludeKeywords.map((kw: string) => ({
          OR: [
            { headline: { contains: kw, mode: 'insensitive' } },
            { currentRole: { contains: kw, mode: 'insensitive' } },
            { bio: { contains: kw, mode: 'insensitive' } },
          ],
        }));
      }
      if (filters.currentCompany) {
        where.currentCompany = { contains: filters.currentCompany, mode: 'insensitive' };
      }
      if (filters.excludeCompany && filters.excludeCompany.length > 0) {
        const notClauses = filters.excludeCompany.map((c: string) => ({
          currentCompany: { contains: c, mode: 'insensitive' as const },
        }));
        where.NOT = [...(where.NOT || []), ...notClauses];
      }
      if (filters.designation) {
        where.currentRole = { contains: filters.designation, mode: 'insensitive' };
      }
      if (filters.department) {
        where.currentDepartment = { contains: filters.department, mode: 'insensitive' };
      }
      if (filters.ageMin || filters.ageMax) {
        const dobFilter: any = {};
        if (filters.ageMin) {
          // ageMin years old => born before (now - ageMin years)
          const maxDob = new Date();
          maxDob.setFullYear(maxDob.getFullYear() - filters.ageMin);
          dobFilter.lte = maxDob;
        }
        if (filters.ageMax) {
          // ageMax years old => born after (now - ageMax years)
          const minDob = new Date();
          minDob.setFullYear(minDob.getFullYear() - filters.ageMax);
          dobFilter.gte = minDob;
        }
        where.dob = dobFilter;
      }
      if (filters.preferredJobType) {
        where.preferredJobType = { has: filters.preferredJobType };
      }
      if (filters.servingNoticePeriod !== undefined) {
        where.servingNoticePeriod = filters.servingNoticePeriod;
      }
      if (filters.hasResume !== undefined) {
        where.resume = filters.hasResume ? { not: null } : null;
      }
      if (filters.verifiedMobile !== undefined) {
        where.user = { is: { ...where.user?.is, isMobileVerified: filters.verifiedMobile } };
      }
      if (filters.verifiedEmail !== undefined) {
        where.user = { is: { ...where.user?.is, isEmailVerified: filters.verifiedEmail } };
      }
      if (filters.registeredAfter) {
        where.createdAt = { ...where.createdAt, gte: new Date(filters.registeredAfter) };
      }
      if (filters.modifiedAfter) {
        where.updatedAt = { ...where.updatedAt, gte: new Date(filters.modifiedAfter) };
      }
      if (filters.openToWork) {
        where.openToWork = filters.openToWork;
      }
      if (filters.category) {
        where.category = filters.category;
      }
      if (filters.isVeteran === 'true') {
        where.isVeteran = true;
      }
      if (filters.careerBreakType) {
        where.careerBreakType = filters.careerBreakType;
      }

      const [candidates, total] = await prisma.$transaction([
        prisma.candidateProfile.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                avatar: true,
                lastActiveAt: true,
                mobileNumber: true,
                whatsappNumber: true,
                isEmailVerified: true,
                isMobileVerified: true,
                isWhatsappVerified: true,
              },
            },
          },
          skip,
          take: cappedLimit,
          orderBy: { updatedAt: 'desc' },
        }),
        prisma.candidateProfile.count({ where }),
      ]);

      // Strip raw R2 URLs — employers must use the signed download endpoint
      const sanitized = candidates.map((c) => ({
        ...c,
        resume: c.resume ? true : null,
        generatedResumeUrl: c.generatedResumeUrl ? true : null,
      }));

      const enriched = await finalizeResultsPage(await enrichWithVerifiedBadge(sanitized));

      const cappedTotal = resultCap !== null ? Math.min(total, resultCap) : total;
      const totalPages = Math.ceil(cappedTotal / cappedLimit) || 1;
      return {
        candidates: enriched,
        pagination: {
          total: cappedTotal,
          page,
          limit: cappedLimit,
          pages: totalPages,
          cap: resultCap,
        },
      };
    }
  }

  /**
   * Get profile completeness percentage
   */
  async getProfileCompleteness(userId: string) {
    const [profile, user] = await prisma.$transaction([
      prisma.candidateProfile.findUnique({
        where: { userId },
        select: {
          // Personal
          gender: true,
          dob: true,
          bio: true,
          nationality: true,
          hometown: true,
          // Contact
          phone: true,
          alternateEmail: true,
          currentLocation: true,
          // Professional
          currentRole: true,
          currentCompany: true,
          experienceYears: true,
          experienceLevel: true,
          currentIndustry: true,
          functionalArea: true,
          // Skills & structured data
          skills: true,
          education: true,
          experience: true,
          certifications: true,
          projects: true,
          languageProficiency: true,
          publications: true,
          patents: true,
          volunteerExperience: true,
          interests: true,
          hobbies: true,
          references: true,
          // Resume & Headline
          resume: true,
          headline: true,
          // Preferences
          preferredWorkMode: true,
          preferredJobType: true,
          willingToRelocate: true,
          noticePeriod: true,
          workStatus: true,
          openToWork: true,
          preferredShift: true,
          preferredIndustries: true,
          preferredRoleCategories: true,
          // Social
          linkedinProfile: true,
          githubProfile: true,
          portfolioUrl: true,
          stackOverflowProfile: true,
          twitterProfile: true,
          personalBlogUrl: true,
          // Documents
          passportNumber: true,
          hasDrivingLicense: true,
          visaStatus: true,
          workPermitStatus: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          firstName: true,
          lastName: true,
          mobileNumber: true,
        },
      }),
    ]);
    if (!profile || !user) {
      return { percentage: 0, completed: [], missing: ['Create your profile'] };
    }

    const isFresher = profile.experienceLevel === 'FRESHER';

    const checks = [
      {
        field: 'Personal Info',
        weight: 12,
        check: !!(
          user.firstName &&
          user.lastName &&
          (profile.gender || profile.dob || profile.bio || profile.nationality || profile.hometown)
        ),
      },
      {
        field: 'Contact',
        weight: 6,
        check: !!(
          profile.phone ||
          (user as any).mobileNumber ||
          profile.alternateEmail ||
          profile.currentLocation
        ),
      },
      {
        field: 'Professional',
        weight: isFresher ? 0 : 12,
        check: !!(
          profile.currentRole ||
          profile.experienceLevel ||
          profile.currentCompany ||
          profile.experienceYears > 0 ||
          profile.currentIndustry ||
          profile.functionalArea
        ),
      },
      { field: 'Skills', weight: 10, check: profile.skills.length > 0 },
      {
        field: 'Education',
        weight: 10,
        check: !!(profile.education && (profile.education as any[]).length > 0),
      },
      {
        field: 'Experience',
        weight: isFresher ? 0 : 10,
        check: !!(profile.experience && (profile.experience as any[]).length > 0),
      },
      { field: 'Resume', weight: isFresher ? 0 : 5, check: !!profile.resume },
      { field: 'Headline', weight: 5, check: !!profile.headline },
      {
        field: 'Preferences',
        weight: 5,
        check: !!(
          profile.preferredWorkMode.length > 0 ||
          profile.preferredJobType.length > 0 ||
          profile.willingToRelocate === true ||
          profile.noticePeriod ||
          profile.workStatus ||
          profile.openToWork ||
          profile.preferredShift ||
          profile.preferredIndustries.length > 0 ||
          profile.preferredRoleCategories.length > 0
        ),
      },
      {
        field: 'Certifications/Projects',
        weight: 5,
        check: !!(
          (profile.certifications as any[])?.length > 0 || (profile.projects as any[])?.length > 0
        ),
      },
      {
        field: 'Language Proficiency',
        weight: 5,
        check: !!((profile.languageProficiency as any[])?.length > 0),
      },
      {
        field: 'Social Profiles',
        weight: 5,
        check: !!(
          profile.linkedinProfile ||
          profile.githubProfile ||
          profile.portfolioUrl ||
          profile.stackOverflowProfile ||
          profile.twitterProfile ||
          profile.personalBlogUrl
        ),
      },
      {
        field: 'Publications/Patents/Volunteer',
        weight: 3,
        check: !!(
          (profile.publications as any[])?.length ||
          (profile.patents as any[])?.length ||
          (profile.volunteerExperience as any[])?.length
        ),
      },
      {
        field: 'Interests/Hobbies',
        weight: 3,
        check: !!(profile.interests.length > 0 || profile.hobbies.length > 0),
      },
      { field: 'References', weight: 2, check: !!((profile.references as any[])?.length > 0) },
      {
        field: 'Documents',
        weight: 2,
        check: !!(
          profile.passportNumber ||
          profile.hasDrivingLicense ||
          profile.visaStatus ||
          profile.workPermitStatus
        ),
      },
    ];

    // Filter out zero-weight checks (not applicable for freshers)
    const applicableChecks = checks.filter((c) => c.weight > 0);
    const totalWeight = applicableChecks.reduce((acc, c) => acc + c.weight, 0);
    const normalizedChecks = applicableChecks.map((c) => ({
      ...c,
      weight: Math.floor((c.weight / totalWeight) * 100),
    }));
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
  /**
   * Get Candidate Dashboard Statistics
   */
  async getCandidateDashboard(userId: string) {
    const [
      user,
      profile,
      applicationStats,
      savedJobsCount,
      profileViewsWeek,
      profileViewsMonth,
      recentApps,
    ] = await prisma.$transaction([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          isEmailVerified: true,
          isMobileVerified: true,
          isWhatsappVerified: true,
          whatsappNumber: true,
          lastActiveAt: true,
          lastLoginAt: true,
        },
      }),
      prisma.candidateProfile.findUnique({
        where: { userId },
        select: { profileCompleteness: true, updatedAt: true },
      }),
      prisma.jobApplication.groupBy({
        by: ['status'],
        where: { candidate: { userId } },
        orderBy: { status: 'asc' },
        _count: { _all: true },
      }),
      prisma.savedJob.count({ where: { userId } }),
      prisma.profileView.count({
        where: {
          profileUserId: userId,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.profileView.count({
        where: {
          profileUserId: userId,
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.jobApplication.findMany({
        where: { candidate: { userId } },
        orderBy: { appliedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          status: true,
          appliedAt: true,
          job: {
            select: {
              title: true,
              company: { select: { companyName: true } },
            },
          },
        },
      }),
    ]);

    const totalApplications = applicationStats.reduce(
      (sum, s) => sum + ((s._count as { _all: number })?._all ?? 0),
      0
    );

    return {
      verification: {
        emailVerified: user?.isEmailVerified || false,
        mobileVerified: user?.isMobileVerified || false,
        whatsappVerified: user?.isWhatsappVerified || false,
      },
      profileCompleteness: profile?.profileCompleteness || 0,
      lastProfileModified: profile?.updatedAt || null,
      applications: {
        total: totalApplications,
        byStatus: Object.fromEntries(
          applicationStats.map((s) => [s.status, (s._count as { _all: number })?._all ?? 0])
        ),
      },
      savedJobsCount,
      profileViews: { week: profileViewsWeek, month: profileViewsMonth },
      recentApplications: recentApps.map((a) => ({
        id: a.id,
        jobTitle: a.job.title,
        companyName: a.job.company?.companyName || 'Unknown',
        status: a.status,
        appliedAt: a.appliedAt,
      })),
    };
  }

  /**
   * Get candidate public profile (for employer viewing)
   */
  async getCandidatePublicProfile(
    idOrUserId: string,
    requester?: {
      id: string;
      role: string;
      /**
       * ADMIN callers only: whether they hold
       * `users.candidates.profile.contact`. Undefined for every other role,
       * which keeps the employer paywall path untouched.
       */
      privileged?: boolean;
    }
  ) {
    const profile = await prisma.candidateProfile.findFirst({
      where: { OR: [{ id: idOrUserId }, { userId: idOrUserId }] },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatar: true,
            isEmailVerified: true,
            isMobileVerified: true,
            isWhatsappVerified: true,
            mobileNumber: true,
            whatsappNumber: true,
            lastActiveAt: true,
          },
        },
      },
    });
    if (!profile) throw new AppError('Candidate not found', 404);

    // Resolve Premium markers (verified badge, profile boost) so employers
    // see the trust signal on candidate detail. Best-effort — if the
    // entitlement service errors we still return the profile.
    let hasVerifiedBadge = false;
    let hasProfileBoost = false;
    try {
      const { getActiveEntitlementsForUser } = await import('./entitlement.service');
      const snapshot = await getActiveEntitlementsForUser(profile.userId);
      hasVerifiedBadge = Boolean(snapshot.features['feature.candidate_verified_badge']);
      hasProfileBoost = Boolean(snapshot.features['feature.candidate_profile_boost']);
    } catch {
      /* non-critical */
    }

    // Contact paywall — email/phone are what a CV_UNLOCK buys. Visible
    // only to admins, unlimited-unlock plans, prior unlockers, or
    // employers this candidate applied to. Everyone else gets the
    // profile with contacts stripped + the Unlock CTA on the frontend.
    // An ADMIN reveals contacts only with `users.candidates.profile.contact`
    // (resolved by the controller). Keying this on the ROLE meant every admin
    // bypassed the paywall that the whole CV_UNLOCK product is built on.
    let contactUnlocked =
      requester?.role === 'SUPER_ADMIN' ||
      (requester?.role === 'ADMIN' && requester?.privileged === true);
    if (!contactUnlocked && requester) {
      try {
        const { canViewContact } = await import('./cv-unlock.service');
        contactUnlocked = await canViewContact(requester.id, profile.userId);
      } catch {
        contactUnlocked = false; // fail closed — never leak contacts
      }
    }

    // Strip raw R2 URLs — employers must use the signed download endpoint
    return {
      ...profile,
      ...(contactUnlocked
        ? {}
        : {
            phone: null,
            alternatePhone: null,
            alternateEmail: null,
          }),
      resume: profile.resume ? true : null,
      generatedResumeUrl: profile.generatedResumeUrl ? true : null,
      user: contactUnlocked
        ? profile.user
        : { ...profile.user, email: null, mobileNumber: null, whatsappNumber: null },
      hasVerifiedBadge,
      hasProfileBoost,
      contactUnlocked,
    };
  }

  /**
   * Read the candidate's profile-boost status — does the user's plan
   * grant the boost feature? how many BOOST_DAYS remain in the pool?
   * when does the currently-active boost expire (if any)?
   *
   * Returned shape feeds the dashboard ProfileBoostCard which decides
   * between three CTAs:
   *   1. "Activate today's boost" (eligible + remaining > 0 + not active)
   *   2. "Extend by 24h" (eligible + remaining > 0 + currently active)
   *   3. "Upgrade to Candidate Premium" (not eligible)
   */
  async getBoostStatus(userId: string) {
    const profile = await prisma.candidateProfile.findUnique({
      where: { userId },
      select: { profileBoostActiveUntil: true },
    });
    if (!profile) throw new AppError('Candidate profile not found', 404);

    let eligible = false;
    let daysRemaining = 0;
    let daysTotal = 0;
    try {
      const { getActiveEntitlementsForUser } = await import('./entitlement.service');
      const snap = await getActiveEntitlementsForUser(userId);
      eligible = Boolean(snap.features['feature.candidate_profile_boost']);
      const pool = snap.resources.BOOST_DAYS;
      daysRemaining = pool?.totalRemaining ?? 0;
      daysTotal = pool?.totalAllocated ?? 0;
    } catch {
      /* non-critical — defaults stand */
    }

    const now = Date.now();
    const activeUntilMs = profile.profileBoostActiveUntil?.getTime() ?? 0;
    const isActive = activeUntilMs > now;

    return {
      eligible,
      daysRemaining,
      daysTotal,
      isActive,
      activeUntil: isActive ? profile.profileBoostActiveUntil : null,
      // Hours until expiry, rounded up — used by the frontend countdown
      // chip ("3h left", "21h left") without requiring the client to
      // refetch every minute to stay accurate.
      hoursUntilExpiry: isActive
        ? Math.max(0, Math.ceil((activeUntilMs - now) / (60 * 60 * 1000)))
        : 0,
    };
  }

  /**
   * Spend N BOOST_DAYS resources atomically and set/extend
   * `profileBoostActiveUntil` by N × 24 hours. `days` defaults to 1 and
   * is clamped server-side to [1, daysRemaining] — UI hands a value but
   * we re-validate so a tampered client can't overdraw.
   *
   * Concurrency: consumeResource() uses optimistic-locking
   * (`where: { id, consumed }`) inside a Prisma transaction, so two
   * parallel activations can't double-spend; the loser throws
   * QUOTA_RACE for the client to retry. Atomic over partial spends
   * too — if you request 5 days and only 3 remain, the transaction
   * throws PAYMENT_REQUIRED and rolls back the partial decrements.
   *
   * Stacking: if the boost is already active, the new window appends
   * (current expiry + N × 24h) instead of being clobbered. This way
   * a candidate burning 3 days in one click + 2 days the next gets a
   * contiguous 120h window instead of overlap-wasting any.
   */
  async activateProfileBoost(
    userId: string,
    opts: { days?: number } = {},
    ctx: { ipAddress?: string; userAgent?: string } = {}
  ) {
    // Gate 1 — must have the feature flag (i.e. an active Candidate
    // Premium plan). Friendly error rather than the 402 from consume.
    const { getActiveEntitlementsForUser, consumeResource } = await import('./entitlement.service');
    const snap = await getActiveEntitlementsForUser(userId);
    if (!snap.features['feature.candidate_profile_boost']) {
      throw new AppError(
        'Profile boost requires an active Candidate Premium plan',
        402,
        'BOOST_NOT_ELIGIBLE'
      );
    }

    // Resolve & validate `days`. Default 1, floor non-integers, reject
    // <1 or >remaining. We cross-check against the snapshot here so a
    // bad request gets a 400 instead of leaking through to consume.
    const requested = Math.floor(Number(opts.days ?? 1));
    if (!Number.isFinite(requested) || requested < 1) {
      throw new AppError('Days must be a positive integer', 400, 'INVALID_BOOST_DAYS');
    }
    const remaining = snap.resources.BOOST_DAYS?.totalRemaining ?? 0;
    if (remaining <= 0) {
      throw new AppError(
        'All boost days from your current plan have been used',
        402,
        'PAYMENT_REQUIRED'
      );
    }
    if (requested > remaining) {
      throw new AppError(
        `Only ${remaining} boost day${remaining === 1 ? '' : 's'} left in your pool`,
        400,
        'INSUFFICIENT_BOOST_DAYS'
      );
    }

    // Gate 2 — make sure the profile row exists before we consume the
    // resource (the activate-without-profile case would leave the user
    // charged but unboosted).
    const profile = await prisma.candidateProfile.findUnique({
      where: { userId },
      select: { id: true, profileBoostActiveUntil: true },
    });
    if (!profile) throw new AppError('Candidate profile not found', 404);

    // Consume — atomic across all `requested` days in a single Prisma
    // transaction. Throws AppError(402,'PAYMENT_REQUIRED') if a parallel
    // request drained the pool between our snapshot read and consume.
    const consumeResult = await consumeResource({
      userId,
      unit: 'BOOST_DAYS',
      amount: requested,
      refType: 'PROFILE_BOOST',
      refId: profile.id,
      notes: `Candidate profile boost activation (${requested} day${requested === 1 ? '' : 's'})`,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    // Stack on existing window when present, else start fresh from now.
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const existing = profile.profileBoostActiveUntil?.getTime() ?? 0;
    const newExpiryMs = (existing > now ? existing : now) + requested * ONE_DAY_MS;
    const newExpiry = new Date(newExpiryMs);

    await prisma.candidateProfile.update({
      where: { userId },
      data: { profileBoostActiveUntil: newExpiry },
    });

    // Fire-and-forget GA4 ping — the dashboard ProfileBoostCard refresh
    // shouldn't block on analytics health. The structured audit log
    // entry comes from the audit() middleware on the route.
    trackEvent(getClientId(userId), {
      name: 'candidate_profile_boost_activated',
      params: {
        days_spent: requested,
        remaining_boost_days: consumeResult.remaining,
      },
    }).catch(() => {});

    logger.info('candidate.profile_boost_activated', {
      userId,
      daysSpent: requested,
      activeUntil: newExpiry.toISOString(),
      remaining: consumeResult.remaining,
    });

    return {
      activeUntil: newExpiry,
      hoursUntilExpiry: Math.max(0, Math.ceil((newExpiryMs - now) / (60 * 60 * 1000))),
      daysSpent: requested,
      daysRemaining: consumeResult.remaining,
    };
  }
}

// Helper to handle Multer file -> Buffer/Base64 for Cloudinary
const profileImageBufferOrPath = (file: Express.Multer.File): string | Buffer => {
  return file.buffer;
};

/**
 * Resolves the searcher's plan-level cap on candidate search results.
 *
 *   - Returns `null` (no cap) when the user has `feature.search_unlimited`
 *     from CV Enterprise, or no entitlement at all (free / unauthenticated
 *     callers — handled by the controller's role gate elsewhere).
 *   - Otherwise picks the highest declared `feature.search_result`
 *     countable across active entitlements. CV Lite = 500, CV Pro = 1500.
 *
 * Failures degrade gracefully — we'd rather return the full result set
 * than block users on a flaky entitlement read.
 */
async function getSearchResultCap(userId: string): Promise<number | null> {
  try {
    const { getActiveEntitlementsForUser } = await import('./entitlement.service');
    const snapshot = await getActiveEntitlementsForUser(userId);
    if (snapshot.features['feature.search_unlimited']) return null;
    const caps = snapshot.entitlements
      .flatMap((e) => e.features)
      .filter((f) => f.key === 'feature.search_result' && f.included && f.countableLimit !== null)
      .map((f) => f.countableLimit ?? 0)
      .filter((n) => n > 0);
    return caps.length === 0 ? null : Math.max(...caps);
  } catch {
    return null;
  }
}

/**
 * Filter keys treated as "advanced" by the CV Pro plan promise.
 * CV Lite (basic filters) gets keyword/location/experience/skills/sortBy.
 * CV Pro / Enterprise unlock the full filter set below. Stripping an
 * advanced filter when the searcher lacks `feature.advanced_filters`
 * silently downgrades the search rather than rejecting it.
 */
const ADVANCED_FILTER_KEYS = new Set<string>([
  'salaryMin',
  'salaryMax',
  'salaryCurrency',
  'includeSalaryNotDisclosed',
  'workStatus',
  'noticePeriod',
  'servingNoticePeriod',
  'gender',
  'willingToRelocate',
  'lastActiveWithin',
  'currentIndustry',
  'currentCompany',
  'excludeCompany',
  'designation',
  'department',
  'ageMin',
  'ageMax',
  'hasCareerBreak',
  'careerBreakType',
  'verifiedMobile',
  'verifiedEmail',
  'registeredAfter',
  'modifiedAfter',
  'certifications',
  'disabilityType',
  'openToWork',
  'category',
  'isVeteran',
  'itSkill',
  'workPermit',
  'highestEducationLevel',
  'drivingLicenseType',
  'preferredJobType',
  'preferredWorkMode',
  'excludeKeywords',
  'keywordOperator',
  'keywordScope',
  'functionalArea',
  'radiusKm',
]);

async function hasAdvancedFilters(userId: string): Promise<boolean> {
  try {
    const { getActiveEntitlementsForUser } = await import('./entitlement.service');
    const snapshot = await getActiveEntitlementsForUser(userId);
    return Boolean(
      snapshot.features['feature.advanced_filters'] || snapshot.features['feature.search_unlimited'] // Enterprise gets all filters
    );
  } catch {
    // On lookup failure, allow filters through — better UX than blocking.
    return true;
  }
}

function stripAdvancedFilters<T extends Record<string, unknown>>(filters: T): T {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (!ADVANCED_FILTER_KEYS.has(key)) cleaned[key] = value;
  }
  return cleaned as T;
}

/**
 * Adds `hasVerifiedBadge` (and `hasProfileBoost`) booleans to each candidate
 * row in a list. Uses a single batch query against the entitlement service
 * — safe at any list size. Best-effort: any failure just leaves the flags
 * as `false` rather than blowing up the search.
 */
async function enrichWithVerifiedBadge<
  T extends { userId?: string | null; user?: { id?: string } | null },
>(rows: T[]): Promise<(T & { hasVerifiedBadge: boolean; hasProfileBoost: boolean })[]> {
  const userIds = rows
    .map((r) => r.userId ?? r.user?.id ?? null)
    .filter((v): v is string => typeof v === 'string');
  if (userIds.length === 0) {
    return rows.map((r) => ({ ...r, hasVerifiedBadge: false, hasProfileBoost: false }));
  }
  try {
    // Boost badge needs TWO checks (matches search ranking gate in
    // search.service.ts): the candidate's plan must grant the boost
    // feature AND `profileBoostActiveUntil` must be in the future
    // (i.e. they've actually activated a day from the BOOST_DAYS pool).
    const now = new Date();
    const { getUsersWithFeature } = await import('./entitlement.service');
    const [verifiedSet, boostFeatureSet, activeBoostRows] = await Promise.all([
      getUsersWithFeature(userIds, 'feature.candidate_verified_badge'),
      getUsersWithFeature(userIds, 'feature.candidate_profile_boost'),
      prisma.candidateProfile.findMany({
        where: { userId: { in: userIds }, profileBoostActiveUntil: { gt: now } },
        select: { userId: true },
      }),
    ]);
    const activeBoostSet = new Set(activeBoostRows.map((r) => r.userId));
    return rows.map((r) => {
      const uid = r.userId ?? r.user?.id ?? '';
      return {
        ...r,
        hasVerifiedBadge: verifiedSet.has(uid),
        hasProfileBoost: boostFeatureSet.has(uid) && activeBoostSet.has(uid),
      };
    });
  } catch {
    return rows.map((r) => ({ ...r, hasVerifiedBadge: false, hasProfileBoost: false }));
  }
}

export const candidateService = new CandidateService();
