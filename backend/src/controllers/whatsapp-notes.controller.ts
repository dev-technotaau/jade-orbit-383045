import type { Request, Response, NextFunction } from 'express';
import { listNotes, createNote, deleteNote } from '../services/whatsapp-notes.service';

export const list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await listNotes(String(req.params.id)) });
  } catch (e) {
    next(e);
  }
};

export const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const note = await createNote(String(req.params.id), req.user!.id, String(req.body.body));
    res.status(201).json({ success: true, data: note });
  } catch (e) {
    next(e);
  }
};

export const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await deleteNote(String(req.params.noteId));
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
};
