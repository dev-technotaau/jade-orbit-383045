/**
 * Seed all Hire Adda plans into the database.
 *
 * Plans are sourced from `HireAdda_Plans_Pricing_Guide.pdf` and
 * mirror the public pricing page exactly.
 *
 * Run:    npx ts-node src/scripts/seed-plans.ts
 * Or:     npm run db:seed:plans (after wiring into package.json)
 *
 * Idempotent: re-running upserts plans by `code`. Safe to run on every
 * deploy.
 */
import dotenv from 'dotenv';
dotenv.config();

import {
  PlanCategory,
  PlanBillingCycle,
  PlanStatus,
  PlanFeatureKind,
  ResourceUnit,
} from '@prisma/client';
import { upsertPlanByCode } from '../services/plan.service';
import type { CreatePlanInput } from '../types/billing.types';
import logger from '../config/logger';
import { disconnectPrisma } from '../config/prisma';

const PLANS: CreatePlanInput[] = [
  // ===========================================================
  // Candidate Plans
  // ===========================================================
  {
    code: 'CAND_PREMIUM',
    name: 'Candidate Premium',
    slug: 'candidate-premium',
    category: PlanCategory.CANDIDATE_PREMIUM,
    billingCycle: PlanBillingCycle.ONE_TIME,
    basePricePaise: 19_900, // ₹199
    currency: 'INR',
    gstRatePercent: 18,
    gstInclusive: true,
    hsnCode: '998314',
    validityDays: 30,
    trialDays: 0,
    displayOrder: 10,
    highlight: true,
    badgeText: 'Most Popular',
    shortDescription: 'AI Resume Premium, Verified Badge, Profile Boost & Priority Support',
    status: PlanStatus.ACTIVE,
    isPublic: true,
    features: [
      {
        key: 'feature.candidate_ai_resume_premium',
        label: 'AI Resume Premium',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 10,
      },
      {
        key: 'feature.candidate_verified_badge',
        label: 'Verified Badge',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 20,
      },
      {
        key: 'feature.candidate_profile_boost',
        label: '7 Days Profile Boost',
        kind: PlanFeatureKind.COUNTABLE,
        countableLimit: 7,
        included: true,
        displayOrder: 30,
      },
      {
        key: 'feature.whatsapp_priority',
        label: 'Priority WhatsApp Support',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 40,
      },
      {
        key: 'feature.candidate_top_visibility',
        label: 'Top Visibility',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 50,
      },
    ],
    resources: [{ unit: ResourceUnit.BOOST_DAYS, quantity: 7, perPeriodReset: false }],
  },

  // ===========================================================
  // Employer Job-Post Plans
  // ===========================================================
  {
    code: 'EMP_FREE',
    name: 'Free Job Post',
    slug: 'employer-free',
    category: PlanCategory.EMPLOYER_JOB_POST,
    billingCycle: PlanBillingCycle.ONE_TIME,
    basePricePaise: 0,
    currency: 'INR',
    gstRatePercent: 0, // ₹0 — no tax
    gstInclusive: true,
    hsnCode: '998314',
    validityDays: 7,
    displayOrder: 10,
    shortDescription: 'Try Hire Adda — 1 free job post for 7 days',
    status: PlanStatus.ACTIVE,
    isPublic: true,
    features: [
      {
        key: 'feature.job_post',
        label: '1 Job Post',
        kind: PlanFeatureKind.COUNTABLE,
        countableLimit: 1,
        included: true,
        displayOrder: 10,
      },
      {
        key: 'feature.job_validity',
        label: '7 Days Validity',
        kind: PlanFeatureKind.COUNTABLE,
        countableLimit: 7,
        included: true,
        displayOrder: 20,
      },
      {
        key: 'feature.job_locations',
        label: '1 Location',
        kind: PlanFeatureKind.COUNTABLE,
        countableLimit: 1,
        included: true,
        displayOrder: 30,
      },
      {
        key: 'feature.applications',
        label: 'Up to 50 Applications',
        kind: PlanFeatureKind.COUNTABLE,
        countableLimit: 50,
        included: true,
        displayOrder: 40,
      },
      {
        key: 'feature.basic_dashboard',
        label: 'Basic Candidate Dashboard Access',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 50,
      },
      {
        key: 'feature.standard_listing',
        label: 'Standard Listing Visibility',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 60,
      },
    ],
    resources: [
      { unit: ResourceUnit.JOB_POST, quantity: 1 },
      { unit: ResourceUnit.JOB_DAYS_LIVE, quantity: 7 },
      { unit: ResourceUnit.APPLICATIONS, quantity: 50 },
    ],
  },
  {
    code: 'EMP_STANDARD',
    name: 'Standard',
    slug: 'employer-standard',
    category: PlanCategory.EMPLOYER_JOB_POST,
    billingCycle: PlanBillingCycle.ONE_TIME,
    basePricePaise: 49_900, // ₹499
    currency: 'INR',
    gstRatePercent: 18,
    gstInclusive: true,
    hsnCode: '998314',
    validityDays: 15,
    displayOrder: 20,
    shortDescription: 'Top listing boost + 10 CV unlocks',
    status: PlanStatus.ACTIVE,
    isPublic: true,
    features: [
      {
        key: 'feature.job_post',
        label: '1 Job Post',
        kind: PlanFeatureKind.COUNTABLE,
        countableLimit: 1,
        included: true,
        displayOrder: 10,
      },
      {
        key: 'feature.job_validity',
        label: '15 Days Live',
        kind: PlanFeatureKind.COUNTABLE,
        countableLimit: 15,
        included: true,
        displayOrder: 20,
      },
      {
        key: 'feature.applications',
        label: 'Up to 250 Applications',
        kind: PlanFeatureKind.COUNTABLE,
        countableLimit: 250,
        included: true,
        displayOrder: 30,
      },
      {
        key: 'feature.top_listing_boost',
        label: 'Top Listing Boost',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 40,
      },
      {
        key: 'feature.cv_unlock',
        label: '10 Database CV Access',
        kind: PlanFeatureKind.COUNTABLE,
        countableLimit: 10,
        included: true,
        displayOrder: 50,
      },
      {
        key: 'feature.contact_details',
        label: 'Candidate Contact Access',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 60,
      },
      {
        key: 'feature.whatsapp_support',
        label: 'WhatsApp Support',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 70,
      },
    ],
    resources: [
      { unit: ResourceUnit.JOB_POST, quantity: 1 },
      { unit: ResourceUnit.JOB_DAYS_LIVE, quantity: 15 },
      { unit: ResourceUnit.APPLICATIONS, quantity: 250 },
      { unit: ResourceUnit.CV_UNLOCK, quantity: 10, carryForwardCap: 20 },
    ],
  },
  {
    code: 'EMP_PREMIUM',
    name: 'Premium',
    slug: 'employer-premium',
    category: PlanCategory.EMPLOYER_JOB_POST,
    billingCycle: PlanBillingCycle.ONE_TIME,
    basePricePaise: 99_900, // ₹999
    currency: 'INR',
    gstRatePercent: 18,
    gstInclusive: true,
    hsnCode: '998314',
    validityDays: 30,
    displayOrder: 30,
    highlight: true,
    badgeText: 'Best Value',
    shortDescription: '3 job posts, unlimited applications, 20 CV unlocks, urgent badge',
    status: PlanStatus.ACTIVE,
    isPublic: true,
    features: [
      {
        key: 'feature.job_post',
        label: '3 Job Posts',
        kind: PlanFeatureKind.COUNTABLE,
        countableLimit: 3,
        included: true,
        displayOrder: 10,
      },
      {
        key: 'feature.job_validity',
        label: '30 Days Live',
        kind: PlanFeatureKind.COUNTABLE,
        countableLimit: 30,
        included: true,
        displayOrder: 20,
      },
      {
        key: 'feature.cv_unlock',
        label: 'Access to 20 Database CVs',
        kind: PlanFeatureKind.COUNTABLE,
        countableLimit: 20,
        included: true,
        displayOrder: 30,
      },
      {
        key: 'feature.top_search_visibility',
        label: 'Top Search Visibility',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 40,
      },
      {
        key: 'feature.unlimited_applications',
        label: 'Unlimited Applications',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 50,
      },
      {
        key: 'feature.whatsapp_priority',
        label: 'Priority WhatsApp Support',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 60,
      },
      {
        key: 'feature.urgent_hiring_badge',
        label: 'Urgent Hiring Badge',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 70,
      },
      {
        key: 'feature.contact_details',
        label: 'Candidate Contact Access',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 80,
      },
    ],
    resources: [
      { unit: ResourceUnit.JOB_POST, quantity: 3 },
      { unit: ResourceUnit.JOB_DAYS_LIVE, quantity: 30 },
      // Unlimited applications represented as a very high cap for ledger sanity
      { unit: ResourceUnit.APPLICATIONS, quantity: 1_000_000 },
      { unit: ResourceUnit.CV_UNLOCK, quantity: 20, carryForwardCap: 40 },
    ],
  },

  // ===========================================================
  // Talent Vault / HireDex CV Database
  // ===========================================================
  {
    code: 'CVDB_LITE',
    name: 'CV Lite',
    slug: 'cvdb-lite',
    category: PlanCategory.EMPLOYER_CV_DATABASE,
    billingCycle: PlanBillingCycle.ONE_TIME,
    basePricePaise: 1_99_900, // ₹1 999
    currency: 'INR',
    gstRatePercent: 18,
    gstInclusive: true,
    hsnCode: '998314',
    validityDays: 15,
    displayOrder: 10,
    shortDescription: '200 CV unlocks + 500 search results',
    status: PlanStatus.ACTIVE,
    isPublic: true,
    features: [
      {
        key: 'feature.cv_db_access',
        label: 'CV Database Access',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 5,
      },
      {
        key: 'feature.cv_unlock',
        label: 'Access to 200 Database CVs',
        kind: PlanFeatureKind.COUNTABLE,
        countableLimit: 200,
        included: true,
        displayOrder: 10,
      },
      {
        key: 'feature.search_result',
        label: 'Up to 500 Search Results',
        kind: PlanFeatureKind.COUNTABLE,
        countableLimit: 500,
        included: true,
        displayOrder: 20,
      },
      {
        key: 'feature.basic_filters',
        label: 'Basic Filters',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 30,
      },
      {
        key: 'feature.single_seat',
        label: 'Single User Access',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 40,
      },
      {
        key: 'feature.cv_validity',
        label: '15 Days Validity',
        kind: PlanFeatureKind.COUNTABLE,
        countableLimit: 15,
        included: true,
        displayOrder: 50,
      },
    ],
    resources: [
      { unit: ResourceUnit.CV_UNLOCK, quantity: 200, carryForwardCap: 100 },
      { unit: ResourceUnit.SEARCH_RESULT, quantity: 500 },
      { unit: ResourceUnit.SEAT, quantity: 1 },
    ],
  },
  {
    code: 'CVDB_PRO',
    name: 'CV Pro',
    slug: 'cvdb-pro',
    category: PlanCategory.EMPLOYER_CV_DATABASE,
    billingCycle: PlanBillingCycle.ONE_TIME,
    basePricePaise: 3_99_900, // ₹3 999
    currency: 'INR',
    gstRatePercent: 18,
    gstInclusive: true,
    hsnCode: '998314',
    validityDays: 30,
    displayOrder: 20,
    highlight: true,
    badgeText: 'Recommended',
    shortDescription: '500 CV unlocks + advanced filters + contact details',
    status: PlanStatus.ACTIVE,
    isPublic: true,
    features: [
      {
        key: 'feature.cv_db_access',
        label: 'CV Database Access',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 5,
      },
      {
        key: 'feature.cv_unlock',
        label: 'Access to 500 Database CVs',
        kind: PlanFeatureKind.COUNTABLE,
        countableLimit: 500,
        included: true,
        displayOrder: 10,
      },
      {
        key: 'feature.search_result',
        label: 'Up to 1500 Search Results',
        kind: PlanFeatureKind.COUNTABLE,
        countableLimit: 1500,
        included: true,
        displayOrder: 20,
      },
      {
        key: 'feature.advanced_filters',
        label: 'Advanced Filters',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 30,
      },
      {
        key: 'feature.contact_details',
        label: 'Contact Details Access',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 40,
      },
      {
        key: 'feature.priority_support',
        label: 'Priority Support',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 50,
      },
      {
        key: 'feature.cv_validity',
        label: '30 Days Validity',
        kind: PlanFeatureKind.COUNTABLE,
        countableLimit: 30,
        included: true,
        displayOrder: 60,
      },
    ],
    resources: [
      { unit: ResourceUnit.CV_UNLOCK, quantity: 500, carryForwardCap: 200 },
      { unit: ResourceUnit.SEARCH_RESULT, quantity: 1500 },
      { unit: ResourceUnit.SEAT, quantity: 1 },
    ],
  },
  {
    code: 'CVDB_ENTERPRISE',
    name: 'CV Enterprise',
    slug: 'cvdb-enterprise',
    category: PlanCategory.EMPLOYER_CV_ENTERPRISE_CUSTOM,
    billingCycle: PlanBillingCycle.CUSTOM,
    basePricePaise: 0, // custom — actual price set on accepted offer
    currency: 'INR',
    gstRatePercent: 18,
    gstInclusive: true,
    hsnCode: '998314',
    validityDays: null,
    displayOrder: 30,
    badgeText: 'Custom',
    shortDescription: '1000+ CV access, multi-user, bulk download — talk to sales',
    status: PlanStatus.ACTIVE,
    isPublic: true,
    isCustom: true,
    requiresQuote: true,
    features: [
      {
        key: 'feature.cv_db_access',
        label: 'CV Database Access',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 5,
      },
      {
        key: 'feature.cv_unlock_unlimited',
        label: '1000+ CV Access / Custom',
        kind: PlanFeatureKind.TEXT,
        textValue: 'Custom volume',
        included: true,
        displayOrder: 10,
      },
      {
        key: 'feature.search_unlimited',
        label: 'Unlimited Search Results',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 20,
      },
      {
        key: 'feature.multi_seat',
        label: 'Multiple User Access',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 30,
      },
      {
        key: 'feature.bulk_download',
        label: 'Bulk CV Download',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 40,
      },
      {
        key: 'feature.dedicated_support',
        label: 'Dedicated Support',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 50,
      },
      {
        key: 'feature.contact_sales',
        label: 'Contact Sales Team',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 60,
      },
    ],
    resources: [],
  },

  // ===========================================================
  // Assisted Hiring
  // ===========================================================
  {
    code: 'ASSIST_HIRING',
    name: 'Assisted Hiring',
    slug: 'assisted-hiring',
    category: PlanCategory.EMPLOYER_ASSISTED_HIRING,
    billingCycle: PlanBillingCycle.ONE_TIME,
    basePricePaise: 1_49_900, // ₹1 499
    currency: 'INR',
    gstRatePercent: 18,
    gstInclusive: true,
    hsnCode: '998314',
    validityDays: 7,
    displayOrder: 10,
    shortDescription: 'Our team finds 4-5 matching CVs for your role',
    status: PlanStatus.ACTIVE,
    isPublic: true,
    features: [
      {
        key: 'feature.assisted_hiring',
        label: 'Assisted Hiring Service',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 5,
      },
      {
        key: 'feature.requirement_call',
        label: 'Requirement Discussion Call',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 10,
      },
      {
        key: 'feature.role_support',
        label: '1 Job Role Hiring Support',
        kind: PlanFeatureKind.COUNTABLE,
        countableLimit: 1,
        included: true,
        displayOrder: 20,
      },
      {
        key: 'feature.post_setup_assist',
        label: 'Job Post Setup Assistance',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 30,
      },
      {
        key: 'feature.matched_profiles',
        label: '4 to 5 Matching Profile CVs on Email',
        kind: PlanFeatureKind.COUNTABLE,
        countableLimit: 5,
        included: true,
        displayOrder: 40,
      },
      {
        key: 'feature.fast_sourcing',
        label: 'Fast Candidate Sourcing',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 50,
      },
      {
        key: 'feature.whatsapp_support',
        label: 'WhatsApp Support',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 60,
      },
      {
        key: 'feature.assistance_validity',
        label: '7 Days Assistance',
        kind: PlanFeatureKind.COUNTABLE,
        countableLimit: 7,
        included: true,
        displayOrder: 70,
      },
    ],
    resources: [{ unit: ResourceUnit.MATCHED_PROFILE_EMAIL, quantity: 5 }],
  },

  // ===========================================================
  // Vendor Connect (subscription)
  // ===========================================================
  {
    code: 'VENDOR_CONNECT',
    name: 'HireAdda Vendor Connect',
    slug: 'vendor-connect',
    category: PlanCategory.VENDOR_CONNECT,
    billingCycle: PlanBillingCycle.MONTHLY,
    basePricePaise: 19_900, // ₹199 / month
    currency: 'INR',
    gstRatePercent: 18,
    gstInclusive: true,
    hsnCode: '998314',
    validityDays: 30,
    displayOrder: 10,
    shortDescription: 'Receive hiring requirements + vendor listing — auto-renewed monthly',
    status: PlanStatus.ACTIVE,
    isPublic: true,
    features: [
      {
        key: 'feature.vendor_leads',
        label: 'Receive Hiring Requirements',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 10,
      },
      {
        key: 'feature.vendor_client_match',
        label: 'Get Connected with Potential Clients',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 20,
      },
      {
        key: 'feature.vendor_listing',
        label: 'Vendor Listing on Platform',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 30,
      },
      {
        key: 'feature.vendor_priority_leads',
        label: 'Priority Access to New Leads',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 40,
      },
      {
        key: 'feature.whatsapp_support',
        label: 'WhatsApp Support',
        kind: PlanFeatureKind.BOOLEAN,
        included: true,
        displayOrder: 50,
      },
      {
        key: 'feature.vendor_validity',
        label: '30 Days Validity (auto-renew)',
        kind: PlanFeatureKind.COUNTABLE,
        countableLimit: 30,
        included: true,
        displayOrder: 60,
      },
    ],
    resources: [
      { unit: ResourceUnit.VENDOR_LEAD, quantity: 1_000_000 }, // unlimited proxy
    ],
  },
];

async function main() {
  logger.info(`Seeding ${PLANS.length} plans...`);
  let createdOrUpdated = 0;
  for (const plan of PLANS) {
    try {
      await upsertPlanByCode(plan);
      createdOrUpdated += 1;
      logger.info(`✔ ${plan.code} — ${plan.name} (₹${plan.basePricePaise / 100})`);
    } catch (err) {
      logger.error(`✘ Failed to seed ${plan.code}`, err);
      throw err;
    }
  }
  logger.info(`Seeded ${createdOrUpdated}/${PLANS.length} plans`);

  // Seed default fraud rules (Phase 10) — idempotent upsert by name
  try {
    const { seedDefaultFraudRules } = await import('../services/fraud.service');
    await seedDefaultFraudRules();
  } catch (err) {
    logger.warn('Fraud rule seeding skipped', err);
  }
}

main()
  .then(async () => {
    await disconnectPrisma();
    process.exit(0);
  })
  .catch(async (err) => {
    logger.error('Plan seeding failed', err);
    await disconnectPrisma();
    process.exit(1);
  });
