'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, FileText, AlertTriangle, Sticker } from 'lucide-react';
import DialogShell from '@/components/ui/DialogShell';
import Button from '@/components/ui/Button';
import FormattedTextarea from '@/components/whatsapp/FormattedTextarea';
import { waMediaKind } from '@/constants/config';

/** Meta caps a media caption at 1024 characters. */
const MAX_CAPTION = 1024;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Pre-send sheet for an attachment: preview, filename/size, and a caption.
 *
 * The picker used to fire straight into the upload — no preview, no confirm and
 * no caption, even though the API and the send service both accept one. So the
 * wrong file could not be caught before it reached the customer, and a photo
 * always arrived with no explanation attached; agents worked around it by sending
 * a separate text message, which arrives as its own bubble and is billed as its
 * own conversation event.
 */
export default function MediaComposeModal({
  file,
  initialCaption,
  sending,
  onCancel,
  onSend,
}: {
  file: File;
  initialCaption?: string;
  sending: boolean;
  onCancel: () => void;
  onSend: (caption: string) => void;
}) {
  const [caption, setCaption] = useState(initialCaption ?? '');

  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');

  const mime = file.type || 'application/octet-stream';
  // What the customer will actually receive, decided by the same rules the
  // server sends by. The preview above plays a GIF or a MOV perfectly well in
  // the browser, so nothing on this sheet used to hint that the Cloud API takes
  // only JPEG/PNG and MP4/3GPP inline and that everything else is delivered as a
  // downloadable file card — the agent found out from the customer.
  const kind = useMemo(() => waMediaKind(mime, file.size), [mime, file.size]);
  const ridesAsFile = kind === 'document' && (isImage || isVideo);
  const isSticker = kind === 'sticker';
  /**
   * Meta accepts no caption on a sticker OR on audio, and the server drops it for
   * both — but this sheet only knew about stickers. So attaching an MP3 showed
   * the full caption editor, prefilled with whatever was in the composer: the
   * operator typed a message, sent, watched the composer empty, and the customer
   * received a bare audio file. The text was not in the thread, not in the
   * export, and not recoverable.
   */
  const captionless = isSticker || kind === 'audio';
  const formatLabel = (mime.split('/')[1] || 'file').split(';')[0].toUpperCase();
  const previewUrl = useMemo(
    () => (isImage || isVideo ? URL.createObjectURL(file) : null),
    [file, isImage, isVideo],
  );
  // Object URLs are retained until revoked; without this every attachment the
  // agent previewed leaked for the lifetime of the tab.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <DialogShell onClose={onCancel} label="Send attachment">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] p-6 pb-4">
          <h2 className="text-lg font-bold text-[var(--text)]">Send attachment</h2>
          <button onClick={onCancel} className="rounded p-1 hover:bg-[var(--bg-secondary)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-6">
          <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]">
            {isImage && previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt={file.name} className="max-h-64 w-full object-contain" />
            )}
            {isVideo && previewUrl && (
              <video src={previewUrl} controls className="max-h-64 w-full" />
            )}
            {!isImage && !isVideo && (
              <div className="flex items-center gap-3 p-4">
                <FileText className="h-8 w-8 shrink-0 text-[var(--text-muted)]" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--text)]">{file.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">{formatBytes(file.size)}</p>
                </div>
              </div>
            )}
          </div>

          {(isImage || isVideo) && (
            <p className="truncate text-xs text-[var(--text-muted)]">
              {file.name} · {formatBytes(file.size)}
            </p>
          )}

          {ridesAsFile && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                WhatsApp shows only JPEG/PNG images and MP4 video inside the chat. This{' '}
                {formatLabel} will arrive as a file the customer has to download.
              </span>
            </p>
          )}

          {captionless && (
            <p className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-2.5 text-xs text-[var(--text-muted)]">
              <Sticker className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {isSticker
                  ? 'This WEBP is sent as a sticker. Stickers carry no caption.'
                  : 'WhatsApp carries no caption on an audio file. Send your message as its own reply after the file.'}
              </span>
            </p>
          )}

          {/* Meta rejects a caption on a sticker and on audio, so the server drops
              it — offering the box would promise the agent something the customer
              never sees. */}
          {!captionless && (
            <FormattedTextarea
              label="Caption (optional)"
              value={caption}
              onChange={setCaption}
              rows={3}
              maxLength={MAX_CAPTION}
              placeholder="Add a caption…"
            />
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border)] p-6 pt-4">
          <Button variant="secondary" onClick={onCancel} disabled={sending}>
            Cancel
          </Button>
          <Button
            // Empty when the kind carries no caption. The state is seeded from
            // the composer draft even with the box hidden, so sending it would
            // hand the caller a caption the server then drops — and the caller
            // clears the draft when the two match, which is exactly how the
            // operator's typed message disappeared.
            onClick={() => onSend(captionless ? '' : caption.trim())}
            isLoading={sending}
            disabled={sending}
          >
            Send
          </Button>
        </div>
      </div>
    </DialogShell>
  );
}
