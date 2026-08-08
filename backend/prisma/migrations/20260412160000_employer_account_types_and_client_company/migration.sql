-- AlterEnum
ALTER TYPE "CompanyType" ADD VALUE 'PROPRIETARY';

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('COMPANY', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "HiringType" AS ENUM ('DIRECT', 'CONSULTANCY');

-- AlterTable
ALTER TABLE "CompanyProfile" ADD COLUMN "accountType" "AccountType";
ALTER TABLE "CompanyProfile" ADD COLUMN "hiringType" "HiringType";

-- AlterTable
ALTER TABLE "JobPost" ADD COLUMN "clientCompanyName" TEXT;
