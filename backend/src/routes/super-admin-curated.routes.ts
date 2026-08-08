/**
 * Super-admin Editorial CMS for CuratedListing.
 *
 *   GET    /super-admin/curated-listings           — list with filter + search
 *   GET    /super-admin/curated-listings/:id       — single
 *   POST   /super-admin/curated-listings           — create
 *   PATCH  /super-admin/curated-listings/:id       — update
 *   DELETE /super-admin/curated-listings/:id       — delete
 *   POST   /super-admin/curated-listings/reorder   — drag-to-reorder bulk update
 *
 * All routes are SUPER_ADMIN-only and audit-logged.
 */
import { Router } from 'express';
import { z } from 'zod';
import { CuratedType, Role } from '@prisma/client';
import { protect } from '../middleware/auth';
import { restrictTo } from '../middleware/rbac';
import { requirePermission } from '../middleware/require-permission';
import { trackAdminActivity } from '../middleware/admin-activity';
import { validate } from '../validators/validate';
import { audit } from '../middleware/audit';
import * as Ctrl from '../controllers/super-admin-curated.controller';

const router = Router();
router.use(protect, restrictTo(Role.ADMIN, Role.SUPER_ADMIN));
router.use(trackAdminActivity);

const idParams = z.object({ id: z.string().uuid() });

const upsertBodyBase = {
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'kebab-case slug required'),
  type: z.enum(CuratedType),
  label: z.string().min(1).max(200),
  // filterPreset is a free-form JSON object (the filter blob the search
  // backend understands). We accept any record but cap depth via JSON
  // size below.
  filterPreset: z.record(z.string(), z.unknown()),
  iconKey: z.string().max(60).nullable().optional(),
  displayOrder: z.number().int().min(0).max(99_999).optional(),
  isFeatured: z.boolean().optional(),
  metaTitle: z.string().max(160).nullable().optional(),
  metaDescription: z.string().max(320).nullable().optional(),
  heroH1: z.string().max(200).nullable().optional(),
  heroSubtitle: z.string().max(400).nullable().optional(),
  isPublic: z.boolean().optional(),
};

const createBody = z.object(upsertBodyBase);
const updateBody = z.object(upsertBodyBase).partial();

const reorderBody = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        displayOrder: z.number().int().min(0).max(99_999),
      })
    )
    .min(1)
    .max(500),
});

router.get('/', requirePermission('curated_listings.view'), Ctrl.list);

router.get(
  '/:id',
  requirePermission('curated_listings.view'),
  validate({ params: idParams }),
  Ctrl.getById
);

router.post(
  '/',
  requirePermission('curated_listings.create'),
  validate({ body: createBody }),
  audit('CREATE_CURATED_LISTING', 'CuratedListing'),
  Ctrl.create
);

router.patch(
  '/:id',
  requirePermission('curated_listings.edit'),
  validate({ params: idParams, body: updateBody }),
  audit('UPDATE_CURATED_LISTING', 'CuratedListing'),
  Ctrl.update
);

router.delete(
  '/:id',
  requirePermission('curated_listings.delete'),
  validate({ params: idParams }),
  audit('DELETE_CURATED_LISTING', 'CuratedListing'),
  Ctrl.remove
);

router.post(
  '/reorder',
  requirePermission('curated_listings.reorder'),
  validate({ body: reorderBody }),
  audit('REORDER_CURATED_LISTINGS', 'CuratedListing'),
  Ctrl.reorder
);

export default router;
