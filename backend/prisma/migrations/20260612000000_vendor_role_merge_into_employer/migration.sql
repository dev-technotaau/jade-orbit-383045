-- Vendor is no longer a separate role: it is an employer capability granted by
-- the VENDOR_CONNECT plan (feature.vendor_leads / feature.vendor_listing / ...).
-- This migration converts existing VENDOR users to EMPLOYER and removes the
-- VENDOR value from the Role enum. VendorProfile / VendorLead / VendorReview
-- are untouched — they key on userId, which is preserved.

-- 1) Convert existing vendor accounts to employers (VendorProfile rows stay
--    linked via userId; employer onboarding completes their CompanyProfile).
UPDATE "User" SET "role" = 'EMPLOYER' WHERE "role" = 'VENDOR';

-- 2) Scrub VENDOR from role-targeted coupon scopes (Role[] column).
UPDATE "Coupon"
SET "allowedRoles" = array_remove("allowedRoles", 'VENDOR'::"Role")
WHERE 'VENDOR'::"Role" = ANY ("allowedRoles");

-- 3) Rebuild the Role enum without VENDOR (Postgres cannot drop enum values).
ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('CANDIDATE', 'EMPLOYER', 'ADMIN', 'SUPER_ADMIN');

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'CANDIDATE';

ALTER TABLE "Coupon" ALTER COLUMN "allowedRoles" DROP DEFAULT;
ALTER TABLE "Coupon"
  ALTER COLUMN "allowedRoles" TYPE "Role"[] USING ("allowedRoles"::text[]::"Role"[]);
ALTER TABLE "Coupon" ALTER COLUMN "allowedRoles" SET DEFAULT ARRAY[]::"Role"[];

DROP TYPE "Role_old";
