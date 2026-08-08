import { Router } from 'express';
import * as webauthnController from '../controllers/webauthn.controller';
import { validate } from '../validators/validate';
import { protect } from '../middleware/auth';
import {
  registerVerifySchema,
  loginOptionsSchema,
  loginVerifySchema,
  deleteCredentialSchema,
} from '../schemas/webauthn.schema';

const router = Router();

// ===============================
// Registration (Protected)
// ===============================
router.post('/register/options', protect, webauthnController.getRegistrationOptions);
router.post(
  '/register/verify',
  protect,
  validate(registerVerifySchema),
  webauthnController.verifyRegistration
);

// ===============================
// Authentication (Public)
// ===============================
router.post(
  '/login/options',
  validate(loginOptionsSchema),
  webauthnController.getAuthenticationOptions
);
router.post('/login/verify', validate(loginVerifySchema), webauthnController.verifyAuthentication);

// ===============================
// Credential Management (Protected)
// ===============================
router.get('/credentials', protect, webauthnController.listCredentials);
router.delete(
  '/credentials/:id',
  protect,
  validate(deleteCredentialSchema),
  webauthnController.deleteCredential
);

export default router;
