/**
 * CV Enterprise quote intake + custom plan offer flow.
 *
 *   1. Employer submits a quote request (form on /billing/quote)
 *   2. All super-admins are notified across channels (email, WA, push, in-app)
 *   3. Super-admin reviews the queue, contacts the employer
 *   4. Super-admin builds a custom plan offer (price + validity + cv unlocks
 *      + seats + features) — creates a hidden Plan + CustomPlanOffer row
 *   5. Offer link is emailed to the employer
 *   6. Employer accepts → backend creates a normal Order against the hidden
 *      Plan → standard Razorpay checkout takes over
 */
import { prisma } from '../config/prisma';
import {
  Prisma,
  QuoteRequestStatus,
  CustomPlanOfferStatus,
  PlanCategory,
  PlanBillingCycle,
  PlanStatus,
  Role,
  type QuoteRequest,
  type CustomPlanOffer,
  type Plan,
} from '@prisma/client';
import { env } from '../config/env';
import { AppError, NotFoundError, ConflictError, BadRequestError } from '../exceptions';
import logger from '../config/logger';

// =====================================================================
// Submit a quote (employer-facing)
// =====================================================================

export interface SubmitQuoteInput {
  // Nullable — guests submit from the public pricing page without an
  // account. Only authenticated callers attach their userId.
  userId: string | null;
  companyName: string;
  contactPerson: string;
  designation?: string;
  email: string;
  phone: string;
  employeeRange?: string;
  hiringNeed?: string;
  requiredCvCount?: number;
  validityDays?: number;
  expectedSeats?: number;
  currentToolStack?: string;
  budgetRange?: string;
  additionalNotes?: string;
  ipAddress?: string;
  userAgent?: string;
}

export async function submitQuote(input: SubmitQuoteInput): Promise<QuoteRequest> {
  const slaDueAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h SLA

  const quote = await prisma.quoteRequest.create({
    data: {
      userId: input.userId,
      companyName: input.companyName,
      contactPerson: input.contactPerson,
      designation: input.designation ?? null,
      email: input.email,
      phone: input.phone,
      employeeRange: input.employeeRange ?? null,
      hiringNeed: input.hiringNeed ?? null,
      requiredCvCount: input.requiredCvCount ?? null,
      validityDays: input.validityDays ?? null,
      expectedSeats: input.expectedSeats ?? null,
      currentToolStack: input.currentToolStack ?? null,
      budgetRange: input.budgetRange ?? null,
      additionalNotes: input.additionalNotes ?? null,
      status: QuoteRequestStatus.NEW,
      slaDueAt,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });

  // Fan out notifications to super-admins (best-effort; never block quote creation)
  await notifySuperAdminsOfQuote(quote).catch((err) => {
    logger.error('Quote notification fan-out failed', err);
  });

  logger.info('Quote submitted', {
    quoteId: quote.id,
    userId: input.userId,
    companyName: input.companyName,
  });
  return quote;
}

async function notifySuperAdminsOfQuote(quote: QuoteRequest): Promise<void> {
  const superAdmins = await prisma.user.findMany({
    where: { role: Role.SUPER_ADMIN, isActive: true, isSuspended: false },
    select: { id: true },
  });
  if (superAdmins.length === 0) return;
  const { notificationService } = await import('./notification.service');
  for (const admin of superAdmins) {
    await notificationService
      .send({
        userId: admin.id,
        title: `New CV Enterprise quote: ${quote.companyName}`,
        message: `${quote.contactPerson} (${quote.email}) wants ${quote.requiredCvCount ?? 'custom'} CV access. SLA ${quote.slaDueAt?.toISOString() ?? '24h'}.`,
        type: 'INFO',
        category: 'billing',
        link: `/super-admin/billing/quotes/${quote.id}`,
        channels: ['in_app', 'email', 'fcm', 'whatsapp'],
      })
      .catch((err) => logger.error('Quote notification failed', { adminId: admin.id, err }));
  }
}

// =====================================================================
// User reads
// =====================================================================

export async function listQuotesForUser(userId: string): Promise<QuoteRequest[]> {
  return prisma.quoteRequest.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      offers: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
}

export async function getQuoteForUser(quoteId: string, userId: string): Promise<QuoteRequest> {
  const quote = await prisma.quoteRequest.findFirst({
    where: { id: quoteId, userId },
    include: {
      offers: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!quote) throw new NotFoundError('Quote request not found');
  return quote;
}

// =====================================================================
// Super-admin reads + actions
// =====================================================================

export async function listQuotesAdmin(args: {
  status?: QuoteRequestStatus;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{ items: QuoteRequest[]; total: number }> {
  const page = Math.max(1, args.page ?? 1);
  const limit = Math.min(100, Math.max(1, args.limit ?? 50));
  const where: Prisma.QuoteRequestWhereInput = {};
  if (args.status) where.status = args.status;
  if (args.search) {
    where.OR = [
      { companyName: { contains: args.search, mode: 'insensitive' } },
      { email: { contains: args.search, mode: 'insensitive' } },
      { contactPerson: { contains: args.search, mode: 'insensitive' } },
    ];
  }
  const [items, total] = await prisma.$transaction([
    prisma.quoteRequest.findMany({
      where,
      orderBy: [{ status: 'asc' }, { slaDueAt: 'asc' }],
      take: limit,
      skip: (page - 1) * limit,
      include: { user: { select: { email: true, firstName: true, lastName: true } } },
    }),
    prisma.quoteRequest.count({ where }),
  ]);
  return { items, total };
}

export async function getQuoteAdmin(quoteId: string): Promise<QuoteRequest> {
  const quote = await prisma.quoteRequest.findUnique({
    where: { id: quoteId },
    include: {
      offers: { orderBy: { createdAt: 'desc' } },
      user: {
        select: { id: true, email: true, firstName: true, lastName: true, role: true },
      },
    },
  });
  if (!quote) throw new NotFoundError('Quote not found');
  return quote;
}

export async function assignQuote(quoteId: string, assignedToId: string): Promise<QuoteRequest> {
  return prisma.quoteRequest.update({
    where: { id: quoteId },
    data: { assignedToId, status: QuoteRequestStatus.IN_REVIEW },
  });
}

export async function markQuoteContacted(quoteId: string, notes?: string): Promise<QuoteRequest> {
  return prisma.quoteRequest.update({
    where: { id: quoteId },
    data: {
      status: QuoteRequestStatus.CONTACTED,
      contactedAt: new Date(),
      additionalNotes: notes ?? undefined,
    },
  });
}

export async function rejectQuote(quoteId: string, reason?: string): Promise<QuoteRequest> {
  return prisma.quoteRequest.update({
    where: { id: quoteId },
    data: {
      status: QuoteRequestStatus.REJECTED,
      additionalNotes: reason ?? undefined,
    },
  });
}

// =====================================================================
// Custom plan offers
// =====================================================================

export interface CreateOfferInput {
  quoteRequestId: string;
  basePricePaise: number;
  validityDays: number;
  cvUnlocks: number;
  seats?: number;
  features?: Prisma.InputJsonValue;
  resources?: Prisma.InputJsonValue;
  expiresAt?: Date | null;
  createdById: string;
}

export async function createCustomPlanOffer(
  input: CreateOfferInput
): Promise<{ offer: CustomPlanOffer; plan: Plan }> {
  const quote = await prisma.quoteRequest.findUnique({
    where: { id: input.quoteRequestId },
    include: { user: { select: { id: true } } },
  });
  if (!quote) throw new NotFoundError('Quote not found');

  const expiresAt =
    input.expiresAt ??
    new Date(Date.now() + env.BILLING_CUSTOM_OFFER_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const planCode = `ENT_${quote.id.slice(0, 8).toUpperCase()}`;
  const planSlug = `enterprise-${quote.id.slice(0, 8)}`;

  const result = await prisma.$transaction(async (tx) => {
    // Create a hidden, custom Plan that the user-only Order will reference
    const plan = await tx.plan.create({
      data: {
        code: planCode,
        slug: planSlug,
        name: `Enterprise — ${quote.companyName}`,
        category: PlanCategory.EMPLOYER_CV_ENTERPRISE_CUSTOM,
        billingCycle: PlanBillingCycle.ONE_TIME,
        status: PlanStatus.ACTIVE,
        basePricePaise: input.basePricePaise,
        currency: 'INR',
        gstRatePercent: 18,
        gstInclusive: true,
        hsnCode: '998314',
        validityDays: input.validityDays,
        isCustom: true,
        requiresQuote: false, // accepted offer leads directly to checkout
        isPublic: false,
        displayOrder: 999,
        shortDescription: `Custom Enterprise plan for ${quote.companyName}`,
        createdById: input.createdById,
        metadata: {
          quoteRequestId: quote.id,
          cvUnlocks: input.cvUnlocks,
          seats: input.seats ?? 1,
        } as Prisma.InputJsonValue,
        // Resource entries — added via createMany
        resources: {
          create: [
            { unit: 'CV_UNLOCK', quantity: input.cvUnlocks },
            { unit: 'SEAT', quantity: input.seats ?? 1 },
          ],
        },
      },
    });

    const offer = await tx.customPlanOffer.create({
      data: {
        quoteRequestId: quote.id,
        planId: plan.id,
        basePricePaise: input.basePricePaise,
        validityDays: input.validityDays,
        cvUnlocks: input.cvUnlocks,
        seats: input.seats ?? 1,
        features: input.features ?? Prisma.JsonNull,
        resources: input.resources ?? Prisma.JsonNull,
        status: CustomPlanOfferStatus.SENT,
        expiresAt,
        createdById: input.createdById,
      },
    });

    await tx.quoteRequest.update({
      where: { id: quote.id },
      data: { status: QuoteRequestStatus.NEGOTIATING },
    });

    return { plan, offer };
  });

  // Notify the employer if the quote was submitted by a logged-in user.
  // Guest quotes have no account to ping — the sales team contacts them
  // out-of-band via the email/phone captured on the form.
  if (quote.userId) {
    notifyEmployerOfOffer(quote.userId, result.offer, result.plan).catch((err) =>
      logger.error('Custom offer notification failed', err)
    );
  } else {
    logger.info('Skipping offer notification — guest quote has no userId', { quoteId: quote.id });
  }

  logger.info('Custom plan offer created', {
    offerId: result.offer.id,
    planId: result.plan.id,
    quoteId: quote.id,
    pricePaise: input.basePricePaise,
  });

  return result;
}

async function notifyEmployerOfOffer(
  userId: string,
  offer: CustomPlanOffer,
  plan: Plan
): Promise<void> {
  const { notificationService } = await import('./notification.service');
  await notificationService.send({
    userId,
    title: 'Your enterprise plan offer is ready',
    message: `Custom plan for ₹${offer.basePricePaise / 100} · ${offer.cvUnlocks} CV unlocks · ${offer.validityDays} days validity. Accept and pay anytime before ${offer.expiresAt?.toLocaleDateString() ?? '7 days'}.`,
    type: 'INFO',
    category: 'billing',
    link: `/billing/quote/${offer.quoteRequestId}`,
    metadata: {
      offerId: offer.id,
      planCode: plan.code,
    },
    channels: ['in_app', 'email', 'fcm', 'whatsapp'],
  });
}

export async function acceptOffer(args: {
  offerId: string;
  userId: string;
}): Promise<{ planCode: string }> {
  const offer = await prisma.customPlanOffer.findUnique({
    where: { id: args.offerId },
    include: { quoteRequest: true, plan: true },
  });
  if (!offer) throw new NotFoundError('Offer not found');
  if (offer.quoteRequest.userId !== args.userId) {
    throw new AppError('Offer does not belong to you', 403, 'FORBIDDEN');
  }
  if (offer.status !== CustomPlanOfferStatus.SENT) {
    throw new BadRequestError(`Offer is ${offer.status.toLowerCase()} — cannot be accepted`);
  }
  if (offer.expiresAt && offer.expiresAt < new Date()) {
    await prisma.customPlanOffer.update({
      where: { id: offer.id },
      data: { status: CustomPlanOfferStatus.EXPIRED },
    });
    throw new BadRequestError('Offer has expired');
  }
  if (!offer.plan) throw new ConflictError('Offer has no linked plan — contact support');

  await prisma.customPlanOffer.update({
    where: { id: offer.id },
    data: { status: CustomPlanOfferStatus.ACCEPTED, acceptedAt: new Date() },
  });
  await prisma.quoteRequest.update({
    where: { id: offer.quoteRequestId },
    data: { status: QuoteRequestStatus.ACCEPTED },
  });

  return { planCode: offer.plan.code };
}

// AppError re-export keeps imports tidy
export { AppError };
