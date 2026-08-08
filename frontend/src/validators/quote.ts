import { z } from 'zod';

export const createQuoteSchema = z.object({
  companyName: z.string().min(2, 'Company name required').max(180),
  contactPerson: z.string().min(2, 'Contact person required').max(120),
  designation: z.string().max(80).optional().nullable(),
  email: z.string().email('Invalid email'),
  phone: z.string().regex(/^\+?[0-9\s-]{8,20}$/, 'Invalid phone'),
  employeeRange: z.enum(['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+']),
  hiringNeed: z.string().min(10, 'Tell us a bit about your hiring need').max(2000),
  requiredCvCount: z.coerce.number().int().min(1).max(100_000),
  validityDays: z.coerce.number().int().min(7).max(365).default(30),
  expectedSeats: z.coerce.number().int().min(1).max(1000).default(1),
  currentToolStack: z.string().max(500).optional().nullable(),
  budgetRange: z.string().max(100).optional().nullable(),
  additionalNotes: z.string().max(2000).optional().nullable(),
});

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
