import { Router } from 'express';
import { protect } from '../middleware/auth';
import * as optinCtrl from '../controllers/whatsapp-optin.controller';

const router = Router();

// Logged-in user self-serve WhatsApp opt-in/out for THEIR OWN number.
// No SUPER_ADMIN gate — this acts only on the caller's own contact record.
router.use(protect);

router.post('/', optinCtrl.setOptIn);

export default router;
