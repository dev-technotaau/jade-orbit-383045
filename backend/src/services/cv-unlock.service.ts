/**
 * CV unlock — employer reveals contact details for a single candidate.
 *
 * One unlock = 1 CV_UNLOCK quota consumed (atomic via entitlement service).
 * Idempotent on `(employerUserId, candidateId)` — a re-unlock returns the
 * cached contact details without burning another quota unit.
 *
 * Backed by `ResourceLedger.refType='CV_UNLOCK', refId=candidateId` so we
 * can detect prior unlocks and short-circuit.
 */
import { prisma } from '../config/prisma';
import { ResourceLedgerReason } from '@prisma/client';
import { consumeResource, getActiveEntitlementsForUser } from './entitlement.service';
import { NotFoundError, BadRequestError } from '../exceptions';
import logger from '../config/logger';

export interface UnlockContactArgs {
  employerUserId: string;
  candidateId: string; // CandidateProfile.userId (the candidate's User.id)
  ipAddress?: string;
  userAgent?: string;
}

export interface UnlockResult {
  email: string;
  phone: string | null;
  alternateEmail: string | null;
  alternatePhone: string | null;
  /** True if this unlock was free (already unlocked previously). */
  cached: boolean;
}

export async function unlockContact(args: UnlockContactArgs): Promise<UnlockResult> {
  // Callers reach candidate pages by EITHER CandidateProfile.id or User.id
  // (the profile endpoint accepts both), so resolve both here too — and
  // normalise to the USER id for every ledger read/write below, or unlocks
  // recorded under one id form would never match visibility checks done
  // with the other.
  let candidate = await prisma.user.findFirst({
    where: { id: args.candidateId, role: 'CANDIDATE' },
    include: { candidateProfile: true },
  });
  if (!candidate) {
    const prof = await prisma.candidateProfile.findUnique({
      where: { id: args.candidateId },
      select: { userId: true },
    });
    if (prof) {
      candidate = await prisma.user.findFirst({
        where: { id: prof.userId, role: 'CANDIDATE' },
        include: { candidateProfile: true },
      });
    }
  }
  if (!candidate) throw new NotFoundError('Candidate not found');
  const candidateUserId = candidate.id;
  if (candidateUserId === args.employerUserId) {
    throw new BadRequestError('Cannot unlock your own contact');
  }

  // Idempotency: has this employer already unlocked this candidate?
  const prior = await prisma.resourceLedger.findFirst({
    where: {
      userId: args.employerUserId,
      refType: 'CV_UNLOCK',
      refId: candidateUserId,
      reason: ResourceLedgerReason.CONSUME,
    },
  });
  if (prior) {
    logger.info('CV unlock cache hit — no quota consumed', {
      employerUserId: args.employerUserId,
      candidateId: candidateUserId,
    });
    return {
      email: candidate.email,
      phone: candidate.candidateProfile?.phone ?? candidate.mobileNumber ?? null,
      alternateEmail: candidate.candidateProfile?.alternateEmail ?? null,
      alternatePhone: candidate.candidateProfile?.alternatePhone ?? null,
      cached: true,
    };
  }

  // Applicants hand over their contacts by applying — never charge an
  // unlock for a candidate who applied to one of this employer's jobs.
  const appliedToEmployer = await prisma.jobApplication.findFirst({
    where: {
      candidate: { userId: candidateUserId },
      job: { company: { userId: args.employerUserId } },
    },
    select: { id: true },
  });
  if (appliedToEmployer) {
    logger.info('CV unlock skipped — candidate applied to this employer (no quota consumed)', {
      employerUserId: args.employerUserId,
      candidateId: candidateUserId,
    });
    return {
      email: candidate.email,
      phone: candidate.candidateProfile?.phone ?? candidate.mobileNumber ?? null,
      alternateEmail: candidate.candidateProfile?.alternateEmail ?? null,
      alternatePhone: candidate.candidateProfile?.alternatePhone ?? null,
      cached: true,
    };
  }

  // CV Enterprise plan — `feature.cv_unlock_unlimited` bypasses the quota
  // ledger entirely (Enterprise has empty resources, so consumeResource
  // would throw 402). We still surface the contact details and rely on the
  // route-level audit log for the access trail.
  const snapshot = await getActiveEntitlementsForUser(args.employerUserId);
  const isUnlimited = Boolean(snapshot.features['feature.cv_unlock_unlimited']);

  if (!isUnlimited) {
    // Consume CV_UNLOCK quota — throws 402 PAYMENT_REQUIRED if no entitlement
    await consumeResource({
      userId: args.employerUserId,
      unit: 'CV_UNLOCK',
      amount: 1,
      refType: 'CV_UNLOCK',
      refId: candidateUserId,
      notes: `CV unlock for candidate ${candidateUserId}`,
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
    });

    logger.info('CV unlock — quota consumed', {
      employerUserId: args.employerUserId,
      candidateId: candidateUserId,
    });
  } else {
    logger.info('CV unlock — Enterprise unlimited (no quota consumed)', {
      employerUserId: args.employerUserId,
      candidateId: candidateUserId,
    });
  }

  return {
    email: candidate.email,
    phone: candidate.candidateProfile?.phone ?? candidate.mobileNumber ?? null,
    alternateEmail: candidate.candidateProfile?.alternateEmail ?? null,
    alternatePhone: candidate.candidateProfile?.alternatePhone ?? null,
    cached: false,
  };
}

/**
 * Resolve which of `candidateUserIds` this employer may see contact
 * details (email/phone) for. Contact visibility is the product CV-unlock
 * paywall — a candidate's contacts are visible iff one of:
 *   1. the employer holds `feature.cv_unlock_unlimited` (CV Enterprise),
 *   2. the employer already spent a CV_UNLOCK on them (ledger row), or
 *   3. the candidate applied to one of the employer's jobs (applicants
 *      hand over their contacts by applying — no unlock needed).
 *
 * Returns `{ all: true }` for case 1 so bulk callers can skip per-id
 * checks. Failures degrade CLOSED (nothing visible) — leaking contacts
 * is a revenue bug, hiding them briefly is not.
 */
export async function getContactVisibilitySet(
  employerUserId: string,
  candidateUserIds: string[]
): Promise<{ all: boolean; visible: Set<string> }> {
  try {
    const snapshot = await getActiveEntitlementsForUser(employerUserId);
    if (snapshot.features['feature.cv_unlock_unlimited']) {
      return { all: true, visible: new Set(candidateUserIds) };
    }
  } catch {
    /* fall through to per-id checks */
  }

  const visible = new Set<string>();
  if (candidateUserIds.length === 0) return { all: false, visible };

  try {
    const [unlocked, applicants] = await Promise.all([
      prisma.resourceLedger.findMany({
        where: {
          userId: employerUserId,
          refType: 'CV_UNLOCK',
          refId: { in: candidateUserIds },
          reason: ResourceLedgerReason.CONSUME,
        },
        select: { refId: true },
      }),
      prisma.jobApplication.findMany({
        where: {
          candidate: { userId: { in: candidateUserIds } },
          job: { company: { userId: employerUserId } },
        },
        select: { candidate: { select: { userId: true } } },
        distinct: ['candidateId'],
      }),
    ]);
    for (const r of unlocked) if (r.refId) visible.add(r.refId);
    for (const a of applicants) visible.add(a.candidate.userId);
  } catch (err) {
    logger.warn('Contact visibility lookup failed — defaulting to locked', {
      employerUserId,
      err: err instanceof Error ? err.message : err,
    });
  }
  return { all: false, visible };
}

/** Single-candidate convenience wrapper around getContactVisibilitySet. */
export async function canViewContact(
  employerUserId: string,
  candidateUserId: string
): Promise<boolean> {
  const { visible } = await getContactVisibilitySet(employerUserId, [candidateUserId]);
  return visible.has(candidateUserId);
}

/**
 * List candidates this employer has previously unlocked. Used for the
 * "Unlocked candidates" admin view.
 */
export async function listUnlockedCandidatesForEmployer(
  employerUserId: string,
  args: { page?: number; limit?: number } = {}
): Promise<{ items: { candidateId: string; unlockedAt: Date }[]; total: number }> {
  const page = Math.max(1, args.page ?? 1);
  const limit = Math.min(100, Math.max(1, args.limit ?? 50));
  const [rows, total] = await prisma.$transaction([
    prisma.resourceLedger.findMany({
      where: {
        userId: employerUserId,
        refType: 'CV_UNLOCK',
        reason: ResourceLedgerReason.CONSUME,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
      select: { refId: true, createdAt: true },
    }),
    prisma.resourceLedger.count({
      where: {
        userId: employerUserId,
        refType: 'CV_UNLOCK',
        reason: ResourceLedgerReason.CONSUME,
      },
    }),
  ]);
  return {
    items: rows.map((r) => ({ candidateId: r.refId ?? '', unlockedAt: r.createdAt })),
    total,
  };
}
