-- Vendor job board bookmarks: an employer with the VENDOR_CONNECT capability
-- saves another employer's open posting to pitch later. Contact reveals are
-- tracked separately in ResourceLedger (VENDOR_LEAD consumption); saving is free.

CREATE TABLE "SavedVendorJob" (
    "id" TEXT NOT NULL,
    "vendorUserId" TEXT NOT NULL,
    "jobPostId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedVendorJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SavedVendorJob_vendorUserId_jobPostId_key" ON "SavedVendorJob"("vendorUserId", "jobPostId");
CREATE INDEX "SavedVendorJob_vendorUserId_idx" ON "SavedVendorJob"("vendorUserId");
CREATE INDEX "SavedVendorJob_jobPostId_idx" ON "SavedVendorJob"("jobPostId");

ALTER TABLE "SavedVendorJob" ADD CONSTRAINT "SavedVendorJob_vendorUserId_fkey" FOREIGN KEY ("vendorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedVendorJob" ADD CONSTRAINT "SavedVendorJob_jobPostId_fkey" FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
