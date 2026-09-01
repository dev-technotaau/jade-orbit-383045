'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, Download, FileText, Music, Video as VideoIcon, ImageIcon } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Tooltip from '@/components/ui/Tooltip';
import { showToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { API } from '@/constants/api';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { WaConversationMedia, WaMessageType } from '@/types/whatsapp';

function typeIcon(type: WaMessageType) {
  if (type === 'VIDEO' || type === 'STICKER') return <VideoIcon className="h-5 w-5" />;
  if (type === 'AUDIO') return <Music className="h-5 w-5" />;
  if (type === 'DOCUMENT') return <FileText className="h-5 w-5" />;
  return <ImageIcon className="h-5 w-5" />;
}

/**
 * One media tile: image/sticker tiles lazily fetch an auth'd object URL and
 * render it inline; a click opens the full-size media in a new tab.
 */
function MediaTile({ message }: { message: WaConversationMedia }) {
  const isImage = message.type === 'IMAGE' || message.type === 'STICKER';
  const [url, setUrl] = useState<string | null>(null);
  // Seeded from `isImage` rather than set inside the effect below. Calling
  // setState synchronously in an effect body triggers a second render pass
  // before paint for every tile in the gallery; an image tile is loading from
  // its first render anyway, so the initial value already says so.
  const [loading, setLoading] = useState(isImage && Boolean(message.mediaId));

  // Auto-load image previews only. The object URL backs the inline <img> below
  // and nothing else, which is what makes it safe to revoke on unmount.
  useEffect(() => {
    let active = true;
    let created: string | null = null;
    if (isImage && message.mediaId) {
      svc
        // Tiles are ~1/10th of the viewport, so the derivative is what they
        // should show; the original opens in a new tab on click.
        .fetchMediaObjectUrl(message.mediaId, 'thumb')
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

  // Clicking a tile opens the proxied media route itself, never an object URL.
  // A blob URL handed to window.open only lives as long as this component: the
  // image tile revoked its URL on unmount, so closing the gallery blanked the
  // tab that was displaying the photo (ERR_FILE_NOT_FOUND), and the non-image
  // path never revoked at all, so every document or video opened kept its full
  // bytes resident for the life of the document. The route is same-origin and
  // authenticated by the unlock cookie, so the new tab loads it on its own.
  const openUrl = message.mediaId ? `/api/proxy${API.SUPER_ADMIN.WA_MEDIA(message.mediaId)}` : null;

  return (
    <Tooltip content={`${message.type.toLowerCase()} — open`}>
      <button
        type="button"
        onClick={() => openUrl && window.open(openUrl, '_blank', 'noopener')}
        className={cn(
          'group relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-muted)]',
          'hover:border-[var(--primary)]',
        )}
      >
        {isImage && url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={message.text || 'media'} className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-center text-[10px] font-medium">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : typeIcon(message.type)}
            <span>
              {message.mediaArchiveStatus === 'FAILED' && !url && !loading
                ? 'unavailable'
                : message.type.toLowerCase()}
            </span>
          </div>
        )}
        <span className="absolute top-1 right-1 rounded bg-black/40 p-1 text-white opacity-100 transition-opacity lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100 lg:focus-visible:opacity-100">
          <Download className="h-3 w-3" />
        </span>
      </button>
    </Tooltip>
  );
}

/** How many media rows one page of the gallery asks for. */
const PAGE_SIZE = 60;

/**
 * Grid of ALL media (image/video/document/audio/sticker) in the open
 * conversation, newest first.
 *
 * This used to be handed the inbox's in-memory thread buffer — the last page of
 * 50 messages plus whatever "Load older" had fetched — and filtered that. On any
 * conversation longer than a page it therefore showed a fraction of the media,
 * and told the operator "No media shared in this conversation yet" whenever those
 * 50 messages happened to be text. It now reads the conversation's media
 * directly, paginated with the same keyset cursor the thread uses.
 */
export default function MediaGalleryModal({
  conversationId,
  onClose,
}: {
  conversationId: string;
  onClose: () => void;
}) {
  const [older, setOlder] = useState<WaConversationMedia[]>([]);
  const [hasMore, setHasMore] = useState(false);

  const query = useQuery({
    queryKey: ['wa-conversation-media', conversationId],
    queryFn: () => svc.listConversationMedia(conversationId, { limit: PAGE_SIZE }),
  });
  const firstPage = query.data?.data?.items ?? [];
  // The first page owns `hasMore` until a "Load older" reply overrides it.
  const media = [...firstPage, ...older];
  const moreAvailable = older.length ? hasMore : !!query.data?.data?.hasMore;

  const loadMore = useMutation({
    mutationFn: () => {
      const oldest = media[media.length - 1];
      return svc.listConversationMedia(conversationId, {
        limit: PAGE_SIZE,
        before: oldest?.createdAt,
        // Meta stamps inbound messages to the second, so the cursor needs the id
        // too or every other row sharing that second is skipped.
        beforeId: oldest?.id,
      });
    },
    onSuccess: (res) => {
      setOlder((prev) => [...prev, ...(res.data?.items ?? [])]);
      setHasMore(!!res.data?.hasMore);
    },
    onError: (e) => showToast.error(errorMessage(e, 'Failed to load media')),
  });

  return (
    <Modal isOpen onClose={onClose} title="Media in this conversation" size="lg">
      {query.isLoading ? (
        <p className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading media…
        </p>
      ) : query.isError ? (
        <p className="py-8 text-center text-sm text-red-600">
          Could not load this conversation’s media.
        </p>
      ) : media.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--text-muted)]">
          No media shared in this conversation yet.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {media.map((m) => (
              <MediaTile key={m.id} message={m} />
            ))}
          </div>
          {moreAvailable && (
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={() => loadMore.mutate()}
                disabled={loadMore.isPending}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-60"
              >
                {loadMore.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Load older media
              </button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
