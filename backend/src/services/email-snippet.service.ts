import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';
import { Prisma } from '@prisma/client';

/** Reusable content blocks (header/footer/CTA/hero) insertable into any template. */
export async function listSnippets(category?: string) {
  return prisma.emailSnippet.findMany({
    where: category ? { category } : {},
    orderBy: { name: 'asc' },
  });
}

export async function createSnippet(input: {
  name: string;
  category?: string | null;
  html: string;
  createdBy?: string | null;
}) {
  return prisma.emailSnippet.create({
    data: {
      name: input.name,
      category: input.category ?? null,
      html: input.html,
      createdBy: input.createdBy ?? null,
    },
  });
}

export async function updateSnippet(
  id: string,
  patch: { name?: string; category?: string | null; html?: string }
) {
  try {
    return await prisma.emailSnippet.update({
      where: { id },
      data: patch as Prisma.EmailSnippetUpdateInput,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new AppError('Snippet not found', 404, 'EMAIL_SNIPPET_NOT_FOUND');
    }
    throw err;
  }
}

export async function deleteSnippet(id: string) {
  return prisma.emailSnippet.delete({ where: { id } }).catch(() => null);
}
