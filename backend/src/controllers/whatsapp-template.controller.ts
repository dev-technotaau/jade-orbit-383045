import type { Request, Response, NextFunction } from 'express';
import * as templateService from '../services/whatsapp-template.service';
import { AppError } from '../middleware/error';
import type { WaTemplateCategory, WaTemplateStatus } from '@prisma/client';

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
      createdBy: req.user!.id,
    });
    res.status(201).json({ success: true, data: tpl });
  } catch (e) {
    next(e);
  }
};

export const uploadHeaderSample = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const file = req.file;
    if (!file) throw new AppError('A file is required', 400, 'WA_MEDIA_REQUIRED');
    const handle = await templateService.uploadHeaderSampleHandle(file.buffer, file.mimetype);
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

export const getAnalytics = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await templateService.getTemplateAnalytics(String(req.params.id));
    if (!data) throw new AppError('Template not found', 404, 'WA_TEMPLATE_NOT_FOUND');
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
};
