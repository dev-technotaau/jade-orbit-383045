'use client';

import { useState, type SyntheticEvent } from 'react';
import {
  Reply,
  ReplyAll,
  Forward,
  Pencil,
  Star,
  Mail,
  MailOpen,
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
import type { MailAddress, MailAttachmentMeta } from '@/types/email-mailbox';
import type { MailReaderProps } from '@/components/super-admin/email/mail/props';

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

export default function MailReader({
  accountId,
  detail,
  loading,
  folder,
  folderRole,
  folders,
  onReply,
  onReplyAll,
  onForward,
  onEditDraft,
  onToggleFlag,
  onToggleSeen,
  onDelete,
  onMove,
  onCopy,
  onClose,
}: MailReaderProps) {
  // Track height keyed by uid so a newly-opened message resets to the default
  // until its own onLoad measures it — derived, so no setState-in-effect.
  const [measured, setMeasured] = useState<{ uid: number; height: number } | null>(null);
  const iframeHeight = measured && detail && measured.uid === detail.uid ? measured.height : 300;

  const handleIframeLoad = (e: SyntheticEvent<HTMLIFrameElement>) => {
    if (!detail) return;
    try {
      const body = e.currentTarget.contentWindow?.document?.body;
      if (body) {
        const h = Math.min(Math.max(body.scrollHeight + 24, 300), 4000);
        setMeasured({ uid: detail.uid, height: h });
      }
    } catch {
      // Sandboxed iframe blocks cross-origin access — keep the default height.
    }
  };

  if (loading) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center bg-[var(--bg)]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 bg-[var(--bg)] p-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--bg-secondary)]">
          <Mail className="h-8 w-8 text-[var(--text-tertiary)]" />
        </div>
        <p className="text-sm text-[var(--text-secondary)]">Select a message to read</p>
      </div>
    );
  }

  const moveTargets = folders.filter((f) => f.path !== folder);
  const attachments = detail.attachments.filter((att) => att.inline === false);
  const deleteLabel = folderRole === 'trash' ? 'Delete forever' : 'Delete';

  const handleDownloadAttachment = async (att: MailAttachmentMeta) => {
    try {
      await mailboxService.downloadAttachment(
        accountId,
        detail.folder,
        detail.uid,
        att.index,
        att.filename,
      );
    } catch {
      showToast.error(`Failed to download ${att.filename}`);
    }
  };

  const handleDownloadRaw = async () => {
    try {
      await mailboxService.downloadRaw(accountId, detail.folder, detail.uid);
    } catch {
      showToast.error('Failed to download original message');
    }
  };

  const srcDoc = `<!doctype html><html><head><base target="_blank"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:12px;overflow-wrap:anywhere}img{max-width:100%}a{color:#2563eb}</style></head><body>${detail.html ?? ''}</body></html>`;

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-[var(--bg)]">
      {/* Header */}
      <div className="border-b border-[var(--border)] p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 flex-1 text-lg font-semibold break-words text-[var(--text)]">
            {detail.subject || '(no subject)'}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 md:hidden"
            onClick={onClose}
            tooltip="Close"
            aria-label="Close message"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Actions */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {folderRole === 'drafts' ? (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Pencil className="h-4 w-4" />}
              onClick={onEditDraft}
            >
              Edit draft
            </Button>
          ) : (
            <>
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
            </>
          )}

          <span className="mx-1 h-6 w-px bg-[var(--border)]" aria-hidden />

          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleFlag}
            tooltip={detail.flagged ? 'Unflag' : 'Flag'}
            aria-label={detail.flagged ? 'Remove flag' : 'Add flag'}
          >
            <Star
              className={cn('h-4 w-4', detail.flagged && 'fill-current text-[var(--warning-dark)]')}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleSeen}
            tooltip={detail.seen ? 'Mark as unread' : 'Mark as read'}
            aria-label={detail.seen ? 'Mark as unread' : 'Mark as read'}
          >
            {detail.seen ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
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

          <div className="w-40">
            <Select
              size="sm"
              options={moveTargets.map((f) => ({ value: f.path, label: f.name }))}
              value=""
              onChange={(v) => {
                if (v) onCopy(v);
              }}
              placeholder="Copy to…"
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
            aria-label="Close message"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Meta: from / to / cc + date */}
        <div className="mt-3 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1 text-sm">
            <div className="flex gap-2">
              <span className="w-10 shrink-0 text-[var(--text-secondary)]">From</span>
              <span className="min-w-0 break-words text-[var(--text)]">
                {detail.from ? formatAddress(detail.from) : '(unknown sender)'}
              </span>
            </div>
            {detail.to.length > 0 && (
              <div className="flex gap-2">
                <span className="w-10 shrink-0 text-[var(--text-secondary)]">To</span>
                <span className="min-w-0 break-words text-[var(--text)]">
                  {formatAddressList(detail.to)}
                </span>
              </div>
            )}
            {detail.cc.length > 0 && (
              <div className="flex gap-2">
                <span className="w-10 shrink-0 text-[var(--text-secondary)]">Cc</span>
                <span className="min-w-0 break-words text-[var(--text)]">
                  {formatAddressList(detail.cc)}
                </span>
              </div>
            )}
          </div>
          <div className="shrink-0 text-xs whitespace-nowrap text-[var(--text-secondary)]">
            {formatDateTime(detail.date)}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        {detail.html !== null ? (
          <iframe
            key={detail.uid}
            title="message"
            // allow-same-origin lets the parent measure scrollHeight for auto-height;
            // allow-scripts is intentionally absent so the email's own JS can never run.
            sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            className="w-full border-0"
            style={{ height: iframeHeight }}
            onLoad={handleIframeLoad}
            srcDoc={srcDoc}
          />
        ) : (
          <pre className="p-4 text-sm break-words whitespace-pre-wrap text-[var(--text)]">
            {detail.text || 'This message has no text content.'}
          </pre>
        )}

        {/* Attachments */}
        {attachments.length > 0 && (
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
                    onClick={() => handleDownloadAttachment(att)}
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

        {/* Download original (.eml) */}
        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={handleDownloadRaw}
            className="hover:text-primary inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] underline-offset-2 hover:underline"
          >
            <Download className="h-3.5 w-3.5" />
            Download original (.eml)
          </button>
        </div>
      </div>
    </div>
  );
}
