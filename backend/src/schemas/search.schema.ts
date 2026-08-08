import { z } from 'zod';
import {
  WorkMode,
  ShiftType,
  ExperienceLevel,
  EducationLevel,
  CompanyType,
  UrgencyLevel,
  WorkStatus,
  NoticePeriod,
  Gender,
  DisabilityType,
} from '@prisma/client';

// --- Job search schema ---

export const searchJobsSchema = z.object({
  query: z.object({
    // Text search
    keyword: z.string().optional(),

    // Location & Work
    location: z.string().optional(),
    type: z.string().optional(), // JobType as string from query
    isRemote: z.string().optional(), // "true"/"false"
    workMode: z.nativeEnum(WorkMode, { error: 'Invalid work mode' }).optional(),
    shiftType: z.nativeEnum(ShiftType, { error: 'Invalid shift type' }).optional(),

    // Industry & Department
    industry: z.string().optional(),
    department: z.string().optional(),

    // Experience & Education
    experience: z.string().optional(), // min experience years
    experienceLevel: z
      .nativeEnum(ExperienceLevel, { error: 'Invalid experience level' })
      .optional(),
    educationRequired: z
      .nativeEnum(EducationLevel, { error: 'Invalid education level' })
      .optional(),

    // Salary
    salaryMin: z.string().optional(),
    salaryMax: z.string().optional(),

    // Company filters (denormalized)
    companyType: z.nativeEnum(CompanyType, { error: 'Invalid company type' }).optional(),
    companySize: z.string().optional(),

    // Date filters
    postedAfter: z.string().optional(), // ISO date
    postedBefore: z.string().optional(), // ISO date

    // Tags & Urgency
    tags: z.string().optional(), // comma-separated
    urgencyLevel: z.nativeEnum(UrgencyLevel, { error: 'Invalid urgency level' }).optional(),
    isFeatured: z.string().optional(), // "true"/"false"
    isWalkIn: z.string().optional(), // "true"/"false"

    // Geo-proximity
    latitude: z.string().optional(), // e.g. "28.6139"
    longitude: z.string().optional(), // e.g. "77.2090"
    radiusKm: z.string().optional(), // e.g. "50"

    // Sorting
    sortBy: z.enum(['relevance', 'date', 'salary', 'distance']).optional(),

    // Pagination
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

// --- Candidate search schema ---

export const searchCandidatesSchema = z.object({
  query: z.object({
    // Text search
    keyword: z.string().optional(),
    keywordScope: z.enum(['all', 'title', 'skills', 'designation', 'company']).optional(),
    excludeKeywords: z.string().optional(), // comma-separated keywords to exclude

    // Location
    location: z.string().optional(),
    excludeLocation: z.string().optional(), // comma-separated locations to exclude

    // Skills
    skills: z.string().optional(), // comma-separated

    // Experience
    experienceMin: z.string().optional(),
    experienceMax: z.string().optional(),

    // Salary
    salaryMin: z.string().optional(),
    salaryMax: z.string().optional(),
    salaryCurrency: z.string().optional(), // INR, USD, etc.
    includeSalaryNotDisclosed: z.string().optional(), // "true"/"false"

    // Status & Availability
    workStatus: z.nativeEnum(WorkStatus, { error: 'Invalid work status' }).optional(),
    noticePeriod: z.nativeEnum(NoticePeriod, { error: 'Invalid notice period' }).optional(),
    servingNoticePeriod: z.string().optional(), // "true"/"false"

    // Demographics
    gender: z.nativeEnum(Gender, { error: 'Invalid gender' }).optional(),
    disabilityType: z.nativeEnum(DisabilityType, { error: 'Invalid disability type' }).optional(),
    ageMin: z.string().optional(),
    ageMax: z.string().optional(),

    // Preferences
    willingToRelocate: z.string().optional(), // "true"/"false"
    preferredWorkMode: z.nativeEnum(WorkMode, { error: 'Invalid work mode' }).optional(),
    preferredJobType: z.string().optional(), // JobType enum value

    // Activity
    lastActiveWithin: z.string().optional(), // "7d", "30d", "90d"

    // Company & Role
    currentCompany: z.string().optional(),
    excludeCompany: z.string().optional(), // comma-separated
    designation: z.string().optional(), // current role
    department: z.string().optional(), // current department

    // Industry & Background
    currentIndustry: z.string().optional(),
    hasCareerBreak: z.string().optional(), // "true"/"false"

    // Verification & Resume
    hasResume: z.string().optional(), // "true"/"false"
    verifiedMobile: z.string().optional(), // "true"/"false"
    verifiedEmail: z.string().optional(), // "true"/"false"

    // Registration & Modification
    registeredAfter: z.string().optional(), // ISO date
    modifiedAfter: z.string().optional(), // ISO date

    // Education & Certifications
    education: z.string().optional(), // degree keyword
    educationLevel: z.enum(['UG', 'PG', 'DOCTORATE']).optional(), // structured degree level
    certifications: z.string().optional(), // certification name

    // Keyword matching
    keywordOperator: z.enum(['and', 'or']).optional(), // AND = mandatory, OR = any match

    // IT Skills (nested)
    itSkill: z.string().optional(), // technology name to search in itSkills

    // Work permit / Visa
    workPermit: z.string().optional(), // country or visa status

    // Geo-proximity
    latitude: z.string().optional(),
    longitude: z.string().optional(),
    radiusKm: z.string().optional(),
    sortBy: z.enum(['relevance', 'distance']).optional(),

    // Pagination
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});
