import { prisma } from '../config/prisma';
import logger from '../config/logger';
import { addSuppression } from './email-suppression.service';
import { normalizeEmail } from './email-contact.service';
import { webhookService } from './webhook.service';

/**
 * Records open / click / unsubscribe signals from the public tracking
 * endpoints. Every method is best-effort and idempotent-friendly — the public
 * pixel/redirect must always respond fast regardless of DB state.
 */

interface EventMeta {
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Known prefetch / image-proxy user agents whose pixel GET is a MACHINE open
 * (not real engagement): Gmail's image proxy, Apple/Yahoo/Outlook link scanners,
 * and security scanners. Apple MPP inflates opens; these are flagged + excluded
 * from engagement counters (the raw event is still recorded, flagged).
 */
const MACHINE_OPEN_UA =
  /GoogleImageProxy|YahooMailProxy|Microsoft Office|BingPreview|Barracuda|Mimecast|Proofpoint|Google-Apps-Script|Amazon SES|Superhuman/i;
const isMachineOpen = (ua?: string | null): boolean => !!ua && MACHINE_OPEN_UA.test(ua);

/** Record an open from a recipient's opaque pixel token. */
export async function recordOpen(trackingToken: string, meta: EventMeta = {}): Promise<void> {
  const recipient = await prisma.emailCampaignRecipient.findUnique({
    where: { trackingToken },
    select: { id: true, campaignId: true, contactId: true, openedAt: true, status: true },
  });
  if (!recipient) return;
  const now = new Date();
  const machine = isMachineOpen(meta.userAgent);

  // Always log the raw event (flagged); a machine open is NOT counted as engagement.
  await prisma.emailEvent.create({
    data: {
      eventType: 'OPEN',
      campaignId: recipient.campaignId,
      recipientId: recipient.id,
      contactId: recipient.contactId,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
      machineOpen: machine,
    },
  });
  if (machine) return;

  // First-open bookkeeping (race-safe via the openedAt:null guard).
  const firstOpen = await prisma.emailCampaignRecipient.updateMany({
    where: { id: recipient.id, openedAt: null },
    data: { openedAt: now },
  });
  await prisma.emailCampaignRecipient.update({
    where: { id: recipient.id },
    data: {
      openCount: { increment: 1 },
      ...(recipient.status === 'SENT' || recipient.status === 'DELIVERED'
        ? { status: 'OPENED' }
        : {}),
    },
  });

  await prisma.emailContact
    .update({ where: { id: recipient.contactId }, data: { lastOpenedAt: now } })
    .catch(() => {});

  if (firstOpen.count === 1) {
    await prisma.emailCampaign
      .update({ where: { id: recipient.campaignId }, data: { openedCount: { increment: 1 } } })
      .catch(() => {});
    // Forward to external webhook subscribers (fire-and-forget).
    void webhookService.dispatch('email.opened', {
      campaignId: recipient.campaignId,
      recipientId: recipient.id,
      contactId: recipient.contactId,
      at: now.toISOString(),
    });
  }
}

/** Record a click (also synthesizes an open) and return the validated target URL. */
export async function recordClick(
  payload: { r: string; c?: string | null; u: string },
  meta: EventMeta = {}
): Promise<string | null> {
  const target = payload.u;
  if (!/^https?:\/\//i.test(target)) return null; // open-redirect guard

  const recipient = await prisma.emailCampaignRecipient.findUnique({
    where: { id: payload.r },
    select: {
      id: true,
      campaignId: true,
      contactId: true,
      openedAt: true,
      clickedAt: true,
      status: true,
    },
  });
  const now = new Date();

  if (recipient) {
    const firstClick = await prisma.emailCampaignRecipient.updateMany({
      where: { id: recipient.id, clickedAt: null },
      data: { clickedAt: now },
    });
    const firstOpen = await prisma.emailCampaignRecipient.updateMany({
      where: { id: recipient.id, openedAt: null },
      data: { openedAt: now },
    });
    await prisma.emailCampaignRecipient.update({
      where: { id: recipient.id },
      data: {
        clickCount: { increment: 1 },
        status:
          recipient.status === 'BOUNCED' || recipient.status === 'COMPLAINED'
            ? recipient.status
            : 'CLICKED',
      },
    });

    await prisma.emailEvent.create({
      data: {
        eventType: 'CLICK',
        campaignId: recipient.campaignId,
        recipientId: recipient.id,
        contactId: recipient.contactId,
        url: target,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      },
    });
    await prisma.emailContact
      .update({ where: { id: recipient.contactId }, data: { lastClickedAt: now } })
      .catch(() => {});

    if (recipient.campaignId) {
      const inc: Record<string, { increment: number }> = {};
      if (firstClick.count === 1) inc.clickedCount = { increment: 1 };
      if (firstOpen.count === 1) inc.openedCount = { increment: 1 };
      if (Object.keys(inc).length) {
        await prisma.emailCampaign
          .update({ where: { id: recipient.campaignId }, data: inc })
          .catch(() => {});
      }
    }
    if (firstClick.count === 1) {
      void webhookService.dispatch('email.clicked', {
        campaignId: recipient.campaignId,
        recipientId: recipient.id,
        contactId: recipient.contactId,
        url: target,
        at: now.toISOString(),
      });
    }

    // Aggregate per-link CTR bookkeeping.
    await recordLinkClick(recipient.campaignId, target, recipient.id, recipient.contactId, meta);
  }

  return target;
}

/** Upsert the campaign link and log a click against it (aggregate CTR). */
async function recordLinkClick(
  campaignId: string | null,
  targetUrl: string,
  recipientId: string | null,
  contactId: string | null,
  meta: EventMeta
): Promise<void> {
  try {
    let link = await prisma.emailLink.findFirst({ where: { campaignId, targetUrl } });
    if (!link) {
      const { randomTrackingToken } = await import('../utils/email-token');
      link = await prisma.emailLink.create({
        data: { campaignId, targetUrl, code: randomTrackingToken() },
      });
    }
    await prisma.emailLink.update({
      where: { id: link.id },
      data: { clickCount: { increment: 1 } },
    });
    await prisma.emailLinkClick.create({
      data: {
        linkId: link.id,
        recipientId,
        contactId,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      },
    });
  } catch (err) {
    logger.debug(`recordLinkClick failed: ${(err as Error).message}`);
  }
}

/** Record an unsubscribe (one-click / link / reply STOP). Idempotent. */
export async function recordUnsubscribe(
  payload: { e: string; r?: string | null; c?: string | null },
  method: 'one_click' | 'link' | 'reply_stop' | 'manual',
  meta: EventMeta = {}
): Promise<void> {
  const email = normalizeEmail(payload.e);
  if (!email) return;
  const now = new Date();

  // Suppression + contact status are always applied (idempotent upserts).
  await addSuppression({ email, reason: 'unsubscribe', source: method }).catch(() => {});

  const contact = await prisma.emailContact.findUnique({
    where: { email },
    select: { id: true },
  });
  if (contact) {
    await prisma.emailContact
      .update({
        where: { id: contact.id },
        data: { subscribeStatus: 'UNSUBSCRIBED', unsubscribedAt: now },
      })
      .catch(() => {});
  }

  // First-time guard: one-click POSTs / link prefetch can fire repeatedly, so the
  // audit row, event, and campaign counter must only apply on the first unsub for
  // this recipient (mirrors the firstOpen/firstClick pattern).
  let firstTime = true;
  if (payload.r) {
    const claim = await prisma.emailCampaignRecipient.updateMany({
      where: { id: payload.r, unsubscribedAt: null },
      data: { unsubscribedAt: now },
    });
    firstTime = claim.count === 1;
  }
  if (!firstTime) return;

  await prisma.emailUnsubscribe.create({
    data: {
      email,
      contactId: contact?.id ?? null,
      campaignId: payload.c ?? null,
      recipientId: payload.r ?? null,
      method,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    },
  });

  await prisma.emailEvent.create({
    data: {
      eventType: 'UNSUBSCRIBE',
      campaignId: payload.c ?? null,
      recipientId: payload.r ?? null,
      contactId: contact?.id ?? null,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    },
  });

  if (payload.c) {
    await prisma.emailCampaign
      .update({ where: { id: payload.c }, data: { unsubscribedCount: { increment: 1 } } })
      .catch(() => {});
  }
  void webhookService.dispatch('email.unsubscribed', {
    email,
    campaignId: payload.c ?? null,
    recipientId: payload.r ?? null,
    method,
    at: now.toISOString(),
  });
}
