import { Router } from 'express';
import * as candidateListController from '../controllers/candidate-list.controller';
import { protect } from '../middleware/auth';
import { restrictTo } from '../middleware/rbac';
import { validate } from '../validators/validate';
import {
  createListSchema,
  updateListSchema,
  addCandidatesToListSchema,
} from '../schemas/candidate-list.schema';
import { Role } from '@prisma/client';

const router = Router();

// All routes require authentication and EMPLOYER role
router.use(protect, restrictTo(Role.EMPLOYER));

// List CRUD
router.post('/', validate({ body: createListSchema }), candidateListController.createList);
router.get('/', candidateListController.getLists);
router.get('/:listId', candidateListController.getList);
router.put('/:listId', validate({ body: updateListSchema }), candidateListController.updateList);
router.delete('/:listId', candidateListController.deleteList);

// List member management
router.post(
  '/:listId/candidates',
  validate({ body: addCandidatesToListSchema }),
  candidateListController.addCandidatesToList
);
router.delete('/:listId/candidates/:candidateId', candidateListController.removeCandidateFromList);
router.patch('/:listId/candidates/:candidateId/notes', candidateListController.updateMemberNotes);

export default router;
