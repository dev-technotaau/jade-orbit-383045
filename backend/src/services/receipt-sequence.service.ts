import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { getFinancialYear } from './pricing.service';

/**
 * Atomic FY-aware sequence generator. Produces e.g. `HA/2026-27/00001`.
 *
 * Two consumers (right now): receipt numbers on `Order` (used as
 * `razorpay_order.receipt`) and invoice numbers on `Invoice`.
 *
 * Implementation notes:
 *   - PostgreSQL `INSERT ... ON CONFLICT ... DO UPDATE RETURNING` gives an
 *     atomic increment without a SELECT-then-UPDATE race.
 *   - Sequence is namespaced by `(financialYear, prefix)` so different
 *     prefixes (`HA` for orders, optional `INV` later) don't collide.
 *   - Numbers are zero-padded to 5 digits (caller can re-format if needed).
 */
export async function nextReceiptNumber(prefix?: string): Promise<{
  financialYear: string;
  prefix: string;
  number: number;
  formatted: string;
}> {
  const fy = getFinancialYear();
  const px = prefix ?? env.HA_INVOICE_PREFIX ?? 'HA';

  const result = await prisma.$transaction(async (tx) => {
    const row = await tx.invoiceSequence.upsert({
      where: { financialYear_prefix: { financialYear: fy, prefix: px } },
      update: { lastNumber: { increment: 1 } },
      create: { financialYear: fy, prefix: px, lastNumber: 1 },
      select: { lastNumber: true },
    });
    return row;
  });

  const padded = String(result.lastNumber).padStart(5, '0');
  return {
    financialYear: fy,
    prefix: px,
    number: result.lastNumber,
    formatted: `${px}/${fy}/${padded}`,
  };
}
