/**
 * Employer team / multi-seat service.
 *
 * Models a CV-Enterprise feature where the company owner (the employer
 * who registered + paid) can invite other recruiters into the same
 * CompanyProfile so they share quotas (CV unlocks, search results, etc.)
 *
 * Invite flow:
 *   1. Owner calls `inviteMember({ email, role })` — creates a PENDING
 *      EmployerTeamMember row with a random `inviteToken` (32 hex chars,
 *      7-day expiry).
 *   2. We send an email with a deep link to `/team/accept?token=<...>`
 *      which the recipient opens.
 *   3. If the recipient already has a Hire Adda account, `acceptInvite`
 *      attaches their User to the row + flips status to ACTIVE.
 *      If not, the frontend lands on signup with the token preserved,
 *      and on signup we call `acceptInvite` with the new userId.
 *
 * The plan-gate on `inviteMember` enforces `feature.multi_seat` so only
 * CV Enterprise customers can grow their team.
 */
import crypto from 'crypto';
import { prisma } from '../config/prisma';
import { TeamRole, TeamMemberStatus, type EmployerTeamMember } from '@prisma/client';
import { AppError, NotFoundError, BadRequestError } from '../exceptions';
import logger from '../config/logger';

const INVITE_VALID_DAYS = 7;

/**
 * Resolve the company a user manages (either as OWNER of CompanyProfile,
 * or as an ACTIVE EmployerTeamMember with role OWNER/ADMIN).
 *
 * Returns `{ company, role }` so callers can authorise mutations.
 * RECRUITER seats read-only — cannot invite/remove/change roles.
 */
export async function getManagedCompany(userId: string): Promise<{
  company: { id: string; companyName: string; userId: string };
  role: TeamRole;
}> {
  // Owner path — the user owns a CompanyProfile directly.
  const owned = await prisma.companyProfile.findUnique({
    where: { userId },
    select: { id: true, companyName: true, userId: true },
  });
  if (owned) {
    return { company: owned, role: TeamRole.OWNER };
  }

  // Seat path — the user is an active team member.
  const seat = await prisma.employerTeamMember.findFirst({
    where: { userId, status: TeamMemberStatus.ACTIVE },
    include: {
      company: { select: { id: true, companyName: true, userId: true } },
    },
  });
  if (seat?.company) {
    return { company: seat.company, role: seat.role };
  }

  throw new AppError(
    'Only employers with a registered company can manage a team.',
    400,
    'NO_COMPANY_PROFILE'
  );
}

/** Returns true if the role can perform team mutations (invite/remove/role-change). */
export function canManageTeam(role: TeamRole): boolean {
  return role === TeamRole.OWNER || role === TeamRole.ADMIN;
}

/**
 * Per-member consumption breakdown for the past N days. Used by the
 * `/employer/team/usage` UI so owners can see who's draining the
 * company quota pool.
 *
 * Returns one row per (memberUserId, ResourceUnit) pair with the
 * consumed total (positive number — we negate the ledger delta which
 * is stored as -take). Rows are aggregated against the company's
 * billing pool, so seats consuming from the owner's plan show up here.
 */
export async function getTeamUsage(
  ownerUserId: string,
  daysBack = 30
): Promise<{
  windowDays: number;
  rows: Array<{
    userId: string;
    name: string;
    email: string;
    isOwner: boolean;
    role: TeamRole;
    perUnit: Record<string, number>;
    total: number;
  }>;
}> {
  const { company, role: actorRole } = await getManagedCompany(ownerUserId);
  if (!canManageTeam(actorRole)) {
    throw new AppError(
      'Only the company owner or an Admin can view team usage.',
      403,
      'TEAM_RBAC_FORBIDDEN'
    );
  }
  const since = new Date(Date.now() - daysBack * 86_400_000);

  // Resolve the billing pool — the company owner is the canonical
  // billing user. This is who the entitlements live under.
  const billingUserId = company.userId;

  // All seat user IDs for the company (owner + active team members).
  const seatRows = await prisma.employerTeamMember.findMany({
    where: { companyId: company.id, status: TeamMemberStatus.ACTIVE, userId: { not: null } },
    select: {
      userId: true,
      role: true,
      user: {
        select: { firstName: true, lastName: true, email: true },
      },
    },
  });
  const owner = await prisma.user.findUnique({
    where: { id: billingUserId },
    select: { firstName: true, lastName: true, email: true },
  });

  // Aggregate ledger CONSUME rows where the entitlement belongs to the
  // billing user. groupBy returns one row per (userId, unit).
  const ledger = await prisma.resourceLedger.findMany({
    where: {
      reason: 'CONSUME',
      delta: { lt: 0 },
      createdAt: { gte: since },
      entitlementResource: {
        entitlement: { userId: billingUserId },
      },
    },
    select: {
      userId: true,
      delta: true,
      entitlementResource: { select: { unit: true } },
    },
  });

  // Initialise rows for every seat (owner + members) with 0 totals so
  // members who haven't consumed anything still appear in the table.
  const byUser: Record<
    string,
    {
      userId: string;
      name: string;
      email: string;
      isOwner: boolean;
      role: TeamRole;
      perUnit: Record<string, number>;
      total: number;
    }
  > = {};
  if (owner) {
    byUser[billingUserId] = {
      userId: billingUserId,
      name: [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim() || owner.email,
      email: owner.email,
      isOwner: true,
      role: TeamRole.OWNER,
      perUnit: {},
      total: 0,
    };
  }
  for (const seat of seatRows) {
    if (!seat.userId) continue;
    byUser[seat.userId] = {
      userId: seat.userId,
      name:
        [seat.user?.firstName, seat.user?.lastName].filter(Boolean).join(' ').trim() ||
        seat.user?.email ||
        'Unknown',
      email: seat.user?.email ?? '',
      isOwner: false,
      role: seat.role,
      perUnit: {},
      total: 0,
    };
  }

  for (const entry of ledger) {
    const row = byUser[entry.userId];
    if (!row) continue; // user no longer on team — skip rather than mis-attribute
    const unit = entry.entitlementResource.unit;
    const consumed = Math.abs(entry.delta);
    row.perUnit[unit] = (row.perUnit[unit] ?? 0) + consumed;
    row.total += consumed;
  }

  return {
    windowDays: daysBack,
    rows: Object.values(byUser).sort((a, b) => b.total - a.total),
  };
}

/**
 * List active + pending team members for the owner's company.
 * Returns the owner row synthesised from CompanyProfile so the UI can
 * always show "you" on top.
 */
export async function listTeamMembers(ownerUserId: string) {
  const { company, role: viewerRole } = await getManagedCompany(ownerUserId);
  const members = await prisma.employerTeamMember.findMany({
    where: { companyId: company.id, status: { not: TeamMemberStatus.REVOKED } },
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
      },
    },
    orderBy: [{ status: 'asc' }, { invitedAt: 'desc' }],
  });

  // Synthesise the owner row — they implicitly belong to their own company.
  const owner = await prisma.user.findUnique({
    where: { id: company.userId },
    select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
  });
  const ownerRow = owner
    ? {
        id: `owner:${owner.id}`,
        companyId: company.id,
        userId: owner.id,
        invitedEmail: owner.email,
        role: TeamRole.OWNER,
        status: TeamMemberStatus.ACTIVE,
        invitedAt: null,
        joinedAt: null,
        revokedAt: null,
        inviteToken: null,
        inviteExpiresAt: null,
        user: owner,
        isOwner: true as const,
      }
    : null;

  return {
    company,
    viewerRole,
    canManage: canManageTeam(viewerRole),
    members: [
      ...(ownerRow ? [ownerRow] : []),
      ...members.map((m) => ({ ...m, isOwner: false as const })),
    ],
  };
}

/** OWNER or ADMIN invites someone by email + role. Idempotent — reusing
 *  an existing invite for the same email refreshes the token + expiry
 *  rather than duplicating the row. */
export async function inviteMember(args: {
  ownerUserId: string;
  email: string;
  role: TeamRole;
}): Promise<EmployerTeamMember> {
  const { company, role: actorRole } = await getManagedCompany(args.ownerUserId);
  if (!canManageTeam(actorRole)) {
    throw new AppError(
      'Only the company owner or an Admin can invite team members.',
      403,
      'TEAM_RBAC_FORBIDDEN'
    );
  }
  const cleanedEmail = args.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanedEmail)) {
    throw new BadRequestError('Invalid email address');
  }
  if (cleanedEmail === (await ownerEmail(args.ownerUserId))) {
    throw new BadRequestError("You can't invite yourself.");
  }
  if (args.role === TeamRole.OWNER) {
    throw new BadRequestError('Use transferOwnership to change owner.');
  }

  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + INVITE_VALID_DAYS * 86_400_000);

  // If a row already exists for this email + company, refresh it.
  const existing = await prisma.employerTeamMember.findUnique({
    where: { companyId_invitedEmail: { companyId: company.id, invitedEmail: cleanedEmail } },
  });
  let row: EmployerTeamMember;
  if (existing) {
    if (existing.status === TeamMemberStatus.ACTIVE) {
      throw new AppError(`${cleanedEmail} is already on your team`, 409, 'ALREADY_MEMBER');
    }
    row = await prisma.employerTeamMember.update({
      where: { id: existing.id },
      data: {
        role: args.role,
        status: TeamMemberStatus.PENDING,
        inviteToken: token,
        inviteExpiresAt: expiresAt,
        invitedAt: new Date(),
        revokedAt: null,
      },
    });
  } else {
    row = await prisma.employerTeamMember.create({
      data: {
        companyId: company.id,
        invitedEmail: cleanedEmail,
        role: args.role,
        status: TeamMemberStatus.PENDING,
        invitedById: args.ownerUserId,
        inviteToken: token,
        inviteExpiresAt: expiresAt,
      },
    });
  }

  // Audit trail — owner / admin sent an invite.
  void writeAudit({
    action: 'TEAM_INVITE_SENT',
    entityId: row.id,
    performedBy: args.ownerUserId,
    details: { invitedEmail: cleanedEmail, role: args.role, companyId: company.id },
  });

  // Fire the invite email (best-effort — non-blocking).
  void (async () => {
    const owner = await prisma.user.findUnique({
      where: { id: args.ownerUserId },
      select: { firstName: true, lastName: true },
    });
    const inviterName = owner
      ? [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim() || undefined
      : undefined;
    return sendInviteEmail({
      email: cleanedEmail,
      companyName: company.companyName,
      role: args.role,
      token,
      inviterName,
    });
  })().catch((err) =>
    logger.warn('Team invite email send failed', {
      err: err instanceof Error ? err.message : err,
    })
  );

  return row;
}

/** Helper — write a TEAM_* audit entry, swallowing failures so they
 *  never break the primary mutation. */
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
      entity: 'EmployerTeamMember',
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

async function ownerEmail(ownerUserId: string): Promise<string> {
  const u = await prisma.user.findUnique({
    where: { id: ownerUserId },
    select: { email: true },
  });
  return (u?.email ?? '').trim().toLowerCase();
}

async function sendOwnershipTransferEmail(args: {
  targetUserId: string;
  previousOwnerUserId: string;
  companyName: string;
}): Promise<void> {
  const [target, prev] = await Promise.all([
    prisma.user.findUnique({
      where: { id: args.targetUserId },
      select: {
        email: true,
        firstName: true,
        whatsappNumber: true,
        mobileNumber: true,
        isWhatsappVerified: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: args.previousOwnerUserId },
      select: { firstName: true, lastName: true },
    }),
  ]);
  if (!target?.email) return;
  const { emailQueue } = await import('../jobs/email.queue');
  const { env } = await import('../config/env');
  const { teamOwnershipTransferredEmail } = await import('../templates/email/team');
  const previousOwnerName = prev
    ? [prev.firstName, prev.lastName].filter(Boolean).join(' ').trim() || undefined
    : undefined;
  const dashboardUrl = `${env.FRONTEND_URL ?? 'https://hireadda.in'}/employer/team`;
  const tmpl = teamOwnershipTransferredEmail({
    recipientName: target.firstName ?? undefined,
    companyName: args.companyName,
    previousOwnerName,
    dashboardUrl,
  });
  await emailQueue.add('send-email', {
    to: target.email,
    subject: tmpl.subject,
    html: tmpl.html,
    text: tmpl.text,
  });

  // Fire the ownership-transfer WhatsApp (best-effort — never break the flow).
  try {
    const waTarget = target.isWhatsappVerified
      ? target.whatsappNumber || target.mobileNumber
      : null;
    if (waTarget) {
      const { teamOwnershipTransferredWhatsapp } = await import('../templates/whatsapp');
      const { whatsappQueue } = await import('../jobs/whatsapp.queue');
      const waTmpl = teamOwnershipTransferredWhatsapp(args.companyName, dashboardUrl);
      await whatsappQueue.add('send-whatsapp', {
        to: waTarget,
        templateName: waTmpl.templateName,
        components: waTmpl.components,
      });
    }
  } catch (waErr) {
    logger.error('Failed to enqueue WhatsApp team_ownership_transferred', waErr);
  }
}

async function sendInviteEmail(args: {
  email: string;
  companyName: string;
  role: TeamRole;
  token: string;
  inviterName?: string;
}): Promise<void> {
  const { emailQueue } = await import('../jobs/email.queue');
  const { env } = await import('../config/env');
  const { teamInviteEmail } = await import('../templates/email/team');
  const acceptUrl = `${env.FRONTEND_URL ?? 'https://hireadda.in'}/team/accept?token=${args.token}`;
  const tmpl = teamInviteEmail({
    companyName: args.companyName,
    inviterName: args.inviterName,
    role: args.role,
    acceptUrl,
    expiresInDays: INVITE_VALID_DAYS,
  });
  await emailQueue.add('send-email', {
    to: args.email,
    subject: tmpl.subject,
    html: tmpl.html,
    text: tmpl.text,
  });
}

/** Accept a pending invite. Either pass `userId` (the new logged-in user)
 *  or have the recipient be already authenticated — controller handles
 *  the auth check. */
export async function acceptInvite(args: { token: string; userId: string }) {
  const row = await prisma.employerTeamMember.findUnique({ where: { inviteToken: args.token } });
  if (!row) throw new NotFoundError('Invitation not found or already used');
  if (row.status !== TeamMemberStatus.PENDING) {
    throw new AppError('This invitation has already been used or was revoked.', 410, 'INVITE_USED');
  }
  if (row.inviteExpiresAt && row.inviteExpiresAt < new Date()) {
    await prisma.employerTeamMember.update({
      where: { id: row.id },
      data: { status: TeamMemberStatus.EXPIRED },
    });
    throw new AppError('This invitation has expired. Ask for a fresh one.', 410, 'INVITE_EXPIRED');
  }

  // Sanity-check: the accepting user's email should match the invited email.
  const acceptingUser = await prisma.user.findUnique({
    where: { id: args.userId },
    select: { email: true },
  });
  if (
    !acceptingUser ||
    acceptingUser.email.trim().toLowerCase() !== row.invitedEmail.trim().toLowerCase()
  ) {
    throw new AppError(
      'This invitation was sent to a different email address.',
      403,
      'INVITE_EMAIL_MISMATCH'
    );
  }

  const updated = await prisma.employerTeamMember.update({
    where: { id: row.id },
    data: {
      userId: args.userId,
      status: TeamMemberStatus.ACTIVE,
      joinedAt: new Date(),
      inviteToken: null,
      inviteExpiresAt: null,
    },
  });

  void writeAudit({
    action: 'TEAM_INVITE_ACCEPTED',
    entityId: updated.id,
    performedBy: args.userId,
    details: {
      companyId: updated.companyId,
      role: updated.role,
      invitedEmail: updated.invitedEmail,
    },
  });

  return updated;
}

/** OWNER or ADMIN removes a team member (or revokes a pending invite).
 *  ADMINs can't remove the OWNER. */
export async function removeMember(args: { ownerUserId: string; memberId: string }): Promise<void> {
  const { company, role: actorRole } = await getManagedCompany(args.ownerUserId);
  if (!canManageTeam(actorRole)) {
    throw new AppError(
      'Only the company owner or an Admin can remove team members.',
      403,
      'TEAM_RBAC_FORBIDDEN'
    );
  }
  const row = await prisma.employerTeamMember.findFirst({
    where: { id: args.memberId, companyId: company.id },
  });
  if (!row) throw new NotFoundError('Team member not found');
  // ADMINs can't remove an OWNER (only OWNER can transfer ownership).
  if (row.role === TeamRole.OWNER && actorRole !== TeamRole.OWNER) {
    throw new AppError(
      'Only the company owner can perform this action.',
      403,
      'TEAM_RBAC_FORBIDDEN'
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
    action: 'TEAM_MEMBER_REMOVED',
    entityId: row.id,
    performedBy: args.ownerUserId,
    details: {
      companyId: company.id,
      previousRole: row.role,
      removedEmail: row.invitedEmail,
      removedUserId: row.userId,
    },
  });
}

/**
 * Transfer company ownership to an ACTIVE team member. Owner-only.
 *
 * Inside a transaction:
 *   1. Demote current owner — upsert an ADMIN seat row so they keep access.
 *   2. Promote the target seat row to OWNER (kept for audit trail).
 *   3. Hand `CompanyProfile.userId` to the target user.
 *
 * After this completes, `resolveBillingUserId` resolves to the new
 * owner, so they control the billing pool. The previous owner keeps
 * platform access as an Admin seat.
 */
export async function transferOwnership(args: {
  currentOwnerUserId: string;
  targetUserId: string;
}): Promise<{ companyId: string; newOwnerUserId: string }> {
  if (args.currentOwnerUserId === args.targetUserId) {
    throw new BadRequestError('You are already the owner.');
  }

  const company = await prisma.companyProfile.findUnique({
    where: { userId: args.currentOwnerUserId },
    select: { id: true, userId: true, companyName: true },
  });
  if (!company) {
    throw new AppError(
      'Only the current owner can transfer ownership.',
      403,
      'TEAM_RBAC_FORBIDDEN'
    );
  }

  const targetSeat = await prisma.employerTeamMember.findFirst({
    where: {
      companyId: company.id,
      userId: args.targetUserId,
      status: TeamMemberStatus.ACTIVE,
    },
  });
  if (!targetSeat) {
    throw new NotFoundError('Target user is not an active team member.');
  }

  await prisma.$transaction(async (tx) => {
    const currentOwnerEmail = (
      await tx.user.findUnique({
        where: { id: args.currentOwnerUserId },
        select: { email: true },
      })
    )?.email
      .trim()
      .toLowerCase();
    if (currentOwnerEmail) {
      await tx.employerTeamMember.upsert({
        where: {
          companyId_invitedEmail: {
            companyId: company.id,
            invitedEmail: currentOwnerEmail,
          },
        },
        update: {
          userId: args.currentOwnerUserId,
          role: TeamRole.ADMIN,
          status: TeamMemberStatus.ACTIVE,
          revokedAt: null,
          inviteToken: null,
          inviteExpiresAt: null,
          joinedAt: new Date(),
        },
        create: {
          companyId: company.id,
          userId: args.currentOwnerUserId,
          invitedEmail: currentOwnerEmail,
          role: TeamRole.ADMIN,
          status: TeamMemberStatus.ACTIVE,
          invitedById: args.currentOwnerUserId,
          joinedAt: new Date(),
        },
      });
    }
    await tx.employerTeamMember.update({
      where: { id: targetSeat.id },
      data: {
        role: TeamRole.OWNER,
        status: TeamMemberStatus.ACTIVE,
      },
    });
    await tx.companyProfile.update({
      where: { id: company.id },
      data: { userId: args.targetUserId },
    });
  });

  void writeAudit({
    action: 'TEAM_OWNERSHIP_TRANSFERRED',
    entityId: company.id,
    performedBy: args.currentOwnerUserId,
    details: {
      companyId: company.id,
      fromUserId: args.currentOwnerUserId,
      toUserId: args.targetUserId,
    },
  });

  // Notify the new owner — best-effort, non-blocking.
  void sendOwnershipTransferEmail({
    targetUserId: args.targetUserId,
    previousOwnerUserId: args.currentOwnerUserId,
    companyName: company.companyName,
  }).catch((err) =>
    logger.warn('Ownership-transfer email failed', {
      err: err instanceof Error ? err.message : err,
    })
  );

  return { companyId: company.id, newOwnerUserId: args.targetUserId };
}

/** OWNER or ADMIN changes a member's role (cannot change OWNER). */
export async function changeRole(args: {
  ownerUserId: string;
  memberId: string;
  role: TeamRole;
}): Promise<EmployerTeamMember> {
  if (args.role === TeamRole.OWNER) {
    throw new BadRequestError('Use transferOwnership to change owner.');
  }
  const { company, role: actorRole } = await getManagedCompany(args.ownerUserId);
  if (!canManageTeam(actorRole)) {
    throw new AppError(
      'Only the company owner or an Admin can change roles.',
      403,
      'TEAM_RBAC_FORBIDDEN'
    );
  }
  const row = await prisma.employerTeamMember.findFirst({
    where: { id: args.memberId, companyId: company.id },
  });
  if (!row) throw new NotFoundError('Team member not found');
  if (row.status === TeamMemberStatus.REVOKED) {
    throw new BadRequestError('Cannot modify a revoked member.');
  }
  // Only OWNER can promote/demote other ADMINs (defence in depth).
  if (row.role === TeamRole.ADMIN && actorRole !== TeamRole.OWNER) {
    throw new AppError(
      'Only the company owner can change an Admin role.',
      403,
      'TEAM_RBAC_FORBIDDEN'
    );
  }
  const updated = await prisma.employerTeamMember.update({
    where: { id: row.id },
    data: { role: args.role },
  });
  void writeAudit({
    action: 'TEAM_ROLE_CHANGED',
    entityId: updated.id,
    performedBy: args.ownerUserId,
    details: {
      companyId: company.id,
      memberUserId: updated.userId,
      memberEmail: updated.invitedEmail,
      previousRole: row.role,
      newRole: args.role,
    },
  });
  return updated;
}
