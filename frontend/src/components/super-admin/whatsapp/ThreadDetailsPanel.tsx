'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Tag,
  Plus,
  Clock,
  StickyNote,
  Trash2,
  UserCircle2,
  ExternalLink,
  Images,
  Mail,
  Briefcase,
  CreditCard,
  Gauge,
} from 'lucide-react';
import Link from 'next/link';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import { showToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/constants/routes';
import { superAdminWhatsappService as svc } from '@/services/super-admin-whatsapp.service';
import type { WaAgent, WaConversation, WaPlatformContext } from '@/types/whatsapp';
import type { ApiError } from '@/types/api';
import ScheduledMessagesPanel from './ScheduledMessagesPanel';

function agentLabel(a: WaAgent): string {
  const name = [a.firstName, a.lastName].filter(Boolean).join(' ').trim();
  return name || a.email;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString([], {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Build the ISO target for the snooze presets. */
function snoozeTarget(preset: '1h' | '3h' | 'tomorrow'): string {
  const d = new Date();
  if (preset === '1h') d.setHours(d.getHours() + 1);
  else if (preset === '3h') d.setHours(d.getHours() + 3);
  else {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
  }
  return d.toISOString();
}

/** Assign-to-agent dropdown (agents + Unassign). */
function AssignControl({ conversation }: { conversation: WaConversation }) {
  const qc = useQueryClient();
  const agentsQuery = useQuery({ queryKey: ['wa-agents'], queryFn: () => svc.listAgents() });
  const agents = agentsQuery.data?.data ?? [];

  const assignMut = useMutation({
    mutationFn: (agentId: string | null) => svc.assign(conversation.id, agentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-conversation', conversation.id] });
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to assign'),
  });

  const options = useMemo(
    () => [
      { value: '', label: 'Unassigned' },
      ...agents.map((a) => ({ value: a.id, label: agentLabel(a) })),
    ],
    [agents],
  );

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
        <UserCircle2 className="h-3.5 w-3.5" /> Assigned agent
      </p>
      <Select
        size="sm"
        clearable={false}
        searchable={agents.length > 6}
        value={conversation.assignedTo ?? ''}
        onChange={(v) => assignMut.mutate(v ? v : null)}
        options={options}
        placeholder={agentsQuery.isLoading ? 'Loading agents…' : 'Unassigned'}
      />
    </div>
  );
}

/** Labels chips with inline add/remove. */
function LabelsEditor({ conversation }: { conversation: WaConversation }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState('');

  const setMut = useMutation({
    mutationFn: (labels: string[]) => svc.setLabels(conversation.id, labels),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-conversation', conversation.id] });
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
    },
    onError: (e) =>
      showToast.error((e as unknown as ApiError).message || 'Failed to update labels'),
  });

  const labels = conversation.labels ?? [];

  const addLabel = () => {
    const next = value.trim();
    if (!next) return;
    if (labels.includes(next)) {
      setValue('');
      setAdding(false);
      return;
    }
    setMut.mutate([...labels, next]);
    setValue('');
    setAdding(false);
  };

  const removeLabel = (label: string) => setMut.mutate(labels.filter((l) => l !== label));

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
        <Tag className="h-3.5 w-3.5" /> Labels
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {labels.map((label) => (
          <span
            key={label}
            className="text-primary inline-flex items-center gap-1 rounded-full bg-[var(--primary-light)] px-2 py-0.5 text-[11px] font-medium"
          >
            {label}
            <button
              type="button"
              onClick={() => removeLabel(label)}
              className="text-primary/70 hover:text-primary"
              aria-label={`Remove ${label}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {adding ? (
          <span className="flex items-center gap-1">
            <Input
              value={value}
              autoFocus
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addLabel();
                } else if (e.key === 'Escape') {
                  setAdding(false);
                  setValue('');
                }
              }}
              placeholder="Label…"
              className="h-7 w-28 text-xs"
            />
            <button
              type="button"
              onClick={addLabel}
              className="rounded-md bg-emerald-600 px-1.5 py-0.5 text-[11px] font-medium text-white hover:bg-emerald-700"
            >
              Add
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="hover:text-primary inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--border)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)] hover:border-[var(--primary)]"
          >
            <Plus className="h-3 w-3" /> Add label
          </button>
        )}
      </div>
    </div>
  );
}

/** Snooze presets + active-snooze indicator. */
function SnoozeControl({ conversation }: { conversation: WaConversation }) {
  const qc = useQueryClient();
  const snoozeMut = useMutation({
    mutationFn: (iso: string | null) => svc.setSnooze(conversation.id, iso),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-conversation', conversation.id] });
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to snooze'),
  });

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
  const snoozedActive =
    !!conversation.snoozedUntil && new Date(conversation.snoozedUntil).getTime() > nowTs;

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
        <Clock className="h-3.5 w-3.5" /> Snooze
      </p>
      {snoozedActive ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
          <span>Snoozed until {fmtDateTime(conversation.snoozedUntil)}</span>
          <button
            type="button"
            onClick={() => snoozeMut.mutate(null)}
            className="shrink-0 font-medium text-amber-900 underline hover:no-underline"
          >
            Unsnooze
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {(['1h', '3h', 'tomorrow'] as const).map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={snoozeMut.isPending}
              onClick={() => snoozeMut.mutate(snoozeTarget(preset))}
              className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-60"
            >
              {preset === 'tomorrow' ? 'Tomorrow 9am' : `+${preset}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Status pill for an application / plan state. */
function StatusPill({ status }: { status: string }) {
  return (
    <span className="text-primary inline-flex shrink-0 items-center rounded-full bg-[var(--primary-light)] px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase">
      {status}
    </span>
  );
}

/**
 * On-platform user reference (Platform 360). Fetches and embeds the real
 * HireAdda context for the contact's linked user: identity, recent
 * applications, plan and profile completeness — plus the external profile link.
 */
function PlatformPanel({ userId, contactId }: { userId: string; contactId: string }) {
  const ctxQuery = useQuery({
    queryKey: ['wa-platform-context', contactId],
    queryFn: () => svc.getPlatformContext(contactId),
    enabled: !!userId,
  });
  const ctx: WaPlatformContext | undefined = ctxQuery.data?.data;
  const platformUser = ctx?.user ?? null;
  const applications = ctx?.applications ?? [];
  const plan = ctx?.plan ?? null;
  const completeness = ctx?.profileCompleteness;

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
        <UserCircle2 className="h-3.5 w-3.5" /> On-platform user
      </p>
      <div className="space-y-2.5 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-2">
        <Badge variant="info" size="sm">
          Verified user
        </Badge>

        {ctxQuery.isLoading && (
          <p className="text-[11px] text-[var(--text-muted)]">Loading platform context…</p>
        )}
        {ctxQuery.isError && (
          <p className="text-[11px] text-[var(--error)]">Could not load platform context.</p>
        )}

        {/* Identity */}
        {platformUser ? (
          <div className="space-y-0.5">
            <p className="truncate text-[12px] font-semibold text-[var(--text)]">
              {platformUser.name || '—'}
            </p>
            {platformUser.email && (
              <p className="flex items-center gap-1 truncate text-[11px] text-[var(--text-muted)]">
                <Mail className="h-3 w-3 shrink-0" /> {platformUser.email}
              </p>
            )}
            {platformUser.role && (
              <p className="text-[10px] font-medium tracking-wide text-[var(--text-muted)] uppercase">
                {platformUser.role}
              </p>
            )}
          </div>
        ) : (
          !ctxQuery.isLoading &&
          !ctxQuery.isError && (
            <p className="truncate font-mono text-[11px] text-[var(--text-muted)]">{userId}</p>
          )
        )}

        {/* Plan */}
        {plan && (
          <div className="border-t border-[var(--border)] pt-2">
            <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold tracking-wide text-[var(--text-muted)] uppercase">
              <CreditCard className="h-3 w-3" /> Plan
            </p>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[11px] font-medium text-[var(--text)]">
                {plan.name}
              </span>
              <StatusPill status={plan.status} />
            </div>
            {plan.currentEnd && (
              <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                Renews/ends {fmtDateTime(plan.currentEnd)}
              </p>
            )}
          </div>
        )}

        {/* Profile completeness */}
        {typeof completeness === 'number' && (
          <div className="border-t border-[var(--border)] pt-2">
            <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold tracking-wide text-[var(--text-muted)] uppercase">
              <Gauge className="h-3 w-3" /> Profile completeness
            </p>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bg)]">
                <div
                  className="h-full rounded-full bg-[var(--primary)]"
                  style={{ width: `${Math.max(0, Math.min(100, completeness))}%` }}
                />
              </div>
              <span className="shrink-0 text-[10px] font-semibold text-[var(--text)]">
                {Math.round(completeness)}%
              </span>
            </div>
          </div>
        )}

        {/* Recent applications */}
        {applications.length > 0 && (
          <div className="border-t border-[var(--border)] pt-2">
            <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold tracking-wide text-[var(--text-muted)] uppercase">
              <Briefcase className="h-3 w-3" /> Recent applications
            </p>
            <ul className="space-y-1.5">
              {applications.map((app) => (
                <li key={app.id} className="rounded-md bg-[var(--bg)] px-2 py-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] font-medium text-[var(--text)]">
                      {app.jobTitle}
                    </span>
                    <StatusPill status={app.status} />
                  </div>
                  <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                    Applied {fmtDateTime(app.appliedAt)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!ctxQuery.isLoading &&
          !ctxQuery.isError &&
          !plan &&
          applications.length === 0 &&
          typeof completeness !== 'number' && (
            <p className="border-t border-[var(--border)] pt-2 text-[11px] text-[var(--text-muted)]">
              No further platform activity.
            </p>
          )}

        <Link
          href={ROUTES.SUPER_ADMIN.USER_DETAIL(userId)}
          className="text-primary inline-flex items-center gap-1 text-[11px] font-medium hover:underline"
        >
          Open user profile <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

/** Internal notes list + add/delete. */
function NotesPanel({ conversationId }: { conversationId: string }) {
  const qc = useQueryClient();
  const notesQuery = useQuery({
    queryKey: ['wa-notes', conversationId],
    queryFn: () => svc.listNotes(conversationId),
  });
  const notes = notesQuery.data?.data ?? [];
  const [body, setBody] = useState('');

  const createMut = useMutation({
    mutationFn: (text: string) => svc.createNote(conversationId, text),
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey: ['wa-notes', conversationId] });
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to add note'),
  });
  const deleteMut = useMutation({
    mutationFn: (noteId: string) => svc.deleteNote(conversationId, noteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wa-notes', conversationId] }),
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to delete note'),
  });

  const submit = () => {
    const text = body.trim();
    if (text) createMut.mutate(text);
  };

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
        <StickyNote className="h-3.5 w-3.5" /> Internal notes
      </p>
      <div className="space-y-2">
        {notesQuery.isLoading && (
          <p className="text-[11px] text-[var(--text-muted)]">Loading notes…</p>
        )}
        {!notesQuery.isLoading && notes.length === 0 && (
          <p className="text-[11px] text-[var(--text-muted)]">No notes yet.</p>
        )}
        {notes.map((note) => (
          <div
            key={note.id}
            className="group flex items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[11px] break-words whitespace-pre-wrap text-[var(--text)]">
                {note.body}
              </p>
              <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                {fmtDateTime(note.createdAt)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => deleteMut.mutate(note.id)}
              className="shrink-0 text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100 hover:text-[var(--error)]"
              aria-label="Delete note"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-2 space-y-1.5">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          placeholder="Add an internal note…"
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={submit}
            isLoading={createMut.isPending}
            disabled={!body.trim()}
          >
            Add note
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Right-side collapsible panel for a conversation: assign-to-agent, labels,
 * snooze, on-platform reference (Platform 360) and internal notes.
 */
/** "Clear chat history" — soft-delete every message in the conversation (our
 *  side only; the customer keeps their copy). Two-step inline confirm. */
function ClearChatSection({
  conversationId,
  onCleared,
}: {
  conversationId: string;
  onCleared?: () => void;
}) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const clearMut = useMutation({
    mutationFn: () => svc.clearConversation(conversationId),
    onSuccess: () => {
      showToast.success('Chat history cleared');
      setConfirming(false);
      qc.invalidateQueries({ queryKey: ['wa-messages', conversationId] });
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
      onCleared?.();
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to clear chat'),
  });
  return (
    <div className="border-t border-[var(--border)] pt-4">
      <p className="mb-2 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">
        Danger zone
      </p>
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-red-300 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" /> Clear chat history
        </button>
      ) : (
        <div className="space-y-2 rounded-md border border-red-300 bg-red-50 p-3">
          <p className="text-xs text-red-800">
            Clear all messages from this chat on your side? The customer keeps their copy. This
            can’t be undone.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={clearMut.isPending}
              className="flex-1 rounded-md border border-[var(--border)] bg-white px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => clearMut.mutate()}
              disabled={clearMut.isPending}
              className="flex-1 rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {clearMut.isPending ? 'Clearing…' : 'Clear'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ThreadDetailsPanel({
  conversation,
  open,
  onClose,
  onOpenMedia,
  onCleared,
  className,
}: {
  conversation: WaConversation;
  open: boolean;
  onClose: () => void;
  /** Open the media-gallery modal (the page owns the loaded messages). */
  onOpenMedia?: () => void;
  /** Called after the chat history is cleared, so the page can drop its local
   *  message buffers (older/optimistic) that the query refetch wouldn't clear. */
  onCleared?: () => void;
  /** Extra classes for responsive layout (e.g. full-width on mobile). */
  className?: string;
}) {
  if (!open) return null;
  return (
    <aside
      className={cn(
        'flex w-72 shrink-0 flex-col overflow-y-auto border-l border-[var(--border)] bg-[var(--bg)]',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-bold text-[var(--text)]">Conversation details</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
          aria-label="Close details"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-5 p-4">
        <AssignControl conversation={conversation} />
        <LabelsEditor conversation={conversation} />
        <SnoozeControl conversation={conversation} />
        <ScheduledMessagesPanel conversationId={conversation.id} />
        {onOpenMedia && (
          <button
            type="button"
            onClick={onOpenMedia}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
          >
            <Images className="h-4 w-4" /> View shared media
          </button>
        )}
        {conversation.contact.userId && (
          <PlatformPanel userId={conversation.contact.userId} contactId={conversation.contactId} />
        )}
        <NotesPanel conversationId={conversation.id} />
        <ClearChatSection conversationId={conversation.id} onCleared={onCleared} />
      </div>
    </aside>
  );
}
