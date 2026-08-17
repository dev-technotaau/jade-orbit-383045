import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';
import { segmentContactWhere } from './whatsapp-contact.service';
import { Prisma } from '@prisma/client';

/**
 * Saved, reusable audience segments — a named, persisted audience filter
 * ({ tags?, optInStatus?, attributes? }) that a campaign can reference instead
 * of re-specifying its filter inline.
 */
export async function listSegments() {
  return prisma.waSegment.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function getSegment(id: string) {
  const segment = await prisma.waSegment.findUnique({ where: { id } });
  if (!segment) throw new AppError('Segment not found', 404, 'WA_SEGMENT_NOT_FOUND');
  return segment;
}

/**
 * How many contacts a saved segment currently matches.
 *
 * Reuses `segmentContactWhere` — the SAME predicate the campaign audience
 * resolver uses — so the number shown next to a segment is the number a campaign
 * targeting it will reach. Previously a segment could only be inspected by
 * eyeballing its filter chips, and the one place that DID resolve it (the
 * contacts page) applied only its first tag, so the pre-send sanity check
 * disagreed with the send.
 */
export async function countSegmentMembers(id: string): Promise<number> {
  const segment = await getSegment(id);
  const filter = (segment.filter ?? {}) as Record<string, unknown>;
  return prisma.waContact.count({ where: segmentContactWhere(filter) });
}

export async function createSegment(input: {
  name: string;
  description?: string | null;
  filter: Prisma.InputJsonValue;
  createdBy?: string | null;
}) {
  return prisma.waSegment.create({
    data: {
      name: input.name,
      filter: input.filter,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.createdBy !== undefined ? { createdBy: input.createdBy } : {}),
    },
  });
}

/**
 * Field-by-field, not a blanket cast of the request body.
 *
 * `patch as Prisma.WaSegmentUpdateInput` let a caller write ANY column on the
 * row — id, createdAt, createdBy — and the route carried no zod schema either, so
 * the two mass-assignment guards the create path has were both absent here.
 */
export async function updateSegment(
  id: string,
  patch: { name?: string; description?: string | null; filter?: Prisma.InputJsonValue }
) {
  try {
    return await prisma.waSegment.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.filter !== undefined ? { filter: patch.filter } : {}),
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new AppError('Segment not found', 404, 'WA_SEGMENT_NOT_FOUND');
    }
    throw err;
  }
}

export async function deleteSegment(id: string) {
  try {
    return await prisma.waSegment.delete({ where: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new AppError('Segment not found', 404, 'WA_SEGMENT_NOT_FOUND');
    }
    throw err;
  }
}
