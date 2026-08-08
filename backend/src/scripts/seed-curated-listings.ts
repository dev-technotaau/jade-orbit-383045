/**
 * Idempotent seed for the CuratedListing table. Re-running this script
 * upserts every entry by slug — safe in CI / on every deploy.
 *
 * Run:
 *   npx ts-node src/scripts/seed-curated-listings.ts
 *
 * Categories follow the master plan (§10 Curated Content Inventory):
 *   - JOB_CATEGORY     × 12  (IT, Sales, Marketing, etc.)
 *   - JOB_DEMAND       × 12  (Fresher, MNC, Remote, WFH, etc.)
 *   - JOB_LOCATION     × 21  (Top India cities)
 *   - JOB_QUALIFICATION × 12 (10th, 12th, ITI, BTech, etc.)
 *   - JOB_DEPARTMENT   × 14
 *   - JOB_COLLECTION   × 20  (8 thematic + 12 Popular Jobs from §10)
 *   - COMPANY_CATEGORY × 10  (Unicorn, MNC, Startup, etc.)
 *   - COMPANY_COLLECTION × 8
 *
 * Total: 109 entries — covers every line in §10 of the master plan.
 */
import dotenv from 'dotenv';
dotenv.config();

import type { CuratedType } from '@prisma/client';
import { prisma, disconnectPrisma } from '../config/prisma';
import logger from '../config/logger';

interface SeedEntry {
  slug: string;
  type: CuratedType;
  label: string;
  filterPreset: Record<string, unknown>;
  iconKey?: string;
  displayOrder?: number;
  isFeatured?: boolean;
  metaTitle?: string;
  metaDescription?: string;
  heroH1?: string;
  heroSubtitle?: string;
}

const ENTRIES: SeedEntry[] = [
  // ─── JOB_CATEGORY (Header > Jobs > Popular Categories) ──────────────
  ...[
    { slug: 'it-jobs', label: 'IT Jobs', filter: { roleCategory: 'IT' }, h1: 'IT Jobs in India' },
    {
      slug: 'sales-jobs',
      label: 'Sales Jobs',
      filter: { roleCategory: 'Sales' },
      h1: 'Sales Jobs in India',
    },
    {
      slug: 'marketing-jobs',
      label: 'Marketing Jobs',
      filter: { roleCategory: 'Marketing' },
      h1: 'Marketing Jobs in India',
    },
    {
      slug: 'data-science-jobs',
      label: 'Data Science Jobs',
      filter: { roleCategory: 'Data Science' },
      h1: 'Data Science Jobs in India',
    },
    {
      slug: 'engineering-jobs',
      label: 'Engineering Jobs',
      filter: { roleCategory: 'Engineering' },
      h1: 'Engineering Jobs in India',
    },
    { slug: 'hr-jobs', label: 'HR Jobs', filter: { roleCategory: 'HR' }, h1: 'HR Jobs in India' },
    {
      slug: 'finance-jobs',
      label: 'Finance Jobs',
      filter: { roleCategory: 'Finance' },
      h1: 'Finance Jobs in India',
    },
    {
      slug: 'operations-jobs',
      label: 'Operations Jobs',
      filter: { roleCategory: 'Operations' },
      h1: 'Operations Jobs in India',
    },
    {
      slug: 'healthcare-jobs',
      label: 'Healthcare Jobs',
      filter: { roleCategory: 'Healthcare' },
      h1: 'Healthcare Jobs in India',
    },
    {
      slug: 'teaching-jobs',
      label: 'Teaching Jobs',
      filter: { roleCategory: 'Teaching' },
      h1: 'Teaching Jobs in India',
    },
    {
      slug: 'bpo-jobs',
      label: 'BPO Jobs',
      filter: { roleCategory: 'BPO' },
      h1: 'BPO Jobs in India',
    },
    {
      slug: 'logistics-jobs',
      label: 'Logistics Jobs',
      filter: { roleCategory: 'Logistics' },
      h1: 'Logistics Jobs in India',
    },
  ].map((c, i) => ({
    slug: c.slug,
    type: 'JOB_CATEGORY' as CuratedType,
    label: c.label,
    filterPreset: c.filter,
    displayOrder: i + 1,
    isFeatured: i < 6,
    heroH1: c.h1,
    metaTitle: `${c.label} — Latest openings on Hire Adda`,
    metaDescription: `Browse ${c.label.toLowerCase()} across India. Apply on Hire Adda — fast hiring, verified employers, GST-compliant.`,
  })),

  // ─── JOB_DEMAND (Header > Jobs > Jobs in Demand) ─────────────────────
  ...[
    {
      slug: 'fresher-jobs',
      label: 'Fresher Jobs',
      filter: { experienceMax: 1 },
      h1: 'Fresher Jobs in India',
    },
    {
      slug: 'mnc-jobs',
      label: 'MNC Jobs',
      filter: { companyType: 'MNC' },
      h1: 'MNC Jobs in India',
    },
    {
      slug: 'remote-jobs',
      label: 'Remote Jobs',
      filter: { workMode: 'REMOTE' },
      h1: 'Remote Jobs in India',
    },
    {
      slug: 'work-from-home',
      label: 'Work From Home',
      filter: { workMode: 'REMOTE' },
      h1: 'Work From Home Jobs in India',
    },
    {
      slug: 'walk-in',
      label: 'Walk-in Jobs',
      filter: { isWalkIn: true },
      h1: 'Walk-in Jobs in India',
    },
    {
      slug: 'part-time',
      label: 'Part-time Jobs',
      filter: { jobType: 'PART_TIME' },
      h1: 'Part-time Jobs in India',
    },
    {
      slug: 'women-jobs',
      label: 'Women Jobs',
      filter: { genderPreference: 'WOMEN_PREFERRED' },
      h1: 'Jobs for Women in India',
    },
    {
      slug: 'full-time',
      label: 'Full-time Jobs',
      filter: { jobType: 'FULL_TIME' },
      h1: 'Full-time Jobs in India',
    },
    {
      slug: 'night-shift',
      label: 'Night Shift Jobs',
      filter: { shiftType: 'NIGHT' },
      h1: 'Night Shift Jobs in India',
    },
    {
      slug: 'internship',
      label: 'Internship',
      filter: { jobType: 'INTERNSHIP' },
      h1: 'Internships in India',
    },
    {
      slug: 'contract',
      label: 'Contract Jobs',
      filter: { jobType: 'CONTRACT' },
      h1: 'Contract Jobs in India',
    },
    {
      slug: 'freelance',
      label: 'Freelance Jobs',
      filter: { jobType: 'FREELANCE' },
      h1: 'Freelance Jobs in India',
    },
  ].map((c, i) => ({
    slug: c.slug,
    type: 'JOB_DEMAND' as CuratedType,
    label: c.label,
    filterPreset: c.filter,
    displayOrder: i + 1,
    isFeatured: i < 4,
    heroH1: c.h1,
    metaTitle: `${c.label} on Hire Adda`,
    metaDescription: `Find ${c.label.toLowerCase()} across India. Verified employers, fast applications, no scams.`,
  })),

  // ─── JOB_LOCATION (Header > Jobs > By Location, Footer > Find Jobs) ─
  ...[
    'Bengaluru',
    'Mumbai',
    'Delhi',
    'Delhi NCR',
    'Hyderabad',
    'Pune',
    'Chennai',
    'Kolkata',
    'Ahmedabad',
    'Gurugram',
    'Noida',
    'Jaipur',
    'Indore',
    'Lucknow',
    'Chandigarh',
    'Bhubaneswar',
    'Coimbatore',
    'Kochi',
    'Surat',
    'Nagpur',
    'Patna',
    'Visakhapatnam',
  ].map((city, i) => ({
    slug: `jobs-in-${city.toLowerCase().replace(/\s+/g, '-')}`,
    type: 'JOB_LOCATION' as CuratedType,
    label: `Jobs in ${city}`,
    filterPreset: { location: city },
    displayOrder: i + 1,
    isFeatured: i < 8,
    heroH1: `Jobs in ${city}`,
    metaTitle: `Jobs in ${city} — Latest openings on Hire Adda`,
    metaDescription: `Find the latest jobs in ${city}. Apply on Hire Adda — verified employers, no scams.`,
  })),

  // ─── JOB_QUALIFICATION (Header > Jobs > By Qualification) ───────────
  ...[
    { slug: '10th-pass-jobs', label: '10th Pass Jobs', filter: { educationRequired: 'CLASS_10' } },
    { slug: '12th-pass-jobs', label: '12th Pass Jobs', filter: { educationRequired: 'CLASS_12' } },
    { slug: 'iti-jobs', label: 'ITI Jobs', filter: { educationRequired: 'ITI' } },
    { slug: 'diploma-jobs', label: 'Diploma Jobs', filter: { educationRequired: 'DIPLOMA' } },
    { slug: 'graduate-jobs', label: 'Graduate Jobs', filter: { educationRequired: 'GRADUATE' } },
    {
      slug: 'post-graduate-jobs',
      label: 'Post-graduate Jobs',
      filter: { educationRequired: 'POST_GRADUATE' },
    },
    { slug: 'btech-jobs', label: 'B.Tech Jobs', filter: { specificDegrees: ['BTECH'] } },
    { slug: 'bcom-jobs', label: 'B.Com Jobs', filter: { specificDegrees: ['BCOM'] } },
    { slug: 'bba-jobs', label: 'BBA Jobs', filter: { specificDegrees: ['BBA'] } },
    { slug: 'mba-jobs', label: 'MBA Jobs', filter: { specificDegrees: ['MBA'] } },
    { slug: 'mca-jobs', label: 'MCA Jobs', filter: { specificDegrees: ['MCA'] } },
    { slug: 'mtech-jobs', label: 'M.Tech Jobs', filter: { specificDegrees: ['MTECH'] } },
  ].map((c, i) => ({
    slug: c.slug,
    type: 'JOB_QUALIFICATION' as CuratedType,
    label: c.label,
    filterPreset: c.filter,
    displayOrder: i + 1,
    heroH1: `${c.label} in India`,
    metaTitle: `${c.label} — Latest openings on Hire Adda`,
    metaDescription: `Find ${c.label.toLowerCase()} across India. Apply with one click on Hire Adda.`,
  })),

  // ─── JOB_DEPARTMENT (Footer > By Department) ─────────────────────────
  // Slugs are prefixed `dept-` so they don't collide with JOB_CATEGORY
  // slugs (both used `${name}-jobs` previously — same string keys meant
  // the second-inserted CategoryType silently overwrote the first at
  // upsert time, demoting 7 CATEGORY rows to DEPARTMENT type). The URL
  // builders in `curated-href.ts` and `sitemap.ts` strip the prefix so
  // public URLs remain `/jobs/department/<dept>` — only the DB key
  // changes.
  ...[
    'Engineering',
    'Product',
    'Design',
    'Marketing',
    'Sales',
    'Customer Support',
    'HR',
    'Finance',
    'Operations',
    'Legal',
    'Data',
    'Research',
    'Manufacturing',
    'Logistics',
  ].map((dept, i) => ({
    slug: `dept-${dept.toLowerCase().replace(/\s+/g, '-')}-jobs`,
    type: 'JOB_DEPARTMENT' as CuratedType,
    label: `${dept} Jobs`,
    filterPreset: { department: dept },
    displayOrder: i + 1,
    isFeatured: i < 5,
    heroH1: `${dept} Jobs in India`,
    metaTitle: `${dept} Jobs — Latest openings on Hire Adda`,
    metaDescription: `Browse the latest ${dept.toLowerCase()} jobs across India. Verified employers, fast hiring.`,
  })),

  // ─── JOB_COLLECTION (Header > Jobs > Collections + Footer > Popular Jobs) ──
  // Mix: 8 thematic collections + 12 popular role-specific jobs from
  // §10 of the master plan. The role-specific entries drive the
  // "Popular Jobs" footer section by filtering on `q` (full-text role).
  ...[
    // Thematic collections (header mega-menu source).
    {
      slug: 'top-companies-hiring',
      label: 'Top Companies Hiring',
      filter: { isVerified: true, hasOpenJobs: true },
    },
    { slug: 'trending-this-week', label: 'Trending This Week', filter: { sortBy: 'date' } },
    { slug: 'urgent-hiring', label: 'Urgent Hiring', filter: { urgencyLevel: 'URGENT' } },
    { slug: 'high-salary-jobs', label: 'High Salary Jobs', filter: { salaryMin: 1500000 } },
    { slug: 'startup-jobs', label: 'Startup Jobs', filter: { companyType: 'STARTUP' } },
    { slug: 'entry-level-jobs', label: 'Entry Level Jobs', filter: { experienceMax: 2 } },
    { slug: 'senior-level-jobs', label: 'Senior Level Jobs', filter: { experienceMin: 8 } },
    { slug: 'verified-companies', label: 'Verified Companies', filter: { isVerified: true } },
    // Popular role-specific jobs (Footer > Popular Jobs source).
    {
      slug: 'delivery-person-jobs',
      label: 'Delivery Person Jobs',
      filter: { q: 'delivery person' },
    },
    {
      slug: 'sales-executive-jobs',
      label: 'Sales Executive Jobs',
      filter: { q: 'sales executive' },
    },
    { slug: 'customer-care-jobs', label: 'Customer Care Jobs', filter: { q: 'customer care' } },
    { slug: 'driver-jobs', label: 'Driver Jobs', filter: { q: 'driver' } },
    { slug: 'front-desk-jobs', label: 'Front Desk Jobs', filter: { q: 'front desk' } },
    { slug: 'receptionist-jobs', label: 'Receptionist Jobs', filter: { q: 'receptionist' } },
    { slug: 'field-sales-jobs', label: 'Field Sales Jobs', filter: { q: 'field sales' } },
    { slug: 'telecaller-jobs', label: 'Telecaller Jobs', filter: { q: 'telecaller' } },
    {
      slug: 'office-assistant-jobs',
      label: 'Office Assistant Jobs',
      filter: { q: 'office assistant' },
    },
    {
      slug: 'account-manager-jobs',
      label: 'Account Manager Jobs',
      filter: { q: 'account manager' },
    },
    { slug: 'cashier-jobs', label: 'Cashier Jobs', filter: { q: 'cashier' } },
    { slug: 'security-guard-jobs', label: 'Security Guard Jobs', filter: { q: 'security guard' } },
  ].map((c, i) => ({
    slug: c.slug,
    type: 'JOB_COLLECTION' as CuratedType,
    label: c.label,
    filterPreset: c.filter,
    displayOrder: i + 1,
    isFeatured: i < 4,
    heroH1: c.label,
    metaTitle: `${c.label} — Hire Adda`,
    metaDescription: `${c.label} on Hire Adda — verified employers, fast applications.`,
  })),

  // ─── COMPANY_CATEGORY (Header > Companies > Explore Categories) ─────
  ...[
    { slug: 'unicorn', label: 'Unicorn Companies', filter: { companyType: 'UNICORN' } },
    { slug: 'mnc', label: 'MNC', filter: { companyType: 'MNC' } },
    { slug: 'startup', label: 'Startup', filter: { companyType: 'STARTUP' } },
    { slug: 'product-based', label: 'Product-Based', filter: { companyType: 'PRODUCT' } },
    { slug: 'internet', label: 'Internet', filter: { industry: 'Internet' } },
    { slug: 'banking', label: 'Banking', filter: { industry: 'Banking' } },
    { slug: 'healthcare', label: 'Healthcare', filter: { industry: 'Healthcare' } },
    { slug: 'manufacturing', label: 'Manufacturing', filter: { industry: 'Manufacturing' } },
    { slug: 'government', label: 'Government', filter: { companyType: 'GOVERNMENT' } },
    { slug: 'ngo', label: 'NGO', filter: { companyType: 'NGO' } },
  ].map((c, i) => ({
    slug: `companies-${c.slug}`,
    type: 'COMPANY_CATEGORY' as CuratedType,
    label: c.label,
    filterPreset: c.filter,
    displayOrder: i + 1,
    isFeatured: i < 5,
    heroH1: `${c.label} on Hire Adda`,
    metaTitle: `${c.label} — verified profiles on Hire Adda`,
    metaDescription: `Explore ${c.label.toLowerCase()} on Hire Adda. Verified company profiles, latest openings.`,
  })),

  // ─── COMPANY_COLLECTION (Header > Companies > Explore Collections) ──
  ...[
    { slug: 'top-companies', label: 'Top Companies', filter: { isVerified: true } },
    { slug: 'it-companies', label: 'IT Companies', filter: { industry: 'IT' } },
    { slug: 'fintech-companies', label: 'Fintech Companies', filter: { industry: 'Fintech' } },
    { slug: 'sponsored-companies', label: 'Sponsored Companies', filter: { sponsored: true } },
    { slug: 'featured-companies', label: 'Featured Companies', filter: { featured: true } },
    { slug: 'hiring-now', label: 'Hiring Now', filter: { hasOpenJobs: true } },
    { slug: 'trending-companies', label: 'Trending This Week', filter: { trending: true } },
    {
      slug: 'diverse-companies',
      label: 'Diverse Companies',
      filter: { hasDiversityProgram: true },
    },
  ].map((c, i) => ({
    slug: c.slug,
    type: 'COMPANY_COLLECTION' as CuratedType,
    label: c.label,
    filterPreset: c.filter,
    displayOrder: i + 1,
    isFeatured: i < 5,
    heroH1: `${c.label} on Hire Adda`,
    metaTitle: `${c.label} — Hire Adda`,
    metaDescription: `Browse ${c.label.toLowerCase()} on Hire Adda.`,
  })),
];

async function main() {
  let inserted = 0;
  let updated = 0;
  for (const entry of ENTRIES) {
    const existing = await prisma.curatedListing.findUnique({ where: { slug: entry.slug } });
    if (existing) {
      await prisma.curatedListing.update({
        where: { slug: entry.slug },
        data: { ...entry, filterPreset: entry.filterPreset as object },
      });
      updated += 1;
    } else {
      await prisma.curatedListing.create({
        data: { ...entry, filterPreset: entry.filterPreset as object },
      });
      inserted += 1;
    }
  }
  logger.info(
    `seed-curated-listings — ${inserted} inserted, ${updated} updated, total ${ENTRIES.length}`
  );
}

main()
  .then(async () => {
    await disconnectPrisma();
    process.exit(0);
  })
  .catch(async (err) => {
    logger.error('seed-curated-listings — fatal', err);
    await disconnectPrisma();
    process.exit(1);
  });
