-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('BIKE', 'CAR', 'SCOOTER');

-- AlterTable
ALTER TABLE "CandidateProfile" ADD COLUMN "vehicleTypes" "VehicleType"[] DEFAULT ARRAY[]::"VehicleType"[];
