import crypto from 'crypto';
import { AppError } from '../middleware/error';
import logger from '../config/logger';
import { downloadFileFromR2, putBufferToR2 } from './storage.service';
import type { RawEmailAttachment } from './email.service';

/**
 * Outbound-attachment staging for the campaign + reply-inbox send paths (the
 * one-on-one webmail client has its own copy of this in email-mailbox.service).
 *
 * Files are uploaded once to R2 and referenced by `key`; the send path re-loads
 * them into memory and hands them to nodemailer. Keys persist in R2 so a
 * scheduled reply or a not-yet-launched campaign can attach them later.
 */

/** A staged-attachment reference stored on a campaign / scheduled reply / message. */
export interface OutboundAttachmentRef {
  key: string;
  filename: string;
  mime?: string;
  size?: number;
}

/** Per-file + total limits (deliverability + SMTP message-size guard). */
export const MAX_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15 MB per file
export const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB per message

/** Stage an uploaded file to R2 and return its reference. */
export async function stageOutboundAttachment(
  buffer: Buffer,
  originalname: string,
  mimetype: string
): Promise<OutboundAttachmentRef> {
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new AppError(
      `"${originalname}" exceeds the ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB limit`,
      400,
      'EMAIL_ATTACHMENT_TOO_LARGE'
    );
  }
  const safeName = originalname.replace(/[^\w.\-() ]/g, '_').slice(0, 200) || 'attachment';
  const mime = mimetype || 'application/octet-stream';
  const key = `email-outbound/${crypto.randomUUID()}/${safeName}`;
  await putBufferToR2(buffer, key, mime);
  return { key, filename: originalname, mime, size: buffer.length };
}

/** Load staged attachments from R2 into nodemailer-ready buffers. */
export async function resolveOutboundAttachments(
  refs?: OutboundAttachmentRef[] | null
): Promise<RawEmailAttachment[]> {
  if (!refs?.length) return [];
  const out: RawEmailAttachment[] = [];
  for (const a of refs) {
    try {
      const content = await downloadFileFromR2(a.key);
      out.push({ filename: a.filename, content, contentType: a.mime });
    } catch (err) {
      logger.warn(`Failed to load outbound attachment ${a.key}: ${(err as Error).message}`);
      throw new AppError(
        `Attachment "${a.filename}" could not be loaded`,
        400,
        'EMAIL_ATTACHMENT_LOAD_FAILED'
      );
    }
  }
  return out;
}

/** Coerce arbitrary JSON (a stored `attachments` column) into typed refs. */
export function toAttachmentRefs(value: unknown): OutboundAttachmentRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
    .filter((v) => typeof v.key === 'string' && typeof v.filename === 'string')
    .map((v) => ({
      key: v.key as string,
      filename: v.filename as string,
      mime: typeof v.mime === 'string' ? v.mime : undefined,
      size: typeof v.size === 'number' ? v.size : undefined,
    }))
    .slice(0, MAX_ATTACHMENTS);
}

/** Display metadata to persist on EmailMessage.attachments (no R2 key needed for reads). */
export function attachmentMetaForStore(
  refs: OutboundAttachmentRef[]
): Array<{ filename: string; mime?: string; size?: number }> {
  return refs.map((a) => ({ filename: a.filename, mime: a.mime, size: a.size }));
}
