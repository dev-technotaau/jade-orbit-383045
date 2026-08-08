import type { Request, Response, NextFunction } from 'express';
import * as BillingAddressService from '../services/billing-address.service';
import { success, created, noContent } from '../utils/response';

export const list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const items = await BillingAddressService.listAddresses(req.user!.id);
    success(res, items, 'Billing addresses fetched');
  } catch (err) {
    next(err);
  }
};

export const get = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const item = await BillingAddressService.getAddress({
      userId: req.user!.id,
      id: req.params.id,
    });
    success(res, item, 'Billing address fetched');
  } catch (err) {
    next(err);
  }
};

export const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const item = await BillingAddressService.createAddress({
      userId: req.user!.id,
      data: req.body,
    });
    created(res, item, 'Billing address created');
  } catch (err) {
    next(err);
  }
};

export const update = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const item = await BillingAddressService.updateAddress({
      userId: req.user!.id,
      id: req.params.id,
      data: req.body,
    });
    success(res, item, 'Billing address updated');
  } catch (err) {
    next(err);
  }
};

export const remove = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await BillingAddressService.deleteAddress({ userId: req.user!.id, id: req.params.id });
    noContent(res);
  } catch (err) {
    next(err);
  }
};

export const setDefault = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const item = await BillingAddressService.setDefaultAddress({
      userId: req.user!.id,
      id: req.params.id,
    });
    success(res, item, 'Default billing address updated');
  } catch (err) {
    next(err);
  }
};
