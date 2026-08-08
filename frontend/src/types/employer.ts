import type { CompanyType } from './job';
import type { ImageVariants } from './admin';

export type AccountType = 'COMPANY' | 'INDIVIDUAL';
export type HiringType = 'DIRECT' | 'CONSULTANCY';

export type FundingStage =
  | 'BOOTSTRAPPED'
  | 'SEED'
  | 'SERIES_A'
  | 'SERIES_B'
  | 'SERIES_C'
  | 'SERIES_D_PLUS'
  | 'PRE_IPO'
  | 'PUBLIC'
  | 'ACQUIRED'
  | 'NOT_APPLICABLE';

export interface LeadershipEntry {
  name: string;
  designation: string;
  linkedinUrl?: string;
  imageUrl?: string;
  photo?: string;
  bio?: string;
}

export interface EmployeeTestimonialEntry {
  name: string;
  designation?: string;
  department?: string;
  quote: string;
  imageUrl?: string;
  photo?: string;
  authorName?: string;
  authorDesignation?: string;
  authorDepartment?: string;
}

export interface OfficePhotoEntry {
  url: string;
  caption?: string;
  location?: string;
}

export interface CompanyProfile {
  id: string;
  userId: string;
  /** Public SEO slug; null on companies that haven't been backfilled yet. */
  slug?: string | null;
  accountType: AccountType | null;
  hiringType: HiringType | null;
  companyName: string;
  companyType: CompanyType | null;
  tagline: string | null;
  logo: string | null;
  logoVariants?: ImageVariants | null;
  coverImage: string | null;
  coverVariants?: ImageVariants | null;
  companyVideoUrl: string | null;
  industry: string | null;
  subIndustry: string | null;
  specialties: string[];
  companySize: string | null;
  employeeCount: number | null;
  numberOfOffices: number | null;
  description: string | null;
  whyWorkForUs: string | null;
  website: string | null;
  careersPageUrl: string | null;
  blogUrl: string | null;
  foundedYear: number | null;
  parentCompany: string | null;
  stockTicker: string | null;
  gstNumber: string | null;
  cinNumber: string | null;
  panNumber: string | null;
  llpinNumber: string | null;
  tanNumber: string | null;
  isVerified: boolean;
  annualRevenueRange: string | null;
  fundingStage: FundingStage | null;
  totalFundingRaised: string | null;
  totalFundingRaisedAmount: number | string | null;
  fundingCurrency: string | null;
  investors: string[];
  productsServices: string[];
  techStack: string[];
  companyCulture: string | null;
  missionStatement: string | null;
  mission?: string | null;
  visionStatement: string | null;
  vision?: string | null;
  coreValues: string[];
  diversityStatement: string | null;
  employeeResourceGroups: string[];
  csrInitiatives: string | null;
  benefits: string[];
  structuredPerks: Array<{ category: string; perks: string[] }> | null;
  workplacePolicies: Record<string, string> | null;
  interviewProcess: string | null;
  awardsRecognitions: Array<{
    title: string;
    year?: number;
    issuer?: string;
    issuingOrg?: string;
    description?: string;
  }> | null;
  leadershipTeam: LeadershipEntry[] | null;
  employeeTestimonials: EmployeeTestimonialEntry[] | null;
  officePhotos: OfficePhotoEntry[] | null;
  socialLinks: {
    linkedin?: string;
    twitter?: string;
    facebook?: string;
    instagram?: string;
    youtube?: string;
    glassdoor?: string;
  } | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactPersonName: string | null;
  contactPersonDesignation: string | null;
  /**
   * Set by the admin user-detail endpoint when the four fields above were
   * blanked because the caller lacks `users.employers.company.contact` —
   * the private line the employer gave us, deliberately absent from every
   * public payload.
   */
  contactRedacted?: boolean;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string | null;
  headquarters: string | null;
  locations: string[];
  additionalLocations?: string[] | null;
  latitude: number | null;
  longitude: number | null;
  verificationStatus?: string | null;
  linkedinUrl?: string | null;
  twitterUrl?: string | null;
  facebookUrl?: string | null;
  awards?: Array<{
    title: string;
    year?: number;
    issuingOrg?: string;
    description?: string;
  }> | null;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    avatar: string | null;
  };
}

export interface UpdateCompanyRequest {
  accountType?: AccountType;
  hiringType?: HiringType;
  companyName?: string;
  companyType?: CompanyType;
  tagline?: string;
  industry?: string;
  subIndustry?: string;
  specialties?: string[];
  companySize?: string;
  employeeCount?: number;
  numberOfOffices?: number;
  description?: string;
  whyWorkForUs?: string;
  website?: string;
  careersPageUrl?: string;
  blogUrl?: string;
  companyVideoUrl?: string;
  foundedYear?: number;
  parentCompany?: string;
  stockTicker?: string;
  gstNumber?: string;
  cinNumber?: string;
  panNumber?: string;
  llpinNumber?: string;
  tanNumber?: string;
  annualRevenueRange?: string;
  fundingStage?: FundingStage;
  totalFundingRaised?: string;
  totalFundingRaisedAmount?: number;
  fundingCurrency?: string;
  investors?: string[];
  productsServices?: string[];
  techStack?: string[];
  companyCulture?: string;
  missionStatement?: string;
  visionStatement?: string;
  coreValues?: string[];
  diversityStatement?: string;
  employeeResourceGroups?: string[];
  csrInitiatives?: string;
  benefits?: string[];
  structuredPerks?: Array<{ category: string; perks: string[] }>;
  workplacePolicies?: Record<string, string>;
  interviewProcess?: string;
  awardsRecognitions?: Array<{ title: string; year?: number; issuer?: string }>;
  leadershipTeam?: LeadershipEntry[];
  employeeTestimonials?: EmployeeTestimonialEntry[];
  officePhotos?: OfficePhotoEntry[];
  socialLinks?: {
    linkedin?: string;
    twitter?: string;
    facebook?: string;
    instagram?: string;
    youtube?: string;
    glassdoor?: string;
  };
  contactEmail?: string;
  contactPhone?: string;
  contactPersonName?: string;
  contactPersonDesignation?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  headquarters?: string;
  locations?: string[];
  notificationPreferences?: {
    emailApplications?: boolean;
    emailMessages?: boolean;
    emailMarketing?: boolean;
    smsAlerts?: boolean;
    whatsappNotifications?: boolean;
    inAppNotifications?: boolean;
    fcmNotifications?: boolean;
    webPushNotifications?: boolean;
    weeklyDigest?: boolean;
  };
  showCompany?: boolean;
  showContact?: boolean;
}

export interface EmployerDashboard {
  activeJobsCount: number;
  totalApplications: number;
  shortlistedCount: number;
  profileViews: number;
  recentApplications: Array<{
    id: string;
    candidateName: string;
    jobTitle: string;
    status: string;
    appliedAt: string;
  }>;
  jobPerformance: Array<{
    jobId: string;
    jobTitle: string;
    views: number;
    applications: number;
  }>;
}

export interface EngagementMetrics {
  avgTimeToHireDays: number | null;
  funnel: {
    applied: number;
    viewed: number;
    shortlisted: number;
    interviewScheduled: number;
    offered: number;
    hired: number;
    rejected: number;
    withdrawn: number;
  };
  conversions: {
    appliedToViewed: number;
    viewedToShortlisted: number;
    shortlistedToInterview: number;
    interviewToOffered: number;
    offeredToHired: number;
    overallHireRate: number;
  };
  hiringVelocity: number;
  totalHires: number;
}

export interface EmployerAnalytics {
  summary: {
    totalJobsPosted: number;
    activeJobs: number;
    totalApplications: number;
    avgTimeToHireDays: number | null;
    overallHireRate: number;
    profileViews: number;
    savedCandidates: number;
    hiringVelocity: number;
  };
  previousPeriodSummary?: {
    totalJobsPosted: number;
    totalApplications: number;
    profileViews: number;
  } | null;
  funnel: Record<string, number>;
  trends: Array<{
    period: string;
    applications: number;
    profileViews: number;
    jobsPosted: number;
  }>;
  statusDistribution: Array<{ status: string; count: number }>;
  sourceDistribution: Array<{ source: string; count: number }>;
  topSkillsInDemand: Array<{ skill: string; count: number }>;
  salaryCompetitiveness: {
    yourAvg: { min: number; max: number };
    platformAvg: { min: number; max: number };
  };
  jobPerformance: Array<{
    jobId: string;
    title: string;
    views: number;
    applications: number;
    hiredCount: number;
    conversionRate: number;
  }>;
  recentActivity: Array<{
    candidateName: string;
    jobTitle: string;
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
  timeToHireDistribution?: Array<{ bucket: string; count: number }>;
}

export interface CompanyProfileCompleteness {
  score: number;
  sections: {
    name: string;
    completed: boolean;
    weight: number;
  }[];
}
