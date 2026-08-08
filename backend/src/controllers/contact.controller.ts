import type { Request, Response, NextFunction } from 'express';
import { contactService } from '../services/contact.service';

export const submitContactMessage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, subject, message } = req.body;
    const contact = await contactService.submitMessage({ name, email, subject, message });
    res.status(201).json({
      status: 'success',
      message: 'Your message has been sent. We will get back to you within 24 hours.',
      data: { id: contact.id },
    });
  } catch (error) {
    next(error);
  }
};

export const listContactMessages = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const isRead =
      req.query.isRead === 'true' ? true : req.query.isRead === 'false' ? false : undefined;
    const result = await contactService.listMessages(page, limit, isRead);
    res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
};

export const markContactMessageRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const msg = await contactService.markAsRead(req.params.id as string);
    res.status(200).json({ status: 'success', data: msg });
  } catch (error) {
    next(error);
  }
};

export const deleteContactMessage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await contactService.deleteMessage(req.params.id as string);
    res.status(200).json({ status: 'success', message: 'Message deleted' });
  } catch (error) {
    next(error);
  }
};
