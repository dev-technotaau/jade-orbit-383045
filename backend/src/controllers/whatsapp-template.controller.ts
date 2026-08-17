import type { Request, Response, NextFunction } from 'express';
import * as templateService from '../services/whatsapp-template.service';
import { AppError } from '../middleware/error';
import type { WaTemplateCategory, WaTemplateStatus } from '@prisma/client';
import { scanFile } from '../utils/file-scan';
import {
  MAX_MEDIA_BYTES,
  byteLabel,
  isAnimatedWebp,
  mediaKindForMime,
  metaLimitFor,
  type MetaMediaKind,
} from '../utils/wa-media-limits';

export const listTemplates = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { status, category, q, page, limit } = req.query;
    const result = await templateService.listTemplates({
      status: (status as WaTemplateStatus) || undefined,
      category: (category as WaTemplateCategory) || undefined,
      q: (q as string) || undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

export const getTemplate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tpl = await templateService.getTemplate(String(req.params.id));
    if (!tpl) throw new AppError('Template not found', 404, 'WA_TEMPLATE_NOT_FOUND');
    res.json({ success: true, data: tpl });
  } catch (e) {
    next(e);
  }
};

export const createTemplate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tpl = await templateService.createTemplate({
      name: req.body.name,
      language: req.body.language,
      category: req.body.category,
      components: req.body.components,
      variableSample: req.body.variableSample,
      parameterFormat: req.body.parameterFormat,
      messageSendTtlSeconds: req.body.messageSendTtlSeconds,
      createdBy: req.user!.id,
    });
    res.status(201).json({ success: true, data: tpl });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /templates/draft — save a half-finished template locally (status LOCAL).
 *
 * Never touches Meta. Closing the builder used to discard everything, including
 * the uploaded header sample.
 */
export const saveDraft = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tpl = await templateService.saveDraftTemplate({
      name: req.body.name,
      language: req.body.language,
      category: req.body.category,
      components: req.body.components ?? [],
      variableSample: req.body.variableSample,
      createdBy: req.user!.id,
    });
    res.status(201).json({ success: true, data: tpl });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /templates/:id/submit — send a saved draft to Meta for review.
 *
 * The structural rules are applied here rather than at save time: this is the
 * call that spends the template name, which Meta claims permanently.
 */
export const submitDraft = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tpl = await templateService.submitDraftTemplate(String(req.params.id), {
      createdBy: req.user!.id,
    });
    res.json({ success: true, data: tpl });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /templates/library — browse Meta's pre-approved catalogue.
 *
 * A library template is approved instantly, which is the fastest route to a
 * working template on a fresh WABA.
 */
export const listLibrary = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { search, language, category, topic, usecase, limit } = req.query;
    const data = await templateService.listLibraryTemplates({
      search: (search as string) || undefined,
      language: (language as string) || undefined,
      category: (category as string) || undefined,
      topic: (topic as string) || undefined,
      usecase: (usecase as string) || undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

/** POST /templates/library — create a template from a library entry. */
export const createFromLibrary = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tpl = await templateService.createFromLibrary({
      name: req.body.name,
      language: req.body.language,
      category: req.body.category,
      libraryTemplateName: req.body.libraryTemplateName,
      buttonInputs: req.body.buttonInputs,
      createdBy: req.user!.id,
    });
    res.status(201).json({ success: true, data: tpl });
  } catch (e) {
    next(e);
  }
};

/**
 * The media kinds that can be a template header at all.
 *
 * Meta's header formats are TEXT, IMAGE, VIDEO, DOCUMENT and LOCATION — there is
 * no audio header and no sticker header, so those two resolve to a sample that
 * can never be attached to anything. Meta only says so after the whole file has
 * been pushed to the /uploads API, and then with an error the operator can do
 * nothing with.
 */
const HEADER_SAMPLE_KINDS: ReadonlySet<MetaMediaKind> = new Set<MetaMediaKind>([
  'image',
  'video',
  'document',
]);

/**
 * POST /templates/media-handle — stage a header sample at Meta.
 *
 * Runs the same gauntlet as an outbound attachment: the magic-bytes/dangerous-
 * extension scan, then Meta's per-kind size ceiling. This path used to take the
 * buffer straight to Meta with no checks at all, so a file the composer refused
 * — a disguised executable, a 40 MB "image" — was accepted here and forwarded
 * on our WABA's behalf.
 */
export const uploadHeaderSample = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const file = req.file;
    if (!file) throw new AppError('A file is required', 400, 'WA_MEDIA_REQUIRED');
    const mime = file.mimetype || 'application/octet-stream';
    // Scanned at the widest ceiling so the per-kind message below is the one the
    // operator sees, rather than a generic "too large" from the scanner.
    const scan = scanFile(file.buffer, file.originalname, mime, MAX_MEDIA_BYTES);
    if (!scan.safe) {
      throw new AppError(scan.reason || 'File rejected by security scan', 400, 'WA_FILE_REJECTED');
    }
    // Resolved exactly as the composer resolves an attachment, so the two paths
    // cannot disagree about what a file is or how big it may be.
    const animated = mime === 'image/webp' && isAnimatedWebp(file.buffer);
    const kind = mediaKindForMime(mime, file.buffer.length, animated);
    if (!HEADER_SAMPLE_KINDS.has(kind)) {
      throw new AppError(
        `A ${kind} file cannot be a template header — use an image, a video or a document.`,
        400,
        'WA_FILE_REJECTED'
      );
    }
    const limit = metaLimitFor(kind, animated);
    if (file.buffer.length > limit) {
      throw new AppError(
        `${kind} files must be under ${byteLabel(limit)} ` +
          `(this one is ${byteLabel(file.buffer.length)})`,
        400,
        'WA_FILE_TOO_LARGE'
      );
    }
    const handle = await templateService.uploadHeaderSampleHandle(file.buffer, mime);
    res.json({ success: true, data: { handle } });
  } catch (e) {
    next(e);
  }
};

export const syncTemplates = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await templateService.syncFromMeta();
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /templates/:id/refresh — re-read ONE template's status from Meta.
 *
 * The page-level sync walks the whole WABA; after submitting a template the
 * operator only wants to know about that one.
 */
export const refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tpl = await templateService.refreshTemplateFromMeta(String(req.params.id));
    res.json({ success: true, data: tpl });
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
    // Whitelisted windows only — an arbitrary `days` is an unbounded scan over the
    // largest table in the module.
    const requested = parseInt(String(req.query.days ?? ''), 10);
    const days = [7, 30, 90].includes(requested) ? requested : undefined;
    const data = await templateService.getTemplateAnalytics(String(req.params.id), { days });
    if (!data) throw new AppError('Template not found', 404, 'WA_TEMPLATE_NOT_FOUND');
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

/**
 * DELETE /templates/:id — remove at Meta and locally.
 *
 * A template name is claimed permanently at Meta, so without this a typo'd or
 * obsolete template sat in every picker forever.
 */
export const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await templateService.deleteTemplate(String(req.params.id));
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

/**
 * PATCH /templates/:id — edit and resubmit.
 *
 * Meta re-reviews every edit, so the template returns to PENDING and cannot be
 * sent again until it is approved.
 */
export const update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tpl = await templateService.editTemplate(String(req.params.id), {
      category: req.body.category,
      components: req.body.components,
      variableSample: req.body.variableSample,
      parameterFormat: req.body.parameterFormat,
      messageSendTtlSeconds: req.body.messageSendTtlSeconds,
    });
    res.json({ success: true, data: tpl });
  } catch (e) {
    next(e);
  }
};
