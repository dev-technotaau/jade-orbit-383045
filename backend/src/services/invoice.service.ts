/**
 * GST tax-invoice issuing engine.
 *
 *   - `issueInvoiceForOrder(orderId)` produces a `TAX_INVOICE` for a paid Order,
 *     atomically allocates the next FY-aware invoiceNumber, persists rows
 *     (Invoice + InvoiceLine[]), and enqueues PDF generation.
 *   - `generateAndUploadInvoicePdf(invoiceId)` runs inside the BullMQ worker
 *     — renders the Handlebars template, uploads PDF + e-invoice JSON to R2,
 *     persists URLs back on the Invoice row.
 *
 * Idempotent at every step: `Order.id @unique` lookup on `Invoice.orderId`
 * means re-running `issueInvoiceForOrder` on the same Order is a no-op.
 */
import { prisma } from '../config/prisma';
import type { Prisma } from '@prisma/client';
import {
  InvoiceStatus,
  InvoiceType,
  type Invoice,
  type InvoiceLine,
  type Plan,
} from '@prisma/client';
import { nextReceiptNumber } from './receipt-sequence.service';
import { renderInvoicePdf, getInvoiceLogoDataUri } from '../utils/invoice-pdf';
import { uploadFileToR2 } from './storage.service';
import { buildEInvoicePayload } from '../utils/einvoice-payload';
import { paiseToWords } from '../utils/amount-in-words';
import { stateNameForCode } from '../utils/gst-states';
import { env } from '../config/env';
import { AppError, NotFoundError, ConflictError, BadRequestError } from '../exceptions';
import logger from '../config/logger';

// =====================================================================
// Issue invoice (DB rows only; PDF is async)
// =====================================================================

export async function issueInvoiceForOrder(orderId: string): Promise<Invoice> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      plan: true,
      billingAddress: true,
      payments: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  });
  if (!order) throw new NotFoundError('Order not found');
  if (order.status !== 'PAID') {
    throw new BadRequestError(`Order is ${order.status} — invoice issued only for PAID orders`);
  }

  // Idempotency — one tax invoice per order.
  const existing = await prisma.invoice.findFirst({
    where: { orderId: order.id, type: InvoiceType.TAX_INVOICE },
  });
  if (existing) {
    logger.info('Invoice already exists for order — returning existing', {
      invoiceId: existing.id,
      invoiceNumber: existing.invoiceNumber,
    });
    return existing;
  }

  const seq = await nextReceiptNumber(env.HA_INVOICE_PREFIX);

  const sellerGstin = env.HA_GSTIN ?? '';
  const sellerLegal = env.HA_LEGAL_NAME ?? 'Hire Adda';
  const sellerStateCode = env.HA_BILLING_STATE_CODE ?? '03';
  if (!sellerGstin) {
    throw new AppError('HA_GSTIN env not configured', 500, 'GST_CONFIG_MISSING');
  }

  const placeOfSupply = order.placeOfSupplyState ?? env.HA_PLACE_OF_SUPPLY_DEFAULT_STATE;
  const lineDescription = `${order.plan.name} (${order.plan.code}) — ${order.plan.validityDays ?? 'custom'} days`;

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        invoiceNumber: seq.formatted,
        userId: order.userId,
        orderId: order.id,
        billingAddressId: order.billingAddressId,
        type: InvoiceType.TAX_INVOICE,
        status: InvoiceStatus.ISSUED,
        sellerGstin,
        sellerLegalName: sellerLegal,
        sellerStateCode,
        buyerGstin: order.gstNumber,
        buyerLegalName: order.legalName ?? null,
        buyerStateCode: placeOfSupply,
        placeOfSupply,
        taxRegion: order.taxRegion,
        hsnCode: order.plan.hsnCode ?? '998314',
        subtotalPaise: order.taxableAmountPaise,
        discountPaise: order.discountPaise,
        taxableAmountPaise: order.taxableAmountPaise,
        cgstPaise: order.cgstPaise,
        sgstPaise: order.sgstPaise,
        igstPaise: order.igstPaise,
        cessPaise: order.cessPaise,
        totalPaise: order.totalPaise,
        paidPaise: order.totalPaise,
        currency: order.currency,
        gstPercent: order.plan.gstRatePercent,
        issuedAt: new Date(),
        metadata: {
          orderReceiptNumber: order.receiptNumber,
          razorpayOrderId: order.razorpayOrderId,
        } as Prisma.InputJsonValue,
      },
    });

    // Multi-quantity orders: one line with quantity N and a true per-unit
    // price. The taxable amount may not divide evenly by N, so the per-unit
    // price is rounded UP and the few leftover paise go into the line
    // discount — keeping the e-invoice identity AssAmt = (Qty × UnitPrice)
    // − Discount exact, which the IRP validates.
    const lineQuantity = order.quantity ?? 1;
    const unitPricePaise = Math.ceil(order.taxableAmountPaise / lineQuantity);
    const roundingDiscountPaise = unitPricePaise * lineQuantity - order.taxableAmountPaise;

    await tx.invoiceLine.create({
      data: {
        invoiceId: created.id,
        description: lineDescription,
        hsnCode: order.plan.hsnCode ?? '998314',
        sacCode: '998314',
        quantity: lineQuantity,
        unitPricePaise,
        discountPaise: roundingDiscountPaise,
        taxableAmountPaise: order.taxableAmountPaise,
        gstPercent: order.plan.gstRatePercent,
        cgstPaise: order.cgstPaise,
        sgstPaise: order.sgstPaise,
        igstPaise: order.igstPaise,
        cessPaise: order.cessPaise,
        totalPaise: order.totalPaise,
      },
    });

    return created;
  });

  // Link the most recent CAPTURED payment back to the invoice (best effort)
  const paymentToLink = order.payments.find((p) => p.status === 'CAPTURED');
  if (paymentToLink) {
    await prisma.payment
      .update({
        where: { id: paymentToLink.id },
        data: { invoiceId: invoice.id },
      })
      .catch((err) => logger.warn('Could not link payment to invoice', { err }));
  }

  logger.info('Invoice issued', {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    orderId: order.id,
  });

  // Enqueue async PDF + e-invoice JSON generation
  await enqueueInvoicePdf(invoice.id).catch((err) =>
    logger.error('Failed to enqueue invoice PDF generation', err)
  );

  // Kafka fan-out for the invoice-issued event (downstream services).
  void emitInvoiceIssued(invoice).catch(() => {});

  return invoice;
}

// =====================================================================
// Issue invoice for subscription cycle (called by webhook handler)
// =====================================================================

export async function issueInvoiceForSubscriptionCycle(args: {
  subscriptionId: string;
  paymentId?: string;
  amountPaise: number;
  taxableAmountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  cessPaise: number;
  periodStart?: Date;
  periodEnd?: Date;
}): Promise<Invoice> {
  const sub = await prisma.subscription.findUnique({
    where: { id: args.subscriptionId },
    include: { plan: true, user: true },
  });
  if (!sub) throw new NotFoundError('Subscription not found');

  const seq = await nextReceiptNumber(env.HA_INVOICE_PREFIX);
  const sellerGstin = env.HA_GSTIN ?? '';
  if (!sellerGstin) {
    throw new AppError('HA_GSTIN env not configured', 500, 'GST_CONFIG_MISSING');
  }

  const placeOfSupply = env.HA_PLACE_OF_SUPPLY_DEFAULT_STATE;
  const description = `${sub.plan.name} — ${args.periodStart?.toLocaleDateString('en-IN') ?? ''} → ${args.periodEnd?.toLocaleDateString('en-IN') ?? ''}`;

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        invoiceNumber: seq.formatted,
        userId: sub.userId,
        subscriptionId: sub.id,
        type: InvoiceType.TAX_INVOICE,
        status: InvoiceStatus.ISSUED,
        sellerGstin,
        sellerLegalName: env.HA_LEGAL_NAME ?? 'Hire Adda',
        sellerStateCode: env.HA_BILLING_STATE_CODE ?? '03',
        placeOfSupply,
        taxRegion:
          (sub.plan as Plan & { gstRatePercent: number }).gstRatePercent === 0
            ? 'EXEMPT'
            : 'IN_INTRA_STATE',
        hsnCode: sub.plan.hsnCode ?? '998314',
        subtotalPaise: args.taxableAmountPaise,
        discountPaise: 0,
        taxableAmountPaise: args.taxableAmountPaise,
        cgstPaise: args.cgstPaise,
        sgstPaise: args.sgstPaise,
        igstPaise: args.igstPaise,
        cessPaise: args.cessPaise,
        totalPaise: args.amountPaise,
        paidPaise: args.amountPaise,
        currency: sub.plan.currency,
        gstPercent: sub.plan.gstRatePercent,
        periodStart: args.periodStart ?? null,
        periodEnd: args.periodEnd ?? null,
        issuedAt: new Date(),
      },
    });
    await tx.invoiceLine.create({
      data: {
        invoiceId: created.id,
        description: description.trim(),
        hsnCode: sub.plan.hsnCode ?? '998314',
        sacCode: '998314',
        quantity: 1,
        unitPricePaise: args.taxableAmountPaise,
        discountPaise: 0,
        taxableAmountPaise: args.taxableAmountPaise,
        gstPercent: sub.plan.gstRatePercent,
        cgstPaise: args.cgstPaise,
        sgstPaise: args.sgstPaise,
        igstPaise: args.igstPaise,
        cessPaise: args.cessPaise,
        totalPaise: args.amountPaise,
      },
    });
    return created;
  });

  if (args.paymentId) {
    await prisma.payment
      .update({ where: { id: args.paymentId }, data: { invoiceId: invoice.id } })
      .catch(() => {});
  }
  await enqueueInvoicePdf(invoice.id).catch((err) =>
    logger.error('Failed to enqueue subscription invoice PDF', err)
  );

  // Kafka fan-out for the invoice-issued event (downstream services).
  void emitInvoiceIssued(invoice).catch(() => {});

  return invoice;
}

// =====================================================================
// Kafka emission helper — single source of truth for BILLING_INVOICE_ISSUED
// =====================================================================

async function emitInvoiceIssued(invoice: Invoice): Promise<void> {
  const { publishEvent } = await import('../kafka/producer');
  const { KafkaTopics } = await import('../kafka/topics');
  await publishEvent(KafkaTopics.BILLING_INVOICE_ISSUED, invoice.id, {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    userId: invoice.userId,
    orderId: invoice.orderId,
    subscriptionId: invoice.subscriptionId,
    type: invoice.type,
    totalPaise: invoice.totalPaise,
    currency: invoice.currency,
  });
}

// =====================================================================
// PDF generation (run inside the BullMQ worker)
// =====================================================================

const formatINR = (paise: number, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(paise / 100);

export async function generateAndUploadInvoicePdf(invoiceId: string): Promise<{
  pdfUrl: string;
  jsonUrl: string;
}> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      lines: { orderBy: { id: 'asc' } },
      user: { select: { email: true, firstName: true, lastName: true, mobileNumber: true } },
      order: {
        select: {
          id: true,
          receiptNumber: true,
          razorpayOrderId: true,
          paidAt: true,
          planSnapshot: true,
          payments: {
            where: { status: 'CAPTURED' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              razorpayPaymentId: true,
              method: true,
              capturedAt: true,
              cardLast4: true,
              cardNetwork: true,
              vpa: true,
              bank: true,
              wallet: true,
            },
          },
        },
      },
      subscription: { select: { id: true } },
      billingAddress: true,
    },
  });
  if (!invoice) throw new NotFoundError('Invoice not found');

  const buyerName =
    invoice.buyerLegalName ||
    [invoice.user.firstName, invoice.user.lastName].filter(Boolean).join(' ').trim() ||
    invoice.user.email;

  const lines = invoice.lines.map((line) => ({
    // Multi-quantity lines carry a few paise of rounding adjustment as a
    // line discount (so Qty × Rate − discount = Taxable exactly). The PDF
    // template has no discount column, so surface it in the description —
    // CGST Rule 46 wants discounts visible on the document.
    description:
      line.discountPaise > 0
        ? `${line.description} (rounding adj. −${formatINR(line.discountPaise, invoice.currency)})`
        : line.description,
    hsnSac: line.hsnCode || line.sacCode || invoice.hsnCode,
    quantity: line.quantity,
    rateFormatted: formatINR(line.unitPricePaise, invoice.currency),
    taxableFormatted: formatINR(line.taxableAmountPaise, invoice.currency),
    cgstFormatted: line.cgstPaise ? formatINR(line.cgstPaise, invoice.currency) : '—',
    sgstFormatted: line.sgstPaise ? formatINR(line.sgstPaise, invoice.currency) : '—',
    igstFormatted: line.igstPaise ? formatINR(line.igstPaise, invoice.currency) : '—',
    totalFormatted: formatINR(line.totalPaise, invoice.currency),
  }));

  const period =
    invoice.periodStart && invoice.periodEnd
      ? `${invoice.periodStart.toLocaleDateString('en-IN')} – ${invoice.periodEnd.toLocaleDateString('en-IN')}`
      : null;

  const payment = invoice.order?.payments?.[0];

  // Doc-title varies by invoice type so RECEIPT/PROFORMA/CREDIT_NOTE
  // render with the correct legal heading without forking templates.
  const docTitle =
    invoice.type === 'TAX_INVOICE'
      ? 'Tax Invoice'
      : invoice.type === 'CREDIT_NOTE'
        ? 'Credit Note'
        : invoice.type === 'PROFORMA'
          ? 'Proforma Invoice'
          : 'Receipt';

  // Place-of-supply: render the human-readable state name when we can map
  // the 2-digit code, else fall back to the raw code stored on the invoice.
  const placeOfSupplyLabel = stateNameForCode(invoice.placeOfSupply);

  // The invoice is a branded legal document, so its website line must show
  // the canonical public site — never a dev/internal origin. `FRONTEND_URL`
  // Zod-defaults to `http://localhost:3000`, so honour it only when it's a
  // real public origin; otherwise fall back to the production domain.
  const fe = (env.FRONTEND_URL ?? '').replace(/\/$/, '');
  const brandUrl = fe && !/localhost|127\.0\.0\.1/.test(fe) ? fe : 'https://hireadda.in';

  const isInternational = invoice.taxRegion === 'INTERNATIONAL';

  const templateData = {
    docTitle,
    invoiceNumber: invoice.invoiceNumber,
    currency: invoice.currency,
    issuedAtFormatted: (invoice.issuedAt ?? invoice.createdAt).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }),
    generatedAt: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    retentionYears: Math.ceil(env.BILLING_INVOICE_PDF_RETENTION_DAYS / 365),
    placeOfSupply: invoice.placeOfSupply,
    placeOfSupplyLabel,
    refundWindowDays: env.BILLING_REFUND_WINDOW_DAYS,
    isPaid: invoice.status === InvoiceStatus.PAID || invoice.paidPaise >= invoice.totalPaise,
    isVoided: invoice.status === InvoiceStatus.VOIDED,
    isReverseCharge: false, // Hire Adda doesn't sell reverse-charge B2B today; toggle when added
    reverseChargeNote: null,
    exportNote: isInternational
      ? 'Export of services — no GST charged (LUT filed). Treat as zero-rated supply under IGST §16(1)(a).'
      : null,
    seller: {
      gstin: invoice.sellerGstin,
      legalName: invoice.sellerLegalName,
      tradeName: env.HA_TRADE_NAME ?? 'Hire Adda',
      tagline: 'Smarter hiring · Verified candidates · Built in India',
      website: brandUrl.replace(/^https?:\/\//, ''),
      // Square brand-mark embedded as a base64 data URI (NOT a remote URL):
      // Puppeteer renders it with zero network I/O, so the logo can't go
      // missing when the backend pod can't reach FRONTEND_URL / the public
      // domain. See getInvoiceLogoDataUri() for the full rationale. Returns
      // null only if the bundled asset is unreadable, in which case the
      // template's {{#if seller.logoUrl}} cleanly omits the logo.
      logoUrl: getInvoiceLogoDataUri(),
      pan: env.HA_PAN ?? null,
      cin: env.HA_CIN ?? null,
      udyam: env.HA_UDYAM_NUMBER ?? null,
      line1: env.HA_BILLING_LINE1 ?? '',
      line2: env.HA_BILLING_LINE2 ?? null,
      city: env.HA_BILLING_CITY ?? '',
      stateName: env.HA_BILLING_STATE_NAME ?? '',
      pincode: env.HA_BILLING_PINCODE ?? '',
      country: env.HA_BILLING_COUNTRY ?? 'India',
      stateCode: invoice.sellerStateCode,
      supportEmail: env.HA_SUPPORT_EMAIL ?? null,
      supportPhone: env.HA_SUPPORT_PHONE ?? null,
      bankName: null as string | null, // TODO populate when settlement-bank wired
    },
    buyer: {
      legalName: buyerName,
      gstin: invoice.buyerGstin,
      email: invoice.user.email,
      phone: invoice.user.mobileNumber,
      line1: invoice.billingAddress?.line1,
      line2: invoice.billingAddress?.line2,
      city: invoice.billingAddress?.city,
      stateName: invoice.billingAddress?.stateName,
      pincode: invoice.billingAddress?.pincode,
      country: invoice.billingAddress?.country ?? null,
    },
    order: invoice.order
      ? {
          receiptNumber: invoice.order.receiptNumber,
          razorpayOrderId: invoice.order.razorpayOrderId,
        }
      : {},
    planSnapshot: invoice.order?.planSnapshot
      ? {
          name: (invoice.order.planSnapshot as { name?: string }).name ?? null,
          code: (invoice.order.planSnapshot as { code?: string }).code ?? null,
        }
      : {},
    payment: payment
      ? {
          razorpayPaymentId: payment.razorpayPaymentId,
          method: payment.method,
          cardLast4: payment.cardLast4 ?? null,
          cardNetwork: payment.cardNetwork ?? null,
          vpa: payment.vpa ?? null,
          bank: payment.bank ?? null,
          wallet: payment.wallet ?? null,
          capturedAtFormatted: payment.capturedAt
            ? payment.capturedAt.toLocaleString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Kolkata',
              })
            : null,
        }
      : {},
    subscription: invoice.subscription ? { id: invoice.subscription.id } : {},
    periodLabel: period,
    lines,
    totals: {
      taxableFormatted: formatINR(invoice.taxableAmountPaise, invoice.currency),
      discountFormatted:
        invoice.discountPaise > 0 ? formatINR(invoice.discountPaise, invoice.currency) : null,
      cgstFormatted: invoice.cgstPaise > 0 ? formatINR(invoice.cgstPaise, invoice.currency) : null,
      sgstFormatted: invoice.sgstPaise > 0 ? formatINR(invoice.sgstPaise, invoice.currency) : null,
      igstFormatted: invoice.igstPaise > 0 ? formatINR(invoice.igstPaise, invoice.currency) : null,
      cessFormatted: invoice.cessPaise > 0 ? formatINR(invoice.cessPaise, invoice.currency) : null,
      cgstPercent: invoice.gstPercent / 2,
      sgstPercent: invoice.gstPercent / 2,
      igstPercent: invoice.gstPercent,
      grandFormatted: formatINR(invoice.totalPaise, invoice.currency),
      grandInWords: paiseToWords(invoice.totalPaise),
      paid: invoice.paidPaise > 0,
      paidFormatted: formatINR(invoice.paidPaise, invoice.currency),
      refunded: invoice.refundedPaise > 0,
      refundedFormatted: formatINR(invoice.refundedPaise, invoice.currency),
    },
    eInvoice:
      invoice.eInvoiceIrn && invoice.eInvoiceAckNo
        ? {
            irn: invoice.eInvoiceIrn,
            ackNo: invoice.eInvoiceAckNo,
            ackDate: invoice.eInvoiceAckDate?.toLocaleDateString('en-IN') ?? '',
            qrUrl: invoice.eInvoiceQrUrl ?? null,
          }
        : null,

    // Type-specific fields — only the matching template uses them, but
    // we pass everything so a single data shape powers all 4 variants.
    relatedInvoiceNumber:
      invoice.type === 'CREDIT_NOTE'
        ? (((invoice.metadata as Record<string, unknown> | null)?.relatedInvoiceNumber as
            | string
            | undefined) ?? null)
        : null,
    creditReason:
      invoice.type === 'CREDIT_NOTE'
        ? (((invoice.metadata as Record<string, unknown> | null)?.refundReason as
            | string
            | undefined) ?? 'Refund')
        : null,
    refundId:
      invoice.type === 'CREDIT_NOTE'
        ? (((invoice.metadata as Record<string, unknown> | null)?.refundId as string | undefined) ??
          null)
        : null,
    proformaValidityDays: invoice.type === 'PROFORMA' ? env.BILLING_CUSTOM_OFFER_EXPIRY_DAYS : null,
    proformaValidUntil:
      invoice.type === 'PROFORMA'
        ? new Date(
            (invoice.issuedAt ?? invoice.createdAt).getTime() +
              env.BILLING_CUSTOM_OFFER_EXPIRY_DAYS * 86_400_000
          ).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
        : null,
    quoteRequestId:
      invoice.type === 'PROFORMA'
        ? (((invoice.metadata as Record<string, unknown> | null)?.quoteRequestId as
            | string
            | undefined) ?? null)
        : null,
  };

  const pdfBuffer = await renderInvoicePdf(templateData as unknown as Record<string, unknown>, {
    type: invoice.type,
  });

  // Upload PDF to R2
  const pdfFilename = `${invoice.invoiceNumber.replace(/[/\\]/g, '_')}.pdf`;
  const { url: pdfUrl } = await uploadFileToR2(
    pdfBuffer,
    pdfFilename,
    'invoices/pdf',
    'application/pdf'
  );

  // Build + upload e-invoice JSON
  const eInvoicePayload = buildEInvoicePayload({
    invoice,
    lines: invoice.lines,
    seller: {
      gstin: invoice.sellerGstin,
      legalName: invoice.sellerLegalName,
      tradeName: env.HA_TRADE_NAME ?? 'Hire Adda',
      line1: env.HA_BILLING_LINE1 ?? '',
      line2: env.HA_BILLING_LINE2,
      city: env.HA_BILLING_CITY ?? '',
      pincode: env.HA_BILLING_PINCODE ?? '000000',
      stateCode: invoice.sellerStateCode,
      email: env.HA_SUPPORT_EMAIL,
    },
    buyer: {
      gstin: invoice.buyerGstin,
      legalName: buyerName,
      line1: invoice.billingAddress?.line1,
      line2: invoice.billingAddress?.line2,
      city: invoice.billingAddress?.city,
      pincode: invoice.billingAddress?.pincode,
      stateCode: invoice.buyerStateCode ?? invoice.placeOfSupply,
      email: invoice.user.email,
      phone: invoice.user.mobileNumber,
    },
  });
  const jsonBuffer = Buffer.from(JSON.stringify(eInvoicePayload, null, 2), 'utf8');
  const jsonFilename = `${invoice.invoiceNumber.replace(/[/\\]/g, '_')}.json`;
  const { url: jsonUrl } = await uploadFileToR2(
    jsonBuffer,
    jsonFilename,
    'invoices/json',
    'application/json'
  );

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { pdfUrl, jsonUrl },
  });

  logger.info('Invoice PDF + e-invoice JSON generated', {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    pdfUrl,
  });

  return { pdfUrl, jsonUrl };
}

// =====================================================================
// Read APIs
// =====================================================================

export async function listInvoicesForUser(
  userId: string,
  args: { page?: number; limit?: number; status?: InvoiceStatus } = {}
): Promise<{
  items: (Invoice & { lines: InvoiceLine[] })[];
  total: number;
  page: number;
  limit: number;
}> {
  const page = Math.max(1, args.page ?? 1);
  const limit = Math.min(100, Math.max(1, args.limit ?? 20));
  const where: Prisma.InvoiceWhereInput = { userId };
  if (args.status) where.status = args.status;
  const [items, total] = await prisma.$transaction([
    prisma.invoice.findMany({
      where,
      orderBy: { issuedAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
      include: { lines: { orderBy: { id: 'asc' } } },
    }),
    prisma.invoice.count({ where }),
  ]);
  return { items, total, page, limit };
}

export async function getInvoiceForUser(
  invoiceId: string,
  userId: string
): Promise<Invoice & { lines: InvoiceLine[] }> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId },
    include: {
      lines: { orderBy: { id: 'asc' } },
      order: {
        select: {
          id: true,
          receiptNumber: true,
          razorpayOrderId: true,
          paidAt: true,
          plan: { select: { code: true, name: true } },
        },
      },
      subscription: { select: { id: true, plan: { select: { code: true, name: true } } } },
      billingAddress: true,
    },
  });
  if (!invoice) throw new NotFoundError('Invoice not found');
  return invoice as Invoice & { lines: InvoiceLine[] };
}

// =====================================================================
// Void invoice (super-admin)
// =====================================================================

export async function voidInvoice(args: {
  invoiceId: string;
  reason: string;
  voidedBy: string;
}): Promise<Invoice> {
  const invoice = await prisma.invoice.findUnique({ where: { id: args.invoiceId } });
  if (!invoice) throw new NotFoundError('Invoice not found');
  if (invoice.status === InvoiceStatus.VOIDED) {
    throw new ConflictError('Invoice already voided');
  }
  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      status: InvoiceStatus.VOIDED,
      voidedAt: new Date(),
      voidReason: args.reason,
      metadata: {
        ...(invoice.metadata as Record<string, unknown> | null),
        voidedBy: args.voidedBy,
      } as Prisma.InputJsonValue,
    },
  });
  void (async () => {
    const { AuditService } = await import('./audit.service');
    await AuditService.log({
      action: 'BILLING_INVOICE_VOIDED',
      entity: 'Invoice',
      entityId: invoice.id,
      performedBy: args.voidedBy,
      details: { invoiceNumber: invoice.invoiceNumber, reason: args.reason },
    });
  })();
  return updated;
}

// =====================================================================
// Forward declaration — actual queue lives in `jobs/invoice-generation.queue`
// (which imports from this file). We declare the helper here to avoid a
// circular import; the queue overrides the implementation on import.
// =====================================================================

let _enqueueImpl: ((invoiceId: string) => Promise<unknown>) | null = null;

export function registerInvoicePdfEnqueuer(fn: (invoiceId: string) => Promise<unknown>): void {
  _enqueueImpl = fn;
}

export async function enqueueInvoicePdf(invoiceId: string): Promise<void> {
  if (_enqueueImpl) {
    await _enqueueImpl(invoiceId);
    return;
  }
  // Fallback — direct synchronous render (dev / no-bull mode).
  logger.warn('Invoice PDF enqueuer not registered — running synchronously', { invoiceId });
  await generateAndUploadInvoicePdf(invoiceId);
}

// AppError re-export keeps imports tidy
export { AppError };
