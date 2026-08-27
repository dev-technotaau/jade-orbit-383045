'use client';

import { useEffect, useState } from 'react';
import { Download, X, ImageOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { API } from '@/constants/api';
import type { WaMessage } from '@/types/whatsapp';

interface MessageImageProps {
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

/** Guess a sensible file extension from a MIME type. */
function extFromMime(mime: string | null): string {
  if (!mime) return 'jpg';
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
  };
  if (map[mime]) return map[mime];
  const sub = mime.split('/')[1];
  return sub ? sub.replace(/[^a-z0-9]/gi, '').slice(0, 6) || 'jpg' : 'jpg';
}

/**
 * Renders an inbound/outbound WhatsApp IMAGE or STICKER message inside a chat
 * bubble, with a WhatsApp-style shimmer placeholder while the proxied media
 * downloads and (for images) a fullscreen lightbox.
 *
 * The WhatsApp Cloud API does not give us a thumbnail, so the placeholder is a
 * shimmer skeleton — not a blurred preview of the actual photo — which is
 * intentional. The <img> fades in (opacity transition) once loaded, mimicking
 * WhatsApp revealing the photo after download.
 *
 * The BUBBLE loads a ~320px WebP derivative the archival worker generated, not
 * the original: a thread with twenty customer photos used to pull twenty
 * full-resolution files (several megabytes each) through the proxy on every
 * open. The proxy falls back to the original for anything archived before
 * derivatives existed, so this is unconditional. The lightbox and the download
 * link below still serve the original — that is what they are for.
 */
export default function MessageImage({ message, outbound }: MessageImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Close the lightbox on Escape (cleanup-only effect — no setState in body).
  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen]);

  if (!message.mediaId) return null;

  const src = `/api/proxy${API.SUPER_ADMIN.WA_MEDIA(message.mediaId)}`;
  const thumbSrc = `${src}?variant=thumb`;
  // Archival gave up and Meta's own ~30-day copy is the only thing left — say
  // so rather than rendering the same "couldn't load" a flaky network produces.
  // One is temporary and one means the file is gone.
  const archiveFailed = message.mediaArchiveStatus === 'FAILED';

  const payloadName = payloadString(message.payload, 'filename');
  const filename = payloadName || `${message.type.toLowerCase()}.${extFromMime(message.mediaMime)}`;

  const caption = message.text && message.text.trim() ? message.text : null;
  const isSticker = message.type === 'STICKER';
  // Animation survives only in the ORIGINAL. The thumbnail derivative is written
  // with `animated: false` — right for a GIF preview, fatal for content whose
  // entire point is that it moves — so a sticker or an animated GIF asked for
  // the thumb and rendered as a frozen first frame once the archive job had run.
  // Stickers are capped at 500 KB by Meta and a GIF bubble is small, so skipping
  // the derivative here costs nothing worth measuring.
  const isAnimatedKind = isSticker || /gif/i.test(message.mediaMime ?? '');
  const bubbleSrc = isAnimatedKind ? src : thumbSrc;

  // ── Error fallback (broken image) ─────────────────────────────────────────
  if (errored) {
    return (
      <div className="flex flex-col">
        <div
          className={cn(
            'flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-4',
            outbound
              ? 'bg-emerald-700/40 text-white'
              : 'bg-[var(--bg-secondary)] text-[var(--text-muted)]',
            isSticker ? 'max-h-32' : 'min-w-[12rem]',
          )}
        >
          <ImageOff className="h-5 w-5 shrink-0" />
          <span className="text-xs">
            {archiveFailed ? 'Original no longer available' : 'Couldn’t load image'}
          </span>
        </div>
        {caption && (
          <p
            className={cn(
              'mt-1.5 text-sm break-words whitespace-pre-wrap',
              outbound ? 'text-white' : 'text-[var(--text)]',
            )}
          >
            {caption}
          </p>
        )}
      </div>
    );
  }

  // The shared <img> + shimmer placeholder. The placeholder div sits behind the
  // <img>, which fades from opacity-0 → opacity-100 on load.
  const imageBox = (
    <div
      className={cn('relative overflow-hidden rounded-lg', isSticker ? 'inline-block' : 'block')}
    >
      {/* Shimmer skeleton shown until the image finishes loading. */}
      {!loaded && (
        <div
          aria-hidden
          className={cn(
            'absolute inset-0 flex items-center justify-center rounded-lg',
            'animate-pulse bg-gradient-to-br from-[var(--bg-secondary)] to-[var(--border)]',
          )}
        >
          <Loader2
            className={cn(
              'h-6 w-6 animate-spin',
              outbound ? 'text-white/80' : 'text-[var(--text-muted)]',
            )}
          />
        </div>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={bubbleSrc}
        alt={caption || filename}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        className={cn(
          'max-w-full rounded-lg object-contain transition-opacity duration-300',
          isSticker ? 'max-h-32' : 'max-h-72',
          loaded ? 'opacity-100' : 'opacity-0',
          // Give the shimmer a sensible footprint before the natural size loads.
          !loaded && (isSticker ? 'h-32 w-32' : 'h-48 w-64'),
        )}
      />
    </div>
  );

  // ── STICKER — compact, no chrome, no lightbox ─────────────────────────────
  if (isSticker) {
    return imageBox;
  }

  // ── IMAGE — clickable, opens fullscreen lightbox ──────────────────────────
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        aria-label="View image"
        className="block overflow-hidden rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
      >
        {imageBox}
      </button>

      {caption && (
        <p
          className={cn(
            'mt-1.5 text-sm break-words whitespace-pre-wrap',
            outbound ? 'text-white' : 'text-[var(--text)]',
          )}
        >
          {caption}
        </p>
      )}

      {lightboxOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={() => setLightboxOpen(false)}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4"
        >
          {/* Controls */}
          <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
            <a
              href={src}
              download={filename}
              aria-label="Download"
              title="Download"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center justify-center rounded-full bg-white/10 p-2.5 text-white transition-colors hover:bg-white/20"
            >
              <Download className="h-5 w-5" />
            </a>
            <button
              type="button"
              aria-label="Close"
              title="Close"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxOpen(false);
              }}
              className="inline-flex items-center justify-center rounded-full bg-white/10 p-2.5 text-white transition-colors hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={caption || filename}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
