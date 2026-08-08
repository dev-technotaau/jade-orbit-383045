'use client';

import { useState, type SyntheticEvent } from 'react';
import {
  Reply,
  ReplyAll,
  Forward,
  Star,
  Mail,
  Trash2,
  X,
  Download,
  Paperclip,
  FileText,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import Select from '@/components/ui/Select';
import Tooltip from '@/components/ui/Tooltip';
import { showToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { mailboxService } from '@/services/mailbox.service';
import type { MailAddress, MailAttachmentMeta, MailDetail } from '@/types/email-mailbox';
import type { MailThreadReaderProps } from '@/components/super-admin/email/mail/props';

/** Human-readable byte size, e.g. 512 B, 3.4 KB, 1.2 MB. */
function humanSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  const rounded =
    i === 0 ? Math.round(val) : val >= 10 ? Math.round(val) : Math.round(val * 10) / 10;
  return `${rounded} ${units[i]}`;
}

/** "Name <address>" or bare address when no display name. */
function formatAddress(a: MailAddress): string {
  const name = a.name?.trim();
  return name ? `${name} <${a.address}>` : a.address;
}

function formatAddressList(list: MailAddress[]): string {
  return list.map(formatAddress).join(', ');
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Sender display name for a card header. */
function senderLabel(from: MailAddress | null): string {
  if (!from) return '(unknown sender)';
  return from.name || from.address;
}

/** One-line, whitespace-collapsed preview from a plain-text body. */
function snippet(text: string | null, max = 100): string {
  if (!text) return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/** Sandboxed iframe document mirroring MailReader — email JS can never run. */
function buildSrcDoc(html: string): string {
  return `<!doctype html><html><head><base target="_blank"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:12px;overflow-wrap:anywhere}img{max-width:100%}a{color:#2563eb}</style></head><body>${html}</body></html>`;
}

export default function MailThreadReader({
  accountId,
  subject,
  messages,
  loading,
  folder,
  folderRole,
  folders,
  flagged,
  onReply,
  onReplyAll,
  onForward,
  onToggleFlag,
  onDelete,
  onMove,
  onClose,
}: MailThreadReaderProps) {
  // Expanded message uids — start with only the newest (last) message open, so
  // the conversation opens where you'd read it. Initialized once; toggled only
  // via the card-header click handler (never setState-in-effect).
  const [expanded, setExpanded] = useState<Set<number>>(() => {
    const last = messages[messages.length - 1];
    return new Set<number>(last ? [last.uid] : []);
  });

  // Per-uid measured iframe height; each message stays at ~200 until its own
  // onLoad measures it. Keyed by uid so cards never share a height.
  const [heights, setHeights] = useState<Record<number, number>>({});

  const toggleExpanded = (uid: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const handleIframeLoad = (uid: number) => (e: SyntheticEvent<HTMLIFrameElement>) => {
    try {
      const body = e.currentTarget.contentWindow?.document?.body;
      if (body) {
        const h = Math.min(Math.max(body.scrollHeight + 24, 120), 4000);
        setHeights((prev) => (prev[uid] === h ? prev : { ...prev, [uid]: h }));
      }
    } catch {
      // Sandboxed iframe blocks cross-origin access — keep the default height.
    }
  };

  const handleDownloadAttachment = async (message: MailDetail, att: MailAttachmentMeta) => {
    try {
      await mailboxService.downloadAttachment(
        accountId,
        message.folder,
        message.uid,
        att.index,
        att.filename,
      );
    } catch {
      showToast.error(`Failed to download ${att.filename}`);
    }
  };

  if (loading) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center bg-[var(--bg)]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 bg-[var(--bg)] p-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--bg-secondary)]">
          <Mail className="h-8 w-8 text-[var(--text-tertiary)]" />
        </div>
        <p className="text-sm text-[var(--text-secondary)]">No messages in this conversation</p>
      </div>
    );
  }

  const moveTargets = folders.filter((f) => f.path !== folder);
  const deleteLabel = folderRole === 'trash' ? 'Delete forever' : 'Delete';

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-[var(--bg)]">
      {/* Header */}
      <div className="border-b border-[var(--border)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold break-words text-[var(--text)]">
              {subject || '(no subject)'}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              {messages.length} message{messages.length === 1 ? '' : 's'}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 md:hidden"
            onClick={onClose}
            tooltip="Close"
            aria-label="Close conversation"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Actions — act on the latest message via the parent callbacks. */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Reply className="h-4 w-4" />}
            onClick={onReply}
          >
            Reply
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<ReplyAll className="h-4 w-4" />}
            onClick={onReplyAll}
          >
            Reply all
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Forward className="h-4 w-4" />}
            onClick={onForward}
          >
            Forward
          </Button>

          <span className="mx-1 h-6 w-px bg-[var(--border)]" aria-hidden />

          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleFlag}
            tooltip={flagged ? 'Unflag' : 'Flag'}
            aria-label={flagged ? 'Remove flag' : 'Add flag'}
          >
            <Star className={cn('h-4 w-4', flagged && 'fill-current text-[var(--warning-dark)]')} />
          </Button>

          <div className="w-40">
            <Select
              size="sm"
              options={moveTargets.map((f) => ({ value: f.path, label: f.name }))}
              value=""
              onChange={(v) => {
                if (v) onMove(v);
              }}
              placeholder="Move to…"
            />
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            tooltip={deleteLabel}
            aria-label={deleteLabel}
          >
            <Trash2 className="h-4 w-4 text-[var(--error-dark)]" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex"
            onClick={onClose}
            tooltip="Close"
            aria-label="Close conversation"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Conversation — oldest → newest, stacked cards */}
      <div className="min-w-0 flex-1 overflow-y-auto p-4">
        {messages.map((message) => {
          const isExpanded = expanded.has(message.uid);
          const attachments = message.attachments.filter((att) => att.inline === false);
          const hasAttachments = attachments.length > 0;
          const iframeHeight = heights[message.uid] ?? 200;

          return (
            <div
              key={message.uid}
              className="mb-3 overflow-hidden rounded-lg border border-[var(--border)]"
            >
              {/* Card header — toggles expand/collapse */}
              <button
                type="button"
                onClick={() => toggleExpanded(message.uid)}
                aria-expanded={isExpanded}
                className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-secondary)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-[var(--text)]">
                      {senderLabel(message.from)}
                    </span>
                    {hasAttachments && (
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
                    )}
                  </div>
                  {!isExpanded && (
                    <p className="mt-0.5 truncate text-sm text-[var(--text-tertiary)]">
                      {snippet(message.text)}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-xs whitespace-nowrap text-[var(--text-secondary)]">
                  {formatDateTime(message.date)}
                </span>
              </button>

              {/* Expanded body */}
              {isExpanded && (
                <div className="border-t border-[var(--border)]">
                  {message.to.length > 0 && (
                    <div className="flex gap-2 px-4 pt-3 text-xs">
                      <span className="w-6 shrink-0 text-[var(--text-secondary)]">To</span>
                      <span className="min-w-0 break-words text-[var(--text-secondary)]">
                        {formatAddressList(message.to)}
                      </span>
                    </div>
                  )}

                  {message.html !== null ? (
                    <iframe
                      key={message.uid}
                      title={`message-${message.uid}`}
                      // allow-same-origin lets the parent measure scrollHeight for auto-height;
                      // allow-scripts is intentionally absent so the email's own JS can never run.
                      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                      className="w-full border-0"
                      style={{ height: iframeHeight }}
                      onLoad={handleIframeLoad(message.uid)}
                      srcDoc={buildSrcDoc(message.html)}
                    />
                  ) : (
                    <pre className="p-4 text-sm break-words whitespace-pre-wrap text-[var(--text)]">
                      {message.text || 'This message has no text content.'}
                    </pre>
                  )}

                  {/* Attachments */}
                  {hasAttachments && (
                    <div className="border-t border-[var(--border)] p-4">
                      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--text)]">
                        <Paperclip className="h-4 w-4 text-[var(--text-secondary)]" />
                        Attachments
                        <span className="text-[var(--text-tertiary)]">({attachments.length})</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {attachments.map((att) => (
                          <Tooltip key={att.index} content={`Download ${att.filename}`}>
                            <button
                              type="button"
                              onClick={() => handleDownloadAttachment(message, att)}
                              className="group inline-flex max-w-full items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-left text-sm text-[var(--text)] transition-colors hover:bg-[var(--bg-tertiary)]"
                            >
                              <FileText className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
                              <span className="min-w-0 flex-1 truncate">
                                {att.filename || `attachment-${att.index}`}
                              </span>
                              <span className="shrink-0 text-xs text-[var(--text-tertiary)]">
                                {humanSize(att.size)}
                              </span>
                              <Download className="group-hover:text-primary h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                            </button>
                          </Tooltip>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
