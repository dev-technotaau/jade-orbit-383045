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
import logger from '../config/logger';
import type { WaCampaignStatus, WaCampaignRecipientStatus } from '@prisma/client';

export const list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, q, page, limit, archived } = req.query;
    const result = await campaignService.listCampaigns({
      status: (status as WaCampaignStatus) || undefined,
      q: (q as string) || undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      includeArchived: archived === 'true',
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
      // The campaign-wide send parameters — header media, header text, the
      // URL-button suffix. This controller copies req.body field by field, and
      // templateParams was the one the list never gained: the wizard collected
      // it, the schema validated it, the service and the worker both read it,
      // and it was dropped here in between, so EVERY campaign was stored with
      // templateParams = null. A media-header broadcast then failed its own
      // launch check ("this template needs an image header") reporting a value
      // the operator had demonstrably filled in.
      templateParams: req.body.templateParams,
      scheduledAt: req.body.scheduledAt,
      respectBusinessHours: req.body.respectBusinessHours,
      batchSize: req.body.batchSize,
      throttlePerSec: req.body.throttlePerSec,
      type: req.body.type,
      steps: req.body.steps,
      isAbTest: req.body.isAbTest,
      variants: req.body.variants,
      abTestSamplePct: req.body.abTestSamplePct,
      abTestMetric: req.body.abTestMetric,
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
      // Same omission as `create` above, with the same effect: editing a
      // campaign to ADD the missing header media saved every other field and
      // silently discarded that one, so the fix never took.
      templateParams: req.body.templateParams,
      scheduledAt: req.body.scheduledAt,
      respectBusinessHours: req.body.respectBusinessHours,
      batchSize: req.body.batchSize,
      throttlePerSec: req.body.throttlePerSec,
      recurrenceDays: req.body.recurrenceDays,
      segmentId: req.body.segmentId,
      abTestSamplePct: req.body.abTestSamplePct,
      abTestMetric: req.body.abTestMetric,
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

/**
 * Test-send: render the campaign's ACTUAL message and send ONE copy to a
 * reviewer's phone.
 *
 * This used to send the base template with `bodyParams: []` — no variables, no
 * A/B variant, no header or button parameters — so for any personalised campaign
 * (i.e. any campaign worth checking) Meta rejected it outright with a parameter
 * mismatch, and when it did go through it showed a message no recipient would
 * ever receive. It now resolves the same mapping the materializer will, against
 * a chosen contact or the test number's own contact record.
 */
export const testSend = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const c = await campaignService.getCampaign(String(req.params.id));
    if (!c) throw new AppError('Campaign not found', 404, 'WA_CAMPAIGN_NOT_FOUND');

    // A/B campaigns send per VARIANT, so the base template is the one thing a
    // reviewer never receives. Default to the first variant when none is named.
    const variantId = req.body.variantId ? String(req.body.variantId) : null;
    const variants = await campaignService.getVariants(c.id);
    const variant = variantId
      ? (variants.find((v) => v.id === variantId) ?? null)
      : (variants[0] ?? null);
    if (variantId && !variant) {
      throw new AppError('That variant is not on this campaign', 404, 'WA_VARIANT_NOT_FOUND');
    }

    const mapping = Array.isArray(variant?.variableMapping)
      ? (variant.variableMapping as string[])
      : Array.isArray(c.variableMapping)
        ? (c.variableMapping as string[])
        : undefined;

    const phone = String(req.body.phone);
    const contact = await campaignService.resolveTestContact({
      contactId: req.body.contactId ? String(req.body.contactId) : undefined,
      phone,
    });

    const params = (c.templateParams ?? {}) as campaignService.CampaignTemplateParams;
    const message = await startConversationWithTemplate({
      phone,
      actorUserId: req.user!.id,
      templateId: variant?.templateId ?? c.templateId,
      // Meta refuses an EMPTY parameter and fails the whole message, so a slot the
      // sample contact cannot fill would break the very check this exists for.
      // A visible placeholder keeps the test deliverable; the audience preview is
      // what reports how many real recipients would resolve blank.
      bodyParams: campaignService
        .resolveTemplateVars(mapping, contact)
        .map((v) => (v.trim() ? v : '—')),
      // The campaign-level parameters a media-header or URL-button template needs.
      // Without them the test failed with (#131008) on exactly the templates the
      // reviewer most needed to see rendered.
      headerText: params.headerText,
      headerMediaUrl: params.headerMediaUrl,
      headerMediaType: params.headerMediaType,
      // A DOCUMENT header's filename, so the reviewer sees the attachment named
      // exactly as the audience will.
      headerMediaFilename: params.headerMediaFilename,
      // The LOCATION pin, for the same reason: a test send of a store-locator
      // template is refused outright without it.
      headerLocation: params.headerLocation,
      buttonUrlParam: params.buttonUrlParam,
      buttonUrlParams: params.buttonUrlParams,
      couponCode: params.couponCode,
      ltoExpirationMs: params.ltoExpirationMs,
      // The catalogue products. A test send of a multi-product template without
      // them is refused with #131008 — the template a reviewer most needs to see.
      catalogThumbnailProductId: params.catalogThumbnailProductId,
      productSections: params.productSections,
      productRetailerId: params.productRetailerId,
      // The carousel's cards. A test send exists to show the message a recipient
      // will get, and for a carousel that message IS the cards — without them
      // Meta refuses the test with #131008 on exactly the template a reviewer
      // most needs to see rendered.
      carouselCards: params.carouselCards,
      testSend: true,
    });
    res.json({ success: true, data: message });
  } catch (e) {
    next(e);
  }
};

/** DELETE a draft campaign, or archive one that has already sent. */
export const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await campaignService.deleteCampaign(String(req.params.id));
    res.json({ success: true, data: result });
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

/** GET the per-variant rates, lift and significance for an A/B campaign. */
export const abTestReport = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await campaignService.getAbTestReport(String(req.params.id));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

/** Declare the winning variant — explicitly, or by taking the measured leader. */
export const selectAbWinner = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const campaign = await campaignService.selectAbWinner(String(req.params.id), {
      variantId: req.body.variantId ? String(req.body.variantId) : undefined,
      metric: req.body.metric as campaignService.WaAbMetric | undefined,
    });
    res.json({ success: true, data: campaign });
  } catch (e) {
    next(e);
  }
};

/** Send the held-back remainder of the audience using the winning variant. */
export const sendAbRemainder = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await campaignService.sendAbRemainder(String(req.params.id));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

export const linkStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Click-through, not a bare click count. The panel used to render
    // `clickCount` and nothing else, so CTR — the primary optimisation metric for
    // a link-driven campaign — could not be read anywhere in the product.
    const stats = await shortlinkService.getCampaignClickStats(String(req.params.id));
    // Absolute URL resolved server-side; see shortLinkUrl() for why.
    const origin = `${req.protocol}://${req.get('host')}`;
    res.json({
      success: true,
      data: {
        ...stats,
        links: stats.links.map((l) => ({
          ...l,
          url: shortlinkService.shortLinkUrl(l.code, origin),
        })),
      },
    });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /campaigns/:id/clicks — the campaign's click series plus per-variant
 * clicks, so an A/B test can be judged on the action that matters rather than
 * on read receipts.
 */
export const clickStats = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = String(req.params.id);
    const days = parseInt(String(req.query.days ?? '30'), 10);
    const [series, variants, summary] = await Promise.all([
      shortlinkService.getClickSeries(Number.isFinite(days) && days > 0 ? days : 30, id),
      shortlinkService.getCampaignVariantClicks(id),
      shortlinkService.getCampaignClickStats(id),
    ]);
    res.json({
      success: true,
      data: {
        totalClicks: summary.totalClicks,
        uniqueClickers: summary.uniqueClickers,
        delivered: summary.delivered,
        ctr: summary.ctr,
        convertedClickers: summary.convertedClickers,
        clickToConversionRate: summary.clickToConversionRate,
        series,
        variants,
      },
    });
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
    const origin = `${req.protocol}://${req.get('host')}`;
    res.status(201).json({
      success: true,
      data: { ...link, url: shortlinkService.shortLinkUrl(link.code, origin) },
    });
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

/**
 * The same preview, for an audience that has not been saved yet.
 *
 * The count and the cost were only reachable through `GET /campaigns/:id/preview`,
 * i.e. AFTER a draft existed — so the operator picked tags and an opt-in status
 * blind, submitted, and only then learned whether the audience was three people
 * or three hundred thousand and what it would cost. Going back was worse than it
 * sounds: the edit modal cannot change audience fields at all.
 *
 * POST rather than GET because the body carries the whole audience filter
 * (including an uploaded phone list), which does not fit in a query string.
 * Stateless — it writes nothing, and the uploaded branch is explicitly the
 * read-only one, so previewing a pasted list cannot mint contact rows.
 */
export const previewDraft = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await campaignService.previewAudienceDraft({
      templateId: String(req.body.templateId),
      audienceType: req.body.audienceType,
      audienceFilter: req.body.audienceFilter ?? null,
      segmentId: req.body.segmentId,
      variableMapping: req.body.variableMapping,
    });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

/**
 * Meta's pre-flight verdict for this campaign. Separate from `preview` on
 * purpose: the audience count is answered from our own database in a few
 * milliseconds, while this makes two live Graph calls, and folding them together
 * would put a Meta round-trip in front of the number every draft page shows.
 */
export const preflight = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await campaignService.campaignPreflight(String(req.params.id));
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
    const { limit, status, clicked, cursor } = req.query;
    const result = await campaignService.getRecipients(String(req.params.id), {
      limit: limit ? parseInt(limit as string, 10) : undefined,
      status: (status as WaCampaignRecipientStatus) || undefined,
      clickedOnly: clicked === 'true',
      // Keyset, not `?page`: see getRecipients. The first request omits it.
      cursor: (cursor as string) || null,
    });
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

const EXPORT_COLUMNS = [
  'phone',
  'name',
  'status',
  'wamid',
  'errorCode',
  'sentAt',
  'clickedAt',
] as const;

/**
 * Wait for the response socket to drain.
 *
 * Without this the export writes every page as fast as Postgres returns it and
 * Node buffers whatever the client has not read yet — which puts the whole file
 * back in memory for any operator on a slow connection, the very thing streaming
 * is here to avoid. Also settles when the client goes away, so a cancelled
 * download cannot leave this awaiting a 'drain' that will never fire.
 */
function waitForDrain(res: Response): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      res.off('drain', done);
      res.off('close', done);
      res.off('error', done);
      resolve();
    };
    res.once('drain', done);
    res.once('close', done);
    res.once('error', done);
  });
}

export const exportRecipients = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const campaignId = String(req.params.id);
  try {
    // Checked BEFORE the first byte. Once the header row is written the status
    // code is settled, so a bad id either fails here or comes back as a
    // perfectly valid empty CSV that reads as "this campaign reached nobody".
    const campaign = await campaignService.getCampaign(campaignId);
    if (!campaign) throw new AppError('Campaign not found', 404, 'WA_CAMPAIGN_NOT_FOUND');
  } catch (e) {
    next(e);
    return;
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="campaign-recipients.csv"');
  // Streamed page by page rather than joined into one string: the file is
  // unbounded (see `streamRecipientsForExport`), and a million-row campaign must
  // not have to fit in the heap twice before the download starts.
  let clientGone = false;
  res.once('close', () => {
    clientGone = true;
  });
  // safeCsvCell guards against both CSV-structure breakage and formula injection.
  res.write(`${EXPORT_COLUMNS.map(safeCsvCell).join(',')}\n`);
  try {
    for await (const page of campaignService.streamRecipientsForExport(campaignId)) {
      // The operator cancelled the download; stop paging the table for a file
      // nobody is reading any more.
      if (clientGone) return;
      const chunk = page
        .map((r) =>
          [
            r.contact.phone,
            r.contact.name,
            r.status,
            r.wamid,
            r.errorCode,
            r.sentAt ? r.sentAt.toISOString() : '',
            // Who actually opened the link, not just how many did. Without this
            // column the export could not be turned into a follow-up list of
            // clickers.
            r.clickedAt ? r.clickedAt.toISOString() : '',
          ]
            .map(safeCsvCell)
            .join(',')
        )
        .join('\n');
      if (!res.write(`${chunk}\n`)) await waitForDrain(res);
    }
    res.end();
  } catch (e) {
    // Rows are already on the wire, so the JSON error envelope can no longer be
    // sent and `next(e)` would throw inside the error handler. Destroying the
    // response truncates the chunked body, which makes the download FAIL for the
    // client instead of landing as a short file that looks complete.
    logger.error(`WhatsApp recipient export failed mid-stream (campaign ${campaignId})`, e);
    res.destroy(e as Error);
  }
};
