import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';

/**
 * FAQ entries shown to customers as an interactive list; tapping one auto-sends
 * the saved answer (see whatsapp-autoreply.service). Ordered for the menu.
 */
export function listFaqs() {
  return prisma.waFaq.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
}

/** Only the active FAQs, capped at 10 (WhatsApp interactive-list row limit). */
export function listActiveFaqsForMenu() {
  return prisma.waFaq.findMany({
    where: { isActive: true },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    take: 10,
  });
}

export function createFaq(data: {
  question: string;
  answer: string;
  order?: number;
  isActive?: boolean;
  createdBy?: string | null;
}) {
  return prisma.waFaq.create({ data });
}

export function updateFaq(
  id: string,
  data: { question?: string; answer?: string; order?: number; isActive?: boolean }
) {
  return prisma.waFaq.update({ where: { id }, data });
}

export function deleteFaq(id: string) {
  return prisma.waFaq.delete({ where: { id } });
}

/**
 * Persist a new display ordering from an array of FAQ ids.
 *
 * The id set is compared against what is stored before anything is written. A
 * drag-and-drop reorder sent from a page whose list is stale — someone deleted a
 * FAQ in another tab, or added one — used to hit `update` on a row that no
 * longer exists, and P2025 escaped the transaction as a 500: the operator saw a
 * generic failure and NO part of their reordering was applied, with nothing
 * saying why. A 400 naming the cause lets the page refetch and retry.
 */
export async function reorderFaqs(ids: string[]) {
  const stored = await prisma.waFaq.findMany({ select: { id: true } });
  const storedIds = new Set(stored.map((f) => f.id));
  const seen = new Set<string>();
  for (const id of ids) {
    if (!storedIds.has(id) || seen.has(id)) {
      throw new AppError(
        'The FAQ list has changed since this page was loaded — reload and try again',
        400,
        'WA_FAQ_REORDER_STALE'
      );
    }
    seen.add(id);
  }
  if (seen.size !== storedIds.size) {
    throw new AppError(
      'The FAQ list has changed since this page was loaded — reload and try again',
      400,
      'WA_FAQ_REORDER_STALE'
    );
  }
  await prisma.$transaction(
    ids.map((id, i) => prisma.waFaq.update({ where: { id }, data: { order: i } }))
  );
  return listFaqs();
}
