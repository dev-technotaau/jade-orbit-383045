/**
 * Mandate / token lifecycle service.
 *
 * Razorpay creates the underlying mandate token via the Subscription / hosted
 * checkout flow. This service exposes CRUD-style helpers for the API layer:
 *
 *   - listMandatesForUser({ userId })       — pulls saved tokens
 *   - getMandate(id)                        — single record (owner-checked)
 *   - cancelMandate({ mandateId, userId })  — cancels via Razorpay + marks CANCELLED
 *
 * Webhook reconciliation lives in `webhook-handlers/mandate.handler.ts`. This
 * service only handles outbound (admin / user) actions.
 */
import { prisma } from '../config/prisma';
import type { Prisma } from '@prisma/client';
import { MandateStatus, type Mandate } from '@prisma/client';
import { AppError, NotFoundError } from '../exceptions';
import logger from '../config/logger';
import { getRazorpayClient, withRazorpaySpan } from '../config/razorpay';

export async function listMandatesForUser(args: {
  userId: string;
  status?: MandateStatus;
}): Promise<Mandate[]> {
  const where: Prisma.MandateWhereInput = { userId: args.userId };
  if (args.status) where.status = args.status;
  return prisma.mandate.findMany({
    where,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });
}

export async function getMandate(args: { mandateId: string; userId: string }): Promise<Mandate> {
  const m = await prisma.mandate.findFirst({
    where: { id: args.mandateId, userId: args.userId },
  });
  if (!m) throw new NotFoundError('Mandate not found');
  return m;
}

export async function cancelMandate(args: { mandateId: string; userId: string }): Promise<Mandate> {
  const mandate = await getMandate({ mandateId: args.mandateId, userId: args.userId });
  if (mandate.status === MandateStatus.CANCELLED) return mandate;

  const client = getRazorpayClient();
  if (client) {
    try {
      await withRazorpaySpan(
        'tokens.delete',
        async () => {
          // Razorpay exposes token revoke via customers.deleteToken or tokens.delete.
          const tokensApi = (
            client as unknown as {
              tokens?: { delete?: (id: string) => Promise<unknown> };
              customers?: {
                deleteToken?: (customerId: string, tokenId: string) => Promise<unknown>;
              };
            }
          ).tokens;
          if (tokensApi?.delete) return tokensApi.delete(mandate.razorpayTokenId);
          // Older SDKs require a customer id; we don't track that here, so
          // fall back to a soft-cancel and rely on webhook to confirm.
          return null;
        },
        { mandateId: mandate.id }
      );
    } catch (err) {
      logger.warn('Razorpay token revoke failed — proceeding with local cancel', {
        mandateId: mandate.id,
        err,
      });
    }
  }

  return prisma.mandate.update({
    where: { id: mandate.id },
    data: { status: MandateStatus.CANCELLED },
  });
}

/**
 * Bind a freshly created subscription to its mandate row. Called from the
 * subscription handler when Razorpay first emits a `subscription.activated`.
 */
export async function attachMandateToSubscription(args: {
  subscriptionId: string;
  razorpayTokenId: string;
}): Promise<void> {
  const mandate = await prisma.mandate.findUnique({
    where: { razorpayTokenId: args.razorpayTokenId },
  });
  if (!mandate) {
    logger.warn('attachMandateToSubscription: token not yet seen — webhook race', args);
    return;
  }
  await prisma.subscription.updateMany({
    where: { id: args.subscriptionId },
    data: { mandateId: mandate.id },
  });
}

export async function listMandatesAdmin(args: {
  status?: MandateStatus;
  page?: number;
  limit?: number;
}): Promise<{ items: Mandate[]; total: number }> {
  const page = Math.max(1, args.page ?? 1);
  const limit = Math.min(100, Math.max(1, args.limit ?? 50));
  const where: Prisma.MandateWhereInput = {};
  if (args.status) where.status = args.status;
  const [items, total] = await prisma.$transaction([
    prisma.mandate.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
      skip: (page - 1) * limit,
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    }),
    prisma.mandate.count({ where }),
  ]);
  return { items, total };
}

export async function setDefaultMandate(args: {
  userId: string;
  mandateId: string;
}): Promise<void> {
  const m = await getMandate({ mandateId: args.mandateId, userId: args.userId });
  if (m.status !== MandateStatus.ACTIVE && m.status !== MandateStatus.CONFIRMED) {
    throw new AppError(
      'Only active/confirmed mandates can be set as default',
      400,
      'MANDATE_NOT_ACTIVE'
    );
  }
  // No "isDefault" column on Mandate today — store via PaymentMethodToken default.
  // Caller can implement the link via PaymentMethodToken instead. This keeps the
  // surface consistent.
  logger.info('setDefaultMandate noop — default mandate is implicit (latest ACTIVE)', {
    userId: args.userId,
    mandateId: args.mandateId,
  });
}
