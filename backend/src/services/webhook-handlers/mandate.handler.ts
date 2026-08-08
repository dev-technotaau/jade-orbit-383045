/**
 * Razorpay mandate webhook handlers (eMandate / UPI AutoPay token lifecycle).
 *
 * These events sync the on-file mandate state used to charge subscription
 * cycles and one-time auto-renew refills. We track each mandate as a
 * `Mandate` row keyed by `razorpayTokenId`.
 */
import { prisma } from '../../config/prisma';
import { MandateStatus, MandateMethod, type Prisma } from '@prisma/client';
import logger from '../../config/logger';
import type { RazorpayWebhookPayload } from '../razorpay-webhook.service';

interface RazorpayTokenEntity {
  id: string;
  entity?: string;
  status?: string; // 'confirmed' | 'cancelled' | 'failed'
  method?: string; // 'card' | 'emandate' | 'nach' | 'upi'
  customer_id?: string;
  bank?: string;
  vpa?: { username?: string; handle?: string; name?: string } | string;
  card?: { last4?: string; network?: string };
  expired_at?: number | null;
  recurring_details?: {
    status?: string;
    failure_reason?: string | null;
  };
  notes?: Record<string, string | number> | null;
  max_amount?: number;
}

const STATUS_MAP: Record<string, MandateStatus> = {
  created: MandateStatus.PENDING,
  confirmed: MandateStatus.CONFIRMED,
  active: MandateStatus.ACTIVE,
  cancelled: MandateStatus.CANCELLED,
  failed: MandateStatus.FAILED,
};

function methodFromRazorpay(method?: string): MandateMethod {
  if (!method) return MandateMethod.EMANDATE;
  const m = method.toLowerCase();
  if (m === 'upi') return MandateMethod.UPI_AUTOPAY;
  if (m === 'card') return MandateMethod.CARD;
  return MandateMethod.EMANDATE;
}

export async function handleMandateEvent(
  event: string,
  payload: RazorpayWebhookPayload
): Promise<void> {
  // Razorpay puts mandate / token data under `payload.token.entity` for the
  // newer flow and sometimes under `payload.subscription.entity.token` —
  // handle both shapes defensively.
  const tokenEntity =
    ((payload.payload as Record<string, unknown>).token as { entity?: RazorpayTokenEntity })
      ?.entity ??
    (payload.payload?.subscription?.entity as { token?: RazorpayTokenEntity } | undefined)?.token;

  if (!tokenEntity?.id) {
    logger.warn(`Mandate webhook ${event} arrived without token entity — ignoring`);
    return;
  }

  const status = STATUS_MAP[(tokenEntity.status ?? '').toLowerCase()] ?? MandateStatus.PENDING;
  const method = methodFromRazorpay(tokenEntity.method);
  const userIdFromNotes = tokenEntity.notes?.userId ? String(tokenEntity.notes.userId) : null;
  // Fall back to subscription.notes.userId when token lacks notes
  const userIdFromSub = (() => {
    const subEntity = payload.payload?.subscription?.entity as
      | { notes?: Record<string, string | number> | undefined }
      | undefined;
    return subEntity?.notes?.userId ? String(subEntity.notes.userId) : null;
  })();
  const userId = userIdFromNotes ?? userIdFromSub;

  if (!userId) {
    logger.warn(
      'Mandate webhook missing userId in notes — skipping persist (Razorpay docs recommend setting notes.userId on subscription create)',
      { event, tokenId: tokenEntity.id }
    );
    return;
  }

  const vpaString =
    typeof tokenEntity.vpa === 'string'
      ? tokenEntity.vpa
      : tokenEntity.vpa
        ? `${tokenEntity.vpa.username ?? ''}@${tokenEntity.vpa.handle ?? ''}`
        : null;

  const data: Prisma.MandateUpsertArgs['create'] = {
    userId,
    razorpayTokenId: tokenEntity.id,
    method,
    status,
    maxAmountPaise: tokenEntity.max_amount ?? 0,
    frequency: 'as_presented',
    vpa: vpaString,
    bankName: tokenEntity.bank ?? null,
    cardLast4: tokenEntity.card?.last4 ?? null,
    network: tokenEntity.card?.network ?? null,
    expiresAt: tokenEntity.expired_at ? new Date(tokenEntity.expired_at * 1000) : null,
    raw: payload as unknown as Prisma.InputJsonValue,
  };

  await prisma.mandate.upsert({
    where: { razorpayTokenId: tokenEntity.id },
    create: data,
    update: {
      status,
      method,
      maxAmountPaise: tokenEntity.max_amount ?? undefined,
      vpa: vpaString ?? undefined,
      bankName: tokenEntity.bank ?? undefined,
      cardLast4: tokenEntity.card?.last4 ?? undefined,
      network: tokenEntity.card?.network ?? undefined,
      expiresAt: tokenEntity.expired_at ? new Date(tokenEntity.expired_at * 1000) : undefined,
      raw: payload as unknown as Prisma.InputJsonValue,
    },
  });

  logger.info('Mandate updated from webhook', {
    event,
    razorpayTokenId: tokenEntity.id,
    status,
  });
}
