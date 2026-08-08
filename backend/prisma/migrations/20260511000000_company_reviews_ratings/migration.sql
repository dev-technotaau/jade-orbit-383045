-- Migration: Company Ratings + Reviews System
-- Adds 4 new tables (CompanyReview, CompanyReviewVote, CompanyReviewReport,
-- CompanyReviewAggregate) and 4 new enums. Fully additive — no existing
-- table or column is modified.

-- ── Enums ─────────────────────────────────────────────────────────────
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'FLAGGED', 'REJECTED', 'DELETED');

CREATE TYPE "ReviewEmploymentType" AS ENUM (
  'PERMANENT', 'INTERNSHIP', 'CONTRACT', 'TEMPORARY', 'FREELANCE', 'PART_TIME', 'TRAINEE'
);

CREATE TYPE "ReviewWorkPolicy" AS ENUM ('PERMANENT_WFH', 'WORKING_FROM_OFFICE', 'HYBRID');

CREATE TYPE "ReviewGender" AS ENUM ('FEMALE', 'MALE', 'TRANSGENDER', 'PREFER_NOT_TO_SAY');

-- ── CompanyReview ─────────────────────────────────────────────────────
CREATE TABLE "CompanyReview" (
  "id"                     TEXT NOT NULL,
  "companyId"              TEXT NOT NULL,
  "userId"                 TEXT,
  "guestEmail"             TEXT,
  "fingerprintHash"        TEXT NOT NULL,

  "overallRating"          INTEGER NOT NULL,
  "ratingWorkLifeBalance"  INTEGER NOT NULL,
  "ratingSalary"           INTEGER NOT NULL,
  "ratingPromotions"       INTEGER NOT NULL,
  "ratingJobSecurity"      INTEGER NOT NULL,
  "ratingSkillDev"         INTEGER NOT NULL,
  "ratingWorkSatisfaction" INTEGER NOT NULL,
  "ratingCompanyCulture"   INTEGER NOT NULL,

  "gender"                 "ReviewGender",
  "workPolicy"             "ReviewWorkPolicy" NOT NULL,
  "currentlyWorking"       BOOLEAN NOT NULL,
  "startedWorkingAt"       TIMESTAMP(3),
  "endedWorkingAt"         TIMESTAMP(3),
  "designation"            TEXT NOT NULL,
  "employmentType"         "ReviewEmploymentType" NOT NULL,
  "department"             TEXT NOT NULL,
  "workLocation"           TEXT,

  "likes"                  TEXT,
  "dislikes"               TEXT,
  "workDetails"            TEXT,
  "isDetailed"             BOOLEAN NOT NULL DEFAULT false,

  "status"                 "ReviewStatus" NOT NULL DEFAULT 'APPROVED',
  "moderationReason"       TEXT,
  "moderatedBy"            TEXT,
  "moderatedAt"            TIMESTAMP(3),
  "reportedCount"          INTEGER NOT NULL DEFAULT 0,

  "helpfulCount"           INTEGER NOT NULL DEFAULT 0,
  "notHelpfulCount"        INTEGER NOT NULL DEFAULT 0,

  "ipAddress"              TEXT,
  "userAgent"              TEXT,

  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CompanyReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_review_user_company"
  ON "CompanyReview"("userId", "companyId")
  WHERE "userId" IS NOT NULL;

CREATE UNIQUE INDEX "uq_review_fp_company"
  ON "CompanyReview"("fingerprintHash", "companyId");

CREATE INDEX "CompanyReview_companyId_status_createdAt_idx"
  ON "CompanyReview"("companyId", "status", "createdAt");
CREATE INDEX "CompanyReview_companyId_overallRating_status_idx"
  ON "CompanyReview"("companyId", "overallRating", "status");
CREATE INDEX "CompanyReview_companyId_isDetailed_idx"
  ON "CompanyReview"("companyId", "isDetailed");
CREATE INDEX "CompanyReview_status_reportedCount_idx"
  ON "CompanyReview"("status", "reportedCount");
CREATE INDEX "CompanyReview_userId_createdAt_idx"
  ON "CompanyReview"("userId", "createdAt");

ALTER TABLE "CompanyReview"
  ADD CONSTRAINT "CompanyReview_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyReview"
  ADD CONSTRAINT "CompanyReview_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── CompanyReviewVote ─────────────────────────────────────────────────
CREATE TABLE "CompanyReviewVote" (
  "id"              TEXT NOT NULL,
  "reviewId"        TEXT NOT NULL,
  "userId"          TEXT,
  "fingerprintHash" TEXT NOT NULL,
  "helpful"         BOOLEAN NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CompanyReviewVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_vote_user_review"
  ON "CompanyReviewVote"("reviewId", "userId")
  WHERE "userId" IS NOT NULL;

CREATE UNIQUE INDEX "uq_vote_fp_review"
  ON "CompanyReviewVote"("reviewId", "fingerprintHash");

CREATE INDEX "CompanyReviewVote_reviewId_idx" ON "CompanyReviewVote"("reviewId");

ALTER TABLE "CompanyReviewVote"
  ADD CONSTRAINT "CompanyReviewVote_reviewId_fkey"
  FOREIGN KEY ("reviewId") REFERENCES "CompanyReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyReviewVote"
  ADD CONSTRAINT "CompanyReviewVote_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── CompanyReviewReport ───────────────────────────────────────────────
CREATE TABLE "CompanyReviewReport" (
  "id"             TEXT NOT NULL,
  "reviewId"       TEXT NOT NULL,
  "reporterUserId" TEXT,
  "reporterFp"     TEXT NOT NULL,
  "reason"         TEXT NOT NULL,
  "details"        TEXT,
  "resolved"       BOOLEAN NOT NULL DEFAULT false,
  "resolvedBy"     TEXT,
  "resolvedAt"     TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CompanyReviewReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CompanyReviewReport_reviewId_idx" ON "CompanyReviewReport"("reviewId");
CREATE INDEX "CompanyReviewReport_resolved_createdAt_idx"
  ON "CompanyReviewReport"("resolved", "createdAt");

ALTER TABLE "CompanyReviewReport"
  ADD CONSTRAINT "CompanyReviewReport_reviewId_fkey"
  FOREIGN KEY ("reviewId") REFERENCES "CompanyReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── CompanyReviewAggregate ────────────────────────────────────────────
CREATE TABLE "CompanyReviewAggregate" (
  "companyId"               TEXT NOT NULL,
  "totalReviews"            INTEGER NOT NULL DEFAULT 0,
  "averageOverall"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "averageWorkLifeBalance"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "averageSalary"           DOUBLE PRECISION NOT NULL DEFAULT 0,
  "averagePromotions"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "averageJobSecurity"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "averageSkillDev"         DOUBLE PRECISION NOT NULL DEFAULT 0,
  "averageWorkSatisfaction" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "averageCompanyCulture"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "count5"                  INTEGER NOT NULL DEFAULT 0,
  "count4"                  INTEGER NOT NULL DEFAULT 0,
  "count3"                  INTEGER NOT NULL DEFAULT 0,
  "count2"                  INTEGER NOT NULL DEFAULT 0,
  "count1"                  INTEGER NOT NULL DEFAULT 0,
  "averageMen"              DOUBLE PRECISION,
  "countMen"                INTEGER NOT NULL DEFAULT 0,
  "averageWomen"            DOUBLE PRECISION,
  "countWomen"              INTEGER NOT NULL DEFAULT 0,
  "topJobProfiles"          JSONB,
  "industryAverage"         DOUBLE PRECISION,
  "industryName"            TEXT,
  "refreshedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CompanyReviewAggregate_pkey" PRIMARY KEY ("companyId")
);

CREATE INDEX "CompanyReviewAggregate_averageOverall_idx"
  ON "CompanyReviewAggregate"("averageOverall");
CREATE INDEX "CompanyReviewAggregate_refreshedAt_idx"
  ON "CompanyReviewAggregate"("refreshedAt");

ALTER TABLE "CompanyReviewAggregate"
  ADD CONSTRAINT "CompanyReviewAggregate_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
