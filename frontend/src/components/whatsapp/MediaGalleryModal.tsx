'use client';

import { useEffect, useState } from 'react';
import { Loader2, Download, FileText, Music, Video as VideoIcon, ImageIcon } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Tooltip from '@/components/ui/Tooltip';
import { showToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { WaMessage, WaMessageType } from '@/types/whatsapp';

const MEDIA_TYPES: WaMessageType[] = ['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER'];

function typeIcon(type: WaMessageType) {
  if (type === 'VIDEO' || type === 'STICKER') return <VideoIcon className="h-5 w-5" />;
  if (type === 'AUDIO') return <Music className="h-5 w-5" />;
  if (type === 'DOCUMENT') return <FileText className="h-5 w-5" />;
  return <ImageIcon className="h-5 w-5" />;
}

/** One media tile: lazily fetches an auth'd object URL; images render inline. */
function MediaTile({ message }: { message: WaMessage }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isImage = message.type === 'IMAGE' || message.type === 'STICKER';

  // Auto-load image previews; other types load on click. Revoke object URLs on
  // unmount to avoid leaks.
  useEffect(() => {
    let active = true;
    let created: string | null = null;
    if (isImage && message.mediaId) {
      setLoading(true);
      svc
        .fetchMediaObjectUrl(message.mediaId)
        .then((u) => {
          if (!active) {
            URL.revokeObjectURL(u);
            return;
          }
          created = u;
          setUrl(u);
        })
        .catch(() => {
          if (active) showToast.error('Could not load media');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [isImage, message.mediaId]);

  const openNonImage = async () => {
    if (!message.mediaId) return;
    setLoading(true);
    try {
      const u = await svc.fetchMediaObjectUrl(message.mediaId);
      window.open(u, '_blank', 'noopener');
    } catch {
      showToast.error('Could not load media');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Tooltip content={`${message.type.toLowerCase()} — open`}>
      <button
        type="button"
        onClick={isImage ? () => url && window.open(url, '_blank', 'noopener') : openNonImage}
        className={cn(
          'group relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-muted)]',
          'hover:border-[var(--primary)]',
        )}
      >
        {isImage && url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={message.text || 'media'} className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-[10px] font-medium">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : typeIcon(message.type)}
            <span>{message.type.toLowerCase()}</span>
          </div>
        )}
        <span className="absolute top-1 right-1 rounded bg-black/40 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100">
          <Download className="h-3 w-3" />
        </span>
      </button>
    </Tooltip>
  );
}

/** Grid of all media (image/video/document/audio) in the open conversation. */
export default function MediaGalleryModal({
  messages,
  onClose,
}: {
  messages: WaMessage[];
  onClose: () => void;
}) {
  const media = messages.filter((m) => m.mediaId && MEDIA_TYPES.includes(m.type));

  return (
    <Modal isOpen onClose={onClose} title="Media in this conversation" size="lg">
      {media.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--text-muted)]">
          No media shared in this conversation yet.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {media.map((m) => (
            <MediaTile key={m.id} message={m} />
          ))}
        </div>
      )}
    </Modal>
  );
}
