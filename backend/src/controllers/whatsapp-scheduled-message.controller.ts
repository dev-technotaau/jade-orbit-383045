import { randomUUID } from 'crypto';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';
import type { WaScheduledMessageStatus } from '@prisma/client';
import {
  scheduleMessage,
  listScheduled,
  listAllScheduled,
  cancelScheduled,
  discardScheduledMedia,
  SCHEDULED_MEDIA_PREFIX,
} from '../services/whatsapp-scheduled-message.service';
// The multipart/staged-key duality is exactly the one an immediate media send
// already solves, so the resolver is shared rather than reimplemented — a second
// copy would be a second place for the staging-key guard to drift.
import { resolveOutboundMedia } from './whatsapp-inbox.controller';
import { putBufferToR2, deleteFileFromR2 } from '../services/storage.service';
import { r2Client } from '../config/r2';
import { scanFile } from '../utils/file-scan';
import {
  MAX_MEDIA_BYTES,
  byteLabel,
  mediaKindForMime,
  metaLimitFor,
} from '../utils/wa-media-limits';
import { AppError } from '../middleware/error';

export const schedule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const kind = String(req.body.kind ?? 'text');
    // An attachment is archived into OUR bucket now and uploaded to Meta at
    // dispatch time; see the note on SCHEDULED_MEDIA_PREFIX for why a Meta media
    // id taken here would expire out from under a long-dated send.
    let staged: { mediaKey: string; mediaMime: string; mediaFilename: string } | null = null;
    if (kind === 'media') {
      if (!r2Client) {
        throw new AppError(
          'Scheduling a file needs R2 storage, which is not configured on this deployment',
          503,
          'WA_SCHEDULED_MEDIA_UNAVAILABLE'
        );
      }
      const { buffer, mime, filename, stagedKey } = await resolveOutboundMedia(req);
      const scan = scanFile(buffer, filename, mime, MAX_MEDIA_BYTES);
      if (!scan.safe) {
        throw new AppError(
          scan.reason || 'File rejected by security scan',
          400,
          'WA_FILE_REJECTED'
        );
      }
      // Checked now rather than at dispatch: a file Meta will refuse should be
      // refused while the operator is still looking at the screen, not silently
      // at 9am tomorrow.
      const mediaKind = mediaKindForMime(mime, buffer.length);
      const limit = metaLimitFor(mediaKind);
      if (buffer.length > limit) {
        throw new AppError(
          `${mediaKind} files must be under ${byteLabel(limit)} ` +
            `(this one is ${byteLabel(buffer.length)})`,
          400,
          'WA_FILE_TOO_LARGE'
        );
      }
      const ext = path
        .extname(filename)
        .replace(/[^A-Za-z0-9.]/g, '')
        .slice(0, 12);
      const { key } = await putBufferToR2(
        buffer,
        `${SCHEDULED_MEDIA_PREFIX}${randomUUID()}${ext}`,
        mime
      );
      // The browser's 15-minute staging object has served its purpose; the
      // durable copy above is what the dispatcher will read.
      if (stagedKey) void deleteFileFromR2(stagedKey).catch(() => {});
      staged = { mediaKey: key, mediaMime: mime, mediaFilename: filename };
    }

    try {
      const data = await scheduleMessage({
        ...req.body,
        ...(staged ?? {}),
        kind: kind as 'text' | 'template' | 'media',
        conversationId: String(req.params.id),
        sendAt: new Date(req.body.sendAt),
        createdBy: req.user!.id,
      });
      res.status(201).json({ success: true, data });
    } catch (e) {
      // The row is what makes the object reachable. A validation failure after
      // the upload (a closed 24h window, a bad sendAt) would otherwise leave the
      // customer's file in a bucket nothing ever looks at again.
      await discardScheduledMedia(staged?.mediaKey);
      throw e;
    }
  } catch (e) {
    next(e);
  }
};

export const list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await listScheduled(String(req.params.id)) });
  } catch (e) {
    next(e);
  }
};

/**
 * `GET /whatsapp/scheduled` — every scheduled message, across conversations.
 *
 * The conversation-scoped list above only ever answered "what is pending on THIS
 * thread"; nothing answered "what is about to go out at all".
 */
export const listAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, from, to, page, limit } = req.query;
    const data = await listAllScheduled({
      status: (status as WaScheduledMessageStatus) || undefined,
      from: from ? new Date(String(from)) : undefined,
      to: to ? new Date(String(to)) : undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

export const cancel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Scoped to the conversation in the URL: a msgId from another thread 404s
    // rather than being cancelled under this conversation's audit entry.
    const data = await cancelScheduled(String(req.params.msgId), String(req.params.id));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
};
