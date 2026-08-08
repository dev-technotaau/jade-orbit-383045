import { Router } from 'express';
import { protect } from '../middleware/auth';
import { restrictTo } from '../middleware/rbac';
import { trackAdminActivity } from '../middleware/admin-activity';
import { requireAnyPermission, requirePermission } from '../middleware/require-permission';
import { validate } from '../validators/validate';
import {
  createTicketSchema,
  createGuestTicketSchema,
  addMessageSchema,
  updateStatusSchema,
  assignTicketSchema,
  submitSatisfactionSchema,
} from '../schemas/ticket.schema';
import * as ticketController from '../controllers/ticket.controller';
import { Role } from '@prisma/client';
import { publicLimiter } from '../middleware/rate-limit';
import { audit } from '../middleware/audit';

const router = Router();

// Records admin mutations for the control centre's activity feed. The
// middleware resolves the caller's role at RESPONSE time, so it is safe
// here even though this router applies `protect` per-route.
router.use(trackAdminActivity);

// ── Public (guest) ──
router.post(
  '/guest',
  publicLimiter,
  validate(createGuestTicketSchema),
  ticketController.createGuestTicket
);

// ── Stats & Analytics (must be before /:id to avoid param collision) ──
router.get(
  '/stats',
  protect,
  restrictTo(Role.ADMIN, Role.SUPER_ADMIN),
  requirePermission('support.analytics'),
  ticketController.getTicketStats
);

// Was `restrictTo(Role.SUPER_ADMIN)` stacked ON TOP of the permission check,
// which made `support.analytics` dead code for admins — restrictTo rejected
// them first, so granting the permission did nothing. Matches `/stats` above.
router.get(
  '/analytics',
  protect,
  restrictTo(Role.ADMIN, Role.SUPER_ADMIN),
  requirePermission('support.analytics'),
  ticketController.getTicketAnalytics
);

// ── Authenticated user routes ──
router.post('/', protect, validate(createTicketSchema), ticketController.createTicket);

router.get('/my-tickets', protect, ticketController.listMyTickets);

router.get('/by-number/:ticketNumber', protect, ticketController.getTicketByNumber);

// ── Admin: list all tickets ──
// `support.tickets.view` (own assignments) OR `view_all` (whole queue) both
// open the queue endpoint; `listAllTickets` then forces the self-scope when
// the caller lacks `view_all`. Gating on `view_all` alone made the narrower
// `.view` grant unusable — its registry description promises "tickets
// assigned to you", which had no endpoint to deliver it.
router.get(
  '/all',
  protect,
  restrictTo(Role.ADMIN, Role.SUPER_ADMIN),
  requireAnyPermission('support.tickets.view_all', 'support.tickets.view'),
  ticketController.listAllTickets
);

// Assignee picker source. MUST be declared before `/:id`, or Express matches
// "agents" as a ticket id.
router.get(
  '/agents',
  protect,
  restrictTo(Role.ADMIN, Role.SUPER_ADMIN),
  requirePermission('support.tickets.assign'),
  ticketController.listAssignableAgents
);

// ── Ticket detail & actions (param routes last) ──
router.get('/:id', protect, ticketController.getTicket);

router.post('/:id/messages', protect, validate(addMessageSchema), ticketController.addMessage);

router.patch(
  '/:id/assign',
  protect,
  restrictTo(Role.ADMIN, Role.SUPER_ADMIN),
  requirePermission('support.tickets.assign'),
  validate(assignTicketSchema),
  audit('TICKET_ASSIGN', 'SupportTicket'),
  ticketController.assignTicket
);

router.patch(
  '/:id/status',
  protect,
  restrictTo(Role.ADMIN, Role.SUPER_ADMIN),
  requirePermission('support.tickets.status'),
  validate(updateStatusSchema),
  audit('TICKET_STATUS_CHANGE', 'SupportTicket'),
  ticketController.updateStatus
);

router.post('/:id/close', protect, ticketController.closeTicket);

router.post('/:id/reopen', protect, ticketController.reopenTicket);

router.post(
  '/:id/satisfaction',
  protect,
  validate(submitSatisfactionSchema),
  ticketController.submitSatisfaction
);

export default router;
