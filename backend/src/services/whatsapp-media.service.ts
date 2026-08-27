import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import sharp from 'sharp';
import type { Response } from 'express';
import { env } from '../config/env';
import logger from '../config/logger';
import { prisma } from '../config/prisma';
import { r2Client } from '../config/r2';
import { putBufferToR2, getObjectStream, R2RangeNotSatisfiableError } from './storage.service';
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
 * Outcome of an archival attempt. A bare null could not tell `r2-unconfigured`
 * (permanent — no amount of retrying makes an absent bucket appear) apart from
 * a Meta/R2 blip, so the worker had to retry both and an R2-less deployment —
 * a supported setup — turned every inbound media message into a retry storm.
 */
export type ArchiveResult =
  /**
   * `size` is the byte length of what was archived. Meta's webhook describes
   * inbound media with a filename, a mime type and a sha256 and NO size, and
   * the media metadata endpoint is only consulted here, so this download is the
   * one moment the size of a customer's attachment is observable at all — the
   * media worker writes it onto the message so the file card can state it.
   */
  | { ok: true; key: string; thumbKey: string | null; size: number }
  | { ok: false; reason: 'r2-unconfigured' }
  | { ok: false; reason: 'transient' };

/**
 * Longest edge of the bubble/gallery derivative, in pixels.
 *
 * Sized for a chat bubble on a 2× display, not for the lightbox: the point is
 * that opening a thread with twenty photos no longer pulls twenty originals
 * through the proxy. The original is one tap away and is what any download gets.
 */
const THUMB_MAX_EDGE = 320;

/**
 * Which archived objects are worth deriving a thumbnail from.
 *
 * WEBP is deliberately excluded. On this platform a WebP is a STICKER, and Meta
 * caps those at 500 KB static / 500 KB animated — so a 320px derivative saves
 * nothing worth having, while `writeThumbnail`'s deliberate `animated: false`
 * (correct for a GIF preview) silently froze every animated sticker to its first
 * frame the moment the archive job ran. The bubble then requested that still
 * unconditionally, so the animation was unreachable outside the gallery.
 *
 * GIF stays: an animated GIF can be genuinely large, the still is a fine
 * thumbnail, and the bubble now asks for the original when it needs motion.
 */
function isThumbnailable(mime: string): boolean {
  return /^image\/(jpeg|jpg|png|gif|heic|heif|avif|tiff)$/i.test(mime.split(';')[0].trim());
}

/**
 * Write a small WebP derivative of an archived image beside the original.
 *
 * Returns null rather than throwing on ANY failure: a thumbnail is an
 * optimisation, and a corrupt or exotic image that sharp cannot decode must not
 * cost the archive of the original — which is the copy that has to survive
 * Meta's 30-day expiry.
 *
 * `animated: false` is deliberate: an animated GIF would otherwise be re-encoded
 * frame by frame into a WebP that can be larger than the source, which is the
 * exact opposite of what this exists to do. The first frame is a fine thumbnail.
 */
async function writeThumbnail(buf: Buffer, originalKey: string): Promise<string | null> {
  try {
    const thumb = await sharp(buf, { failOn: 'none' })
      .rotate()
      .resize({
        width: THUMB_MAX_EDGE,
        height: THUMB_MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 72 })
      .toBuffer();
    // Same basename under a `thumb/` sub-prefix, so the object is unguessable
    // for exactly the same reason the original is (see the key note above) and
    // the nightly reconcile sweep — which lists `whatsapp-media/` — sees it.
    const base = originalKey.replace(/^whatsapp-media\//, '').replace(/\.[^./]*$/, '');
    const { key } = await putBufferToR2(thumb, `whatsapp-media/thumb/${base}.webp`, 'image/webp');
    return key;
  } catch (err) {
    logger.warn('WhatsApp media thumbnail generation failed', { originalKey, err });
    return null;
  }
}

/**
 * Download inbound media from Meta and archive it durably to Cloudflare R2.
 * Returns the R2 key, or why it did not archive (the on-demand Meta proxy still
 * serves it for ~30 days regardless). Best-effort.
 */
export async function archiveInboundMedia(
  mediaId: string,
  fallbackMime: string
): Promise<ArchiveResult> {
  // R2 not configured — proxy still works.
  if (!r2Client) return { ok: false, reason: 'r2-unconfigured' };
  try {
    const meta = await getMediaMeta(mediaId);
    if (!meta) return { ok: false, reason: 'transient' };
    const token = env.META_WHATSAPP_TOKEN as string;
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const media = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
    if (!media.ok) return { ok: false, reason: 'transient' };
    const buf = Buffer.from(await media.arrayBuffer());
    const mime = meta.mime || fallbackMime || 'application/octet-stream';
    // Random key, NOT one derived from the Meta media id.
    //
    // The bucket may be fronted by a public domain, and the media id is not a
    // secret: it shows up in the operator's URL bar, in WaWebhookEvent payloads
    // and in any shared screenshot. A key of `whatsapp-media/<mediaId>.jpg` was
    // therefore guessable from all of those, which handed anyone who saw one a
    // credential-free route to the customer's photo or ID document — around the
    // enumeration guard in `streamMedia` below, the app password, the audit log
    // and retention deletion alike. Nothing reconstructs this key: the message
    // row stores it in `mediaUrl`, and both the retention prune and the nightly
    // reconcile sweep read it back from there.
    const { key } = await putBufferToR2(
      buf,
      `whatsapp-media/${randomUUID()}${extForMime(mime)}`,
      mime
    );
    // The bubble-sized copy, written while the bytes are already in memory —
    // the only moment it is free. Images only; a video poster frame would need a
    // decoder this service deliberately does not carry.
    const thumbKey = isThumbnailable(mime) ? await writeThumbnail(buf, key) : null;
    return { ok: true, key, thumbKey, size: buf.length };
  } catch (err) {
    logger.warn('WhatsApp media archival failed', { mediaId, err });
    return { ok: false, reason: 'transient' };
  }
}

/**
 * Inbound media whose archival gave up, newest first.
 *
 * A permanently failed archive used to be a single log line: no metric, no state
 * on the row, no list. Nobody found out that archiving had stopped working — a
 * rotated R2 credential, a full bucket — until a customer's photo was asked for
 * weeks later and Meta's own copy had expired too, at which point nothing could
 * be done about it. Inside the ~30-day Meta window a retry still recovers the
 * file, which is what makes this list actionable rather than a post-mortem.
 */
export async function listFailedMediaArchives(limit = 50) {
  const rows = await prisma.waMessage.findMany({
    where: { mediaArchiveStatus: 'FAILED', mediaId: { not: null } },
    select: {
      id: true,
      conversationId: true,
      mediaId: true,
      mediaMime: true,
      type: true,
      createdAt: true,
      contact: { select: { id: true, phone: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(200, Math.max(1, limit)),
  });
  return rows.map((r) => ({
    ...r,
    // Meta keeps inbound media for roughly 30 days; past that a retry cannot
    // succeed and the operator should stop expecting it to.
    recoverable: r.createdAt.getTime() > Date.now() - META_MEDIA_TTL_MS,
  }));
}

/** How long Meta keeps inbound media available for download. */
const META_MEDIA_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Put one failed archive back on the queue.
 *
 * Resets the row to PENDING before enqueueing so the inbox stops claiming the
 * file is gone while the retry is in flight, and so a second press does not
 * read as a second failure.
 */
export async function retryMediaArchive(messageId: string) {
  const message = await prisma.waMessage.findUnique({
    where: { id: messageId },
    select: { id: true, mediaId: true, mediaMime: true },
  });
  if (!message?.mediaId) {
    throw new AppError('That message has no media to archive', 404, 'WA_MEDIA_NOT_FOUND');
  }
  if (!r2Client) {
    throw new AppError(
      'Media archival needs R2 storage, which is not configured on this deployment',
      503,
      'WA_ARCHIVE_UNAVAILABLE'
    );
  }
  await prisma.waMessage.update({
    where: { id: messageId },
    data: { mediaArchiveStatus: 'PENDING' },
  });
  const { addWhatsappMediaJob } = await import('../jobs/whatsapp-media.queue');
  await addWhatsappMediaJob({
    messageId: message.id,
    mediaId: message.mediaId,
    mime: message.mediaMime ?? 'application/octet-stream',
  });
  return { messageId: message.id, status: 'PENDING' as const };
}

/**
 * Did the CLIENT go away mid-body? A player that seeks, or an operator who
 * closes the thread, aborts the in-flight request — routine traffic now that
 * ranged requests exist, and not something to log. Warning on it would put a
 * line in the log for every scrubber drag, which is what makes warn-level
 * output worth ignoring.
 */
function isClientAbort(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === 'ERR_STREAM_PREMATURE_CLOSE' || code === 'ECONNRESET' || code === 'EPIPE';
}

/**
 * Serve inbound WhatsApp media to the admin client. Prefers the durable R2 copy
 * (if archived); otherwise resolves + streams Meta's short-lived URL server-side
 * (the browser can't fetch it directly — it needs the bearer token).
 *
 * The body is piped, never buffered, and an inbound `Range` header is forwarded
 * upstream so the response can come back as a 206. Buffering held the whole file
 * in the Node heap once per concurrent viewer — a handful of 100 MB documents
 * (the inbox's own cap) is enough to OOM a small pod — and without ranges a
 * browser cannot seek: dragging the scrubber on a customer's video did nothing
 * until the entire file had downloaded.
 *
 * The range is read off `res.req` rather than taken as a parameter so callers
 * (and their tests) keep the existing two-argument contract.
 */
export async function streamMedia(
  mediaId: string,
  res: Response,
  opts: { variant?: 'original' | 'thumb' } = {}
): Promise<void> {
  // IDOR / enumeration guard: only serve a media id that actually belongs to a
  // stored WaMessage. Without this, any guessed Meta media id could be proxied.
  const owner = await prisma.waMessage
    .findFirst({ where: { mediaId }, select: { id: true } })
    .catch(() => null);
  if (!owner) throw new AppError('Media not found', 404, 'WA_MEDIA_NOT_FOUND');

  const range = typeof res.req?.headers?.range === 'string' ? res.req.headers.range : undefined;

  // Prefer the durable R2 archive when present.
  const archived = await prisma.waMessage
    .findFirst({
      where: { mediaId, mediaUrl: { not: null } },
      select: { mediaUrl: true, mediaMime: true, mediaThumbUrl: true },
    })
    .catch(() => null);
  // The bubble/gallery derivative, when one was asked for AND one exists.
  // Falling back to the original rather than 404ing is what lets the caller ask
  // for a thumbnail unconditionally: every message archived before thumbnails
  // existed (and every non-image) still renders exactly as it did.
  if (opts.variant === 'thumb' && archived?.mediaThumbUrl) {
    try {
      const object = await getObjectStream(archived.mediaThumbUrl, range);
      res.status(object.status);
      res.setHeader('Content-Type', object.contentType ?? 'image/webp');
      // A derivative is immutable — a re-archive writes a new key — so it can be
      // cached far harder than the hour the original gets.
      res.setHeader('Cache-Control', 'private, max-age=604800, immutable');
      res.setHeader('Accept-Ranges', 'bytes');
      if (object.contentLength != null) {
        res.setHeader('Content-Length', String(object.contentLength));
      }
      if (object.contentRange) res.setHeader('Content-Range', object.contentRange);
      await pipeline(object.body, res);
      return;
    } catch (err) {
      if (res.headersSent) {
        if (!isClientAbort(err)) {
          logger.warn('WhatsApp thumbnail stream failed mid-response', { mediaId, err });
        }
        res.end();
        return;
      }
      logger.warn('WhatsApp thumbnail fetch failed; falling back to the original', {
        mediaId,
        err,
      });
    }
  }
  if (archived?.mediaUrl) {
    try {
      const object = await getObjectStream(archived.mediaUrl, range);
      res.status(object.status);
      res.setHeader(
        'Content-Type',
        archived.mediaMime ?? object.contentType ?? 'application/octet-stream'
      );
      res.setHeader('Cache-Control', 'private, max-age=3600');
      // Advertised on every response, not just partial ones: a player only tries
      // a ranged request after it has seen Accept-Ranges on the first reply.
      res.setHeader('Accept-Ranges', 'bytes');
      if (object.contentLength != null) {
        res.setHeader('Content-Length', String(object.contentLength));
      }
      if (object.contentRange) res.setHeader('Content-Range', object.contentRange);
      await pipeline(object.body, res);
      return;
    } catch (err) {
      if (err instanceof R2RangeNotSatisfiableError) {
        res.setHeader('Accept-Ranges', 'bytes');
        res.status(416).json({ success: false, error: { message: 'Range not satisfiable' } });
        return;
      }
      // Once bytes are on the wire the Meta fallback can no longer run: starting
      // a second body would append it to the response the client is mid-read on.
      if (res.headersSent) {
        if (!isClientAbort(err)) {
          logger.warn('WhatsApp R2 media stream failed mid-response', { mediaId, err });
        }
        res.end();
        return;
      }
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
  const media = await fetch(meta.url, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...(range ? { Range: range } : {}),
    },
  });
  if (media.status === 416) {
    res.setHeader('Accept-Ranges', 'bytes');
    res.status(416).json({ success: false, error: { message: 'Range not satisfiable' } });
    return;
  }
  if (!media.ok || !media.body) {
    res.status(502).json({ success: false, error: { message: 'Failed to fetch media' } });
    return;
  }
  try {
    // 206 only when the upstream actually honoured the range — claiming a partial
    // response while sending the full body makes the player render garbage.
    res.status(media.status === 206 ? 206 : 200);
    res.setHeader('Content-Type', meta.mime);
    res.setHeader('Cache-Control', 'private, max-age=300');
    // Mirror the CDN's own capability rather than asserting one: Meta's media
    // host, not us, decides whether a second ranged request will be honoured.
    const acceptRanges = media.headers.get('accept-ranges');
    if (acceptRanges) {
      res.setHeader('Accept-Ranges', acceptRanges);
    } else if (media.status === 206) {
      res.setHeader('Accept-Ranges', 'bytes');
    }
    const contentLength = media.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    const contentRange = media.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);
    // Readable.fromWeb is flagged experimental below the engines floor, same as
    // fetch above it; both are present and stable on every Node this runs on.
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    await pipeline(Readable.fromWeb(media.body as any), res);
  } catch (err) {
    if (!isClientAbort(err)) logger.warn('WhatsApp media proxy error', { err });
    if (!res.headersSent) {
      res.status(502).json({ success: false, error: { message: 'Failed to fetch media' } });
    } else {
      res.end();
    }
  }
}
