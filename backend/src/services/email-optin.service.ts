import { prisma } from '../config/prisma';
import type { Prisma } from '@prisma/client';
import { sendRawEmail } from './email.service';
import { getDefaultSender } from './email-sender.service';
import { normalizeEmail, upsertContactByEmail } from './email-contact.service';
import { confirmUrl } from '../utils/email-token';
import { formatCsv } from '../utils/email-csv';
import { emailLayout, heading, paragraph, button, BRAND } from '../templates/email/_layout';
import logger from '../config/logger';

/**
 * Double opt-in + resubscribe + preference-center effects. Confirmation is used
 * for off-platform/imported addresses so they become marketing-eligible only
 * after clicking a confirm link (CAN-SPAM/DPDP best practice).
 */

/** Mark a contact PENDING and email them a confirmation link. */
export async function requestDoubleOptIn(email: string, source = 'import'): Promise<void> {
  const normalized = normalizeEmail(email);
  const contact = await upsertContactByEmail(normalized, { subscribeSource: source });
  await prisma.emailContact
    .update({ where: { id: contact.id }, data: { subscribeStatus: 'PENDING' } })
    .catch(() => {});

  const sender = await getDefaultSender();
  if (!sender) return;
  const link = confirmUrl({ e: normalized });
  const html = emailLayout(
    heading('Confirm your subscription') +
      paragraph(`Please confirm you'd like to receive emails from ${BRAND.name}.`) +
      button('Confirm subscription', link) +
      paragraph('If you did not request this, you can ignore this email.'),
    'Confirm your subscription'
  );
  await sendRawEmail({
    fromName: sender.fromName,
    fromEmail: sender.fromEmail,
    replyTo: sender.replyTo || undefined,
    to: normalized,
    subject: `Confirm your subscription to ${BRAND.name}`,
    html,
    text: `Confirm your subscription: ${link}`,
    headers: { 'X-HA-DoubleOptIn': '1', Precedence: 'bulk' },
  }).catch((e) => logger.debug(`double opt-in send failed: ${(e as Error).message}`));
}

/** Confirm a pending subscription (double opt-in landing). */
export async function confirmSubscription(email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  await prisma.emailContact
    .updateMany({
      where: { email: normalized },
      data: {
        subscribeStatus: 'SUBSCRIBED',
        subscribedAt: new Date(),
        unsubscribedAt: null,
      },
    })
    .catch(() => {});
  // A confirmed subscription lifts any prior suppression.
  await prisma.emailSuppression.deleteMany({ where: { email: normalized } }).catch(() => {});
}

/** Re-subscribe from the preference center (removes suppression). */
export async function resubscribe(email: string): Promise<void> {
  await confirmSubscription(email);
}

// ---- Unsubscribe admin console ----------------------------------------------

export interface UnsubscribeFilter {
  q?: string;
  method?: string;
}

export function buildUnsubscribeWhere(f?: UnsubscribeFilter): Prisma.EmailUnsubscribeWhereInput {
  const where: Prisma.EmailUnsubscribeWhereInput = {};
  if (f?.q) where.email = { contains: normalizeEmail(f.q), mode: 'insensitive' };
  if (f?.method) where.method = f.method;
  return where;
}

/** Paginated, filterable unsubscribe-event list for the admin console. */
export async function listUnsubscribes(
  opts: UnsubscribeFilter & { page?: number; limit?: number }
) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const where = buildUnsubscribeWhere(opts);
  const [items, total] = await Promise.all([
    prisma.emailUnsubscribe.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.emailUnsubscribe.count({ where }),
  ]);
  return { items, total, page, limit };
}

/** Export unsubscribe events (honors the active filter). */
export async function exportUnsubscribesCsv(filter?: UnsubscribeFilter): Promise<string> {
  const rows = await prisma.emailUnsubscribe.findMany({
    where: buildUnsubscribeWhere(filter),
    orderBy: { createdAt: 'desc' },
    take: 200_000,
  });
  return formatCsv(
    ['email', 'method', 'campaignId', 'createdAt'],
    rows.map((r) => ({
      email: r.email,
      method: r.method,
      campaignId: r.campaignId ?? '',
      createdAt: r.createdAt.toISOString(),
    }))
  );
}

/**
 * Resolve unsubscribe rows (by ids OR filter) to emails, re-subscribe each
 * (clears suppression + flips the contact back to SUBSCRIBED), then remove the
 * reversed unsubscribe rows so they leave the console.
 */
export async function bulkResubscribe(input: {
  ids?: string[];
  filter?: UnsubscribeFilter;
}): Promise<{ resubscribed: number }> {
  const where: Prisma.EmailUnsubscribeWhereInput = input.ids?.length
    ? { id: { in: input.ids } }
    : buildUnsubscribeWhere(input.filter);
  const rows = await prisma.emailUnsubscribe.findMany({
    where,
    select: { email: true },
    take: 50_000,
  });
  const emails = [...new Set(rows.map((r) => normalizeEmail(r.email)))];
  for (const email of emails) await resubscribe(email).catch(() => {});
  await prisma.emailUnsubscribe.deleteMany({ where }).catch(() => {});
  return { resubscribed: emails.length };
}

/** Bulk delete unsubscribe records (log cleanup / GDPR erasure) by ids or filter. */
export async function bulkDeleteUnsubscribes(input: {
  ids?: string[];
  filter?: UnsubscribeFilter;
}): Promise<{ deleted: number }> {
  const where: Prisma.EmailUnsubscribeWhereInput = input.ids?.length
    ? { id: { in: input.ids } }
    : buildUnsubscribeWhere(input.filter);
  const res = await prisma.emailUnsubscribe.deleteMany({ where });
  return { deleted: res.count };
}

/** Current subscription state for the preference-center page. */
export async function getSubscriptionState(
  email: string
): Promise<{ email: string; status: string } | null> {
  const normalized = normalizeEmail(email);
  const contact = await prisma.emailContact.findUnique({
    where: { email: normalized },
    select: { subscribeStatus: true },
  });
  return { email: normalized, status: contact?.subscribeStatus ?? 'UNKNOWN' };
}
