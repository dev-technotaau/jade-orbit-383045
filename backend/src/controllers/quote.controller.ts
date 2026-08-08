import type { Request, Response, NextFunction } from 'express';
import * as QuoteService from '../services/quote.service';
import { success, created, noContent } from '../utils/response';
import { commitIdempotency } from '../middleware/idempotency-key';

interface SubmitBody {
  companyName: string;
  contactPerson: string;
  designation?: string;
  email: string;
  phone: string;
  employeeRange?: string;
  hiringNeed?: string;
  requiredCvCount?: number;
  validityDays?: number;
  expectedSeats?: number;
  currentToolStack?: string;
  budgetRange?: string;
  additionalNotes?: string;
}

interface CreateOfferBody {
  basePricePaise: number;
  validityDays: number;
  cvUnlocks: number;
  seats?: number;
  features?: Record<string, unknown>;
  resources?: Record<string, unknown>;
  expiresAt?: string;
}

// =====================================================================
// User-facing
// =====================================================================

export const submitQuote = async (
  req: Request<unknown, unknown, SubmitBody>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const quote = await QuoteService.submitQuote({
      // Guests submit from the public pricing page (req.user is undefined);
      // authenticated callers attach their id.
      userId: req.user?.id ?? null,
      companyName: req.body.companyName,
      contactPerson: req.body.contactPerson,
      designation: req.body.designation,
      email: req.body.email,
      phone: req.body.phone,
      employeeRange: req.body.employeeRange,
      hiringNeed: req.body.hiringNeed,
      requiredCvCount: req.body.requiredCvCount,
      validityDays: req.body.validityDays,
      expectedSeats: req.body.expectedSeats,
      currentToolStack: req.body.currentToolStack,
      budgetRange: req.body.budgetRange,
      additionalNotes: req.body.additionalNotes,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });
    const body = {
      success: true as const,
      data: { id: quote.id, status: quote.status },
      message: 'Quote received — our team will reach out within 24 hours',
    };
    await commitIdempotency(req as Request, 201, body);
    res.status(201).json(body);
  } catch (err) {
    next(err);
  }
};

export const listMyQuotes = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const quotes = await QuoteService.listQuotesForUser(req.user!.id);
    success(res, quotes, 'Quotes fetched');
  } catch (err) {
    next(err);
  }
};

export const getMyQuote = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const quote = await QuoteService.getQuoteForUser(req.params.id, req.user!.id);
    success(res, quote, 'Quote fetched');
  } catch (err) {
    next(err);
  }
};

export const acceptOffer = async (
  req: Request<{ offerId: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await QuoteService.acceptOffer({
      offerId: req.params.offerId,
      userId: req.user!.id,
    });
    success(res, result, 'Offer accepted — proceed to checkout');
  } catch (err) {
    next(err);
  }
};

// =====================================================================
// Super-admin
// =====================================================================

export const listQuotesAdmin = async (
  req: Request<
    unknown,
    unknown,
    unknown,
    {
      status?: QuoteService.SubmitQuoteInput extends never
        ? never
        :
            | 'NEW'
            | 'IN_REVIEW'
            | 'CONTACTED'
            | 'NEGOTIATING'
            | 'ACCEPTED'
            | 'REJECTED'
            | 'CONVERTED'
            | 'WITHDRAWN';
      search?: string;
      page?: number;
      limit?: number;
    }
  >,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await QuoteService.listQuotesAdmin({
      status: req.query.status,
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.status(200).json({
      success: true,
      data: {
        items: result.items,
        total: result.total,
        page: req.query.page ?? 1,
        limit: req.query.limit ?? 50,
      },
      message: 'Quotes fetched',
    });
  } catch (err) {
    next(err);
  }
};

export const getQuoteAdmin = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const quote = await QuoteService.getQuoteAdmin(req.params.id);
    success(res, quote, 'Quote fetched');
  } catch (err) {
    next(err);
  }
};

export const assignQuote = async (
  req: Request<{ id: string }, unknown, { assignedToId: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const quote = await QuoteService.assignQuote(req.params.id, req.body.assignedToId);
    success(res, quote, 'Quote assigned');
  } catch (err) {
    next(err);
  }
};

export const markQuoteContacted = async (
  req: Request<{ id: string }, unknown, { notes?: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const quote = await QuoteService.markQuoteContacted(req.params.id, req.body.notes);
    success(res, quote, 'Quote marked as contacted');
  } catch (err) {
    next(err);
  }
};

export const rejectQuote = async (
  req: Request<{ id: string }, unknown, { reason?: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const quote = await QuoteService.rejectQuote(req.params.id, req.body.reason);
    success(res, quote, 'Quote rejected');
  } catch (err) {
    next(err);
  }
};

export const createOffer = async (
  req: Request<{ id: string }, unknown, CreateOfferBody>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await QuoteService.createCustomPlanOffer({
      quoteRequestId: req.params.id,
      basePricePaise: req.body.basePricePaise,
      validityDays: req.body.validityDays,
      cvUnlocks: req.body.cvUnlocks,
      seats: req.body.seats,
      features: req.body.features as never,
      resources: req.body.resources as never,
      expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
      createdById: req.user!.id,
    });
    created(
      res,
      {
        offerId: result.offer.id,
        planCode: result.plan.code,
        planId: result.plan.id,
        expiresAt: result.offer.expiresAt,
      },
      'Custom plan offer created'
    );
  } catch (err) {
    next(err);
  }
};

// guard re-export
export { noContent };
