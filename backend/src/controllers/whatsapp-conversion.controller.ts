import type { Request, Response, NextFunction } from 'express';
import {
  recordConversion,
  ingestConversion,
  deleteConversion,
  getCampaignConversions,
  getContactConversions,
  attributeCampaignForContact,
  getConversionSummary,
} from '../services/whatsapp-conversion.service';

export const record = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const conversion = await recordConversion({
      // Attribute the way the API postback does when the caller names no
      // campaign. Recording a sale from the thread is the common case — the
      // agent knows the customer, not which campaign brought them — and without
      // this it landed unattributed, so campaign ROI counted the send and never
      // the revenue.
      campaignId:
        req.body.campaignId ?? (await attributeCampaignForContact(req.body.contactId ?? null)),
      contactId: req.body.contactId,
      valuePaise: req.body.valuePaise,
      note: req.body.note,
      occurredAt: req.body.occurredAt ? new Date(req.body.occurredAt) : undefined,
      source: 'manual',
    });
    res.status(201).json({ success: true, data: conversion });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /whatsapp/ingest/conversions — server-to-server postback.
 *
 * Mounted outside the app-password gate with its own API key, so a website or
 * CRM can report a conversion without holding the console credential. Answers
 * 200 (not 201) for a duplicate `externalId` and says so, because a retrying
 * caller needs to know the event landed exactly once.
 */
export const ingest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { conversion, duplicate } = await ingestConversion({
      externalId: req.body.externalId,
      phone: req.body.phone,
      contactId: req.body.contactId,
      campaignId: req.body.campaignId,
      valuePaise: req.body.valuePaise,
      note: req.body.note,
      occurredAt: req.body.occurredAt ? new Date(req.body.occurredAt) : undefined,
    });
    res.status(duplicate ? 200 : 201).json({ success: true, duplicate, data: conversion });
  } catch (e) {
    next(e);
  }
};

/** DELETE /whatsapp/conversions/:id — undo a mistyped or double-clicked entry. */
export const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await deleteConversion(String(req.params.id)) });
  } catch (e) {
    next(e);
  }
};

/** One contact's conversions and their total value. */
export const byContact = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = parseInt(String(req.query.limit), 10);
    res.json({
      success: true,
      data: await getContactConversions(String(req.params.id), {
        limit: Number.isFinite(parsed) ? parsed : undefined,
      }),
    });
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
    const parsed = parseInt(String(req.query.limit), 10);
    res.json({
      success: true,
      data: await getCampaignConversions(String(req.params.id), {
        limit: Number.isFinite(parsed) ? parsed : undefined,
      }),
    });
  } catch (e) {
    next(e);
  }
};

export const summary = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Same `?days` contract as every other analytics route, so the page's range
    // control reaches this figure too. Omitted = lifetime.
    const parsed = parseInt(String(req.query.days), 10);
    const days = Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    res.json({ success: true, data: await getConversionSummary(days) });
  } catch (e) {
    next(e);
  }
};
