import { Router } from 'express';
import { protect } from '../middleware/auth';
import * as sessionController from '../controllers/session.controller';

const router = Router();
router.use(protect);

router.get('/', sessionController.listSessions);
router.delete('/:id', sessionController.revokeSession);
router.delete('/', sessionController.revokeAllSessions);

export default router;
