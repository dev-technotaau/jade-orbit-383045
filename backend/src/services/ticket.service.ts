import { prisma } from '../config/prisma';
import {
  Role,
  TicketStatus,
  TicketCategory,
  TicketPriority,
  TicketSatisfaction,
  NotificationType,
} from '@prisma/client';
import { notificationService } from './notification.service';
import { emailService } from './email.service';
import { AppError } from '../middleware/error';
import logger from '../config/logger';
import {
  ticketConfirmation,
  ticketNewAdmin,
  ticketReplyAdmin,
  ticketReplyUser,
  ticketReplyGuest,
  ticketStatusChange,
  ticketEscalation,
} from '../templates/email/ticket';

class TicketService {
  /**
   * Sanitize HTML to prevent XSS attacks
   */
  private sanitizeHtml(html: string): string {
    // Import DOMPurify or use a simple regex-based sanitizer
    // For now, allow basic formatting tags only
    const allowedTags =
      /<\/?(?:p|br|strong|b|em|i|u|ul|ol|li|h1|h2|h3|h4|h5|h6|a|span|div)[^>]*>/gi;
    const sanitized = html.replace(/<[^>]*>/gi, (tag) => {
      return allowedTags.test(tag) ? tag : '';
    });
    return sanitized;
  }

  /**
   * Generate next ticket number (TKT-000001 format)
   */
  private async generateTicketNumber(): Promise<string> {
    const lastTicket = await prisma.supportTicket.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { ticketNumber: true },
    });

    let nextNum = 1;
    if (lastTicket?.ticketNumber) {
      const match = lastTicket.ticketNumber.match(/TKT-(\d+)/);
      if (match) nextNum = parseInt(match[1], 10) + 1;
    }

    return `TKT-${String(nextNum).padStart(6, '0')}`;
  }

  /**
   * Create ticket from authenticated user
   */
  async createTicket(
    userId: string,
    data: {
      subject: string;
      description: string;
      category?: TicketCategory;
      priority?: TicketPriority;
    }
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, email: true, role: true },
    });
    if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND');

    const ticketNumber = await this.generateTicketNumber();
    const senderName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

    // Plan-promise: "Priority Support" / "Priority WhatsApp Support" /
    // "WhatsApp Support" should actually triage the ticket higher in
    // the support queue. Bump priority to HIGH when the user holds any
    // of those entitlements (and no explicit priority was passed by
    // the caller). Failures degrade silently — we'd rather create the
    // ticket at MEDIUM than block on entitlement lookup.
    let resolvedPriority: TicketPriority = data.priority || TicketPriority.MEDIUM;
    if (!data.priority) {
      try {
        const { getActiveEntitlementsForUser } = await import('./entitlement.service');
        const snapshot = await getActiveEntitlementsForUser(userId);
        const hasPriority =
          snapshot.features['feature.priority_support'] ||
          snapshot.features['feature.whatsapp_priority'] ||
          snapshot.features['feature.whatsapp_support'] ||
          snapshot.features['feature.dedicated_support'];
        if (hasPriority) resolvedPriority = TicketPriority.HIGH;
      } catch {
        /* keep MEDIUM */
      }
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        ticketNumber,
        subject: data.subject,
        description: data.description,
        category: data.category || TicketCategory.GENERAL,
        priority: resolvedPriority,
        userId,
        messages: {
          create: {
            senderId: userId,
            senderType: 'USER',
            senderName,
            body: data.description,
          },
        },
      },
      include: { messages: true },
    });

    // Notify admins (fire-and-forget)
    this.notifyAdminsNewTicket(ticket, senderName, user.role).catch(() => {});

    // Send confirmation email to user (fire-and-forget)
    this.sendTicketConfirmationEmail(
      user.email,
      ticket.ticketNumber,
      ticket.subject,
      user.role
    ).catch(() => {});

    return ticket;
  }

  /**
   * Create ticket from guest (public contact form)
   */
  async createGuestTicket(data: {
    name: string;
    email: string;
    subject: string;
    description: string;
    category?: TicketCategory;
  }) {
    const ticketNumber = await this.generateTicketNumber();

    const ticket = await prisma.supportTicket.create({
      data: {
        ticketNumber,
        subject: data.subject,
        description: data.description,
        category: data.category || TicketCategory.GENERAL,
        priority: TicketPriority.MEDIUM,
        guestName: data.name,
        guestEmail: data.email,
        messages: {
          create: {
            senderType: 'GUEST',
            senderName: data.name,
            body: data.description,
          },
        },
      },
      include: { messages: true },
    });

    // Notify admins (fire-and-forget)
    this.notifyAdminsNewTicket(ticket, data.name, null).catch(() => {});

    // Send confirmation email to guest (fire-and-forget)
    this.sendTicketConfirmationEmail(data.email, ticket.ticketNumber, ticket.subject).catch(
      () => {}
    );

    return ticket;
  }

  /**
   * Get ticket by ID with messages
   */
  async getTicketById(ticketId: string, requestingUserId?: string, isAdmin = false) {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        messages: {
          where: isAdmin ? {} : { isInternal: false },
          orderBy: { createdAt: 'asc' },
        },
        user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!ticket) throw new AppError('Ticket not found', 404, 'TICKET_NOT_FOUND');

    // Who may read this ticket:
    //   • `isAdmin` — the caller holds `support.tickets.view_all` (resolved in
    //     the controller), so the whole queue is theirs.
    //   • the OWNER — their own ticket.
    //   • the ASSIGNEE — an agent holding only the narrower
    //     `support.tickets.view` ("tickets assigned to you"). Without this
    //     branch that grant is unusable: the agent can list their assigned
    //     tickets but 403s opening every one of them.
    const isOwner = ticket.userId === requestingUserId;
    const isAssignee = Boolean(requestingUserId) && ticket.assignedToId === requestingUserId;
    if (!isAdmin && !isOwner && !isAssignee) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    // Internal notes are staff-only. The owner never sees them, and neither
    // does an assignee who lacks the notes permission — but the assignee IS
    // staff, so the include above (keyed on `isAdmin`) would have hidden them
    // from a legitimate agent. Re-filter here rather than widening `isAdmin`,
    // which also controls queue-wide access.
    if (!isAdmin && !isAssignee) {
      ticket.messages = ticket.messages.filter((m) => !m.isInternal);
    }

    return ticket;
  }

  /**
   * Get ticket by ticket number
   */
  /**
   * Look a ticket up by its human-readable number.
   *
   * `requestingUserId`/`isAdmin` are the same authorisation pair
   * `getTicketById` takes. Without them this was an unscoped read: any
   * authenticated candidate or employer who guessed or was shown a ticket
   * number could pull the full thread — subject, body, and the requester's
   * name — for someone else's support case. Ticket numbers are sequential
   * and printed in emails, so this was not a hard thing to hit.
   */
  async getTicketByNumber(ticketNumber: string, requestingUserId?: string, isAdmin = false) {
    const ticket = await prisma.supportTicket.findUnique({
      where: { ticketNumber },
      include: {
        messages: {
          where: { isInternal: false },
          orderBy: { createdAt: 'asc' },
        },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!ticket) throw new AppError('Ticket not found', 404, 'TICKET_NOT_FOUND');

    // Same rule as getTicketById: queue-wide readers, the owner, or the
    // assigned agent.
    const isOwner = ticket.userId === requestingUserId;
    const isAssignee = Boolean(requestingUserId) && ticket.assignedToId === requestingUserId;
    if (!isAdmin && !isOwner && !isAssignee) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    return ticket;
  }

  /**
   * List tickets with filters (admin)
   */
  async listTickets(filters: {
    page?: number;
    limit?: number;
    status?: TicketStatus;
    priority?: TicketPriority;
    category?: TicketCategory;
    assignedToId?: string;
    search?: string;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;

    const where: Record<string, unknown> = {};
    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.category) where.category = filters.category;
    if (filters.assignedToId) where.assignedToId = filters.assignedToId;
    if (filters.search) {
      where.OR = [
        { subject: { contains: filters.search, mode: 'insensitive' } },
        { ticketNumber: { contains: filters.search, mode: 'insensitive' } },
        { guestName: { contains: filters.search, mode: 'insensitive' } },
        { guestEmail: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { messages: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.supportTicket.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    };
  }

  /**
   * List user's own tickets
   */
  async listUserTickets(userId: string, page = 1, limit = 20, status?: TicketStatus) {
    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        include: {
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { messages: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.supportTicket.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    };
  }

  /**
   * Add message to ticket
   */
  async addMessage(
    ticketId: string,
    senderId: string | null,
    senderType: string,
    senderName: string,
    body: string,
    isInternal = false,
    subject?: string
  ) {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            mobileNumber: true,
            whatsappNumber: true,
            isWhatsappVerified: true,
          },
        },
        assignedTo: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    if (!ticket) throw new AppError('Ticket not found', 404, 'TICKET_NOT_FOUND');

    // ── Authorisation ──
    // This had NO ownership check: any authenticated user who learned a
    // ticket id could inject a message into someone else's support thread,
    // which then reopened their ticket and emailed/notified them as though
    // the reply were genuine.
    //
    // Staff (`senderType === 'ADMIN'`) are already authorised by the
    // controller's `support.tickets.reply` check. Everyone else must be the
    // ticket's owner. `senderId === null` is the inbound-email/system path,
    // which is matched to the thread upstream rather than by a caller.
    if (senderType !== 'ADMIN' && senderId && ticket.userId !== senderId) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    if (ticket.status === TicketStatus.CLOSED) {
      throw new AppError(
        'Cannot reply to a closed ticket. Please reopen it first.',
        400,
        'TICKET_CLOSED'
      );
    }

    // Sanitize HTML body for XSS protection
    const sanitizedBody = this.sanitizeHtml(body);

    const message = await prisma.ticketMessage.create({
      data: {
        ticketId,
        senderId,
        senderType,
        senderName,
        body: sanitizedBody,
        isInternal,
        subject,
      },
    });

    // Update ticket status and timestamps
    const updateData: Record<string, unknown> = {};

    if (senderType === 'ADMIN' && !ticket.firstResponseAt) {
      updateData.firstResponseAt = new Date();
    }

    if (senderType === 'ADMIN' && !isInternal) {
      updateData.status = TicketStatus.AWAITING_REPLY;
    } else if (senderType === 'USER' || senderType === 'GUEST') {
      if (
        ticket.status === TicketStatus.AWAITING_REPLY ||
        ticket.status === TicketStatus.RESOLVED
      ) {
        updateData.status = TicketStatus.OPEN;
      }
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.supportTicket.update({ where: { id: ticketId }, data: updateData });
    }

    // Send notifications (fire-and-forget, skip internal notes)
    if (!isInternal) {
      if (senderType === 'ADMIN') {
        this.notifyUserTicketReply(ticket, body, subject).catch(() => {});
      } else {
        this.notifyAdminsTicketReply(ticket, senderName, body).catch(() => {});
      }
    }

    return message;
  }

  /**
   * Assign ticket to admin
   */
  async assignTicket(ticketId: string, adminId: string) {
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
      select: { id: true, role: true, firstName: true, lastName: true },
    });

    if (!admin || (admin.role !== Role.ADMIN && admin.role !== Role.SUPER_ADMIN)) {
      throw new AppError('Invalid admin user', 400, 'INVALID_ADMIN');
    }

    const ticket = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        assignedToId: adminId,
        status: TicketStatus.IN_PROGRESS,
      },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Add system message
    const adminName = [admin.firstName, admin.lastName].filter(Boolean).join(' ');
    await prisma.ticketMessage.create({
      data: {
        ticketId,
        senderType: 'SYSTEM',
        senderName: 'System',
        body: `Ticket assigned to ${adminName}`,
        isInternal: true,
      },
    });

    return ticket;
  }

  /**
   * Update ticket status
   */
  async updateStatus(ticketId: string, status: TicketStatus) {
    const updateData: Record<string, unknown> = { status };

    if (status === TicketStatus.RESOLVED) {
      updateData.resolvedAt = new Date();
    } else if (status === TicketStatus.CLOSED) {
      updateData.closedAt = new Date();
    }

    const ticket = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            whatsappNumber: true,
            mobileNumber: true,
            isWhatsappVerified: true,
          },
        },
      },
    });

    // Add system message
    await prisma.ticketMessage.create({
      data: {
        ticketId,
        senderType: 'SYSTEM',
        senderName: 'System',
        body: `Ticket status changed to ${status.replace('_', ' ')}`,
      },
    });

    // Notify user of status change
    this.notifyUserStatusChange(ticket, status).catch(() => {});

    return ticket;
  }

  /**
   * Close ticket (by user or admin)
   */
  async closeTicket(ticketId: string, closedById: string, isAdmin: boolean) {
    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new AppError('Ticket not found', 404, 'TICKET_NOT_FOUND');

    if (!isAdmin && ticket.userId !== closedById) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    return this.updateStatus(ticketId, TicketStatus.CLOSED);
  }

  /**
   * Reopen ticket (by owner)
   */
  async reopenTicket(ticketId: string, userId: string) {
    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new AppError('Ticket not found', 404, 'TICKET_NOT_FOUND');

    if (ticket.userId !== userId) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    if (ticket.status !== TicketStatus.CLOSED && ticket.status !== TicketStatus.RESOLVED) {
      throw new AppError('Only closed or resolved tickets can be reopened', 400, 'INVALID_STATUS');
    }

    const updated = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: TicketStatus.OPEN, closedAt: null, resolvedAt: null },
    });

    await prisma.ticketMessage.create({
      data: {
        ticketId,
        senderId: userId,
        senderType: 'SYSTEM',
        senderName: 'System',
        body: 'Ticket reopened by user',
      },
    });

    return updated;
  }

  /**
   * Submit satisfaction rating
   */
  async submitSatisfaction(
    ticketId: string,
    userId: string,
    satisfaction: TicketSatisfaction,
    comment?: string
  ) {
    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new AppError('Ticket not found', 404, 'TICKET_NOT_FOUND');

    if (ticket.userId !== userId) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    const updated = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        satisfaction,
        satisfactionComment: comment || null,
      },
    });

    // If not satisfied, escalate to super-admins and reopen
    if (satisfaction === TicketSatisfaction.NOT_SATISFIED) {
      await prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: TicketStatus.OPEN, closedAt: null, resolvedAt: null },
      });

      await prisma.ticketMessage.create({
        data: {
          ticketId,
          senderType: 'SYSTEM',
          senderName: 'System',
          body: `User rated as "Not Satisfied"${comment ? `: ${comment}` : ''}. Ticket reopened and escalated.`,
        },
      });

      this.escalateNotSatisfied(ticket).catch(() => {});
    }

    return updated;
  }

  /**
   * Ticket stats for admin/super-admin
   */
  /**
   * Admin accounts a ticket may be assigned to.
   *
   * Deliberately narrow: id + name + email, active accounts only. The
   * general user-listing endpoint refuses to enumerate admins by design, so
   * this exists to serve the assignee picker without reopening that.
   */
  async listAssignableAgents() {
    return prisma.user.findMany({
      where: {
        role: { in: [Role.ADMIN, Role.SUPER_ADMIN] },
        isActive: true,
        isSuspended: false,
      },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: [{ firstName: 'asc' }, { email: 'asc' }],
    });
  }

  async getTicketStats() {
    const [total, open, inProgress, awaitingReply, resolved, closed] = await Promise.all([
      prisma.supportTicket.count(),
      prisma.supportTicket.count({ where: { status: TicketStatus.OPEN } }),
      prisma.supportTicket.count({ where: { status: TicketStatus.IN_PROGRESS } }),
      prisma.supportTicket.count({ where: { status: TicketStatus.AWAITING_REPLY } }),
      prisma.supportTicket.count({ where: { status: TicketStatus.RESOLVED } }),
      prisma.supportTicket.count({ where: { status: TicketStatus.CLOSED } }),
    ]);

    // Today's stats
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [todayNew, todayResolved] = await Promise.all([
      prisma.supportTicket.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.supportTicket.count({ where: { resolvedAt: { gte: todayStart } } }),
    ]);

    // Average response time (tickets with firstResponseAt)
    const ticketsWithResponse = await prisma.supportTicket.findMany({
      where: { firstResponseAt: { not: null } },
      select: { createdAt: true, firstResponseAt: true },
      take: 100,
      orderBy: { createdAt: 'desc' },
    });

    let avgResponseTimeHours = 0;
    if (ticketsWithResponse.length > 0) {
      const totalMs = ticketsWithResponse.reduce((sum, t) => {
        return sum + (t.firstResponseAt!.getTime() - t.createdAt.getTime());
      }, 0);
      avgResponseTimeHours =
        Math.round((totalMs / ticketsWithResponse.length / (1000 * 60 * 60)) * 10) / 10;
    }

    // Satisfaction rate
    const satisfiedCount = await prisma.supportTicket.count({
      where: { satisfaction: TicketSatisfaction.SATISFIED },
    });
    const ratedCount = await prisma.supportTicket.count({
      where: { satisfaction: { not: null } },
    });
    const satisfactionRate = ratedCount > 0 ? Math.round((satisfiedCount / ratedCount) * 100) : 0;

    return {
      total,
      open,
      inProgress,
      awaitingReply,
      resolved,
      closed,
      todayNew,
      todayResolved,
      avgResponseTimeHours,
      satisfactionRate,
    };
  }

  /**
   * Detailed analytics for super-admin
   */
  async getTicketAnalytics(startDate?: Date, endDate?: Date) {
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();

    const dateFilter = { createdAt: { gte: start, lte: end } };

    // Tickets by category
    const byCategory = await prisma.supportTicket.groupBy({
      by: ['category'],
      where: dateFilter,
      _count: { id: true },
    });

    // Tickets by status
    const byStatus = await prisma.supportTicket.groupBy({
      by: ['status'],
      where: dateFilter,
      _count: { id: true },
    });

    // Satisfaction distribution
    const bySatisfaction = await prisma.supportTicket.groupBy({
      by: ['satisfaction'],
      where: { ...dateFilter, satisfaction: { not: null } },
      _count: { id: true },
    });

    // Daily volume (created)
    const allTickets = await prisma.supportTicket.findMany({
      where: dateFilter,
      select: { createdAt: true, resolvedAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const dailyVolume: Record<string, { created: number; resolved: number }> = {};
    for (const t of allTickets) {
      const day = t.createdAt.toISOString().split('T')[0];
      if (!dailyVolume[day]) dailyVolume[day] = { created: 0, resolved: 0 };
      dailyVolume[day].created++;
      if (t.resolvedAt) {
        const resDay = t.resolvedAt.toISOString().split('T')[0];
        if (!dailyVolume[resDay]) dailyVolume[resDay] = { created: 0, resolved: 0 };
        dailyVolume[resDay].resolved++;
      }
    }

    // Escalated tickets (NOT_SATISFIED)
    const escalatedTickets = await prisma.supportTicket.findMany({
      where: { satisfaction: TicketSatisfaction.NOT_SATISFIED, ...dateFilter },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });

    return {
      byCategory: byCategory.map((c) => ({ category: c.category, count: c._count.id })),
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count.id })),
      bySatisfaction: bySatisfaction.map((s) => ({
        satisfaction: s.satisfaction,
        count: s._count.id,
      })),
      dailyVolume: Object.entries(dailyVolume).map(([date, data]) => ({ date, ...data })),
      escalatedTickets,
    };
  }

  // --- Notification Helpers ---

  private async notifyAdminsNewTicket(
    ticket: { id: string; ticketNumber: string; subject: string },
    senderName: string,
    senderRole: string | null
  ) {
    const admins = await prisma.user.findMany({
      where: { role: { in: [Role.ADMIN, Role.SUPER_ADMIN] }, isActive: true },
      select: { id: true, email: true },
    });

    const roleLabel = senderRole ? ` (${senderRole})` : ' (Guest)';

    for (const admin of admins) {
      notificationService
        .send({
          userId: admin.id,
          title: `New Ticket: ${ticket.ticketNumber}`,
          message: `${senderName}${roleLabel} submitted: "${ticket.subject}"`,
          type: NotificationType.INFO,
          category: 'support_ticket',
          link: `/admin/tickets/${ticket.id}`,
          channels: ['in_app', 'fcm', 'web_push', 'email'],
          emailOptions: {
            to: admin.email,
            ...ticketNewAdmin(
              ticket.ticketNumber,
              ticket.subject,
              senderName,
              roleLabel,
              ticket.id
            ),
          },
        })
        .catch(() => {});
    }
  }

  private async notifyAdminsTicketReply(
    ticket: { id: string; ticketNumber: string; subject: string; assignedToId: string | null },
    senderName: string,
    messageBody: string
  ) {
    const adminFilter = ticket.assignedToId
      ? { id: ticket.assignedToId }
      : { role: { in: [Role.ADMIN, Role.SUPER_ADMIN] as Role[] }, isActive: true };

    const admins = await prisma.user.findMany({
      where: adminFilter,
      select: { id: true, email: true },
    });

    for (const admin of admins) {
      notificationService
        .send({
          userId: admin.id,
          title: `Reply on ${ticket.ticketNumber}`,
          message: `${senderName} replied: "${messageBody.substring(0, 100)}${messageBody.length > 100 ? '...' : ''}"`,
          type: NotificationType.INFO,
          category: 'support_ticket',
          link: `/admin/tickets/${ticket.id}`,
          channels: ['in_app', 'fcm', 'web_push', 'email'],
          emailOptions: {
            to: admin.email,
            ...ticketReplyAdmin(
              ticket.ticketNumber,
              ticket.subject,
              senderName,
              messageBody,
              ticket.id
            ),
          },
        })
        .catch(() => {});
    }
  }

  private async notifyUserTicketReply(
    ticket: {
      id: string;
      ticketNumber: string;
      subject: string;
      userId: string | null;
      guestEmail: string | null;
      user: {
        id: string;
        email: string;
        firstName: string | null;
        lastName: string | null;
        role: Role;
        mobileNumber: string | null;
        whatsappNumber: string | null;
        isWhatsappVerified: boolean;
      } | null;
    },
    messageBody: string,
    replySubject?: string
  ) {
    // Registered user — full multi-channel notification
    if (ticket.userId && ticket.user) {
      const helpPath = ticket.user.role === Role.EMPLOYER ? 'employer' : 'candidate';

      notificationService
        .send({
          userId: ticket.userId,
          title: `Reply on ${ticket.ticketNumber}`,
          message: `Support team responded to: "${ticket.subject}"`,
          type: NotificationType.INFO,
          category: 'support_ticket',
          link: `/${helpPath}/help/${ticket.id}`,
          channels: ['in_app', 'fcm', 'web_push', 'email'],
          emailOptions: {
            to: ticket.user.email,
            ...ticketReplyUser(
              ticket.ticketNumber,
              ticket.subject,
              messageBody,
              helpPath,
              ticket.id,
              replySubject
            ),
          },
        })
        .catch(() => {});

      // WhatsApp notification (fire-and-forget)
      const waTarget = ticket.user?.whatsappNumber || ticket.user?.mobileNumber;
      if (ticket.user?.isWhatsappVerified && waTarget) {
        import('../templates/whatsapp')
          .then(({ ticketReplyWhatsapp }) => {
            const tmpl = ticketReplyWhatsapp(ticket.ticketNumber, ticket.subject.substring(0, 50));
            return import('../jobs/whatsapp.queue').then(({ addWhatsAppJob }) =>
              addWhatsAppJob({
                to: waTarget,
                templateName: tmpl.templateName,
                languageCode: tmpl.languageCode,
                components: tmpl.components,
              })
            );
          })
          .catch(() => {});
      }
    }

    // Guest ticket — email only
    if (ticket.guestEmail && !ticket.userId) {
      const guestEmail = ticketReplyGuest(
        ticket.ticketNumber,
        ticket.subject,
        messageBody,
        replySubject
      );
      emailService
        .sendEmail({
          to: ticket.guestEmail,
          subject: guestEmail.subject,
          html: guestEmail.html,
        })
        .catch((err) => logger.warn('Failed to send guest ticket reply email', { error: err }));
    }
  }

  private async notifyUserStatusChange(
    ticket: {
      id: string;
      ticketNumber: string;
      subject: string;
      userId: string | null;
      user: {
        id: string;
        email: string;
        role: Role;
        whatsappNumber?: string | null;
        mobileNumber?: string | null;
        isWhatsappVerified?: boolean;
      } | null;
    },
    newStatus: TicketStatus
  ) {
    if (!ticket.userId || !ticket.user) return;

    const helpPath = ticket.user.role === Role.EMPLOYER ? 'employer' : 'candidate';
    const statusLabel = newStatus.replace('_', ' ').toLowerCase();

    let extraMessage = '';
    if (newStatus === TicketStatus.RESOLVED) {
      extraMessage = ' Please rate your experience.';
    }

    notificationService
      .send({
        userId: ticket.userId,
        title: `Ticket ${ticket.ticketNumber} ${statusLabel}`,
        message: `Your ticket "${ticket.subject}" is now ${statusLabel}.${extraMessage}`,
        type:
          newStatus === TicketStatus.RESOLVED ? NotificationType.SUCCESS : NotificationType.INFO,
        category: 'support_ticket',
        link: `/${helpPath}/help/${ticket.id}`,
        channels: ['in_app', 'fcm', 'web_push', 'email'],
        emailOptions: {
          to: ticket.user.email,
          ...ticketStatusChange(
            ticket.ticketNumber,
            ticket.subject,
            statusLabel,
            helpPath,
            ticket.id,
            extraMessage
          ),
        },
      })
      .catch(() => {});

    // WhatsApp notification (fire-and-forget)
    const waTarget = ticket.user.whatsappNumber || ticket.user.mobileNumber;
    if (ticket.user.isWhatsappVerified && waTarget) {
      import('../templates/whatsapp')
        .then(({ ticketStatusUpdateWhatsapp }) => {
          const tmpl = ticketStatusUpdateWhatsapp(ticket.ticketNumber, statusLabel);
          return import('../jobs/whatsapp.queue').then(({ addWhatsAppJob }) =>
            addWhatsAppJob({
              to: waTarget,
              templateName: tmpl.templateName,
              languageCode: tmpl.languageCode,
              components: tmpl.components,
            })
          );
        })
        .catch(() => {});
    }
  }

  private async escalateNotSatisfied(ticket: {
    id: string;
    ticketNumber: string;
    subject: string;
  }) {
    const superAdmins = await prisma.user.findMany({
      where: { role: Role.SUPER_ADMIN, isActive: true },
      select: { id: true, email: true },
    });

    for (const sa of superAdmins) {
      notificationService
        .send({
          userId: sa.id,
          title: `Escalation: ${ticket.ticketNumber}`,
          message: `User rated as "Not Satisfied" on ticket: "${ticket.subject}"`,
          type: NotificationType.WARNING,
          category: 'support_ticket_escalation',
          link: `/admin/tickets/${ticket.id}`,
          channels: ['in_app', 'fcm', 'web_push', 'email'],
          emailOptions: {
            to: sa.email,
            ...ticketEscalation(ticket.ticketNumber, ticket.subject, ticket.id),
          },
        })
        .catch(() => {});
    }
  }

  private async sendTicketConfirmationEmail(
    email: string,
    ticketNumber: string,
    subject: string,
    role?: Role
  ) {
    const helpPath =
      role === Role.EMPLOYER ? 'employer' : role === Role.CANDIDATE ? 'candidate' : '';

    const confirmation = ticketConfirmation(ticketNumber, subject, helpPath);
    await emailService.sendEmail({
      to: email,
      subject: confirmation.subject,
      html: confirmation.html,
    });
  }
}

export const ticketService = new TicketService();
