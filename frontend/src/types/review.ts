/**
 * Company-review types — mirror the backend Prisma shapes.
 *
 * `Review` is the public-shape (no PII, no fingerprint hash). Admin
 * surfaces use `AdminReview` which extends with status + reportedCount
 * + moderation metadata.
 */

export type ReviewGender = 'FEMALE' | 'MALE' | 'TRANSGENDER' | 'PREFER_NOT_TO_SAY';

export type ReviewWorkPolicy = 'PERMANENT_WFH' | 'WORKING_FROM_OFFICE' | 'HYBRID';

export type ReviewEmploymentType =
  | 'PERMANENT'
  | 'INTERNSHIP'
  | 'CONTRACT'
  | 'TEMPORARY'
  | 'FREELANCE'
  | 'PART_TIME'
  | 'TRAINEE';

export type ReviewStatus = 'PENDING' | 'APPROVED' | 'FLAGGED' | 'REJECTED' | 'DELETED';

export type ReviewSort = 'latest' | 'helpful' | 'highest_rated' | 'lowest_rated' | 'most_detailed';

export type ReviewChip =
  | 'highly_rated'
  | 'critically_rated'
  | 'latest'
  | 'detailed'
  | 'work_life_balance'
  | 'salary'
  | 'promotions'
  | 'job_security'
  | 'skill_development'
  | 'work_satisfaction'
  | 'company_culture';

export type ModerationAction = 'APPROVE' | 'FLAG' | 'REJECT' | 'DELETE';

export interface Review {
  id: string;
  overallRating: number;
  ratingWorkLifeBalance: number;
  ratingSalary: number;
  ratingPromotions: number;
  ratingJobSecurity: number;
  ratingSkillDev: number;
  ratingWorkSatisfaction: number;
  ratingCompanyCulture: number;
  gender: ReviewGender | null;
  workPolicy: ReviewWorkPolicy;
  currentlyWorking: boolean;
  startedWorkingAt: string | null;
  endedWorkingAt: string | null;
  designation: string;
  employmentType: ReviewEmploymentType;
  department: string;
  workLocation: string | null;
  likes: string | null;
  dislikes: string | null;
  workDetails: string | null;
  isDetailed: boolean;
  helpfulCount: number;
  notHelpfulCount: number;
  status: ReviewStatus;
  createdAt: string;
  /** From the listReviews endpoint — caller's vote (true=helpful, false=not, null=none). */
  myVote?: boolean | null;
}

export interface AdminReview extends Review {
  reportedCount: number;
  moderationReason: string | null;
  moderatedBy: string | null;
  moderatedAt: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  fingerprintHash?: string;
  user?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
  company?: {
    id: string;
    slug: string | null;
    companyName: string;
    logo: string | null;
  };
}

export interface OwnReview extends Review {
  company: {
    id: string;
    slug: string | null;
    companyName: string;
    logo: string | null;
    isVerified: boolean;
  };
}

export interface TopJobProfile {
  designation: string;
  avgRating: number;
  count: number;
}

export interface ReviewStatsResponse {
  totalReviews: number;
  averageOverall: number;
  averageWorkLifeBalance: number;
  averageSalary: number;
  averagePromotions: number;
  averageJobSecurity: number;
  averageSkillDev: number;
  averageWorkSatisfaction: number;
  averageCompanyCulture: number;
  distribution: { star: number; count: number; percent: number }[];
  men: { count: number; average: number | null; percent: number };
  women: { count: number; average: number | null; percent: number };
  industry: { name: string | null; average: number | null; diff: number | null };
  topJobProfiles: TopJobProfile[];
}

export interface ReviewFacets {
  gender: { value: ReviewGender; count: number }[];
  workPolicy: { value: ReviewWorkPolicy; count: number }[];
  employmentType: { value: ReviewEmploymentType; count: number }[];
  currentlyWorking: { value: boolean; count: number }[];
  rating: { value: number; count: number }[];
  department: { value: string; count: number }[];
}

export interface ReviewListResponse<T = Review> {
  items: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface CompanyAutocompleteItem {
  id: string;
  slug: string | null;
  companyName: string;
  logo: string | null;
  industry: string | null;
  isVerified: boolean;
  city: string | null;
  state: string | null;
}

export interface SubmitReviewInput {
  // Identity
  guestEmail?: string | null;
  // Ratings (1-5)
  overallRating: number;
  ratingWorkLifeBalance: number;
  ratingSalary: number;
  ratingPromotions: number;
  ratingJobSecurity: number;
  ratingSkillDev: number;
  ratingWorkSatisfaction: number;
  ratingCompanyCulture: number;
  // Demographic + employment
  gender?: ReviewGender | null;
  workPolicy: ReviewWorkPolicy;
  currentlyWorking: boolean;
  startedWorkingAt?: string | null; // ISO-8601 (first day of month-year)
  endedWorkingAt?: string | null;
  designation: string;
  employmentType: ReviewEmploymentType;
  department: string;
  workLocation?: string | null;
  // Body
  likes?: string | null;
  dislikes?: string | null;
  workDetails?: string | null;
}

export interface ListReviewsParams {
  page?: number;
  limit?: number;
  sort?: ReviewSort;
  chip?: ReviewChip;
  gender?: ReviewGender;
  workPolicy?: ReviewWorkPolicy;
  employmentType?: ReviewEmploymentType;
  currentlyWorking?: boolean;
  overallRatingMin?: number;
  department?: string;
  designation?: string;
  isDetailed?: boolean;
  status?: ReviewStatus | 'ALL';
}
