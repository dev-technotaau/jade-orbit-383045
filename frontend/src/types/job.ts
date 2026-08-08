export type JobType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP' | 'FREELANCE';
export type JobStatus = 'OPEN' | 'CLOSED' | 'DRAFT' | 'EXPIRED';
export type ApplicationStatus =
  | 'APPLIED'
  | 'VIEWED'
  | 'SHORTLISTED'
  | 'SELECTED'
  | 'INTERVIEW_SCHEDULED'
  | 'REJECTED'
  | 'OFFERED'
  | 'HIRED'
  | 'WITHDRAWN';
export type WorkMode = 'ON_SITE' | 'REMOTE' | 'HYBRID';
export type ShiftType = 'DAY' | 'NIGHT' | 'ROTATIONAL' | 'FLEXIBLE';
export type ExperienceLevel = 'FRESHER' | 'ENTRY' | 'MID' | 'SENIOR' | 'LEAD' | 'EXECUTIVE';
export type SalaryType = 'ANNUAL' | 'MONTHLY' | 'HOURLY';
export type EducationLevel =
  | 'TENTH'
  | 'TWELFTH'
  | 'DIPLOMA'
  | 'BACHELORS'
  | 'MASTERS'
  | 'PHD'
  | 'POST_DOCTORAL';
export type UrgencyLevel = 'NORMAL' | 'URGENT' | 'IMMEDIATE';
export type CompanyType =
  | 'PRIVATE'
  | 'PUBLIC'
  | 'STARTUP'
  | 'MNC'
  | 'GOVERNMENT'
  | 'NGO'
  | 'SEMI_GOVERNMENT';

// Enterprise enums
export type NoticePeriodPreference =
  | 'IMMEDIATE'
  | 'FIFTEEN_DAYS'
  | 'ONE_MONTH'
  | 'TWO_MONTHS'
  | 'THREE_MONTHS'
  | 'NEGOTIABLE';
export type FunctionalArea =
  | 'IT_SOFTWARE'
  | 'IT_HARDWARE'
  | 'SALES'
  | 'MARKETING'
  | 'HR'
  | 'FINANCE'
  | 'ITES_BPO'
  | 'ENGINEERING'
  | 'PRODUCTION'
  | 'PHARMA'
  | 'BANKING'
  | 'LEGAL'
  | 'MEDIA'
  | 'HOSPITALITY'
  | 'RETAIL'
  | 'LOGISTICS'
  | 'EDUCATION'
  | 'HEALTHCARE'
  | 'REAL_ESTATE'
  | 'OTHER';
export type SpecificDegree =
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
export type GenderPreference = 'ANY' | 'MALE' | 'FEMALE' | 'OTHER';
export type DrivingLicenseType = 'NONE' | 'TWO_WHEELER' | 'FOUR_WHEELER' | 'BOTH' | 'HEAVY_VEHICLE';
export type PostingVisibility = 'PUBLIC' | 'INTERNAL' | 'BOTH';
export type ApplyMethod = 'IN_PLATFORM' | 'EXTERNAL_URL' | 'EMAIL' | 'WALK_IN';
export type ScreeningQuestionType = 'TEXT' | 'YES_NO' | 'MULTIPLE_CHOICE' | 'NUMERIC';

export interface Job {
  id: string;
  companyId: string;
  clientCompanyName: string | null;
  title: string;
  description: string;
  keyResponsibilities: string | null;
  requirements: string | null;
  benefits: string | null;
  type: JobType;
  status: JobStatus;
  workMode: WorkMode | null;
  shiftType: ShiftType | null;
  industry: string | null;
  department: string | null;
  roleCategory: string | null;
  experienceMin: number;
  experienceMax: number | null;
  experienceLevel: ExperienceLevel | null;
  educationRequired: EducationLevel | null;
  preferredEducationField: string | null;
  location: string;
  latitude: number | null;
  longitude: number | null;
  isRemote: boolean;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  salaryType: SalaryType | null;
  salaryDisclosed: boolean;
  skillsRequired: string[];
  niceToHaveSkills: string[];
  certificationsRequired: string[];
  languagesRequired: string[];
  numberOfOpenings: number | null;
  /** Hires recorded off-platform. Vacancy fill = HIRED applications + this. */
  offlineHiresCount: number;
  urgencyLevel: UrgencyLevel | null;
  isFeatured: boolean;
  isPremium: boolean;
  tags: string[];
  jobPerks: string[];
  travelRequired: boolean;
  relocationAssistance: boolean;
  applicationDeadline: string | null;
  interviewProcess: string | null;
  isWalkIn: boolean;
  walkInDetails: Record<string, unknown> | null;
  contactPerson: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  views: number;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  company?: JobCompany;
  _applicationCount?: number;
  _hiredCount?: number;
  isSaved?: boolean;
  // Enterprise fields
  functionalArea: FunctionalArea | null;
  ugRequired: EducationLevel | null;
  pgRequired: EducationLevel | null;
  specificDegrees: SpecificDegree[];
  degreeSpecializations: string[];
  salaryNegotiable: boolean;
  noticePeriodPreference: NoticePeriodPreference[];
  isConfidential: boolean;
  referenceCode: string | null;
  additionalLocations: string[];
  accommodationProvided: boolean;
  walkInStartDate: string | null;
  walkInEndDate: string | null;
  walkInTime: string | null;
  walkInVenue: string | null;
  walkInContactPerson: string | null;
  walkInContactPhone: string | null;
  walkInInstructions: string | null;
  diversityTags: string[];
  visaSponsorshipAvailable: boolean;
  backgroundCheckRequired: boolean;
  isPwdFriendly: boolean;
  passportRequired: boolean;
  bondDetails: string | null;
  drivingLicenseRequired: DrivingLicenseType | null;
  ageMin: number | null;
  ageMax: number | null;
  genderPreference: GenderPreference | null;
  postingVisibility: PostingVisibility;
  applyMethod: ApplyMethod;
  externalApplyUrl: string | null;
  scheduledPublishAt: string | null;
  screeningQuestions?: ScreeningQuestion[];
}

export interface JobCompany {
  id: string;
  userId?: string;
  /** Public SEO slug — present when the company has been backfilled. */
  slug?: string | null;
  companyName: string;
  logo: string | null;
  coverImage?: string | null;
  tagline: string | null;
  industry: string | null;
  subIndustry: string | null;
  companyType: CompanyType | null;
  companySize: string | null;
  employeeCount: number | null;
  foundedYear: number | null;
  website: string | null;
  headquarters: string | null;
  city: string | null;
  state: string | null;
  locations: string[];
  description: string | null;
  isVerified: boolean;
  /** Optional — present when the backend has a review aggregate row. */
  averageRating?: number;
  /** Optional — present when the backend has a review aggregate row. */
  totalReviews?: number;
}

export interface JobApplication {
  id: string;
  jobId: string;
  candidateId: string;
  status: ApplicationStatus;
  coverLetter: string | null;
  resumeSnapshot: string | null;
  matchScore: number | null;
  source: string | null;
  candidateNotes: string | null;
  interviewDate: string | null;
  interviewNotes: string | null;
  interviewFeedback:
    | { stage: string; interviewer?: string; rating?: number; feedback?: string; date?: string }[]
    | null;
  rejectionReason: string | null;
  viewedAt: string | null;
  selectedAt: string | null;
  offerDetails: {
    salary?: string;
    joiningDate?: string;
    designation?: string;
    location?: string;
  } | null;
  offeredAt: string | null;
  hiredAt: string | null;
  appliedAt: string;
  updatedAt: string;
  job?: Job;
  screeningAnswers?: ScreeningAnswer[];
  candidate?: {
    id: string;
    userId: string;
    headline: string | null;
    phone: string | null;
    experienceYears: number;
    currentCompany: string | null;
    currentRole: string | null;
    skills: string[];
    user: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
      avatar: string | null;
    };
  };
}

export interface ShortlistCandidateRequest {
  jobId: string;
}

export interface SelectCandidateRequest {
  jobId: string;
}

export interface CreateJobRequest {
  title: string;
  description: string;
  clientCompanyName?: string;
  keyResponsibilities?: string;
  requirements?: string;
  benefits?: string;
  type?: JobType;
  workMode?: WorkMode;
  shiftType?: ShiftType;
  industry?: string;
  department?: string;
  roleCategory?: string;
  experienceMin?: number;
  experienceMax?: number;
  experienceLevel?: ExperienceLevel;
  educationRequired?: EducationLevel;
  preferredEducationField?: string;
  location: string;
  isRemote?: boolean;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  salaryType?: SalaryType;
  salaryDisclosed?: boolean;
  skillsRequired: string[];
  niceToHaveSkills?: string[];
  certificationsRequired?: string[];
  languagesRequired?: string[];
  numberOfOpenings?: number;
  urgencyLevel?: UrgencyLevel;
  isFeatured?: boolean;
  isPremium?: boolean;
  tags?: string[];
  jobPerks?: string[];
  travelRequired?: boolean;
  relocationAssistance?: boolean;
  applicationDeadline?: string;
  interviewProcess?: string;
  isWalkIn?: boolean;
  walkInDetails?: Record<string, unknown>;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  // Enterprise fields
  functionalArea?: FunctionalArea;
  ugRequired?: EducationLevel;
  pgRequired?: EducationLevel;
  specificDegrees?: SpecificDegree[];
  degreeSpecializations?: string[];
  salaryNegotiable?: boolean;
  noticePeriodPreference?: NoticePeriodPreference[];
  isConfidential?: boolean;
  referenceCode?: string;
  additionalLocations?: string[];
  accommodationProvided?: boolean;
  walkInStartDate?: string;
  walkInEndDate?: string;
  walkInTime?: string;
  walkInVenue?: string;
  walkInContactPerson?: string;
  walkInContactPhone?: string;
  walkInInstructions?: string;
  diversityTags?: string[];
  visaSponsorshipAvailable?: boolean;
  backgroundCheckRequired?: boolean;
  isPwdFriendly?: boolean;
  passportRequired?: boolean;
  bondDetails?: string;
  drivingLicenseRequired?: DrivingLicenseType;
  ageMin?: number;
  ageMax?: number;
  genderPreference?: GenderPreference;
  postingVisibility?: PostingVisibility;
  applyMethod?: ApplyMethod;
  externalApplyUrl?: string;
  scheduledPublishAt?: string;
  expiresAt?: string;
  screeningQuestions?: ScreeningQuestionInput[];
}

export type UpdateJobRequest = Partial<CreateJobRequest>;

export interface ScreeningQuestion {
  id: string;
  jobId: string;
  question: string;
  questionType: ScreeningQuestionType;
  isRequired: boolean;
  isDealBreaker: boolean;
  options: string[] | null;
  idealAnswer: string | null;
  displayOrder: number;
  createdAt: string;
}

export interface ScreeningQuestionInput {
  question: string;
  questionType?: ScreeningQuestionType;
  isRequired?: boolean;
  isDealBreaker?: boolean;
  options?: string[];
  idealAnswer?: string;
  displayOrder?: number;
}

export interface ScreeningAnswerInput {
  questionId: string;
  answer: string;
}

export interface ScreeningAnswer {
  id: string;
  questionId: string;
  answer: string;
  question: ScreeningQuestion;
}

export interface JobTemplate {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  templateData: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface JobSearchFilters {
  keyword?: string;
  location?: string;
  type?: string;
  isRemote?: string;
  workMode?: WorkMode;
  shiftType?: ShiftType;
  industry?: string;
  department?: string;
  experience?: string;
  experienceLevel?: ExperienceLevel;
  educationRequired?: EducationLevel;
  salaryMin?: string;
  salaryMax?: string;
  companyType?: CompanyType;
  companySize?: string;
  postedAfter?: string;
  postedBefore?: string;
  tags?: string;
  urgencyLevel?: UrgencyLevel;
  isFeatured?: string;
  isWalkIn?: string;
  latitude?: string;
  longitude?: string;
  radiusKm?: string;
  sortBy?: 'relevance' | 'date' | 'salary' | 'salary_asc' | 'distance';
  page?: string;
  limit?: string;
  // Enterprise filters
  functionalArea?: FunctionalArea;
  noticePeriodPreference?: string;
  isPwdFriendly?: string;
  visaSponsorshipAvailable?: string;
  genderPreference?: GenderPreference;
  diversityTags?: string;
  postingVisibility?: PostingVisibility;
}
