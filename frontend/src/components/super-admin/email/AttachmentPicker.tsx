'use client';

import { useRef, useState } from 'react';
import { Paperclip, X, Loader2, FileText } from 'lucide-react';
import { superAdminEmailService as svc } from '@/services/super-admin-email.service';
import { showToast } from '@/components/ui/Toast';
import Tooltip from '@/components/ui/Tooltip';
import type { OutboundAttachmentRef } from '@/types/email';

/**
 * Reusable outbound-attachment picker for the campaign compose + reply-inbox
 * surfaces. Uploads each file to R2 (staging) and manages a list of refs; the
 * parent submits `value` alongside the campaign/reply payload.
 */

const MAX_FILES = 10;

function humanSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function AttachmentPicker({
  value,
  onChange,
  disabled,
  compact,
}: {
  value: OutboundAttachmentRef[];
  onChange: (refs: OutboundAttachmentRef[]) => void;
  disabled?: boolean;
  /** Compact = icon-only trigger (for the reply composer toolbar). */
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_FILES - value.length;
    if (room <= 0) {
      showToast.error(`Up to ${MAX_FILES} attachments`);
      return;
    }
    setBusy(true);
    const added: OutboundAttachmentRef[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      try {
        const res = await svc.uploadOutboundAttachment(file);
        if (res.data) added.push(res.data);
      } catch {
        showToast.error(`Could not upload ${file.name}`);
      }
    }
    if (added.length) onChange([...value, ...added]);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  function remove(key: string) {
    onChange(value.filter((a) => a.key !== key));
  }

  return (
    <div className={compact ? 'inline-flex items-center gap-2' : 'space-y-2'}>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Tooltip content="Attach files">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          className={
            compact
              ? 'inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-[var(--text-muted)] hover:bg-black/5 hover:text-[var(--text)] disabled:opacity-50'
              : 'inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--text)] hover:bg-black/5 disabled:opacity-50'
          }
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          {compact ? (value.length > 0 ? value.length : '') : 'Attach files'}
        </button>
      </Tooltip>

      {value.length > 0 && (
        <div className={compact ? 'flex flex-wrap gap-1.5' : 'flex flex-wrap gap-2'}>
          {value.map((a) => (
            <span
              key={a.key}
              className="inline-flex max-w-[220px] items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1 text-xs"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
              <span className="truncate text-[var(--text)]" title={a.filename}>
                {a.filename}
              </span>
              {a.size ? (
                <span className="shrink-0 text-[var(--text-muted)]">{humanSize(a.size)}</span>
              ) : null}
              <Tooltip inline content="Remove">
                <button
                  type="button"
                  onClick={() => remove(a.key)}
                  className="shrink-0 rounded p-0.5 text-[var(--text-muted)] hover:bg-black/10 hover:text-[var(--text)]"
                >
                  <X className="h-3 w-3" />
                </button>
              </Tooltip>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
