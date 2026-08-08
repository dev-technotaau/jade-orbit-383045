import type { Request, Response, NextFunction } from 'express';
import * as campaignService from '../services/whatsapp-campaign.service';
import * as shortlinkService from '../services/whatsapp-shortlink.service';
import { setSequenceSteps, getSequenceSteps } from '../services/whatsapp-sequence.service';
import { startConversationWithTemplate } from '../services/whatsapp-send.service';
import {
  saveCampaignAsTemplate,
  listCampaignTemplates,
  deleteCampaignTemplate,
  createCampaignFromTemplate,
} from '../services/whatsapp-campaign-template.service';
import { safeCsvCell } from '../utils/whatsapp-csv';
import { AppError } from '../middleware/error';
import type { WaCampaignStatus, WaCampaignRecipientStatus } from '@prisma/client';

export const list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, page, limit } = req.query;
    const result = await campaignService.listCampaigns({
      status: (status as WaCampaignStatus) || undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

export const get = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const c = await campaignService.getCampaign(String(req.params.id));
    if (!c) throw new AppError('Campaign not found', 404, 'WA_CAMPAIGN_NOT_FOUND');
    res.json({ success: true, data: c });
  } catch (e) {
    next(e);
  }
};

export const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const c = await campaignService.createCampaign({
      name: req.body.name,
      description: req.body.description,
      templateId: req.body.templateId,
      audienceType: req.body.audienceType,
      audienceFilter: req.body.audienceFilter,
      variableMapping: req.body.variableMapping,
      scheduledAt: req.body.scheduledAt,
      batchSize: req.body.batchSize,
      throttlePerSec: req.body.throttlePerSec,
      type: req.body.type,
      steps: req.body.steps,
      isAbTest: req.body.isAbTest,
      variants: req.body.variants,
      recurrenceDays: req.body.recurrenceDays,
      segmentId: req.body.segmentId,
      createdBy: req.user!.id,
    });
    res.status(201).json({ success: true, data: c });
  } catch (e) {
    next(e);
  }
};

export const update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const c = await campaignService.updateCampaign(String(req.params.id), {
      name: req.body.name,
      description: req.body.description,
      templateId: req.body.templateId,
      audienceType: req.body.audienceType,
      audienceFilter: req.body.audienceFilter,
      variableMapping: req.body.variableMapping,
      scheduledAt: req.body.scheduledAt,
      batchSize: req.body.batchSize,
      throttlePerSec: req.body.throttlePerSec,
      recurrenceDays: req.body.recurrenceDays,
      segmentId: req.body.segmentId,
    });
    res.json({ success: true, data: c });
  } catch (e) {
    next(e);
  }
};

/** Manual Duplicate: clone into an editable DRAFT (not auto-launched). */
export const duplicate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const c = await campaignService.cloneCampaign(String(req.params.id), { nameSuffix: ' (copy)' });
    res.status(201).json({ success: true, data: c });
  } catch (e) {
    next(e);
  }
};

/** Test-send: render the campaign template + send ONE message to a reviewer's phone. */
export const testSend = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const c = await campaignService.getCampaign(String(req.params.id));
    if (!c) throw new AppError('Campaign not found', 404, 'WA_CAMPAIGN_NOT_FOUND');
    const message = await startConversationWithTemplate({
      phone: String(req.body.phone),
      actorUserId: req.user!.id,
      templateId: c.templateId,
      bodyParams: [],
    });
    res.json({ success: true, data: message });
  } catch (e) {
    next(e);
  }
};

/** Save a campaign as a reusable blueprint. */
export const saveAsTemplate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const t = await saveCampaignAsTemplate(String(req.params.id), req.body.name, req.user!.id);
    res.status(201).json({ success: true, data: t });
  } catch (e) {
    next(e);
  }
};

export const listTemplates = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.json({ success: true, data: await listCampaignTemplates() });
  } catch (e) {
    next(e);
  }
};

export const removeTemplate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await deleteCampaignTemplate(String(req.params.id));
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
};

/** Create a new campaign from a saved blueprint. */
export const useTemplate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const c = await createCampaignFromTemplate(String(req.params.id), {
      name: req.body.name,
      scheduledAt: req.body.scheduledAt,
      createdBy: req.user!.id,
    });
    res.status(201).json({ success: true, data: c });
  } catch (e) {
    next(e);
  }
};

export const setSteps = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await setSequenceSteps(String(req.params.id), req.body.steps);
    const steps = await getSequenceSteps(String(req.params.id));
    res.json({ success: true, data: steps });
  } catch (e) {
    next(e);
  }
};

export const getSteps = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const steps = await getSequenceSteps(String(req.params.id));
    res.json({ success: true, data: steps });
  } catch (e) {
    next(e);
  }
};

export const setVariants = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const variants = await campaignService.setVariants(String(req.params.id), req.body.variants);
    res.json({ success: true, data: variants });
  } catch (e) {
    next(e);
  }
};

export const getVariants = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const variants = await campaignService.getVariants(String(req.params.id));
    res.json({ success: true, data: variants });
  } catch (e) {
    next(e);
  }
};

export const linkStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await shortlinkService.getCampaignLinkStats(String(req.params.id));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

export const createLink = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const link = await shortlinkService.createShortLink({
      targetUrl: req.body.targetUrl,
      campaignId: String(req.params.id),
      createdBy: req.user!.id,
    });
    res.status(201).json({ success: true, data: link });
  } catch (e) {
    next(e);
  }
};

export const preview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await campaignService.previewAudienceCount(String(req.params.id));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

export const recipients = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { page, limit, status } = req.query;
    const result = await campaignService.getRecipients(
      String(req.params.id),
      page ? parseInt(page as string, 10) : 1,
      limit ? parseInt(limit as string, 10) : 50,
      (status as WaCampaignRecipientStatus) || undefined
    );
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

export const launch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const c = await campaignService.launchCampaign(String(req.params.id));
    res.json({ success: true, data: c });
  } catch (e) {
    next(e);
  }
};

export const pause = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const c = await campaignService.pauseCampaign(String(req.params.id));
    res.json({ success: true, data: c });
  } catch (e) {
    next(e);
  }
};

export const resume = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const c = await campaignService.resumeCampaign(String(req.params.id));
    res.json({ success: true, data: c });
  } catch (e) {
    next(e);
  }
};

export const cancel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const c = await campaignService.cancelCampaign(String(req.params.id));
    res.json({ success: true, data: c });
  } catch (e) {
    next(e);
  }
};

export const retryFailed = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const c = await campaignService.retryFailedRecipients(String(req.params.id));
    res.json({ success: true, data: c });
  } catch (e) {
    next(e);
  }
};

export const exportRecipients = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const recipients = await campaignService.getRecipientsForExport(String(req.params.id));
    const rows = recipients.map((r) => [
      r.contact.phone,
      r.contact.name,
      r.status,
      r.wamid,
      r.errorCode,
      r.sentAt ? r.sentAt.toISOString() : '',
    ]);
    // safeCsvCell guards against both CSV-structure breakage and formula injection.
    const csv = [
      ['phone', 'name', 'status', 'wamid', 'errorCode', 'sentAt'].map(safeCsvCell).join(','),
      ...rows.map((r) => r.map(safeCsvCell).join(',')),
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="campaign-recipients.csv"');
    res.send(csv);
  } catch (e) {
    next(e);
  }
};
