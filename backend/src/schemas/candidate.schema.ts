import { z } from 'zod';
import { digestPrefsShape } from './digest-prefs.schema';
import {
  Gender,
  WorkStatus,
  NoticePeriod,
  MaritalStatus,
  DisabilityType,
  WorkMode,
  ShiftType,
  JobType,
  LanguageProficiency,
  ExperienceLevel,
  EducationLevel,
  SpecificDegree,
  DrivingLicenseType,
  VehicleType,
} from '@prisma/client';
import { CURRENCY_CODES } from '../constants';

// --- Reusable sub-schemas for JSON fields ---

const certificationSchema = z.object({
  name: z.string().min(1),
  issuingOrg: z.string().optional(),
  issueDate: z.string().optional(),
  expiryDate: z.string().optional(),
  credentialId: z.string().optional(),
  credentialUrl: z.string().url().optional().or(z.literal('')),
  doesNotExpire: z.boolean().optional(),
});

const projectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  role: z.string().optional(),
  technologies: z.array(z.string()).optional(),
  url: z.string().url().optional().or(z.literal('')),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  teamSize: z.number().min(0).optional(),
  client: z.string().optional(),
  isCurrent: z.boolean().optional(),
});

const awardSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  issuingOrg: z.string().optional(),
  year: z.number().int().optional(),
});

const languageProficiencySchema = z.object({
  language: z.string().min(1),
  proficiency: z.nativeEnum(LanguageProficiency, { error: 'Invalid proficiency level' }),
});

const skillWithProficiencySchema = z.object({
  skill: z.string().min(1),
  proficiency: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']),
  yearsOfExperience: z.number().min(0).optional(),
});

const itSkillSchema = z.object({
  technology: z.string(),
  version: z.string().optional(),
  lastUsed: z.string().optional(),
  experienceYears: z.number().min(0).optional(),
  proficiency: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']).optional(),
});

const publicationSchema = z.object({
  title: z.string(),
  publisher: z.string().optional(),
  publicationDate: z.string().optional(),
  url: z.string().url().or(z.literal('')).optional(),
  description: z.string().max(1000).optional(),
  authors: z.string().optional(),
});

const patentSchema = z.object({
  title: z.string(),
  patentOffice: z.string().optional(),
  patentNumber: z.string().optional(),
  status: z.enum(['FILED', 'PUBLISHED', 'GRANTED']).optional(),
  filingDate: z.string().optional(),
  issueDate: z.string().optional(),
  url: z.string().url().or(z.literal('')).optional(),
  description: z.string().max(1000).optional(),
  inventors: z.string().optional(),
});

const volunteerExperienceSchema = z.object({
  organization: z.string(),
  role: z.string(),
  cause: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  isCurrent: z.boolean().optional(),
  description: z.string().max(1000).optional(),
});

const professionalMembershipSchema = z.object({
  organization: z.string(),
  role: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  membershipId: z.string().optional(),
  description: z.string().max(500).optional(),
});

const courseSchema = z.object({
  name: z.string(),
  provider: z.string().optional(),
  completionDate: z.string().optional(),
  url: z.string().url().or(z.literal('')).optional(),
  associatedWith: z.string().optional(),
});

const testScoreSchema = z.object({
  testName: z.string(),
  score: z.string(),
  dateOfExam: z.string().optional(),
  associatedWith: z.string().optional(),
  description: z.string().max(500).optional(),
});

const referenceSchema = z.object({
  name: z.string(),
  designation: z.string().optional(),
  organization: z.string().optional(),
  email: z.string().email().or(z.literal('')).optional(),
  phone: z.string().optional(),
  relationship: z.string().optional(),
});

// --- Main profile update schema ---

export const updateCandidateProfileSchema = z.object({
  body: z
    .object({
      // Personal & Identity
      headline: z.string().max(200).optional(),
      gender: z.nativeEnum(Gender, { error: 'Invalid gender' }).optional(),
      dob: z.string().date().or(z.string().datetime()).optional(),
      bio: z.string().max(2000).optional(),
      maritalStatus: z.nativeEnum(MaritalStatus, { error: 'Invalid marital status' }).optional(),
      nationality: z.string().max(50).optional(),
      hometown: z.string().max(100).optional(),
      pronouns: z.string().max(30).optional(),
      category: z.enum(['GENERAL', 'SC', 'ST', 'OBC', 'EWS', 'PREFER_NOT_TO_SAY']).optional(),

      // Address
      addressLine1: z.string().max(200).optional(),
      addressLine2: z.string().max(200).optional(),
      city: z.string().max(100).optional(),
      state: z.string().max(100).optional(),
      pincode: z
        .string()
        .regex(/^\d{6}$/, 'Pincode must be 6 digits')
        .optional()
        .or(z.literal('')),
      country: z.string().max(100).optional(),

      // Contact & Location
      currentLocation: z.string().optional(),
      preferredLocations: z.array(z.string()).optional(),
      phone: z.string().optional(),
      alternatePhone: z.string().max(20).optional(),
      alternateEmail: z.string().email().or(z.literal('')).optional(),
      videoResumeUrl: z.string().url().or(z.literal('')).optional(),

      // Professional
      experienceYears: z.number().min(0).max(50).optional(),
      totalExperienceMonths: z.number().int().min(0).max(600).optional(),
      experienceLevel: z
        .nativeEnum(ExperienceLevel, { error: 'Invalid experience level' })
        .optional(),
      currentCompany: z.string().optional(),
      currentRole: z.string().optional(),
      currentIndustry: z.string().optional(),
      currentDepartment: z.string().optional(),
      functionalArea: z.string().optional(),
      hasCareerBreak: z.boolean().optional(),
      careerBreakReason: z.string().max(500).optional(),
      careerBreakType: z
        .enum([
          'HEALTH',
          'FAMILY',
          'HIGHER_EDUCATION',
          'TRAVEL',
          'LAYOFF',
          'PERSONAL',
          'CAREGIVING',
          'CAREER_TRANSITION',
          'OTHER',
        ])
        .optional(),
      openToWork: z.enum(['ACTIVELY_LOOKING', 'OPEN_TO_OFFERS', 'NOT_LOOKING']).optional(),

      // Salary
      currSalary: z.coerce.number().min(0).optional(),
      expectedSalaryMin: z.coerce.number().min(0).optional(),
      expectedSalaryMax: z.coerce.number().min(0).optional(),
      salaryCurrency: z.enum(CURRENCY_CODES).optional().or(z.literal('')),

      // Career Preferences
      noticePeriod: z.nativeEnum(NoticePeriod, { error: 'Invalid notice period' }).optional(),
      servingNoticePeriod: z.boolean().optional(),
      workStatus: z.nativeEnum(WorkStatus, { error: 'Invalid work status' }).optional(),
      preferredJobType: z.array(z.nativeEnum(JobType, { error: 'Invalid job type' })).optional(),
      preferredWorkMode: z.array(z.nativeEnum(WorkMode, { error: 'Invalid work mode' })).optional(),
      preferredShift: z.nativeEnum(ShiftType, { error: 'Invalid shift type' }).optional(),
      preferredIndustries: z.array(z.string()).optional(),
      preferredRoleCategories: z.array(z.string()).optional(),
      dateOfAvailability: z.string().date().or(z.string().datetime()).optional(),
      willingToRelocate: z.boolean().optional(),
      travelWillingnessPercent: z.number().int().min(0).max(100).optional(),

      // Disability
      disabilityType: z.nativeEnum(DisabilityType, { error: 'Invalid disability type' }).optional(),
      disabilityPercentage: z.number().int().min(0).max(100).optional(),
      isPhysicallyChallenged: z.boolean().optional(),

      // Education Level
      highestEducationLevel: z
        .nativeEnum(EducationLevel, { error: 'Invalid education level' })
        .optional(),
      highestDegree: z.nativeEnum(SpecificDegree, { error: 'Invalid degree' }).optional(),

      // Skills & Education
      skills: z.array(z.string()).optional(),
      skillsWithProficiency: z.array(skillWithProficiencySchema).optional(),
      languages: z.array(z.string()).optional(),
      languageProficiency: z.array(languageProficiencySchema).optional(),
      education: z
        .array(
          z.object({
            educationLevel: z
              .nativeEnum(EducationLevel, { error: 'Invalid education level' })
              .optional(),
            degree: z.string(),
            boardState: z.string().optional(),
            institution: z.string(),
            field: z.string().optional(),
            year: z.string().optional(),
            startDate: z.string().optional(),
            endDate: z.string().optional(),
            grade: z.string().optional(),
            description: z.string().optional(),
            gradeType: z.enum(['PERCENTAGE', 'CGPA', 'GPA']).optional(),
            courseType: z.enum(['FULL_TIME', 'PART_TIME', 'DISTANCE', 'CORRESPONDENCE']).optional(),
            specialization: z.string().optional(),
            activities: z.string().optional(),
          })
        )
        .optional(),
      experience: z
        .array(
          z.object({
            company: z.string(),
            role: z.string(),
            location: z.string().optional(),
            startDate: z.string(),
            endDate: z.string().optional(),
            isCurrent: z.boolean().optional(),
            description: z.string().optional(),
            industry: z.string().optional(),
            department: z.string().optional(),
            employmentType: z.string().optional(),
            keyAchievements: z.array(z.string()).optional(),
            teamSize: z.number().min(0).optional(),
            reportingTo: z.string().optional(),
            annualCtc: z.number().min(0).optional(),
          })
        )
        .optional(),

      // Rich JSON fields
      certifications: z.array(certificationSchema).optional(),
      projects: z.array(projectSchema).optional(),
      awards: z.array(awardSchema).optional(),
      itSkills: z.array(itSkillSchema).optional(),
      publications: z.array(publicationSchema).optional(),
      patents: z.array(patentSchema).optional(),
      volunteerExperience: z.array(volunteerExperienceSchema).optional(),
      professionalMemberships: z.array(professionalMembershipSchema).optional(),
      courses: z.array(courseSchema).optional(),
      testScores: z.array(testScoreSchema).optional(),
      references: z.array(referenceSchema).optional(),

      // Documents & Background
      visaStatus: z.string().max(100).optional(),
      workPermitStatus: z.string().max(100).optional(),
      passportNumber: z.string().max(20).optional(),
      passportExpiryDate: z.string().date().or(z.string().datetime()).or(z.literal('')).optional(),
      hasDrivingLicense: z.boolean().optional(),
      drivingLicenseType: z
        .nativeEnum(DrivingLicenseType, { error: 'Invalid driving license type' })
        .optional(),
      ownVehicle: z.boolean().optional(),
      vehicleTypes: z
        .array(z.nativeEnum(VehicleType, { error: 'Invalid vehicle type' }))
        .optional(),
      isVeteran: z.boolean().optional(),
      blockedCompanies: z.array(z.string().max(200)).optional(),

      // Interests & Hobbies
      interests: z.array(z.string().max(100)).optional(),
      hobbies: z.array(z.string().max(100)).optional(),

      // Notification Preferences
      notificationPreferences: z
        .object({
          emailNotifications: z.boolean().optional(),
          smsNotifications: z.boolean().optional(),
          whatsappNotifications: z.boolean().optional(),
          inAppNotifications: z.boolean().optional(),
          fcmNotifications: z.boolean().optional(),
          webPushNotifications: z.boolean().optional(),
          // Per-category cadence + quiet hours for the recurring digests.
          ...digestPrefsShape,
        })
        .optional(),

      // Social Profiles
      githubProfile: z.string().url().optional().or(z.literal('')),
      linkedinProfile: z.string().url().optional().or(z.literal('')),
      portfolioUrl: z.string().url().optional().or(z.literal('')),
      stackOverflowProfile: z.string().url().optional().or(z.literal('')),
      twitterProfile: z.string().url().optional().or(z.literal('')),
      personalBlogUrl: z.string().url().optional().or(z.literal('')),
      dribbbleProfile: z.string().url().or(z.literal('')).optional(),
      behanceProfile: z.string().url().or(z.literal('')).optional(),
      mediumProfile: z.string().url().or(z.literal('')).optional(),
      youtubeChannel: z.string().url().or(z.literal('')).optional(),
    })
    .refine(
      (data) => {
        if (!data.highestEducationLevel || !data.highestDegree) return true;
        const DEGREES_BY_LEVEL: Record<string, string[]> = {
          TENTH: [],
          TWELFTH: [],
          DIPLOMA: ['DIPLOMA_ENGINEERING'],
          BACHELORS: [
            'BTECH_BE',
            'BCA',
            'BSC',
            'BCOM',
            'BA',
            'BBA',
            'MBBS',
            'LLB',
            'BARCH',
            'BDES',
            'BPHARM',
            'ANY_GRADUATE',
          ],
          MASTERS: [
            'MCA',
            'MSC',
            'MCOM',
            'MA',
            'MBA_PGDM',
            'MTECH_ME',
            'MS',
            'LLM',
            'MD',
            'CA',
            'CS',
            'ICWA',
            'ANY_POSTGRADUATE',
          ],
          PHD: ['PHD'],
          POST_DOCTORAL: ['PHD'],
        };
        const allowed = DEGREES_BY_LEVEL[data.highestEducationLevel] || [];
        if (allowed.length === 0) return true; // TENTH/TWELFTH have no degrees
        return allowed.includes(data.highestDegree);
      },
      { message: 'Selected degree does not match the education level' }
    ),
});

export type UpdateCandidateProfileInput = z.infer<typeof updateCandidateProfileSchema>['body'];

// --- Candidate search schema ---

export const searchCandidatesSchema = z.object({
  query: z.object({
    keyword: z.string().optional(),
    keywordScope: z.enum(['all', 'title', 'skills', 'designation', 'company']).optional(), // which fields to search
    excludeKeywords: z.string().optional(), // comma-separated keywords to exclude
    location: z.string().optional(),
    excludeLocation: z.string().optional(), // comma-separated locations to exclude
    skills: z.string().optional(), // comma-separated
    experienceMin: z.string().optional(),
    experienceMax: z.string().optional(),
    salaryMin: z.string().optional(),
    salaryMax: z.string().optional(),
    salaryCurrency: z.enum(CURRENCY_CODES).optional().or(z.literal('')), // ISO-4217
    includeSalaryNotDisclosed: z.string().optional(), // "true"/"false" — include candidates who didn't mention salary
    workStatus: z.nativeEnum(WorkStatus, { error: 'Invalid work status' }).optional(),
    noticePeriod: z.nativeEnum(NoticePeriod, { error: 'Invalid notice period' }).optional(),
    servingNoticePeriod: z.string().optional(), // "true"/"false"
    gender: z.nativeEnum(Gender, { error: 'Invalid gender' }).optional(),
    willingToRelocate: z.string().optional(), // "true"/"false"
    preferredWorkMode: z.nativeEnum(WorkMode, { error: 'Invalid work mode' }).optional(),
    preferredJobType: z.string().optional(), // JobType enum value
    lastActiveWithin: z.string().optional(), // "7d", "30d", "90d"
    currentIndustry: z.string().optional(),
    currentCompany: z.string().optional(), // filter by current company
    excludeCompany: z.string().optional(), // comma-separated company names to exclude
    designation: z.string().optional(), // current role / designation
    department: z.string().optional(), // current department
    ageMin: z.string().optional(), // minimum age
    ageMax: z.string().optional(), // maximum age
    hasCareerBreak: z.string().optional(), // "true"/"false"
    hasResume: z.string().optional(), // "true"/"false"
    verifiedMobile: z.string().optional(), // "true"/"false"
    verifiedEmail: z.string().optional(), // "true"/"false"
    registeredAfter: z.string().optional(), // ISO date — new registrations since
    modifiedAfter: z.string().optional(), // ISO date — recently modified since
    education: z.string().optional(), // degree keyword
    certifications: z.string().optional(), // certification name keyword
    disabilityType: z.nativeEnum(DisabilityType, { error: 'Invalid disability type' }).optional(),
    openToWork: z.enum(['ACTIVELY_LOOKING', 'OPEN_TO_OFFERS', 'NOT_LOOKING']).optional(),
    category: z.enum(['GENERAL', 'SC', 'ST', 'OBC', 'EWS', 'PREFER_NOT_TO_SAY']).optional(),
    isVeteran: z.string().optional(), // "true"/"false"
    careerBreakType: z
      .enum([
        'HEALTH',
        'FAMILY',
        'HIGHER_EDUCATION',
        'TRAVEL',
        'LAYOFF',
        'PERSONAL',
        'CAREGIVING',
        'CAREER_TRANSITION',
        'OTHER',
      ])
      .optional(),
    // Geo-proximity
    latitude: z.string().optional(),
    longitude: z.string().optional(),
    radiusKm: z.string().optional(),
    sortBy: z.enum(['relevance', 'distance']).optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});
