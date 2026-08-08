-- =====================================================================
-- 20260501000000_billing_payment_subscription_system
-- Razorpay-backed Payment / Billing / Subscription / Entitlement system
-- Source-of-truth: Prisma schema.prisma (matching diff)
-- Idempotent where possible (CREATE TYPE / TABLE / INDEX use IF NOT EXISTS)
-- =====================================================================

-- ==========================================
-- 1. Enums
-- ==========================================

CREATE TYPE "PlanCategory" AS ENUM (
  'CANDIDATE_PREMIUM',
  'EMPLOYER_JOB_POST',
  'EMPLOYER_CV_DATABASE',
  'EMPLOYER_ASSISTED_HIRING',
  'VENDOR_CONNECT',
  'EMPLOYER_CV_ENTERPRISE_CUSTOM'
);

CREATE TYPE "PlanBillingCycle" AS ENUM (
  'ONE_TIME',
  'MONTHLY',
  'QUARTERLY',
  'HALF_YEARLY',
  'YEARLY',
  'CUSTOM'
);

CREATE TYPE "PlanStatus" AS ENUM (
  'DRAFT',
  'ACTIVE',
  'ARCHIVED',
  'HIDDEN'
);

CREATE TYPE "ResourceUnit" AS ENUM (
  'JOB_POST',
  'JOB_DAYS_LIVE',
  'APPLICATIONS',
  'CV_UNLOCK',
  'SEARCH_RESULT',
  'MATCHED_PROFILE_EMAIL',
  'FEATURE_FLAG',
  'SEAT',
  'BOOST_DAYS',
  'VENDOR_LEAD',
  'CUSTOM'
);

CREATE TYPE "PlanFeatureKind" AS ENUM (
  'COUNTABLE',
  'BOOLEAN',
  'ENUM',
  'TEXT'
);

CREATE TYPE "OrderStatus" AS ENUM (
  'CREATED',
  'ATTEMPTED',
  'PAID',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'REFUND_PENDING',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
  'DISPUTED',
  'FRAUD_FLAGGED'
);

CREATE TYPE "PaymentStatus" AS ENUM (
  'CREATED',
  'AUTHORIZED',
  'CAPTURED',
  'FAILED',
  'REFUNDED',
  'PARTIALLY_REFUNDED'
);

CREATE TYPE "PaymentMethod" AS ENUM (
  'CARD',
  'UPI',
  'NETBANKING',
  'WALLET',
  'EMI',
  'PAYLATER',
  'BANK_TRANSFER',
  'INTERNATIONAL',
  'UNKNOWN'
);

CREATE TYPE "PaymentChannel" AS ENUM (
  'CHECKOUT',
  'SUBSCRIPTION',
  'MANDATE',
  'MANUAL_MARK_PAID',
  'INTERNAL'
);

CREATE TYPE "SubscriptionStatus" AS ENUM (
  'CREATED',
  'AUTHENTICATED',
  'ACTIVE',
  'PAUSED',
  'HALTED',
  'CANCELLED',
  'COMPLETED',
  'EXPIRED',
  'PENDING_CANCEL'
);

CREATE TYPE "SubscriptionRenewalMode" AS ENUM (
  'AUTO_RENEW',
  'MANUAL',
  'OFF'
);

CREATE TYPE "MandateStatus" AS ENUM (
  'PENDING',
  'CONFIRMED',
  'ACTIVE',
  'CANCELLED',
  'FAILED'
);

CREATE TYPE "MandateMethod" AS ENUM (
  'EMANDATE',
  'UPI_AUTOPAY',
  'CARD'
);

CREATE TYPE "InvoiceStatus" AS ENUM (
  'DRAFT',
  'ISSUED',
  'PAID',
  'VOIDED',
  'REFUNDED'
);

CREATE TYPE "InvoiceType" AS ENUM (
  'PROFORMA',
  'TAX_INVOICE',
  'CREDIT_NOTE',
  'RECEIPT'
);

CREATE TYPE "RefundStatus" AS ENUM (
  'PENDING',
  'PROCESSED',
  'FAILED',
  'CANCELLED'
);

CREATE TYPE "RefundReason" AS ENUM (
  'USER_REQUESTED',
  'ADMIN_INITIATED',
  'FRAUD',
  'DUPLICATE',
  'CHARGEBACK',
  'ERROR_CORRECTION',
  'GOODWILL'
);

CREATE TYPE "CouponStatus" AS ENUM (
  'ACTIVE',
  'PAUSED',
  'EXPIRED',
  'ARCHIVED'
);

CREATE TYPE "CouponType" AS ENUM (
  'PERCENT',
  'FLAT',
  'FIRST_MONTH_FREE',
  'TRIAL_EXTEND',
  'FREE_PLAN'
);

CREATE TYPE "CouponScope" AS ENUM (
  'GLOBAL',
  'ROLE_TARGETED',
  'USER_TARGETED',
  'PLAN_TARGETED',
  'COMBO'
);

CREATE TYPE "CouponRedemptionStatus" AS ENUM (
  'SUCCESS',
  'REFUNDED',
  'REVERSED'
);

CREATE TYPE "EntitlementSource" AS ENUM (
  'PLAN',
  'BONUS',
  'MANUAL',
  'REFUND_CREDIT',
  'COUPON',
  'MIGRATION'
);

CREATE TYPE "EntitlementStatus" AS ENUM (
  'ACTIVE',
  'EXHAUSTED',
  'EXPIRED',
  'CANCELLED',
  'ON_HOLD'
);

CREATE TYPE "SettlementStatus" AS ENUM (
  'SCHEDULED',
  'PROCESSED',
  'FAILED'
);

CREATE TYPE "DisputeStatus" AS ENUM (
  'OPEN',
  'UNDER_REVIEW',
  'WON',
  'LOST',
  'ACCEPTED'
);

CREATE TYPE "RazorpayWebhookStatus" AS ENUM (
  'RECEIVED',
  'PROCESSING',
  'PROCESSED',
  'SKIPPED',
  'FAILED',
  'REPLAYED'
);

CREATE TYPE "QuoteRequestStatus" AS ENUM (
  'NEW',
  'IN_REVIEW',
  'CONTACTED',
  'NEGOTIATING',
  'ACCEPTED',
  'REJECTED',
  'CONVERTED',
  'WITHDRAWN'
);

CREATE TYPE "CustomPlanOfferStatus" AS ENUM (
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'EXPIRED',
  'REJECTED'
);

CREATE TYPE "PriceAdjustmentReason" AS ENUM (
  'PRORATION',
  'COUPON',
  'GOODWILL_CREDIT',
  'MANUAL',
  'TAX',
  'ROUNDING',
  'REFUND_CREDIT'
);

CREATE TYPE "LedgerEntryType" AS ENUM (
  'ORDER_CHARGE',
  'REFUND',
  'COUPON_DISCOUNT',
  'CARRY_FORWARD',
  'MANUAL_CREDIT',
  'MANUAL_DEBIT',
  'TAX',
  'ADJUSTMENT'
);

CREATE TYPE "FraudSignal" AS ENUM (
  'MULTI_ACCOUNT_SAME_CARD',
  'VELOCITY_BURST',
  'GEO_MISMATCH',
  'EMAIL_DOMAIN_DISPOSABLE',
  'IP_BLACKLIST',
  'BIN_BLACKLIST',
  'CHARGEBACK_RATE',
  'MANUAL'
);

CREATE TYPE "FraudSeverity" AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL'
);

CREATE TYPE "FraudAction" AS ENUM (
  'NONE',
  'REVIEW',
  'BLOCK',
  'REFUND_AND_BLOCK'
);

CREATE TYPE "TaxRegion" AS ENUM (
  'IN_INTRA_STATE',
  'IN_INTER_STATE',
  'INTERNATIONAL',
  'EXEMPT'
);

CREATE TYPE "BillingNotificationKind" AS ENUM (
  'ORDER_PLACED',
  'PAYMENT_CAPTURED',
  'PAYMENT_FAILED',
  'SUBSCRIPTION_ACTIVATED',
  'SUBSCRIPTION_RENEWED',
  'SUBSCRIPTION_FAILED',
  'SUBSCRIPTION_CANCELLED',
  'REMINDER_7',
  'REMINDER_3',
  'REMINDER_1',
  'PLAN_EXPIRED',
  'REFUND_PROCESSED',
  'CUSTOM_PLAN_OFFER',
  'FRAUD_ALERT',
  'QUOTE_RECEIVED',
  'UPGRADED',
  'DOWNGRADED'
);

CREATE TYPE "ResourceLedgerReason" AS ENUM (
  'GRANT',
  'CONSUME',
  'ROLLBACK',
  'ADJUSTMENT',
  'CARRY_FORWARD',
  'EXPIRY',
  'REFUND_RESTORE',
  'ADMIN_ADJUST'
);

-- ==========================================
-- 2. Tables
-- ==========================================

-- Plan
CREATE TABLE "Plan" (
  "id"               TEXT NOT NULL,
  "code"             TEXT NOT NULL,
  "name"             TEXT NOT NULL,
  "slug"             TEXT NOT NULL,
  "category"         "PlanCategory" NOT NULL,
  "billingCycle"     "PlanBillingCycle" NOT NULL,
  "status"           "PlanStatus" NOT NULL DEFAULT 'DRAFT',
  "basePricePaise"   INTEGER NOT NULL,
  "currency"         TEXT NOT NULL DEFAULT 'INR',
  "gstRatePercent"   INTEGER NOT NULL DEFAULT 18,
  "gstInclusive"     BOOLEAN NOT NULL DEFAULT TRUE,
  "hsnCode"          TEXT DEFAULT '998314',
  "validityDays"     INTEGER,
  "trialDays"        INTEGER NOT NULL DEFAULT 0,
  "displayOrder"     INTEGER NOT NULL DEFAULT 100,
  "highlight"        BOOLEAN NOT NULL DEFAULT FALSE,
  "badgeText"        TEXT,
  "shortDescription" TEXT,
  "descriptionHtml"  TEXT,
  "isCustom"         BOOLEAN NOT NULL DEFAULT FALSE,
  "requiresQuote"    BOOLEAN NOT NULL DEFAULT FALSE,
  "isPublic"         BOOLEAN NOT NULL DEFAULT TRUE,
  "razorpayPlanId"   TEXT,
  "metadata"         JSONB,
  "createdById"      TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan" ("code");
CREATE UNIQUE INDEX "Plan_slug_key" ON "Plan" ("slug");
CREATE INDEX "Plan_category_status_idx" ON "Plan" ("category","status");
CREATE INDEX "Plan_status_displayOrder_idx" ON "Plan" ("status","displayOrder");
CREATE INDEX "Plan_isPublic_status_idx" ON "Plan" ("isPublic","status");

-- PlanFeature
CREATE TABLE "PlanFeature" (
  "id"             TEXT NOT NULL,
  "planId"         TEXT NOT NULL,
  "key"            TEXT NOT NULL,
  "label"          TEXT NOT NULL,
  "kind"           "PlanFeatureKind" NOT NULL DEFAULT 'BOOLEAN',
  "countableLimit" INTEGER,
  "enumValue"      TEXT,
  "textValue"      TEXT,
  "included"       BOOLEAN NOT NULL DEFAULT TRUE,
  "displayOrder"   INTEGER NOT NULL DEFAULT 100,
  "description"    TEXT,
  CONSTRAINT "PlanFeature_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlanFeature_planId_key_key" ON "PlanFeature" ("planId","key");
CREATE INDEX "PlanFeature_planId_idx" ON "PlanFeature" ("planId");

-- PlanResource
CREATE TABLE "PlanResource" (
  "id"              TEXT NOT NULL,
  "planId"          TEXT NOT NULL,
  "unit"            "ResourceUnit" NOT NULL,
  "quantity"        INTEGER NOT NULL,
  "perPeriodReset"  BOOLEAN NOT NULL DEFAULT TRUE,
  "carryForwardCap" INTEGER,
  "notes"           TEXT,
  CONSTRAINT "PlanResource_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlanResource_planId_unit_key" ON "PlanResource" ("planId","unit");
CREATE INDEX "PlanResource_planId_idx" ON "PlanResource" ("planId");

-- PlanVersion
CREATE TABLE "PlanVersion" (
  "id"            TEXT NOT NULL,
  "planId"        TEXT NOT NULL,
  "version"       INTEGER NOT NULL,
  "diff"          JSONB NOT NULL,
  "publishedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedById" TEXT,
  CONSTRAINT "PlanVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlanVersion_planId_version_key" ON "PlanVersion" ("planId","version");
CREATE INDEX "PlanVersion_planId_idx" ON "PlanVersion" ("planId");

-- BillingAddress
CREATE TABLE "BillingAddress" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "label"       TEXT,
  "line1"       TEXT NOT NULL,
  "line2"       TEXT,
  "city"        TEXT NOT NULL,
  "stateName"   TEXT NOT NULL,
  "stateCode"   TEXT NOT NULL,
  "pincode"     TEXT NOT NULL,
  "country"     TEXT NOT NULL DEFAULT 'India',
  "countryCode" TEXT NOT NULL DEFAULT 'IN',
  "gstNumber"   TEXT,
  "legalName"   TEXT,
  "isDefault"   BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingAddress_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BillingAddress_userId_isDefault_idx" ON "BillingAddress" ("userId","isDefault");
CREATE INDEX "BillingAddress_userId_idx" ON "BillingAddress" ("userId");

-- Coupon
CREATE TABLE "Coupon" (
  "id"                    TEXT NOT NULL,
  "code"                  TEXT NOT NULL,
  "name"                  TEXT NOT NULL,
  "type"                  "CouponType" NOT NULL,
  "valuePaise"            INTEGER,
  "valuePercent"          INTEGER,
  "maxDiscountPaise"      INTEGER,
  "trialExtendDays"       INTEGER,
  "scope"                 "CouponScope" NOT NULL DEFAULT 'GLOBAL',
  "status"                "CouponStatus" NOT NULL DEFAULT 'ACTIVE',
  "startsAt"              TIMESTAMP(3),
  "endsAt"                TIMESTAMP(3),
  "maxRedemptions"        INTEGER,
  "maxRedemptionsPerUser" INTEGER NOT NULL DEFAULT 1,
  "redemptionsCount"      INTEGER NOT NULL DEFAULT 0,
  "minOrderAmountPaise"   INTEGER NOT NULL DEFAULT 0,
  "allowedPlanIds"        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "excludedPlanIds"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "allowedRoles"          "Role"[] NOT NULL DEFAULT ARRAY[]::"Role"[],
  "allowedUserIds"        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "comboAllowed"          BOOLEAN NOT NULL DEFAULT FALSE,
  "stackable"             BOOLEAN NOT NULL DEFAULT FALSE,
  "autoApply"             BOOLEAN NOT NULL DEFAULT FALSE,
  "descriptionHtml"       TEXT,
  "internalNotes"         TEXT,
  "createdById"           TEXT,
  "metadata"              JSONB,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon" ("code");
CREATE INDEX "Coupon_status_endsAt_idx" ON "Coupon" ("status","endsAt");
CREATE INDEX "Coupon_scope_idx" ON "Coupon" ("scope");

-- Order
CREATE TABLE "Order" (
  "id"                   TEXT NOT NULL,
  "userId"               TEXT NOT NULL,
  "planId"               TEXT NOT NULL,
  "planSnapshot"         JSONB NOT NULL,
  "couponId"             TEXT,
  "billingAddressId"     TEXT,
  "originalAmountPaise"  INTEGER NOT NULL,
  "discountPaise"        INTEGER NOT NULL DEFAULT 0,
  "prorationPaise"       INTEGER NOT NULL DEFAULT 0,
  "taxableAmountPaise"   INTEGER NOT NULL,
  "cgstPaise"            INTEGER NOT NULL DEFAULT 0,
  "sgstPaise"            INTEGER NOT NULL DEFAULT 0,
  "igstPaise"            INTEGER NOT NULL DEFAULT 0,
  "cessPaise"            INTEGER NOT NULL DEFAULT 0,
  "taxPaise"             INTEGER NOT NULL DEFAULT 0,
  "totalPaise"           INTEGER NOT NULL,
  "currency"             TEXT NOT NULL DEFAULT 'INR',
  "taxRegion"            "TaxRegion" NOT NULL DEFAULT 'IN_INTRA_STATE',
  "status"               "OrderStatus" NOT NULL DEFAULT 'CREATED',
  "channel"              "PaymentChannel" NOT NULL DEFAULT 'CHECKOUT',
  "idempotencyKey"       TEXT NOT NULL,
  "receiptNumber"        TEXT NOT NULL,
  "razorpayOrderId"      TEXT,
  "gstNumber"            TEXT,
  "legalName"            TEXT,
  "placeOfSupplyState"   TEXT,
  "buyerEmail"           TEXT,
  "buyerPhone"           TEXT,
  "buyerCountry"         TEXT DEFAULT 'IN',
  "upgradeFromOrderId"   TEXT,
  "parentSubscriptionId" TEXT,
  "notes"                JSONB,
  "metadata"             JSONB,
  "ipAddress"            TEXT,
  "userAgent"            TEXT,
  "deviceFingerprint"    TEXT,
  "fraudScore"           INTEGER NOT NULL DEFAULT 0,
  "fraudAction"          "FraudAction" NOT NULL DEFAULT 'NONE',
  "expiresAt"            TIMESTAMP(3),
  "paidAt"               TIMESTAMP(3),
  "refundedAt"           TIMESTAMP(3),
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order" ("idempotencyKey");
CREATE UNIQUE INDEX "Order_receiptNumber_key" ON "Order" ("receiptNumber");
CREATE UNIQUE INDEX "Order_razorpayOrderId_key" ON "Order" ("razorpayOrderId");
CREATE UNIQUE INDEX "Order_upgradeFromOrderId_key" ON "Order" ("upgradeFromOrderId");
CREATE INDEX "Order_userId_status_idx" ON "Order" ("userId","status");
CREATE INDEX "Order_planId_createdAt_idx" ON "Order" ("planId","createdAt");
CREATE INDEX "Order_status_createdAt_idx" ON "Order" ("status","createdAt");
CREATE INDEX "Order_razorpayOrderId_idx" ON "Order" ("razorpayOrderId");
CREATE INDEX "Order_createdAt_idx" ON "Order" ("createdAt");

-- Subscription
CREATE TABLE "Subscription" (
  "id"                     TEXT NOT NULL,
  "userId"                 TEXT NOT NULL,
  "planId"                 TEXT NOT NULL,
  "planSnapshot"           JSONB NOT NULL,
  "razorpaySubscriptionId" TEXT,
  "status"                 "SubscriptionStatus" NOT NULL DEFAULT 'CREATED',
  "renewalMode"            "SubscriptionRenewalMode" NOT NULL DEFAULT 'AUTO_RENEW',
  "autoRenew"              BOOLEAN NOT NULL DEFAULT TRUE,
  "cancelAtCycleEnd"       BOOLEAN NOT NULL DEFAULT FALSE,
  "mandateId"              TEXT,
  "currentStart"           TIMESTAMP(3),
  "currentEnd"             TIMESTAMP(3),
  "nextChargeAt"           TIMESTAMP(3),
  "totalCount"             INTEGER,
  "paidCount"              INTEGER NOT NULL DEFAULT 0,
  "remainingCount"         INTEGER,
  "failureCount"           INTEGER NOT NULL DEFAULT 0,
  "gracePeriodUntil"       TIMESTAMP(3),
  "pausedAt"               TIMESTAMP(3),
  "pausedBy"               TEXT,
  "pauseReason"            TEXT,
  "cancelledAt"            TIMESTAMP(3),
  "cancelledBy"            TEXT,
  "cancelReason"           TEXT,
  "endedAt"                TIMESTAMP(3),
  "shortUrl"               TEXT,
  "pendingPlanChangeId"    TEXT,
  "pendingPlanChangeData"  JSONB,
  "metadata"               JSONB,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Subscription_razorpaySubscriptionId_key" ON "Subscription" ("razorpaySubscriptionId");
CREATE INDEX "Subscription_userId_status_idx" ON "Subscription" ("userId","status");
CREATE INDEX "Subscription_nextChargeAt_idx" ON "Subscription" ("nextChargeAt");
CREATE INDEX "Subscription_status_currentEnd_idx" ON "Subscription" ("status","currentEnd");

-- Mandate
CREATE TABLE "Mandate" (
  "id"              TEXT NOT NULL,
  "userId"          TEXT NOT NULL,
  "razorpayTokenId" TEXT NOT NULL,
  "method"          "MandateMethod" NOT NULL,
  "status"          "MandateStatus" NOT NULL DEFAULT 'PENDING',
  "maxAmountPaise"  INTEGER NOT NULL,
  "frequency"       TEXT,
  "vpa"             TEXT,
  "bankName"        TEXT,
  "bankCode"        TEXT,
  "accountLast4"    TEXT,
  "cardLast4"       TEXT,
  "network"         TEXT,
  "mandateUrl"      TEXT,
  "startsAt"        TIMESTAMP(3),
  "expiresAt"       TIMESTAMP(3),
  "raw"             JSONB,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Mandate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Mandate_razorpayTokenId_key" ON "Mandate" ("razorpayTokenId");
CREATE INDEX "Mandate_userId_idx" ON "Mandate" ("userId");
CREATE INDEX "Mandate_status_idx" ON "Mandate" ("status");

-- Payment
CREATE TABLE "Payment" (
  "id"                 TEXT NOT NULL,
  "orderId"            TEXT NOT NULL,
  "userId"             TEXT NOT NULL,
  "razorpayPaymentId"  TEXT NOT NULL,
  "status"             "PaymentStatus" NOT NULL DEFAULT 'CREATED',
  "method"             "PaymentMethod" NOT NULL DEFAULT 'UNKNOWN',
  "amountPaise"        INTEGER NOT NULL,
  "feePaise"           INTEGER NOT NULL DEFAULT 0,
  "taxPaise"           INTEGER NOT NULL DEFAULT 0,
  "capturedPaise"      INTEGER NOT NULL DEFAULT 0,
  "capturedAt"         TIMESTAMP(3),
  "authorizedAt"       TIMESTAMP(3),
  "errorCode"          TEXT,
  "errorDescription"   TEXT,
  "errorSource"        TEXT,
  "errorStep"          TEXT,
  "errorReason"        TEXT,
  "vpa"                TEXT,
  "bank"               TEXT,
  "wallet"             TEXT,
  "cardLast4"          TEXT,
  "cardNetwork"        TEXT,
  "cardIssuer"         TEXT,
  "cardType"           TEXT,
  "cardInternational"  BOOLEAN NOT NULL DEFAULT FALSE,
  "cardFingerprint"    TEXT,
  "emiTenure"          INTEGER,
  "international"      BOOLEAN NOT NULL DEFAULT FALSE,
  "currency"           TEXT NOT NULL DEFAULT 'INR',
  "subscriptionId"     TEXT,
  "invoiceId"          TEXT,
  "raw"                JSONB,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Payment_razorpayPaymentId_key" ON "Payment" ("razorpayPaymentId");
CREATE INDEX "Payment_orderId_idx" ON "Payment" ("orderId");
CREATE INDEX "Payment_userId_idx" ON "Payment" ("userId");
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment" ("status","createdAt");
CREATE INDEX "Payment_cardFingerprint_idx" ON "Payment" ("cardFingerprint");
CREATE INDEX "Payment_subscriptionId_idx" ON "Payment" ("subscriptionId");

-- PaymentAttempt
CREATE TABLE "PaymentAttempt" (
  "id"                TEXT NOT NULL,
  "orderId"           TEXT NOT NULL,
  "userId"            TEXT,
  "status"            TEXT NOT NULL,
  "errorCode"         TEXT,
  "errorDescription"  TEXT,
  "ipAddress"         TEXT,
  "userAgent"         TEXT,
  "deviceFingerprint" TEXT,
  "attemptedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "raw"               JSONB,
  CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PaymentAttempt_orderId_idx" ON "PaymentAttempt" ("orderId");
CREATE INDEX "PaymentAttempt_attemptedAt_idx" ON "PaymentAttempt" ("attemptedAt");

-- SubscriptionEvent
CREATE TABLE "SubscriptionEvent" (
  "id"             TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "kind"           TEXT NOT NULL,
  "happenedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payloadHash"    TEXT NOT NULL,
  "raw"            JSONB NOT NULL,
  CONSTRAINT "SubscriptionEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SubscriptionEvent_subscriptionId_idx" ON "SubscriptionEvent" ("subscriptionId");
CREATE INDEX "SubscriptionEvent_kind_happenedAt_idx" ON "SubscriptionEvent" ("kind","happenedAt");

-- PaymentMethodToken
CREATE TABLE "PaymentMethodToken" (
  "id"              TEXT NOT NULL,
  "userId"          TEXT NOT NULL,
  "type"            TEXT NOT NULL,
  "razorpayTokenId" TEXT NOT NULL,
  "last4"           TEXT,
  "network"         TEXT,
  "vpaHandle"       TEXT,
  "bankCode"        TEXT,
  "expiryMonth"     INTEGER,
  "expiryYear"      INTEGER,
  "isDefault"       BOOLEAN NOT NULL DEFAULT FALSE,
  "status"          TEXT NOT NULL DEFAULT 'ACTIVE',
  "raw"             JSONB,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentMethodToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentMethodToken_razorpayTokenId_key" ON "PaymentMethodToken" ("razorpayTokenId");
CREATE INDEX "PaymentMethodToken_userId_isDefault_idx" ON "PaymentMethodToken" ("userId","isDefault");
CREATE INDEX "PaymentMethodToken_status_idx" ON "PaymentMethodToken" ("status");

-- Invoice
CREATE TABLE "Invoice" (
  "id"                 TEXT NOT NULL,
  "invoiceNumber"      TEXT NOT NULL,
  "userId"             TEXT NOT NULL,
  "orderId"            TEXT,
  "subscriptionId"     TEXT,
  "billingAddressId"   TEXT,
  "type"               "InvoiceType" NOT NULL DEFAULT 'TAX_INVOICE',
  "status"             "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "sellerGstin"        TEXT NOT NULL,
  "sellerLegalName"    TEXT NOT NULL,
  "sellerStateCode"    TEXT NOT NULL,
  "buyerGstin"         TEXT,
  "buyerLegalName"     TEXT,
  "buyerStateCode"     TEXT,
  "placeOfSupply"      TEXT NOT NULL,
  "taxRegion"          "TaxRegion" NOT NULL,
  "hsnCode"            TEXT NOT NULL DEFAULT '998314',
  "subtotalPaise"      INTEGER NOT NULL,
  "discountPaise"      INTEGER NOT NULL DEFAULT 0,
  "taxableAmountPaise" INTEGER NOT NULL,
  "cgstPaise"          INTEGER NOT NULL DEFAULT 0,
  "sgstPaise"          INTEGER NOT NULL DEFAULT 0,
  "igstPaise"          INTEGER NOT NULL DEFAULT 0,
  "cessPaise"          INTEGER NOT NULL DEFAULT 0,
  "totalPaise"         INTEGER NOT NULL,
  "paidPaise"          INTEGER NOT NULL DEFAULT 0,
  "refundedPaise"      INTEGER NOT NULL DEFAULT 0,
  "currency"           TEXT NOT NULL DEFAULT 'INR',
  "gstPercent"         INTEGER NOT NULL DEFAULT 18,
  "periodStart"        TIMESTAMP(3),
  "periodEnd"          TIMESTAMP(3),
  "pdfUrl"             TEXT,
  "jsonUrl"            TEXT,
  "eInvoiceIrn"        TEXT,
  "eInvoiceQrUrl"      TEXT,
  "eInvoiceAckNo"      TEXT,
  "eInvoiceAckDate"    TIMESTAMP(3),
  "issuedAt"           TIMESTAMP(3),
  "voidedAt"           TIMESTAMP(3),
  "voidReason"         TEXT,
  "metadata"           JSONB,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice" ("invoiceNumber");
CREATE INDEX "Invoice_userId_issuedAt_idx" ON "Invoice" ("userId","issuedAt");
CREATE INDEX "Invoice_orderId_idx" ON "Invoice" ("orderId");
CREATE INDEX "Invoice_subscriptionId_idx" ON "Invoice" ("subscriptionId");
CREATE INDEX "Invoice_status_idx" ON "Invoice" ("status");

-- InvoiceLine
CREATE TABLE "InvoiceLine" (
  "id"                 TEXT NOT NULL,
  "invoiceId"          TEXT NOT NULL,
  "description"        TEXT NOT NULL,
  "hsnCode"            TEXT,
  "sacCode"            TEXT,
  "quantity"           INTEGER NOT NULL DEFAULT 1,
  "unitPricePaise"     INTEGER NOT NULL,
  "discountPaise"      INTEGER NOT NULL DEFAULT 0,
  "taxableAmountPaise" INTEGER NOT NULL,
  "gstPercent"         INTEGER NOT NULL DEFAULT 18,
  "cgstPaise"          INTEGER NOT NULL DEFAULT 0,
  "sgstPaise"          INTEGER NOT NULL DEFAULT 0,
  "igstPaise"          INTEGER NOT NULL DEFAULT 0,
  "cessPaise"          INTEGER NOT NULL DEFAULT 0,
  "totalPaise"         INTEGER NOT NULL,
  "metadata"           JSONB,
  CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine" ("invoiceId");

-- InvoiceSequence
CREATE TABLE "InvoiceSequence" (
  "id"            TEXT NOT NULL,
  "financialYear" TEXT NOT NULL,
  "prefix"        TEXT NOT NULL DEFAULT 'HA',
  "lastNumber"    INTEGER NOT NULL DEFAULT 0,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InvoiceSequence_financialYear_prefix_key" ON "InvoiceSequence" ("financialYear","prefix");

-- CouponRedemption
CREATE TABLE "CouponRedemption" (
  "id"             TEXT NOT NULL,
  "couponId"       TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "orderId"        TEXT,
  "subscriptionId" TEXT,
  "redeemedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "discountPaise"  INTEGER NOT NULL,
  "status"         "CouponRedemptionStatus" NOT NULL DEFAULT 'SUCCESS',
  CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CouponRedemption_orderId_key" ON "CouponRedemption" ("orderId");
CREATE INDEX "CouponRedemption_couponId_status_idx" ON "CouponRedemption" ("couponId","status");
CREATE INDEX "CouponRedemption_userId_idx" ON "CouponRedemption" ("userId");

-- Refund
CREATE TABLE "Refund" (
  "id"                TEXT NOT NULL,
  "paymentId"         TEXT NOT NULL,
  "orderId"           TEXT NOT NULL,
  "razorpayRefundId"  TEXT NOT NULL,
  "amountPaise"       INTEGER NOT NULL,
  "reason"            "RefundReason" NOT NULL DEFAULT 'USER_REQUESTED',
  "notes"             TEXT,
  "status"            "RefundStatus" NOT NULL DEFAULT 'PENDING',
  "initiatedById"     TEXT,
  "processedAt"       TIMESTAMP(3),
  "errorCode"         TEXT,
  "errorDescription"  TEXT,
  "raw"               JSONB,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Refund_razorpayRefundId_key" ON "Refund" ("razorpayRefundId");
CREATE INDEX "Refund_paymentId_idx" ON "Refund" ("paymentId");
CREATE INDEX "Refund_orderId_idx" ON "Refund" ("orderId");
CREATE INDEX "Refund_status_idx" ON "Refund" ("status");

-- Settlement
CREATE TABLE "Settlement" (
  "id"                   TEXT NOT NULL,
  "razorpaySettlementId" TEXT NOT NULL,
  "settledOnDate"        TIMESTAMP(3) NOT NULL,
  "amountPaise"          INTEGER NOT NULL,
  "feesPaise"            INTEGER NOT NULL DEFAULT 0,
  "taxPaise"             INTEGER NOT NULL DEFAULT 0,
  "netPaise"             INTEGER NOT NULL DEFAULT 0,
  "utr"                  TEXT,
  "status"               "SettlementStatus" NOT NULL DEFAULT 'PROCESSED',
  "raw"                  JSONB,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Settlement_razorpaySettlementId_key" ON "Settlement" ("razorpaySettlementId");
CREATE INDEX "Settlement_settledOnDate_idx" ON "Settlement" ("settledOnDate");
CREATE INDEX "Settlement_status_idx" ON "Settlement" ("status");

-- SettlementTransaction
CREATE TABLE "SettlementTransaction" (
  "id"           TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "paymentId"    TEXT,
  "refundId"     TEXT,
  "type"         TEXT NOT NULL,
  "amountPaise"  INTEGER NOT NULL,
  "feePaise"     INTEGER NOT NULL DEFAULT 0,
  "taxPaise"     INTEGER NOT NULL DEFAULT 0,
  "raw"          JSONB,
  CONSTRAINT "SettlementTransaction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SettlementTransaction_settlementId_idx" ON "SettlementTransaction" ("settlementId");
CREATE INDEX "SettlementTransaction_paymentId_idx" ON "SettlementTransaction" ("paymentId");
CREATE INDEX "SettlementTransaction_refundId_idx" ON "SettlementTransaction" ("refundId");

-- Dispute
CREATE TABLE "Dispute" (
  "id"                TEXT NOT NULL,
  "paymentId"         TEXT NOT NULL,
  "razorpayDisputeId" TEXT NOT NULL,
  "status"            "DisputeStatus" NOT NULL DEFAULT 'OPEN',
  "reasonCode"        TEXT,
  "reasonDescription" TEXT,
  "amountPaise"       INTEGER NOT NULL,
  "dueByAt"           TIMESTAMP(3),
  "raw"               JSONB,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Dispute_razorpayDisputeId_key" ON "Dispute" ("razorpayDisputeId");
CREATE INDEX "Dispute_paymentId_idx" ON "Dispute" ("paymentId");
CREATE INDEX "Dispute_status_dueByAt_idx" ON "Dispute" ("status","dueByAt");

-- Entitlement
CREATE TABLE "Entitlement" (
  "id"                   TEXT NOT NULL,
  "userId"               TEXT NOT NULL,
  "planId"               TEXT NOT NULL,
  "source"               "EntitlementSource" NOT NULL DEFAULT 'PLAN',
  "sourceOrderId"        TEXT,
  "sourceSubscriptionId" TEXT,
  "sourceCouponId"       TEXT,
  "status"               "EntitlementStatus" NOT NULL DEFAULT 'ACTIVE',
  "validFrom"            TIMESTAMP(3) NOT NULL,
  "validUntil"           TIMESTAMP(3) NOT NULL,
  "autoRenew"            BOOLEAN NOT NULL DEFAULT FALSE,
  "gracePeriodUntil"     TIMESTAMP(3),
  "cancelledAt"          TIMESTAMP(3),
  "metadata"             JSONB,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Entitlement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Entitlement_userId_status_idx" ON "Entitlement" ("userId","status");
CREATE INDEX "Entitlement_validUntil_idx" ON "Entitlement" ("validUntil");
CREATE INDEX "Entitlement_planId_idx" ON "Entitlement" ("planId");

-- EntitlementResource
CREATE TABLE "EntitlementResource" (
  "id"             TEXT NOT NULL,
  "entitlementId"  TEXT NOT NULL,
  "unit"           "ResourceUnit" NOT NULL,
  "allocated"      INTEGER NOT NULL DEFAULT 0,
  "consumed"       INTEGER NOT NULL DEFAULT 0,
  "carriedForward" INTEGER NOT NULL DEFAULT 0,
  "lastConsumedAt" TIMESTAMP(3),
  CONSTRAINT "EntitlementResource_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EntitlementResource_entitlementId_unit_key" ON "EntitlementResource" ("entitlementId","unit");
CREATE INDEX "EntitlementResource_entitlementId_idx" ON "EntitlementResource" ("entitlementId");

-- ResourceLedger
CREATE TABLE "ResourceLedger" (
  "id"                    TEXT NOT NULL,
  "entitlementResourceId" TEXT NOT NULL,
  "userId"                TEXT NOT NULL,
  "delta"                 INTEGER NOT NULL,
  "reason"                "ResourceLedgerReason" NOT NULL,
  "refType"               TEXT,
  "refId"                 TEXT,
  "notes"                 TEXT,
  "ipAddress"             TEXT,
  "userAgent"             TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResourceLedger_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ResourceLedger_entitlementResourceId_idx" ON "ResourceLedger" ("entitlementResourceId");
CREATE INDEX "ResourceLedger_userId_createdAt_idx" ON "ResourceLedger" ("userId","createdAt");
CREATE INDEX "ResourceLedger_refType_refId_idx" ON "ResourceLedger" ("refType","refId");

-- BillingLedger
CREATE TABLE "BillingLedger" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "type"        "LedgerEntryType" NOT NULL,
  "amountPaise" INTEGER NOT NULL,
  "currency"    TEXT NOT NULL DEFAULT 'INR',
  "refType"     TEXT,
  "refId"       TEXT,
  "orderId"     TEXT,
  "narration"   TEXT,
  "metadata"    JSONB,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingLedger_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BillingLedger_userId_createdAt_idx" ON "BillingLedger" ("userId","createdAt");
CREATE INDEX "BillingLedger_type_createdAt_idx" ON "BillingLedger" ("type","createdAt");
CREATE INDEX "BillingLedger_refType_refId_idx" ON "BillingLedger" ("refType","refId");

-- PriceAdjustment
CREATE TABLE "PriceAdjustment" (
  "id"             TEXT NOT NULL,
  "orderId"        TEXT,
  "subscriptionId" TEXT,
  "reason"         "PriceAdjustmentReason" NOT NULL,
  "amountPaise"    INTEGER NOT NULL,
  "narration"      TEXT,
  "createdById"    TEXT,
  "metadata"       JSONB,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PriceAdjustment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PriceAdjustment_orderId_idx" ON "PriceAdjustment" ("orderId");
CREATE INDEX "PriceAdjustment_subscriptionId_idx" ON "PriceAdjustment" ("subscriptionId");

-- RazorpayWebhookEvent
CREATE TABLE "RazorpayWebhookEvent" (
  "id"               TEXT NOT NULL,
  "razorpayEventId"  TEXT NOT NULL,
  "event"            TEXT NOT NULL,
  "accountId"        TEXT,
  "signatureValid"   BOOLEAN NOT NULL DEFAULT FALSE,
  "receivedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt"      TIMESTAMP(3),
  "status"           "RazorpayWebhookStatus" NOT NULL DEFAULT 'RECEIVED',
  "retryCount"       INTEGER NOT NULL DEFAULT 0,
  "errorMessage"     TEXT,
  "payload"          JSONB NOT NULL,
  "payloadHash"      TEXT NOT NULL,
  "replayCount"      INTEGER NOT NULL DEFAULT 0,
  "lastReplayedAt"   TIMESTAMP(3),
  "lastReplayedById" TEXT,
  CONSTRAINT "RazorpayWebhookEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RazorpayWebhookEvent_razorpayEventId_key" ON "RazorpayWebhookEvent" ("razorpayEventId");
CREATE INDEX "RazorpayWebhookEvent_event_status_idx" ON "RazorpayWebhookEvent" ("event","status");
CREATE INDEX "RazorpayWebhookEvent_receivedAt_idx" ON "RazorpayWebhookEvent" ("receivedAt");
CREATE INDEX "RazorpayWebhookEvent_status_retryCount_idx" ON "RazorpayWebhookEvent" ("status","retryCount");

-- QuoteRequest
CREATE TABLE "QuoteRequest" (
  "id"               TEXT NOT NULL,
  "userId"           TEXT NOT NULL,
  "companyName"      TEXT NOT NULL,
  "contactPerson"    TEXT NOT NULL,
  "designation"      TEXT,
  "email"            TEXT NOT NULL,
  "phone"            TEXT NOT NULL,
  "employeeRange"    TEXT,
  "hiringNeed"       TEXT,
  "requiredCvCount"  INTEGER,
  "validityDays"     INTEGER,
  "expectedSeats"    INTEGER,
  "currentToolStack" TEXT,
  "budgetRange"      TEXT,
  "additionalNotes"  TEXT,
  "status"           "QuoteRequestStatus" NOT NULL DEFAULT 'NEW',
  "assignedToId"     TEXT,
  "slaDueAt"         TIMESTAMP(3),
  "contactedAt"      TIMESTAMP(3),
  "ipAddress"        TEXT,
  "userAgent"        TEXT,
  "metadata"         JSONB,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuoteRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "QuoteRequest_userId_idx" ON "QuoteRequest" ("userId");
CREATE INDEX "QuoteRequest_status_slaDueAt_idx" ON "QuoteRequest" ("status","slaDueAt");
CREATE INDEX "QuoteRequest_assignedToId_idx" ON "QuoteRequest" ("assignedToId");

-- CustomPlanOffer
CREATE TABLE "CustomPlanOffer" (
  "id"              TEXT NOT NULL,
  "quoteRequestId"  TEXT NOT NULL,
  "planId"          TEXT,
  "basePricePaise"  INTEGER NOT NULL,
  "validityDays"    INTEGER NOT NULL,
  "cvUnlocks"       INTEGER NOT NULL DEFAULT 0,
  "seats"           INTEGER NOT NULL DEFAULT 1,
  "features"        JSONB,
  "resources"       JSONB,
  "status"          "CustomPlanOfferStatus" NOT NULL DEFAULT 'DRAFT',
  "expiresAt"       TIMESTAMP(3),
  "createdById"     TEXT,
  "acceptedAt"      TIMESTAMP(3),
  "acceptedOrderId" TEXT,
  "metadata"        JSONB,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomPlanOffer_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomPlanOffer_quoteRequestId_idx" ON "CustomPlanOffer" ("quoteRequestId");
CREATE INDEX "CustomPlanOffer_status_expiresAt_idx" ON "CustomPlanOffer" ("status","expiresAt");

-- FraudSignalEvent
CREATE TABLE "FraudSignalEvent" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT,
  "orderId"      TEXT,
  "paymentId"    TEXT,
  "signal"       "FraudSignal" NOT NULL,
  "severity"     "FraudSeverity" NOT NULL DEFAULT 'LOW',
  "evidence"     JSONB,
  "action"       "FraudAction" NOT NULL DEFAULT 'NONE',
  "reviewedById" TEXT,
  "reviewedAt"   TIMESTAMP(3),
  "notes"        TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FraudSignalEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FraudSignalEvent_userId_createdAt_idx" ON "FraudSignalEvent" ("userId","createdAt");
CREATE INDEX "FraudSignalEvent_severity_action_idx" ON "FraudSignalEvent" ("severity","action");
CREATE INDEX "FraudSignalEvent_signal_idx" ON "FraudSignalEvent" ("signal");
CREATE INDEX "FraudSignalEvent_createdAt_idx" ON "FraudSignalEvent" ("createdAt");

-- FraudRule
CREATE TABLE "FraudRule" (
  "id"            TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "signal"        "FraudSignal" NOT NULL,
  "threshold"     INTEGER NOT NULL,
  "windowSeconds" INTEGER NOT NULL,
  "action"        "FraudAction" NOT NULL DEFAULT 'REVIEW',
  "severity"      "FraudSeverity" NOT NULL DEFAULT 'MEDIUM',
  "enabled"       BOOLEAN NOT NULL DEFAULT TRUE,
  "notes"         TEXT,
  "updatedById"   TEXT,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FraudRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FraudRule_name_key" ON "FraudRule" ("name");
CREATE INDEX "FraudRule_enabled_signal_idx" ON "FraudRule" ("enabled","signal");

-- PaymentRetrySchedule
CREATE TABLE "PaymentRetrySchedule" (
  "id"             TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "attemptNumber"  INTEGER NOT NULL,
  "scheduledAt"    TIMESTAMP(3) NOT NULL,
  "executed"       BOOLEAN NOT NULL DEFAULT FALSE,
  "executedAt"     TIMESTAMP(3),
  "succeeded"      BOOLEAN NOT NULL DEFAULT FALSE,
  "errorCode"      TEXT,
  "paymentId"      TEXT,
  "metadata"       JSONB,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentRetrySchedule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PaymentRetrySchedule_subscriptionId_attemptNumber_idx" ON "PaymentRetrySchedule" ("subscriptionId","attemptNumber");
CREATE INDEX "PaymentRetrySchedule_scheduledAt_executed_idx" ON "PaymentRetrySchedule" ("scheduledAt","executed");

-- BillingNotification
CREATE TABLE "BillingNotification" (
  "id"       TEXT NOT NULL,
  "userId"   TEXT NOT NULL,
  "channel"  TEXT NOT NULL,
  "kind"     "BillingNotificationKind" NOT NULL,
  "refType"  TEXT,
  "refId"    TEXT,
  "sentAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ackAt"    TIMESTAMP(3),
  "metadata" JSONB,
  CONSTRAINT "BillingNotification_pkey" PRIMARY KEY ("id")
);
-- The following unique requires non-NULL refType/refId for true dedup;
-- in PostgreSQL, NULL is treated as distinct in UNIQUE indexes, which is acceptable for our dedup intent
CREATE UNIQUE INDEX "BillingNotification_userId_kind_refType_refId_channel_key" ON "BillingNotification" ("userId","kind","refType","refId","channel");
CREATE INDEX "BillingNotification_userId_sentAt_idx" ON "BillingNotification" ("userId","sentAt");
CREATE INDEX "BillingNotification_kind_idx" ON "BillingNotification" ("kind");

-- UpgradeChange
CREATE TABLE "UpgradeChange" (
  "id"                TEXT NOT NULL,
  "userId"            TEXT NOT NULL,
  "fromEntitlementId" TEXT,
  "toEntitlementId"   TEXT,
  "fromPlanId"        TEXT NOT NULL,
  "toPlanId"          TEXT NOT NULL,
  "fromOrderId"       TEXT,
  "toOrderId"         TEXT,
  "prorationPaise"    INTEGER NOT NULL DEFAULT 0,
  "carryForward"      JSONB,
  "snapshot"          JSONB NOT NULL,
  "executedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById"       TEXT,
  CONSTRAINT "UpgradeChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "UpgradeChange_userId_executedAt_idx" ON "UpgradeChange" ("userId","executedAt");
CREATE INDEX "UpgradeChange_fromPlanId_toPlanId_idx" ON "UpgradeChange" ("fromPlanId","toPlanId");

-- ==========================================
-- 3. Foreign keys
-- ==========================================

-- Plan
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PlanFeature
ALTER TABLE "PlanFeature" ADD CONSTRAINT "PlanFeature_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PlanResource
ALTER TABLE "PlanResource" ADD CONSTRAINT "PlanResource_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PlanVersion
ALTER TABLE "PlanVersion" ADD CONSTRAINT "PlanVersion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanVersion" ADD CONSTRAINT "PlanVersion_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- BillingAddress
ALTER TABLE "BillingAddress" ADD CONSTRAINT "BillingAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Coupon
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Order
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_billingAddressId_fkey" FOREIGN KEY ("billingAddressId") REFERENCES "BillingAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_upgradeFromOrderId_fkey" FOREIGN KEY ("upgradeFromOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_parentSubscriptionId_fkey" FOREIGN KEY ("parentSubscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Subscription
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SubscriptionEvent
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mandate
ALTER TABLE "Mandate" ADD CONSTRAINT "Mandate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PaymentMethodToken
ALTER TABLE "PaymentMethodToken" ADD CONSTRAINT "PaymentMethodToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Payment
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PaymentAttempt
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Invoice
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_billingAddressId_fkey" FOREIGN KEY ("billingAddressId") REFERENCES "BillingAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- InvoiceLine
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CouponRedemption
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Refund
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SettlementTransaction
ALTER TABLE "SettlementTransaction" ADD CONSTRAINT "SettlementTransaction_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SettlementTransaction" ADD CONSTRAINT "SettlementTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SettlementTransaction" ADD CONSTRAINT "SettlementTransaction_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Dispute
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Entitlement
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_sourceOrderId_fkey" FOREIGN KEY ("sourceOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_sourceSubscriptionId_fkey" FOREIGN KEY ("sourceSubscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- EntitlementResource
ALTER TABLE "EntitlementResource" ADD CONSTRAINT "EntitlementResource_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "Entitlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ResourceLedger
ALTER TABLE "ResourceLedger" ADD CONSTRAINT "ResourceLedger_entitlementResourceId_fkey" FOREIGN KEY ("entitlementResourceId") REFERENCES "EntitlementResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResourceLedger" ADD CONSTRAINT "ResourceLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- BillingLedger
ALTER TABLE "BillingLedger" ADD CONSTRAINT "BillingLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingLedger" ADD CONSTRAINT "BillingLedger_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PriceAdjustment
ALTER TABLE "PriceAdjustment" ADD CONSTRAINT "PriceAdjustment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriceAdjustment" ADD CONSTRAINT "PriceAdjustment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriceAdjustment" ADD CONSTRAINT "PriceAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RazorpayWebhookEvent
ALTER TABLE "RazorpayWebhookEvent" ADD CONSTRAINT "RazorpayWebhookEvent_lastReplayedById_fkey" FOREIGN KEY ("lastReplayedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- QuoteRequest
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CustomPlanOffer
ALTER TABLE "CustomPlanOffer" ADD CONSTRAINT "CustomPlanOffer_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "QuoteRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomPlanOffer" ADD CONSTRAINT "CustomPlanOffer_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomPlanOffer" ADD CONSTRAINT "CustomPlanOffer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- FraudSignalEvent
ALTER TABLE "FraudSignalEvent" ADD CONSTRAINT "FraudSignalEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FraudSignalEvent" ADD CONSTRAINT "FraudSignalEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FraudSignalEvent" ADD CONSTRAINT "FraudSignalEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FraudSignalEvent" ADD CONSTRAINT "FraudSignalEvent_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- FraudRule
ALTER TABLE "FraudRule" ADD CONSTRAINT "FraudRule_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PaymentRetrySchedule
ALTER TABLE "PaymentRetrySchedule" ADD CONSTRAINT "PaymentRetrySchedule_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- BillingNotification
ALTER TABLE "BillingNotification" ADD CONSTRAINT "BillingNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- UpgradeChange
ALTER TABLE "UpgradeChange" ADD CONSTRAINT "UpgradeChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UpgradeChange" ADD CONSTRAINT "UpgradeChange_fromEntitlementId_fkey" FOREIGN KEY ("fromEntitlementId") REFERENCES "Entitlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UpgradeChange" ADD CONSTRAINT "UpgradeChange_toEntitlementId_fkey" FOREIGN KEY ("toEntitlementId") REFERENCES "Entitlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UpgradeChange" ADD CONSTRAINT "UpgradeChange_fromPlanId_fkey" FOREIGN KEY ("fromPlanId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UpgradeChange" ADD CONSTRAINT "UpgradeChange_toPlanId_fkey" FOREIGN KEY ("toPlanId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UpgradeChange" ADD CONSTRAINT "UpgradeChange_fromOrderId_fkey" FOREIGN KEY ("fromOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UpgradeChange" ADD CONSTRAINT "UpgradeChange_toOrderId_fkey" FOREIGN KEY ("toOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =====================================================================
-- CompanyProfile.defaultBillingAddressId  (plan §2.3 line 190)
--
-- Optional pointer into BillingAddress so the employer's checkout can
-- pre-fill GSTIN / legal-name / place-of-supply from a saved address.
-- Foreign-keyed to BillingAddress(id) created above; ON DELETE SET NULL
-- ensures deleting an address never cascade-kills the company row.
-- =====================================================================
ALTER TABLE "CompanyProfile" ADD COLUMN "defaultBillingAddressId" TEXT;
CREATE INDEX "CompanyProfile_defaultBillingAddressId_idx" ON "CompanyProfile" ("defaultBillingAddressId");
ALTER TABLE "CompanyProfile" ADD CONSTRAINT "CompanyProfile_defaultBillingAddressId_fkey" FOREIGN KEY ("defaultBillingAddressId") REFERENCES "BillingAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;
