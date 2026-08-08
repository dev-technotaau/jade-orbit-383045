-- Vacancy fill tracking.
--
-- `offlineHiresCount` records hires made OFF the platform for a posting
-- (walk-ins, referrals, agency placements). Vacancy fill becomes:
--
--     filled = COUNT(applications WHERE status = 'HIRED') + offlineHiresCount
--
-- Without this column an off-platform hire can never be represented: there is
-- no application row to mark HIRED, so the listing would stay open advertising
-- seats that no longer exist. Defaults to 0, so every existing row keeps its
-- current derived fill exactly as before.

ALTER TABLE "JobPost" ADD COLUMN "offlineHiresCount" INTEGER NOT NULL DEFAULT 0;

-- No new index: the dormancy sweep scans OPEN jobs by age, which the existing
-- @@index([status, createdAt]) already serves. (JobPost has no `publishedAt`
-- column — an index on one would fail at deploy time.)
