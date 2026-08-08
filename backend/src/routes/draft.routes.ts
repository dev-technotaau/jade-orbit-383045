import { Router } from 'express';
import { protect } from '../middleware/auth';
import { validate } from '../validators/validate';
import * as draftController from '../controllers/draft.controller';
import { saveDraftSchema, listDraftsSchema } from '../schemas/draft.schema';

const router = Router();

// All draft routes require authentication
router.use(protect);

/**
 * @openapi
 * /api/v1/drafts:
 *   post:
 *     tags: [Drafts]
 *     summary: Save a form draft
 *     security: [{ bearerAuth: [] }]
 */
router.post('/', validate(saveDraftSchema), draftController.saveDraft);

/**
 * @openapi
 * /api/v1/drafts:
 *   get:
 *     tags: [Drafts]
 *     summary: List user's drafts
 *     security: [{ bearerAuth: [] }]
 */
router.get('/', validate(listDraftsSchema), draftController.getDrafts);

/**
 * @openapi
 * /api/v1/drafts/{id}:
 *   get:
 *     tags: [Drafts]
 *     summary: Get a specific draft
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id', draftController.getDraft);

/**
 * @openapi
 * /api/v1/drafts/{id}:
 *   delete:
 *     tags: [Drafts]
 *     summary: Delete a specific draft
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/:id', draftController.deleteDraft);

export default router;
