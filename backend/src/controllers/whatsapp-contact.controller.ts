import type { Request, Response, NextFunction } from 'express';
import * as contactService from '../services/whatsapp-contact.service';
import { AppError } from '../middleware/error';
import type { WaOptInStatus } from '@prisma/client';

function triBool(v: unknown): boolean | undefined {
  if (v === 'true') return true;
  if (v === 'false') return false;
  return undefined;
}

/** Bulk action over many contacts (tag/untag/opt/block/unblock/suppress/erase). */
export const bulkContacts = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { action, ids, allMatching, filters, tag } = req.body;
    const result = await contactService.bulkUpdateContacts({
      action,
      ids,
      allMatching,
      filters,
      tag,
      performedBy: req.user?.id ?? null,
    });
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

export const listContacts = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { optInStatus, tag, blocked, q, page, limit } = req.query;
    const result = await contactService.listContacts({
      optInStatus: (optInStatus as WaOptInStatus) || undefined,
      tag: (tag as string) || undefined,
      blocked: triBool(blocked),
      q: (q as string) || undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

export const getContact = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const c = await contactService.getContact(String(req.params.id));
    if (!c) throw new AppError('Contact not found', 404, 'WA_CONTACT_NOT_FOUND');
    res.json({ success: true, data: c });
  } catch (e) {
    next(e);
  }
};

export const updateContact = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const c = await contactService.updateContact(String(req.params.id), {
      name: req.body.name,
      tags: req.body.tags,
      isBlocked: req.body.isBlocked,
      optInStatus: req.body.optInStatus,
    });
    res.json({ success: true, data: c });
  } catch (e) {
    next(e);
  }
};

export const importContacts = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await contactService.importContacts(req.body.contacts, req.body.optIn === true);
    res.status(201).json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

/** DPDP data-access: download a single contact's full data bundle as JSON. */
export const exportContact = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = String(req.params.id);
    const bundle = await contactService.exportContactData(id);
    if (!bundle) throw new AppError('Contact not found', 404, 'WA_CONTACT_NOT_FOUND');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="wa-contact-${id}.json"`);
    res.json({ success: true, data: bundle });
  } catch (e) {
    next(e);
  }
};

/** DPDP right-to-erasure: anonymize + scrub a contact's PII (keeps a tombstone). */
export const eraseContact = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = String(req.params.id);
    const existing = await contactService.getContact(id);
    if (!existing) throw new AppError('Contact not found', 404, 'WA_CONTACT_NOT_FOUND');
    const result = await contactService.eraseContactData(id);
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};
