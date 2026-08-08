/**
 * Super-admin oversight for the Team (multi-seat) and Vendor surfaces.
 *
 * Read-side: list + drill-in views for monitoring across the platform.
 * Write-side: force-revoke a team member, toggle vendor verified flag,
 * override vendor public visibility, moderate (delete) vendor reviews.
 *
 * All mutations write AuditLog entries (entity = the object being
 * mutated, performedBy = req.user.id from the controller).
 *
 * Plan-feature scoping is intentionally NOT applied here — super-admin
 * sees everything regardless of plan state. Routes are gated by
 * `restrictTo(Role.SUPER_ADMIN)` at the express layer.
 */
import { prisma } from '../config/prisma';
import type { VendorLeadStatus } from '@prisma/client';
import { TeamMemberStatus, TeamRole, type Prisma } from '@prisma/client';
import { AppError, NotFoundError } from '../exceptions';
import logger from '../config/logger';

// =====================================================================
// Audit helper — keeps AuditLog writes consistent + non-fatal.
// =====================================================================

async function writeAudit(args: {
  action: string;
  entity: string;
  entityId?: string;
  performedBy: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { AuditService } = await import('./audit.service');
    await AuditService.log({
      action: args.action,
      entity: args.entity,
      entityId: args.entityId,
      performedBy: args.performedBy,
      details: args.details ?? {},
    });
  } catch (err) {
    logger.warn(`Audit log write failed: ${args.action}`, {
      err: err instanceof Error ? err.message : err,
    });
  }
}

// =====================================================================
// TEAMS
// =====================================================================

export interface ListTeamsArgs {
  query?: string; // company name fuzzy match
  page?: number;
  limit?: number;
}

/**
 * Page of all employer teams (one row per CompanyProfile that has at
 * least one EmployerTeamMember row OR exists at all). Returns aggregate
 * counts so the table can show "5 active / 7 invited" inline.
 */
export async function listTeams(args: ListTeamsArgs = {}) {
  const page = Math.max(1, Math.floor(args.page ?? 1));
  const limit = Math.min(100, Math.max(1, Math.floor(args.limit ?? 25)));
  const skip = (page - 1) * limit;
  const where: Prisma.CompanyProfileWhereInput = {};
  if (args.query?.trim()) {
    where.companyName = { contains: args.query.trim(), mode: 'insensitive' };
  }

  const [companies, total] = await prisma.$transaction([
    prisma.companyProfile.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        userId: true,
        companyName: true,
        logo: true,
        isVerified: true,
        createdAt: true,
        user: { select: { email: true, firstName: true, lastName: true } },
        teamMembers: {
          select: { id: true, status: true, role: true },
        },
      },
    }),
    prisma.companyProfile.count({ where }),
  ]);

  // Per-company entitlement check — does the owner have an active
  // VENDOR_CONNECT or any plan? We just surface "hasActivePlan" so the
  // table can flag teams whose seat features are about to lapse.
  const userIds = companies.map((c) => c.userId);
  const activeOwnerEnts = await prisma.entitlement.findMany({
    where: {
      userId: { in: userIds },
      status: 'ACTIVE',
      validUntil: { gt: new Date() },
    },
    select: { userId: true },
    distinct: ['userId'],
  });
  const activeSet = new Set(activeOwnerEnts.map((r) => r.userId));

  const items = companies.map((c) => {
    const active = c.teamMembers.filter((m) => m.status === TeamMemberStatus.ACTIVE).length;
    const pending = c.teamMembers.filter((m) => m.status === TeamMemberStatus.PENDING).length;
    return {
      companyId: c.id,
      companyName: c.companyName,
      logo: c.logo,
      ownerUserId: c.userId,
      ownerEmail: c.user.email,
      ownerName:
        [c.user.firstName, c.user.lastName].filter(Boolean).join(' ').trim() || c.user.email,
      isVerifiedCompany: c.isVerified,
      activeMembers: active,
      pendingInvites: pending,
      totalSeats: 1 + active, // owner + active seats
      ownerHasActivePlan: activeSet.has(c.userId),
      createdAt: c.createdAt,
    };
  });

  return {
    items,
    pagination: { total, page, limit, pages: Math.ceil(total / limit) || 1 },
  };
}

/**
 * Drill-in view for one company. Returns members (owner synthesised + all
 * non-revoked seats), recent audit log entries scoped to this company's
 * EmployerTeamMember IDs, and a 30-day per-member usage breakdown.
 */
export async function getTeamDetail(companyId: string) {
  const company = await prisma.companyProfile.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      userId: true,
      companyName: true,
      logo: true,
      isVerified: true,
      createdAt: true,
      user: { select: { id: true, email: true, firstName: true, lastName: true, avatar: true } },
    },
  });
  if (!company) throw new NotFoundError('Company not found');

  const seats = await prisma.employerTeamMember.findMany({
    where: { companyId },
    orderBy: [{ status: 'asc' }, { invitedAt: 'desc' }],
    include: {
      user: {
        select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
      },
    },
  });

  // Audit history scoped to this company's seat IDs (EmployerTeamMember
  // entityId) plus the company id (for ownership transfers).
  const seatIds = seats.map((s) => s.id);
  const audit = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entity: 'EmployerTeamMember', entityId: { in: seatIds } },
        { entity: 'CompanyProfile', entityId: company.id, action: 'TEAM_OWNERSHIP_TRANSFERRED' },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  // 30-day per-member consumption — same query shape as
  // team.service.getTeamUsage but scoped here directly.
  const since = new Date(Date.now() - 30 * 86_400_000);
  const ledger = await prisma.resourceLedger.findMany({
    where: {
      reason: 'CONSUME',
      delta: { lt: 0 },
      createdAt: { gte: since },
      entitlementResource: { entitlement: { userId: company.userId } },
    },
    select: {
      userId: true,
      delta: true,
      entitlementResource: { select: { unit: true } },
    },
  });

  const byUser = new Map<string, { perUnit: Record<string, number>; total: number }>();
  for (const e of ledger) {
    const row = byUser.get(e.userId) ?? { perUnit: {}, total: 0 };
    const consumed = Math.abs(e.delta);
    row.perUnit[e.entitlementResource.unit] =
      (row.perUnit[e.entitlementResource.unit] ?? 0) + consumed;
    row.total += consumed;
    byUser.set(e.userId, row);
  }

  return {
    company,
    members: [
      {
        id: `owner:${company.user.id}`,
        userId: company.user.id,
        email: company.user.email,
        name:
          [company.user.firstName, company.user.lastName].filter(Boolean).join(' ').trim() ||
          company.user.email,
        avatar: company.user.avatar ?? null,
        role: TeamRole.OWNER,
        status: TeamMemberStatus.ACTIVE,
        invitedAt: null,
        joinedAt: null,
        revokedAt: null,
        isOwner: true,
        usage30d: byUser.get(company.user.id) ?? { perUnit: {}, total: 0 },
      },
      ...seats.map((s) => ({
        id: s.id,
        userId: s.userId,
        email: s.user?.email ?? s.invitedEmail,
        name: s.user
          ? [s.user.firstName, s.user.lastName].filter(Boolean).join(' ').trim() || s.user.email
          : s.invitedEmail,
        avatar: s.user?.avatar ?? null,
        role: s.role,
        status: s.status,
        invitedAt: s.invitedAt,
        joinedAt: s.joinedAt,
        revokedAt: s.revokedAt,
        isOwner: false,
        usage30d: s.userId
          ? (byUser.get(s.userId) ?? { perUnit: {}, total: 0 })
          : { perUnit: {}, total: 0 },
      })),
    ],
    audit,
  };
}

/**
 * Force-revoke a team member as super-admin (compliance / abuse).
 * Owner-side mutations would normally be blocked by RBAC; this bypasses
 * since super-admin oversight requires unconditional authority.
 */
export async function forceRevokeMember(args: {
  superAdminUserId: string;
  memberId: string;
  reason?: string;
}): Promise<void> {
  const row = await prisma.employerTeamMember.findUnique({
    where: { id: args.memberId },
  });
  if (!row) throw new NotFoundError('Team member not found');
  if (row.role === TeamRole.OWNER) {
    throw new AppError(
      'Cannot revoke the company owner — use ownership transfer first.',
      400,
      'CANNOT_REVOKE_OWNER'
    );
  }
  await prisma.employerTeamMember.update({
    where: { id: row.id },
    data: {
      status: TeamMemberStatus.REVOKED,
      revokedAt: new Date(),
      inviteToken: null,
    },
  });
  void writeAudit({
    action: 'SUPER_ADMIN_TEAM_FORCE_REVOKE',
    entity: 'EmployerTeamMember',
    entityId: row.id,
    performedBy: args.superAdminUserId,
    details: {
      companyId: row.companyId,
      memberEmail: row.invitedEmail,
      memberRole: row.role,
      reason: args.reason ?? null,
    },
  });
}

// =====================================================================
// VENDORS
// =====================================================================

export interface ListVendorsArgs {
  query?: string;
  isVerified?: boolean;
  isPublic?: boolean;
  hasActiveSub?: boolean;
  page?: number;
  limit?: number;
}

export async function listVendors(args: ListVendorsArgs = {}) {
  const page = Math.max(1, Math.floor(args.page ?? 1));
  const limit = Math.min(100, Math.max(1, Math.floor(args.limit ?? 25)));
  const skip = (page - 1) * limit;
  const where: Prisma.VendorProfileWhereInput = {};
  if (args.query?.trim()) {
    where.OR = [
      { businessName: { contains: args.query.trim(), mode: 'insensitive' } },
      { contactEmail: { contains: args.query.trim(), mode: 'insensitive' } },
      { slug: { contains: args.query.trim(), mode: 'insensitive' } },
    ];
  }
  if (typeof args.isVerified === 'boolean') where.isVerified = args.isVerified;
  if (typeof args.isPublic === 'boolean') where.isPublic = args.isPublic;

  // Active-sub filter — pre-resolve userIds with feature.vendor_listing.
  let userIdFilter: string[] | null = null;
  if (typeof args.hasActiveSub === 'boolean') {
    const active = await prisma.entitlement.findMany({
      where: {
        status: 'ACTIVE',
        validUntil: { gt: new Date() },
        plan: { features: { some: { key: 'feature.vendor_listing', included: true } } },
      },
      select: { userId: true },
      distinct: ['userId'],
    });
    userIdFilter = active.map((r) => r.userId);
    if (args.hasActiveSub) {
      where.userId = { in: userIdFilter };
    } else {
      where.userId = { notIn: userIdFilter };
    }
  }

  const [items, total] = await prisma.$transaction([
    prisma.vendorProfile.findMany({
      where,
      orderBy: [{ isVerified: 'desc' }, { updatedAt: 'desc' }],
      skip,
      take: limit,
      select: {
        id: true,
        slug: true,
        userId: true,
        businessName: true,
        contactEmail: true,
        contactPhone: true,
        logo: true,
        isVerified: true,
        isPublic: true,
        createdAt: true,
        services: true,
        locations: true,
        user: { select: { email: true } },
      },
    }),
    prisma.vendorProfile.count({ where }),
  ]);

  // Per-vendor stats — leads + reviews — single batched aggregate query.
  const ids = items.map((v) => v.id);
  const [leadAgg, reviewAgg] = await Promise.all([
    prisma.vendorLead.groupBy({
      by: ['vendorProfileId'],
      where: { vendorProfileId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.vendorReview.groupBy({
      by: ['vendorProfileId'],
      where: { vendorProfileId: { in: ids } },
      _avg: { rating: true },
      _count: { _all: true },
    }),
  ]);

  const leadMap = new Map(leadAgg.map((r) => [r.vendorProfileId, r._count._all]));
  const reviewMap = new Map(
    reviewAgg.map((r) => [r.vendorProfileId, { avg: r._avg.rating ?? null, count: r._count._all }])
  );

  // Compute active-sub flag if not already filtered (so the table can
  // show a badge column unconditionally).
  let activeSet: Set<string>;
  if (userIdFilter) {
    activeSet = new Set(userIdFilter);
  } else {
    const rows = await prisma.entitlement.findMany({
      where: {
        userId: { in: items.map((v) => v.userId) },
        status: 'ACTIVE',
        validUntil: { gt: new Date() },
        plan: { features: { some: { key: 'feature.vendor_listing', included: true } } },
      },
      select: { userId: true },
      distinct: ['userId'],
    });
    activeSet = new Set(rows.map((r) => r.userId));
  }

  const enriched = items.map((v) => ({
    ...v,
    leadCount: leadMap.get(v.id) ?? 0,
    avgRating: reviewMap.get(v.id)?.avg ?? null,
    reviewCount: reviewMap.get(v.id)?.count ?? 0,
    hasActiveSub: activeSet.has(v.userId),
  }));

  return {
    items: enriched,
    pagination: { total, page, limit, pages: Math.ceil(total / limit) || 1 },
  };
}

export async function getVendorDetail(vendorProfileId: string) {
  const v = await prisma.vendorProfile.findUnique({
    where: { id: vendorProfileId },
    include: {
      user: {
        select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
      },
    },
  });
  if (!v) throw new NotFoundError('Vendor not found');

  const [leads, reviews, sub] = await Promise.all([
    prisma.vendorLead.findMany({
      where: { vendorProfileId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        jobPost: { select: { id: true, title: true } },
        employer: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    }),
    prisma.vendorReview.findMany({
      where: { vendorProfileId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        reviewer: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    }),
    prisma.entitlement.findFirst({
      where: {
        userId: v.userId,
        status: 'ACTIVE',
        validUntil: { gt: new Date() },
        plan: { features: { some: { key: 'feature.vendor_listing', included: true } } },
      },
      select: { id: true, validUntil: true, plan: { select: { name: true, code: true } } },
    }),
  ]);

  const leadCounts = leads.reduce<Record<VendorLeadStatus, number>>(
    (acc, l) => {
      acc[l.status] = (acc[l.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<VendorLeadStatus, number>
  );
  const ratingStats = reviews.length
    ? {
        avg: reviews.reduce((s, r) => s + r.rating, 0) / reviews.length,
        count: reviews.length,
      }
    : { avg: null, count: 0 };

  // Job-board activity by this vendor: contact reveals (VENDOR_LEAD spends,
  // each audited) + saved postings. Surfaces the new capability for
  // super-admin oversight alongside received leads + reviews.
  const [revealRows, revealCount, savedCount] = await Promise.all([
    prisma.resourceLedger.findMany({
      where: { userId: v.userId, refType: 'VENDOR_LEAD', reason: 'CONSUME' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { refId: true, createdAt: true },
    }),
    prisma.resourceLedger.count({
      where: { userId: v.userId, refType: 'VENDOR_LEAD', reason: 'CONSUME' },
    }),
    prisma.savedVendorJob.count({ where: { vendorUserId: v.userId } }),
  ]);
  const revealJobIds = revealRows.map((r) => r.refId).filter((id): id is string => Boolean(id));
  const revealJobs = revealJobIds.length
    ? await prisma.jobPost.findMany({
        where: { id: { in: revealJobIds } },
        select: { id: true, title: true, slug: true, company: { select: { companyName: true } } },
      })
    : [];
  const revealJobMap = new Map(revealJobs.map((j) => [j.id, j]));
  const contactReveals = revealRows.map((r) => {
    const j = r.refId ? revealJobMap.get(r.refId) : undefined;
    return {
      jobPostId: r.refId,
      jobTitle: j?.title ?? null,
      jobSlug: j?.slug ?? null,
      companyName: j?.company?.companyName ?? null,
      revealedAt: r.createdAt,
    };
  });

  return {
    vendor: v,
    leads,
    reviews,
    leadCounts,
    ratingStats,
    activeSubscription: sub,
    contactReveals,
    revealCount,
    savedCount,
  };
}

export async function setVendorVerified(args: {
  superAdminUserId: string;
  vendorProfileId: string;
  isVerified: boolean;
}) {
  const updated = await prisma.vendorProfile.update({
    where: { id: args.vendorProfileId },
    data: { isVerified: args.isVerified },
  });
  void writeAudit({
    action: args.isVerified ? 'SUPER_ADMIN_VENDOR_VERIFIED' : 'SUPER_ADMIN_VENDOR_UNVERIFIED',
    entity: 'VendorProfile',
    entityId: updated.id,
    performedBy: args.superAdminUserId,
    details: { slug: updated.slug, businessName: updated.businessName },
  });
  return updated;
}

export async function setVendorVisibility(args: {
  superAdminUserId: string;
  vendorProfileId: string;
  isPublic: boolean;
  reason?: string;
}) {
  const updated = await prisma.vendorProfile.update({
    where: { id: args.vendorProfileId },
    data: { isPublic: args.isPublic },
  });
  void writeAudit({
    action: args.isPublic ? 'SUPER_ADMIN_VENDOR_UNHIDE' : 'SUPER_ADMIN_VENDOR_FORCE_HIDE',
    entity: 'VendorProfile',
    entityId: updated.id,
    performedBy: args.superAdminUserId,
    details: {
      slug: updated.slug,
      businessName: updated.businessName,
      reason: args.reason ?? null,
    },
  });
  return updated;
}

export async function moderateDeleteReview(args: {
  superAdminUserId: string;
  reviewId: string;
  reason?: string;
}): Promise<void> {
  const row = await prisma.vendorReview.findUnique({ where: { id: args.reviewId } });
  if (!row) throw new NotFoundError('Review not found');
  await prisma.vendorReview.delete({ where: { id: row.id } });
  void writeAudit({
    action: 'SUPER_ADMIN_VENDOR_REVIEW_DELETED',
    entity: 'VendorReview',
    entityId: row.id,
    performedBy: args.superAdminUserId,
    details: {
      vendorProfileId: row.vendorProfileId,
      reviewerId: row.reviewerId,
      rating: row.rating,
      hadText: Boolean(row.text),
      reason: args.reason ?? null,
    },
  });
}

// =====================================================================
// ANALYTICS — combined teams + vendors metrics for the SA dashboard.
// =====================================================================

export async function getAnalytics() {
  const now = new Date();

  const [
    totalCompanies,
    companiesWithSeats,
    activeSeats,
    pendingInvites,
    totalVendors,
    verifiedVendors,
    publicVendors,
    leadsByStatus,
    reviewsAgg,
    activeVendorListingUsers,
    topTeams,
    topVendors,
    totalLeadReveals,
  ] = await Promise.all([
    prisma.companyProfile.count(),
    prisma.companyProfile.count({
      where: { teamMembers: { some: { status: TeamMemberStatus.ACTIVE } } },
    }),
    prisma.employerTeamMember.count({ where: { status: TeamMemberStatus.ACTIVE } }),
    prisma.employerTeamMember.count({ where: { status: TeamMemberStatus.PENDING } }),
    prisma.vendorProfile.count(),
    prisma.vendorProfile.count({ where: { isVerified: true } }),
    prisma.vendorProfile.count({ where: { isPublic: true } }),
    prisma.vendorLead.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.vendorReview.aggregate({
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.entitlement.findMany({
      where: {
        status: 'ACTIVE',
        validUntil: { gt: now },
        plan: { features: { some: { key: 'feature.vendor_listing', included: true } } },
      },
      select: { userId: true },
      distinct: ['userId'],
    }),
    // Top-10 teams by 30-day consumption.
    prisma.resourceLedger.groupBy({
      by: ['userId'],
      where: {
        reason: 'CONSUME',
        delta: { lt: 0 },
        createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
      },
      _sum: { delta: true },
      orderBy: { _sum: { delta: 'asc' } }, // most negative = highest consumption
      take: 10,
    }),
    // Top-10 vendors by lead volume.
    prisma.vendorLead.groupBy({
      by: ['vendorProfileId'],
      _count: { _all: true },
      orderBy: { _count: { vendorProfileId: 'desc' } },
      take: 10,
    }),
    // Total job-board contact reveals (VENDOR_LEAD spends) platform-wide.
    prisma.resourceLedger.count({ where: { refType: 'VENDOR_LEAD', reason: 'CONSUME' } }),
  ]);

  // Hydrate the top-10 lists with names/emails for nice display.
  const topTeamUserIds = topTeams.map((r) => r.userId);
  const teamUsers = topTeamUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: topTeamUserIds } },
        select: { id: true, email: true, firstName: true, lastName: true },
      })
    : [];
  const teamUserMap = new Map(teamUsers.map((u) => [u.id, u]));

  const topVendorIds = topVendors.map((r) => r.vendorProfileId);
  const vendorMeta = topVendorIds.length
    ? await prisma.vendorProfile.findMany({
        where: { id: { in: topVendorIds } },
        select: { id: true, slug: true, businessName: true, isVerified: true },
      })
    : [];
  const vendorMetaMap = new Map(vendorMeta.map((v) => [v.id, v]));

  return {
    teams: {
      totalCompanies,
      companiesWithMultiSeat: companiesWithSeats,
      activeSeats,
      pendingInvites,
      topByConsumption: topTeams.map((r) => {
        const u = teamUserMap.get(r.userId);
        return {
          userId: r.userId,
          email: u?.email ?? 'unknown',
          name: u
            ? [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email
            : 'unknown',
          consumed: Math.abs(r._sum.delta ?? 0),
        };
      }),
    },
    vendors: {
      totalVendors,
      verifiedVendors,
      publicVendors,
      activeSubscriptions: activeVendorListingUsers.length,
      avgRating: reviewsAgg._avg.rating ?? null,
      reviewCount: reviewsAgg._count._all,
      totalLeadReveals,
      leadsByStatus: Object.fromEntries(
        leadsByStatus.map((r) => [r.status, r._count._all])
      ) as Record<string, number>,
      topByLeads: topVendors.map((r) => {
        const v = vendorMetaMap.get(r.vendorProfileId);
        return {
          vendorProfileId: r.vendorProfileId,
          slug: v?.slug ?? '',
          businessName: v?.businessName ?? 'unknown',
          isVerified: v?.isVerified ?? false,
          leadCount: r._count._all,
        };
      }),
    },
  };
}
