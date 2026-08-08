import type { Request, Response, NextFunction } from 'express';
import {
  listInvoicesForUser,
  getInvoiceForUser,
  generateAndUploadInvoicePdf,
  voidInvoice,
} from '../services/invoice.service';
import { success, noContent } from '../utils/response';
import { NotFoundError } from '../exceptions';
import { prisma } from '../config/prisma';
import type { InvoiceStatus } from '@prisma/client';

interface ListQuery {
  page?: number;
  limit?: number;
  status?: InvoiceStatus;
}

export const listMyInvoices = async (
  req: Request<unknown, unknown, unknown, ListQuery>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await listInvoicesForUser(req.user!.id, {
      page: req.query.page,
      limit: req.query.limit,
      status: req.query.status,
    });
    res.status(200).json({
      success: true,
      data: {
        items: result.items,
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / result.limit),
        hasMore: result.page * result.limit < result.total,
      },
      message: 'Invoices fetched',
    });
  } catch (err) {
    next(err);
  }
};

export const getMyInvoice = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const invoice = await getInvoiceForUser(req.params.id, req.user!.id);
    success(res, invoice, 'Invoice fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * Returns the public R2 PDF URL or generates the PDF on-demand if it
 * hasn't been rendered yet. The user is expected to follow the redirect
 * to download.
 */
export const downloadMyInvoicePdf = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const invoice = await getInvoiceForUser(req.params.id, req.user!.id);
    if (invoice.pdfUrl) {
      res.redirect(302, invoice.pdfUrl);
      return;
    }
    // Render synchronously as a fallback (worker may be down)
    const { pdfUrl } = await generateAndUploadInvoicePdf(invoice.id);
    res.redirect(302, pdfUrl);
  } catch (err) {
    next(err);
  }
};

// =====================================================================
// Super-admin
// =====================================================================

export const listAllInvoicesAdmin = async (
  req: Request<
    unknown,
    unknown,
    unknown,
    { page?: number; limit?: number; status?: InvoiceStatus; userId?: string }
  >,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const page = Math.max(1, req.query.page ?? 1);
    const limit = Math.min(100, Math.max(1, req.query.limit ?? 50));
    const where: Record<string, unknown> = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.userId) where.userId = req.query.userId;
    const [items, total] = await prisma.$transaction([
      prisma.invoice.findMany({
        where,
        orderBy: { issuedAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
        include: { user: { select: { email: true, firstName: true, lastName: true } } },
      }),
      prisma.invoice.count({ where }),
    ]);
    res.status(200).json({
      success: true,
      data: {
        items,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
      message: 'Invoices fetched',
    });
  } catch (err) {
    next(err);
  }
};

export const voidInvoiceAdmin = async (
  req: Request<{ id: string }, unknown, { reason: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const invoice = await voidInvoice({
      invoiceId: req.params.id,
      reason: req.body.reason,
      voidedBy: req.user!.id,
    });
    success(res, invoice, 'Invoice voided');
  } catch (err) {
    next(err);
  }
};

export const regenerateInvoicePdf = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
    if (!invoice) throw new NotFoundError('Invoice not found');
    const { pdfUrl, jsonUrl } = await generateAndUploadInvoicePdf(invoice.id);
    success(res, { pdfUrl, jsonUrl }, 'Invoice PDF regenerated');
  } catch (err) {
    next(err);
  }
};

// guard re-export
export { noContent };
