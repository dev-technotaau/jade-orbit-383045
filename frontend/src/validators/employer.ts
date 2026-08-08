import { z } from 'zod';

export const updateCompanySchema = z.object({
  companyName: z.string().min(2, 'Company name must be at least 2 characters').optional(),
  companyType: z
    .enum(['PRIVATE', 'PUBLIC', 'STARTUP', 'MNC', 'GOVERNMENT', 'NGO', 'SEMI_GOVERNMENT'])
    .optional(),
  tagline: z.string().max(200, 'Tagline is too long').optional(),
  industry: z.string().optional(),
  companySize: z.string().optional(),
  employeeCount: z.number().min(1).optional(),
  description: z.string().max(5000, 'Description is too long').optional(),
  website: z.string().url('Invalid URL').optional().or(z.literal('')),
  foundedYear: z.number().min(1800).max(new Date().getFullYear()).optional(),
  gstNumber: z.string().optional(),
  cinNumber: z.string().optional(),
  panNumber: z.string().optional(),
  annualRevenueRange: z.string().optional(),
  techStack: z.array(z.string()).optional(),
  companyCulture: z.string().max(3000).optional(),
  missionStatement: z.string().max(1000).optional(),
  visionStatement: z.string().max(1000).optional(),
  benefits: z.array(z.string()).optional(),
  contactEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  contactPhone: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  country: z.string().optional(),
  headquarters: z.string().optional(),
  locations: z.array(z.string()).optional(),
});

export type UpdateCompanyFormData = z.infer<typeof updateCompanySchema>;
