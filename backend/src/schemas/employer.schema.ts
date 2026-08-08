import { z } from 'zod';
import { digestPrefsShape } from './digest-prefs.schema';
import { CompanyType, AccountType, HiringType } from '@prisma/client';
import { CURRENCY_CODES } from '../constants';

export const updateCompanyProfileSchema = z.object({
  body: z.object({
    // Account Classification
    accountType: z.nativeEnum(AccountType, { error: 'Invalid account type' }).optional(),
    hiringType: z.nativeEnum(HiringType, { error: 'Invalid hiring type' }).optional(),
    // Identity
    companyName: z.string().min(1).max(200).optional(),
    companyType: z.nativeEnum(CompanyType, { error: 'Invalid company type' }).optional(),
    tagline: z.string().max(300).optional(),
    industry: z.string().optional(),
    subIndustry: z.string().max(200).optional(),
    specialties: z.array(z.string().max(200)).optional(),
    companySize: z.string().optional(),
    description: z.string().max(5000).optional(),
    whyWorkForUs: z.string().max(5000).optional(),
    website: z.string().url().optional().or(z.literal('')),
    careersPageUrl: z.string().url().or(z.literal('')).optional(),
    blogUrl: z.string().url().or(z.literal('')).optional(),
    companyVideoUrl: z.string().url().or(z.literal('')).optional(),
    foundedYear: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
    parentCompany: z.string().max(200).optional(),
    stockTicker: z.string().max(20).optional(),

    // Registration Numbers (India)
    gstNumber: z.string().optional(),
    cinNumber: z
      .string()
      .regex(/^[A-Z]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/, 'Invalid CIN format')
      .optional()
      .or(z.literal('')),
    panNumber: z
      .string()
      .regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'Invalid PAN format')
      .optional()
      .or(z.literal('')),
    llpinNumber: z
      .string()
      .regex(/^[A-Z]{3}-\d{4}$/, 'Invalid LLPIN format')
      .optional()
      .or(z.literal('')),
    tanNumber: z
      .string()
      .regex(/^[A-Z]{4}\d{5}[A-Z]$/, 'Invalid TAN format')
      .optional()
      .or(z.literal('')),

    // Funding
    fundingStage: z
      .enum([
        'BOOTSTRAPPED',
        'SEED',
        'SERIES_A',
        'SERIES_B',
        'SERIES_C',
        'SERIES_D_PLUS',
        'PRE_IPO',
        'PUBLIC',
        'ACQUIRED',
        'NOT_APPLICABLE',
      ])
      .optional(),
    totalFundingRaised: z.string().max(100).optional(),
    totalFundingRaisedAmount: z.coerce.number().nonnegative().optional(),
    fundingCurrency: z.enum(CURRENCY_CODES).optional().or(z.literal('')),
    investors: z.array(z.string().max(200)).optional(),

    // Details
    employeeCount: z.number().int().min(1).optional(),
    numberOfOffices: z.number().int().min(1).optional(),
    annualRevenueRange: z.string().optional(),
    techStack: z.array(z.string()).optional(),

    // Products & Services
    productsServices: z.array(z.string().max(200)).optional(),

    // Culture & Policies
    companyCulture: z.string().max(5000).optional(),
    missionStatement: z.string().max(2000).optional(),
    visionStatement: z.string().max(2000).optional(),
    diversityStatement: z.string().max(2000).optional(),
    coreValues: z.array(z.string().max(100)).optional(),
    employeeResourceGroups: z.array(z.string().max(200)).optional(),
    csrInitiatives: z.string().max(5000).optional(),
    interviewProcess: z.string().max(5000).optional(),
    benefits: z.array(z.string()).optional(),
    structuredPerks: z
      .array(
        z.object({
          category: z.string().min(1),
          perks: z.array(z.string()),
        })
      )
      .optional(),
    workplacePolicies: z
      .array(
        z.object({
          title: z.string().min(1),
          description: z.string().optional(),
        })
      )
      .optional(),
    awardsRecognitions: z
      .array(
        z.object({
          title: z.string().min(1),
          year: z.number().int().optional(),
          issuingOrg: z.string().optional(),
          description: z.string().optional(),
        })
      )
      .optional(),

    // People & Media
    leadershipTeam: z
      .array(
        z.object({
          name: z.string(),
          designation: z.string(),
          linkedinUrl: z.string().url().or(z.literal('')).optional(),
          imageUrl: z.string().url().or(z.literal('')).optional(),
          bio: z.string().max(1000).optional(),
        })
      )
      .optional(),
    employeeTestimonials: z
      .array(
        z.object({
          name: z.string(),
          designation: z.string().optional(),
          department: z.string().optional(),
          quote: z.string().max(2000),
          imageUrl: z.string().url().or(z.literal('')).optional(),
        })
      )
      .optional(),
    officePhotos: z
      .array(
        z.object({
          url: z.string().url(),
          caption: z.string().max(200).optional(),
          location: z.string().max(200).optional(),
        })
      )
      .optional(),

    // Social & Contact
    socialLinks: z
      .object({
        linkedin: z.string().optional(),
        twitter: z.string().optional(),
        facebook: z.string().optional(),
        instagram: z.string().optional(),
        youtube: z.string().url().or(z.literal('')).optional(),
        glassdoor: z.string().url().or(z.literal('')).optional(),
      })
      .optional(),
    contactEmail: z.string().email().optional().or(z.literal('')),
    contactPhone: z.string().optional(),
    contactPersonName: z.string().max(200).optional(),
    contactPersonDesignation: z.string().max(200).optional(),

    // Notification Preferences
    notificationPreferences: z
      .object({
        emailApplications: z.boolean().optional(),
        emailMessages: z.boolean().optional(),
        emailMarketing: z.boolean().optional(),
        smsAlerts: z.boolean().optional(),
        whatsappNotifications: z.boolean().optional(),
        inAppNotifications: z.boolean().optional(),
        fcmNotifications: z.boolean().optional(),
        webPushNotifications: z.boolean().optional(),
        weeklyDigest: z.boolean().optional(),
        // Per-category cadence + quiet hours for the recurring digests.
        ...digestPrefsShape,
      })
      .optional(),

    // Locations
    headquarters: z.string().optional(),
    locations: z.array(z.string()).optional(),

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
  }),
});

export type UpdateCompanyProfileInput = z.infer<typeof updateCompanyProfileSchema>['body'];
