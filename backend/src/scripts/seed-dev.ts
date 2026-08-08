/**
 * Development Seed Script
 *
 * Creates sample data for all roles: super admin, admin, employers, candidates.
 * Includes companies, job posts, applications, notifications, and system config.
 *
 * Usage: npm run db:seed:dev
 */

import {
  Role,
  JobType,
  JobStatus,
  WorkMode,
  ShiftType,
  ExperienceLevel,
  SalaryType,
  CompanyType,
  ApplicationStatus,
  NoticePeriod,
  WorkStatus,
  Gender,
  UrgencyLevel,
  EducationLevel,
  NotificationType,
} from '@prisma/client';
import prisma from '../config/prisma';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_PASSWORD = 'Test@12345';

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

async function seed() {
  console.log('Seeding development database...\n');

  const hashedPassword = await hashPassword(DEFAULT_PASSWORD);

  // ─── 1. Users ───────────────────────────────────────────────

  console.log('Creating users...');

  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@hireadda.in' },
    update: {},
    create: {
      email: 'superadmin@hireadda.in',
      password: hashedPassword,
      role: Role.SUPER_ADMIN,
      firstName: 'Super',
      lastName: 'Admin',
      isEmailVerified: true,
      isActive: true,
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@hireadda.in' },
    update: {},
    create: {
      email: 'admin@hireadda.in',
      password: hashedPassword,
      role: Role.ADMIN,
      firstName: 'Platform',
      lastName: 'Admin',
      isEmailVerified: true,
      isActive: true,
    },
  });

  const employer1 = await prisma.user.upsert({
    where: { email: 'hr@techcorp.com' },
    update: {},
    create: {
      email: 'hr@techcorp.com',
      password: hashedPassword,
      role: Role.EMPLOYER,
      firstName: 'Priya',
      lastName: 'Sharma',
      isEmailVerified: true,
      isActive: true,
    },
  });

  const employer2 = await prisma.user.upsert({
    where: { email: 'hiring@startupx.com' },
    update: {},
    create: {
      email: 'hiring@startupx.com',
      password: hashedPassword,
      role: Role.EMPLOYER,
      firstName: 'Rahul',
      lastName: 'Verma',
      isEmailVerified: true,
      isActive: true,
    },
  });

  const candidates = await Promise.all(
    [
      { email: 'rahul.dev@gmail.com', first: 'Rahul', last: 'Kumar' },
      { email: 'sneha.data@gmail.com', first: 'Sneha', last: 'Patel' },
      { email: 'arjun.full@gmail.com', first: 'Arjun', last: 'Singh' },
      { email: 'neha.design@gmail.com', first: 'Neha', last: 'Gupta' },
      { email: 'amit.devops@gmail.com', first: 'Amit', last: 'Joshi' },
    ].map((c) =>
      prisma.user.upsert({
        where: { email: c.email },
        update: {},
        create: {
          email: c.email,
          password: hashedPassword,
          role: Role.CANDIDATE,
          firstName: c.first,
          lastName: c.last,
          isEmailVerified: true,
          isActive: true,
        },
      })
    )
  );

  console.log(`  Created ${2 + 2 + candidates.length} users`);

  // ─── 2. Company Profiles ────────────────────────────────────

  console.log('Creating company profiles...');

  const company1 = await prisma.companyProfile.upsert({
    where: { userId: employer1.id },
    update: {},
    create: {
      userId: employer1.id,
      companyName: 'TechCorp Solutions',
      companyType: CompanyType.MNC,
      tagline: 'Building the future of enterprise software',
      industry: 'Information Technology',
      companySize: '1001-5000',
      employeeCount: 3200,
      description:
        'TechCorp Solutions is a leading multinational technology company specializing in enterprise software, cloud computing, and AI solutions. Founded in 2005, we serve Fortune 500 clients globally.',
      website: 'https://techcorp.example.com',
      foundedYear: 2005,
      isVerified: true,
      techStack: ['React', 'Node.js', 'Python', 'AWS', 'Kubernetes', 'PostgreSQL'],
      benefits: [
        'Health Insurance',
        'Stock Options',
        'Remote Work',
        'Learning Budget',
        'Gym Membership',
      ],
      contactEmail: 'hr@techcorp.com',
      contactPhone: '+91-9876543210',
      headquarters: 'Bangalore, Karnataka',
      city: 'Bangalore',
      state: 'Karnataka',
      country: 'India',
      locations: ['Bangalore', 'Mumbai', 'Hyderabad', 'Pune'],
      latitude: 12.9716,
      longitude: 77.5946,
    },
  });

  const company2 = await prisma.companyProfile.upsert({
    where: { userId: employer2.id },
    update: {},
    create: {
      userId: employer2.id,
      companyName: 'StartupX Labs',
      companyType: CompanyType.STARTUP,
      tagline: 'AI-first startup disrupting healthcare',
      industry: 'Healthcare Technology',
      companySize: '11-50',
      employeeCount: 35,
      description:
        'StartupX Labs is an AI-first startup revolutionizing healthcare diagnostics using computer vision and machine learning. Backed by top-tier VCs.',
      website: 'https://startupx.example.com',
      foundedYear: 2022,
      isVerified: false,
      techStack: ['Python', 'TensorFlow', 'FastAPI', 'React', 'GCP', 'MongoDB'],
      benefits: ['ESOPs', 'Flexible Hours', 'Health Insurance', 'Team Outings'],
      contactEmail: 'hiring@startupx.com',
      contactPhone: '+91-8765432109',
      headquarters: 'Mumbai, Maharashtra',
      city: 'Mumbai',
      state: 'Maharashtra',
      country: 'India',
      locations: ['Mumbai'],
      latitude: 19.076,
      longitude: 72.8777,
    },
  });

  console.log(`  Created 2 company profiles`);

  // ─── 3. Candidate Profiles ──────────────────────────────────

  console.log('Creating candidate profiles...');

  const profiles = [
    {
      userId: candidates[0].id,
      headline: 'Senior Full Stack Developer | 6 yrs | React + Node.js',
      gender: Gender.MALE,
      currentLocation: 'Bangalore',
      city: 'Bangalore',
      state: 'Karnataka',
      experienceYears: 6,
      currentCompany: 'Infosys',
      currentRole: 'Senior Software Engineer',
      currentIndustry: 'Information Technology',
      currSalary: 1800000,
      expectedSalaryMin: 2400000,
      expectedSalaryMax: 3000000,
      noticePeriod: NoticePeriod.THIRTY_DAYS,
      workStatus: WorkStatus.EMPLOYED,
      skills: ['React', 'Node.js', 'TypeScript', 'PostgreSQL', 'Docker', 'AWS'],
      profileCompleteness: 85,
      latitude: 12.9716,
      longitude: 77.5946,
    },
    {
      userId: candidates[1].id,
      headline: 'Data Scientist | Python + ML | 4 yrs exp',
      gender: Gender.FEMALE,
      currentLocation: 'Mumbai',
      city: 'Mumbai',
      state: 'Maharashtra',
      experienceYears: 4,
      currentCompany: 'TCS',
      currentRole: 'Data Scientist',
      currentIndustry: 'Information Technology',
      currSalary: 1500000,
      expectedSalaryMin: 2000000,
      expectedSalaryMax: 2500000,
      noticePeriod: NoticePeriod.SIXTY_DAYS,
      workStatus: WorkStatus.EMPLOYED,
      skills: ['Python', 'TensorFlow', 'Pandas', 'SQL', 'Tableau', 'MLflow'],
      profileCompleteness: 90,
      latitude: 19.076,
      longitude: 72.8777,
    },
    {
      userId: candidates[2].id,
      headline: 'Backend Developer | Java + Spring Boot | 3 yrs',
      gender: Gender.MALE,
      currentLocation: 'Hyderabad',
      city: 'Hyderabad',
      state: 'Telangana',
      experienceYears: 3,
      currentCompany: 'Wipro',
      currentRole: 'Software Developer',
      currentIndustry: 'Information Technology',
      currSalary: 1200000,
      expectedSalaryMin: 1600000,
      expectedSalaryMax: 2000000,
      noticePeriod: NoticePeriod.THIRTY_DAYS,
      workStatus: WorkStatus.ACTIVELY_LOOKING,
      skills: ['Java', 'Spring Boot', 'Hibernate', 'MySQL', 'Kafka', 'Redis'],
      profileCompleteness: 70,
      latitude: 17.385,
      longitude: 78.4867,
    },
    {
      userId: candidates[3].id,
      headline: 'UI/UX Designer | Figma + React | 2 yrs',
      gender: Gender.FEMALE,
      currentLocation: 'Pune',
      city: 'Pune',
      state: 'Maharashtra',
      experienceYears: 2,
      currentCompany: null,
      currentRole: null,
      currentIndustry: 'Design',
      currSalary: null,
      expectedSalaryMin: 800000,
      expectedSalaryMax: 1200000,
      noticePeriod: NoticePeriod.IMMEDIATE,
      workStatus: WorkStatus.ACTIVELY_LOOKING,
      skills: ['Figma', 'Sketch', 'Adobe XD', 'HTML', 'CSS', 'React'],
      profileCompleteness: 65,
      latitude: 18.5204,
      longitude: 73.8567,
    },
    {
      userId: candidates[4].id,
      headline: 'DevOps Engineer | AWS + Kubernetes | 5 yrs',
      gender: Gender.MALE,
      currentLocation: 'Delhi',
      city: 'New Delhi',
      state: 'Delhi',
      experienceYears: 5,
      currentCompany: 'Amazon',
      currentRole: 'DevOps Engineer',
      currentIndustry: 'Information Technology',
      currSalary: 2500000,
      expectedSalaryMin: 3200000,
      expectedSalaryMax: 4000000,
      noticePeriod: NoticePeriod.NINETY_DAYS,
      workStatus: WorkStatus.EMPLOYED,
      skills: ['AWS', 'Kubernetes', 'Docker', 'Terraform', 'Jenkins', 'Python'],
      profileCompleteness: 92,
      latitude: 28.6139,
      longitude: 77.209,
    },
  ];

  for (const p of profiles) {
    await prisma.candidateProfile.upsert({
      where: { userId: p.userId },
      update: {},
      create: {
        ...p,
        salaryCurrency: 'INR',
        country: 'India',
        languages: ['English', 'Hindi'],
        preferredJobType: [JobType.FULL_TIME],
        preferredWorkMode: [WorkMode.HYBRID, WorkMode.REMOTE],
      },
    });
  }

  console.log(`  Created ${profiles.length} candidate profiles`);

  // ─── 4. Job Posts ───────────────────────────────────────────

  console.log('Creating job posts...');

  const jobs = await Promise.all([
    prisma.jobPost.create({
      data: {
        companyId: company1.id,
        title: 'Senior Full Stack Developer',
        description:
          'We are looking for an experienced Full Stack Developer to join our engineering team. You will work on building scalable web applications using React and Node.js.',
        keyResponsibilities:
          'Design and develop scalable web applications\nMentor junior developers\nParticipate in code reviews\nCollaborate with product and design teams',
        requirements:
          'B.Tech/B.E. in Computer Science or equivalent\n5+ years of experience with React and Node.js\nStrong understanding of system design',
        type: JobType.FULL_TIME,
        status: JobStatus.OPEN,
        workMode: WorkMode.HYBRID,
        shiftType: ShiftType.FLEXIBLE,
        industry: 'Information Technology',
        department: 'Engineering',
        experienceMin: 5,
        experienceMax: 8,
        experienceLevel: ExperienceLevel.SENIOR,
        educationRequired: EducationLevel.BACHELORS,
        location: 'Bangalore, Karnataka',
        latitude: 12.9716,
        longitude: 77.5946,
        salaryMin: 2500000,
        salaryMax: 3500000,
        salaryType: SalaryType.ANNUAL,
        salaryDisclosed: true,
        skillsRequired: ['React', 'Node.js', 'TypeScript', 'PostgreSQL'],
        niceToHaveSkills: ['AWS', 'Docker', 'GraphQL'],
        numberOfOpenings: 3,
        urgencyLevel: UrgencyLevel.URGENT,
        tags: ['fullstack', 'react', 'nodejs', 'typescript'],
        jobPerks: ['Remote Fridays', 'Learning Budget', 'Stock Options'],
        applicationDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    }),
    prisma.jobPost.create({
      data: {
        companyId: company1.id,
        title: 'DevOps Engineer',
        description:
          'Join our infrastructure team to build and maintain CI/CD pipelines, manage cloud infrastructure, and ensure system reliability.',
        type: JobType.FULL_TIME,
        status: JobStatus.OPEN,
        workMode: WorkMode.ON_SITE,
        industry: 'Information Technology',
        department: 'Infrastructure',
        experienceMin: 3,
        experienceMax: 6,
        experienceLevel: ExperienceLevel.MID,
        educationRequired: EducationLevel.BACHELORS,
        location: 'Hyderabad, Telangana',
        salaryMin: 1800000,
        salaryMax: 2800000,
        salaryType: SalaryType.ANNUAL,
        skillsRequired: ['AWS', 'Kubernetes', 'Docker', 'Terraform'],
        niceToHaveSkills: ['Python', 'Ansible', 'Prometheus'],
        numberOfOpenings: 2,
        tags: ['devops', 'aws', 'kubernetes'],
        applicationDeadline: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
      },
    }),
    prisma.jobPost.create({
      data: {
        companyId: company2.id,
        title: 'ML Engineer - Healthcare AI',
        description:
          'Build ML models for medical image analysis and diagnostic prediction. Work closely with doctors and researchers.',
        type: JobType.FULL_TIME,
        status: JobStatus.OPEN,
        workMode: WorkMode.REMOTE,
        industry: 'Healthcare Technology',
        department: 'AI/ML',
        experienceMin: 2,
        experienceMax: 5,
        experienceLevel: ExperienceLevel.MID,
        location: 'Mumbai, Maharashtra (Remote)',
        latitude: 19.076,
        longitude: 72.8777,
        isRemote: true,
        salaryMin: 2000000,
        salaryMax: 3500000,
        salaryType: SalaryType.ANNUAL,
        skillsRequired: ['Python', 'TensorFlow', 'PyTorch', 'Computer Vision'],
        niceToHaveSkills: ['DICOM', 'Medical Imaging', 'MLOps'],
        numberOfOpenings: 1,
        urgencyLevel: UrgencyLevel.IMMEDIATE,
        tags: ['ml', 'ai', 'healthcare', 'python'],
        applicationDeadline: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      },
    }),
    prisma.jobPost.create({
      data: {
        companyId: company2.id,
        title: 'Frontend Developer (React)',
        description:
          'Build beautiful, accessible, and performant user interfaces for our healthcare platform.',
        type: JobType.FULL_TIME,
        status: JobStatus.OPEN,
        workMode: WorkMode.HYBRID,
        industry: 'Healthcare Technology',
        department: 'Engineering',
        experienceMin: 1,
        experienceMax: 3,
        experienceLevel: ExperienceLevel.ENTRY,
        location: 'Mumbai, Maharashtra',
        salaryMin: 800000,
        salaryMax: 1500000,
        salaryType: SalaryType.ANNUAL,
        skillsRequired: ['React', 'TypeScript', 'Tailwind CSS', 'HTML'],
        numberOfOpenings: 2,
        tags: ['frontend', 'react', 'typescript'],
        applicationDeadline: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      },
    }),
    prisma.jobPost.create({
      data: {
        companyId: company1.id,
        title: 'Java Backend Developer',
        description:
          'Develop microservices using Java and Spring Boot for our enterprise platform.',
        type: JobType.FULL_TIME,
        status: JobStatus.CLOSED,
        workMode: WorkMode.ON_SITE,
        industry: 'Information Technology',
        department: 'Engineering',
        experienceMin: 3,
        experienceMax: 5,
        experienceLevel: ExperienceLevel.MID,
        location: 'Pune, Maharashtra',
        salaryMin: 1500000,
        salaryMax: 2200000,
        salaryType: SalaryType.ANNUAL,
        skillsRequired: ['Java', 'Spring Boot', 'Hibernate', 'MySQL'],
        tags: ['java', 'backend', 'spring'],
        closedReason: 'FILLED',
        closedAt: new Date(),
      },
    }),
  ]);

  console.log(`  Created ${jobs.length} job posts`);

  // ─── 5. Job Applications ────────────────────────────────────

  console.log('Creating job applications...');

  const candidateProfiles = await prisma.candidateProfile.findMany();
  const profileMap = new Map(candidateProfiles.map((p) => [p.userId, p.id]));

  const applications = [
    {
      jobId: jobs[0].id,
      candidateId: profileMap.get(candidates[0].id)!,
      status: ApplicationStatus.SHORTLISTED,
    },
    {
      jobId: jobs[0].id,
      candidateId: profileMap.get(candidates[2].id)!,
      status: ApplicationStatus.APPLIED,
    },
    {
      jobId: jobs[1].id,
      candidateId: profileMap.get(candidates[4].id)!,
      status: ApplicationStatus.INTERVIEW_SCHEDULED,
      interviewDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    {
      jobId: jobs[2].id,
      candidateId: profileMap.get(candidates[1].id)!,
      status: ApplicationStatus.OFFERED,
    },
    {
      jobId: jobs[3].id,
      candidateId: profileMap.get(candidates[3].id)!,
      status: ApplicationStatus.APPLIED,
    },
    {
      jobId: jobs[3].id,
      candidateId: profileMap.get(candidates[0].id)!,
      status: ApplicationStatus.VIEWED,
    },
  ];

  for (const app of applications) {
    await prisma.jobApplication.upsert({
      where: { jobId_candidateId: { jobId: app.jobId, candidateId: app.candidateId } },
      update: {},
      create: {
        jobId: app.jobId,
        candidateId: app.candidateId,
        status: app.status,
        source: 'SEARCH',
        interviewDate: app.interviewDate,
      },
    });
  }

  console.log(`  Created ${applications.length} applications`);

  // ─── 6. Notifications ───────────────────────────────────────

  console.log('Creating notifications...');

  const notifs = [
    {
      userId: candidates[0].id,
      title: 'Application Shortlisted',
      message: 'Your application for Senior Full Stack Developer at TechCorp has been shortlisted!',
      type: NotificationType.SUCCESS,
      category: 'application_update',
      link: '/candidate/applications',
    },
    {
      userId: candidates[1].id,
      title: 'Job Offer Received',
      message: 'Congratulations! StartupX Labs has extended an offer for ML Engineer.',
      type: NotificationType.SUCCESS,
      category: 'application_update',
      link: '/candidate/applications',
    },
    {
      userId: candidates[4].id,
      title: 'Interview Scheduled',
      message: 'Your interview for DevOps Engineer at TechCorp is scheduled.',
      type: NotificationType.INFO,
      category: 'application_update',
      link: '/candidate/applications',
    },
    {
      userId: employer1.id,
      title: 'New Applications',
      message: 'You have 3 new applications for Senior Full Stack Developer.',
      type: NotificationType.INFO,
      category: 'job_update',
      link: '/employer/jobs',
    },
    {
      userId: admin.id,
      title: 'Verification Request',
      message: 'StartupX Labs has submitted a GST verification request.',
      type: NotificationType.WARNING,
      category: 'verification',
      link: '/admin/verifications',
    },
  ];

  for (const n of notifs) {
    await prisma.notification.create({ data: n });
  }

  console.log(`  Created ${notifs.length} notifications`);

  // ─── 7. System Config ───────────────────────────────────────

  console.log('Creating system config...');

  const configs = [
    { key: 'maintenance_mode', value: { enabled: false, message: '' } },
    { key: 'job_expiry_days', value: { default: 30, premium: 60 } },
    { key: 'max_applications_per_day', value: { candidate: 25 } },
    {
      key: 'feature_flags',
      value: { mfa: true, whatsapp: false, ai_matching: true, premium_jobs: false },
    },
  ];

  for (const c of configs) {
    await prisma.systemConfig.upsert({
      where: { key: c.key },
      update: { value: c.value },
      create: { key: c.key, value: c.value, updatedBy: superAdmin.id },
    });
  }

  console.log(`  Created ${configs.length} system configs`);

  // ─── Done ───────────────────────────────────────────────────

  console.log('\nSeed completed successfully!');
  console.log('\nTest accounts (password: Test@12345):');
  console.log('  Super Admin: superadmin@hireadda.in');
  console.log('  Admin:       admin@hireadda.in');
  console.log('  Employer 1:  hr@techcorp.com');
  console.log('  Employer 2:  hiring@startupx.com');
  console.log('  Candidate 1: rahul.dev@gmail.com');
  console.log('  Candidate 2: sneha.data@gmail.com');
  console.log('  Candidate 3: arjun.full@gmail.com');
  console.log('  Candidate 4: neha.design@gmail.com');
  console.log('  Candidate 5: amit.devops@gmail.com');
}

void seed()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
