-- CreateEnum
CREATE TYPE "EmailSubscribeStatus" AS ENUM ('SUBSCRIBED', 'UNSUBSCRIBED', 'PENDING', 'CLEANED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "EmailTemplateCategory" AS ENUM ('MARKETING', 'TRANSACTIONAL', 'NOTIFICATION', 'NEWSLETTER', 'ANNOUNCEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "EmailTemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EmailCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'QUEUED', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmailCampaignRecipientStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'COMPLAINED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "EmailCampaignType" AS ENUM ('BROADCAST', 'SEQUENCE');

-- CreateEnum
CREATE TYPE "EmailDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "EmailMessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'COMPLAINED', 'FAILED', 'RECEIVED');

-- CreateEnum
CREATE TYPE "EmailThreadStatus" AS ENUM ('OPEN', 'PENDING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "EmailEventType" AS ENUM ('SENT', 'DELIVERED', 'OPEN', 'CLICK', 'BOUNCE', 'COMPLAINT', 'UNSUBSCRIBE', 'FAILED', 'DEFERRED');

-- CreateEnum
CREATE TYPE "EmailScheduledMessageStatus" AS ENUM ('PENDING', 'SENT', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "EmailSender" (
    "id" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "replyTo" TEXT,
    "domain" TEXT NOT NULL,
    "dkimVerified" BOOLEAN NOT NULL DEFAULT false,
    "spfVerified" BOOLEAN NOT NULL DEFAULT false,
    "dmarcVerified" BOOLEAN NOT NULL DEFAULT false,
    "mtaStsVerified" BOOLEAN NOT NULL DEFAULT false,
    "tlsRptVerified" BOOLEAN NOT NULL DEFAULT false,
    "dkimSelector" TEXT,
    "reputationScore" INTEGER,
    "hourlyCap" INTEGER,
    "dailyCap" INTEGER,
    "warmupDay" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailContact" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "userId" TEXT,
    "subscribeStatus" "EmailSubscribeStatus" NOT NULL DEFAULT 'SUBSCRIBED',
    "subscribedAt" TIMESTAMP(3),
    "subscribeSource" TEXT,
    "unsubscribedAt" TIMESTAMP(3),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attributes" JSONB,
    "lastOpenedAt" TIMESTAMP(3),
    "lastClickedAt" TIMESTAMP(3),
    "lastEmailedAt" TIMESTAMP(3),
    "lastMarketingAt" TIMESTAMP(3),
    "bounceCount" INTEGER NOT NULL DEFAULT 0,
    "complaintCount" INTEGER NOT NULL DEFAULT 0,
    "consentEvidence" JSONB,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "welcomedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSegment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "filter" JSONB NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailContactSet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailContactSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailContactSetMember" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailContactSetMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSuppression" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT,
    "source" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "preheader" TEXT,
    "htmlBody" TEXT NOT NULL,
    "textBody" TEXT,
    "category" "EmailTemplateCategory" NOT NULL DEFAULT 'MARKETING',
    "status" "EmailTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "variables" JSONB,
    "variableSample" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "footerSnippetId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "preheader" TEXT,
    "htmlBody" TEXT NOT NULL,
    "textBody" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSnippet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "html" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSnippet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "senderId" TEXT NOT NULL,
    "templateId" TEXT,
    "subjectOverride" TEXT,
    "fromNameOverride" TEXT,
    "replyToOverride" TEXT,
    "status" "EmailCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmTerm" TEXT,
    "utmContent" TEXT,
    "audienceType" TEXT NOT NULL,
    "audienceFilter" JSONB,
    "segmentId" TEXT,
    "variableMapping" JSONB,
    "attachments" JSONB,
    "scheduledAt" TIMESTAMP(3),
    "sendTimezone" TEXT,
    "batchSize" INTEGER NOT NULL DEFAULT 200,
    "sendRate" INTEGER NOT NULL DEFAULT 20,
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "openedCount" INTEGER NOT NULL DEFAULT 0,
    "clickedCount" INTEGER NOT NULL DEFAULT 0,
    "bouncedCount" INTEGER NOT NULL DEFAULT 0,
    "complainedCount" INTEGER NOT NULL DEFAULT 0,
    "unsubscribedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "repliedCount" INTEGER NOT NULL DEFAULT 0,
    "convertedCount" INTEGER NOT NULL DEFAULT 0,
    "type" "EmailCampaignType" NOT NULL DEFAULT 'BROADCAST',
    "isAbTest" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceDays" INTEGER,
    "nextRunAt" TIMESTAMP(3),
    "parentCampaignId" TEXT,
    "autoPausedReason" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailCampaignBlueprint" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "senderId" TEXT,
    "templateId" TEXT,
    "subjectOverride" TEXT,
    "audienceType" TEXT,
    "audienceFilter" JSONB,
    "segmentId" TEXT,
    "variableMapping" JSONB,
    "type" "EmailCampaignType" NOT NULL DEFAULT 'BROADCAST',
    "batchSize" INTEGER NOT NULL DEFAULT 200,
    "sendRate" INTEGER NOT NULL DEFAULT 20,
    "recurrenceDays" INTEGER,
    "isAbTest" BOOLEAN NOT NULL DEFAULT false,
    "variants" JSONB,
    "steps" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailCampaignBlueprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailCampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "EmailCampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "variantId" TEXT,
    "variables" JSONB,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "trackingToken" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "bounceType" TEXT,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "nextStepAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "complainedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailCampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailCampaignStep" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "templateId" TEXT,
    "subject" TEXT,
    "delayHours" INTEGER NOT NULL DEFAULT 24,
    "condition" TEXT NOT NULL DEFAULT 'any',
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailCampaignStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailCampaignVariant" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "templateId" TEXT,
    "subjectOverride" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "openedCount" INTEGER NOT NULL DEFAULT 0,
    "clickedCount" INTEGER NOT NULL DEFAULT 0,
    "bouncedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailCampaignVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailEvent" (
    "id" TEXT NOT NULL,
    "eventType" "EmailEventType" NOT NULL,
    "campaignId" TEXT,
    "recipientId" TEXT,
    "contactId" TEXT,
    "providerMessageId" TEXT,
    "url" TEXT,
    "bounceType" TEXT,
    "reason" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "machineOpen" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLink" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "campaignId" TEXT,
    "label" TEXT,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLinkClick" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "contactId" TEXT,
    "recipientId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLinkClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailUnsubscribe" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "contactId" TEXT,
    "campaignId" TEXT,
    "recipientId" TEXT,
    "method" TEXT NOT NULL DEFAULT 'link',
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailUnsubscribe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailBulkJob" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "total" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "succeeded" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "input" JSONB,
    "result" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailBulkJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailBulkUndo" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "label" TEXT,
    "snapshot" JSONB NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "restoredAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailBulkUndo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSendLog" (
    "id" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "campaignId" TEXT,
    "recipientId" TEXT,
    "providerMessageId" TEXT,
    "status" TEXT NOT NULL,
    "smtpResponse" TEXT,
    "acceptedRcpts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rejectedRcpts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "latencyMs" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailSendLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailThread" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "threadSubject" TEXT,
    "rootMessageId" TEXT,
    "status" "EmailThreadStatus" NOT NULL DEFAULT 'OPEN',
    "assignedTo" TEXT,
    "campaignId" TEXT,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastReadAt" TIMESTAMP(3),
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "archivedAt" TIMESTAMP(3),
    "csatScore" INTEGER,
    "csatComment" TEXT,
    "csatAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "lastMessagePreview" TEXT,
    "lastAutoReplyAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "senderId" TEXT,
    "threadId" TEXT,
    "contactId" TEXT NOT NULL,
    "campaignId" TEXT,
    "recipientId" TEXT,
    "direction" "EmailDirection" NOT NULL,
    "status" "EmailMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "fromEmail" TEXT,
    "toEmail" TEXT,
    "subject" TEXT,
    "htmlBody" TEXT,
    "textBody" TEXT,
    "snippet" TEXT,
    "attachments" JSONB,
    "inReplyTo" TEXT,
    "references" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bounceType" TEXT,
    "complaintFeedbackId" TEXT,
    "errorMessage" TEXT,
    "sentByUserId" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailThreadNote" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailThreadNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailCannedReply" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "shortcut" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailCannedReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "matchType" TEXT NOT NULL DEFAULT 'contains',
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "matchSubject" BOOLEAN NOT NULL DEFAULT true,
    "matchBody" BOOLEAN NOT NULL DEFAULT false,
    "action" TEXT NOT NULL DEFAULT 'auto_reply',
    "replyBody" TEXT,
    "label" TEXT,
    "assignTo" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailScheduledMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "html" TEXT,
    "attachments" JSONB,
    "sendAt" TIMESTAMP(3) NOT NULL,
    "status" "EmailScheduledMessageStatus" NOT NULL DEFAULT 'PENDING',
    "createdBy" TEXT,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailScheduledMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailInboundMessage" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "imapUid" INTEGER,
    "mailbox" TEXT,
    "kind" TEXT NOT NULL,
    "fromEmail" TEXT,
    "toEmail" TEXT,
    "subject" TEXT,
    "dsnStatus" TEXT,
    "dsnRecipient" TEXT,
    "recipientId" TEXT,
    "raw" JSONB,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailInboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "businessHours" JSONB,
    "awayMessage" TEXT,
    "welcomeMessage" TEXT,
    "autoReplyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "awayMode" BOOLEAN NOT NULL DEFAULT false,
    "marketingCapPer24h" INTEGER NOT NULL DEFAULT 1,
    "retentionDays" INTEGER,
    "unsubscribeKeywords" TEXT[] DEFAULT ARRAY['STOP', 'UNSUBSCRIBE', 'CANCEL']::TEXT[],
    "footerAddress" TEXT,
    "footerHtml" TEXT,
    "defaultFromName" TEXT,
    "defaultReplyTo" TEXT,
    "trackOpens" BOOLEAN NOT NULL DEFAULT true,
    "trackClicks" BOOLEAN NOT NULL DEFAULT true,
    "warmupSchedule" JSONB,
    "seedAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "imapHost" TEXT NOT NULL,
    "imapPort" INTEGER NOT NULL DEFAULT 993,
    "imapSecure" BOOLEAN NOT NULL DEFAULT true,
    "imapUser" TEXT NOT NULL,
    "imapPassEnc" TEXT NOT NULL,
    "smtpHost" TEXT NOT NULL,
    "smtpPort" INTEGER NOT NULL DEFAULT 465,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
    "smtpUser" TEXT NOT NULL,
    "smtpPassEnc" TEXT NOT NULL,
    "signature" TEXT,
    "color" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "lastError" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailSender_fromEmail_key" ON "EmailSender"("fromEmail");

-- CreateIndex
CREATE INDEX "EmailSender_isDefault_idx" ON "EmailSender"("isDefault");

-- CreateIndex
CREATE INDEX "EmailSender_domain_idx" ON "EmailSender"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "EmailContact_email_key" ON "EmailContact"("email");

-- CreateIndex
CREATE UNIQUE INDEX "EmailContact_userId_key" ON "EmailContact"("userId");

-- CreateIndex
CREATE INDEX "EmailContact_userId_idx" ON "EmailContact"("userId");

-- CreateIndex
CREATE INDEX "EmailContact_subscribeStatus_idx" ON "EmailContact"("subscribeStatus");

-- CreateIndex
CREATE INDEX "EmailContact_tags_idx" ON "EmailContact"("tags");

-- CreateIndex
CREATE INDEX "EmailContact_lastEmailedAt_idx" ON "EmailContact"("lastEmailedAt");

-- CreateIndex
CREATE INDEX "EmailSegment_name_idx" ON "EmailSegment"("name");

-- CreateIndex
CREATE INDEX "EmailContactSet_name_idx" ON "EmailContactSet"("name");

-- CreateIndex
CREATE INDEX "EmailContactSetMember_contactId_idx" ON "EmailContactSetMember"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailContactSetMember_setId_contactId_key" ON "EmailContactSetMember"("setId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSuppression_email_key" ON "EmailSuppression"("email");

-- CreateIndex
CREATE INDEX "EmailSuppression_createdAt_idx" ON "EmailSuppression"("createdAt");

-- CreateIndex
CREATE INDEX "EmailSuppression_reason_idx" ON "EmailSuppression"("reason");

-- CreateIndex
CREATE INDEX "EmailTemplate_status_idx" ON "EmailTemplate"("status");

-- CreateIndex
CREATE INDEX "EmailTemplate_category_idx" ON "EmailTemplate"("category");

-- CreateIndex
CREATE INDEX "EmailTemplateVersion_templateId_version_idx" ON "EmailTemplateVersion"("templateId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplateVersion_templateId_version_key" ON "EmailTemplateVersion"("templateId", "version");

-- CreateIndex
CREATE INDEX "EmailSnippet_category_idx" ON "EmailSnippet"("category");

-- CreateIndex
CREATE INDEX "EmailCampaign_status_idx" ON "EmailCampaign"("status");

-- CreateIndex
CREATE INDEX "EmailCampaign_scheduledAt_idx" ON "EmailCampaign"("scheduledAt");

-- CreateIndex
CREATE INDEX "EmailCampaign_nextRunAt_idx" ON "EmailCampaign"("nextRunAt");

-- CreateIndex
CREATE INDEX "EmailCampaign_senderId_idx" ON "EmailCampaign"("senderId");

-- CreateIndex
CREATE INDEX "EmailCampaign_archivedAt_idx" ON "EmailCampaign"("archivedAt");

-- CreateIndex
CREATE INDEX "EmailCampaignBlueprint_createdAt_idx" ON "EmailCampaignBlueprint"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailCampaignRecipient_trackingToken_key" ON "EmailCampaignRecipient"("trackingToken");

-- CreateIndex
CREATE INDEX "EmailCampaignRecipient_campaignId_status_idx" ON "EmailCampaignRecipient"("campaignId", "status");

-- CreateIndex
CREATE INDEX "EmailCampaignRecipient_contactId_idx" ON "EmailCampaignRecipient"("contactId");

-- CreateIndex
CREATE INDEX "EmailCampaignRecipient_status_idx" ON "EmailCampaignRecipient"("status");

-- CreateIndex
CREATE INDEX "EmailCampaignRecipient_nextStepAt_idx" ON "EmailCampaignRecipient"("nextStepAt");

-- CreateIndex
CREATE INDEX "EmailCampaignRecipient_variantId_idx" ON "EmailCampaignRecipient"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailCampaignRecipient_campaignId_contactId_key" ON "EmailCampaignRecipient"("campaignId", "contactId");

-- CreateIndex
CREATE INDEX "EmailCampaignStep_campaignId_stepOrder_idx" ON "EmailCampaignStep"("campaignId", "stepOrder");

-- CreateIndex
CREATE INDEX "EmailCampaignVariant_campaignId_idx" ON "EmailCampaignVariant"("campaignId");

-- CreateIndex
CREATE INDEX "EmailEvent_eventType_createdAt_idx" ON "EmailEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "EmailEvent_campaignId_idx" ON "EmailEvent"("campaignId");

-- CreateIndex
CREATE INDEX "EmailEvent_recipientId_idx" ON "EmailEvent"("recipientId");

-- CreateIndex
CREATE INDEX "EmailEvent_contactId_idx" ON "EmailEvent"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailLink_code_key" ON "EmailLink"("code");

-- CreateIndex
CREATE INDEX "EmailLink_campaignId_idx" ON "EmailLink"("campaignId");

-- CreateIndex
CREATE INDEX "EmailLinkClick_linkId_createdAt_idx" ON "EmailLinkClick"("linkId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailUnsubscribe_email_idx" ON "EmailUnsubscribe"("email");

-- CreateIndex
CREATE INDEX "EmailUnsubscribe_campaignId_idx" ON "EmailUnsubscribe"("campaignId");

-- CreateIndex
CREATE INDEX "EmailUnsubscribe_createdAt_idx" ON "EmailUnsubscribe"("createdAt");

-- CreateIndex
CREATE INDEX "EmailBulkJob_status_idx" ON "EmailBulkJob"("status");

-- CreateIndex
CREATE INDEX "EmailBulkJob_createdAt_idx" ON "EmailBulkJob"("createdAt");

-- CreateIndex
CREATE INDEX "EmailBulkUndo_expiresAt_idx" ON "EmailBulkUndo"("expiresAt");

-- CreateIndex
CREATE INDEX "EmailBulkUndo_createdAt_idx" ON "EmailBulkUndo"("createdAt");

-- CreateIndex
CREATE INDEX "EmailSendLog_campaignId_idx" ON "EmailSendLog"("campaignId");

-- CreateIndex
CREATE INDEX "EmailSendLog_status_createdAt_idx" ON "EmailSendLog"("status", "createdAt");

-- CreateIndex
CREATE INDEX "EmailSendLog_toEmail_idx" ON "EmailSendLog"("toEmail");

-- CreateIndex
CREATE INDEX "EmailThread_status_idx" ON "EmailThread"("status");

-- CreateIndex
CREATE INDEX "EmailThread_assignedTo_idx" ON "EmailThread"("assignedTo");

-- CreateIndex
CREATE INDEX "EmailThread_contactId_idx" ON "EmailThread"("contactId");

-- CreateIndex
CREATE INDEX "EmailThread_lastMessageAt_idx" ON "EmailThread"("lastMessageAt");

-- CreateIndex
CREATE INDEX "EmailThread_status_lastMessageAt_idx" ON "EmailThread"("status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "EmailThread_snoozedUntil_idx" ON "EmailThread"("snoozedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_providerMessageId_key" ON "EmailMessage"("providerMessageId");

-- CreateIndex
CREATE INDEX "EmailMessage_threadId_createdAt_idx" ON "EmailMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailMessage_contactId_idx" ON "EmailMessage"("contactId");

-- CreateIndex
CREATE INDEX "EmailMessage_campaignId_idx" ON "EmailMessage"("campaignId");

-- CreateIndex
CREATE INDEX "EmailMessage_status_idx" ON "EmailMessage"("status");

-- CreateIndex
CREATE INDEX "EmailMessage_direction_idx" ON "EmailMessage"("direction");

-- CreateIndex
CREATE INDEX "EmailMessage_inReplyTo_idx" ON "EmailMessage"("inReplyTo");

-- CreateIndex
CREATE INDEX "EmailThreadNote_threadId_createdAt_idx" ON "EmailThreadNote"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailCannedReply_title_idx" ON "EmailCannedReply"("title");

-- CreateIndex
CREATE INDEX "EmailRule_enabled_priority_idx" ON "EmailRule"("enabled", "priority");

-- CreateIndex
CREATE INDEX "EmailScheduledMessage_status_sendAt_idx" ON "EmailScheduledMessage"("status", "sendAt");

-- CreateIndex
CREATE INDEX "EmailScheduledMessage_threadId_idx" ON "EmailScheduledMessage"("threadId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailInboundMessage_messageId_key" ON "EmailInboundMessage"("messageId");

-- CreateIndex
CREATE INDEX "EmailInboundMessage_kind_createdAt_idx" ON "EmailInboundMessage"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "EmailInboundMessage_recipientId_idx" ON "EmailInboundMessage"("recipientId");

-- CreateIndex
CREATE INDEX "EmailAccount_userId_idx" ON "EmailAccount"("userId");

-- AddForeignKey
ALTER TABLE "EmailContact" ADD CONSTRAINT "EmailContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailContactSetMember" ADD CONSTRAINT "EmailContactSetMember_setId_fkey" FOREIGN KEY ("setId") REFERENCES "EmailContactSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailContactSetMember" ADD CONSTRAINT "EmailContactSetMember_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "EmailContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_footerSnippetId_fkey" FOREIGN KEY ("footerSnippetId") REFERENCES "EmailSnippet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTemplateVersion" ADD CONSTRAINT "EmailTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EmailTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "EmailSender"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EmailTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailCampaignRecipient" ADD CONSTRAINT "EmailCampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailCampaignRecipient" ADD CONSTRAINT "EmailCampaignRecipient_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "EmailContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailCampaignStep" ADD CONSTRAINT "EmailCampaignStep_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailCampaignVariant" ADD CONSTRAINT "EmailCampaignVariant_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLinkClick" ADD CONSTRAINT "EmailLinkClick_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "EmailLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "EmailSender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "EmailContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "EmailSender"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "EmailThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "EmailContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailThreadNote" ADD CONSTRAINT "EmailThreadNote_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "EmailThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailAccount" ADD CONSTRAINT "EmailAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

