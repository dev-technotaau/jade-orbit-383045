import { prisma } from '../config/prisma';
import logger from '../config/logger';
import { getEmailSettings } from './email-settings.service';
import { sendThreadReply } from './email-thread.service';
import type { InboundEmail } from './email-inbound.service';

/**
 * Settings-driven inbound auto-responder for the email reply inbox:
 *   1. Welcome — a contact's first-ever inbound gets the welcome message (once).
 *   2. Away — manual away toggle OR outside business hours gets the away message,
 *      debounced per thread so we never spam a back-and-forth.
 * Keyword `EmailRule`s are handled separately (email-inbound.evaluateRules).
 *
 * Loop-safe: never auto-replies to automated mail (Auto-Submitted / bulk /
 * mailer-daemon / no-reply / bounce / our own senders / OOO subjects), so two
 * auto-responders can never ping-pong. Best-effort — failures are swallowed.
 */

const AWAY_DEBOUNCE_MS = 4 * 60 * 60 * 1000; // don't re-send away within 4h per thread

interface BusinessDay {
  day: number; // 0 (Sun) - 6 (Sat)
  open: string; // "HH:MM"
  close: string; // "HH:MM"
}
interface BusinessHours {
  tz?: string;
  days?: BusinessDay[];
}

function parseHmToMinutes(value: string | undefined | null): number | null {
  if (!value || typeof value !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

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
      if (hour === 24) hour = 0;
      if (day !== undefined && Number.isFinite(hour) && Number.isFinite(minute)) {
        return { day, minutes: hour * 60 + minute };
      }
    } catch {
      /* fall through to local time */
    }
  }
  return { day: now.getDay(), minutes: now.getHours() * 60 + now.getMinutes() };
}

/**
 * Whether `now` falls within configured business hours. No businessHours / no
 * days => always open (never "away" on schedule). Handles overnight windows.
 */
export function withinBusinessHours(businessHours: unknown, now: Date): boolean {
  const bh = businessHours as BusinessHours | null;
  if (!bh || !Array.isArray(bh.days) || bh.days.length === 0) return true;
  const { day, minutes } = nowInTz(now, bh.tz);
  for (const slot of bh.days) {
    if (!slot || slot.day !== day) continue;
    const open = parseHmToMinutes(slot.open);
    const close = parseHmToMinutes(slot.close);
    if (open === null || close === null) continue;
    if (close > open) {
      if (minutes >= open && minutes < close) return true;
    } else if (close < open) {
      if (minutes >= open || minutes < close) return true; // overnight window
    } else {
      return true; // open === close => 24h
    }
  }
  return false;
}

const LOOP_FROM_RE =
  /(^|[<\s])(no[-_.]?reply|do[-_.]?not[-_.]?reply|mailer-daemon|postmaster|bounce|bounces|notifications?|alerts?|automated?)@/i;
const LOOP_SUBJECT_RE =
  /(out of office|automatic reply|auto[- ]?reply|autoreply|auto-?responder|on vacation|away from|undeliverable|delivery (status|failure)|mail delivery|returned mail|read receipt)/i;

/**
 * True when the inbound looks automated and must NOT trigger an auto-reply.
 * Pure (no DB) so the keyword-rule engine can share it. Sender-identity checks
 * (our own addresses) are layered on top in maybeAutoRespond.
 */
export function looksAutomated(
  email: Pick<InboundEmail, 'from' | 'subject' | 'autoSubmitted'>
): boolean {
  if (email.autoSubmitted) return true;
  const from = (email.from || '').toLowerCase();
  if (LOOP_FROM_RE.test(from)) return true;
  if (email.subject && LOOP_SUBJECT_RE.test(email.subject)) return true;
  return false;
}

function extractAddr(raw: string): string {
  const m = /<([^>]+)>/.exec(raw);
  return (m ? m[1] : raw).trim().toLowerCase();
}

/**
 * Consider sending a welcome / away auto-reply for an inbound message. Called
 * after the message + keyword rules are processed; sends at most one message.
 */
export async function maybeAutoRespond(opts: {
  threadId: string;
  contactId: string;
  email: InboundEmail;
}): Promise<void> {
  try {
    const settings = await getEmailSettings();
    if (!settings.autoReplyEnabled) return;
    if (looksAutomated(opts.email)) return;

    // Never auto-reply to one of our own sending identities (hard loop guard).
    const fromAddr = extractAddr(opts.email.from);
    const senders = await prisma.emailSender.findMany({
      select: { fromEmail: true, domain: true },
    });
    const senderEmails = new Set(senders.map((s) => s.fromEmail.toLowerCase()));
    const senderDomains = new Set(senders.map((s) => s.domain.toLowerCase()));
    const fromDomain = fromAddr.split('@')[1] ?? '';
    if (senderEmails.has(fromAddr) || senderDomains.has(fromDomain)) return;

    // 1) Welcome — first-ever inbound from this contact.
    const contact = await prisma.emailContact.findUnique({
      where: { id: opts.contactId },
      select: { welcomedAt: true, isBlocked: true },
    });
    if (!contact || contact.isBlocked) return;

    if (!contact.welcomedAt && settings.welcomeMessage) {
      await sendThreadReply(opts.threadId, null, { body: settings.welcomeMessage }, { auto: true });
      await prisma.emailContact.update({
        where: { id: opts.contactId },
        data: { welcomedAt: new Date() },
      });
      return; // one auto-reply per inbound
    }

    // 2) Away — manual away toggle OR outside business hours, debounced.
    const away = settings.awayMode || !withinBusinessHours(settings.businessHours, new Date());
    if (away && settings.awayMessage) {
      const thread = await prisma.emailThread.findUnique({
        where: { id: opts.threadId },
        select: { lastAutoReplyAt: true },
      });
      const recent =
        thread?.lastAutoReplyAt && Date.now() - thread.lastAutoReplyAt.getTime() < AWAY_DEBOUNCE_MS;
      if (recent) return;
      await sendThreadReply(opts.threadId, null, { body: settings.awayMessage }, { auto: true });
      await prisma.emailThread.update({
        where: { id: opts.threadId },
        data: { lastAutoReplyAt: new Date() },
      });
    }
  } catch (err) {
    logger.warn(`email auto-reply failed for thread ${opts.threadId}: ${(err as Error).message}`);
  }
}
