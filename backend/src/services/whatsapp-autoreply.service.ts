import { prisma } from '../config/prisma';
import logger from '../config/logger';
import { windowOpen } from './whatsapp-conversation.service';
import {
  sendSessionMessage,
  sendTemplateToConversation,
  sendInteractiveMessage,
} from './whatsapp-send.service';
import { listActiveFaqsForMenu } from './whatsapp-faq.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

const AWAY_DEBOUNCE_MS = 30 * 60 * 1000; // don't re-send away within 30 min

/**
 * Send the FAQ interactive list (one row per active FAQ). Returns false when
 * there are no FAQs to show. WhatsApp caps list-row titles at 24 chars, so the
 * (short) question is the title and its longer form goes into the description.
 */
async function sendFaqMenu(conversationId: string): Promise<boolean> {
  const faqs = await listActiveFaqsForMenu();
  if (faqs.length === 0) return false;
  await sendInteractiveMessage(conversationId, null as any, {
    kind: 'list',
    bodyText: 'Frequently asked questions — tap a topic and we’ll reply right away.',
    listButton: 'View topics',
    sections: [
      {
        title: 'FAQs',
        rows: faqs.map((f) => ({
          id: `faq_${f.id}`,
          title: f.question.slice(0, 24),
          ...(f.question.length > 24 ? { description: f.question.slice(0, 72) } : {}),
        })),
      },
    ],
  });
  return true;
}

interface BusinessDay {
  day: number; // 0 (Sun) - 6 (Sat)
  open: string; // "HH:MM"
  close: string; // "HH:MM"
}
interface BusinessHours {
  tz?: string;
  days?: BusinessDay[];
}

/** Parse "HH:MM" into minutes-since-midnight; null if malformed. */
function parseHmToMinutes(value: string | undefined | null): number | null {
  if (!value || typeof value !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Day-of-week + minutes-since-midnight for `now`, evaluated in the configured tz
 * if provided (best-effort via Intl), otherwise the server's local time.
 */
function nowInTz(now: Date, tz: string | undefined): { day: number; minutes: number } {
  if (tz) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(now);
      const lookup = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
      const weekdayMap: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
      };
      const day = weekdayMap[lookup('weekday')];
      let hour = Number(lookup('hour'));
      const minute = Number(lookup('minute'));
      if (hour === 24) hour = 0; // some runtimes emit "24" for midnight
      if (day !== undefined && Number.isFinite(hour) && Number.isFinite(minute)) {
        return { day, minutes: hour * 60 + minute };
      }
    } catch {
      // fall through to local time
    }
  }
  return { day: now.getDay(), minutes: now.getHours() * 60 + now.getMinutes() };
}

/**
 * Whether `now` falls within configured business hours.
 * No businessHours / no days configured => treated as always open (no away).
 * Handles overnight windows (close <= open) that span midnight.
 */
function withinBusinessHours(businessHours: unknown, now: Date): boolean {
  const bh = businessHours as BusinessHours | null;
  if (!bh || !Array.isArray(bh.days) || bh.days.length === 0) return true; // always open
  const { day, minutes } = nowInTz(now, bh.tz);
  for (const slot of bh.days) {
    if (!slot || slot.day !== day) continue;
    const open = parseHmToMinutes(slot.open);
    const close = parseHmToMinutes(slot.close);
    if (open === null || close === null) continue;
    if (close > open) {
      if (minutes >= open && minutes < close) return true;
    } else if (close < open) {
      // overnight window (e.g. 22:00–06:00): open until midnight OR from midnight to close
      if (minutes >= open || minutes < close) return true;
    } else {
      // open === close: treat as 24h for that day
      return true;
    }
  }
  return false;
}

/** Case-insensitive keyword match against the inbound text/button per matchType. */
function keywordMatches(matchType: string, keyword: string, haystack: string): boolean {
  const k = keyword.trim().toLowerCase();
  if (!k) return false;
  const h = haystack.trim().toLowerCase();
  switch (matchType) {
    case 'exact':
      return h === k;
    case 'starts':
      return h.startsWith(k);
    case 'contains':
    default:
      // token match OR substring so multi-word phrases and single tokens both work
      if (h.includes(k)) return true;
      return h.split(/\s+/).includes(k);
  }
}

/**
 * Inbound auto-reply engine. Best-effort: every failure is caught + logged and
 * never propagated to the webhook pipeline.
 *
 * Priority:
 *   1. Active keyword rules (priority desc) — fire even if autoReplyEnabled is off.
 *   2. If enabled & new conversation -> welcome message.
 *   3. Else if enabled & outside business hours -> away message (30-min debounced).
 * At most one auto-reply is sent per inbound.
 */
export async function handleInboundAutoReply(opts: {
  conversationId: string;
  contactId: string;
  channelId: string;
  text: string | null;
  buttonId?: string | null;
  isNewConversation: boolean;
}): Promise<void> {
  try {
    const settings = await prisma.waSettings.findUnique({ where: { id: 'default' } });

    const conv = await prisma.waConversation.findUnique({
      where: { id: opts.conversationId },
      select: { windowExpiresAt: true },
    });
    if (!conv) return;
    // Can't free-form (or send keyword text) outside the open 24h window.
    if (!windowOpen(conv.windowExpiresAt)) return;

    const haystack = (opts.buttonId ?? opts.text ?? '').trim();

    // 0) FAQ answer — the customer tapped an FAQ row in the interactive list.
    if (opts.buttonId && opts.buttonId.startsWith('faq_')) {
      const faq = await prisma.waFaq.findUnique({ where: { id: opts.buttonId.slice(4) } });
      if (faq && faq.isActive) {
        await sendSessionMessage(opts.conversationId, null as any, {
          type: 'text',
          text: faq.answer,
        });
      }
      return;
    }

    // 1) FAQ menu — show the interactive FAQ list on a configured trigger keyword.
    if (settings?.faqMenuEnabled && haystack) {
      const triggers = settings.faqTriggerKeywords ?? [];
      if (triggers.some((kw) => keywordMatches('contains', kw, haystack))) {
        if (await sendFaqMenu(opts.conversationId)) return;
      }
    }

    // 2) Keyword rules — explicit, run regardless of autoReplyEnabled.
    if (haystack) {
      const rules = await prisma.waKeywordRule.findMany({
        where: { isActive: true },
        orderBy: { priority: 'desc' },
      });
      for (const rule of rules) {
        if (!keywordMatches(rule.matchType, rule.match, haystack)) continue;
        if (rule.replyTemplateId) {
          await sendTemplateToConversation(opts.conversationId, null, {
            templateId: rule.replyTemplateId,
          });
        } else if (rule.replyText) {
          await sendSessionMessage(opts.conversationId, null as any, {
            type: 'text',
            text: rule.replyText,
          });
        }
        return; // one auto-reply max
      }
    }

    if (!settings) return;

    // 3) First contact — welcome (when auto-reply is on) + the FAQ menu (when enabled).
    if (opts.isNewConversation) {
      let sent = false;
      if (settings.autoReplyEnabled && settings.welcomeMessage) {
        await sendSessionMessage(opts.conversationId, null as any, {
          type: 'text',
          text: settings.welcomeMessage,
        });
        sent = true;
      }
      if (settings.faqMenuEnabled && (await sendFaqMenu(opts.conversationId))) sent = true;
      if (sent) return;
    }

    // 4) Away — manual away toggle OR outside business hours, debounced (auto-reply on).
    if (
      settings.autoReplyEnabled &&
      settings.awayMessage &&
      (settings.awayMode || !withinBusinessHours(settings.businessHours, new Date()))
    ) {
      const recentOutbound = await prisma.waMessage.findFirst({
        where: {
          conversationId: opts.conversationId,
          direction: 'OUTBOUND',
          createdAt: { gte: new Date(Date.now() - AWAY_DEBOUNCE_MS) },
        },
        select: { id: true },
      });
      if (recentOutbound) return; // already replied recently; don't spam away
      await sendSessionMessage(opts.conversationId, null as any, {
        type: 'text',
        text: settings.awayMessage,
      });
    }
  } catch (err) {
    logger.warn(
      `WhatsApp auto-reply failed conv=${opts.conversationId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}
