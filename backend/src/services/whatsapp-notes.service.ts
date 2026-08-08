import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';
import { Prisma } from '@prisma/client';
import { encryptField, decryptField } from '../utils/encryption';

// Internal notes are private agent commentary (never sent to Meta) — the most
// candid free-text in the system. They're encrypted at rest (AES-256-GCM) and
// never searched/sorted server-side, so encryption has zero query impact.
// decryptField() passes through legacy plaintext rows unchanged.

/** Internal (agent-only) notes attached to a conversation. */
export async function listNotes(conversationId: string) {
  const notes = await prisma.waConversationNote.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
  });
  return notes.map((n) => ({ ...n, body: decryptField(n.body) }));
}

export async function createNote(conversationId: string, authorId: string | null, body: string) {
  const note = await prisma.waConversationNote.create({
    data: { conversationId, authorId, body: encryptField(body) },
  });
  return { ...note, body }; // return the plaintext to the caller (don't leak ciphertext)
}

export async function deleteNote(id: string) {
  try {
    return await prisma.waConversationNote.delete({ where: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new AppError('Note not found', 404, 'WA_NOTE_NOT_FOUND');
    }
    throw err;
  }
}
