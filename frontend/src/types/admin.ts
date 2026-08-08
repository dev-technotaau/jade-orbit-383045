import type { Role } from './auth';
import type { CandidateProfile } from './candidate';
import type { CompanyProfile } from './employer';

export interface AdminStats {
  totalUsers: number;
  totalCandidates: number;
  totalEmployers: number;
  totalJobs: number;
  activeJobs: number;
  totalApplications: number;
  newUsersToday: number;
  newUsersThisWeek: number;
  newUsersThisMonth: number;
  pendingVerifications: number;
  // Comprehensive stats (from getComprehensiveStats)
  totalAdmins?: number;
  activeThisWeek?: number;
  expiredJobs?: number;
  newJobsThisWeek?: number;
  newJobsThisMonth?: number;
  applicationsThisWeek?: number;
  applicationConversionRate?: number;
  verificationsApproved?: number;
  verificationsRejected?: number;
  topSkills?: Array<{ skill: string; count: number }>;
  topLocations?: Array<{ location: string; count: number }>;
  registrationTrends?: Array<{ date: string; count: number }>;
}

export interface RecentActivity {
  users: Array<{
    id: string;
    email: string;
    role: Role;
    createdAt: string;
    firstName: string | null;
  }>;
  jobs: Array<{
    id: string;
    title: string;
    company: { companyName: string } | null;
    createdAt: string;
  }>;
  applications: Array<{
    id: string;
    status: string;
    job: { title: string } | null;
    candidate: { user: { email: string } } | null;
  }>;
}

export interface UserListItem {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: Role;
  isActive: boolean;
  isSuspended: boolean;
  isEmailVerified: boolean;
  mfaEnabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface UserDetail extends UserListItem {
  avatar: string | null;
  mobileNumber: string | null;
  isMobileVerified: boolean;
  whatsappNumber: string | null;
  isWhatsappVerified: boolean;
  loginAttempts: number;
  updatedAt: string;
  lastActiveAt: string | null;
  candidateProfile?: CandidateProfile; // Full candidate profile data
  companyProfile?: CompanyProfile; // Full employer profile data
  /**
   * Set when the profile EXISTS but the caller lacks
   * `users.candidates.profile.view` / `users.employers.company.view`.
   * Without these, a withheld profile looked identical to an account that
   * simply has none — the difference an operator needs to know.
   */
  candidateProfileRedacted?: boolean;
  companyProfileRedacted?: boolean;
}

export interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  performedBy: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user?: { email: string; firstName: string | null; lastName: string | null } | null;
}

export interface AuditLogFilters {
  action?: string;
  entity?: string;
  performedBy?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface AnalyticsData {
  period: string;
  registrations: number;
  jobPostings: number;
  applications: number;
}

export interface AnalyticsFilters {
  startDate?: string;
  endDate?: string;
  groupBy?: 'day' | 'week' | 'month';
}

export interface SystemConfig {
  key: string;
  value: string;
  description?: string;
}

export interface SuspendUserRequest {
  reason: string;
  duration?: number;
}

export interface UpdateUserRoleRequest {
  role: Role;
}

export interface FlagJobRequest {
  reason: string;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'CANDIDATE' | 'EMPLOYER' | 'ADMIN';
  /** E.164, optional — matches what /auth/register accepts. */
  mobileNumber?: string;
  /**
   * Initial admin access, honoured by the server only when
   * `role === 'ADMIN'`. Same contract as `adminService.createAdmin` — keys
   * are validated against the permission registry before the account row is
   * written, so a bad payload fails with nothing created.
   */
  roleIds?: string[];
  permissions?: { permissionKey: string; effect?: 'ALLOW' | 'DENY' }[];
}

export interface UpdateUserProfileRequest {
  firstName?: string;
  lastName?: string;
  email?: string;
  mobileNumber?: string | null;
  whatsappNumber?: string | null;
  isMobileVerified?: boolean;
  isWhatsappVerified?: boolean;
}

export interface AdminResetPasswordRequest {
  newPassword: string;
  otp: string;
}

export interface UserSession {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  isActive: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  deviceName?: string | null;
  browser?: string | null;
  os?: string | null;
  location?: string | null;
  lastActivityAt?: string | null;
}

export interface DailyActiveUsersData {
  date: string;
  total: number;
  candidates: number;
  employers: number;
}

export interface AdminApplication {
  id: string;
  status: string;
  appliedAt: string;
  jobTitle: string;
  companyName: string;
  candidateName: string;
  candidateEmail: string;
}

export interface ApplicationStats {
  total: number;
  byStatus: Record<string, number>;
  dailyTrend: Array<{ date: string; count: number }>;
}

export interface ExportJob {
  jobId: string;
  exportType: 'USER_DATA' | 'CANDIDATE_EXPORT' | 'RESUME_EXPORT';
  format: string | null;
  candidateCount: number;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  userRole: string | null;
  status: string;
  createdAt: string | null;
  processedAt: string | null;
  finishedAt: string | null;
  failedReason: string | null;
  attempts: number;
}

export interface JobApplication {
  id: string;
  jobId: string;
  candidateId: string;
  status: string;
  appliedAt: string;
  matchScore: number | null;
  coverLetter: string | null;
  job: {
    id: string;
    title: string;
    location: string;
    type: string;
    status: string;
    company: {
      id: string;
      companyName: string;
      logo: string | null;
      industry: string | null;
    };
  };
  candidate: {
    userId: string;
    headline?: string | null;
    user: {
      email: string;
      firstName: string | null;
      lastName: string | null;
    };
  };
}

export interface JobPost {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  _applicationCount: number;
  _savedCount: number;
  company: {
    id: string;
    companyName: string;
    logo: string | null;
    industry: string | null;
    companySize: string | null;
  };
}

export interface VerificationRequest {
  id: string;
  userId: string;
  type: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  documentUrl: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  adminComments: string | null;
}

export interface ImageVariants {
  thumbnail: string;
  small: string;
  medium: string;
  original: string;
}

export interface TrendingJob {
  id: string;
  title: string;
  location: string;
  company: { companyName: string; logo: string | null };
  viewCount: number;
}

export interface TrendingSearch {
  query: string;
  score: number;
}

export interface TrendingData {
  trendingJobs: TrendingJob[];
  trendingSearches: TrendingSearch[];
}

export interface OnlineStats {
  onlineUsers: number;
}

export interface KafkaDlqMessage {
  id: string;
  originalTopic: string;
  partition: number;
  offset: string;
  originalValue: string | null;
  error: string | null;
  stack: string | null;
  timestamp: string;
  replayed: boolean;
  replayedAt: string | null;
  createdAt: string;
}

export interface KafkaLagInfo {
  connected: boolean;
  lag: Record<string, number> | null;
  totalLag: number;
  healthy: boolean;
}

export interface HealthReadyResponse {
  status: string;
  checks: {
    database: string;
    redis: string;
    kafka: KafkaLagInfo;
  };
  timestamp: string;
}
