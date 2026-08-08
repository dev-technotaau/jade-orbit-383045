import { z } from 'zod';

export const autocompleteQuery = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const suggestQuery = z.object({
  q: z.string().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const didYouMeanQuery = z.object({
  q: z.string().min(1).max(200),
});

export const popularQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const unifiedSuggestQuery = z.object({
  q: z.string().max(100).default(''),
  category: z.string().min(1).max(50),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  region: z.string().max(10).optional(),
});

// ─── Field History ──────────────────────────────────────────────────

export const fieldHistoryParams = z.object({
  field: z.enum(['location', 'skill', 'company']),
});

export const fieldHistoryQuery = z.object({
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

export const fieldHistoryBody = z.object({
  value: z.string().min(1).max(200).trim(),
});
