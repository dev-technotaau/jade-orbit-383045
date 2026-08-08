import { Router } from 'express';
import { protect } from '../middleware/auth';
import * as savedSearchController from '../controllers/saved-search.controller';
import { validate } from '../validators/validate';
import { saveSearchSchema, updateSavedSearchSchema } from '../schemas/saved-search.schema';

const router = Router();

router.use(protect);

router.post('/', validate(saveSearchSchema), savedSearchController.saveSearch);
router.get('/', savedSearchController.listSavedSearches);
router.put('/:id', validate(updateSavedSearchSchema), savedSearchController.updateSavedSearch);
router.delete('/:id', savedSearchController.deleteSavedSearch);

export default router;
