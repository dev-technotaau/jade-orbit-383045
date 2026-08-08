/**
 * Core report datasets — people, hiring and revenue.
 *
 * Types and helpers live in `report-dataset-kit.ts`; the messaging, ledger, ops
 * and metrics datasets live in `report-datasets-extra.ts`. `REPORT_DATASETS`
 * below is the single registry the service reads, concatenating both files.
 *
 * Adding a dataset: see the design notes at the top of the kit.
 */
import { prisma } from '../config/prisma';
import type { Prisma } from '@prisma/client';
import {
  ApplicationStatus,
  CouponStatus,
  CouponType,
  DisputeStatus,
  EmailCampaignStatus,
  EntitlementSource,
  EntitlementStatus,
  FraudAction,
  FraudSeverity,
  InvoiceStatus,
  InvoiceType,
  JobStatus,
  JobType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  RefundRequestStatus,
  RefundStatus,
  ReviewStatus,
  SubscriptionStatus,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  WaCampaignStatus,
  WorkMode,
} from '@prisma/client';
import {
  dt,
  enumOptions,
  fullName,
  list,
  num,
  rupees,
  EXPORTABLE_USER_ROLES,
  type ReportDatasetDef,
} from './report-dataset-kit';
import { EXTRA_REPORT_DATASETS } from './report-datasets-extra';

/* ------------------------------------------------------------------ */
/* Group: People                                                       */
/* ------------------------------------------------------------------ */

/**
 * Force the staff exclusion onto a caller-built `where`.
 *
 * Applied inside the dataset's own count/page rather than left to the filter
 * map, so it holds regardless of what the request asked for.
 */
function staffExcluded(where: Record<string, unknown>): Prisma.UserWhereInput {
  const requested = where.role;
  const role =
    typeof requested === 'string' && (EXPORTABLE_USER_ROLES as string[]).includes(requested)
      ? requested
      : { in: EXPORTABLE_USER_ROLES };
  return { ...where, role } as Prisma.UserWhereInput;
}

const usersDataset: ReportDatasetDef = {
  key: 'users',
  label: 'Users',
  group: 'People',
  description:
    'Candidate and employer accounts, with verification and activity state. Staff accounts are excluded — see EXPORTABLE_USER_ROLES.',
  dateFields: [
    { key: 'createdAt', label: 'Registered' },
    { key: 'lastLoginAt', label: 'Last login' },
    { key: 'updatedAt', label: 'Last updated' },
  ],
  filters: [
    // Only the roles this dataset can actually return — offering ADMIN in the
    // picker would advertise a filter that always yields zero rows.
    {
      key: 'role',
      label: 'Role',
      kind: 'enum',
      options: EXPORTABLE_USER_ROLES as string[],
    },
    { key: 'isActive', label: 'Active', kind: 'boolean' },
    { key: 'isSuspended', label: 'Suspended', kind: 'boolean' },
    { key: 'isEmailVerified', label: 'Email verified', kind: 'boolean' },
    { key: 'isMobileVerified', label: 'Mobile verified', kind: 'boolean' },
  ],
  columns: [
    { key: 'id', label: 'User ID', default: true },
    { key: 'name', label: 'Name', default: true, pii: true },
    { key: 'email', label: 'Email', default: true, pii: true },
    { key: 'mobileNumber', label: 'Mobile', pii: true },
    { key: 'role', label: 'Role', default: true },
    { key: 'isEmailVerified', label: 'Email verified', default: true },
    { key: 'isMobileVerified', label: 'Mobile verified' },
    { key: 'isActive', label: 'Active', default: true },
    { key: 'isSuspended', label: 'Suspended', default: true },
    { key: 'createdAt', label: 'Registered', default: true },
    { key: 'lastLoginAt', label: 'Last login', default: true },
  ],
  // The role clause is re-applied on BOTH paths rather than trusted from the
  // caller's filter map: this is the enforcement point, so a hand-built request
  // cannot widen it back to the staff roster.
  count: ({ where }) => prisma.user.count({ where: staffExcluded(where) }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.user.findMany({
      where: staffExcluded(where),
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        mobileNumber: true,
        role: true,
        isEmailVerified: true,
        isMobileVerified: true,
        isActive: true,
        isSuspended: true,
        createdAt: true,
        lastLoginAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((u) => ({
      id: u.id,
      name: fullName(u),
      email: u.email,
      mobileNumber: u.mobileNumber,
      role: u.role,
      isEmailVerified: u.isEmailVerified,
      isMobileVerified: u.isMobileVerified,
      isActive: u.isActive,
      isSuspended: u.isSuspended,
      createdAt: dt(u.createdAt),
      lastLoginAt: dt(u.lastLoginAt),
    }));
  },
};

const candidatesDataset: ReportDatasetDef = {
  key: 'candidates',
  label: 'Candidate profiles',
  group: 'People',
  description: 'Candidate profiles with experience, location and profile completeness.',
  dateFields: [
    { key: 'createdAt', label: 'Profile created' },
    { key: 'updatedAt', label: 'Profile updated' },
  ],
  filters: [
    { key: 'openToWork', label: 'Open to work', kind: 'boolean' },
    { key: 'willingToRelocate', label: 'Willing to relocate', kind: 'boolean' },
    { key: 'servingNoticePeriod', label: 'Serving notice', kind: 'boolean' },
  ],
  columns: [
    { key: 'id', label: 'Profile ID', default: true },
    { key: 'userId', label: 'User ID', default: true },
    { key: 'name', label: 'Name', default: true, pii: true },
    { key: 'email', label: 'Email', pii: true },
    { key: 'phone', label: 'Phone', pii: true },
    { key: 'headline', label: 'Headline', default: true },
    { key: 'currentCompany', label: 'Current company', default: true },
    { key: 'currentRole', label: 'Current role', default: true },
    { key: 'experienceYears', label: 'Experience (yrs)', default: true },
    { key: 'city', label: 'City', default: true },
    { key: 'state', label: 'State' },
    { key: 'skills', label: 'Skills' },
    { key: 'expectedSalaryMin', label: 'Expected salary min', pii: true },
    { key: 'expectedSalaryMax', label: 'Expected salary max', pii: true },
    { key: 'openToWork', label: 'Open to work', default: true },
    { key: 'profileCompleteness', label: 'Completeness %', default: true },
    { key: 'hasResume', label: 'Has resume', default: true },
    { key: 'createdAt', label: 'Created', default: true },
  ],
  count: ({ where }) =>
    prisma.candidateProfile.count({ where: where as Prisma.CandidateProfileWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.candidateProfile.findMany({
      where: where as Prisma.CandidateProfileWhereInput,
      select: {
        id: true,
        userId: true,
        headline: true,
        phone: true,
        currentCompany: true,
        currentRole: true,
        experienceYears: true,
        city: true,
        state: true,
        skills: true,
        expectedSalaryMin: true,
        expectedSalaryMax: true,
        openToWork: true,
        profileCompleteness: true,
        resume: true,
        createdAt: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((c) => ({
      id: c.id,
      userId: c.userId,
      name: fullName(c.user),
      email: c.user?.email ?? null,
      phone: c.phone,
      headline: c.headline,
      currentCompany: c.currentCompany,
      currentRole: c.currentRole,
      experienceYears: num(c.experienceYears),
      city: c.city,
      state: c.state,
      skills: list(c.skills),
      expectedSalaryMin: num(c.expectedSalaryMin),
      expectedSalaryMax: num(c.expectedSalaryMax),
      openToWork: c.openToWork,
      profileCompleteness: c.profileCompleteness,
      hasResume: Boolean(c.resume),
      createdAt: dt(c.createdAt),
    }));
  },
};

const employersDataset: ReportDatasetDef = {
  key: 'employers',
  label: 'Company profiles',
  group: 'People',
  description: 'Employer companies with verification, industry and size.',
  dateFields: [
    { key: 'createdAt', label: 'Created' },
    { key: 'updatedAt', label: 'Updated' },
  ],
  filters: [
    { key: 'isVerified', label: 'Verified', kind: 'boolean' },
    { key: 'publicSearchable', label: 'Publicly listed', kind: 'boolean' },
  ],
  columns: [
    { key: 'id', label: 'Company ID', default: true },
    { key: 'userId', label: 'Owner user ID', default: true },
    { key: 'companyName', label: 'Company', default: true },
    { key: 'ownerEmail', label: 'Owner email', pii: true },
    { key: 'contactEmail', label: 'Contact email', pii: true },
    { key: 'contactPhone', label: 'Contact phone', pii: true },
    { key: 'contactPersonName', label: 'Contact person', pii: true },
    { key: 'industry', label: 'Industry', default: true },
    { key: 'companySize', label: 'Size', default: true },
    { key: 'city', label: 'City', default: true },
    { key: 'gstNumber', label: 'GSTIN', pii: true },
    { key: 'isVerified', label: 'Verified', default: true },
    { key: 'jobCount', label: 'Jobs posted', default: true },
    { key: 'createdAt', label: 'Created', default: true },
  ],
  count: ({ where }) =>
    prisma.companyProfile.count({ where: where as Prisma.CompanyProfileWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.companyProfile.findMany({
      where: where as Prisma.CompanyProfileWhereInput,
      select: {
        id: true,
        userId: true,
        companyName: true,
        contactEmail: true,
        contactPhone: true,
        contactPersonName: true,
        industry: true,
        companySize: true,
        city: true,
        gstNumber: true,
        isVerified: true,
        createdAt: true,
        user: { select: { email: true } },
        _count: { select: { jobs: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((c) => ({
      id: c.id,
      userId: c.userId,
      companyName: c.companyName,
      ownerEmail: c.user?.email ?? null,
      contactEmail: c.contactEmail,
      contactPhone: c.contactPhone,
      contactPersonName: c.contactPersonName,
      industry: c.industry,
      companySize: c.companySize,
      city: c.city,
      gstNumber: c.gstNumber,
      isVerified: c.isVerified,
      jobCount: c._count.jobs,
      createdAt: dt(c.createdAt),
    }));
  },
};

const vendorsDataset: ReportDatasetDef = {
  key: 'vendors',
  label: 'Recruitment partners',
  group: 'People',
  description: 'Vendor businesses in the partner directory, with lead volume.',
  dateFields: [{ key: 'createdAt', label: 'Created' }],
  filters: [
    { key: 'isVerified', label: 'Verified', kind: 'boolean' },
    { key: 'isPublic', label: 'Publicly listed', kind: 'boolean' },
  ],
  columns: [
    { key: 'id', label: 'Vendor ID', default: true },
    { key: 'businessName', label: 'Business', default: true },
    { key: 'contactEmail', label: 'Contact email', pii: true },
    { key: 'contactPhone', label: 'Contact phone', pii: true },
    { key: 'services', label: 'Services', default: true },
    { key: 'industries', label: 'Industries' },
    { key: 'locations', label: 'Locations' },
    { key: 'yearsInBusiness', label: 'Years in business', default: true },
    { key: 'teamSize', label: 'Team size' },
    { key: 'isVerified', label: 'Verified', default: true },
    { key: 'leadCount', label: 'Leads received', default: true },
    { key: 'createdAt', label: 'Created', default: true },
  ],
  count: ({ where }) =>
    prisma.vendorProfile.count({ where: where as Prisma.VendorProfileWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.vendorProfile.findMany({
      where: where as Prisma.VendorProfileWhereInput,
      select: {
        id: true,
        businessName: true,
        contactEmail: true,
        contactPhone: true,
        services: true,
        industries: true,
        locations: true,
        yearsInBusiness: true,
        teamSize: true,
        isVerified: true,
        createdAt: true,
        _count: { select: { leads: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((v) => ({
      id: v.id,
      businessName: v.businessName,
      contactEmail: v.contactEmail,
      contactPhone: v.contactPhone,
      services: list(v.services),
      industries: list(v.industries),
      locations: list(v.locations),
      yearsInBusiness: v.yearsInBusiness,
      teamSize: v.teamSize,
      isVerified: v.isVerified,
      leadCount: v._count.leads,
      createdAt: dt(v.createdAt),
    }));
  },
};

/* ------------------------------------------------------------------ */
/* Group: Hiring                                                       */
/* ------------------------------------------------------------------ */

const jobsDataset: ReportDatasetDef = {
  key: 'jobs',
  label: 'Job posts',
  group: 'Hiring',
  description: 'Job postings with status, salary band, openings and engagement.',
  dateFields: [
    { key: 'createdAt', label: 'Posted' },
    { key: 'expiresAt', label: 'Expires' },
    { key: 'closedAt', label: 'Closed' },
  ],
  filters: [
    { key: 'status', label: 'Status', kind: 'enum', options: enumOptions(JobStatus) },
    { key: 'type', label: 'Job type', kind: 'enum', options: enumOptions(JobType) },
    { key: 'workMode', label: 'Work mode', kind: 'enum', options: enumOptions(WorkMode) },
    { key: 'isFeatured', label: 'Featured', kind: 'boolean' },
    { key: 'isPremium', label: 'Premium', kind: 'boolean' },
    { key: 'isRemote', label: 'Remote', kind: 'boolean' },
  ],
  columns: [
    { key: 'id', label: 'Job ID', default: true },
    { key: 'title', label: 'Title', default: true },
    { key: 'companyName', label: 'Company', default: true },
    { key: 'status', label: 'Status', default: true },
    { key: 'type', label: 'Type', default: true },
    { key: 'workMode', label: 'Work mode' },
    { key: 'location', label: 'Location', default: true },
    { key: 'department', label: 'Department' },
    { key: 'industry', label: 'Industry' },
    { key: 'salaryMin', label: 'Salary min' },
    { key: 'salaryMax', label: 'Salary max' },
    { key: 'experienceMin', label: 'Exp min' },
    { key: 'experienceMax', label: 'Exp max' },
    { key: 'numberOfOpenings', label: 'Openings', default: true },
    { key: 'offlineHiresCount', label: 'Offline hires' },
    { key: 'applicationCount', label: 'Applications', default: true },
    { key: 'views', label: 'Views', default: true },
    { key: 'contactEmail', label: 'Contact email', pii: true },
    { key: 'contactPhone', label: 'Contact phone', pii: true },
    { key: 'createdAt', label: 'Posted', default: true },
    { key: 'expiresAt', label: 'Expires', default: true },
  ],
  count: ({ where }) => prisma.jobPost.count({ where: where as Prisma.JobPostWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.jobPost.findMany({
      where: where as Prisma.JobPostWhereInput,
      select: {
        id: true,
        title: true,
        status: true,
        type: true,
        workMode: true,
        location: true,
        department: true,
        industry: true,
        salaryMin: true,
        salaryMax: true,
        experienceMin: true,
        experienceMax: true,
        numberOfOpenings: true,
        offlineHiresCount: true,
        views: true,
        contactEmail: true,
        contactPhone: true,
        createdAt: true,
        expiresAt: true,
        company: { select: { companyName: true } },
        _count: { select: { applications: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((j) => ({
      id: j.id,
      title: j.title,
      companyName: j.company?.companyName ?? null,
      status: j.status,
      type: j.type,
      workMode: j.workMode,
      location: j.location,
      department: j.department,
      industry: j.industry,
      salaryMin: num(j.salaryMin),
      salaryMax: num(j.salaryMax),
      experienceMin: j.experienceMin,
      experienceMax: j.experienceMax,
      numberOfOpenings: j.numberOfOpenings,
      offlineHiresCount: j.offlineHiresCount,
      applicationCount: j._count.applications,
      views: j.views,
      contactEmail: j.contactEmail,
      contactPhone: j.contactPhone,
      createdAt: dt(j.createdAt),
      expiresAt: dt(j.expiresAt),
    }));
  },
};

const applicationsDataset: ReportDatasetDef = {
  key: 'applications',
  label: 'Applications',
  group: 'Hiring',
  description: 'Applications with funnel stage, match score and interview dates.',
  dateFields: [
    { key: 'appliedAt', label: 'Applied' },
    { key: 'hiredAt', label: 'Hired' },
    { key: 'selectedAt', label: 'Selected' },
    { key: 'interviewDate', label: 'Interview date' },
  ],
  filters: [
    { key: 'status', label: 'Status', kind: 'enum', options: enumOptions(ApplicationStatus) },
  ],
  columns: [
    { key: 'id', label: 'Application ID', default: true },
    { key: 'jobId', label: 'Job ID', default: true },
    { key: 'jobTitle', label: 'Job title', default: true },
    { key: 'companyName', label: 'Company', default: true },
    { key: 'candidateId', label: 'Candidate profile ID', default: true },
    { key: 'candidateName', label: 'Candidate', pii: true },
    { key: 'candidateEmail', label: 'Candidate email', pii: true },
    { key: 'status', label: 'Status', default: true },
    { key: 'matchScore', label: 'Match score', default: true },
    { key: 'source', label: 'Source' },
    { key: 'appliedAt', label: 'Applied', default: true },
    { key: 'viewedAt', label: 'Viewed' },
    { key: 'interviewDate', label: 'Interview date' },
    { key: 'selectedAt', label: 'Selected' },
    { key: 'hiredAt', label: 'Hired', default: true },
    { key: 'rejectionReason', label: 'Rejection reason' },
  ],
  count: ({ where }) =>
    prisma.jobApplication.count({ where: where as Prisma.JobApplicationWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.jobApplication.findMany({
      where: where as Prisma.JobApplicationWhereInput,
      select: {
        id: true,
        jobId: true,
        candidateId: true,
        status: true,
        matchScore: true,
        source: true,
        appliedAt: true,
        viewedAt: true,
        interviewDate: true,
        selectedAt: true,
        hiredAt: true,
        rejectionReason: true,
        job: { select: { title: true, company: { select: { companyName: true } } } },
        // `candidate` is a CandidateProfile, not a User — identity lives one hop
        // further out on `candidate.user`.
        candidate: {
          select: { user: { select: { firstName: true, lastName: true, email: true } } },
        },
      },
      orderBy: { appliedAt: 'desc' },
      skip,
      take,
    });
    return rows.map((a) => ({
      id: a.id,
      jobId: a.jobId,
      jobTitle: a.job?.title ?? null,
      companyName: a.job?.company?.companyName ?? null,
      candidateId: a.candidateId,
      candidateName: fullName(a.candidate?.user),
      candidateEmail: a.candidate?.user?.email ?? null,
      status: a.status,
      matchScore: num(a.matchScore),
      source: a.source,
      appliedAt: dt(a.appliedAt),
      viewedAt: dt(a.viewedAt),
      interviewDate: dt(a.interviewDate),
      selectedAt: dt(a.selectedAt),
      hiredAt: dt(a.hiredAt),
      rejectionReason: a.rejectionReason,
    }));
  },
};

const assistedHiringDataset: ReportDatasetDef = {
  key: 'assisted_hiring',
  label: 'Assisted hiring requests',
  group: 'Hiring',
  description: 'Managed-sourcing requests, their assignment and delivery state.',
  dateFields: [
    { key: 'createdAt', label: 'Raised' },
    { key: 'deliveredAt', label: 'Delivered' },
    { key: 'expiresAt', label: 'Expires' },
  ],
  filters: [
    {
      key: 'status',
      label: 'Status',
      kind: 'enum',
      options: ['PENDING', 'IN_PROGRESS', 'DELIVERED', 'CANCELLED', 'EXPIRED'],
    },
  ],
  columns: [
    { key: 'id', label: 'Request ID', default: true },
    { key: 'employerId', label: 'Employer user ID', default: true },
    { key: 'roleTitle', label: 'Role', default: true },
    { key: 'status', label: 'Status', default: true },
    { key: 'preferredLocation', label: 'Location' },
    { key: 'budgetRange', label: 'Budget' },
    { key: 'contactEmail', label: 'Contact email', pii: true },
    { key: 'contactPhone', label: 'Contact phone', pii: true },
    { key: 'matchedCount', label: 'Profiles matched', default: true },
    { key: 'createdAt', label: 'Raised', default: true },
    { key: 'deliveredAt', label: 'Delivered', default: true },
  ],
  count: ({ where }) =>
    prisma.assistedHiringRequest.count({
      where: where as Prisma.AssistedHiringRequestWhereInput,
    }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.assistedHiringRequest.findMany({
      where: where as Prisma.AssistedHiringRequestWhereInput,
      select: {
        id: true,
        employerId: true,
        roleTitle: true,
        status: true,
        preferredLocation: true,
        budgetRange: true,
        contactEmail: true,
        contactPhone: true,
        createdAt: true,
        deliveredAt: true,
        _count: { select: { matchedProfiles: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((r) => ({
      id: r.id,
      employerId: r.employerId,
      roleTitle: r.roleTitle,
      status: r.status,
      preferredLocation: r.preferredLocation,
      budgetRange: r.budgetRange,
      contactEmail: r.contactEmail,
      contactPhone: r.contactPhone,
      matchedCount: r._count.matchedProfiles,
      createdAt: dt(r.createdAt),
      deliveredAt: dt(r.deliveredAt),
    }));
  },
};

/* ------------------------------------------------------------------ */
/* Group: Revenue                                                      */
/* ------------------------------------------------------------------ */

const ordersDataset: ReportDatasetDef = {
  key: 'orders',
  label: 'Orders',
  group: 'Revenue',
  description: 'Checkout orders with tax breakdown, plan and payment state.',
  dateFields: [
    { key: 'createdAt', label: 'Created' },
    { key: 'paidAt', label: 'Paid' },
    { key: 'refundedAt', label: 'Refunded' },
  ],
  filters: [{ key: 'status', label: 'Status', kind: 'enum', options: enumOptions(OrderStatus) }],
  columns: [
    { key: 'id', label: 'Order ID', default: true },
    { key: 'receiptNumber', label: 'Receipt', default: true },
    { key: 'userId', label: 'User ID', default: true },
    { key: 'userEmail', label: 'User email', pii: true },
    { key: 'planCode', label: 'Plan code', default: true },
    { key: 'planName', label: 'Plan', default: true },
    { key: 'quantity', label: 'Qty', default: true },
    { key: 'status', label: 'Status', default: true },
    { key: 'originalAmount', label: 'Gross (₹)' },
    { key: 'discount', label: 'Discount (₹)' },
    { key: 'tax', label: 'Tax (₹)' },
    { key: 'total', label: 'Total (₹)', default: true },
    { key: 'currency', label: 'Currency' },
    { key: 'taxRegion', label: 'Tax region' },
    { key: 'gstNumber', label: 'Buyer GSTIN', pii: true },
    { key: 'createdAt', label: 'Created', default: true },
    { key: 'paidAt', label: 'Paid', default: true },
  ],
  count: ({ where }) => prisma.order.count({ where: where as Prisma.OrderWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.order.findMany({
      where: where as Prisma.OrderWhereInput,
      select: {
        id: true,
        receiptNumber: true,
        userId: true,
        quantity: true,
        status: true,
        originalAmountPaise: true,
        discountPaise: true,
        taxPaise: true,
        totalPaise: true,
        currency: true,
        taxRegion: true,
        gstNumber: true,
        createdAt: true,
        paidAt: true,
        user: { select: { email: true } },
        plan: { select: { code: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((o) => ({
      id: o.id,
      receiptNumber: o.receiptNumber,
      userId: o.userId,
      userEmail: o.user?.email ?? null,
      planCode: o.plan?.code ?? null,
      planName: o.plan?.name ?? null,
      quantity: o.quantity,
      status: o.status,
      originalAmount: rupees(o.originalAmountPaise),
      discount: rupees(o.discountPaise),
      tax: rupees(o.taxPaise),
      total: rupees(o.totalPaise),
      currency: o.currency,
      taxRegion: o.taxRegion,
      gstNumber: o.gstNumber,
      createdAt: dt(o.createdAt),
      paidAt: dt(o.paidAt),
    }));
  },
};

const paymentsDataset: ReportDatasetDef = {
  key: 'payments',
  label: 'Payments',
  group: 'Revenue',
  description: 'Razorpay payments with method, instrument and capture state.',
  dateFields: [
    { key: 'createdAt', label: 'Created' },
    { key: 'capturedAt', label: 'Captured' },
  ],
  filters: [
    { key: 'status', label: 'Status', kind: 'enum', options: enumOptions(PaymentStatus) },
    { key: 'method', label: 'Method', kind: 'enum', options: enumOptions(PaymentMethod) },
    { key: 'international', label: 'International', kind: 'boolean' },
  ],
  columns: [
    { key: 'id', label: 'Payment ID', default: true },
    { key: 'razorpayPaymentId', label: 'Razorpay ID', default: true },
    { key: 'orderId', label: 'Order ID', default: true },
    { key: 'receiptNumber', label: 'Receipt' },
    { key: 'status', label: 'Status', default: true },
    { key: 'method', label: 'Method', default: true },
    { key: 'amount', label: 'Amount (₹)', default: true },
    { key: 'captured', label: 'Captured (₹)', default: true },
    { key: 'currency', label: 'Currency' },
    { key: 'cardLast4', label: 'Card last4', pii: true },
    { key: 'cardNetwork', label: 'Card network' },
    { key: 'vpa', label: 'UPI VPA', pii: true },
    { key: 'bank', label: 'Bank' },
    { key: 'errorCode', label: 'Error code' },
    { key: 'errorDescription', label: 'Error' },
    { key: 'createdAt', label: 'Created', default: true },
    { key: 'capturedAt', label: 'Captured at', default: true },
  ],
  count: ({ where }) => prisma.payment.count({ where: where as Prisma.PaymentWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.payment.findMany({
      where: where as Prisma.PaymentWhereInput,
      select: {
        id: true,
        razorpayPaymentId: true,
        orderId: true,
        status: true,
        method: true,
        amountPaise: true,
        capturedPaise: true,
        currency: true,
        cardLast4: true,
        cardNetwork: true,
        vpa: true,
        bank: true,
        errorCode: true,
        errorDescription: true,
        createdAt: true,
        capturedAt: true,
        order: { select: { receiptNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((p) => ({
      id: p.id,
      razorpayPaymentId: p.razorpayPaymentId,
      orderId: p.orderId,
      receiptNumber: p.order?.receiptNumber ?? null,
      status: p.status,
      method: p.method,
      amount: rupees(p.amountPaise),
      captured: rupees(p.capturedPaise),
      currency: p.currency,
      cardLast4: p.cardLast4,
      cardNetwork: p.cardNetwork,
      vpa: p.vpa,
      bank: p.bank,
      errorCode: p.errorCode,
      errorDescription: p.errorDescription,
      createdAt: dt(p.createdAt),
      capturedAt: dt(p.capturedAt),
    }));
  },
};

const invoicesDataset: ReportDatasetDef = {
  key: 'invoices',
  label: 'Invoices',
  group: 'Revenue',
  description: 'GST invoices with tax split, paid and refunded amounts.',
  dateFields: [
    { key: 'createdAt', label: 'Created' },
    { key: 'issuedAt', label: 'Issued' },
  ],
  filters: [
    { key: 'status', label: 'Status', kind: 'enum', options: enumOptions(InvoiceStatus) },
    { key: 'type', label: 'Type', kind: 'enum', options: enumOptions(InvoiceType) },
  ],
  columns: [
    { key: 'id', label: 'Invoice ID' },
    { key: 'invoiceNumber', label: 'Invoice no.', default: true },
    { key: 'userId', label: 'User ID', default: true },
    { key: 'orderId', label: 'Order ID', default: true },
    { key: 'type', label: 'Type', default: true },
    { key: 'status', label: 'Status', default: true },
    { key: 'buyerLegalName', label: 'Buyer', pii: true },
    { key: 'buyerGstin', label: 'Buyer GSTIN', pii: true },
    { key: 'placeOfSupply', label: 'Place of supply' },
    { key: 'taxable', label: 'Taxable (₹)', default: true },
    { key: 'cgst', label: 'CGST (₹)' },
    { key: 'sgst', label: 'SGST (₹)' },
    { key: 'igst', label: 'IGST (₹)' },
    { key: 'total', label: 'Total (₹)', default: true },
    { key: 'paid', label: 'Paid (₹)', default: true },
    { key: 'refunded', label: 'Refunded (₹)', default: true },
    { key: 'issuedAt', label: 'Issued', default: true },
  ],
  count: ({ where }) => prisma.invoice.count({ where: where as Prisma.InvoiceWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.invoice.findMany({
      where: where as Prisma.InvoiceWhereInput,
      select: {
        id: true,
        invoiceNumber: true,
        userId: true,
        orderId: true,
        type: true,
        status: true,
        buyerLegalName: true,
        buyerGstin: true,
        placeOfSupply: true,
        taxableAmountPaise: true,
        cgstPaise: true,
        sgstPaise: true,
        igstPaise: true,
        totalPaise: true,
        paidPaise: true,
        refundedPaise: true,
        issuedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      userId: i.userId,
      orderId: i.orderId,
      type: i.type,
      status: i.status,
      buyerLegalName: i.buyerLegalName,
      buyerGstin: i.buyerGstin,
      placeOfSupply: i.placeOfSupply,
      taxable: rupees(i.taxableAmountPaise),
      cgst: rupees(i.cgstPaise),
      sgst: rupees(i.sgstPaise),
      igst: rupees(i.igstPaise),
      total: rupees(i.totalPaise),
      paid: rupees(i.paidPaise),
      refunded: rupees(i.refundedPaise),
      issuedAt: dt(i.issuedAt),
    }));
  },
};

const subscriptionsDataset: ReportDatasetDef = {
  key: 'subscriptions',
  label: 'Subscriptions',
  group: 'Revenue',
  description: 'Recurring subscriptions with renewal mode and cycle counts.',
  dateFields: [
    { key: 'createdAt', label: 'Created' },
    { key: 'currentEnd', label: 'Cycle end' },
    { key: 'nextChargeAt', label: 'Next charge' },
    { key: 'cancelledAt', label: 'Cancelled' },
  ],
  filters: [
    { key: 'status', label: 'Status', kind: 'enum', options: enumOptions(SubscriptionStatus) },
    { key: 'autoRenew', label: 'Auto-renew', kind: 'boolean' },
  ],
  columns: [
    { key: 'id', label: 'Subscription ID', default: true },
    { key: 'userId', label: 'User ID', default: true },
    { key: 'planCode', label: 'Plan code', default: true },
    { key: 'planName', label: 'Plan', default: true },
    { key: 'status', label: 'Status', default: true },
    { key: 'autoRenew', label: 'Auto-renew', default: true },
    { key: 'paidCount', label: 'Cycles paid', default: true },
    { key: 'remainingCount', label: 'Cycles left' },
    { key: 'currentStart', label: 'Cycle start' },
    { key: 'currentEnd', label: 'Cycle end', default: true },
    { key: 'nextChargeAt', label: 'Next charge', default: true },
    { key: 'failureCount', label: 'Failures' },
    { key: 'cancelledAt', label: 'Cancelled' },
    { key: 'createdAt', label: 'Created', default: true },
  ],
  count: ({ where }) =>
    prisma.subscription.count({ where: where as Prisma.SubscriptionWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.subscription.findMany({
      where: where as Prisma.SubscriptionWhereInput,
      select: {
        id: true,
        userId: true,
        status: true,
        autoRenew: true,
        paidCount: true,
        remainingCount: true,
        currentStart: true,
        currentEnd: true,
        nextChargeAt: true,
        failureCount: true,
        cancelledAt: true,
        createdAt: true,
        plan: { select: { code: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((s) => ({
      id: s.id,
      userId: s.userId,
      planCode: s.plan?.code ?? null,
      planName: s.plan?.name ?? null,
      status: s.status,
      autoRenew: s.autoRenew,
      paidCount: s.paidCount,
      remainingCount: s.remainingCount,
      currentStart: dt(s.currentStart),
      currentEnd: dt(s.currentEnd),
      nextChargeAt: dt(s.nextChargeAt),
      failureCount: s.failureCount,
      cancelledAt: dt(s.cancelledAt),
      createdAt: dt(s.createdAt),
    }));
  },
};

const refundsDataset: ReportDatasetDef = {
  key: 'refunds',
  label: 'Refunds',
  group: 'Revenue',
  description: 'Money actually returned, with reason and processing state.',
  dateFields: [
    { key: 'createdAt', label: 'Initiated' },
    { key: 'processedAt', label: 'Processed' },
  ],
  filters: [{ key: 'status', label: 'Status', kind: 'enum', options: enumOptions(RefundStatus) }],
  columns: [
    { key: 'id', label: 'Refund ID', default: true },
    { key: 'razorpayRefundId', label: 'Razorpay ID', default: true },
    { key: 'orderId', label: 'Order ID', default: true },
    { key: 'receiptNumber', label: 'Receipt' },
    { key: 'amount', label: 'Amount (₹)', default: true },
    { key: 'reason', label: 'Reason', default: true },
    { key: 'status', label: 'Status', default: true },
    { key: 'notes', label: 'Notes' },
    { key: 'createdAt', label: 'Initiated', default: true },
    { key: 'processedAt', label: 'Processed', default: true },
  ],
  count: ({ where }) => prisma.refund.count({ where: where as Prisma.RefundWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.refund.findMany({
      where: where as Prisma.RefundWhereInput,
      select: {
        id: true,
        razorpayRefundId: true,
        orderId: true,
        amountPaise: true,
        reason: true,
        status: true,
        notes: true,
        createdAt: true,
        processedAt: true,
        order: { select: { receiptNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((r) => ({
      id: r.id,
      razorpayRefundId: r.razorpayRefundId,
      orderId: r.orderId,
      receiptNumber: r.order?.receiptNumber ?? null,
      amount: rupees(r.amountPaise),
      reason: r.reason,
      status: r.status,
      notes: r.notes,
      createdAt: dt(r.createdAt),
      processedAt: dt(r.processedAt),
    }));
  },
};

const refundRequestsDataset: ReportDatasetDef = {
  key: 'refund_requests',
  label: 'Refund requests',
  group: 'Revenue',
  description: 'Customer-raised refund requests and their review outcome.',
  dateFields: [
    { key: 'createdAt', label: 'Raised' },
    { key: 'reviewedAt', label: 'Reviewed' },
  ],
  filters: [
    { key: 'status', label: 'Status', kind: 'enum', options: enumOptions(RefundRequestStatus) },
    { key: 'withinWindow', label: 'Inside refund window', kind: 'boolean' },
  ],
  columns: [
    { key: 'id', label: 'Request ID', default: true },
    { key: 'userId', label: 'User ID', default: true },
    { key: 'orderId', label: 'Order ID', default: true },
    { key: 'receiptNumber', label: 'Receipt' },
    { key: 'amount', label: 'Requested (₹)', default: true },
    { key: 'status', label: 'Status', default: true },
    { key: 'withinWindow', label: 'In window', default: true },
    { key: 'userReason', label: 'Customer reason', pii: true },
    { key: 'reviewNotes', label: 'Reviewer note' },
    { key: 'refundId', label: 'Refund ID' },
    { key: 'createdAt', label: 'Raised', default: true },
    { key: 'reviewedAt', label: 'Reviewed', default: true },
  ],
  count: ({ where }) =>
    prisma.refundRequest.count({ where: where as Prisma.RefundRequestWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.refundRequest.findMany({
      where: where as Prisma.RefundRequestWhereInput,
      select: {
        id: true,
        userId: true,
        orderId: true,
        amountPaise: true,
        status: true,
        withinWindow: true,
        userReason: true,
        reviewNotes: true,
        refundId: true,
        createdAt: true,
        reviewedAt: true,
        order: { select: { receiptNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      orderId: r.orderId,
      receiptNumber: r.order?.receiptNumber ?? null,
      amount: rupees(r.amountPaise),
      status: r.status,
      withinWindow: r.withinWindow,
      userReason: r.userReason,
      reviewNotes: r.reviewNotes,
      refundId: r.refundId,
      createdAt: dt(r.createdAt),
      reviewedAt: dt(r.reviewedAt),
    }));
  },
};

const entitlementsDataset: ReportDatasetDef = {
  key: 'entitlements',
  label: 'Entitlements',
  group: 'Revenue',
  description: 'Granted plan entitlements — what each account currently holds.',
  dateFields: [
    { key: 'createdAt', label: 'Granted' },
    { key: 'validFrom', label: 'Valid from' },
    { key: 'validUntil', label: 'Valid until' },
  ],
  filters: [
    { key: 'status', label: 'Status', kind: 'enum', options: enumOptions(EntitlementStatus) },
    { key: 'source', label: 'Source', kind: 'enum', options: enumOptions(EntitlementSource) },
    { key: 'autoRenew', label: 'Auto-renew', kind: 'boolean' },
  ],
  columns: [
    { key: 'id', label: 'Entitlement ID', default: true },
    { key: 'userId', label: 'User ID', default: true },
    { key: 'planCode', label: 'Plan code', default: true },
    { key: 'planName', label: 'Plan', default: true },
    { key: 'planCategory', label: 'Category', default: true },
    { key: 'status', label: 'Status', default: true },
    { key: 'source', label: 'Source', default: true },
    { key: 'validFrom', label: 'Valid from', default: true },
    { key: 'validUntil', label: 'Valid until', default: true },
    { key: 'autoRenew', label: 'Auto-renew' },
    { key: 'sourceOrderId', label: 'Source order' },
    { key: 'resourceCount', label: 'Resource lines' },
  ],
  count: ({ where }) => prisma.entitlement.count({ where: where as Prisma.EntitlementWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.entitlement.findMany({
      where: where as Prisma.EntitlementWhereInput,
      select: {
        id: true,
        userId: true,
        status: true,
        source: true,
        validFrom: true,
        validUntil: true,
        autoRenew: true,
        sourceOrderId: true,
        plan: { select: { code: true, name: true, category: true } },
        _count: { select: { resources: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((e) => ({
      id: e.id,
      userId: e.userId,
      planCode: e.plan?.code ?? null,
      planName: e.plan?.name ?? null,
      planCategory: e.plan?.category ?? null,
      status: e.status,
      source: e.source,
      validFrom: dt(e.validFrom),
      validUntil: dt(e.validUntil),
      autoRenew: e.autoRenew,
      sourceOrderId: e.sourceOrderId,
      resourceCount: e._count.resources,
    }));
  },
};

const couponsDataset: ReportDatasetDef = {
  key: 'coupons',
  label: 'Coupons',
  group: 'Revenue',
  description: 'Discount coupons with redemption caps and usage counts.',
  dateFields: [
    { key: 'createdAt', label: 'Created' },
    { key: 'startsAt', label: 'Starts' },
    { key: 'endsAt', label: 'Ends' },
  ],
  filters: [
    { key: 'status', label: 'Status', kind: 'enum', options: enumOptions(CouponStatus) },
    { key: 'type', label: 'Type', kind: 'enum', options: enumOptions(CouponType) },
    { key: 'autoApply', label: 'Auto-apply', kind: 'boolean' },
  ],
  columns: [
    { key: 'id', label: 'Coupon ID' },
    { key: 'code', label: 'Code', default: true },
    { key: 'name', label: 'Name', default: true },
    { key: 'type', label: 'Type', default: true },
    { key: 'status', label: 'Status', default: true },
    { key: 'valueAmount', label: 'Flat value (₹)' },
    { key: 'valuePercent', label: 'Percent off' },
    { key: 'redemptionsCount', label: 'Redemptions', default: true },
    { key: 'maxRedemptions', label: 'Max redemptions', default: true },
    { key: 'startsAt', label: 'Starts', default: true },
    { key: 'endsAt', label: 'Ends', default: true },
    { key: 'createdAt', label: 'Created' },
  ],
  count: ({ where }) => prisma.coupon.count({ where: where as Prisma.CouponWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.coupon.findMany({
      where: where as Prisma.CouponWhereInput,
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        status: true,
        valuePaise: true,
        valuePercent: true,
        redemptionsCount: true,
        maxRedemptions: true,
        startsAt: true,
        endsAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      type: c.type,
      status: c.status,
      valueAmount: rupees(c.valuePaise),
      valuePercent: num(c.valuePercent),
      redemptionsCount: c.redemptionsCount,
      maxRedemptions: c.maxRedemptions,
      startsAt: dt(c.startsAt),
      endsAt: dt(c.endsAt),
      createdAt: dt(c.createdAt),
    }));
  },
};

/* ------------------------------------------------------------------ */
/* Group: Risk                                                         */
/* ------------------------------------------------------------------ */

const fraudEventsDataset: ReportDatasetDef = {
  key: 'fraud_events',
  label: 'Fraud signals',
  group: 'Risk',
  description: 'Fraud signals raised on orders and payments, with review outcome.',
  dateFields: [
    { key: 'createdAt', label: 'Raised' },
    { key: 'reviewedAt', label: 'Reviewed' },
  ],
  filters: [
    { key: 'severity', label: 'Severity', kind: 'enum', options: enumOptions(FraudSeverity) },
    { key: 'action', label: 'Action taken', kind: 'enum', options: enumOptions(FraudAction) },
  ],
  columns: [
    { key: 'id', label: 'Event ID', default: true },
    { key: 'signal', label: 'Signal', default: true },
    { key: 'severity', label: 'Severity', default: true },
    { key: 'action', label: 'Action', default: true },
    { key: 'userId', label: 'User ID', default: true },
    { key: 'orderId', label: 'Order ID' },
    { key: 'paymentId', label: 'Payment ID' },
    { key: 'notes', label: 'Notes' },
    { key: 'createdAt', label: 'Raised', default: true },
    { key: 'reviewedAt', label: 'Reviewed', default: true },
  ],
  count: ({ where }) =>
    prisma.fraudSignalEvent.count({ where: where as Prisma.FraudSignalEventWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.fraudSignalEvent.findMany({
      where: where as Prisma.FraudSignalEventWhereInput,
      select: {
        id: true,
        signal: true,
        severity: true,
        action: true,
        userId: true,
        orderId: true,
        paymentId: true,
        notes: true,
        createdAt: true,
        reviewedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((f) => ({
      id: f.id,
      signal: f.signal,
      severity: f.severity,
      action: f.action,
      userId: f.userId,
      orderId: f.orderId,
      paymentId: f.paymentId,
      notes: f.notes,
      createdAt: dt(f.createdAt),
      reviewedAt: dt(f.reviewedAt),
    }));
  },
};

const disputesDataset: ReportDatasetDef = {
  key: 'disputes',
  label: 'Disputes & chargebacks',
  group: 'Risk',
  description: 'Payment disputes with reason code and response deadline.',
  dateFields: [
    { key: 'createdAt', label: 'Opened' },
    { key: 'dueByAt', label: 'Response due' },
  ],
  filters: [{ key: 'status', label: 'Status', kind: 'enum', options: enumOptions(DisputeStatus) }],
  columns: [
    { key: 'id', label: 'Dispute ID', default: true },
    { key: 'razorpayDisputeId', label: 'Razorpay ID', default: true },
    { key: 'paymentId', label: 'Payment ID', default: true },
    { key: 'status', label: 'Status', default: true },
    { key: 'reasonCode', label: 'Reason code', default: true },
    { key: 'reasonDescription', label: 'Reason' },
    { key: 'amount', label: 'Amount (₹)', default: true },
    { key: 'dueByAt', label: 'Response due', default: true },
    { key: 'createdAt', label: 'Opened', default: true },
  ],
  count: ({ where }) => prisma.dispute.count({ where: where as Prisma.DisputeWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.dispute.findMany({
      where: where as Prisma.DisputeWhereInput,
      select: {
        id: true,
        razorpayDisputeId: true,
        paymentId: true,
        status: true,
        reasonCode: true,
        reasonDescription: true,
        amountPaise: true,
        dueByAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((d) => ({
      id: d.id,
      razorpayDisputeId: d.razorpayDisputeId,
      paymentId: d.paymentId,
      status: d.status,
      reasonCode: d.reasonCode,
      reasonDescription: d.reasonDescription,
      amount: rupees(d.amountPaise),
      dueByAt: dt(d.dueByAt),
      createdAt: dt(d.createdAt),
    }));
  },
};

/* ------------------------------------------------------------------ */
/* Group: Engagement                                                   */
/* ------------------------------------------------------------------ */

const emailCampaignsDataset: ReportDatasetDef = {
  key: 'email_campaigns',
  label: 'Email campaigns',
  group: 'Engagement',
  description: 'Campaign sends with the full delivery and engagement funnel.',
  dateFields: [
    { key: 'createdAt', label: 'Created' },
    { key: 'scheduledAt', label: 'Scheduled' },
    { key: 'startedAt', label: 'Started' },
    { key: 'completedAt', label: 'Completed' },
  ],
  filters: [
    { key: 'status', label: 'Status', kind: 'enum', options: enumOptions(EmailCampaignStatus) },
    { key: 'isAbTest', label: 'A/B test', kind: 'boolean' },
  ],
  columns: [
    { key: 'id', label: 'Campaign ID' },
    { key: 'name', label: 'Name', default: true },
    { key: 'status', label: 'Status', default: true },
    { key: 'audienceType', label: 'Audience', default: true },
    { key: 'totalRecipients', label: 'Recipients', default: true },
    { key: 'sentCount', label: 'Sent', default: true },
    { key: 'deliveredCount', label: 'Delivered', default: true },
    { key: 'openedCount', label: 'Opened', default: true },
    { key: 'clickedCount', label: 'Clicked', default: true },
    { key: 'bouncedCount', label: 'Bounced', default: true },
    { key: 'complainedCount', label: 'Complaints' },
    { key: 'unsubscribedCount', label: 'Unsubscribes' },
    { key: 'repliedCount', label: 'Replies' },
    { key: 'convertedCount', label: 'Conversions' },
    { key: 'failedCount', label: 'Failed' },
    { key: 'startedAt', label: 'Started', default: true },
    { key: 'completedAt', label: 'Completed', default: true },
  ],
  count: ({ where }) =>
    prisma.emailCampaign.count({ where: where as Prisma.EmailCampaignWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.emailCampaign.findMany({
      where: where as Prisma.EmailCampaignWhereInput,
      select: {
        id: true,
        name: true,
        status: true,
        audienceType: true,
        totalRecipients: true,
        sentCount: true,
        deliveredCount: true,
        openedCount: true,
        clickedCount: true,
        bouncedCount: true,
        complainedCount: true,
        unsubscribedCount: true,
        repliedCount: true,
        convertedCount: true,
        failedCount: true,
        startedAt: true,
        completedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      audienceType: c.audienceType,
      totalRecipients: c.totalRecipients,
      sentCount: c.sentCount,
      deliveredCount: c.deliveredCount,
      openedCount: c.openedCount,
      clickedCount: c.clickedCount,
      bouncedCount: c.bouncedCount,
      complainedCount: c.complainedCount,
      unsubscribedCount: c.unsubscribedCount,
      repliedCount: c.repliedCount,
      convertedCount: c.convertedCount,
      failedCount: c.failedCount,
      startedAt: dt(c.startedAt),
      completedAt: dt(c.completedAt),
    }));
  },
};

const waCampaignsDataset: ReportDatasetDef = {
  key: 'wa_campaigns',
  label: 'WhatsApp campaigns',
  group: 'Engagement',
  description: 'WhatsApp broadcast performance including spend.',
  dateFields: [
    { key: 'createdAt', label: 'Created' },
    { key: 'scheduledAt', label: 'Scheduled' },
    { key: 'startedAt', label: 'Started' },
    { key: 'completedAt', label: 'Completed' },
  ],
  filters: [
    { key: 'status', label: 'Status', kind: 'enum', options: enumOptions(WaCampaignStatus) },
    { key: 'isAbTest', label: 'A/B test', kind: 'boolean' },
  ],
  columns: [
    { key: 'id', label: 'Campaign ID' },
    { key: 'name', label: 'Name', default: true },
    { key: 'status', label: 'Status', default: true },
    { key: 'audienceType', label: 'Audience', default: true },
    { key: 'totalRecipients', label: 'Recipients', default: true },
    { key: 'sentCount', label: 'Sent', default: true },
    { key: 'deliveredCount', label: 'Delivered', default: true },
    { key: 'readCount', label: 'Read', default: true },
    { key: 'repliedCount', label: 'Replies' },
    { key: 'convertedCount', label: 'Conversions' },
    { key: 'failedCount', label: 'Failed', default: true },
    { key: 'estimatedCost', label: 'Est. cost (₹)' },
    { key: 'actualCost', label: 'Actual cost (₹)', default: true },
    { key: 'startedAt', label: 'Started', default: true },
    { key: 'completedAt', label: 'Completed', default: true },
  ],
  count: ({ where }) => prisma.waCampaign.count({ where: where as Prisma.WaCampaignWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.waCampaign.findMany({
      where: where as Prisma.WaCampaignWhereInput,
      select: {
        id: true,
        name: true,
        status: true,
        audienceType: true,
        totalRecipients: true,
        sentCount: true,
        deliveredCount: true,
        readCount: true,
        repliedCount: true,
        convertedCount: true,
        failedCount: true,
        estimatedCostPaise: true,
        actualCostPaise: true,
        startedAt: true,
        completedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      audienceType: c.audienceType,
      totalRecipients: c.totalRecipients,
      sentCount: c.sentCount,
      deliveredCount: c.deliveredCount,
      readCount: c.readCount,
      repliedCount: c.repliedCount,
      convertedCount: c.convertedCount,
      failedCount: c.failedCount,
      estimatedCost: rupees(c.estimatedCostPaise),
      actualCost: rupees(c.actualCostPaise),
      startedAt: dt(c.startedAt),
      completedAt: dt(c.completedAt),
    }));
  },
};

const reviewsDataset: ReportDatasetDef = {
  key: 'reviews',
  label: 'Company reviews',
  group: 'Engagement',
  description: 'Employee reviews with ratings and moderation state.',
  dateFields: [
    { key: 'createdAt', label: 'Submitted' },
    { key: 'moderatedAt', label: 'Moderated' },
  ],
  filters: [
    { key: 'status', label: 'Status', kind: 'enum', options: enumOptions(ReviewStatus) },
    { key: 'isDetailed', label: 'Detailed review', kind: 'boolean' },
    { key: 'currentlyWorking', label: 'Currently working', kind: 'boolean' },
  ],
  columns: [
    { key: 'id', label: 'Review ID', default: true },
    { key: 'companyId', label: 'Company ID', default: true },
    { key: 'companyName', label: 'Company', default: true },
    { key: 'userId', label: 'Reviewer user ID' },
    { key: 'overallRating', label: 'Overall', default: true },
    { key: 'ratingWorkLifeBalance', label: 'Work-life' },
    { key: 'ratingSalary', label: 'Salary' },
    { key: 'ratingCompanyCulture', label: 'Culture' },
    { key: 'designation', label: 'Designation', default: true },
    { key: 'status', label: 'Status', default: true },
    { key: 'moderationReason', label: 'Moderation reason' },
    { key: 'reportedCount', label: 'Reports' },
    { key: 'helpfulCount', label: 'Helpful votes' },
    { key: 'createdAt', label: 'Submitted', default: true },
  ],
  count: ({ where }) =>
    prisma.companyReview.count({ where: where as Prisma.CompanyReviewWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.companyReview.findMany({
      where: where as Prisma.CompanyReviewWhereInput,
      select: {
        id: true,
        companyId: true,
        userId: true,
        overallRating: true,
        ratingWorkLifeBalance: true,
        ratingSalary: true,
        ratingCompanyCulture: true,
        designation: true,
        status: true,
        moderationReason: true,
        reportedCount: true,
        helpfulCount: true,
        createdAt: true,
        company: { select: { companyName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((r) => ({
      id: r.id,
      companyId: r.companyId,
      companyName: r.company?.companyName ?? null,
      userId: r.userId,
      overallRating: num(r.overallRating),
      ratingWorkLifeBalance: num(r.ratingWorkLifeBalance),
      ratingSalary: num(r.ratingSalary),
      ratingCompanyCulture: num(r.ratingCompanyCulture),
      designation: r.designation,
      status: r.status,
      moderationReason: r.moderationReason,
      reportedCount: r.reportedCount,
      helpfulCount: r.helpfulCount,
      createdAt: dt(r.createdAt),
    }));
  },
};

/* ------------------------------------------------------------------ */
/* Group: Operations                                                   */
/* ------------------------------------------------------------------ */

const ticketsDataset: ReportDatasetDef = {
  key: 'tickets',
  label: 'Support tickets',
  group: 'Operations',
  description: 'Support tickets with SLA timestamps and satisfaction score.',
  dateFields: [
    { key: 'createdAt', label: 'Opened' },
    { key: 'firstResponseAt', label: 'First response' },
    { key: 'resolvedAt', label: 'Resolved' },
    { key: 'closedAt', label: 'Closed' },
  ],
  filters: [
    { key: 'status', label: 'Status', kind: 'enum', options: enumOptions(TicketStatus) },
    { key: 'priority', label: 'Priority', kind: 'enum', options: enumOptions(TicketPriority) },
    { key: 'category', label: 'Category', kind: 'enum', options: enumOptions(TicketCategory) },
  ],
  columns: [
    { key: 'id', label: 'Ticket ID' },
    { key: 'ticketNumber', label: 'Ticket no.', default: true },
    { key: 'subject', label: 'Subject', default: true },
    { key: 'status', label: 'Status', default: true },
    { key: 'priority', label: 'Priority', default: true },
    { key: 'category', label: 'Category', default: true },
    { key: 'userId', label: 'User ID' },
    { key: 'requesterEmail', label: 'Requester email', pii: true },
    { key: 'assignedToId', label: 'Assigned to' },
    { key: 'satisfaction', label: 'Satisfaction' },
    { key: 'messageCount', label: 'Messages' },
    { key: 'createdAt', label: 'Opened', default: true },
    { key: 'firstResponseAt', label: 'First response', default: true },
    { key: 'resolvedAt', label: 'Resolved', default: true },
  ],
  count: ({ where }) =>
    prisma.supportTicket.count({ where: where as Prisma.SupportTicketWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.supportTicket.findMany({
      where: where as Prisma.SupportTicketWhereInput,
      select: {
        id: true,
        ticketNumber: true,
        subject: true,
        status: true,
        priority: true,
        category: true,
        userId: true,
        guestEmail: true,
        assignedToId: true,
        satisfaction: true,
        createdAt: true,
        firstResponseAt: true,
        resolvedAt: true,
        user: { select: { email: true } },
        _count: { select: { messages: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      category: t.category,
      userId: t.userId,
      requesterEmail: t.user?.email ?? t.guestEmail ?? null,
      assignedToId: t.assignedToId,
      satisfaction: t.satisfaction,
      messageCount: t._count.messages,
      createdAt: dt(t.createdAt),
      firstResponseAt: dt(t.firstResponseAt),
      resolvedAt: dt(t.resolvedAt),
    }));
  },
};

const auditLogsDataset: ReportDatasetDef = {
  key: 'audit_logs',
  label: 'Audit log',
  group: 'Operations',
  description: 'Privileged-action audit trail. Actor, entity and source address.',
  dateFields: [{ key: 'createdAt', label: 'When' }],
  filters: [{ key: 'isArchived', label: 'Archived', kind: 'boolean' }],
  columns: [
    { key: 'id', label: 'Log ID' },
    { key: 'action', label: 'Action', default: true },
    { key: 'entity', label: 'Entity', default: true },
    { key: 'entityId', label: 'Entity ID', default: true },
    { key: 'performedBy', label: 'Actor user ID', default: true },
    { key: 'actorEmail', label: 'Actor email', pii: true },
    { key: 'ipAddress', label: 'IP address', pii: true },
    { key: 'userAgent', label: 'User agent', pii: true },
    { key: 'createdAt', label: 'When', default: true },
  ],
  count: ({ where }) => prisma.auditLog.count({ where: where as Prisma.AuditLogWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.auditLog.findMany({
      where: where as Prisma.AuditLogWhereInput,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        performedBy: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        user: { select: { email: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((a) => ({
      id: a.id,
      action: a.action,
      entity: a.entity,
      entityId: a.entityId,
      performedBy: a.performedBy,
      actorEmail: a.user?.email ?? null,
      ipAddress: a.ipAddress,
      userAgent: a.userAgent,
      createdAt: dt(a.createdAt),
    }));
  },
};

/* ------------------------------------------------------------------ */
/* Registry                                                            */
/* ------------------------------------------------------------------ */

/**
 * Every dataset the report builder can export. Order here is the order the UI
 * lists them in, grouped by `group`. The messaging / ledger / ops / metrics
 * groups are appended from `report-datasets-extra.ts`.
 */
export const REPORT_DATASETS: ReportDatasetDef[] = [
  usersDataset,
  candidatesDataset,
  employersDataset,
  vendorsDataset,
  jobsDataset,
  applicationsDataset,
  assistedHiringDataset,
  ordersDataset,
  paymentsDataset,
  invoicesDataset,
  subscriptionsDataset,
  refundsDataset,
  refundRequestsDataset,
  entitlementsDataset,
  couponsDataset,
  fraudEventsDataset,
  disputesDataset,
  emailCampaignsDataset,
  waCampaignsDataset,
  reviewsDataset,
  ticketsDataset,
  auditLogsDataset,
  ...EXTRA_REPORT_DATASETS,
];

export function getDataset(key: string): ReportDatasetDef | undefined {
  return REPORT_DATASETS.find((d) => d.key === key);
}

/** Metadata only — safe to serialise to the client (drops `count`/`page`). */
export function describeDatasets(): Array<Omit<ReportDatasetDef, 'count' | 'page'>> {
  return REPORT_DATASETS.map(({ count: _count, page: _page, ...meta }) => meta);
}
