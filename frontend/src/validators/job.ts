import { z } from 'zod';

export const createJobSchema = z
  .object({
    title: z
      .string()
      .min(3, 'Job title must be at least 3 characters')
      .max(200, 'Job title is too long'),
    description: z.string().min(10, 'Description must be at least 10 characters'),
    keyResponsibilities: z.string().optional(),
    requirements: z.string().optional(),
    benefits: z.string().optional(),
    type: z
      .enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'FREELANCE'])
      .default('FULL_TIME'),
    workMode: z.enum(['ON_SITE', 'REMOTE', 'HYBRID']).optional(),
    shiftType: z.enum(['DAY', 'NIGHT', 'ROTATIONAL', 'FLEXIBLE']).optional(),
    industry: z.string().optional(),
    department: z.string().optional(),
    roleCategory: z.string().optional(),
    experienceMin: z.number().min(0).default(0),
    experienceMax: z.number().min(0).optional(),
    experienceLevel: z.enum(['FRESHER', 'ENTRY', 'MID', 'SENIOR', 'LEAD', 'EXECUTIVE']).optional(),
    educationRequired: z
      .enum(['TENTH', 'TWELFTH', 'DIPLOMA', 'BACHELORS', 'MASTERS', 'PHD', 'POST_DOCTORAL'])
      .optional(),
    location: z.string().min(1, 'Location is required'),
    isRemote: z.boolean().default(false),
    salaryMin: z.number().min(0).optional(),
    salaryMax: z.number().min(0).optional(),
    currency: z.string().default('INR'),
    salaryType: z.enum(['ANNUAL', 'MONTHLY', 'HOURLY']).default('ANNUAL'),
    salaryDisclosed: z.boolean().default(true),
    skillsRequired: z.array(z.string()).default([]),
    niceToHaveSkills: z.array(z.string()).optional(),
    numberOfOpenings: z.number().min(1).default(1),
    urgencyLevel: z.enum(['NORMAL', 'URGENT', 'IMMEDIATE']).default('NORMAL'),
    tags: z.array(z.string()).optional(),
    jobPerks: z.array(z.string()).optional(),
    applicationDeadline: z.string().optional(),
    interviewProcess: z.string().optional(),
    isWalkIn: z.boolean().default(false),
    contactPerson: z.string().optional(),
    contactEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  })
  .refine(
    (data) => {
      if (data.salaryMin && data.salaryMax) {
        return data.salaryMax >= data.salaryMin;
      }
      return true;
    },
    {
      message: 'Maximum salary must be greater than or equal to minimum salary',
      path: ['salaryMax'],
    },
  )
  .refine(
    (data) => {
      if (data.experienceMax !== undefined) {
        return data.experienceMax >= data.experienceMin;
      }
      return true;
    },
    {
      message: 'Maximum experience must be greater than or equal to minimum',
      path: ['experienceMax'],
    },
  );

export const updateJobSchema = createJobSchema.partial();

export type CreateJobFormData = z.infer<typeof createJobSchema>;
export type UpdateJobFormData = z.infer<typeof updateJobSchema>;
