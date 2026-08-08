import type {
  WorkMode,
  ShiftType,
  JobType,
  ExperienceLevel,
  EducationLevel,
  SpecificDegree,
  DrivingLicenseType,
} from './job';
import type { ImageVariants } from './admin';

export type Gender = 'MALE' | 'FEMALE' | 'NON_BINARY' | 'PREFER_NOT_TO_SAY' | 'OTHER';
export type WorkStatus = 'EMPLOYED' | 'UNEMPLOYED' | 'STUDENT' | 'FREELANCER' | 'ACTIVELY_LOOKING';
export type NoticePeriod =
  | 'IMMEDIATE'
  | 'FIFTEEN_DAYS'
  | 'THIRTY_DAYS'
  | 'SIXTY_DAYS'
  | 'NINETY_DAYS'
  | 'MORE_THAN_NINETY_DAYS';
export type MaritalStatus = 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOWED' | 'PREFER_NOT_TO_SAY';
export type DisabilityType =
  | 'NONE'
  | 'VISUAL'
  | 'HEARING'
  | 'LOCOMOTOR'
  | 'INTELLECTUAL'
  | 'MULTIPLE'
  | 'OTHER';
export type CareerBreakType =
  | 'HEALTH'
  | 'FAMILY'
  | 'HIGHER_EDUCATION'
  | 'TRAVEL'
  | 'LAYOFF'
  | 'PERSONAL'
  | 'CAREGIVING'
  | 'CAREER_TRANSITION'
  | 'OTHER';
export type ReservationCategory = 'GENERAL' | 'SC' | 'ST' | 'OBC' | 'EWS' | 'PREFER_NOT_TO_SAY';
export type CourseType = 'FULL_TIME' | 'PART_TIME' | 'DISTANCE' | 'CORRESPONDENCE';
export type LanguageReadWrite = 'READ' | 'WRITE' | 'SPEAK' | 'READ_WRITE' | 'READ_WRITE_SPEAK';
export type OpenToWorkStatus = 'ACTIVELY_LOOKING' | 'OPEN_TO_OFFERS' | 'NOT_LOOKING';
export type VehicleType = 'BIKE' | 'CAR' | 'SCOOTER';

export interface CandidateProfile {
  id: string;
  userId: string;
  /**
   * Whether the requesting employer may see this candidate's contact
   * details (unlocked / applicant / unlimited plan). When false the
   * backend strips email + phone from the payload. Absent on
   * candidate-own and legacy responses.
   */
  contactUnlocked?: boolean;
  headline: string | null;
  pronouns: string | null;
  gender: Gender | null;
  dob: string | null;
  dateOfBirth?: string | null;
  maritalStatus: MaritalStatus | null;
  nationality: string | null;
  hometown: string | null;
  category: ReservationCategory | null;
  bio: string | null;
  resume: string | null;
  resumeOriginalName: string | null;
  resumeSize: number | null;
  resumeMimeType: string | null;
  resumeUploadedAt: string | null;
  additionalResumes: ResumeEntry[] | null;
  generatedResumeUrl: string | null;
  generatedResumeAt: string | null;
  videoResumeUrl: string | null;
  profileImage: string | null;
  imageVariants?: ImageVariants | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string | null;
  currentLocation: string | null;
  preferredLocations: string[];
  phone: string | null;
  alternatePhone: string | null;
  alternateEmail: string | null;
  latitude: number | null;
  longitude: number | null;
  experienceYears: number;
  totalExperienceMonths: number | null;
  experienceLevel: ExperienceLevel | null;
  currentCompany: string | null;
  currentRole: string | null;
  currentIndustry: string | null;
  currentDepartment: string | null;
  functionalArea: string | null;
  currSalary: number | null;
  expectedSalary?: number | null;
  expectedSalaryMin: number | null;
  expectedSalaryMax: number | null;
  salaryCurrency: string;
  noticePeriod: NoticePeriod | null;
  servingNoticePeriod: boolean;
  workStatus: WorkStatus | null;
  hasCareerBreak: boolean;
  careerBreakType: CareerBreakType | null;
  careerBreakReason: string | null;
  openToWork: OpenToWorkStatus | null;
  preferredJobType: JobType[];
  preferredJobTypes?: JobType[];
  preferredWorkMode: WorkMode[];
  preferredWorkModes?: WorkMode[];
  preferredShift: ShiftType | null;
  preferredIndustries: string[];
  preferredRoleCategories: string[];
  dateOfAvailability: string | null;
  willingToRelocate: boolean;
  travelWillingnessPercent: number | null;
  highestEducationLevel: EducationLevel | null;
  highestDegree: SpecificDegree | null;
  visaStatus: string | null;
  workPermitStatus: string | null;
  passportNumber: string | null;
  passportExpiryDate: string | null;
  hasDrivingLicense: boolean;
  drivingLicenseType: DrivingLicenseType | null;
  ownVehicle: boolean;
  vehicleTypes: VehicleType[];
  isVeteran: boolean;
  blockedCompanies: string[];
  skills: string[];
  languages: string[];
  itSkills: ITSkillEntry[] | null;
  education: EducationEntry[] | null;
  experience: ExperienceEntry[] | null;
  certifications: CertificationEntry[] | null;
  projects: ProjectEntry[] | null;
  publications: PublicationEntry[] | null;
  patents: PatentEntry[] | null;
  awards: AwardEntry[] | null;
  volunteerExperience: VolunteerEntry[] | null;
  professionalMemberships: MembershipEntry[] | null;
  courses: CourseCompletionEntry[] | null;
  testScores: TestScoreEntry[] | null;
  references: ReferenceEntry[] | null;
  languageProficiency: LanguageEntry[] | null;
  skillsWithProficiency: SkillWithProficiency[] | null;
  interests: string[];
  hobbies: string[];
  isPwD?: boolean;
  veteranStatus?: string | null;
  isPhysicallyChallenged: boolean;
  disabilityType: DisabilityType | null;
  disabilityPercentage: number | null;
  profileCompleteness: number;
  githubProfile: string | null;
  githubUrl?: string | null;
  linkedinProfile: string | null;
  linkedinUrl?: string | null;
  portfolioUrl: string | null;
  stackOverflowProfile: string | null;
  twitterProfile: string | null;
  personalBlogUrl: string | null;
  dribbbleProfile: string | null;
  behanceProfile: string | null;
  mediumProfile: string | null;
  youtubeChannel: string | null;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    avatar: string | null;
    isEmailVerified: boolean;
    isMobileVerified: boolean;
    isWhatsappVerified?: boolean;
    mobileNumber?: string | null;
    whatsappNumber?: string | null;
    lastActiveAt?: string | null;
  };
}

export interface EducationEntry {
  educationLevel?: string;
  institution: string;
  degree: string;
  boardState?: string;
  field: string;
  fieldOfStudy?: string;
  startDate: string;
  endDate?: string;
  grade?: string;
  gradeType?: 'PERCENTAGE' | 'CGPA' | 'GPA';
  courseType?: CourseType;
  specialization?: string;
  description?: string;
  activities?: string;
}

export interface ExperienceEntry {
  company: string;
  role: string;
  location?: string;
  industry?: string;
  department?: string;
  employmentType?: string;
  startDate: string;
  endDate?: string;
  isCurrent?: boolean;
  description?: string;
  keyAchievements?: string[];
  teamSize?: number;
  reportingTo?: string;
  annualCtc?: number;
}

export interface CertificationEntry {
  name: string;
  issuer: string;
  issueDate?: string;
  expiryDate?: string;
  credentialId?: string;
  url?: string;
  doesNotExpire?: boolean;
}

export interface ProjectEntry {
  name: string;
  description?: string;
  url?: string;
  startDate?: string;
  endDate?: string;
  technologies?: string[];
  role?: string;
  teamSize?: number;
  client?: string;
  isCurrent?: boolean;
}

export interface AwardEntry {
  title: string;
  issuer?: string;
  date?: string;
  description?: string;
}

export interface LanguageEntry {
  language: string;
  proficiency: 'BASIC' | 'INTERMEDIATE' | 'FLUENT' | 'NATIVE';
  readWrite?: LanguageReadWrite;
  read?: boolean;
  write?: boolean;
  speak?: boolean;
}

export interface SkillWithProficiency {
  skill: string;
  proficiency: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
  yearsOfExperience?: number;
  years?: number;
}

export interface ITSkillEntry {
  technology: string;
  version?: string;
  lastUsed?: string;
  experienceYears?: number;
  proficiency?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
}

export interface PublicationEntry {
  title: string;
  publisher?: string;
  publicationDate?: string;
  url?: string;
  description?: string;
  authors?: string;
}

export interface PatentEntry {
  title: string;
  patentOffice?: string;
  patentNumber?: string;
  status?: 'FILED' | 'PUBLISHED' | 'GRANTED';
  filingDate?: string;
  issueDate?: string;
  url?: string;
  description?: string;
  inventors?: string;
}

export interface VolunteerEntry {
  organization: string;
  role: string;
  cause?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  description?: string;
}

export interface MembershipEntry {
  organization: string;
  role?: string;
  startDate?: string;
  endDate?: string;
  membershipId?: string;
  description?: string;
}

export interface CourseCompletionEntry {
  name: string;
  provider?: string;
  completionDate?: string;
  url?: string;
  associatedWith?: string;
}

export interface TestScoreEntry {
  testName: string;
  score: string;
  dateOfExam?: string;
  associatedWith?: string;
  description?: string;
}

export interface ReferenceEntry {
  name: string;
  designation?: string;
  organization?: string;
  email?: string;
  phone?: string;
  relationship?: string;
}

export interface ResumeEntry {
  name: string;
  url: string;
  originalName?: string;
  isDefault?: boolean;
  uploadedAt?: string;
}

export interface UpdateCandidateRequest {
  firstName?: string;
  lastName?: string;
  headline?: string;
  pronouns?: string;
  gender?: Gender;
  dob?: string;
  maritalStatus?: MaritalStatus;
  nationality?: string;
  hometown?: string;
  category?: ReservationCategory;
  bio?: string;
  videoResumeUrl?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  currentLocation?: string;
  preferredLocations?: string[];
  phone?: string;
  alternatePhone?: string;
  alternateEmail?: string;
  experienceYears?: number;
  totalExperienceMonths?: number;
  experienceLevel?: ExperienceLevel;
  currentCompany?: string;
  currentRole?: string;
  currentIndustry?: string;
  currentDepartment?: string;
  functionalArea?: string;
  currSalary?: number;
  expectedSalaryMin?: number;
  expectedSalaryMax?: number;
  salaryCurrency?: string;
  noticePeriod?: NoticePeriod;
  servingNoticePeriod?: boolean;
  workStatus?: WorkStatus;
  hasCareerBreak?: boolean;
  careerBreakType?: CareerBreakType;
  careerBreakReason?: string;
  openToWork?: OpenToWorkStatus;
  preferredJobType?: JobType[];
  preferredWorkMode?: WorkMode[];
  preferredShift?: ShiftType;
  preferredIndustries?: string[];
  preferredRoleCategories?: string[];
  dateOfAvailability?: string;
  willingToRelocate?: boolean;
  travelWillingnessPercent?: number;
  highestEducationLevel?: EducationLevel;
  highestDegree?: SpecificDegree;
  visaStatus?: string;
  workPermitStatus?: string;
  passportNumber?: string;
  passportExpiryDate?: string;
  hasDrivingLicense?: boolean;
  drivingLicenseType?: DrivingLicenseType;
  ownVehicle?: boolean;
  vehicleTypes?: VehicleType[];
  isVeteran?: boolean;
  blockedCompanies?: string[];
  skills?: string[];
  languages?: string[];
  itSkills?: ITSkillEntry[];
  education?: EducationEntry[];
  experience?: ExperienceEntry[];
  certifications?: CertificationEntry[];
  projects?: ProjectEntry[];
  publications?: PublicationEntry[];
  patents?: PatentEntry[];
  awards?: AwardEntry[];
  volunteerExperience?: VolunteerEntry[];
  professionalMemberships?: MembershipEntry[];
  courses?: CourseCompletionEntry[];
  testScores?: TestScoreEntry[];
  references?: ReferenceEntry[];
  languageProficiency?: LanguageEntry[];
  skillsWithProficiency?: SkillWithProficiency[];
  interests?: string[];
  hobbies?: string[];
  isPhysicallyChallenged?: boolean;
  disabilityType?: DisabilityType;
  disabilityPercentage?: number;
  githubProfile?: string;
  linkedinProfile?: string;
  portfolioUrl?: string;
  stackOverflowProfile?: string;
  twitterProfile?: string;
  personalBlogUrl?: string;
  dribbbleProfile?: string;
  behanceProfile?: string;
  mediumProfile?: string;
  youtubeChannel?: string;
  notificationPreferences?: {
    emailNotifications?: boolean;
    smsNotifications?: boolean;
    whatsappNotifications?: boolean;
    inAppNotifications?: boolean;
    fcmNotifications?: boolean;
    webPushNotifications?: boolean;
  };
  profileVisibility?: 'public' | 'registered' | 'private';
  resumeSearchable?: boolean;
}

export interface ProfileCompleteness {
  score: number;
  sections: {
    name: string;
    completed: boolean;
    weight: number;
  }[];
}

export interface ResumeReadinessItem {
  field: string;
  message: string;
  section: string;
}

export interface ResumeReadiness {
  canGenerate: boolean;
  errors: ResumeReadinessItem[];
  warnings: ResumeReadinessItem[];
  suggestions: ResumeReadinessItem[];
}

export interface CandidateDashboard {
  applicationsCount: number;
  savedJobsCount: number;
  profileViews: number;
  profileCompleteness: number;
  recentApplications: Array<{
    id: string;
    jobTitle: string;
    companyName: string;
    status: string;
    appliedAt: string;
  }>;
}

export interface CandidateAnalytics {
  summary: {
    totalApplications: number;
    activeApplications: number;
    interviewRate: number;
    offerRate: number;
    profileViews: number;
    profileScore: number;
    savedJobs: number;
    avgResponseDays: number | null;
  };
  previousPeriodSummary?: { totalApplications: number; profileViews: number } | null;
  funnel: Record<string, number>;
  trends: Array<{ period: string; applications: number; profileViews: number }>;
  statusDistribution: Array<{ status: string; count: number }>;
  sourceDistribution: Array<{ source: string; count: number }>;
  topSkillsInDemand: Array<{ skill: string; count: number; youHave: boolean }>;
  salaryInsights: {
    yourExpected: { min: number; max: number };
    appliedJobsAvg: { min: number; max: number };
    offeredAvg: number | null;
  };
  recentActivity: Array<{
    jobTitle: string;
    companyName: string;
    status: string;
    date: string;
  }>;
  dayOfWeekDistribution?: Array<{ day: string; count: number }>;
  responseTimeDistribution?: Array<{ bucket: string; count: number }>;
  sourceEffectiveness?: Array<{
    source: string;
    total: number;
    interviews: number;
    offers: number;
    hires: number;
    interviewRate: number;
  }>;
  locationDistribution?: Array<{ location: string; count: number }>;
}

export type AlertFrequency = 'INSTANT' | 'DAILY' | 'WEEKLY' | 'OFF';

export interface JobAlert {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  frequency: AlertFrequency;
  isActive: boolean;
  lastNotifiedAt: string | null;
  newMatchCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateJobAlertRequest {
  name: string;
  filters: Record<string, unknown>;
  frequency: AlertFrequency;
}

export interface UpdateJobAlertRequest {
  name?: string;
  filters?: Record<string, unknown>;
  frequency?: AlertFrequency;
  isActive?: boolean;
}

export interface CandidateSearchFilters {
  keyword?: string;
  keywordScope?: 'all' | 'title' | 'skills' | 'designation' | 'company';
  excludeKeywords?: string;
  location?: string;
  excludeLocation?: string;
  skills?: string;
  experienceMin?: string;
  experienceMax?: string;
  salaryMin?: string;
  salaryMax?: string;
  salaryCurrency?: string;
  includeSalaryNotDisclosed?: string;
  workStatus?: WorkStatus;
  noticePeriod?: NoticePeriod;
  servingNoticePeriod?: string;
  gender?: Gender;
  disabilityType?: DisabilityType;
  ageMin?: string;
  ageMax?: string;
  willingToRelocate?: string;
  preferredWorkMode?: WorkMode;
  preferredJobType?: string;
  lastActiveWithin?: string;
  currentCompany?: string;
  excludeCompany?: string;
  designation?: string;
  department?: string;
  currentIndustry?: string;
  hasCareerBreak?: string;
  careerBreakType?: CareerBreakType;
  openToWork?: OpenToWorkStatus;
  category?: ReservationCategory;
  isVeteran?: string;
  hasResume?: string;
  verifiedMobile?: string;
  verifiedEmail?: string;
  registeredAfter?: string;
  modifiedAfter?: string;
  education?: string;
  educationLevel?: 'UG' | 'PG' | 'DOCTORATE';
  certifications?: string;
  keywordOperator?: 'and' | 'or';
  itSkill?: string;
  workPermit?: string;
  latitude?: string;
  longitude?: string;
  radiusKm?: string;
  experienceLevel?: string;
  highestEducationLevel?: string;
  drivingLicenseType?: string;
  functionalArea?: string;
  experienceBucket?: string;
  salaryBucket?: string;
  sortBy?: 'relevance' | 'distance';
  page?: string;
  limit?: string;
}

export interface ResumeUploadResponse {
  resume: string;
  resumeOriginalName: string;
  resumeSize: number;
  resumeMimeType: string;
  resumeUploadedAt: string;
}

/**
 * Candidate profile-boost status. Mirrors the backend payload from
 * GET /candidates/me/boost. The Candidate Premium plan grants a 7-day
 * BOOST_DAYS pool that the user activates one day at a time via
 * POST /candidates/me/boost/activate — see ProfileBoostCard for the
 * UI that consumes this shape.
 */
export interface ProfileBoostStatus {
  /** True iff the user's active entitlements include feature.candidate_profile_boost. */
  eligible: boolean;
  /** Remaining BOOST_DAYS across all active entitlements (typically 0..7). */
  daysRemaining: number;
  /** Total BOOST_DAYS originally allocated by the active plan (typically 7). */
  daysTotal: number;
  /** True iff profileBoostActiveUntil > now() — boost window currently in effect. */
  isActive: boolean;
  /** ISO timestamp when the active boost expires (null if not active). */
  activeUntil: string | null;
  /** Hours until activeUntil, rounded up. 0 when isActive is false. */
  hoursUntilExpiry: number;
}

/**
 * Returned by POST /candidates/me/boost/activate after a successful
 * activation. activeUntil reflects the new (possibly extended) window.
 * daysSpent echoes how many days were consumed in this call (default 1).
 */
export interface ActivateProfileBoostResponse {
  activeUntil: string;
  hoursUntilExpiry: number;
  daysSpent: number;
  daysRemaining: number;
}
