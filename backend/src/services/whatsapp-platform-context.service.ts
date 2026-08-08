import { prisma } from '../config/prisma';
import { SubscriptionStatus } from '@prisma/client';

/**
 * Platform-360 context for the WhatsApp inbox: a compact, read-only snapshot of
 * the platform account behind a WaContact, so an agent can see who they're
 * talking to without leaving the conversation.
 *
 * Best-effort by design — every section degrades to `null` if it can't resolve,
 * and a contact with no linked platform user returns `{ user: null }`. Nothing
 * here mutates state.
 */

export interface PlatformContextApplication {
  id: string;
  jobTitle: string | null;
  status: string;
  appliedAt: Date;
}

export interface PlatformContextPlan {
  name: string;
  status: string;
  currentEnd: Date | null;
}

export interface PlatformContext {
  user: { id: string; name: string; email: string; role: string } | null;
  applications?: PlatformContextApplication[];
  plan?: PlatformContextPlan | null;
  profileCompleteness?: number | null;
}

const SUBSCRIPTION_ACTIVE_STATUSES = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.AUTHENTICATED,
  SubscriptionStatus.PENDING_CANCEL,
];

export async function getPlatformContext(contactId: string): Promise<PlatformContext> {
  const contact = await prisma.waContact
    .findUnique({ where: { id: contactId }, select: { userId: true } })
    .catch(() => null);

  if (!contact?.userId) return { user: null };
  const userId = contact.userId;

  const user = await prisma.user
    .findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        candidateProfile: { select: { id: true, profileCompleteness: true } },
      },
    })
    .catch(() => null);

  if (!user) return { user: null };

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();

  // Recent applications belong to the CandidateProfile (JobApplication.candidateId
  // → CandidateProfile.id), so this section only resolves for candidate accounts.
  const candidateId = user.candidateProfile?.id ?? null;
  const applications: PlatformContextApplication[] = candidateId
    ? await prisma.jobApplication
        .findMany({
          where: { candidateId },
          orderBy: { appliedAt: 'desc' },
          take: 5,
          select: {
            id: true,
            status: true,
            appliedAt: true,
            job: { select: { title: true } },
          },
        })
        .then((rows) =>
          rows.map((r) => ({
            id: r.id,
            jobTitle: r.job?.title ?? null,
            status: r.status,
            appliedAt: r.appliedAt,
          }))
        )
        .catch(() => [])
    : [];

  // Active subscription + its plan name, if the user has one.
  const subscription = await prisma.subscription
    .findFirst({
      where: { userId, status: { in: SUBSCRIPTION_ACTIVE_STATUSES } },
      orderBy: { createdAt: 'desc' },
      select: {
        status: true,
        currentEnd: true,
        plan: { select: { name: true } },
      },
    })
    .catch(() => null);

  const plan: PlatformContextPlan | null = subscription
    ? {
        name: subscription.plan?.name ?? 'Unknown plan',
        status: subscription.status,
        currentEnd: subscription.currentEnd,
      }
    : null;

  return {
    user: {
      id: user.id,
      name: fullName || user.email,
      email: user.email,
      role: user.role,
    },
    applications,
    plan,
    profileCompleteness: user.candidateProfile?.profileCompleteness ?? null,
  };
}
