import { z } from 'zod';

export const saveSearchSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    searchType: z.enum(['CANDIDATE_SEARCH', 'JOB_SEARCH']),
    filters: z.record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])
    ),
  }),
});

export const updateSavedSearchSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    filters: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]))
      .optional(),
  }),
  params: z.object({
    id: z.string().uuid(),
  }),
});
