import type { Job } from 'bullmq';
import { VendorLeadStatus } from '@prisma/client';
import prisma from '../config/prisma';
import logger from '../config/logger';

/**
 * Sweep handler — flips PENDING vendor leads past their `expiresAt` to
 * EXPIRED. Hourly cadence (see `vendor-lead-expiry.queue.ts`).
 *
 * Best-effort: per-batch row count returned for log visibility, but a
 * single bulk `updateMany` does the work — no N+1.
 */
export async function handleVendorLeadExpiry(_job: Job): Promise<{ expired: number }> {
  const now = new Date();
  const result = await prisma.vendorLead.updateMany({
    where: {
      status: VendorLeadStatus.PENDING,
      expiresAt: { lt: now },
    },
    data: {
      status: VendorLeadStatus.EXPIRED,
    },
  });
  if (result.count > 0) {
    logger.info(`vendor-lead-expiry — flipped ${result.count} stale leads to EXPIRED`);
  }
  return { expired: result.count };
}
