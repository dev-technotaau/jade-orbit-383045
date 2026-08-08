/**
 * Vendor Connect — an EMPLOYER capability, not a separate role.
 *
 * Any employer who pays for the `VENDOR_CONNECT` plan (₹199/mo) gains
 * vendor powers on top of their employer account: they receive hiring
 * requirements from other employers, appear in the public vendor
 * directory, and can browse other employers' job postings with direct
 * employer contact details (the vendor job board).
 *
 * Models:
 *   - VendorProfile : business profile, services, locations, public flag
 *                     (one per user — keyed on the employer's userId)
 *   - VendorLead    : a lead routed from an employer (or scraped from a
 *                     JobPost). Vendor responds → status RESPONDED.
 *
 * Plan-gating: receiving leads + the job board require
 * `feature.vendor_leads`. Public listing only shows vendors who have an
 * active VENDOR_CONNECT entitlement (we filter at query time).
 */
import { prisma } from '../config/prisma';
import {
  JobStatus,
  ResourceLedgerReason,
  VendorLeadStatus,
  type VendorProfile,
  type VendorLead,
} from '@prisma/client';
import { AppError, NotFoundError, BadRequestError, ConflictError } from '../exceptions';
import { consumeResource, getActiveEntitlementsForUser } from './entitlement.service';
import { AuditService } from './audit.service';
import logger from '../config/logger';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

async function findUniqueSlug(base: string): Promise<string> {
  const slug = slugify(base) || `vendor-${Date.now().toString(36)}`;
  let candidate = slug;
  let i = 1;
  while (await prisma.vendorProfile.findUnique({ where: { slug: candidate } })) {
    candidate = `${slug}-${i}`;
    i += 1;
    if (i > 100) {
      candidate = `${slug}-${Date.now().toString(36)}`;
      break;
    }
  }
  return candidate;
}

export interface CreateVendorProfileInput {
  businessName: string;
  description?: string;
  logo?: string;
  website?: string;
  contactEmail: string;
  contactPhone: string;
  services?: string[];
  industries?: string[];
  locations?: string[];
  yearsInBusiness?: number;
  teamSize?: number;
}

export async function createOrUpdateProfile(
  userId: string,
  input: CreateVendorProfileInput
): Promise<VendorProfile> {
  if (!input.businessName?.trim()) {
    throw new BadRequestError('businessName is required');
  }
  if (!input.contactEmail?.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.contactEmail)) {
    throw new BadRequestError('Valid contactEmail is required');
  }
  if (!input.contactPhone?.trim()) {
    throw new BadRequestError('contactPhone is required');
  }

  const existing = await prisma.vendorProfile.findUnique({ where: { userId } });
  if (existing) {
    return prisma.vendorProfile.update({
      where: { id: existing.id },
      data: {
        businessName: input.businessName.trim(),
        description: input.description?.trim() ?? null,
        logo: input.logo ?? null,
        website: input.website?.trim() ?? null,
        contactEmail: input.contactEmail.trim().toLowerCase(),
        contactPhone: input.contactPhone.trim(),
        services: input.services ?? [],
        industries: input.industries ?? [],
        locations: input.locations ?? [],
        yearsInBusiness: input.yearsInBusiness ?? null,
        teamSize: input.teamSize ?? null,
      },
    });
  }
  const slug = await findUniqueSlug(input.businessName);
  return prisma.vendorProfile.create({
    data: {
      userId,
      slug,
      businessName: input.businessName.trim(),
      description: input.description?.trim() ?? null,
      logo: input.logo ?? null,
      website: input.website?.trim() ?? null,
      contactEmail: input.contactEmail.trim().toLowerCase(),
      contactPhone: input.contactPhone.trim(),
      services: input.services ?? [],
      industries: input.industries ?? [],
      locations: input.locations ?? [],
      yearsInBusiness: input.yearsInBusiness ?? null,
      teamSize: input.teamSize ?? null,
    },
  });
}

export async function getMyProfile(userId: string): Promise<VendorProfile | null> {
  return prisma.vendorProfile.findUnique({ where: { userId } });
}

/**
 * Upload a logo image, run it through Cloudinary's `companyLogo` preset
 * (400×400 fit, auto quality, auto format), and persist the resulting
 * URL on the vendor profile. Old logo is deleted from Cloudinary best-
 * effort to avoid orphaned assets.
 */
export async function uploadLogo(
  userId: string,
  file: Express.Multer.File
): Promise<VendorProfile> {
  const { uploadImage, uploadOptions, deleteImage, extractPublicId } =
    await import('../config/cloudinary');
  const existing = await prisma.vendorProfile.findUnique({
    where: { userId },
    select: { id: true, logo: true },
  });
  const result = await uploadImage(file.buffer, uploadOptions.companyLogo);

  if (existing?.logo) {
    const oldId = extractPublicId(existing.logo);
    if (oldId) void deleteImage(oldId).catch(() => {});
  }

  if (existing) {
    return prisma.vendorProfile.update({
      where: { id: existing.id },
      data: { logo: result.secure_url },
    });
  }
  // No profile yet — caller should hit `createOrUpdateProfile` first.
  // Throw rather than silently creating a malformed row.
  throw new BadRequestError('Set up your business profile before uploading a logo.');
}

export async function setPublicFlag(userId: string, isPublic: boolean): Promise<VendorProfile> {
  const existing = await prisma.vendorProfile.findUnique({ where: { userId } });
  if (!existing) throw new NotFoundError('Vendor profile not found');
  return prisma.vendorProfile.update({
    where: { id: existing.id },
    data: { isPublic },
  });
}

// --- Public directory ---

export interface ListPublicArgs {
  service?: string;
  location?: string;
  industry?: string;
  query?: string;
  page?: number;
  limit?: number;
}

export async function listPublicVendors(args: ListPublicArgs = {}) {
  const page = Math.max(1, Math.floor(args.page ?? 1));
  const limit = Math.min(50, Math.max(1, Math.floor(args.limit ?? 20)));
  const skip = (page - 1) * limit;

  // Vendor visibility requires:
  //   1. The vendor has flipped their profile public, AND
  //   2. They have an active VENDOR_CONNECT entitlement (feature.vendor_listing).
  // Without both, lapsed subscribers would stay in the directory forever.
  const eligibleUserIds = await getUsersWithActiveVendorListing();
  if (eligibleUserIds.length === 0) {
    return { items: [], pagination: { total: 0, page, limit, pages: 1 } };
  }

  const where: Record<string, unknown> = {
    isPublic: true,
    userId: { in: eligibleUserIds },
  };
  if (args.service) where.services = { has: args.service };
  if (args.location) where.locations = { has: args.location };
  if (args.industry) where.industries = { has: args.industry };
  if (args.query) {
    where.OR = [
      { businessName: { contains: args.query, mode: 'insensitive' } },
      { description: { contains: args.query, mode: 'insensitive' } },
    ];
  }
  const [items, total] = await prisma.$transaction([
    prisma.vendorProfile.findMany({
      where,
      orderBy: [{ isVerified: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
      select: {
        id: true,
        slug: true,
        businessName: true,
        description: true,
        logo: true,
        website: true,
        services: true,
        industries: true,
        locations: true,
        yearsInBusiness: true,
        teamSize: true,
        isVerified: true,
      },
    }),
    prisma.vendorProfile.count({ where }),
  ]);

  // Inject rating aggregates per card — single batched query.
  const ratingStats = await getRatingStats(items.map((i) => i.id));
  const enriched = items.map((i) => ({
    ...i,
    avgRating: ratingStats.get(i.id)?.avgRating ?? null,
    reviewCount: ratingStats.get(i.id)?.reviewCount ?? 0,
  }));

  return {
    items: enriched,
    pagination: { total, page, limit, pages: Math.ceil(total / limit) || 1 },
  };
}

/**
 * Returns the set of vendor userIds with an active VENDOR_CONNECT entitlement
 * (`feature.vendor_listing`). One indexed query — cheap to call per
 * directory request.
 */
async function getUsersWithActiveVendorListing(): Promise<string[]> {
  const rows = await prisma.entitlement.findMany({
    where: {
      status: 'ACTIVE',
      validUntil: { gt: new Date() },
      plan: {
        features: {
          some: { key: 'feature.vendor_listing', included: true },
        },
      },
    },
    select: { userId: true },
    distinct: ['userId'],
  });
  return rows.map((r) => r.userId);
}

export async function getPublicVendorBySlug(slug: string) {
  const v = await prisma.vendorProfile.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      userId: true,
      businessName: true,
      description: true,
      logo: true,
      website: true,
      contactEmail: true,
      contactPhone: true,
      services: true,
      industries: true,
      locations: true,
      yearsInBusiness: true,
      teamSize: true,
      isVerified: true,
      isPublic: true,
    },
  });
  if (!v || !v.isPublic) throw new NotFoundError('Vendor not found');

  // Same active-subscription check as the listing endpoint — direct
  // slug visits would otherwise bypass the entitlement filter.
  const eligibleUserIds = await getUsersWithActiveVendorListing();
  if (!eligibleUserIds.includes(v.userId)) {
    throw new NotFoundError('Vendor not found');
  }

  // Attach rating aggregate so the public detail page can render stars.
  const stats = await getRatingStats([v.id]);
  return {
    ...v,
    avgRating: stats.get(v.id)?.avgRating ?? null,
    reviewCount: stats.get(v.id)?.reviewCount ?? 0,
  };
}

// --- Leads (vendor inbox) ---

export async function listMyLeads(
  userId: string,
  args: { status?: VendorLeadStatus; page?: number; limit?: number } = {}
) {
  const profile = await prisma.vendorProfile.findUnique({ where: { userId } });
  if (!profile) throw new NotFoundError('Set up your vendor profile first');
  const page = Math.max(1, Math.floor(args.page ?? 1));
  const limit = Math.min(50, Math.max(1, Math.floor(args.limit ?? 20)));
  const skip = (page - 1) * limit;
  const where: Record<string, unknown> = { vendorProfileId: profile.id };
  if (args.status) where.status = args.status;
  const [items, total] = await prisma.$transaction([
    prisma.vendorLead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        jobPost: { select: { id: true, title: true, location: true } },
        employer: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    }),
    prisma.vendorLead.count({ where }),
  ]);
  return {
    items,
    pagination: { total, page, limit, pages: Math.ceil(total / limit) || 1 },
  };
}

export async function respondToLead(args: {
  userId: string;
  leadId: string;
  status: 'RESPONDED' | 'ACCEPTED' | 'DECLINED';
  responseText?: string;
}): Promise<VendorLead> {
  const profile = await prisma.vendorProfile.findUnique({ where: { userId: args.userId } });
  if (!profile) throw new NotFoundError('Vendor profile not found');
  const lead = await prisma.vendorLead.findFirst({
    where: { id: args.leadId, vendorProfileId: profile.id },
  });
  if (!lead) throw new NotFoundError('Lead not found');
  if (lead.status !== VendorLeadStatus.PENDING) {
    throw new ConflictError('This lead has already been answered.');
  }
  const updated = await prisma.vendorLead.update({
    where: { id: lead.id },
    data: {
      status: args.status as VendorLeadStatus,
      responseText: args.responseText ?? null,
      respondedAt: new Date(),
    },
  });

  // Close the loop: notify the requesting employer that their hiring
  // requirement got a vendor response (best-effort, multi-channel).
  void notifyEmployerOfLeadResponse(updated.id, profile.businessName).catch((err) =>
    logger.warn('vendor lead-response notification failed', {
      leadId: updated.id,
      err: err instanceof Error ? err.message : err,
    })
  );

  return updated;
}

async function notifyEmployerOfLeadResponse(
  leadId: string,
  vendorBusinessName: string
): Promise<void> {
  const lead = await prisma.vendorLead.findUnique({
    where: { id: leadId },
    include: {
      employer: { select: { id: true, email: true, firstName: true } },
      jobPost: { select: { title: true } },
    },
  });
  if (!lead?.employer) return;
  const { env } = await import('../config/env');
  const { notificationService } = await import('./notification.service');
  const verb =
    lead.status === VendorLeadStatus.ACCEPTED
      ? 'accepted'
      : lead.status === VendorLeadStatus.DECLINED
        ? 'declined'
        : 'responded to';
  const roleRef = lead.jobPost?.title ? ` for ${lead.jobPost.title}` : '';
  const inboxUrl = `${env.FRONTEND_URL ?? 'https://hireadda.in'}/employer/vendor/requests`;
  await notificationService.send({
    userId: lead.employer.id,
    title: `${vendorBusinessName} ${verb} your hiring request`,
    message: `${vendorBusinessName} has ${verb} your hiring requirement${roleRef}.${
      lead.responseText ? ` "${lead.responseText.slice(0, 160)}"` : ''
    }`,
    category: 'vendor_lead_response',
    link: inboxUrl,
    channels: ['in_app', 'email', 'fcm', 'web_push'],
    emailOptions: {
      to: lead.employer.email,
      subject: `${vendorBusinessName} ${verb} your hiring request`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#2563eb;">${vendorBusinessName} ${verb} your request</h2>
        <p>Your hiring requirement${roleRef} just got a response from a recruitment partner.</p>
        ${lead.responseText ? `<blockquote style="border-left:3px solid #16a34a;padding-left:12px;color:#374151;">${lead.responseText}</blockquote>` : ''}
        <a href="${inboxUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;margin-top:16px;">View your requests</a>
      </div>`,
      text: `${vendorBusinessName} ${verb} your hiring requirement${roleRef}.${lead.responseText ? `\n\n"${lead.responseText}"` : ''}\n\n${inboxUrl}`,
    },
  });
}

/**
 * Employer-side view of the round trip: the hiring requirements THIS
 * employer has sent to vendors, with each vendor's response. Available to
 * any employer (sending a lead is not gated by the vendor capability).
 */
export async function listSentLeads(
  employerUserId: string,
  args: { status?: VendorLeadStatus; page?: number; limit?: number } = {}
) {
  const page = Math.max(1, Math.floor(args.page ?? 1));
  const limit = Math.min(50, Math.max(1, Math.floor(args.limit ?? 20)));
  const skip = (page - 1) * limit;
  const where: Record<string, unknown> = { employerId: employerUserId };
  if (args.status) where.status = args.status;
  const [items, total] = await prisma.$transaction([
    prisma.vendorLead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        jobPost: { select: { id: true, title: true, slug: true } },
        vendorProfile: {
          select: { id: true, slug: true, businessName: true, logo: true, isVerified: true },
        },
      },
    }),
    prisma.vendorLead.count({ where }),
  ]);
  // Status tallies across ALL of this employer's sent leads (ignores the
  // current status filter so the tab counts stay stable). Kept out of the
  // $transaction tuple above — groupBy's _count typing collapses there.
  const statusGroups = await prisma.vendorLead.groupBy({
    by: ['status'],
    where: { employerId: employerUserId },
    _count: { _all: true },
    orderBy: { status: 'asc' },
  });
  const counts = Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all])) as Record<
    string,
    number
  >;
  return {
    items,
    counts,
    pagination: { total, page, limit, pages: Math.ceil(total / limit) || 1 },
  };
}

// --- Employer-side: send a hiring requirement to a vendor ---

export async function sendLeadToVendor(args: {
  vendorSlug: string;
  employerUserId: string;
  requirementText: string;
  contactEmail: string;
  contactPhone?: string;
  jobPostId?: string;
}): Promise<VendorLead> {
  if (!args.requirementText?.trim() || args.requirementText.trim().length < 20) {
    throw new BadRequestError('requirementText must be at least 20 characters');
  }
  const vendor = await prisma.vendorProfile.findUnique({ where: { slug: args.vendorSlug } });
  if (!vendor || !vendor.isPublic) throw new NotFoundError('Vendor not found');
  if (vendor.userId === args.employerUserId) {
    throw new BadRequestError('You cannot send a hiring lead to your own vendor profile');
  }
  // The receiving vendor must currently hold the Vendor Connect capability,
  // else the lead would land in an inbox they can't open (the directory
  // already hides lapsed vendors, but a stale link could still reach here).
  const vendorEnt = await getActiveEntitlementsForUser(vendor.userId);
  if (!vendorEnt.features['feature.vendor_leads']) {
    throw new BadRequestError('This vendor isn’t accepting hiring requests right now');
  }
  // One open request per (employer, vendor) at a time — prevents spamming
  // the same vendor with duplicate pending requests.
  const existingPending = await prisma.vendorLead.findFirst({
    where: {
      vendorProfileId: vendor.id,
      employerId: args.employerUserId,
      status: VendorLeadStatus.PENDING,
    },
    select: { id: true },
  });
  if (existingPending) {
    throw new ConflictError('You already have a pending request with this vendor');
  }
  const lead = await prisma.vendorLead.create({
    data: {
      vendorProfileId: vendor.id,
      employerId: args.employerUserId,
      requirementText: args.requirementText.trim(),
      contactEmail: args.contactEmail.trim().toLowerCase(),
      contactPhone: args.contactPhone?.trim() ?? null,
      jobPostId: args.jobPostId ?? null,
      expiresAt: new Date(Date.now() + 14 * 86_400_000),
    },
  });

  // Best-effort notify vendor by email so they know to log in.
  void notifyVendorOfNewLead(vendor.id, lead.id).catch((err) =>
    logger.warn('vendor lead email failed', {
      err: err instanceof Error ? err.message : err,
    })
  );
  return lead;
}

async function notifyVendorOfNewLead(vendorProfileId: string, leadId: string): Promise<void> {
  const vendor = await prisma.vendorProfile.findUnique({
    where: { id: vendorProfileId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          whatsappNumber: true,
          mobileNumber: true,
          isWhatsappVerified: true,
        },
      },
    },
  });
  if (!vendor?.user) return;
  const lead = await prisma.vendorLead.findUnique({
    where: { id: leadId },
    include: {
      jobPost: { select: { title: true } },
      employer: { select: { firstName: true, lastName: true } },
    },
  });
  if (!lead) return;
  const { env } = await import('../config/env');
  const { vendorNewLeadEmail } = await import('../templates/email/vendor');
  const { notificationService } = await import('./notification.service');
  const inboxUrl = `${env.FRONTEND_URL ?? 'https://hireadda.in'}/employer/vendor/leads`;
  const employerName =
    [lead.employer?.firstName, lead.employer?.lastName].filter(Boolean).join(' ').trim() ||
    undefined;
  const tmpl = vendorNewLeadEmail({
    recipientName: vendor.user.firstName ?? undefined,
    employerName,
    jobTitle: lead.jobPost?.title ?? undefined,
    requirementPreview: lead.requirementText,
    inboxUrl,
  });
  // Multi-channel fan-out (in-app + push + email) via the central
  // notification service, replacing the prior email-only send. WhatsApp is
  // sent separately below now that the Meta-approved `vendor_new_lead`
  // template exists.
  await notificationService.send({
    userId: vendor.user.id,
    title: 'New hiring lead received',
    message: `${employerName ?? 'A company'} sent you a hiring requirement${
      lead.jobPost?.title ? ` for ${lead.jobPost.title}` : ''
    }.`,
    category: 'vendor_lead',
    link: inboxUrl,
    channels: ['in_app', 'email', 'fcm', 'web_push'],
    emailOptions: {
      to: vendor.user.email,
      subject: tmpl.subject,
      html: tmpl.html,
      text: tmpl.text,
    },
  });

  // Best-effort WhatsApp notify via the Meta-approved `vendor_new_lead`
  // template. Fire-and-forget — never let it break the lead flow.
  try {
    const target = vendor.user.isWhatsappVerified
      ? vendor.user.whatsappNumber || vendor.user.mobileNumber
      : null;
    if (target) {
      const { vendorNewLeadWhatsapp } = await import('../templates/whatsapp');
      const { whatsappQueue } = await import('../jobs/whatsapp.queue');
      const waTmpl = vendorNewLeadWhatsapp(
        employerName ?? 'A company',
        lead.jobPost?.title ?? 'a role',
        inboxUrl
      );
      await whatsappQueue.add('send-whatsapp', {
        to: target,
        templateName: waTmpl.templateName,
        components: waTmpl.components,
      });
    }
  } catch (waErr) {
    logger.error('Failed to enqueue WhatsApp vendor_new_lead', waErr);
  }
}

// =====================================================================
// Lead auto-routing — match an employer's requirement to top-N vendors
// =====================================================================

export interface MatchAndSendArgs {
  employerUserId: string;
  requirementText: string;
  contactEmail: string;
  contactPhone?: string;
  jobPostId?: string;
  /** Filter signals — at least one is required for matching to be useful. */
  services?: string[];
  industries?: string[];
  locations?: string[];
  /** Cap on how many vendors receive the lead. Defaults to 3. */
  limit?: number;
  /**
   * If provided, skip matching and send to exactly these vendor profile IDs
   * (still re-validated against the active-subscription filter). Used by
   * the 2-step "preview then confirm" UI so the user-visible ranking
   * matches what actually gets sent.
   */
  vendorIds?: string[];
}

export interface VendorMatchPreview {
  id: string;
  slug: string;
  businessName: string;
  logo: string | null;
  description: string | null;
  services: string[];
  locations: string[];
  industries: string[];
  isVerified: boolean;
  yearsInBusiness: number | null;
  teamSize: number | null;
  score: number;
}

interface MatchAndSendResult {
  matched: number;
  vendors: Array<{ id: string; slug: string; businessName: string; score: number }>;
}

/**
 * Find top-N matching vendors and fan out a single requirement to all
 * of them. Each receiving vendor gets their own VendorLead row so they
 * can respond independently.
 *
 * Matching score = service overlap × 3 + location overlap × 2 +
 * industry overlap × 1. Verified vendors get a +1 tie-breaker.
 *
 * Vendors must have an active VENDOR_CONNECT entitlement (same filter
 * as `listPublicVendors`) to be eligible.
 */
/**
 * Score vendors against a requirement and return the top-N. Pure read,
 * no side effects — the 2-step UI uses this for the preview screen and
 * `matchAndSendLead` calls it internally when `vendorIds` is unset.
 */
export async function previewMatches(args: {
  services?: string[];
  industries?: string[];
  locations?: string[];
  limit?: number;
  /** Requesting employer — their own vendor profile is never matched. */
  excludeUserId?: string;
}): Promise<{ matches: VendorMatchPreview[] }> {
  const limit = Math.min(10, Math.max(1, Math.floor(args.limit ?? 3)));
  let eligibleUserIds = await getUsersWithActiveVendorListing();
  if (args.excludeUserId) {
    eligibleUserIds = eligibleUserIds.filter((id) => id !== args.excludeUserId);
  }
  if (eligibleUserIds.length === 0) {
    return { matches: [] };
  }

  // Plan-promise: VENDOR_CONNECT subscribers get "Priority Access to
  // New Leads". The plan grants `feature.vendor_priority_leads`, which
  // we now use as a +5 ranking bonus on top of overlap/verified scoring.
  const { getUsersWithFeatureAll } = await import('./entitlement.service');
  const priorityIds = new Set(await getUsersWithFeatureAll('feature.vendor_priority_leads'));

  const candidates = await prisma.vendorProfile.findMany({
    where: { isPublic: true, userId: { in: eligibleUserIds } },
    select: {
      id: true,
      slug: true,
      userId: true,
      businessName: true,
      logo: true,
      description: true,
      isVerified: true,
      services: true,
      industries: true,
      locations: true,
      yearsInBusiness: true,
      teamSize: true,
    },
  });

  const services = (args.services ?? []).map((s) => s.toLowerCase().trim());
  const industries = (args.industries ?? []).map((s) => s.toLowerCase().trim());
  const locations = (args.locations ?? []).map((s) => s.toLowerCase().trim());

  const scored: VendorMatchPreview[] = candidates
    .map((v) => {
      const sOverlap = countOverlap(v.services, services) * 3;
      const lOverlap = countOverlap(v.locations, locations) * 2;
      const iOverlap = countOverlap(v.industries, industries);
      const verifiedBonus = v.isVerified ? 1 : 0;
      const priorityBonus = priorityIds.has(v.userId) ? 5 : 0;
      const score = sOverlap + lOverlap + iOverlap + verifiedBonus + priorityBonus;
      // Strip userId before returning — keep the public preview shape clean.
      const { userId: _userId, ...rest } = v;
      return { ...rest, score };
    })
    .filter((v) => v.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return { matches: scored };
}

export async function matchAndSendLead(args: MatchAndSendArgs): Promise<MatchAndSendResult> {
  if (!args.requirementText?.trim() || args.requirementText.trim().length < 20) {
    throw new BadRequestError('requirementText must be at least 20 characters');
  }

  // Two paths: explicit `vendorIds` (from the preview-then-confirm UI),
  // or run matching ourselves. Both end up with `scored` of the vendors
  // we'll create leads for.
  let scored: Array<{ id: string; slug: string; businessName: string; score: number }>;

  if (args.vendorIds && args.vendorIds.length > 0) {
    // Re-validate against the active-subscription filter so a stale
    // preview can't slip a lapsed vendor through.
    const eligibleUserIds = await getUsersWithActiveVendorListing();
    if (eligibleUserIds.length === 0) {
      return { matched: 0, vendors: [] };
    }
    const rows = await prisma.vendorProfile.findMany({
      where: {
        id: { in: args.vendorIds },
        isPublic: true,
        userId: { in: eligibleUserIds, not: args.employerUserId },
      },
      select: { id: true, slug: true, businessName: true },
    });
    if (rows.length === 0) return { matched: 0, vendors: [] };
    // Score is 0 here — UI already showed it during preview. We still
    // store rows so the create-lead loop has consistent shape.
    scored = rows.map((v) => ({ ...v, score: 0 }));
  } else {
    const { matches } = await previewMatches({
      services: args.services,
      industries: args.industries,
      locations: args.locations,
      limit: args.limit,
      excludeUserId: args.employerUserId,
    });
    if (matches.length === 0) return { matched: 0, vendors: [] };
    scored = matches.map((m) => ({
      id: m.id,
      slug: m.slug,
      businessName: m.businessName,
      score: m.score,
    }));
  }

  // Skip vendors that already have an open request from this employer so a
  // re-run of auto-match doesn't pile up duplicate pending leads.
  if (scored.length > 0) {
    const existing = await prisma.vendorLead.findMany({
      where: {
        employerId: args.employerUserId,
        status: VendorLeadStatus.PENDING,
        vendorProfileId: { in: scored.map((v) => v.id) },
      },
      select: { vendorProfileId: true },
    });
    const already = new Set(existing.map((e) => e.vendorProfileId));
    scored = scored.filter((v) => !already.has(v.id));
    if (scored.length === 0) return { matched: 0, vendors: [] };
  }

  // Create one VendorLead per matched vendor, then fire notification emails.
  const expiresAt = new Date(Date.now() + 14 * 86_400_000);
  const created = await prisma.$transaction(
    scored.map((v) =>
      prisma.vendorLead.create({
        data: {
          vendorProfileId: v.id,
          employerId: args.employerUserId,
          requirementText: args.requirementText.trim(),
          contactEmail: args.contactEmail.trim().toLowerCase(),
          contactPhone: args.contactPhone?.trim() ?? null,
          jobPostId: args.jobPostId ?? null,
          expiresAt,
        },
      })
    )
  );

  // Fire-and-forget email notifications to each vendor.
  void Promise.all(
    created.map((lead, i) =>
      notifyVendorOfNewLead(scored[i].id, lead.id).catch((err) =>
        logger.warn('vendor lead email failed (match-and-send)', {
          vendorProfileId: scored[i].id,
          err: err instanceof Error ? err.message : err,
        })
      )
    )
  );

  return {
    matched: scored.length,
    vendors: scored.map((v) => ({
      id: v.id,
      slug: v.slug,
      businessName: v.businessName,
      score: v.score,
    })),
  };
}

function countOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b.map((s) => s.toLowerCase().trim()));
  let count = 0;
  for (const item of a) {
    if (setB.has(item.toLowerCase().trim())) count += 1;
  }
  return count;
}

// =====================================================================
// Reviews
// =====================================================================

export interface CreateReviewInput {
  reviewerUserId: string;
  vendorSlug: string;
  rating: number;
  text?: string;
}

/**
 * Create or update an employer's review of a vendor.
 *
 * Eligibility:
 *   - Reviewer must be an employer (controller-level role check).
 *   - One review per (vendor, reviewer) — uniqueness enforced at DB level.
 *
 * Verification:
 *   - We mark `verified=true` when the reviewer has an existing
 *     RESPONDED / ACCEPTED VendorLead with this vendor. This drives a
 *     visual "Verified review" badge in the UI without blocking
 *     unverified reviewers from leaving feedback.
 */
export async function createReview(args: CreateReviewInput) {
  const rating = Math.round(args.rating);
  if (rating < 1 || rating > 5) {
    throw new BadRequestError('Rating must be 1–5');
  }
  const vendor = await prisma.vendorProfile.findUnique({
    where: { slug: args.vendorSlug },
    select: { id: true },
  });
  if (!vendor) throw new NotFoundError('Vendor not found');

  const verifiedLead = await prisma.vendorLead.findFirst({
    where: {
      vendorProfileId: vendor.id,
      employerId: args.reviewerUserId,
      status: { in: [VendorLeadStatus.RESPONDED, VendorLeadStatus.ACCEPTED] },
    },
    select: { id: true },
  });

  return prisma.vendorReview.upsert({
    where: {
      vendorProfileId_reviewerId: {
        vendorProfileId: vendor.id,
        reviewerId: args.reviewerUserId,
      },
    },
    create: {
      vendorProfileId: vendor.id,
      reviewerId: args.reviewerUserId,
      rating,
      text: args.text?.trim() || null,
      verified: Boolean(verifiedLead),
    },
    update: {
      rating,
      text: args.text?.trim() || null,
      verified: Boolean(verifiedLead),
    },
  });
}

export async function listReviewsForSlug(slug: string, page = 1, limit = 20) {
  const vendor = await prisma.vendorProfile.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!vendor) throw new NotFoundError('Vendor not found');
  const cappedLimit = Math.min(50, Math.max(1, Math.floor(limit)));
  const skip = (Math.max(1, page) - 1) * cappedLimit;
  const [items, total, agg] = await prisma.$transaction([
    prisma.vendorReview.findMany({
      where: { vendorProfileId: vendor.id },
      orderBy: [{ verified: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: cappedLimit,
      include: {
        reviewer: { select: { firstName: true, lastName: true, avatar: true } },
      },
    }),
    prisma.vendorReview.count({ where: { vendorProfileId: vendor.id } }),
    prisma.vendorReview.aggregate({
      where: { vendorProfileId: vendor.id },
      _avg: { rating: true },
      _count: { _all: true },
    }),
  ]);
  return {
    items,
    pagination: { total, page, limit: cappedLimit, pages: Math.ceil(total / cappedLimit) || 1 },
    avgRating: agg._avg.rating ?? null,
    reviewCount: agg._count._all,
  };
}

/** Quick helper used by the directory list endpoint to add aggregate
 *  stats to each vendor card without an N+1. */
export async function getRatingStats(
  vendorProfileIds: string[]
): Promise<Map<string, { avgRating: number | null; reviewCount: number }>> {
  if (vendorProfileIds.length === 0) return new Map();
  const rows = await prisma.vendorReview.groupBy({
    by: ['vendorProfileId'],
    where: { vendorProfileId: { in: vendorProfileIds } },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const map = new Map<string, { avgRating: number | null; reviewCount: number }>();
  for (const r of rows) {
    map.set(r.vendorProfileId, {
      avgRating: r._avg.rating ?? null,
      reviewCount: r._count._all,
    });
  }
  return map;
}

// =====================================================================
// Vendor job board — other employers' open postings with direct
// employer contact details (the core VENDOR_CONNECT promise: "Receive
// Hiring Requirements from Companies").
// =====================================================================

/** ResourceLedger refType for a job-board contact reveal (1 VENDOR_LEAD). */
const VENDOR_LEAD_REF_TYPE = 'VENDOR_LEAD';

export interface VendorJobBoardArgs {
  /** Requesting employer — their own postings are excluded. */
  userId: string;
  keyword?: string;
  location?: string;
  industry?: string;
  type?: string;
  workMode?: string;
  experienceLevel?: string;
  /** Minimum annual/period salary the posting should reach (matches salaryMax >= value). */
  salaryMin?: number;
  urgentOnly?: boolean;
  walkInOnly?: boolean;
  /**
   * Engagement filter:
   *   - all       : every eligible posting (default)
   *   - new       : not yet contact-revealed
   *   - contacted : already contact-revealed (a VENDOR_LEAD was spent)
   *   - saved     : bookmarked to pitch later
   */
  engagement?: 'all' | 'new' | 'contacted' | 'saved';
  sortBy?: 'relevance' | 'newest' | 'salary';
  page?: number;
  limit?: number;
}

/** Job ids this vendor has already revealed contacts for (free re-reveal). */
async function getRevealedJobIds(userId: string, jobIds: string[]): Promise<Set<string>> {
  if (jobIds.length === 0) return new Set();
  const rows = await prisma.resourceLedger.findMany({
    where: {
      userId,
      refType: VENDOR_LEAD_REF_TYPE,
      refId: { in: jobIds },
      reason: ResourceLedgerReason.CONSUME,
    },
    select: { refId: true },
  });
  const s = new Set<string>();
  for (const r of rows) if (r.refId) s.add(r.refId);
  return s;
}

/** Job ids this vendor has bookmarked. */
async function getSavedJobIds(userId: string, jobIds: string[]): Promise<Set<string>> {
  if (jobIds.length === 0) return new Set();
  const rows = await prisma.savedVendorJob.findMany({
    where: { vendorUserId: userId, jobPostId: { in: jobIds } },
    select: { jobPostId: true },
  });
  return new Set(rows.map((r) => r.jobPostId));
}

/**
 * List OPEN job postings from OTHER employers — the vendor job board.
 *
 * Each row carries `contactRevealed` + `saved` flags. The poster's
 * CompanyProfile contact panel (contactEmail / contactPhone /
 * contactPersonName / contactPersonDesignation) is ONLY embedded once
 * the vendor has revealed it (spent a VENDOR_LEAD via `revealJobContact`)
 * — otherwise `contact` is null. Those four fields are stripped from
 * every public payload by public-sanitiser.ts; this reveal flow is the
 * deliberate, metered + audited exception, gated by `feature.vendor_leads`.
 *
 * Confidential postings are excluded entirely: the employer asked to
 * hide their identity, so surfacing their contact panel would defeat that.
 */
export async function listJobBoard(args: VendorJobBoardArgs) {
  const page = Math.max(1, Math.floor(args.page ?? 1));
  const limit = Math.min(50, Math.max(1, Math.floor(args.limit ?? 20)));
  const skip = (page - 1) * limit;

  const ownCompany = await prisma.companyProfile.findUnique({
    where: { userId: args.userId },
    select: { id: true },
  });

  const where: Record<string, unknown> = {
    status: JobStatus.OPEN,
    postingVisibility: { in: ['PUBLIC', 'BOTH'] },
    isConfidential: false,
    ...(ownCompany ? { companyId: { not: ownCompany.id } } : {}),
  };
  if (args.keyword?.trim()) {
    const kw = args.keyword.trim();
    where.OR = [
      { title: { contains: kw, mode: 'insensitive' } },
      { description: { contains: kw, mode: 'insensitive' } },
      { company: { companyName: { contains: kw, mode: 'insensitive' } } },
    ];
  }
  if (args.location?.trim()) {
    where.location = { contains: args.location.trim(), mode: 'insensitive' };
  }
  if (args.industry?.trim()) {
    where.industry = { contains: args.industry.trim(), mode: 'insensitive' };
  }
  if (args.type?.trim()) where.type = args.type.trim();
  if (args.workMode?.trim()) where.workMode = args.workMode.trim();
  if (args.experienceLevel?.trim()) where.experienceLevel = args.experienceLevel.trim();
  if (typeof args.salaryMin === 'number' && args.salaryMin > 0) {
    where.salaryMax = { gte: args.salaryMin };
  }
  if (args.urgentOnly) where.urgencyLevel = 'URGENT';
  if (args.walkInOnly) where.isWalkIn = true;

  // Engagement pre-filter. 'saved' joins SavedVendorJob; 'new'/'contacted'
  // partition on the vendor's revealed-job ledger (bounded set per user).
  if (args.engagement === 'saved') {
    where.savedByVendors = { some: { vendorUserId: args.userId } };
  } else if (args.engagement === 'new' || args.engagement === 'contacted') {
    const revealedRows = await prisma.resourceLedger.findMany({
      where: {
        userId: args.userId,
        refType: VENDOR_LEAD_REF_TYPE,
        reason: ResourceLedgerReason.CONSUME,
      },
      select: { refId: true },
    });
    const revealedIds = revealedRows.map((r) => r.refId).filter((v): v is string => Boolean(v));
    if (args.engagement === 'contacted') {
      // Sentinel keeps the IN list non-empty so "contacted" with nothing
      // revealed yet correctly returns zero rows.
      where.id = { in: revealedIds.length ? revealedIds : ['__none__'] };
    } else {
      where.id = { notIn: revealedIds };
    }
  }

  let orderBy: Record<string, 'asc' | 'desc'>[] = [{ isFeatured: 'desc' }, { createdAt: 'desc' }];
  if (args.sortBy === 'newest') orderBy = [{ createdAt: 'desc' }];
  else if (args.sortBy === 'salary') orderBy = [{ salaryMax: 'desc' }, { createdAt: 'desc' }];

  const [rawItems, total] = await prisma.$transaction([
    prisma.jobPost.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        type: true,
        workMode: true,
        shiftType: true,
        industry: true,
        department: true,
        location: true,
        additionalLocations: true,
        isRemote: true,
        salaryMin: true,
        salaryMax: true,
        currency: true,
        salaryType: true,
        salaryDisclosed: true,
        experienceMin: true,
        experienceMax: true,
        experienceLevel: true,
        skillsRequired: true,
        numberOfOpenings: true,
        urgencyLevel: true,
        isFeatured: true,
        isWalkIn: true,
        applicationDeadline: true,
        expiresAt: true,
        createdAt: true,
        company: {
          select: {
            id: true,
            slug: true,
            companyName: true,
            logo: true,
            industry: true,
            companyType: true,
            companySize: true,
            isVerified: true,
            city: true,
            state: true,
            // Vendor-only contact panel — only surfaced for REVEALED jobs.
            contactEmail: true,
            contactPhone: true,
            contactPersonName: true,
            contactPersonDesignation: true,
          },
        },
      },
    }),
    prisma.jobPost.count({ where }),
  ]);

  const pageIds = rawItems.map((j) => j.id);
  const [revealedSet, savedSet] = await Promise.all([
    getRevealedJobIds(args.userId, pageIds),
    getSavedJobIds(args.userId, pageIds),
  ]);

  const items = rawItems.map((job) => {
    const revealed = revealedSet.has(job.id);
    const { company, ...rest } = job;
    const {
      contactEmail,
      contactPhone,
      contactPersonName,
      contactPersonDesignation,
      ...companyPublic
    } = company;
    return {
      ...rest,
      company: companyPublic,
      contactRevealed: revealed,
      saved: savedSet.has(job.id),
      // Contacts only after a reveal (paywall + audit). Null otherwise.
      contact: revealed
        ? { contactEmail, contactPhone, contactPersonName, contactPersonDesignation }
        : null,
    };
  });

  return {
    items,
    pagination: { total, page, limit, pages: Math.ceil(total / limit) || 1 },
  };
}

// --- Contact reveal (1 VENDOR_LEAD, deduped + audited) ---

export interface RevealJobContactResult {
  companyName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  contactPersonName: string | null;
  contactPersonDesignation: string | null;
  /** True if already revealed before — no quota consumed. */
  cached: boolean;
}

/**
 * Reveal a posting employer's contact details to a vendor, consuming 1
 * VENDOR_LEAD unit. Idempotent on `(vendorUserId, jobPostId)` via a
 * ResourceLedger row (refType=VENDOR_LEAD) — re-revealing the same job is
 * free. Every fresh reveal writes an audit-log entry so we have a trail
 * of which vendor accessed which employer's contacts.
 *
 * Confidential postings and the vendor's own postings are refused.
 */
export async function revealJobContact(args: {
  userId: string;
  jobPostId: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<RevealJobContactResult> {
  const job = await prisma.jobPost.findUnique({
    where: { id: args.jobPostId },
    select: {
      id: true,
      title: true,
      isConfidential: true,
      company: {
        select: {
          userId: true,
          companyName: true,
          contactEmail: true,
          contactPhone: true,
          contactPersonName: true,
          contactPersonDesignation: true,
        },
      },
    },
  });
  if (!job) throw new NotFoundError('Job posting not found');
  if (job.isConfidential) {
    throw new BadRequestError('This posting is confidential — contact details are not available');
  }
  if (job.company.userId === args.userId) {
    throw new BadRequestError('This is your own posting');
  }

  const contact = {
    companyName: job.company.companyName,
    contactEmail: job.company.contactEmail,
    contactPhone: job.company.contactPhone,
    contactPersonName: job.company.contactPersonName,
    contactPersonDesignation: job.company.contactPersonDesignation,
  };

  // Idempotency — already revealed? No charge.
  const prior = await prisma.resourceLedger.findFirst({
    where: {
      userId: args.userId,
      refType: VENDOR_LEAD_REF_TYPE,
      refId: job.id,
      reason: ResourceLedgerReason.CONSUME,
    },
  });
  if (prior) {
    return { ...contact, cached: true };
  }

  // Consume 1 VENDOR_LEAD when the caller holds the feature via a real
  // entitlement. SUPER_ADMIN reaches here through the route's
  // skipForRoles and has no entitlement — audit only, mirroring the
  // CV-unlock unlimited branch.
  const snapshot = await getActiveEntitlementsForUser(args.userId);
  if (snapshot.features['feature.vendor_leads']) {
    await consumeResource({
      userId: args.userId,
      unit: 'VENDOR_LEAD',
      amount: 1,
      refType: VENDOR_LEAD_REF_TYPE,
      refId: job.id,
      notes: `Revealed employer contact for job ${job.id}`,
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
    });
  }

  void AuditService.log({
    action: 'VENDOR_JOB_CONTACT_REVEALED',
    entity: 'JobPost',
    entityId: job.id,
    performedBy: args.userId,
    details: { companyUserId: job.company.userId, companyName: job.company.companyName },
    ipAddress: args.ipAddress,
    userAgent: args.userAgent,
  });

  // Transparency heads-up to the posting's owner: a recruitment partner
  // just accessed their contact details and may reach out. Best-effort,
  // and only for real (profiled) vendors — see the guard inside.
  void notifyEmployerOfContactReveal({
    employerUserId: job.company.userId,
    revealerUserId: args.userId,
    jobPostId: job.id,
    jobTitle: job.title,
  }).catch((err) =>
    logger.warn('vendor contact-reveal heads-up failed', {
      jobPostId: job.id,
      err: err instanceof Error ? err.message : err,
    })
  );

  return { ...contact, cached: false };
}

/**
 * Notify a posting's owning employer that a recruitment partner revealed
 * their contact details. Sent only when the revealer has an actual
 * VendorProfile (so super-admins / profile-less callers don't trigger a
 * vague "a recruitment partner…" alert), and respects the employer's
 * notification preferences via the `vendor_contact_revealed` category.
 */
async function notifyEmployerOfContactReveal(args: {
  employerUserId: string;
  revealerUserId: string;
  jobPostId: string;
  jobTitle: string;
}): Promise<void> {
  const [employer, vendor] = await Promise.all([
    prisma.user.findUnique({
      where: { id: args.employerUserId },
      select: { id: true, email: true, firstName: true },
    }),
    prisma.vendorProfile.findUnique({
      where: { userId: args.revealerUserId },
      select: { businessName: true, slug: true },
    }),
  ]);
  if (!employer || !vendor) return; // no profiled vendor → no heads-up
  const { env } = await import('../config/env');
  const { notificationService } = await import('./notification.service');
  const base = env.FRONTEND_URL ?? 'https://hireadda.in';
  const vendorUrl = `${base}/vendors/${vendor.slug}`;
  const jobRef = args.jobTitle ? ` for "${args.jobTitle}"` : '';
  await notificationService.send({
    userId: employer.id,
    title: 'A recruitment partner viewed your contact details',
    message: `${vendor.businessName} accessed your contact details${jobRef} and may reach out to help you hire.`,
    category: 'vendor_contact_revealed',
    link: vendorUrl,
    channels: ['in_app', 'email', 'fcm', 'web_push'],
    emailOptions: {
      to: employer.email,
      subject: `${vendor.businessName} viewed your hiring contact details`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#2563eb;">A recruitment partner may reach out</h2>
        <p><strong>${vendor.businessName}</strong>, a recruitment partner on Hire Adda, accessed your contact details${jobRef} and may contact you to help fill the role.</p>
        <a href="${vendorUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;margin-top:16px;">View their profile</a>
        <p style="color:#6b7280;font-size:12px;margin-top:16px;">You can manage these alerts in your notification settings.</p>
      </div>`,
      text: `${vendor.businessName}, a recruitment partner, accessed your contact details${jobRef} and may reach out to help you hire.\n\nView their profile: ${vendorUrl}`,
    },
  });
}

// --- Saved (bookmarked) job-board postings ---

export async function saveJobToBoard(userId: string, jobPostId: string): Promise<{ saved: true }> {
  const job = await prisma.jobPost.findUnique({
    where: { id: jobPostId },
    select: { id: true, company: { select: { userId: true } } },
  });
  if (!job) throw new NotFoundError('Job posting not found');
  if (job.company.userId === userId) {
    throw new BadRequestError('This is your own posting');
  }
  await prisma.savedVendorJob.upsert({
    where: { vendorUserId_jobPostId: { vendorUserId: userId, jobPostId } },
    create: { vendorUserId: userId, jobPostId },
    update: {},
  });
  return { saved: true };
}

export async function unsaveJobFromBoard(
  userId: string,
  jobPostId: string
): Promise<{ saved: false }> {
  await prisma.savedVendorJob.deleteMany({ where: { vendorUserId: userId, jobPostId } });
  return { saved: false };
}

// Re-exports for controllers
export { VendorLeadStatus };
export type { VendorProfile, VendorLead };

// Helper for controllers that need to fail fast if the user isn't a vendor.
export async function ensureHasProfile(userId: string): Promise<VendorProfile> {
  const profile = await prisma.vendorProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw new AppError(
      'Set up your vendor profile before using this feature.',
      400,
      'NO_VENDOR_PROFILE'
    );
  }
  return profile;
}
