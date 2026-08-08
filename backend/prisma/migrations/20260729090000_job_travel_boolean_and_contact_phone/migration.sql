-- Job posting field changes.
--
-- 1. `travelRequirementPercent` (Int, 0-100) becomes `travelRequired` (Boolean).
--    Employers could not meaningfully estimate a percentage, so the field is
--    now a plain yes/no. Written as ADD -> backfill -> DROP rather than a
--    generated drop/create pair so existing rows keep their meaning: any job
--    that previously declared ANY travel (> 0) becomes `true`.
--
-- 2. `contactPhone` is added alongside the existing contactPerson /
--    contactEmail. It is internal-only — `sanitiseJobForPublic` already strips
--    `contactPhone`, so it cannot leak into a public payload.

ALTER TABLE "JobPost" ADD COLUMN "travelRequired" BOOLEAN NOT NULL DEFAULT false;

UPDATE "JobPost"
SET "travelRequired" = true
WHERE "travelRequirementPercent" IS NOT NULL
  AND "travelRequirementPercent" > 0;

ALTER TABLE "JobPost" DROP COLUMN "travelRequirementPercent";

ALTER TABLE "JobPost" ADD COLUMN "contactPhone" TEXT;
