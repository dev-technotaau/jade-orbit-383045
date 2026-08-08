/**
 * Canonical schema for parsed-resume data produced by the
 * Document-AI-OCR → Gemini-extraction pipeline.
 *
 * Every nullable field below maps directly to a column or JSON shape on
 * `CandidateProfile` in the Prisma schema. The Gemini extractor returns
 * exactly this shape via Vertex AI's structured-output mode (response
 * MIME type `application/json` + `responseSchema`). When a field can't
 * be inferred from the resume text the extractor returns null / an
 * empty array, never a placeholder string — postprocessing relies on
 * that distinction.
 *
 * Two artefacts are exported:
 *   - `parsedResumeSchema` — Zod schema. Used to validate the model's
 *     output before it's written to Postgres so a hallucinated wrong
 *     type never lands in `parsedResumeData`.
 *   - `geminiJsonSchema` — the GCP-compatible JSON-schema object
 *     passed as `generationConfig.responseSchema`. Mirrors the Zod
 *     schema but uses only the subset GCP's schema validator accepts.
 *
 * Keep these two definitions in lockstep — divergence will surface as a
 * Zod validation error after Gemini returns "valid" structured output.
 *
 * The frontend type `ParsedResumeData` in
 * `frontend/src/types/resume-parse.ts` is the same shape, hand-mirrored
 * (cross-tier package sharing isn't worth the build complexity for a
 * single type).
 */
import { z } from 'zod';

// ── Enum constants — match Prisma enums verbatim ────────────────────
// Keep in sync with prisma/schema.prisma and frontend/types/candidate.ts.
const GENDERS = ['MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY', 'OTHER'] as const;
const MARITAL_STATUSES = ['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'PREFER_NOT_TO_SAY'] as const;
const RESERVATION_CATEGORIES = ['GENERAL', 'SC', 'ST', 'OBC', 'EWS', 'PREFER_NOT_TO_SAY'] as const;
const WORK_STATUSES = [
  'EMPLOYED',
  'UNEMPLOYED',
  'STUDENT',
  'FREELANCER',
  'ACTIVELY_LOOKING',
] as const;
const NOTICE_PERIODS = [
  'IMMEDIATE',
  'FIFTEEN_DAYS',
  'THIRTY_DAYS',
  'SIXTY_DAYS',
  'NINETY_DAYS',
  'MORE_THAN_NINETY_DAYS',
] as const;
const EXPERIENCE_LEVELS = ['FRESHER', 'ENTRY', 'MID', 'SENIOR', 'LEAD', 'EXECUTIVE'] as const;
const EDUCATION_LEVELS = [
  'TENTH',
  'TWELFTH',
  'DIPLOMA',
  'BACHELORS',
  'MASTERS',
  'PHD',
  'POST_DOCTORAL',
] as const;
const SPECIFIC_DEGREES = [
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
  'DIPLOMA_ENGINEERING',
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
  'PHD',
  'ANY_GRADUATE',
  'ANY_POSTGRADUATE',
] as const;
const JOB_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'FREELANCE'] as const;
const WORK_MODES = ['ON_SITE', 'REMOTE', 'HYBRID'] as const;
const SHIFT_TYPES = ['DAY', 'NIGHT', 'ROTATIONAL', 'FLEXIBLE'] as const;
const OPEN_TO_WORK = ['ACTIVELY_LOOKING', 'OPEN_TO_OFFERS', 'NOT_LOOKING'] as const;
const DRIVING_LICENSE_TYPES = [
  'NONE',
  'TWO_WHEELER',
  'FOUR_WHEELER',
  'BOTH',
  'HEAVY_VEHICLE',
] as const;
const VEHICLE_TYPES = ['BIKE', 'CAR', 'SCOOTER'] as const;
const DISABILITY_TYPES = [
  'NONE',
  'VISUAL',
  'HEARING',
  'LOCOMOTOR',
  'INTELLECTUAL',
  'MULTIPLE',
  'OTHER',
] as const;
const CAREER_BREAK_TYPES = [
  'HEALTH',
  'FAMILY',
  'HIGHER_EDUCATION',
  'TRAVEL',
  'LAYOFF',
  'PERSONAL',
  'CAREGIVING',
  'CAREER_TRANSITION',
  'OTHER',
] as const;
const LANGUAGE_PROFICIENCIES = ['BASIC', 'INTERMEDIATE', 'FLUENT', 'NATIVE'] as const;
const SKILL_PROFICIENCIES = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'] as const;
const COURSE_TYPES = ['FULL_TIME', 'PART_TIME', 'DISTANCE', 'CORRESPONDENCE'] as const;
const PATENT_STATUSES = ['FILED', 'PUBLISHED', 'GRANTED'] as const;
const GRADE_TYPES = ['PERCENTAGE', 'CGPA', 'GPA'] as const;

// Zod helper — accepts string | null | undefined and coerces empty
// strings / undefined to null. Resumes routinely contain empty fields
// ("Phone: ") that Gemini will happily echo back as ""; coercing to
// null keeps downstream truthy checks honest. Using `.nullish()`
// (`.nullable().optional()`) is critical: when `makeParsed({})` or
// any partial input omits a field, Zod 4 reports it as `undefined`,
// not `null` — without `.optional()` the parse would error out.
const nullableString = z
  .string()
  .nullish()
  .transform((v) => (typeof v === 'string' && v.trim().length > 0 ? v.trim() : null));

// ── Sub-schemas ──────────────────────────────────────────────────────

export const experienceEntrySchema = z.object({
  company: nullableString,
  role: nullableString,
  location: nullableString,
  industry: nullableString,
  department: nullableString,
  employmentType: z.enum(JOB_TYPES).nullable().optional(),
  startDate: nullableString, // ISO date or null
  endDate: nullableString, // ISO date or null (null implies isCurrent)
  isCurrent: z.boolean().nullable().optional(),
  description: nullableString,
  keyAchievements: z.array(z.string()).nullable().optional(),
  teamSize: z.number().int().nullable().optional(),
  reportingTo: nullableString,
  annualCtc: z.number().nullable().optional(),
});

export const educationEntrySchema = z.object({
  institution: nullableString,
  degree: nullableString,
  field: nullableString,
  fieldOfStudy: nullableString,
  educationLevel: z.enum(EDUCATION_LEVELS).nullable().optional(),
  boardState: nullableString,
  startDate: nullableString,
  endDate: nullableString,
  grade: nullableString,
  gradeType: z.enum(GRADE_TYPES).nullable().optional(),
  courseType: z.enum(COURSE_TYPES).nullable().optional(),
  specialization: nullableString,
  description: nullableString,
  activities: nullableString,
});

export const certificationEntrySchema = z.object({
  name: nullableString,
  issuer: nullableString,
  issueDate: nullableString,
  expiryDate: nullableString,
  credentialId: nullableString,
  url: nullableString,
  doesNotExpire: z.boolean().nullable().optional(),
});

export const projectEntrySchema = z.object({
  name: nullableString,
  description: nullableString,
  url: nullableString,
  startDate: nullableString,
  endDate: nullableString,
  isCurrent: z.boolean().nullable().optional(),
  technologies: z.array(z.string()).nullable().optional(),
  role: nullableString,
  teamSize: z.number().int().nullable().optional(),
  client: nullableString,
});

export const publicationEntrySchema = z.object({
  title: nullableString,
  publisher: nullableString,
  publicationDate: nullableString,
  url: nullableString,
  description: nullableString,
  authors: nullableString,
});

export const patentEntrySchema = z.object({
  title: nullableString,
  patentOffice: nullableString,
  patentNumber: nullableString,
  status: z.enum(PATENT_STATUSES).nullable().optional(),
  filingDate: nullableString,
  issueDate: nullableString,
  url: nullableString,
  description: nullableString,
  inventors: nullableString,
});

export const awardEntrySchema = z.object({
  title: nullableString,
  issuer: nullableString,
  date: nullableString,
  description: nullableString,
});

export const volunteerEntrySchema = z.object({
  organization: nullableString,
  role: nullableString,
  cause: nullableString,
  startDate: nullableString,
  endDate: nullableString,
  isCurrent: z.boolean().nullable().optional(),
  description: nullableString,
});

export const membershipEntrySchema = z.object({
  organization: nullableString,
  role: nullableString,
  startDate: nullableString,
  endDate: nullableString,
  membershipId: nullableString,
  description: nullableString,
});

export const courseEntrySchema = z.object({
  name: nullableString,
  provider: nullableString,
  completionDate: nullableString,
  url: nullableString,
  associatedWith: nullableString,
});

export const testScoreEntrySchema = z.object({
  testName: nullableString,
  score: nullableString,
  dateOfExam: nullableString,
  associatedWith: nullableString,
  description: nullableString,
});

export const referenceEntrySchema = z.object({
  name: nullableString,
  designation: nullableString,
  organization: nullableString,
  email: nullableString,
  phone: nullableString,
  relationship: nullableString,
});

export const languageProficiencyEntrySchema = z.object({
  language: nullableString,
  proficiency: z.enum(LANGUAGE_PROFICIENCIES).nullable().optional(),
  readWrite: nullableString,
});

export const skillWithProficiencyEntrySchema = z.object({
  skill: nullableString,
  proficiency: z.enum(SKILL_PROFICIENCIES).nullable().optional(),
  yearsOfExperience: z.number().nullable().optional(),
});

export const itSkillEntrySchema = z.object({
  technology: nullableString,
  version: nullableString,
  lastUsed: nullableString, // year or ISO date
  experienceYears: z.number().nullable().optional(),
  proficiency: z.enum(SKILL_PROFICIENCIES).nullable().optional(),
});

// ── Root schema ──────────────────────────────────────────────────────

export const parsedResumeSchema = z.object({
  // Personal
  name: nullableString,
  email: nullableString,
  phone: nullableString,
  alternatePhone: nullableString,
  alternateEmail: nullableString,
  headline: nullableString, // Professional headline, e.g. "Senior Java Dev | 8 yrs"
  summary: nullableString, // Bio / about
  dob: nullableString,
  gender: z.enum(GENDERS).nullable().optional(),
  maritalStatus: z.enum(MARITAL_STATUSES).nullable().optional(),
  nationality: nullableString,
  hometown: nullableString,
  pronouns: nullableString,
  category: z.enum(RESERVATION_CATEGORIES).nullable().optional(),

  // Address
  addressLine1: nullableString,
  addressLine2: nullableString,
  city: nullableString,
  state: nullableString,
  pincode: nullableString,
  country: nullableString,
  currentLocation: nullableString,

  // Professional summary
  experienceYears: z.number().nullable().optional(),
  totalExperienceMonths: z.number().int().nullable().optional(),
  experienceLevel: z.enum(EXPERIENCE_LEVELS).nullable().optional(),
  currentCompany: nullableString,
  currentRole: nullableString,
  currentIndustry: nullableString,
  currentDepartment: nullableString,
  functionalArea: nullableString,
  workStatus: z.enum(WORK_STATUSES).nullable().optional(),
  openToWork: z.enum(OPEN_TO_WORK).nullable().optional(),
  noticePeriod: z.enum(NOTICE_PERIODS).nullable().optional(),
  servingNoticePeriod: z.boolean().nullable().optional(),
  hasCareerBreak: z.boolean().nullable().optional(),
  careerBreakType: z.enum(CAREER_BREAK_TYPES).nullable().optional(),
  careerBreakReason: nullableString,
  currSalary: z.number().nullable().optional(),
  expectedSalaryMin: z.number().nullable().optional(),
  expectedSalaryMax: z.number().nullable().optional(),
  salaryCurrency: nullableString,

  // Career preferences
  preferredJobType: z.array(z.enum(JOB_TYPES)).nullable().optional(),
  preferredWorkMode: z.array(z.enum(WORK_MODES)).nullable().optional(),
  preferredShift: z.enum(SHIFT_TYPES).nullable().optional(),
  preferredLocations: z.array(z.string()).nullable().optional(),
  preferredIndustries: z.array(z.string()).nullable().optional(),
  preferredRoleCategories: z.array(z.string()).nullable().optional(),
  willingToRelocate: z.boolean().nullable().optional(),
  travelWillingnessPercent: z.number().int().nullable().optional(),
  dateOfAvailability: nullableString,

  // Education summary
  highestEducationLevel: z.enum(EDUCATION_LEVELS).nullable().optional(),
  highestDegree: z.enum(SPECIFIC_DEGREES).nullable().optional(),

  // Visa / docs
  visaStatus: nullableString,
  workPermitStatus: nullableString,
  passportNumber: nullableString,
  passportExpiryDate: nullableString,
  hasDrivingLicense: z.boolean().nullable().optional(),
  drivingLicenseType: z.enum(DRIVING_LICENSE_TYPES).nullable().optional(),
  ownVehicle: z.boolean().nullable().optional(),
  vehicleTypes: z.array(z.enum(VEHICLE_TYPES)).nullable().optional(),
  isVeteran: z.boolean().nullable().optional(),

  // Disability
  isPhysicallyChallenged: z.boolean().nullable().optional(),
  disabilityType: z.enum(DISABILITY_TYPES).nullable().optional(),
  disabilityPercentage: z.number().int().nullable().optional(),

  // Lists
  skills: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
  certifications: z.array(certificationEntrySchema).default([]),
  interests: z.array(z.string()).default([]),
  hobbies: z.array(z.string()).default([]),
  blockedCompanies: z.array(z.string()).default([]),

  // Rich structured fields
  experience: z.array(experienceEntrySchema).default([]),
  education: z.array(educationEntrySchema).default([]),
  itSkills: z.array(itSkillEntrySchema).default([]),
  skillsWithProficiency: z.array(skillWithProficiencyEntrySchema).default([]),
  languageProficiency: z.array(languageProficiencyEntrySchema).default([]),
  projects: z.array(projectEntrySchema).default([]),
  publications: z.array(publicationEntrySchema).default([]),
  patents: z.array(patentEntrySchema).default([]),
  awards: z.array(awardEntrySchema).default([]),
  volunteerExperience: z.array(volunteerEntrySchema).default([]),
  professionalMemberships: z.array(membershipEntrySchema).default([]),
  courses: z.array(courseEntrySchema).default([]),
  testScores: z.array(testScoreEntrySchema).default([]),
  references: z.array(referenceEntrySchema).default([]),

  // Social profiles
  linkedinProfile: nullableString,
  githubProfile: nullableString,
  portfolioUrl: nullableString,
  stackOverflowProfile: nullableString,
  twitterProfile: nullableString,
  personalBlogUrl: nullableString,
  dribbbleProfile: nullableString,
  behanceProfile: nullableString,
  mediumProfile: nullableString,
  youtubeChannel: nullableString,
});

export type ParsedResumeData = z.infer<typeof parsedResumeSchema>;

// ── Vertex AI response schema (OpenAPI-subset) ───────────────────────
// Mirrors `parsedResumeSchema` but in the JSON-schema shape Gemini
// `generationConfig.responseSchema` accepts. Vertex AI uses a subset of
// OpenAPI 3 — no `$ref`, no `oneOf`, etc. Nullable fields are expressed
// by listing the type and marking the field absent from `required` OR
// using `nullable: true`. We omit `required` entirely because every
// field is optional in real-world resumes; the validator on the
// server-side (Zod) is the source of truth for "what came back".

const T_STRING = { type: 'string', nullable: true } as const;
const T_NUMBER = { type: 'number', nullable: true } as const;
const T_INT = { type: 'integer', nullable: true } as const;
const T_BOOL = { type: 'boolean', nullable: true } as const;
const STRING_ARRAY = { type: 'array', items: { type: 'string' } } as const;

const enumStr = (values: readonly string[]) =>
  ({ type: 'string', enum: [...values], nullable: true }) as const;

const enumArr = (values: readonly string[]) =>
  ({ type: 'array', items: { type: 'string', enum: [...values] } }) as const;

const experienceItem = {
  type: 'object',
  properties: {
    company: T_STRING,
    role: T_STRING,
    location: T_STRING,
    industry: T_STRING,
    department: T_STRING,
    employmentType: enumStr(JOB_TYPES),
    startDate: T_STRING,
    endDate: T_STRING,
    isCurrent: T_BOOL,
    description: T_STRING,
    keyAchievements: STRING_ARRAY,
    teamSize: T_INT,
    reportingTo: T_STRING,
    annualCtc: T_NUMBER,
  },
} as const;

const educationItem = {
  type: 'object',
  properties: {
    institution: T_STRING,
    degree: T_STRING,
    field: T_STRING,
    fieldOfStudy: T_STRING,
    educationLevel: enumStr(EDUCATION_LEVELS),
    boardState: T_STRING,
    startDate: T_STRING,
    endDate: T_STRING,
    grade: T_STRING,
    gradeType: enumStr(GRADE_TYPES),
    courseType: enumStr(COURSE_TYPES),
    specialization: T_STRING,
    description: T_STRING,
    activities: T_STRING,
  },
} as const;

const certificationItem = {
  type: 'object',
  properties: {
    name: T_STRING,
    issuer: T_STRING,
    issueDate: T_STRING,
    expiryDate: T_STRING,
    credentialId: T_STRING,
    url: T_STRING,
    doesNotExpire: T_BOOL,
  },
} as const;

const projectItem = {
  type: 'object',
  properties: {
    name: T_STRING,
    description: T_STRING,
    url: T_STRING,
    startDate: T_STRING,
    endDate: T_STRING,
    isCurrent: T_BOOL,
    technologies: STRING_ARRAY,
    role: T_STRING,
    teamSize: T_INT,
    client: T_STRING,
  },
} as const;

const publicationItem = {
  type: 'object',
  properties: {
    title: T_STRING,
    publisher: T_STRING,
    publicationDate: T_STRING,
    url: T_STRING,
    description: T_STRING,
    authors: T_STRING,
  },
} as const;

const patentItem = {
  type: 'object',
  properties: {
    title: T_STRING,
    patentOffice: T_STRING,
    patentNumber: T_STRING,
    status: enumStr(PATENT_STATUSES),
    filingDate: T_STRING,
    issueDate: T_STRING,
    url: T_STRING,
    description: T_STRING,
    inventors: T_STRING,
  },
} as const;

const awardItem = {
  type: 'object',
  properties: {
    title: T_STRING,
    issuer: T_STRING,
    date: T_STRING,
    description: T_STRING,
  },
} as const;

const volunteerItem = {
  type: 'object',
  properties: {
    organization: T_STRING,
    role: T_STRING,
    cause: T_STRING,
    startDate: T_STRING,
    endDate: T_STRING,
    isCurrent: T_BOOL,
    description: T_STRING,
  },
} as const;

const membershipItem = {
  type: 'object',
  properties: {
    organization: T_STRING,
    role: T_STRING,
    startDate: T_STRING,
    endDate: T_STRING,
    membershipId: T_STRING,
    description: T_STRING,
  },
} as const;

const courseItem = {
  type: 'object',
  properties: {
    name: T_STRING,
    provider: T_STRING,
    completionDate: T_STRING,
    url: T_STRING,
    associatedWith: T_STRING,
  },
} as const;

const testScoreItem = {
  type: 'object',
  properties: {
    testName: T_STRING,
    score: T_STRING,
    dateOfExam: T_STRING,
    associatedWith: T_STRING,
    description: T_STRING,
  },
} as const;

const referenceItem = {
  type: 'object',
  properties: {
    name: T_STRING,
    designation: T_STRING,
    organization: T_STRING,
    email: T_STRING,
    phone: T_STRING,
    relationship: T_STRING,
  },
} as const;

const langProfItem = {
  type: 'object',
  properties: {
    language: T_STRING,
    proficiency: enumStr(LANGUAGE_PROFICIENCIES),
    readWrite: T_STRING,
  },
} as const;

const skillProfItem = {
  type: 'object',
  properties: {
    skill: T_STRING,
    proficiency: enumStr(SKILL_PROFICIENCIES),
    yearsOfExperience: T_NUMBER,
  },
} as const;

const itSkillItem = {
  type: 'object',
  properties: {
    technology: T_STRING,
    version: T_STRING,
    lastUsed: T_STRING,
    experienceYears: T_NUMBER,
    proficiency: enumStr(SKILL_PROFICIENCIES),
  },
} as const;

export const geminiJsonSchema = {
  type: 'object',
  properties: {
    name: T_STRING,
    email: T_STRING,
    phone: T_STRING,
    alternatePhone: T_STRING,
    alternateEmail: T_STRING,
    headline: T_STRING,
    summary: T_STRING,
    // DOB needs a field-level description because Gemini was returning
    // "1990-10-01" even when the OCR text contains a full date like
    // "15 Oct 1990" — it was applying the general "month+year → day=01"
    // rule defensively to DOB. We override that rule HERE specifically:
    // for date-of-birth, prefer null over a guessed day=01.
    dob: {
      type: 'string',
      nullable: true,
      description:
        'Date of birth in ISO YYYY-MM-DD format. CRITICAL: PRESERVE THE DAY-OF-MONTH whenever the resume contains it. Examples: "15 Oct 1990" → "1990-10-15", "15/10/1990" → "1990-10-15", "October 15, 1990" → "1990-10-15", "1990-10-15" → "1990-10-15". DO NOT default day to 01 for DOB — if the resume only shows month+year ("Oct 1990") with no day, return null instead of "1990-10-01". The day matters because DOB-on-the-1st is biologically uncommon and "01" reads as a guess.',
    },
    gender: enumStr(GENDERS),
    maritalStatus: enumStr(MARITAL_STATUSES),
    nationality: T_STRING,
    hometown: T_STRING,
    pronouns: T_STRING,
    category: enumStr(RESERVATION_CATEGORIES),

    addressLine1: T_STRING,
    addressLine2: T_STRING,
    city: T_STRING,
    state: T_STRING,
    pincode: T_STRING,
    country: T_STRING,
    currentLocation: T_STRING,

    experienceYears: T_NUMBER,
    totalExperienceMonths: T_INT,
    experienceLevel: enumStr(EXPERIENCE_LEVELS),
    currentCompany: T_STRING,
    currentRole: T_STRING,
    currentIndustry: T_STRING,
    currentDepartment: T_STRING,
    functionalArea: T_STRING,
    workStatus: enumStr(WORK_STATUSES),
    openToWork: enumStr(OPEN_TO_WORK),
    noticePeriod: enumStr(NOTICE_PERIODS),
    servingNoticePeriod: T_BOOL,
    hasCareerBreak: T_BOOL,
    careerBreakType: enumStr(CAREER_BREAK_TYPES),
    careerBreakReason: T_STRING,
    currSalary: T_NUMBER,
    expectedSalaryMin: T_NUMBER,
    expectedSalaryMax: T_NUMBER,
    salaryCurrency: T_STRING,

    preferredJobType: enumArr(JOB_TYPES),
    preferredWorkMode: enumArr(WORK_MODES),
    preferredShift: enumStr(SHIFT_TYPES),
    preferredLocations: STRING_ARRAY,
    preferredIndustries: STRING_ARRAY,
    preferredRoleCategories: STRING_ARRAY,
    willingToRelocate: T_BOOL,
    travelWillingnessPercent: T_INT,
    dateOfAvailability: T_STRING,

    highestEducationLevel: enumStr(EDUCATION_LEVELS),
    highestDegree: enumStr(SPECIFIC_DEGREES),

    visaStatus: T_STRING,
    workPermitStatus: T_STRING,
    passportNumber: T_STRING,
    passportExpiryDate: T_STRING,
    hasDrivingLicense: T_BOOL,
    drivingLicenseType: enumStr(DRIVING_LICENSE_TYPES),
    ownVehicle: T_BOOL,
    vehicleTypes: enumArr(VEHICLE_TYPES),
    isVeteran: T_BOOL,

    isPhysicallyChallenged: T_BOOL,
    disabilityType: enumStr(DISABILITY_TYPES),
    disabilityPercentage: T_INT,

    skills: STRING_ARRAY,
    languages: STRING_ARRAY,
    certifications: { type: 'array', items: certificationItem },
    interests: STRING_ARRAY,
    hobbies: STRING_ARRAY,
    blockedCompanies: STRING_ARRAY,

    experience: { type: 'array', items: experienceItem },
    education: { type: 'array', items: educationItem },
    itSkills: { type: 'array', items: itSkillItem },
    skillsWithProficiency: { type: 'array', items: skillProfItem },
    languageProficiency: { type: 'array', items: langProfItem },
    projects: { type: 'array', items: projectItem },
    publications: { type: 'array', items: publicationItem },
    patents: { type: 'array', items: patentItem },
    awards: { type: 'array', items: awardItem },
    volunteerExperience: { type: 'array', items: volunteerItem },
    professionalMemberships: { type: 'array', items: membershipItem },
    courses: { type: 'array', items: courseItem },
    testScores: { type: 'array', items: testScoreItem },
    references: { type: 'array', items: referenceItem },

    linkedinProfile: T_STRING,
    githubProfile: T_STRING,
    portfolioUrl: T_STRING,
    stackOverflowProfile: T_STRING,
    twitterProfile: T_STRING,
    personalBlogUrl: T_STRING,
    dribbbleProfile: T_STRING,
    behanceProfile: T_STRING,
    mediumProfile: T_STRING,
    youtubeChannel: T_STRING,
  },
} as const;
