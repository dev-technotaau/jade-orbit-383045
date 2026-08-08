'use client';

import { useCallback, useRef, useState, type ChangeEvent } from 'react';
import { Paperclip, Send, Save, X, Loader2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import RichTextEditor from '@/components/ui/RichTextEditor';
import { showToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { mailboxService } from '@/services/mailbox.service';
import type {
  MailUploadResult,
  MailComposePayload,
  RecipientSuggestion,
} from '@/types/email-mailbox';
import type { MailComposerProps } from '@/components/super-admin/email/mail/props';
import RecipientInput from '@/components/super-admin/email/mail/RecipientInput';

/** Split a raw recipients string into trimmed, non-empty addresses. */
function splitAddresses(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Compact human-readable byte size. */
function humanSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(1))} ${units[i]}`;
}

/** Best-effort message extraction from an unknown thrown value. */
function errMsg(e: unknown, fallback: string): string {
  if (e && typeof e === 'object') {
    const anyE = e as {
      message?: string;
      response?: { data?: { message?: string; error?: { message?: string } } };
    };
    return (
      anyE.response?.data?.error?.message ||
      anyE.response?.data?.message ||
      anyE.message ||
      fallback
    );
  }
  return fallback;
}

function titleForMode(mode: MailComposerProps['initial']['mode']): string {
  switch (mode) {
    case 'reply':
    case 'replyAll':
      return 'Reply';
    case 'forward':
      return 'Forward';
    case 'draft':
      return 'Edit draft';
    default:
      return 'New message';
  }
}

export default function MailComposer({
  accounts,
  defaultAccountId,
  initial,
  onClose,
  onSent,
}: MailComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Signatures are only auto-inserted for a brand-new compose (not reply/forward/draft).
  const isNewCompose = !initial.mode || initial.mode === 'new';
  const sigBlock = (accId: string): string => {
    const acc = accounts.find((a) => a.id === accId);
    if (!acc?.signature || acc.signature.trim().length === 0) return '';
    return `<br><br>-- <br>${acc.signature.replace(/\r?\n/g, '<br>')}`;
  };

  const [fromAccountId, setFromAccountId] = useState<string>(defaultAccountId);
  const [to, setTo] = useState<string>(() => (initial.to ?? []).join(', '));
  const [cc, setCc] = useState<string>(() => (initial.cc ?? []).join(', '));
  const [bcc, setBcc] = useState<string>(() => (initial.bcc ?? []).join(', '));
  const [showCc, setShowCc] = useState<boolean>(() => Boolean(initial.cc && initial.cc.length > 0));
  const [showBcc, setShowBcc] = useState<boolean>(() =>
    Boolean(initial.bcc && initial.bcc.length > 0),
  );
  const [subject, setSubject] = useState<string>(() => initial.subject ?? '');
  const [bodyHtml, setBodyHtml] = useState<string>(
    () => `${initial.html ?? ''}${isNewCompose ? sigBlock(defaultAccountId) : ''}`,
  );
  // The signature block currently appended, so a From-switch can swap it out.
  const appendedSigRef = useRef<string>(isNewCompose ? sigBlock(defaultAccountId) : '');

  // Switching the From account on a fresh compose swaps the seeded signature.
  const handleFromChange = (nextId: string) => {
    setFromAccountId(nextId);
    if (!isNewCompose) return;
    const oldBlock = appendedSigRef.current;
    const newBlock = sigBlock(nextId);
    if (oldBlock === newBlock) return;
    setBodyHtml((cur) => {
      const base =
        oldBlock && cur.endsWith(oldBlock) ? cur.slice(0, cur.length - oldBlock.length) : cur;
      return `${base}${newBlock}`;
    });
    appendedSigRef.current = newBlock;
  };
  const [attachments, setAttachments] = useState<MailUploadResult[]>(
    () => initial.attachments ?? [],
  );
  const [uploadingCount, setUploadingCount] = useState<number>(0);

  // Recipient autocomplete draws from recent correspondents of the From account.
  const fetchSuggestions = useCallback(
    async (q: string): Promise<RecipientSuggestion[]> => {
      try {
        const res = await mailboxService.suggestRecipients(fromAccountId, q);
        return res.data ?? [];
      } catch {
        return [];
      }
    },
    [fromAccountId],
  );
  const [sending, setSending] = useState<boolean>(false);
  const [savingDraft, setSavingDraft] = useState<boolean>(false);

  const fromLabel = (() => {
    const acc = accounts.find((a) => a.id === fromAccountId);
    return acc ? `${acc.name} <${acc.email}>` : '';
  })();

  function buildPayload(): MailComposePayload {
    const payload: MailComposePayload = {
      to: splitAddresses(to),
      subject: subject.trim(),
      html: bodyHtml,
      inReplyTo: initial.inReplyTo,
      references: initial.references,
      attachments: attachments.map((a) => ({ key: a.key, filename: a.filename, mime: a.mime })),
      // Carried so sending a resumed draft removes the source draft server-side.
      replaceUid: initial.replaceUid,
    };
    if (showCc) payload.cc = splitAddresses(cc);
    if (showBcc) payload.bcc = splitAddresses(bcc);
    return payload;
  }

  async function handleFilesSelected(e: ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    // Reset so re-selecting the same file fires change again.
    e.target.value = '';
    for (const file of files) {
      setUploadingCount((c) => c + 1);
      try {
        const res = await mailboxService.uploadAttachment(fromAccountId, file);
        if (res.data) {
          setAttachments((prev) => [...prev, res.data]);
        } else {
          showToast.error(`Failed to upload ${file.name}`);
        }
      } catch (err) {
        showToast.error(errMsg(err, `Failed to upload ${file.name}`));
      } finally {
        setUploadingCount((c) => c - 1);
      }
    }
  }

  function removeAttachment(key: string) {
    setAttachments((prev) => prev.filter((a) => a.key !== key));
  }

  async function handleSend() {
    if (splitAddresses(to).length === 0) {
      showToast.error('Add at least one recipient');
      return;
    }
    setSending(true);
    try {
      await mailboxService.send(fromAccountId, buildPayload());
      showToast.success('Message sent');
      onSent();
      onClose();
    } catch (err) {
      showToast.error(errMsg(err, 'Failed to send message'));
    } finally {
      setSending(false);
    }
  }

  async function handleSaveDraft() {
    setSavingDraft(true);
    try {
      await mailboxService.saveDraft(fromAccountId, buildPayload());
      showToast.success('Draft saved');
      onSent();
      onClose();
    } catch (err) {
      showToast.error(errMsg(err, 'Failed to save draft'));
    } finally {
      setSavingDraft(false);
    }
  }

  const busy = sending || savingDraft;
  const uploading = uploadingCount > 0;

  const toggleBtnClass =
    'rounded px-2 py-0.5 text-xs font-medium text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]';

  const footer = (
    <div className="flex items-center justify-between gap-2">
      <Button variant="ghost" onClick={onClose} disabled={busy}>
        Discard
      </Button>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          onClick={handleSaveDraft}
          isLoading={savingDraft}
          disabled={sending || uploading}
          leftIcon={<Save className="h-4 w-4" />}
        >
          Save draft
        </Button>
        <Button
          variant="primary"
          onClick={handleSend}
          isLoading={sending}
          disabled={savingDraft || uploading}
          leftIcon={<Send className="h-4 w-4" />}
        >
          Send
        </Button>
      </div>
    </div>
  );

  return (
    <Modal isOpen onClose={onClose} title={titleForMode(initial.mode)} size="xl" footer={footer}>
      <div className="space-y-4">
        {/* From */}
        {accounts.length > 1 ? (
          <Select
            id="mail-composer-from"
            label="From"
            options={accounts.map((a) => ({
              value: a.id,
              label: `${a.name} <${a.email}>`,
            }))}
            value={fromAccountId}
            onChange={handleFromChange}
            clearable={false}
          />
        ) : (
          <div className="text-sm text-[var(--text-tertiary)]">
            From: <span className="text-[var(--text)]">{fromLabel}</span>
          </div>
        )}

        {/* To + Cc/Bcc toggles */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label
              htmlFor="mail-composer-to"
              className="block text-sm font-medium text-[var(--text)]"
            >
              To
            </label>
            <div className="flex items-center gap-1">
              {!showCc && (
                <button
                  type="button"
                  className={cn(toggleBtnClass)}
                  onClick={() => setShowCc(true)}
                >
                  Cc
                </button>
              )}
              {!showBcc && (
                <button
                  type="button"
                  className={cn(toggleBtnClass)}
                  onClick={() => setShowBcc(true)}
                >
                  Bcc
                </button>
              )}
            </div>
          </div>
          <RecipientInput
            id="mail-composer-to"
            value={to}
            onChange={setTo}
            fetchSuggestions={fetchSuggestions}
            placeholder="recipient@example.com, another@example.com"
          />
        </div>

        {/* Cc */}
        {showCc && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label
                htmlFor="mail-composer-cc"
                className="block text-sm font-medium text-[var(--text)]"
              >
                Cc
              </label>
              <button
                type="button"
                className={cn(toggleBtnClass)}
                onClick={() => {
                  setShowCc(false);
                  setCc('');
                }}
              >
                Remove
              </button>
            </div>
            <RecipientInput
              id="mail-composer-cc"
              value={cc}
              onChange={setCc}
              fetchSuggestions={fetchSuggestions}
              placeholder="cc@example.com"
            />
          </div>
        )}

        {/* Bcc */}
        {showBcc && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label
                htmlFor="mail-composer-bcc"
                className="block text-sm font-medium text-[var(--text)]"
              >
                Bcc
              </label>
              <button
                type="button"
                className={cn(toggleBtnClass)}
                onClick={() => {
                  setShowBcc(false);
                  setBcc('');
                }}
              >
                Remove
              </button>
            </div>
            <RecipientInput
              id="mail-composer-bcc"
              value={bcc}
              onChange={setBcc}
              fetchSuggestions={fetchSuggestions}
              placeholder="bcc@example.com"
            />
          </div>
        )}

        {/* Subject */}
        <Input
          label="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          autoComplete="off"
        />

        {/* Body */}
        <RichTextEditor
          value={bodyHtml}
          onChange={setBodyHtml}
          label="Message"
          placeholder="Write your message..."
        />

        {/* Attachments */}
        <div>
          <input ref={fileInputRef} type="file" multiple hidden onChange={handleFilesSelected} />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={<Paperclip className="h-4 w-4" />}
              onClick={() => fileInputRef.current?.click()}
            >
              Attach
            </Button>
            {uploading && (
              <span className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading{uploadingCount > 1 ? ` (${uploadingCount})` : ''}...
              </span>
            )}
          </div>

          {attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {attachments.map((att) => (
                <span
                  key={att.key}
                  className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1 text-sm text-[var(--text)]"
                >
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
                  <span className="max-w-[180px] truncate">{att.filename}</span>
                  <span className="text-[var(--text-tertiary)]">{humanSize(att.size)}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${att.filename}`}
                    onClick={() => removeAttachment(att.key)}
                    className="rounded p-0.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
