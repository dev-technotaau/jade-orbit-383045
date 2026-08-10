import type { Request, Response, NextFunction } from 'express';
import * as conversationService from '../services/whatsapp-conversation.service';
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
import { uploadMediaToMeta } from '../services/whatsapp.service';
import { listChannels, syncChannelHealth } from '../services/whatsapp-channel.service';
import { streamMedia } from '../services/whatsapp-media.service';
import { getOverview } from '../services/whatsapp-analytics.service';
import * as cannedService from '../services/whatsapp-canned-reply.service';
import * as faqService from '../services/whatsapp-faq.service';
import { getContactsForExport } from '../services/whatsapp-contact.service';
import { scanFile } from '../utils/file-scan';
import { safeCsvCell } from '../utils/whatsapp-csv';
import { AppError } from '../middleware/error';
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
      filters,
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

export const getConversations = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { status, assignedTo, q, unread, searchMessages, includeArchived, page, limit } =
      req.query;
    const result = await conversationService.list({
      status: (status as WaConversationStatus) || undefined,
      assignedTo: (assignedTo as string) || undefined,
      q: (q as string) || undefined,
      unreadOnly: unread === 'true',
      searchMessages: searchMessages === 'true',
      includeArchived: includeArchived === 'true',
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
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
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    });
    res.json({ success: true, data: { items: messages } });
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
    });
    res.status(201).json({ success: true, data: message });
  } catch (e) {
    next(e);
  }
};

/**
 * Per-kind size ceilings Meta enforces on the Cloud API. Exceeding one is
 * rejected at upload with an opaque error, so check before spending the round
 * trip.
 */
const META_MEDIA_LIMITS: Record<'image' | 'video' | 'audio' | 'document' | 'sticker', number> = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  sticker: 500 * 1024,
  document: 100 * 1024 * 1024,
};

function mediaKindForMime(mime: string): 'image' | 'video' | 'audio' | 'document' {
  // Only mp4/3gpp ride as native WhatsApp video; every other video container
  // (mkv/webm/mov/…) falls back to a downloadable document so it still sends,
  // just like the WhatsApp app does.
  if (mime === 'video/mp4' || mime === 'video/3gpp') return 'video';
  // The Cloud API accepts ONLY jpeg and png as an `image` message. This branch
  // used to take every `image/*`, so a GIF, WEBP or BMP — all completely
  // ordinary things to attach — was sent as an image, rejected by Meta, and
  // surfaced to the operator as a raw 500 with no message row. WEBP is a
  // sticker to Meta, not an image; the rest ride as documents, which is exactly
  // what the doc-comment below already promised.
  if (mime === 'image/jpeg' || mime === 'image/png') return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

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

/** Send an uploaded media file into a conversation (image/video/audio/document). */
export const sendMedia = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const file = req.file;
    if (!file) throw new AppError('A file is required', 400, 'WA_MEDIA_REQUIRED');
    // Enforce the per-kind mimetype allowlist before touching the bytes.
    if (!isAllowedWaMime(file.mimetype)) {
      throw new AppError(`File type ${file.mimetype} is not allowed`, 400, 'WA_FILE_REJECTED');
    }
    // Security scan (magic-bytes, dangerous extensions/patterns) — same util the
    // storage service uses. Reject anything flagged before uploading to Meta.
    const scan = scanFile(file.buffer, file.originalname, file.mimetype, 16 * 1024 * 1024);
    if (!scan.safe) {
      throw new AppError(scan.reason || 'File rejected by security scan', 400, 'WA_FILE_REJECTED');
    }
    const kind = mediaKindForMime(file.mimetype);
    // Meta's per-kind ceiling, checked before the upload so the operator gets a
    // clear limit rather than an opaque rejection from the Graph API.
    const limit = META_MEDIA_LIMITS[kind];
    if (file.size > limit) {
      throw new AppError(
        `${kind} files must be under ${Math.round(limit / (1024 * 1024))} MB ` +
          `(this one is ${(file.size / (1024 * 1024)).toFixed(1)} MB)`,
        400,
        'WA_FILE_TOO_LARGE'
      );
    }
    const mediaId = await uploadMediaToMeta(file.buffer, file.mimetype, file.originalname);
    if (!mediaId) {
      throw new AppError(
        'Media upload failed (WhatsApp not configured)',
        502,
        'WA_MEDIA_UPLOAD_FAILED'
      );
    }
    const message = await sendMediaMessage(String(req.params.id), req.user!.id, {
      kind,
      mediaId,
      caption: (req.body.caption as string) || undefined,
      filename: kind === 'document' ? file.originalname : undefined,
      // The voice recorder marks its uploads so they render as voice notes.
      voice: req.body.voice === 'true' && kind === 'audio',
    });
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

/** Export a conversation's full transcript as a CSV download. */
export const exportTranscript = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const conv = await conversationService.getTranscript(String(req.params.id));
    if (!conv) throw new AppError('Conversation not found', 404, 'WA_CONVERSATION_NOT_FOUND');
    const csv = toCsv(
      ['createdAt', 'direction', 'type', 'from', 'text'],
      conv.messages.map((m) => [
        m.createdAt.toISOString(),
        m.direction,
        m.type,
        m.direction === 'INBOUND' ? conv.contact.phone : 'agent',
        m.text ?? '',
      ])
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="wa-transcript-${conv.id}.csv"`);
    res.send(csv);
  } catch (e) {
    next(e);
  }
};

export const getChannels = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.json({ success: true, data: await listChannels() });
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
    await streamMedia(String(req.params.id), res);
  } catch (e) {
    next(e);
  }
};

export const getAnalytics = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.json({ success: true, data: await getOverview() });
  } catch (e) {
    next(e);
  }
};

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
    const m = await sendInteractiveMessage(String(req.params.id), req.user!.id, req.body);
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
    });
    res.status(201).json({ success: true, data: m });
  } catch (e) {
    next(e);
  }
};

export const syncChannel = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.json({ success: true, data: await syncChannelHealth() });
  } catch (e) {
    next(e);
  }
};

export const exportContacts = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { optInStatus, tag, blocked, q, ids } = req.query;
    // Selected-rows export: ?ids=a,b,c exports exactly those (overrides filters).
    const idList =
      typeof ids === 'string' && ids.trim()
        ? ids
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;
    const contacts = await getContactsForExport({
      optInStatus: (optInStatus as WaOptInStatus) || undefined,
      tag: (tag as string) || undefined,
      blocked: triBoolQ(blocked),
      q: (q as string) || undefined,
      ids: idList,
    });
    const csv = toCsv(
      ['phone', 'name', 'optInStatus', 'tags', 'blocked', 'createdAt'],
      contacts.map((c) => [
        c.phone,
        c.name,
        c.optInStatus,
        c.tags.join(';'),
        c.isBlocked,
        c.createdAt.toISOString(),
      ])
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="wa-contacts.csv"');
    res.send(csv);
  } catch (e) {
    next(e);
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
      templateId: String(req.body.templateId),
      bodyParams: req.body.bodyParams,
      bodyNamedParams: req.body.bodyNamedParams,
      headerText: req.body.headerText,
      headerImageId: req.body.headerImageId,
      headerMediaUrl: req.body.headerMediaUrl,
      headerMediaType: req.body.headerMediaType,
      buttonUrlParam: req.body.buttonUrlParam,
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
      buttonUrlParam: req.body.buttonUrlParam,
    });
    res.status(201).json({ success: true, data: message });
  } catch (e) {
    next(e);
  }
};
