import prisma from '../config/prisma';
import { emailQueue } from '../jobs/email.queue';
import { ticketService } from './ticket.service';
import logger from '../config/logger';
import { contactFormSubmission } from '../templates/email/contact';

class ContactService {
  async submitMessage(data: { name: string; email: string; subject: string; message: string }) {
    const contact = await prisma.contactMessage.create({ data });

    // Also create a SupportTicket for tracking (fire-and-forget)
    ticketService
      .createGuestTicket({
        name: data.name,
        email: data.email,
        subject: data.subject,
        description: data.message,
      })
      .catch((err) =>
        logger.warn('Failed to create support ticket from contact form', { error: err })
      );

    // Notify admins via email queue (rate-limited, fire-and-forget)
    const contactEmail = contactFormSubmission(
      data.name,
      data.email,
      data.subject,
      data.message,
      contact.id
    );
    emailQueue
      .add('send-email', {
        to: 'support@hireadda.in',
        subject: contactEmail.subject,
        html: contactEmail.html,
      })
      .catch((err) => logger.warn('Failed to enqueue contact notification email', { error: err }));

    return contact;
  }

  async listMessages(page: number, limit: number, isRead?: boolean) {
    const where = isRead !== undefined ? { isRead } : {};
    const [items, total] = await Promise.all([
      prisma.contactMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.contactMessage.count({ where }),
    ]);
    const totalPages = Math.ceil(total / limit) || 1;
    return { items, total, page, limit, totalPages, hasMore: page < totalPages };
  }

  async markAsRead(id: string) {
    return prisma.contactMessage.update({ where: { id }, data: { isRead: true } });
  }

  async deleteMessage(id: string) {
    return prisma.contactMessage.delete({ where: { id } });
  }
}

export const contactService = new ContactService();
