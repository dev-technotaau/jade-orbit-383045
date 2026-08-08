/**
 * Build a GST e-invoice (IRP) payload from an Invoice + InvoiceLine[] row.
 *
 * We don't push to the IRP yet — turnover is below the ₹5cr threshold so
 * `HA_E_INVOICE_REQUIRED=false`. But we precompute and persist the JSON so
 * once we cross the threshold we can submit it without rerunning math.
 *
 * Schema reference: GSTN e-Invoice JSON Schema v1.1.
 *   https://einvoice1.gst.gov.in/Documents/EINV_Schema.json
 *
 * Only mandatory + commonly-required fields are included. Phase 9 adds
 * payment / dispatch fields when we wire refunds + delivery flows.
 */
import type { Invoice, InvoiceLine, TaxRegion as TaxRegionEnum } from '@prisma/client';

export interface EInvoicePayload {
  Version: '1.1';
  TranDtls: {
    TaxSch: 'GST';
    SupTyp: 'B2B' | 'B2C' | 'EXPWP' | 'EXPWOP';
    RegRev: 'N' | 'Y';
    EcmGstin: null;
    IgstOnIntra: 'N' | 'Y';
  };
  DocDtls: {
    Typ: 'INV' | 'CRN' | 'DBN';
    No: string;
    Dt: string; // dd/MM/yyyy
  };
  SellerDtls: SellerOrBuyer;
  BuyerDtls: SellerOrBuyer;
  ItemList: EInvoiceItem[];
  ValDtls: {
    AssVal: number;
    CgstVal: number;
    SgstVal: number;
    IgstVal: number;
    CesVal: number;
    StCesVal: number;
    Discount: number;
    OthChrg: number;
    RndOffAmt: number;
    TotInvVal: number;
    TotInvValFc: null;
  };
}

interface SellerOrBuyer {
  Gstin: string;
  LglNm: string;
  TrdNm: string;
  Addr1: string;
  Addr2?: string;
  Loc: string;
  Pin: number;
  Stcd: string;
  Ph?: string;
  Em?: string;
}

interface EInvoiceItem {
  SlNo: string;
  IsServc: 'Y' | 'N';
  PrdDesc: string;
  HsnCd: string;
  Qty: number;
  Unit: 'NOS';
  UnitPrice: number;
  TotAmt: number;
  Discount: number;
  PreTaxVal: number;
  AssAmt: number;
  GstRt: number;
  IgstAmt: number;
  CgstAmt: number;
  SgstAmt: number;
  CesRt: number;
  CesAmt: number;
  CesNonAdvlAmt: number;
  StateCesRt: number;
  StateCesAmt: number;
  StateCesNonAdvlAmt: number;
  OthChrg: number;
  TotItemVal: number;
}

export interface EInvoiceBuilderInput {
  invoice: Invoice;
  lines: InvoiceLine[];
  seller: {
    gstin: string;
    legalName: string;
    tradeName: string;
    line1: string;
    line2?: string;
    city: string;
    pincode: string;
    stateCode: string;
    phone?: string;
    email?: string;
  };
  buyer: {
    gstin?: string | null;
    legalName: string;
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    pincode?: string | null;
    stateCode?: string | null;
    email?: string | null;
    phone?: string | null;
  };
}

function paiseToRupees(paise: number): number {
  return Number((paise / 100).toFixed(2));
}

function ddMmYyyy(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, '0');
  const mon = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${mon}/${d.getUTCFullYear()}`;
}

function classifyTransaction(
  taxRegion: TaxRegionEnum,
  hasBuyerGstin: boolean
): {
  SupTyp: EInvoicePayload['TranDtls']['SupTyp'];
} {
  if (taxRegion === 'INTERNATIONAL') {
    // We assume LUT (zero-rated) by default — change to EXPWP if no LUT.
    return { SupTyp: 'EXPWOP' };
  }
  return { SupTyp: hasBuyerGstin ? 'B2B' : 'B2C' };
}

export function buildEInvoicePayload(input: EInvoiceBuilderInput): EInvoicePayload {
  const { invoice, lines, seller, buyer } = input;
  const trans = classifyTransaction(invoice.taxRegion, Boolean(buyer.gstin));

  const itemList: EInvoiceItem[] = lines.map((line, idx) => {
    const taxable = paiseToRupees(line.taxableAmountPaise);
    return {
      SlNo: String(idx + 1),
      IsServc: 'Y',
      PrdDesc: line.description.slice(0, 300),
      HsnCd: (line.hsnCode ?? line.sacCode ?? invoice.hsnCode).toString(),
      Qty: line.quantity,
      Unit: 'NOS',
      UnitPrice: paiseToRupees(line.unitPricePaise),
      TotAmt: paiseToRupees(line.unitPricePaise * line.quantity),
      Discount: paiseToRupees(line.discountPaise),
      PreTaxVal: taxable,
      AssAmt: taxable,
      GstRt: line.gstPercent,
      IgstAmt: paiseToRupees(line.igstPaise),
      CgstAmt: paiseToRupees(line.cgstPaise),
      SgstAmt: paiseToRupees(line.sgstPaise),
      CesRt: 0,
      CesAmt: 0,
      CesNonAdvlAmt: 0,
      StateCesRt: 0,
      StateCesAmt: 0,
      StateCesNonAdvlAmt: 0,
      OthChrg: 0,
      TotItemVal: paiseToRupees(line.totalPaise),
    };
  });

  return {
    Version: '1.1',
    TranDtls: {
      TaxSch: 'GST',
      SupTyp: trans.SupTyp,
      RegRev: 'N',
      EcmGstin: null,
      IgstOnIntra: 'N',
    },
    DocDtls: {
      Typ: invoice.type === 'CREDIT_NOTE' ? 'CRN' : 'INV',
      No: invoice.invoiceNumber,
      Dt: ddMmYyyy(invoice.issuedAt ?? invoice.createdAt),
    },
    SellerDtls: {
      Gstin: seller.gstin,
      LglNm: seller.legalName,
      TrdNm: seller.tradeName,
      Addr1: seller.line1,
      Addr2: seller.line2,
      Loc: seller.city,
      Pin: parseInt(seller.pincode, 10),
      Stcd: seller.stateCode,
      Ph: seller.phone,
      Em: seller.email,
    },
    BuyerDtls: {
      Gstin: buyer.gstin ?? 'URP', // 'URP' = Unregistered Person
      LglNm: buyer.legalName,
      TrdNm: buyer.legalName,
      Addr1: buyer.line1 ?? 'NA',
      Addr2: buyer.line2 ?? undefined,
      Loc: buyer.city ?? 'NA',
      Pin: buyer.pincode ? parseInt(buyer.pincode, 10) : 0,
      Stcd: buyer.stateCode ?? invoice.placeOfSupply,
      Ph: buyer.phone ?? undefined,
      Em: buyer.email ?? undefined,
    },
    ItemList: itemList,
    ValDtls: {
      AssVal: paiseToRupees(invoice.taxableAmountPaise),
      CgstVal: paiseToRupees(invoice.cgstPaise),
      SgstVal: paiseToRupees(invoice.sgstPaise),
      IgstVal: paiseToRupees(invoice.igstPaise),
      CesVal: paiseToRupees(invoice.cessPaise),
      StCesVal: 0,
      // Coupon discounts are already netted out of AssVal (and out of each
      // item's AssAmt), so the document-level Discount must be 0 — the IRP
      // validates TotInvVal = AssVal + taxes + OthChrg − Discount, and
      // repeating the coupon here would double-deduct it.
      Discount: 0,
      OthChrg: 0,
      RndOffAmt: 0,
      TotInvVal: paiseToRupees(invoice.totalPaise),
      TotInvValFc: null,
    },
  };
}
