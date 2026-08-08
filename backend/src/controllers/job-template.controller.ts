import type { Request, Response, NextFunction } from 'express';
import { jobTemplateService } from '../services/job-template.service';
import { AppError } from '../middleware/error';

export const getTemplates = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const templates = await jobTemplateService.getTemplates(req.user.id);
    res.status(200).json({ status: 'success', data: templates });
  } catch (error) {
    next(error);
  }
};

export const createTemplate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const template = await jobTemplateService.createTemplate(req.user.id, req.body);
    res.status(201).json({ status: 'success', data: template });
  } catch (error) {
    next(error);
  }
};

export const updateTemplate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const template = await jobTemplateService.updateTemplate(
      req.user.id,
      req.params.id as string,
      req.body
    );
    res.status(200).json({ status: 'success', data: template });
  } catch (error) {
    next(error);
  }
};

export const deleteTemplate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    await jobTemplateService.deleteTemplate(req.user.id, req.params.id as string);
    res.status(200).json({ status: 'success', message: 'Template deleted' });
  } catch (error) {
    next(error);
  }
};
