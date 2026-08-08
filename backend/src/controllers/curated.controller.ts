/**
 * Controller for /api/v1/public/curated/* — exposes curated listings
 * for the header mega-menu, footer mega-section, and SEO landings.
 */
import type { Request, Response, NextFunction } from 'express';
import { CuratedType } from '@prisma/client';
import * as curatedService from '../services/curated.service';
import { BadRequestError, NotFoundError } from '../exceptions';

const VALID_TYPES = new Set(Object.values(CuratedType));

export const listByType = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const type = String(req.params.type || '').toUpperCase() as CuratedType;
    if (!VALID_TYPES.has(type)) throw new BadRequestError('Invalid curated type');
    const featured = req.query.featured === 'true';
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const items = await curatedService.listByType(type, { isFeatured: featured, limit });
    res.status(200).json({ status: 'success', data: { items } });
  } catch (err) {
    next(err);
  }
};

export const getBySlug = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = String(req.params.slug || '');
    const row = await curatedService.getBySlug(slug);
    if (!row) throw new NotFoundError('Curated listing not found');
    res.status(200).json({ status: 'success', data: row });
  } catch (err) {
    next(err);
  }
};

export const listAllForMenu = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Bulk fetch for the header mega-menu — 6 types × ~12 entries each.
    const items = await curatedService.listAllByTypes([
      CuratedType.JOB_CATEGORY,
      CuratedType.JOB_DEMAND,
      CuratedType.JOB_LOCATION,
      CuratedType.JOB_QUALIFICATION,
      CuratedType.COMPANY_CATEGORY,
      CuratedType.COMPANY_COLLECTION,
    ]);
    // Group by type for easy frontend consumption.
    const grouped: Record<string, typeof items> = {};
    for (const it of items) {
      grouped[it.type] = grouped[it.type] || [];
      grouped[it.type].push(it);
    }
    res.status(200).json({ status: 'success', data: grouped });
  } catch (err) {
    next(err);
  }
};

export const listForFooter = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await curatedService.listAllByTypes([
      CuratedType.JOB_LOCATION,
      CuratedType.JOB_DEMAND,
      CuratedType.JOB_DEPARTMENT,
    ]);
    const grouped: Record<string, typeof items> = {};
    for (const it of items) {
      grouped[it.type] = grouped[it.type] || [];
      grouped[it.type].push(it);
    }
    res.status(200).json({ status: 'success', data: grouped });
  } catch (err) {
    next(err);
  }
};
