import type { Request, Response, NextFunction } from 'express';
import { ticketService } from '../services/ticket.service';
import type { TicketStatus } from '@prisma/client';
import { assertPermission, hasPermission } from '../middleware/require-permission';

export const createTicket = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticket = await ticketService.createTicket(req.user!.id, req.body);
    res.status(201).json({
      status: 'success',
      message: `Ticket ${ticket.ticketNumber} created successfully`,
      data: ticket,
    });
  } catch (error) {
    next(error);
  }
};

export const createGuestTicket = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticket = await ticketService.createGuestTicket(req.body);
    res.status(201).json({
      status: 'success',
      message: `Your ticket ${ticket.ticketNumber} has been created. We will respond within 24 hours.`,
      data: { id: ticket.id, ticketNumber: ticket.ticketNumber },
    });
  } catch (error) {
    next(error);
  }
};

export const getTicket = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // `isAdmin` here means "may read ANY ticket, including internal notes",
    // so it has to be a PERMISSION check rather than a role check. An admin
    // without `support.tickets.view_all` falls through to the owner-scoped
    // path and sees only their own tickets — which is exactly what the
    // registry's "tickets assigned to you" description promises.
    const isAdmin = await hasPermission(req, 'support.tickets.view_all');
    const ticket = await ticketService.getTicketById(
      req.params.id as string,
      req.user!.id,
      isAdmin
    );
    res.status(200).json({ status: 'success', data: ticket });
  } catch (error) {
    next(error);
  }
};

export const getTicketByNumber = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isAdmin = await hasPermission(req, 'support.tickets.view_all');
    const ticket = await ticketService.getTicketByNumber(
      req.params.ticketNumber as string,
      req.user!.id,
      isAdmin
    );
    res.status(200).json({ status: 'success', data: ticket });
  } catch (error) {
    next(error);
  }
};

export const listMyTickets = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as TicketStatus | undefined;
    const result = await ticketService.listUserTickets(req.user!.id, page, limit, status);
    res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
};

export const listAllTickets = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // An admin holding only `support.tickets.view` sees the queue narrowed
    // to their own assignments; `view_all` is what lifts that. Forcing the
    // filter server-side means the narrow grant cannot be widened by simply
    // omitting the query param.
    const canSeeAll = await hasPermission(req, 'support.tickets.view_all');
    const result = await ticketService.listTickets({
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
      status: req.query.status as TicketStatus | undefined,
      priority: req.query.priority as any,
      category: req.query.category as any,
      assignedToId: canSeeAll ? (req.query.assignedToId as string | undefined) : req.user!.id,
      search: req.query.search as string | undefined,
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
};

export const addMessage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // ── "Am I replying AS STAFF?" is the REPLY permission, not view_all ──
    // Keying this on `support.tickets.view_all` broke the core help-desk
    // flow: an agent granted `support.tickets.view` + `.reply` and ASSIGNED
    // to a ticket resolved to isAdmin=false, so their reply was stamped
    // `senderType: 'USER'` and then rejected outright by the service's
    // ownership check (they are not the requester) — a 403 on the one action
    // their grant exists to permit. Scoped visibility and the right to reply
    // are different permissions; only the latter decides staff identity.
    //
    // `hasPermission` returns false for every non-ADMIN role, so candidates
    // and employers replying to their own ticket still take the USER path.
    const isStaff = await hasPermission(req, 'support.tickets.reply');
    if (isStaff && req.body.isInternal) await assertPermission(req, 'support.tickets.notes');
    const senderType = isStaff ? 'ADMIN' : 'USER';
    const senderName =
      [req.user!.firstName, req.user!.lastName].filter(Boolean).join(' ') || req.user!.email;

    const message = await ticketService.addMessage(
      req.params.id as string,
      req.user!.id,
      senderType,
      senderName,
      req.body.body,
      isStaff ? req.body.isInternal : false, // Only staff can create internal notes
      req.body.subject // Optional subject for email replies
    );

    res.status(201).json({ status: 'success', data: message });
  } catch (error) {
    next(error);
  }
};

export const assignTicket = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticket = await ticketService.assignTicket(req.params.id as string, req.body.assignedToId);
    res.status(200).json({ status: 'success', data: ticket });
  } catch (error) {
    next(error);
  }
};

export const updateStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticket = await ticketService.updateStatus(req.params.id as string, req.body.status);
    res.status(200).json({ status: 'success', data: ticket });
  } catch (error) {
    next(error);
  }
};

export const closeTicket = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Closing someone ELSE's ticket is the agent action. Closing your own
    // stays available to the owner via the service's own ownership check.
    const isAdmin = await hasPermission(req, 'support.tickets.close');
    const ticket = await ticketService.closeTicket(req.params.id as string, req.user!.id, isAdmin);
    res.status(200).json({ status: 'success', data: ticket });
  } catch (error) {
    next(error);
  }
};

export const reopenTicket = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticket = await ticketService.reopenTicket(req.params.id as string, req.user!.id);
    res.status(200).json({ status: 'success', data: ticket });
  } catch (error) {
    next(error);
  }
};

export const submitSatisfaction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticket = await ticketService.submitSatisfaction(
      req.params.id as string,
      req.user!.id,
      req.body.satisfaction,
      req.body.comment
    );
    res.status(200).json({ status: 'success', data: ticket });
  } catch (error) {
    next(error);
  }
};

export const getTicketStats = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await ticketService.getTicketStats();
    res.status(200).json({ status: 'success', data: stats });
  } catch (error) {
    next(error);
  }
};

export const getTicketAnalytics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    const analytics = await ticketService.getTicketAnalytics(startDate, endDate);
    res.status(200).json({ status: 'success', data: analytics });
  } catch (error) {
    next(error);
  }
};

/**
 * Agents a ticket can be assigned to.
 *
 * Purpose-built rather than reusing `/admin/users?role=ADMIN`: that endpoint
 * deliberately refuses to enumerate admin accounts (they are managed only
 * from Manage Admins, and `admin.service.getUsers` filters ADMIN/SUPER_ADMIN
 * out of `visibleRoles`). The assignee picker was its only consumer, so
 * closing that hole left ticket routing with an empty dropdown.
 *
 * Returns the minimum needed to render a picker — id and display name — and
 * nothing else. No counts, no activity, no PII beyond the work email that
 * already appears on every ticket the agent touches.
 */
export const listAssignableAgents = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const agents = await ticketService.listAssignableAgents();
    res.status(200).json({ status: 'success', data: agents });
  } catch (error) {
    next(error);
  }
};
