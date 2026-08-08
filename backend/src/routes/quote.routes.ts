import { Router } from 'express';
import { z } from 'zod';
import * as QuoteController from '../controllers/quote.controller';
import { protect } from '../middleware/auth';
import { restrictTo } from '../middleware/rbac';
import { requirePermission } from '../middleware/require-permission';
import { trackAdminActivity } from '../middleware/admin-activity';
import { Role, QuoteRequestStatus } from '@prisma/client';
import { validate } from '../validators/validate';
import { audit } from '../middleware/audit';
import { requireIdempotencyKey } from '../middleware/idempotency-key';
import { verifyTurnstile } from '../middleware/turnstile';

const submitSchema = z.object({
  companyName: z.string().min(2).max(160),
  contactPerson: z.string().min(2).max(160),
  designation: z.string().max(120).optional(),
  email: z.string().email().max(255),
  phone: z.string().min(6).max(20),
  employeeRange: z.string().max(60).optional(),
  hiringNeed: z.string().max(2000).optional(),
  requiredCvCount: z.number().int().min(1).max(100000).optional(),
  validityDays: z.number().int().min(1).max(365).optional(),
  expectedSeats: z.number().int().min(1).max(1000).optional(),
  currentToolStack: z.string().max(500).optional(),
  budgetRange: z.string().max(120).optional(),
  additionalNotes: z.string().max(2000).optional(),
});

const idParamsSchema = z.object({ id: z.string().uuid() });
const offerIdParamsSchema = z.object({ offerId: z.string().uuid() });

const createOfferSchema = z.object({
  basePricePaise: z.number().int().min(100),
  validityDays: z.number().int().min(1).max(730),
  cvUnlocks: z.number().int().min(1).max(1_000_000),
  seats: z.number().int().min(1).max(1000).optional(),
  features: z.record(z.string(), z.unknown()).optional(),
  resources: z.record(z.string(), z.unknown()).optional(),
  expiresAt: z.string().datetime().optional(),
});

const listQuerySchema = z.object({
  status: z.enum(QuoteRequestStatus).optional(),
  search: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// User-facing
const userRouter = Router();
// Quote SUBMIT is intentionally public — enterprise "Contact Sales"
// flows must work for guests browsing the pricing page. The controller
// stores req.user?.id (or null for guests). The other user-facing
// routes below (/me, /me/:id, /offers/:offerId/accept) still require
// auth and therefore sit BELOW the `userRouter.use(protect)` line.
userRouter.post(
  '/',
  requireIdempotencyKey(),
  // Turnstile CAPTCHA — required for all callers (guest + authed). Token
  // is read from the `cf-turnstile-response` header, matching the pattern
  // used by /auth/login + /auth/register. The middleware is a no-op when
  // CF_TURNSTILE_SECRET_KEY is unset in dev, so local testing isn't
  // blocked. Placed BEFORE schema validation to fail-fast on bot traffic
  // without spending DB capacity on Zod parsing.
  verifyTurnstile,
  validate({ body: submitSchema }),
  audit('SUBMIT_QUOTE_REQUEST', 'QuoteRequest'), // audit is a no-op when req.user is undefined
  QuoteController.submitQuote
);
userRouter.use(protect);
userRouter.get('/me', QuoteController.listMyQuotes);
userRouter.get('/me/:id', validate({ params: idParamsSchema }), QuoteController.getMyQuote);
userRouter.post(
  '/offers/:offerId/accept',
  validate({ params: offerIdParamsSchema }),
  audit('ACCEPT_CUSTOM_PLAN_OFFER', 'CustomPlanOffer'),
  QuoteController.acceptOffer
);

// Super-admin
const superAdminRouter = Router();
superAdminRouter.use(protect, restrictTo(Role.ADMIN, Role.SUPER_ADMIN));
superAdminRouter.use(trackAdminActivity);
superAdminRouter.get(
  '/',
  requirePermission('billing.quotes.view'),
  validate({ query: listQuerySchema }),
  QuoteController.listQuotesAdmin
);
superAdminRouter.get(
  '/:id',
  requirePermission('billing.quotes.view'),
  validate({ params: idParamsSchema }),
  QuoteController.getQuoteAdmin
);
superAdminRouter.post(
  '/:id/assign',
  requirePermission('billing.quotes.respond'),
  validate({
    params: idParamsSchema,
    body: z.object({ assignedToId: z.string().uuid() }),
  }),
  audit('ASSIGN_QUOTE', 'QuoteRequest'),
  QuoteController.assignQuote
);
superAdminRouter.post(
  '/:id/contacted',
  requirePermission('billing.quotes.respond'),
  validate({
    params: idParamsSchema,
    body: z.object({ notes: z.string().max(2000).optional() }),
  }),
  audit('MARK_QUOTE_CONTACTED', 'QuoteRequest'),
  QuoteController.markQuoteContacted
);
superAdminRouter.post(
  '/:id/reject',
  requirePermission('billing.quotes.respond'),
  validate({
    params: idParamsSchema,
    body: z.object({ reason: z.string().max(2000).optional() }),
  }),
  audit('REJECT_QUOTE', 'QuoteRequest'),
  QuoteController.rejectQuote
);
superAdminRouter.post(
  '/:id/offers',
  requirePermission('billing.quotes.convert'),
  validate({ params: idParamsSchema, body: createOfferSchema }),
  audit('CREATE_CUSTOM_PLAN_OFFER', 'CustomPlanOffer'),
  QuoteController.createOffer
);

export { userRouter as quoteUserRouter, superAdminRouter as quoteSuperAdminRouter };
export default userRouter;
