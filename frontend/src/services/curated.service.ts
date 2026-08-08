/**
 * Frontend client for /api/v1/public/curated.
 * Drives header mega-menu, footer mega-section, and SEO landing pages.
 */
import api from '@/lib/api';

export type CuratedType =
  | 'JOB_CATEGORY'
  | 'JOB_DEMAND'
  | 'JOB_LOCATION'
  | 'JOB_QUALIFICATION'
  | 'JOB_DEPARTMENT'
  | 'JOB_COLLECTION'
  | 'COMPANY_CATEGORY'
  | 'COMPANY_COLLECTION';

export interface CuratedListing {
  id: string;
  slug: string;
  type: CuratedType;
  label: string;
  filterPreset: Record<string, unknown>;
  iconKey?: string | null;
  displayOrder: number;
  isFeatured: boolean;
  metaTitle?: string | null;
  metaDescription?: string | null;
  heroH1?: string | null;
  heroSubtitle?: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

interface BackendEnvelope<T> {
  status?: string;
  data: T;
}

export const curatedService = {
  async listByType(type: CuratedType, opts: { featured?: boolean; limit?: number } = {}) {
    const { data } = await api.get<BackendEnvelope<{ items: CuratedListing[] }>>(
      `/public/curated/${type}`,
      { params: { featured: opts.featured, limit: opts.limit } },
    );
    return data?.data?.items ?? [];
  },

  async getBySlug(slug: string): Promise<CuratedListing | null> {
    try {
      const { data } = await api.get<BackendEnvelope<CuratedListing>>(
        `/public/curated/by-slug/${encodeURIComponent(slug)}`,
      );
      return data?.data ?? null;
    } catch {
      return null;
    }
  },

  async menu(): Promise<Record<CuratedType, CuratedListing[]>> {
    const { data } =
      await api.get<BackendEnvelope<Record<CuratedType, CuratedListing[]>>>('/public/curated/menu');
    return data?.data ?? ({} as Record<CuratedType, CuratedListing[]>);
  },

  async footer(): Promise<Record<CuratedType, CuratedListing[]>> {
    const { data } =
      await api.get<BackendEnvelope<Record<CuratedType, CuratedListing[]>>>(
        '/public/curated/footer',
      );
    return data?.data ?? ({} as Record<CuratedType, CuratedListing[]>);
  },
};

/**
 * Server-side fetch helper for use in App Router pages with `revalidate`.
 * Goes via BACKEND_INTERNAL_URL when set (k8s server-to-server), falls
 * back to NEXT_PUBLIC_API_URL otherwise.
 */
export async function fetchCuratedMenu(): Promise<Record<CuratedType, CuratedListing[]>> {
  const apiBase =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:5000/api/v1';
  try {
    const res = await fetch(`${apiBase}/public/curated/menu`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return {} as Record<CuratedType, CuratedListing[]>;
    const body = await res.json();
    return body?.data ?? ({} as Record<CuratedType, CuratedListing[]>);
  } catch {
    return {} as Record<CuratedType, CuratedListing[]>;
  }
}

export async function fetchCuratedFooter(): Promise<Record<CuratedType, CuratedListing[]>> {
  const apiBase =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:5000/api/v1';
  try {
    const res = await fetch(`${apiBase}/public/curated/footer`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return {} as Record<CuratedType, CuratedListing[]>;
    const body = await res.json();
    return body?.data ?? ({} as Record<CuratedType, CuratedListing[]>);
  } catch {
    return {} as Record<CuratedType, CuratedListing[]>;
  }
}

// ==========================================================
//   Super-admin editorial CMS — /super-admin/curated-listings
// ==========================================================

export interface CuratedAdminListInput {
  type?: CuratedType;
  isPublic?: boolean;
  isFeatured?: boolean;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface CuratedAdminListResult {
  items: CuratedListing[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export type CuratedUpsertInput = {
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
};

export const curatedAdminService = {
  async list(input: CuratedAdminListInput = {}): Promise<CuratedAdminListResult> {
    const { data } = await api.get<BackendEnvelope<CuratedAdminListResult>>(
      '/super-admin/curated-listings',
      { params: input },
    );
    return data.data;
  },

  async getById(id: string): Promise<CuratedListing> {
    const { data } = await api.get<BackendEnvelope<CuratedListing>>(
      `/super-admin/curated-listings/${id}`,
    );
    return data.data;
  },

  async create(input: CuratedUpsertInput): Promise<CuratedListing> {
    const { data } = await api.post<BackendEnvelope<CuratedListing>>(
      '/super-admin/curated-listings',
      input,
    );
    return data.data;
  },

  async update(id: string, input: Partial<CuratedUpsertInput>): Promise<CuratedListing> {
    const { data } = await api.patch<BackendEnvelope<CuratedListing>>(
      `/super-admin/curated-listings/${id}`,
      input,
    );
    return data.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/super-admin/curated-listings/${id}`);
  },

  async reorder(items: Array<{ id: string; displayOrder: number }>): Promise<void> {
    await api.post('/super-admin/curated-listings/reorder', { items });
  },
};
