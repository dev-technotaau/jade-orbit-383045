import type { Request, Response, NextFunction } from 'express';
import * as conversationService from '../services/whatsapp-conversation.service';
import { addWhatsappMediaJob } from '../jobs/whatsapp-media.queue';
import {
  sendSessionMessage,
  sendTemplateToConversation,
  startConversationWithTemplate,
  sendInteractiveMessage,
  sendMediaMessage,
  sendReaction as sendReactionMessage,
  sendLocation as sendLocationMessage,
  sendContacts as sendContactsMessage,
} from '../services/whatsapp-send.service';
import { graphVersion, uploadMediaToMeta } from '../services/whatsapp.service';
import {
  listChannels,
  syncChannelHealth,
  createChannel,
  updateChannel,
  setDefaultChannel,
  setChannelActive,
  testChannel,
  getBusinessProfile,
  updateBusinessProfile,
  registerPhoneNumber,
  deregisterPhoneNumber,
  setTwoStepPin,
  getCommerceSettings,
  updateCommerceSettings,
  getConversationalAutomation,
  updateConversationalAutomation,
} from '../services/whatsapp-channel.service';
import { uploadHeaderSampleHandle } from '../services/whatsapp-template.service';
import {
  streamMedia,
  listFailedMediaArchives,
  retryMediaArchive,
} from '../services/whatsapp-media.service';
import { getOverview } from '../services/whatsapp-analytics.service';
import * as cannedService from '../services/whatsapp-canned-reply.service';
import * as faqService from '../services/whatsapp-faq.service';
import * as noteService from '../services/whatsapp-notes.service';
import { streamContactsForExport } from '../services/whatsapp-contact.service';
import { tagListQ } from '../services/whatsapp-contact.service';
import logger from '../config/logger';
import {
  getSignedUploadUrl,
  downloadFileFromR2,
  deleteFileFromR2,
} from '../services/storage.service';
import { r2Client } from '../config/r2';
import { scanFile } from '../utils/file-scan';
import {
  MAX_MEDIA_BYTES,
  byteLabel,
  isAnimatedWebp,
  isOggOpusBytes,
  mediaKindForMime,
  metaLimitFor,
} from '../utils/wa-media-limits';
import { safeCsvCell } from '../utils/whatsapp-csv';
import { AppError } from '../middleware/error';
import { randomUUID } from 'crypto';
import path from 'path';
import { prisma } from '../config/prisma';
import type { WaConversationStatus, WaOptInStatus } from '@prisma/client';

/** Bulk action over many conversations (archive/resolve/assign/label/snooze/markRead/status). */
export const bulkConversations = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { action, ids, allMatching, filters, assignedTo, snoozedUntil, label } = req.body;
    const result = await conversationService.bulkUpdate({
      action,
      ids,
      allMatching,
      // The date bounds cross the wire as strings and the service takes Dates.
      // Left as strings they are dropped by the where-builder's `params.from`
      // check being truthy but unusable — silently widening the selection.
      filters: filters
        ? {
            ...filters,
            from: parseDayBound(filters.from, false),
            to: parseDayBound(filters.to, true),
          }
        : undefined,
      assignedTo,
      snoozedUntil:
        snoozedUntil === undefined
          ? undefined
          : snoozedUntil === null
            ? null
            : new Date(snoozedUntil),
      label,
    });
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

/** Total unread messages across the active inbox — drives the sidebar badge. */
export const getUnreadTotal = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await conversationService.getUnreadTotal();
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

/**
 * A `YYYY-MM-DD` day boundary, or a full ISO instant, as a Date.
 *
 * A bare date parses as UTC midnight, so a naive `new Date('2026-08-27')` used
 * as an upper bound excludes everything that happened that day. The end variant
 * takes the last millisecond of the day in the SERVER's zone, which is the zone
 * every other timestamp in this API is rendered against.
 */
function parseDayBound(v: unknown, endOfDay: boolean): Date | undefined {
  if (typeof v !== 'string' || !v.trim()) return undefined;
  const raw = v.trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? `${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`
    : raw;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export const getConversations = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const {
      channelId,
      status,
      assignedTo,
      q,
      unread,
      searchMessages,
      includeArchived,
      includeSnoozed,
      archivedOnly,
      snoozedOnly,
      labels,
      awaiting,
      from,
      to,
      sort,
      page,
      limit,
      cursor,
    } = req.query;
    // Accepts either repeated `?labels=a&labels=b` or a comma-separated list.
    const labelList = (Array.isArray(labels) ? labels : labels ? String(labels).split(',') : [])
      .map((l) => String(l).trim())
      .filter(Boolean);
    const result = await conversationService.list({
      channelId: (channelId as string) || undefined,
      status: (status as WaConversationStatus) || undefined,
      assignedTo: (assignedTo as string) || undefined,
      q: (q as string) || undefined,
      unreadOnly: unread === 'true',
      searchMessages: searchMessages === 'true',
      includeArchived: includeArchived === 'true',
      includeSnoozed: includeSnoozed === 'true',
      archivedOnly: archivedOnly === 'true',
      snoozedOnly: snoozedOnly === 'true',
      labels: labelList.length ? labelList : undefined,
      // "Still waiting on us" — the question that decides which thread to open
      // next, previously answerable only by opening them.
      awaitingOnly: awaiting === 'true',
      from: parseDayBound(from, false),
      to: parseDayBound(to, true),
      // Anything unrecognised falls back to `recent` rather than 400ing: an
      // unknown sort is a stale bookmark, not a client that needs correcting.
      sort: sort === 'oldest' || sort === 'waiting' ? sort : 'recent',
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      // Keyset position of the last row already loaded. Supersedes `page`: the
      // offset path drifts under a list that reorders on every inbound message.
      cursor: (cursor as string) || undefined,
    });
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

export const getConversation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const conv = await conversationService.getById(String(req.params.id));
    if (!conv) throw new AppError('Conversation not found', 404, 'WA_CONVERSATION_NOT_FOUND');
    res.json({ success: true, data: conv });
  } catch (e) {
    next(e);
  }
};

export const getMessages = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const messages = await conversationService.getThread(String(req.params.id), {
      before: (req.query.before as string) || undefined,
      // Tie-break for the compound cursor. Meta timestamps are second-resolution,
      // so paging on time alone skips messages that share the boundary second.
      beforeId: (req.query.beforeId as string) || undefined,
      // Deep-link from a message search: centre the page on the matched message
      // instead of opening at the bottom of a thread it may be far above.
      around: (req.query.around as string) || undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    });
    res.json({ success: true, data: { items: messages } });
  } catch (e) {
    next(e);
  }
};

/**
 * Every media message in the conversation (paginated), for the media gallery.
 *
 * The gallery previously filtered the client's in-memory thread buffer, so it
 * only ever saw the media in the last page of messages.
 */
export const getConversationMedia = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await conversationService.listConversationMedia(String(req.params.id), {
      before: (req.query.before as string) || undefined,
      beforeId: (req.query.beforeId as string) || undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

/** "Delete for me": soft-delete one or more messages from the inbox view. */
export const deleteMessages = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const raw = (req.body as { messageIds?: unknown }).messageIds;
    const messageIds = Array.isArray(raw) ? raw.map((x) => String(x)) : [];
    const result = await conversationService.deleteMessagesForMe(String(req.params.id), messageIds);
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

/** Clear chat history — soft-delete every message in the conversation (our side). */
export const clearConversation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await conversationService.clearConversation(String(req.params.id));
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

export const sendMessage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const message = await sendSessionMessage(String(req.params.id), req.user!.id, {
      type: 'text',
      text: String(req.body.text ?? ''),
      // Forwarded so the send builds `context: { message_id }`; the service has
      // always supported it, the controller simply never passed it on.
      contextWamid:
        typeof req.body.contextWamid === 'string' && req.body.contextWamid
          ? req.body.contextWamid
          : undefined,
    });
    res.status(201).json({ success: true, data: message });
  } catch (e) {
    next(e);
  }
};

/**
 * Accept any file type — there is no mimetype allowlist. Like the WhatsApp app,
 * the user can send arbitrary files; safety is enforced by the `scanFile`
 * security scan (magic-bytes + dangerous-extension check) in `sendMedia`, by
 * Meta's per-kind size limits, and by the document fallback in
 * `mediaKindForMime` (anything Meta won't take natively rides as a document).
 */
function isAllowedWaMime(_mime: string): boolean {
  return true;
}

/** How long a browser has to complete a direct-to-R2 PUT before the URL dies. */
const SIGNED_UPLOAD_TTL_SECONDS = 900;

/** Prefix every browser-staged upload lands under, and nothing else. */
const STAGING_PREFIX = 'wa-uploads/';

/**
 * Reject a staging key that is not one we minted.
 *
 * The key arrives from the browser, and the archive of every inbound attachment
 * this account has ever received lives in the same bucket — so without this an
 * operator could name any object in it and have the server upload it to Meta and
 * send it to a customer.
 */
function assertStagingKey(key: string): void {
  if (!/^wa-uploads\/[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(key)) {
    throw new AppError('Invalid upload key', 400, 'WA_INVALID_UPLOAD_KEY');
  }
}

/**
 * Mint a signed URL the browser PUTs the file straight to, then sends us the key.
 *
 * Everything the console does goes through the Next.js BFF proxy, which buffers
 * the whole request body before forwarding it — and serverless platforms cap that
 * buffer at a few megabytes. That cap, not WhatsApp, is what made a 6 MB PDF
 * unsendable while `META_MEDIA_LIMITS.document` advertised 100 MB. Uploading
 * direct to R2 removes both the proxy and this process from the byte path.
 */
export const signMediaUpload = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!r2Client) {
      throw new AppError(
        'Large uploads need R2 storage, which is not configured on this deployment',
        503,
        'WA_DIRECT_UPLOAD_UNAVAILABLE'
      );
    }
    const mime = typeof req.body.mime === 'string' ? req.body.mime.trim() : '';
    const filename = typeof req.body.filename === 'string' ? req.body.filename.trim() : '';
    const size = Number(req.body.size);
    if (!mime || !filename) {
      throw new AppError('filename and mime are required', 400, 'WA_SIGN_INVALID');
    }
    if (!Number.isFinite(size) || size <= 0) {
      throw new AppError('A positive file size is required', 400, 'WA_SIGN_INVALID');
    }
    const kind = mediaKindForMime(mime, size);
    const limit = metaLimitFor(kind);
    if (size > limit) {
      throw new AppError(
        `${kind} files must be under ${byteLabel(limit)} ` + `(this one is ${byteLabel(size)})`,
        400,
        'WA_FILE_TOO_LARGE'
      );
    }
    // Only the extension survives from the operator's filename — the real name
    // travels separately and the key has to stay inside `assertStagingKey`.
    const ext = path
      .extname(filename)
      .replace(/[^A-Za-z0-9.]/g, '')
      .slice(0, 12);
    const key = `${STAGING_PREFIX}${randomUUID()}${ext}`;
    const url = await getSignedUploadUrl(key, mime, SIGNED_UPLOAD_TTL_SECONDS);
    res.json({
      success: true,
      data: { url, key, kind, contentType: mime, expiresIn: SIGNED_UPLOAD_TTL_SECONDS },
    });
  } catch (e) {
    next(e);
  }
};

/**
 * The bytes to send, however the browser got them to us: inline in the multipart
 * body (small files, one round trip) or staged in R2 and named by key (anything
 * over the proxy's body limit).
 *
 * Exported for the send-later path (whatsapp-scheduled-message.controller),
 * which faces the same two transports and must apply the same staging-key guard.
 */
export async function resolveOutboundMedia(req: Request): Promise<{
  buffer: Buffer;
  mime: string;
  filename: string;
  /** Staging object to clean up once Meta has the bytes; null for multipart. */
  stagedKey: string | null;
}> {
  const file = req.file;
  if (file) {
    return {
      buffer: file.buffer,
      mime: file.mimetype,
      filename: file.originalname,
      stagedKey: null,
    };
  }
  const r2Key = typeof req.body?.r2Key === 'string' ? req.body.r2Key.trim() : '';
  if (!r2Key) throw new AppError('A file is required', 400, 'WA_MEDIA_REQUIRED');
  assertStagingKey(r2Key);
  let buffer: Buffer;
  try {
    buffer = await downloadFileFromR2(r2Key);
  } catch {
    // Signed PUT URLs expire in 15 minutes; a stale key is the operator having
    // left the tab open, not a server fault, so say so rather than 500.
    throw new AppError(
      'That upload is no longer available — pick the file again',
      404,
      'WA_UPLOAD_EXPIRED'
    );
  }
  const mime =
    typeof req.body.mime === 'string' && req.body.mime.trim()
      ? req.body.mime.trim()
      : 'application/octet-stream';
  const filename =
    typeof req.body.filename === 'string' && req.body.filename.trim()
      ? req.body.filename.trim()
      : path.basename(r2Key);
  return { buffer, mime, filename, stagedKey: r2Key };
}

/**
 * Stage a file at Meta and return the media id, WITHOUT sending anything.
 *
 * Media-header templates could only be sent by pasting a public URL the operator
 * had to host themselves — Meta re-fetched it on every single send, nothing
 * checked it was reachable, and an already-uploaded asset could not be reused.
 * A media id is scoped to the phone-number id that uploaded it, so an optional
 * `conversationId` stages the file under the number that thread replies from;
 * without one it goes to the default (env) number, which is the one a brand-new
 * conversation will be started from.
 */
export const uploadMedia = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Same two transports as a conversation send: multipart for small files,
    // an R2 staging key for anything over the proxy's body limit.
    const { buffer, mime, filename, stagedKey } = await resolveOutboundMedia(req);
    const scan = scanFile(buffer, filename, mime, MAX_MEDIA_BYTES);
    if (!scan.safe) {
      throw new AppError(scan.reason || 'File rejected by security scan', 400, 'WA_FILE_REJECTED');
    }
    // A WebP's ceiling depends on whether it animates, and the bytes are here.
    const animated = mime === 'image/webp' && isAnimatedWebp(buffer);
    const kind = mediaKindForMime(mime, buffer.length, animated);
    const limit = metaLimitFor(kind, animated);
    if (buffer.length > limit) {
      throw new AppError(
        `${kind} files must be under ${byteLabel(limit)} ` +
          `(this one is ${byteLabel(buffer.length)})`,
        400,
        'WA_FILE_TOO_LARGE'
      );
    }
    const conversationId = (req.body.conversationId as string) || undefined;
    // For a new conversation there is no conversationId yet, so accept the
    // recipient's phone and resolve the same channel the send will pick. Without
    // this the upload silently used the env default number while the send used
    // the contact's existing thread, and Meta rejected the mismatch.
    const recipientPhone = (req.body.phone as string) || undefined;
    // A campaign has no conversation and no single recipient — its header media
    // is one file for the whole audience — but it does have a channel, and a
    // Meta media id is scoped to the number that uploaded it. Without this the
    // campaign's file staged under the env default number while the broadcast
    // went out from the campaign's own channel, and Meta refused the mismatch.
    const channelId = (req.body.channelId as string) || undefined;
    const senderPhoneId = conversationId
      ? await conversationService.getConversationSenderPhoneId(conversationId)
      : channelId
        ? ((
            await prisma.waChannel.findUnique({
              where: { id: channelId },
              select: { phoneNumberId: true },
            })
          )?.phoneNumberId ?? undefined)
        : recipientPhone
          ? await conversationService.resolveSenderPhoneIdForPhone(recipientPhone)
          : undefined;
    const mediaId = await uploadMediaToMeta(buffer, mime, filename, senderPhoneId);
    if (!mediaId) {
      throw new AppError(
        'Media upload failed (WhatsApp not configured)',
        502,
        'WA_MEDIA_UPLOAD_FAILED'
      );
    }
    if (stagedKey) void deleteFileFromR2(stagedKey).catch(() => {});
    res.status(201).json({
      success: true,
      data: { mediaId, kind, mime, filename },
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Send a media file into a conversation (image/video/audio/document/sticker).
 *
 * Takes the file either as a multipart upload or as the key of an object the
 * browser already PUT to R2 — see `resolveOutboundMedia`.
 */
/**
 * The WAMID a send is quoting, when the composer had the reply banner up.
 *
 * Read the same way on every send route rather than per-handler: a reply is a
 * property of the send, not of the text path that happened to implement it
 * first, and the media/location/contacts/interactive routes silently ignored it.
 */
function replyWamidFrom(body: unknown): string | undefined {
  const v = (body as { contextWamid?: unknown } | null)?.contextWamid;
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

export const sendMedia = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { buffer, mime, filename, stagedKey } = await resolveOutboundMedia(req);
    // Enforce the per-kind mimetype allowlist before touching the bytes.
    if (!isAllowedWaMime(mime)) {
      throw new AppError(`File type ${mime} is not allowed`, 400, 'WA_FILE_REJECTED');
    }
    // Security scan (magic-bytes, dangerous extensions/patterns) — same util the
    // storage service uses. Reject anything flagged before uploading to Meta.
    const scan = scanFile(buffer, filename, mime, MAX_MEDIA_BYTES);
    if (!scan.safe) {
      throw new AppError(scan.reason || 'File rejected by security scan', 400, 'WA_FILE_REJECTED');
    }
    // A WebP's ceiling depends on whether it animates, and the bytes are here.
    const animated = mime === 'image/webp' && isAnimatedWebp(buffer);
    const kind = mediaKindForMime(mime, buffer.length, animated);
    // Meta's per-kind ceiling, checked before the upload so the operator gets a
    // clear limit rather than an opaque rejection from the Graph API.
    const limit = metaLimitFor(kind, animated);
    if (buffer.length > limit) {
      throw new AppError(
        `${kind} files must be under ${byteLabel(limit)} ` +
          `(this one is ${byteLabel(buffer.length)})`,
        400,
        'WA_FILE_TOO_LARGE'
      );
    }
    // Upload under the SAME number the message will be sent from: a Meta media
    // id is scoped to the phone-number id that uploaded it, so staging every
    // file under the env number made attachments on a second number's threads
    // fail the send outright.
    const senderPhoneId = await conversationService.getConversationSenderPhoneId(
      String(req.params.id)
    );
    const mediaId = await uploadMediaToMeta(buffer, mime, filename, senderPhoneId);
    if (!mediaId) {
      throw new AppError(
        'Media upload failed (WhatsApp not configured)',
        502,
        'WA_MEDIA_UPLOAD_FAILED'
      );
    }
    // Meta holds the bytes now, so the staging object is dead weight. Deleted
    // fire-and-forget: a failed cleanup must never fail a send that landed.
    if (stagedKey) void deleteFileFromR2(stagedKey).catch(() => {});
    const message = await sendMediaMessage(String(req.params.id), req.user!.id, {
      kind,
      mediaId,
      mime,
      caption: (req.body.caption as string) || undefined,
      filename: kind === 'document' ? filename : undefined,
      // The size is only knowable here — Meta echoes nothing back about the
      // bytes it accepted — so it is recorded now or never, and the document
      // card in the thread has no size to show.
      size: buffer.length,
      // The voice recorder marks its uploads so they render as voice notes. The
      // multipart path spells it 'true' (form fields are strings); the JSON one
      // sends a real boolean.
      //
      // And the bytes get the final say. The flag is a CLAIM from whatever
      // client made the call, and the browsers that cannot record ogg/opus
      // transcode to MP3 — which WhatsApp delivers as a downloadable audio file,
      // not a push-to-talk bubble. Trusting the flag meant our thread drew a
      // waveform and a duration for a message the customer received as a music
      // file, and the transcript recorded it as a voice note for good.
      voice:
        (req.body.voice === 'true' || req.body.voice === true) &&
        kind === 'audio' &&
        isOggOpusBytes(buffer),
      contextWamid: replyWamidFrom(req.body),
    });
    // Archive what we just sent.
    //
    // Only INBOUND media was ever queued for archival, so every file the operator
    // sent lived solely inside Meta's ~30-day media window and then vanished — the
    // console could not show or re-download its own outbound attachments. The same
    // worker handles it: it fetches by Meta media id and writes to R2, and the id
    // is valid for our own uploads too. Fire-and-forget so archival can never fail
    // a send that has already reached the customer.
    if (message?.id) {
      void addWhatsappMediaJob({
        messageId: message.id,
        mediaId,
        mime,
      }).catch(() => {});
    }

    res.status(201).json({ success: true, data: message });
  } catch (e) {
    next(e);
  }
};

export const markRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await conversationService.markRead(String(req.params.id));
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /conversations/:id/unread — put a triaged thread back in the queue.
 *
 * Local state only: the Cloud API has no un-read call and a sent read receipt
 * cannot be withdrawn.
 */
export const markUnread = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const conv = await conversationService.markUnread(String(req.params.id));
    res.json({ success: true, data: conv });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /conversations/:id/typing — show the customer a "typing…" bubble.
 *
 * Fired from the composer on a throttle, so it is deliberately cheap and
 * deliberately NOT audited: an audit row per keystroke-window would bury the
 * trail that matters under thousands of rows saying nothing happened.
 *
 * Answers `{ sent: false }` rather than an error when the thread has no inbound
 * message to attach the indicator to — the composer must not paint a red toast
 * because a cosmetic signal could not be delivered.
 */
export const sendTyping = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const sent = await conversationService.sendTyping(String(req.params.id));
    res.json({ success: true, data: { sent } });
  } catch (e) {
    next(e);
  }
};

export const assignConversation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const conv = await conversationService.assign(
      String(req.params.id),
      (req.body.assignedTo as string | null) ?? null
    );
    res.json({ success: true, data: conv });
  } catch (e) {
    next(e);
  }
};

export const setConversationStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const conv = await conversationService.setStatus(
      String(req.params.id),
      req.body.status as WaConversationStatus
    );
    res.json({ success: true, data: conv });
  } catch (e) {
    next(e);
  }
};

export const setLabels = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const conv = await conversationService.setLabels(
      String(req.params.id),
      req.body.labels as string[]
    );
    res.json({ success: true, data: conv });
  } catch (e) {
    next(e);
  }
};

export const setSnooze = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const conv = await conversationService.setSnooze(
      String(req.params.id),
      req.body.snoozedUntil ? new Date(req.body.snoozedUntil) : null
    );
    res.json({ success: true, data: conv });
  } catch (e) {
    next(e);
  }
};

export const setBotPause = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const conv = await conversationService.setBotPause(
      String(req.params.id),
      req.body.botPausedUntil ? new Date(req.body.botPausedUntil) : null
    );
    res.json({ success: true, data: conv });
  } catch (e) {
    next(e);
  }
};

/**
 * Mute/unmute a conversation's notifications until a time.
 *
 * `mutedUntil: null` unmutes. Deliberately a time rather than a boolean: a mute
 * that never expires is one an operator sets in a busy hour and then forgets,
 * and the thread goes quiet for good.
 */
export const muteConversation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const raw = req.body.mutedUntil;
    const until = raw ? new Date(String(raw)) : null;
    if (until && Number.isNaN(until.getTime())) {
      throw new AppError('Invalid mute expiry', 400, 'WA_INVALID_MUTE');
    }
    const conv = await conversationService.setMute(String(req.params.id), until);
    res.json({ success: true, data: conv });
  } catch (e) {
    next(e);
  }
};

/** Star/unstar a single message for later reference. */
export const starMessage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const msg = await conversationService.setMessageStar(
      String(req.params.messageId),
      req.body.starred !== false
    );
    res.json({ success: true, data: msg });
  } catch (e) {
    next(e);
  }
};

/** Pin/unpin a conversation to the top of the inbox. */
export const pinConversation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Default to pinning; pass { pinned: false } to unpin — the same shape the
    // archive toggle beside it uses.
    const conv = await conversationService.setPin(String(req.params.id), req.body.pinned !== false);
    res.json({ success: true, data: conv });
  } catch (e) {
    next(e);
  }
};

export const archiveConversation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Default to archiving; pass { archived: false } to restore.
    const conv = await conversationService.archive(
      String(req.params.id),
      req.body.archived !== false
    );
    res.json({ success: true, data: conv });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /conversations/:id/identity-ack — dismiss the identity-change banner.
 *
 * Audited on the route: it records that a human looked at a security signal and
 * decided the person on the other end is still the right one.
 */
export const acknowledgeIdentityChange = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const conv = await conversationService.acknowledgeIdentityChange(String(req.params.id));
    res.json({ success: true, data: conv });
  } catch (e) {
    next(e);
  }
};

export const requestCsat = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const conv = await conversationService.requestCsat(String(req.params.id));
    res.json({ success: true, data: conv });
  } catch (e) {
    next(e);
  }
};

/**
 * Blank line between the message table and the notes table, so a spreadsheet
 * shows them as two blocks instead of one table with a second header row in the
 * middle of it.
 */
const NOTES_SEPARATOR = '\n\n';

/**
 * Export a conversation's transcript as a CSV download.
 *
 * Five columns used to be the whole export — timestamp, direction, type, from,
 * text — so every media message appeared as a row with an empty text cell and
 * nothing identifying what had been sent, and a message that FAILED was
 * indistinguishable from one the customer read. The delivery state and the media
 * reference are exactly what an export is for, so they are columns now.
 *
 * `?includeDeleted=true` re-adds messages the operator soft-deleted (they are
 * excluded by default, like everywhere else in the inbox), and `?notes=true`
 * appends the internal agent notes as a second section. Both are off by default
 * because the ordinary use of this file is handing it to somebody outside.
 */
export const exportTranscript = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const includeDeleted = req.query.includeDeleted === 'true';
    const includeNotes = req.query.notes === 'true';
    const conv = await conversationService.getTranscriptHeader(String(req.params.id));
    if (!conv) throw new AppError('Conversation not found', 404, 'WA_CONVERSATION_NOT_FOUND');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="wa-transcript-${conv.id}.csv"`);
    // Written page by page rather than joined into one string first: a thread is
    // a contact's whole history, and buffering it cost heap proportional to that
    // history before the browser saw a single byte.
    res.write(
      toCsv(
        [
          'createdAt',
          'direction',
          'type',
          'from',
          'text',
          'status',
          'errorCode',
          'error',
          'errorDetails',
          'mediaId',
          'mediaUrl',
          'deletedAt',
        ],
        []
      )
    );
    for await (const page of conversationService.streamTranscriptMessages(conv.id, {
      includeDeleted,
    })) {
      res.write(
        '\n' +
          csvRows(
            page.map((m) => [
              m.createdAt.toISOString(),
              m.direction,
              m.type,
              m.direction === 'INBOUND' ? conv.contact.phone : 'agent',
              m.text ?? '',
              m.status,
              m.errorCode ?? '',
              m.errorTitle ?? '',
              // The specific reason, not just the code's generic headline —
              // an export used to reconcile a failed batch needs to separate
              // "this number cannot receive it" from "the window had closed".
              m.errorDetails ?? '',
              m.mediaId ?? '',
              // The archived copy in our own storage; Meta's media ids expire in
              // ~30 days, so the id alone is not a durable reference to the
              // attachment.
              m.mediaUrl ?? '',
              m.deletedAt ? m.deletedAt.toISOString() : '',
            ])
          )
      );
    }
    if (includeNotes) {
      // Pulled through the notes service, not the transcript query: notes are
      // encrypted at rest and that service owns the decryption.
      res.write(NOTES_SEPARATOR + toCsv(['noteCreatedAt', 'author', 'note'], []));
      for await (const notes of noteService.streamNotes(conv.id)) {
        res.write(
          '\n' + csvRows(notes.map((n) => [n.createdAt.toISOString(), n.authorId ?? '', n.body]))
        );
      }
    }
    res.end();
  } catch (e) {
    // Once the first chunk is out the status line is already committed, so the
    // error handler cannot turn this into a 500 — aborting the connection is what
    // makes the browser report a failed download instead of saving a file that
    // looks complete and silently stops mid-history.
    if (res.headersSent) {
      logger.error(`WhatsApp transcript export failed mid-stream: ${(e as Error).message}`);
      res.destroy();
      return;
    }
    next(e);
  }
};

export const getChannels = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // The pinned Graph version rides along with each channel. It is a
    // deployment-wide setting rather than a per-number one, but this is where an
    // operator looks when a number misbehaves — and until now the version every
    // call to it goes out on appeared nowhere in the console at all, so a pin
    // that predates the feature being tried looked like the feature being broken.
    const version = graphVersion();
    const channels = await listChannels();
    res.json({
      success: true,
      data: channels.map((channel) => ({ ...channel, graphVersion: version })),
    });
  } catch (e) {
    next(e);
  }
};

export const getAgents = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.json({ success: true, data: await conversationService.listAssignableAgents() });
  } catch (e) {
    next(e);
  }
};

export const getMedia = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // `?variant=thumb` serves the small WebP derivative when one exists, and the
    // original when it does not — so the inbox and the gallery can ask for it
    // unconditionally without knowing which messages were archived before
    // thumbnails existed.
    await streamMedia(String(req.params.id), res, {
      variant: req.query.variant === 'thumb' ? 'thumb' : 'original',
    });
  } catch (e) {
    next(e);
  }
};

/** Inbound media whose archival gave up — the operator-facing dead-letter list. */
export const listFailedMedia = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    res.json({ success: true, data: { items: await listFailedMediaArchives(limit) } });
  } catch (e) {
    next(e);
  }
};

/** Put one failed archive back on the queue (only useful inside Meta's 30-day window). */
export const retryFailedMedia = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.json({ success: true, data: await retryMediaArchive(String(req.params.messageId)) });
  } catch (e) {
    next(e);
  }
};

export const getAnalytics = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // No `days` = lifetime, which is what every existing caller gets. The
    // analytics dashboard passes one so its headline stats match the window the
    // charts below them are drawn over.
    const raw = req.query.days;
    const parsed = raw === undefined || raw === '' ? NaN : parseInt(String(raw), 10);
    const days = Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    // `?channelId` narrows every message figure to one number. Omitted means all
    // of them, which is what a single-number deployment always sees.
    const channelId = (req.query.channelId as string) || undefined;
    res.json({ success: true, data: await getOverview(days, channelId) });
  } catch (e) {
    next(e);
  }
};

/**
 * Data rows only, no header — what the streamed exports append per page after
 * writing the header line once.
 */
function csvRows(rows: unknown[][]): string {
  return rows.map((r) => r.map(safeCsvCell).join(',')).join('\n');
}

function toCsv(headers: string[], rows: unknown[][]): string {
  // safeCsvCell guards against both CSV-structure breakage and formula injection.
  return [
    headers.map(safeCsvCell).join(','),
    ...rows.map((r) => r.map(safeCsvCell).join(',')),
  ].join('\n');
}
function triBoolQ(v: unknown): boolean | undefined {
  if (v === 'true') return true;
  if (v === 'false') return false;
  return undefined;
}

export const listCannedReplies = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.json({ success: true, data: await cannedService.listCannedReplies() });
  } catch (e) {
    next(e);
  }
};

export const createCannedReply = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const r = await cannedService.createCannedReply({
      title: req.body.title,
      text: req.body.text,
      createdBy: req.user!.id,
    });
    res.status(201).json({ success: true, data: r });
  } catch (e) {
    next(e);
  }
};

export const updateCannedReply = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const r = await cannedService.updateCannedReply(String(req.params.id), {
      title: req.body.title,
      text: req.body.text,
    });
    res.json({ success: true, data: r });
  } catch (e) {
    next(e);
  }
};

export const deleteCannedReply = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await cannedService.deleteCannedReply(String(req.params.id));
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
};

// ── FAQ menu management ──
export const listFaqs = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await faqService.listFaqs() });
  } catch (e) {
    next(e);
  }
};

export const createFaq = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const r = await faqService.createFaq({
      question: req.body.question,
      answer: req.body.answer,
      order: typeof req.body.order === 'number' ? req.body.order : undefined,
      isActive: req.body.isActive,
      createdBy: req.user?.id ?? null,
    });
    res.status(201).json({ success: true, data: r });
  } catch (e) {
    next(e);
  }
};

export const updateFaq = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const r = await faqService.updateFaq(String(req.params.id), {
      question: req.body.question,
      answer: req.body.answer,
      order: req.body.order,
      isActive: req.body.isActive,
    });
    res.json({ success: true, data: r });
  } catch (e) {
    next(e);
  }
};

export const deleteFaq = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await faqService.deleteFaq(String(req.params.id));
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
};

export const reorderFaqs = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const ids = Array.isArray(req.body.ids) ? (req.body.ids as string[]) : [];
    res.json({ success: true, data: await faqService.reorderFaqs(ids) });
  } catch (e) {
    next(e);
  }
};

export const sendInteractive = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // req.body carries `kind` (button | list | cta_url | flow) and its params.
    const m = await sendInteractiveMessage(String(req.params.id), req.user!.id, {
      ...req.body,
      contextWamid: replyWamidFrom(req.body),
    });
    res.status(201).json({ success: true, data: m });
  } catch (e) {
    next(e);
  }
};

/** React to a prior message (emoji '' removes the reaction). */
export const sendReaction = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const m = await sendReactionMessage(String(req.params.id), req.user!.id, {
      wamid: String(req.body.wamid ?? ''),
      emoji: String(req.body.emoji ?? ''),
    });
    res.status(201).json({ success: true, data: m });
  } catch (e) {
    next(e);
  }
};

/** Send a location pin into a conversation. */
export const sendLocation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const m = await sendLocationMessage(String(req.params.id), req.user!.id, {
      latitude: Number(req.body.latitude),
      longitude: Number(req.body.longitude),
      name: (req.body.name as string) || undefined,
      address: (req.body.address as string) || undefined,
      contextWamid: replyWamidFrom(req.body),
    });
    res.status(201).json({ success: true, data: m });
  } catch (e) {
    next(e);
  }
};

/** Send one or more contact cards (Meta `contacts` array) into a conversation. */
export const sendContacts = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const m = await sendContactsMessage(String(req.params.id), req.user!.id, {
      contacts: req.body.contacts,
      contextWamid: replyWamidFrom(req.body),
    });
    res.status(201).json({ success: true, data: m });
  } catch (e) {
    next(e);
  }
};

/**
 * Sync one channel's health, or the default one when no id is given.
 *
 * The id is a query param rather than a path segment so the existing
 * `POST /channels/sync` (which the cron and the settings button call) keeps
 * working unchanged.
 */
export const syncChannel = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const channelId = (req.query.channelId as string) || undefined;
    res.json({ success: true, data: await syncChannelHealth(channelId) });
  } catch (e) {
    next(e);
  }
};

/**
 * The customer-facing profile for a connected number — about, description,
 * address, email, websites, category and photo.
 *
 * `channelId` is optional everywhere below: with one connected number (the
 * normal case) the default channel is used, so the settings page does not have
 * to pass an id it has no reason to know.
 */
export const getBusinessProfileHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const channelId = (req.query.channelId as string) || undefined;
    res.json({ success: true, data: await getBusinessProfile(channelId) });
  } catch (e) {
    next(e);
  }
};

export const updateBusinessProfileHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const channelId = (req.query.channelId as string) || undefined;
    const profile = await updateBusinessProfile(channelId, {
      about: req.body.about,
      address: req.body.address,
      description: req.body.description,
      email: req.body.email,
      websites: req.body.websites,
      vertical: req.body.vertical,
      profilePictureHandle: req.body.profilePictureHandle,
    });
    res.json({ success: true, data: profile });
  } catch (e) {
    next(e);
  }
};

/**
 * Upload a profile photo and return Meta's resumable-upload handle.
 *
 * The handle is what `POST whatsapp_business_profile` accepts; the bytes go up
 * through the same session flow the template media-header sample uses.
 */
/**
 * Stream the business profile picture through this origin.
 *
 * Meta returns a CDN URL, but the console's CSP is `img-src 'self' data: blob:`
 * — no remote image host at all, the same rule that keeps archived customer
 * media off a publicly readable bucket. An <img> pointed straight at that CDN
 * was blocked before the request left the browser, so the operator saw a broken
 * icon with nothing explaining it. Proxying keeps the rule intact, and the CDN
 * link — short-lived and signed — never has to reach the page.
 */
export const getProfilePhoto = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const profile = await getBusinessProfile();
    const url = profile?.profilePictureUrl;
    if (!url) throw new AppError('No profile photo set', 404, 'WA_PROFILE_PHOTO_NOT_SET');

    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const upstream = await fetch(url);
    if (!upstream.ok) {
      throw new AppError(
        `Could not fetch the profile photo (${upstream.status})`,
        502,
        'WA_PROFILE_PHOTO_FETCH_FAILED'
      );
    }

    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'image/jpeg');
    // Brief cache only: the photo changes rarely, but a stale one straight after
    // an upload reads as "the upload failed", and the upstream link expires.
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    next(error);
  }
};

export const uploadProfilePhoto = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const file = req.file;
    if (!file) throw new AppError('A file is required', 400, 'WA_MEDIA_REQUIRED');
    if (!file.mimetype.startsWith('image/')) {
      throw new AppError('The profile photo must be an image', 400, 'WA_MEDIA_TYPE');
    }
    const handle = await uploadHeaderSampleHandle(file.buffer, file.mimetype);
    res.json({ success: true, data: { handle } });
  } catch (e) {
    next(e);
  }
};

/** Register the number for Cloud API use with its six-digit two-step PIN. */
export const registerNumber = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const channelId = (req.query.channelId as string) || undefined;
    res.json({ success: true, data: await registerPhoneNumber(channelId, String(req.body.pin)) });
  } catch (e) {
    next(e);
  }
};

/** Rotate the two-step PIN on a number that is already registered. */
export const updateTwoStepPin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const channelId = (req.query.channelId as string) || undefined;
    res.json({ success: true, data: await setTwoStepPin(channelId, String(req.body.pin)) });
  } catch (e) {
    next(e);
  }
};

/** Take the number off the Cloud API (e.g. moving it to another platform). */
export const deregisterNumber = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const channelId = (req.query.channelId as string) || undefined;
    res.json({ success: true, data: await deregisterPhoneNumber(channelId) });
  } catch (e) {
    next(e);
  }
};

/**
 * Meta's native conversational components for the number — the welcome-message
 * webhook, the ice breakers on an empty thread and the composer's command list.
 *
 * Read straight from Meta rather than mirrored locally: this is the only place
 * they live, and a stale local copy would tell the operator the customer is
 * being offered prompts that were deleted in Business Manager months ago.
 */
export const getConversationalAutomationHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const channelId = (req.query.channelId as string) || undefined;
    res.json({ success: true, data: await getConversationalAutomation(channelId) });
  } catch (e) {
    next(e);
  }
};

export const updateConversationalAutomationHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const channelId = (req.query.channelId as string) || undefined;
    const data = await updateConversationalAutomation(channelId, {
      enableWelcomeMessage: req.body.enableWelcomeMessage,
      prompts: req.body.prompts,
      commands: req.body.commands,
    });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

/** Cart / catalog visibility, and the catalog product messages are sent from. */
export const getCommerce = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const channelId = (req.query.channelId as string) || undefined;
    res.json({ success: true, data: await getCommerceSettings(channelId) });
  } catch (e) {
    next(e);
  }
};

export const updateCommerce = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const channelId = (req.query.channelId as string) || undefined;
    const settings = await updateCommerceSettings(channelId, {
      isCartEnabled: req.body.isCartEnabled,
      isCatalogVisible: req.body.isCatalogVisible,
      catalogId: req.body.catalogId,
    });
    res.json({ success: true, data: settings });
  } catch (e) {
    next(e);
  }
};

/** Connect another WhatsApp business number, without a redeploy. */
export const createChannelHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const channel = await createChannel({
      phoneNumberId: req.body.phoneNumberId,
      wabaId: req.body.wabaId,
      displayPhone: req.body.displayPhone,
      displayName: req.body.displayName,
      accessToken: req.body.accessToken,
      isDefault: req.body.isDefault,
    });
    res.status(201).json({ success: true, data: channel });
  } catch (e) {
    next(e);
  }
};

/**
 * Edit a channel: identifiers, or the token itself.
 *
 * `isActive` is handled here too rather than on a route of its own — it is a
 * field of the row like any other from the operator's point of view — but the
 * service refuses to deactivate the default number.
 */
export const updateChannelHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = String(req.params.id);
    if (req.body.isActive !== undefined) await setChannelActive(id, req.body.isActive);
    const channel = await updateChannel(id, {
      wabaId: req.body.wabaId,
      displayPhone: req.body.displayPhone,
      displayName: req.body.displayName,
      accessToken: req.body.accessToken,
    });
    res.json({ success: true, data: channel });
  } catch (e) {
    next(e);
  }
};

/** Make this the number outbound goes out from. */
export const setDefaultChannelHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.json({ success: true, data: await setDefaultChannel(String(req.params.id)) });
  } catch (e) {
    next(e);
  }
};

/**
 * Connection test for one channel.
 *
 * Answers 200 with `ok: false` on a credential failure rather than throwing:
 * "your token has expired" is the result of the test, not an error in running
 * it, and it used to surface as a generic red toast from the health sync with
 * nothing naming the credential.
 */
export const testChannelHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.json({ success: true, data: await testChannel(String(req.params.id)) });
  } catch (e) {
    next(e);
  }
};

/**
 * The `source` field out of a decrypted consentEvidence blob, if it has one.
 *
 * Writers store shapes like `{ source: 'ctwa', referral, at }` and
 * `{ source: 'import', at, optIn }`; anything older or hand-written may have no
 * source at all, which reads as blank rather than as a crash in the export.
 */
function consentSourceOf(evidence: unknown): string {
  if (evidence && typeof evidence === 'object' && !Array.isArray(evidence)) {
    const source = (evidence as { source?: unknown }).source;
    if (typeof source === 'string') return source;
  }
  return '';
}

/** Columns of the contacts CSV export. */
const CONTACT_EXPORT_COLUMNS = [
  'phone',
  'name',
  'optInStatus',
  'optInAt',
  'optInSource',
  'optOutAt',
  'optOutSource',
  'consentSource',
  'suppressed',
  'tags',
  'blocked',
  'createdAt',
] as const;

/**
 * Wait for the response socket to drain.
 *
 * Without this the export writes every page as fast as Postgres returns it and
 * Node buffers whatever the client has not read yet, which puts the whole file
 * back in memory for any operator on a slow connection — the very thing
 * streaming is here to avoid. Also settles when the client goes away, so a
 * cancelled download cannot leave this awaiting a 'drain' that will never fire.
 */
function waitForDrain(res: Response): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      res.off('drain', done);
      res.off('close', done);
      res.off('error', done);
      resolve();
    };
    res.once('drain', done);
    res.once('close', done);
    res.once('error', done);
  });
}

export const exportContacts = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { optInStatus, tag, tags, blocked, suppressed, q, ids, segmentId } = req.query;
  // Selected-rows export: ?ids=a,b,c exports exactly those (overrides filters).
  const idList =
    typeof ids === 'string' && ids.trim()
      ? ids
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

  const pages = streamContactsForExport({
    optInStatus: (optInStatus as WaOptInStatus) || undefined,
    tag: (tag as string) || undefined,
    // Same multi-tag filter the list uses, so "export what I am looking at"
    // exports what the operator is actually looking at.
    tags: tagListQ(tags),
    // Same applied-segment resolution as the list, so "export what I am
    // looking at" cannot export a wider set than the page displayed.
    segmentId: (segmentId as string) || undefined,
    blocked: triBoolQ(blocked),
    suppressed: triBoolQ(suppressed),
    q: (q as string) || undefined,
    ids: idList,
  });

  // The first page is pulled BEFORE any header is written. The generator body —
  // including the saved-segment lookup, which throws WA_SEGMENT_NOT_FOUND for a
  // segment deleted mid-session — does not run until the first `next()`, and
  // once the header row is on the wire the status code is settled: the operator
  // would get a 200 with an empty CSV reading as "nobody matches" instead of an
  // error.
  let page: Awaited<ReturnType<typeof pages.next>>;
  try {
    page = await pages.next();
  } catch (e) {
    next(e);
    return;
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="wa-contacts.csv"');
  // Streamed page by page rather than joined into one string. The export used to
  // stop dead at 50,000 rows with no header, no warning and no count to reveal
  // it, so an operator reconciling consent against the file silently lost
  // everyone past the cap — on the one artefact a DPDP grievance or a Meta
  // quality review is answered with.
  let clientGone = false;
  res.once('close', () => {
    clientGone = true;
  });
  // safeCsvCell guards against both CSV-structure breakage and formula injection.
  res.write(`${CONTACT_EXPORT_COLUMNS.map(safeCsvCell).join(',')}\n`);
  try {
    for (; !page.done; page = await pages.next()) {
      // The operator cancelled the download; stop paging the table for a file
      // nobody is reading any more.
      if (clientGone) return;
      const chunk = page.value
        .map((c) =>
          [
            c.phone,
            c.name,
            c.optInStatus,
            c.optInAt?.toISOString() ?? '',
            c.optInSource ?? '',
            c.optOutAt?.toISOString() ?? '',
            c.optOutSource ?? '',
            // Consent columns, not just the status.
            //
            // The export carried optInStatus and nothing about WHERE that status
            // came from, so the one artefact handed to a review said "opted in"
            // with no date, no route and no evidence behind it. `consentSource`
            // is the provenance flattened out of the (encrypted, decrypted on
            // read) evidence blob — the blob itself stays out of the CSV because
            // it can carry an IP and a full ad referral payload.
            consentSourceOf(c.consentEvidence),
            // Suppression is invisible in every other consent column: a
            // suppressed row still reads OPTED IN while every send to it comes
            // back refused with 131050.
            c.suppressedAt ? 'true' : 'false',
            c.tags.join(';'),
            c.isBlocked,
            c.createdAt.toISOString(),
          ]
            .map(safeCsvCell)
            .join(',')
        )
        .join('\n');
      if (!res.write(`${chunk}\n`)) await waitForDrain(res);
    }
    res.end();
  } catch (e) {
    // Rows are already on the wire, so the JSON error envelope can no longer be
    // sent and `next(e)` would throw inside the error handler. Destroying the
    // response truncates the chunked body, which makes the download FAIL for the
    // client instead of landing as a short file that looks complete.
    logger.error('WhatsApp contact export failed mid-stream', e);
    res.destroy(e as Error);
  }
};

/** Start a brand-new conversation to any number by sending an approved template. */
export const startConversation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await startConversationWithTemplate({
      phone: String(req.body.phone),
      actorUserId: req.user!.id,
      // Which of our connected numbers to open the thread from. Absent, the
      // default is used, which is what a single-number install always wants.
      channelId: req.body.channelId ? String(req.body.channelId) : undefined,
      templateId: String(req.body.templateId),
      bodyParams: req.body.bodyParams,
      bodyNamedParams: req.body.bodyNamedParams,
      headerText: req.body.headerText,
      headerImageId: req.body.headerImageId,
      headerMediaUrl: req.body.headerMediaUrl,
      headerMediaType: req.body.headerMediaType,
      // DOCUMENT header: the name the attachment shows on the handset. Held by
      // the composer for its own chip and thrown away, so the customer received
      // an invoice named after its media id.
      headerMediaFilename: req.body.headerMediaFilename,
      buttonUrlParam: req.body.buttonUrlParam,
      // A template may carry TWO dynamic URL buttons; the scalar above fills only
      // the first, and Meta refuses the whole message for the one left unfilled.
      buttonUrlParams: req.body.buttonUrlParams,
      // The caller's own Flow correlation token. The reply endpoint has always
      // forwarded it; this one did not, so the same integration got its id kept
      // on a reply and quietly swapped for a minted one when the template opened
      // a new conversation.
      flowToken: req.body.flowToken,
      // Everything `templateSendBody` accepts, forwarded. These four used to be
      // dropped right here: zod parsed them, the composer sent them and the
      // builder knew how to emit them, but the controller copied a fixed subset
      // of the body — so an OTP, coupon, offer-expiry or location template was
      // sent without its mandatory parameter and Meta rejected it with #131008.
      otpCode: req.body.otpCode,
      couponCode: req.body.couponCode,
      ltoExpirationMs: req.body.ltoExpirationMs,
      headerLocation: req.body.headerLocation,
      // Flow entry-screen data and the catalogue product parameters. The flow
      // TOKEN is minted per send by the service, not taken from the client.
      flowActionData: req.body.flowActionData,
      catalogThumbnailProductId: req.body.catalogThumbnailProductId,
      productSections: req.body.productSections,
      productRetailerId: req.body.productRetailerId,
      // A carousel's media and card text ride here, one entry per card. Dropping
      // them would repeat the same mistake for the newest component type.
      carouselCards: req.body.carouselCards,
    });
    res.status(201).json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

/** Send an approved template into an existing conversation (works outside the 24h window). */
export const sendTemplate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const message = await sendTemplateToConversation(String(req.params.id), req.user!.id, {
      templateId: String(req.body.templateId),
      bodyParams: req.body.bodyParams,
      bodyNamedParams: req.body.bodyNamedParams,
      headerText: req.body.headerText,
      headerImageId: req.body.headerImageId,
      headerMediaUrl: req.body.headerMediaUrl,
      headerMediaType: req.body.headerMediaType,
      headerMediaFilename: req.body.headerMediaFilename,
      buttonUrlParam: req.body.buttonUrlParam,
      buttonUrlParams: req.body.buttonUrlParams,
      otpCode: req.body.otpCode,
      couponCode: req.body.couponCode,
      ltoExpirationMs: req.body.ltoExpirationMs,
      headerLocation: req.body.headerLocation,
      // A caller may name its own flow token; left unset the service mints one.
      flowToken: req.body.flowToken,
      flowActionData: req.body.flowActionData,
      catalogThumbnailProductId: req.body.catalogThumbnailProductId,
      productSections: req.body.productSections,
      productRetailerId: req.body.productRetailerId,
      carouselCards: req.body.carouselCards,
    });
    res.status(201).json({ success: true, data: message });
  } catch (e) {
    next(e);
  }
};
