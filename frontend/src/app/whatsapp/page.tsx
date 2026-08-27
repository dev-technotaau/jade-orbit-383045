'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  Search,
  Send,
  Loader2,
  CheckCheck,
  Check,
  AlertCircle,
  MessageCircle,
  Ban,
  Plus,
  Smile,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  PanelRight,
  RotateCw,
  Tag as TagIcon,
  Clock,
  Reply,
  X,
  Bell,
  BellOff,
  CalendarClock,
  CornerUpRight,
  FileText,
  Forward,
  ShoppingBag,
  MailQuestionMark,
  Pin,
  PinOff,
  Download,
  Archive,
  ArchiveRestore,
  Star,
  Hourglass,
  Copy,
  Trash2,
  UserCog,
  ShieldCheck,
  Paperclip,
  WifiOff,
} from 'lucide-react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Avatar from '@/components/ui/Avatar';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Tooltip from '@/components/ui/Tooltip';
import { showToast } from '@/components/ui/Toast';
import api, { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { loadDrafts, persistDrafts } from '@/lib/wa-drafts';
import {
  DEFAULT_INBOX_FILTERS,
  getInboxFilters,
  hasActiveInboxFilters,
  setInboxFilters,
  subscribeInboxFilters,
  type InboxScope,
  type InboxSort,
} from '@/lib/wa-inbox-filters';
import { WA_FORMATS, applyWaFormat } from '@/lib/wa-format';
import EmojiPicker from '@/components/whatsapp/EmojiPicker';
import ForwardModal from '@/components/whatsapp/ForwardModal';
import RealtimeStatus from '@/components/whatsapp/RealtimeStatus';
import { stripWhatsAppFormatting, hasWaFormatting } from '@/lib/wa-format';
import { useClickOutside } from '@/hooks/use-click-outside';
import { useSocket } from '@/hooks/use-socket';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type {
  WaConversation,
  WaConversationStatus,
  WaMessage,
  WaMessageStatus,
  WaReaction,
} from '@/types/whatsapp';
import type { ApiResponse } from '@/types/api';
import TemplateComposeModal from '@/components/whatsapp/TemplateComposeModal';
import InboxComposerTools from '@/components/whatsapp/InboxComposerTools';
import Spinner from '@/components/ui/Spinner';
import ThreadDetailsPanel from '@/components/whatsapp/ThreadDetailsPanel';
import ScheduleMessageModal from '@/components/whatsapp/ScheduleMessageModal';
import MediaGalleryModal from '@/components/whatsapp/MediaGalleryModal';
import ReactionPicker from '@/components/whatsapp/ReactionPicker';
import MessageReactions from '@/components/whatsapp/MessageReactions';
import MessageActionsMenu from '@/components/whatsapp/MessageActionsMenu';
import MessageAttachment from '@/components/whatsapp/MessageAttachment';
import MessageContact from '@/components/whatsapp/MessageContact';
import MessageLocation from '@/components/whatsapp/MessageLocation';
import MessageInteractive from '@/components/whatsapp/MessageInteractive';
import MessageOrder from '@/components/whatsapp/MessageOrder';
import MessageTemplate from '@/components/whatsapp/MessageTemplate';
import MessageText from '@/components/whatsapp/MessageText';
import HighlightText from '@/components/ui/HighlightText';
import AttachMenu from '@/components/whatsapp/AttachMenu';
import VoiceRecorder from '@/components/whatsapp/VoiceRecorder';
import ContactComposeModal from '@/components/whatsapp/ContactComposeModal';
import LocationComposeModal from '@/components/whatsapp/LocationComposeModal';
import MediaComposeModal from '@/components/whatsapp/MediaComposeModal';
import { parseStoredTemplate } from '@/lib/whatsapp-template-vars';
import { getOpenConv, restoreOpenConv, setOpenConv, subscribeOpenConv } from '@/lib/wa-open-conv';
import {
  drainOutbox,
  enqueueOutbox,
  listOutbox,
  removeOutbox,
  type OutboxMessage,
} from '@/lib/offline-queue';
import BulkActionBar from '@/components/whatsapp/BulkActionBar';
import { ROUTES } from '@/constants/routes';
import { assertWaMediaSize } from '@/constants/config';

type StatusFilter = 'all' | WaConversationStatus;
type AssigneeFilter = 'all' | 'me' | 'unassigned';
/**
 * Which slice of the inbox the list shows. 'active' is the live queue (no
 * archived, no still-snoozed threads); 'archived' and 'snoozed' are those two
 * sets ON THEIR OWN, which the old pair of "include" toggles could not express.
 */
type ScopeFilter = 'active' | 'archived' | 'snoozed' | 'all';

/** Backend sentinel for "has no assignee" (whatsapp-conversation.service.ts). */
const UNASSIGNED = '__none__';

/** Group messages by calendar day for thread day-separators. */
function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(iso) === dayKey(today.toISOString())) return 'Today';
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Under this much window left the countdown chip turns amber — the point at
 *  which an agent should stop typing free-form and reach for a template. */
const WINDOW_WARN_MS = 60 * 60 * 1000;

function windowOpen(expiry: string | null): boolean {
  return !!expiry && new Date(expiry).getTime() > Date.now();
}
/** Milliseconds of free-form (non-template) replying left on the 24h window. */
function windowRemaining(expiry: string | null, now: number): number {
  if (!expiry) return 0;
  return Math.max(0, new Date(expiry).getTime() - now);
}
/** Coarse "3h 12m" / "11m" label for the window countdown chip. */
function fmtRemaining(ms: number): string {
  const mins = Math.floor(ms / 60_000);
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return mins >= 1 ? `${mins}m` : '<1m';
}
function fmtTime(s: string | null): string {
  return s ? new Date(s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
}

/**
 * The conversation row's timestamp.
 *
 * The row used `fmtTime`, so a thread last touched three weeks ago and one
 * touched this morning both read as a bare "09:42". Recency was inferable only
 * from position in the list — which stops being true the moment the operator
 * sorts by anything but last message, and was never true for someone scanning
 * rather than reading top-down.
 *
 * WhatsApp's own escalation: time today, "Yesterday", weekday inside a week,
 * then the date. The exact instant rides on the `title`, so nothing is lost.
 */
function fmtListTime(s: string | null): string {
  // Guarded BEFORE `dayKey`, which takes a non-nullable string — `new Date(null)`
  // is the epoch, and the row would have announced "1 Jan".
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (dayKey(s) === dayKey(now.toISOString())) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(s) === dayKey(yesterday.toISOString())) return 'Yesterday';
  if (now.getTime() - d.getTime() < 7 * 24 * 60 * 60 * 1000) {
    return d.toLocaleDateString([], { weekday: 'short' });
  }
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}
/**
 * What to call this contact.
 *
 * `name` is operator-owned and `profileName` is the customer's own WhatsApp
 * display name — they were one column, and the inbound upsert overwrote the
 * operator's label on every message. Preferring `name` keeps a deliberate label
 * ("Acme Corp - Ravi") stable; falling back to `profileName` means a contact
 * nobody has renamed still reads as a person rather than a phone number.
 */
function displayName(c: {
  name: string | null;
  profileName?: string | null;
  phone: string;
}): string {
  return c.name?.trim() || c.profileName?.trim() || c.phone;
}

/** Split a contact's name into first/last words for avatar initials. */
function avatarNames(c: { name: string | null; profileName?: string | null }): {
  first: string;
  last: string;
} {
  const nm = (c.name || c.profileName || '').trim();
  if (!nm) return { first: '', last: '' };
  const parts = nm.split(/\s+/);
  return { first: parts[0] ?? '', last: parts.slice(1).join(' ') };
}

/** Prefix marking client-side optimistic (not-yet-acked) outbound messages. */
const OPTIMISTIC_PREFIX = 'optimistic-';
function isOptimisticId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_PREFIX);
}

/** Parse a message's `reactions` (typed `unknown`) into a render-safe list.
 *  Entries without a `side` predate two-sided reactions and were the customer's. */
function parseReactions(reactions: unknown): WaReaction[] {
  if (!Array.isArray(reactions)) return [];
  const out: WaReaction[] = [];
  for (const r of reactions) {
    if (r && typeof r === 'object' && 'emoji' in r) {
      const emoji = (r as { emoji?: unknown }).emoji;
      if (typeof emoji === 'string' && emoji.trim()) {
        const rawSide = (r as { side?: unknown }).side;
        const side: 'in' | 'out' = rawSide === 'out' ? 'out' : 'in';
        const from = (r as { from?: unknown }).from;
        const byName = (r as { byName?: unknown }).byName;
        const at = (r as { at?: unknown }).at;
        out.push({
          emoji,
          side,
          from: typeof from === 'string' ? from : undefined,
          byName: typeof byName === 'string' ? byName : undefined,
          at: typeof at === 'string' ? at : undefined,
        });
      }
    }
  }
  return out;
}

/** Build a temporary optimistic outbound message for instant render. */
function makeOptimisticMessage(conversationId: string, contactId: string, text: string): WaMessage {
  const now = new Date().toISOString();
  return {
    id: `${OPTIMISTIC_PREFIX}${now}-${Math.random().toString(36).slice(2)}`,
    wamid: null,
    conversationId,
    contactId,
    direction: 'OUTBOUND',
    type: 'TEXT',
    status: 'QUEUED',
    text,
    mediaId: null,
    mediaUrl: null,
    mediaMime: null,
    templateName: null,
    contextWamid: null,
    errorCode: null,
    errorTitle: null,
    sentByUserId: null,
    campaignId: null,
    sentAt: null,
    deliveredAt: null,
    readAt: null,
    costPaise: null,
    billable: null,
    templateLanguage: null,
    createdAt: now,
  };
}

/**
 * Delivery-status progression, so a status that arrives out of order can never
 * walk a message backwards (a late SENT overwriting a READ shows the customer's
 * reply as unacknowledged). FAILED is terminal — nothing follows it.
 */
const STATUS_RANK: Record<WaMessageStatus, number> = {
  QUEUED: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
  FAILED: 4,
};

/**
 * Append a socket-pushed / just-sent message to the open thread's React Query
 * cache so it renders WITHOUT a refetch. Safe to call for any conversation: it
 * no-ops when that thread isn't loaded (returns undefined → React Query bails)
 * or the message is already present (dedup by id).
 *
 * `orphanStatuses` carries statuses that arrived BEFORE the row they describe —
 * see `orphanStatusRef`. A `wa:status` event routinely beats the HTTP response
 * of the send that produced it, and the patch it triggers finds nothing to
 * update; without replaying it here the bubble would sit on the status the send
 * response happened to carry (usually QUEUED) until the thread was refetched.
 */
function mergeMessageIntoCache(
  qc: QueryClient,
  conversationId: string,
  message: WaMessage,
  orphanStatuses?: Map<string, WaMessageStatus>,
) {
  let row = message;
  if (message.wamid && orphanStatuses?.size) {
    const pending = orphanStatuses.get(message.wamid);
    if (pending) {
      orphanStatuses.delete(message.wamid);
      if (STATUS_RANK[pending] > STATUS_RANK[message.status]) row = { ...message, status: pending };
    }
  }
  // setQueriesData (prefix match), not setQueryData (exact): the thread key
  // carries a third element — the search-hit anchor the page is centred on — so
  // an exact key would miss the cache entry and the bubble would never appear.
  qc.setQueriesData(
    { queryKey: ['wa-messages', conversationId] },
    (old: { data?: { items?: WaMessage[] } } | undefined) => {
      if (!old?.data?.items) return old;
      if (old.data.items.some((m) => m.id === row.id)) return old;
      return { ...old, data: { ...old.data, items: [...old.data.items, row] } };
    },
  );
}

/**
 * Is `a` older than `b` under the backend's compound (createdAt, id) keyset
 * ordering? Inbound timestamps come from Meta at one-second resolution, so the
 * id is the tie-break — exactly as `getThread` pages.
 */
function isOlderMessage(a: WaMessage, b: WaMessage): boolean {
  const at = new Date(a.createdAt).getTime();
  const bt = new Date(b.createdAt).getTime();
  if (at !== bt) return at < bt;
  return a.id < b.id;
}

/**
 * Upper bound on how much thread history stays mounted.
 *
 * "Load older messages" pages 50 rows at a time into a client-held buffer and
 * nothing used to stop it: twenty clicks left a thousand bubbles in the DOM —
 * each with an actions menu, a reaction picker and a tooltip subtree — and every
 * inbound socket event re-merged and re-sorted the whole accumulated array. The
 * thread became too slow to scroll on exactly the long support conversations
 * where history matters. Past the cap the load-older affordance is replaced by a
 * note, so the limit is visible instead of being a button that quietly stops
 * helping. The last page can overshoot it slightly — pages are fetched whole.
 */
const MAX_THREAD_MESSAGES = 500;

/**
 * How often the composer may tell the customer we are typing.
 *
 * Meta keeps the indicator up for 25 seconds (or until the next outbound
 * message), so re-asserting it every 10s keeps it alive continuously while an
 * agent writes a long reply, and costs one small request per 10s rather than one
 * per keystroke.
 */
const TYPING_THROTTLE_MS = 10_000;

const STATUS_LABEL: Record<WaMessageStatus, string> = {
  QUEUED: 'Queued',
  SENT: 'Sent',
  DELIVERED: 'Delivered',
  READ: 'Read',
  FAILED: 'Failed to send',
};

// Status ticks carry an aria-label + title (WCAG 1.4.1 — not color-only).
// Ticks only ever render inside the green (bg-emerald-600) outbound bubble, so
// sent/delivered/queued match the adjacent timestamp's `text-white/70` (the old
// muted-gray was illegible on green). Read stays blue for the universal "seen"
// signal but is lightened to sky-300 so it has real contrast against the green.
/**
 * The delivery tick, with the timestamps behind it.
 *
 * `sentAt`, `deliveredAt` and `readAt` are written by the status webhook, ride
 * to the browser on every message (getThread selects the whole row) and were
 * rendered by absolutely nothing — so "did they see it, and when?", the question
 * WhatsApp's own Message info screen exists to answer, was unanswerable here
 * even though the answer was already in the cache.
 *
 * Put on the tick's tooltip rather than in a new panel: it is the element the
 * operator already looks at to ask exactly this.
 */
/** Carries the tooltip: a lucide icon takes no `title`, and `aria-label` alone
 *  is invisible to a sighted operator hovering the tick. */
function Tick({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <span title={title} aria-label={title} role="img" className="inline-flex">
      {children}
    </span>
  );
}

function StatusTick({
  status,
  sentAt,
  deliveredAt,
  readAt,
}: {
  status: WaMessageStatus;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
}) {
  const label = STATUS_LABEL[status];
  const when = [
    sentAt ? `Sent ${fmtTime(sentAt)}` : null,
    deliveredAt ? `Delivered ${fmtTime(deliveredAt)}` : null,
    readAt ? `Read ${fmtTime(readAt)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const title = when ? `${label} — ${when}` : label;
  if (status === 'FAILED')
    return (
      <Tick title={title}>
        <AlertCircle className="h-3.5 w-3.5 text-red-100" />
      </Tick>
    );
  if (status === 'READ')
    return (
      <Tick title={title}>
        <CheckCheck className="h-3.5 w-3.5 text-sky-300" />
      </Tick>
    );
  if (status === 'DELIVERED')
    return (
      <Tick title={title}>
        <CheckCheck className="h-3.5 w-3.5 text-white/70" />
      </Tick>
    );
  if (status === 'SENT')
    return (
      <Tick title={title}>
        <Check className="h-3.5 w-3.5 text-white/70" />
      </Tick>
    );
  return (
    <Tick title={title}>
      <Loader2 className="h-3 w-3 animate-spin text-white/70" />
    </Tick>
  );
}

/**
 * Where an outbound message came from: a campaign blast, an approved template
 * an agent sent, or the bot.
 *
 * Every outbound message rendered as the same green bubble, so an agent picking
 * a thread up could not tell whether the last thing the customer received was a
 * colleague's reply, a keyword auto-reply, an away message or a marketing
 * blast — which is exactly what they need to know before they answer, because
 * it is what the customer is reacting to. The data was on every row already
 * (campaignId / templateName / a null sentByUserId for automated sends) and
 * simply never drawn.
 *
 * `sentByUserId === null` alone means "no human actor" — the auto-reply engine,
 * the CSAT prompt, sequence steps. A campaign or a template names itself, so
 * those are reported first and more precisely.
 */
function MessageProvenance({ message }: { message: WaMessage }) {
  // An optimistic bubble carries a placeholder row whose sentByUserId is null,
  // which is not a claim about provenance — labelling the agent's own reply
  // "Auto-reply" for the second before the server row lands would be worse than
  // showing nothing.
  if (isOptimisticId(message.id)) return null;
  const chip =
    'inline-flex max-w-full items-center gap-1 truncate rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-medium text-white/90';
  const row = 'mt-1 flex flex-wrap justify-end gap-1';
  // BOTH chips when a campaign sent a template, which is the highest-volume
  // template path there is. Returning on `campaignId` alone meant a broadcast
  // bubble said only "Campaign": the one place the template's NAME appears was
  // suppressed for precisely the messages an operator is most often asked to
  // account for.
  if (message.campaignId || message.templateName) {
    return (
      <div className={row}>
        {message.campaignId && (
          <Link
            href={ROUTES.SUPER_ADMIN.WHATSAPP_CAMPAIGN_DETAIL(message.campaignId)}
            className={cn(chip, 'hover:bg-white/30')}
            title="Sent by a campaign — open it"
          >
            <Send className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
            Campaign
          </Link>
        )}
        {message.templateName && (
          <span className={chip} title={`Approved template: ${message.templateName}`}>
            <span className="truncate">Template · {message.templateName}</span>
          </span>
        )}
      </div>
    );
  }
  if (message.sentByUserId === null) {
    return (
      <div className={row}>
        <span className={chip} title="Sent automatically, not by an agent">
          Auto-reply
        </span>
      </div>
    );
  }
  return null;
}

function DaySeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-1">
      <span className="rounded-full bg-[var(--bg)] px-3 py-1 text-[11px] font-medium text-[var(--text-muted)] shadow-sm ring-1 ring-[var(--border)]">
        {label}
      </span>
    </div>
  );
}

function MessageBubble({
  message,
  conversationId,
  contactName,
  onRetry,
  retrying,
  onReply,
  onToggleStar,
  onForward,
  quotedText,
  selectionMode,
  selected,
  onToggleSelect,
  onCopy,
  onDelete,
  onStartSelect,
  highlight,
  canReact,
  offlineQueued,
  onDiscardQueued,
}: {
  message: WaMessage;
  conversationId: string;
  /** Contact display name — labels the customer's side in the reactions popover. */
  contactName: string;
  /**
   * Whether an outbound send is possible at all right now (24h window open, the
   * contact not blocked). A reaction is an ordinary outbound message, so without
   * this the emoji picker was offered on every bubble of every conversation and
   * clicking it on an older thread always came back as a red error toast.
   */
  canReact: boolean;
  /** Search query to mark inside the body, when opened from a message search. */
  highlight?: string;
  onRetry?: (text: string) => void;
  retrying?: boolean;
  /**
   * This bubble is a durable outbox entry, not a live send. It has no server row
   * behind it and will go out on its own when the connection returns, so it must
   * not look like the ordinary QUEUED spinner (which means "the server has it").
   */
  offlineQueued?: boolean;
  /** Drop a queued-offline reply without sending it. */
  onDiscardQueued?: () => void;
  onReply?: (message: WaMessage) => void;
  /** Toggle this message's star. Absent for rows that have no server id yet. */
  onToggleStar?: (message: WaMessage) => void;
  /** Forward this message elsewhere. Absent for rows with no server id yet. */
  onForward?: (message: WaMessage) => void;
  /** Resolved text/label of the message this one replies to (contextWamid). */
  quotedText?: string;
  /** Multi-select (delete) mode: bubbles become selectable checkboxes. */
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onCopy: (text: string | null) => void;
  onDelete: (id: string) => void;
  onStartSelect: (id: string) => void;
}) {
  const outbound = message.direction === 'OUTBOUND';
  const inbound = message.direction === 'INBOUND';
  const reactions = parseReactions(message.reactions);
  /**
   * What this template send actually emitted — header, footer, buttons, carousel
   * cards and all — read back off the row.
   *
   * Null for anything that is not a template, and for a template dispatched by
   * the Chatwoot bridge, whose payload is the raw Cloud API body rather than the
   * approved layout. Those keep the plain-text fallback further down.
   */
  const sentTemplate = useMemo(
    () => (message.type === 'TEMPLATE' ? parseStoredTemplate(message.payload) : null),
    [message.type, message.payload],
  );
  /**
   * Retry is a TEXT-only affordance.
   *
   * It used to be offered on any failed outbound with `text` — but a media send
   * stores its CAPTION in `text`, and retry re-sends that through the plain
   * message endpoint. So a failed captioned image offered Retry and, on press,
   * delivered the words with no attachment: a wrong send that then looked like a
   * normal green bubble, with the operator believing the file had gone.
   *
   * Re-sending media means re-uploading the archived object and re-sending a
   * template means replaying its whole parameter set; neither is wired yet, so
   * they are not offered rather than offered wrongly.
   */
  const canRetry =
    outbound &&
    message.status === 'FAILED' &&
    message.type === 'TEXT' &&
    !!message.text &&
    !!onRetry;
  // Reply is offered on any real (acked) message that has a wamid to quote.
  const canReply = !!onReply && !!message.wamid;
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg transition-colors',
        selectionMode && 'cursor-pointer px-1 py-0.5 hover:bg-[var(--bg-secondary)]',
        selected && 'bg-[var(--primary-light)]/40',
      )}
      onClick={selectionMode ? () => onToggleSelect(message.id) : undefined}
    >
      {selectionMode && (
        <input
          type="checkbox"
          checked={selected}
          readOnly
          aria-label="Select message"
          className="h-4 w-4 shrink-0 rounded accent-emerald-600"
        />
      )}
      <div className={cn('group flex min-w-0 flex-1', outbound ? 'justify-end' : 'justify-start')}>
        <div className="flex max-w-[75%] flex-col items-end">
          <div className="flex items-end gap-1">
            {/* Reply + react + actions affordances on the left of outbound bubbles */}
            {outbound && !selectionMode && (
              <div className="mb-1 flex shrink-0 items-center gap-0.5">
                <div className="opacity-100 transition-opacity lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100 lg:focus-visible:opacity-100">
                  <MessageActionsMenu
                    canCopy={!!message.text?.trim()}
                    onCopy={() => onCopy(message.text)}
                    onDelete={() => onDelete(message.id)}
                    onSelect={() => onStartSelect(message.id)}
                    starred={!!message.starredAt}
                    onToggleStar={onToggleStar ? () => onToggleStar(message) : undefined}
                    onForward={onForward ? () => onForward(message) : undefined}
                    align="end"
                  />
                </div>
                {canReply && (
                  <Tooltip content="Reply">
                    <button
                      type="button"
                      onClick={() => onReply?.(message)}
                      aria-label="Reply to message"
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-muted)] opacity-100 transition-opacity hover:bg-[var(--bg-secondary)] hover:text-[var(--text)] lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
                    >
                      <Reply className="h-3.5 w-3.5" />
                    </button>
                  </Tooltip>
                )}
                {/* React to our own message (also shows on the customer's side). */}
                {message.wamid && (
                  <div className="opacity-100 transition-opacity lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100 lg:focus-visible:opacity-100">
                    <ReactionPicker
                      conversationId={conversationId}
                      wamid={message.wamid}
                      disabled={!canReact}
                    />
                  </div>
                )}
              </div>
            )}
            <div
              className={cn(
                'rounded-2xl px-3 py-2 text-sm shadow-sm',
                outbound
                  ? 'rounded-br-sm bg-emerald-600 text-white'
                  : 'self-start rounded-bl-sm bg-white text-[var(--text)] ring-1 ring-[var(--border)]',
              )}
            >
              {/* WhatsApp itself labels a forward, and for good reason: the
                  customer did not write this, so replying as though they did
                  reads as a non-sequitur. `frequently_forwarded` is Meta's own
                  chain-message signal and is called out separately. */}
              {(message.contextData?.forwarded || message.contextData?.frequently_forwarded) && (
                <p
                  className={cn(
                    'mb-1 flex items-center gap-1 text-[11px] italic',
                    outbound ? 'text-white/70' : 'text-[var(--text-muted)]',
                  )}
                >
                  <CornerUpRight className="h-3 w-3" aria-hidden="true" />
                  {message.contextData?.frequently_forwarded ? 'Forwarded many times' : 'Forwarded'}
                </p>
              )}
              {quotedText && (
                <div
                  className={cn(
                    'mb-1 rounded border-l-2 px-2 py-1 text-[11px]',
                    outbound
                      ? 'border-white/60 bg-white/15 text-white/90'
                      : 'border-[var(--primary)] bg-[var(--bg-secondary)] text-[var(--text-muted)]',
                  )}
                >
                  <span className="line-clamp-2 break-words">{quotedText}</span>
                </div>
              )}
              {/* The customer tapped a catalogue item and asked about it. The
                  product id was on the webhook and discarded, so "is this
                  available?" arrived with no way to tell WHAT — the agent had to
                  ask, on a question the customer had already answered. */}
              {message.contextData?.referred_product?.product_retailer_id && (
                <div
                  className={cn(
                    'mb-1 flex items-center gap-1.5 rounded px-2 py-1 text-[11px]',
                    outbound
                      ? 'bg-white/15 text-white/90'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]',
                  )}
                >
                  <ShoppingBag className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    About product{' '}
                    <span className="font-medium">
                      {message.contextData.referred_product.product_retailer_id}
                    </span>
                  </span>
                </div>
              )}
              {sentTemplate ? (
                // Ahead of the mediaId test on purpose: a template with a media
                // header now carries one, and MessageAttachment dispatches on the
                // ROW type — every one of these is 'TEMPLATE', so an image header
                // would land on the generic file-download card. The template's own
                // header format picks the renderer instead.
                <MessageTemplate message={message} stored={sentTemplate} highlight={highlight} />
              ) : message.mediaId ? (
                <MessageAttachment message={message} outbound={outbound} />
              ) : message.type === 'CONTACTS' ? (
                <MessageContact payload={message.payload} />
              ) : message.type === 'LOCATION' ? (
                <MessageLocation payload={message.payload} />
              ) : message.type === 'INTERACTIVE' ? (
                <MessageInteractive message={message} outbound={outbound} />
              ) : message.type === 'ORDER' ? (
                <MessageOrder payload={message.payload} />
              ) : message.type === 'SYSTEM' || message.type === 'UNSUPPORTED' ? (
                // A number-change notice or a message type Meta added that we do
                // not model yet. These carry no media id, and until the worker
                // started labelling them they carried no text either — so the
                // bubble rendered completely EMPTY while the conversation list
                // preview said "[system]". The agent could see that something had
                // arrived and could not see what.
                <p
                  className={cn(
                    'text-[11px] italic',
                    outbound ? 'text-white/80' : 'text-[var(--text-muted)]',
                  )}
                >
                  {message.text ?? 'Unsupported message'}
                </p>
              ) : message.text ? (
                <MessageText text={message.text} highlight={highlight} />
              ) : (
                <span
                  className={cn(
                    'text-[11px] italic',
                    outbound ? 'text-white/80' : 'text-[var(--text-muted)]',
                  )}
                >
                  Unsupported message
                </span>
              )}
              {message.errorTitle && (
                <p
                  className={cn(
                    'mt-1 text-[11px]',
                    outbound ? 'text-red-100' : 'text-[var(--error)]',
                  )}
                >
                  {message.errorTitle}
                  {/* Meta's specific reason, under the generic headline. The
                      headline alone is identical on every instance of a code, so
                      it never answered the only question the operator has: is
                      this worth retrying? */}
                  {message.errorDetails && message.errorDetails !== message.errorTitle && (
                    <span
                      className={cn(
                        'mt-0.5 block font-normal opacity-90',
                        outbound ? 'text-red-100' : 'text-[var(--text-muted)]',
                      )}
                    >
                      {message.errorDetails}
                    </span>
                  )}
                </p>
              )}
              {outbound && <MessageProvenance message={message} />}
              <div
                className={cn(
                  'mt-0.5 flex items-center justify-end gap-1 text-[10px]',
                  outbound ? 'text-white/70' : 'text-[var(--text-muted)]',
                )}
              >
                {/* Visible without hovering, or a starred message is
                    indistinguishable from any other and the star is only
                    findable by the operator who set it. */}
                {message.starredAt && (
                  <Star
                    className={cn(
                      'h-3 w-3 fill-current',
                      outbound ? 'text-amber-200' : 'text-amber-500',
                    )}
                    aria-label="Starred"
                  />
                )}
                {fmtTime(message.createdAt)}
                {offlineQueued ? (
                  <span className="inline-flex items-center gap-1" title="Waiting for connection">
                    <WifiOff className="h-3 w-3" aria-hidden="true" />
                    <span>Waiting to send</span>
                  </span>
                ) : (
                  outbound && (
                    <StatusTick
                      status={message.status}
                      sentAt={message.sentAt}
                      deliveredAt={message.deliveredAt}
                      readAt={message.readAt}
                    />
                  )
                )}
              </div>
            </div>
            {/* Reply + react + actions affordances on the right of inbound bubbles */}
            {inbound && !selectionMode && (
              <div className="mb-1 flex shrink-0 items-center gap-0.5">
                {canReply && (
                  <Tooltip content="Reply">
                    <button
                      type="button"
                      onClick={() => onReply?.(message)}
                      aria-label="Reply to message"
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-muted)] opacity-100 transition-opacity hover:bg-[var(--bg-secondary)] hover:text-[var(--text)] lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
                    >
                      <Reply className="h-3.5 w-3.5" />
                    </button>
                  </Tooltip>
                )}
                {message.wamid && (
                  <div className="opacity-100 transition-opacity lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100 lg:focus-visible:opacity-100">
                    <ReactionPicker
                      conversationId={conversationId}
                      wamid={message.wamid}
                      disabled={!canReact}
                    />
                  </div>
                )}
                <div className="opacity-100 transition-opacity lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100 lg:focus-visible:opacity-100">
                  <MessageActionsMenu
                    canCopy={!!message.text?.trim()}
                    onCopy={() => onCopy(message.text)}
                    onDelete={() => onDelete(message.id)}
                    onSelect={() => onStartSelect(message.id)}
                    starred={!!message.starredAt}
                    onToggleStar={onToggleStar ? () => onToggleStar(message) : undefined}
                    onForward={onForward ? () => onForward(message) : undefined}
                    align="start"
                  />
                </div>
              </div>
            )}
          </div>
          {message.wamid && reactions.length > 0 && (
            <MessageReactions
              conversationId={conversationId}
              wamid={message.wamid}
              reactions={reactions}
              contactName={contactName}
              align={outbound ? 'end' : 'start'}
              disabled={!canReact}
            />
          )}
          {offlineQueued && onDiscardQueued && (
            <button
              type="button"
              onClick={onDiscardQueued}
              className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-muted)] hover:underline"
            >
              <X className="h-3 w-3" />
              Discard
            </button>
          )}
          {canRetry && (
            <button
              type="button"
              onClick={() => onRetry?.(message.text as string)}
              disabled={retrying}
              className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--error)] hover:underline disabled:opacity-60"
            >
              {retrying ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RotateCw className="h-3 w-3" />
              )}
              Tap to retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Conversation rows are pinned to this exact height (px) so the windowed list
 * below can size its spacers from a row count. It is the row's natural height
 * (10-unit avatar + py-3 + the 1px divider) plus a few px of slack, so nothing
 * shifts visually — but it must stay in sync with the row markup: a row that
 * renders taller than this would drift the window's scroll math.
 */
/**
 * Meta's ceiling on a text message body, mirrored from `whatsapp.schema.ts`.
 *
 * Enforced in the browser as well as on the server because the server's refusal
 * is a bare "Validation failed" that arrives only after the message was typed
 * and sent.
 */
const WA_TEXT_MAX = 4096;

const CONV_ROW_H = 86;
/** Rows the render window steps by — also its overscan on either side. */
const CONV_WINDOW_BLOCK = 8;
/** Rows to render before the list viewport has been measured (hidden pane). */
const CONV_WINDOW_FALLBACK_ROWS = 40;
/**
 * DOM id of a conversation row. The list is a listbox with a roving
 * `aria-activedescendant`, which names the cursored row by id rather than moving
 * DOM focus onto it — the rows carry their own focusable controls.
 */
const convOptionId = (id: string) => `wa-conv-opt-${id}`;

/**
 * The triage state a shared queue is scanned for, on the row itself.
 *
 * Status, assignee, labels, snooze and "waiting since" are all filterable and
 * were all invisible until a thread was opened — and every open blue-ticks the
 * customer, so answering "is anyone already on this?" cost a read receipt and
 * risked two operators picking up the same conversation. Every field here
 * already ships with the row (the backend uses `include`, not `select`), so this
 * is presentation only, no API change.
 */
function ConversationRowMeta({ conv }: { conv: WaConversation }) {
  // No `> Date.now()` comparison: reading the clock during render is impure (the
  // same render could answer twice), and it is not needed — whether a snoozed
  // thread belongs in this view is already decided server-side by the scope
  // filter, so the row only has to say WHEN.
  const snoozedUntil = conv.snoozedUntil;
  const labels = conv.labels ?? [];
  const bits: React.ReactNode[] = [];

  // First, because it explains the row's POSITION. Without it a pinned thread
  // simply sits at the top of a list sorted by something else, which reads as a
  // sorting bug rather than as the operator's own choice.
  if (conv.pinnedAt) {
    bits.push(<Pin key="pin" className="h-3 w-3 shrink-0 text-amber-600" aria-label="Pinned" />);
  }

  if (conv.status === 'RESOLVED') {
    bits.push(
      <span key="st" className="shrink-0 text-emerald-600" title="Resolved">
        ✓
      </span>,
    );
  } else if (conv.status === 'PENDING') {
    bits.push(
      <span key="st" className="shrink-0 text-amber-600" title="Pending">
        ●
      </span>,
    );
  }

  if (conv.assignedTo) {
    bits.push(
      <span
        key="as"
        title={`Assigned to ${conv.assignedTo}`}
        className="shrink-0 rounded-full bg-[var(--bg-secondary)] px-1.5 py-px text-[9px] font-medium text-[var(--text-secondary)]"
      >
        {conv.assignedTo.slice(0, 12)}
      </span>,
    );
  }

  labels.slice(0, 2).forEach((l) =>
    bits.push(
      <span
        key={`l-${l}`}
        className="max-w-[80px] shrink-0 truncate rounded-full bg-sky-100 px-1.5 py-px text-[9px] font-medium text-sky-800"
      >
        {l}
      </span>,
    ),
  );
  if (labels.length > 2) {
    bits.push(
      <span key="l-more" className="shrink-0 text-[9px] text-[var(--text-muted)]">
        +{labels.length - 2}
      </span>,
    );
  }

  if (snoozedUntil) {
    bits.push(
      <span
        key="sn"
        title={`Snoozed until ${new Date(snoozedUntil).toLocaleString()}`}
        className="shrink-0 text-[9px] text-[var(--text-muted)]"
      >
        ⏳ {fmtTime(snoozedUntil)}
      </span>,
    );
  }

  if (bits.length === 0) return null;
  return <div className="mt-0.5 flex items-center gap-1 overflow-hidden">{bits}</div>;
}

function ConversationRow({
  conv,
  active,
  onClick,
  selected,
  onToggleSelect,
  highlight,
  cursor,
}: {
  conv: WaConversation;
  active: boolean;
  onClick: () => void;
  selected: boolean;
  onToggleSelect: (checked: boolean) => void;
  /** Current search query, marked inside the matched-message snippet. */
  highlight?: string;
  /** This row is where the list's keyboard cursor currently sits. */
  cursor: boolean;
}) {
  const archived = !!conv.archivedAt;
  const hasUnread = conv.unreadCount > 0;
  return (
    // Fixed height, not content height — the windowed list's spacers are sized in
    // whole rows, so a row of another height would shift every position below it.
    <div
      id={convOptionId(conv.id)}
      role="option"
      aria-selected={active}
      style={{ height: CONV_ROW_H }}
      className={cn(
        'flex w-full items-center gap-2 border-b border-[var(--border)] pr-3 transition-colors',
        // The cursor is drawn inset so it does not shift the row's fixed height.
        cursor && 'ring-primary ring-2 ring-inset',
        active
          ? 'bg-primary-light'
          : selected
            ? 'bg-[var(--primary-light)]/50'
            : hasUnread
              ? 'bg-emerald-50/40 hover:bg-emerald-50/70'
              : 'hover:bg-[var(--bg-secondary)]',
      )}
    >
      <label className="flex h-full cursor-pointer items-center self-stretch py-3 pl-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onToggleSelect(e.target.checked)}
          aria-label={`Select conversation with ${displayName(conv.contact)}`}
          className="h-4 w-4 rounded border-[var(--border)] accent-emerald-600"
        />
      </label>
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left"
      >
        {/* No `src` — the avatar came from the linked platform User, a relation
            removed with the in-platform contacts feature. Falls back to initials. */}
        <Avatar
          firstName={avatarNames(conv.contact).first}
          lastName={avatarNames(conv.contact).last}
          alt={displayName(conv.contact)}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span
              className={cn(
                'truncate text-sm text-[var(--text)]',
                hasUnread ? 'font-bold' : 'font-semibold',
              )}
            >
              {displayName(conv.contact)}
            </span>
            {conv.contact.isBlocked && (
              <Ban
                className="h-3.5 w-3.5 shrink-0 text-[var(--error)]"
                aria-label="Blocked contact"
                role="img"
              />
            )}
            {archived && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--text-muted)]">
                <Archive className="h-2.5 w-2.5" aria-hidden="true" /> Archived
              </span>
            )}
          </div>
          {/* On a message-body search the row shows the line that MATCHED rather
              than the last message — otherwise the operator is told a
              conversation contains "invoice 4471" and shown an unrelated
              preview, with no clue which message hit. */}
          {conv.matchSnippet ? (
            <p className="flex items-center gap-1 truncate text-xs text-[var(--text-secondary)]">
              <Search className="h-3 w-3 shrink-0 text-amber-600" aria-hidden="true" />
              <HighlightText
                className="truncate"
                text={stripWhatsAppFormatting(conv.matchSnippet)}
                highlight={highlight}
              />
              {/* One hit was shown and the rest were invisible, so a thread with
                  forty matches looked like one with a stray mention. */}
              {(conv.matchCount ?? 0) > 1 && (
                <span className="shrink-0 rounded-full bg-amber-100 px-1.5 text-[9px] font-semibold text-amber-800">
                  +{(conv.matchCount as number) - 1}
                </span>
              )}
            </p>
          ) : (
            <p
              className={cn(
                'truncate text-xs',
                hasUnread ? 'font-medium text-[var(--text)]' : 'text-[var(--text-muted)]',
              )}
            >
              {/* "You:" is what makes an answered thread distinguishable from an
                  unanswered one at a glance — the single most-scanned fact in a
                  shared queue, and the row carried no direction cue at all. */}
              {conv.lastMessageDirection === 'OUTBOUND' && conv.lastMessagePreview && (
                <span className="text-[var(--text-secondary)]">You: </span>
              )}
              {stripWhatsAppFormatting(conv.lastMessagePreview ?? '') || conv.contact.phone}
            </p>
          )}
          <ConversationRowMeta conv={conv} />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className="text-[10px] text-[var(--text-muted)]"
            // The exact instant, so shortening the visible label costs nothing.
            title={conv.lastMessageAt ? new Date(conv.lastMessageAt).toLocaleString() : undefined}
          >
            {fmtListTime(conv.lastMessageAt)}
          </span>
          {conv.unreadCount > 0 && (
            <span
              className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[10px] font-bold text-white"
              aria-label={`${conv.unreadCount} unread`}
            >
              {conv.unreadCount}
            </span>
          )}
        </div>
      </button>
    </div>
  );
}

/**
 * Consent colours for the conversation header. Mirrors the contacts page so the
 * same state does not read differently in two places.
 */
const INBOX_OPT_IN_STYLE: Record<string, string> = {
  OPTED_IN: 'bg-emerald-100 text-emerald-700',
  OPTED_OUT: 'bg-red-100 text-red-700',
  UNKNOWN: 'bg-gray-100 text-gray-600',
};

/** Stable empty pick, so a thread with no attachments does not churn identity. */
const NO_FILES: File[] = [];

export default function SuperAdminWhatsappInboxPage() {
  const qc = useQueryClient();
  const { socket, emit } = useSocket();
  // The open thread is the `?c=` query parameter, so it can be bookmarked,
  // shared and stepped back through. SSR snapshot is null (matches hydration),
  // then reconciles to the id in the URL.
  const selectedId = useSyncExternalStore(subscribeOpenConv, getOpenConv, () => null);
  const setSelectedId = setOpenConv;
  // Seed the selection once: an explicit `?c=` wins, otherwise the last thread
  // this device had open is restored onto a bare /whatsapp (and written into the
  // URL, so the address bar is shareable without opening the thread again).
  useEffect(() => {
    restoreOpenConv();
  }, []);
  /**
   * Every inbox filter, in the address bar.
   *
   * These were eight bare `useState`s, so the narrowed queue an operator was
   * working had no address: it could not be bookmarked, pasted to a colleague or
   * opened in a second tab, a reload silently returned them to the unfiltered
   * inbox, and Back walked them off the page instead of undoing a filter.
   */
  const filters = useSyncExternalStore(
    subscribeInboxFilters,
    getInboxFilters,
    () => DEFAULT_INBOX_FILTERS,
  );
  const unreadOnly = filters.unread;
  const statusFilter = filters.status as StatusFilter;
  const assigneeFilter = filters.assignee as AssigneeFilter;
  // Labels were write-only: LabelsEditor saved them and the thread header showed
  // them, and nothing could filter by one — so tagging a conversation "billing"
  // still meant scrolling the whole inbox to find the billing conversations.
  const labelFilter = filters.label;
  // Which connected number to show. A WABA can carry several, each with its own
  // thread per contact, and the inbox listed them in one undifferentiated queue —
  // so a support number and a marketing number were impossible to work
  // separately. Empty = every number (and the only state a one-number install
  // ever has: the selector below hides itself).
  const channelFilter = filters.channel;
  const searchMessages = filters.searchMessages;
  // Which slice of the inbox to show. Archived and snoozed used to be two
  // "include" toggles, so the only way to look at the archive was to mix it back
  // into the live queue and scroll — there was no archived-only or snoozed-only
  // view at all, and "what did I park last week?" had no answer.
  const scopeFilter = filters.scope as ScopeFilter;
  /**
   * "Still waiting on us."
   *
   * `awaitingReplySince` has been stamped on every inbound with no agent reply
   * after it since the SLA work, and read by nothing. It is the one question
   * that decides which thread to open next, and the only way to answer it was to
   * open them.
   */
  const awaitingOnly = filters.awaiting;
  /** Inclusive YYYY-MM-DD bounds on last activity; '' = unbounded. */
  const dateFrom = filters.from;
  const dateTo = filters.to;
  /**
   * Ordering.
   *
   * The list has only ever been newest-first, which answers "what just came in"
   * and nothing else — not "what have I left longest", and not "who is still
   * waiting". Both of those are the questions asked when clearing a backlog.
   */
  const convSort = filters.sort;

  // The search INPUT stays local so typing is not a URL write per keystroke;
  // the debounce below publishes it. `debouncedSearch` is now simply the URL's
  // value, which is what makes a shared link carry the search term.
  const debouncedSearch = filters.q;
  const [search, setSearch] = useState('');
  /**
   * Adopt a search term that changed in the URL rather than in this box —
   * Back/Forward, or a shared link opened in place.
   *
   * A render-time adjustment (the pattern React documents for exactly this, and
   * the one `convPageKey` below already uses) rather than an effect: an effect
   * that calls setState to mirror a prop is what `set-state-in-effect` forbids,
   * and it would also render one frame with the stale term.
   */
  const [adoptedQ, setAdoptedQ] = useState('');
  if (filters.q !== adoptedQ) {
    setAdoptedQ(filters.q);
    setSearch(filters.q);
  }
  useEffect(() => {
    const id = window.setTimeout(() => {
      // `replace`, not push: one history entry per keystroke would make Back
      // useless. Discrete controls below push, so Back steps through those.
      if (search !== getInboxFilters().q) setInboxFilters({ q: search }, { replace: true });
    }, 300);
    return () => window.clearTimeout(id);
  }, [search]);
  const includeArchived = scopeFilter === 'all' || scopeFilter === 'archived';
  const archivedOnly = scopeFilter === 'archived';
  // The archive shows everything filed away, snoozed or not; the snoozed scope
  // deliberately excludes archived threads (those live in the archive).
  const includeSnoozed = scopeFilter === 'all' || scopeFilter === 'archived';
  const snoozedOnly = scopeFilter === 'snoozed';
  /**
   * Composer drafts, keyed by conversation.
   *
   * This was a single string for the whole inbox, and the conversation-switch
   * block below — which resets eleven other pieces of state — never cleared it.
   * So half-typed text for one customer stayed in the box when the operator
   * opened the next, and one Enter sent it to the wrong person, with no unsend
   * on the Cloud API. Keying by id removes the hazard by construction: a switch
   * derives an empty box because the map has no entry yet, so there is no reset
   * to forget. Same shape `mediaPick` already uses to scope itself by `convId`.
   */
  const [drafts, setDrafts] = useState<Record<string, string>>(() => loadDrafts());
  const draftKey = selectedId ?? '';
  const draft = drafts[draftKey] ?? '';
  const setDraft = useCallback(
    (value: string | ((prev: string) => string)) => {
      setDrafts((prev) => {
        const current = prev[draftKey] ?? '';
        const next = typeof value === 'function' ? value(current) : value;
        if (next === current) return prev;
        const merged = { ...prev, [draftKey]: next };
        // An empty draft is an absent draft — otherwise the map accumulates one
        // key per conversation ever opened.
        if (!next) delete merged[draftKey];
        persistDrafts(merged);
        return merged;
      });
    },
    [draftKey],
  );
  // The composer grows with the draft. `max-h-32` on the textarea always encoded
  // the intent to grow, but `rows={1}` with no height handling pinned it at one
  // line: anything longer than that was typed into a 40px box that scrolled
  // internally, so the operator could not see the message they were about to
  // commit — and Enter sends. Reset to `auto` first, otherwise scrollHeight can
  // only ever report the current height and the box never shrinks back after a
  // send. 128 is the same 8rem the class caps at, so the internal scroll only
  // starts where the design says it should.
  const composerRef = useRef<HTMLTextAreaElement>(null);
  // Layout effect so the height is right before paint (no one-frame flash), and
  // keyed on `selectedId` as well as the draft: the draft survives a thread
  // switch, so a composer that remounts with text already in it has to be sized
  // on the way in too.
  useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el || !selectedId) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [draft, selectedId]);

  /**
   * Wrap the composer's selection in a WhatsApp marker.
   *
   * Shares `applyWaFormat` with the six settings editors rather than
   * reimplementing it — including the toggle, so pressing Bold twice removes the
   * asterisks instead of producing `**text**` (which WhatsApp renders as a
   * literal asterisk either side of bold text).
   *
   * The selection is restored after React has re-rendered the controlled value;
   * without that the caret jumps to the end and the operator has to re-select to
   * keep typing inside what they just formatted.
   */
  const applyComposerFormat = useCallback(
    (marker: string) => {
      const el = composerRef.current;
      if (!el) return;
      const r = applyWaFormat(draft, el.selectionStart, el.selectionEnd, marker);
      if (r.value.length > WA_TEXT_MAX) return;
      setDraft(r.value);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(r.selectionStart, r.selectionEnd);
      });
    },
    [draft, setDraft],
  );

  /**
   * Screen-reader announcement channel for the open thread.
   *
   * The thread is a scrolling list that mutates under a socket, and none of it
   * was announced: a screen-reader user reading a conversation had no way to
   * know a reply had arrived short of navigating back through the list to look.
   *
   * Deliberately NOT `aria-live` on the message container itself. Additions
   * there include the whole first page on open and a slab of history on every
   * "Load older messages", all of which a live container would read aloud. This
   * region carries one sentence per NEW inbound instead.
   *
   * The text is written straight to the node rather than held in state: an
   * effect that calls setState to produce a render whose only job is to update
   * one text node is both a re-render of the whole thread and the exact shape
   * `react-hooks/set-state-in-effect` exists to prevent.
   */
  const liveRegionRef = useRef<HTMLParagraphElement>(null);
  const announcedRef = useRef<{ convId: string | null; messageId: string | null }>({
    convId: null,
    messageId: null,
  });

  const [emojiOpen, setEmojiOpen] = useState(false);
  // The emoji grid used to close ONLY by picking an emoji or clicking the
  // trigger a second time, so clicking on into the thread left it floating
  // over the message list and Escape did nothing. Both are wired up here: a
  // mousedown outside the wrapper (trigger + panel), and a window-level
  // Escape that also hands focus back to the trigger so a keyboard user is
  // not dropped onto <body> when the panel unmounts.
  const emojiRef = useRef<HTMLDivElement>(null);
  const emojiBtnRef = useRef<HTMLButtonElement>(null);
  useClickOutside(emojiRef, () => setEmojiOpen(false), emojiOpen);
  useEffect(() => {
    if (!emojiOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setEmojiOpen(false);
      emojiBtnRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [emojiOpen]);
  // Message the composer text-send will quote (contextWamid).
  const [replyTo, setReplyTo] = useState<WaMessage | null>(null);
  // Selected conversation ids for bulk actions.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // "Select all N matching the filter" (acts via backend filters, not the id list).
  const [allMatchingConv, setAllMatchingConv] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [mediaGalleryOpen, setMediaGalleryOpen] = useState(false);
  // The message a search result deep-linked to. A body search used to find the
  // CONVERSATION and stop there: the thread opened at the bottom and the only
  // way to reach a hit from last month was "Load older messages", repeatedly.
  const [searchAnchor, setSearchAnchor] = useState<{ convId: string; messageId: string } | null>(
    null,
  );
  // Mobile single-pane navigation: which pane is visible below `lg`.
  const [mobilePane, setMobilePane] = useState<'list' | 'thread' | 'details'>('list');
  // NOTE: pages of older history are NOT held here. They are merged into the
  // same React Query entry as the newest page (see loadOlderMut and msgQuery's
  // queryFn), because a separate client buffer is invisible to the socket
  // patches — delivery ticks and reactions on scrolled-back messages simply
  // stopped updating until the thread was reloaded.
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  // Optimistic (not-yet-acked) outbound bubbles for the open conversation.
  const [pendingMessages, setPendingMessages] = useState<WaMessage[]>([]);
  // Replies typed with no connection, mirrored from the durable IndexedDB
  // outbox. Held separately from `pendingMessages` precisely because that buffer
  // is wiped on every conversation switch — surviving a switch, a navigation and
  // a reload is the entire point of queueing.
  const [outbox, setOutbox] = useState<OutboxMessage[]>([]);
  // Extra conversation-list pages appended below the first page.
  const [extraConvPages, setExtraConvPages] = useState<WaConversation[]>([]);
  const [convPage, setConvPage] = useState(1);
  /**
   * Keyset position of the last loaded row.
   *
   * "Load more" used to ask for page N by OFFSET, over an ordering that moves on
   * every inbound message — so a thread pushed from rank 50 to 51 between the two
   * fetches appeared in neither page and silently vanished from the operator's
   * list until a filter change or a reload. Anchoring on the last row instead
   * asks for "everything after THIS conversation", which stays true however much
   * the list reorders underneath.
   */
  const [convPageCursor, setConvPageCursor] = useState<string | null>(null);
  const [convHasMore, setConvHasMore] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [compose, setCompose] = useState<null | { mode: 'new' | 'reply'; conversationId?: string }>(
    null,
  );
  const endRef = useRef<HTMLDivElement>(null);
  // Unread snapshot captured per open conversation (the pre-markRead count) —
  // drives BOTH the initial scroll-to-first-unread and the "Unread" divider.
  // State (not a ref) so the divider can read it during render. Cleared on
  // close/switch (render-time reset below) and on send (seen).
  const [openUnread, setOpenUnread] = useState<{ convId: string; count: number } | null>(null);
  // Live reference to the merged messages, read inside the scroll effect without
  // making `messages` a dependency (which would yank the view to the bottom on
  // every message change — status ticks, reactions, load-older, etc.).
  const messagesRef = useRef<WaMessage[]>([]);
  // Message-thread scroll container + the floating "scroll to latest" button,
  // shown only when the user has scrolled up away from the bottom.
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  // Count of messages that arrived while the agent was scrolled up — shown as a
  // badge on the jump-to-latest button (WhatsApp-style), cleared on catch-up.
  const [newMsgCount, setNewMsgCount] = useState(0);
  // Whether the thread is at/near the bottom — gates auto-scroll on new messages
  // (a ref so reads in socket/scroll handlers are always current, no re-render).
  const isAtBottomRef = useRef(true);
  /**
   * `wa:status` events whose message is not in the cache yet, keyed by wamid.
   *
   * The status webhook routinely beats the send's own HTTP response: the socket
   * patch then finds no row to update and the update was simply lost, leaving a
   * just-sent bubble stuck on its optimistic tick until something refetched the
   * thread. They are replayed by `mergeMessageIntoCache` when the row lands.
   * Bounded because entries for messages that never arrive (a status for a
   * thread page we do not hold) would otherwise accumulate for the session.
   */
  const orphanStatusRef = useRef(new Map<string, WaMessageStatus>());

  /**
   * The single gate every read receipt goes through.
   *
   * markRead blue-ticks the customer, and "read" has to mean an operator actually
   * saw the message. Three separate call sites used to send it — the socket
   * handler, the on-select effect and the visibility handler — with three
   * different (or no) conditions, so a console left in a background tab, or one
   * restored on load with a conversation still open in the URL, acknowledged
   * messages nobody had looked at.
   */
  const maybeMarkRead = useCallback(() => {
    if (!selectedId) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    // Scrolled away from the bottom means the new message is off-screen.
    if (!isAtBottomRef.current) return;
    void svc
      .markRead(selectedId)
      .then(() => {
        qc.invalidateQueries({ queryKey: ['wa-conversations'] });
        // Clear the sidebar unread badge instantly in this tab (the socket echo
        // would also do it, but this avoids the round-trip lag).
        qc.invalidateQueries({ queryKey: ['wa-inbox-unread-total'] });
      })
      .catch(() => {});
  }, [selectedId, qc]);

  const handleThreadScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isAtBottomRef.current = distanceFromBottom < 120;
    setShowScrollBtn(distanceFromBottom > 200);
    // Caught back up to the bottom → clear the "new messages" badge, and flush any
    // receipt deferred while the agent was scrolled away.
    if (distanceFromBottom < 120) {
      setNewMsgCount(0);
      maybeMarkRead();
    }
  };
  const scrollThreadToBottom = () => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    isAtBottomRef.current = true;
    setNewMsgCount(0);
    maybeMarkRead();
  };
  // Message multi-select (delete / copy) state + helpers.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
  /**
   * Messages queued for forwarding.
   *
   * Its own state rather than reusing the selection: the picker is modal, and
   * clearing the selection while it is open would leave the modal describing a
   * set that no longer exists.
   */
  const [forwarding, setForwarding] = useState<string[] | null>(null);
  const copyMessageText = (text: string | null) => {
    const t = (text ?? '').trim();
    if (!t) return;
    navigator.clipboard?.writeText(t).then(
      () => showToast.success('Copied to clipboard'),
      () => showToast.error('Could not copy'),
    );
  };
  const enterMessageSelection = (id: string) => {
    setSelectionMode(true);
    setSelectedMessageIds(new Set([id]));
  };
  const toggleMessageSelect = (id: string) =>
    setSelectedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const exitMessageSelection = () => {
    setSelectionMode(false);
    setSelectedMessageIds(new Set());
  };
  /**
   * Who "me" is, straight from the backend.
   *
   * `WaConversation.assignedTo` is a free-text operator label rather than a user
   * id — see the note in schema.prisma — and which label this session stamps is
   * decided server-side, by the password that unlocked it (OPERATOR_PASSWORDS,
   * middleware/app-password.ts). This page cannot work it out locally, and both
   * attempts to do so anyway were wrong the same way: first a SECOND environment
   * variable (NEXT_PUBLIC_OPERATOR_LABEL) that had to be kept in step with the
   * backend's by hand, then the first entry of `GET /whatsapp/agents` — which is
   * the whole roster now, so "the first one is me" stops being true the moment a
   * second operator exists. Both end identically: "Assign to me" writes label A
   * while "Assigned to me" queries label B, the filter silently returns an empty
   * inbox, and nothing anywhere says why.
   *
   * `GET /unlock/whoami` is the server answering the one question that matters
   * here. It is not on whatsappService because it is not a WhatsApp endpoint,
   * and it deliberately holds nothing stale: after a lock and unlock in the same
   * tab, the session can belong to a different person.
   */
  const whoamiQuery = useQuery({
    queryKey: ['wa-whoami'],
    queryFn: async () =>
      (await api.get<ApiResponse<{ operator: string | null }>>('/unlock/whoami')).data,
    staleTime: 0,
  });
  const operatorLabel = whoamiQuery.data?.data?.operator ?? undefined;
  // 'unassigned' is a real backend filter now (the `__none__` sentinel), so it
  // paginates and counts like every other filter instead of being applied to
  // whatever happened to be on the loaded page.
  const assignedToParam =
    assigneeFilter === 'me'
      ? operatorLabel
      : assigneeFilter === 'unassigned'
        ? UNASSIGNED
        : undefined;
  // "Assigned to me" cannot be asked before the label is known: sending no
  // `assignedTo` at all would quietly list the WHOLE inbox under a filter that
  // says it is showing one person's work.
  const awaitingOperatorLabel = assigneeFilter === 'me' && !operatorLabel;
  const statusParam = statusFilter === 'all' ? undefined : statusFilter;
  const labelsParam = labelFilter ? [labelFilter] : undefined;

  // Connected numbers, only so the channel selector can exist. Rarely changes,
  // so it is cached hard and shared with the details panel's "On …" badge.
  const channelsQuery = useQuery({
    queryKey: ['wa-channels'],
    queryFn: () => svc.listChannels(),
    staleTime: 5 * 60_000,
  });
  const channels = channelsQuery.data?.data ?? [];
  const channelParam = channelFilter || undefined;

  const convQuery = useQuery({
    queryKey: [
      'wa-conversations',
      {
        q: debouncedSearch,
        unreadOnly,
        status: statusParam,
        assignedTo: assignedToParam,
        labels: labelFilter,
        channelId: channelParam,
        searchMessages,
        scope: scopeFilter,
        awaitingOnly,
        dateFrom,
        dateTo,
        sort: convSort,
      },
    ],
    queryFn: () =>
      svc.listConversations({
        q: debouncedSearch,
        unread: unreadOnly,
        status: statusParam,
        assignedTo: assignedToParam,
        labels: labelsParam,
        channelId: channelParam,
        searchMessages,
        includeArchived,
        includeSnoozed,
        archivedOnly,
        snoozedOnly,
        awaiting: awaitingOnly,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        sort: convSort,
        page: 1,
        limit: 50,
      }),
    enabled: !awaitingOperatorLabel,
    refetchInterval: 60_000,
  });
  const firstPage = convQuery.data?.data;
  // Reset the appended-pages buffer whenever the first page (i.e. the active
  // filter/search) changes. Render-time adjustment to avoid an effect cascade.
  const [convPageKey, setConvPageKey] = useState<string | undefined>(undefined);
  const firstPageKey = convQuery.dataUpdatedAt
    ? `${debouncedSearch}|${unreadOnly}|${statusParam}|${assignedToParam}|${labelFilter}|${channelFilter}|${searchMessages}|${scopeFilter}|${awaitingOnly}|${dateFrom}|${dateTo}|${convSort}`
    : undefined;
  if (firstPageKey !== convPageKey) {
    setConvPageKey(firstPageKey);
    setExtraConvPages([]);
    setConvPage(1);
    setConvPageCursor(null);
    setConvHasMore(!!firstPage?.hasMore);
    setAllMatchingConv(false);
  }
  // Merge first page + appended pages; dedupe by id (a refetch of page 1 can
  // overlap rows that also live in a loaded later page).
  const allConversations = useMemo(() => {
    const seen = new Set<string>();
    const merged: WaConversation[] = [];
    // Pinned rows lead. They arrive as their OWN array because the keyset cursor
    // describes a position in the sorted list and a pinned row inside `items`
    // would make the next page start from that row's timestamp — but they are
    // merged here rather than rendered as a separate block, so they keep every
    // affordance an ordinary row has: selection, keyboard nav, the virtualiser.
    // The server excludes them from `items` on every page, so no row is doubled.
    for (const c of [
      ...(firstPage?.pinned ?? []),
      ...(firstPage?.items ?? []),
      ...extraConvPages,
    ]) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      merged.push(c);
    }
    return merged;
  }, [firstPage, extraConvPages]);
  const conversations = allConversations;

  // ── Windowed conversation list ──
  // "Load more" appends 50 rows at a time with no upper bound, so ten clicks used
  // to leave 500 full rows (avatar + checkbox + two text nodes each) mounted, and
  // every scroll frame had to lay all of them out. Only the slice around the
  // viewport is mounted now; the rows above and below are represented by two
  // spacers of exactly CONV_ROW_H per row, so the scrollbar, the scroll position
  // and "Load more" all behave as if the whole list were there.
  const convScrollRef = useRef<HTMLDivElement>(null);
  const convRowsRef = useRef<HTMLDivElement>(null);
  const [convWindow, setConvWindow] = useState({ start: 0, end: CONV_WINDOW_FALLBACK_ROWS });
  // Reads the DOM only (no props/state), so it stays stable for the observer and
  // can be handed straight to onScroll. The window is quantised to blocks of
  // CONV_WINDOW_BLOCK rows so a scroll gesture re-renders the page a handful of
  // times instead of once per frame.
  const syncConvWindow = useCallback(() => {
    const el = convScrollRef.current;
    if (!el) return;
    // Unmeasurable (the pane is display:none below lg, or this is the first
    // paint): keep the window we have. It is either the initial head of the list
    // or the last good one, and a hidden pane keeps its scroll position, so both
    // still line up when it comes back.
    const height = el.clientHeight;
    if (height <= 0) return;
    // The rows block can sit below an error banner inside the same scroller, so
    // measure where it actually starts instead of assuming scrollTop 0.
    const rows = convRowsRef.current;
    const rowsOffset = rows
      ? rows.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop
      : 0;
    const scrolled = Math.max(0, el.scrollTop - rowsOffset);
    const start = Math.max(
      0,
      (Math.floor(scrolled / (CONV_ROW_H * CONV_WINDOW_BLOCK)) - 1) * CONV_WINDOW_BLOCK,
    );
    const end = start + Math.ceil(height / CONV_ROW_H) + CONV_WINDOW_BLOCK * 3;
    setConvWindow((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);
  useEffect(() => {
    const el = convScrollRef.current;
    if (!el) return;
    syncConvWindow();
    // The pane resizes with the viewport and on the mobile pane switch, both of
    // which change how many rows fit.
    const observer = new ResizeObserver(syncConvWindow);
    observer.observe(el);
    return () => observer.disconnect();
  }, [syncConvWindow]);
  // Clamped here rather than in the window state: appending to or filtering the
  // list changes its length without a scroll event, and the spacers must still
  // add up. A filter that shrinks the list out from under the window falls back
  // to the head, so the list never paints empty for the frame between the shrink
  // and the browser clamping scrollTop.
  const convVisible =
    convWindow.start < conversations.length
      ? convWindow
      : { start: 0, end: CONV_WINDOW_FALLBACK_ROWS };
  const convVisibleStart = convVisible.start;
  const convVisibleEnd = Math.min(convVisible.end, conversations.length);
  const convPadTop = convVisibleStart * CONV_ROW_H;
  const convPadBottom = (conversations.length - convVisibleEnd) * CONV_ROW_H;

  // Label options come from what is actually loaded, plus whatever is currently
  // selected — so a filter stays selectable after it has narrowed the list down to
  // conversations that all share it.
  const knownLabels = useMemo(() => {
    const set = new Set<string>();
    for (const c of allConversations) for (const l of c.labels ?? []) set.add(l);
    if (labelFilter) set.add(labelFilter);
    return [...set].sort();
  }, [allConversations, labelFilter]);

  // Load the next conversation-list page and append it.
  const loadMoreConvMut = useMutation({
    mutationFn: () => {
      const next = convPage + 1;
      // Every filter the first page was fetched with has to be repeated here.
      // `labels` was missing, so pressing "Load more" under an active label
      // filter appended conversations that did not carry the label at all.
      return svc.listConversations({
        q: debouncedSearch,
        unread: unreadOnly,
        status: statusParam,
        assignedTo: assignedToParam,
        labels: labelsParam,
        channelId: channelParam,
        searchMessages,
        includeArchived,
        includeSnoozed,
        archivedOnly,
        snoozedOnly,
        awaiting: awaitingOnly,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        // The sort has to be repeated too, and for a stronger reason than the
        // others: the cursor is minted against it, and the server DISCARDS a
        // cursor from a different ordering. Omitting it here would silently
        // restart every "Load more" at page 1.
        sort: convSort,
        // `cursor` supersedes `page` server-side; `page` is still sent so a
        // first "Load more" issued against an older backend still works.
        cursor: convPageCursor ?? firstPage?.nextCursor ?? undefined,
        page: next,
        limit: 50,
      });
    },
    onSuccess: (res) => {
      const page = res.data;
      setExtraConvPages((prev) => [...prev, ...(page?.items ?? [])]);
      setConvPage((p) => p + 1);
      setConvHasMore(!!page?.hasMore);
      // Anchor the NEXT fetch on the last row of this one.
      if (page?.nextCursor) setConvPageCursor(page.nextCursor);
    },
    onError: (e) => showToast.error(errorMessage(e, 'Failed to load more conversations')),
  });

  const detailQuery = useQuery({
    queryKey: ['wa-conversation', selectedId],
    queryFn: () => svc.getConversation(selectedId as string),
    enabled: !!selectedId,
  });
  const selected: WaConversation | null =
    detailQuery.data?.data ?? conversations.find((c) => c.id === selectedId) ?? null;
  const selectedContactId = selected?.contactId ?? '';

  // The anchor only applies to the conversation it was captured on, so switching
  // threads drops it without any reset bookkeeping.
  const anchorMessageId = searchAnchor?.convId === selectedId ? searchAnchor.messageId : null;

  /**
   * Open a conversation from the list. A row produced by a message-body search
   * carries the message that matched, and opening ON it is the whole point of the
   * search — otherwise the operator lands at the bottom of a thread that can be
   * thousands of messages long with no idea where the hit is.
   */
  const openConversation = (conv: WaConversation) => {
    if (conv.matchMessageId) {
      setSearchAnchor({ convId: conv.id, messageId: conv.matchMessageId });
      // An anchored page is a different slice of the thread entirely, and it
      // lives under its own query key — so only the "is there more history"
      // flag needs resetting.
      setHasMoreOlder(true);
    } else {
      setSearchAnchor(null);
    }
    setSelectedId(conv.id);
  };

  /** Leave an anchored (search-hit) page and go back to the newest messages. */
  const jumpToLatest = () => {
    setSearchAnchor(null);
    setHasMoreOlder(true);
  };

  // ── Keyboard navigation over the conversation list ──
  // The list was reachable only by Tab, and every row carries two focusable
  // controls, so walking to the 200th conversation of a queue cost 400 Tab
  // presses and there was no way to open one without landing on its button
  // first. The rows block is a listbox with a keyboard cursor: Arrow keys (and
  // j/k) move it, Home/End jump to the ends, Enter or Space opens the thread.
  const [convCursor, setConvCursor] = useState(0);
  const [convListFocused, setConvListFocused] = useState(false);
  // Clamped on read rather than reset on change: filtering, "Load more" and the
  // socket-driven reorder all change the list length with no single event this
  // component could hang a reset off, and a cursor past the end would point
  // `aria-activedescendant` at an id that is not in the document.
  const convCursorIndex =
    conversations.length === 0 ? -1 : Math.min(convCursor, conversations.length - 1);

  // Bring a row into view before the cursor lands on it. The list is windowed, so
  // a row outside the mounted slice has no element to scroll into view — the
  // offset is computed from the fixed row height instead. Syncing the window here
  // rather than waiting for the scroll event mounts the row in the same render as
  // the `aria-activedescendant` that names it, so it is never dangling.
  const revealConvRow = useCallback(
    (index: number) => {
      const el = convScrollRef.current;
      if (!el) return;
      const rows = convRowsRef.current;
      const rowsOffset = rows
        ? rows.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop
        : 0;
      const top = rowsOffset + index * CONV_ROW_H;
      if (top < el.scrollTop) {
        el.scrollTop = top;
      } else if (top + CONV_ROW_H > el.scrollTop + el.clientHeight) {
        el.scrollTop = top + CONV_ROW_H - el.clientHeight;
      }
      syncConvWindow();
    },
    [syncConvWindow],
  );

  const onConvListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Only when the listbox itself holds focus — a row's checkbox or open button
    // keeps its native keys (Space toggles, Enter activates).
    if (e.target !== e.currentTarget) return;
    if (conversations.length === 0) return;
    const move = (next: number) => {
      e.preventDefault();
      const idx = Math.min(Math.max(next, 0), conversations.length - 1);
      setConvCursor(idx);
      revealConvRow(idx);
    };
    switch (e.key) {
      case 'ArrowDown':
      case 'j':
        move(convCursorIndex + 1);
        break;
      case 'ArrowUp':
      case 'k':
        move(convCursorIndex - 1);
        break;
      case 'Home':
        move(0);
        break;
      case 'End':
        move(conversations.length - 1);
        break;
      case 'Enter':
      case ' ': {
        const conv = conversations[convCursorIndex];
        if (!conv) break;
        // Space would otherwise page-scroll the list out from under the cursor.
        e.preventDefault();
        openConversation(conv);
        break;
      }
      default:
        break;
    }
  };

  // The active thread's cache key, shared by the query, the load-older prepend
  // and the delete patch so all three address exactly one entry.
  const msgQueryKey = useMemo(
    () => ['wa-messages', selectedId, anchorMessageId] as const,
    [selectedId, anchorMessageId],
  );

  const msgQuery = useQuery({
    // The anchor is part of the key: opening on a hit fetches a DIFFERENT page of
    // the thread (centred on it), so it must not read a cached newest page.
    queryKey: msgQueryKey,
    /**
     * Fetches the newest (or anchored) page and KEEPS any older history already
     * merged into this entry.
     *
     * Older pages live in this cache entry rather than in component state, which
     * is what lets one socket patch cover the whole thread. The cost of that is
     * that a plain refetch — triggered by a media send, a delete, a socket
     * reconnect — would replace the entry with just the newest 50 rows and
     * collapse the history the operator had scrolled back through. So anything
     * strictly older than the freshly-fetched page is carried over; anything
     * inside the fetched window is dropped and replaced by the server's version,
     * so a message deleted or updated there cannot survive as a stale copy.
     *
     * An empty response is taken at face value (nothing is retained): that is
     * "clear chat history", and the thread must actually come back empty.
     */
    queryFn: async () => {
      const res = await svc.getMessages(
        selectedId as string,
        undefined,
        undefined,
        anchorMessageId ?? undefined,
      );
      const fetched = res.data?.items ?? [];
      if (fetched.length === 0) return res;
      const prev =
        qc.getQueryData<ApiResponse<{ items: WaMessage[] }>>(msgQueryKey)?.data?.items ?? [];
      if (prev.length === 0) return res;
      const oldestFetched = fetched[0];
      const retained = prev.filter((m) => isOlderMessage(m, oldestFetched));
      if (retained.length === 0) return res;
      return { ...res, data: { ...res.data, items: [...retained, ...fetched] } };
    },
    enabled: !!selectedId,
  });
  // Merge the loaded thread (newest page + any older pages prepended into the
  // same entry) with the optimistic pending bubbles; dedupe by id; keep
  // newest-at-bottom order.
  const messages = useMemo(() => {
    const current = msgQuery.data?.data?.items ?? [];
    const seen = new Set<string>();
    const merged: WaMessage[] = [];
    for (const m of current) {
      if (seen.has(m.id)) continue;
      // Reactions are not bubbles — they render on their target message via
      // `reactions`. Skip any REACTION-typed rows (incl. legacy orphans created
      // before reactions attached to the target).
      if (m.type === 'REACTION') continue;
      seen.add(m.id);
      merged.push(m);
    }
    // Optimistic bubbles are reconciled by ID, in the send mutation's onSuccess
    // (which merges the canonical server row and removes the bubble by its
    // optimisticId). This used to ALSO drop any pending bubble whose text
    // matched an existing outbound message anywhere in the thread — so sending
    // "ok" a second time showed nothing at all until the server replied,
    // because the first "ok" was already on screen. Short, repeated replies are
    // the most common thing an operator types.
    for (const p of pendingMessages) {
      merged.push(p);
    }
    // Queued-offline replies for this thread, rebuilt from the durable outbox on
    // every render — which is why they are still on screen after a conversation
    // switch or a reload, instead of vanishing with the page state.
    for (const q of outbox) {
      if (q.conversationId !== selectedId) continue;
      if (seen.has(q.id)) continue;
      const bubble = makeOptimisticMessage(q.conversationId, selectedContactId, q.text);
      bubble.id = q.id;
      bubble.createdAt = q.createdAt;
      bubble.contextWamid = q.contextWamid ?? null;
      merged.push(bubble);
    }
    return merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [msgQuery.data, pendingMessages, outbox, selectedId, selectedContactId]);

  /** Ids rendered from the outbox — the bubbles that say "waiting to send". */
  const outboxIds = useMemo(() => new Set(outbox.map((m) => m.id)), [outbox]);

  // Past the cap, stop offering more history — see MAX_THREAD_MESSAGES.
  const threadAtCap = messages.length >= MAX_THREAD_MESSAGES;

  // Lookup from a message's wamid → its preview text, for resolving quoted
  // (contextWamid) replies into a small inline preview.
  const wamidToText = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of messages) {
      if (m.wamid)
        map.set(m.wamid, stripWhatsAppFormatting(m.text ?? '').trim() || m.type.toLowerCase());
    }
    return map;
  }, [messages]);

  // The message id BEFORE which to render the centered "Unread" divider — the
  // first unread message for the open conversation, from the captured snapshot.
  // Null when the conversation has no unread or has been seen (snapshot cleared
  // on close/switch/send), which is what makes the divider go away.
  const unreadDividerBeforeId = useMemo(() => {
    if (!selectedId || openUnread?.convId !== selectedId || openUnread.count <= 0) return null;
    let remaining = openUnread.count;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].direction === 'INBOUND' && --remaining === 0) return messages[i].id;
    }
    // More unread than currently loaded → mark before the oldest loaded message.
    return messages[0]?.id ?? null;
  }, [selectedId, openUnread, messages]);

  // Short preview text for the message currently being replied to.
  const replyPreview = replyTo
    ? stripWhatsAppFormatting(replyTo.text ?? '').trim() || replyTo.type.toLowerCase()
    : '';

  // Reset the "load older" buffer when switching conversations. React's
  // recommended render-time state adjustment (not an effect) to avoid the
  // cascading-render lint and an extra paint.
  const [prevSelectedId, setPrevSelectedId] = useState(selectedId);
  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId);
    setHasMoreOlder(true);
    setEmojiOpen(false);
    setPendingMessages([]);
    setDetailsOpen(false);
    setReplyTo(null);
    setMediaGalleryOpen(false);
    // Drop the previous conversation's unread divider/snapshot (it reappears for
    // the newly-opened conversation via the capture below). This is what makes
    // the "Unread" divider go away when you close or switch chats.
    setOpenUnread(null);
    setShowScrollBtn(false);
    setNewMsgCount(0);
    setSelectionMode(false);
    setSelectedMessageIds(new Set());
    // On mobile, selecting a conversation moves into the thread pane.
    setMobilePane(selectedId ? 'thread' : 'list');
  }
  // Capture the open conversation's unread count once (render-time adjustment).
  // `selected` falls back to the list row, which holds the pre-markRead count
  // before markRead zeroes it; the guard keeps that first-seen snapshot.
  if (selectedId && selected && selected.id === selectedId && openUnread?.convId !== selectedId) {
    setOpenUnread({ convId: selectedId, count: selected.unreadCount });
  }

  // Real-time: refresh on inbound/outbound messages + status changes + conversation updates.
  useEffect(() => {
    if (!socket) return;

    // Trailing-debounced list invalidation.
    //
    // Every socket event below used to invalidate ['wa-conversations'] straight
    // away, and a campaign emits wa:conversation + wa:message for EVERY recipient
    // — so a 15/s campaign meant ~30 refetches a second per open tab, each one a
    // take-50 findMany plus an unbounded count(), against the same pool the
    // campaign worker was already saturating. The queue also reordered under the
    // operator's cursor exactly when it needed to stay still.
    //
    // Same fix Sidebar already applies to the unread badge, which was the same
    // hazard and was never carried over here. The OPEN conversation is still
    // invalidated immediately: it is a single cheap row and it is what the
    // operator is looking at.
    let listTimer: ReturnType<typeof setTimeout> | null = null;
    const invalidateListSoon = () => {
      if (listTimer) clearTimeout(listTimer);
      listTimer = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ['wa-conversations'] });
      }, 1500);
    };

    const onMessage = (data: { conversationId: string; message?: WaMessage }) => {
      // A wa:message carrying NO message means "this thread changed, refetch" —
      // which is exactly what delete-for-me and clear-history emit. The handler only
      // ever merged an incoming message, so those events did nothing and a deletion
      // stayed on screen in every other open session until a manual reload.
      if (!data.message && data.conversationId === selectedId) {
        void qc.invalidateQueries({ queryKey: ['wa-messages', selectedId] });
      } // Merge the pushed message straight into the thread cache — the socket
      // already carries the full row, so render it with zero extra round-trip.
      if (data.message)
        mergeMessageIntoCache(qc, data.conversationId, data.message, orphanStatusRef.current);
      invalidateListSoon();
      if (data.conversationId === selectedId) {
        if (data.message?.direction === 'INBOUND') {
          // Mark read ONLY if the operator can actually see the thread.
          //
          // markRead blue-ticks the customer. This fired on every inbound event for
          // the open conversation regardless of whether the tab was even visible, so
          // a console left open in a background tab told customers their messages had
          // been read when nobody had looked. The visibilitychange handler below
          // flushes the receipt when the operator does come back.
          maybeMarkRead();
          if (!isAtBottomRef.current) setNewMsgCount((c) => c + 1);
        }
      }
      // Alerting for messages in OTHER conversations (beep + browser
      // notification) lives in WaNotificationsProvider, mounted by the section
      // layout — here it only fired while this page was the one on screen, so an
      // operator on any other /whatsapp/* page was never told anything arrived.
    };
    const onStatus = (data: {
      conversationId: string;
      wamid?: string;
      status?: WaMessageStatus;
      /** Why it failed, when it did. Null on every non-FAILED transition. */
      errorTitle?: string | null;
      errorDetails?: string | null;
    }) => {
      if (data.conversationId !== selectedId || !data.wamid || !data.status) return;
      // Patch the matching bubble's status in place (grey → ✓ → ✓✓ → blue) —
      // the payload carries {wamid,status}, so no thread refetch is needed.
      const { wamid, status, errorTitle, errorDetails } = data;
      let matched = false;
      qc.setQueriesData(
        { queryKey: ['wa-messages', selectedId] },
        (old: { data?: { items?: WaMessage[] } } | undefined) => {
          if (!old?.data?.items) return old;
          let changed = false;
          const items = old.data.items.map((m) => {
            if (m.wamid !== wamid) return m;
            matched = true;
            // Never walk a message backwards: Meta can deliver a late SENT after
            // a READ, and re-applying it would show an answered message as
            // merely sent.
            if (STATUS_RANK[status] <= STATUS_RANK[m.status]) return m;
            changed = true;
            // The reason travels with the status. Without it the bubble turned
            // red and said nothing — its error line has a truthiness guard, so
            // a null reason renders as an unexplained failure that only a
            // reload could account for.
            return {
              ...m,
              status,
              ...(errorTitle !== undefined ? { errorTitle: errorTitle ?? null } : {}),
              ...(errorDetails !== undefined ? { errorDetails: errorDetails ?? null } : {}),
            };
          });
          return changed ? { ...old, data: { ...old.data, items } } : old;
        },
      );
      // A send that failed while the operator was watching. The bubble turns
      // red, which a sighted user sees and a screen-reader user does not —
      // and a permanently rejected message is precisely the transition that
      // needs acting on.
      if (matched && status === 'FAILED' && liveRegionRef.current) {
        liveRegionRef.current.textContent = `Message failed to send${
          errorTitle ? `: ${errorTitle}` : ''
        }`;
      }
      // Nothing to patch yet — hold it for the row that is still in flight.
      if (!matched) {
        const orphans = orphanStatusRef.current;
        if (orphans.size >= 200) orphans.clear();
        const held = orphans.get(wamid);
        if (!held || STATUS_RANK[status] > STATUS_RANK[held]) orphans.set(wamid, status);
      }
    };
    // Conversation-level updates: unread counts, assignment, status changes.
    const onConversation = (data: { conversationId: string }) => {
      invalidateListSoon();
      if (data.conversationId === selectedId) {
        qc.invalidateQueries({ queryKey: ['wa-conversation', selectedId] });
      }
    };
    // Reactions attach to a target message — refresh the thread so the chip
    // appears/updates live, whether it's our reaction or the customer's, and on
    // inbound or outbound messages.
    const onReaction = (data: {
      conversationId: string;
      targetWamid?: string;
      emoji?: string;
      from?: string;
      side?: 'in' | 'out';
    }) => {
      invalidateListSoon();
      if (data.conversationId !== selectedId || !data.targetWamid) return;
      // Patch the target message's reactions in place (mirrors the backend merge:
      // one reaction per side; empty emoji = removed) — no thread refetch.
      const { targetWamid, emoji, from, side = 'in' } = data;
      qc.setQueriesData(
        { queryKey: ['wa-messages', selectedId] },
        (old: { data?: { items?: WaMessage[] } } | undefined) => {
          if (!old?.data?.items) return old;
          let changed = false;
          const items = old.data.items.map((m) => {
            if (m.wamid !== targetWamid) return m;
            changed = true;
            const existing: WaReaction[] = Array.isArray(m.reactions) ? m.reactions : [];
            const withoutSide = existing.filter((r) => r.side !== side);
            const reactions = emoji ? [...withoutSide, { emoji, side, from }] : withoutSide;
            return { ...m, reactions };
          });
          return changed ? { ...old, data: { ...old.data, items } } : old;
        },
      );
    };
    /**
     * Reconnect resync.
     *
     * Everything above is push-only: the thread has no refetchInterval and
     * inherits a 5-minute staleTime, so anything that arrived while the socket
     * was down was simply never rendered. The operator sees a live-looking
     * inbox that is quietly missing messages — and Socket.IO reconnects
     * silently, so there was no moment at which anything was refetched.
     * (`refetchOnReconnect` reacts to the browser's `online` event, not to a
     * socket drop.) Rejoin the room and pull the state we may have missed.
     */
    const onConnect = () => {
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
      qc.invalidateQueries({ queryKey: ['wa-inbox-unread-total'] });
      if (selectedId) {
        emit('wa:open', selectedId);

        qc.invalidateQueries({ queryKey: ['wa-messages', selectedId] });
        qc.invalidateQueries({ queryKey: ['wa-conversation', selectedId] });
      }
    };

    // Receipts deferred while the tab was hidden are flushed on return, so a
    // customer is not left permanently unacknowledged just because the operator had
    // the console in a background tab when their message landed.
    //
    // Declared in the EFFECT BODY, not inside onConnect: registering it there added
    // a fresh listener on every socket reconnect, and none of them were removable.
    const flushOnVisible = () => maybeMarkRead();
    document.addEventListener('visibilitychange', flushOnVisible);

    socket.on('connect', onConnect);
    socket.on('wa:message', onMessage);
    socket.on('wa:status', onStatus);
    socket.on('wa:conversation', onConversation);
    socket.on('wa:reaction', onReaction);
    return () => {
      // Without this the listener leaks on every conversation switch, and each
      // stale copy still holds its own selectedId - so returning to the tab would
      // fire a read receipt for every thread visited this session.
      document.removeEventListener('visibilitychange', flushOnVisible);
      // A pending debounce must not fire against a torn-down query client.
      if (listTimer) clearTimeout(listTimer);
      socket.off('connect', onConnect);
      socket.off('wa:message', onMessage);
      socket.off('wa:status', onStatus);
      socket.off('wa:conversation', onConversation);
      socket.off('wa:reaction', onReaction);
    };
  }, [socket, selectedId, qc, emit, maybeMarkRead]);

  // On select: join the thread room + mark read.
  useEffect(() => {
    if (!selectedId) return;
    // A freshly opened conversation lands at the bottom (or first-unread), so
    // treat it as "at bottom" until the user actually scrolls up.
    isAtBottomRef.current = true;
    emit('wa:open', selectedId);
    // Gated like every other receipt. This path was completely ungated, and
    // `selectedId` is restored from the URL on mount — so a console reopened in
    // a background tab, or a session restored by the browser, blue-ticked the
    // customer without anyone having looked at the thread.
    maybeMarkRead();
    return () => emit('wa:close', selectedId);
  }, [selectedId, emit, qc, maybeMarkRead]);

  // Keep a live reference to the merged messages so the scroll layout-effect can
  // read them without `messages` being a dependency (which would scroll on every
  // message change). Layout effect (not effect) so it runs BEFORE the scroll
  // layout-effect in the same commit. Runs every render — cheap.
  useLayoutEffect(() => {
    messagesRef.current = messages;
  });

  // Announce a newly arrived inbound to assistive tech (see `liveRegionRef`).
  //
  // The FIRST message seen on a thread is recorded without announcing it: it is
  // the newest message of a conversation the user just opened, not something
  // that arrived while they were reading. The same guard covers a thread switch,
  // because the recorded conversation id changes with it.
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!selectedId || !last) return;
    const seen = announcedRef.current;
    if (seen.convId !== selectedId) {
      announcedRef.current = { convId: selectedId, messageId: last.id };
      return;
    }
    if (seen.messageId === last.id) return;
    announcedRef.current = { convId: selectedId, messageId: last.id };
    if (last.direction !== 'INBOUND') return;
    const node = liveRegionRef.current;
    if (!node) return;
    const who = selected ? displayName(selected.contact) : 'the customer';
    const body = stripWhatsAppFormatting(last.text ?? '').trim();
    // Falls back to the type rather than announcing an empty sentence — a photo
    // with no caption is still worth knowing about.
    const what = body || last.type.toLowerCase().replace(/_/g, ' ');
    node.textContent = `New message from ${who}: ${what}`;
  }, [messages, selectedId, selected]);

  // Auto-scroll on open/switch/reload:
  //  • no unread  → jump INSTANTLY to the newest message (chat opens at bottom);
  //  • has unread → jump to the FIRST unread message so the whole unread block
  //    can be read downward, instead of landing at the absolute bottom and
  //    having to scroll back up.
  // After the initial scroll, new messages arriving while viewing smooth-scroll
  // to the bottom. Keyed off the last message id so prepending older messages
  // doesn't yank the viewport. `behavior: 'instant'` takes the SmoothScroll
  // override's native fast-path (scrolls the panel, not the page).
  const lastMessageId = messages[messages.length - 1]?.id;
  const initialScrolledConvRef = useRef<string | null>(null);
  // The anchor we have already scrolled to. Clicking a second search hit in the
  // conversation that is ALREADY open is not a conversation switch, so without
  // this the thread would refetch around the new message and never move.
  const scrolledAnchorRef = useRef<string | null>(null);
  // Layout effect: position the scroll BEFORE the browser paints, so the thread
  // appears already at the right spot (bottom / first unread) with no visible
  // "land at top then jump" flash — like the WhatsApp app.
  useLayoutEffect(() => {
    const el = endRef.current;
    if (!el || !selectedId) return;
    const msgs = messagesRef.current;
    if (msgs.length === 0) return;
    const isInitial =
      initialScrolledConvRef.current !== selectedId ||
      scrolledAnchorRef.current !== anchorMessageId;
    if (!isInitial) {
      // Only follow new messages when already near the bottom, or when WE sent
      // the latest one. If the agent scrolled up to read history, leave the
      // viewport put — the jump button's badge signals there's more below.
      const lastMsg = msgs[msgs.length - 1];
      if (isAtBottomRef.current || lastMsg?.direction === 'OUTBOUND') {
        el.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
      return;
    }
    initialScrolledConvRef.current = selectedId;
    scrolledAnchorRef.current = anchorMessageId;
    // A search hit wins over the unread marker: the operator asked for THIS
    // message, so centre it rather than opening at the unread block or the end.
    if (anchorMessageId) {
      const hit = document.getElementById(`wa-msg-${anchorMessageId}`);
      if (hit) {
        hit.scrollIntoView({ behavior: 'instant', block: 'center' });
        return;
      }
    }
    const unread = openUnread?.convId === selectedId ? openUnread.count : 0;
    if (unread > 0) {
      // First unread = the `unread`-th INBOUND message counting from the end.
      let remaining = unread;
      let firstUnreadIdx = -1;
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].direction === 'INBOUND' && --remaining === 0) {
          firstUnreadIdx = i;
          break;
        }
      }
      // More unread than currently loaded → start at the top of what's loaded.
      if (firstUnreadIdx < 0) firstUnreadIdx = 0;
      const target = document.getElementById(`wa-msg-${msgs[firstUnreadIdx].id}`);
      if (target) {
        target.scrollIntoView({ behavior: 'instant', block: 'start' });
        return;
      }
    }
    el.scrollIntoView({ behavior: 'instant', block: 'end' });
  }, [lastMessageId, selectedId, openUnread, anchorMessageId]);

  // ── Offline outbox ────────────────────────────────────────────────────────
  //
  // Pull the durable queue into render state.
  const refreshOutbox = useCallback(async () => {
    setOutbox(await listOutbox());
  }, []);

  /** Park a reply in the outbox and reset the composer as if it had gone out. */
  const queueOffline = useCallback(
    async (conversationId: string, text: string, contextWamid?: string) => {
      await enqueueOutbox({
        id: makeOptimisticMessage('', '', text).id,
        conversationId,
        text,
        contextWamid,
        createdAt: new Date().toISOString(),
      });
      await refreshOutbox();
      setDraft('');
      setReplyTo(null);
      showToast.info('No connection — queued. It will send by itself once you are back online.');
    },
    // `setDraft` is now conversation-scoped, so it changes identity with the open
    // thread and has to be a real dependency — omitting it would clear the draft
    // of whichever conversation was open when this callback was created.
    [refreshOutbox, setDraft],
  );

  /** Drop a queued reply the operator no longer wants sent. */
  const discardQueued = useCallback(
    async (id: string) => {
      await removeOutbox(id);
      await refreshOutbox();
    },
    [refreshOutbox],
  );

  /**
   * Push whatever is queued, then say what happened to it.
   *
   * Every outcome is reported: a queued reply that silently disappears is the
   * exact failure the outbox exists to end, so an expired or rejected entry has
   * to surface rather than being swept up by the drain.
   */
  const runDrain = useCallback(async () => {
    const result = await drainOutbox((entry) =>
      svc.sendMessage(entry.conversationId, entry.text, entry.contextWamid),
    );
    await refreshOutbox();
    if (!result) return; // another tab holds the drain lock — it is sending them
    if (result.sent > 0) {
      showToast.success(
        `${result.sent} queued message${result.sent > 1 ? 's' : ''} sent now that you are back online`,
      );
      void qc.invalidateQueries({ queryKey: ['wa-messages'] });
      void qc.invalidateQueries({ queryKey: ['wa-conversations'] });
    }
    for (const drop of result.dropped) {
      const preview = drop.entry.text.slice(0, 40);
      if (drop.reason === 'expired') {
        showToast.error(
          `Queued reply "${preview}" expired — WhatsApp only accepts free-form replies for 24 hours. Send it as a template.`,
        );
      } else if (drop.reason === 'exhausted') {
        showToast.error(`Queued reply "${preview}" could not be sent and was discarded.`);
      } else {
        showToast.error(drop.message || `Queued reply "${preview}" was rejected.`);
      }
    }
  }, [qc, refreshOutbox]);

  // Drain on mount as well as on `online`: an entry outlives the tab that queued
  // it, so a reload while offline (then online) must not strand it.
  useEffect(() => {
    const onOnline = () => void runDrain();
    window.addEventListener('online', onOnline);
    // The mount kick runs on the next tick rather than inside the effect body:
    // the drain reports its outcome through toasts and query invalidation, and
    // firing that synchronously with mount cascades a second render before the
    // inbox has painted once.
    const kick = window.setTimeout(onOnline, 0);
    return () => {
      window.clearTimeout(kick);
      window.removeEventListener('online', onOnline);
    };
  }, [runDrain]);

  // Optimistic text send: insert a temporary QUEUED bubble immediately, then
  // reconcile (drop it; the real server message arrives via refetch) on
  // success, or flip it to FAILED on error so it can be retried in-place.
  const sendMut = useMutation({
    // `conversationId` travels with the send instead of being read off
    // `selectedId` again in the callbacks: onError resolves asynchronously, and
    // the operator can have switched threads by then — queueing the failed reply
    // against whatever is open NOW would deliver it to a different customer.
    mutationFn: (vars: {
      conversationId: string;
      text: string;
      optimisticId: string;
      contextWamid?: string;
    }) => svc.sendMessage(vars.conversationId, vars.text, vars.contextWamid),
    onMutate: (vars) => {
      if (!selected) return;
      const optimistic = makeOptimisticMessage(selected.id, selected.contactId, vars.text);
      optimistic.id = vars.optimisticId;
      optimistic.contextWamid = vars.contextWamid ?? null;
      setPendingMessages((prev) => [...prev, optimistic]);
      // Cleared HERE, not in onSuccess. The optimistic bubble already carries the
      // text and the FAILED-bubble retry path restores it, so nothing is lost —
      // but leaving it in the box until the server answers meant that on a slow
      // link the operator read a full composer as "it didn't take", pressed Enter
      // again, and the customer received the reply twice (billed twice, with no
      // unsend). The `isPending` guard in `submitDraft` is the other half.
      setDraft('');
      setReplyTo(null);
      // Replying means you've seen the thread → drop the unread divider.
      setOpenUnread({ convId: selected.id, count: 0 });
    },
    onSuccess: (res, vars) => {
      // Merge the canonical server message into the cache FIRST so it renders in
      // place of the optimistic bubble with no gap (no refetch, no disappear/
      // reappear flicker), THEN drop the optimistic bubble.
      const real = res?.data;
      if (real) mergeMessageIntoCache(qc, real.conversationId, real, orphanStatusRef.current);
      setPendingMessages((prev) => prev.filter((m) => m.id !== vars.optimisticId));
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
    },
    onError: (e, vars) => {
      // No network at all, so the request never left the machine and cannot have
      // reached Meta: park it in the durable outbox rather than leaving a red
      // bubble that disappears at the next conversation switch.
      //
      // Deliberately NOT extended to every transport-level error. A `statusCode
      // 0` while the browser still believes it is online may be a connection
      // dropped mid-flight, and the send endpoint carries no idempotency key —
      // auto-replaying a request that might have landed shows the customer the
      // same reply twice. Those keep the manual-retry bubble.
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setPendingMessages((prev) => prev.filter((m) => m.id !== vars.optimisticId));
        void queueOffline(vars.conversationId, vars.text, vars.contextWamid);
        return;
      }
      // Rollback to a FAILED bubble (keeps the text for one-tap retry).
      setPendingMessages((prev) =>
        prev.map((m) =>
          m.id === vars.optimisticId
            ? { ...m, status: 'FAILED', errorTitle: errorMessage(e) || null }
            : m,
        ),
      );
      showToast.error(errorMessage(e, 'Failed to send message'));
    },
  });

  // Submit the composer draft as an optimistic send (quoting replyTo if set).
  const submitDraft = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!selectedId) return;
    // A send is already in flight. The textarea has no disabled state and calls
    // this directly on keydown, bypassing the submit Button whose isLoading
    // would have stopped it — so without this a second Enter on a slow link
    // sends the same reply twice.
    if (sendMut.isPending) return;
    const contextWamid = replyTo?.wamid ?? undefined;
    // Known-offline: skip the request the browser would refuse to make anyway and
    // queue straight away, so the composer clears and the operator can carry on
    // working the thread instead of collecting red bubbles.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      void queueOffline(selectedId, trimmed, contextWamid);
      return;
    }
    sendMut.mutate({
      conversationId: selectedId,
      text: trimmed,
      optimisticId: makeOptimisticMessage('', '', trimmed).id,
      contextWamid,
    });
  };

  // Re-send a FAILED message: remove the failed bubble, fire a fresh send.
  const retrySend = (text: string, failedId?: string, contextWamid?: string) => {
    if (!selectedId) return;
    if (failedId) setPendingMessages((prev) => prev.filter((m) => m.id !== failedId));
    sendMut.mutate({
      conversationId: selectedId,
      text,
      optimisticId: makeOptimisticMessage('', '', text).id,
      // Carried through, so retrying a failed reply still quotes what it replied
      // to. The endpoint has always accepted it; retry simply never passed it, so
      // the resent message arrived detached from its question.
      contextWamid,
    });
  };

  const workflowMut = useMutation({
    mutationFn: (vars: { type: 'assign' } | { type: 'status'; status: WaConversationStatus }) => {
      // The label the SERVER says this session stamps, not one this page
      // reconstructed — see `operatorLabel` above. The button is disabled until
      // it is known, so this cannot assign a thread to a name nothing matches.
      if (vars.type === 'assign') return svc.assign(selectedId as string, operatorLabel as string);
      return svc.setStatus(selectedId as string, vars.status);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-conversation', selectedId] });
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
    },
    onError: (e) => showToast.error(errorMessage(e, 'Action failed')),
  });

  // Load older messages: page on a COMPOUND cursor (oldest createdAt + its id).
  //
  // Meta stamps inbound messages to the second, so paging on the timestamp alone
  // skipped every other message sharing that boundary second — on a busy thread
  // "Load older" quietly lost messages and nothing indicated a gap.
  const loadOlderMut = useMutation({
    mutationFn: () => {
      const oldest = messages[0]?.createdAt;
      const oldestId = messages[0]?.id;
      return svc.getMessages(selectedId as string, oldest, oldestId);
    },
    onSuccess: (res) => {
      const older = res.data?.items ?? [];
      if (older.length === 0) {
        setHasMoreOlder(false);
        return;
      }
      // Prepended into the SAME query entry as the newest page, not into a
      // separate component buffer. The buffer was invisible to the `wa:status`
      // and `wa:reaction` cache patches, so once an operator scrolled back
      // through history the ticks and reactions on those bubbles silently
      // stopped updating until the thread was reloaded.
      qc.setQueryData(msgQueryKey, (old: ApiResponse<{ items: WaMessage[] }> | undefined) => {
        if (!old?.data?.items) return old;
        const seen = new Set(old.data.items.map((m) => m.id));
        const add = older.filter((m) => !seen.has(m.id));
        if (add.length === 0) return old;
        return { ...old, data: { ...old.data, items: [...add, ...old.data.items] } };
      });
    },
    onError: (e) => showToast.error(errorMessage(e, 'Failed to load older messages')),
  });

  // Name of the file currently uploading, for the in-thread indicator. A media
  // send used to have no visible state at all beyond a disabled attach button:
  // no bubble, no spinner, no filename, so a large upload looked like nothing
  // had happened.
  const [uploadingName, setUploadingName] = useState<string | null>(null);

  // Bytes-sent percentage for that same indicator. A filename on its own cannot
  // distinguish a 4 MB attachment crawling up a slow uplink from an upload that
  // has stalled outright, so the operator's only options were to wait blindly or
  // to send it again. null while a percentage is not yet known.
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  /**
   * The in-flight upload's abort handle.
   *
   * A ref, not state: pressing Cancel must reach the CURRENT request, and a
   * re-render is neither needed nor wanted — the Cancel button's visibility is
   * already driven by `uploadingName`.
   */
  const uploadAbortRef = useRef<AbortController | null>(null);

  // A multi-file attach / drop / paste, in the order it was picked, together with
  // the thread it was picked FOR. Sending five screenshots meant five round trips
  // through the attach menu; now one pick fills this and each file still gets its
  // own preview and its own caption.
  //
  // The conversation id rides along so a switch discards the pick by derivation
  // instead of by an effect — attachments belong to the thread they were dropped
  // into, and carrying them across would open the next preview against whoever
  // the agent moved on to, then send that customer someone else's screenshot.
  const [mediaPick, setMediaPick] = useState<{ convId: string | null; files: File[] }>({
    convId: null,
    files: [],
  });
  const mediaFiles = mediaPick.convId === selectedId ? mediaPick.files : NO_FILES;
  /** Drop the file at the head of the pick — sent, or cancelled. */
  const advanceMedia = useCallback(() => {
    setMediaPick((p) => ({ ...p, files: p.files.slice(1) }));
  }, []);

  /**
   * Funnel for EVERY way a file can arrive — attach menu, paste, drop. Oversized
   * files are reported and dropped individually rather than failing the whole
   * batch, which would make the operator re-pick the ones that were fine.
   */
  const queueMedia = useCallback(
    (files: File[]) => {
      const accepted: File[] = [];
      for (const file of files) {
        try {
          assertWaMediaSize(file);
          accepted.push(file);
        } catch (err) {
          showToast.error(err instanceof Error ? err.message : 'File is too large');
        }
      }
      if (accepted.length === 0) return;
      setMediaPick((p) => ({
        convId: selectedId,
        // A pick left over from another thread is replaced, never appended to.
        files: p.convId === selectedId ? [...p.files, ...accepted] : accepted,
      }));
    },
    [selectedId],
  );

  // One idempotency key per PICKED FILE, held for as long as that file is around.
  //
  // A large attachment on a slow uplink can outlive the client timeout while the
  // backend goes on to upload it to Meta and deliver it. The operator sees
  // "Failed to send media" and sends again — and without a key the second
  // request is indistinguishable from a genuine second send, so the customer got
  // the file twice and the account was billed twice. Keyed on the File object so
  // re-picking the same file later is still a real second send.
  const mediaSendKeys = useRef(new WeakMap<File, string>());
  const idempotencyKeyFor = (file: File): string => {
    let key = mediaSendKeys.current.get(file);
    if (!key) {
      key = crypto.randomUUID();
      mediaSendKeys.current.set(file, key);
    }
    return key;
  };

  const sendMediaMut = useMutation({
    mutationFn: ({
      file,
      caption,
      voice,
      contextWamid,
    }: {
      file: File;
      caption?: string;
      voice?: boolean;
      contextWamid?: string;
    }) => {
      setUploadingName(file.name);
      setUploadPct(0);
      const ac = new AbortController();
      uploadAbortRef.current = ac;
      return svc.sendMedia(
        selectedId as string,
        file,
        caption,
        voice,
        idempotencyKeyFor(file),
        setUploadPct,
        contextWamid,
        ac.signal,
      );
    },
    onSettled: () => {
      setUploadingName(null);
      setUploadPct(null);
      uploadAbortRef.current = null;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-messages', selectedId] });
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
      if (selectedId) setOpenUnread({ convId: selectedId, count: 0 });
    },
    onError: (e) => {
      // The operator pressed Cancel. Reporting their own action back to them as
      // "Failed to send media" reads as a fault and invites a pointless retry.
      const msg = errorMessage(e, '');
      if ((e as { code?: string })?.code === 'ERR_CANCELED' || /cancel/i.test(msg)) {
        showToast.info('Upload cancelled');
        return;
      }
      showToast.error(msg || 'Failed to send media');
    },
  });

  // The file on the pre-send sheet (preview + caption) is simply the head of the
  // pick, and the sheet steps to the next one only once the previous file has
  // left the queue AND its upload has finished — so a five-file pick is five
  // ordered sends, each with its own preview and its own caption, rather than a
  // second preview opening over an upload the operator is still watching.
  //
  // The picker used to fire straight into the upload, so a mis-picked file
  // reached the customer before anyone could see it, and media could never carry
  // a caption even though the API accepts one.
  const pendingMedia = sendMediaMut.isPending ? null : (mediaFiles[0] ?? null);
  /** The files still waiting behind the sheet, for the "+N queued" badge. */
  const mediaQueuedCount = Math.max(0, mediaFiles.length - (pendingMedia ? 1 : 0));

  // Drag-and-drop onto the open thread.
  //
  // `dragDepth` counts enter/leave pairs. dragleave fires as the pointer crosses
  // each message bubble inside the pane, so a single boolean made the highlight
  // flicker off and on for the whole traverse.
  const [dropActive, setDropActive] = useState(false);
  const dragDepth = useRef(0);
  const dragHasFiles = (dt: DataTransfer | null) => !!dt && Array.from(dt.types).includes('Files');
  const onThreadDragEnter = (e: React.DragEvent) => {
    if (!dragHasFiles(e.dataTransfer)) return;
    dragDepth.current += 1;
    setDropActive(true);
  };
  const onThreadDragOver = (e: React.DragEvent) => {
    if (!dragHasFiles(e.dataTransfer)) return;
    // Without this the browser treats the drop as navigation and replaces the
    // inbox with the dropped file.
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onThreadDragLeave = (e: React.DragEvent) => {
    if (!dragHasFiles(e.dataTransfer)) return;
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDropActive(false);
    }
  };
  const onThreadDrop = (e: React.DragEvent) => {
    if (!dragHasFiles(e.dataTransfer)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDropActive(false);
    queueMedia(Array.from(e.dataTransfer.files));
  };

  // "Delete for me" — soft-delete single/selected messages from the inbox view.
  const deleteMessagesMut = useMutation({
    mutationFn: (ids: string[]) => svc.deleteMessages(selectedId as string, ids),
    onSuccess: (_res, ids) => {
      const del = new Set(ids);
      // Patch the cache directly as well as invalidating. The refetch only
      // covers the newest page, and history older than it is RETAINED across a
      // refetch (see msgQuery's queryFn) — so a deleted message scrolled back to
      // would otherwise stay on screen even though the server no longer returns
      // it. pendingMessages is a client-held buffer and needs the same.
      qc.setQueriesData(
        { queryKey: ['wa-messages', selectedId] },
        (old: ApiResponse<{ items: WaMessage[] }> | undefined) => {
          if (!old?.data?.items) return old;
          const items = old.data.items.filter((m) => !del.has(m.id));
          return items.length === old.data.items.length
            ? old
            : { ...old, data: { ...old.data, items } };
        },
      );
      setPendingMessages((prev) => prev.filter((m) => !del.has(m.id)));
      qc.invalidateQueries({ queryKey: ['wa-messages', selectedId] });
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
      exitMessageSelection();
      showToast.success(ids.length > 1 ? `${ids.length} messages deleted` : 'Message deleted');
    },
    onError: (e) => showToast.error(errorMessage(e, 'Failed to delete')),
  });
  const deleteOneMessage = (id: string) => deleteMessagesMut.mutate([id]);
  const deleteSelectedMessages = () => {
    if (selectedMessageIds.size > 0) deleteMessagesMut.mutate([...selectedMessageIds]);
  };
  const copySelectedMessages = () => {
    const texts = messages
      .filter((m) => selectedMessageIds.has(m.id) && m.text?.trim())
      .map((m) => (m.text as string).trim());
    if (texts.length > 0) copyMessageText(texts.join('\n'));
    exitMessageSelection();
  };

  // Archive / unarchive the open conversation.
  /**
   * Put the open thread back in the unread queue.
   *
   * Opening a thread to triage it costs its bold row, its badge and its place in
   * the Unread filter, with no way back — and the customer has already been
   * blue-ticked either way. The alternatives all say something different to the
   * team: PENDING means "in progress", a snooze means "not until later".
   *
   * Deliberately NOT presented as undoing the read receipt, because it cannot:
   * Meta has no un-read call and a sent receipt cannot be withdrawn.
   */
  const markUnreadMut = useMutation({
    mutationFn: () => svc.markUnread(selectedId as string),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
      qc.invalidateQueries({ queryKey: ['wa-inbox-unread-total'] });
      // Drop the open-thread unread snapshot so the divider recomputes.
      setOpenUnread(null);
      showToast.success('Marked unread — the customer still sees it as read');
    },
    onError: (e) => showToast.error(errorMessage(e, 'Could not mark unread')),
  });

  const pinMut = useMutation({
    mutationFn: (pinned: boolean) => svc.pinConversation(selectedId as string, pinned),
    onSuccess: (_r, pinned) => {
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
      qc.invalidateQueries({ queryKey: ['wa-conversation', selectedId] });
      showToast.success(pinned ? 'Pinned to the top' : 'Unpinned');
    },
    // The server caps pins (409 WA_PIN_LIMIT) and its message names the cap, so
    // it is shown as-is rather than replaced with a generic failure.
    onError: (e) => showToast.error(errorMessage(e, 'Could not pin this conversation')),
  });

  /**
   * Mute for a fixed span, or unmute.
   *
   * Offered as durations rather than a picker: the operator muting a thread is
   * mid-triage and wants it to stop, not to reason about a datetime.
   */
  const muteMut = useMutation({
    mutationFn: (hours: number | null) =>
      svc.muteConversation(
        selectedId as string,
        hours === null ? null : new Date(Date.now() + hours * 3600_000).toISOString(),
      ),
    onSuccess: (_r, hours) => {
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
      qc.invalidateQueries({ queryKey: ['wa-conversation', selectedId] });
      showToast.success(
        hours === null
          ? 'Notifications back on'
          : `Muted for ${hours < 24 ? `${hours}h` : `${hours / 24}d`} — the thread stays in the queue`,
      );
    },
    onError: (e) => showToast.error(errorMessage(e, 'Could not mute this conversation')),
  });
  const muteMenuRef = useRef<HTMLDivElement>(null);
  const [muteOpen, setMuteOpen] = useState(false);
  useClickOutside(muteMenuRef, () => setMuteOpen(false), muteOpen);

  /**
   * Search inside the open thread.
   *
   * The inbox search finds the CONVERSATION and stops — one newest hit per
   * thread, no way to reach the other forty. Every hit here reuses the existing
   * `searchAnchor` deep-link, which already loads the thread around a message
   * and highlights it, so walking the results costs no new machinery.
   */
  const [threadSearchOpen, setThreadSearchOpen] = useState(false);
  const [threadSearchQ, setThreadSearchQ] = useState('');
  // Same pattern as the list search above: the input stays bound to the
  // immediate value while the query key uses the debounced one, so typing does
  // not fire a query per keystroke.
  const [debouncedThreadSearchQ, setDebouncedThreadSearchQ] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedThreadSearchQ(threadSearchQ), 300);
    return () => window.clearTimeout(id);
  }, [threadSearchQ]);
  const threadSearchQuery = useQuery({
    queryKey: ['wa-thread-search', selectedId, debouncedThreadSearchQ],
    queryFn: () => svc.searchThreadMessages(selectedId as string, debouncedThreadSearchQ),
    enabled: threadSearchOpen && !!selectedId && debouncedThreadSearchQ.trim().length >= 3,
  });
  const threadHits = threadSearchQuery.data?.data;

  const starMut = useMutation({
    mutationFn: (v: { messageId: string; starred: boolean }) =>
      svc.starMessage(selectedId as string, v.messageId, v.starred),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wa-messages', selectedId] }),
    onError: (e) => showToast.error(errorMessage(e, 'Could not star that message')),
  });

  const archiveMut = useMutation({
    mutationFn: (archived: boolean) => svc.archiveConversation(selectedId as string, archived),
    onSuccess: (_res, archived) => {
      showToast.success(archived ? 'Conversation archived' : 'Conversation restored');
      qc.invalidateQueries({ queryKey: ['wa-conversation', selectedId] });
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
    },
    onError: (e) => showToast.error(errorMessage(e, 'Failed to archive')),
  });

  // "Verified" on the identity-change banner. Clearing the flag is a security
  // decision an agent takes after checking, so it is audited server-side rather
  // than reset by the next inbound message.
  const identityAckMut = useMutation({
    mutationFn: (id: string) => svc.acknowledgeIdentityChange(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-conversation', selectedId] });
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
    },
    onError: (e) => showToast.error(errorMessage(e, 'Failed to clear the warning')),
  });

  // Request a CSAT rating from the contact (only while the 24h window is open).
  const csatMut = useMutation({
    mutationFn: () => svc.requestCsat(selectedId as string),
    onSuccess: () => {
      showToast.success('Rating request sent');
      qc.invalidateQueries({ queryKey: ['wa-conversation', selectedId] });
    },
    onError: (e) => showToast.error(errorMessage(e, 'Failed to request rating')),
  });

  // Export the current conversation transcript as CSV.
  const transcriptMut = useMutation({
    mutationFn: (opts: { notes?: boolean; includeDeleted?: boolean } = {}) =>
      svc.exportTranscript(selectedId as string, opts),
    onError: (e) => showToast.error(errorMessage(e, 'Failed to export')),
  });
  /** Which extras the export menu will include; per-session, not persisted. */
  const [exportNotes, setExportNotes] = useState(false);
  const [exportDeleted, setExportDeleted] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  useClickOutside(exportMenuRef, () => setExportOpen(false), exportOpen);

  // ── Bulk selection (page id list OR "all matching the filter") ──
  const pageConvIds = conversations.map((c) => c.id);
  const allConvSelected = pageConvIds.length > 0 && pageConvIds.every((id) => selectedIds.has(id));
  const someConvSelected = selectedIds.size > 0 && !allConvSelected;
  // Must mirror the list filters exactly: anything omitted here is not applied
  // when "select all N matching" runs, so the action lands on a WIDER set than
  // the operator can see. `labels` was missing, which meant a bulk archive under
  // a label filter archived the whole inbox.
  const convBulkFilters = {
    q: debouncedSearch || undefined,
    unreadOnly,
    status: statusParam,
    assignedTo: assignedToParam,
    labels: labelsParam,
    channelId: channelParam,
    searchMessages,
    includeArchived,
    includeSnoozed,
    archivedOnly,
    snoozedOnly,
    awaitingOnly,
    from: dateFrom || undefined,
    to: dateTo || undefined,
  };
  // `total` counts the PAGED list, which excludes pinned rows; the bulk
  // "select all matching" where-clause does not exclude them. Adding them back
  // keeps the number the operator confirms equal to the number acted on.
  const totalMatchingConv =
    firstPage?.total != null && firstPage.total >= 0
      ? firstPage.total + (firstPage.pinned?.length ?? 0)
      : conversations.length;
  const canSelectAllMatchingConv = true;

  const toggleSelect = (id: string, checked: boolean) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const toggleSelectAllConv = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) pageConvIds.forEach((id) => next.add(id));
      else pageConvIds.forEach((id) => next.delete(id));
      return next;
    });
    if (!checked) setAllMatchingConv(false);
  };

  const clearConvSelection = () => {
    setSelectedIds(new Set());
    setAllMatchingConv(false);
  };

  const onConvBulkDone = () => {
    qc.invalidateQueries({ queryKey: ['wa-conversations'] });
    // ['wa-inbox-unread-total'] — the key the sidebar badge and this page
    // actually query. The old ['wa-unread-total'] matched no query anywhere in
    // the codebase, so bulk "Mark read" left the badge stale until a reload.
    qc.invalidateQueries({ queryKey: ['wa-inbox-unread-total'] });
    clearConvSelection();
  };

  const canReply = selected
    ? windowOpen(selected.windowExpiresAt) &&
      !selected.contact.isBlocked &&
      // Do-not-contact. Every outbound is refused for a suppressed contact, so
      // leaving the composer live only produced a red FAILED bubble after the
      // fact — the operator had already written the reply.
      !selected.contact.suppressedAt
    : false;

  /**
   * "typing…" on the customer's phone, at most once per TYPING_THROTTLE_MS per
   * conversation.
   *
   * The customer previously had no signal at all while an agent composed a long
   * reply — the thread just went quiet, which reads as being ignored. Gated on
   * `canReply` because the indicator rides on a read receipt Meta refuses once
   * the 24h window has closed, and fire-and-forget because a cosmetic signal must
   * never interrupt someone mid-sentence with an error toast.
   */
  const typingSentRef = useRef<{ convId: string; at: number }>({ convId: '', at: 0 });
  const notifyTyping = useCallback(() => {
    if (!selectedId || !canReply) return;
    const now = Date.now();
    const last = typingSentRef.current;
    // Keyed on the conversation as well as the time: switching threads must be
    // able to signal immediately rather than inherit the previous thread's clock.
    if (last.convId === selectedId && now - last.at < TYPING_THROTTLE_MS) return;
    typingSentRef.current = { convId: selectedId, at: now };
    void svc.sendTyping(selectedId).catch(() => {});
  }, [selectedId, canReply]);
  const [nowTs, setNowTs] = useState(0);
  useEffect(() => {
    const tick = () => setNowTs(Date.now());
    const id = window.setTimeout(tick, 0);
    const iv = window.setInterval(tick, 60_000);
    return () => {
      window.clearTimeout(id);
      window.clearInterval(iv);
    };
  }, []);
  const selectedSnoozed =
    !!selected?.snoozedUntil && new Date(selected.snoozedUntil).getTime() > nowTs;
  // Same 60s tick, so a mute that lapses turns the bell back on by itself rather
  // than waiting for the next navigation. `nowTs` starts at 0, which reads as
  // "not muted" for one frame — the honest direction to be wrong in, since the
  // alternative would silence a thread that is not muted.
  const selectedMuted = !!selected?.mutedUntil && new Date(selected.mutedUntil).getTime() > nowTs;
  // Time left on the 24h free-form window, recomputed on the same 60s tick so the
  // header chip counts down live. `nowTs` starts unset so the first paint matches
  // the server; measuring against 0 would flash a ~500,000h countdown, so the chip
  // stays hidden until the mount tick lands a frame later.
  const windowMsLeft = selected && nowTs > 0 ? windowRemaining(selected.windowExpiresAt, nowTs) : 0;

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="whatsapp.inbox.view"
    >
      {/* dvh, not vh. On mobile `100vh` is the LARGE viewport — it ignores the
          browser chrome — so a fixed-height, overflow-hidden box sized in vh
          pushes its bottom-anchored child (the composer) off screen. The root
          layout uses min-h-dvh for exactly this reason; the inbox was the one
          page that reintroduced vh, and the only one with a composer pinned to
          the bottom of a fixed-height box.

          The subtraction tracks DashboardLayout, whose vertical padding differs
          per breakpoint: pt-16/pb-20 (9rem) base, p-6/pb-20 (6.5rem) at sm,
          pt-8/pb-20 (7rem) at lg. A single -9rem was therefore correct on mobile
          only and over-subtracted everywhere else.

          The negative margins claw back most of pb-20. That padding exists to
          keep a page final row clear of the fixed BackToTop button — meaningful
          on a scrolling list, pure dead space under a viewport-height inbox that
          never scrolls. What is left is a gap matching each breakpoint side
          padding, so the box sits in the layout rather than on top of it. */}
      <div className="-mb-16 flex h-[calc(100dvh-5rem)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)] sm:-mb-14 sm:h-[calc(100dvh-3rem)] lg:-mb-12 lg:h-[calc(100dvh-4rem)]">
        {/* Conversation list — full width on mobile; hidden once a pane other
            than "list" is active below lg. */}
        <aside
          className={cn(
            'flex w-full shrink-0 flex-col border-r border-[var(--border)] lg:max-w-xs',
            mobilePane === 'list' ? 'flex' : 'hidden lg:flex',
          )}
        >
          <div className="border-b border-[var(--border)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <h1 className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
                <MessageCircle className="h-4 w-4 text-emerald-600" /> WhatsApp Inbox
              </h1>
              {/* Silent while the socket is healthy. The list polls and the badge
                  refetches on focus, so a dead socket presents as a queue that
                  advances above a thread that never does — this is the only thing
                  that says so. Retry refetches both queries rather than reloading. */}
              <RealtimeStatus
                onRetry={() => {
                  void convQuery.refetch();
                  void msgQuery.refetch();
                }}
              />
              <button
                type="button"
                onClick={() => setCompose({ mode: 'new' })}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700"
              >
                <Plus className="h-3.5 w-3.5" /> New
              </button>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  searchMessages ? 'Search messages, names, numbers…' : 'Search name or number…'
                }
                className="pl-9"
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setInboxFilters({ unread: !unreadOnly })}
                aria-pressed={unreadOnly}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  unreadOnly
                    ? 'bg-emerald-600 text-white'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]',
                )}
              >
                Unread only
              </button>
              <Tooltip content="Also match message text when searching">
                <button
                  type="button"
                  onClick={() => setInboxFilters({ searchMessages: !searchMessages })}
                  aria-pressed={searchMessages}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    searchMessages
                      ? 'bg-emerald-600 text-white'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]',
                  )}
                >
                  Search messages
                </button>
              </Tooltip>
              <Tooltip content="Threads where the customer is still waiting on a reply from us">
                <button
                  type="button"
                  onClick={() => setInboxFilters({ awaiting: !awaitingOnly })}
                  aria-pressed={awaitingOnly}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    awaitingOnly
                      ? 'bg-amber-600 text-white'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]',
                  )}
                >
                  Awaiting reply
                </button>
              </Tooltip>
              {/* Now that filters live in the URL they survive a reload, which
                  makes "why is my inbox empty?" a real way to lose an afternoon.
                  One control that returns to the unfiltered queue. */}
              {hasActiveInboxFilters(filters) && (
                <button
                  type="button"
                  onClick={() => setInboxFilters(DEFAULT_INBOX_FILTERS)}
                  className="ml-auto rounded-full px-2 py-1 text-xs font-medium text-[var(--text-muted)] underline hover:text-[var(--text)]"
                >
                  Clear filters
                </button>
              )}
              {/* Distinct from "Unread only": a thread an agent has READ and not
                  yet answered is the one most likely to be forgotten, and it is
                  invisible to every other filter here. */}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <div>
                <label
                  htmlFor="wa-sort"
                  className="mb-0.5 block text-[10px] font-medium tracking-wide text-[var(--text-muted)] uppercase"
                >
                  Sort
                </label>
                <Select
                  id="wa-sort"
                  size="sm"
                  clearable={false}
                  value={convSort}
                  onChange={(v) => setInboxFilters({ sort: v as InboxSort })}
                  options={[
                    { value: 'recent', label: 'Newest first' },
                    { value: 'oldest', label: 'Oldest first' },
                    { value: 'waiting', label: 'Waiting longest' },
                  ]}
                />
              </div>
              <div>
                <span className="mb-0.5 block text-[10px] font-medium tracking-wide text-[var(--text-muted)] uppercase">
                  Last activity
                </span>
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    value={dateFrom}
                    max={dateTo || undefined}
                    onChange={(e) => setInboxFilters({ from: e.target.value })}
                    aria-label="Active from"
                    className="w-full min-w-0 rounded-md border border-[var(--border)] bg-[var(--bg)] px-1.5 py-1 text-[11px] text-[var(--text)] outline-none focus:border-[var(--primary)]"
                  />
                  <input
                    type="date"
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={(e) => setInboxFilters({ to: e.target.value })}
                    aria-label="Active until"
                    className="w-full min-w-0 rounded-md border border-[var(--border)] bg-[var(--bg)] px-1.5 py-1 text-[11px] text-[var(--text)] outline-none focus:border-[var(--primary)]"
                  />
                </div>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {/* Archived and snoozed are SCOPES, not "also show" checkboxes:
                  the archive is its own view, and "what did I snooze?" is a
                  question the two old toggles could not ask. */}
              <Select
                id="wa-scope-filter"
                size="sm"
                clearable={false}
                value={scopeFilter}
                onChange={(v) => setInboxFilters({ scope: v as InboxScope })}
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'snoozed', label: 'Snoozed' },
                  { value: 'archived', label: 'Archived' },
                  { value: 'all', label: 'All conversations' },
                ]}
              />
              <Select
                size="sm"
                clearable={false}
                value={statusFilter}
                onChange={(v) => setInboxFilters({ status: v as string })}
                options={[
                  { value: 'all', label: 'All status' },
                  { value: 'OPEN', label: 'Open' },
                  { value: 'PENDING', label: 'Pending' },
                  { value: 'RESOLVED', label: 'Resolved' },
                ]}
              />
              <Select
                size="sm"
                clearable={false}
                value={assigneeFilter}
                onChange={(v) => setInboxFilters({ assignee: v as string })}
                options={[
                  { value: 'all', label: 'Anyone' },
                  { value: 'me', label: 'Assigned to me' },
                  { value: 'unassigned', label: 'Unassigned' },
                ]}
              />
              <Select
                size="sm"
                value={labelFilter}
                onChange={(v) => setInboxFilters({ label: v ?? '' })}
                options={[
                  { value: '', label: 'All labels' },
                  ...knownLabels.map((l) => ({ value: l, label: l })),
                ]}
              />
            </div>
            {/* Only worth screen space once a second number is connected — on a
                single-number install "All numbers" is the only possible answer. */}
            {channels.length > 1 && (
              <div className="mt-1.5">
                <Select
                  size="sm"
                  clearable={false}
                  value={channelFilter}
                  onChange={(v) => setInboxFilters({ channel: v ?? '' })}
                  options={[
                    { value: '', label: 'All numbers' },
                    ...channels.map((c) => ({
                      value: c.id,
                      label: c.displayName || c.displayPhone,
                    })),
                  ]}
                />
              </div>
            )}
          </div>
          {/* Persistent select-all (page) toggle so a selection can be started. */}
          <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg)] px-3 py-1.5">
            <input
              type="checkbox"
              aria-label="Select all conversations on this page"
              checked={allConvSelected}
              ref={(el) => {
                if (el) el.indeterminate = someConvSelected;
              }}
              onChange={(e) => toggleSelectAllConv(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-[var(--border)]"
            />
            <span className="text-[11px] text-[var(--text-muted)]">
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all on page'}
            </span>
          </div>
          <BulkActionBar
            ids={[...selectedIds]}
            totalMatching={totalMatchingConv}
            allMatching={allMatchingConv}
            filters={convBulkFilters}
            canSelectAllMatching={canSelectAllMatchingConv}
            onSelectAllMatching={() => setAllMatchingConv(true)}
            onClear={clearConvSelection}
            onDone={onConvBulkDone}
          />
          <div ref={convScrollRef} onScroll={syncConvWindow} className="flex-1 overflow-y-auto">
            {(convQuery.isLoading || awaitingOperatorLabel) && (
              <p className="p-4 text-center text-sm text-[var(--text-muted)]">Loading…</p>
            )}
            {convQuery.isError && (
              <div className="p-4 text-center">
                <p className="text-sm text-[var(--error)]">Could not load conversations.</p>
                <button
                  type="button"
                  onClick={() => convQuery.refetch()}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                >
                  <RotateCw className="h-3.5 w-3.5" /> Retry
                </button>
              </div>
            )}
            {!convQuery.isLoading &&
              !awaitingOperatorLabel &&
              !convQuery.isError &&
              conversations.length === 0 && (
                <p className="p-6 text-center text-sm text-[var(--text-muted)]">
                  No conversations yet. They appear here when someone messages your WhatsApp number.
                </p>
              )}
            {/* Only the slice around the viewport is mounted; the two spacers
                stand in for the rows above and below it (see CONV_ROW_H). */}
            <div
              ref={convRowsRef}
              role="listbox"
              aria-label="Conversations"
              aria-activedescendant={
                convCursorIndex >= 0 ? convOptionId(conversations[convCursorIndex].id) : undefined
              }
              tabIndex={0}
              onKeyDown={onConvListKeyDown}
              onFocus={(e) => {
                if (e.target !== e.currentTarget) return;
                setConvListFocused(true);
                // Start from the open thread rather than the top, so a list
                // focused after a `?c=` restore does not arrow away from where
                // the operator already is. Every other path (click, Enter) has
                // already put the cursor there, so this is a no-op for them.
                const open = conversations.findIndex((c) => c.id === selectedId);
                if (open >= 0) {
                  setConvCursor(open);
                  // Also scrolled into the window, so the row the
                  // `aria-activedescendant` names is actually mounted.
                  revealConvRow(open);
                }
              }}
              onBlur={(e) => {
                if (e.target === e.currentTarget) setConvListFocused(false);
              }}
              className="focus-visible:ring-primary/40 outline-none focus-visible:ring-2 focus-visible:ring-inset"
            >
              {convPadTop > 0 && <div style={{ height: convPadTop }} aria-hidden="true" />}
              {conversations.slice(convVisibleStart, convVisibleEnd).map((c, i) => {
                const index = convVisibleStart + i;
                return (
                  <ConversationRow
                    key={c.id}
                    conv={c}
                    active={c.id === selectedId}
                    cursor={convListFocused && index === convCursorIndex}
                    onClick={() => {
                      // Clicking is also a cursor move, so arrowing on from a row
                      // the operator just clicked continues from that row.
                      setConvCursor(index);
                      openConversation(c);
                    }}
                    selected={selectedIds.has(c.id)}
                    onToggleSelect={(checked) => toggleSelect(c.id, checked)}
                    highlight={debouncedSearch}
                  />
                );
              })}
              {convPadBottom > 0 && <div style={{ height: convPadBottom }} aria-hidden="true" />}
            </div>
            {convHasMore && (
              <div className="p-3">
                <button
                  type="button"
                  onClick={() => loadMoreConvMut.mutate()}
                  disabled={loadMoreConvMut.isPending}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-60"
                >
                  {loadMoreConvMut.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                  Load more
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Thread — full width on mobile; hidden when not the active pane below lg. */}
        <section
          className={cn(
            'min-w-0 flex-1 flex-col bg-[var(--bg-secondary)]/40',
            mobilePane === 'thread' ? 'flex' : 'hidden lg:flex',
          )}
        >
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center text-[var(--text-muted)]">
              <MessageCircle className="mb-3 h-12 w-12 opacity-30" />
              <p className="text-sm">Select a conversation to start chatting.</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bg)] px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  {/* Mobile back-to-list */}
                  <button
                    type="button"
                    onClick={() => setMobilePane('list')}
                    aria-label="Back to conversations"
                    className="shrink-0 rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)] lg:hidden"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <Avatar
                    firstName={avatarNames(selected.contact).first}
                    lastName={avatarNames(selected.contact).last}
                    alt={displayName(selected.contact)}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-semibold text-[var(--text)]">
                        {displayName(selected.contact)}
                      </span>
                      {selectedSnoozed && (
                        <Tooltip
                          content={`Snoozed until ${selected.snoozedUntil ? new Date(selected.snoozedUntil).toLocaleString() : ''}`}
                        >
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                            <Clock className="h-3 w-3" /> Snoozed
                          </span>
                        </Tooltip>
                      )}
                      {typeof selected.csatScore === 'number' && (
                        <Tooltip
                          content={
                            selected.csatComment
                              ? `Customer satisfaction: ${selected.csatScore}/5 — “${selected.csatComment}”`
                              : `Customer satisfaction: ${selected.csatScore}/5`
                          }
                        >
                          <span
                            className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
                            aria-label={`Customer rating ${selected.csatScore} out of 5`}
                          >
                            <Star
                              className="h-3 w-3 fill-amber-500 text-amber-500"
                              aria-hidden="true"
                            />
                            {selected.csatScore}/5
                          </span>
                        </Tooltip>
                      )}
                      {/* Live 24h-window countdown. Enforcement was already exact
                          but invisible: the agent only learned the window had shut
                          when the composer vanished mid-draft, so the last minutes
                          were spent typing a reply that could no longer be sent. */}
                      {canReply && windowMsLeft > 0 && (
                        <Tooltip
                          content={`Free-form replies for another ${fmtRemaining(windowMsLeft)} (until ${fmtTime(selected.windowExpiresAt)}). After that only approved templates can be sent.`}
                        >
                          <span
                            className={cn(
                              'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                              windowMsLeft < WINDOW_WARN_MS
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]',
                            )}
                            aria-label={`Free replies for ${fmtRemaining(windowMsLeft)}`}
                          >
                            <Hourglass className="h-3 w-3" aria-hidden="true" />
                            Free replies {fmtRemaining(windowMsLeft)}
                          </span>
                        </Tooltip>
                      )}
                    </div>
                    {/* One line, not four. The phone, the consent chip and the labels
                        were each on their own row, so the header grew as tall as
                        whatever the contact happened to have — while the space to the
                        right of it sat empty. They are all short, so they read fine
                        side by side and wrap only when they genuinely run out of room. */}
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-xs text-[var(--text-muted)]">{selected.contact.phone}</p>
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                          INBOX_OPT_IN_STYLE[selected.contact.optInStatus],
                        )}
                      >
                        {selected.contact.optInStatus.replace('_', ' ')}
                      </span>
                      {selected.labels?.length > 0 && (
                        <span className="flex flex-wrap items-center gap-1">
                          <TagIcon
                            className="h-3 w-3 shrink-0 text-[var(--text-muted)]"
                            aria-hidden="true"
                          />
                          {selected.labels.map((label) => (
                            <span
                              key={label}
                              className="text-primary inline-flex items-center rounded-full bg-[var(--primary-light)] px-2 py-0.5 text-[10px] font-medium"
                            >
                              {label}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {/* Request rating — only meaningful while the 24h window is open */}
                  {canReply && typeof selected.csatScore !== 'number' && (
                    <Tooltip
                      content="Ask the customer to rate this conversation"
                      className="hidden sm:flex"
                    >
                      <button
                        type="button"
                        onClick={() => csatMut.mutate()}
                        disabled={csatMut.isPending}
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-60"
                      >
                        <Star className="h-3.5 w-3.5" /> Request rating
                      </button>
                    </Tooltip>
                  )}
                  <Tooltip content="Search in this conversation">
                    <button
                      type="button"
                      onClick={() => setThreadSearchOpen((v) => !v)}
                      aria-label="Search in this conversation"
                      aria-pressed={threadSearchOpen}
                      className={cn(
                        'rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--bg-secondary)]',
                        threadSearchOpen
                          ? 'bg-[var(--bg-secondary)] text-[var(--text)]'
                          : 'text-[var(--text-secondary)]',
                      )}
                    >
                      <Search className="h-4 w-4" />
                    </button>
                  </Tooltip>
                  {/* Export, with the two extras the endpoint has always
                      accepted and the client never sent. A menu rather than more
                      header buttons: the plain CSV is the common case and stays
                      one click away. */}
                  <div className="relative" ref={exportMenuRef}>
                    <Tooltip content="Export transcript (CSV)">
                      <button
                        type="button"
                        onClick={() => setExportOpen((v) => !v)}
                        disabled={transcriptMut.isPending}
                        aria-label="Export transcript"
                        aria-haspopup="menu"
                        aria-expanded={exportOpen}
                        className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-60"
                      >
                        {transcriptMut.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </button>
                    </Tooltip>
                    {exportOpen && (
                      <div
                        role="menu"
                        aria-label="Export options"
                        className="absolute top-9 right-0 z-30 w-60 rounded-lg border border-[var(--border)] bg-white p-2 shadow-lg"
                      >
                        <label className="flex items-start gap-2 rounded px-2 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--bg-secondary)]">
                          <input
                            type="checkbox"
                            checked={exportNotes}
                            onChange={(e) => setExportNotes(e.target.checked)}
                            className="mt-0.5"
                          />
                          <span>
                            Include internal notes
                            <span className="block text-[10px] text-[var(--text-muted)]">
                              Never shown to the customer
                            </span>
                          </span>
                        </label>
                        <label className="flex items-start gap-2 rounded px-2 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--bg-secondary)]">
                          <input
                            type="checkbox"
                            checked={exportDeleted}
                            onChange={(e) => setExportDeleted(e.target.checked)}
                            className="mt-0.5"
                          />
                          <span>
                            Include deleted messages
                            <span className="block text-[10px] text-[var(--text-muted)]">
                              Deleted on our side; the customer kept their copy
                            </span>
                          </span>
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            transcriptMut.mutate({
                              notes: exportNotes,
                              includeDeleted: exportDeleted,
                            });
                            setExportOpen(false);
                          }}
                          className="mt-1 w-full rounded-md bg-emerald-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                        >
                          Download CSV
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="relative" ref={muteMenuRef}>
                    <Tooltip
                      content={
                        selectedMuted
                          ? `Muted until ${new Date(selected.mutedUntil as string).toLocaleString()}`
                          : 'Mute notifications'
                      }
                    >
                      <button
                        type="button"
                        onClick={() => setMuteOpen((v) => !v)}
                        disabled={muteMut.isPending}
                        aria-label="Mute notifications"
                        aria-haspopup="menu"
                        aria-expanded={muteOpen}
                        className={cn(
                          'rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--bg-secondary)] disabled:opacity-60',
                          selectedMuted ? 'text-amber-600' : 'text-[var(--text-secondary)]',
                        )}
                      >
                        {selectedMuted ? (
                          <BellOff className="h-4 w-4" />
                        ) : (
                          <Bell className="h-4 w-4" />
                        )}
                      </button>
                    </Tooltip>
                    {muteOpen && (
                      <div
                        role="menu"
                        aria-label="Mute for"
                        className="absolute top-9 right-0 z-30 w-44 rounded-lg border border-[var(--border)] bg-white p-1 shadow-lg"
                      >
                        {[
                          { label: 'Mute for 1 hour', hours: 1 },
                          { label: 'Mute for 8 hours', hours: 8 },
                          { label: 'Mute for 24 hours', hours: 24 },
                          { label: 'Mute for a week', hours: 24 * 7 },
                        ].map((opt) => (
                          <button
                            key={opt.hours}
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              muteMut.mutate(opt.hours);
                              setMuteOpen(false);
                            }}
                            className="block w-full rounded px-2 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--bg-secondary)]"
                          >
                            {opt.label}
                          </button>
                        ))}
                        {selected.mutedUntil && (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              muteMut.mutate(null);
                              setMuteOpen(false);
                            }}
                            className="mt-0.5 block w-full rounded border-t border-[var(--border)] px-2 py-1.5 text-left text-xs font-medium text-emerald-700 hover:bg-[var(--bg-secondary)]"
                          >
                            Unmute
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <Tooltip content={selected.pinnedAt ? 'Unpin' : 'Pin to top'}>
                    <button
                      type="button"
                      onClick={() => pinMut.mutate(!selected.pinnedAt)}
                      disabled={pinMut.isPending}
                      aria-label={selected.pinnedAt ? 'Unpin conversation' : 'Pin conversation'}
                      aria-pressed={!!selected.pinnedAt}
                      className={cn(
                        'rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--bg-secondary)] disabled:opacity-60',
                        selected.pinnedAt ? 'text-amber-600' : 'text-[var(--text-secondary)]',
                      )}
                    >
                      {selected.pinnedAt ? (
                        <PinOff className="h-4 w-4" />
                      ) : (
                        <Pin className="h-4 w-4" />
                      )}
                    </button>
                  </Tooltip>
                  <Tooltip content="Mark unread">
                    <button
                      type="button"
                      onClick={() => markUnreadMut.mutate()}
                      disabled={markUnreadMut.isPending}
                      aria-label="Mark conversation unread"
                      className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-60"
                    >
                      <MailQuestionMark className="h-4 w-4" />
                    </button>
                  </Tooltip>
                  <Tooltip content={selected.archivedAt ? 'Unarchive' : 'Archive'}>
                    <button
                      type="button"
                      onClick={() => archiveMut.mutate(!selected.archivedAt)}
                      disabled={archiveMut.isPending}
                      aria-label={
                        selected.archivedAt ? 'Unarchive conversation' : 'Archive conversation'
                      }
                      className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-60"
                    >
                      {selected.archivedAt ? (
                        <ArchiveRestore className="h-4 w-4" />
                      ) : (
                        <Archive className="h-4 w-4" />
                      )}
                    </button>
                  </Tooltip>
                  <button
                    type="button"
                    onClick={() => workflowMut.mutate({ type: 'assign' })}
                    disabled={!operatorLabel}
                    className="hidden rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-60 sm:block"
                  >
                    Assign to me
                  </button>
                  {/* All three states, not a Resolve/Reopen pair. PENDING
                      ("waiting on the customer") was reachable only from the
                      bulk bar even though the list filters by it, so the one
                      status an agent sets while working a single thread was the
                      one the thread header could not set. */}
                  <div className="w-28">
                    <label htmlFor="wa-thread-status" className="sr-only">
                      Conversation status
                    </label>
                    <Select
                      id="wa-thread-status"
                      size="sm"
                      clearable={false}
                      value={selected.status}
                      onChange={(v) =>
                        workflowMut.mutate({ type: 'status', status: v as WaConversationStatus })
                      }
                      options={[
                        { value: 'OPEN', label: 'Open' },
                        { value: 'PENDING', label: 'Pending' },
                        { value: 'RESOLVED', label: 'Resolved' },
                      ]}
                    />
                  </div>
                  <Tooltip content="Conversation details">
                    <button
                      type="button"
                      onClick={() => {
                        setDetailsOpen((v) => !v);
                        setMobilePane((p) => (p === 'details' ? 'thread' : 'details'));
                      }}
                      aria-label="Conversation details"
                      aria-pressed={detailsOpen}
                      className={cn(
                        'rounded-md border px-2 py-1 text-xs',
                        detailsOpen
                          ? 'text-primary border-[var(--primary)] bg-[var(--primary-light)]'
                          : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]',
                      )}
                    >
                      <PanelRight className="h-4 w-4" />
                    </button>
                  </Tooltip>
                </div>
              </div>

              {/* Multi-select toolbar (delete / copy) */}
              {selectionMode && (
                <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--bg)] px-4 py-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={exitMessageSelection}
                      aria-label="Cancel selection"
                      className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
                    >
                      <X className="h-5 w-5" />
                    </button>
                    <span className="text-sm font-medium text-[var(--text)]">
                      {selectedMessageIds.size} selected
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={copySelectedMessages}
                      disabled={selectedMessageIds.size === 0}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50"
                    >
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </button>
                    <button
                      type="button"
                      onClick={() => setForwarding([...selectedMessageIds])}
                      disabled={selectedMessageIds.size === 0}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50"
                    >
                      <Forward className="h-3.5 w-3.5" /> Forward
                    </button>
                    <button
                      type="button"
                      onClick={deleteSelectedMessages}
                      disabled={selectedMessageIds.size === 0 || deleteMessagesMut.isPending}
                      className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {deleteMessagesMut.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Delete for me
                    </button>
                  </div>
                </div>
              )}

              {/* Messages (scrollable) + floating scroll-to-latest button */}
              <div className="relative flex min-h-0 flex-1 flex-col">
                {/* An anchored page is a slice from the MIDDLE of the thread, so
                    the newest messages aren't loaded — say so, and offer the way
                    back, instead of leaving the operator scrolling for a bottom
                    that isn't there. */}
                {anchorMessageId && (
                  <div className="flex items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-[11px] text-amber-900">
                    <span className="flex items-center gap-1.5">
                      <Search className="h-3 w-3 shrink-0" aria-hidden="true" />
                      Showing the search result in context
                    </span>
                    <button
                      type="button"
                      onClick={jumpToLatest}
                      className="shrink-0 font-medium underline hover:no-underline"
                    >
                      Jump to latest
                    </button>
                  </div>
                )}
                {/* In-thread search results.
                    Every hit reuses the same `searchAnchor` deep-link the inbox
                    search already uses, so clicking one loads the thread around
                    that message and highlights it. */}
                {threadSearchOpen && (
                  <div className="border-b border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Search className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                      <input
                        autoFocus
                        value={threadSearchQ}
                        onChange={(e) => setThreadSearchQ(e.target.value)}
                        placeholder="Search in this conversation…"
                        aria-label="Search in this conversation"
                        className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--text)] outline-none focus:border-[var(--primary)]"
                      />
                      {threadHits && (
                        <span className="shrink-0 text-[11px] text-[var(--text-muted)] tabular-nums">
                          {threadHits.total} {threadHits.total === 1 ? 'match' : 'matches'}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setThreadSearchOpen(false);
                          setThreadSearchQ('');
                        }}
                        aria-label="Close search"
                        className="shrink-0 rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--bg)]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {threadSearchQ.trim().length > 0 && threadSearchQ.trim().length < 3 && (
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                        Type at least 3 characters.
                      </p>
                    )}
                    {threadSearchQuery.isFetching && (
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">Searching…</p>
                    )}
                    {threadHits &&
                      threadHits.items.length === 0 &&
                      !threadSearchQuery.isFetching && (
                        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                          No messages match. Only message text is searchable — not the contents of
                          attachments.
                        </p>
                      )}
                    {threadHits && threadHits.items.length > 0 && (
                      <ul className="mt-1.5 max-h-44 space-y-0.5 overflow-y-auto">
                        {threadHits.items.map((hit) => (
                          <li key={hit.id}>
                            <button
                              type="button"
                              onClick={() =>
                                setSearchAnchor({
                                  convId: selected.id,
                                  messageId: hit.id,
                                })
                              }
                              className={cn(
                                'w-full rounded px-2 py-1 text-left text-[11px] hover:bg-[var(--bg)]',
                                hit.id === anchorMessageId && 'bg-amber-50 ring-1 ring-amber-300',
                              )}
                            >
                              <span className="mr-1.5 text-[var(--text-muted)]">
                                {hit.direction === 'INBOUND' ? '←' : '→'}{' '}
                                {new Date(hit.createdAt).toLocaleDateString([], {
                                  day: 'numeric',
                                  month: 'short',
                                })}
                              </span>
                              <span className="text-[var(--text)]">
                                {stripWhatsAppFormatting(hit.snippet)}
                              </span>
                            </button>
                          </li>
                        ))}
                        {threadHits.hasMore && (
                          <li className="px-2 py-1 text-[10px] text-[var(--text-muted)]">
                            Showing the {threadHits.items.length} most recent of {threadHits.total}{' '}
                            — narrow the search to see older ones.
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                )}
                <div
                  ref={scrollContainerRef}
                  onScroll={handleThreadScroll}
                  {...(canReply
                    ? {
                        onDragEnter: onThreadDragEnter,
                        onDragOver: onThreadDragOver,
                        onDragLeave: onThreadDragLeave,
                        onDrop: onThreadDrop,
                      }
                    : {})}
                  // `log` rather than `feed`: the thread is an append-ordered
                  // record, and `feed` obliges each entry to be a focusable
                  // article, which these bubbles are not. The live announcements
                  // ride on the separate region below, not on this container.
                  role="log"
                  // `log` carries an IMPLICIT polite live value, so declaring
                  // nothing here made the whole container live: the entire first
                  // page on open, and a slab of history on every "Load older
                  // messages", read aloud as if newly arrived. The announcements
                  // ride on the dedicated region below instead, one sentence per
                  // event that actually happened.
                  aria-live="off"
                  aria-label={`Conversation with ${displayName(selected.contact)}`}
                  className="relative min-h-0 flex-1 space-y-2 overflow-y-auto p-4"
                >
                  {/* Announcement channel for newly arrived inbound messages.
                      Off-screen rather than `hidden`: a hidden node is not read.
                      `atomic` so the whole sentence is spoken, not the diff. */}
                  <p
                    ref={liveRegionRef}
                    aria-live="polite"
                    aria-atomic="true"
                    className="sr-only"
                  />
                  {msgQuery.isLoading && !msgQuery.isError && (
                    <p className="text-center text-sm text-[var(--text-muted)]">
                      Loading messages…
                    </p>
                  )}
                  {msgQuery.isError && (
                    <div className="flex flex-col items-center gap-2 py-6 text-center">
                      <AlertCircle className="h-6 w-6 text-[var(--error)]" />
                      <p className="text-sm text-[var(--error)]">
                        Couldn’t load this conversation.
                      </p>
                      <button
                        type="button"
                        onClick={() => msgQuery.refetch()}
                        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                      >
                        <RotateCw className="h-3.5 w-3.5" /> Retry
                      </button>
                    </div>
                  )}
                  {!msgQuery.isLoading &&
                    !msgQuery.isError &&
                    messages.length > 0 &&
                    hasMoreOlder && (
                      <div className="flex justify-center">
                        {threadAtCap ? (
                          <Tooltip content="Older messages aren't loaded, so the thread stays quick to scroll.">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--bg)] px-3 py-1 text-[11px] font-medium text-[var(--text-muted)] shadow-sm ring-1 ring-[var(--border)]">
                              <Hourglass className="h-3.5 w-3.5" aria-hidden="true" />
                              Showing the most recent {messages.length} messages
                            </span>
                          </Tooltip>
                        ) : (
                          <button
                            type="button"
                            onClick={() => loadOlderMut.mutate()}
                            disabled={loadOlderMut.isPending}
                            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--bg)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)] shadow-sm ring-1 ring-[var(--border)] hover:bg-[var(--bg-secondary)] disabled:opacity-60"
                          >
                            {loadOlderMut.isPending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ChevronUp className="h-3.5 w-3.5" />
                            )}
                            Load older messages
                          </button>
                        )}
                      </div>
                    )}
                  {messages.map((m, i) => {
                    const showDay =
                      i === 0 || dayKey(messages[i - 1].createdAt) !== dayKey(m.createdAt);
                    return (
                      <div
                        key={m.id}
                        id={`wa-msg-${m.id}`}
                        className={cn(
                          'space-y-2',
                          // The matched message, called out so the operator can
                          // see WHICH bubble the search landed on.
                          m.id === anchorMessageId &&
                            'rounded-lg bg-amber-50 ring-2 ring-amber-300',
                        )}
                      >
                        {showDay && <DaySeparator label={dayLabel(m.createdAt)} />}
                        {m.id === unreadDividerBeforeId && (
                          <div
                            className="flex items-center gap-2 py-1"
                            aria-label="Unread messages"
                          >
                            <div className="h-px flex-1 bg-emerald-300/60" />
                            <span className="rounded-full bg-emerald-50 px-3 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                              {openUnread && openUnread.count > 0
                                ? `${openUnread.count} unread message${openUnread.count > 1 ? 's' : ''}`
                                : 'Unread messages'}
                            </span>
                            <div className="h-px flex-1 bg-emerald-300/60" />
                          </div>
                        )}
                        <MessageBubble
                          message={m}
                          conversationId={selected.id}
                          contactName={displayName(selected.contact)}
                          retrying={sendMut.isPending}
                          offlineQueued={outboxIds.has(m.id)}
                          onDiscardQueued={
                            outboxIds.has(m.id) ? () => void discardQueued(m.id) : undefined
                          }
                          onRetry={(text) =>
                            retrySend(
                              text,
                              isOptimisticId(m.id) ? m.id : undefined,
                              m.contextWamid ?? undefined,
                            )
                          }
                          onReply={(msg) => setReplyTo(msg)}
                          // Optimistic rows have no server id yet, so the menu
                          // item is hidden rather than offered and then failing.
                          onToggleStar={
                            m.id.startsWith(OPTIMISTIC_PREFIX)
                              ? undefined
                              : (msg) =>
                                  starMut.mutate({
                                    messageId: msg.id,
                                    starred: !msg.starredAt,
                                  })
                          }
                          onForward={
                            m.id.startsWith(OPTIMISTIC_PREFIX)
                              ? undefined
                              : (msg) => setForwarding([msg.id])
                          }
                          quotedText={m.contextWamid ? wamidToText.get(m.contextWamid) : undefined}
                          selectionMode={selectionMode}
                          selected={selectedMessageIds.has(m.id)}
                          onToggleSelect={toggleMessageSelect}
                          onCopy={copyMessageText}
                          onDelete={deleteOneMessage}
                          onStartSelect={enterMessageSelection}
                          highlight={anchorMessageId ? debouncedSearch : undefined}
                          // The same state the composer is gated on — the page
                          // already knew reacting was impossible; the bubble did
                          // not, so it kept offering it.
                          canReact={canReply}
                        />
                      </div>
                    );
                  })}
                  <div ref={endRef} />
                  {/* Drop target feedback. Rendered last and pinned with an
                      explicit marginTop because the container's `space-y-2`
                      would otherwise push this absolutely-positioned overlay
                      down by one gap. */}
                  {dropActive && (
                    <div
                      style={{ marginTop: 0 }}
                      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-[var(--primary)] bg-[var(--bg)]/85"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-[var(--primary)]">
                        <Paperclip className="h-4 w-4" aria-hidden="true" />
                        Drop to attach
                      </span>
                    </div>
                  )}
                </div>
                {(showScrollBtn || newMsgCount > 0) && (
                  <button
                    type="button"
                    onClick={scrollThreadToBottom}
                    aria-label={
                      newMsgCount > 0
                        ? `${newMsgCount} new message${newMsgCount > 1 ? 's' : ''} — scroll to latest`
                        : 'Scroll to latest messages'
                    }
                    className="absolute right-5 bottom-6 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)] shadow-lg transition hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
                  >
                    <ChevronDown className="h-5 w-5" />
                    {newMsgCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 flex min-w-[18px] items-center justify-center rounded-full bg-[var(--primary)] px-1 text-[10px] font-bold text-white">
                        {newMsgCount > 99 ? '99+' : newMsgCount}
                      </span>
                    )}
                  </button>
                )}
              </div>

              {/* Composer */}
              <div className="relative border-t border-[var(--border)] bg-[var(--bg)] p-3">
                {/* Quoted-reply preview */}
                {replyTo && canReply && (
                  <div className="mb-2 flex items-start gap-2 rounded-lg border-l-2 border-[var(--primary)] bg-[var(--bg-secondary)] px-3 py-1.5">
                    <Reply className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-primary text-[10px] font-semibold">
                        Replying to{' '}
                        {replyTo.direction === 'OUTBOUND'
                          ? 'your message'
                          : displayName(selected.contact)}
                      </p>
                      <p className="truncate text-[11px] text-[var(--text-muted)]">
                        {replyPreview}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReplyTo(null)}
                      aria-label="Cancel reply"
                      className="shrink-0 rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--bg)] hover:text-[var(--text)]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {/* Formatting toolbar + length counter.
                    The composer was the only send field in the product without a
                    toolbar — the markers had to be typed from memory — and the
                    only one that could be typed past its limit with no warning. */}
                {canReply && (
                  <div className="mb-1 flex items-center gap-0.5">
                    {WA_FORMATS.map((f) => (
                      <Tooltip
                        key={f.label}
                        content={
                          f.shortcut ? `${f.label} (Ctrl+${f.shortcut.toUpperCase()})` : f.label
                        }
                      >
                        <button
                          type="button"
                          aria-label={f.label}
                          // Keeps the caret in the textarea: a plain click would
                          // blur it first and the selection to wrap would be gone
                          // by the time the handler ran.
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => applyComposerFormat(f.marker)}
                          className="rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
                        >
                          <f.icon className="h-3.5 w-3.5" />
                        </button>
                      </Tooltip>
                    ))}
                    {/* Silent until it is nearly relevant — a counter on every
                        two-word reply is noise. */}
                    {draft.length > WA_TEXT_MAX - 600 && (
                      <span
                        className={cn(
                          'ml-auto text-[10px] tabular-nums',
                          draft.length >= WA_TEXT_MAX
                            ? 'font-semibold text-[var(--danger)]'
                            : 'text-[var(--text-muted)]',
                        )}
                      >
                        {draft.length}/{WA_TEXT_MAX}
                      </span>
                    )}
                  </div>
                )}
                {/* Live formatting preview — shows how *bold* / _italic_ / etc.
                    will render once sent (WhatsApp keeps the markers in the input,
                    so this is the only place the agent sees the result pre-send). */}
                {canReply && hasWaFormatting(draft) && draft.trim() && (
                  <div className="mb-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5">
                    <p className="mb-0.5 text-[10px] font-semibold tracking-wide text-[var(--text-muted)] uppercase">
                      Preview
                    </p>
                    <MessageText text={draft} className="text-sm text-[var(--text)]" />
                  </div>
                )}
                {/* Upload in flight. Without this a media send showed nothing at
                    all while a large file went up — the operator could not tell
                    whether their click had registered. The percentage and the bar
                    answer the next question: whether it is still moving. */}
                {uploadingName && (
                  <div className="mb-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <Spinner size="sm" />
                      <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-secondary)]">
                        Sending {uploadingName}…
                      </span>
                      {uploadPct !== null && (
                        <span className="shrink-0 text-xs text-[var(--text-muted)] tabular-nums">
                          {uploadPct}%
                        </span>
                      )}
                      {mediaQueuedCount > 0 && (
                        <span className="shrink-0 text-xs text-[var(--text-muted)]">
                          +{mediaQueuedCount} queued
                        </span>
                      )}
                      {/* The only way out of a stalled upload short of reloading
                          the page, which would have lost the rest of the pick. */}
                      <Tooltip content="Cancel upload">
                        <button
                          type="button"
                          onClick={() => uploadAbortRef.current?.abort()}
                          aria-label="Cancel upload"
                          className="shrink-0 rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--bg)] hover:text-[var(--danger)]"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </Tooltip>
                    </div>
                    {uploadPct !== null && (
                      <div
                        role="progressbar"
                        aria-label={`Uploading ${uploadingName}`}
                        aria-valuenow={uploadPct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--bg)]"
                      >
                        <div
                          className="h-full rounded-full bg-[var(--primary)] transition-all duration-200"
                          style={{ width: `${uploadPct}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}
                {/* Meta says this customer re-registered WhatsApp on another
                    device. Same number, same thread — possibly a different
                    person, which is exactly what an agent about to share account
                    details needs to be told before they type. Sits above the
                    composer rather than in the header so it cannot scroll away. */}
                {selected.identityChangedAt && (
                  <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span>
                        This customer&apos;s WhatsApp identity changed (new device or security
                        code). Verify who you are talking to before sharing anything sensitive.
                      </span>
                      <button
                        type="button"
                        onClick={() => identityAckMut.mutate(selected.id)}
                        disabled={identityAckMut.isPending}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-400 bg-white px-2.5 py-1 font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" /> Verified
                      </button>
                    </div>
                  </div>
                )}
                {canReply ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      submitDraft(draft);
                    }}
                    className="relative flex items-end gap-2"
                  >
                    <InboxComposerTools
                      conversationId={selected.id}
                      contextWamid={replyTo?.wamid ?? undefined}
                      onInsert={(t) => setDraft((d) => (d ? `${d}\n${t}` : t))}
                      onSent={() => {
                        qc.invalidateQueries({ queryKey: ['wa-messages', selected.id] });
                        qc.invalidateQueries({ queryKey: ['wa-conversations'] });
                        setReplyTo(null);
                      }}
                    />
                    {/* Emoji picker */}
                    <div className="relative" ref={emojiRef}>
                      <Tooltip content="Emoji">
                        <button
                          ref={emojiBtnRef}
                          type="button"
                          onClick={() => setEmojiOpen((v) => !v)}
                          aria-label="Emoji"
                          aria-haspopup="menu"
                          aria-expanded={emojiOpen}
                          className="flex h-10 items-center rounded-lg px-2 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
                        >
                          <Smile className="h-5 w-5" />
                        </button>
                      </Tooltip>
                      {emojiOpen && (
                        <EmojiPicker
                          onPick={(char) => {
                            // Inserted AT THE CARET, not appended. Appending was
                            // fine only for an emoji typed at the end of an
                            // empty draft; picking one mid-sentence dropped it
                            // after the full stop.
                            const el = composerRef.current;
                            const at = el ? el.selectionStart : draft.length;
                            const to = el ? el.selectionEnd : draft.length;
                            const next = draft.slice(0, at) + char + draft.slice(to);
                            if (next.length > WA_TEXT_MAX) return;
                            setDraft(next);
                            requestAnimationFrame(() => {
                              el?.focus();
                              el?.setSelectionRange(at + char.length, at + char.length);
                            });
                            // Left OPEN: reacting to a message takes one emoji,
                            // writing a message often takes several.
                          }}
                        />
                      )}
                    </div>
                    {/* Attach menu: Photos & Videos / Audio / Document (any file) */}
                    <AttachMenu
                      onPickFiles={queueMedia}
                      onContact={() => setContactOpen(true)}
                      onLocation={() => setLocationOpen(true)}
                      disabled={sendMediaMut.isPending}
                    />
                    {/* Schedule (send later) */}
                    <Tooltip content="Schedule message">
                      <button
                        type="button"
                        onClick={() => setScheduleOpen(true)}
                        aria-label="Schedule message"
                        className="flex h-10 items-center rounded-lg px-2 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
                      >
                        <CalendarClock className="h-5 w-5" />
                      </button>
                    </Tooltip>
                    {/* Send a template WHILE the window is open.
                        This was reachable only from the closed-window branch, so
                        mid-conversation an operator could not send an order
                        confirmation with a media header, a flow-launch button, an
                        auth code or a catalog card — the workaround was copying
                        the number into New compose, or scheduling it a minute out.
                        Nothing in the backend imposed the restriction: the route,
                        the controller and sendTemplateToConversation never check
                        the window, and the modal already supports 'reply' mode. */}
                    <Tooltip content="Send a template">
                      <button
                        type="button"
                        onClick={() => setCompose({ mode: 'reply', conversationId: selected.id })}
                        aria-label="Send a template"
                        className="flex h-10 items-center rounded-lg px-2 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
                      >
                        <FileText className="h-5 w-5" />
                      </button>
                    </Tooltip>
                    <textarea
                      ref={composerRef}
                      value={draft}
                      onChange={(e) => {
                        setDraft(e.target.value);
                        notifyTyping();
                      }}
                      onKeyDown={(e) => {
                        // Ctrl/Cmd+B and +I, the two every operator already has
                        // in their fingers. The other two markers are on the
                        // toolbar only — WhatsApp itself binds no key to them.
                        if ((e.ctrlKey || e.metaKey) && !e.altKey) {
                          const fmt = WA_FORMATS.find(
                            (f) => f.shortcut && f.shortcut === e.key.toLowerCase(),
                          );
                          if (fmt) {
                            e.preventDefault();
                            applyComposerFormat(fmt.marker);
                            return;
                          }
                        }
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          submitDraft(draft);
                        }
                      }}
                      onPaste={(e) => {
                        // Paste-to-send. Support work is screenshot-heavy and the
                        // only route before this was: save the screenshot to disk,
                        // open the attach menu, find it again in a file dialog.
                        // Text pastes carry no files and fall through untouched.
                        const files = Array.from(e.clipboardData.files);
                        if (files.length === 0) return;
                        e.preventDefault();
                        queueMedia(files);
                      }}
                      rows={1}
                      // Meta's own ceiling for a text body. Without it the
                      // server 400'd with a bare "Validation failed" AFTER the
                      // operator had typed past it — the one failure mode a
                      // native attribute prevents outright.
                      maxLength={WA_TEXT_MAX}
                      placeholder="Type a message…"
                      aria-label="Message"
                      className="max-h-32 min-h-[40px] flex-1 resize-none overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
                    />
                    {/* Record + send a voice message (overlays the row while active) */}
                    <VoiceRecorder
                      onRecorded={(file, meta) => {
                        // `meta.voice`, not a hardcoded true: only the ogg/opus
                        // branch produces something WhatsApp renders as a voice
                        // note, and claiming it for an MP3 transcode drew a
                        // waveform here for a file card there.
                        sendMediaMut.mutate({
                          file,
                          voice: meta.voice,
                          contextWamid: replyTo?.wamid ?? undefined,
                        });
                        setReplyTo(null);
                      }}
                      disabled={sendMediaMut.isPending}
                    />
                    <Button
                      type="submit"
                      isLoading={sendMut.isPending}
                      leftIcon={<Send className="h-4 w-4" />}
                    >
                      Send
                    </Button>
                  </form>
                ) : selected.contact.suppressedAt ? (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span>
                        This contact is on the do-not-contact list — usually because they replied
                        STOP. Nothing can be sent to them until they opt in again.
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setDetailsOpen(true);
                          setMobilePane('details');
                        }}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-400 bg-white px-2.5 py-1 font-medium text-amber-900 hover:bg-amber-100"
                      >
                        <UserCog className="h-3.5 w-3.5" /> Manage contact
                      </button>
                    </div>
                  </div>
                ) : selected.contact.isBlocked ? (
                  <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-xs text-red-800">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span>This contact is blocked — you cannot message them.</span>
                      {/* Was a dead end: the only way to lift a block a colleague
                          (or you, by mistake) applied was to leave the thread for
                          the contacts page and find the number there. */}
                      <button
                        type="button"
                        onClick={() => {
                          setDetailsOpen(true);
                          setMobilePane('details');
                        }}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-red-400 bg-white px-2.5 py-1 font-medium text-red-900 hover:bg-red-100"
                      >
                        <UserCog className="h-3.5 w-3.5" /> Manage contact
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span>
                        The 24-hour reply window is closed. Send an approved template to re-engage.
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setScheduleOpen(true)}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-400 bg-white px-2.5 py-1 font-medium text-amber-900 hover:bg-amber-100"
                        >
                          <CalendarClock className="h-3.5 w-3.5" /> Schedule
                        </button>
                        <button
                          type="button"
                          onClick={() => setCompose({ mode: 'reply', conversationId: selected.id })}
                          className="rounded-md bg-emerald-600 px-2.5 py-1 font-medium text-white hover:bg-emerald-700"
                        >
                          Send template
                        </button>
                      </div>
                    </div>
                    {/* The composer unmounts the instant the window shuts, taking a
                        half-typed reply off screen with it. Schedule already carries
                        the draft; keep it visible and copyable so it can be pasted
                        into a template variable instead of retyped from memory. */}
                    {draft.trim() && (
                      <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-200 bg-white px-2.5 py-1.5">
                        <div className="min-w-0 flex-1">
                          <p className="mb-0.5 text-[10px] font-semibold tracking-wide text-amber-700 uppercase">
                            Unsent draft
                          </p>
                          <p className="line-clamp-3 break-words whitespace-pre-wrap text-amber-900">
                            {draft}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyMessageText(draft)}
                          aria-label="Copy unsent draft"
                          className="shrink-0 rounded-md border border-amber-400 bg-white p-1 text-amber-900 hover:bg-amber-100"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {/* Conversation details (assign / labels / snooze / scheduled / media /
            platform 360 / notes). Full width on mobile (details pane). */}
        {selected && (
          <ThreadDetailsPanel
            conversation={selected}
            open={detailsOpen}
            onClose={() => {
              setDetailsOpen(false);
              setMobilePane('thread');
            }}
            onOpenMedia={() => setMediaGalleryOpen(true)}
            onCleared={() => {
              // "Clear chat history" soft-deletes every message in the thread, so
              // empty the cached thread outright rather than waiting for the
              // refetch behind the invalidate — otherwise the history the
              // operator just cleared stays on screen for a beat. Optimistic
              // bubbles are a client-held buffer no refetch can clear.
              qc.setQueriesData(
                { queryKey: ['wa-messages', selectedId] },
                (old: ApiResponse<{ items: WaMessage[] }> | undefined) =>
                  old?.data?.items ? { ...old, data: { ...old.data, items: [] } } : old,
              );
              setPendingMessages([]);
              setOpenUnread(null);
              setSelectionMode(false);
              setSelectedMessageIds(new Set());
            }}
            className={cn('w-full lg:w-72', mobilePane === 'details' ? 'flex' : 'hidden lg:flex')}
          />
        )}
      </div>

      {compose && (
        <TemplateComposeModal
          mode={compose.mode}
          conversationId={compose.conversationId}
          contact={
            compose.conversationId && compose.conversationId === selected?.id
              ? selected?.contact
              : undefined
          }
          onClose={() => setCompose(null)}
          onSent={(id) => {
            if (id) setSelectedId(id);
          }}
        />
      )}

      {scheduleOpen && selected && (
        <ScheduleMessageModal
          conversationId={selected.id}
          initialText={draft.trim() || undefined}
          onClose={() => setScheduleOpen(false)}
        />
      )}

      {mediaGalleryOpen && selected && (
        <MediaGalleryModal
          conversationId={selected.id}
          onClose={() => setMediaGalleryOpen(false)}
        />
      )}

      {contactOpen && selected && (
        <ContactComposeModal
          conversationId={selected.id}
          contextWamid={replyTo?.wamid ?? undefined}
          onClose={() => setContactOpen(false)}
          onSent={() => {
            setContactOpen(false);
            setReplyTo(null);
          }}
        />
      )}

      {pendingMedia && selected && (
        <MediaComposeModal
          file={pendingMedia}
          initialCaption={draft}
          sending={sendMediaMut.isPending}
          // Discards the whole pick, not just this file. The sheet gives no sign
          // that more files are behind it, so advancing to a second preview after
          // the operator pressed Cancel would read as the dialog refusing to close.
          onCancel={() => setMediaPick((p) => ({ ...p, files: [] }))}
          onSend={(caption) => {
            const file = pendingMedia;
            advanceMedia();
            // Whatever was typed in the composer becomes the caption, so the
            // agent's message rides WITH the file instead of arriving as a
            // separate bubble a moment later.
            if (caption && caption === draft.trim()) setDraft('');
            sendMediaMut.mutate({
              file,
              caption: caption || undefined,
              contextWamid: replyTo?.wamid ?? undefined,
            });
            // Cleared HERE rather than on success: an upload can outlast the
            // operator's next action, and a banner still standing over a send
            // already in flight is the exact way the quote leaked onto the
            // message after it.
            setReplyTo(null);
          }}
        />
      )}

      {forwarding && selected && (
        <ForwardModal
          conversationId={selected.id}
          messageIds={forwarding}
          onClose={() => setForwarding(null)}
          onDone={() => {
            // Leave selection mode once the forward lands — the operator picked
            // these to move them, not to keep working with them here.
            setSelectionMode(false);
            setSelectedMessageIds(new Set());
          }}
        />
      )}

      {locationOpen && selected && (
        <LocationComposeModal
          conversationId={selected.id}
          contextWamid={replyTo?.wamid ?? undefined}
          onClose={() => setLocationOpen(false)}
          onSent={() => {
            setLocationOpen(false);
            setReplyTo(null);
          }}
        />
      )}
    </DashboardLayout>
  );
}
