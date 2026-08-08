-- CreateEnum
CREATE TYPE "WaDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "WaMessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "WaMessageType" AS ENUM ('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER', 'LOCATION', 'CONTACTS', 'INTERACTIVE', 'BUTTON', 'REACTION', 'TEMPLATE', 'SYSTEM', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "WaConversationStatus" AS ENUM ('OPEN', 'PENDING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "WaOptInStatus" AS ENUM ('UNKNOWN', 'OPTED_IN', 'OPTED_OUT');

-- CreateEnum
CREATE TYPE "WaTemplateCategory" AS ENUM ('MARKETING', 'UTILITY', 'AUTHENTICATION');

-- CreateEnum
CREATE TYPE "WaTemplateStatus" AS ENUM ('LOCAL', 'DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED', 'IN_APPEAL');

-- CreateEnum
CREATE TYPE "WaTemplateQuality" AS ENUM ('GREEN', 'YELLOW', 'RED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "WaCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'QUEUED', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WaCampaignRecipientStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "WaCampaignType" AS ENUM ('BROADCAST', 'SEQUENCE');

-- CreateEnum
CREATE TYPE "WaScheduledMessageStatus" AS ENUM ('PENDING', 'SENT', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "WaChannel" (
    "id" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "wabaId" TEXT NOT NULL,
    "displayPhone" TEXT NOT NULL,
    "displayName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "messagingTier" TEXT,
    "qualityRating" "WaTemplateQuality" NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaContact" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "waId" TEXT,
    "name" TEXT,
    "userId" TEXT,
    "optInStatus" "WaOptInStatus" NOT NULL DEFAULT 'UNKNOWN',
    "optInAt" TIMESTAMP(3),
    "optInSource" TEXT,
    "optOutAt" TIMESTAMP(3),
    "tags" TEXT[],
    "attributes" JSONB,
    "lastInboundAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "lastMarketingAt" TIMESTAMP(3),
    "consentEvidence" JSONB,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaConversation" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "status" "WaConversationStatus" NOT NULL DEFAULT 'OPEN',
    "assignedTo" TEXT,
    "windowExpiresAt" TIMESTAMP(3),
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastReadAt" TIMESTAMP(3),
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "archivedAt" TIMESTAMP(3),
    "csatRequestedAt" TIMESTAMP(3),
    "csatScore" INTEGER,
    "csatComment" TEXT,
    "csatAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "lastMessagePreview" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaMessage" (
    "id" TEXT NOT NULL,
    "wamid" TEXT,
    "channelId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "direction" "WaDirection" NOT NULL,
    "type" "WaMessageType" NOT NULL,
    "status" "WaMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "text" TEXT,
    "payload" JSONB,
    "mediaId" TEXT,
    "mediaUrl" TEXT,
    "mediaMime" TEXT,
    "templateName" TEXT,
    "contextWamid" TEXT,
    "errorCode" TEXT,
    "errorTitle" TEXT,
    "pricingCategory" TEXT,
    "costPaise" INTEGER,
    "billable" BOOLEAN,
    "pricingModel" TEXT,
    "templateLanguage" TEXT,
    "referral" JSONB,
    "reactions" JSONB,
    "sentByUserId" TEXT,
    "campaignId" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaTemplate" (
    "id" TEXT NOT NULL,
    "metaId" TEXT,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "category" "WaTemplateCategory" NOT NULL,
    "status" "WaTemplateStatus" NOT NULL DEFAULT 'LOCAL',
    "quality" "WaTemplateQuality" NOT NULL DEFAULT 'UNKNOWN',
    "components" JSONB NOT NULL,
    "variableSample" JSONB,
    "rejectionReason" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "channelId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "status" "WaCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "audienceType" TEXT NOT NULL,
    "audienceFilter" JSONB,
    "variableMapping" JSONB,
    "scheduledAt" TIMESTAMP(3),
    "batchSize" INTEGER NOT NULL DEFAULT 100,
    "throttlePerSec" INTEGER NOT NULL DEFAULT 15,
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "readCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "repliedCount" INTEGER NOT NULL DEFAULT 0,
    "convertedCount" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostPaise" INTEGER,
    "actualCostPaise" INTEGER,
    "type" "WaCampaignType" NOT NULL DEFAULT 'BROADCAST',
    "isAbTest" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceDays" INTEGER,
    "nextRunAt" TIMESTAMP(3),
    "parentCampaignId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaCampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "status" "WaCampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "wamid" TEXT,
    "variantId" TEXT,
    "variables" JSONB,
    "errorCode" TEXT,
    "sentAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "nextStepAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaCampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaWebhookEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "wamid" TEXT,
    "payload" JSONB NOT NULL,
    "signatureOk" BOOLEAN NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaCannedReply" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaCannedReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaCampaignStep" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "templateId" TEXT NOT NULL,
    "delayHours" INTEGER NOT NULL DEFAULT 24,
    "condition" TEXT NOT NULL DEFAULT 'any',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaCampaignStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaConversationNote" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaConversationNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaKeywordRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "match" TEXT NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT 'contains',
    "replyText" TEXT,
    "replyTemplateId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaKeywordRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "businessHours" JSONB,
    "awayMessage" TEXT,
    "welcomeMessage" TEXT,
    "autoReplyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "marketingCapPer24h" INTEGER NOT NULL DEFAULT 1,
    "retentionDays" INTEGER,
    "optOutKeywords" TEXT[] DEFAULT ARRAY['STOP', 'UNSUBSCRIBE', 'CANCEL']::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaCampaignVariant" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "readCount" INTEGER NOT NULL DEFAULT 0,
    "repliedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaCampaignVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaShortLink" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "campaignId" TEXT,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaShortLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaLinkClick" (
    "id" TEXT NOT NULL,
    "shortLinkId" TEXT NOT NULL,
    "contactId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaLinkClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaChannelHealthSnapshot" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "quality" TEXT NOT NULL,
    "tier" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaChannelHealthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaScheduledMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT,
    "templateId" TEXT,
    "bodyParams" JSONB,
    "sendAt" TIMESTAMP(3) NOT NULL,
    "status" "WaScheduledMessageStatus" NOT NULL DEFAULT 'PENDING',
    "createdBy" TEXT,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaScheduledMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaSuppression" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "reason" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaSegment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "filter" JSONB NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaConversion" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "contactId" TEXT,
    "valuePaise" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaConversion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WaChannel_phoneNumberId_key" ON "WaChannel"("phoneNumberId");

-- CreateIndex
CREATE INDEX "WaChannel_isActive_idx" ON "WaChannel"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "WaContact_phone_key" ON "WaContact"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "WaContact_userId_key" ON "WaContact"("userId");

-- CreateIndex
CREATE INDEX "WaContact_userId_idx" ON "WaContact"("userId");

-- CreateIndex
CREATE INDEX "WaContact_optInStatus_idx" ON "WaContact"("optInStatus");

-- CreateIndex
CREATE INDEX "WaContact_lastInboundAt_idx" ON "WaContact"("lastInboundAt");

-- CreateIndex
CREATE INDEX "WaContact_tags_idx" ON "WaContact"("tags");

-- CreateIndex
CREATE INDEX "WaConversation_status_idx" ON "WaConversation"("status");

-- CreateIndex
CREATE INDEX "WaConversation_assignedTo_idx" ON "WaConversation"("assignedTo");

-- CreateIndex
CREATE INDEX "WaConversation_lastMessageAt_idx" ON "WaConversation"("lastMessageAt");

-- CreateIndex
CREATE INDEX "WaConversation_status_lastMessageAt_idx" ON "WaConversation"("status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "WaConversation_assignedTo_lastMessageAt_idx" ON "WaConversation"("assignedTo", "lastMessageAt");

-- CreateIndex
CREATE INDEX "WaConversation_snoozedUntil_idx" ON "WaConversation"("snoozedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "WaConversation_channelId_contactId_key" ON "WaConversation"("channelId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "WaMessage_wamid_key" ON "WaMessage"("wamid");

-- CreateIndex
CREATE INDEX "WaMessage_conversationId_createdAt_idx" ON "WaMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "WaMessage_contactId_idx" ON "WaMessage"("contactId");

-- CreateIndex
CREATE INDEX "WaMessage_status_idx" ON "WaMessage"("status");

-- CreateIndex
CREATE INDEX "WaMessage_campaignId_idx" ON "WaMessage"("campaignId");

-- CreateIndex
CREATE INDEX "WaMessage_direction_idx" ON "WaMessage"("direction");

-- CreateIndex
CREATE INDEX "WaMessage_templateName_idx" ON "WaMessage"("templateName");

-- CreateIndex
CREATE UNIQUE INDEX "WaTemplate_metaId_key" ON "WaTemplate"("metaId");

-- CreateIndex
CREATE INDEX "WaTemplate_status_idx" ON "WaTemplate"("status");

-- CreateIndex
CREATE INDEX "WaTemplate_category_idx" ON "WaTemplate"("category");

-- CreateIndex
CREATE UNIQUE INDEX "WaTemplate_name_language_key" ON "WaTemplate"("name", "language");

-- CreateIndex
CREATE INDEX "WaCampaign_status_idx" ON "WaCampaign"("status");

-- CreateIndex
CREATE INDEX "WaCampaign_scheduledAt_idx" ON "WaCampaign"("scheduledAt");

-- CreateIndex
CREATE INDEX "WaCampaign_nextRunAt_idx" ON "WaCampaign"("nextRunAt");

-- CreateIndex
CREATE INDEX "WaCampaignRecipient_campaignId_status_idx" ON "WaCampaignRecipient"("campaignId", "status");

-- CreateIndex
CREATE INDEX "WaCampaignRecipient_wamid_idx" ON "WaCampaignRecipient"("wamid");

-- CreateIndex
CREATE INDEX "WaCampaignRecipient_nextStepAt_idx" ON "WaCampaignRecipient"("nextStepAt");

-- CreateIndex
CREATE UNIQUE INDEX "WaCampaignRecipient_campaignId_contactId_key" ON "WaCampaignRecipient"("campaignId", "contactId");

-- CreateIndex
CREATE INDEX "WaWebhookEvent_wamid_idx" ON "WaWebhookEvent"("wamid");

-- CreateIndex
CREATE INDEX "WaWebhookEvent_createdAt_idx" ON "WaWebhookEvent"("createdAt");

-- CreateIndex
CREATE INDEX "WaCannedReply_title_idx" ON "WaCannedReply"("title");

-- CreateIndex
CREATE UNIQUE INDEX "WaCampaignStep_campaignId_stepOrder_key" ON "WaCampaignStep"("campaignId", "stepOrder");

-- CreateIndex
CREATE INDEX "WaConversationNote_conversationId_idx" ON "WaConversationNote"("conversationId");

-- CreateIndex
CREATE INDEX "WaKeywordRule_isActive_idx" ON "WaKeywordRule"("isActive");

-- CreateIndex
CREATE INDEX "WaCampaignVariant_campaignId_idx" ON "WaCampaignVariant"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "WaShortLink_code_key" ON "WaShortLink"("code");

-- CreateIndex
CREATE INDEX "WaShortLink_campaignId_idx" ON "WaShortLink"("campaignId");

-- CreateIndex
CREATE INDEX "WaLinkClick_shortLinkId_createdAt_idx" ON "WaLinkClick"("shortLinkId", "createdAt");

-- CreateIndex
CREATE INDEX "WaChannelHealthSnapshot_channelId_createdAt_idx" ON "WaChannelHealthSnapshot"("channelId", "createdAt");

-- CreateIndex
CREATE INDEX "WaScheduledMessage_status_sendAt_idx" ON "WaScheduledMessage"("status", "sendAt");

-- CreateIndex
CREATE INDEX "WaScheduledMessage_conversationId_idx" ON "WaScheduledMessage"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "WaSuppression_phone_key" ON "WaSuppression"("phone");

-- CreateIndex
CREATE INDEX "WaSuppression_createdAt_idx" ON "WaSuppression"("createdAt");

-- CreateIndex
CREATE INDEX "WaSegment_name_idx" ON "WaSegment"("name");

-- CreateIndex
CREATE INDEX "WaConversion_campaignId_idx" ON "WaConversion"("campaignId");

-- CreateIndex
CREATE INDEX "WaConversion_contactId_idx" ON "WaConversion"("contactId");

-- AddForeignKey
ALTER TABLE "WaContact" ADD CONSTRAINT "WaContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaConversation" ADD CONSTRAINT "WaConversation_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "WaChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaConversation" ADD CONSTRAINT "WaConversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "WaContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaConversation" ADD CONSTRAINT "WaConversation_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaMessage" ADD CONSTRAINT "WaMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "WaChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaMessage" ADD CONSTRAINT "WaMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WaConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaMessage" ADD CONSTRAINT "WaMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "WaContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaMessage" ADD CONSTRAINT "WaMessage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "WaCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaCampaign" ADD CONSTRAINT "WaCampaign_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "WaChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaCampaign" ADD CONSTRAINT "WaCampaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WaTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaCampaign" ADD CONSTRAINT "WaCampaign_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaCampaignRecipient" ADD CONSTRAINT "WaCampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "WaCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaCampaignRecipient" ADD CONSTRAINT "WaCampaignRecipient_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "WaContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaCampaignStep" ADD CONSTRAINT "WaCampaignStep_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "WaCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaConversationNote" ADD CONSTRAINT "WaConversationNote_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WaConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaCampaignVariant" ADD CONSTRAINT "WaCampaignVariant_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "WaCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaLinkClick" ADD CONSTRAINT "WaLinkClick_shortLinkId_fkey" FOREIGN KEY ("shortLinkId") REFERENCES "WaShortLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

