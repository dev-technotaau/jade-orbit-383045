-- Vendor Connect — adds VENDOR role + VendorProfile + VendorLead.

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'VENDOR';

-- CreateEnum
CREATE TYPE "VendorLeadStatus" AS ENUM ('PENDING', 'RESPONDED', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateTable
CREATE TABLE "VendorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "logo" TEXT,
    "website" TEXT,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "industries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "locations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "yearsInBusiness" INTEGER,
    "teamSize" INTEGER,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VendorProfile_userId_key" ON "VendorProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorProfile_slug_key" ON "VendorProfile"("slug");

-- CreateIndex
CREATE INDEX "VendorProfile_userId_idx" ON "VendorProfile"("userId");

-- CreateIndex
CREATE INDEX "VendorProfile_slug_idx" ON "VendorProfile"("slug");

-- CreateIndex
CREATE INDEX "VendorProfile_isPublic_idx" ON "VendorProfile"("isPublic");

-- CreateTable
CREATE TABLE "VendorLead" (
    "id" TEXT NOT NULL,
    "vendorProfileId" TEXT NOT NULL,
    "jobPostId" TEXT,
    "employerId" TEXT NOT NULL,
    "requirementText" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "status" "VendorLeadStatus" NOT NULL DEFAULT 'PENDING',
    "responseText" TEXT,
    "respondedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorLead_vendorProfileId_status_idx" ON "VendorLead"("vendorProfileId", "status");

-- CreateIndex
CREATE INDEX "VendorLead_employerId_idx" ON "VendorLead"("employerId");

-- CreateIndex
CREATE INDEX "VendorLead_jobPostId_idx" ON "VendorLead"("jobPostId");

-- AddForeignKey
ALTER TABLE "VendorProfile" ADD CONSTRAINT "VendorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorLead" ADD CONSTRAINT "VendorLead_vendorProfileId_fkey" FOREIGN KEY ("vendorProfileId") REFERENCES "VendorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorLead" ADD CONSTRAINT "VendorLead_jobPostId_fkey" FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorLead" ADD CONSTRAINT "VendorLead_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
