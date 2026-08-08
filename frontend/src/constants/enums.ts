export const ROLE_LABELS: Record<string, string> = {
  CANDIDATE: 'Candidate',
  EMPLOYER: 'Employer',
  ADMIN: 'Admin',
  SUPER_ADMIN: 'Super Admin',
};

export const JOB_TYPE_LABELS: Record<string, string> = {
  FULL_TIME: 'Full Time',
  PART_TIME: 'Part Time',
  CONTRACT: 'Contract',
  INTERNSHIP: 'Internship',
  FREELANCE: 'Freelance',
};

export const JOB_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open',
  CLOSED: 'Closed',
  DRAFT: 'Draft',
  EXPIRED: 'Expired',
};

export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  APPLIED: 'Applied',
  VIEWED: 'Viewed',
  SHORTLISTED: 'Shortlisted',
  SELECTED: 'Selected',
  REJECTED: 'Rejected',
  OFFERED: 'Offered',
  HIRED: 'Hired',
  WITHDRAWN: 'Withdrawn',
};

export const APPLICATION_STATUS_COLORS: Record<string, string> = {
  APPLIED: 'info',
  VIEWED: 'info',
  SHORTLISTED: 'success',
  SELECTED: 'success',
  REJECTED: 'error',
  OFFERED: 'success',
  HIRED: 'success',
  WITHDRAWN: 'neutral',
};

export const WORK_MODE_LABELS: Record<string, string> = {
  ON_SITE: 'On Site',
  REMOTE: 'Remote',
  HYBRID: 'Hybrid',
};

export const SHIFT_TYPE_LABELS: Record<string, string> = {
  DAY: 'Day Shift',
  NIGHT: 'Night Shift',
  ROTATIONAL: 'Rotational',
  FLEXIBLE: 'Flexible',
};

export const EXPERIENCE_LEVEL_LABELS: Record<string, string> = {
  FRESHER: 'Fresher',
  ENTRY: 'Entry Level',
  MID: 'Mid Level',
  SENIOR: 'Senior',
  LEAD: 'Lead',
  EXECUTIVE: 'Executive',
};

export const EDUCATION_LEVEL_LABELS: Record<string, string> = {
  TENTH: '10th',
  TWELFTH: '12th',
  DIPLOMA: 'Diploma',
  BACHELORS: "Bachelor's",
  MASTERS: "Master's",
  PHD: 'PhD',
  POST_DOCTORAL: 'Post Doctoral',
};

export const EDUCATION_BOARD_LABELS: Record<string, string> = {
  CBSE: 'CBSE',
  ICSE: 'ICSE',
  ISC: 'ISC',
  STATE_BOARD: 'State Board',
  NIOS: 'NIOS',
  IB: 'IB (International Baccalaureate)',
  CAMBRIDGE: 'Cambridge (IGCSE)',
  OTHER: 'Other',
};

export const TWELFTH_STREAM_LABELS: Record<string, string> = {
  SCIENCE: 'Science',
  COMMERCE: 'Commerce',
  ARTS: 'Arts / Humanities',
  VOCATIONAL: 'Vocational',
  OTHER: 'Other',
};

export const SALARY_TYPE_LABELS: Record<string, string> = {
  ANNUAL: 'Per Year',
  MONTHLY: 'Per Month',
  HOURLY: 'Per Hour',
};

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  COMPANY: 'Company / Business',
  INDIVIDUAL: 'Individual / Proprietor',
};

export const HIRING_TYPE_LABELS: Record<string, string> = {
  DIRECT: 'Your own company',
  CONSULTANCY: 'A consultancy / staffing agency',
};

export const COMPANY_TYPE_LABELS: Record<string, string> = {
  PRIVATE: 'Private',
  PUBLIC: 'Public',
  PROPRIETARY: 'Proprietary',
  STARTUP: 'Startup',
  MNC: 'MNC',
  GOVERNMENT: 'Government',
  NGO: 'NGO',
  SEMI_GOVERNMENT: 'Semi Government',
};

// Maps industry to its sub-industries for filtering
export const SUB_INDUSTRIES_BY_INDUSTRY: Record<string, string[]> = {
  'Information Technology': [
    'SaaS',
    'PaaS',
    'IaaS',
    'Cloud Infrastructure',
    'Cybersecurity',
    'AI/ML',
    'Data Analytics',
    'IT Consulting',
    'IT Services',
    'Product Development',
    'Cloud Security',
    'DevOps Services',
    'Cloud Migration',
    'Digital Transformation',
    'Enterprise Software',
    'Low-Code/No-Code Platforms',
    'Custom Software Development',
    'IT Staff Augmentation',
    'IT Managed Services',
    'IT Training',
  ],
  'Software Development': [
    'SaaS',
    'PaaS',
    'AI/ML',
    'Product Development',
    'Enterprise Software',
    'Low-Code/No-Code Platforms',
    'Custom Software Development',
    'DevOps Services',
  ],
  FinTech: [
    'Payments',
    'Lending',
    'InsurTech',
    'WealthTech',
    'RegTech',
    'Neo Banking',
    'Crypto Exchange',
    'DeFi Platforms',
    'Credit Scoring',
    'Invoice Financing',
    'BNPL (Buy Now Pay Later)',
    'Open Banking',
    'Embedded Finance',
    'Robo-Advisory',
  ],
  'E-Commerce': [
    'B2B Commerce',
    'B2C Commerce',
    'D2C',
    'Marketplace',
    'Quick Commerce',
    'Social Commerce',
    'Live Commerce',
    'Recommerce (Resale)',
    'Cross-Border E-Commerce',
    'Grocery Delivery',
    'Fashion E-Commerce',
    'Beauty E-Commerce',
  ],
  HealthTech: [
    'Telemedicine',
    'Health Analytics',
    'Medical Devices',
    'Digital Health',
    'Mental Health Platforms',
    'Remote Patient Monitoring',
    'Clinical Trial Tech',
    'Genomics',
    'Drug Discovery AI',
    'Hospital Management Systems',
    'Health Insurance Tech',
  ],
  EdTech: [
    'K-12',
    'Higher Education',
    'Test Prep',
    'Skill Development',
    'Corporate Training',
    'Language Learning',
    'Coding Education',
    'STEM Education',
    'Upskilling Platforms',
    'Microlearning',
  ],
  'Logistics & Supply Chain': [
    'Logistics Tech',
    'Warehouse Automation',
    'Fleet Management Tech',
    'Supply Chain Analytics',
    'Last-Mile Delivery Tech',
    'Freight Marketplace',
    'Cold Chain Tech',
    'Reverse Logistics',
  ],
  'Real Estate': [
    'PropTech',
    'Commercial Real Estate Tech',
    'Residential Tech',
    'Coworking Tech',
    'Facility Management Tech',
    'Smart Building',
  ],
  'Agriculture & Forestry': [
    'AgriTech',
    'Precision Agriculture',
    'Farm-to-Fork',
    'Agricultural Marketplace',
    'Drone Agriculture',
    'AgriFinance',
  ],
  'Food Processing': [
    'FoodTech',
    'Cloud Kitchen',
    'Food Delivery',
    'Food Safety Tech',
    'Alternative Protein',
  ],
  'Media & Entertainment': ['Gaming', 'Media Streaming', 'Social Media', 'AdTech', 'Esports'],
  'Advertising & Marketing': ['AdTech', 'MarTech', 'Social Media'],
  Automobile: ['AutoTech', 'EV Charging Infrastructure'],
  Retail: ['Retail Tech'],
  Construction: ['Construction Tech'],
  Legal: ['LegalTech'],
  'Recruitment & Staffing': ['HRTech'],
  'Travel & Tourism': ['Travel Tech'],
  'Renewable Energy': ['CleanTech', 'Carbon Management', 'Circular Economy Tech'],
  CleanTech: ['Carbon Management', 'Circular Economy Tech', 'EV Charging Infrastructure'],
  'Blockchain & Cryptocurrency': ['Crypto Exchange', 'DeFi Platforms'],
  'Banking & Financial Services': [
    'Payments',
    'Lending',
    'Neo Banking',
    'Open Banking',
    'Credit Scoring',
  ],
  Insurance: ['InsurTech'],
  Healthcare: [
    'Telemedicine',
    'Digital Health',
    'Hospital Management Systems',
    'Health Insurance Tech',
  ],
  Pharmaceuticals: ['Drug Discovery AI', 'Clinical Trial Tech'],
  Biotechnology: ['Genomics', 'Drug Discovery AI'],
};

// Get sub-industry options filtered by selected industry
export function getSubIndustriesForIndustry(industry: string): string[] {
  return SUB_INDUSTRIES_BY_INDUSTRY[industry] || [];
}

export const URGENCY_LEVEL_LABELS: Record<string, string> = {
  NORMAL: 'Normal',
  URGENT: 'Urgent',
  IMMEDIATE: 'Immediate',
};

export const GENDER_LABELS: Record<string, string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  NON_BINARY: 'Non Binary',
  PREFER_NOT_TO_SAY: 'Prefer Not to Say',
  OTHER: 'Other',
};

// `ACTIVELY_LOOKING` is intentionally omitted here — it belongs to OPEN_TO_WORK_LABELS
// (job-search intent), not to WORK_STATUS (current employment situation).
export const WORK_STATUS_LABELS: Record<string, string> = {
  EMPLOYED: 'Employed',
  UNEMPLOYED: 'Unemployed',
  STUDENT: 'Student',
  FREELANCER: 'Freelancer',
};

export const NOTICE_PERIOD_LABELS: Record<string, string> = {
  IMMEDIATE: 'Immediate',
  FIFTEEN_DAYS: '15 Days',
  THIRTY_DAYS: '30 Days',
  SIXTY_DAYS: '60 Days',
  NINETY_DAYS: '90 Days',
  MORE_THAN_NINETY_DAYS: '90+ Days',
};

export const MARITAL_STATUS_LABELS: Record<string, string> = {
  SINGLE: 'Single',
  MARRIED: 'Married',
  DIVORCED: 'Divorced',
  WIDOWED: 'Widowed',
  PREFER_NOT_TO_SAY: 'Prefer Not to Say',
};

export const DISABILITY_TYPE_LABELS: Record<string, string> = {
  NONE: 'None',
  VISUAL: 'Visual',
  HEARING: 'Hearing',
  LOCOMOTOR: 'Locomotor',
  INTELLECTUAL: 'Intellectual',
  MULTIPLE: 'Multiple',
  OTHER: 'Other',
};

export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  INFO: 'Information',
  SUCCESS: 'Success',
  WARNING: 'Warning',
  ERROR: 'Error',
};

export const CAREER_BREAK_TYPE_LABELS: Record<string, string> = {
  HEALTH: 'Health Reasons',
  FAMILY: 'Family Responsibilities',
  HIGHER_EDUCATION: 'Higher Education',
  TRAVEL: 'Travel / Sabbatical',
  LAYOFF: 'Layoff / Restructuring',
  PERSONAL: 'Personal Reasons',
  CAREGIVING: 'Caregiving',
  CAREER_TRANSITION: 'Career Transition',
  OTHER: 'Other',
};

export const RESERVATION_CATEGORY_LABELS: Record<string, string> = {
  GENERAL: 'General',
  SC: 'SC (Scheduled Caste)',
  ST: 'ST (Scheduled Tribe)',
  OBC: 'OBC (Other Backward Class)',
  EWS: 'EWS (Economically Weaker Section)',
  PREFER_NOT_TO_SAY: 'Prefer Not to Say',
};

export const COURSE_TYPE_LABELS: Record<string, string> = {
  FULL_TIME: 'Full Time',
  PART_TIME: 'Part Time',
  DISTANCE: 'Distance Learning',
  CORRESPONDENCE: 'Correspondence',
};

export const OPEN_TO_WORK_LABELS: Record<string, string> = {
  ACTIVELY_LOOKING: 'Actively Looking',
  OPEN_TO_OFFERS: 'Open to Offers',
  NOT_LOOKING: 'Not Looking',
};

export const PATENT_STATUS_LABELS: Record<string, string> = {
  FILED: 'Filed',
  PUBLISHED: 'Published',
  GRANTED: 'Granted',
};

export const GRADE_TYPE_LABELS: Record<string, string> = {
  PERCENTAGE: 'Percentage',
  CGPA: 'CGPA',
  GPA: 'GPA',
};

export const FUNDING_STAGE_LABELS: Record<string, string> = {
  BOOTSTRAPPED: 'Bootstrapped',
  SEED: 'Seed',
  SERIES_A: 'Series A',
  SERIES_B: 'Series B',
  SERIES_C: 'Series C',
  SERIES_D_PLUS: 'Series D+',
  PRE_IPO: 'Pre-IPO',
  PUBLIC: 'Public',
  ACQUIRED: 'Acquired',
  NOT_APPLICABLE: 'Not Applicable',
};

export const PRONOUN_OPTIONS: Record<string, string> = {
  'he/him': 'He/Him',
  'she/her': 'She/Her',
  'they/them': 'They/Them',
  'prefer-not-to-say': 'Prefer Not to Say',
};

export const LAST_ACTIVE_LABELS: Record<string, string> = {
  '1': 'Last 24 hours',
  '3': 'Last 3 days',
  '7': 'Last 7 days',
  '14': 'Last 2 weeks',
  '30': 'Last 30 days',
  '90': 'Last 3 months',
};

export const YES_NO_LABELS: Record<string, string> = {
  true: 'Yes',
  false: 'No',
};

export const SALARY_CURRENCY_LABELS: Record<string, string> = {
  INR: 'INR (₹)',
  USD: 'USD ($)',
  EUR: 'EUR (€)',
  GBP: 'GBP (£)',
  AED: 'AED (د.إ)',
  SGD: 'SGD (S$)',
  CAD: 'CAD (C$)',
  AUD: 'AUD (A$)',
};

export const EDUCATION_LEVEL_SEARCH_LABELS: Record<string, string> = {
  UG: 'Under Graduate (UG)',
  PG: 'Post Graduate (PG)',
  DOCTORATE: 'Doctorate / PhD',
};

export const KEYWORD_OPERATOR_LABELS: Record<string, string> = {
  or: 'Any keyword (OR)',
  and: 'All keywords (AND)',
};

export const BROAD_REGION_PRESETS: Record<
  string,
  { label: string; special?: 'clear' | 'international'; cities?: string[] }
> = {
  anywhere_india: { label: 'Anywhere in India', special: 'clear' },
  international: { label: 'Any International Location', special: 'international' },
  north_india: {
    label: 'North India',
    cities: ['Delhi', 'Noida', 'Gurugram', 'Chandigarh', 'Lucknow', 'Jaipur', 'Dehradun'],
  },
  south_india: {
    label: 'South India',
    cities: ['Bangalore', 'Chennai', 'Hyderabad', 'Kochi', 'Thiruvananthapuram', 'Coimbatore'],
  },
  east_india: {
    label: 'East India',
    cities: ['Kolkata', 'Bhubaneswar', 'Patna', 'Guwahati', 'Ranchi'],
  },
  west_india: {
    label: 'West India',
    cities: ['Mumbai', 'Pune', 'Ahmedabad', 'Surat', 'Goa', 'Vadodara'],
  },
};

// Enterprise job posting enums
export const NOTICE_PERIOD_PREFERENCE_LABELS: Record<string, string> = {
  IMMEDIATE: 'Immediate',
  FIFTEEN_DAYS: '15 Days',
  ONE_MONTH: '1 Month',
  TWO_MONTHS: '2 Months',
  THREE_MONTHS: '3 Months',
  NEGOTIABLE: 'Negotiable',
};

export const FUNCTIONAL_AREA_LABELS: Record<string, string> = {
  IT_SOFTWARE: 'IT / Software',
  IT_HARDWARE: 'IT / Hardware',
  SALES: 'Sales',
  MARKETING: 'Marketing',
  HR: 'Human Resources',
  FINANCE: 'Finance / Accounting',
  ITES_BPO: 'ITES / BPO',
  ENGINEERING: 'Engineering',
  PRODUCTION: 'Production / Manufacturing',
  PHARMA: 'Pharma / Biotech',
  BANKING: 'Banking / Insurance',
  LEGAL: 'Legal',
  MEDIA: 'Media / Entertainment',
  HOSPITALITY: 'Hospitality / Travel',
  RETAIL: 'Retail',
  LOGISTICS: 'Logistics / Supply Chain',
  EDUCATION: 'Education / Training',
  HEALTHCARE: 'Healthcare',
  REAL_ESTATE: 'Real Estate',
  OTHER: 'Other',
};

export const SPECIFIC_DEGREE_LABELS: Record<string, string> = {
  BTECH_BE: 'B.Tech / B.E.',
  BCA: 'BCA',
  BSC: 'B.Sc',
  BCOM: 'B.Com',
  BA: 'B.A.',
  BBA: 'BBA',
  MBBS: 'MBBS',
  LLB: 'LLB',
  BARCH: 'B.Arch',
  BDES: 'B.Des',
  BPHARM: 'B.Pharm',
  DIPLOMA_ENGINEERING: 'Diploma (Engineering)',
  MCA: 'MCA',
  MSC: 'M.Sc',
  MCOM: 'M.Com',
  MA: 'M.A.',
  MBA_PGDM: 'MBA / PGDM',
  MTECH_ME: 'M.Tech / M.E.',
  MS: 'M.S.',
  LLM: 'LLM',
  MD: 'MD',
  CA: 'CA',
  CS: 'CS',
  ICWA: 'ICWA',
  PHD: 'Ph.D',
  ANY_GRADUATE: 'Any Graduate',
  ANY_POSTGRADUATE: 'Any Post Graduate',
};

// Maps each education level to the specific degrees allowed at that level
export const DEGREES_BY_EDUCATION_LEVEL: Record<string, string[]> = {
  TENTH: [],
  TWELFTH: [],
  DIPLOMA: ['DIPLOMA_ENGINEERING'],
  BACHELORS: [
    'BTECH_BE',
    'BCA',
    'BSC',
    'BCOM',
    'BA',
    'BBA',
    'MBBS',
    'LLB',
    'BARCH',
    'BDES',
    'BPHARM',
    'ANY_GRADUATE',
  ],
  MASTERS: [
    'MCA',
    'MSC',
    'MCOM',
    'MA',
    'MBA_PGDM',
    'MTECH_ME',
    'MS',
    'LLM',
    'MD',
    'CA',
    'CS',
    'ICWA',
    'ANY_POSTGRADUATE',
  ],
  PHD: ['PHD'],
  POST_DOCTORAL: ['PHD'],
};

// Ordered education levels (lowest to highest) for comparison
export const EDUCATION_LEVEL_ORDER: string[] = [
  'TENTH',
  'TWELFTH',
  'DIPLOMA',
  'BACHELORS',
  'MASTERS',
  'PHD',
  'POST_DOCTORAL',
];

// Returns filtered degree options based on education level
export function getDegreesForLevel(level: string): { value: string; label: string }[] {
  const allowed = DEGREES_BY_EDUCATION_LEVEL[level];
  if (!allowed || allowed.length === 0) return [];
  return allowed
    .filter((key) => SPECIFIC_DEGREE_LABELS[key])
    .map((key) => ({ value: key, label: SPECIFIC_DEGREE_LABELS[key] }));
}

// Returns education levels at or below the given highest level
export function getLevelsAtOrBelow(highestLevel: string): string[] {
  const idx = EDUCATION_LEVEL_ORDER.indexOf(highestLevel);
  if (idx === -1) return [];
  return EDUCATION_LEVEL_ORDER.slice(0, idx + 1);
}

export const GENDER_PREFERENCE_LABELS: Record<string, string> = {
  ANY: 'Any',
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
};

export const DRIVING_LICENSE_TYPE_LABELS: Record<string, string> = {
  NONE: 'Not Required',
  TWO_WHEELER: 'Two Wheeler',
  FOUR_WHEELER: 'Four Wheeler',
  BOTH: 'Two & Four Wheeler',
  HEAVY_VEHICLE: 'Heavy Vehicle',
};

export const VEHICLE_TYPE_LABELS: Record<string, string> = {
  BIKE: 'Motorcycle / Bike',
  CAR: 'Car',
  SCOOTER: 'Scooter / Moped',
};

export const POSTING_VISIBILITY_LABELS: Record<string, string> = {
  PUBLIC: 'Public',
  INTERNAL: 'Internal Only',
  BOTH: 'Public & Internal',
};

export const APPLY_METHOD_LABELS: Record<string, string> = {
  IN_PLATFORM: 'Apply on Platform',
  EXTERNAL_URL: 'External URL',
  EMAIL: 'Email',
  WALK_IN: 'Walk-in',
};

export const SCREENING_QUESTION_TYPE_LABELS: Record<string, string> = {
  TEXT: 'Text Answer',
  YES_NO: 'Yes / No',
  MULTIPLE_CHOICE: 'Multiple Choice',
  NUMERIC: 'Numeric',
};

export const DIVERSITY_TAG_OPTIONS: string[] = [
  'Women Encouraged',
  'PwD Friendly',
  'LGBTQ+ Inclusive',
  'Veterans Preferred',
  'Career Returners Welcome',
  'Diversity Hire',
  'Equal Opportunity',
];

export const INDIAN_REGION_PRESETS: Record<string, string[]> = {
  'NCR / Delhi': ['Delhi', 'Noida', 'Gurugram', 'Ghaziabad', 'Faridabad', 'Greater Noida'],
  'Mumbai Metropolitan': ['Mumbai', 'Navi Mumbai', 'Thane', 'Kalyan'],
  'Bangalore Region': ['Bangalore', 'Bengaluru', 'Electronic City', 'Whitefield'],
  'Hyderabad Region': ['Hyderabad', 'Secunderabad', 'HITEC City'],
  'Chennai Region': ['Chennai', 'Tambaram', 'Avadi'],
  'Pune Region': ['Pune', 'Pimpri-Chinchwad', 'Hinjewadi'],
  'Kolkata Region': ['Kolkata', 'Salt Lake', 'Howrah'],
  'Ahmedabad Region': ['Ahmedabad', 'Gandhinagar'],
};
