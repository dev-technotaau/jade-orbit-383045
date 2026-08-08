import { prisma } from '../config/prisma';
import { PAGINATION } from '@/constants';

class ProfileViewService {
  /**
   * Track a profile view with 24-hour debounce.
   * Prevents duplicate view records from the same viewer within 24 hours.
   */
  async trackView(viewerId: string, profileUserId: string, viewType: string) {
    // Don't track self-views
    if (viewerId === profileUserId) {
      return null;
    }

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Check if same viewer viewed same profile in last 24 hours
    const recentView = await prisma.profileView.findFirst({
      where: {
        viewerId,
        profileUserId,
        viewType,
        createdAt: {
          gte: twentyFourHoursAgo,
        },
      },
    });

    if (recentView) {
      return recentView;
    }

    const view = await prisma.profileView.create({
      data: {
        viewerId,
        profileUserId,
        viewType,
      },
    });

    return view;
  }

  /**
   * Get paginated list of who viewed a profile.
   */
  async getProfileViews(
    profileUserId: string,
    page: number = 1,
    limit: number = PAGINATION.DEFAULT_LIMIT
  ) {
    const skip = (page - 1) * limit;

    const [views, total] = await prisma.$transaction([
      prisma.profileView.findMany({
        where: { profileUserId },
        include: {
          viewer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
              role: true,
              companyProfile: {
                select: { companyName: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.profileView.count({ where: { profileUserId } }),
    ]);

    return {
      views,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get view count for a profile within a given period.
   * @param period - 'week', 'month', or 'all'
   */
  async getProfileViewCount(profileUserId: string, period?: 'week' | 'month' | 'all') {
    const where: any = { profileUserId };

    if (period && period !== 'all') {
      const now = new Date();
      let startDate: Date;

      if (period === 'week') {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else {
        // month
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      where.createdAt = { gte: startDate };
    }

    const count = await prisma.profileView.count({ where });

    return { count, period: period || 'all' };
  }
}

export const profileViewService = new ProfileViewService();
