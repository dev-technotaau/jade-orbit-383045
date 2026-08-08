import { prisma } from '../config/prisma';

/** Reusable quick-reply snippets for the inbox composer (shared across admins). */
export function listCannedReplies() {
  return prisma.waCannedReply.findMany({ orderBy: { title: 'asc' } });
}

export function createCannedReply(data: { title: string; text: string; createdBy: string }) {
  return prisma.waCannedReply.create({ data });
}

export function updateCannedReply(id: string, data: { title?: string; text?: string }) {
  return prisma.waCannedReply.update({ where: { id }, data });
}

export function deleteCannedReply(id: string) {
  return prisma.waCannedReply.delete({ where: { id } });
}
