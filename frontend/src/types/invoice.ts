import type { TaxRegion } from './order';

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'VOIDED' | 'REFUNDED';
export type InvoiceType = 'PROFORMA' | 'TAX_INVOICE' | 'CREDIT_NOTE' | 'RECEIPT';

export interface InvoiceLine {
  id: string;
  description: string;
  hsnCode: string | null;
  sacCode: string | null;
  quantity: number;
  unitPricePaise: number;
  discountPaise: number;
  taxableAmountPaise: number;
  gstPercent: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  cessPaise: number;
  totalPaise: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  userId: string;
  orderId: string | null;
  subscriptionId: string | null;
  type: InvoiceType;
  status: InvoiceStatus;
  sellerGstin: string;
  sellerLegalName: string;
  sellerStateCode: string;
  buyerGstin: string | null;
  buyerLegalName: string | null;
  buyerStateCode: string | null;
  placeOfSupply: string;
  taxRegion: TaxRegion;
  hsnCode: string;
  subtotalPaise: number;
  discountPaise: number;
  taxableAmountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  cessPaise: number;
  totalPaise: number;
  paidPaise: number;
  refundedPaise: number;
  currency: string;
  gstPercent: number;
  periodStart: string | null;
  periodEnd: string | null;
  pdfUrl: string | null;
  jsonUrl: string | null;
  eInvoiceIrn: string | null;
  eInvoiceQrUrl: string | null;
  eInvoiceAckNo: string | null;
  eInvoiceAckDate: string | null;
  issuedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  updatedAt: string;
  lines: InvoiceLine[];
}

export interface InvoicesListResponse {
  items: Invoice[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}
