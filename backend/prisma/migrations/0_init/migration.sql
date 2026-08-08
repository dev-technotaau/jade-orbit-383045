-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CANDIDATE', 'EMPLOYER', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'FREELANCE');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('OPEN', 'CLOSED', 'DRAFT', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('APPLIED', 'VIEWED', 'SHORTLISTED', 'SELECTED', 'INTERVIEW_SCHEDULED', 'REJECTED', 'OFFERED', 'HIRED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "VerificationType" AS ENUM ('GST', 'EMPLOYMENT', 'IDENTITY');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REQUESTED_CHANGES');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY', 'OTHER');

-- CreateEnum
CREATE TYPE "WorkStatus" AS ENUM ('EMPLOYED', 'UNEMPLOYED', 'STUDENT', 'FREELANCER', 'ACTIVELY_LOOKING');

-- CreateEnum
CREATE TYPE "NoticePeriod" AS ENUM ('IMMEDIATE', 'FIFTEEN_DAYS', 'THIRTY_DAYS', 'SIXTY_DAYS', 'NINETY_DAYS', 'MORE_THAN_NINETY_DAYS');

-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('ON_SITE', 'REMOTE', 'HYBRID');

-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('DAY', 'NIGHT', 'ROTATIONAL', 'FLEXIBLE');

-- CreateEnum
CREATE TYPE "ExperienceLevel" AS ENUM ('FRESHER', 'ENTRY', 'MID', 'SENIOR', 'LEAD', 'EXECUTIVE');

-- CreateEnum
CREATE TYPE "SalaryType" AS ENUM ('ANNUAL', 'MONTHLY', 'HOURLY');

-- CreateEnum
CREATE TYPE "CompanyType" AS ENUM ('PRIVATE', 'PUBLIC', 'STARTUP', 'MNC', 'GOVERNMENT', 'NGO', 'SEMI_GOVERNMENT');

-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "EducationLevel" AS ENUM ('TENTH', 'TWELFTH', 'DIPLOMA', 'BACHELORS', 'MASTERS', 'PHD', 'POST_DOCTORAL');

-- CreateEnum
CREATE TYPE "EducationType" AS ENUM ('FULL_TIME', 'PART_TIME', 'DISTANCE', 'CORRESPONDENCE');

-- CreateEnum
CREATE TYPE "UrgencyLevel" AS ENUM ('NORMAL', 'URGENT', 'IMMEDIATE');

-- CreateEnum
CREATE TYPE "DisabilityType" AS ENUM ('NONE', 'VISUAL', 'HEARING', 'LOCOMOTOR', 'INTELLECTUAL', 'MULTIPLE', 'OTHER');

-- CreateEnum
CREATE TYPE "CareerBreakType" AS ENUM ('HEALTH', 'FAMILY', 'HIGHER_EDUCATION', 'TRAVEL', 'LAYOFF', 'PERSONAL', 'CAREGIVING', 'CAREER_TRANSITION', 'OTHER');

-- CreateEnum
CREATE TYPE "ReservationCategory" AS ENUM ('GENERAL', 'SC', 'ST', 'OBC', 'EWS', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "NoticePeriodPreference" AS ENUM ('IMMEDIATE', 'FIFTEEN_DAYS', 'ONE_MONTH', 'TWO_MONTHS', 'THREE_MONTHS', 'NEGOTIABLE');

-- CreateEnum
CREATE TYPE "FunctionalArea" AS ENUM ('IT_SOFTWARE', 'IT_HARDWARE', 'SALES', 'MARKETING', 'HR', 'FINANCE', 'ITES_BPO', 'ENGINEERING', 'PRODUCTION', 'PHARMA', 'BANKING', 'LEGAL', 'MEDIA', 'HOSPITALITY', 'RETAIL', 'LOGISTICS', 'EDUCATION', 'HEALTHCARE', 'REAL_ESTATE', 'OTHER');

-- CreateEnum
CREATE TYPE "SpecificDegree" AS ENUM ('BTECH_BE', 'BCA', 'BSC', 'BCOM', 'BA', 'BBA', 'MBBS', 'LLB', 'BARCH', 'BDES', 'BPHARM', 'DIPLOMA_ENGINEERING', 'MCA', 'MSC', 'MCOM', 'MA', 'MBA_PGDM', 'MTECH_ME', 'MS', 'LLM', 'MD', 'CA', 'CS', 'ICWA', 'PHD', 'ANY_GRADUATE', 'ANY_POSTGRADUATE');

-- CreateEnum
CREATE TYPE "GenderPreference" AS ENUM ('ANY', 'MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "DrivingLicenseType" AS ENUM ('NONE', 'TWO_WHEELER', 'FOUR_WHEELER', 'BOTH', 'HEAVY_VEHICLE');

-- CreateEnum
CREATE TYPE "PostingVisibility" AS ENUM ('PUBLIC', 'INTERNAL', 'BOTH');

-- CreateEnum
CREATE TYPE "ApplyMethod" AS ENUM ('IN_PLATFORM', 'EXTERNAL_URL', 'EMAIL', 'WALK_IN');

-- CreateEnum
CREATE TYPE "ScreeningQuestionType" AS ENUM ('TEXT', 'YES_NO', 'MULTIPLE_CHOICE', 'NUMERIC');

-- CreateEnum
CREATE TYPE "OpenToWorkStatus" AS ENUM ('ACTIVELY_LOOKING', 'OPEN_TO_OFFERS', 'NOT_LOOKING');

-- CreateEnum
CREATE TYPE "PatentStatus" AS ENUM ('FILED', 'PUBLISHED', 'GRANTED');

-- CreateEnum
CREATE TYPE "FundingStage" AS ENUM ('BOOTSTRAPPED', 'SEED', 'SERIES_A', 'SERIES_B', 'SERIES_C', 'SERIES_D_PLUS', 'PRE_IPO', 'PUBLIC', 'ACQUIRED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "LanguageProficiency" AS ENUM ('BASIC', 'INTERMEDIATE', 'FLUENT', 'NATIVE');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "FormDraftType" AS ENUM ('CANDIDATE_PROFILE', 'JOB_SEARCH_PREFERENCES', 'CANDIDATE_SEARCH', 'JOB_POSTING', 'EMPLOYER_PROFILE');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'AWAITING_REPLY', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('GENERAL', 'ACCOUNT', 'BILLING', 'TECHNICAL', 'BUG_REPORT', 'FEATURE_REQUEST', 'JOB_POSTING', 'APPLICATION', 'VERIFICATION', 'OTHER');

-- CreateEnum
CREATE TYPE "TicketSatisfaction" AS ENUM ('SATISFIED', 'NEUTRAL', 'NOT_SATISFIED');

-- CreateEnum
CREATE TYPE "AlertFrequency" AS ENUM ('INSTANT', 'DAILY', 'WEEKLY', 'OFF');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "role" "Role" NOT NULL DEFAULT 'CANDIDATE',
    "firstName" TEXT,
    "lastName" TEXT,
    "avatar" TEXT,
    "googleId" TEXT,
    "linkedinId" TEXT,
    "mobileNumber" TEXT,
    "isMobileVerified" BOOLEAN NOT NULL DEFAULT false,
    "mobileVerificationToken" TEXT,
    "mobileVerificationExpires" TIMESTAMP(3),
    "isWhatsappVerified" BOOLEAN NOT NULL DEFAULT false,
    "whatsappNumber" TEXT,
    "whatsappVerificationToken" TEXT,
    "whatsappVerificationExpires" TIMESTAMP(3),
    "emailOtpResendCount" INTEGER NOT NULL DEFAULT 0,
    "emailOtpLastSentAt" TIMESTAMP(3),
    "mobileOtpResendCount" INTEGER NOT NULL DEFAULT 0,
    "mobileOtpLastSentAt" TIMESTAMP(3),
    "whatsappOtpResendCount" INTEGER NOT NULL DEFAULT 0,
    "whatsappOtpLastSentAt" TIMESTAMP(3),
    "pendingEmail" TEXT,
    "pendingMobileNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSuspended" BOOLEAN NOT NULL DEFAULT false,
    "suspendedAt" TIMESTAMP(3),
    "suspendedBy" TEXT,
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerificationToken" TEXT,
    "emailVerificationExpires" TIMESTAMP(3),
    "passwordResetToken" TEXT,
    "passwordResetExpires" TIMESTAMP(3),
    "mfaSecret" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaBackupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "loginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "lastActiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletionRequestedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ipAddress" TEXT,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "performedBy" TEXT,
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "checksum" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "headline" TEXT,
    "pronouns" TEXT,
    "gender" "Gender",
    "dob" TIMESTAMP(3),
    "maritalStatus" "MaritalStatus",
    "nationality" TEXT DEFAULT 'Indian',
    "hometown" TEXT,
    "category" "ReservationCategory",
    "bio" TEXT,
    "resume" TEXT,
    "resumeOriginalName" TEXT,
    "resumeSize" INTEGER,
    "resumeMimeType" TEXT,
    "resumeUploadedAt" TIMESTAMP(3),
    "additionalResumes" JSONB,
    "generatedResumeUrl" TEXT,
    "generatedResumeAt" TIMESTAMP(3),
    "videoResumeUrl" TEXT,
    "profileImage" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "country" TEXT DEFAULT 'India',
    "currentLocation" TEXT,
    "preferredLocations" TEXT[],
    "phone" TEXT,
    "alternatePhone" TEXT,
    "alternateEmail" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "experienceYears" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalExperienceMonths" INTEGER,
    "experienceLevel" "ExperienceLevel",
    "currentCompany" TEXT,
    "currentRole" TEXT,
    "currentIndustry" TEXT,
    "currentDepartment" TEXT,
    "functionalArea" TEXT,
    "currSalary" DECIMAL(12,2),
    "expectedSalaryMin" DECIMAL(12,2),
    "expectedSalaryMax" DECIMAL(12,2),
    "salaryCurrency" TEXT NOT NULL DEFAULT 'INR',
    "noticePeriod" "NoticePeriod",
    "servingNoticePeriod" BOOLEAN NOT NULL DEFAULT false,
    "workStatus" "WorkStatus" DEFAULT 'ACTIVELY_LOOKING',
    "hasCareerBreak" BOOLEAN NOT NULL DEFAULT false,
    "careerBreakType" "CareerBreakType",
    "careerBreakReason" TEXT,
    "openToWork" "OpenToWorkStatus",
    "preferredJobType" "JobType"[] DEFAULT ARRAY[]::"JobType"[],
    "preferredWorkMode" "WorkMode"[] DEFAULT ARRAY[]::"WorkMode"[],
    "preferredShift" "ShiftType",
    "preferredIndustries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredRoleCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dateOfAvailability" TIMESTAMP(3),
    "willingToRelocate" BOOLEAN DEFAULT false,
    "travelWillingnessPercent" INTEGER DEFAULT 0,
    "highestEducationLevel" "EducationLevel",
    "highestDegree" "SpecificDegree",
    "visaStatus" TEXT,
    "workPermitStatus" TEXT,
    "passportNumber" TEXT,
    "passportExpiryDate" TIMESTAMP(3),
    "hasDrivingLicense" BOOLEAN NOT NULL DEFAULT false,
    "drivingLicenseType" "DrivingLicenseType" DEFAULT 'NONE',
    "ownVehicle" BOOLEAN NOT NULL DEFAULT false,
    "isVeteran" BOOLEAN NOT NULL DEFAULT false,
    "blockedCompanies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "skills" TEXT[],
    "languages" TEXT[],
    "itSkills" JSONB,
    "education" JSONB,
    "experience" JSONB,
    "certifications" JSONB,
    "projects" JSONB,
    "publications" JSONB,
    "patents" JSONB,
    "awards" JSONB,
    "volunteerExperience" JSONB,
    "professionalMemberships" JSONB,
    "courses" JSONB,
    "testScores" JSONB,
    "references" JSONB,
    "languageProficiency" JSONB,
    "skillsWithProficiency" JSONB,
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hobbies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isPhysicallyChallenged" BOOLEAN NOT NULL DEFAULT false,
    "disabilityType" "DisabilityType" DEFAULT 'NONE',
    "disabilityPercentage" INTEGER,
    "githubProfile" TEXT,
    "linkedinProfile" TEXT,
    "portfolioUrl" TEXT,
    "stackOverflowProfile" TEXT,
    "twitterProfile" TEXT,
    "personalBlogUrl" TEXT,
    "dribbbleProfile" TEXT,
    "behanceProfile" TEXT,
    "mediumProfile" TEXT,
    "youtubeChannel" TEXT,
    "parsedResumeData" JSONB,
    "notificationPreferences" JSONB,
    "profileCompleteness" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "companyType" "CompanyType",
    "tagline" TEXT,
    "logo" TEXT,
    "coverImage" TEXT,
    "companyVideoUrl" TEXT,
    "industry" TEXT,
    "subIndustry" TEXT,
    "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "companySize" TEXT,
    "employeeCount" INTEGER,
    "numberOfOffices" INTEGER,
    "description" TEXT,
    "whyWorkForUs" TEXT,
    "website" TEXT,
    "careersPageUrl" TEXT,
    "blogUrl" TEXT,
    "foundedYear" INTEGER,
    "parentCompany" TEXT,
    "stockTicker" TEXT,
    "gstNumber" TEXT,
    "cinNumber" TEXT,
    "panNumber" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "annualRevenueRange" TEXT,
    "fundingStage" "FundingStage",
    "totalFundingRaised" TEXT,
    "investors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "productsServices" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "techStack" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "companyCulture" TEXT,
    "missionStatement" TEXT,
    "visionStatement" TEXT,
    "coreValues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "diversityStatement" TEXT,
    "employeeResourceGroups" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "csrInitiatives" TEXT,
    "benefits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "structuredPerks" JSONB,
    "workplacePolicies" JSONB,
    "interviewProcess" TEXT,
    "awardsRecognitions" JSONB,
    "leadershipTeam" JSONB,
    "employeeTestimonials" JSONB,
    "officePhotos" JSONB,
    "socialLinks" JSONB,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "contactPersonName" TEXT,
    "contactPersonDesignation" TEXT,
    "notificationPreferences" JSONB,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "country" TEXT DEFAULT 'India',
    "headquarters" TEXT,
    "locations" TEXT[],
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobPost" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "keyResponsibilities" TEXT,
    "requirements" TEXT,
    "benefits" TEXT,
    "type" "JobType" NOT NULL DEFAULT 'FULL_TIME',
    "status" "JobStatus" NOT NULL DEFAULT 'OPEN',
    "workMode" "WorkMode" DEFAULT 'ON_SITE',
    "shiftType" "ShiftType",
    "industry" TEXT,
    "department" TEXT,
    "roleCategory" TEXT,
    "functionalArea" "FunctionalArea",
    "experienceMin" INTEGER NOT NULL DEFAULT 0,
    "experienceMax" INTEGER,
    "experienceLevel" "ExperienceLevel",
    "educationRequired" "EducationLevel",
    "preferredEducationField" TEXT,
    "ugRequired" "EducationLevel",
    "pgRequired" "EducationLevel",
    "specificDegrees" "SpecificDegree"[] DEFAULT ARRAY[]::"SpecificDegree"[],
    "degreeSpecializations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "location" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isRemote" BOOLEAN NOT NULL DEFAULT false,
    "salaryMin" DECIMAL(12,2),
    "salaryMax" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "salaryType" "SalaryType" DEFAULT 'ANNUAL',
    "salaryDisclosed" BOOLEAN NOT NULL DEFAULT true,
    "salaryNegotiable" BOOLEAN NOT NULL DEFAULT false,
    "skillsRequired" TEXT[],
    "niceToHaveSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "certificationsRequired" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "languagesRequired" JSONB,
    "noticePeriodPreference" "NoticePeriodPreference"[] DEFAULT ARRAY[]::"NoticePeriodPreference"[],
    "numberOfOpenings" INTEGER DEFAULT 1,
    "urgencyLevel" "UrgencyLevel" DEFAULT 'NORMAL',
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "isConfidential" BOOLEAN NOT NULL DEFAULT false,
    "referenceCode" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "jobPerks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "travelRequirementPercent" INTEGER DEFAULT 0,
    "relocationAssistance" BOOLEAN NOT NULL DEFAULT false,
    "additionalLocations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accommodationProvided" BOOLEAN NOT NULL DEFAULT false,
    "applicationDeadline" TIMESTAMP(3),
    "interviewProcess" TEXT,
    "isWalkIn" BOOLEAN NOT NULL DEFAULT false,
    "walkInDetails" JSONB,
    "contactPerson" TEXT,
    "contactEmail" TEXT,
    "walkInStartDate" TIMESTAMP(3),
    "walkInEndDate" TIMESTAMP(3),
    "walkInTime" TEXT,
    "walkInVenue" TEXT,
    "walkInContactPerson" TEXT,
    "walkInContactPhone" TEXT,
    "walkInInstructions" TEXT,
    "diversityTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visaSponsorshipAvailable" BOOLEAN NOT NULL DEFAULT false,
    "backgroundCheckRequired" BOOLEAN NOT NULL DEFAULT false,
    "isPwdFriendly" BOOLEAN NOT NULL DEFAULT false,
    "passportRequired" BOOLEAN NOT NULL DEFAULT false,
    "bondDetails" TEXT,
    "drivingLicenseRequired" "DrivingLicenseType",
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "genderPreference" "GenderPreference" DEFAULT 'ANY',
    "postingVisibility" "PostingVisibility" NOT NULL DEFAULT 'PUBLIC',
    "applyMethod" "ApplyMethod" NOT NULL DEFAULT 'IN_PLATFORM',
    "externalApplyUrl" TEXT,
    "scheduledPublishAt" TIMESTAMP(3),
    "views" INTEGER NOT NULL DEFAULT 0,
    "closedReason" TEXT,
    "closedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobApplication" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "coverLetter" TEXT,
    "resumeSnapshot" TEXT,
    "matchScore" DOUBLE PRECISION,
    "source" TEXT,
    "candidateNotes" TEXT,
    "interviewDate" TIMESTAMP(3),
    "interviewNotes" TEXT,
    "interviewFeedback" JSONB,
    "rejectionReason" TEXT,
    "viewedAt" TIMESTAMP(3),
    "selectedAt" TIMESTAMP(3),
    "offerDetails" JSONB,
    "offeredAt" TIMESTAMP(3),
    "hiredAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreeningQuestion" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "questionType" "ScreeningQuestionType" NOT NULL DEFAULT 'TEXT',
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isDealBreaker" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "idealAnswer" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScreeningQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreeningAnswer" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScreeningAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "templateData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "VerificationType" NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "documentUrl" TEXT,
    "data" JSONB,
    "reviewedBy" TEXT,
    "adminComments" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "escalatedBy" TEXT,
    "escalationReason" TEXT,
    "priority" TEXT DEFAULT 'NORMAL',
    "slaDeadline" TIMESTAMP(3),
    "approvalChain" JSONB,
    "currentApprovalLevel" INTEGER DEFAULT 1,
    "autoEscalated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedCandidate" (
    "id" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "notes" TEXT,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateList" (
    "id" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT DEFAULT '#6366F1',
    "icon" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateListMember" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "addedByUserId" TEXT NOT NULL,

    CONSTRAINT "CandidateListMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedSearch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "searchType" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileView" (
    "id" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "profileUserId" TEXT NOT NULL,
    "viewType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'INFO',
    "category" TEXT,
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "formType" "FormDraftType" NOT NULL,
    "data" JSONB NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT,
    "deviceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobCandidateMatch" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "matchScore" DOUBLE PRECISION,
    "notificationsSent" BOOLEAN NOT NULL DEFAULT false,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "smsSent" BOOLEAN NOT NULL DEFAULT false,
    "pushSent" BOOLEAN NOT NULL DEFAULT false,
    "whatsappSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "JobCandidateMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebAuthnCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[],
    "deviceType" TEXT,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "friendlyName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebAuthnCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "statusCode" INTEGER,
    "response" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "repliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "category" "TicketCategory" NOT NULL DEFAULT 'GENERAL',
    "userId" TEXT,
    "guestName" TEXT,
    "guestEmail" TEXT,
    "assignedToId" TEXT,
    "satisfaction" "TicketSatisfaction",
    "satisfactionComment" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "firstResponseAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "senderId" TEXT,
    "senderType" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnownDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "name" TEXT,
    "ipAddress" TEXT,
    "location" TEXT,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnownDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginLocation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "country" TEXT,
    "city" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isTrusted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "givenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "ipAddress" TEXT,

    CONSTRAINT "UserConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MfaTrustedDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaTrustedDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "frequency" "AlertFrequency" NOT NULL DEFAULT 'DAILY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastNotifiedAt" TIMESTAMP(3),
    "newMatchCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DismissedRecommendation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DismissedRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "User_linkedinId_key" ON "User"("linkedinId");

-- CreateIndex
CREATE UNIQUE INDEX "User_mobileNumber_key" ON "User"("mobileNumber");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_emailVerificationToken_idx" ON "User"("emailVerificationToken");

-- CreateIndex
CREATE INDEX "User_passwordResetToken_idx" ON "User"("passwordResetToken");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_token_idx" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_isActive_idx" ON "Session"("isActive");

-- CreateIndex
CREATE INDEX "Session_userId_isActive_idx" ON "Session"("userId", "isActive");

-- CreateIndex
CREATE INDEX "AuditLog_performedBy_idx" ON "AuditLog"("performedBy");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_entity_idx" ON "AuditLog"("entity");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateProfile_userId_key" ON "CandidateProfile"("userId");

-- CreateIndex
CREATE INDEX "CandidateProfile_userId_idx" ON "CandidateProfile"("userId");

-- CreateIndex
CREATE INDEX "CandidateProfile_currentLocation_idx" ON "CandidateProfile"("currentLocation");

-- CreateIndex
CREATE INDEX "CandidateProfile_experienceYears_idx" ON "CandidateProfile"("experienceYears");

-- CreateIndex
CREATE INDEX "CandidateProfile_workStatus_idx" ON "CandidateProfile"("workStatus");

-- CreateIndex
CREATE INDEX "CandidateProfile_noticePeriod_idx" ON "CandidateProfile"("noticePeriod");

-- CreateIndex
CREATE INDEX "CandidateProfile_currentIndustry_idx" ON "CandidateProfile"("currentIndustry");

-- CreateIndex
CREATE INDEX "CandidateProfile_willingToRelocate_idx" ON "CandidateProfile"("willingToRelocate");

-- CreateIndex
CREATE INDEX "CandidateProfile_openToWork_idx" ON "CandidateProfile"("openToWork");

-- CreateIndex
CREATE INDEX "CandidateProfile_city_state_idx" ON "CandidateProfile"("city", "state");

-- CreateIndex
CREATE INDEX "CandidateProfile_latitude_longitude_idx" ON "CandidateProfile"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "CandidateProfile_workStatus_noticePeriod_experienceYears_idx" ON "CandidateProfile"("workStatus", "noticePeriod", "experienceYears");

-- CreateIndex
CREATE INDEX "CandidateProfile_experienceLevel_idx" ON "CandidateProfile"("experienceLevel");

-- CreateIndex
CREATE INDEX "CandidateProfile_highestEducationLevel_idx" ON "CandidateProfile"("highestEducationLevel");

-- CreateIndex
CREATE INDEX "CandidateProfile_functionalArea_idx" ON "CandidateProfile"("functionalArea");

-- CreateIndex
CREATE INDEX "CandidateProfile_profileCompleteness_idx" ON "CandidateProfile"("profileCompleteness");

-- CreateIndex
CREATE INDEX "CandidateProfile_highestDegree_idx" ON "CandidateProfile"("highestDegree");

-- CreateIndex
CREATE INDEX "CandidateProfile_drivingLicenseType_idx" ON "CandidateProfile"("drivingLicenseType");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyProfile_userId_key" ON "CompanyProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyProfile_gstNumber_key" ON "CompanyProfile"("gstNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyProfile_cinNumber_key" ON "CompanyProfile"("cinNumber");

-- CreateIndex
CREATE INDEX "CompanyProfile_userId_idx" ON "CompanyProfile"("userId");

-- CreateIndex
CREATE INDEX "CompanyProfile_companyName_idx" ON "CompanyProfile"("companyName");

-- CreateIndex
CREATE INDEX "CompanyProfile_companyType_idx" ON "CompanyProfile"("companyType");

-- CreateIndex
CREATE INDEX "CompanyProfile_industry_idx" ON "CompanyProfile"("industry");

-- CreateIndex
CREATE INDEX "CompanyProfile_fundingStage_idx" ON "CompanyProfile"("fundingStage");

-- CreateIndex
CREATE INDEX "CompanyProfile_city_state_idx" ON "CompanyProfile"("city", "state");

-- CreateIndex
CREATE INDEX "CompanyProfile_latitude_longitude_idx" ON "CompanyProfile"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "JobPost_companyId_idx" ON "JobPost"("companyId");

-- CreateIndex
CREATE INDEX "JobPost_status_idx" ON "JobPost"("status");

-- CreateIndex
CREATE INDEX "JobPost_title_idx" ON "JobPost"("title");

-- CreateIndex
CREATE INDEX "JobPost_location_idx" ON "JobPost"("location");

-- CreateIndex
CREATE INDEX "JobPost_companyId_status_idx" ON "JobPost"("companyId", "status");

-- CreateIndex
CREATE INDEX "JobPost_companyId_createdAt_idx" ON "JobPost"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "JobPost_status_createdAt_idx" ON "JobPost"("status", "createdAt");

-- CreateIndex
CREATE INDEX "JobPost_industry_idx" ON "JobPost"("industry");

-- CreateIndex
CREATE INDEX "JobPost_expiresAt_idx" ON "JobPost"("expiresAt");

-- CreateIndex
CREATE INDEX "JobPost_workMode_idx" ON "JobPost"("workMode");

-- CreateIndex
CREATE INDEX "JobPost_shiftType_idx" ON "JobPost"("shiftType");

-- CreateIndex
CREATE INDEX "JobPost_experienceLevel_idx" ON "JobPost"("experienceLevel");

-- CreateIndex
CREATE INDEX "JobPost_educationRequired_idx" ON "JobPost"("educationRequired");

-- CreateIndex
CREATE INDEX "JobPost_urgencyLevel_idx" ON "JobPost"("urgencyLevel");

-- CreateIndex
CREATE INDEX "JobPost_isFeatured_idx" ON "JobPost"("isFeatured");

-- CreateIndex
CREATE INDEX "JobPost_applicationDeadline_idx" ON "JobPost"("applicationDeadline");

-- CreateIndex
CREATE INDEX "JobPost_status_workMode_idx" ON "JobPost"("status", "workMode");

-- CreateIndex
CREATE INDEX "JobPost_status_experienceLevel_idx" ON "JobPost"("status", "experienceLevel");

-- CreateIndex
CREATE INDEX "JobPost_status_expiresAt_idx" ON "JobPost"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "JobPost_latitude_longitude_idx" ON "JobPost"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "JobPost_functionalArea_idx" ON "JobPost"("functionalArea");

-- CreateIndex
CREATE INDEX "JobPost_postingVisibility_idx" ON "JobPost"("postingVisibility");

-- CreateIndex
CREATE INDEX "JobPost_scheduledPublishAt_idx" ON "JobPost"("scheduledPublishAt");

-- CreateIndex
CREATE INDEX "JobPost_isConfidential_idx" ON "JobPost"("isConfidential");

-- CreateIndex
CREATE INDEX "JobPost_referenceCode_idx" ON "JobPost"("referenceCode");

-- CreateIndex
CREATE INDEX "JobPost_type_idx" ON "JobPost"("type");

-- CreateIndex
CREATE INDEX "JobPost_status_type_idx" ON "JobPost"("status", "type");

-- CreateIndex
CREATE INDEX "JobApplication_jobId_idx" ON "JobApplication"("jobId");

-- CreateIndex
CREATE INDEX "JobApplication_candidateId_idx" ON "JobApplication"("candidateId");

-- CreateIndex
CREATE INDEX "JobApplication_status_idx" ON "JobApplication"("status");

-- CreateIndex
CREATE INDEX "JobApplication_jobId_status_idx" ON "JobApplication"("jobId", "status");

-- CreateIndex
CREATE INDEX "JobApplication_candidateId_status_idx" ON "JobApplication"("candidateId", "status");

-- CreateIndex
CREATE INDEX "JobApplication_source_idx" ON "JobApplication"("source");

-- CreateIndex
CREATE INDEX "JobApplication_offeredAt_idx" ON "JobApplication"("offeredAt");

-- CreateIndex
CREATE INDEX "JobApplication_hiredAt_idx" ON "JobApplication"("hiredAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobApplication_jobId_candidateId_key" ON "JobApplication"("jobId", "candidateId");

-- CreateIndex
CREATE INDEX "ScreeningQuestion_jobId_idx" ON "ScreeningQuestion"("jobId");

-- CreateIndex
CREATE INDEX "ScreeningQuestion_jobId_displayOrder_idx" ON "ScreeningQuestion"("jobId", "displayOrder");

-- CreateIndex
CREATE INDEX "ScreeningAnswer_applicationId_idx" ON "ScreeningAnswer"("applicationId");

-- CreateIndex
CREATE INDEX "ScreeningAnswer_questionId_idx" ON "ScreeningAnswer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "ScreeningAnswer_applicationId_questionId_key" ON "ScreeningAnswer"("applicationId", "questionId");

-- CreateIndex
CREATE INDEX "JobTemplate_companyId_idx" ON "JobTemplate"("companyId");

-- CreateIndex
CREATE INDEX "JobTemplate_companyId_name_idx" ON "JobTemplate"("companyId", "name");

-- CreateIndex
CREATE INDEX "VerificationRequest_userId_idx" ON "VerificationRequest"("userId");

-- CreateIndex
CREATE INDEX "VerificationRequest_status_idx" ON "VerificationRequest"("status");

-- CreateIndex
CREATE INDEX "VerificationRequest_type_idx" ON "VerificationRequest"("type");

-- CreateIndex
CREATE INDEX "VerificationRequest_type_status_idx" ON "VerificationRequest"("type", "status");

-- CreateIndex
CREATE INDEX "VerificationRequest_priority_idx" ON "VerificationRequest"("priority");

-- CreateIndex
CREATE INDEX "SavedJob_userId_idx" ON "SavedJob"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedJob_userId_jobId_key" ON "SavedJob"("userId", "jobId");

-- CreateIndex
CREATE INDEX "SavedCandidate_employerId_idx" ON "SavedCandidate"("employerId");

-- CreateIndex
CREATE INDEX "SavedCandidate_candidateId_idx" ON "SavedCandidate"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedCandidate_employerId_candidateId_key" ON "SavedCandidate"("employerId", "candidateId");

-- CreateIndex
CREATE INDEX "CandidateList_employerId_idx" ON "CandidateList"("employerId");

-- CreateIndex
CREATE INDEX "CandidateListMember_listId_idx" ON "CandidateListMember"("listId");

-- CreateIndex
CREATE INDEX "CandidateListMember_candidateId_idx" ON "CandidateListMember"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateListMember_listId_candidateId_key" ON "CandidateListMember"("listId", "candidateId");

-- CreateIndex
CREATE INDEX "SavedSearch_userId_searchType_idx" ON "SavedSearch"("userId", "searchType");

-- CreateIndex
CREATE INDEX "ProfileView_profileUserId_createdAt_idx" ON "ProfileView"("profileUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ProfileView_viewerId_idx" ON "ProfileView"("viewerId");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "FormDraft_userId_formType_idx" ON "FormDraft"("userId", "formType");

-- CreateIndex
CREATE UNIQUE INDEX "FormDraft_userId_formType_name_key" ON "FormDraft"("userId", "formType", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");

-- CreateIndex
CREATE INDEX "DeviceToken_userId_idx" ON "DeviceToken"("userId");

-- CreateIndex
CREATE INDEX "JobCandidateMatch_jobId_idx" ON "JobCandidateMatch"("jobId");

-- CreateIndex
CREATE INDEX "JobCandidateMatch_candidateId_idx" ON "JobCandidateMatch"("candidateId");

-- CreateIndex
CREATE INDEX "JobCandidateMatch_notificationsSent_idx" ON "JobCandidateMatch"("notificationsSent");

-- CreateIndex
CREATE INDEX "JobCandidateMatch_createdAt_idx" ON "JobCandidateMatch"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobCandidateMatch_jobId_candidateId_key" ON "JobCandidateMatch"("jobId", "candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfig_key_key" ON "SystemConfig"("key");

-- CreateIndex
CREATE UNIQUE INDEX "WebAuthnCredential_credentialId_key" ON "WebAuthnCredential"("credentialId");

-- CreateIndex
CREATE INDEX "WebAuthnCredential_userId_idx" ON "WebAuthnCredential"("userId");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_userId_idx" ON "WebhookEndpoint"("userId");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_isActive_idx" ON "WebhookEndpoint"("isActive");

-- CreateIndex
CREATE INDEX "WebhookDelivery_webhookId_idx" ON "WebhookDelivery"("webhookId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_createdAt_idx" ON "WebhookDelivery"("createdAt");

-- CreateIndex
CREATE INDEX "ContactMessage_isRead_idx" ON "ContactMessage"("isRead");

-- CreateIndex
CREATE INDEX "ContactMessage_createdAt_idx" ON "ContactMessage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_ticketNumber_key" ON "SupportTicket"("ticketNumber");

-- CreateIndex
CREATE INDEX "SupportTicket_userId_idx" ON "SupportTicket"("userId");

-- CreateIndex
CREATE INDEX "SupportTicket_assignedToId_idx" ON "SupportTicket"("assignedToId");

-- CreateIndex
CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");

-- CreateIndex
CREATE INDEX "SupportTicket_ticketNumber_idx" ON "SupportTicket"("ticketNumber");

-- CreateIndex
CREATE INDEX "SupportTicket_createdAt_idx" ON "SupportTicket"("createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_category_idx" ON "SupportTicket"("category");

-- CreateIndex
CREATE INDEX "TicketMessage_ticketId_createdAt_idx" ON "TicketMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "KnownDevice_userId_idx" ON "KnownDevice"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "KnownDevice_userId_fingerprint_key" ON "KnownDevice"("userId", "fingerprint");

-- CreateIndex
CREATE INDEX "LoginLocation_userId_idx" ON "LoginLocation"("userId");

-- CreateIndex
CREATE INDEX "LoginLocation_createdAt_idx" ON "LoginLocation"("createdAt");

-- CreateIndex
CREATE INDEX "UserConsent_userId_idx" ON "UserConsent"("userId");

-- CreateIndex
CREATE INDEX "UserConsent_type_idx" ON "UserConsent"("type");

-- CreateIndex
CREATE UNIQUE INDEX "MfaTrustedDevice_tokenHash_key" ON "MfaTrustedDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "MfaTrustedDevice_userId_idx" ON "MfaTrustedDevice"("userId");

-- CreateIndex
CREATE INDEX "MfaTrustedDevice_expiresAt_idx" ON "MfaTrustedDevice"("expiresAt");

-- CreateIndex
CREATE INDEX "JobAlert_userId_isActive_idx" ON "JobAlert"("userId", "isActive");

-- CreateIndex
CREATE INDEX "JobAlert_isActive_frequency_idx" ON "JobAlert"("isActive", "frequency");

-- CreateIndex
CREATE INDEX "DismissedRecommendation_userId_idx" ON "DismissedRecommendation"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DismissedRecommendation_userId_jobId_key" ON "DismissedRecommendation"("userId", "jobId");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateProfile" ADD CONSTRAINT "CandidateProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyProfile" ADD CONSTRAINT "CompanyProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPost" ADD CONSTRAINT "JobPost_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "JobPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreeningQuestion" ADD CONSTRAINT "ScreeningQuestion_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "JobPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreeningAnswer" ADD CONSTRAINT "ScreeningAnswer_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreeningAnswer" ADD CONSTRAINT "ScreeningAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ScreeningQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTemplate" ADD CONSTRAINT "JobTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "JobPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedCandidate" ADD CONSTRAINT "SavedCandidate_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedCandidate" ADD CONSTRAINT "SavedCandidate_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateList" ADD CONSTRAINT "CandidateList_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateListMember" ADD CONSTRAINT "CandidateListMember_listId_fkey" FOREIGN KEY ("listId") REFERENCES "CandidateList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateListMember" ADD CONSTRAINT "CandidateListMember_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateListMember" ADD CONSTRAINT "CandidateListMember_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedSearch" ADD CONSTRAINT "SavedSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileView" ADD CONSTRAINT "ProfileView_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileView" ADD CONSTRAINT "ProfileView_profileUserId_fkey" FOREIGN KEY ("profileUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormDraft" ADD CONSTRAINT "FormDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCandidateMatch" ADD CONSTRAINT "JobCandidateMatch_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "JobPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCandidateMatch" ADD CONSTRAINT "JobCandidateMatch_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebAuthnCredential" ADD CONSTRAINT "WebAuthnCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnownDevice" ADD CONSTRAINT "KnownDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoginLocation" ADD CONSTRAINT "LoginLocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserConsent" ADD CONSTRAINT "UserConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MfaTrustedDevice" ADD CONSTRAINT "MfaTrustedDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAlert" ADD CONSTRAINT "JobAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DismissedRecommendation" ADD CONSTRAINT "DismissedRecommendation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DismissedRecommendation" ADD CONSTRAINT "DismissedRecommendation_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "JobPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

