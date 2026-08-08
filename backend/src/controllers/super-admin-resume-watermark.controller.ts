/**
 * Super-admin Resume Watermark Toolkit controller.
 * All routes are gated SUPER_ADMIN-only in the router.
 */
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/error';
import * as toolkit from '../services/resume-toolkit.service';
import type { OnPlatformResumeType, UploadFile } from '../services/resume-toolkit.service';
import {
  getWatermarkConfig,
  setWatermarkConfig,
  watermarkResume,
  fetchResumeBuffer,
  buildZip,
  makeWatermarkedEntry,
  WATERMARK_POSITIONS,
  type WatermarkConfig,
  type WatermarkPosition,
} from '../services/resume-watermark.service';

const BULK_DOWNLOAD_CAP = 100;

function adminId(req: Request): string {
  const id = req.user?.id;
  if (!id) throw new AppError('Not authenticated', 401, 'UNAUTHENTICATED');
  return id;
}

function reqFiles(req: Request): UploadFile[] {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  return files.map((f) => ({
    buffer: f.buffer,
    originalname: f.originalname,
    mimetype: f.mimetype,
    size: f.size,
  }));
}

/** Build an optional per-download watermark override from query params. */
function parseOverride(query: Request['query']): Partial<WatermarkConfig> | undefined {
  const override: Partial<WatermarkConfig> = {};
  const pos = query.position;
  if (typeof pos === 'string' && (WATERMARK_POSITIONS as string[]).includes(pos)) {
    override.position = pos as WatermarkPosition;
  }
  const num = (v: unknown): number | undefined => {
    if (typeof v !== 'string' || v.trim() === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const opacity = num(query.opacity);
  if (opacity !== undefined) override.opacity = opacity;
  const scale = num(query.scale);
  if (scale !== undefined) override.scale = scale;
  const rotation = num(query.rotation);
  if (rotation !== undefined) override.rotation = rotation;
  if (query.enabled === 'false') override.enabled = false;
  if (query.enabled === 'true') override.enabled = true;
  return Object.keys(override).length ? override : undefined;
}

function sendFile(res: Response, buffer: Buffer, mimeType: string, filename: string): void {
  const safe = filename.replace(/[^\w.\-() ]+/g, '_');
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
  res.setHeader('Content-Length', String(buffer.length));
  res.status(200).send(buffer);
}

function parseTags(raw: unknown): string[] | undefined {
  if (raw === undefined) return undefined;
  if (Array.isArray(raw))
    return raw
      .map(String)
      .map((s) => s.trim())
      .filter(Boolean);
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return [];
    if (s.startsWith('[')) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed))
          return parsed
            .map(String)
            .map((x) => x.trim())
            .filter(Boolean);
      } catch {
        /* fall through to comma-split */
      }
    }
    return s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return undefined;
}

// ── Config ───────────────────────────────────────────────────────────────────
export const getConfig = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(200).json({ status: 'success', data: await getWatermarkConfig() });
  } catch (err) {
    next(err);
  }
};

export const updateConfig = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await setWatermarkConfig(req.body ?? {}, adminId(req));
    res.status(200).json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
};

// ── On-platform ──────────────────────────────────────────────────────────────
export const listOnPlatform = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await toolkit.listOnPlatform({
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      resumeType: (req.query.resumeType as OnPlatformResumeType) || 'any',
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.status(200).json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
};

export const downloadOnPlatform = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const type = (req.query.type as OnPlatformResumeType) || 'any';
    const desc = await toolkit.resolveOnPlatformResume(String(req.params.id), type);
    const source = await fetchResumeBuffer(desc.url);
    const { buffer, mimeType, extension } = await watermarkResume(
      source,
      desc.mimeType,
      desc.originalName,
      parseOverride(req.query)
    );
    sendFile(res, buffer, mimeType, `${desc.label}.${extension}`);
  } catch (err) {
    next(err);
  }
};

export const bulkDownloadOnPlatform = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userIds: string[] = Array.isArray(req.body?.userIds) ? req.body.userIds.map(String) : [];
    const type: OnPlatformResumeType = req.body?.type || 'any';
    if (!userIds.length) throw new AppError('No candidates selected', 400, 'NO_SELECTION');
    if (userIds.length > BULK_DOWNLOAD_CAP) {
      throw new AppError(
        `Too many candidates selected for a single download (max ${BULK_DOWNLOAD_CAP}).`,
        400,
        'BULK_LIMIT'
      );
    }
    const { descriptors } = await toolkit.resolveOnPlatformBulk(userIds, type);
    if (!descriptors.length) throw new AppError('No downloadable resumes found', 404, 'NO_RESUME');
    const override = parseOverride(req.body as Request['query']);
    const entries = await Promise.all(
      descriptors.map((d) =>
        makeWatermarkedEntry(d.url, d.mimeType, d.originalName, d.label, override)
      )
    );
    const zip = await buildZip(entries);
    sendFile(res, zip, 'application/zip', 'watermarked-resumes.zip');
  } catch (err) {
    next(err);
  }
};

// ── Off-platform ─────────────────────────────────────────────────────────────
export const listOffPlatform = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await toolkit.listOffPlatform({
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.status(200).json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
};

export const getOffPlatform = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await toolkit.getOffPlatform(String(req.params.id));
    res.status(200).json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
};

export const createOffPlatform = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const files = reqFiles(req);
    if (!files.length) throw new AppError('At least one resume file is required', 400, 'NO_FILE');
    const perFile =
      req.body?.oneCandidatePerFile === 'true' || req.body?.oneCandidatePerFile === true;

    if (perFile) {
      const data = await toolkit.importOffPlatformPerFile(files, adminId(req));
      res.status(201).json({ status: 'success', data });
      return;
    }
    const data = await toolkit.createOffPlatform(
      {
        name: req.body?.name,
        email: req.body?.email,
        phone: req.body?.phone,
        headline: req.body?.headline,
        notes: req.body?.notes,
        source: req.body?.source,
        tags: parseTags(req.body?.tags),
      },
      files,
      adminId(req)
    );
    res.status(201).json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
};

export const addResumes = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const files = reqFiles(req);
    if (!files.length) throw new AppError('At least one resume file is required', 400, 'NO_FILE');
    const data = await toolkit.addResumesToOffPlatform(String(req.params.id), files, adminId(req));
    res.status(200).json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
};

export const updateOffPlatform = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await toolkit.updateOffPlatform(String(req.params.id), {
      name: req.body?.name,
      email: req.body?.email,
      phone: req.body?.phone,
      headline: req.body?.headline,
      notes: req.body?.notes,
      source: req.body?.source,
      tags: parseTags(req.body?.tags),
    });
    res.status(200).json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
};

export const removeOffPlatform = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await toolkit.deleteOffPlatform(String(req.params.id));
    res.status(200).json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
};

export const removeOffPlatformResume = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await toolkit.deleteOffPlatformResume(
      String(req.params.id),
      String(req.params.resumeId)
    );
    res.status(200).json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
};

export const bulkDeleteOffPlatform = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    if (!ids.length) throw new AppError('No candidates selected', 400, 'NO_SELECTION');
    const data = await toolkit.bulkDeleteOffPlatform(ids);
    res.status(200).json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
};

export const downloadOffPlatformResume = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const resume = await toolkit.getOffPlatformResume(
      String(req.params.id),
      String(req.params.resumeId)
    );
    const source = await fetchResumeBuffer(resume.url);
    const { buffer, mimeType, extension } = await watermarkResume(
      source,
      resume.mimeType,
      resume.originalName,
      parseOverride(req.query)
    );
    sendFile(res, buffer, mimeType, `${resume.candidate.name}.${extension}`);
  } catch (err) {
    next(err);
  }
};

export const bulkDownloadOffPlatform = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    if (!ids.length) throw new AppError('No candidates selected', 400, 'NO_SELECTION');
    if (ids.length > BULK_DOWNLOAD_CAP) {
      throw new AppError(
        `Too many candidates selected for a single download (max ${BULK_DOWNLOAD_CAP}).`,
        400,
        'BULK_LIMIT'
      );
    }
    const descriptors = await toolkit.resolveOffPlatformBulk(ids);
    if (!descriptors.length) throw new AppError('No resumes found for selection', 404, 'NO_RESUME');
    const override = parseOverride(req.body as Request['query']);
    const entries = await Promise.all(
      descriptors.map((d) =>
        makeWatermarkedEntry(d.url, d.mimeType, d.originalName, d.label, override)
      )
    );
    const zip = await buildZip(entries);
    sendFile(res, zip, 'application/zip', 'watermarked-resumes.zip');
  } catch (err) {
    next(err);
  }
};
