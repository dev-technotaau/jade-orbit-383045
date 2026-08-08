'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { showToast } from '@/components/ui/Toast';
import { confirmDialog, promptDialog } from '@/components/ui/dialog-service';
import { useSocket } from '@/hooks/use-socket';
import { mailboxService } from '@/services/mailbox.service';
import type { MailAccount, MailDetail, MailAddress } from '@/types/email-mailbox';
import MailSidebar from '@/components/super-admin/email/mail/MailSidebar';
import MailList from '@/components/super-admin/email/mail/MailList';
import MailThreadList from '@/components/super-admin/email/mail/MailThreadList';
import MailReader from '@/components/super-admin/email/mail/MailReader';
import MailThreadReader from '@/components/super-admin/email/mail/MailThreadReader';
import MailComposer from '@/components/super-admin/email/mail/MailComposer';
import MailAccountModal from '@/components/super-admin/email/mail/MailAccountModal';
import type {
  ComposerInitial,
  MailFilter,
  MailView,
} from '@/components/super-admin/email/mail/props';

const LIMIT = 50;
// Gentle fallback poll — real-time IMAP IDLE push (socket) is the primary signal.
const POLL_MS = 90_000;

function fmtAddr(a: MailAddress | null | undefined): string {
  if (!a) return '';
  return a.name ? `${a.name} <${a.address}>` : a.address;
}

function stripPrefix(subject: string, re: RegExp): string {
  let s = subject || '';
  while (re.test(s)) s = s.replace(re, '');
  return s.trim();
}

function bodyForQuote(detail: MailDetail): string {
  if (detail.html) return detail.html;
  if (detail.text)
    return `<pre style="white-space:pre-wrap;font-family:inherit">${detail.text.replace(/</g, '&lt;')}</pre>`;
  return '';
}

function quoteBlock(detail: MailDetail): string {
  const when = detail.date ? new Date(detail.date).toLocaleString() : '';
  const who = fmtAddr(detail.from);
  return `<br><br><div style="border-left:2px solid #ccc;padding-left:12px;color:#555">On ${when}, ${who
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')} wrote:<br>${bodyForQuote(detail)}</div>`;
}

function forwardBlock(detail: MailDetail): string {
  const lines = [
    '---------- Forwarded message ----------',
    `From: ${fmtAddr(detail.from)}`,
    `Date: ${detail.date ? new Date(detail.date).toLocaleString() : ''}`,
    `Subject: ${detail.subject}`,
    `To: ${detail.to.map(fmtAddr).join(', ')}`,
  ]
    .map((l) => l.replace(/</g, '&lt;').replace(/>/g, '&gt;'))
    .join('<br>');
  return `<br><br><div style="color:#555">${lines}</div><br>${bodyForQuote(detail)}`;
}

export default function SuperAdminWebmailPage() {
  const qc = useQueryClient();
  const { socket } = useSocket();

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [view, setView] = useState<MailView>('threads');
  const [filter, setFilter] = useState<MailFilter>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [activeUid, setActiveUid] = useState<number | null>(null);
  const [selectedUids, setSelectedUids] = useState<number[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [selectedThreadIds, setSelectedThreadIds] = useState<string[]>([]);

  const [composer, setComposer] = useState<{ open: boolean; initial: ComposerInitial }>({
    open: false,
    initial: {},
  });
  const [accountModal, setAccountModal] = useState<{ open: boolean; account: MailAccount | null }>({
    open: false,
    account: null,
  });

  // ── Accounts ──
  const accountsQuery = useQuery({
    queryKey: ['mailbox-accounts'],
    queryFn: () => mailboxService.listAccounts(),
  });
  const accounts = useMemo(() => accountsQuery.data?.data ?? [], [accountsQuery.data]);

  const activeAccountId = useMemo(() => {
    if (selectedAccountId && accounts.some((a) => a.id === selectedAccountId))
      return selectedAccountId;
    return (accounts.find((a) => a.isDefault) ?? accounts[0])?.id ?? null;
  }, [selectedAccountId, accounts]);

  const activeAccount = useMemo(
    () => accounts.find((a) => a.id === activeAccountId) ?? null,
    [accounts, activeAccountId],
  );

  // ── Folders ──
  const foldersQuery = useQuery({
    queryKey: ['mailbox-folders', activeAccountId],
    queryFn: () => mailboxService.listFolders(activeAccountId as string),
    enabled: Boolean(activeAccountId),
    refetchInterval: POLL_MS,
  });
  const folders = useMemo(() => foldersQuery.data?.data ?? [], [foldersQuery.data]);

  const activeFolder = useMemo(() => {
    if (selectedFolder && folders.some((f) => f.path === selectedFolder)) return selectedFolder;
    return (folders.find((f) => f.role === 'inbox') ?? folders[0])?.path ?? null;
  }, [selectedFolder, folders]);

  const folderRole = useMemo(
    () => folders.find((f) => f.path === activeFolder)?.role ?? null,
    [folders, activeFolder],
  );

  // Reset per-folder view state on context change (render-time, no effect).
  const ctxKey = `${activeAccountId ?? ''}|${activeFolder ?? ''}|${filter}|${search}|${view}`;
  const [prevCtxKey, setPrevCtxKey] = useState(ctxKey);
  if (prevCtxKey !== ctxKey) {
    setPrevCtxKey(ctxKey);
    setPage(1);
    setSelectedUids([]);
    setActiveUid(null);
    setSelectedThreadIds([]);
    setActiveThreadId(null);
  }

  // ── Messages (flat view) ──
  const messagesQuery = useQuery({
    queryKey: ['mailbox-messages', activeAccountId, activeFolder, filter, search, page],
    queryFn: () =>
      mailboxService.listMessages(activeAccountId as string, {
        folder: activeFolder as string,
        page,
        limit: LIMIT,
        search: search || undefined,
        unseenOnly: filter === 'unread' || undefined,
        flaggedOnly: filter === 'flagged' || undefined,
      }),
    enabled: Boolean(activeAccountId && activeFolder && view === 'messages'),
    refetchInterval: POLL_MS,
    placeholderData: (prev) => prev,
  });
  const list = messagesQuery.data?.data;
  const messages = useMemo(() => list?.items ?? [], [list]);

  // ── Threads (conversation view) ──
  const threadsQuery = useQuery({
    queryKey: ['mailbox-threads', activeAccountId, activeFolder, filter, search, page],
    queryFn: () =>
      mailboxService.listThreads(activeAccountId as string, {
        folder: activeFolder as string,
        page,
        limit: LIMIT,
        search: search || undefined,
        unseenOnly: filter === 'unread' || undefined,
        flaggedOnly: filter === 'flagged' || undefined,
      }),
    enabled: Boolean(activeAccountId && activeFolder && view === 'threads'),
    refetchInterval: POLL_MS,
    placeholderData: (prev) => prev,
  });
  const threadList = threadsQuery.data?.data;
  const threads = useMemo(() => threadList?.items ?? [], [threadList]);
  const activeThread = useMemo(
    () => threads.find((t) => t.threadId === activeThreadId) ?? null,
    [threads, activeThreadId],
  );

  // ── Open item detail ──
  const detailQuery = useQuery({
    queryKey: ['mailbox-message', activeAccountId, activeFolder, activeUid],
    queryFn: () =>
      mailboxService.getMessage(
        activeAccountId as string,
        activeFolder as string,
        activeUid as number,
      ),
    enabled: Boolean(activeAccountId && activeFolder && activeUid && view === 'messages'),
  });
  const detail = detailQuery.data?.data ?? null;

  const threadQuery = useQuery({
    queryKey: ['mailbox-thread', activeAccountId, activeFolder, activeThreadId],
    queryFn: () =>
      mailboxService.getThread(
        activeAccountId as string,
        activeFolder as string,
        activeThread!.uids,
      ),
    enabled: Boolean(
      activeAccountId && activeFolder && activeThreadId && activeThread && view === 'threads',
    ),
  });
  const threadMessages = useMemo(() => threadQuery.data?.data ?? [], [threadQuery.data]);

  // Reply/forward act on the latest message of whatever is open.
  const actionDetail =
    view === 'threads' ? (threadMessages[threadMessages.length - 1] ?? null) : detail;

  // ── Invalidation helpers ──
  const invalidateLists = useCallback(
    (folder?: string | null) => {
      const f = folder ?? activeFolder;
      qc.invalidateQueries({ queryKey: ['mailbox-folders', activeAccountId] });
      qc.invalidateQueries({ queryKey: ['mailbox-messages', activeAccountId, f] });
      qc.invalidateQueries({ queryKey: ['mailbox-threads', activeAccountId, f] });
    },
    [qc, activeAccountId, activeFolder],
  );
  const refreshLists = useCallback(() => invalidateLists(), [invalidateLists]);
  const refreshAll = useCallback(() => {
    invalidateLists();
    if (activeUid)
      qc.invalidateQueries({
        queryKey: ['mailbox-message', activeAccountId, activeFolder, activeUid],
      });
    if (activeThreadId)
      qc.invalidateQueries({
        queryKey: ['mailbox-thread', activeAccountId, activeFolder, activeThreadId],
      });
  }, [invalidateLists, qc, activeAccountId, activeFolder, activeUid, activeThreadId]);

  // Opening an item marks it \Seen server-side — refresh the unread counts.
  const openedUid = detail?.uid;
  useEffect(() => {
    if (!openedUid || !activeAccountId) return;
    invalidateLists();
  }, [openedUid, activeAccountId, invalidateLists]);

  const openedThreadKey = activeThreadId;
  const threadLoaded = threadMessages.length > 0;
  useEffect(() => {
    if (!openedThreadKey || !threadLoaded || !activeAccountId) return;
    invalidateLists();
  }, [openedThreadKey, threadLoaded, activeAccountId, invalidateLists]);

  // ── Real-time: subscribe to IMAP IDLE push for the active folder + INBOX ──
  useEffect(() => {
    if (!socket || !activeAccountId || !activeFolder) return;
    const watched = [...new Set([activeFolder, 'INBOX'])];
    watched.forEach((f) =>
      socket.emit('mailbox:subscribe', { accountId: activeAccountId, folder: f }),
    );
    return () => {
      watched.forEach((f) =>
        socket.emit('mailbox:unsubscribe', { accountId: activeAccountId, folder: f }),
      );
    };
  }, [socket, activeAccountId, activeFolder]);

  useEffect(() => {
    if (!socket) return;
    const onUpdate = (payload: { accountId: string; folder: string; type: string }) => {
      if (payload.accountId !== activeAccountId) return;
      qc.invalidateQueries({ queryKey: ['mailbox-folders', activeAccountId] });
      qc.invalidateQueries({ queryKey: ['mailbox-messages', activeAccountId, payload.folder] });
      qc.invalidateQueries({ queryKey: ['mailbox-threads', activeAccountId, payload.folder] });
      if (activeUid)
        qc.invalidateQueries({
          queryKey: ['mailbox-message', activeAccountId, payload.folder, activeUid],
        });
      if (activeThreadId)
        qc.invalidateQueries({
          queryKey: ['mailbox-thread', activeAccountId, payload.folder, activeThreadId],
        });
    };
    socket.on('mailbox:update', onUpdate);
    return () => {
      socket.off('mailbox:update', onUpdate);
    };
  }, [socket, activeAccountId, activeUid, activeThreadId, qc]);

  // ── Selection (messages) ──
  const toggleSelect = (uid: number) =>
    setSelectedUids((cur) => (cur.includes(uid) ? cur.filter((u) => u !== uid) : [...cur, uid]));
  const selectAll = () => setSelectedUids(messages.map((m) => m.uid));
  const clearSelect = () => setSelectedUids([]);

  // ── Selection (threads) ──
  const toggleThreadSelect = (id: string) =>
    setSelectedThreadIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const selectAllThreads = () => setSelectedThreadIds(threads.map((t) => t.threadId));
  const clearThreadSelect = () => setSelectedThreadIds([]);
  const selectedThreadUids = useMemo(
    () => threads.filter((t) => selectedThreadIds.includes(t.threadId)).flatMap((t) => t.uids),
    [threads, selectedThreadIds],
  );

  // ── Bulk actions (shared over a uid set) ──
  const runBulk = async (
    uids: number[],
    fn: () => Promise<unknown>,
    okMsg: string | undefined,
    clear: () => void,
  ) => {
    if (!activeAccountId || !activeFolder || uids.length === 0) return;
    try {
      await fn();
      if (okMsg) showToast.success(okMsg);
      clear();
      refreshLists();
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : 'Action failed');
    }
  };
  const mkBulk = (uids: () => number[], clear: () => void) => ({
    flag: (flagged: boolean) =>
      runBulk(
        uids(),
        () =>
          mailboxService.setFlags(
            activeAccountId!,
            activeFolder!,
            uids(),
            flagged ? ['\\Flagged'] : [],
            flagged ? [] : ['\\Flagged'],
          ),
        undefined,
        clear,
      ),
    seen: (seen: boolean) =>
      runBulk(
        uids(),
        () =>
          mailboxService.setFlags(
            activeAccountId!,
            activeFolder!,
            uids(),
            seen ? ['\\Seen'] : [],
            seen ? [] : ['\\Seen'],
          ),
        undefined,
        clear,
      ),
    del: () =>
      runBulk(
        uids(),
        () =>
          mailboxService.deleteMessages(
            activeAccountId!,
            activeFolder!,
            uids(),
            folderRole === 'trash',
          ),
        'Deleted',
        clear,
      ),
    move: (t: string) =>
      runBulk(
        uids(),
        () => mailboxService.moveMessages(activeAccountId!, activeFolder!, uids(), t),
        'Moved',
        clear,
      ),
    copy: (t: string) =>
      runBulk(
        uids(),
        () => mailboxService.copyMessages(activeAccountId!, activeFolder!, uids(), t),
        'Copied',
        clear,
      ),
  });
  const msgBulk = mkBulk(() => selectedUids, clearSelect);
  const thrBulk = mkBulk(() => selectedThreadUids, clearThreadSelect);

  // ── Single-item reader actions (messages view) ──
  const readerAction = async (
    fn: () => Promise<unknown>,
    opts: { clear?: boolean; okMsg?: string } = {},
  ) => {
    if (!activeAccountId || !activeFolder || !detail) return;
    try {
      await fn();
      if (opts.okMsg) showToast.success(opts.okMsg);
      if (opts.clear) setActiveUid(null);
      refreshLists();
      if (!opts.clear && activeUid)
        qc.invalidateQueries({
          queryKey: ['mailbox-message', activeAccountId, activeFolder, activeUid],
        });
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : 'Action failed');
    }
  };
  const toggleFlag = () =>
    readerAction(() =>
      mailboxService.setFlags(
        activeAccountId!,
        activeFolder!,
        [detail!.uid],
        detail!.flagged ? [] : ['\\Flagged'],
        detail!.flagged ? ['\\Flagged'] : [],
      ),
    );
  const toggleSeen = () =>
    readerAction(
      () =>
        mailboxService.setFlags(
          activeAccountId!,
          activeFolder!,
          [detail!.uid],
          detail!.seen ? [] : ['\\Seen'],
          detail!.seen ? ['\\Seen'] : [],
        ),
      { clear: Boolean(detail?.seen) },
    );
  const readerDelete = () =>
    readerAction(
      () =>
        mailboxService.deleteMessages(
          activeAccountId!,
          activeFolder!,
          [detail!.uid],
          folderRole === 'trash',
        ),
      { clear: true, okMsg: 'Deleted' },
    );
  const readerMove = (target: string) =>
    readerAction(
      () => mailboxService.moveMessages(activeAccountId!, activeFolder!, [detail!.uid], target),
      { clear: true, okMsg: 'Moved' },
    );
  const readerCopy = (target: string) =>
    readerAction(
      () => mailboxService.copyMessages(activeAccountId!, activeFolder!, [detail!.uid], target),
      { okMsg: 'Copied' },
    );

  // ── Thread reader actions (act on the whole conversation) ──
  const threadAction = async (
    fn: () => Promise<unknown>,
    opts: { clear?: boolean; okMsg?: string } = {},
  ) => {
    if (!activeAccountId || !activeFolder || !activeThread) return;
    try {
      await fn();
      if (opts.okMsg) showToast.success(opts.okMsg);
      if (opts.clear) setActiveThreadId(null);
      refreshLists();
      if (!opts.clear && activeThreadId)
        qc.invalidateQueries({
          queryKey: ['mailbox-thread', activeAccountId, activeFolder, activeThreadId],
        });
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : 'Action failed');
    }
  };
  const threadToggleFlag = () =>
    threadAction(() =>
      mailboxService.setFlags(
        activeAccountId!,
        activeFolder!,
        activeThread!.uids,
        activeThread!.flagged ? [] : ['\\Flagged'],
        activeThread!.flagged ? ['\\Flagged'] : [],
      ),
    );
  const threadDelete = () =>
    threadAction(
      () =>
        mailboxService.deleteMessages(
          activeAccountId!,
          activeFolder!,
          activeThread!.uids,
          folderRole === 'trash',
        ),
      { clear: true, okMsg: 'Deleted' },
    );
  const threadMove = (target: string) =>
    threadAction(
      () =>
        mailboxService.moveMessages(activeAccountId!, activeFolder!, activeThread!.uids, target),
      { clear: true, okMsg: 'Moved' },
    );

  // ── Compose (reply / forward / draft) ──
  const selfAddrs = useMemo(
    () => new Set([activeAccount?.email?.toLowerCase()].filter(Boolean) as string[]),
    [activeAccount],
  );

  const openReply = (all: boolean) => {
    const src = actionDetail;
    if (!src) return;
    const primary = src.replyTo.length ? src.replyTo : src.from ? [src.from] : [];
    const to = primary.map((a) => a.address);
    let cc: string[] = [];
    if (all) {
      const extra = [...(src.from ? [src.from] : []), ...src.to, ...src.cc]
        .map((a) => a.address)
        .filter((addr) => addr && !to.includes(addr) && !selfAddrs.has(addr.toLowerCase()));
      cc = [...new Set(extra)];
    }
    const refs = [...src.references, src.messageId].filter(Boolean) as string[];
    setComposer({
      open: true,
      initial: {
        mode: all ? 'replyAll' : 'reply',
        to,
        cc,
        subject: `Re: ${stripPrefix(src.subject, /^(re|aw|sv):\s*/i)}`,
        html: quoteBlock(src),
        inReplyTo: src.messageId,
        references: refs,
      },
    });
  };

  const openForward = async () => {
    const src = actionDetail;
    if (!src || !activeAccountId) return;
    const base: ComposerInitial = {
      mode: 'forward',
      subject: `Fwd: ${stripPrefix(src.subject, /^(fwd|fw):\s*/i)}`,
      html: forwardBlock(src),
    };
    // Re-attach the original's files, staged to R2, so the forward carries them.
    if (src.attachments.some((a) => !a.inline)) {
      showToast.info('Preparing forward…');
      try {
        const res = await mailboxService.forwardAttachments(activeAccountId, src.folder, src.uid);
        setComposer({ open: true, initial: { ...base, attachments: res.data ?? [] } });
        return;
      } catch {
        /* fall through — forward without attachments */
      }
    }
    setComposer({ open: true, initial: base });
  };

  const openDraft = () => {
    const src = actionDetail;
    if (!src) return;
    setComposer({
      open: true,
      initial: {
        mode: 'draft',
        to: src.to.map((a) => a.address),
        cc: src.cc.map((a) => a.address),
        bcc: src.bcc.map((a) => a.address),
        subject: src.subject === '(no subject)' ? '' : src.subject,
        html: src.html ?? (src.text ? `<pre>${src.text.replace(/</g, '&lt;')}</pre>` : ''),
        inReplyTo: src.inReplyTo,
        references: src.references,
        replaceUid: src.uid,
      },
    });
  };

  const openCompose = () => setComposer({ open: true, initial: { mode: 'new', html: '' } });

  // ── Folder management ──
  const createFolderPrompt = async () => {
    if (!activeAccountId) return;
    const name = await promptDialog({ title: 'New folder', label: 'New folder name' });
    if (!name) return;
    try {
      await mailboxService.createFolder(activeAccountId, name.trim());
      showToast.success('Folder created');
      qc.invalidateQueries({ queryKey: ['mailbox-folders', activeAccountId] });
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : 'Could not create folder');
    }
  };
  const renameFolderPrompt = async (path: string) => {
    if (!activeAccountId) return;
    const next = await promptDialog({
      title: 'Rename folder',
      label: 'Rename folder to',
      defaultValue: path,
    });
    if (!next || next.trim() === path) return;
    try {
      await mailboxService.renameFolder(activeAccountId, path, next.trim());
      showToast.success('Folder renamed');
      if (selectedFolder === path) setSelectedFolder(next.trim());
      qc.invalidateQueries({ queryKey: ['mailbox-folders', activeAccountId] });
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : 'Could not rename folder');
    }
  };
  const deleteFolderConfirm = async (path: string) => {
    if (!activeAccountId) return;
    if (
      !(await confirmDialog({
        title: 'Delete folder',
        message: `Delete folder "${path}"? Messages inside it will be removed.`,
        confirmLabel: 'Delete',
        variant: 'danger',
      }))
    )
      return;
    try {
      await mailboxService.deleteFolder(activeAccountId, path);
      showToast.success('Folder deleted');
      if (selectedFolder === path) setSelectedFolder(null);
      qc.invalidateQueries({ queryKey: ['mailbox-folders', activeAccountId] });
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : 'Could not delete folder');
    }
  };

  const noAccounts = !accountsQuery.isLoading && accounts.length === 0;
  const hasOpen = view === 'threads' ? activeThreadId != null : activeUid != null;

  const renderList = () =>
    view === 'threads' ? (
      <MailThreadList
        threads={threads}
        total={threadList?.total ?? 0}
        page={page}
        limit={LIMIT}
        onPageChange={setPage}
        activeThreadId={activeThreadId}
        onOpen={(t) => setActiveThreadId(t.threadId)}
        selectedThreadIds={selectedThreadIds}
        onToggleSelect={toggleThreadSelect}
        onSelectAll={selectAllThreads}
        onClearSelect={clearThreadSelect}
        search={search}
        onSearch={setSearch}
        filter={filter}
        onFilterChange={setFilter}
        view={view}
        onViewChange={setView}
        loading={threadsQuery.isLoading}
        windowed={threadList?.windowed ?? false}
        folders={folders}
        folderRole={folderRole}
        currentFolderPath={activeFolder}
        onBulkFlag={thrBulk.flag}
        onBulkSeen={thrBulk.seen}
        onBulkDelete={thrBulk.del}
        onBulkMove={thrBulk.move}
        onBulkCopy={thrBulk.copy}
        onRefresh={refreshLists}
      />
    ) : (
      <MailList
        messages={messages}
        total={list?.total ?? 0}
        page={page}
        limit={LIMIT}
        onPageChange={setPage}
        activeUid={activeUid}
        onOpen={setActiveUid}
        selectedUids={selectedUids}
        onToggleSelect={toggleSelect}
        onSelectAll={selectAll}
        onClearSelect={clearSelect}
        search={search}
        onSearch={setSearch}
        filter={filter}
        onFilterChange={setFilter}
        view={view}
        onViewChange={setView}
        loading={messagesQuery.isLoading}
        folders={folders}
        folderRole={folderRole}
        currentFolderPath={activeFolder}
        onBulkFlag={msgBulk.flag}
        onBulkSeen={msgBulk.seen}
        onBulkDelete={msgBulk.del}
        onBulkMove={msgBulk.move}
        onBulkCopy={msgBulk.copy}
        onRefresh={refreshLists}
      />
    );

  const renderReader = () =>
    view === 'threads' ? (
      <MailThreadReader
        accountId={activeAccountId as string}
        subject={activeThread?.subject ?? ''}
        messages={threadMessages}
        loading={threadQuery.isLoading}
        folder={activeFolder as string}
        folderRole={folderRole}
        folders={folders}
        flagged={activeThread?.flagged ?? false}
        onReply={() => openReply(false)}
        onReplyAll={() => openReply(true)}
        onForward={openForward}
        onToggleFlag={threadToggleFlag}
        onDelete={threadDelete}
        onMove={threadMove}
        onClose={() => setActiveThreadId(null)}
      />
    ) : (
      <MailReader
        accountId={activeAccountId as string}
        detail={detail}
        loading={detailQuery.isLoading}
        folder={activeFolder as string}
        folderRole={folderRole}
        folders={folders}
        onReply={() => openReply(false)}
        onReplyAll={() => openReply(true)}
        onForward={openForward}
        onEditDraft={openDraft}
        onToggleFlag={toggleFlag}
        onToggleSeen={toggleSeen}
        onDelete={readerDelete}
        onMove={readerMove}
        onCopy={readerCopy}
        onClose={() => setActiveUid(null)}
      />
    );

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="email.mailbox.view"
    >
      <div className="flex h-[calc(100vh-8rem)] min-h-[520px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)]">
        {noAccounts ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <h2 className="text-lg font-semibold text-[var(--text)]">Connect a mailbox</h2>
            <p className="max-w-md text-sm text-[var(--text-secondary)]">
              Add a personal IMAP/SMTP account (e.g. your @hireadda.in mailbox) to send and receive
              one-on-one email right here — just like Roundcube, Gmail, or Outlook.
            </p>
            <button
              onClick={() => setAccountModal({ open: true, account: null })}
              className="bg-primary hover:bg-primary-hover rounded-lg px-4 py-2 text-sm font-medium text-white"
            >
              Connect mail account
            </button>
          </div>
        ) : (
          <>
            <MailSidebar
              accounts={accounts}
              activeAccountId={activeAccountId}
              onSelectAccount={setSelectedAccountId}
              folders={folders}
              activeFolder={activeFolder}
              onSelectFolder={setSelectedFolder}
              foldersLoading={foldersQuery.isLoading}
              onCompose={openCompose}
              onManageAccounts={() => setAccountModal({ open: true, account: activeAccount })}
              onAddAccount={() => setAccountModal({ open: true, account: null })}
              onCreateFolder={createFolderPrompt}
              onRenameFolder={renameFolderPrompt}
              onDeleteFolder={deleteFolderConfirm}
              onRefresh={refreshAll}
            />

            <div className="hidden w-full max-w-md flex-shrink-0 border-r border-[var(--border)] md:flex md:flex-col">
              {renderList()}
            </div>

            {/* Mobile: list until an item is open, then the reader */}
            <div className="flex w-full flex-1 flex-col md:hidden">
              {hasOpen ? renderReader() : renderList()}
            </div>

            <div className="hidden flex-1 md:flex md:flex-col">{renderReader()}</div>
          </>
        )}
      </div>

      {composer.open && activeAccountId && (
        <MailComposer
          accounts={accounts}
          defaultAccountId={activeAccountId}
          initial={composer.initial}
          onClose={() => setComposer({ open: false, initial: {} })}
          onSent={refreshLists}
        />
      )}

      {accountModal.open && (
        <MailAccountModal
          account={accountModal.account}
          onClose={() => setAccountModal({ open: false, account: null })}
          onSaved={() => {
            accountsQuery.refetch();
          }}
          onDeleted={() => {
            setSelectedAccountId(null);
            setSelectedFolder(null);
            accountsQuery.refetch();
          }}
        />
      )}
    </DashboardLayout>
  );
}
