import { z } from 'zod';

/**
 * E.164 mobile, matching `updateUserProfileSchema` — the sibling endpoint that
 * has always accepted a mobile number. The frontend's shared PhoneInput emits
 * exactly this shape (country code + digits).
 */
const e164Phone = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, 'Must be E.164 format (e.g. +919876543210)');

/**
 * Length bounds only here — the full complexity policy
 * (`validatePasswordStrength`) is enforced in the service, so admin-created
 * accounts obey the same env-driven rules as self-registration instead of the
 * bare 8-character minimum this schema used to be the only guard for.
 */
export const createAdminSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email'),
    password: z.string().min(8).max(128),
    firstName: z.string().min(1).max(50),
    lastName: z.string().min(1).max(50),
    mobileNumber: e164Phone.optional(),

    /**
     * Initial access, applied atomically-ish with the account.
     *
     * Both optional: creating an admin with no access at all is legitimate
     * (they see an empty console until granted). Keys are validated against
     * the registry BEFORE the account row is written, so a typo produces a
     * 400 with nothing created rather than an orphaned ungranted admin.
     */
    roleIds: z.array(z.string().uuid()).max(50).optional(),
    permissions: z
      .array(
        z.object({
          permissionKey: z.string().min(1).max(120),
          effect: z.enum(['ALLOW', 'DENY']).optional(),
        })
      )
      .max(500)
      .optional(),
  }),
});

export const updateConfigSchema = z.object({
  body: z.object({
    key: z.string().min(1),
    value: z.union([z.string(), z.number(), z.boolean(), z.record(z.string(), z.unknown())]),
  }),
});

/** See the note on `createAdminSchema` about where the password policy lives. */
export const createUserSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email'),
    password: z.string().min(8).max(128),
    firstName: z.string().min(1).max(50),
    lastName: z.string().min(1).max(50),
    // `ADMIN` is accepted by the schema but refused at the service unless the
    // CALLER is a super-admin (see `denyAdminRoleBody` + createUser's actor
    // check) — `users.create` alone must never mint a peer admin.
    role: z.enum(['CANDIDATE', 'EMPLOYER', 'ADMIN']),
    mobileNumber: e164Phone.optional(),

    // Initial access, honoured only when `role === 'ADMIN'`. Same shape and
    // same pre-write validation as `createAdminSchema`, so the two paths
    // that can produce an admin account behave identically.
    roleIds: z.array(z.string().uuid()).max(50).optional(),
    permissions: z
      .array(
        z.object({
          permissionKey: z.string().min(1).max(120),
          effect: z.enum(['ALLOW', 'DENY']).optional(),
        })
      )
      .max(500)
      .optional(),
  }),
});

export const updateUserProfileSchema = z.object({
  body: z.object({
    firstName: z.string().min(1).max(50).optional(),
    lastName: z.string().min(1).max(50).optional(),
    email: z.string().email('Invalid email').optional(),
    mobileNumber: e164Phone.nullable().optional(),
    whatsappNumber: e164Phone.nullable().optional(),
    isMobileVerified: z.boolean().optional(),
    isWhatsappVerified: z.boolean().optional(),
  }),
});

export const adminResetPasswordSchema = z.object({
  body: z.object({
    newPassword: z.string().min(8).max(128),
    otp: z.string().length(6),
  }),
});

// ── Admin Email / Mobile / WhatsApp managed verification schemas ──

export const adminEmailInitiateSchema = z.object({
  body: z.object({
    newEmail: z.string().email('Invalid email'),
    password: z.string().min(1, 'Password is required'),
  }),
});

export const adminEmailConfirmSchema = z.object({
  body: z.object({
    otp: z.string().length(6),
  }),
});

export const adminMobileInitiateSchema = z.object({
  body: z.object({
    mobileNumber: e164Phone,
    password: z.string().min(1).optional(),
  }),
});

export const adminMobileConfirmSchema = z.object({
  body: z.object({
    otp: z.string().length(6),
  }),
});

export const adminWhatsappVerifySchema = z.object({
  body: z.object({
    mobileNumber: e164Phone,
    whatsappNumber: e164Phone.optional(),
  }),
});

export const adminWhatsappChangeSchema = z.object({
  body: z.object({
    newWhatsappNumber: e164Phone,
    password: z.string().min(1, 'Password is required'),
  }),
});

export const adminWhatsappConfirmSchema = z.object({
  body: z.object({
    otp: z.string().length(6),
  }),
});

// ── Admin Password managed change schema ──

export const adminPasswordInitiateSchema = z.object({
  body: z.object({
    password: z.string().min(1, 'Password is required'),
    newPassword: z.string().min(8).max(128),
  }),
});

export const adminPasswordConfirmSchema = z.object({
  body: z.object({
    otp: z.string().length(6),
  }),
});

// ── Profile update schemas ──

export const updateCandidateProfileSchema = z.object({
  body: z
    .object({
      headline: z.string().max(200).optional(),
      bio: z.string().max(2000).optional(),
      currentCompany: z.string().max(200).optional(),
      currentRole: z.string().max(200).optional(),
      industry: z.string().max(100).optional(),
      experienceYears: z.number().int().min(0).max(100).optional(),
      expectedSalary: z.coerce.number().int().min(0).optional(),
      currentSalary: z.coerce.number().int().min(0).optional(),
      noticePeriod: z.number().int().min(0).max(365).optional(),
      workStatus: z.string().max(100).optional(),
      availabilityDate: z.string().optional(),
      openToWork: z.boolean().optional(),
      phoneNumber: z.string().max(20).optional(),
      alternatePhone: z.string().max(20).optional(),
      alternateEmail: z.string().email().optional(),
      currentLocation: z.string().max(200).optional(),
      hometown: z.string().max(200).optional(),
      preferredLocations: z.array(z.string()).optional(),
      willingToRelocate: z.boolean().optional(),
      travelWillingness: z.number().int().min(0).max(100).optional(),
      preferredJobTypes: z.array(z.string()).optional(),
      preferredWorkModes: z.array(z.string()).optional(),
      preferredShift: z.string().max(50).optional(),
      preferredIndustries: z.array(z.string()).optional(),
      preferredRoleCategories: z.array(z.string()).optional(),
      skills: z.array(z.string()).optional(),
      languages: z.array(z.string()).optional(),
      visaStatus: z.string().max(100).optional(),
      workPermit: z.string().max(100).optional(),
      passportNumber: z.string().max(50).optional(),
      drivingLicenseType: z.string().max(50).optional(),
      ownVehicle: z.boolean().optional(),
      isPwD: z.boolean().optional(),
      disabilityType: z.string().max(200).optional(),
      disabilityPercentage: z.number().int().min(0).max(100).optional(),
      isVeteran: z.boolean().optional(),
      blockedCompanies: z.array(z.string()).optional(),
      pronouns: z.string().max(50).optional(),
      gender: z.string().max(50).optional(),
      dateOfBirth: z.string().optional(),
      maritalStatus: z.string().max(50).optional(),
      nationality: z.string().max(100).optional(),
      category: z.string().max(100).optional(),
      interests: z.array(z.string()).optional(),
      hobbies: z.array(z.string()).optional(),
      hasCareerBreak: z.boolean().optional(),
      careerBreakType: z.string().max(100).optional(),
      careerBreakReason: z.string().max(500).optional(),
    })
    .partial(),
});

export const updateCompanyProfileSchema = z.object({
  body: z
    .object({
      companyName: z.string().max(200).optional(),
      tagline: z.string().max(200).optional(),
      description: z.string().max(5000).optional(),
      whyWorkForUs: z.string().max(5000).optional(),
      companyType: z.string().max(100).optional(),
      industry: z.string().max(100).optional(),
      subIndustry: z.string().max(100).optional(),
      companySize: z.string().max(100).optional(),
      employeeCount: z.number().int().min(0).optional(),
      foundedYear: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
      parentCompany: z.string().max(200).optional(),
      stockTicker: z.string().max(20).optional(),
      numberOfOffices: z.number().int().min(0).optional(),
      website: z.string().url().optional(),
      careersPage: z.string().url().optional(),
      blog: z.string().url().optional(),
      companyVideo: z.string().url().optional(),
      mission: z.string().max(1000).optional(),
      vision: z.string().max(1000).optional(),
      companyCulture: z.string().max(5000).optional(),
      coreValues: z.array(z.string()).optional(),
      diversityStatement: z.string().max(2000).optional(),
      employeeResourceGroups: z.array(z.string()).optional(),
      csrInitiatives: z.string().max(2000).optional(),
      benefits: z.array(z.string()).optional(),
      productsServices: z.array(z.string()).optional(),
      technologies: z.array(z.string()).optional(),
      interviewProcess: z.string().max(5000).optional(),
      fundingStage: z.string().max(100).optional(),
      totalFundingRaised: z.string().optional(),
      annualRevenueRange: z.string().max(100).optional(),
      investors: z.array(z.string()).optional(),
      contactEmail: z.string().email().optional(),
      contactPhone: z.string().max(20).optional(),
      contactPersonName: z.string().max(200).optional(),
      contactPersonDesignation: z.string().max(200).optional(),
      gstNumber: z.string().max(50).optional(),
      cinNumber: z.string().max(50).optional(),
      panNumber: z.string().max(50).optional(),
      llpinNumber: z.string().max(50).optional(),
      tanNumber: z.string().max(50).optional(),
      verificationStatus: z.string().max(50).optional(),
      linkedinUrl: z.string().url().optional(),
      twitterUrl: z.string().url().optional(),
      facebookUrl: z.string().url().optional(),
      instagramUrl: z.string().url().optional(),
      youtubeUrl: z.string().url().optional(),
      glassdoorUrl: z.string().url().optional(),
      specialties: z.array(z.string()).optional(),
      headquarters: z.string().max(500).optional(),
      additionalLocations: z.array(z.string()).optional(),
    })
    .partial(),
});

// ── Bulk operation schemas ──

export const bulkExportUsersSchema = z.object({
  body: z.object({
    userIds: z.array(z.string().uuid()).min(1).max(1000),
    format: z.enum(['csv', 'xlsx']).default('csv'),
  }),
});

export const bulkNotifyUsersSchema = z.object({
  body: z.object({
    userIds: z.array(z.string().uuid()).min(1).max(1000),
    notification: z.object({
      title: z.string().min(1).max(200),
      message: z.string().min(1).max(1000),
      type: z.enum(['INFO', 'SUCCESS', 'WARNING', 'ERROR']).optional(),
    }),
  }),
});

export const bulkSuspendUsersSchema = z.object({
  body: z.object({
    userIds: z.array(z.string().uuid()).min(1).max(1000),
    reason: z.string().max(500).optional(),
  }),
});

export const bulkActivateUsersSchema = z.object({
  body: z.object({
    userIds: z.array(z.string().uuid()).min(1).max(1000),
  }),
});

export type CreateAdminInput = z.infer<typeof createAdminSchema>['body'];
