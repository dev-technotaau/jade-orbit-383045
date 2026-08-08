import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';
import { Prisma } from '@prisma/client';
import { previewAudienceSize } from './email-contact.service';

/**
 * Saved, reusable audience segments — a named, persisted filter
 * ({ tags?, subscribeStatus?, onPlatform?, roles? }) a campaign can reference
 * instead of re-specifying its filter inline. Mirrors WaSegment.
 */
export async function listSegments() {
  return prisma.emailSegment.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function getSegment(id: string) {
  const segment = await prisma.emailSegment.findUnique({ where: { id } });
  if (!segment) throw new AppError('Segment not found', 404, 'EMAIL_SEGMENT_NOT_FOUND');
  return segment;
}

export async function createSegment(input: {
  name: string;
  description?: string | null;
  filter: Prisma.InputJsonValue;
  createdBy?: string | null;
}) {
  return prisma.emailSegment.create({
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
    return await prisma.emailSegment.update({
      where: { id },
      data: patch as Prisma.EmailSegmentUpdateInput,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new AppError('Segment not found', 404, 'EMAIL_SEGMENT_NOT_FOUND');
    }
    throw err;
  }
}

export async function deleteSegment(id: string) {
  try {
    return await prisma.emailSegment.delete({ where: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new AppError('Segment not found', 404, 'EMAIL_SEGMENT_NOT_FOUND');
    }
    throw err;
  }
}

/** Live audience-size estimate for a saved segment. */
export async function estimateSegmentSize(id: string): Promise<number> {
  await getSegment(id);
  return previewAudienceSize({ audienceType: 'segment', segmentId: id });
}
