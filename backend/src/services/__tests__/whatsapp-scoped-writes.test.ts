/**
 * Tests for writes that must be scoped to the resource named in the URL, plus
 * the FAQ reorder's staleness guard.
 *
 * Notes and scheduled messages hang off a conversation and are addressed as
 * `/conversations/:id/notes/:noteId`, but the delete/cancel used to look the row
 * up by primary key alone — so a note or a pending send belonging to another
 * thread could be destroyed through this thread's URL, and the audit row that
 * recorded it named the wrong conversation. The reorder had the mirror problem:
 * a client-supplied id that no longer existed threw P2025 out of the transaction
 * as a 500, applying none of the reordering and explaining nothing.
 */

const prismaMock = {
  waConversationNote: {
    deleteMany: jest.fn(),
    updateMany: jest.fn(),
    findUnique: jest.fn(),
  },
  waScheduledMessage: {
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  },
  waFaq: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn().mockResolvedValue([]),
};
jest.mock('../../config/prisma', () => ({ prisma: prismaMock }));

jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../utils/encryption', () => ({
  encryptField: (v: string) => `enc:${v}`,
  decryptField: (v: string) => v,
  warnIfEncryptionDisabled: jest.fn(),
}));

// Pulled in transitively by the scheduled-message service; none of it runs here.
jest.mock('../whatsapp-send.service', () => ({
  sendSessionMessage: jest.fn(),
  sendTemplateToConversation: jest.fn(),
}));
jest.mock('../../jobs/whatsapp-campaign.worker', () => ({ acquireChannelSendSlot: jest.fn() }));
jest.mock('../../utils/distributed-lock', () => ({ withLock: jest.fn() }));
jest.mock('../../config/env', () => ({ env: { WHATSAPP_DEFAULT_THROTTLE_PER_SEC: '15' } }));

import { deleteNote, updateNote } from '../whatsapp-notes.service';
import { cancelScheduled } from '../whatsapp-scheduled-message.service';
import { reorderFaqs } from '../whatsapp-faq.service';

const CONV = 'conv-a';
const OTHER_CONV = 'conv-b';

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.$transaction.mockResolvedValue([]);
});

describe('deleteNote', () => {
  it('scopes the delete to the conversation in the URL', async () => {
    prismaMock.waConversationNote.deleteMany.mockResolvedValue({ count: 1 });

    await deleteNote(CONV, 'note1');

    expect(prismaMock.waConversationNote.deleteMany).toHaveBeenCalledWith({
      where: { id: 'note1', conversationId: CONV },
    });
  });

  it('404s rather than deleting a note that belongs to another conversation', async () => {
    // The scoped predicate matches nothing, which is the same answer as "no such
    // note" — deliberately, so the URL cannot be used to probe other threads.
    prismaMock.waConversationNote.deleteMany.mockResolvedValue({ count: 0 });

    await expect(deleteNote(OTHER_CONV, 'note1')).rejects.toMatchObject({
      statusCode: 404,
      code: 'WA_NOTE_NOT_FOUND',
    });
  });
});

describe('updateNote', () => {
  it('scopes the edit and returns the plaintext body, never the ciphertext', async () => {
    prismaMock.waConversationNote.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.waConversationNote.findUnique.mockResolvedValue({
      id: 'note1',
      conversationId: CONV,
      authorId: 'operator',
      body: 'enc:corrected',
    });

    const note = await updateNote(CONV, 'note1', 'corrected');

    expect(prismaMock.waConversationNote.updateMany).toHaveBeenCalledWith({
      where: { id: 'note1', conversationId: CONV },
      data: { body: 'enc:corrected' },
    });
    expect(note).toMatchObject({ id: 'note1', body: 'corrected' });
  });

  it('404s when the note is not on this conversation', async () => {
    prismaMock.waConversationNote.updateMany.mockResolvedValue({ count: 0 });

    await expect(updateNote(OTHER_CONV, 'note1', 'x')).rejects.toMatchObject({
      statusCode: 404,
      code: 'WA_NOTE_NOT_FOUND',
    });
  });
});

describe('cancelScheduled', () => {
  it('cancels a PENDING message on its own conversation', async () => {
    prismaMock.waScheduledMessage.findUnique.mockResolvedValue({
      id: 'msg1',
      conversationId: CONV,
      status: 'PENDING',
    });
    prismaMock.waScheduledMessage.updateMany.mockResolvedValue({ count: 1 });

    const res = await cancelScheduled('msg1', CONV);

    expect(prismaMock.waScheduledMessage.updateMany).toHaveBeenCalledWith({
      where: { id: 'msg1', status: 'PENDING', conversationId: CONV },
      data: { status: 'CANCELLED' },
    });
    expect(res.status).toBe('CANCELLED');
  });

  it('404s for a message belonging to another conversation and writes nothing', async () => {
    prismaMock.waScheduledMessage.findUnique.mockResolvedValue({
      id: 'msg1',
      conversationId: OTHER_CONV,
      status: 'PENDING',
    });

    await expect(cancelScheduled('msg1', CONV)).rejects.toMatchObject({
      statusCode: 404,
      code: 'WA_SCHEDULED_NOT_FOUND',
    });
    expect(prismaMock.waScheduledMessage.updateMany).not.toHaveBeenCalled();
  });

  it('404s when the dispatcher claimed the row between the read and the write', async () => {
    // The compare-and-set is what makes "cancelled" honest: a tick can claim the
    // row (PENDING -> SENT) in the gap, and reporting success then would tell the
    // operator a message was pulled that the customer had already received.
    prismaMock.waScheduledMessage.findUnique.mockResolvedValue({
      id: 'msg1',
      conversationId: CONV,
      status: 'PENDING',
    });
    prismaMock.waScheduledMessage.updateMany.mockResolvedValue({ count: 0 });

    await expect(cancelScheduled('msg1', CONV)).rejects.toMatchObject({
      statusCode: 404,
      code: 'WA_SCHEDULED_NOT_PENDING',
    });
  });
});

describe('reorderFaqs', () => {
  it('applies the new order when the id set matches what is stored', async () => {
    prismaMock.waFaq.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

    await reorderFaqs(['b', 'a']);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.waFaq.update).toHaveBeenCalledWith({
      where: { id: 'b' },
      data: { order: 0 },
    });
  });

  it('rejects a stale list with a 400 instead of 500ing out of the transaction', async () => {
    // 'c' was deleted in another tab. The old code hit `update` on it and P2025
    // escaped as a 500 with no reordering applied and no explanation.
    prismaMock.waFaq.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

    await expect(reorderFaqs(['a', 'b', 'c'])).rejects.toMatchObject({
      statusCode: 400,
      code: 'WA_FAQ_REORDER_STALE',
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a partial list — every stored FAQ has to be accounted for', async () => {
    prismaMock.waFaq.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

    await expect(reorderFaqs(['a'])).rejects.toMatchObject({
      statusCode: 400,
      code: 'WA_FAQ_REORDER_STALE',
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
