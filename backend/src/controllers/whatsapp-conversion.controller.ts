import type { Request, Response, NextFunction } from 'express';
import {
  recordConversion,
  getCampaignConversions,
  getConversionSummary,
} from '../services/whatsapp-conversion.service';

export const record = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const conversion = await recordConversion({
      campaignId: req.body.campaignId,
      contactId: req.body.contactId,
      valuePaise: req.body.valuePaise,
      note: req.body.note,
    });
    res.status(201).json({ success: true, data: conversion });
  } catch (e) {
    next(e);
  }
};

export const byCampaign = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.json({ success: true, data: await getCampaignConversions(String(req.params.id)) });
  } catch (e) {
    next(e);
  }
};

export const summary = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await getConversionSummary() });
  } catch (e) {
    next(e);
  }
};
