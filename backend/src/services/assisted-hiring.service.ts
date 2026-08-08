/**
 * Assisted Hiring fulfilment service.
 *
 * The plan promises:
 *   1. Requirement-discussion call
 *   2. 1 job-role hiring support
 *   3. Job-post setup assistance
 *   4. 4-5 matching CVs delivered to email
 *   5. Fast candidate sourcing
 *   6. WhatsApp support
 *   7. 7 days assistance
 *
 * This service backs the workflow that fulfils #1-#4 + #7. WhatsApp/SLA
 * markers are surfaced via entitlements and the ticket-priority hook.
 *
 * Lifecycle:
 *   PENDING        — auto-created when an Order for ASSIST_HIRING goes PAID
 *   CALL_SCHEDULED — admin books the requirement-discussion call
 *   IN_PROGRESS    — admin team sourcing (after call)
 *   DELIVERED      — matched CVs emailed to the employer
 *   COMPLETED      — employer marks satisfied OR 7-day window closes
 *   CANCELLED      — refund / employer abandoned
 *
 * MATCHED_PROFILE_EMAIL resource (5 per plan) tracks how many CVs the
 * employer is entitled to receive — `addMatchedProfile` consumes one
 * unit through the standard `consumeResource` path.
 */
import { prisma } from '../config/prisma';
import { AssistedHiringStatus } from '@prisma/client';
import { BadRequestError, NotFoundError } from '../exceptions';
import logger from '../config/logger';

// =====================================================================
// Audit helper
// =====================================================================

async function writeAudit(args: {
  action: string;
  entityId: string;
  performedBy: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { AuditService } = await import('./audit.service');
    await AuditService.log({
      action: args.action,
      entity: 'AssistedHiringRequest',
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
// Order paid → request created automatically
// =====================================================================

/**
 * Called from `payment.service.recordPayment` when an Order for the
 * ASSIST_HIRING plan goes PAID. Idempotent on `orderId` so the unique
 * index stops duplicate creates if the webhook + verify endpoint race.
 */
export async function createRequestFromOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      plan: { select: { code: true, validityDays: true } },
      user: { select: { id: true, email: true, mobileNumber: true, firstName: true } },
    },
  });
  if (!order || order.plan.code !== 'ASSIST_HIRING') return;

  const existing = await prisma.assistedHiringRequest.findUnique({
    where: { orderId },
  });
  if (existing) return;

  const validityDays = order.plan.validityDays ?? 7;
  const expiresAt = new Date(Date.now() + validityDays * 86_400_000);

  await prisma.assistedHiringRequest.create({
    data: {
      employerId: order.userId,
      orderId,
      // The actual role/requirement gets filled by the employer on the
      // intake form OR by the admin during the call. Start with a
      // placeholder so the row is queryable immediately.
      roleTitle: 'To be discussed on call',
      requirementText: 'Awaiting requirement-discussion call.',
      contactEmail: order.user.email,
      contactPhone: order.user.mobileNumber ?? null,
      startedAt: new Date(),
      expiresAt,
      status: AssistedHiringStatus.PENDING,
    },
  });
  logger.info(`AssistedHiringRequest created from order ${orderId}`);
}

// =====================================================================
// Employer side: see + update own request
// =====================================================================

export async function getMyRequest(employerUserId: string) {
  const row = await prisma.assistedHiringRequest.findFirst({
    where: { employerId: employerUserId },
    orderBy: { createdAt: 'desc' },
    include: {
      matchedProfiles: { orderBy: { createdAt: 'desc' } },
      assignedAdmin: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
  return row;
}

export interface UpdateRequirementInput {
  roleTitle?: string;
  requirementText?: string;
  preferredSkills?: string[];
  preferredLocation?: string;
  budgetRange?: string;
  noticePeriod?: string;
  contactPhone?: string;
}

/** Employer fills/updates the requirement details (intake form). */
export async function updateRequirement(args: {
  employerUserId: string;
  requestId: string;
  input: UpdateRequirementInput;
}) {
  const row = await prisma.assistedHiringRequest.findFirst({
    where: { id: args.requestId, employerId: args.employerUserId },
  });
  if (!row) throw new NotFoundError('Assisted-hiring request not found');
  if (
    row.status === AssistedHiringStatus.DELIVERED ||
    row.status === AssistedHiringStatus.COMPLETED
  ) {
    throw new BadRequestError('Cannot edit a completed request.');
  }
  return prisma.assistedHiringRequest.update({
    where: { id: row.id },
    data: {
      roleTitle: args.input.roleTitle ?? row.roleTitle,
      requirementText: args.input.requirementText ?? row.requirementText,
      preferredSkills: args.input.preferredSkills ?? row.preferredSkills,
      preferredLocation: args.input.preferredLocation ?? row.preferredLocation,
      budgetRange: args.input.budgetRange ?? row.budgetRange,
      noticePeriod: args.input.noticePeriod ?? row.noticePeriod,
      contactPhone: args.input.contactPhone ?? row.contactPhone,
    },
  });
}

// =====================================================================
// Super-admin queue — list, claim, schedule call, add matched CV, deliver
// =====================================================================

export interface ListQueueArgs {
  status?: AssistedHiringStatus;
  page?: number;
  limit?: number;
}

export async function listQueue(args: ListQueueArgs = {}) {
  const page = Math.max(1, Math.floor(args.page ?? 1));
  const limit = Math.min(100, Math.max(1, Math.floor(args.limit ?? 25)));
  const skip = (page - 1) * limit;
  const where: { status?: AssistedHiringStatus } = {};
  if (args.status) where.status = args.status;

  const [items, total] = await prisma.$transaction([
    prisma.assistedHiringRequest.findMany({
      where,
      orderBy: [{ status: 'asc' }, { startedAt: 'asc' }],
      skip,
      take: limit,
      include: {
        employer: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        assignedAdmin: { select: { id: true, firstName: true, lastName: true, email: true } },
        matchedProfiles: { select: { id: true } },
      },
    }),
    prisma.assistedHiringRequest.count({ where }),
  ]);

  return {
    items: items.map((r) => ({
      ...r,
      matchedCount: r.matchedProfiles.length,
      // Don't ship full matched profile rows in the list — detail endpoint
      // returns them.
      matchedProfiles: undefined,
    })),
    pagination: { total, page, limit, pages: Math.ceil(total / limit) || 1 },
  };
}

export async function getRequestDetail(requestId: string) {
  const row = await prisma.assistedHiringRequest.findUnique({
    where: { id: requestId },
    include: {
      employer: { select: { id: true, email: true, firstName: true, lastName: true } },
      jobPost: { select: { id: true, title: true } },
      assignedAdmin: { select: { id: true, firstName: true, lastName: true, email: true } },
      matchedProfiles: {
        orderBy: { createdAt: 'desc' },
        include: {
          candidate: {
            select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
          },
        },
      },
    },
  });
  if (!row) throw new NotFoundError('Request not found');
  return row;
}

export async function claimRequest(args: { adminUserId: string; requestId: string }) {
  const updated = await prisma.assistedHiringRequest.update({
    where: { id: args.requestId },
    data: { assignedAdminId: args.adminUserId },
  });
  void writeAudit({
    action: 'ASSISTED_HIRING_CLAIMED',
    entityId: updated.id,
    performedBy: args.adminUserId,
    details: { previousAssigneeId: null },
  });
  return updated;
}

export async function scheduleCall(args: {
  adminUserId: string;
  requestId: string;
  callAt: Date;
  internalNotes?: string;
}) {
  const updated = await prisma.assistedHiringRequest.update({
    where: { id: args.requestId },
    data: {
      callScheduledAt: args.callAt,
      status: AssistedHiringStatus.CALL_SCHEDULED,
      internalNotes: args.internalNotes ?? undefined,
    },
  });
  void writeAudit({
    action: 'ASSISTED_HIRING_CALL_SCHEDULED',
    entityId: updated.id,
    performedBy: args.adminUserId,
    details: { callAt: args.callAt.toISOString() },
  });
  return updated;
}

export async function startSourcing(args: { adminUserId: string; requestId: string }) {
  const updated = await prisma.assistedHiringRequest.update({
    where: { id: args.requestId },
    data: { status: AssistedHiringStatus.IN_PROGRESS },
  });
  void writeAudit({
    action: 'ASSISTED_HIRING_SOURCING_STARTED',
    entityId: updated.id,
    performedBy: args.adminUserId,
  });
  return updated;
}

export interface AddMatchedProfileInput {
  candidateUserId?: string;
  candidateName: string;
  candidateHeadline?: string;
  candidateExperience?: string;
  candidateLocation?: string;
  resumeUrl?: string;
  notes?: string;
}

/**
 * Admin attaches one CV to the request. Doesn't deliver yet — admin
 * curates 4-5 matched profiles before calling `deliverMatches`.
 */
export async function addMatchedProfile(args: {
  adminUserId: string;
  requestId: string;
  input: AddMatchedProfileInput;
}) {
  const request = await prisma.assistedHiringRequest.findUnique({
    where: { id: args.requestId },
    include: { matchedProfiles: { select: { id: true } } },
  });
  if (!request) throw new NotFoundError('Request not found');
  // Soft cap — plan promises "4 to 5 matching profiles", but we let
  // admins curate up to 10 in case some get disqualified before delivery.
  if (request.matchedProfiles.length >= 10) {
    throw new BadRequestError('Already at the curation cap (10) — remove some before adding more.');
  }

  const created = await prisma.assistedHiringMatchedProfile.create({
    data: {
      requestId: args.requestId,
      candidateUserId: args.input.candidateUserId ?? null,
      candidateName: args.input.candidateName,
      candidateHeadline: args.input.candidateHeadline ?? null,
      candidateExperience: args.input.candidateExperience ?? null,
      candidateLocation: args.input.candidateLocation ?? null,
      resumeUrl: args.input.resumeUrl ?? null,
      notes: args.input.notes ?? null,
    },
  });
  void writeAudit({
    action: 'ASSISTED_HIRING_PROFILE_ADDED',
    entityId: args.requestId,
    performedBy: args.adminUserId,
    details: { matchedProfileId: created.id, candidateName: args.input.candidateName },
  });
  return created;
}

export async function removeMatchedProfile(args: {
  adminUserId: string;
  matchedProfileId: string;
}) {
  const row = await prisma.assistedHiringMatchedProfile.findUnique({
    where: { id: args.matchedProfileId },
  });
  if (!row) throw new NotFoundError('Matched profile not found');
  await prisma.assistedHiringMatchedProfile.delete({ where: { id: row.id } });
  void writeAudit({
    action: 'ASSISTED_HIRING_PROFILE_REMOVED',
    entityId: row.requestId,
    performedBy: args.adminUserId,
    details: { matchedProfileId: row.id },
  });
}

/**
 * Email the curated matched profiles to the employer. Consumes the
 * MATCHED_PROFILE_EMAIL quota once for the delivery (not per profile).
 * Marks status DELIVERED.
 */
export async function deliverMatches(args: {
  adminUserId: string;
  requestId: string;
  customMessage?: string;
}) {
  const request = await prisma.assistedHiringRequest.findUnique({
    where: { id: args.requestId },
    include: {
      matchedProfiles: { orderBy: { createdAt: 'asc' } },
      employer: {
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
  if (!request) throw new NotFoundError('Request not found');
  if (request.matchedProfiles.length < 1) {
    throw new BadRequestError('Add at least one matched profile before delivering.');
  }
  if (request.status === AssistedHiringStatus.DELIVERED) {
    throw new BadRequestError('Request already delivered.');
  }

  // Consume 1 MATCHED_PROFILE_EMAIL unit from the employer's quota
  // (best-effort — already paid for it via the order).
  try {
    const { consumeResource } = await import('./entitlement.service');
    await consumeResource({
      userId: request.employerId,
      unit: 'MATCHED_PROFILE_EMAIL',
      amount: 1,
      refType: 'ASSISTED_HIRING',
      refId: request.id,
    });
  } catch (err) {
    logger.warn('AssistedHiring quota consume failed (non-fatal)', {
      err: err instanceof Error ? err.message : err,
    });
  }

  // Send the email — uses the existing email queue + a dedicated
  // template that lists the curated CVs.
  void sendDeliveryEmail({
    to: request.employer.email,
    employerFirstName: request.employer.firstName ?? null,
    roleTitle: request.roleTitle,
    matchedProfiles: request.matchedProfiles,
    customMessage: args.customMessage,
  }).catch((err) =>
    logger.warn('AssistedHiring delivery email failed', {
      requestId: request.id,
      err: err instanceof Error ? err.message : err,
    })
  );

  // Fire-and-forget WhatsApp notification to the employer (never blocks delivery).
  try {
    const target = request.employer.isWhatsappVerified
      ? request.employer.whatsappNumber || request.employer.mobileNumber
      : null;
    if (target) {
      const { assistedHiringDeliveredWhatsapp } = await import('../templates/whatsapp');
      const { whatsappQueue } = await import('../jobs/whatsapp.queue');
      const reviewUrl = `${process.env.FRONTEND_URL || 'https://hireadda.in'}/employer/assisted-hiring`;
      const tmpl = assistedHiringDeliveredWhatsapp(
        String(request.matchedProfiles.length),
        request.roleTitle,
        reviewUrl
      );
      await whatsappQueue.add('send-whatsapp', {
        to: target,
        templateName: tmpl.templateName,
        components: tmpl.components,
      });
    }
  } catch (waErr) {
    logger.error('Failed to enqueue WhatsApp assisted_hiring_delivered', waErr);
  }

  const updated = await prisma.assistedHiringRequest.update({
    where: { id: request.id },
    data: {
      status: AssistedHiringStatus.DELIVERED,
      deliveredAt: new Date(),
    },
  });

  void writeAudit({
    action: 'ASSISTED_HIRING_DELIVERED',
    entityId: updated.id,
    performedBy: args.adminUserId,
    details: { profileCount: request.matchedProfiles.length },
  });

  return updated;
}

async function sendDeliveryEmail(args: {
  to: string;
  employerFirstName: string | null;
  roleTitle: string;
  matchedProfiles: Array<{
    candidateName: string;
    candidateHeadline: string | null;
    candidateExperience: string | null;
    candidateLocation: string | null;
    resumeUrl: string | null;
    notes: string | null;
  }>;
  customMessage?: string;
}): Promise<void> {
  const { emailQueue } = await import('../jobs/email.queue');
  const { assistedHiringDeliveryEmail } = await import('../templates/email/assisted-hiring');
  const tmpl = assistedHiringDeliveryEmail({
    recipientName: args.employerFirstName ?? undefined,
    roleTitle: args.roleTitle,
    profiles: args.matchedProfiles,
    customMessage: args.customMessage,
  });
  await emailQueue.add('send-email', {
    to: args.to,
    subject: tmpl.subject,
    html: tmpl.html,
    text: tmpl.text,
  });
}

export async function markCompleted(args: { adminUserId: string; requestId: string }) {
  const updated = await prisma.assistedHiringRequest.update({
    where: { id: args.requestId },
    data: { status: AssistedHiringStatus.COMPLETED },
  });
  void writeAudit({
    action: 'ASSISTED_HIRING_COMPLETED',
    entityId: updated.id,
    performedBy: args.adminUserId,
  });
  return updated;
}

export async function cancelRequest(args: {
  adminUserId: string;
  requestId: string;
  reason?: string;
}) {
  const updated = await prisma.assistedHiringRequest.update({
    where: { id: args.requestId },
    data: { status: AssistedHiringStatus.CANCELLED },
  });
  void writeAudit({
    action: 'ASSISTED_HIRING_CANCELLED',
    entityId: updated.id,
    performedBy: args.adminUserId,
    details: { reason: args.reason ?? null },
  });
  return updated;
}

export { AssistedHiringStatus };
