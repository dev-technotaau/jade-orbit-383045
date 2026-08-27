import type { Request, Response, NextFunction } from 'express';
import { listNotes, createNote, updateNote, deleteNote } from '../services/whatsapp-notes.service';

export const list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Newest first, bounded by the service (the panel renders the top of the
    // list; a thread that has collected thousands of notes must not be read and
    // decrypted in full to draw it). `?before`/`?beforeId` walk the older ones.
    const parsedLimit = parseInt(String(req.query.limit), 10);
    const before = req.query.before ? new Date(String(req.query.before)) : null;
    res.json({
      success: true,
      data: await listNotes(String(req.params.id), {
        limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
        // `?scope=contact` widens to every thread with the same person — a
        // contact can hold one per connected number, and the note an agent
        // wrote on the support number is exactly the history the marketing
        // number's thread needs.
        scope: req.query.scope === 'contact' ? 'contact' : 'conversation',
        before:
          before && !Number.isNaN(before.getTime())
            ? { at: before, id: String(req.query.beforeId ?? '') }
            : undefined,
      }),
    });
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

export const patch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const note = await updateNote(
      String(req.params.id),
      String(req.params.noteId),
      String(req.body.body)
    );
    res.json({ success: true, data: note });
  } catch (e) {
    next(e);
  }
};

export const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Both ids: the note is addressed within the conversation it belongs to, so
    // a stale/foreign noteId 404s instead of deleting another thread's note.
    await deleteNote(String(req.params.id), String(req.params.noteId));
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
};
