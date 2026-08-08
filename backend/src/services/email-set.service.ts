import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';
import {
  listContacts,
  exportContactsCsv,
  resolveAudienceContactIds,
  type ResolveAudienceInput,
} from './email-contact.service';

/**
 * Static contact sets — named, explicitly-membered lists (distinct from dynamic
 * segments). Members are added by hand, from a segment/filter, from platform
 * roles, or from an import, and a set is targetable as a campaign audience.
 */

export async function listSets() {
  const sets = await prisma.emailContactSet.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { members: true } } },
  });
  return sets.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    memberCount: s._count.members,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }));
}

export async function getSet(id: string) {
  const set = await prisma.emailContactSet.findUnique({
    where: { id },
    include: { _count: { select: { members: true } } },
  });
  if (!set) throw new AppError('Set not found', 404, 'EMAIL_SET_NOT_FOUND');
  return {
    id: set.id,
    name: set.name,
    description: set.description,
    memberCount: set._count.members,
    createdAt: set.createdAt,
    updatedAt: set.updatedAt,
  };
}

export async function createSet(input: {
  name: string;
  description?: string | null;
  createdBy?: string | null;
}) {
  if (!input.name?.trim())
    throw new AppError('A set name is required', 400, 'EMAIL_SET_NAME_REQUIRED');
  return prisma.emailContactSet.create({
    data: {
      name: input.name.trim(),
      description: input.description ?? null,
      createdBy: input.createdBy ?? null,
    },
  });
}

export async function updateSet(id: string, patch: { name?: string; description?: string | null }) {
  await getSet(id);
  return prisma.emailContactSet.update({
    where: { id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
    },
  });
}

export async function deleteSet(id: string) {
  await prisma.emailContactSet.delete({ where: { id } }).catch(() => {
    throw new AppError('Set not found', 404, 'EMAIL_SET_NOT_FOUND');
  });
  return { deleted: true };
}

/** Bulk delete sets by id (members cascade). */
export async function deleteSets(ids: string[]): Promise<{ deleted: number }> {
  const res = await prisma.emailContactSet.deleteMany({ where: { id: { in: ids } } });
  return { deleted: res.count };
}

/** Add explicit contact ids to a set (idempotent). Returns how many were newly added. */
export async function addMembers(
  setId: string,
  contactIds: string[]
): Promise<{ added: number; memberCount: number }> {
  await getSet(setId);
  const ids = [...new Set(contactIds.filter(Boolean))];
  if (ids.length) {
    // Only reference contacts that actually exist (avoid FK errors from stale ids).
    const existing = await prisma.emailContact.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const valid = existing.map((c) => c.id);
    if (valid.length) {
      const res = await prisma.emailContactSetMember.createMany({
        data: valid.map((contactId) => ({ setId, contactId })),
        skipDuplicates: true,
      });
      const memberCount = await prisma.emailContactSetMember.count({ where: { setId } });
      return { added: res.count, memberCount };
    }
  }
  const memberCount = await prisma.emailContactSetMember.count({ where: { setId } });
  return { added: 0, memberCount };
}

export async function removeMembers(
  setId: string,
  contactIds: string[]
): Promise<{ removed: number; memberCount: number }> {
  await getSet(setId);
  const res = await prisma.emailContactSetMember.deleteMany({
    where: { setId, contactId: { in: contactIds } },
  });
  const memberCount = await prisma.emailContactSetMember.count({ where: { setId } });
  return { removed: res.count, memberCount };
}

/**
 * Materialize an audience (segment / filter / platform roles / manual) into a
 * set — the bridge that lets a dynamic query become a static, frozen list.
 */
export async function addMembersByAudience(
  setId: string,
  audience: ResolveAudienceInput
): Promise<{ added: number; memberCount: number }> {
  await getSet(setId);
  const contactIds = await resolveAudienceContactIds(audience);
  return addMembers(setId, contactIds);
}

/** Paginated members of a set (reuses the contact list with a set filter). */
export async function listSetMembers(
  setId: string,
  opts: { q?: string; page?: number; limit?: number }
) {
  await getSet(setId);
  return listContacts({ setId, q: opts.q, page: opts.page, limit: opts.limit });
}

export async function exportSetCsv(setId: string): Promise<string> {
  await getSet(setId);
  return exportContactsCsv({ setId });
}
