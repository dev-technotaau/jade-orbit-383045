/**
 * Saved payment-method token management.
 *
 *   - `listPaymentMethods(userId)` — active methods for a user
 *   - `setDefaultMethod(userId, id)` — atomically flip the default flag
 *   - `removeMethod(userId, id)` — soft-delete (status=REMOVED).
 *     Razorpay token deletion happens via the dashboard / customer API
 *     when needed; we mirror status only.
 *
 * Tokens are populated from Razorpay's `mandate.confirmed` and
 * `payment.captured` webhooks (Phase 4). This service is read + flag-flip.
 */
import { prisma } from '../config/prisma';
import { type PaymentMethodToken, type Prisma } from '@prisma/client';
import { NotFoundError, BadRequestError } from '../exceptions';
import logger from '../config/logger';

export async function listPaymentMethods(userId: string): Promise<PaymentMethodToken[]> {
  return prisma.paymentMethodToken.findMany({
    where: { userId, status: 'ACTIVE' },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function setDefaultMethod(
  userId: string,
  methodId: string
): Promise<PaymentMethodToken> {
  const method = await prisma.paymentMethodToken.findFirst({
    where: { id: methodId, userId, status: 'ACTIVE' },
  });
  if (!method) throw new NotFoundError('Payment method not found');
  await prisma.$transaction([
    prisma.paymentMethodToken.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    }),
    prisma.paymentMethodToken.update({
      where: { id: method.id },
      data: { isDefault: true },
    }),
  ]);
  logger.info('Default payment method set', { userId, methodId });
  return prisma.paymentMethodToken.findUniqueOrThrow({ where: { id: method.id } });
}

export async function removeMethod(userId: string, methodId: string): Promise<void> {
  const method = await prisma.paymentMethodToken.findFirst({
    where: { id: methodId, userId },
  });
  if (!method) throw new NotFoundError('Payment method not found');
  if (method.status === 'REMOVED') {
    throw new BadRequestError('Method already removed');
  }
  await prisma.paymentMethodToken.update({
    where: { id: method.id },
    data: { status: 'REMOVED', isDefault: false },
  });
  logger.info('Payment method removed', { userId, methodId });
}

// =====================================================================
// Helper called from mandate webhook handler
// =====================================================================

export async function upsertFromMandate(args: {
  userId: string;
  razorpayTokenId: string;
  type: 'CARD' | 'VPA' | 'NETBANKING' | 'EMI';
  last4?: string | null;
  network?: string | null;
  vpaHandle?: string | null;
  bankCode?: string | null;
  expiryMonth?: number | null;
  expiryYear?: number | null;
  raw?: Prisma.InputJsonValue;
}): Promise<PaymentMethodToken> {
  return prisma.paymentMethodToken.upsert({
    where: { razorpayTokenId: args.razorpayTokenId },
    create: {
      userId: args.userId,
      razorpayTokenId: args.razorpayTokenId,
      type: args.type,
      last4: args.last4 ?? null,
      network: args.network ?? null,
      vpaHandle: args.vpaHandle ?? null,
      bankCode: args.bankCode ?? null,
      expiryMonth: args.expiryMonth ?? null,
      expiryYear: args.expiryYear ?? null,
      status: 'ACTIVE',
      raw: args.raw ?? undefined,
    },
    update: {
      last4: args.last4 ?? undefined,
      network: args.network ?? undefined,
      vpaHandle: args.vpaHandle ?? undefined,
      bankCode: args.bankCode ?? undefined,
      expiryMonth: args.expiryMonth ?? undefined,
      expiryYear: args.expiryYear ?? undefined,
      status: 'ACTIVE',
      raw: args.raw ?? undefined,
    },
  });
}
