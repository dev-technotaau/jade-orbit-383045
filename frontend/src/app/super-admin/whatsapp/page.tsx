'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  Search,
  Send,
  Loader2,
  CheckCheck,
  Check,
  AlertCircle,
  MessageCircle,
  BadgeCheck,
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
  CalendarClock,
  Download,
  Archive,
  ArchiveRestore,
  Star,
  Copy,
  Trash2,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Avatar from '@/components/ui/Avatar';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Tooltip from '@/components/ui/Tooltip';
import { showToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { stripWhatsAppFormatting, hasWaFormatting } from '@/lib/wa-format';
import { useSocket } from '@/hooks/use-socket';
import { superAdminWhatsappService as svc } from '@/services/super-admin-whatsapp.service';
import type {
  WaConversation,
  WaConversationStatus,
  WaMessage,
  WaMessageStatus,
  WaReaction,
} from '@/types/whatsapp';
import type { ApiError } from '@/types/api';
import TemplateComposeModal from '@/components/super-admin/whatsapp/TemplateComposeModal';
import InboxComposerTools from '@/components/super-admin/whatsapp/InboxComposerTools';
import ThreadDetailsPanel from '@/components/super-admin/whatsapp/ThreadDetailsPanel';
import ScheduleMessageModal from '@/components/super-admin/whatsapp/ScheduleMessageModal';
import MediaGalleryModal from '@/components/super-admin/whatsapp/MediaGalleryModal';
import ReactionPicker from '@/components/super-admin/whatsapp/ReactionPicker';
import MessageReactions from '@/components/super-admin/whatsapp/MessageReactions';
import MessageActionsMenu from '@/components/super-admin/whatsapp/MessageActionsMenu';
import MessageAttachment from '@/components/super-admin/whatsapp/MessageAttachment';
import MessageContact from '@/components/super-admin/whatsapp/MessageContact';
import MessageLocation from '@/components/super-admin/whatsapp/MessageLocation';
import MessageInteractive from '@/components/super-admin/whatsapp/MessageInteractive';
import MessageText from '@/components/super-admin/whatsapp/MessageText';
import AttachMenu from '@/components/super-admin/whatsapp/AttachMenu';
import VoiceRecorder from '@/components/super-admin/whatsapp/VoiceRecorder';
import ContactComposeModal from '@/components/super-admin/whatsapp/ContactComposeModal';
import { getOpenConv, setOpenConv, subscribeOpenConv } from '@/lib/wa-open-conv';
import BulkActionBar from '@/components/super-admin/whatsapp/BulkActionBar';
import {
  ensureNotificationPermission,
  notifyInbound,
} from '@/components/super-admin/whatsapp/wa-notify';
import { useAuthStore } from '@/store/auth.store';

type StatusFilter = 'all' | WaConversationStatus;
type AssigneeFilter = 'all' | 'me' | 'unassigned';
type PlatformFilter = 'all' | 'on' | 'off';

const EMOJIS = [
  '😀',
  '😂',
  '😊',
  '😍',
  '👍',
  '🙏',
  '🎉',
  '🔥',
  '❤️',
  '😎',
  '🤝',
  '👋',
  '✅',
  '💯',
  '🚀',
  '😢',
];

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

function windowOpen(expiry: string | null): boolean {
  return !!expiry && new Date(expiry).getTime() > Date.now();
}
function fmtTime(s: string | null): string {
  return s ? new Date(s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
}
function displayName(c: { name: string | null; phone: string }): string {
  return c.name?.trim() || c.phone;
}

/** Split a contact's name into first/last words for avatar initials. */
function avatarNames(c: { name: string | null }): { first: string; last: string } {
  const nm = (c.name || '').trim();
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
 * Append a socket-pushed / just-sent message to the open thread's React Query
 * cache so it renders WITHOUT a refetch. Safe to call for any conversation: it
 * no-ops when that thread isn't loaded (returns undefined → React Query bails)
 * or the message is already present (dedup by id).
 */
function mergeMessageIntoCache(qc: QueryClient, conversationId: string, message: WaMessage) {
  qc.setQueryData(
    ['wa-messages', conversationId],
    (old: { data?: { items?: WaMessage[] } } | undefined) => {
      if (!old?.data?.items) return old;
      if (old.data.items.some((m) => m.id === message.id)) return old;
      return { ...old, data: { ...old.data, items: [...old.data.items, message] } };
    },
  );
}

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
function StatusTick({ status }: { status: WaMessageStatus }) {
  const label = STATUS_LABEL[status];
  if (status === 'FAILED')
    return <AlertCircle className="h-3.5 w-3.5 text-red-100" aria-label={label} role="img" />;
  if (status === 'READ')
    return <CheckCheck className="h-3.5 w-3.5 text-sky-300" aria-label={label} role="img" />;
  if (status === 'DELIVERED')
    return <CheckCheck className="h-3.5 w-3.5 text-white/70" aria-label={label} role="img" />;
  if (status === 'SENT')
    return <Check className="h-3.5 w-3.5 text-white/70" aria-label={label} role="img" />;
  return <Loader2 className="h-3 w-3 animate-spin text-white/70" aria-label={label} role="img" />;
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
  quotedText,
  selectionMode,
  selected,
  onToggleSelect,
  onCopy,
  onDelete,
  onStartSelect,
}: {
  message: WaMessage;
  conversationId: string;
  /** Contact display name — labels the customer's side in the reactions popover. */
  contactName: string;
  onRetry?: (text: string) => void;
  retrying?: boolean;
  onReply?: (message: WaMessage) => void;
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
  const canRetry = outbound && message.status === 'FAILED' && !!message.text && !!onRetry;
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
                <div className="opacity-0 transition-opacity group-hover:opacity-100">
                  <MessageActionsMenu
                    canCopy={!!message.text?.trim()}
                    onCopy={() => onCopy(message.text)}
                    onDelete={() => onDelete(message.id)}
                    onSelect={() => onStartSelect(message.id)}
                    align="end"
                  />
                </div>
                {canReply && (
                  <Tooltip content="Reply">
                    <button
                      type="button"
                      onClick={() => onReply?.(message)}
                      aria-label="Reply to message"
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
                    >
                      <Reply className="h-3.5 w-3.5" />
                    </button>
                  </Tooltip>
                )}
                {/* React to our own message (also shows on the customer's side). */}
                {message.wamid && (
                  <div className="opacity-0 transition-opacity group-hover:opacity-100">
                    <ReactionPicker conversationId={conversationId} wamid={message.wamid} />
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
              {message.mediaId ? (
                <MessageAttachment message={message} outbound={outbound} />
              ) : message.type === 'CONTACTS' ? (
                <MessageContact payload={message.payload} />
              ) : message.type === 'LOCATION' ? (
                <MessageLocation payload={message.payload} />
              ) : message.type === 'INTERACTIVE' ? (
                <MessageInteractive message={message} outbound={outbound} />
              ) : (
                message.text && <MessageText text={message.text} />
              )}
              {message.errorTitle && (
                <p
                  className={cn(
                    'mt-1 text-[11px]',
                    outbound ? 'text-red-100' : 'text-[var(--error)]',
                  )}
                >
                  {message.errorTitle}
                </p>
              )}
              <div
                className={cn(
                  'mt-0.5 flex items-center justify-end gap-1 text-[10px]',
                  outbound ? 'text-white/70' : 'text-[var(--text-muted)]',
                )}
              >
                {fmtTime(message.createdAt)}
                {outbound && <StatusTick status={message.status} />}
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
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
                    >
                      <Reply className="h-3.5 w-3.5" />
                    </button>
                  </Tooltip>
                )}
                {message.wamid && (
                  <div className="opacity-0 transition-opacity group-hover:opacity-100">
                    <ReactionPicker conversationId={conversationId} wamid={message.wamid} />
                  </div>
                )}
                <div className="opacity-0 transition-opacity group-hover:opacity-100">
                  <MessageActionsMenu
                    canCopy={!!message.text?.trim()}
                    onCopy={() => onCopy(message.text)}
                    onDelete={() => onDelete(message.id)}
                    onSelect={() => onStartSelect(message.id)}
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
            />
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

function ConversationRow({
  conv,
  active,
  onClick,
  selected,
  onToggleSelect,
}: {
  conv: WaConversation;
  active: boolean;
  onClick: () => void;
  selected: boolean;
  onToggleSelect: (checked: boolean) => void;
}) {
  const archived = !!conv.archivedAt;
  const hasUnread = conv.unreadCount > 0;
  return (
    <div
      className={cn(
        'flex w-full items-center gap-2 border-b border-[var(--border)] pr-3 transition-colors',
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
        <Avatar
          src={conv.contact.user?.avatar}
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
            {conv.contact.userId && (
              <BadgeCheck
                className="h-3.5 w-3.5 shrink-0 text-[var(--primary)]"
                aria-label="On-platform user"
                role="img"
              />
            )}
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
          <p
            className={cn(
              'truncate text-xs',
              hasUnread ? 'font-medium text-[var(--text)]' : 'text-[var(--text-muted)]',
            )}
          >
            {stripWhatsAppFormatting(conv.lastMessagePreview ?? '') || conv.contact.phone}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-[10px] text-[var(--text-muted)]">
            {fmtTime(conv.lastMessageAt)}
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

export default function SuperAdminWhatsappInboxPage() {
  const qc = useQueryClient();
  const { socket, emit } = useSocket();
  const user = useAuthStore((s) => s.user);
  // Persisted across reloads (per device): SSR snapshot is null (matches
  // hydration), then reconciles to the stored id, reopening the last thread.
  const selectedId = useSyncExternalStore(subscribeOpenConv, getOpenConv, () => null);
  const setSelectedId = setOpenConv;
  const [search, setSearch] = useState('');
  // Debounced search value: the input stays bound to `search` (immediate) while
  // the React Query key/queryFn use `debouncedSearch` so we don't fire a DB
  // query per keystroke. setState happens inside the timeout callback (not
  // synchronously in the effect body), so this respects the react-compiler rules.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(id);
  }, [search]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>('all');
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');
  const [searchMessages, setSearchMessages] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [draft, setDraft] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  // Message the composer text-send will quote (contextWamid).
  const [replyTo, setReplyTo] = useState<WaMessage | null>(null);
  // Selected conversation ids for bulk actions.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // "Select all N matching the filter" (acts via backend filters, not the id list).
  const [allMatchingConv, setAllMatchingConv] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [mediaGalleryOpen, setMediaGalleryOpen] = useState(false);
  // Mobile single-pane navigation: which pane is visible below `lg`.
  const [mobilePane, setMobilePane] = useState<'list' | 'thread' | 'details'>('list');
  const [olderMessages, setOlderMessages] = useState<WaMessage[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  // Optimistic (not-yet-acked) outbound bubbles for the open conversation.
  const [pendingMessages, setPendingMessages] = useState<WaMessage[]>([]);
  // Extra conversation-list pages appended below the first page.
  const [extraConvPages, setExtraConvPages] = useState<WaConversation[]>([]);
  const [convPage, setConvPage] = useState(1);
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
  const handleThreadScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isAtBottomRef.current = distanceFromBottom < 120;
    setShowScrollBtn(distanceFromBottom > 200);
    // Caught back up to the bottom → clear the "new messages" badge.
    if (distanceFromBottom < 120) setNewMsgCount(0);
  };
  const scrollThreadToBottom = () => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    isAtBottomRef.current = true;
    setNewMsgCount(0);
  };
  // Message multi-select (delete / copy) state + helpers.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
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
  // Request browser-notification permission once on mount (best effort).
  useEffect(() => {
    ensureNotificationPermission();
  }, []);

  // "Assigned to me" maps to the current user's id; All / Unassigned send no param.
  const assignedToParam = assigneeFilter === 'me' ? (user?.id ?? undefined) : undefined;
  const onPlatformParam =
    platformFilter === 'on' ? true : platformFilter === 'off' ? false : undefined;
  const statusParam = statusFilter === 'all' ? undefined : statusFilter;

  const convQuery = useQuery({
    queryKey: [
      'wa-conversations',
      {
        q: debouncedSearch,
        unreadOnly,
        status: statusParam,
        assignedTo: assignedToParam,
        onPlatform: onPlatformParam,
        searchMessages,
        includeArchived,
      },
    ],
    queryFn: () =>
      svc.listConversations({
        q: debouncedSearch,
        unread: unreadOnly,
        status: statusParam,
        assignedTo: assignedToParam,
        onPlatform: onPlatformParam,
        searchMessages,
        includeArchived,
        page: 1,
        limit: 50,
      }),
    refetchInterval: 60_000,
  });
  const firstPage = convQuery.data?.data;
  // Reset the appended-pages buffer whenever the first page (i.e. the active
  // filter/search) changes. Render-time adjustment to avoid an effect cascade.
  const [convPageKey, setConvPageKey] = useState<string | undefined>(undefined);
  const firstPageKey = convQuery.dataUpdatedAt
    ? `${debouncedSearch}|${unreadOnly}|${statusParam}|${assignedToParam}|${onPlatformParam}|${searchMessages}|${includeArchived}`
    : undefined;
  if (firstPageKey !== convPageKey) {
    setConvPageKey(firstPageKey);
    setExtraConvPages([]);
    setConvPage(1);
    setConvHasMore(!!firstPage?.hasMore);
    setAllMatchingConv(false);
  }
  // Merge first page + appended pages; dedupe by id (a refetch of page 1 can
  // overlap rows that also live in a loaded later page).
  const allConversations = useMemo(() => {
    const seen = new Set<string>();
    const merged: WaConversation[] = [];
    for (const c of [...(firstPage?.items ?? []), ...extraConvPages]) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      merged.push(c);
    }
    return merged;
  }, [firstPage, extraConvPages]);
  // "Unassigned" has no backend param — filter client-side.
  const conversations =
    assigneeFilter === 'unassigned'
      ? allConversations.filter((c) => !c.assignedTo)
      : allConversations;

  // Load the next conversation-list page and append it.
  const loadMoreConvMut = useMutation({
    mutationFn: () => {
      const next = convPage + 1;
      return svc.listConversations({
        q: debouncedSearch,
        unread: unreadOnly,
        status: statusParam,
        assignedTo: assignedToParam,
        onPlatform: onPlatformParam,
        searchMessages,
        includeArchived,
        page: next,
        limit: 50,
      });
    },
    onSuccess: (res) => {
      const page = res.data;
      setExtraConvPages((prev) => [...prev, ...(page?.items ?? [])]);
      setConvPage((p) => p + 1);
      setConvHasMore(!!page?.hasMore);
    },
    onError: (e) =>
      showToast.error((e as unknown as ApiError).message || 'Failed to load more conversations'),
  });

  const detailQuery = useQuery({
    queryKey: ['wa-conversation', selectedId],
    queryFn: () => svc.getConversation(selectedId as string),
    enabled: !!selectedId,
  });
  const selected: WaConversation | null =
    detailQuery.data?.data ?? conversations.find((c) => c.id === selectedId) ?? null;

  const msgQuery = useQuery({
    queryKey: ['wa-messages', selectedId],
    queryFn: () => svc.getMessages(selectedId as string),
    enabled: !!selectedId,
  });
  // Merge older (prepended) + current page + optimistic pending bubbles;
  // dedupe by id; keep newest-at-bottom order. Pending bubbles whose text now
  // appears in a real server outbound message are dropped (reconciliation).
  const messages = useMemo(() => {
    const current = msgQuery.data?.data?.items ?? [];
    const seen = new Set<string>();
    const merged: WaMessage[] = [];
    for (const m of [...olderMessages, ...current]) {
      if (seen.has(m.id)) continue;
      // Reactions are not bubbles — they render on their target message via
      // `reactions`. Skip any REACTION-typed rows (incl. legacy orphans created
      // before reactions attached to the target).
      if (m.type === 'REACTION') continue;
      seen.add(m.id);
      merged.push(m);
    }
    // Drop optimistic bubbles already reflected by a real outbound server
    // message (same text), keeping the rest pinned to the bottom.
    const realOutboundTexts = new Set(
      merged.filter((m) => m.direction === 'OUTBOUND' && m.text).map((m) => m.text),
    );
    for (const p of pendingMessages) {
      if (p.status !== 'FAILED' && p.text && realOutboundTexts.has(p.text)) continue;
      merged.push(p);
    }
    return merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [msgQuery.data, olderMessages, pendingMessages]);

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
    setOlderMessages([]);
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
    const onMessage = (data: { conversationId: string; message?: WaMessage }) => {
      // Merge the pushed message straight into the thread cache — the socket
      // already carries the full row, so render it with zero extra round-trip.
      if (data.message) mergeMessageIntoCache(qc, data.conversationId, data.message);
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
      if (data.conversationId === selectedId) {
        if (data.message?.direction === 'INBOUND') {
          // We're actively viewing this conversation, so the message is "seen":
          // mark read immediately (clears the panel row + sidebar unread counts
          // instead of letting them accumulate). If the agent is scrolled up,
          // bump the jump-button badge instead of yanking them to the bottom.
          svc
            .markRead(selectedId)
            .then(() => {
              qc.invalidateQueries({ queryKey: ['wa-conversations'] });
              qc.invalidateQueries({ queryKey: ['wa-inbox-unread-total'] });
            })
            .catch(() => {});
          if (!isAtBottomRef.current) setNewMsgCount((c) => c + 1);
        }
      } else if (data.message?.direction === 'INBOUND') {
        // New inbound message in a conversation that isn't open → notify
        // (short beep + best-effort browser Notification).
        const body =
          stripWhatsAppFormatting(data.message.text ?? '').trim() ||
          (data.message.type ? `New ${data.message.type.toLowerCase()} message` : 'New message');
        notifyInbound('New WhatsApp message', body);
      }
    };
    const onStatus = (data: {
      conversationId: string;
      wamid?: string;
      status?: WaMessageStatus;
    }) => {
      if (data.conversationId !== selectedId || !data.wamid || !data.status) return;
      // Patch the matching bubble's status in place (grey → ✓ → ✓✓ → blue) —
      // the payload carries {wamid,status}, so no thread refetch is needed.
      const { wamid, status } = data;
      qc.setQueryData(
        ['wa-messages', selectedId],
        (old: { data?: { items?: WaMessage[] } } | undefined) => {
          if (!old?.data?.items) return old;
          let changed = false;
          const items = old.data.items.map((m) => {
            if (m.wamid === wamid && m.status !== status) {
              changed = true;
              return { ...m, status };
            }
            return m;
          });
          return changed ? { ...old, data: { ...old.data, items } } : old;
        },
      );
    };
    // Conversation-level updates: unread counts, assignment, status changes.
    const onConversation = (data: { conversationId: string }) => {
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
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
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
      if (data.conversationId !== selectedId || !data.targetWamid) return;
      // Patch the target message's reactions in place (mirrors the backend merge:
      // one reaction per side; empty emoji = removed) — no thread refetch.
      const { targetWamid, emoji, from, side = 'in' } = data;
      qc.setQueryData(
        ['wa-messages', selectedId],
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
    socket.on('wa:message', onMessage);
    socket.on('wa:status', onStatus);
    socket.on('wa:conversation', onConversation);
    socket.on('wa:reaction', onReaction);
    return () => {
      socket.off('wa:message', onMessage);
      socket.off('wa:status', onStatus);
      socket.off('wa:conversation', onConversation);
      socket.off('wa:reaction', onReaction);
    };
  }, [socket, selectedId, qc]);

  // On select: join the thread room + mark read.
  useEffect(() => {
    if (!selectedId) return;
    // A freshly opened conversation lands at the bottom (or first-unread), so
    // treat it as "at bottom" until the user actually scrolls up.
    isAtBottomRef.current = true;
    emit('wa:open', selectedId);
    svc
      .markRead(selectedId)
      .then(() => {
        qc.invalidateQueries({ queryKey: ['wa-conversations'] });
        // Clear the sidebar unread badge instantly in this tab (the socket
        // echo would also do it, but this avoids the round-trip lag).
        qc.invalidateQueries({ queryKey: ['wa-inbox-unread-total'] });
      })
      .catch(() => {});
    return () => emit('wa:close', selectedId);
  }, [selectedId, emit, qc]);

  // Keep a live reference to the merged messages so the scroll layout-effect can
  // read them without `messages` being a dependency (which would scroll on every
  // message change). Layout effect (not effect) so it runs BEFORE the scroll
  // layout-effect in the same commit. Runs every render — cheap.
  useLayoutEffect(() => {
    messagesRef.current = messages;
  });

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
  // Layout effect: position the scroll BEFORE the browser paints, so the thread
  // appears already at the right spot (bottom / first unread) with no visible
  // "land at top then jump" flash — like the WhatsApp app.
  useLayoutEffect(() => {
    const el = endRef.current;
    if (!el || !selectedId) return;
    const msgs = messagesRef.current;
    if (msgs.length === 0) return;
    const isInitial = initialScrolledConvRef.current !== selectedId;
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
  }, [lastMessageId, selectedId, openUnread]);

  // Optimistic text send: insert a temporary QUEUED bubble immediately, then
  // reconcile (drop it; the real server message arrives via refetch) on
  // success, or flip it to FAILED on error so it can be retried in-place.
  const sendMut = useMutation({
    mutationFn: (vars: { text: string; optimisticId: string; contextWamid?: string }) =>
      svc.sendMessage(selectedId as string, vars.text, vars.contextWamid),
    onMutate: (vars) => {
      if (!selected) return;
      const optimistic = makeOptimisticMessage(selected.id, selected.contactId, vars.text);
      optimistic.id = vars.optimisticId;
      optimistic.contextWamid = vars.contextWamid ?? null;
      setPendingMessages((prev) => [...prev, optimistic]);
      // Replying means you've seen the thread → drop the unread divider.
      setOpenUnread({ convId: selected.id, count: 0 });
    },
    onSuccess: (res, vars) => {
      setDraft('');
      setReplyTo(null);
      // Merge the canonical server message into the cache FIRST so it renders in
      // place of the optimistic bubble with no gap (no refetch, no disappear/
      // reappear flicker), THEN drop the optimistic bubble.
      const real = res?.data;
      if (real) mergeMessageIntoCache(qc, real.conversationId, real);
      setPendingMessages((prev) => prev.filter((m) => m.id !== vars.optimisticId));
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
    },
    onError: (e, vars) => {
      // Rollback to a FAILED bubble (keeps the text for one-tap retry).
      setPendingMessages((prev) =>
        prev.map((m) =>
          m.id === vars.optimisticId
            ? { ...m, status: 'FAILED', errorTitle: (e as unknown as ApiError).message || null }
            : m,
        ),
      );
      showToast.error((e as unknown as ApiError).message || 'Failed to send message');
    },
  });

  // Submit the composer draft as an optimistic send (quoting replyTo if set).
  const submitDraft = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    sendMut.mutate({
      text: trimmed,
      optimisticId: makeOptimisticMessage('', '', trimmed).id,
      contextWamid: replyTo?.wamid ?? undefined,
    });
  };

  // Re-send a FAILED message: remove the failed bubble, fire a fresh send.
  const retrySend = (text: string, failedId?: string) => {
    if (failedId) setPendingMessages((prev) => prev.filter((m) => m.id !== failedId));
    sendMut.mutate({ text, optimisticId: makeOptimisticMessage('', '', text).id });
  };

  const workflowMut = useMutation({
    mutationFn: (vars: { type: 'assign' } | { type: 'status'; status: 'OPEN' | 'RESOLVED' }) => {
      if (vars.type === 'assign') return svc.assign(selectedId as string, user?.id ?? null);
      return svc.setStatus(selectedId as string, vars.status);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-conversation', selectedId] });
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Action failed'),
  });

  // Load older messages: fetch before the oldest currently-loaded createdAt, prepend + dedupe.
  const loadOlderMut = useMutation({
    mutationFn: () => {
      const oldest = messages[0]?.createdAt;
      return svc.getMessages(selectedId as string, oldest);
    },
    onSuccess: (res) => {
      const older = res.data?.items ?? [];
      if (older.length === 0) {
        setHasMoreOlder(false);
        return;
      }
      setOlderMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const next = [...prev];
        for (const m of older) {
          if (!seen.has(m.id)) {
            seen.add(m.id);
            next.push(m);
          }
        }
        return next;
      });
    },
    onError: (e) =>
      showToast.error((e as unknown as ApiError).message || 'Failed to load older messages'),
  });

  const sendMediaMut = useMutation({
    mutationFn: ({ file, voice }: { file: File; voice?: boolean }) =>
      svc.sendMedia(selectedId as string, file, undefined, voice),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-messages', selectedId] });
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
      if (selectedId) setOpenUnread({ convId: selectedId, count: 0 });
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to send media'),
  });

  // "Delete for me" — soft-delete single/selected messages from the inbox view.
  const deleteMessagesMut = useMutation({
    mutationFn: (ids: string[]) => svc.deleteMessages(selectedId as string, ids),
    onSuccess: (_res, ids) => {
      const del = new Set(ids);
      // The refetch excludes deleted rows, but olderMessages + pendingMessages
      // are client-held buffers, so drop the ids from them too.
      setOlderMessages((prev) => prev.filter((m) => !del.has(m.id)));
      setPendingMessages((prev) => prev.filter((m) => !del.has(m.id)));
      qc.invalidateQueries({ queryKey: ['wa-messages', selectedId] });
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
      exitMessageSelection();
      showToast.success(ids.length > 1 ? `${ids.length} messages deleted` : 'Message deleted');
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to delete'),
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
  const archiveMut = useMutation({
    mutationFn: (archived: boolean) => svc.archiveConversation(selectedId as string, archived),
    onSuccess: (_res, archived) => {
      showToast.success(archived ? 'Conversation archived' : 'Conversation restored');
      qc.invalidateQueries({ queryKey: ['wa-conversation', selectedId] });
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to archive'),
  });

  // Request a CSAT rating from the contact (only while the 24h window is open).
  const csatMut = useMutation({
    mutationFn: () => svc.requestCsat(selectedId as string),
    onSuccess: () => {
      showToast.success('Rating request sent');
      qc.invalidateQueries({ queryKey: ['wa-conversation', selectedId] });
    },
    onError: (e) =>
      showToast.error((e as unknown as ApiError).message || 'Failed to request rating'),
  });

  // Export the current conversation transcript as CSV.
  const transcriptMut = useMutation({
    mutationFn: () => svc.exportTranscript(selectedId as string),
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to export'),
  });

  // ── Bulk selection (page id list OR "all matching the filter") ──
  const pageConvIds = conversations.map((c) => c.id);
  const allConvSelected = pageConvIds.length > 0 && pageConvIds.every((id) => selectedIds.has(id));
  const someConvSelected = selectedIds.size > 0 && !allConvSelected;
  const convBulkFilters = {
    q: debouncedSearch || undefined,
    unreadOnly,
    status: statusParam,
    assignedTo: assignedToParam,
    onPlatform: onPlatformParam,
    searchMessages,
    includeArchived,
  };
  const totalMatchingConv = firstPage?.total ?? conversations.length;
  // "Unassigned" is a client-only filter with no backend equivalent, so
  // all-matching (which selects via backend filters) isn't offered there.
  const canSelectAllMatchingConv = assigneeFilter !== 'unassigned';

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
    qc.invalidateQueries({ queryKey: ['wa-unread-total'] });
    clearConvSelection();
  };

  const canReply = selected
    ? windowOpen(selected.windowExpiresAt) && !selected.contact.isBlocked
    : false;
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

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="whatsapp.inbox.view"
    >
      <div className="flex h-[calc(100vh-9rem)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)]">
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
                onClick={() => setUnreadOnly((v) => !v)}
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
                  onClick={() => setSearchMessages((v) => !v)}
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
              <button
                type="button"
                onClick={() => setIncludeArchived((v) => !v)}
                aria-pressed={includeArchived}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  includeArchived
                    ? 'bg-emerald-600 text-white'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]',
                )}
              >
                Include archived
              </button>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              <Select
                size="sm"
                clearable={false}
                value={statusFilter}
                onChange={(v) => setStatusFilter(v as StatusFilter)}
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
                onChange={(v) => setAssigneeFilter(v as AssigneeFilter)}
                options={[
                  { value: 'all', label: 'Anyone' },
                  { value: 'me', label: 'Assigned to me' },
                  { value: 'unassigned', label: 'Unassigned' },
                ]}
              />
              <Select
                size="sm"
                clearable={false}
                value={platformFilter}
                onChange={(v) => setPlatformFilter(v as PlatformFilter)}
                options={[
                  { value: 'all', label: 'All users' },
                  { value: 'on', label: 'On-platform' },
                  { value: 'off', label: 'Off-platform' },
                ]}
              />
            </div>
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
          <div className="flex-1 overflow-y-auto">
            {convQuery.isLoading && (
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
            {!convQuery.isLoading && !convQuery.isError && conversations.length === 0 && (
              <p className="p-6 text-center text-sm text-[var(--text-muted)]">
                No conversations yet. They appear here when someone messages your WhatsApp number.
              </p>
            )}
            {conversations.map((c) => (
              <ConversationRow
                key={c.id}
                conv={c}
                active={c.id === selectedId}
                onClick={() => setSelectedId(c.id)}
                selected={selectedIds.has(c.id)}
                onToggleSelect={(checked) => toggleSelect(c.id, checked)}
              />
            ))}
            {convHasMore && assigneeFilter !== 'unassigned' && (
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
                    src={selected.contact.user?.avatar}
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
                      {selected.contact.userId && (
                        <BadgeCheck
                          className="h-4 w-4 text-[var(--primary)]"
                          aria-label="On-platform user"
                          role="img"
                        />
                      )}
                      {selectedSnoozed && (
                        <Tooltip content={`Snoozed until ${fmtTime(selected.snoozedUntil)}`}>
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                            <Clock className="h-3 w-3" /> Snoozed
                          </span>
                        </Tooltip>
                      )}
                      {typeof selected.csatScore === 'number' && (
                        <Tooltip content={`Customer satisfaction: ${selected.csatScore}/5`}>
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
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">
                      {selected.contact.phone}
                      {selected.contact.userId ? ' · on-platform' : ' · off-platform'}
                      {selected.contact.optInStatus === 'OPTED_OUT' && ' · opted out'}
                    </p>
                    {selected.labels?.length > 0 && (
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <TagIcon className="h-3 w-3 text-[var(--text-muted)]" />
                        {selected.labels.map((label) => (
                          <span
                            key={label}
                            className="text-primary inline-flex items-center rounded-full bg-[var(--primary-light)] px-2 py-0.5 text-[10px] font-medium"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    )}
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
                  <Tooltip content="Export transcript (CSV)">
                    <button
                      type="button"
                      onClick={() => transcriptMut.mutate()}
                      disabled={transcriptMut.isPending}
                      aria-label="Export transcript"
                      className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-60"
                    >
                      {transcriptMut.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
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
                    className="hidden rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] sm:block"
                  >
                    Assign to me
                  </button>
                  {selected.status === 'RESOLVED' ? (
                    <button
                      type="button"
                      onClick={() => workflowMut.mutate({ type: 'status', status: 'OPEN' })}
                      className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                    >
                      Reopen
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => workflowMut.mutate({ type: 'status', status: 'RESOLVED' })}
                      className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                    >
                      Resolve
                    </button>
                  )}
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
                <div
                  ref={scrollContainerRef}
                  onScroll={handleThreadScroll}
                  className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4"
                >
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
                      </div>
                    )}
                  {messages.map((m, i) => {
                    const showDay =
                      i === 0 || dayKey(messages[i - 1].createdAt) !== dayKey(m.createdAt);
                    return (
                      <div key={m.id} id={`wa-msg-${m.id}`} className="space-y-2">
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
                          onRetry={(text) =>
                            retrySend(text, isOptimisticId(m.id) ? m.id : undefined)
                          }
                          onReply={(msg) => setReplyTo(msg)}
                          quotedText={m.contextWamid ? wamidToText.get(m.contextWamid) : undefined}
                          selectionMode={selectionMode}
                          selected={selectedMessageIds.has(m.id)}
                          onToggleSelect={toggleMessageSelect}
                          onCopy={copyMessageText}
                          onDelete={deleteOneMessage}
                          onStartSelect={enterMessageSelection}
                        />
                      </div>
                    );
                  })}
                  <div ref={endRef} />
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
                      onInsert={(t) => setDraft((d) => (d ? `${d}\n${t}` : t))}
                      onSent={() => {
                        qc.invalidateQueries({ queryKey: ['wa-messages', selected.id] });
                        qc.invalidateQueries({ queryKey: ['wa-conversations'] });
                      }}
                    />
                    {/* Emoji picker */}
                    <div className="relative">
                      <Tooltip content="Emoji">
                        <button
                          type="button"
                          onClick={() => setEmojiOpen((v) => !v)}
                          aria-label="Emoji"
                          className="flex h-10 items-center rounded-lg px-2 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
                        >
                          <Smile className="h-5 w-5" />
                        </button>
                      </Tooltip>
                      {emojiOpen && (
                        <div className="absolute bottom-12 left-0 z-20 grid w-44 grid-cols-8 gap-1 rounded-lg border border-[var(--border)] bg-white p-2 shadow-lg">
                          {EMOJIS.map((e) => (
                            <button
                              key={e}
                              type="button"
                              onClick={() => {
                                setDraft((d) => d + e);
                                setEmojiOpen(false);
                              }}
                              className="rounded text-lg hover:bg-[var(--bg-secondary)]"
                            >
                              {e}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Attach menu: Photos & Videos / Audio / Document (any file) */}
                    <AttachMenu
                      onPickFile={(file) => sendMediaMut.mutate({ file })}
                      onContact={() => setContactOpen(true)}
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
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          submitDraft(draft);
                        }
                      }}
                      rows={1}
                      placeholder="Type a message…"
                      className="max-h-32 min-h-[40px] flex-1 resize-none rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
                    />
                    {/* Record + send a voice message (overlays the row while active) */}
                    <VoiceRecorder
                      onRecorded={(file) => sendMediaMut.mutate({ file, voice: true })}
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
                ) : selected.contact.isBlocked ? (
                  <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-xs text-red-800">
                    This contact is blocked — you cannot message them.
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
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
              // Drop client-held buffers the query refetch wouldn't clear.
              setOlderMessages([]);
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
        <MediaGalleryModal messages={messages} onClose={() => setMediaGalleryOpen(false)} />
      )}

      {contactOpen && selected && (
        <ContactComposeModal
          conversationId={selected.id}
          onClose={() => setContactOpen(false)}
          onSent={() => setContactOpen(false)}
        />
      )}
    </DashboardLayout>
  );
}
