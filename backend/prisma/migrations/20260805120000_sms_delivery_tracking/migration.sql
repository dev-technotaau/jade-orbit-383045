-- SMS delivery tracking + opt-out.
--
-- Adds SmsMessage (one row per outbound message, updated in place by the
-- Twilio status callback) and SmsOptOut (numbers that sent STOP, inferred from
-- Twilio error 21610). Before this, sendSMS reported success the moment Twilio
-- ACCEPTED a message, so a carrier-filtered SMS — the common failure mode for
-- unregistered A2P traffic into India — was indistinguishable from a delivered
-- one.

-- CreateEnum
CREATE TYPE "SmsStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'UNDELIVERED', 'FAILED', 'REJECTED');

-- CreateTable
CREATE TABLE "SmsMessage" (
    "id" TEXT NOT NULL,
    "providerSid" TEXT,
    "to" TEXT NOT NULL,
    "bodyLength" INTEGER NOT NULL,
    "purpose" TEXT,
    "status" "SmsStatus" NOT NULL DEFAULT 'QUEUED',
    "errorCode" INTEGER,
    "errorMessage" TEXT,
    "segments" INTEGER,
    "pricePaise" INTEGER,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsOptOut" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'twilio_21610',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsOptOut_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SmsMessage_providerSid_key" ON "SmsMessage"("providerSid");

-- CreateIndex
CREATE INDEX "SmsMessage_status_idx" ON "SmsMessage"("status");

-- CreateIndex
CREATE INDEX "SmsMessage_to_idx" ON "SmsMessage"("to");

-- CreateIndex
CREATE INDEX "SmsMessage_userId_idx" ON "SmsMessage"("userId");

-- CreateIndex
CREATE INDEX "SmsMessage_createdAt_idx" ON "SmsMessage"("createdAt");

-- CreateIndex
CREATE INDEX "SmsMessage_errorCode_idx" ON "SmsMessage"("errorCode");

-- CreateIndex
CREATE UNIQUE INDEX "SmsOptOut_phone_key" ON "SmsOptOut"("phone");

-- CreateIndex
CREATE INDEX "SmsOptOut_createdAt_idx" ON "SmsOptOut"("createdAt");

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
