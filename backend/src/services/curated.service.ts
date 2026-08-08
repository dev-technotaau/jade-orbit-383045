/**
 * CuratedListing service.
 *
 * Drives:
 *   - Header mega-menu (Jobs / Companies dropdowns).
 *   - Footer mega-section (Find Jobs / Popular Jobs / Jobs by Department).
 *   - SEO landing pages at `/jobs/category/<x>`, `/jobs/in/<city>`, etc.
 *
 * Reads are 5-min cached (Redis); listing pages can do hundreds of these
 * per page so DB pressure must be near-zero on hot paths.
 */
import { prisma } from '../config/prisma';
import type { CuratedType } from '@prisma/client';
import { redis } from '../config/redis';
import logger from '../config/logger';

const CACHE_TTL_SEC = 300;

function cacheKey(type: string, opts: string): string {
  return `curated:${type}:${opts}`;
}

export async function getBySlug(slug: string) {
  const cacheKeyStr = `curated:slug:${slug}`;
  try {
    const cached = await redis.get(cacheKeyStr);
    if (cached) return JSON.parse(cached);
  } catch (err) {
    logger.warn('curated cache read failed', err);
  }

  const row = await prisma.curatedListing.findUnique({
    where: { slug },
  });

  if (row) {
    redis
      .setex(cacheKeyStr, CACHE_TTL_SEC, JSON.stringify(row))
      .catch((err) => logger.warn('curated cache write failed', err));
  }
  return row;
}

export interface ListByTypeOptions {
  isFeatured?: boolean;
  limit?: number;
}

export async function listByType(type: CuratedType, opts: ListByTypeOptions = {}) {
  const opString = `${opts.isFeatured ? 'f' : 'a'}-${opts.limit ?? 50}`;
  const key = cacheKey(type, opString);

  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as unknown[];
  } catch (err) {
    logger.warn('curated cache read failed', err);
  }

  const rows = await prisma.curatedListing.findMany({
    where: {
      type,
      isPublic: true,
      ...(opts.isFeatured ? { isFeatured: true } : {}),
    },
    orderBy: [{ displayOrder: 'asc' }, { label: 'asc' }],
    take: opts.limit ?? 50,
  });

  redis
    .setex(key, CACHE_TTL_SEC, JSON.stringify(rows))
    .catch((err) => logger.warn('curated cache write failed', err));

  return rows;
}

/**
 * Bulk fetch — used by the public sitemap shard generator and the
 * header mega-menu (which needs all categories at once).
 */
export async function listAllByTypes(types: CuratedType[]) {
  return prisma.curatedListing.findMany({
    where: { type: { in: types }, isPublic: true },
    orderBy: [{ type: 'asc' }, { displayOrder: 'asc' }, { label: 'asc' }],
  });
}

export async function invalidateCache() {
  try {
    const keys = await redis.keys('curated:*');
    if (keys.length > 0) await redis.del(...keys);
  } catch (err) {
    logger.warn('curated cache invalidate failed', err);
  }
}

// ============================================================
//   Editorial CMS surface — super-admin only.
// ============================================================
//   List / read / create / update / delete / reorder / toggle.
//   Every mutation invalidates the entire `curated:*` cache so
//   the public surface picks up the change on the next request.

export interface AdminListFilters {
  type?: CuratedType;
  isPublic?: boolean;
  isFeatured?: boolean;
  q?: string;
  page?: number;
  pageSize?: number;
}

export async function adminList(filters: AdminListFilters = {}) {
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(filters.pageSize ?? 50)));
  const where: Record<string, unknown> = {};
  if (filters.type) where.type = filters.type;
  if (typeof filters.isPublic === 'boolean') where.isPublic = filters.isPublic;
  if (typeof filters.isFeatured === 'boolean') where.isFeatured = filters.isFeatured;
  if (filters.q && filters.q.trim()) {
    const q = filters.q.trim();
    where.OR = [
      { label: { contains: q, mode: 'insensitive' } },
      { slug: { contains: q, mode: 'insensitive' } },
      { metaTitle: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await prisma.$transaction([
    prisma.curatedListing.findMany({
      where,
      orderBy: [{ type: 'asc' }, { displayOrder: 'asc' }, { label: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.curatedListing.count({ where }),
  ]);

  return {
    items,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

export async function adminGetById(id: string) {
  return prisma.curatedListing.findUnique({ where: { id } });
}

export interface AdminCreateInput {
  slug: string;
  type: CuratedType;
  label: string;
  filterPreset: Record<string, unknown>;
  iconKey?: string | null;
  displayOrder?: number;
  isFeatured?: boolean;
  metaTitle?: string | null;
  metaDescription?: string | null;
  heroH1?: string | null;
  heroSubtitle?: string | null;
  isPublic?: boolean;
}

export async function adminCreate(input: AdminCreateInput) {
  const row = await prisma.curatedListing.create({
    data: {
      slug: input.slug.trim(),
      type: input.type,
      label: input.label.trim(),
      filterPreset: input.filterPreset as object,
      iconKey: input.iconKey ?? null,
      displayOrder: input.displayOrder ?? 0,
      isFeatured: input.isFeatured ?? false,
      metaTitle: input.metaTitle ?? null,
      metaDescription: input.metaDescription ?? null,
      heroH1: input.heroH1 ?? null,
      heroSubtitle: input.heroSubtitle ?? null,
      isPublic: input.isPublic ?? true,
    },
  });
  await invalidateCache();
  return row;
}

export type AdminUpdateInput = Partial<AdminCreateInput>;

export async function adminUpdate(id: string, input: AdminUpdateInput) {
  const data: Record<string, unknown> = {};
  if (input.slug !== undefined) data.slug = input.slug.trim();
  if (input.type !== undefined) data.type = input.type;
  if (input.label !== undefined) data.label = input.label.trim();
  if (input.filterPreset !== undefined) data.filterPreset = input.filterPreset as object;
  if (input.iconKey !== undefined) data.iconKey = input.iconKey;
  if (input.displayOrder !== undefined) data.displayOrder = input.displayOrder;
  if (input.isFeatured !== undefined) data.isFeatured = input.isFeatured;
  if (input.metaTitle !== undefined) data.metaTitle = input.metaTitle;
  if (input.metaDescription !== undefined) data.metaDescription = input.metaDescription;
  if (input.heroH1 !== undefined) data.heroH1 = input.heroH1;
  if (input.heroSubtitle !== undefined) data.heroSubtitle = input.heroSubtitle;
  if (input.isPublic !== undefined) data.isPublic = input.isPublic;

  const row = await prisma.curatedListing.update({ where: { id }, data });
  await invalidateCache();
  return row;
}

export async function adminDelete(id: string) {
  await prisma.curatedListing.delete({ where: { id } });
  await invalidateCache();
}

/**
 * Bulk reorder: accepts an array of `{id, displayOrder}` and applies
 * them in a single transaction. Used by the drag-to-reorder UI.
 */
export async function adminReorder(items: Array<{ id: string; displayOrder: number }>) {
  if (!items.length) return;
  await prisma.$transaction(
    items.map((it) =>
      prisma.curatedListing.update({
        where: { id: it.id },
        data: { displayOrder: it.displayOrder },
      })
    )
  );
  await invalidateCache();
}
