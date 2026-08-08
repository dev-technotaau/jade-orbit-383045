/**
 * Super-admin follow controller — read-only insight into the
 * candidate↔company follow graph.
 *
 * Three endpoints:
 *   - GET /super-admin/follows/stats
 *   - GET /super-admin/follows/companies/:companyId/followers
 *   - GET /super-admin/follows/users/:userId/following
 */
import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';
import { BadRequestError, NotFoundError } from '../exceptions';
import logger from '../config/logger';

const TOP_N = 20;

export const getStats = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Global totals — `groupBy` returns one row per unique key, so
    // its `.length` gives "distinct followers" / "distinct followed
    // companies" without a separate query. We use Promise.all
    // instead of $transaction here because we mix raw counts +
    // groupBy results, and $transaction's array signature only
    // accepts native query-builder promises (not arbitrary mix).
    const [totalFollows, followersGroup, followedGroup, topCompanies, topCandidates] =
      await Promise.all([
        prisma.companyFollow.count(),
        prisma.companyFollow.groupBy({
          by: ['userId'],
          _count: { _all: true },
        }),
        prisma.companyFollow.groupBy({
          by: ['companyId'],
          _count: { _all: true },
        }),
        // Top N companies by follower count.
        prisma.companyFollow.groupBy({
          by: ['companyId'],
          _count: { _all: true },
          orderBy: { _count: { id: 'desc' } },
          take: TOP_N,
        }),
        // Top N candidates by follow count.
        prisma.companyFollow.groupBy({
          by: ['userId'],
          _count: { _all: true },
          orderBy: { _count: { id: 'desc' } },
          take: TOP_N,
        }),
      ]);
    const uniqueFollowers = followersGroup.length;
    const uniqueFollowedCompanies = followedGroup.length;

    // Hydrate company + user details for the top lists.
    const topCompanyIds = topCompanies.map((c) => c.companyId);
    const topUserIds = topCandidates.map((c) => c.userId);

    const [companyRows, userRows] = await Promise.all([
      topCompanyIds.length > 0
        ? prisma.companyProfile.findMany({
            where: { id: { in: topCompanyIds } },
            select: {
              id: true,
              slug: true,
              companyName: true,
              logo: true,
              isVerified: true,
              industry: true,
            },
          })
        : Promise.resolve([]),
      topUserIds.length > 0
        ? prisma.user.findMany({
            where: { id: { in: topUserIds } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
              role: true,
              candidateProfile: {
                select: {
                  headline: true,
                  currentLocation: true,
                  experienceYears: true,
                },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    const companyById = new Map(companyRows.map((c) => [c.id, c]));
    const userById = new Map(userRows.map((u) => [u.id, u]));

    res.status(200).json({
      status: 'success',
      data: {
        totals: {
          totalFollows,
          uniqueFollowers,
          uniqueFollowedCompanies,
        },
        topFollowedCompanies: topCompanies.map((row) => ({
          followers: row._count._all,
          company: companyById.get(row.companyId) ?? { id: row.companyId },
        })),
        topFollowingCandidates: topCandidates.map((row) => ({
          following: row._count._all,
          user: userById.get(row.userId) ?? { id: row.userId },
        })),
      },
    });
  } catch (err) {
    logger.error('super-admin follows stats failed', err);
    next(err);
  }
};

export const listCompanyFollowers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = String(req.params.companyId || '');
    if (!companyId) throw new BadRequestError('companyId required');
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

    const company = await prisma.companyProfile.findUnique({
      where: { id: companyId },
      select: { id: true, slug: true, companyName: true, logo: true, isVerified: true },
    });
    if (!company) throw new NotFoundError('Company not found');

    const [items, total] = await prisma.$transaction([
      prisma.companyFollow.findMany({
        where: { companyId },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
              role: true,
              isSuspended: true,
              createdAt: true,
              candidateProfile: {
                select: {
                  headline: true,
                  currentRole: true,
                  currentCompany: true,
                  currentLocation: true,
                  experienceYears: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.companyFollow.count({ where: { companyId } }),
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        company,
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
      },
    });
  } catch (err) {
    next(err);
  }
};

export const listUserFollowing = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = String(req.params.userId || '');
    if (!userId) throw new BadRequestError('userId required');
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        avatar: true,
        role: true,
      },
    });
    if (!user) throw new NotFoundError('User not found');

    const [items, total] = await prisma.$transaction([
      prisma.companyFollow.findMany({
        where: { userId },
        include: {
          company: {
            select: {
              id: true,
              slug: true,
              companyName: true,
              logo: true,
              tagline: true,
              industry: true,
              isVerified: true,
              companyType: true,
              city: true,
              state: true,
              headquarters: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.companyFollow.count({ where: { userId } }),
    ]);

    // Open jobs count per company (so the admin sees which followed
    // companies are actually hiring).
    const companyIds = items.map((i) => i.companyId);
    const counts =
      companyIds.length > 0
        ? await prisma.jobPost.groupBy({
            by: ['companyId'],
            where: {
              companyId: { in: companyIds },
              status: 'OPEN',
              publicSearchable: true,
            },
            _count: { _all: true },
          })
        : [];
    const countMap = new Map(counts.map((c) => [c.companyId, c._count._all]));

    res.status(200).json({
      status: 'success',
      data: {
        user,
        items: items.map((row) => ({
          followedAt: row.createdAt,
          company: {
            ...row.company,
            openJobsCount: countMap.get(row.companyId) ?? 0,
          },
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) {
    next(err);
  }
};
