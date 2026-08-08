/**
 * Super-admin job tooling — the read side (company picker + edit fetch) for
 * the "post / edit a job on behalf of a company" feature. The write side
 * (create / update) reuses `jobService.createJobForCompany` /
 * `updateJobForCompany` so all moderation / indexing / Kafka / notification
 * logic stays in one place.
 */
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';

export const superAdminJobsService = {
  /**
   * Searchable list of companies for the super-admin job-poster's company
   * selector. Returns the CompanyProfile id (the value a job is posted
   * against) plus enough to render a recognizable option.
   */
  async listCompanies(params: { q?: string; page?: number; limit?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(50, Math.max(1, params.limit ?? 20));
    const q = params.q?.trim();
    const where = q
      ? {
          OR: [
            { companyName: { contains: q, mode: 'insensitive' as const } },
            { user: { email: { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : {};

    const [items, total] = await prisma.$transaction([
      prisma.companyProfile.findMany({
        where,
        select: {
          id: true,
          companyName: true,
          logo: true,
          city: true,
          state: true,
          isVerified: true,
          user: { select: { email: true } },
        },
        orderBy: { companyName: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.companyProfile.count({ where }),
    ]);

    return {
      items: items.map((c) => ({
        id: c.id,
        companyName: c.companyName,
        logo: c.logo,
        city: c.city,
        state: c.state,
        isVerified: c.isVerified,
        ownerEmail: c.user?.email ?? null,
      })),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1,
    };
  },

  /**
   * Fetch a job for the super-admin edit form — full editable payload incl.
   * screening questions, WITHOUT the view-count increment the public
   * `jobService.getJob` performs.
   */
  async getJobForEdit(jobId: string) {
    const job = await prisma.jobPost.findUnique({
      where: { id: jobId },
      include: {
        company: {
          select: { id: true, slug: true, companyName: true, logo: true, companyType: true },
        },
        screeningQuestions: { orderBy: { displayOrder: 'asc' } },
      },
    });
    if (!job) throw new AppError('Job not found', 404, 'JOB_NOT_FOUND');
    return job;
  },
};
