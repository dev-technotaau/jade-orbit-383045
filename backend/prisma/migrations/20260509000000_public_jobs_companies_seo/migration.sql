-- Public Jobs + Companies + SEO foundations.
-- Adds slug + publicSearchable columns to JobPost and CompanyProfile.
-- Slugs are nullable initially so existing rows don't fail the
-- `NOT NULL` constraint; the backfill scripts populate them, then a
-- follow-up migration can flip to NOT NULL once verified.

-- CompanyProfile
ALTER TABLE "CompanyProfile" ADD COLUMN "slug" TEXT;
ALTER TABLE "CompanyProfile" ADD COLUMN "publicSearchable" BOOLEAN NOT NULL DEFAULT true;
CREATE UNIQUE INDEX "CompanyProfile_slug_key" ON "CompanyProfile"("slug");
CREATE INDEX "CompanyProfile_slug_idx" ON "CompanyProfile"("slug");
CREATE INDEX "CompanyProfile_publicSearchable_isVerified_idx" ON "CompanyProfile"("publicSearchable", "isVerified");

-- JobPost
ALTER TABLE "JobPost" ADD COLUMN "slug" TEXT;
ALTER TABLE "JobPost" ADD COLUMN "publicSearchable" BOOLEAN NOT NULL DEFAULT true;
CREATE UNIQUE INDEX "JobPost_slug_key" ON "JobPost"("slug");
CREATE INDEX "JobPost_slug_idx" ON "JobPost"("slug");
CREATE INDEX "JobPost_publicSearchable_status_idx" ON "JobPost"("publicSearchable", "status");

-- SearchHistory enum + table
CREATE TYPE "SearchHistoryType" AS ENUM ('JOB', 'CANDIDATE', 'COMPANY');

CREATE TABLE "SearchHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "searchType" "SearchHistoryType" NOT NULL,
    "filters" JSONB NOT NULL,
    "filtersHash" TEXT NOT NULL,
    "query" TEXT,
    "location" TEXT,
    "resultsCount" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hits" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SearchHistory_userId_searchType_filtersHash_key" ON "SearchHistory"("userId", "searchType", "filtersHash");
CREATE UNIQUE INDEX "SearchHistory_sessionId_searchType_filtersHash_key" ON "SearchHistory"("sessionId", "searchType", "filtersHash");
CREATE INDEX "SearchHistory_userId_lastSeenAt_idx" ON "SearchHistory"("userId", "lastSeenAt");
CREATE INDEX "SearchHistory_sessionId_lastSeenAt_idx" ON "SearchHistory"("sessionId", "lastSeenAt");
CREATE INDEX "SearchHistory_searchType_lastSeenAt_idx" ON "SearchHistory"("searchType", "lastSeenAt");

ALTER TABLE "SearchHistory" ADD CONSTRAINT "SearchHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CuratedListing
CREATE TYPE "CuratedType" AS ENUM (
  'JOB_CATEGORY',
  'JOB_DEMAND',
  'JOB_LOCATION',
  'JOB_QUALIFICATION',
  'JOB_DEPARTMENT',
  'JOB_COLLECTION',
  'COMPANY_CATEGORY',
  'COMPANY_COLLECTION'
);

CREATE TABLE "CuratedListing" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "CuratedType" NOT NULL,
    "label" TEXT NOT NULL,
    "filterPreset" JSONB NOT NULL,
    "iconKey" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "heroH1" TEXT,
    "heroSubtitle" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CuratedListing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CuratedListing_slug_key" ON "CuratedListing"("slug");
CREATE INDEX "CuratedListing_type_isPublic_displayOrder_idx" ON "CuratedListing"("type", "isPublic", "displayOrder");
CREATE INDEX "CuratedListing_slug_idx" ON "CuratedListing"("slug");
