import { prisma } from '../config/prisma';
import logger from '../config/logger';
import { subscribeAppEvent } from '../config/redis';
import { env } from '../config/env';
import { Prisma } from '@prisma/client';
import type { WaContact, WaConsentEventType, WaOptInStatus } from '@prisma/client';
import { AppError } from '../middleware/error';
import { deleteFileFromR2 } from './storage.service';
import { setUsersBlocked } from './whatsapp.service';
import { encryptJson, decryptJson } from '../utils/encryption';

// consentEvidence (opt-in provenance incl. IP/referral) is encrypted at rest and
// transparently decrypted on every read path below, so callers see the original
// object. decryptJson() passes through legacy plaintext rows.

/**
 * Normalize any phone string to E.164 (`+<digits>`).
 *
 * A bare national number (no `+`, ten digits or fewer) gets DEFAULT_COUNTRY_CODE
 * prefixed. Without this an operator pasting `9876543210` into contact import
 * produced `+9876543210` — a number Meta cannot route, with no error until the
 * first send failed.
 *
 * Inbound webhook numbers are unaffected: Meta always sends full international
 * digits (e.g. `919876543210`, 12), which is longer than any national number, so
 * the prefix rule never fires on them.
 */
export function normalizeWaPhone(raw: string): string {
  const trimmed = String(raw ?? '').trim();
  let digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) return raw;

  // An explicit `+` means the caller already gave a country code.
  if (trimmed.startsWith('+')) return `+${digits}`;

  // `00` is the ITU international access prefix — 00<cc><number> is the same
  // number as +<cc><number>. Without this, an imported `00919876543210` became
  // `+00919876543210` and every message to it failed.
  if (digits.startsWith('00') && digits.length > 4) return `+${digits.slice(2)}`;

  const cc = (env.DEFAULT_COUNTRY_CODE || '').replace(/[^\d]/g, '');
  if (cc) {
    // A single leading 0 is a national trunk prefix, not part of the number —
    // people write their own number as 09876543210 constantly. It made the
    // digit count 11, which skipped the country-code branch below and produced
    // `+09876543210`: a different contact identity for the same person, and
    // undeliverable.
    if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
    if (digits.length <= 10) return `+${cc}${digits}`;
  }

  return `+${digits}`;
}

/**
 * Unambiguous opt-out words. These carry essentially no other meaning in an
 * inbound business message, so a match anywhere in the text is intent enough.
 */
const STRONG_OPT_OUT_KEYWORDS = ['stop', 'unsubscribe', 'optout', 'opt-out'];

/**
 * Words that mean opt-out only when the message is *just* that word.
 *
 * These used to be matched as bare tokens anywhere in the message, alongside
 * the strong ones — so "please cancel my order", "can you remove the second
 * item" or "end of the month works" silently and permanently opted the customer
 * out of every category of message. There is no UI that shows why, and the
 * contact then fails `eligible()` forever. A customer replying "CANCEL" on its
 * own is unambiguous; the same word inside a sentence is not.
 */
const WEAK_OPT_OUT_KEYWORDS = ['cancel', 'remove', 'quit', 'end'];

/** Both sets, for the whole-message comparison. */
const DEFAULT_OPT_OUT_KEYWORDS = [...STRONG_OPT_OUT_KEYWORDS, ...WEAK_OPT_OUT_KEYWORDS];

const OPT_OUT_KEYWORDS = new Set(
  [...DEFAULT_OPT_OUT_KEYWORDS, ...(env.WHATSAPP_OPT_OUT_KEYWORDS || '').split(',')]
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

/**
 * Operator-configured keywords from WaSettings, cached briefly.
 *
 * The settings page ships a chip editor titled "Opt-out keywords", described as
 * "Inbound messages matching any keyword auto opt-out the contact", the API
 * accepts it and the service persists it — and nothing ever read it back. An
 * operator who added their own keyword (a local-language "band karo") watched it
 * save successfully and do nothing. The env list and the defaults were the only
 * thing the detector ever consulted.
 *
 * Cached because this is consulted on every inbound text message; 60s is short
 * enough that a settings change takes effect while someone is still looking at
 * the page.
 */
const SETTINGS_KEYWORDS_TTL_MS = 60_000;
let settingsKeywords: Set<string> = new Set();
let settingsKeywordsAt = 0;

/** Redis channel every process listens on for WhatsApp cache invalidation. */
export const WA_CACHE_INVALIDATE_CHANNEL = 'wa:cache-invalidate';

/** Payload on that channel meaning "the WaSettings keyword lists changed". */
export const WA_KEYWORD_CACHE_KEY = 'opt-keywords';

let keywordSubscriptionStarted = false;

/**
 * Listen for keyword-cache invalidation published by any other process.
 *
 * `invalidateOptOutKeywordCache()` zeroes a module-level timestamp, which only
 * reaches the process that made the call. The settings page runs in the API
 * process; the opt-out detector runs in the inbound worker. Split those into
 * separate services or add a second replica — the deployment this ships with
 * does both — and an operator who adds "band karo" watches it save and then
 * watches the next customer who types it stay subscribed for up to a minute,
 * with nothing to indicate why. The publish/subscribe hop closes that window
 * for every process, not just the one that handled the save.
 *
 * Subscribed on first use rather than at import so a process that never reads
 * these keywords (and the test suite) never opens a subscriber connection.
 */
function ensureKeywordInvalidationSubscription(): void {
  if (keywordSubscriptionStarted) return;
  keywordSubscriptionStarted = true;
  try {
    subscribeAppEvent(WA_CACHE_INVALIDATE_CHANNEL, (message) => {
      if (message !== WA_KEYWORD_CACHE_KEY) return;
      settingsKeywordsAt = 0;
      settingsOptInKeywordsAt = 0;
    });
  } catch (err) {
    // Without the fan-out the TTL still bounds staleness, so this degrades to
    // the previous behaviour rather than breaking opt-out detection.
    logger.warn(`Keyword cache invalidation not subscribed: ${(err as Error)?.message}`);
  }
}

async function loadSettingsKeywords(): Promise<Set<string>> {
  ensureKeywordInvalidationSubscription();
  if (Date.now() - settingsKeywordsAt < SETTINGS_KEYWORDS_TTL_MS) return settingsKeywords;
  try {
    const row = await prisma.waSettings.findFirst({ select: { optOutKeywords: true } });
    settingsKeywords = new Set(
      (row?.optOutKeywords ?? []).map((k) => k.trim().toLowerCase()).filter(Boolean)
    );
  } catch {
    // Leave the previous value in place — a settings read failure must not
    // silently disable opt-out detection.
  }
  settingsKeywordsAt = Date.now();
  return settingsKeywords;
}

/** Refresh the cache immediately — call after settings are saved. */
export function invalidateOptOutKeywordCache(): void {
  settingsKeywordsAt = 0;
  settingsOptInKeywordsAt = 0;
}

/**
 * Opt-IN keywords: the built-ins, the env list and the operator's own.
 *
 * Re-subscribe is unambiguous by nature — nobody types "START" mid-sentence to
 * mean something else — so these are matched with the same whole-message /
 * strong-token rule as STOP.
 */
const OPT_IN_KEYWORDS = new Set(
  ['start', 'unstop', 'subscribe', 'resume', ...(env.WHATSAPP_OPT_IN_KEYWORDS || '').split(',')]
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

let settingsOptInKeywords: Set<string> = new Set();
let settingsOptInKeywordsAt = 0;

async function loadSettingsOptInKeywords(): Promise<Set<string>> {
  ensureKeywordInvalidationSubscription();
  if (Date.now() - settingsOptInKeywordsAt < SETTINGS_KEYWORDS_TTL_MS) return settingsOptInKeywords;
  try {
    const row = await prisma.waSettings.findFirst({ select: { optInKeywords: true } });
    settingsOptInKeywords = new Set(
      (row?.optInKeywords ?? []).map((k) => k.trim().toLowerCase()).filter(Boolean)
    );
  } catch {
    // Leave the previous value in place, as for opt-out.
  }
  settingsOptInKeywordsAt = Date.now();
  return settingsOptInKeywords;
}

/** Detect a re-subscribe reply (built-in + env + WaSettings keywords). */
export async function isOptInMessageAsync(text: string | null | undefined): Promise<boolean> {
  if (!text) return false;
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return false;
  if (matchesKeyword(trimmed, OPT_IN_KEYWORDS, OPT_IN_KEYWORDS)) return true;
  const configured = await loadSettingsOptInKeywords();
  return matchesKeyword(trimmed, configured, configured);
}

/** Words safe to match mid-sentence. Everything else needs the whole message. */
const STRONG_SET = new Set(STRONG_OPT_OUT_KEYWORDS);

function matchesKeyword(
  text: string,
  keywords: Set<string>,
  strong: Set<string> = STRONG_SET
): boolean {
  // Whole-message match (covers keywords that contain a hyphen, e.g. 'opt-out',
  // and multi-word phrases an operator may have configured). Any configured
  // keyword qualifies here — if the entire message is that word, it is intent.
  if (keywords.has(text)) return true;
  // Any-token match, but only for the unambiguous words: 'Please STOP now' and
  // 'STOP.' should hit; 'please cancel my order' must not.
  for (const token of text.split(/[^\w]+/)) {
    if (token && keywords.has(token) && strong.has(token)) return true;
  }
  return false;
}

/**
 * Detect an opt-out reply against the built-in and env-configured keywords.
 * Synchronous, so callers that cannot await still work; prefer
 * {@link isOptOutMessageAsync}, which also honours WaSettings.
 */
export function isOptOutMessage(text: string | null | undefined): boolean {
  if (!text) return false;
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return false;
  return matchesKeyword(trimmed, OPT_OUT_KEYWORDS);
}

/**
 * Detect an opt-out reply against the built-in, env-configured AND
 * operator-configured (WaSettings) keywords. This is the one the inbound worker
 * uses; compliance depends on honouring what the operator actually configured.
 */
export async function isOptOutMessageAsync(text: string | null | undefined): Promise<boolean> {
  if (!text) return false;
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return false;
  if (matchesKeyword(trimmed, OPT_OUT_KEYWORDS)) return true;
  return matchesKeyword(trimmed, await loadSettingsKeywords());
}

/**
 * Upsert a contact by phone.
 *
 * The host platform's version also tried to link each contact to a platform
 * `User` row by COALESCE(whatsappNumber, mobileNumber), guarding a @unique
 * userId. There is no user table in this module — every contact is simply a
 * phone number we talk to — so the phone IS the identity.
 */
export async function upsertContactByPhone(
  phone: string,
  data: { name?: string | null; waId?: string | null }
) {
  const normalized = normalizeWaPhone(phone);

  // A single upsert, not findUnique-then-create.
  //
  // The read-then-write version raced itself: the inbound worker runs at
  // concurrency 10, and two webhooks from a first-time contact arriving
  // together both saw "no row" and both called create. `phone` is @unique, so
  // the loser threw P2002 — and the worker's P2002 handling is scoped to the
  // message create further down, so the whole job failed and retried the entire
  // batch. Postgres resolves the conflict for us.
  // A number can be on the do-not-contact list before it has a contact row at
  // all (a supplied DNC file, a complaint). Inheriting the flag on create is
  // what stops the contacts list showing that person as reachable the moment
  // they first message in.
  const suppressedAt = (await suppressedPhonesIn([normalized])).has(normalized)
    ? new Date()
    : null;

  const result = await prisma.waContact.upsert({
    where: { phone: normalized },
    update: {
      ...(data.name ? { name: data.name } : {}),
      ...(data.waId ? { waId: data.waId } : {}),
    },
    create: {
      phone: normalized,
      name: data.name ?? null,
      waId: data.waId ?? null,
      suppressedAt,
    },
  });
  return result;
}

/**
 * Append an immutable consent transition.
 *
 * `optInStatus` / `optInAt` / `optOutAt` on WaContact are a MUTABLE projection of
 * the current state: re-opting a contact in nulls `optOutAt`, which retroactively
 * removed their opt-out from the daily trend chart. An operator who ran the same
 * report twice got two different answers, and a spike that later re-subscribed
 * disappeared entirely — the one signal that says "that campaign burned the
 * list". Events are append-only, so history stops moving.
 *
 * Written inside the caller's transaction wherever the projection is written, so
 * the two can never disagree. `evidence` is encrypted like every other consent
 * record — it carries the triggering message text.
 */
export interface ConsentEventInput {
  contactId: string;
  type: WaConsentEventType;
  source: string;
  campaignId?: string | null;
  evidence?: Record<string, unknown> | null;
}

function consentEventData(input: ConsentEventInput): Prisma.WaConsentEventCreateManyInput {
  return {
    contactId: input.contactId,
    type: input.type,
    source: input.source,
    campaignId: input.campaignId ?? null,
    ...(input.evidence ? { evidence: encryptJson(input.evidence) } : {}),
  };
}

/**
 * Seed WaConsentEvent from the consent columns that predate it.
 *
 * The opt-out trend now reads the event log, so without this every opt-out
 * recorded before the log existed simply vanishes from the chart — the report
 * would be correct and empty, which is worse than the mutable column it
 * replaced. Idempotent (a contact that already has an event of that type is
 * skipped) and bounded, so the daily caller drains it over a few runs and then
 * costs one indexed query.
 *
 * The synthesised events are marked `source: 'backfill'` and carry the ORIGINAL
 * timestamp, so a consent audit can tell a reconstructed row from a recorded one.
 */
export async function backfillConsentEvents(limit = 5000): Promise<number> {
  const take = Math.min(Math.max(Math.trunc(limit) || 5000, 1), 20000);
  let written = 0;

  for (const [type, column] of [
    ['OPT_OUT', 'optOutAt'],
    ['OPT_IN', 'optInAt'],
  ] as Array<[WaConsentEventType, 'optOutAt' | 'optInAt']>) {
    const candidates = await prisma.waContact.findMany({
      where: {
        [column]: { not: null },
        consentEvents: { none: { type } },
      } as Prisma.WaContactWhereInput,
      select: { id: true, optOutAt: true, optInAt: true, optOutSource: true, optInSource: true },
      take,
    });
    if (candidates.length === 0) continue;
    const res = await prisma.waConsentEvent.createMany({
      data: candidates.map((c) => ({
        contactId: c.id,
        type,
        source: 'backfill',
        createdAt: (column === 'optOutAt' ? c.optOutAt : c.optInAt) as Date,
      })),
    });
    written += res.count;
  }
  if (written > 0) {
    logger.info(`WhatsApp consent backfill: synthesised ${written} historical event(s)`);
  }
  return written;
}

/**
 * Record an opt-out.
 *
 * `source` is load-bearing for a consent dispute: "STOP reply" and "turned
 * marketing off inside WhatsApp" are legally different events, and the row used
 * to record neither. `evidence` holds the triggering message (wamid + text) so
 * the decision can be reconstructed; it is encrypted at rest like every other
 * consent record.
 */
export async function optOutContact(
  contactId: string,
  opts: {
    source?: string;
    evidence?: Record<string, unknown>;
    /** Campaign the contact was reacting to, when the caller can attribute it. */
    campaignId?: string | null;
  } = {}
) {
  const source = opts.source ?? 'reply';
  // One transaction: the projection on WaContact and the immutable event have to
  // land together, or a crash between them leaves a contact suppressed with no
  // record of why.
  const [contact] = await prisma.$transaction([
    prisma.waContact.update({
      where: { id: contactId },
      data: {
        optInStatus: 'OPTED_OUT',
        optOutAt: new Date(),
        optOutSource: source,
        ...(opts.evidence ? { consentEvidence: encryptJson({ ...opts.evidence, source }) } : {}),
      },
    }),
    prisma.waConsentEvent.create({
      data: consentEventData({
        contactId,
        type: 'OPT_OUT',
        source,
        campaignId: opts.campaignId ?? null,
        evidence: opts.evidence ?? null,
      }),
    }),
  ]);
  // The durable do-not-contact entry, written AFTER the transaction because
  // WaSuppression is keyed by phone and has no FK to the contact (mirrors the
  // delete optInContact does below).
  //
  // `optInStatus` is a projection on the contact row and the send path does not
  // read it — every outbound funnels through `isSuppressed(phone)` instead. So
  // an opt-out that only flipped the column left the one gate that actually
  // stops a send untouched: campaigns kept including the number, and a re-import
  // or a bulk edit could put the column back with nothing to say it ever moved.
  await prisma.waSuppression
    .upsert({
      where: { phone: contact.phone },
      create: { phone: contact.phone, reason: `opt-out (${source})`, createdBy: 'system' },
      // Left alone on conflict: an operator's own note about why this number is
      // suppressed is worth more than an automated restatement of it.
      update: {},
    })
    .catch(() => {});
  return contact;
}

/**
 * Record an opt-IN that came from the customer rather than from an operator.
 *
 * The module could only ever move a contact TO opted-out automatically; a
 * customer who sent START or re-enabled marketing in WhatsApp's own UI stayed
 * suppressed forever unless an operator noticed and flipped them back by hand.
 * Any suppression entry for the number goes with it — a re-subscribe that leaves
 * the phone on the do-not-contact list is not a re-subscribe.
 */
export async function optInContact(
  contactId: string,
  opts: {
    source?: string;
    evidence?: Record<string, unknown>;
    campaignId?: string | null;
  } = {}
) {
  const source = opts.source ?? 'reply';
  // Nulling optOutAt is exactly the write that used to erase history — the event
  // written alongside it is what preserves the fact that they ever left.
  const [contact] = await prisma.$transaction([
    prisma.waContact.update({
      where: { id: contactId },
      data: {
        optInStatus: 'OPTED_IN',
        optInAt: new Date(),
        optInSource: source,
        optOutAt: null,
        optOutSource: null,
        ...(opts.evidence ? { consentEvidence: encryptJson({ ...opts.evidence, source }) } : {}),
      },
    }),
    prisma.waConsentEvent.create({
      data: consentEventData({
        contactId,
        type: 'OPT_IN',
        source,
        campaignId: opts.campaignId ?? null,
        evidence: opts.evidence ?? null,
      }),
    }),
  ]);
  await prisma.waSuppression.deleteMany({ where: { phone: contact.phone } }).catch(() => {});
  await markContactsSuppressed([contact.phone], false);
  return contact;
}

export interface ContactListFilters {
  optInStatus?: WaOptInStatus;
  tag?: string;
  /** Multi-tag selection, matched with OR (`hasSome`) — see the note below. */
  tags?: string[];
  blocked?: boolean;
  /**
   * On / off the do-not-contact list. Resolved through `WaContact.suppressedAt`,
   * the mirror of WaSuppression that `markContactsSuppressed` maintains — the
   * suppression table itself has no relation to WaContact, so membership is not
   * expressible as a Prisma join.
   */
  suppressed?: boolean;
  q?: string;
  /**
   * A saved segment applied as a filter. Resolved through `segmentContactWhere`
   * — the predicate a campaign launch uses — rather than being flattened into
   * tags, so what the list shows is what the campaign will reach.
   */
  segmentId?: string;
}

/**
 * Read a multi-tag query parameter, accepting either `?tags=a&tags=b` or
 * `?tags=a,b`.
 *
 * Both forms exist in the wild: axios serialises an array as repeated keys, and
 * an operator sharing a filtered URL edits the comma form by hand.
 */
export function tagListQ(v: unknown): string[] | undefined {
  const raw = Array.isArray(v)
    ? v.map((t) => String(t))
    : typeof v === 'string'
      ? v.split(',')
      : [];
  const tags = raw.map((t) => t.trim()).filter(Boolean);
  return tags.length ? tags : undefined;
}

/** One day, in milliseconds — the unit every recency rule is written in. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** The contact timestamps a recency rule may be written against. */
const RECENCY_FIELDS = ['lastInboundAt', 'lastOutboundAt', 'lastMarketingAt'] as const;
type RecencyField = (typeof RECENCY_FIELDS)[number];

/**
 * One condition inside a segment filter.
 *
 * `field` is either a contact column (`tags`, `optInStatus`, `optInSource`, one
 * of the three recency timestamps), an imported attribute addressed as
 * `attr.<key>`, or the literal `campaign` for an engagement rule whose value is
 * a campaign id.
 */
export interface WaSegmentRule {
  field: string;
  operator: string;
  value?: unknown;
}

/** Read a rule's value as a non-empty string, or null when it is unusable. */
function ruleString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

/** Read a rule's value as a non-empty list of strings. */
function ruleStrings(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return raw.map((v) => String(v).trim()).filter(Boolean);
}

/** Read a rule's value as a positive number of days. */
function ruleDays(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Compile ONE rule to a Prisma predicate, or null when it says nothing usable
 * (a half-filled row in the segment builder must narrow nothing rather than
 * silently match everyone).
 */
function compileRule(rule: WaSegmentRule, now: number): Prisma.WaContactWhereInput | null {
  const field = String(rule.field ?? '').trim();
  const operator = String(rule.operator ?? '').trim();

  // Tags. `all` is the whole point of this grammar existing: the only tag
  // predicate the product had was OR, so "tagged mumbai AND premium" — the most
  // ordinary audience there is — could not be expressed at all.
  if (field === 'tags') {
    const tags = ruleStrings(rule.value);
    if (!tags.length) return null;
    if (operator === 'all') return { tags: { hasEvery: tags } };
    if (operator === 'none') return { NOT: { tags: { hasSome: tags } } };
    return { tags: { hasSome: tags } };
  }

  if (field === 'optInStatus') {
    const value = ruleString(rule.value);
    if (!value) return null;
    return operator === 'not'
      ? { optInStatus: { not: value as WaOptInStatus } }
      : { optInStatus: value as WaOptInStatus };
  }

  if (field === 'optInSource') {
    const value = ruleString(rule.value);
    if (!value) return null;
    return operator === 'contains'
      ? { optInSource: { contains: value, mode: 'insensitive' } }
      : { optInSource: value };
  }

  if ((RECENCY_FIELDS as readonly string[]).includes(field)) {
    const key = field as RecencyField;
    if (operator === 'exists') return { [key]: { not: null } };
    if (operator === 'notExists') return { [key]: null };
    const days = ruleDays(rule.value);
    if (days == null) return null;
    const since = new Date(now - days * DAY_MS);
    // "not within N days" has to include contacts with NO timestamp at all —
    // someone who has never messaged us is the clearest case of "not in the last
    // 30 days", and a bare `lt` on a null column matches nothing in SQL.
    return operator === 'notWithin'
      ? { OR: [{ [key]: null }, { [key]: { lt: since } }] }
      : { [key]: { gte: since } };
  }

  if (field.startsWith('attr.')) {
    const key = field.slice(5).trim();
    if (!key) return null;
    if (operator === 'exists') {
      return { NOT: { attributes: { path: [key], equals: Prisma.DbNull } } };
    }
    if (operator === 'notExists') return { attributes: { path: [key], equals: Prisma.DbNull } };
    const value = ruleString(rule.value);
    if (!value) return null;
    return operator === 'contains'
      ? { attributes: { path: [key], string_contains: value } }
      : { attributes: { path: [key], equals: value } };
  }

  // Campaign engagement. Every one of these was unreachable, so "everyone who
  // did not reply to the Diwali blast" had to be assembled outside the product
  // and pasted back in as a phone list.
  if (field === 'campaign') {
    const campaignId = ruleString(rule.value);
    if (!campaignId) return null;
    const replied = { campaignId, repliedAt: { not: null } };
    const clicked = { campaignId, clickedAt: { not: null } };
    switch (operator) {
      case 'notReceived':
        return { campaignRecipients: { none: { campaignId } } };
      case 'replied':
        return { campaignRecipients: { some: replied } };
      case 'notReplied':
        return { campaignRecipients: { none: replied } };
      case 'clicked':
        return { campaignRecipients: { some: clicked } };
      case 'notClicked':
        return { campaignRecipients: { none: clicked } };
      default:
        return { campaignRecipients: { some: { campaignId } } };
    }
  }

  return null;
}

/**
 * The audience predicate for a saved segment's stored filter.
 *
 * Two shapes, and both stay supported forever: the LEGACY flat keys
 * (`{ tags?, optInStatus?, attributes? }`) that every saved segment and every
 * campaign created before this was written still carries, and a `rules` list
 * combined by `op` ('and' by default). The legacy keys always narrow — they are
 * ANDed on top of the rules, never merged into an OR group, so adding a rule to
 * an existing segment cannot silently widen it.
 *
 * Lives HERE, beside the contacts-list where-builder, because the two used to
 * disagree and nothing pointed that out: a segment resolves its tags with OR
 * (`hasSome`), while the contacts page could only apply ONE tag. An operator
 * clicking a three-tag segment to sanity-check who is in it saw the count for
 * tag #1 and then launched a campaign at a strictly larger, different set — and
 * that preview was the only pre-send check available. The contacts list now
 * routes an applied segment through this same function (`contactListWhere`),
 * so the two cannot drift apart again.
 */
export function segmentContactWhere(
  filter: Record<string, unknown> | null | undefined,
  now = Date.now()
): Prisma.WaContactWhereInput {
  const f = filter ?? {};
  const tags = Array.isArray(f.tags) ? f.tags.map((t) => String(t)).filter(Boolean) : [];
  // Attribute equality, one JSON-path predicate per key, ANDed.
  //
  // WaSegment is documented as a "tag/optIn/attribute filter" and the attribute
  // half simply did not exist, so the import columns a contact carries could be
  // personalised on but never targeted — "everyone in Mumbai" was not
  // expressible. Values are compared as the strings the import writes.
  const attrs =
    f.attributes && typeof f.attributes === 'object' && !Array.isArray(f.attributes)
      ? Object.entries(f.attributes as Record<string, unknown>).filter(
          ([key, value]) => key && value != null && value !== ''
        )
      : [];

  const and: Prisma.WaContactWhereInput[] = attrs.map(([key, value]) => ({
    attributes: { path: [key], equals: String(value) },
  }));

  const rules = Array.isArray(f.rules) ? (f.rules as WaSegmentRule[]) : [];
  const compiled = rules
    .map((rule) => compileRule(rule ?? ({} as WaSegmentRule), now))
    .filter((w): w is Prisma.WaContactWhereInput => w !== null);
  // 'or' is the only mode that has to be expressed as a group; ANDed rules are
  // just more entries in the AND array the attribute filters already build.
  const or = String(f.op ?? 'and').toLowerCase() === 'or' && compiled.length > 1 ? compiled : null;
  if (!or) and.push(...compiled);

  return {
    isBlocked: false,
    ...(typeof f.optInStatus === 'string' ? { optInStatus: f.optInStatus as WaOptInStatus } : {}),
    ...(tags.length ? { tags: { hasSome: tags } } : {}),
    ...(or ? { OR: or } : {}),
    ...(and.length ? { AND: and } : {}),
  };
}

/**
 * The filter-box half of the contacts predicate (search, opt-in, tags, blocked),
 * shared by the list, the CSV export and bulk-by-filter. An applied segment is
 * ANDed on top by `contactListWhere`.
 */
function buildContactListWhere(filters: ContactListFilters): Prisma.WaContactWhereInput {
  // `tags` (OR across several) is what a saved segment carries; `tag` is the
  // single-tag box. When both arrive the multi-tag form wins, because it is the
  // one that came from a segment the campaign will resolve the same way.
  const tags = (filters.tags ?? []).filter(Boolean);
  return {
    // Erasure rewrites the phone to `erased:<uuid>` as a tombstone, but nothing

    // filtered it — so people who exercised their right to be forgotten stayed

    // visible in the contacts list, the total count and the CSV export.

    phone: { not: { startsWith: 'erased:' } },
    // The losing row of a contact merge is a tombstone pointing at the survivor,
    // not a person. Left visible it would show up as a second, empty copy of
    // somebody the operator has just finished reconciling.
    mergedIntoId: null,
    ...(filters.optInStatus ? { optInStatus: filters.optInStatus } : {}),
    ...(filters.suppressed !== undefined
      ? { suppressedAt: filters.suppressed ? { not: null } : null }
      : {}),
    ...(tags.length
      ? { tags: { hasSome: tags } }
      : filters.tag
        ? { tags: { has: filters.tag } }
        : {}),
    ...(filters.blocked !== undefined ? { isBlocked: filters.blocked } : {}),
    ...(filters.q
      ? {
          OR: [
            { phone: { contains: filters.q } },
            { name: { contains: filters.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

/**
 * The list predicate, with an applied saved segment resolved the way a launch
 * resolves it.
 *
 * Applying a segment on the contacts page used to mean copying its `tags` and
 * `optInStatus` into the filter boxes and dropping everything else — attribute
 * rules, recency rules, campaign-engagement rules, the OR operator, and the
 * `isBlocked: false` the campaign audience always carries. The page then showed
 * a strictly LARGER set than the campaign would message, and that preview is the
 * only pre-send check an operator has. Resolving the stored filter server-side
 * with the same `segmentContactWhere` makes the two agree by construction.
 */
async function contactListWhere(filters: ContactListFilters): Promise<Prisma.WaContactWhereInput> {
  const base = buildContactListWhere(filters);
  if (!filters.segmentId) return base;
  const segment = await prisma.waSegment.findUnique({
    where: { id: filters.segmentId },
    select: { filter: true },
  });
  // Deleted mid-session: fail rather than silently drop the constraint, because
  // this predicate also drives "select all N matching" bulk actions — quietly
  // widening it there would apply an opt-out or an erase to the whole list.
  if (!segment) throw new AppError('Segment not found', 404, 'WA_SEGMENT_NOT_FOUND');
  const segmentWhere = segmentContactWhere((segment.filter ?? {}) as Record<string, unknown>);
  // ANDed as siblings, never spread: both objects can carry their own `OR`
  // (the list's search box, the segment's 'or' rule group) and merging them
  // flat would drop one of the two.
  return { AND: [base, segmentWhere] };
}

/** Rows read per page by the streaming CSV export. */
const EXPORT_PAGE_SIZE = 1000;

/**
 * Every matching contact for the CSV export, one page at a time. When `ids` is
 * given, exports exactly those (selected-rows export); otherwise mirrors the
 * list filters.
 *
 * Paged and UNCAPPED. It used to be a single `findMany` with `take: 50_000`: an
 * operator with more than that got a file with no header, no warning and no row
 * count to reveal the truncation, so any reconciliation against it — and this is
 * the artefact a consent dispute or a Meta quality review is answered with —
 * silently lost everybody past the cap. The whole file also sat in the Node heap
 * at once.
 *
 * Keyset on `id`, not the `createdAt DESC` the list uses: `createdAt` is not
 * unique, so two contacts imported in the same millisecond would sit on a page
 * boundary and one of them would be skipped or repeated. That makes the file
 * id-ordered rather than newest-first; every row is present either way.
 */
export async function* streamContactsForExport(
  filters: ContactListFilters & { ids?: string[] },
  pageSize = EXPORT_PAGE_SIZE
): AsyncGenerator<Array<Omit<WaContact, 'consentEvidence'> & { consentEvidence: unknown }>> {
  const where: Prisma.WaContactWhereInput =
    filters.ids && filters.ids.length > 0
      ? { id: { in: filters.ids } }
      : await contactListWhere(filters);
  let after: string | undefined;
  for (;;) {
    const rows = await prisma.waContact.findMany({
      where: after ? { AND: [where, { id: { gt: after } }] } : where,
      orderBy: { id: 'asc' },
      take: pageSize,
    });
    if (rows.length === 0) return;
    yield rows.map((c) => ({ ...c, consentEvidence: decryptJson(c.consentEvidence) }));
    if (rows.length < pageSize) return;
    after = rows[rows.length - 1].id;
  }
}

export async function listContacts(
  filters: ContactListFilters & { page?: number; limit?: number }
) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(200, filters.limit ?? 50);
  const where = await contactListWhere(filters);
  const [items, total] = await Promise.all([
    prisma.waContact.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.waContact.count({ where }),
  ]);
  // Suppression membership for THIS page, read from WaSuppression itself rather
  // than from the `suppressedAt` mirror beside it.
  //
  // Suppressing a selection wrote only to WaSuppression, so the contacts view
  // was unchanged afterwards: those people kept a green OPTED IN badge while
  // every send to them was recorded FAILED with 131050. The badge has to come
  // from the authoritative table — the mirror exists so the FILTER above can be
  // a Prisma predicate at all, and if the two ever disagree it is repaired here
  // rather than shown.
  const phones = items.map((c) => c.phone);
  const suppressed = phones.length
    ? new Set(
        (
          await prisma.waSuppression.findMany({
            where: { phone: { in: phones } },
            select: { phone: true },
          })
        ).map((r) => r.phone)
      )
    : new Set<string>();
  const stale = items.filter((c) => suppressed.has(c.phone) !== (c.suppressedAt != null));
  if (stale.length) {
    // Normally zero rows. Non-zero means something wrote WaSuppression without
    // going through markContactsSuppressed, and the filter would under-report
    // until it is put right.
    const now = new Date();
    await Promise.all([
      prisma.waContact.updateMany({
        where: { id: { in: stale.filter((c) => suppressed.has(c.phone)).map((c) => c.id) } },
        data: { suppressedAt: now },
      }),
      prisma.waContact.updateMany({
        where: { id: { in: stale.filter((c) => !suppressed.has(c.phone)).map((c) => c.id) } },
        data: { suppressedAt: null },
      }),
    ]).catch(() => {});
  }
  return {
    items: items.map((c) => ({
      ...c,
      consentEvidence: decryptJson(c.consentEvidence),
      suppressed: suppressed.has(c.phone),
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Keep `WaContact.suppressedAt` in step with WaSuppression.
 *
 * The single writer for the mirror the contacts-list suppression FILTER reads.
 * Every path that adds to or removes from the do-not-contact list calls this, so
 * the two cannot drift; `listContacts` re-checks the authoritative table per page
 * and repairs anything that slipped past.
 */
export async function markContactsSuppressed(
  phones: string[],
  suppressed: boolean
): Promise<void> {
  if (phones.length === 0) return;
  await prisma.waContact
    .updateMany({
      where: { phone: { in: phones } },
      data: { suppressedAt: suppressed ? new Date() : null },
    })
    .catch(() => {
      /* the suppression row itself is the source of truth; the mirror self-heals */
    });
}

/** Which of these phones are already on the do-not-contact list. */
async function suppressedPhonesIn(phones: string[]): Promise<Set<string>> {
  if (phones.length === 0) return new Set();
  const rows = await prisma.waSuppression.findMany({
    where: { phone: { in: phones } },
    select: { phone: true },
  });
  return new Set(rows.map((r) => r.phone));
}

export type BulkContactAction =
  'tag' | 'untag' | 'optIn' | 'optOut' | 'block' | 'unblock' | 'addSuppression' | 'erase';

/** Cap for the heavy per-row erase action (each erase scrubs messages + R2). */
const BULK_ERASE_MAX = 1000;

/**
 * Rows per statement for bulk actions that inline ids.
 *
 * Postgres allows at most 65535 bind parameters in one statement, and
 * `Prisma.join` emits one per id — so an unchunked "select all matching" bulk
 * action failed hard once the contact list grew past that. 5000 leaves an order
 * of magnitude of headroom.
 */
const BULK_CHUNK = 5000;

/** Page a contact query by id and hand each chunk of ids to `fn`. */
async function forEachIdChunk(
  where: Prisma.WaContactWhereInput,
  fn: (ids: string[]) => Promise<void>
): Promise<void> {
  let cursor: string | undefined;
  for (;;) {
    // Keyset paging via an explicit id > cursor, NOT Prisma's cursor/skip:1.
    //
    // Prisma resolves `cursor` with a subselect that finds the row by id alone,
    // ignoring `where`, and then applies OFFSET 1. That is only correct while the
    // cursor row still matches the predicate. Every caller here MUTATES the rows it
    // just processed -- bulk opt-out sets optInStatus, block sets isBlocked -- so
    // after the first chunk the cursor row no longer matches, and the OFFSET 1
    // silently ate the first genuinely-unprocessed row of the next page instead.
    //
    // On "select all 12,000 matching", bulk opt-out therefore left one contact per
    // chunk still subscribed, reported a smaller count and flagged nothing: people
    // who asked to leave did not leave, which is the one outcome this action must
    // never get wrong. An explicit id > cursor is independent of the predicate.
    const page: Array<{ id: string }> = await prisma.waContact.findMany({
      where: cursor ? { AND: [where, { id: { gt: cursor } }] } : where,
      select: { id: true },
      orderBy: { id: 'asc' },
      take: BULK_CHUNK,
    });
    if (page.length === 0) return;
    cursor = page[page.length - 1].id;
    await fn(page.map((r) => r.id));
    if (page.length < BULK_CHUNK) return;
  }
}

/**
 * Apply one action to many contacts. Selection is EITHER explicit `ids` OR
 * `allMatching` (every contact matching the same list filters — "select all N").
 * Most actions are a single updateMany; untag uses array_remove; addSuppression
 * and erase resolve the set first (erase is capped + looped since it scrubs
 * messages + R2 media per contact).
 */
export async function bulkUpdateContacts(opts: {
  action: BulkContactAction;
  ids?: string[];
  allMatching?: boolean;
  filters?: ContactListFilters;
  tag?: string;
  performedBy?: string | null;
}): Promise<{
  count: number;
  skippedOptedOut?: number;
  /** Already in the target consent state, so nothing was written for them. */
  skippedNoChange?: number;
  failed?: string[];
}> {
  const where: Prisma.WaContactWhereInput = opts.allMatching
    ? await contactListWhere(opts.filters ?? {})
    : { id: { in: opts.ids ?? [] } };
  if (!opts.allMatching && (!opts.ids || opts.ids.length === 0)) return { count: 0 };
  const now = new Date();

  /**
   * Narrow the selection by ANDing, never by spreading.
   *
   * `where` can already constrain optInStatus — from the page's opt-in filter or
   * from an applied segment — and `{ ...where, optInStatus: X }` REPLACED that
   * constraint. Bulk opt-in over a selection filtered to "opted out" therefore
   * ran its update against contacts with UNKNOWN consent who were never on
   * screen, granting consent for people the operator had not selected.
   */
  const narrow = (extra: Prisma.WaContactWhereInput): Prisma.WaContactWhereInput => ({
    AND: [where, extra],
  });

  switch (opts.action) {
    case 'optIn': {
      // Bulk opt-in cannot overturn an explicit opt-out. With "select all
      // matching" this is one click over an unbounded set, so a single mis-click
      // would re-subscribe everyone who ever replied STOP. The per-contact edit
      // (`updateContact`) is the deliberate, one-at-a-time override for a
      // customer who genuinely re-consented; this bulk path is not.
      const skippedOptedOut = await prisma.waContact.count({
        where: narrow({ optInStatus: 'OPTED_OUT' }),
      });
      // Contacts already OPTED_IN are left ALONE rather than re-written.
      // Rewriting them stamped optInAt/optInSource/consentEvidence with today's
      // bulk action, destroying the real provenance of a consent collected
      // months ago on a form — and appended a second OPT_IN consent event for
      // someone who never transitioned, inflating the opt-in line of the trend
      // chart every time the same audience was bulk-processed again.
      const skippedNoChange = await prisma.waContact.count({
        where: narrow({ optInStatus: 'OPTED_IN' }),
      });
      // PROVENANCE. The single-contact path records optInSource; this one wrote
      // consent for an unbounded set of people and recorded nothing about where it
      // came from, which is exactly the record a consent dispute turns on. The
      // same evidence object is written to every affected row.
      const evidence = encryptJson({
        source: 'bulk',
        at: now.toISOString(),
        by: opts.performedBy ?? null,
        selection: opts.allMatching ? { filters: opts.filters ?? {} } : { ids: opts.ids?.length },
      });
      // Ids first, then the update, so the immutable consent events can name the
      // exact contacts affected. updateMany returns only a count, and without the
      // events a bulk re-opt-in silently rewrote every one of those contacts' past
      // opt-outs out of the trend chart.
      let count = 0;
      await forEachIdChunk(
        narrow({ optInStatus: { notIn: ['OPTED_OUT', 'OPTED_IN'] } }),
        async (ids) => {
          const res = await prisma.$transaction([
            prisma.waContact.updateMany({
              where: { id: { in: ids } },
              data: {
                optInStatus: 'OPTED_IN',
                optInAt: now,
                optInSource: 'bulk',
                optOutAt: null,
                optOutSource: null,
                consentEvidence: evidence,
              },
            }),
            prisma.waConsentEvent.createMany({
              data: ids.map((contactId) =>
                consentEventData({ contactId, type: 'OPT_IN', source: 'bulk' })
              ),
            }),
          ]);
          count += res[0].count;
        }
      );
      return { count, skippedOptedOut, skippedNoChange };
    }
    case 'optOut': {
      // Contacts who are ALREADY opted out are excluded, for the same two
      // reasons the opt-in branch excludes the already-opted-in: re-writing them
      // reset optOutAt/optOutSource to "bulk, today" over the real STOP reply
      // that took them off the list, and each pass appended another OPT_OUT
      // consent event. The opt-out metrics count events, so re-running a bulk
      // opt-out over the same audience inflated the opt-out total, the per-1000
      // rate and the worst-campaign ranking above the number of people who
      // actually left — the exact numbers an operator uses to decide whether a
      // send damaged the list.
      const skippedNoChange = await prisma.waContact.count({
        where: narrow({ optInStatus: 'OPTED_OUT' }),
      });
      let count = 0;
      await forEachIdChunk(narrow({ optInStatus: { not: 'OPTED_OUT' } }), async (ids) => {
        const res = await prisma.$transaction([
          prisma.waContact.updateMany({
            where: { id: { in: ids } },
            data: { optInStatus: 'OPTED_OUT', optOutAt: now, optOutSource: 'bulk' },
          }),
          prisma.waConsentEvent.createMany({
            data: ids.map((contactId) =>
              consentEventData({ contactId, type: 'OPT_OUT', source: 'bulk' })
            ),
          }),
        ]);
        count += res[0].count;
      });
      return { count, skippedNoChange };
    }
    case 'block':
    case 'unblock': {
      const blocked = opts.action === 'block';
      let count = 0;
      // Chunked so the Meta call is bounded, and so "select all matching" cannot
      // build one unbounded block_users request.
      await forEachIdChunk(where, async (ids) => {
        const res = await prisma.waContact.updateMany({
          where: { id: { in: ids } },
          data: { isBlocked: blocked },
        });
        count += res.count;
        await syncBlockStateToMeta(ids, blocked);
      });
      return { count };
    }
    case 'tag': {
      if (!opts.tag) return { count: 0 };
      // Dedupe: only add to contacts that don't already carry the tag.
      return prisma.waContact.updateMany({
        where: { AND: [where, { NOT: { tags: { has: opts.tag } } }] },
        data: { tags: { push: opts.tag } },
      });
    }
    case 'untag': {
      if (!opts.tag) return { count: 0 };
      // Chunked. `Prisma.join` emits one bind parameter per id, and Postgres
      // caps a statement at 65535 of them — so "select all" over a contact list
      // of that size failed outright with a bind-parameter error, at the point
      // where the operator had already confirmed the action.
      let count = 0;
      await forEachIdChunk({ AND: [where, { tags: { has: opts.tag } }] }, async (ids) => {
        // Prisma has no scalar-list "pull"; array_remove is atomic + a no-op
        // on non-members.
        await prisma.$executeRaw`UPDATE "WaContact" SET tags = array_remove(tags, ${opts.tag}), "updatedAt" = NOW() WHERE id IN (${Prisma.join(ids)})`;
        count += ids.length;
      });
      return { count };
    }
    case 'addSuppression': {
      // Same chunking, same reason: this read every matching phone and passed
      // the lot to a single createMany.
      let count = 0;
      let cursor: string | undefined;
      for (;;) {
        // Explicit `id > cursor`, not Prisma's cursor/skip:1 — see the note on
        // forEachIdChunk. This branch now WRITES `suppressedAt` on the rows it
        // just read, so with the list's suppression filter applied the cursor row
        // stops matching the predicate and the OFFSET 1 would eat the first
        // genuinely-unsuppressed row of every following page.
        const page: Array<{ id: string; phone: string }> = await prisma.waContact.findMany({
          where: cursor ? { AND: [where, { id: { gt: cursor } }] } : where,
          select: { id: true, phone: true },
          orderBy: { id: 'asc' },
          take: BULK_CHUNK,
        });
        if (page.length === 0) break;
        cursor = page[page.length - 1].id;
        const phones = page.map((r) => r.phone).filter((ph) => !ph.startsWith('erased:'));
        if (phones.length) {
          const res = await prisma.waSuppression.createMany({
            data: phones.map((phone) => ({
              phone,
              reason: 'bulk',
              createdBy: opts.performedBy ?? null,
            })),
            skipDuplicates: true,
          });
          count += res.count;
          await markContactsSuppressed(phones, true);
        }
        if (page.length < BULK_CHUNK) break;
      }
      return { count };
    }
    case 'erase': {
      // ORDERED. Without an orderBy Postgres may return any BULK_ERASE_MAX of the
      // matching rows, so "run it again to continue" could keep re-selecting the
      // same already-erased contacts while others were never touched — on the one
      // operation that has to be individually provable.
      const rows = await prisma.waContact.findMany({
        where,
        select: { id: true },
        orderBy: { id: 'asc' },
        take: BULK_ERASE_MAX,
      });
      let count = 0;
      const failed: string[] = [];
      for (const r of rows) {
        try {
          await eraseContactData(r.id);
          count += 1;
        } catch (e) {
          // Per-contact failures used to be swallowed entirely, so a statement
          // timeout inside eraseContactData reported the run as fully successful
          // while that person's data was still there.
          failed.push(r.id);
          logger.warn(`WhatsApp bulk erase failed for contact ${r.id}: ${(e as Error).message}`);
        }
      }
      return { count, ...(failed.length ? { failed } : {}) };
    }
    default:
      return { count: 0 };
  }
}

/**
 * Push a contact's block state to Meta and record what it said.
 *
 * A block used to be a purely local boolean. It was read only on the OUTBOUND
 * side, so "blocked" meant nothing more than "we refuse to reply": the spammer
 * or harasser kept messaging in, every inbound still opened a service
 * conversation, and the auto-reply engine still answered them. Meta's Block
 * Users API is the half that stops the traffic.
 *
 * Applied to EVERY active channel, because Meta scopes a block to a phone
 * number: blocking on the default number alone would leave the customer free to
 * message any other number we have connected.
 *
 * Never throws. The local flag has already been written by the caller and is the
 * gate the send path enforces; a Graph outage must not make "block" fail
 * outright. What Meta said is persisted so the console can show whether the
 * remote half actually took.
 */
async function syncBlockStateToMeta(contactIds: string[], blocked: boolean): Promise<void> {
  if (contactIds.length === 0) return;
  const [contacts, channels] = await Promise.all([
    prisma.waContact.findMany({
      where: { id: { in: contactIds } },
      select: { id: true, phone: true, waId: true },
    }),
    prisma.waChannel.findMany({ where: { isActive: true }, select: { phoneNumberId: true } }),
  ]);
  if (contacts.length === 0 || channels.length === 0) return;

  // Meta keys on the wa_id it sent us; fall back to the stored number for a
  // contact we created ourselves (an import) and have never heard from.
  const waIdByContact = new Map(
    contacts.map((c) => [c.id, (c.waId ?? c.phone).replace(/[^\d]/g, '')])
  );
  const waIds = [...new Set([...waIdByContact.values()].filter(Boolean))];
  if (waIds.length === 0) return;

  const applied = new Set<string>();
  const failures = new Map<string, string>();
  let callError: string | undefined;

  for (const channel of channels) {
    const result = await setUsersBlocked(waIds, blocked, channel.phoneNumberId).catch(
      (e: unknown) => ({
        applied: [],
        failed: [],
        error: e instanceof Error ? e.message : 'block sync failed',
      })
    );
    if (result.error) callError = result.error;
    for (const user of result.applied) applied.add(user);
    for (const f of result.failed) failures.set(f.user, f.reason);
  }

  const syncedAt = blocked ? new Date() : null;
  await Promise.all(
    contacts.map((c) => {
      const waId = waIdByContact.get(c.id) ?? '';
      const error = failures.get(waId) ?? (applied.has(waId) ? null : (callError ?? null));
      return prisma.waContact
        .update({
          where: { id: c.id },
          data: {
            blockSyncedAt: error ? null : syncedAt,
            blockSyncError: error,
          },
        })
        .catch(() => {
          /* bookkeeping must never break the block itself */
        });
    })
  );

  if (callError || failures.size > 0) {
    logger.warn(
      `WhatsApp ${blocked ? 'block' : 'unblock'} not fully applied at Meta: ` +
        `${failures.size} refused, ${callError ?? 'no call error'}`
    );
  }
}

export async function getContact(id: string) {
  const c = await prisma.waContact.findUnique({ where: { id } });
  return c ? { ...c, consentEvidence: decryptJson(c.consentEvidence) } : c;
}

export async function updateContact(
  id: string,
  data: { name?: string | null; tags?: string[]; isBlocked?: boolean; optInStatus?: WaOptInStatus }
) {
  const patch: Prisma.WaContactUpdateInput = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.tags !== undefined) patch.tags = { set: data.tags };
  if (data.isBlocked !== undefined) patch.isBlocked = data.isBlocked;
  let consentEvent: WaConsentEventType | null = null;
  if (data.optInStatus !== undefined) {
    patch.optInStatus = data.optInStatus;
    if (data.optInStatus === 'OPTED_IN') {
      patch.optInAt = new Date();
      patch.optInSource = 'manual';
      // This null is the destructive write M64 is about: the row-level "Opt in"
      // button is the ONLY re-opt-in path left, and it used to delete the
      // contact's opt-out date outright, retroactively removing them from every
      // past opt-out report.
      patch.optOutAt = null;
      patch.optOutSource = null;
      consentEvent = 'OPT_IN';
    } else if (data.optInStatus === 'OPTED_OUT') {
      patch.optOutAt = new Date();
      patch.optOutSource = 'manual';
      consentEvent = 'OPT_OUT';
    }
  }
  const updated = consentEvent
    ? (
        await prisma.$transaction([
          prisma.waContact.update({ where: { id }, data: patch }),
          prisma.waConsentEvent.create({
            data: consentEventData({ contactId: id, type: consentEvent, source: 'manual' }),
          }),
        ])
      )[0]
    : await prisma.waContact.update({ where: { id }, data: patch });

  // The single-contact block toggle goes to Meta too, not just to our column.
  // Without this the drawer's "Block" switch and the bulk action meant two
  // different things: one stopped the customer messaging in, the other only
  // stopped us replying.
  if (data.isBlocked !== undefined) await syncBlockStateToMeta([id], data.isBlocked);
  return updated;
}

export interface ImportProgress {
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  skippedOptedOut: number;
  duplicates: number;
}

export type ImportResult = ImportProgress & { total: number };

/**
 * Rows per database round trip.
 *
 * The import used to be a `for` loop doing a findUnique and then a create or an
 * update for every single row: 10,000 sequential round trips for the 5000 rows
 * the API advertises, which at any realistic Postgres latency cannot finish
 * inside a request budget (and used to be attempted inside one). A chunk is now
 * one findMany plus one transaction, so the same file costs ~50 round trips.
 *
 * 200 keeps each transaction short — a long one holds row locks that block the
 * inbound webhook worker from touching the same contacts.
 */
const IMPORT_CHUNK = 200;

/**
 * One row of an uploaded contact file.
 *
 * `attributes` is every column that is NOT phone/name/tags — city, order
 * number, appointment date, plan tier. The column existed and was documented
 * "arbitrary fields for personalization", but nothing could write it, so a
 * template variable like `{{attr.city}}` had nowhere to come from and campaigns
 * could only personalise on name and phone.
 */
export interface ImportContactRow {
  phone: string;
  name?: string;
  tags?: string[];
  attributes?: Record<string, string>;
}

/**
 * Collapse repeated phone numbers within one file.
 *
 * The old row-at-a-time loop handled duplicates by accident: the second
 * occurrence simply found the row the first had created. Batched, both rows
 * would be created at once and collide on the unique phone index, so the file
 * has to be deduplicated up front. Tags union and the last non-empty name wins,
 * which is what the per-row loop effectively did.
 */
function dedupeImportRows(rows: ImportContactRow[]): {
  unique: ImportContactRow[];
  skipped: number;
  duplicates: number;
} {
  const byPhone = new Map<string, ImportContactRow>();
  let skipped = 0;
  let duplicates = 0;
  for (const row of rows) {
    const phone = normalizeWaPhone(row.phone);
    if (phone.replace(/[^\d]/g, '').length < 8) {
      skipped++;
      continue;
    }
    const existing = byPhone.get(phone);
    if (!existing) {
      byPhone.set(phone, { phone, name: row.name, tags: row.tags, attributes: row.attributes });
      continue;
    }
    duplicates++;
    byPhone.set(phone, {
      phone,
      name: row.name || existing.name,
      tags: [...new Set([...(existing.tags ?? []), ...(row.tags ?? [])])],
      // Later rows win per KEY, not per row: two lines for the same person, one
      // carrying a city and the other an order number, keep both.
      ...(existing.attributes || row.attributes
        ? { attributes: { ...existing.attributes, ...row.attributes } }
        : {}),
    });
  }
  return { unique: [...byPhone.values()], skipped, duplicates };
}

/**
 * Bulk import contacts (CSV-driven). Upserts by phone; optionally marks opted-in.
 *
 * Chunked and batched (see IMPORT_CHUNK). `onProgress` is awaited after each
 * chunk so the caller — the import worker — can publish a running count to the
 * job row the operator's modal polls.
 */
export async function importContacts(
  rows: ImportContactRow[],
  optIn: boolean,
  /**
   * Replace an existing contact's tags instead of merging into them.
   *
   * Merge is the default because the previous `{ set: row.tags }` behaviour lost
   * data silently: importing a "mumbai-leads" list wiped the "vip" and
   * "support" tags every one of those contacts already carried, with nothing in
   * the UI saying it would happen. Replacing is still occasionally what an
   * operator wants — but it has to be asked for.
   */
  replaceTags = false,
  onProgress?: (progress: ImportProgress) => void | Promise<void>
): Promise<ImportResult> {
  const { unique, skipped: invalid, duplicates } = dedupeImportRows(rows);
  const progress: ImportProgress = {
    processed: 0,
    created: 0,
    updated: 0,
    skipped: invalid,
    skippedOptedOut: 0,
    duplicates,
  };

  for (let offset = 0; offset < unique.length; offset += IMPORT_CHUNK) {
    const chunk = unique.slice(offset, offset + IMPORT_CHUNK);
    const now = new Date();
    // Consent provenance is recorded for every imported row, regardless of the
    // opt-in flag, so we can always evidence where/when the contact entered.
    const consentEvidence: Prisma.InputJsonValue = encryptJson({
      source: 'import',
      at: now.toISOString(),
      optIn,
    });
    const optInData = optIn
      ? {
          optInStatus: 'OPTED_IN' as WaOptInStatus,
          optInAt: now,
          optInSource: 'import',
          consentEvidence,
        }
      : { consentEvidence };

    const chunkPhones = chunk.map((r) => r.phone);
    const [existing, alreadySuppressed] = await Promise.all([
      prisma.waContact.findMany({
        where: { phone: { in: chunkPhones } },
        select: { id: true, phone: true, optInStatus: true, tags: true, attributes: true },
      }),
      // A supplied DNC list is routinely loaded BEFORE the contacts it covers.
      // Without this the imported rows would show as reachable until somebody
      // suppressed them a second time.
      suppressedPhonesIn(chunkPhones),
    ]);
    const byPhone = new Map(existing.map((c) => [c.phone, c]));

    const writes: Prisma.PrismaPromise<unknown>[] = [];
    /** Contacts this chunk asserts consent for, so events can name them. */
    const optInContactIds: string[] = [];
    const toCreate: Prisma.WaContactCreateManyInput[] = [];

    for (const row of chunk) {
      const match = byPhone.get(row.phone);
      if (!match) {
        toCreate.push({
          phone: row.phone,
          name: row.name ?? null,
          tags: row.tags ?? [],
          ...(alreadySuppressed.has(row.phone) ? { suppressedAt: now } : {}),
          ...(row.attributes && Object.keys(row.attributes).length
            ? { attributes: row.attributes }
            : {}),
          ...optInData,
        });
        continue;
      }
      // CONSENT IS NOT UPGRADED BY RE-IMPORT.
      //
      // `optInData` used to be spread unconditionally, so re-uploading a master
      // list — a routine monthly action, with the UI checkbox defaulting to ON —
      // flipped every customer who had replied STOP back to OPTED_IN and started
      // marketing to them again. `optOutAt` was left populated, so the row read
      // "opted out at T" while being sent marketing. Opt-out writes no
      // WaSuppression row either, so nothing downstream caught it: the campaign
      // worker's consent gate reads `optInStatus` and would now pass.
      //
      // An explicit opt-out is a decision by the customer; an import is an
      // assertion by the operator, and it does not outrank one. Their consent
      // record is left completely untouched (including consentEvidence, which is
      // where the opt-out provenance lives) — only name and tags are refreshed.
      const optedOut = match.optInStatus === 'OPTED_OUT';
      if (optedOut) progress.skippedOptedOut++;
      writes.push(
        prisma.waContact.update({
          where: { id: match.id },
          data: {
            ...(row.name ? { name: row.name } : {}),
            ...(row.tags?.length
              ? {
                  tags: {
                    set: replaceTags ? row.tags : [...new Set([...match.tags, ...row.tags])],
                  },
                }
              : {}),
            // MERGED, never replaced: a "mumbai-leads" file carrying only a city
            // column must not erase the order number a previous import wrote.
            // Only the keys present in this file move.
            ...(row.attributes && Object.keys(row.attributes).length
              ? {
                  attributes: {
                    ...((match.attributes as Prisma.JsonObject | null) ?? {}),
                    ...row.attributes,
                  } as Prisma.InputJsonValue,
                }
              : {}),
            ...(optedOut ? {} : optInData),
          },
        })
      );
      if (optIn && !optedOut) optInContactIds.push(match.id);
      progress.updated++;
    }

    // createManyAndReturn, not createMany: an import that asserts consent is a
    // consent transition like any other and has to be reconstructable from the
    // event log, which needs the ids of the rows just written.
    if (toCreate.length > 0) {
      const inserted = await prisma.waContact.createManyAndReturn({
        data: toCreate,
        select: { id: true },
      });
      progress.created += inserted.length;
      if (optIn) optInContactIds.push(...inserted.map((c) => c.id));
    }
    if (optInContactIds.length > 0) {
      writes.push(
        prisma.waConsentEvent.createMany({
          data: optInContactIds.map((contactId) =>
            consentEventData({ contactId, type: 'OPT_IN', source: 'import' })
          ),
        })
      );
    }
    if (writes.length > 0) await prisma.$transaction(writes);

    progress.processed += chunk.length;
    if (onProgress) await onProgress({ ...progress });
  }

  if (progress.skippedOptedOut > 0) {
    logger.warn(
      `WhatsApp contact import: ${progress.skippedOptedOut} row(s) matched contacts who had ` +
        'explicitly opted out — their consent status was preserved, not upgraded'
    );
  }
  return { ...progress, total: rows.length };
}

/**
 * DPDP data-access (portability) bundle for a single contact — the contact row,
 * its conversations, every WaMessage, and campaign-recipient rows. Returned as a
 * downloadable JSON blob for a data-subject access request. Returns null when the
 * contact does not exist.
 */
/** Rows read per page of a streamed DSAR bundle. Deliberately smaller than the
 * CSV export's page: a DSAR page carries whole message rows, not flat columns. */
const DSAR_PAGE_SIZE = 500;
/** Media rows deleted from R2 per page during an erasure. */
const ERASE_MEDIA_PAGE_SIZE = 500;

/**
 * One section of the bundle, read in pages so no single query has to hold a
 * contact's entire history.
 *
 * Keyset by VALUE on `(createdAt, id)` rather than Prisma's `cursor` + `skip`:
 * the cursor row is not guaranteed to still satisfy the predicate on the next
 * page (the erasure path scrubs rows while an export could be running), and a
 * stale cursor silently drops a row per page.
 */
const keysetAfter = (after: { at: Date; id: string } | null) =>
  after
    ? { OR: [{ createdAt: { gt: after.at } }, { createdAt: after.at, id: { gt: after.id } }] }
    : {};

async function* pageByCreatedAt<T extends { id: string; createdAt: Date }>(
  read: (keyset: ReturnType<typeof keysetAfter>, take: number) => Promise<T[]>,
  pageSize = DSAR_PAGE_SIZE
): AsyncGenerator<T[]> {
  let after: { at: Date; id: string } | null = null;
  for (;;) {
    const page = await read(keysetAfter(after), pageSize);
    if (page.length === 0) return;
    yield page;
    if (page.length < pageSize) return;
    const last = page[page.length - 1];
    after = { at: last.createdAt, id: last.id };
  }
}

/**
 * DPDP data-access (portability) bundle for a single contact — the contact row,
 * its conversations, every WaMessage, and campaign-recipient rows. Returns null
 * when the contact does not exist.
 *
 * Returned as a header plus a list of PAGED sections rather than one object: a
 * heavy contact's message history is the largest thing this system can be asked
 * to serialise, and building it as a single array put every row (payload jsonb
 * included) in the heap at once and spent the request's whole 30s budget before
 * the subject received a byte. The caller writes each page out as it arrives.
 */
export async function exportContactData(contactId: string) {
  const contact = await prisma.waContact.findUnique({ where: { id: contactId } });
  if (!contact) return null;

  // Conversation ids are needed up front for the two sections keyed on them.
  // There is one conversation per (channel, contact), so this list is bounded by
  // the number of connected numbers — unlike everything below it.
  const conversations = await prisma.waConversation.findMany({
    where: { contactId },
    orderBy: { createdAt: 'asc' },
  });
  const convIds = conversations.map((c) => c.id);

  const sections: Array<{ key: string; pages: AsyncGenerator<unknown[]> }> = [
    {
      key: 'messages',
      pages: pageByCreatedAt((keyset, take) =>
        prisma.waMessage.findMany({
          where: { contactId, ...keyset },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take,
        })
      ),
    },
    {
      key: 'campaignRecipients',
      pages: pageByCreatedAt((keyset, take) =>
        prisma.waCampaignRecipient.findMany({
          where: { contactId, ...keyset },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take,
        })
      ),
    },
    // Both of these are scrubbed by eraseContactData, so a portability bundle
    // that omitted them promised less than the erasure deleted — the two halves
    // of the same right disagreed about what data is held.
    {
      key: 'linkClicks',
      pages: pageByCreatedAt((keyset, take) =>
        prisma.waLinkClick.findMany({
          where: { contactId, ...keyset },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take,
        })
      ),
    },
    {
      key: 'conversions',
      pages: pageByCreatedAt((keyset, take) =>
        prisma.waConversion.findMany({
          where: { contactId, ...keyset },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take,
        })
      ),
    },
    {
      key: 'consentEvents',
      pages: (async function* () {
        for await (const page of pageByCreatedAt((keyset, take) =>
          prisma.waConsentEvent.findMany({
            where: { contactId, ...keyset },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            take,
          })
        )) {
          // The consent history is the subject's own record of when they joined
          // and left; decrypted like consentEvidence below so the bundle is
          // readable rather than a column of ciphertext.
          yield page.map((e) => ({ ...e, evidence: decryptJson(e.evidence) }));
        }
      })(),
    },
    {
      key: 'notes',
      pages: pageByCreatedAt((keyset, take) =>
        convIds.length
          ? prisma.waConversationNote.findMany({
              where: { conversationId: { in: convIds }, ...keyset },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              take,
            })
          : Promise.resolve([])
      ),
    },
    {
      key: 'scheduledMessages',
      pages: pageByCreatedAt((keyset, take) =>
        convIds.length
          ? prisma.waScheduledMessage.findMany({
              where: { conversationId: { in: convIds }, ...keyset },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              take,
            })
          : Promise.resolve([])
      ),
    },
  ];

  return {
    // Every other read path in this file decrypts consentEvidence; this one did
    // not, so the DSAR download handed the subject an `iv:tag:ciphertext` blob
    // exactly where their consent record should have been.
    contact: { ...contact, consentEvidence: decryptJson(contact.consentEvidence) },
    conversations,
    sections,
  };
}

/**
 * DPDP right-to-erasure for a single contact. Anonymizes + deletes PII but keeps
 * a tombstone row so audit / billing history survives:
 *  - best-effort deletes every archived media object from R2,
 *  - scrubs message bodies/payloads/media references,
 *  - clears conversation last-message previews,
 *  - anonymizes the contact row and permanently blocks re-contact (the phone is
 *    rewritten to a non-dialable `erased:<id>` sentinel so the @unique still holds).
 * Returns a summary of what was scrubbed.
 */
export async function eraseContactData(
  contactId: string
): Promise<{ messagesScrubbed: number; mediaDeleted: number; eventsDeleted: number }> {
  // Capture the identifiers BEFORE (d) rewrites `phone` to the erased sentinel —
  // they are what the raw webhook payloads are matched on further down.
  const before = await prisma.waContact.findUnique({
    where: { id: contactId },
    select: { phone: true, waId: true },
  });

  // (a) Best-effort delete every archived media object from R2. `mediaUrl` holds
  // the R2 object key (see archiveInboundMedia / streamMedia).
  //
  // Paged: this used to read every media row for the contact in one findMany and
  // then delete them one at a time, so a contact who had sent thousands of files
  // put the whole list in memory before the first object was removed — on the one
  // request path that must not fall over half-applied, because a partial erasure
  // leaves the customer's photos in the bucket with nothing left pointing at them
  // (the row is scrubbed below either way, which is what makes the object
  // unreachable by every other deleter).
  let mediaDeleted = 0;
  let mediaAfter: string | null = null;
  for (;;) {
    const mediaRows: Array<{ id: string; mediaUrl: string | null }> =
      await prisma.waMessage.findMany({
        where: {
          contactId,
          mediaUrl: { not: null },
          ...(mediaAfter ? { id: { gt: mediaAfter } } : {}),
        },
        select: { id: true, mediaUrl: true },
        // Keyed on the primary key, not createdAt: the scrub below clears
        // `mediaUrl`, so a time-ordered walk would be paging a predicate its own
        // side effects are emptying underneath it.
        orderBy: { id: 'asc' },
        take: ERASE_MEDIA_PAGE_SIZE,
      });
    if (mediaRows.length === 0) break;
    for (const row of mediaRows) {
      if (!row.mediaUrl) continue;
      try {
        await deleteFileFromR2(row.mediaUrl);
        mediaDeleted++;
      } catch {
        // R2 not configured or object already gone — keep scrubbing the DB.
      }
    }
    if (mediaRows.length < ERASE_MEDIA_PAGE_SIZE) break;
    mediaAfter = mediaRows[mediaRows.length - 1].id;
  }

  // (b) Scrub message PII (body, payload, media references).
  const scrubbed = await prisma.waMessage.updateMany({
    where: { contactId },
    data: {
      text: null,
      payload: Prisma.JsonNull,
      mediaUrl: null,
      mediaId: null,
    },
  });

  // (c) Clear the conversation fields that copy something about this person:
  // the last-message preview, and `identityHash` — Meta's hash of their WhatsApp
  // identity key, which is an identifier for the same human under a different
  // name and has no purpose once the thread is a tombstone.
  await prisma.waConversation.updateMany({
    where: { contactId },
    data: { lastMessagePreview: null, identityHash: null },
  });

  // (d) Anonymize the contact tombstone + block any future contact. Rewriting the
  // phone to a `erased:<id>` sentinel keeps the @unique constraint satisfied and
  // guarantees the original number can never be matched/re-contacted again.
  await prisma.waContact.update({
    where: { id: contactId },
    data: {
      name: null,
      waId: null,
      attributes: Prisma.JsonNull,
      consentEvidence: Prisma.JsonNull,
      optInStatus: 'OPTED_OUT',
      optOutAt: new Date(),
      optOutSource: 'erasure',
      ctwaSourceId: null,
      ctwaSourceType: null,
      ctwaHeadline: null,
      ctwaClid: null,
      isBlocked: true,
      phone: `erased:${contactId}`,
    },
  });

  // (d2) Consent history. The EVENTS stay — they are the audit trail that proves
  // the erasure happened and keep the aggregate opt-out trend honest — but their
  // `evidence` blobs hold the customer's own message text and must go with the
  // rest of the PII. The suppression itself is appended as a normal event.
  await prisma.waConsentEvent.updateMany({
    where: { contactId },
    data: { evidence: Prisma.JsonNull },
  });
  await prisma.waConsentEvent.create({
    data: consentEventData({ contactId, type: 'OPT_OUT', source: 'erasure' }),
  });

  // (e) The raw webhook envelopes. WaWebhookEvent.payload holds a verbatim
  // second copy of everything this person sent — their number, their message
  // text, media ids — and was only ever removed by the daily prune on a fixed
  // 14-day TTL. An erasure request that leaves the data readable for another
  // fortnight is not an erasure. REDACT, do not DELETE.
  //
  // Meta batches many senders into a single webhook POST, and the whole envelope
  // is persisted as ONE WaWebhookEvent row. Deleting every row whose payload
  // merely CONTAINS this person's digits therefore destroyed unrelated customers'
  // inbound messages as collateral — rows that may not have been processed yet,
  // since the recovery cron re-enqueues anything with a null processedAt.
  //
  // Overwriting the digits in place removes exactly this person from the envelope
  // and leaves every other sender in that batch intact. `replace()` on the JSON
  // text is deliberate: the number appears in several places inside the envelope
  // (contacts[].wa_id, messages[].from, statuses[].recipient_id) and a targeted
  // path update would miss whichever shape a given event type used.
  //
  // FOUND by the indexed `phones` column, not by `payload::text LIKE '%digits%'`.
  // That predicate cast a jsonb column to text for every row of the fastest-
  // growing table in the schema and then matched it with a leading wildcard, so
  // on a populated database it did not merely run slowly — it hit the 30s
  // statement timeout and threw, after the operator had already been told the
  // erasure succeeded. `phones` is written at ingest (utils/webhook-phone-index)
  // and carries a GIN index, so this is now a containment lookup.
  //
  // The number is stripped from `phones` in the same statement: that column is
  // itself a copy of the identifier being erased, and leaving it behind would
  // keep the person findable by exactly the key we just built.
  let eventsDeleted = 0;
  for (const needle of [before?.phone, before?.waId].filter(Boolean) as string[]) {
    // Meta sends bare digits (no +), so match on the digits.
    const digits = needle.replace(/[^\d]/g, '');
    if (!digits) continue;
    // NOT swallowed. A silent catch here reported the erasure as complete when the
    // statement had actually hit the 30s timeout, so the operator told a data
    // subject their data was gone while it was still readable.
    const res = await prisma.$executeRaw`
      UPDATE "WaWebhookEvent"
         SET "payload" = replace("payload"::text, ${digits}, '[erased]')::jsonb,
             "phones" = array_remove("phones", ${digits})
       WHERE "phones" && ARRAY[${digits}]::text[]
    `;
    eventsDeleted += Number(res) || 0;
  }

  // (f) Operator notes about this person — free text, indefinitely retained.
  await prisma.waConversationNote
    .deleteMany({ where: { conversation: { contactId } } })
    .catch(() => ({ count: 0 }));

  // (g) Click telemetry: keep the click (it is campaign analytics) but drop the
  // identifiers attached to it.
  await prisma.waLinkClick
    .updateMany({ where: { contactId }, data: { ip: null, userAgent: null } })
    .catch(() => ({ count: 0 }));

  // (g2) Campaign personalisation. `variables` holds the RESOLVED values —
  // literally the contact’s name and phone, copied per recipient at materialize
  // time (resolveVars in whatsapp-campaign.service.ts). Erasure scrubbed messages,
  // conversations and notes but walked straight past this, so the identifiers it
  // was supposed to destroy survived in every campaign the contact was ever in.
  await prisma.waCampaignRecipient
    .updateMany({ where: { contactId }, data: { variables: Prisma.JsonNull } })
    .catch(() => ({ count: 0 }));

  // (g3) Queued sends to a now-tombstoned number. Cancelling is part of the
  // erasure, not housekeeping: leaving them PENDING means a scheduled message
  // fires at a person who asked to be forgotten.
  // The conversations are resolved first because the scrub targets PENDING rows
  // only — the relation cascades on DELETE, which erasure deliberately is not.
  // They survive erasure (step (c) only clears their preview text), so this
  // lookup is reliable at this point.
  const convRows = await prisma.waConversation
    .findMany({ where: { contactId }, select: { id: true } })
    .catch(() => [] as Array<{ id: string }>);
  if (convRows.length > 0) {
    await prisma.waScheduledMessage
      .updateMany({
        where: {
          conversationId: { in: convRows.map((c) => c.id) },
          status: 'PENDING',
        },
        // bodyParams holds the resolved personalisation for a scheduled TEMPLATE
        // send - the contact's own name and phone - so it is scrubbed alongside
        // the free text.
        data: { text: null, bodyParams: Prisma.JsonNull, status: 'CANCELLED' },
      })
      .catch(() => ({ count: 0 }));
  }
  // (h) Webhook delivery payloads that carried this contact's phone/text out to
  // a subscriber. The retention prune drops these on a TTL; erasure cannot wait
  // for it.
  for (const needle of [before?.phone, before?.waId].filter(Boolean) as string[]) {
    // Same treatment as the inbound envelopes above: found by the indexed
    // `phones` column, redacted in place rather than deleted so a delivery
    // payload that referenced several contacts does not lose the others, and a
    // failure propagates instead of reporting an erasure that never happened.
    // Matched on digits rather than the stored '+' form, because that is what
    // `phones` holds and a subscriber payload may carry the number either way.
    const digits = needle.replace(/[^\d]/g, '');
    if (!digits) continue;
    await prisma.$executeRaw`
      UPDATE "WebhookDelivery"
         SET "payload" = replace("payload"::text, ${digits}, '[erased]')::jsonb,
             "phones" = array_remove("phones", ${digits})
       WHERE "phones" && ARRAY[${digits}]::text[]
    `;
  }

  return { messagesScrubbed: scrubbed.count, mediaDeleted, eventsDeleted };
}

/**
 * Remember that Meta deliberately refused a marketing message to this contact.
 *
 * Called from BOTH failure paths -- the synchronous send result and the async
 * status webhook -- because a 131049 can arrive either way, and a refusal that
 * only one path recorded would leave the cooldown half-enforced.
 */
/* ── Duplicate detection + merge ────────────────────────────────────────── */

/** Duplicate groups returned per report — bounded so the page stays usable. */
const DUPLICATE_GROUP_LIMIT = 200;

/** One contact inside a possible-duplicate group. */
export interface WaDuplicateContact {
  id: string;
  phone: string;
  name: string | null;
  optInStatus: WaOptInStatus;
  tags: string[];
  lastInboundAt: Date | null;
  createdAt: Date;
  /** Messages held by this row — the operator's cue for which one to keep. */
  messageCount: number;
}

/** Contacts that look like the same person, keyed on their last nine digits. */
export interface WaDuplicateGroup {
  /** The trailing nine digits every member shares. */
  key: string;
  contacts: WaDuplicateContact[];
}

/**
 * Contacts that are probably the same human, grouped on the last nine digits of
 * their number.
 *
 * `phone` is the sole identity here, and the normalisation rules themselves
 * manufacture near-duplicates: a number stored before DEFAULT_COUNTRY_CODE
 * prefixing existed, or an inbound `waId` that differs from the stored `phone`,
 * produce two rows that each hold real conversation history and each carry their
 * own consent state. Nothing surfaced that at all, so an opt-out honoured on one
 * row was ignored on the other with no report able to show it.
 *
 * Nine digits is the longest suffix every national format shares, so it matches
 * "+919876543210" with "+9876543210" without collapsing genuinely different
 * numbers that merely share a shorter tail.
 *
 * SCALE: this scans WaContact twice (once to key it, once to pick the groups)
 * and there is no functional index on the expression, so it is an operator-run
 * report rather than something to poll. The group count is capped, so the
 * RESULT is bounded even when the scan is not.
 */
export async function findDuplicateContacts(
  limit = DUPLICATE_GROUP_LIMIT
): Promise<WaDuplicateGroup[]> {
  const groupLimit = Math.min(1000, Math.max(1, limit));
  const rows = await prisma.$queryRaw<
    Array<{
      key: string;
      id: string;
      phone: string;
      name: string | null;
      optInStatus: WaOptInStatus;
      tags: string[];
      lastInboundAt: Date | null;
      createdAt: Date;
    }>
  >(Prisma.sql`
    WITH keyed AS (
      SELECT
        right(regexp_replace("phone", '[^0-9]', '', 'g'), 9) AS key,
        "id", "phone", "name", "optInStatus", "tags", "lastInboundAt", "createdAt"
      FROM "WaContact"
      -- Erasure and merge tombstones are not people; both rewrite the phone to a
      -- sentinel that would otherwise key into its own bogus group.
      WHERE "mergedIntoId" IS NULL
        AND "phone" NOT LIKE 'erased:%'
        AND "phone" NOT LIKE 'merged:%'
        AND length(regexp_replace("phone", '[^0-9]', '', 'g')) >= 9
    ),
    dupes AS (
      SELECT key FROM keyed GROUP BY key HAVING count(*) > 1 ORDER BY key LIMIT ${groupLimit}
    )
    SELECT k.* FROM keyed k JOIN dupes d ON d.key = k.key
    ORDER BY k.key ASC, k."createdAt" ASC
  `);
  if (rows.length === 0) return [];

  // One grouped count for every candidate rather than a count per row: a report
  // of 200 groups would otherwise be 400+ sequential round-trips.
  const counts = await prisma.waMessage.groupBy({
    by: ['contactId'],
    where: { contactId: { in: rows.map((r) => r.id) } },
    _count: { _all: true },
  });
  const countById = new Map(counts.map((c) => [c.contactId, c._count._all]));

  const groups = new Map<string, WaDuplicateGroup>();
  for (const row of rows) {
    const group = groups.get(row.key) ?? { key: row.key, contacts: [] };
    group.contacts.push({
      id: row.id,
      phone: row.phone,
      name: row.name,
      optInStatus: row.optInStatus,
      tags: row.tags,
      lastInboundAt: row.lastInboundAt,
      createdAt: row.createdAt,
      messageCount: countById.get(row.id) ?? 0,
    });
    groups.set(row.key, group);
  }
  return [...groups.values()];
}

/** What a merge moved, so the console can say more than "done". */
export interface WaMergeResult {
  survivorId: string;
  mergedId: string;
  conversationsMoved: number;
  conversationsFolded: number;
  messagesMoved: number;
  campaignRecipientsMoved: number;
  campaignRecipientsDropped: number;
  /** True when the survivor came out OPTED_OUT because the loser was. */
  consentTightened: boolean;
}

/** The later of two nullable timestamps. */
function laterOf(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

/** The earlier of two nullable timestamps. */
function earlierOf(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() <= b.getTime() ? a : b;
}

/**
 * Fold one contact into another: the survivor ends up holding every
 * conversation, message, recipient row, click, conversion and consent event, and
 * the loser becomes a tombstone pointing at it.
 *
 * CONSENT IS TIGHTENED, NEVER RELAXED. A person split across two rows can be
 * OPTED_OUT on one and OPTED_IN on the other, which is exactly how an opt-out
 * request gets honoured for one number and ignored for the other — so an opt-out
 * on either side wins, and a do-not-contact entry on either phone is applied to
 * the survivor's phone too. The transition is written to the append-only consent
 * log when it changes anything, so the opt-out trend stays honest.
 *
 * NOT one transaction. A contact with years of history moves more rows than a 5s
 * interactive transaction can carry, so the steps run in an order that is safe to
 * interrupt: everything is REPOINTED first and the loser is tombstoned LAST,
 * which means a crash halfway leaves both rows present and the same call finishes
 * the job when it is retried.
 */
export async function mergeContacts(
  survivorId: string,
  loserId: string,
  performedBy?: string | null
): Promise<WaMergeResult> {
  if (survivorId === loserId) {
    throw new AppError('A contact cannot be merged into itself', 400, 'WA_MERGE_SAME_CONTACT');
  }
  const [survivor, loser] = await Promise.all([
    prisma.waContact.findUnique({ where: { id: survivorId } }),
    prisma.waContact.findUnique({ where: { id: loserId } }),
  ]);
  if (!survivor || !loser) throw new AppError('Contact not found', 404, 'WA_CONTACT_NOT_FOUND');
  for (const c of [survivor, loser]) {
    if (c.mergedIntoId) {
      throw new AppError(
        'That contact has already been merged into another one',
        409,
        'WA_CONTACT_ALREADY_MERGED'
      );
    }
    if (c.phone.startsWith('erased:')) {
      throw new AppError(
        'An erased contact cannot be merged — its data has already been destroyed',
        409,
        'WA_CONTACT_ERASED'
      );
    }
  }

  const now = new Date();

  // (a) Conversations. WaConversation is @@unique([channelId, contactId]), so a
  // thread can only be repointed when the survivor has none on that number;
  // where both rows talked to us on the SAME number the two threads are folded
  // into one instead, which is the whole point of the merge.
  const [survivorConvs, loserConvs] = await Promise.all([
    prisma.waConversation.findMany({
      where: { contactId: survivorId },
      select: { id: true, channelId: true },
    }),
    prisma.waConversation.findMany({
      where: { contactId: loserId },
      select: { id: true, channelId: true },
    }),
  ]);
  const survivorByChannel = new Map(survivorConvs.map((c) => [c.channelId, c.id]));
  let conversationsMoved = 0;
  let conversationsFolded = 0;
  const foldedInto = new Set<string>();
  for (const conv of loserConvs) {
    const target = survivorByChannel.get(conv.channelId);
    if (!target) {
      await prisma.waConversation.update({
        where: { id: conv.id },
        data: { contactId: survivorId },
      });
      survivorByChannel.set(conv.channelId, conv.id);
      conversationsMoved += 1;
      continue;
    }
    // Move everything hanging off the thread BEFORE deleting it: WaMessage,
    // WaConversationNote and WaScheduledMessage all cascade from WaConversation,
    // so deleting first would destroy the history this merge exists to preserve.
    await prisma.waMessage.updateMany({
      where: { conversationId: conv.id },
      data: { conversationId: target, contactId: survivorId },
    });
    await prisma.waConversationNote.updateMany({
      where: { conversationId: conv.id },
      data: { conversationId: target },
    });
    await prisma.waScheduledMessage.updateMany({
      where: { conversationId: conv.id },
      data: { conversationId: target },
    });
    await prisma.waConversation.delete({ where: { id: conv.id } });
    foldedInto.add(target);
    conversationsFolded += 1;
  }

  // The surviving thread's denormalised preview now describes the wrong set of
  // messages. Recomputed from the messages themselves rather than left stale:
  // the inbox sorts on lastMessageAt, so a folded thread would otherwise sit at
  // the wrong place in the queue showing a preview from before the merge.
  for (const conversationId of foldedInto) {
    const last = await prisma.waMessage.findFirst({
      where: { conversationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, text: true },
    });
    await prisma.waConversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: last?.createdAt ?? null,
        lastMessagePreview: last?.text ? last.text.slice(0, 200) : null,
      },
    });
  }

  // (b) Everything else keyed on the contact. The blanket message pass catches
  // the rows on threads that were merely REPOINTED above, whose contactId the
  // conversation move does not touch.
  const messagesMoved = (
    await prisma.waMessage.updateMany({
      where: { contactId: loserId },
      data: { contactId: survivorId },
    })
  ).count;

  // WaCampaignRecipient is @@unique([campaignId, contactId]): where both rows
  // were in the same campaign the survivor's row is authoritative (it holds the
  // wamid the status webhooks reconcile against) and the loser's is dropped.
  const [loserRecipients, survivorRecipients] = await Promise.all([
    prisma.waCampaignRecipient.findMany({
      where: { contactId: loserId },
      select: { id: true, campaignId: true },
    }),
    prisma.waCampaignRecipient.findMany({
      where: { contactId: survivorId },
      select: { campaignId: true },
    }),
  ]);
  const survivorCampaigns = new Set(survivorRecipients.map((r) => r.campaignId));
  const movableIds = loserRecipients
    .filter((r) => !survivorCampaigns.has(r.campaignId))
    .map((r) => r.id);
  const droppableIds = loserRecipients
    .filter((r) => survivorCampaigns.has(r.campaignId))
    .map((r) => r.id);
  if (movableIds.length) {
    await prisma.waCampaignRecipient.updateMany({
      where: { id: { in: movableIds } },
      data: { contactId: survivorId },
    });
  }
  if (droppableIds.length) {
    await prisma.waCampaignRecipient.deleteMany({ where: { id: { in: droppableIds } } });
  }

  await prisma.waLinkClick.updateMany({
    where: { contactId: loserId },
    data: { contactId: survivorId },
  });
  await prisma.waConversion.updateMany({
    where: { contactId: loserId },
    data: { contactId: survivorId },
  });
  await prisma.waConsentEvent.updateMany({
    where: { contactId: loserId },
    data: { contactId: survivorId },
  });

  // (c) The survivor's own columns. Most restrictive consent, latest activity,
  // union of tags, and both evidence records kept.
  const optInStatus: WaOptInStatus =
    survivor.optInStatus === 'OPTED_OUT' || loser.optInStatus === 'OPTED_OUT'
      ? 'OPTED_OUT'
      : survivor.optInStatus === 'OPTED_IN' || loser.optInStatus === 'OPTED_IN'
        ? 'OPTED_IN'
        : 'UNKNOWN';
  const consentTightened = optInStatus === 'OPTED_OUT' && survivor.optInStatus !== 'OPTED_OUT';
  const survivorEvidence = decryptJson(survivor.consentEvidence);
  const loserEvidence = decryptJson(loser.consentEvidence);
  const evidence = encryptJson({
    ...(survivorEvidence && typeof survivorEvidence === 'object' && !Array.isArray(survivorEvidence)
      ? (survivorEvidence as Record<string, unknown>)
      : { original: survivorEvidence ?? null }),
    // The loser's number and its evidence are the only record that this person
    // was ever reachable on it, and the tombstone is scrubbed of both.
    mergedFrom: [
      {
        contactId: loserId,
        phone: loser.phone,
        name: loser.name,
        optInStatus: loser.optInStatus,
        at: now.toISOString(),
        by: performedBy ?? null,
        evidence: loserEvidence ?? null,
      },
    ],
  });

  await prisma.waContact.update({
    where: { id: survivorId },
    data: {
      name: survivor.name ?? loser.name,
      waId: survivor.waId ?? loser.waId,
      tags: { set: [...new Set([...survivor.tags, ...loser.tags])] },
      attributes: {
        // The loser only fills gaps; the survivor is the row the operator chose
        // to keep and its values must not be overwritten by the one being retired.
        ...(((loser.attributes as Prisma.JsonObject | null) ?? {}) as Prisma.JsonObject),
        ...(((survivor.attributes as Prisma.JsonObject | null) ?? {}) as Prisma.JsonObject),
      } as Prisma.InputJsonValue,
      optInStatus,
      // The EARLIEST opt-in and the EARLIEST opt-out: both answer "when did this
      // actually happen", and taking the later one would move a consent date
      // forward onto a merge that collected no consent at all.
      optInAt: earlierOf(survivor.optInAt, loser.optInAt),
      optInSource: survivor.optInSource ?? loser.optInSource,
      optOutAt: earlierOf(survivor.optOutAt, loser.optOutAt),
      optOutSource: survivor.optOutSource ?? loser.optOutSource,
      consentEvidence: evidence,
      welcomedAt: earlierOf(survivor.welcomedAt, loser.welcomedAt),
      lastInboundAt: laterOf(survivor.lastInboundAt, loser.lastInboundAt),
      lastOutboundAt: laterOf(survivor.lastOutboundAt, loser.lastOutboundAt),
      // The frequency cap and Meta's refusal both ask "how recently were they
      // messaged" — the later one is the one still in force.
      lastMarketingAt: laterOf(survivor.lastMarketingAt, loser.lastMarketingAt),
      marketingRefusedAt: laterOf(survivor.marketingRefusedAt, loser.marketingRefusedAt),
      marketingRefusedCode: survivor.marketingRefusedCode ?? loser.marketingRefusedCode,
      ctwaSourceId: survivor.ctwaSourceId ?? loser.ctwaSourceId,
      ctwaSourceType: survivor.ctwaSourceType ?? loser.ctwaSourceType,
      ctwaHeadline: survivor.ctwaHeadline ?? loser.ctwaHeadline,
      ctwaClid: survivor.ctwaClid ?? loser.ctwaClid,
      isBlocked: survivor.isBlocked || loser.isBlocked,
      suppressedAt: earlierOf(survivor.suppressedAt, loser.suppressedAt),
    },
  });

  if (consentTightened) {
    await prisma.waConsentEvent.create({
      data: consentEventData({ contactId: survivorId, type: 'OPT_OUT', source: 'merge' }),
    });
  }

  // A do-not-contact entry on either number covers the person, not the string.
  if (loser.suppressedAt || survivor.suppressedAt) {
    await prisma.waSuppression
      .createMany({
        data: [{ phone: survivor.phone, reason: 'merge', createdBy: performedBy ?? null }],
        skipDuplicates: true,
      })
      .catch(() => ({ count: 0 }));
  }

  // (d) Tombstone the loser LAST, so an interrupted merge is simply re-runnable.
  // The phone becomes a non-dialable sentinel for the same reason erasure uses
  // one: the @unique still holds, and no future inbound can re-attach to the dead
  // row and split the person all over again. `isBlocked` is what keeps the
  // tombstone out of every campaign audience (segmentContactWhere pins
  // isBlocked: false).
  await prisma.waContact.update({
    where: { id: loserId },
    data: {
      phone: `merged:${loserId}`,
      waId: null,
      name: null,
      tags: { set: [] },
      attributes: Prisma.JsonNull,
      consentEvidence: Prisma.JsonNull,
      isBlocked: true,
      suppressedAt: null,
      mergedIntoId: survivorId,
      mergedAt: now,
    },
  });

  logger.info(
    `WhatsApp contacts merged: ${loserId} -> ${survivorId} ` +
      `(${messagesMoved} message(s), ${conversationsMoved} thread(s) moved, ` +
      `${conversationsFolded} folded)${consentTightened ? ' — consent tightened to OPTED_OUT' : ''}`
  );

  return {
    survivorId,
    mergedId: loserId,
    conversationsMoved,
    conversationsFolded,
    messagesMoved,
    campaignRecipientsMoved: movableIds.length,
    campaignRecipientsDropped: droppableIds.length,
    consentTightened,
  };
}

export async function noteMarketingRefusal(contactId: string, code: string): Promise<void> {
  await prisma.waContact
    .update({
      where: { id: contactId },
      data: { marketingRefusedAt: new Date(), marketingRefusedCode: code },
    })
    .catch(() => {
      /* never let bookkeeping break a send or a webhook ack */
    });
}
