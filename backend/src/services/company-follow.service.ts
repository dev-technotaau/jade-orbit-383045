/**
 * Company-follow service.
 *
 * Drives:
 *   - Follow / Following button on the public company-detail page
 *   - Candidate's /following list + aggregated job feed
 *   - Employer's /followers admin page
 *   - Notification fan-out when a followed company posts a new job
 *
 * Methods are idempotent where it matters:
 *   - `follow()` — repeated calls don't error; returns the existing
 *     row if already followed.
 *   - `unfollow()` — silently no-ops on already-unfollowed.
 */
import { prisma } from '../config/prisma';
import { NotFoundError } from '../exceptions';
import logger from '../config/logger';

export interface FollowStatus {
  isFollowing: boolean;
  followersCount: number;
}

/**
 * Resolve a slug or id to a {companyId, companyUserId, companyName}.
 * Used by the controller layer to accept either form on the route.
 */
export async function resolveCompanyRef(ref: {
  id?: string;
  slug?: string;
}): Promise<{ id: string; userId: string; companyName: string } | null> {
  if (!ref.id && !ref.slug) return null;
  const company = await prisma.companyProfile.findFirst({
    where: ref.id ? { id: ref.id } : { slug: ref.slug },
    select: { id: true, userId: true, companyName: true, publicSearchable: true },
  });
  if (!company) return null;
  if (!company.publicSearchable) return null;
  return { id: company.id, userId: company.userId, companyName: company.companyName };
}

/**
 * Follow a company (idempotent). Notifies the employer in-app on
 * first-follow only — repeated calls don't emit duplicate notifs.
 */
export async function follow(userId: string, companyId: string): Promise<FollowStatus> {
  const existing = await prisma.companyFollow.findUnique({
    where: { userId_companyId: { userId, companyId } },
    select: { id: true },
  });

  if (!existing) {
    try {
      await prisma.companyFollow.create({ data: { userId, companyId } });
      // Fire-and-forget notification to the employer. Failures don't
      // roll back the follow — the candidate's intent is honoured
      // regardless of notification delivery.
      void notifyEmployerOfNewFollower(companyId, userId).catch((err) => {
        logger.warn('notifyEmployerOfNewFollower failed (non-fatal)', err);
      });
    } catch (err: unknown) {
      // Race-condition tolerance: another concurrent follow() race
      // could have inserted between our findUnique + create.
      // Treat unique-violation as "already followed" — return status.
      const code = (err as { code?: string }).code;
      if (code !== 'P2002') throw err;
    }
  }

  return getStatus(userId, companyId);
}

export async function unfollow(userId: string, companyId: string): Promise<FollowStatus> {
  await prisma.companyFollow
    .delete({ where: { userId_companyId: { userId, companyId } } })
    .catch((err: unknown) => {
      const code = (err as { code?: string }).code;
      if (code !== 'P2025') throw err; // P2025 = "not found" — no-op.
    });
  return getStatus(userId, companyId);
}

export async function getStatus(userId: string | null, companyId: string): Promise<FollowStatus> {
  const [followersCount, isFollowing] = await Promise.all([
    prisma.companyFollow.count({ where: { companyId } }),
    userId
      ? prisma.companyFollow.findUnique({
          where: { userId_companyId: { userId, companyId } },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);
  return {
    followersCount,
    isFollowing: !!isFollowing,
  };
}

/**
 * Public counts in bulk — used by the company-detail endpoint to
 * include `followersCount` (and `isFollowing` when authenticated)
 * on every public response.
 */
export async function getStatusForCompanyIds(
  userId: string | null,
  companyIds: string[]
): Promise<Map<string, FollowStatus>> {
  if (companyIds.length === 0) return new Map();
  const [counts, mine] = await Promise.all([
    prisma.companyFollow.groupBy({
      by: ['companyId'],
      where: { companyId: { in: companyIds } },
      _count: { _all: true },
    }),
    userId
      ? prisma.companyFollow.findMany({
          where: { userId, companyId: { in: companyIds } },
          select: { companyId: true },
        })
      : Promise.resolve([]),
  ]);

  const countMap = new Map(counts.map((c) => [c.companyId, c._count._all]));
  const followingSet = new Set(mine.map((m) => m.companyId));
  const result = new Map<string, FollowStatus>();
  for (const id of companyIds) {
    result.set(id, {
      followersCount: countMap.get(id) ?? 0,
      isFollowing: followingSet.has(id),
    });
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────
// Candidate-side: list followed companies + aggregated job feed
// ─────────────────────────────────────────────────────────────────────

export interface ListFollowedCompaniesInput {
  userId: string;
  page?: number;
  limit?: number;
  /** Free-text search across company name + industry. */
  q?: string;
  /** Sort key — defaults to most-recently-followed. */
  sort?: 'recent' | 'name' | 'open_jobs';
}

export async function listFollowedCompanies(input: ListFollowedCompaniesInput) {
  const limit = Math.min(input.limit ?? 20, 50);
  const page = Math.max(input.page ?? 1, 1);

  // Search query — server-side filter against the joined company.
  const q = input.q?.trim();
  const where: Record<string, unknown> = {
    userId: input.userId,
    ...(q
      ? {
          company: {
            OR: [
              { companyName: { contains: q, mode: 'insensitive' } },
              { industry: { contains: q, mode: 'insensitive' } },
            ],
          },
        }
      : {}),
  };

  // Sort — default 'recent' uses CompanyFollow.createdAt. 'name'
  // sorts by company.companyName ASC; 'open_jobs' sort can't be
  // expressed at the Prisma level without a denormalised counter,
  // so we'll post-sort after hydration for that key.
  const orderBy =
    input.sort === 'name'
      ? { company: { companyName: 'asc' as const } }
      : { createdAt: 'desc' as const };

  const [items, total] = await prisma.$transaction([
    prisma.companyFollow.findMany({
      where,
      include: {
        company: {
          select: {
            id: true,
            slug: true,
            companyName: true,
            logo: true,
            tagline: true,
            industry: true,
            companySize: true,
            isVerified: true,
            city: true,
            state: true,
            headquarters: true,
            companyType: true,
          },
        },
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.companyFollow.count({ where }),
  ]);

  // Per-company open-jobs count for the cards.
  const companyIds = items.map((i) => i.companyId);
  const counts = await prisma.jobPost.groupBy({
    by: ['companyId'],
    where: {
      companyId: { in: companyIds },
      status: 'OPEN',
      publicSearchable: true,
    },
    _count: { _all: true },
  });
  const countMap = new Map(counts.map((c) => [c.companyId, c._count._all]));

  // 'open_jobs' sort — re-rank the in-memory page by open-job count
  // descending. Page-level only (true global sort would need a
  // denormalised counter).
  const sortedItems =
    input.sort === 'open_jobs'
      ? [...items].sort(
          (a, b) => (countMap.get(b.companyId) ?? 0) - (countMap.get(a.companyId) ?? 0)
        )
      : items;

  // Bulk-fetch review aggregates so the UI can render the rating
  // badge per followed company without an N+1 fetch.
  const { getAggregatesForCompanyIds } = await import('./review-aggregate.service');
  const aggMap = await getAggregatesForCompanyIds(companyIds);

  return {
    items: sortedItems.map((row) => ({
      followedAt: row.createdAt,
      company: {
        ...row.company,
        openJobsCount: countMap.get(row.companyId) ?? 0,
        averageRating: aggMap.get(row.companyId)?.averageRating ?? 0,
        totalReviews: aggMap.get(row.companyId)?.totalReviews ?? 0,
      },
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export interface ListFollowedCompanyJobsInput {
  userId: string;
  page?: number;
  limit?: number;
}

export async function listFollowedCompanyJobs(input: ListFollowedCompanyJobsInput) {
  const limit = Math.min(input.limit ?? 20, 50);
  const page = Math.max(input.page ?? 1, 1);

  // Step 1 — followed company ids.
  const follows = await prisma.companyFollow.findMany({
    where: { userId: input.userId },
    select: { companyId: true },
  });
  const companyIds = follows.map((f) => f.companyId);
  if (companyIds.length === 0) {
    return {
      items: [],
      pagination: { page, limit, total: 0, totalPages: 0 },
    };
  }

  // Step 2 — paged job feed, OPEN + publicSearchable.
  const [items, total] = await prisma.$transaction([
    prisma.jobPost.findMany({
      where: {
        companyId: { in: companyIds },
        status: 'OPEN',
        publicSearchable: true,
      },
      include: {
        company: {
          select: {
            id: true,
            slug: true,
            companyName: true,
            logo: true,
            isVerified: true,
          },
        },
      },
      orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.jobPost.count({
      where: {
        companyId: { in: companyIds },
        status: 'OPEN',
        publicSearchable: true,
      },
    }),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────
// Employer-side: list followers
// ─────────────────────────────────────────────────────────────────────

export interface ListFollowersInput {
  /** The employer's user.id — we resolve to companyId internally. */
  employerUserId: string;
  page?: number;
  limit?: number;
  /** Free-text search — first/last name + email + headline. */
  q?: string;
  /** Sort key — defaults to most-recently-followed. */
  sort?: 'recent' | 'name';
}

export async function listFollowers(input: ListFollowersInput) {
  const limit = Math.min(input.limit ?? 20, 50);
  const page = Math.max(input.page ?? 1, 1);

  const company = await prisma.companyProfile.findUnique({
    where: { userId: input.employerUserId },
    select: { id: true },
  });
  if (!company) throw new NotFoundError('Company profile not found');

  const q = input.q?.trim();
  const where: Record<string, unknown> = {
    companyId: company.id,
    ...(q
      ? {
          user: {
            OR: [
              { firstName: { contains: q, mode: 'insensitive' } },
              { lastName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { candidateProfile: { headline: { contains: q, mode: 'insensitive' } } },
            ],
          },
        }
      : {}),
  };

  const orderBy =
    input.sort === 'name'
      ? { user: { firstName: 'asc' as const } }
      : { createdAt: 'desc' as const };

  const [items, total] = await prisma.$transaction([
    prisma.companyFollow.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatar: true,
            candidateProfile: {
              select: {
                headline: true,
                currentRole: true,
                currentCompany: true,
                experienceYears: true,
                currentLocation: true,
              },
            },
          },
        },
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.companyFollow.count({ where }),
  ]);

  return {
    items: items.map((row) => ({
      followedAt: row.createdAt,
      user: row.user,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────
// Notification helpers (fire-and-forget)
// ─────────────────────────────────────────────────────────────────────

/**
 * In-app notify the employer when a candidate follows their company.
 * Uses the existing notification.service so user notification
 * preferences are honoured.
 */
async function notifyEmployerOfNewFollower(
  companyId: string,
  followerUserId: string
): Promise<void> {
  const [company, follower] = await Promise.all([
    prisma.companyProfile.findUnique({
      where: { id: companyId },
      select: { userId: true, companyName: true },
    }),
    prisma.user.findUnique({
      where: { id: followerUserId },
      select: { firstName: true, lastName: true, avatar: true, email: true },
    }),
  ]);
  if (!company || !follower) return;

  const followerName =
    [follower.firstName, follower.lastName].filter(Boolean).join(' ').trim() || 'A candidate';

  // 1. In-app notification — persisted to DB + auto-emitted via the
  //    in-app worker's generic 'notification' Socket.IO event so the
  //    employer's notification bell updates in real-time.
  const { notificationService } = await import('./notification.service');
  await notificationService.send({
    userId: company.userId,
    title: 'New follower',
    message: `${followerName} just started following ${company.companyName}.`,
    type: 'INFO' as const,
    category: 'company_follower',
    link: '/employer/followers',
    metadata: { followerUserId, companyId },
    channels: ['in_app'],
  });

  // 2. Dedicated Socket.IO event so the employer's OPEN Followers
  //    page can prepend the new follower row without a manual
  //    refresh. The generic 'notification' event used by the bell
  //    isn't specific enough for live-list updates.
  try {
    const { getIO } = await import('../socket');
    const io = getIO();
    io.to(`user:${company.userId}`).emit('company:follower:added', {
      companyId,
      follower: {
        id: followerUserId,
        firstName: follower.firstName,
        lastName: follower.lastName,
        email: follower.email,
        avatar: follower.avatar,
      },
      followedAt: new Date().toISOString(),
    });
  } catch {
    // Socket.IO may not be initialised in worker contexts — the
    // persisted notification still surfaces on refresh, so this is
    // non-fatal.
  }
}

/**
 * In-app notify all followers of a company-profile update (verified
 * status, awards, leadership change, etc.).
 *
 * Throttled — at most one notification per company per 24 hours so
 * fast-iterating employers don't spam their followers. Throttle key
 * lives in Redis with a 24h TTL.
 *
 * Categorised separately ('followed_company_update') so candidates
 * can filter just-jobs-from-followed vs just-updates.
 */
const FOLLOW_UPDATE_THROTTLE_SEC = 24 * 60 * 60;

export async function notifyFollowersOfCompanyUpdate(
  companyId: string,
  summary: string
): Promise<{ notified: number; throttled?: boolean }> {
  // Throttle gate — Redis SET NX EX. If the key already exists, skip.
  const { redis } = await import('../config/redis');
  const throttleKey = `company-follow-update-throttle:${companyId}`;
  try {
    const acquired = await redis.set(throttleKey, '1', 'EX', FOLLOW_UPDATE_THROTTLE_SEC, 'NX');
    if (acquired !== 'OK') {
      return { notified: 0, throttled: true };
    }
  } catch (err) {
    // Redis unavailable — proceed without throttle (fail-open). Bad
    // case: rare cluster outage triggers a duplicate notification.
    logger.warn('follow-update throttle check failed (proceeding)', err);
  }

  const company = await prisma.companyProfile.findUnique({
    where: { id: companyId },
    select: { companyName: true, slug: true },
  });
  if (!company) return { notified: 0 };

  const followers = await prisma.companyFollow.findMany({
    where: { companyId },
    select: { userId: true },
  });
  if (followers.length === 0) return { notified: 0 };

  const link = company.slug ? `/companies/${company.slug}` : `/companies`;
  const { notificationService } = await import('./notification.service');

  const CHUNK = 100;
  let notified = 0;
  for (let i = 0; i < followers.length; i += CHUNK) {
    const slice = followers.slice(i, i + CHUNK);
    await Promise.allSettled(
      slice.map((f) =>
        notificationService.send({
          userId: f.userId,
          title: `${company.companyName} update`,
          message: summary,
          type: 'INFO' as const,
          category: 'followed_company_update',
          link,
          metadata: { companyId },
          channels: ['in_app'],
        })
      )
    );
    notified += slice.length;
  }
  return { notified };
}

/**
 * Fan out an in-app notification to every follower of a company —
 * called when the company posts a new job.
 *
 * For companies with thousands of followers, the BullMQ worker is the
 * preferred path (see `jobs/follower-notify.queue.ts`). This direct
 * helper is used by the worker itself + by callers that want to
 * fire-and-forget for small follower counts.
 */
export async function notifyFollowersOfNewJob(
  companyId: string,
  jobId: string
): Promise<{ notified: number }> {
  const [company, job] = await Promise.all([
    prisma.companyProfile.findUnique({
      where: { id: companyId },
      select: { companyName: true },
    }),
    prisma.jobPost.findUnique({
      where: { id: jobId },
      select: { title: true, slug: true, location: true, status: true, publicSearchable: true },
    }),
  ]);
  if (!company || !job) return { notified: 0 };
  if (job.status !== 'OPEN' || !job.publicSearchable) return { notified: 0 };

  const followers = await prisma.companyFollow.findMany({
    where: { companyId },
    select: { userId: true },
  });
  if (followers.length === 0) return { notified: 0 };

  const link = job.slug ? `/jobs/${job.slug}` : '/jobs';
  const { notificationService } = await import('./notification.service');

  // Process in chunks — large follower counts shouldn't hammer the
  // notification service in one go.
  const CHUNK = 100;
  let notified = 0;
  for (let i = 0; i < followers.length; i += CHUNK) {
    const slice = followers.slice(i, i + CHUNK);
    await Promise.allSettled(
      slice.map((f) =>
        notificationService.send({
          userId: f.userId,
          title: `${company.companyName} just posted a new job`,
          message: `${job.title}${job.location ? ` · ${job.location}` : ''}`,
          type: 'INFO' as const,
          category: 'followed_company_new_job',
          link,
          metadata: { companyId, jobId },
          channels: ['in_app'],
        })
      )
    );
    notified += slice.length;
  }
  return { notified };
}
