/**
 * Frontend mirror of the backend's `ParsedResumeData` (see
 * `backend/src/services/resume-schema.ts`). Hand-mirrored — keep in
 * lockstep with that file. Cross-tier package sharing isn't worth the
 * build complexity for a single type.
 *
 * The shape covers every candidate-profile field the Gemini extractor
 * (via Vertex AI) returns. Most fields are nullable because resumes
 * vary wildly — only `skills` / `experience` / `education` / similar
 * collections are guaranteed arrays (the backend defaults them to `[]`
 * via Zod).
 *
 * `ApplyableResumeFields` is the *outbound* shape sent to the
 * onboarding/profile-page `updateData()` handlers. It's a superset
 * mapping resume-side names to candidate-profile column names (e.g.
 * `summary` → `bio`).
 */

import type {
  CertificationEntry,
  ExperienceEntry,
  EducationEntry,
  ProjectEntry,
  AwardEntry,
  LanguageEntry,
  SkillWithProficiency,
  ITSkillEntry,
  PublicationEntry,
  PatentEntry,
  VolunteerEntry,
  MembershipEntry,
  CourseCompletionEntry,
  TestScoreEntry,
  ReferenceEntry,
  Gender,
  MaritalStatus,
  WorkStatus,
  NoticePeriod,
  DisabilityType,
  CareerBreakType,
  ReservationCategory,
  OpenToWorkStatus,
  VehicleType,
} from './candidate';

// ── Enum string-literal types (mirror backend resume-schema.ts) ──────
export type ExperienceLevelStr = 'FRESHER' | 'ENTRY' | 'MID' | 'SENIOR' | 'LEAD' | 'EXECUTIVE';
export type EducationLevelStr =
  | 'TENTH'
  | 'TWELFTH'
  | 'DIPLOMA'
  | 'BACHELORS'
  | 'MASTERS'
  | 'PHD'
  | 'POST_DOCTORAL';
export type SpecificDegreeStr =
  | 'BTECH_BE'
  | 'BCA'
  | 'BSC'
  | 'BCOM'
  | 'BA'
  | 'BBA'
  | 'MBBS'
  | 'LLB'
  | 'BARCH'
  | 'BDES'
  | 'BPHARM'
  | 'DIPLOMA_ENGINEERING'
  | 'MCA'
  | 'MSC'
  | 'MCOM'
  | 'MA'
  | 'MBA_PGDM'
  | 'MTECH_ME'
  | 'MS'
  | 'LLM'
  | 'MD'
  | 'CA'
  | 'CS'
  | 'ICWA'
  | 'PHD'
  | 'ANY_GRADUATE'
  | 'ANY_POSTGRADUATE';
export type JobTypeStr = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP' | 'FREELANCE';
export type WorkModeStr = 'ON_SITE' | 'REMOTE' | 'HYBRID';
export type ShiftTypeStr = 'DAY' | 'NIGHT' | 'ROTATIONAL' | 'FLEXIBLE';
export type DrivingLicenseTypeStr =
  | 'NONE'
  | 'TWO_WHEELER'
  | 'FOUR_WHEELER'
  | 'BOTH'
  | 'HEAVY_VEHICLE';

// ── Parsed-resume entry shapes (look-alikes for backend) ────────────
// These match the per-row shapes Gemini returns. They're nullable on
// every field because resumes don't fill every cell.

export interface ParsedExperience {
  company: string | null;
  role: string | null;
  location: string | null;
  industry: string | null;
  department: string | null;
  employmentType: JobTypeStr | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean | null;
  description: string | null;
  keyAchievements: string[] | null;
  teamSize: number | null;
  reportingTo: string | null;
  annualCtc: number | null;
}

export interface ParsedEducation {
  institution: string | null;
  degree: string | null;
  field: string | null;
  fieldOfStudy: string | null;
  educationLevel: EducationLevelStr | null;
  boardState: string | null;
  startDate: string | null;
  endDate: string | null;
  grade: string | null;
  gradeType: 'PERCENTAGE' | 'CGPA' | 'GPA' | null;
  courseType: 'FULL_TIME' | 'PART_TIME' | 'DISTANCE' | 'CORRESPONDENCE' | null;
  specialization: string | null;
  description: string | null;
  activities: string | null;
}

export interface ParsedCertification {
  name: string | null;
  issuer: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  credentialId: string | null;
  url: string | null;
  doesNotExpire: boolean | null;
}

export interface ParsedProject {
  name: string | null;
  description: string | null;
  url: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean | null;
  technologies: string[] | null;
  role: string | null;
  teamSize: number | null;
  client: string | null;
}

export interface ParsedPublication {
  title: string | null;
  publisher: string | null;
  publicationDate: string | null;
  url: string | null;
  description: string | null;
  authors: string | null;
}

export interface ParsedPatent {
  title: string | null;
  patentOffice: string | null;
  patentNumber: string | null;
  status: 'FILED' | 'PUBLISHED' | 'GRANTED' | null;
  filingDate: string | null;
  issueDate: string | null;
  url: string | null;
  description: string | null;
  inventors: string | null;
}

export interface ParsedAward {
  title: string | null;
  issuer: string | null;
  date: string | null;
  description: string | null;
}

export interface ParsedVolunteer {
  organization: string | null;
  role: string | null;
  cause: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean | null;
  description: string | null;
}

export interface ParsedMembership {
  organization: string | null;
  role: string | null;
  startDate: string | null;
  endDate: string | null;
  membershipId: string | null;
  description: string | null;
}

export interface ParsedCourse {
  name: string | null;
  provider: string | null;
  completionDate: string | null;
  url: string | null;
  associatedWith: string | null;
}

export interface ParsedTestScore {
  testName: string | null;
  score: string | null;
  dateOfExam: string | null;
  associatedWith: string | null;
  description: string | null;
}

export interface ParsedReference {
  name: string | null;
  designation: string | null;
  organization: string | null;
  email: string | null;
  phone: string | null;
  relationship: string | null;
}

export interface ParsedLanguageProficiency {
  language: string | null;
  proficiency: 'BASIC' | 'INTERMEDIATE' | 'FLUENT' | 'NATIVE' | null;
  readWrite: string | null;
}

export interface ParsedSkillWithProficiency {
  skill: string | null;
  proficiency: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT' | null;
  yearsOfExperience: number | null;
}

export interface ParsedITSkill {
  technology: string | null;
  version: string | null;
  lastUsed: string | null;
  experienceYears: number | null;
  proficiency: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT' | null;
}

// ── Root parsed-resume shape ────────────────────────────────────────

export interface ParsedResumeData {
  // Identity
  name: string | null;
  email: string | null;
  phone: string | null;
  alternatePhone: string | null;
  alternateEmail: string | null;
  headline: string | null;
  summary: string | null; // → CandidateProfile.bio on apply
  dob: string | null;
  gender: Gender | null;
  maritalStatus: MaritalStatus | null;
  nationality: string | null;
  hometown: string | null;
  pronouns: string | null;
  category: ReservationCategory | null;

  // Address
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string | null;
  currentLocation: string | null;

  // Professional snapshot
  experienceYears: number | null;
  totalExperienceMonths: number | null;
  experienceLevel: ExperienceLevelStr | null;
  currentCompany: string | null;
  currentRole: string | null;
  currentIndustry: string | null;
  currentDepartment: string | null;
  functionalArea: string | null;
  workStatus: WorkStatus | null;
  openToWork: OpenToWorkStatus | null;
  noticePeriod: NoticePeriod | null;
  servingNoticePeriod: boolean | null;
  hasCareerBreak: boolean | null;
  careerBreakType: CareerBreakType | null;
  careerBreakReason: string | null;
  currSalary: number | null;
  expectedSalaryMin: number | null;
  expectedSalaryMax: number | null;
  salaryCurrency: string | null;

  // Career preferences
  preferredJobType: JobTypeStr[] | null;
  preferredWorkMode: WorkModeStr[] | null;
  preferredShift: ShiftTypeStr | null;
  preferredLocations: string[] | null;
  preferredIndustries: string[] | null;
  preferredRoleCategories: string[] | null;
  willingToRelocate: boolean | null;
  travelWillingnessPercent: number | null;
  dateOfAvailability: string | null;

  // Education summary
  highestEducationLevel: EducationLevelStr | null;
  highestDegree: SpecificDegreeStr | null;

  // Visa + docs
  visaStatus: string | null;
  workPermitStatus: string | null;
  passportNumber: string | null;
  passportExpiryDate: string | null;
  hasDrivingLicense: boolean | null;
  drivingLicenseType: DrivingLicenseTypeStr | null;
  ownVehicle: boolean | null;
  vehicleTypes: VehicleType[] | null;
  isVeteran: boolean | null;

  // Disability
  isPhysicallyChallenged: boolean | null;
  disabilityType: DisabilityType | null;
  disabilityPercentage: number | null;

  // Lists / scalars
  skills: string[];
  languages: string[];
  certifications: ParsedCertification[];
  interests: string[];
  hobbies: string[];
  blockedCompanies: string[];

  // Rich arrays
  experience: ParsedExperience[];
  education: ParsedEducation[];
  itSkills: ParsedITSkill[];
  skillsWithProficiency: ParsedSkillWithProficiency[];
  languageProficiency: ParsedLanguageProficiency[];
  projects: ParsedProject[];
  publications: ParsedPublication[];
  patents: ParsedPatent[];
  awards: ParsedAward[];
  volunteerExperience: ParsedVolunteer[];
  professionalMemberships: ParsedMembership[];
  courses: ParsedCourse[];
  testScores: ParsedTestScore[];
  references: ParsedReference[];

  // Social
  linkedinProfile: string | null;
  githubProfile: string | null;
  portfolioUrl: string | null;
  stackOverflowProfile: string | null;
  twitterProfile: string | null;
  personalBlogUrl: string | null;
  dribbbleProfile: string | null;
  behanceProfile: string | null;
  mediumProfile: string | null;
  youtubeChannel: string | null;
}

// ── Outbound apply-fields shape ─────────────────────────────────────
// Keys mirror the candidate-profile column names so the apply handler
// can spread directly into the form state. Anything left undefined is
// not applied (preserves existing form values).

export interface ApplyableResumeFields {
  // Identity
  // firstName/lastName aren't part of CandidateProfile — they live on the
  // User record (set at registration). buildApplyableFields splits
  // parsed.name on the first space and emits them here so the apply
  // handler can update the user via authService.updateProfile, separately
  // from the candidate-profile fields. mobile/email are deliberately not
  // overridable from a parsed resume (auth identifiers), but name is.
  firstName?: string;
  lastName?: string;
  bio?: string; // ← summary
  headline?: string;
  pronouns?: string;
  // Primary phone + email are deliberately not in this type — they're
  // auth-tied identifiers we never overwrite from a parsed resume.
  // The parser's phone/email + alternatePhone/alternateEmail outputs
  // are routed to these alternate slots by buildApplyableFields, so a
  // user can promote them to primary in their settings later if they
  // want.
  alternatePhone?: string;
  alternateEmail?: string;
  dob?: string;
  gender?: Gender;
  maritalStatus?: MaritalStatus;
  nationality?: string;
  hometown?: string;
  category?: ReservationCategory;

  // Address
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  currentLocation?: string;

  // Professional
  experienceYears?: number;
  totalExperienceMonths?: number;
  experienceLevel?: ExperienceLevelStr;
  currentCompany?: string;
  currentRole?: string;
  currentIndustry?: string;
  currentDepartment?: string;
  functionalArea?: string;
  workStatus?: WorkStatus;
  openToWork?: OpenToWorkStatus;
  noticePeriod?: NoticePeriod;
  servingNoticePeriod?: boolean;
  hasCareerBreak?: boolean;
  careerBreakType?: CareerBreakType;
  careerBreakReason?: string;
  currSalary?: number;
  expectedSalaryMin?: number;
  expectedSalaryMax?: number;
  salaryCurrency?: string;

  // Career preferences
  preferredJobType?: JobTypeStr[];
  preferredWorkMode?: WorkModeStr[];
  preferredShift?: ShiftTypeStr;
  preferredLocations?: string[];
  preferredIndustries?: string[];
  preferredRoleCategories?: string[];
  willingToRelocate?: boolean;
  travelWillingnessPercent?: number;
  dateOfAvailability?: string;

  // Education summary
  highestEducationLevel?: EducationLevelStr;
  highestDegree?: SpecificDegreeStr;

  // Visa + docs
  visaStatus?: string;
  workPermitStatus?: string;
  passportNumber?: string;
  passportExpiryDate?: string;
  hasDrivingLicense?: boolean;
  drivingLicenseType?: DrivingLicenseTypeStr;
  ownVehicle?: boolean;
  vehicleTypes?: VehicleType[];
  isVeteran?: boolean;

  // Disability
  isPhysicallyChallenged?: boolean;
  disabilityType?: DisabilityType;
  disabilityPercentage?: number;

  // Lists / scalars
  skills?: string[];
  languages?: string[];
  certifications?: CertificationEntry[];
  interests?: string[];
  hobbies?: string[];
  blockedCompanies?: string[];

  // Rich
  experience?: ExperienceEntry[];
  education?: EducationEntry[];
  itSkills?: ITSkillEntry[];
  skillsWithProficiency?: SkillWithProficiency[];
  languageProficiency?: LanguageEntry[];
  projects?: ProjectEntry[];
  publications?: PublicationEntry[];
  patents?: PatentEntry[];
  awards?: AwardEntry[];
  volunteerExperience?: VolunteerEntry[];
  professionalMemberships?: MembershipEntry[];
  courses?: CourseCompletionEntry[];
  testScores?: TestScoreEntry[];
  references?: ReferenceEntry[];

  // Social
  linkedinProfile?: string;
  githubProfile?: string;
  portfolioUrl?: string;
  stackOverflowProfile?: string;
  twitterProfile?: string;
  personalBlogUrl?: string;
  dribbbleProfile?: string;
  behanceProfile?: string;
  mediumProfile?: string;
  youtubeChannel?: string;
}
