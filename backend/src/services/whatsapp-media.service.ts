import type { Response } from 'express';
import { env } from '../config/env';
import logger from '../config/logger';
import { prisma } from '../config/prisma';
import { r2Client } from '../config/r2';
import { putBufferToR2, downloadFileFromR2 } from './storage.service';
import { graphVersion } from './whatsapp.service';
import { AppError } from '../middleware/error';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Resolve a Meta media id to its short-lived download URL + mime type. */
async function getMediaMeta(mediaId: string): Promise<{ url: string; mime: string } | null> {
  const token = env.META_WHATSAPP_TOKEN;
  if (!token) return null;
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  const res = await fetch(`https://graph.facebook.com/${graphVersion()}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data: any = await res.json().catch(() => ({}));
  return data?.url ? { url: data.url, mime: data.mime_type ?? 'application/octet-stream' } : null;
}

function extForMime(mime: string): string {
  if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
  if (mime.includes('png')) return '.png';
  if (mime.includes('webp')) return '.webp';
  if (mime.includes('gif')) return '.gif';
  if (mime.includes('pdf')) return '.pdf';
  if (mime.includes('mp4')) return '.mp4';
  if (mime.includes('ogg')) return '.ogg';
  if (mime.includes('mpeg') || mime.includes('mp3')) return '.mp3';
  if (mime.includes('amr')) return '.amr';
  return '';
}

/**
 * Download inbound media from Meta and archive it durably to Cloudflare R2.
 * Returns the R2 key, or null if R2 is unconfigured / the fetch failed (the
 * on-demand Meta proxy still serves it for ~30 days regardless). Best-effort.
 */
export async function archiveInboundMedia(
  mediaId: string,
  fallbackMime: string
): Promise<string | null> {
  if (!r2Client) return null; // R2 not configured — proxy still works
  try {
    const meta = await getMediaMeta(mediaId);
    if (!meta) return null;
    const token = env.META_WHATSAPP_TOKEN as string;
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const media = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
    if (!media.ok) return null;
    const buf = Buffer.from(await media.arrayBuffer());
    const mime = meta.mime || fallbackMime || 'application/octet-stream';
    const { key } = await putBufferToR2(buf, `whatsapp-media/${mediaId}${extForMime(mime)}`, mime);
    return key;
  } catch (err) {
    logger.warn('WhatsApp media archival failed', { mediaId, err });
    return null;
  }
}

/**
 * Serve inbound WhatsApp media to the admin client. Prefers the durable R2 copy
 * (if archived); otherwise resolves + streams Meta's short-lived URL server-side
 * (the browser can't fetch it directly — it needs the bearer token).
 */
export async function streamMedia(mediaId: string, res: Response): Promise<void> {
  // IDOR / enumeration guard: only serve a media id that actually belongs to a
  // stored WaMessage. Without this, any guessed Meta media id could be proxied.
  const owner = await prisma.waMessage
    .findFirst({ where: { mediaId }, select: { id: true } })
    .catch(() => null);
  if (!owner) throw new AppError('Media not found', 404, 'WA_MEDIA_NOT_FOUND');

  // Prefer the durable R2 archive when present.
  const archived = await prisma.waMessage
    .findFirst({
      where: { mediaId, mediaUrl: { not: null } },
      select: { mediaUrl: true, mediaMime: true },
    })
    .catch(() => null);
  if (archived?.mediaUrl) {
    try {
      const buf = await downloadFileFromR2(archived.mediaUrl);
      res.setHeader('Content-Type', archived.mediaMime ?? 'application/octet-stream');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.send(buf);
      return;
    } catch (err) {
      logger.warn('WhatsApp R2 media fetch failed; falling back to Meta', { mediaId, err });
    }
  }

  // Fall back to the short-lived Meta proxy.
  const meta = await getMediaMeta(mediaId);
  if (!meta) {
    res.status(404).json({ success: false, error: { message: 'Media not found or expired' } });
    return;
  }
  const token = env.META_WHATSAPP_TOKEN as string;
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  const media = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
  if (!media.ok || !media.body) {
    res.status(502).json({ success: false, error: { message: 'Failed to fetch media' } });
    return;
  }
  try {
    const buf = Buffer.from(await media.arrayBuffer());
    res.setHeader('Content-Type', meta.mime);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(buf);
  } catch (err) {
    logger.warn('WhatsApp media proxy error', { err });
    if (!res.headersSent) {
      res.status(502).json({ success: false, error: { message: 'Failed to fetch media' } });
    } else {
      res.end();
    }
  }
}
