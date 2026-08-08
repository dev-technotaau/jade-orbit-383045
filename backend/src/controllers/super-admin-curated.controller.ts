/**
 * Super-admin controller for the CuratedListing editorial CMS.
 *
 * Backs the /super-admin/curated-listings UI: list with filter +
 * search, create, edit, delete, drag-to-reorder, toggle public /
 * featured.
 */
import type { Request, Response, NextFunction } from 'express';
import { CuratedType } from '@prisma/client';
import * as curatedService from '../services/curated.service';
import { BadRequestError, NotFoundError } from '../exceptions';

const VALID_TYPES = new Set(Object.values(CuratedType));

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const typeRaw =
      typeof req.query.type === 'string' ? (req.query.type as string).toUpperCase() : undefined;
    if (typeRaw && !VALID_TYPES.has(typeRaw as CuratedType)) {
      throw new BadRequestError('Invalid curated type');
    }

    const result = await curatedService.adminList({
      type: (typeRaw as CuratedType | undefined) ?? undefined,
      isPublic:
        req.query.isPublic === 'true' ? true : req.query.isPublic === 'false' ? false : undefined,
      isFeatured:
        req.query.isFeatured === 'true'
          ? true
          : req.query.isFeatured === 'false'
            ? false
            : undefined,
      q: typeof req.query.q === 'string' ? (req.query.q as string) : undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    });

    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

export const getById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const row = await curatedService.adminGetById(id);
    if (!row) throw new NotFoundError('Curated listing not found');
    res.status(200).json({ status: 'success', data: row });
  } catch (err) {
    next(err);
  }
};

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const row = await curatedService.adminCreate(req.body);
    res.status(201).json({ status: 'success', data: row });
  } catch (err) {
    next(err);
  }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const row = await curatedService.adminUpdate(id, req.body);
    res.status(200).json({ status: 'success', data: row });
  } catch (err) {
    next(err);
  }
};

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    await curatedService.adminDelete(id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

export const reorder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = (req.body?.items ?? []) as Array<{ id: string; displayOrder: number }>;
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestError('items[] required');
    }
    await curatedService.adminReorder(items);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};
