-- CompanyFollow — candidates following companies.
--
-- Drives:
--   - "Follow / Following" button on the public company-detail page
--   - /candidate/following list + aggregated job feed
--   - /employer/followers admin page
--   - BullMQ fan-out notifications when a followed company posts a new job
--
-- One row per (candidate, company) pair. CASCADE deletes on both sides
-- so deleting either user or company tears down the follow record
-- automatically — no orphan rows possible.

CREATE TABLE "CompanyFollow" (
    "id"        TEXT       NOT NULL,
    "userId"    TEXT       NOT NULL,
    "companyId" TEXT       NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyFollow_pkey" PRIMARY KEY ("id")
);

-- Unique (user, company) — duplicate follows are no-ops at the service
-- layer. The DB-level unique guarantees idempotency under race.
CREATE UNIQUE INDEX "CompanyFollow_userId_companyId_key"
    ON "CompanyFollow" ("userId", "companyId");

-- Fast access for "list candidates I follow, newest first".
CREATE INDEX "CompanyFollow_userId_createdAt_idx"
    ON "CompanyFollow" ("userId", "createdAt");

-- Fast access for "list followers of this company, newest first" +
-- the BullMQ fan-out paging through followers when a job ships.
CREATE INDEX "CompanyFollow_companyId_createdAt_idx"
    ON "CompanyFollow" ("companyId", "createdAt");

-- Foreign keys with CASCADE so deleting a user or company cleans up
-- the follow rows automatically.
ALTER TABLE "CompanyFollow"
    ADD CONSTRAINT "CompanyFollow_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyFollow"
    ADD CONSTRAINT "CompanyFollow_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "CompanyProfile" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
