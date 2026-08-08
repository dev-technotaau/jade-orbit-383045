import { z } from 'zod';

export const updateProfileSchema = z.object({
  headline: z.string().max(200, 'Headline is too long').optional(),
  bio: z.string().max(2000, 'Bio is too long').optional(),
  gender: z.enum(['MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY', 'OTHER']).optional(),
  dob: z.string().optional(),
  maritalStatus: z
    .enum(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'PREFER_NOT_TO_SAY'])
    .optional(),
  nationality: z.string().optional(),
  currentLocation: z.string().optional(),
  preferredLocations: z.array(z.string()).optional(),
  phone: z.string().optional(),
  experienceYears: z.number().min(0).optional(),
  currentCompany: z.string().optional(),
  currentRole: z.string().optional(),
  currentIndustry: z.string().optional(),
  currSalary: z.number().min(0).optional(),
  expectedSalaryMin: z.number().min(0).optional(),
  expectedSalaryMax: z.number().min(0).optional(),
  salaryCurrency: z.string().optional(),
  noticePeriod: z
    .enum([
      'IMMEDIATE',
      'FIFTEEN_DAYS',
      'THIRTY_DAYS',
      'SIXTY_DAYS',
      'NINETY_DAYS',
      'MORE_THAN_NINETY_DAYS',
    ])
    .optional(),
  workStatus: z
    .enum(['EMPLOYED', 'UNEMPLOYED', 'STUDENT', 'FREELANCER', 'ACTIVELY_LOOKING'])
    .optional(),
  preferredJobType: z
    .array(z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'FREELANCE']))
    .optional(),
  preferredWorkMode: z.array(z.enum(['ON_SITE', 'REMOTE', 'HYBRID'])).optional(),
  willingToRelocate: z.boolean().optional(),
  skills: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  githubProfile: z.string().url('Invalid URL').optional().or(z.literal('')),
  linkedinProfile: z.string().url('Invalid URL').optional().or(z.literal('')),
  portfolioUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
});

export type UpdateProfileFormData = z.infer<typeof updateProfileSchema>;
