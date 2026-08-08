-- Assisted Hiring fulfilment workflow (₹1499 plan).

-- CreateEnum
CREATE TYPE "AssistedHiringStatus" AS ENUM ('PENDING', 'CALL_SCHEDULED', 'IN_PROGRESS', 'DELIVERED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "AssistedHiringRequest" (
    "id" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "orderId" TEXT,
    "jobPostId" TEXT,
    "roleTitle" TEXT NOT NULL,
    "requirementText" TEXT NOT NULL,
    "preferredSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredLocation" TEXT,
    "budgetRange" TEXT,
    "noticePeriod" TEXT,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "status" "AssistedHiringStatus" NOT NULL DEFAULT 'PENDING',
    "internalNotes" TEXT,
    "callScheduledAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "assignedAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistedHiringRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssistedHiringRequest_orderId_key" ON "AssistedHiringRequest"("orderId");

-- CreateIndex
CREATE INDEX "AssistedHiringRequest_employerId_status_idx" ON "AssistedHiringRequest"("employerId", "status");

-- CreateIndex
CREATE INDEX "AssistedHiringRequest_status_startedAt_idx" ON "AssistedHiringRequest"("status", "startedAt");

-- CreateIndex
CREATE INDEX "AssistedHiringRequest_assignedAdminId_idx" ON "AssistedHiringRequest"("assignedAdminId");

-- CreateIndex
CREATE INDEX "AssistedHiringRequest_orderId_idx" ON "AssistedHiringRequest"("orderId");

-- CreateTable
CREATE TABLE "AssistedHiringMatchedProfile" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "candidateUserId" TEXT,
    "candidateName" TEXT NOT NULL,
    "candidateHeadline" TEXT,
    "candidateExperience" TEXT,
    "candidateLocation" TEXT,
    "resumeUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistedHiringMatchedProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistedHiringMatchedProfile_requestId_idx" ON "AssistedHiringMatchedProfile"("requestId");

-- AddForeignKey
ALTER TABLE "AssistedHiringRequest" ADD CONSTRAINT "AssistedHiringRequest_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistedHiringRequest" ADD CONSTRAINT "AssistedHiringRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistedHiringRequest" ADD CONSTRAINT "AssistedHiringRequest_jobPostId_fkey" FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistedHiringRequest" ADD CONSTRAINT "AssistedHiringRequest_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistedHiringMatchedProfile" ADD CONSTRAINT "AssistedHiringMatchedProfile_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "AssistedHiringRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistedHiringMatchedProfile" ADD CONSTRAINT "AssistedHiringMatchedProfile_candidateUserId_fkey" FOREIGN KEY ("candidateUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
