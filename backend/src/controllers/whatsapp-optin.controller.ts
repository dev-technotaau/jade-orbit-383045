import type { Request, Response, NextFunction } from 'express';
import { selfServeWhatsappOptIn } from '../services/whatsapp-optin.service';

/**
 * POST /whatsapp-optin — the logged-in user opts THEIR OWN WhatsApp number in
 * (or out). Defaults to opting IN unless `optIn: false` is explicitly sent.
 */
export const setOptIn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const optIn = req.body?.optIn !== false;
    const contact = await selfServeWhatsappOptIn(req.user!.id, optIn);
    res.json({ success: true, data: contact });
  } catch (e) {
    next(e);
  }
};
