import type { Request, Response, NextFunction } from 'express';
import * as contactService from '../services/whatsapp-contact.service';
import { addWhatsappImportJob } from '../jobs/whatsapp-import.queue';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import logger from '../config/logger';
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
    const { optInStatus, tag, tags, blocked, suppressed, q, page, limit, segmentId } = req.query;
    const result = await contactService.listContacts({
      optInStatus: (optInStatus as WaOptInStatus) || undefined,
      tag: (tag as string) || undefined,
      // Tri-state like `blocked`: '' has to mean "do not filter on this", which a
      // boolean cannot express.
      suppressed: triBool(suppressed),
      // Applying a saved segment sends its whole tag list; the list then matches
      // it with OR, the way the campaign audience does.
      tags: contactService.tagListQ(tags),
      // A saved segment applied as a filter is resolved server-side with the
      // launch predicate — rules, attributes and all — instead of being reduced
      // to its tags on the way in.
      segmentId: (segmentId as string) || undefined,
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

/**
 * One contact's consent history, newest first.
 *
 * The consent COLUMNS are a mutable projection — a re-opt-in nulls `optOutAt` —
 * so they cannot answer "they have told us to stop three times", which is
 * exactly the question a compliance review asks. The event log always could; it
 * was only reachable by downloading the whole DSAR bundle.
 */
export const listConsentEvents = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { page, limit } = req.query;
    const data = await contactService.listConsentEvents(String(req.params.id), {
      page: page ? parseInt(String(page), 10) : undefined,
      limit: limit ? parseInt(String(limit), 10) : undefined,
    });
    res.json({ success: true, data });
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
      // The column has existed since the campaign personalisation work and only
      // the importer and the inbound worker could write it — an agent who
      // learned a customer's city from the conversation had nowhere to put it.
      attributes: req.body.attributes,
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
    const rows = (req.body.contacts ?? []) as Array<{
      phone: string;
      name?: string;
      tags?: string[];
      attributes?: Record<string, string>;
    }>;
    const optIn = req.body.optIn === true;
    const replaceTags = req.body.replaceTags === true;

    const job = await prisma.waImportJob.create({
      data: {
        total: rows.length,
        optIn,
        createdBy: req.user?.id ?? null,
      },
    });

    // Off the request path, always — a 5000-row file cannot finish inside the
    // request budget, and the old inline loop 408'd the operator while carrying
    // on writing rows nothing was tracking.
    //
    // REDIS_ENABLED=false (local development) has no queue to hand it to, so it
    // runs inline there rather than accepting an import that would never start.
    if ((redis.status as string) === 'disabled') {
      const result = await contactService.importContacts(rows, optIn, replaceTags);
      const finished = await prisma.waImportJob.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          processed: result.processed,
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
          skippedOptedOut: result.skippedOptedOut,
          duplicates: result.duplicates,
          finishedAt: new Date(),
        },
      });
      res.status(201).json({ success: true, data: finished });
      return;
    }

    await addWhatsappImportJob({ jobId: job.id, rows, optIn, replaceTags });
    res.status(202).json({ success: true, data: job });
  } catch (e) {
    next(e);
  }
};

/**
 * Progress of one import, polled by the import modal.
 *
 * The counts live on the row rather than in the BullMQ job so they survive the
 * job being reaped, and so a reload mid-import still finds the run.
 */
export const getImportJob = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const job = await prisma.waImportJob.findUnique({ where: { id: String(req.params.jobId) } });
    if (!job) throw new AppError('Import not found', 404, 'WA_IMPORT_NOT_FOUND');
    res.json({ success: true, data: job });
  } catch (e) {
    next(e);
  }
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve the `:id` of a data-subject route to a contact id, accepting a phone
 * number in its place.
 *
 * A DPDP/GDPR request arrives from the person, by phone number — they do not
 * know their internal UUID and cannot be asked for it — so an operator handling
 * one had to go and look the contact up first, in a different screen, before the
 * access or erasure route would answer at all. The phone is normalised the same
 * way the rest of the module normalises one, so "+91 98765 43210" and
 * "919876543210" find the same row.
 *
 * The resolved id is published on `res.locals` for the audit middleware, which
 * keys the trail on it rather than on the phone number that addressed the
 * request — AuditLog is not scrubbed by erasure.
 *
 * Returns null when nothing matches; callers raise the same 404 either way.
 */
async function resolveContactRef(idOrPhone: string, res: Response): Promise<string | null> {
  let id = idOrPhone;
  if (!UUID_RE.test(idOrPhone)) {
    const match = await prisma.waContact.findUnique({
      where: { phone: contactService.normalizeWaPhone(idOrPhone) },
      select: { id: true },
    });
    if (!match) return null;
    id = match.id;
  }
  res.locals.auditEntityId = id;
  return id;
}

/**
 * DPDP data-access: download a single contact's full data bundle as JSON.
 * `:id` is the contact id or the contact's phone number.
 */
export const exportContact = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = await resolveContactRef(String(req.params.id), res);
    const bundle = id ? await contactService.exportContactData(id) : null;
    if (!bundle) throw new AppError('Contact not found', 404, 'WA_CONTACT_NOT_FOUND');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="wa-contact-${id}.json"`);

    // Assembled on the wire rather than in memory. The envelope is the same
    // `{ success, data }` shape `res.json` would have produced — the difference
    // is that a contact with a long message history no longer has to exist as
    // one array (and one serialised string) inside the process before the
    // subject's download starts.
    res.write(`{"success":true,"data":{"contact":${JSON.stringify(bundle.contact)}`);
    res.write(`,"conversations":${JSON.stringify(bundle.conversations)}`);
    for (const section of bundle.sections) {
      res.write(`,"${section.key}":[`);
      let first = true;
      for await (const page of section.pages) {
        for (const row of page) {
          if (!first) res.write(',');
          res.write(JSON.stringify(row));
          first = false;
        }
      }
      res.write(']');
    }
    res.write('}}');
    res.end();
  } catch (e) {
    // Past the first chunk the 200 is already committed. Aborting the connection
    // is the only honest signal left: a truncated but syntactically plausible
    // bundle would be filed as a completed subject-access request.
    if (res.headersSent) {
      logger.error(`WhatsApp DSAR export failed mid-stream: ${(e as Error).message}`);
      res.destroy();
      return;
    }
    next(e);
  }
};

/**
 * Contacts that look like the same person (last-nine-digits match).
 *
 * The report the merge below is driven from: phone is the sole identity, so two
 * rows for one human each carry their own consent state and an opt-out honoured
 * on one is ignored on the other — invisible until something lists them.
 */
export const listDuplicates = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const raw = req.query.limit;
    const parsed = raw === undefined || raw === '' ? NaN : parseInt(String(raw), 10);
    const groups = await contactService.findDuplicateContacts(
      Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
    );
    res.json({ success: true, data: groups });
  } catch (e) {
    next(e);
  }
};

/**
 * Fold `:id` (the survivor) and `body.mergeId` (the loser) into one contact.
 *
 * `:id` is the row that SURVIVES, so the URL names the record that will still
 * exist afterwards — the same convention the DPDP routes use for `:id`.
 */
export const mergeContact = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const survivorId = String(req.params.id);
    const result = await contactService.mergeContacts(
      survivorId,
      String(req.body.mergeId),
      req.user?.id ?? null
    );
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

/**
 * DPDP right-to-erasure: anonymize + scrub a contact's PII (keeps a tombstone).
 * `:id` is the contact id or the contact's phone number.
 */
export const eraseContact = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = await resolveContactRef(String(req.params.id), res);
    const existing = id ? await contactService.getContact(id) : null;
    if (!id || !existing) throw new AppError('Contact not found', 404, 'WA_CONTACT_NOT_FOUND');
    const result = await contactService.eraseContactData(id);
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};
