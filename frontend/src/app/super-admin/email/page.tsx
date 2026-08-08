'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Mail,
  MailOpen,
  Search,
  Send,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  RotateCcw,
  StickyNote,
  UserPlus,
  Tag,
  Clock,
  CalendarClock,
  Paperclip,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Tooltip from '@/components/ui/Tooltip';
import DatePicker from '@/components/ui/DatePicker';
import { cn } from '@/lib/utils';
import { useSocket } from '@/hooks/use-socket';
import { useAuthStore } from '@/store/auth.store';
import { superAdminEmailService as svc } from '@/services/super-admin-email.service';
import { showToast } from '@/components/ui/Toast';
import { promptDialog } from '@/components/ui/dialog-service';
import { handleBulkResult } from '@/lib/email-bulk';
import { useBulkSelect } from '@/hooks/use-bulk-select';
import {
  BulkBar,
  BulkButton,
  HeaderCheckbox,
  RowCheckbox,
} from '@/components/super-admin/email/bulk-ui';
import AttachmentPicker from '@/components/super-admin/email/AttachmentPicker';
import {
  notifyInbound,
  ensureNotificationPermission,
} from '@/components/super-admin/email/email-notify';
import type { EmailThreadStatus, OutboundAttachmentRef } from '@/types/email';

export default function SuperAdminEmailInboxPage() {
  const qc = useQueryClient();
  const { socket } = useSocket();
  const { user } = useAuthStore();
  const [status, setStatus] = useState<EmailThreadStatus | ''>('');
  const [unread, setUnread] = useState(false);
  const [snoozed, setSnoozed] = useState(false);
  const [showScheduled, setShowScheduled] = useState(false);
  const [q, setQ] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const sel = useBulkSelect();

  const { data, isLoading } = useQuery({
    queryKey: ['email-threads', status, unread, snoozed, q],
    queryFn: () =>
      svc.listThreads({
        status: status || undefined,
        unread: unread || undefined,
        snoozed: snoozed || undefined,
        q: q || undefined,
        limit: 50,
      }),
    refetchInterval: 30_000,
  });
  const threads = data?.data?.items ?? [];
  const total = data?.data?.total ?? 0;
  const pageIds = threads.map((t) => t.id);

  /** Current list filter (no pagination) — powers "select all matching filter" bulk scope. */
  function currentFilter(): Record<string, unknown> {
    return {
      status: status || undefined,
      unread: unread || undefined,
      snoozed: snoozed || undefined,
      q: q || undefined,
    };
  }
  /** Bulk scope: whole filter when "select all matching" is engaged, else the checked ids. */
  function scope(): { ids?: string[]; filter?: Record<string, unknown> } {
    return sel.allMatching ? { filter: currentFilter() } : { ids: sel.ids };
  }

  async function runBulk(body: {
    action:
      | 'read'
      | 'unread'
      | 'status'
      | 'archive'
      | 'unarchive'
      | 'addLabels'
      | 'removeLabels'
      | 'assign';
    status?: EmailThreadStatus;
    labels?: string[];
    userId?: string | null;
  }) {
    try {
      const res = await svc.bulkThreads({ ...scope(), ...body });
      handleBulkResult(res.data, { qc, label: 'Updated threads' });
      qc.invalidateQueries({ queryKey: ['email-threads'] });
      qc.invalidateQueries({ queryKey: ['email-inbox-unread-total'] });
      sel.clear();
    } catch {
      showToast.error('Bulk action failed');
    }
  }

  async function addLabel() {
    const l = (await promptDialog({ title: 'Add label', label: 'Label to add' }))?.trim();
    if (l) runBulk({ action: 'addLabels', labels: [l] });
  }
  async function removeLabel() {
    const l = (await promptDialog({ title: 'Remove label', label: 'Label to remove' }))?.trim();
    if (l) runBulk({ action: 'removeLabels', labels: [l] });
  }

  useEffect(() => {
    ensureNotificationPermission();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onMessage = (d: {
      message?: { direction?: string; subject?: string | null; snippet?: string | null };
    }) => {
      if (d?.message?.direction === 'INBOUND') {
        notifyInbound(
          'New email reply',
          d.message.snippet || d.message.subject || 'You have a new reply',
        );
      }
      qc.invalidateQueries({ queryKey: ['email-threads'] });
    };
    const onThread = () => qc.invalidateQueries({ queryKey: ['email-threads'] });
    socket.on('email:message', onMessage);
    socket.on('email:thread', onThread);
    return () => {
      socket.off('email:message', onMessage);
      socket.off('email:thread', onThread);
    };
  }, [socket, qc]);

  return (
    <DashboardLayout requiredRole={['ADMIN', 'SUPER_ADMIN']} requiredPermission="email.inbox.view">
      <div className="flex h-[calc(100vh-8rem)] flex-col gap-3">
        {sel.active && (
          <BulkBar
            count={sel.count}
            allMatching={sel.allMatching}
            totalMatching={total}
            allOnPage={sel.allOnPage(pageIds)}
            entity="threads"
            onSelectAllMatching={sel.selectAllMatching}
            onClear={sel.clear}
          >
            <BulkButton icon={MailOpen} onClick={() => runBulk({ action: 'read' })}>
              Mark read
            </BulkButton>
            <BulkButton icon={Mail} onClick={() => runBulk({ action: 'unread' })}>
              Mark unread
            </BulkButton>
            <BulkButton
              icon={CheckCircle2}
              onClick={() => runBulk({ action: 'status', status: 'RESOLVED' })}
            >
              Resolve
            </BulkButton>
            <BulkButton
              icon={RotateCcw}
              onClick={() => runBulk({ action: 'status', status: 'OPEN' })}
            >
              Reopen
            </BulkButton>
            <BulkButton
              icon={Clock}
              onClick={() => runBulk({ action: 'status', status: 'PENDING' })}
            >
              Mark pending
            </BulkButton>
            <BulkButton icon={Archive} onClick={() => runBulk({ action: 'archive' })}>
              Archive
            </BulkButton>
            <BulkButton icon={ArchiveRestore} onClick={() => runBulk({ action: 'unarchive' })}>
              Unarchive
            </BulkButton>
            <BulkButton icon={Tag} onClick={addLabel}>
              Add label
            </BulkButton>
            <BulkButton icon={Tag} onClick={removeLabel}>
              Remove label
            </BulkButton>
            {user?.id && (
              <BulkButton
                icon={UserPlus}
                onClick={() => runBulk({ action: 'assign', userId: user?.id ?? null })}
              >
                Assign to me
              </BulkButton>
            )}
          </BulkBar>
        )}
        <div className="flex min-h-0 flex-1 gap-4">
          {/* List pane */}
          <div className="flex w-80 shrink-0 flex-col rounded-xl border border-[var(--border)] bg-white">
            <div className="border-b border-[var(--border)] p-3">
              <h1 className="mb-2 flex items-center gap-2 text-lg font-bold text-[var(--text)]">
                <Mail className="h-5 w-5 text-blue-600" /> Email Inbox
              </h1>
              <div className="relative mb-2">
                <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-[var(--text-muted)]" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search…"
                  className="w-full rounded-lg border border-[var(--border)] py-2 pr-3 pl-8 text-sm"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(['', 'OPEN', 'PENDING', 'RESOLVED'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-medium',
                      status === s ? 'bg-blue-100 text-blue-700' : 'text-[var(--text-muted)]',
                    )}
                  >
                    {s || 'All'}
                  </button>
                ))}
                <button
                  onClick={() => setUnread((u) => !u)}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-xs font-medium',
                    unread ? 'bg-blue-100 text-blue-700' : 'text-[var(--text-muted)]',
                  )}
                >
                  Unread
                </button>
                <Tooltip content="Show snoozed threads">
                  <button
                    onClick={() => setSnoozed((v) => !v)}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-medium',
                      snoozed ? 'bg-blue-100 text-blue-700' : 'text-[var(--text-muted)]',
                    )}
                  >
                    Snoozed
                  </button>
                </Tooltip>
                <Tooltip content="Pending scheduled replies">
                  <button
                    onClick={() => setShowScheduled((v) => !v)}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-medium',
                      showScheduled ? 'bg-blue-100 text-blue-700' : 'text-[var(--text-muted)]',
                    )}
                  >
                    <CalendarClock className="inline h-3.5 w-3.5" />
                  </button>
                </Tooltip>
              </div>
            </div>
            {showScheduled && <ScheduledRepliesPanel />}
            {threads.length > 0 && (
              <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-muted)]">
                <HeaderCheckbox
                  checked={sel.allMatching || sel.allOnPage(pageIds)}
                  indeterminate={sel.someOnPage(pageIds)}
                  onChange={(on) => sel.setPage(pageIds, on)}
                  title="Select page"
                />
                <span>Select page</span>
              </div>
            )}
            <div className="flex-1 overflow-y-auto" data-lenis-prevent>
              {isLoading && (
                <p className="p-4 text-center text-sm text-[var(--text-muted)]">Loading…</p>
              )}
              {!isLoading && threads.length === 0 && (
                <p className="p-6 text-center text-sm text-[var(--text-muted)]">
                  No conversations.
                </p>
              )}
              {threads.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    'flex items-start gap-2 border-b border-[var(--border)] px-3 py-2.5 hover:bg-[var(--bg-secondary)]',
                    activeId === t.id && 'bg-blue-50',
                  )}
                >
                  <div className="pt-0.5">
                    <RowCheckbox
                      checked={sel.isSelected(t.id)}
                      onChange={() => sel.toggle(t.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <button onClick={() => setActiveId(t.id)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-[var(--text)]">
                        {t.contact?.name || t.contact?.email || 'Unknown'}
                      </span>
                      {t.unreadCount > 0 && (
                        <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-bold text-white">
                          {t.unreadCount}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs font-medium text-[var(--text-secondary)]">
                      {t.threadSubject || '(no subject)'}
                    </p>
                    <p className="truncate text-xs text-[var(--text-muted)]">
                      {t.lastMessagePreview}
                    </p>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Detail pane */}
          <div className="flex-1 rounded-xl border border-[var(--border)] bg-white">
            {activeId ? (
              <ThreadDetail threadId={activeId} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
                Select a conversation to read + reply.
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

/** Pending send-later replies across all threads, with cancel. */
function ScheduledRepliesPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['email-scheduled-replies'],
    queryFn: () => svc.listScheduled(),
    refetchInterval: 60_000,
  });
  const rows = data?.data ?? [];
  return (
    <div
      className="max-h-48 overflow-y-auto border-b border-[var(--border)] bg-[var(--bg-secondary)] p-2"
      data-lenis-prevent
    >
      <p className="mb-1 px-1 text-[10px] font-semibold tracking-wide text-[var(--text-muted)] uppercase">
        Scheduled replies
      </p>
      {isLoading && <p className="px-1 text-xs text-[var(--text-muted)]">Loading…</p>}
      {!isLoading && rows.length === 0 && (
        <p className="px-1 text-xs text-[var(--text-muted)]">Nothing scheduled.</p>
      )}
      {rows.map((s) => (
        <div key={s.id} className="flex items-center gap-2 rounded-lg px-1 py-1 text-xs">
          <CalendarClock className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[var(--text)]">{s.body}</p>
            <p className="text-[10px] text-[var(--text-muted)]">
              {new Date(s.sendAt).toLocaleString()}
            </p>
          </div>
          <button
            onClick={async () => {
              await svc.cancelScheduled(s.id);
              showToast.success('Scheduled reply cancelled');
              qc.invalidateQueries({ queryKey: ['email-scheduled-replies'] });
            }}
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-red-600 hover:bg-red-50"
          >
            Cancel
          </button>
        </div>
      ))}
    </div>
  );
}

function ThreadDetail({ threadId }: { threadId: string }) {
  const qc = useQueryClient();
  const { socket } = useSocket();
  const { user } = useAuthStore();
  const [reply, setReply] = useState('');
  const [note, setNote] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');
  const [attach, setAttach] = useState<OutboundAttachmentRef[]>([]);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['email-thread', threadId],
    queryFn: () => svc.getThread(threadId),
  });
  const thread = data?.data;
  const messages = thread?.messages ?? [];

  // Mark read + join the per-thread room on open.
  useEffect(() => {
    svc.markRead(threadId).then(() => qc.invalidateQueries({ queryKey: ['email-threads'] }));
    socket?.emit('email:open', threadId);
    return () => {
      socket?.emit('email:close', threadId);
    };
  }, [threadId, socket, qc]);

  useEffect(() => {
    if (!socket) return;
    const onMsg = (d: { threadId?: string }) => {
      if (d?.threadId === threadId) qc.invalidateQueries({ queryKey: ['email-thread', threadId] });
    };
    socket.on('email:message', onMsg);
    return () => {
      socket.off('email:message', onMsg);
    };
  }, [socket, threadId, qc]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function act(fn: () => Promise<unknown>, msg: string) {
    await fn();
    showToast.success(msg);
    qc.invalidateQueries({ queryKey: ['email-thread', threadId] });
    qc.invalidateQueries({ queryKey: ['email-threads'] });
  }

  async function sendReply() {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await svc.reply(threadId, { body: reply, attachments: attach.length ? attach : undefined });
      setReply('');
      setAttach([]);
      showToast.success('Reply sent');
      qc.invalidateQueries({ queryKey: ['email-thread', threadId] });
    } catch (e) {
      const err = e as { response?: { data?: { error?: { message?: string } } } };
      showToast.error(err.response?.data?.error?.message || 'Reply failed');
    } finally {
      setBusy(false);
    }
  }

  async function schedule() {
    if (!reply.trim() || !scheduleAt) {
      showToast.error('Enter a message and a send time');
      return;
    }
    try {
      await svc.scheduleReply(threadId, {
        body: reply,
        sendAt: new Date(scheduleAt).toISOString(),
        attachments: attach.length ? attach : undefined,
      });
      setReply('');
      setScheduleAt('');
      setAttach([]);
      showToast.success('Reply scheduled');
    } catch {
      showToast.error('Could not schedule');
    }
  }

  if (!thread)
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
        Loading…
      </div>
    );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
        <div className="min-w-0">
          <p className="truncate font-semibold text-[var(--text)]">
            {thread.threadSubject || '(no subject)'}
          </p>
          <p className="truncate text-xs text-[var(--text-muted)]">{thread.contact?.email}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge
            variant={
              thread.status === 'RESOLVED'
                ? 'success'
                : thread.status === 'PENDING'
                  ? 'warning'
                  : 'info'
            }
            size="sm"
          >
            {thread.status}
          </Badge>
          {thread.snoozedUntil && new Date(thread.snoozedUntil) > new Date() && (
            <Tooltip content="Snoozed — click to un-snooze">
              <button
                onClick={() => act(() => svc.snoozeThread(threadId, null), 'Un-snoozed')}
                className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-200"
              >
                Snoozed until {new Date(thread.snoozedUntil).toLocaleString()} ✕
              </button>
            </Tooltip>
          )}
          <Tooltip content="Assign to me">
            <button
              onClick={() =>
                act(() => svc.assignThread(threadId, user?.id ?? null), 'Assigned to you')
              }
              className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
            >
              <UserPlus className="h-4 w-4" />
            </button>
          </Tooltip>
          <Tooltip content="Add label">
            <button
              onClick={async () => {
                const l = await promptDialog({ title: 'Add label', label: 'Add a label' });
                if (l)
                  act(
                    () => svc.setThreadLabels(threadId, [...(thread.labels ?? []), l]),
                    'Label added',
                  );
              }}
              className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
            >
              <Tag className="h-4 w-4" />
            </button>
          </Tooltip>
          <Tooltip content="Snooze">
            <button
              onClick={async () => {
                const h = await promptDialog({
                  title: 'Snooze',
                  label: 'Snooze for how many hours?',
                  defaultValue: '24',
                });
                if (h && Number(h) > 0)
                  act(
                    () =>
                      svc.snoozeThread(
                        threadId,
                        new Date(Date.now() + Number(h) * 3600000).toISOString(),
                      ),
                    'Snoozed',
                  );
              }}
              className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
            >
              <Clock className="h-4 w-4" />
            </button>
          </Tooltip>
          <Tooltip content="Resolve">
            <button
              onClick={() => act(() => svc.setThreadStatus(threadId, 'RESOLVED'), 'Resolved')}
              className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
            >
              <CheckCircle2 className="h-4 w-4" />
            </button>
          </Tooltip>
          <Tooltip content="Archive">
            <button
              onClick={() => act(() => svc.archiveThread(threadId, true), 'Archived')}
              className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
            >
              <Archive className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>
        {thread.labels && thread.labels.length > 0 && (
          <div className="flex flex-wrap gap-1 px-4 pb-1">
            {thread.labels.map((l) => (
              <Badge key={l} variant="secondary" size="sm">
                {l}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4" data-lenis-prevent>
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn('flex', m.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[75%] rounded-xl px-3 py-2 text-sm',
                m.direction === 'OUTBOUND'
                  ? 'bg-blue-600 text-white'
                  : 'bg-[var(--bg-secondary)] text-[var(--text)]',
              )}
            >
              {m.subject && m.direction === 'INBOUND' && (
                <p className="mb-1 text-xs font-semibold opacity-70">{m.subject}</p>
              )}
              <p className="break-words whitespace-pre-wrap">
                {m.textBody || m.snippet || '(no text)'}
              </p>
              {m.attachments && m.attachments.length > 0 && (
                <div className="mt-2 space-y-1 border-t border-white/20 pt-2">
                  {m.attachments.map((a, i) => (
                    <a
                      key={i}
                      href={a.r2Url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'flex items-center gap-1.5 text-xs underline',
                        m.direction === 'OUTBOUND' ? 'text-blue-100' : 'text-blue-700',
                      )}
                    >
                      <Paperclip className="h-3 w-3 shrink-0" />
                      <span className="truncate">{a.filename}</span>
                      <span className="shrink-0 opacity-70">
                        ({Math.max(1, Math.round(a.size / 1024))} KB)
                      </span>
                    </a>
                  ))}
                </div>
              )}
              <p
                className={cn(
                  'mt-1 text-[10px]',
                  m.direction === 'OUTBOUND' ? 'text-blue-100' : 'text-[var(--text-muted)]',
                )}
              >
                {new Date(m.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {thread.notes && thread.notes.length > 0 && (
        <div className="border-t border-[var(--border)] bg-amber-50 px-4 py-2 text-xs text-amber-800">
          <StickyNote className="mr-1 inline h-3.5 w-3.5" />
          {thread.notes[0].body}
        </div>
      )}

      <div className="border-t border-[var(--border)] p-3">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={3}
          placeholder="Type a reply…"
          className="w-full rounded-lg border border-[var(--border)] p-2 text-sm"
        />
        <div className="mt-2">
          <AttachmentPicker value={attach} onChange={setAttach} disabled={busy} />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
          <div className="w-56">
            <DatePicker
              mode="datetime"
              value={scheduleAt}
              onChange={(v) => setScheduleAt(v)}
              inputSize="sm"
              placeholder="Schedule time"
            />
          </div>
          <Button size="sm" variant="ghost" disabled={!scheduleAt} onClick={schedule}>
            Schedule send
          </Button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex flex-1 gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Internal note (not sent)…"
              className="flex-1 rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs"
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                if (!note.trim()) return;
                await svc.addNote(threadId, note);
                setNote('');
                act(() => Promise.resolve(), 'Note added');
              }}
            >
              Add note
            </Button>
          </div>
          <Button
            size="sm"
            leftIcon={<Send className="h-4 w-4" />}
            isLoading={busy}
            onClick={sendReply}
          >
            Reply
          </Button>
        </div>
      </div>
    </div>
  );
}
