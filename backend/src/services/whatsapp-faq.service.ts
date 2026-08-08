import { prisma } from '../config/prisma';

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

/** Persist a new display ordering from an array of FAQ ids. */
export async function reorderFaqs(ids: string[]) {
  await prisma.$transaction(
    ids.map((id, i) => prisma.waFaq.update({ where: { id }, data: { order: i } }))
  );
  return listFaqs();
}
