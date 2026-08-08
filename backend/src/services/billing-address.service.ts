import { prisma } from '../config/prisma';
import type { Prisma } from '@prisma/client';
import { type BillingAddress } from '@prisma/client';
import { AppError, NotFoundError } from '../exceptions';

export interface BillingAddressInput {
  label?: string;
  line1: string;
  line2?: string | null;
  city: string;
  stateName: string;
  stateCode: string;
  pincode: string;
  country?: string;
  countryCode?: string;
  gstNumber?: string | null;
  legalName?: string | null;
  isDefault?: boolean;
}

export async function listAddresses(userId: string): Promise<BillingAddress[]> {
  return prisma.billingAddress.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function getAddress(args: { userId: string; id: string }): Promise<BillingAddress> {
  const a = await prisma.billingAddress.findFirst({ where: { id: args.id, userId: args.userId } });
  if (!a) throw new NotFoundError('Billing address not found');
  return a;
}

export async function createAddress(args: {
  userId: string;
  data: BillingAddressInput;
}): Promise<BillingAddress> {
  validateBillingAddress(args.data);
  return prisma.$transaction(async (tx) => {
    if (args.data.isDefault) {
      await tx.billingAddress.updateMany({
        where: { userId: args.userId, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.billingAddress.create({
      data: {
        userId: args.userId,
        label: args.data.label,
        line1: args.data.line1,
        line2: args.data.line2 ?? null,
        city: args.data.city,
        stateName: args.data.stateName,
        stateCode: args.data.stateCode,
        pincode: args.data.pincode,
        country: args.data.country ?? 'India',
        countryCode: args.data.countryCode ?? 'IN',
        gstNumber: args.data.gstNumber ?? null,
        legalName: args.data.legalName ?? null,
        isDefault: args.data.isDefault ?? false,
      },
    });
  });
}

export async function updateAddress(args: {
  userId: string;
  id: string;
  data: Partial<BillingAddressInput>;
}): Promise<BillingAddress> {
  await getAddress({ userId: args.userId, id: args.id });
  if (args.data.line1 || args.data.city || args.data.pincode || args.data.stateCode) {
    validateBillingAddress({ ...(args.data as BillingAddressInput) }, /*partial*/ true);
  }
  return prisma.$transaction(async (tx) => {
    if (args.data.isDefault) {
      await tx.billingAddress.updateMany({
        where: { userId: args.userId, isDefault: true, id: { not: args.id } },
        data: { isDefault: false },
      });
    }
    const update: Prisma.BillingAddressUpdateInput = {
      label: args.data.label,
      line1: args.data.line1,
      line2: args.data.line2 ?? undefined,
      city: args.data.city,
      stateName: args.data.stateName,
      stateCode: args.data.stateCode,
      pincode: args.data.pincode,
      country: args.data.country,
      countryCode: args.data.countryCode,
      gstNumber: args.data.gstNumber ?? undefined,
      legalName: args.data.legalName ?? undefined,
      isDefault: args.data.isDefault,
    };
    return tx.billingAddress.update({
      where: { id: args.id },
      data: update,
    });
  });
}

export async function deleteAddress(args: { userId: string; id: string }): Promise<void> {
  const a = await getAddress({ userId: args.userId, id: args.id });
  // Don't allow deletion if this address is referenced by an unfinalised invoice.
  const linked = await prisma.invoice.count({ where: { billingAddressId: a.id } });
  if (linked > 0) {
    throw new AppError(
      'This address is linked to historical invoices and cannot be deleted',
      400,
      'BILLING_ADDRESS_IN_USE'
    );
  }
  await prisma.billingAddress.delete({ where: { id: a.id } });
}

export async function setDefaultAddress(args: {
  userId: string;
  id: string;
}): Promise<BillingAddress> {
  await getAddress({ userId: args.userId, id: args.id });
  return prisma.$transaction(async (tx) => {
    await tx.billingAddress.updateMany({
      where: { userId: args.userId, isDefault: true },
      data: { isDefault: false },
    });
    return tx.billingAddress.update({
      where: { id: args.id },
      data: { isDefault: true },
    });
  });
}

// =====================================================================
// Validators
// =====================================================================

const PINCODE_RE = /^[0-9]{6}$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const STATE_CODE_RE = /^[0-9]{2}$/;

function validateBillingAddress(data: Partial<BillingAddressInput>, partial = false): void {
  if (!partial) {
    if (!data.line1 || data.line1.trim().length < 3) {
      throw new AppError('Address line 1 is required', 400, 'INVALID_ADDRESS');
    }
    if (!data.city) throw new AppError('City is required', 400, 'INVALID_ADDRESS');
    if (!data.stateName) throw new AppError('State is required', 400, 'INVALID_ADDRESS');
  }
  if (data.pincode && !PINCODE_RE.test(data.pincode)) {
    throw new AppError('Invalid pincode (6 digits required)', 400, 'INVALID_PINCODE');
  }
  if (data.stateCode && !STATE_CODE_RE.test(data.stateCode)) {
    throw new AppError('Invalid state code (2 digits required)', 400, 'INVALID_STATE_CODE');
  }
  if (data.gstNumber && !GSTIN_RE.test(data.gstNumber)) {
    throw new AppError('Invalid GSTIN format', 400, 'INVALID_GSTIN');
  }
}
