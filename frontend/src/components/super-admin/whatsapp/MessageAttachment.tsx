'use client';

import {
  Download,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileSpreadsheet,
  File as FileIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { API } from '@/constants/api';
import type { WaMessage } from '@/types/whatsapp';
import MessageImage from './MessageImage';
import MessageVideo from './MessageVideo';
import MessageAudio from './MessageAudio';

interface MessageAttachmentProps {
  message: WaMessage;
  outbound: boolean;
}

/** Defensive read of a string field off an `unknown` payload. */
function payloadString(payload: unknown, key: string): string | null {
  if (payload && typeof payload === 'object' && key in payload) {
    const v = (payload as Record<string, unknown>)[key];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return null;
}

/** Defensive read of a numeric field off an `unknown` payload. */
function payloadNumber(payload: unknown, key: string): number | null {
  if (payload && typeof payload === 'object' && key in payload) {
    const v = (payload as Record<string, unknown>)[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

/** Guess a sensible file extension from a MIME type. */
function extFromMime(mime: string | null): string {
  if (!mime) return 'bin';
  const map: Record<string, string> = {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'text/plain': 'txt',
    'text/csv': 'csv',
    'application/zip': 'zip',
  };
  if (map[mime]) return map[mime];
  // Fall back to the subtype (e.g. "application/x-foo" → "foo").
  const sub = mime.split('/')[1];
  return sub ? sub.replace(/[^a-z0-9]/gi, '').slice(0, 6) || 'bin' : 'bin';
}

/** Human-readable byte size. */
function humanSize(bytes: number): string {
  if (bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val % 1 === 0 ? val : val.toFixed(1)} ${units[i]}`;
}

/** Pick a file-card icon based on the MIME type. */
function iconForMime(mime: string | null) {
  const cls = 'h-7 w-7 shrink-0';
  if (!mime) return <FileIcon className={cls} />;
  if (mime.startsWith('image/')) return <FileImage className={cls} />;
  if (mime.startsWith('video/')) return <FileVideo className={cls} />;
  if (mime.startsWith('audio/')) return <FileAudio className={cls} />;
  if (mime === 'application/pdf') return <FileText className={cls} />;
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime === 'text/csv')
    return <FileSpreadsheet className={cls} />;
  if (mime.includes('word') || mime.startsWith('text/')) return <FileText className={cls} />;
  return <FileIcon className={cls} />;
}

/**
 * Routes a media message to the right rich renderer: images/stickers, video, and
 * audio (voice notes + audio files) each have their own custom player/loader;
 * everything else (documents and any other file type) falls back to a download
 * card here.
 */
export default function MessageAttachment({ message, outbound }: MessageAttachmentProps) {
  if (!message.mediaId) return null;

  if (message.type === 'IMAGE' || message.type === 'STICKER') {
    return <MessageImage message={message} outbound={outbound} />;
  }
  if (message.type === 'VIDEO') {
    return <MessageVideo message={message} outbound={outbound} />;
  }
  if (message.type === 'AUDIO') {
    return <MessageAudio message={message} outbound={outbound} />;
  }

  // ── DOCUMENT / any other media-bearing type → file card ────────────────────
  const src = `/api/proxy${API.SUPER_ADMIN.WA_MEDIA(message.mediaId)}`;
  const payloadName = payloadString(message.payload, 'filename');
  const filename = payloadName || `${message.type.toLowerCase()}.${extFromMime(message.mediaMime)}`;
  const sizeBytes =
    payloadNumber(message.payload, 'fileSize') ?? payloadNumber(message.payload, 'size');
  const sizeLabel = sizeBytes ? humanSize(sizeBytes) : '';
  const caption = message.text && message.text.trim() ? message.text : null;

  return (
    <div className="flex flex-col">
      <div
        className={cn(
          'flex max-w-xs items-center gap-3 rounded-lg border border-[var(--border)] p-2.5',
          outbound ? 'bg-[var(--bg)]' : 'bg-[var(--bg-secondary)]',
        )}
      >
        <span className="text-[var(--text-muted)]">{iconForMime(message.mediaMime)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--text)]" title={filename}>
            {filename}
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            {[message.mediaMime?.split('/')[1]?.toUpperCase(), sizeLabel]
              .filter(Boolean)
              .join(' · ') || 'File'}
          </p>
        </div>
        <a
          href={src}
          download={filename}
          aria-label="Download"
          title="Download"
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded-md border border-[var(--border)] p-2',
            'text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]',
          )}
        >
          <Download className="h-4 w-4" />
        </a>
      </div>
      {caption && (
        <p className="mt-1.5 text-sm break-words whitespace-pre-wrap text-[var(--text)]">
          {caption}
        </p>
      )}
    </div>
  );
}
