-- CreateTable
CREATE TABLE "OffPlatformCandidate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "headline" TEXT,
    "notes" TEXT,
    "tags" TEXT[],
    "source" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OffPlatformCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OffPlatformResume" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "r2Key" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OffPlatformResume_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OffPlatformCandidate_createdAt_idx" ON "OffPlatformCandidate"("createdAt");

-- CreateIndex
CREATE INDEX "OffPlatformCandidate_name_idx" ON "OffPlatformCandidate"("name");

-- CreateIndex
CREATE INDEX "OffPlatformResume_candidateId_idx" ON "OffPlatformResume"("candidateId");

-- CreateIndex
CREATE INDEX "OffPlatformResume_createdAt_idx" ON "OffPlatformResume"("createdAt");

-- AddForeignKey
ALTER TABLE "OffPlatformResume" ADD CONSTRAINT "OffPlatformResume_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "OffPlatformCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

