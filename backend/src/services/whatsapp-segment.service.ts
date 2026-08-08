import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';
import { Prisma } from '@prisma/client';

/**
 * Saved, reusable audience segments — a named, persisted audience filter
 * ({ tags?, optInStatus?, onPlatform? }) that a campaign can reference instead
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

export async function updateSegment(id: string, patch: Record<string, unknown>) {
  try {
    return await prisma.waSegment.update({
      where: { id },
      data: patch as Prisma.WaSegmentUpdateInput,
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
