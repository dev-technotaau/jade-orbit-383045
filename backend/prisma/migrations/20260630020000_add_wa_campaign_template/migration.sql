-- Reusable campaign blueprint (template + audience + settings) for "save as template".
CREATE TABLE "WaCampaignTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "templateId" TEXT NOT NULL,
    "audienceType" TEXT,
    "audienceFilter" JSONB,
    "segmentId" TEXT,
    "variableMapping" JSONB,
    "type" "WaCampaignType" NOT NULL DEFAULT 'BROADCAST',
    "batchSize" INTEGER NOT NULL DEFAULT 100,
    "throttlePerSec" INTEGER NOT NULL DEFAULT 15,
    "recurrenceDays" INTEGER,
    "isAbTest" BOOLEAN NOT NULL DEFAULT false,
    "variants" JSONB,
    "steps" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaCampaignTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WaCampaignTemplate_createdAt_idx" ON "WaCampaignTemplate"("createdAt");
