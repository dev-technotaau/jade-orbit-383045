import { createHash } from 'crypto';
import elasticClient from '../config/elasticsearch';
import logger from '../config/logger';
import { ELASTIC_INDICES, JOB_STATUS, SUGGESTION_CATEGORIES } from '../constants';
import { redis } from '../config/redis';
import { prisma } from '../config/prisma';
import { JobStatus } from '@prisma/client';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { isFeatureEnabled } from '../config/feature-flags';
import {} from '../kafka/producer';
import { publishEvent } from '../kafka/producer';
import { KafkaTopics } from '../kafka/topics';
import { trackSearch } from '../utils/trending';

const tracer = trace.getTracer('search-service');
const ES_CACHE_TTL = 30; // 30 seconds
const ES_CACHE_PREFIX = 'es:search:';

// ─── Static Suggestion Data (used when ES has few or no matches) ────────────

const COMMON_JOB_TITLES = [
  'Software Engineer',
  'Senior Software Engineer',
  'Full Stack Developer',
  'Frontend Developer',
  'Backend Developer',
  'DevOps Engineer',
  'Data Scientist',
  'Data Analyst',
  'Data Engineer',
  'Machine Learning Engineer',
  'Product Manager',
  'Project Manager',
  'Business Analyst',
  'UI/UX Designer',
  'QA Engineer',
  'Test Engineer',
  'Mobile Developer',
  'Android Developer',
  'iOS Developer',
  'Cloud Engineer',
  'System Administrator',
  'Network Engineer',
  'Cybersecurity Analyst',
  'Technical Lead',
  'Engineering Manager',
  'Architect',
  'Solutions Architect',
  'Scrum Master',
  'Technical Writer',
  'HR Manager',
  'Marketing Manager',
  'Sales Executive',
  'Account Manager',
  'Operations Manager',
  'Finance Manager',
  'Content Writer',
  'Graphic Designer',
  'Digital Marketing Executive',
  'Customer Support Executive',
  'Recruiter',
  'Consultant',
  'Research Analyst',
];

const COMMON_SKILLS = [
  'JavaScript',
  'TypeScript',
  'Python',
  'Java',
  'React',
  'Node.js',
  'Angular',
  'Vue.js',
  'Next.js',
  'Express.js',
  'Django',
  'Flask',
  'Spring Boot',
  'AWS',
  'Azure',
  'GCP',
  'Docker',
  'Kubernetes',
  'MongoDB',
  'PostgreSQL',
  'MySQL',
  'Redis',
  'Elasticsearch',
  'Git',
  'CI/CD',
  'Agile',
  'Scrum',
  'REST API',
  'GraphQL',
  'Microservices',
  'HTML',
  'CSS',
  'Tailwind CSS',
  'SASS',
  'Redux',
  'SQL',
  'NoSQL',
  'Linux',
  'Terraform',
  'Jenkins',
  'Kafka',
  'RabbitMQ',
  'TensorFlow',
  'PyTorch',
  'Pandas',
  'Power BI',
  'Tableau',
  'Excel',
  'Figma',
  'Adobe Photoshop',
  'SEO',
  'SEM',
  'Communication',
  'Leadership',
  'Problem Solving',
  'Team Management',
  'Critical Thinking',
  'Machine Learning',
  'Deep Learning',
  'NLP',
  'Computer Vision',
  'Blockchain',
  'Swift',
  'Kotlin',
  'Flutter',
  'React Native',
  'Dart',
  'Go',
  'Rust',
  'C++',
  'C#',
  '.NET',
];

const COMMON_LOCATIONS = [
  'Mumbai, Maharashtra',
  'Delhi, NCR',
  'Bangalore, Karnataka',
  'Hyderabad, Telangana',
  'Chennai, Tamil Nadu',
  'Pune, Maharashtra',
  'Kolkata, West Bengal',
  'Ahmedabad, Gujarat',
  'Gurugram, Haryana',
  'Noida, Uttar Pradesh',
  'Jaipur, Rajasthan',
  'Lucknow, Uttar Pradesh',
  'Chandigarh',
  'Indore, Madhya Pradesh',
  'Kochi, Kerala',
  'Coimbatore, Tamil Nadu',
  'Thiruvananthapuram, Kerala',
  'Nagpur, Maharashtra',
  'Visakhapatnam, Andhra Pradesh',
  'Bhubaneswar, Odisha',
  'Mysore, Karnataka',
  'Vadodara, Gujarat',
  'Surat, Gujarat',
  'Goa',
  'Remote',
  'Work From Home',
  'Hybrid',
];

const COMMON_COMPANIES = [
  'TCS',
  'Infosys',
  'Wipro',
  'HCL Technologies',
  'Tech Mahindra',
  'Cognizant',
  'Accenture',
  'Capgemini',
  'IBM',
  'Google',
  'Microsoft',
  'Amazon',
  'Meta',
  'Apple',
  'Flipkart',
  'Paytm',
  'Zomato',
  'Swiggy',
  'Ola',
  "BYJU'S",
  'Freshworks',
  'Zoho',
  'Razorpay',
  'PhonePe',
  'CRED',
  'Dream11',
  'Reliance',
  'Tata Group',
  'L&T',
  'Mahindra',
  'Deloitte',
  'EY',
  'PwC',
  'KPMG',
  'McKinsey',
];

function filterStatic(items: string[], query: string, limit: number): string[] {
  const lq = query.toLowerCase();
  return items.filter((item) => item.toLowerCase().includes(lq)).slice(0, limit);
}

// Levenshtein distance for fuzzy static matching
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] =
        a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
    }
    prev = curr;
  }
  return prev[n];
}

// Fuzzy-aware static filter: matches substring OR Levenshtein distance ≤ 2 on any word
function filterStaticFuzzy(items: string[], query: string, limit: number): string[] {
  const lq = query.toLowerCase();
  const maxDist = lq.length <= 4 ? 1 : 2;
  return items
    .filter((item) => {
      const li = item.toLowerCase();
      // Exact substring match
      if (li.includes(lq)) return true;
      // Fuzzy match: check if any word in the item is close to the query
      return li.split(/[\s/,.-]+/).some((word) => levenshtein(lq, word) <= maxDist);
    })
    .slice(0, limit);
}

// ─── Advanced Index Settings ────────────────────────────────────────────────

const INDEX_SETTINGS = {
  analysis: {
    analyzer: {
      job_analyzer: {
        type: 'custom' as const,
        tokenizer: 'standard',
        filter: ['lowercase', 'stop', 'snowball'],
      },
      autocomplete_analyzer: {
        type: 'custom' as const,
        tokenizer: 'autocomplete_tokenizer',
        filter: ['lowercase'],
      },
      autocomplete_search_analyzer: {
        type: 'custom' as const,
        tokenizer: 'standard',
        filter: ['lowercase'],
      },
      synonym_analyzer: {
        type: 'custom' as const,
        tokenizer: 'standard',
        filter: ['lowercase', 'tech_synonyms', 'snowball'],
      },
    },
    tokenizer: {
      autocomplete_tokenizer: {
        type: 'edge_ngram',
        min_gram: 2,
        max_gram: 20,
        token_chars: ['letter', 'digit'],
      },
    },
    filter: {
      tech_synonyms: {
        type: 'synonym',
        lenient: true,
        synonyms: [
          'js, javascript',
          'ts, typescript',
          'py, python',
          'react, reactjs, react.js',
          'node, nodejs, node.js',
          'vue, vuejs, vue.js',
          'angular, angularjs',
          'next, nextjs, next.js',
          'express, expressjs, express.js',
          'mongo, mongodb',
          'postgres, postgresql, pg',
          'aws, amazon web services',
          'gcp, google cloud platform, google cloud',
          'k8s, kubernetes',
          'docker, containerization',
          'ml, machine learning',
          'ai, artificial intelligence',
          'dl, deep learning',
          'nlp, natural language processing',
          'devops, dev ops',
          'sre, site reliability engineering',
          'qa, quality assurance',
          'c#, csharp, c sharp',
          'c++, cpp, cplusplus',
          '.net, dotnet',
          'spring, spring boot, springboot',
          'django, drf',
          'rn, react native',
          'tf, terraform',
          'kafka, event streaming',
          'redis, in memory cache',
          'elasticsearch, elastic, es',
          'tailwind, tailwindcss, tailwind css',
        ],
      },
    },
  },
  similarity: {
    default: { type: 'BM25', k1: 1.2, b: 0.75 },
  },
  number_of_shards: 1,
  number_of_replicas: 0,
  refresh_interval: '1s',
  max_result_window: 10000,
};

// ─── Redis Keys ─────────────────────────────────────────────────────────────

const SEARCH_HISTORY_KEY = (userId: string) => `search:history:${userId}`;
const POPULAR_SEARCHES_KEY = 'search:popular';
const SEARCH_HISTORY_MAX = 20;

const FIELD_HISTORY_KEY = (field: string, userId: string) => `field:history:${field}:${userId}`;
const FIELD_HISTORY_MAX = 10;
const FIELD_HISTORY_TTL = 90 * 24 * 60 * 60; // 90 days

// ─── Types ──────────────────────────────────────────────────────────────────

interface AutocompleteResult {
  text: string;
  type: 'job_title' | 'skill' | 'company' | 'location';
  count?: number;
}

interface FacetBucket {
  key: string;
  count: number;
}

export interface SearchFacets {
  [field: string]: FacetBucket[];
}

// ─── Search Service ─────────────────────────────────────────────────────────

class SearchService {
  // ─── Index Initialization ───────────────────────────────────────────

  async initializeIndices() {
    try {
      await this.createJobIndex();
      await this.createCandidateIndex();
      await this.createEmployerIndex();
      await this.createSuggestionsIndex();
      logger.info('Elasticsearch indices initialized');
    } catch (error) {
      logger.error('Failed to initialize Elasticsearch indices', error);
    }
  }

  private async createJobIndex() {
    const indexExists = await elasticClient.indices.exists({ index: ELASTIC_INDICES.JOBS });
    if (!indexExists) {
      await (elasticClient.indices.create as any)({
        index: ELASTIC_INDICES.JOBS,
        settings: INDEX_SETTINGS,
        mappings: {
          properties: {
            id: { type: 'keyword' },
            title: {
              type: 'text',
              analyzer: 'synonym_analyzer',
              fields: {
                autocomplete: {
                  type: 'text',
                  analyzer: 'autocomplete_analyzer',
                  search_analyzer: 'autocomplete_search_analyzer',
                },
                keyword: { type: 'keyword' },
              },
            },
            description: { type: 'text', analyzer: 'job_analyzer' },
            requirements: { type: 'text', analyzer: 'job_analyzer' },
            keyResponsibilities: { type: 'text', analyzer: 'job_analyzer' },
            companyName: {
              type: 'text',
              fields: {
                autocomplete: {
                  type: 'text',
                  analyzer: 'autocomplete_analyzer',
                  search_analyzer: 'autocomplete_search_analyzer',
                },
                keyword: { type: 'keyword' },
              },
            },
            location: {
              type: 'text',
              fields: {
                keyword: { type: 'keyword' },
                autocomplete: {
                  type: 'text',
                  analyzer: 'autocomplete_analyzer',
                  search_analyzer: 'autocomplete_search_analyzer',
                },
              },
            },
            type: { type: 'keyword' },
            industry: { type: 'keyword' },
            department: { type: 'keyword' },
            roleCategory: { type: 'keyword' },
            salaryMin: { type: 'double' },
            salaryMax: { type: 'double' },
            salaryType: { type: 'keyword' },
            salaryDisclosed: { type: 'boolean' },
            experienceMin: { type: 'integer' },
            experienceMax: { type: 'integer' },
            experienceLevel: { type: 'keyword' },
            educationRequired: { type: 'keyword' },
            skills: {
              type: 'keyword',
              fields: {
                text: { type: 'text', analyzer: 'synonym_analyzer' },
                autocomplete: {
                  type: 'text',
                  analyzer: 'autocomplete_analyzer',
                  search_analyzer: 'autocomplete_search_analyzer',
                },
              },
            },
            niceToHaveSkills: { type: 'keyword' },
            certificationsRequired: { type: 'keyword' },
            tags: { type: 'keyword' },
            isRemote: { type: 'boolean' },
            workMode: { type: 'keyword' },
            shiftType: { type: 'keyword' },
            numberOfOpenings: { type: 'integer' },
            urgencyLevel: { type: 'keyword' },
            isFeatured: { type: 'boolean' },
            isPremium: { type: 'boolean' },
            isWalkIn: { type: 'boolean' },
            applicationDeadline: { type: 'date' },
            travelRequired: { type: 'boolean' },
            relocationAssistance: { type: 'boolean' },
            jobPerks: { type: 'keyword' },
            languagesRequired: {
              type: 'nested',
              properties: { language: { type: 'keyword' }, proficiency: { type: 'keyword' } },
            },
            currency: { type: 'keyword' },
            preferredEducationField: { type: 'keyword' },
            companyType: { type: 'keyword' },
            companySize: { type: 'keyword' },
            createdAt: { type: 'date' },
            status: { type: 'keyword' },
            location_geo: { type: 'geo_point' },
            // Enterprise fields
            functionalArea: { type: 'keyword' },
            ugRequired: { type: 'keyword' },
            pgRequired: { type: 'keyword' },
            specificDegrees: { type: 'keyword' },
            degreeSpecializations: { type: 'keyword' },
            salaryNegotiable: { type: 'boolean' },
            noticePeriodPreference: { type: 'keyword' },
            isConfidential: { type: 'boolean' },
            referenceCode: { type: 'keyword' },
            additionalLocations: { type: 'text', fields: { keyword: { type: 'keyword' } } },
            accommodationProvided: { type: 'boolean' },
            walkInStartDate: { type: 'date' },
            walkInEndDate: { type: 'date' },
            diversityTags: { type: 'keyword' },
            visaSponsorshipAvailable: { type: 'boolean' },
            backgroundCheckRequired: { type: 'boolean' },
            isPwdFriendly: { type: 'boolean' },
            passportRequired: { type: 'boolean' },
            drivingLicenseRequired: { type: 'keyword' },
            ageMin: { type: 'integer' },
            ageMax: { type: 'integer' },
            genderPreference: { type: 'keyword' },
            postingVisibility: { type: 'keyword' },
            applyMethod: { type: 'keyword' },
            scheduledPublishAt: { type: 'date' },
            // Display fields (already indexed but previously unmapped)
            clientCompanyName: { type: 'text', fields: { keyword: { type: 'keyword' } } },
            companyLogo: { type: 'keyword' },
            companyIndustry: { type: 'keyword' },
            companyIsVerified: { type: 'boolean' },
            // Additional searchable fields
            benefits: { type: 'text', analyzer: 'job_analyzer' },
            interviewProcess: { type: 'text' },
            expiresAt: { type: 'date' },
            bondDetails: { type: 'text' },
          },
        },
      });
      logger.info(`Created index: ${ELASTIC_INDICES.JOBS}`);
    }
  }

  private async createCandidateIndex() {
    const indexExists = await elasticClient.indices.exists({ index: ELASTIC_INDICES.CANDIDATES });
    if (!indexExists) {
      await (elasticClient.indices.create as any)({
        index: ELASTIC_INDICES.CANDIDATES,
        settings: INDEX_SETTINGS,
        mappings: {
          properties: {
            id: { type: 'keyword' },
            userId: { type: 'keyword' },
            fullName: {
              type: 'text',
              analyzer: 'job_analyzer',
              fields: {
                autocomplete: {
                  type: 'text',
                  analyzer: 'autocomplete_analyzer',
                  search_analyzer: 'autocomplete_search_analyzer',
                },
              },
            },
            headline: { type: 'text', analyzer: 'job_analyzer' },
            bio: { type: 'text' },
            skills: {
              type: 'keyword',
              fields: {
                text: { type: 'text', analyzer: 'synonym_analyzer' },
                autocomplete: {
                  type: 'text',
                  analyzer: 'autocomplete_analyzer',
                  search_analyzer: 'autocomplete_search_analyzer',
                },
              },
            },
            currentLocation: {
              type: 'text',
              fields: {
                keyword: { type: 'keyword' },
                autocomplete: {
                  type: 'text',
                  analyzer: 'autocomplete_analyzer',
                  search_analyzer: 'autocomplete_search_analyzer',
                },
              },
            },
            preferredLocations: { type: 'keyword' },
            experienceYears: { type: 'float' },
            totalExperienceMonths: { type: 'integer' },
            currentRole: {
              type: 'text',
              fields: {
                keyword: { type: 'keyword' },
                autocomplete: {
                  type: 'text',
                  analyzer: 'autocomplete_analyzer',
                  search_analyzer: 'autocomplete_search_analyzer',
                },
              },
            },
            currentCompany: {
              type: 'text',
              fields: {
                keyword: { type: 'keyword' },
                autocomplete: {
                  type: 'text',
                  analyzer: 'autocomplete_analyzer',
                  search_analyzer: 'autocomplete_search_analyzer',
                },
              },
            },
            currentIndustry: { type: 'keyword' },
            currentDepartment: { type: 'keyword' },
            functionalArea: { type: 'keyword' },
            currSalary: { type: 'double' },
            expectedSalaryMin: { type: 'double' },
            expectedSalaryMax: { type: 'double' },
            salaryCurrency: { type: 'keyword' },
            languages: { type: 'keyword' },
            education: { type: 'nested' },
            experience: { type: 'nested' },
            gender: { type: 'keyword' },
            noticePeriod: { type: 'keyword' },
            workStatus: { type: 'keyword' },
            hasCareerBreak: { type: 'boolean' },
            willingToRelocate: { type: 'boolean' },
            preferredJobType: { type: 'keyword' },
            preferredWorkMode: { type: 'keyword' },
            preferredShift: { type: 'keyword' },
            preferredIndustries: { type: 'keyword' },
            preferredRoleCategories: { type: 'keyword' },
            disabilityType: { type: 'keyword' },
            city: { type: 'keyword' },
            state: { type: 'keyword' },
            certifications: {
              type: 'nested',
              properties: { name: { type: 'keyword' }, issuingOrg: { type: 'keyword' } },
            },
            skillsWithProficiency: {
              type: 'nested',
              properties: {
                skill: { type: 'keyword' },
                proficiency: { type: 'keyword' },
                yearsOfExperience: { type: 'float' },
              },
            },
            servingNoticePeriod: { type: 'boolean' },
            dob: { type: 'date' },
            hasResume: { type: 'boolean' },
            isEmailVerified: { type: 'boolean' },
            isMobileVerified: { type: 'boolean' },
            isWhatsappVerified: { type: 'boolean' },
            dateOfAvailability: { type: 'date' },
            pronouns: { type: 'keyword' },
            category: { type: 'keyword' },
            email: { type: 'keyword' },
            phone: { type: 'keyword' },
            alternatePhone: { type: 'keyword' },
            mobileNumber: { type: 'keyword' },
            whatsappNumber: { type: 'keyword' },
            alternateEmail: { type: 'keyword' },
            openToWork: { type: 'keyword' },
            careerBreakType: { type: 'keyword' },
            isVeteran: { type: 'boolean' },
            hasDrivingLicense: { type: 'boolean' },
            blockedCompanies: { type: 'keyword' },
            interests: { type: 'keyword' },
            hobbies: { type: 'keyword' },
            publications: {
              type: 'nested',
              properties: { title: { type: 'text' }, publisher: { type: 'text' } },
            },
            patents: {
              type: 'nested',
              properties: {
                title: { type: 'text' },
                patentNumber: { type: 'keyword' },
                status: { type: 'keyword' },
              },
            },
            volunteerExperience: {
              type: 'nested',
              properties: {
                organization: { type: 'text' },
                role: { type: 'text' },
                cause: { type: 'keyword' },
              },
            },
            professionalMemberships: {
              type: 'nested',
              properties: { organization: { type: 'text' } },
            },
            courses: {
              type: 'nested',
              properties: { name: { type: 'text' }, provider: { type: 'text' } },
            },
            testScores: {
              type: 'nested',
              properties: { testName: { type: 'keyword' }, score: { type: 'keyword' } },
            },
            itSkills: {
              type: 'nested',
              properties: {
                technology: {
                  type: 'keyword',
                  fields: { text: { type: 'text', analyzer: 'synonym_analyzer' } },
                },
                version: { type: 'keyword' },
                experienceYears: { type: 'float' },
              },
            },
            visaStatus: { type: 'keyword' },
            workPermitStatus: { type: 'keyword' },
            profileCompleteness: { type: 'integer' },
            lastActiveAt: { type: 'date' },
            createdAt: { type: 'date' },
            updatedAt: { type: 'date' },
            location_geo: { type: 'geo_point' },
            // New structured fields for matching
            experienceLevel: { type: 'keyword' },
            highestEducationLevel: { type: 'keyword' },
            highestDegree: { type: 'keyword' },
            drivingLicenseType: { type: 'keyword' },
            isPhysicallyChallenged: { type: 'boolean' },
            disabilityPercentage: { type: 'integer' },
            travelWillingnessPercent: { type: 'integer' },
            ownVehicle: { type: 'boolean' },
            nationality: { type: 'keyword' },
            maritalStatus: { type: 'keyword' },
            hasVideoResume: { type: 'boolean' },
            languageProficiency: {
              type: 'nested',
              properties: { language: { type: 'keyword' }, proficiency: { type: 'keyword' } },
            },
            awards: {
              type: 'nested',
              properties: { title: { type: 'text' }, issuer: { type: 'text' } },
            },
          },
        },
      });
      logger.info(`Created index: ${ELASTIC_INDICES.CANDIDATES}`);
    }
  }

  private async createEmployerIndex() {
    const indexExists = await elasticClient.indices.exists({ index: ELASTIC_INDICES.EMPLOYERS });
    if (!indexExists) {
      await (elasticClient.indices.create as any)({
        index: ELASTIC_INDICES.EMPLOYERS,
        settings: INDEX_SETTINGS,
        mappings: {
          properties: {
            id: { type: 'keyword' },
            userId: { type: 'keyword' },
            accountType: { type: 'keyword' },
            hiringType: { type: 'keyword' },
            companyName: {
              type: 'text',
              fields: {
                autocomplete: {
                  type: 'text',
                  analyzer: 'autocomplete_analyzer',
                  search_analyzer: 'autocomplete_search_analyzer',
                },
                keyword: { type: 'keyword' },
              },
            },
            companyType: { type: 'keyword' },
            tagline: { type: 'text' },
            industry: { type: 'keyword' },
            companySize: { type: 'keyword' },
            employeeCount: { type: 'integer' },
            annualRevenueRange: { type: 'keyword' },
            techStack: { type: 'keyword' },
            headquarters: { type: 'text', fields: { keyword: { type: 'keyword' } } },
            city: { type: 'keyword' },
            state: { type: 'keyword' },
            locations: { type: 'keyword' },
            description: { type: 'text' },
            isVerified: { type: 'boolean' },
            website: { type: 'keyword' },
            foundedYear: { type: 'integer' },
            subIndustry: { type: 'keyword' },
            specialties: { type: 'keyword' },
            fundingStage: { type: 'keyword' },
            investors: { type: 'keyword' },
            productsServices: { type: 'keyword' },
            coreValues: { type: 'keyword' },
            parentCompany: { type: 'text', fields: { keyword: { type: 'keyword' } } },
            whyWorkForUs: { type: 'text' },
            careersPageUrl: { type: 'keyword' },
            blogUrl: { type: 'keyword' },
            location_geo: { type: 'geo_point' },
            // Additional employer fields
            benefits: { type: 'keyword' },
            numberOfOffices: { type: 'integer' },
            totalFundingRaised: { type: 'keyword' },
            companyCulture: { type: 'text' },
            diversityStatement: { type: 'text' },
            stockTicker: { type: 'keyword' },
            missionStatement: { type: 'text' },
          },
        },
      });
      logger.info(`Created index: ${ELASTIC_INDICES.EMPLOYERS}`);
    }
  }

  private async createSuggestionsIndex() {
    const indexExists = await elasticClient.indices.exists({
      index: ELASTIC_INDICES.SUGGESTIONS,
    });
    if (!indexExists) {
      await (elasticClient.indices.create as any)({
        index: ELASTIC_INDICES.SUGGESTIONS,
        settings: {
          analysis: {
            analyzer: {
              suggestion_analyzer: {
                type: 'custom',
                tokenizer: 'suggestion_tokenizer',
                filter: ['lowercase'],
              },
              suggestion_search_analyzer: {
                type: 'custom',
                tokenizer: 'standard',
                filter: ['lowercase'],
              },
            },
            tokenizer: {
              suggestion_tokenizer: {
                type: 'edge_ngram',
                min_gram: 1,
                max_gram: 25,
                token_chars: ['letter', 'digit', 'punctuation', 'symbol'],
              },
            },
          },
          number_of_shards: 1,
          number_of_replicas: 0,
          refresh_interval: '5s',
          max_result_window: 10000,
        },
        mappings: {
          properties: {
            text: {
              type: 'text',
              analyzer: 'suggestion_analyzer',
              search_analyzer: 'suggestion_search_analyzer',
              fields: {
                keyword: { type: 'keyword' },
                raw: { type: 'text' },
              },
            },
            category: { type: 'keyword' },
            count: { type: 'integer' },
            source: { type: 'keyword' },
            region: { type: 'keyword' },
            parentCategory: { type: 'keyword' },
            metadata: { type: 'object', enabled: false },
            isActive: { type: 'boolean' },
            createdAt: { type: 'date' },
            updatedAt: { type: 'date' },
          },
        },
      });
      logger.info(`Created index: ${ELASTIC_INDICES.SUGGESTIONS}`);
      // Seed suggestions on first creation
      this.seedSuggestions().catch((err) => logger.error('Failed to seed suggestions index', err));
    }
  }

  // ─── Document Indexing ──────────────────────────────────────────────

  async indexJob(job: any) {
    const document = {
      id: job.id,
      companyId: job.companyId,
      title: job.title,
      description: job.description,
      requirements: job.requirements,
      keyResponsibilities: job.keyResponsibilities,
      clientCompanyName: job.clientCompanyName || null,
      companyName: job.company?.companyName || '',
      companyLogo: job.company?.logo || null,
      companyIndustry: job.company?.industry || null,
      companyIsVerified: job.company?.isVerified || false,
      location: job.location,
      type: job.type,
      industry: job.industry,
      department: job.department,
      roleCategory: job.roleCategory,
      salaryMin:
        job.salaryMin !== null && job.salaryMin !== undefined ? Number(job.salaryMin) : null,
      salaryMax:
        job.salaryMax !== null && job.salaryMax !== undefined ? Number(job.salaryMax) : null,
      salaryType: job.salaryType,
      salaryDisclosed: job.salaryDisclosed,
      experienceMin: job.experienceMin,
      experienceMax: job.experienceMax,
      experienceLevel: job.experienceLevel,
      educationRequired: job.educationRequired,
      preferredEducationField: job.preferredEducationField,
      currency: job.currency,
      skills: job.skillsRequired,
      niceToHaveSkills: job.niceToHaveSkills,
      certificationsRequired: job.certificationsRequired,
      tags: job.tags,
      isRemote: job.isRemote,
      workMode: job.workMode,
      shiftType: job.shiftType,
      numberOfOpenings: job.numberOfOpenings,
      urgencyLevel: job.urgencyLevel,
      isFeatured: job.isFeatured,
      isPremium: job.isPremium,
      isWalkIn: job.isWalkIn,
      // Public-search SEO fields. `slug` powers the canonical
      // /jobs/{slug} detail URL; `publicSearchable` lets employers
      // opt-out per job from the public board (still indexed for
      // private searches if needed).
      slug: job.slug,
      publicSearchable: job.publicSearchable !== false,
      applicationDeadline: job.applicationDeadline,
      travelRequired: job.travelRequired,
      relocationAssistance: job.relocationAssistance,
      jobPerks: job.jobPerks,
      languagesRequired: job.languagesRequired,
      companyType: job.company?.companyType,
      companySize: job.company?.companySize,
      createdAt: job.createdAt,
      status: job.status,
      location_geo:
        job.latitude && job.longitude ? { lat: job.latitude, lon: job.longitude } : undefined,
      // Enterprise fields
      functionalArea: job.functionalArea,
      ugRequired: job.ugRequired,
      pgRequired: job.pgRequired,
      specificDegrees: job.specificDegrees || [],
      degreeSpecializations: job.degreeSpecializations || [],
      salaryNegotiable: job.salaryNegotiable,
      noticePeriodPreference: job.noticePeriodPreference || [],
      isConfidential: job.isConfidential,
      referenceCode: job.referenceCode,
      additionalLocations: job.additionalLocations || [],
      accommodationProvided: job.accommodationProvided,
      walkInStartDate: job.walkInStartDate,
      walkInEndDate: job.walkInEndDate,
      diversityTags: job.diversityTags || [],
      visaSponsorshipAvailable: job.visaSponsorshipAvailable,
      backgroundCheckRequired: job.backgroundCheckRequired,
      isPwdFriendly: job.isPwdFriendly,
      passportRequired: job.passportRequired,
      drivingLicenseRequired: job.drivingLicenseRequired,
      ageMin: job.ageMin,
      ageMax: job.ageMax,
      genderPreference: job.genderPreference,
      postingVisibility: job.postingVisibility,
      applyMethod: job.applyMethod,
      scheduledPublishAt: job.scheduledPublishAt,
      // Additional searchable fields
      benefits: job.benefits,
      interviewProcess: job.interviewProcess,
      expiresAt: job.expiresAt,
      bondDetails: job.bondDetails,
    };
    await (elasticClient.index as any)({ index: ELASTIC_INDICES.JOBS, id: job.id, document });

    // Self-populate suggestions index (fire-and-forget)
    this.bulkUpsertSuggestions(this.extractSuggestionsFromJob(job)).catch(() => {});
  }

  async deleteJob(jobId: string) {
    await (elasticClient.delete as any)({ index: ELASTIC_INDICES.JOBS, id: jobId });
  }

  async indexCandidate(profile: any) {
    const document = {
      id: profile.id,
      userId: profile.userId,
      fullName: `${profile.user?.firstName || ''} ${profile.user?.lastName || ''}`.trim(),
      headline: profile.headline,
      bio: profile.bio,
      skills: profile.skills,
      currentLocation: profile.currentLocation,
      preferredLocations: profile.preferredLocations,
      experienceYears: profile.experienceYears,
      totalExperienceMonths: profile.totalExperienceMonths,
      currentRole: profile.currentRole,
      currentCompany: profile.currentCompany,
      currentIndustry: profile.currentIndustry,
      currentDepartment: profile.currentDepartment,
      functionalArea: profile.functionalArea,
      currSalary:
        profile.currSalary !== null && profile.currSalary !== undefined
          ? Number(profile.currSalary)
          : null,
      expectedSalaryMin:
        profile.expectedSalaryMin !== null && profile.expectedSalaryMin !== undefined
          ? Number(profile.expectedSalaryMin)
          : null,
      expectedSalaryMax:
        profile.expectedSalaryMax !== null && profile.expectedSalaryMax !== undefined
          ? Number(profile.expectedSalaryMax)
          : null,
      salaryCurrency: profile.salaryCurrency,
      languages: profile.languages,
      education: profile.education,
      experience: profile.experience,
      gender: profile.gender,
      noticePeriod: profile.noticePeriod,
      workStatus: profile.workStatus,
      hasCareerBreak: profile.hasCareerBreak,
      willingToRelocate: profile.willingToRelocate,
      preferredJobType: profile.preferredJobType,
      preferredWorkMode: profile.preferredWorkMode,
      preferredShift: profile.preferredShift,
      preferredIndustries: profile.preferredIndustries,
      preferredRoleCategories: profile.preferredRoleCategories,
      disabilityType: profile.disabilityType,
      city: profile.city,
      state: profile.state,
      certifications: profile.certifications,
      skillsWithProficiency: profile.skillsWithProficiency,
      servingNoticePeriod: profile.servingNoticePeriod,
      dob: profile.dob,
      hasResume: !!profile.resume,
      isEmailVerified: profile.user?.isEmailVerified,
      isMobileVerified: profile.user?.isMobileVerified,
      isWhatsappVerified: profile.user?.isWhatsappVerified,
      dateOfAvailability: profile.dateOfAvailability,
      pronouns: profile.pronouns,
      category: profile.category,
      email: profile.user?.email || '',
      phone: profile.phone || '',
      alternatePhone: profile.alternatePhone || '',
      mobileNumber: profile.user?.mobileNumber || '',
      whatsappNumber: profile.user?.whatsappNumber || '',
      alternateEmail: profile.alternateEmail,
      openToWork: profile.openToWork,
      careerBreakType: profile.careerBreakType,
      isVeteran: profile.isVeteran || false,
      hasDrivingLicense: profile.hasDrivingLicense || false,
      blockedCompanies: profile.blockedCompanies || [],
      interests: profile.interests || [],
      hobbies: profile.hobbies || [],
      itSkills: profile.itSkills,
      publications: profile.publications,
      patents: profile.patents,
      volunteerExperience: profile.volunteerExperience,
      professionalMemberships: profile.professionalMemberships,
      courses: profile.courses,
      testScores: profile.testScores,
      visaStatus: profile.visaStatus,
      workPermitStatus: profile.workPermitStatus,
      profileCompleteness: profile.profileCompleteness || 0,
      lastActiveAt: profile.user?.lastActiveAt,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      location_geo:
        profile.latitude && profile.longitude
          ? { lat: profile.latitude, lon: profile.longitude }
          : undefined,
      // New structured fields for matching
      experienceLevel: profile.experienceLevel,
      highestEducationLevel: profile.highestEducationLevel,
      highestDegree: profile.highestDegree,
      drivingLicenseType: profile.drivingLicenseType,
      isPhysicallyChallenged: profile.isPhysicallyChallenged || false,
      disabilityPercentage: profile.disabilityPercentage,
      travelWillingnessPercent: profile.travelWillingnessPercent,
      ownVehicle: profile.ownVehicle || false,
      nationality: profile.nationality,
      maritalStatus: profile.maritalStatus,
      hasVideoResume: !!profile.videoResumeUrl,
      languageProficiency: profile.languageProficiency,
      awards: profile.awards,
    };
    await (elasticClient.index as any)({
      index: ELASTIC_INDICES.CANDIDATES,
      id: profile.id,
      document,
    });

    // Self-populate suggestions index (fire-and-forget)
    this.bulkUpsertSuggestions(this.extractSuggestionsFromCandidate(profile)).catch(() => {});
  }

  async deleteCandidate(candidateId: string) {
    await (elasticClient.delete as any)({ index: ELASTIC_INDICES.CANDIDATES, id: candidateId });
  }

  async indexEmployer(company: any) {
    const document = {
      id: company.id,
      userId: company.userId,
      // Public-search SEO fields — `slug` powers the canonical
      // /companies/{slug} URL; `publicSearchable` is the employer's
      // opt-out flag.
      slug: company.slug,
      publicSearchable: company.publicSearchable !== false,
      accountType: company.accountType,
      hiringType: company.hiringType,
      companyName: company.companyName,
      companyType: company.companyType,
      tagline: company.tagline,
      // Logo (+ variants) need to live in the ES document so the public
      // /companies listing can render the avatar tile. Without this, the
      // listing card falls back to the Building2 placeholder for every
      // row when the search hits ES — the Prisma fallback in
      // public-companies.service was the only path that returned `logo`,
      // which is why the listing has been logo-less on the production
      // surface. Re-indexing on the next employer-profile update fills
      // existing docs; the public-companies.controller catch-all also
      // tolerates an absent field.
      logo: company.logo,
      logoVariants: company.logoVariants,
      industry: company.industry,
      companySize: company.companySize,
      employeeCount: company.employeeCount,
      annualRevenueRange: company.annualRevenueRange,
      techStack: company.techStack,
      headquarters: company.headquarters,
      city: company.city,
      state: company.state,
      locations: company.locations,
      description: company.description,
      isVerified: company.isVerified,
      website: company.website,
      foundedYear: company.foundedYear,
      subIndustry: company.subIndustry,
      specialties: company.specialties || [],
      fundingStage: company.fundingStage,
      investors: company.investors || [],
      productsServices: company.productsServices || [],
      coreValues: company.coreValues || [],
      parentCompany: company.parentCompany,
      whyWorkForUs: company.whyWorkForUs,
      careersPageUrl: company.careersPageUrl,
      blogUrl: company.blogUrl,
      location_geo:
        company.latitude && company.longitude
          ? { lat: company.latitude, lon: company.longitude }
          : undefined,
      // Additional employer fields
      benefits: company.benefits || [],
      numberOfOffices: company.numberOfOffices,
      totalFundingRaised: company.totalFundingRaised,
      companyCulture: company.companyCulture,
      diversityStatement: company.diversityStatement,
      stockTicker: company.stockTicker,
      missionStatement: company.missionStatement,
    };
    await (elasticClient.index as any)({
      index: ELASTIC_INDICES.EMPLOYERS,
      id: company.id,
      document,
    });

    // Self-populate suggestions index (fire-and-forget)
    this.bulkUpsertSuggestions(this.extractSuggestionsFromEmployer(company)).catch(() => {});
  }

  // ─── Autocomplete ───────────────────────────────────────────────────

  // Build a query that matches both prefix (edge_ngram) and fuzzy (typo-tolerant) results
  private _autocompleteQuery(
    autocompleteField: string,
    fuzzyField: string,
    query: string,
    filter?: Record<string, any>
  ) {
    const should: any[] = [
      { match: { [autocompleteField]: { query, operator: 'and', boost: 2 } } },
      { match: { [fuzzyField]: { query, fuzziness: 'AUTO', prefix_length: 1 } } },
    ];
    const boolQuery: any = { should, minimum_should_match: 1 };
    if (filter) boolQuery.filter = filter;
    return { bool: boolQuery };
  }

  async autocomplete(
    query: string,
    type: 'jobs' | 'candidates' | 'all' = 'all',
    limit: number = 10
  ): Promise<AutocompleteResult[]> {
    if (!query || query.length < 2) return [];
    const results: AutocompleteResult[] = [];
    const openFilter = { term: { status: JOB_STATUS.OPEN } };

    try {
      if (type === 'jobs' || type === 'all') {
        const [titleRes, skillRes, companyRes, locationRes] = await Promise.all([
          (elasticClient.search as any)({
            index: ELASTIC_INDICES.JOBS,
            query: this._autocompleteQuery('title.autocomplete', 'title', query, openFilter),
            _source: false,
            size: 0,
            aggs: {
              items: { terms: { field: 'title.keyword', size: limit, order: { _count: 'desc' } } },
            },
          }),
          (elasticClient.search as any)({
            index: ELASTIC_INDICES.JOBS,
            query: this._autocompleteQuery('skills.autocomplete', 'skills.text', query, openFilter),
            _source: false,
            size: 0,
            aggs: { items: { terms: { field: 'skills', size: limit, order: { _count: 'desc' } } } },
          }),
          (elasticClient.search as any)({
            index: ELASTIC_INDICES.JOBS,
            query: this._autocompleteQuery(
              'companyName.autocomplete',
              'companyName',
              query,
              openFilter
            ),
            _source: false,
            size: 0,
            aggs: {
              items: {
                terms: { field: 'companyName.keyword', size: limit, order: { _count: 'desc' } },
              },
            },
          }),
          (elasticClient.search as any)({
            index: ELASTIC_INDICES.JOBS,
            query: this._autocompleteQuery('location.autocomplete', 'location', query, openFilter),
            _source: false,
            size: 0,
            aggs: {
              items: {
                terms: { field: 'location.keyword', size: limit, order: { _count: 'desc' } },
              },
            },
          }),
        ]);

        for (const b of titleRes.aggregations?.items?.buckets || []) {
          results.push({ text: b.key, type: 'job_title', count: b.doc_count });
        }
        for (const b of skillRes.aggregations?.items?.buckets || []) {
          if (b.key.toLowerCase().includes(query.toLowerCase())) {
            results.push({ text: b.key, type: 'skill', count: b.doc_count });
          }
        }
        for (const b of companyRes.aggregations?.items?.buckets || []) {
          results.push({ text: b.key, type: 'company', count: b.doc_count });
        }
        for (const b of locationRes.aggregations?.items?.buckets || []) {
          results.push({ text: b.key, type: 'location', count: b.doc_count });
        }
      }

      if (type === 'candidates') {
        const [skillRes, locRes, roleRes] = await Promise.all([
          (elasticClient.search as any)({
            index: ELASTIC_INDICES.CANDIDATES,
            query: this._autocompleteQuery('skills.autocomplete', 'skills.text', query),
            _source: false,
            size: 0,
            aggs: { items: { terms: { field: 'skills', size: limit, order: { _count: 'desc' } } } },
          }),
          (elasticClient.search as any)({
            index: ELASTIC_INDICES.CANDIDATES,
            query: this._autocompleteQuery(
              'currentLocation.autocomplete',
              'currentLocation',
              query
            ),
            _source: false,
            size: 0,
            aggs: {
              items: {
                terms: { field: 'currentLocation.keyword', size: limit, order: { _count: 'desc' } },
              },
            },
          }),
          (elasticClient.search as any)({
            index: ELASTIC_INDICES.CANDIDATES,
            query: this._autocompleteQuery('currentRole.autocomplete', 'currentRole', query),
            _source: false,
            size: 0,
            aggs: {
              items: {
                terms: { field: 'currentRole.keyword', size: limit, order: { _count: 'desc' } },
              },
            },
          }),
        ]);

        for (const b of skillRes.aggregations?.items?.buckets || []) {
          if (b.key.toLowerCase().includes(query.toLowerCase())) {
            results.push({ text: b.key, type: 'skill', count: b.doc_count });
          }
        }
        for (const b of locRes.aggregations?.items?.buckets || []) {
          results.push({ text: b.key, type: 'location', count: b.doc_count });
        }
        for (const b of roleRes.aggregations?.items?.buckets || []) {
          results.push({ text: b.key, type: 'job_title', count: b.doc_count });
        }
      }

      // Supplement with generic/static suggestions if ES returned few results
      if (results.length < limit) {
        const remaining = limit - results.length;
        const perType = Math.max(2, Math.ceil(remaining / 4));
        const existingTexts = new Set(results.map((r) => r.text.toLowerCase()));

        for (const t of filterStaticFuzzy(COMMON_JOB_TITLES, query, perType)) {
          if (!existingTexts.has(t.toLowerCase())) {
            results.push({ text: t, type: 'job_title', count: 0 });
          }
        }
        for (const s of filterStaticFuzzy(COMMON_SKILLS, query, perType)) {
          if (!existingTexts.has(s.toLowerCase())) {
            results.push({ text: s, type: 'skill', count: 0 });
          }
        }
        for (const c of filterStaticFuzzy(COMMON_COMPANIES, query, perType)) {
          if (!existingTexts.has(c.toLowerCase())) {
            results.push({ text: c, type: 'company', count: 0 });
          }
        }
        for (const l of filterStaticFuzzy(COMMON_LOCATIONS, query, perType)) {
          if (!existingTexts.has(l.toLowerCase())) {
            results.push({ text: l, type: 'location', count: 0 });
          }
        }
      }

      const seen = new Set<string>();
      return results
        .filter((r) => {
          const k = `${r.type}:${r.text.toLowerCase()}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .sort((a, b) => (b.count || 0) - (a.count || 0))
        .slice(0, limit);
    } catch (error) {
      logger.error('Autocomplete error, falling back to Prisma', error);
      return this._autocompleteFallback(query, type, limit);
    }
  }

  // ─── Suggest Skills ─────────────────────────────────────────────────

  async suggestSkills(
    query: string,
    limit: number = 15
  ): Promise<{ text: string; count: number }[]> {
    if (!query || query.length < 1) return [];
    try {
      const result = await (elasticClient.search as any)({
        index: [ELASTIC_INDICES.JOBS, ELASTIC_INDICES.CANDIDATES],
        query: { match: { 'skills.autocomplete': { query, operator: 'and' } } },
        _source: false,
        size: 0,
        aggs: { items: { terms: { field: 'skills', size: limit * 2, order: { _count: 'desc' } } } },
      });
      const esResults = (result.aggregations?.items?.buckets || [])
        .filter((b: any) => b.key.toLowerCase().includes(query.toLowerCase()))
        .slice(0, limit)
        .map((b: any) => ({ text: b.key, count: b.doc_count }));
      // Supplement with common skills
      if (esResults.length < limit) {
        const existing = new Set(esResults.map((r: any) => r.text.toLowerCase()));
        for (const s of filterStatic(COMMON_SKILLS, query, limit - esResults.length)) {
          if (!existing.has(s.toLowerCase())) esResults.push({ text: s, count: 0 });
        }
      }
      return esResults.slice(0, limit);
    } catch (error) {
      logger.error('Skill suggestion error, falling back to Prisma', error);
      return this._suggestSkillsFallback(query, limit);
    }
  }

  // ─── Suggest Locations ──────────────────────────────────────────────

  async suggestLocations(
    query: string,
    limit: number = 10
  ): Promise<{ text: string; count: number }[]> {
    if (!query || query.length < 2) return [];
    try {
      const result = await (elasticClient.search as any)({
        index: ELASTIC_INDICES.JOBS,
        query: {
          bool: {
            must: { match: { 'location.autocomplete': { query, operator: 'and' } } },
            filter: { term: { status: JOB_STATUS.OPEN } },
          },
        },
        _source: false,
        size: 0,
        aggs: {
          items: { terms: { field: 'location.keyword', size: limit, order: { _count: 'desc' } } },
        },
      });
      const esResults = (result.aggregations?.items?.buckets || []).map((b: any) => ({
        text: b.key,
        count: b.doc_count,
      }));
      // Supplement with common locations
      if (esResults.length < limit) {
        const existing = new Set(esResults.map((r: any) => r.text.toLowerCase()));
        for (const l of filterStatic(COMMON_LOCATIONS, query, limit - esResults.length)) {
          if (!existing.has(l.toLowerCase())) esResults.push({ text: l, count: 0 });
        }
      }
      return esResults.slice(0, limit);
    } catch (error) {
      logger.error('Location suggestion error, falling back to Prisma', error);
      return this._suggestLocationsFallback(query, limit);
    }
  }

  // ─── Suggest Companies ──────────────────────────────────────────────

  async suggestCompanies(
    query: string,
    limit: number = 10
  ): Promise<{ text: string; count: number }[]> {
    if (!query || query.length < 2) return [];
    try {
      const result = await (elasticClient.search as any)({
        index: ELASTIC_INDICES.EMPLOYERS,
        query: { match: { 'companyName.autocomplete': { query, operator: 'and' } } },
        _source: false,
        size: 0,
        aggs: {
          items: {
            terms: { field: 'companyName.keyword', size: limit, order: { _count: 'desc' } },
          },
        },
      });
      const esResults = (result.aggregations?.items?.buckets || []).map((b: any) => ({
        text: b.key,
        count: b.doc_count,
      }));
      // Supplement with common companies
      if (esResults.length < limit) {
        const existing = new Set(esResults.map((r: any) => r.text.toLowerCase()));
        for (const c of filterStatic(COMMON_COMPANIES, query, limit - esResults.length)) {
          if (!existing.has(c.toLowerCase())) esResults.push({ text: c, count: 0 });
        }
      }
      return esResults.slice(0, limit);
    } catch (error) {
      logger.error('Company suggestion error, falling back to Prisma', error);
      return this._suggestCompaniesFallback(query, limit);
    }
  }

  // ─── Suggest Job Titles ─────────────────────────────────────────────

  async suggestJobTitles(
    query: string,
    limit: number = 10
  ): Promise<{ text: string; count: number }[]> {
    if (!query || query.length < 2) return [];
    try {
      const result = await (elasticClient.search as any)({
        index: ELASTIC_INDICES.JOBS,
        query: {
          bool: {
            must: { match: { 'title.autocomplete': { query, operator: 'and' } } },
            filter: { term: { status: JOB_STATUS.OPEN } },
          },
        },
        _source: false,
        size: 0,
        aggs: {
          items: { terms: { field: 'title.keyword', size: limit, order: { _count: 'desc' } } },
        },
      });
      const esResults = (result.aggregations?.items?.buckets || []).map((b: any) => ({
        text: b.key,
        count: b.doc_count,
      }));
      // Supplement with common job titles
      if (esResults.length < limit) {
        const existing = new Set(esResults.map((r: any) => r.text.toLowerCase()));
        for (const t of filterStatic(COMMON_JOB_TITLES, query, limit - esResults.length)) {
          if (!existing.has(t.toLowerCase())) esResults.push({ text: t, count: 0 });
        }
      }
      return esResults.slice(0, limit);
    } catch (error) {
      logger.error('Job title suggestion error, falling back to Prisma', error);
      return this._suggestJobTitlesFallback(query, limit);
    }
  }

  // ─── Prisma Fallbacks for Suggestions ───────────────────────────────

  private async _autocompleteFallback(
    query: string,
    type: 'jobs' | 'candidates' | 'all',
    limit: number
  ): Promise<AutocompleteResult[]> {
    try {
      const results: AutocompleteResult[] = [];

      if (type === 'jobs' || type === 'all') {
        const [titles, locations, companies, skills] = await Promise.all([
          this._suggestJobTitlesFallback(query, Math.ceil(limit / 4)),
          this._suggestLocationsFallback(query, Math.ceil(limit / 4)),
          this._suggestCompaniesFallback(query, Math.ceil(limit / 4)),
          this._suggestSkillsFallback(query, Math.ceil(limit / 4)),
        ]);
        titles.forEach((t) => results.push({ text: t.text, type: 'job_title', count: t.count }));
        skills.forEach((s) => results.push({ text: s.text, type: 'skill', count: s.count }));
        companies.forEach((c) => results.push({ text: c.text, type: 'company', count: c.count }));
        locations.forEach((l) => results.push({ text: l.text, type: 'location', count: l.count }));
      }

      if (type === 'candidates') {
        const [skills, roles] = await Promise.all([
          this._suggestSkillsFallback(query, Math.ceil(limit / 2)),
          prisma.candidateProfile.groupBy({
            by: ['currentRole'],
            where: { currentRole: { contains: query, mode: 'insensitive' } },
            _count: { currentRole: true },
            orderBy: { _count: { currentRole: 'desc' } },
            take: Math.ceil(limit / 2),
          }),
        ]);
        skills.forEach((s) => results.push({ text: s.text, type: 'skill', count: s.count }));
        roles.forEach((r) => {
          if (r.currentRole) {
            results.push({ text: r.currentRole, type: 'job_title', count: r._count.currentRole });
          }
        });
      }

      // Supplement with static suggestions
      if (results.length < limit) {
        const existing = new Set(results.map((r) => r.text.toLowerCase()));
        const perType = Math.max(2, Math.ceil((limit - results.length) / 4));
        for (const t of filterStatic(COMMON_JOB_TITLES, query, perType)) {
          if (!existing.has(t.toLowerCase())) {
            results.push({ text: t, type: 'job_title', count: 0 });
          }
        }
        for (const s of filterStatic(COMMON_SKILLS, query, perType)) {
          if (!existing.has(s.toLowerCase())) results.push({ text: s, type: 'skill', count: 0 });
        }
        for (const c of filterStatic(COMMON_COMPANIES, query, perType)) {
          if (!existing.has(c.toLowerCase())) results.push({ text: c, type: 'company', count: 0 });
        }
        for (const l of filterStatic(COMMON_LOCATIONS, query, perType)) {
          if (!existing.has(l.toLowerCase())) results.push({ text: l, type: 'location', count: 0 });
        }
      }

      const seen = new Set<string>();
      return results
        .filter((r) => {
          const k = `${r.type}:${r.text.toLowerCase()}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .sort((a, b) => (b.count || 0) - (a.count || 0))
        .slice(0, limit);
    } catch (err) {
      logger.error('Autocomplete Prisma fallback failed', err);
      // Last resort — return purely static suggestions
      const results: AutocompleteResult[] = [];
      const perType = Math.max(2, Math.ceil(limit / 4));
      for (const t of filterStatic(COMMON_JOB_TITLES, query, perType)) {
        results.push({ text: t, type: 'job_title', count: 0 });
      }
      for (const s of filterStatic(COMMON_SKILLS, query, perType)) {
        results.push({ text: s, type: 'skill', count: 0 });
      }
      for (const c of filterStatic(COMMON_COMPANIES, query, perType)) {
        results.push({ text: c, type: 'company', count: 0 });
      }
      for (const l of filterStatic(COMMON_LOCATIONS, query, perType)) {
        results.push({ text: l, type: 'location', count: 0 });
      }
      return results.slice(0, limit);
    }
  }

  private async _suggestSkillsFallback(
    query: string,
    limit: number
  ): Promise<{ text: string; count: number }[]> {
    try {
      const rows = await prisma.$queryRawUnsafe<{ skill: string; cnt: bigint }[]>(
        `SELECT skill, COUNT(*) as cnt
         FROM (
           SELECT unnest("skillsRequired") as skill FROM "JobPost" WHERE status = 'OPEN'
           UNION ALL
           SELECT unnest("skills") as skill FROM "CandidateProfile"
         ) sub
         WHERE skill ILIKE $1
         GROUP BY skill
         ORDER BY cnt DESC
         LIMIT $2`,
        `%${query}%`,
        limit
      );
      return rows.map((r) => ({ text: r.skill, count: Number(r.cnt) }));
    } catch (err) {
      logger.error('Skill suggestion Prisma fallback failed', err);
      return [];
    }
  }

  private async _suggestLocationsFallback(
    query: string,
    limit: number
  ): Promise<{ text: string; count: number }[]> {
    try {
      const rows = await prisma.jobPost.groupBy({
        by: ['location'],
        where: { status: JobStatus.OPEN, location: { contains: query, mode: 'insensitive' } },
        _count: { location: true },
        orderBy: { _count: { location: 'desc' } },
        take: limit,
      });
      return rows.map((r) => ({ text: r.location, count: r._count.location }));
    } catch (err) {
      logger.error('Location suggestion Prisma fallback failed', err);
      return [];
    }
  }

  private async _suggestCompaniesFallback(
    query: string,
    limit: number
  ): Promise<{ text: string; count: number }[]> {
    try {
      const rows = await prisma.companyProfile.groupBy({
        by: ['companyName'],
        where: { companyName: { contains: query, mode: 'insensitive' } },
        _count: { companyName: true },
        orderBy: { _count: { companyName: 'desc' } },
        take: limit,
      });
      return rows.map((r) => ({ text: r.companyName, count: r._count.companyName }));
    } catch (err) {
      logger.error('Company suggestion Prisma fallback failed', err);
      return [];
    }
  }

  private async _suggestJobTitlesFallback(
    query: string,
    limit: number
  ): Promise<{ text: string; count: number }[]> {
    try {
      const rows = await prisma.jobPost.groupBy({
        by: ['title'],
        where: { status: JobStatus.OPEN, title: { contains: query, mode: 'insensitive' } },
        _count: { title: true },
        orderBy: { _count: { title: 'desc' } },
        take: limit,
      });
      return rows.map((r) => ({ text: r.title, count: r._count.title }));
    } catch (err) {
      logger.error('Job title suggestion Prisma fallback failed', err);
      return [];
    }
  }

  // ─── Search History (Redis) ─────────────────────────────────────────

  private async ensureSortedSet(key: string): Promise<void> {
    const keyType = await redis.type(key);
    if (keyType !== 'zset' && keyType !== 'none') {
      logger.warn(`Search history key ${key} has wrong type "${keyType}", resetting to sorted set`);
      await redis.del(key);
    }
  }

  async addToSearchHistory(
    userId: string,
    query: string,
    type: 'job' | 'candidate'
  ): Promise<void> {
    try {
      const key = SEARCH_HISTORY_KEY(userId);
      await this.ensureSortedSet(key);

      const member = `${query}\0${type}`; // Unique per query+type combo
      const score = Date.now();

      // ZADD with score=timestamp — overwrites if member exists (natural dedup)
      await (redis as any).zadd(key, score, member);
      // Trim to keep only the most recent entries
      await (redis as any).zremrangebyrank(key, 0, -(SEARCH_HISTORY_MAX + 1));
      await redis.expire(key, 90 * 24 * 60 * 60);
      await redis.zincrby(POPULAR_SEARCHES_KEY, 1, query.toLowerCase().trim());
    } catch (error) {
      logger.error('Failed to add search history', error);
    }
  }

  async getSearchHistory(
    userId: string,
    limit: number = 10
  ): Promise<{ query: string; type: string; timestamp: number }[]> {
    try {
      const key = SEARCH_HISTORY_KEY(userId);
      await this.ensureSortedSet(key);

      const results = await redis.zrevrange(key, 0, limit - 1, 'WITHSCORES');
      const parsed: { query: string; type: string; timestamp: number }[] = [];
      for (let i = 0; i < results.length; i += 2) {
        const [query, type] = results[i].split('\0');
        parsed.push({ query, type, timestamp: parseInt(results[i + 1], 10) });
      }
      return parsed;
    } catch (error) {
      logger.error('Failed to get search history', error);
      return [];
    }
  }

  async clearSearchHistory(userId: string): Promise<void> {
    try {
      await redis.del(SEARCH_HISTORY_KEY(userId));
    } catch (error) {
      logger.error('Failed to clear search history', error);
    }
  }

  // ─── Generic Field History (location, skill, company) ──────────────

  async addToFieldHistory(userId: string, field: string, value: string): Promise<void> {
    try {
      const key = FIELD_HISTORY_KEY(field, userId);
      await this.ensureSortedSet(key);
      const score = Date.now();
      await (redis as any).zadd(key, score, value);
      await (redis as any).zremrangebyrank(key, 0, -(FIELD_HISTORY_MAX + 1));
      await redis.expire(key, FIELD_HISTORY_TTL);
    } catch (error) {
      logger.error(`Failed to add field history [${field}]`, error);
    }
  }

  async getFieldHistory(
    userId: string,
    field: string,
    limit: number = 10
  ): Promise<{ value: string; timestamp: number }[]> {
    try {
      const key = FIELD_HISTORY_KEY(field, userId);
      await this.ensureSortedSet(key);
      const results = await redis.zrevrange(key, 0, limit - 1, 'WITHSCORES');
      const parsed: { value: string; timestamp: number }[] = [];
      for (let i = 0; i < results.length; i += 2) {
        parsed.push({ value: results[i], timestamp: parseInt(results[i + 1], 10) });
      }
      return parsed;
    } catch (error) {
      logger.error(`Failed to get field history [${field}]`, error);
      return [];
    }
  }

  async clearFieldHistory(userId: string, field: string): Promise<void> {
    try {
      await redis.del(FIELD_HISTORY_KEY(field, userId));
    } catch (error) {
      logger.error(`Failed to clear field history [${field}]`, error);
    }
  }

  async getPopularSearches(limit: number = 10): Promise<{ query: string; count: number }[]> {
    try {
      const results = await redis.zrevrange(POPULAR_SEARCHES_KEY, 0, limit - 1, 'WITHSCORES');
      const parsed: { query: string; count: number }[] = [];
      for (let i = 0; i < results.length; i += 2) {
        parsed.push({ query: results[i], count: parseInt(results[i + 1], 10) });
      }
      return parsed;
    } catch (error) {
      logger.error('Failed to get popular searches', error);
      return [];
    }
  }

  // ─── "Did you mean?" Spell Correction ───────────────────────────────

  async didYouMean(query: string, index: string = ELASTIC_INDICES.JOBS): Promise<string | null> {
    if (!query || query.length < 3) return null;
    try {
      const fields =
        index === ELASTIC_INDICES.JOBS
          ? ['title', 'skills.text', 'companyName']
          : ['skills.text', 'currentRole', 'headline'];
      const suggestBody: any = {};
      fields.forEach((field, i) => {
        suggestBody[`s_${i}`] = {
          text: query,
          term: { field, suggest_mode: 'popular', min_word_length: 3, max_edits: 2 },
        };
      });

      const result = await (elasticClient.search as any)({
        index,
        suggest: suggestBody,
        _source: false,
        size: 0,
      });

      const words = query.split(/\s+/);
      const corrected = [...words];
      let changed = false;

      for (const key of Object.keys(result.suggest || {})) {
        for (const entry of result.suggest[key]) {
          if (entry.options.length > 0) {
            const idx = words.findIndex(
              (w: string) => w.toLowerCase() === entry.text.toLowerCase()
            );
            if (idx >= 0 && entry.options[0].score > 0.6) {
              corrected[idx] = entry.options[0].text;
              changed = true;
            }
          }
        }
      }
      return changed ? corrected.join(' ') : null;
    } catch (error) {
      logger.error('Did you mean error', error);
      return null;
    }
  }

  // ─── Search Jobs (with aggregations + highlighting) ─────────────────

  async searchJobs(query: any, filters: any = {}) {
    if (!(await isFeatureEnabled('enableElasticsearch'))) {
      logger.debug('Elasticsearch disabled via feature flag — returning empty search results');
      return { hits: [], total: 0, facets: {} };
    }

    // Check Redis cache before hitting ES
    const cacheHash = createHash('md5').update(JSON.stringify({ query, filters })).digest('hex');
    const cacheKey = `${ES_CACHE_PREFIX}jobs:${cacheHash}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        logger.debug('ES search cache hit for jobs query');
        return JSON.parse(cached);
      }
    } catch {
      // Redis unavailable — proceed to ES
    }

    const must: any[] = [];
    const filter: any[] = [];
    const mustNot: any[] = [];

    if (query) {
      const BOOLEAN_OPS_RE = /\b(AND|OR|NOT)\b|[+\-"()]/;
      if (BOOLEAN_OPS_RE.test(query)) {
        must.push({
          simple_query_string: {
            query,
            fields: [
              'title^3',
              'title.autocomplete',
              'description',
              'requirements',
              'keyResponsibilities',
              'companyName^2',
              'skills^2',
              'skills.text^2',
              'tags',
            ],
            default_operator: 'AND',
          },
        });
      } else {
        must.push({
          multi_match: {
            query,
            fields: [
              'title^3',
              'title.autocomplete',
              'description',
              'requirements',
              'keyResponsibilities',
              'companyName^2',
              'skills^2',
              'skills.text^2',
              'tags',
            ],
            fuzziness: 'AUTO',
            prefix_length: 1,
            max_expansions: 50,
            type: 'best_fields',
          },
        });
      }
    }

    if (filters.location) {
      filter.push({
        bool: {
          should: [
            { term: { 'location.keyword': filters.location } },
            { match_phrase_prefix: { location: filters.location } },
          ],
          minimum_should_match: 1,
        },
      });
    }
    // Multi-city filter — `?cities=delhi,noida,gurgaon` (always OR
    // semantics per plan §3.3). String form (parsed) or array form
    // (already split by caller). NOT operator (`!`) excludes a city
    // even if listed in the OR set.
    if (typeof filters.cities === 'string' && filters.cities.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { parseMultiValue } = require('../lib/operator-parser') as {
        parseMultiValue: (s: string) => {
          must: string[];
          should: string[];
          mustNot: string[];
          op: 'AND' | 'OR';
        };
      };
      const parsed = parseMultiValue(filters.cities);
      const positives = [...parsed.must, ...parsed.should];
      if (positives.length > 0) {
        filter.push({
          bool: {
            should: positives.flatMap((c) => [
              { term: { 'location.keyword': c } },
              { match_phrase_prefix: { location: c } },
            ]),
            minimum_should_match: 1,
          },
        });
      }
      if (parsed.mustNot.length > 0) {
        mustNot.push({
          terms: { 'location.keyword': parsed.mustNot },
        });
      }
    } else if (Array.isArray(filters.cities) && filters.cities.length > 0) {
      filter.push({ terms: { 'location.keyword': filters.cities } });
    }
    if (filters.type) filter.push({ term: { type: filters.type } });
    if (filters.isRemote !== undefined) filter.push({ term: { isRemote: filters.isRemote } });
    if (filters.workMode) filter.push({ term: { workMode: filters.workMode } });
    if (filters.shiftType) filter.push({ term: { shiftType: filters.shiftType } });
    // `prefix`, NOT `match_phrase_prefix`. Both fields are mapped `keyword`
    // (see the JOBS mapping above: `industry: { type: 'keyword' }`,
    // `department: { type: 'keyword' }`), and match_phrase_prefix is valid only
    // on `text` fields — OpenSearch rejects it with
    //   "Can only use phrase prefix queries on text fields"
    // which surfaced as HTTP 500 on the PUBLIC job search for any request
    // carrying ?industry= or ?department=. Every other match_phrase_prefix in
    // this file targets a genuine text field (e.g. `location`); these two were
    // the only mismatch.
    //
    // Caveat worth knowing: `prefix` on a keyword anchors to the START of the
    // whole term and is case-sensitive, so ?industry=Technology will NOT match
    // "Healthcare Technology". That is a data-tagging problem, not a query bug.
    if (filters.industry) {
      filter.push({
        bool: {
          should: [
            { term: { industry: filters.industry } },
            { prefix: { industry: filters.industry } },
          ],
          minimum_should_match: 1,
        },
      });
    }
    if (filters.department) {
      filter.push({
        bool: {
          should: [
            { term: { department: filters.department } },
            { prefix: { department: filters.department } },
          ],
          minimum_should_match: 1,
        },
      });
    }
    if (filters.experienceLevel) {
      filter.push({ term: { experienceLevel: filters.experienceLevel } });
    }
    if (filters.educationRequired) {
      filter.push({ term: { educationRequired: filters.educationRequired } });
    }
    if (filters.experience) {
      // Parse range format: "3-5", "12+", or plain number
      const expStr = String(filters.experience);
      const rangeMatch = expStr.match(/^(\d+)-(\d+)$/);
      const plusMatch = expStr.match(/^(\d+)\+$/);
      if (rangeMatch) {
        filter.push({ range: { experienceMin: { lte: Number(rangeMatch[2]) } } });
        filter.push({ range: { experienceMax: { gte: Number(rangeMatch[1]) } } });
      } else if (plusMatch) {
        filter.push({ range: { experienceMax: { gte: Number(plusMatch[1]) } } });
      } else {
        const num = Number(expStr);
        if (!isNaN(num)) filter.push({ range: { experienceMin: { lte: num } } });
      }
    }
    if (filters.salaryMin) filter.push({ range: { salaryMax: { gte: filters.salaryMin } } });
    if (filters.salaryMax) filter.push({ range: { salaryMin: { lte: filters.salaryMax } } });
    // Skills — operator-aware. Three shapes accepted:
    //   1. Array (legacy): `filters.skills = ['react', 'node']` → ES `terms`
    //      query (any-of). Backwards-compatible.
    //   2. String with operators: `filters.skills = 'react|node,!php'` →
    //      caller has not parsed yet; parse now using operator-parser.
    //   3. Structured: `filters.skillsBool = { must, should, mustNot, op }`
    //      → caller has already parsed. Honour AND/OR/NOT directly.
    if (
      filters.skillsBool &&
      typeof filters.skillsBool === 'object' &&
      !Array.isArray(filters.skillsBool)
    ) {
      const sb = filters.skillsBool as {
        must?: string[];
        should?: string[];
        mustNot?: string[];
        op?: 'AND' | 'OR';
      };
      if (sb.op === 'AND' && sb.must?.length) {
        for (const s of sb.must) filter.push({ term: { skills: s } });
      } else if (sb.should?.length) {
        filter.push({ terms: { skills: sb.should } });
      } else if (sb.must?.length) {
        filter.push({ terms: { skills: sb.must } });
      }
      if (sb.mustNot?.length) {
        mustNot.push({ terms: { skills: sb.mustNot } });
      }
    } else if (typeof filters.skills === 'string' && filters.skills.length > 0) {
      // Inline parse — used when the public route hands us a raw URL string.
      // Lazy require avoids a top-of-file cyclic import path.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { parseMultiValue } = require('../lib/operator-parser') as {
        parseMultiValue: (s: string) => {
          must: string[];
          should: string[];
          mustNot: string[];
          op: 'AND' | 'OR';
        };
      };
      const parsed = parseMultiValue(filters.skills);
      if (parsed.op === 'AND' && parsed.must.length) {
        for (const s of parsed.must) filter.push({ term: { skills: s } });
      } else if (parsed.should.length) {
        filter.push({ terms: { skills: parsed.should } });
      }
      if (parsed.mustNot.length) {
        mustNot.push({ terms: { skills: parsed.mustNot } });
      }
    } else if (Array.isArray(filters.skills) && filters.skills.length > 0) {
      // Legacy array path — existing callers (candidate.controller) pass an
      // array. Treat as OR (any-of) which mirrors the historical behaviour.
      filter.push({ terms: { skills: filters.skills } });
    }
    if (Array.isArray(filters.skillsExclude) && filters.skillsExclude.length > 0) {
      mustNot.push({ terms: { skills: filters.skillsExclude } });
    }
    if (filters.companyType) filter.push({ term: { companyType: filters.companyType } });
    if (filters.companySize) filter.push({ term: { companySize: filters.companySize } });
    if (filters.postedAfter || filters.postedBefore) {
      const range: any = {};
      if (filters.postedAfter) range.gte = filters.postedAfter;
      if (filters.postedBefore) range.lte = filters.postedBefore;
      filter.push({ range: { createdAt: range } });
    }
    if (filters.tags?.length > 0) filter.push({ terms: { tags: filters.tags } });
    if (filters.urgencyLevel) filter.push({ term: { urgencyLevel: filters.urgencyLevel } });
    if (filters.isFeatured !== undefined) filter.push({ term: { isFeatured: filters.isFeatured } });
    if (filters.isWalkIn !== undefined) filter.push({ term: { isWalkIn: filters.isWalkIn } });
    if (filters.roleCategory) filter.push({ term: { roleCategory: filters.roleCategory } });
    if (filters.salaryType) filter.push({ term: { salaryType: filters.salaryType } });
    if (filters.expiresWithinDays) {
      filter.push({
        range: { expiresAt: { gte: 'now', lte: `now+${filters.expiresWithinDays}d` } },
      });
    }
    if (filters.latitude && filters.longitude && filters.radiusKm) {
      filter.push({
        geo_distance: {
          distance: `${filters.radiusKm}km`,
          location_geo: { lat: filters.latitude, lon: filters.longitude },
        },
      });
    }
    // Enterprise filters
    if (filters.functionalArea) filter.push({ term: { functionalArea: filters.functionalArea } });
    if (filters.noticePeriodPreference?.length > 0) {
      filter.push({ terms: { noticePeriodPreference: filters.noticePeriodPreference } });
    }
    if (filters.isPwdFriendly !== undefined) {
      filter.push({ term: { isPwdFriendly: filters.isPwdFriendly } });
    }
    if (filters.visaSponsorshipAvailable !== undefined) {
      filter.push({ term: { visaSponsorshipAvailable: filters.visaSponsorshipAvailable } });
    }
    if (filters.genderPreference) {
      filter.push({ term: { genderPreference: filters.genderPreference } });
    }
    if (filters.diversityTags?.length > 0) {
      filter.push({ terms: { diversityTags: filters.diversityTags } });
    }
    // Filter out INTERNAL-only postings for candidate searches (default to PUBLIC + BOTH)
    if (filters.postingVisibility) {
      filter.push({ term: { postingVisibility: filters.postingVisibility } });
    } else {
      filter.push({ terms: { postingVisibility: ['PUBLIC', 'BOTH'] } });
    }
    // Honour the per-job `publicSearchable` opt-out — employers can mark
    // individual postings as private (no public-board listing). Public
    // routes pass `filters.publicSearchable = true` to enforce this.
    // Treat `false` (excluded from public) and absent fields as also
    // matching when filtering for public to avoid stranding rows that
    // were indexed before the field existed.
    if (filters.publicSearchable === true) {
      filter.push({
        bool: {
          should: [
            { term: { publicSearchable: true } },
            // Backwards-compat: rows indexed before the field existed
            // are absent rather than `true`. Treat absent as "yes".
            { bool: { must_not: [{ exists: { field: 'publicSearchable' } }] } },
          ],
          minimum_should_match: 1,
        },
      });
    }
    filter.push({ term: { status: JOB_STATUS.OPEN } });

    const functions: any[] = [
      { gauss: { createdAt: { origin: 'now', scale: '7d', decay: 0.5 } }, weight: 10 },
      { filter: { term: { isFeatured: true } }, weight: 15 },
      { filter: { term: { isPremium: true } }, weight: 20 },
    ];
    if (filters.salaryMin || filters.salaryMax) {
      functions.push({
        filter: { range: { salaryMax: { gte: filters.salaryMin || 0 } } },
        weight: 5,
      });
    }
    // Array.isArray, NOT `.length > 0`. On the public route `filters.skills`
    // arrives as a bare STRING when it carries no operator characters
    // (public-jobs.service.ts routes operator-bearing input to `skillsBool`
    // instead). `"React".length > 0` passes a truthiness check, and
    // `terms: { skills: "React" }` is invalid — `terms` requires an array — so
    // OpenSearch rejected the whole query and /public/jobs?skills=React 500'd.
    if (Array.isArray(filters.skills) && filters.skills.length > 0) {
      functions.push({ filter: { terms: { skills: filters.skills } }, weight: 8 });
    }
    if (filters.latitude && filters.longitude) {
      functions.push({
        gauss: {
          location_geo: {
            origin: { lat: filters.latitude, lon: filters.longitude },
            scale: '50km',
            offset: '10km',
            decay: 0.5,
          },
        },
        weight: 10,
      });
    }

    const sort: any[] = [];
    if (filters.sortBy === 'distance' && filters.latitude && filters.longitude) {
      sort.push({
        _geo_distance: {
          location_geo: { lat: filters.latitude, lon: filters.longitude },
          order: 'asc',
          unit: 'km',
        },
      });
    } else if (filters.sortBy === 'date') sort.push({ createdAt: 'desc' });
    else if (filters.sortBy === 'salary') sort.push({ salaryMax: 'desc' });
    else if (filters.sortBy === 'salary_asc') sort.push({ salaryMin: 'asc' });

    const aggs: any = {
      workMode: { terms: { field: 'workMode', size: 10 } },
      type: { terms: { field: 'type', size: 10 } },
      experienceLevel: { terms: { field: 'experienceLevel', size: 10 } },
      shiftType: { terms: { field: 'shiftType', size: 10 } },
      industry: { terms: { field: 'industry', size: 20 } },
      department: { terms: { field: 'department', size: 20 } },
      companyType: { terms: { field: 'companyType', size: 10 } },
      urgencyLevel: { terms: { field: 'urgencyLevel', size: 5 } },
      educationRequired: { terms: { field: 'educationRequired', size: 10 } },
      topSkills: { terms: { field: 'skills', size: 30 } },
      topLocations: { terms: { field: 'location.keyword', size: 20 } },
      topCompanies: { terms: { field: 'companyName.keyword', size: 20 } },
      salaryRange: {
        range: {
          field: 'salaryMax',
          ranges: [
            { key: '0-3L', to: 300000 },
            { key: '3-6L', from: 300000, to: 600000 },
            { key: '6-10L', from: 600000, to: 1000000 },
            { key: '10-15L', from: 1000000, to: 1500000 },
            { key: '15-25L', from: 1500000, to: 2500000 },
            { key: '25-50L', from: 2500000, to: 5000000 },
            { key: '50L+', from: 5000000 },
          ],
        },
      },
      experienceRange: {
        range: {
          field: 'experienceMin',
          ranges: [
            { key: 'Fresher', to: 1 },
            { key: '1-3 years', from: 1, to: 3 },
            { key: '3-5 years', from: 3, to: 5 },
            { key: '5-8 years', from: 5, to: 8 },
            { key: '8-12 years', from: 8, to: 12 },
            { key: '12+ years', from: 12 },
          ],
        },
      },
      postedDate: {
        date_range: {
          field: 'createdAt',
          ranges: [
            { key: 'Last 24 hours', from: 'now-1d/d' },
            { key: 'Last 3 days', from: 'now-3d/d' },
            { key: 'Last 7 days', from: 'now-7d/d' },
            { key: 'Last 14 days', from: 'now-14d/d' },
            { key: 'Last 30 days', from: 'now-30d/d' },
          ],
        },
      },
      // Enterprise aggregations
      functionalArea: { terms: { field: 'functionalArea', size: 25 } },
      noticePeriodPreference: { terms: { field: 'noticePeriodPreference', size: 10 } },
      diversityTags: { terms: { field: 'diversityTags', size: 20 } },
      postingVisibility: { terms: { field: 'postingVisibility', size: 5 } },
    };

    const searchParams: any = {
      index: ELASTIC_INDICES.JOBS,
      query: {
        function_score: {
          query: {
            bool: {
              must,
              filter,
              ...(mustNot.length > 0 ? { must_not: mustNot } : {}),
            },
          },
          functions,
          score_mode: 'sum',
          boost_mode: 'multiply',
        },
      },
      aggs,
      highlight: {
        pre_tags: ['<mark>'],
        post_tags: ['</mark>'],
        fields: {
          title: { number_of_fragments: 0 },
          description: { number_of_fragments: 2, fragment_size: 150 },
          'skills.text': { number_of_fragments: 0 },
        },
      },
      from: filters.from || 0,
      size: filters.size || 20,
    };
    if (sort.length > 0) searchParams.sort = sort;

    const result = await tracer.startActiveSpan('elasticsearch.searchJobs', async (span) => {
      span.setAttribute('db.system', 'elasticsearch');
      span.setAttribute('db.operation', 'search');
      span.setAttribute('db.elasticsearch.index', ELASTIC_INDICES.JOBS);
      try {
        const res = await (elasticClient.search as any)(searchParams);
        span.setAttribute('db.elasticsearch.hits', res.hits.total.value);
        span.setStatus({ code: SpanStatusCode.OK });
        return res;
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
        throw error;
      } finally {
        span.end();
      }
    });

    const facets: SearchFacets = {};
    for (const [key, agg] of Object.entries(result.aggregations || {})) {
      const d = agg as any;
      if (d.buckets) {
        facets[key] = d.buckets.map((b: any) => ({
          key: b.key_as_string || b.key,
          count: b.doc_count,
        }));
      }
    }

    const searchResult = {
      hits: result.hits.hits.map((hit: any) => {
        const s = hit._source;
        return {
          ...s,
          // Map ES flat fields back to frontend Job shape
          skillsRequired: s.skills || [],
          niceToHaveSkills: s.niceToHaveSkills || [],
          certificationsRequired: s.certificationsRequired || [],
          tags: s.tags || [],
          jobPerks: s.jobPerks || [],
          company: {
            id: s.companyId || s.id,
            companyName: s.companyName || '',
            logo: s.companyLogo || null,
            industry: s.companyIndustry || s.industry || null,
            companyType: s.companyType || null,
            companySize: s.companySize || null,
            isVerified: s.companyIsVerified || false,
          },
          _score: hit._score,
          _highlight: hit.highlight || {},
        };
      }),
      total: result.hits.total.value,
      facets,
    };

    // Cache result in Redis (fire-and-forget)
    redis.set(cacheKey, JSON.stringify(searchResult), 'EX', ES_CACHE_TTL).catch(() => {});

    // Track search event (fire-and-forget)
    publishEvent(KafkaTopics.SEARCH_PERFORMED, query || 'browse', {
      searchType: 'jobs' as const,
      query: query || null,
      resultCount: searchResult.total,
    }).catch(() => {});

    // Track trending search query (fire-and-forget)
    if (query) {
      trackSearch(query).catch(() => {});
    }

    return searchResult;
  }

  // ─── Search Candidates (with aggregations + highlighting) ───────────

  async searchCandidates(query: any, filters: any = {}) {
    if (!(await isFeatureEnabled('enableElasticsearch'))) {
      logger.debug('Elasticsearch disabled via feature flag — returning empty search results');
      return { hits: [], total: 0, facets: {} };
    }

    // Check Redis cache before hitting ES
    const candidateCacheHash = createHash('md5')
      .update(JSON.stringify({ type: 'candidates', query, filters }))
      .digest('hex');
    const candidateCacheKey = `${ES_CACHE_PREFIX}candidates:${candidateCacheHash}`;
    try {
      const cached = await redis.get(candidateCacheKey);
      if (cached) {
        logger.debug('ES search cache hit for candidates query');
        return JSON.parse(cached);
      }
    } catch {
      // Redis unavailable — proceed to ES
    }

    const must: any[] = [];
    const filter: any[] = [];

    if (query) {
      const scopeFieldMap: Record<string, string[]> = {
        all: [
          'fullName^2',
          'headline^2',
          'skills^3',
          'skills.text^2',
          'currentRole^2',
          'bio',
          'currentCompany',
        ],
        title: ['headline^3', 'currentRole^2'],
        skills: ['skills^3', 'skills.text^3'],
        designation: ['currentRole^3', 'headline^2'],
        company: ['currentCompany^3'],
      };

      // Parse query for NOT operators
      const terms = query.split(/\s+/);
      const mustTerms: string[] = [];
      const mustNotTerms: string[] = [];

      for (const term of terms) {
        if (term.startsWith('NOT ') || term.startsWith('-')) {
          // Extract the actual term (remove NOT or -)
          const negTerm = term.replace(/^(NOT |-)/i, '').trim();
          if (negTerm) mustNotTerms.push(negTerm);
        } else if (term.trim()) {
          mustTerms.push(term);
        }
      }

      const fields = scopeFieldMap[filters.keywordScope] || scopeFieldMap.all;

      // Add positive terms to must clause
      if (mustTerms.length > 0) {
        must.push({
          multi_match: {
            query: mustTerms.join(' '),
            fields,
            fuzziness: 'AUTO',
            prefix_length: 1,
            max_expansions: 50,
            type: 'best_fields',
            operator: filters.keywordOperator === 'and' ? 'and' : 'or',
          },
        });
      }

      // Add negative terms to must_not clause
      if (mustNotTerms.length > 0) {
        filter.push({
          bool: {
            must_not: mustNotTerms.map((term) => ({ multi_match: { query: term, fields } })),
          },
        });
      }
    }

    // Skills — operator-aware (mirror of searchJobs handling).
    if (
      filters.skillsBool &&
      typeof filters.skillsBool === 'object' &&
      !Array.isArray(filters.skillsBool)
    ) {
      const sb = filters.skillsBool as {
        must?: string[];
        should?: string[];
        mustNot?: string[];
        op?: 'AND' | 'OR';
      };
      if (sb.op === 'AND' && sb.must?.length) {
        for (const s of sb.must) filter.push({ term: { skills: s } });
      } else if (sb.should?.length) {
        filter.push({ terms: { skills: sb.should } });
      } else if (sb.must?.length) {
        filter.push({ terms: { skills: sb.must } });
      }
      if (sb.mustNot?.length) {
        filter.push({ bool: { must_not: [{ terms: { skills: sb.mustNot } }] } });
      }
    } else if (typeof filters.skills === 'string' && filters.skills.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { parseMultiValue } = require('../lib/operator-parser') as {
        parseMultiValue: (s: string) => {
          must: string[];
          should: string[];
          mustNot: string[];
          op: 'AND' | 'OR';
        };
      };
      const parsed = parseMultiValue(filters.skills);
      if (parsed.op === 'AND' && parsed.must.length) {
        for (const s of parsed.must) filter.push({ term: { skills: s } });
      } else if (parsed.should.length) {
        filter.push({ terms: { skills: parsed.should } });
      }
      if (parsed.mustNot.length) {
        filter.push({ bool: { must_not: [{ terms: { skills: parsed.mustNot } }] } });
      }
    } else if (Array.isArray(filters.skills) && filters.skills.length > 0) {
      filter.push({ terms: { skills: filters.skills } });
    }
    if (Array.isArray(filters.skillsExclude) && filters.skillsExclude.length > 0) {
      filter.push({ bool: { must_not: [{ terms: { skills: filters.skillsExclude } }] } });
    }
    if (filters.location) {
      filter.push({
        bool: {
          should: [
            // `currentLocation` is mapped `text`, so match_phrase_prefix is
            // valid there. `preferredLocations` and `city` are `keyword`
            // (mapping lines 559 and 605) and must use `prefix` — same defect
            // that made the public job search 500 on ?industry=/?department=.
            { term: { 'currentLocation.keyword': filters.location } },
            { match_phrase_prefix: { currentLocation: filters.location } },
            { term: { preferredLocations: filters.location } },
            { prefix: { preferredLocations: filters.location } },
            { term: { city: filters.location } },
            { prefix: { city: filters.location } },
          ],
          minimum_should_match: 1,
        },
      });
    }
    if (filters.excludeLocation?.length > 0) {
      for (const loc of Array.isArray(filters.excludeLocation)
        ? filters.excludeLocation
        : [filters.excludeLocation]) {
        filter.push({
          bool: {
            must_not: [
              { term: { 'currentLocation.keyword': loc } },
              { match_phrase_prefix: { currentLocation: loc } },
              { term: { city: loc } },
              // `city` is keyword — see the note in the location filter above.
              { prefix: { city: loc } },
            ],
          },
        });
      }
    }
    if (filters.experienceMin) {
      filter.push({ range: { experienceYears: { gte: filters.experienceMin } } });
    }
    if (filters.experienceMax) {
      filter.push({ range: { experienceYears: { lte: filters.experienceMax } } });
    }
    if (filters.salaryMin) {
      filter.push(
        filters.includeSalaryNotDisclosed
          ? {
              bool: {
                should: [
                  { range: { expectedSalaryMax: { gte: filters.salaryMin } } },
                  { bool: { must_not: { exists: { field: 'expectedSalaryMin' } } } },
                ],
              },
            }
          : { range: { expectedSalaryMax: { gte: filters.salaryMin } } }
      );
    }
    if (filters.salaryMax) {
      filter.push(
        filters.includeSalaryNotDisclosed
          ? {
              bool: {
                should: [
                  { range: { expectedSalaryMin: { lte: filters.salaryMax } } },
                  { bool: { must_not: { exists: { field: 'expectedSalaryMin' } } } },
                ],
              },
            }
          : { range: { expectedSalaryMin: { lte: filters.salaryMax } } }
      );
    }
    if (filters.salaryCurrency) filter.push({ term: { salaryCurrency: filters.salaryCurrency } });
    if (filters.noticePeriod) filter.push({ term: { noticePeriod: filters.noticePeriod } });
    if (filters.workStatus) filter.push({ term: { workStatus: filters.workStatus } });
    if (filters.gender) filter.push({ term: { gender: filters.gender } });
    if (filters.willingToRelocate !== undefined) {
      filter.push({ term: { willingToRelocate: filters.willingToRelocate } });
    }
    if (filters.preferredWorkMode) {
      filter.push({ term: { preferredWorkMode: filters.preferredWorkMode } });
    }
    if (filters.lastActiveWithin) {
      const m = filters.lastActiveWithin.match(/^(\d+)d$/);
      if (m) filter.push({ range: { lastActiveAt: { gte: `now-${m[1]}d` } } });
    }
    if (filters.currentIndustry) {
      filter.push({ term: { currentIndustry: filters.currentIndustry } });
    }
    if (filters.hasCareerBreak !== undefined) {
      filter.push({ term: { hasCareerBreak: filters.hasCareerBreak } });
    }
    if (filters.disabilityType) filter.push({ term: { disabilityType: filters.disabilityType } });
    if (filters.certifications) {
      filter.push({
        nested: {
          path: 'certifications',
          query: { match: { 'certifications.name': filters.certifications } },
        },
      });
    }
    if (filters.education) {
      filter.push({
        nested: { path: 'education', query: { match: { 'education.degree': filters.education } } },
      });
    }
    if (filters.excludeKeywords?.length > 0) {
      for (const t of Array.isArray(filters.excludeKeywords)
        ? filters.excludeKeywords
        : [filters.excludeKeywords]) {
        filter.push({
          bool: {
            must_not: {
              multi_match: {
                query: t,
                fields: ['fullName', 'headline', 'skills', 'currentRole', 'bio'],
              },
            },
          },
        });
      }
    }
    if (filters.currentCompany) filter.push({ match: { currentCompany: filters.currentCompany } });
    if (filters.excludeCompany?.length > 0) {
      for (const c of Array.isArray(filters.excludeCompany)
        ? filters.excludeCompany
        : [filters.excludeCompany]) {
        filter.push({ bool: { must_not: { match: { currentCompany: c } } } });
      }
    }
    if (filters.designation) filter.push({ match: { currentRole: filters.designation } });
    if (filters.department) filter.push({ term: { currentDepartment: filters.department } });
    if (filters.ageMin || filters.ageMax) {
      const dobRange: any = {};
      if (filters.ageMax) dobRange.gte = `now-${filters.ageMax}y/d`;
      if (filters.ageMin) dobRange.lte = `now-${filters.ageMin}y/d`;
      filter.push({ range: { dob: dobRange } });
    }
    if (filters.preferredJobType) {
      filter.push({ term: { preferredJobType: filters.preferredJobType } });
    }
    if (filters.servingNoticePeriod !== undefined) {
      filter.push({ term: { servingNoticePeriod: filters.servingNoticePeriod } });
    }
    if (filters.hasResume !== undefined) filter.push({ term: { hasResume: filters.hasResume } });
    if (filters.verifiedMobile !== undefined) {
      filter.push({ term: { isMobileVerified: filters.verifiedMobile } });
    }
    if (filters.verifiedEmail !== undefined) {
      filter.push({ term: { isEmailVerified: filters.verifiedEmail } });
    }
    if (filters.registeredAfter) {
      filter.push({ range: { createdAt: { gte: filters.registeredAfter } } });
    }
    if (filters.modifiedAfter) {
      filter.push({ range: { updatedAt: { gte: filters.modifiedAfter } } });
    }
    if (filters.latitude && filters.longitude && filters.radiusKm) {
      filter.push({
        geo_distance: {
          distance: `${filters.radiusKm}km`,
          location_geo: { lat: filters.latitude, lon: filters.longitude },
        },
      });
    }
    if (filters.openToWork) filter.push({ term: { openToWork: filters.openToWork } });
    if (filters.category) filter.push({ term: { category: filters.category } });
    if (filters.isVeteran === 'true') filter.push({ term: { isVeteran: true } });
    if (filters.careerBreakType) {
      filter.push({ term: { careerBreakType: filters.careerBreakType } });
    }
    if (filters.experienceLevel) {
      filter.push({ term: { experienceLevel: filters.experienceLevel } });
    }
    if (filters.highestEducationLevel) {
      filter.push({ term: { highestEducationLevel: filters.highestEducationLevel } });
    }
    if (filters.highestDegree) filter.push({ term: { highestDegree: filters.highestDegree } });
    if (filters.functionalArea) filter.push({ term: { functionalArea: filters.functionalArea } });
    if (filters.drivingLicenseType) {
      filter.push({ term: { drivingLicenseType: filters.drivingLicenseType } });
    }
    if (filters.isPhysicallyChallenged !== undefined) {
      filter.push({ term: { isPhysicallyChallenged: filters.isPhysicallyChallenged } });
    }
    if (filters.nationality) filter.push({ term: { nationality: filters.nationality } });
    if (filters.travelWillingnessMin) {
      filter.push({ range: { travelWillingnessPercent: { gte: filters.travelWillingnessMin } } });
    }
    if (filters.itSkill) {
      filter.push({
        nested: {
          path: 'itSkills',
          query: {
            bool: {
              should: [
                { term: { 'itSkills.technology': filters.itSkill } },
                { match: { 'itSkills.technology.text': filters.itSkill } },
              ],
            },
          },
        },
      });
    }
    if (filters.workPermit) {
      filter.push({
        bool: {
          should: [
            {
              wildcard: {
                visaStatus: { value: `*${filters.workPermit}*`, case_insensitive: true },
              },
            },
            {
              wildcard: {
                workPermitStatus: { value: `*${filters.workPermit}*`, case_insensitive: true },
              },
            },
          ],
        },
      });
    }
    if (filters.educationLevel) {
      const levelPatterns: Record<string, string[]> = {
        UG: ['B.Tech', 'B.E', 'B.Sc', 'B.Com', 'B.A', 'BBA', 'BCA', 'Bachelor'],
        PG: ['M.Tech', 'M.E', 'M.Sc', 'M.Com', 'M.A', 'MBA', 'MCA', 'Master', 'MSW', 'MPhil'],
        DOCTORATE: ['Ph.D', 'PhD', 'Doctorate', 'D.Sc', 'D.Phil'],
      };
      const patterns = levelPatterns[filters.educationLevel];
      if (patterns) {
        filter.push({
          nested: {
            path: 'education',
            query: {
              bool: {
                should: patterns.map((p) => ({ match_phrase_prefix: { 'education.degree': p } })),
              },
            },
          },
        });
      }
    }

    const functions: any[] = [];

    // Plan-promise: Candidate Premium = "Top Visibility" + "7 Days Profile Boost".
    // Add scoring functions that bump Premium / boosted candidates to
    // the top of the result set. We resolve userIds at query-time (one
    // indexed Entitlement lookup per feature) — fast enough for ES
    // searches that already touch Redis + ES.
    //
    // The boost (weight 12) requires BOTH the feature flag AND an active
    // `profileBoostActiveUntil > now()`. The Premium plan grants a 7-day
    // BOOST_DAYS pool the candidate spends ONE day at a time (Option B
    // — see candidate.service.activateProfileBoost), so the boost should
    // only apply during the activated window, not the whole 30-day plan
    // lifetime.
    try {
      const { getUsersWithFeatureAll } = await import('./entitlement.service');
      const now = new Date();
      const [premiumIds, boostFeatureIds, activeBoostRows] = await Promise.all([
        getUsersWithFeatureAll('feature.candidate_top_visibility'),
        getUsersWithFeatureAll('feature.candidate_profile_boost'),
        prisma.candidateProfile.findMany({
          where: { profileBoostActiveUntil: { gt: now } },
          select: { userId: true },
        }),
      ]);
      if (premiumIds.length > 0) {
        // Highest weight in the candidate scoring graph — effectively "top" per the plan.
        functions.push({ filter: { terms: { userId: premiumIds } }, weight: 25 });
      }
      // Intersect the feature holders with the actively-boosted set so a
      // user who never clicked "Activate Boost" doesn't get the weight.
      const boostFeatureSet = new Set(boostFeatureIds);
      const boostedIds = activeBoostRows
        .map((r) => r.userId)
        .filter((uid) => boostFeatureSet.has(uid));
      if (boostedIds.length > 0) {
        functions.push({ filter: { terms: { userId: boostedIds } }, weight: 12 });
      }
    } catch (err) {
      // Non-fatal — search still runs without the boost ranking if the
      // entitlement lookup blows up. Logs for ops to investigate.
      logger.warn('candidate search — premium/boost scoring skipped', {
        err: err instanceof Error ? err.message : err,
      });
    }

    if (filters.skills?.length > 0) {
      functions.push({ filter: { terms: { skills: filters.skills } }, weight: 10 });
    }
    if (filters.experienceMin || filters.experienceMax) {
      functions.push({
        filter: {
          range: {
            experienceYears: {
              ...(filters.experienceMin ? { gte: filters.experienceMin } : {}),
              ...(filters.experienceMax ? { lte: filters.experienceMax } : {}),
            },
          },
        },
        weight: 5,
      });
    }
    if (filters.location) {
      functions.push({
        filter: {
          bool: {
            should: [
              { term: { 'currentLocation.keyword': filters.location } },
              { term: { preferredLocations: filters.location } },
            ],
          },
        },
        weight: 3,
      });
    }
    if (filters.latitude && filters.longitude) {
      functions.push({
        gauss: {
          location_geo: {
            origin: { lat: filters.latitude, lon: filters.longitude },
            scale: '50km',
            offset: '10km',
            decay: 0.5,
          },
        },
        weight: 10,
      });
    }

    const searchQuery: any =
      functions.length > 0
        ? {
            function_score: {
              query: { bool: { must, filter } },
              functions,
              score_mode: 'sum',
              boost_mode: 'multiply',
            },
          }
        : { bool: { must, filter } };

    const candidateSort: any[] = [];

    // Sorting support
    switch (filters.sortBy) {
      case 'experience':
        candidateSort.push({ experienceYears: { order: 'desc' } });
        break;
      case 'experience_asc':
        candidateSort.push({ experienceYears: { order: 'asc' } });
        break;
      case 'salary':
        candidateSort.push({ expectedSalaryMax: { order: 'desc', missing: '_last' } });
        break;
      case 'salary_asc':
        candidateSort.push({ expectedSalaryMin: { order: 'asc', missing: '_last' } });
        break;
      case 'profileUpdated':
        candidateSort.push({ updatedAt: { order: 'desc' } });
        break;
      case 'lastActive':
        candidateSort.push({ lastActiveAt: { order: 'desc', missing: '_last' } });
        break;
      case 'distance':
        if (filters.latitude && filters.longitude) {
          candidateSort.push({
            _geo_distance: {
              location_geo: { lat: filters.latitude, lon: filters.longitude },
              order: 'asc',
              unit: 'km',
            },
          });
        }
        break;
      case 'relevance':
      default:
        // ES default _score sorting (most relevant first)
        break;
    }

    const aggs: any = {
      workStatus: { terms: { field: 'workStatus', size: 10 } },
      noticePeriod: { terms: { field: 'noticePeriod', size: 10 } },
      gender: { terms: { field: 'gender', size: 10 } },
      preferredWorkMode: { terms: { field: 'preferredWorkMode', size: 5 } },
      currentIndustry: { terms: { field: 'currentIndustry', size: 20 } },
      currentDepartment: { terms: { field: 'currentDepartment', size: 20 } },
      topSkills: { terms: { field: 'skills', size: 30 } },
      topLocations: { terms: { field: 'currentLocation.keyword', size: 20 } },
      topCompanies: { terms: { field: 'currentCompany.keyword', size: 20 } },
      experienceRange: {
        range: {
          field: 'experienceYears',
          ranges: [
            { key: 'Fresher', to: 1 },
            { key: '1-3 years', from: 1, to: 3 },
            { key: '3-5 years', from: 3, to: 5 },
            { key: '5-8 years', from: 5, to: 8 },
            { key: '8-12 years', from: 8, to: 12 },
            { key: '12+ years', from: 12 },
          ],
        },
      },
      salaryRange: {
        range: {
          field: 'expectedSalaryMax',
          ranges: [
            { key: '0-3L', to: 300000 },
            { key: '3-6L', from: 300000, to: 600000 },
            { key: '6-10L', from: 600000, to: 1000000 },
            { key: '10-15L', from: 1000000, to: 1500000 },
            { key: '15-25L', from: 1500000, to: 2500000 },
            { key: '25L+', from: 2500000 },
          ],
        },
      },
      lastActive: {
        date_range: {
          field: 'lastActiveAt',
          ranges: [
            { key: 'Last 7 days', from: 'now-7d/d' },
            { key: 'Last 14 days', from: 'now-14d/d' },
            { key: 'Last 30 days', from: 'now-30d/d' },
            { key: 'Last 90 days', from: 'now-90d/d' },
          ],
        },
      },
      openToWork: { terms: { field: 'openToWork', size: 5 } },
      category: { terms: { field: 'category', size: 10 } },
      experienceLevel: { terms: { field: 'experienceLevel', size: 10 } },
      highestEducationLevel: { terms: { field: 'highestEducationLevel', size: 10 } },
      functionalArea: { terms: { field: 'functionalArea', size: 25 } },
      drivingLicenseType: { terms: { field: 'drivingLicenseType', size: 10 } },
    };

    const params: any = {
      index: ELASTIC_INDICES.CANDIDATES,
      query: searchQuery,
      aggs,
      highlight: {
        pre_tags: ['<mark>'],
        post_tags: ['</mark>'],
        fields: {
          headline: { number_of_fragments: 0 },
          'skills.text': { number_of_fragments: 0 },
          currentRole: { number_of_fragments: 0 },
          currentCompany: { number_of_fragments: 0 },
        },
      },
      from: filters.from || 0,
      size: filters.size || 20,
    };
    if (candidateSort.length > 0) params.sort = candidateSort;

    const result = await tracer.startActiveSpan('elasticsearch.searchCandidates', async (span) => {
      span.setAttribute('db.system', 'elasticsearch');
      span.setAttribute('db.operation', 'search');
      span.setAttribute('db.elasticsearch.index', ELASTIC_INDICES.CANDIDATES);
      try {
        const res = await (elasticClient.search as any)(params);
        span.setAttribute('db.elasticsearch.hits', res.hits.total.value);
        span.setStatus({ code: SpanStatusCode.OK });
        return res;
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
        throw error;
      } finally {
        span.end();
      }
    });

    const facets: SearchFacets = {};
    for (const [key, agg] of Object.entries(result.aggregations || {})) {
      const d = agg as any;
      if (d.buckets) {
        facets[key] = d.buckets.map((b: any) => ({
          key: b.key_as_string || b.key,
          count: b.doc_count,
        }));
      }
    }

    const candidateResult = {
      hits: result.hits.hits.map((hit: any) => {
        const s = hit._source;
        const nameParts = (s.fullName || '').split(' ');
        return {
          ...s,
          // Map ES flat fields back to frontend CandidateProfile shape
          skills: s.skills || [],
          preferredLocations: s.preferredLocations || [],
          preferredJobType: s.preferredJobType || [],
          preferredWorkMode: s.preferredWorkMode || [],
          preferredIndustries: s.preferredIndustries || [],
          preferredRoleCategories: s.preferredRoleCategories || [],
          blockedCompanies: s.blockedCompanies || [],
          interests: s.interests || [],
          hobbies: s.hobbies || [],
          phone: s.phone || null,
          alternatePhone: s.alternatePhone || null,
          user: {
            id: s.userId || '',
            firstName: nameParts[0] || null,
            lastName: nameParts.slice(1).join(' ') || null,
            email: s.email || '',
            avatar: null,
            isEmailVerified: s.isEmailVerified || false,
            isMobileVerified: s.isMobileVerified || false,
            isWhatsappVerified: s.isWhatsappVerified || false,
            mobileNumber: s.mobileNumber || null,
            whatsappNumber: s.whatsappNumber || null,
            lastActiveAt: s.lastActiveAt || null,
          },
          _score: hit._score,
          _highlight: hit.highlight || {},
        };
      }),
      total: result.hits.total.value,
      facets,
    };

    // Cache result in Redis (fire-and-forget)
    redis
      .set(candidateCacheKey, JSON.stringify(candidateResult), 'EX', ES_CACHE_TTL)
      .catch(() => {});

    // Track search event (fire-and-forget)
    publishEvent(KafkaTopics.SEARCH_PERFORMED, query || 'browse', {
      searchType: 'candidates' as const,
      query: query || null,
      resultCount: candidateResult.total,
    }).catch(() => {});

    return candidateResult;
  }

  // ─── Search Employers ───────────────────────────────────────────────

  /**
   * Public companies-search — alias of searchEmployers that always
   * forces `publicSearchable: true` and supports the public-API filter
   * shape (cities, hasOpenJobs, sortBy, page/limit). Used by the
   * `/api/v1/public/companies` endpoint.
   */
  async searchCompanies(query: any, filters: any = {}) {
    // Translate public-API filter shape to searchEmployers internals.
    const internalFilters: Record<string, unknown> = {
      from: ((filters.page ?? 1) - 1) * (filters.limit ?? 20),
      size: Math.min(filters.limit ?? 20, 30),
    };
    if (filters.industry) internalFilters.industry = filters.industry;
    if (filters.location || filters.city) {
      internalFilters.location = filters.location || filters.city;
    }
    if (filters.size) internalFilters.companySize = filters.size;
    if (filters.companyType) internalFilters.companyType = filters.companyType;
    if (filters.isVerified) internalFilters.isVerified = true;

    const result = await this.searchEmployers(query, internalFilters);
    // Public-search filter — applied client-side because the ES schema
    // already excludes opted-out companies. Belt-and-braces: filter
    // again here in case any indexed docs predate the field.
    const hits = (result.hits as any[]).filter((c) => c.publicSearchable !== false);
    return {
      hits,
      total: result.total,
      facets: result.facets,
    };
  }

  async searchEmployers(query: any, filters: any = {}) {
    const must: any[] = [];
    const filter: any[] = [];

    if (query) {
      must.push({
        multi_match: {
          query,
          fields: [
            'companyName^3',
            'companyName.autocomplete',
            'description',
            'industry^2',
            'tagline',
            'techStack',
          ],
          fuzziness: 'AUTO',
        },
      });
    }
    if (filters.industry) filter.push({ term: { industry: filters.industry } });
    if (filters.companySize) filter.push({ term: { companySize: filters.companySize } });
    if (filters.companyType) filter.push({ term: { companyType: filters.companyType } });
    if (filters.isVerified !== undefined) filter.push({ term: { isVerified: filters.isVerified } });
    if (filters.location) {
      filter.push({
        bool: {
          should: [
            { term: { 'headquarters.keyword': filters.location } },
            { term: { locations: filters.location } },
            { term: { city: filters.location } },
          ],
        },
      });
    }
    if (filters.fundingStage) filter.push({ term: { fundingStage: filters.fundingStage } });
    if (filters.subIndustry) filter.push({ term: { subIndustry: filters.subIndustry } });
    if (filters.latitude && filters.longitude && filters.radiusKm) {
      filter.push({
        geo_distance: {
          distance: `${filters.radiusKm}km`,
          location_geo: { lat: filters.latitude, lon: filters.longitude },
        },
      });
    }

    const aggs: any = {
      industry: { terms: { field: 'industry', size: 20 } },
      companyType: { terms: { field: 'companyType', size: 10 } },
      companySize: { terms: { field: 'companySize', size: 10 } },
      fundingStage: { terms: { field: 'fundingStage', size: 10 } },
      subIndustry: { terms: { field: 'subIndustry', size: 20 } },
      topLocations: { terms: { field: 'city', size: 20 } },
    };

    const result = await (elasticClient.search as any)({
      index: ELASTIC_INDICES.EMPLOYERS,
      query: { bool: { must, filter } },
      aggs,
      from: filters.from || 0,
      size: filters.size || 20,
    });

    const facets: SearchFacets = {};
    for (const [key, agg] of Object.entries(result.aggregations || {})) {
      const d = agg as any;
      if (d.buckets) {
        facets[key] = d.buckets.map((b: any) => ({
          key: b.key_as_string || b.key,
          count: b.doc_count,
        }));
      }
    }

    return {
      hits: result.hits.hits.map((hit: any) => ({ ...hit._source, _score: hit._score })),
      total: result.hits.total.value,
      facets,
    };
  }

  // ─── Unified Suggestions (suggestions index) ───────────────────────

  /**
   * Query the suggestions index for a given category.
   * Falls back to static seed data if ES is unavailable.
   */
  async suggest(
    query: string,
    category: string,
    limit: number = 15,
    region?: string
  ): Promise<{ text: string; count: number }[]> {
    return tracer.startActiveSpan('search.suggest', async (span) => {
      try {
        span.setAttribute('suggestion.category', category);
        span.setAttribute('suggestion.query', query);

        const filters: any[] = [{ term: { category } }, { term: { isActive: true } }];
        if (region) {
          filters.push({ term: { region } });
        }

        const esQuery =
          query.length > 0
            ? {
                bool: {
                  must: {
                    match: {
                      text: { query, analyzer: 'suggestion_search_analyzer' },
                    },
                  },
                  filter: filters,
                },
              }
            : { bool: { filter: filters } };

        const result = await (elasticClient.search as any)({
          index: ELASTIC_INDICES.SUGGESTIONS,
          query: esQuery,
          size: limit,
          sort:
            query.length > 0
              ? ['_score', { count: 'desc' }]
              : [{ count: 'desc' }, { 'text.keyword': 'asc' }],
          _source: ['text', 'count'],
        });

        const hits = (result.hits?.hits || []).map((h: any) => ({
          text: h._source.text,
          count: h._source.count || 0,
        }));

        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        return hits;
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        span.end();
        logger.error(`Suggestion error for category=${category}`, error);
        return this._suggestFallbackStatic(query, category, limit);
      }
    });
  }

  /**
   * Fallback: filter static seed data when ES is unavailable.
   */
  private _suggestFallbackStatic(
    query: string,
    category: string,
    limit: number
  ): { text: string; count: number }[] {
    try {
      // Dynamic import would be async; use require for sync fallback
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { SEED_SUGGESTIONS } = require('../data/seed-suggestions');
      const items: string[] = SEED_SUGGESTIONS[category] || [];
      if (items.length === 0) return [];
      const filtered =
        query.length > 0 ? filterStaticFuzzy(items, query, limit) : items.slice(0, limit);
      return filtered.map((text) => ({ text, count: 0 }));
    } catch {
      return [];
    }
  }

  /**
   * Bulk-upsert multiple suggestions for a given category.
   * Used by self-population hooks after indexing jobs/candidates/employers.
   */
  private async bulkUpsertSuggestions(
    items: { category: string; text: string; region?: string; parentCategory?: string }[]
  ): Promise<void> {
    const validItems = items.filter((i) => i.text && i.text.trim().length >= 2);
    if (validItems.length === 0) return;

    const now = new Date().toISOString();
    const operations: any[] = [];
    for (const item of validItems) {
      const cleanText = item.text.trim();
      const id = `${item.category}:${cleanText.toLowerCase().replace(/[\s,]+/g, '_')}`;
      operations.push({
        update: { _index: ELASTIC_INDICES.SUGGESTIONS, _id: id },
      });
      operations.push({
        script: {
          source: 'ctx._source.count += 1; ctx._source.updatedAt = params.now',
          params: { now },
        },
        upsert: {
          text: cleanText,
          category: item.category,
          count: 1,
          source: 'user',
          isActive: true,
          region: item.region || null,
          parentCategory: item.parentCategory || null,
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    // Bulk in chunks of 500 operations (250 items)
    for (let i = 0; i < operations.length; i += 500) {
      const chunk = operations.slice(i, i + 500);
      await (elasticClient.bulk as any)({ operations: chunk }).catch((err: any) =>
        logger.warn('Bulk suggestion upsert partial failure', err?.message)
      );
    }
  }

  /**
   * Extract suggestion-worthy values from a job document and upsert into suggestions index.
   */
  private extractSuggestionsFromJob(job: any): { category: string; text: string }[] {
    const items: { category: string; text: string }[] = [];
    const C = SUGGESTION_CATEGORIES;

    if (job.title) items.push({ category: C.JOB_TITLE, text: job.title });
    if (job.location) items.push({ category: C.LOCATION, text: job.location });
    if (job.industry) items.push({ category: C.INDUSTRY, text: job.industry });
    if (job.department) items.push({ category: C.DEPARTMENT, text: job.department });
    if (job.roleCategory) items.push({ category: C.ROLE_CATEGORY, text: job.roleCategory });

    for (const skill of job.skillsRequired || []) {
      items.push({ category: C.SKILL, text: skill });
    }
    for (const skill of job.niceToHaveSkills || []) {
      items.push({ category: C.SKILL, text: skill });
    }
    for (const cert of job.certificationsRequired || []) {
      items.push({ category: C.CERTIFICATION, text: cert });
    }
    for (const lang of job.languagesRequired || []) {
      const langText = typeof lang === 'string' ? lang : lang?.language;
      if (langText) items.push({ category: C.LANGUAGE, text: langText });
    }
    for (const perk of job.jobPerks || []) {
      items.push({ category: C.BENEFIT, text: perk });
    }
    for (const spec of job.degreeSpecializations || []) {
      items.push({ category: C.FIELD_OF_STUDY, text: spec });
    }
    for (const loc of job.additionalLocations || []) {
      items.push({ category: C.LOCATION, text: loc });
    }

    return items;
  }

  /**
   * Extract suggestion-worthy values from a candidate profile and upsert into suggestions index.
   */
  private extractSuggestionsFromCandidate(profile: any): { category: string; text: string }[] {
    const items: { category: string; text: string }[] = [];
    const C = SUGGESTION_CATEGORIES;

    if (profile.currentRole) items.push({ category: C.ROLE_CATEGORY, text: profile.currentRole });
    if (profile.currentCompany) items.push({ category: C.COMPANY, text: profile.currentCompany });
    if (profile.currentLocation) {
      items.push({ category: C.LOCATION, text: profile.currentLocation });
    }
    if (profile.currentIndustry) {
      items.push({ category: C.INDUSTRY, text: profile.currentIndustry });
    }
    if (profile.currentDepartment) {
      items.push({ category: C.DEPARTMENT, text: profile.currentDepartment });
    }
    if (profile.nationality) items.push({ category: C.NATIONALITY, text: profile.nationality });

    for (const skill of profile.skills || []) {
      items.push({ category: C.SKILL, text: skill });
    }
    for (const lang of profile.languages || []) {
      items.push({ category: C.LANGUAGE, text: lang });
    }
    for (const hobby of profile.hobbies || []) {
      items.push({ category: C.HOBBY, text: hobby });
    }
    for (const interest of profile.interests || []) {
      items.push({ category: C.INTEREST, text: interest });
    }

    // Nested structures
    for (const edu of (profile.education as any[]) || []) {
      if (edu?.institution) {
        const isSchool = edu.educationLevel === 'TENTH' || edu.educationLevel === 'TWELFTH';
        items.push({ category: isSchool ? 'school' : C.INSTITUTION, text: edu.institution });
      }
      if (edu?.degree) items.push({ category: C.DEGREE, text: edu.degree });
      if (edu?.fieldOfStudy) items.push({ category: C.FIELD_OF_STUDY, text: edu.fieldOfStudy });
      if (edu?.specialization) items.push({ category: C.FIELD_OF_STUDY, text: edu.specialization });
    }
    for (const cert of (profile.certifications as any[]) || []) {
      if (cert?.name) items.push({ category: C.CERTIFICATION, text: cert.name });
    }
    for (const ts of (profile.testScores as any[]) || []) {
      if (ts?.testName) items.push({ category: C.TEST_SCORE, text: ts.testName });
    }
    for (const pub of (profile.publications as any[]) || []) {
      if (pub?.publisher) items.push({ category: C.PUBLISHER, text: pub.publisher });
    }
    for (const vol of (profile.volunteerExperience as any[]) || []) {
      if (vol?.cause) items.push({ category: C.VOLUNTEER_CAUSE, text: vol.cause });
    }
    for (const mem of (profile.professionalMemberships as any[]) || []) {
      if (mem?.organization) items.push({ category: C.PROFESSIONAL_ORG, text: mem.organization });
    }

    return items;
  }

  /**
   * Extract suggestion-worthy values from an employer profile and upsert into suggestions index.
   */
  private extractSuggestionsFromEmployer(company: any): { category: string; text: string }[] {
    const items: { category: string; text: string }[] = [];
    const C = SUGGESTION_CATEGORIES;

    if (company.companyName) items.push({ category: C.COMPANY, text: company.companyName });
    if (company.industry) items.push({ category: C.INDUSTRY, text: company.industry });
    if (company.subIndustry) items.push({ category: C.SUB_INDUSTRY, text: company.subIndustry });
    if (company.headquarters) items.push({ category: C.LOCATION, text: company.headquarters });

    for (const skill of company.techStack || []) {
      items.push({ category: C.SKILL, text: skill });
    }
    for (const benefit of company.benefits || []) {
      items.push({ category: C.BENEFIT, text: benefit });
    }
    for (const value of company.coreValues || []) {
      items.push({ category: C.CORE_VALUE, text: value });
    }
    for (const investor of company.investors || []) {
      items.push({ category: C.INVESTOR, text: investor });
    }
    for (const product of company.productsServices || []) {
      items.push({ category: C.PRODUCT_SERVICE, text: product });
    }

    return items;
  }

  /**
   * Seed the suggestions index from static seed data + world cities.
   */
  async seedSuggestions(): Promise<void> {
    return tracer.startActiveSpan('search.seedSuggestions', async (span) => {
      try {
        logger.info('Seeding suggestions index...');

        // Import seed data
        const { SEED_SUGGESTIONS } = await import('../data/seed-suggestions');
        let totalSeeded = 0;

        const operations: any[] = [];
        const now = new Date().toISOString();

        // Seed all categories from static data
        for (const [category, items] of Object.entries(SEED_SUGGESTIONS)) {
          for (const text of items as string[]) {
            const cleanText = (text as string).trim();
            if (cleanText.length < 1) continue;
            const id = `${category}:${cleanText.toLowerCase().replace(/[\s,]+/g, '_')}`;
            operations.push({ index: { _index: ELASTIC_INDICES.SUGGESTIONS, _id: id } });
            operations.push({
              text: cleanText,
              category,
              count: 0,
              source: 'seed',
              isActive: true,
              region: category === 'location' ? 'IN' : null,
              createdAt: now,
              updatedAt: now,
            });
          }
        }

        // Seed Indian cities from local data copy
        try {
          const { INDIAN_CITIES } = await import('../data/indian-cities');
          for (const text of INDIAN_CITIES as string[]) {
            const cleanText = (text as string).trim();
            if (cleanText.length < 1) continue;
            const id = `location:${cleanText.toLowerCase().replace(/[\s,]+/g, '_')}`;
            operations.push({ index: { _index: ELASTIC_INDICES.SUGGESTIONS, _id: id } });
            operations.push({
              text: cleanText,
              category: 'location',
              count: 0,
              source: 'seed',
              isActive: true,
              region: 'IN',
              createdAt: now,
              updatedAt: now,
            });
          }
          logger.info(
            `Added ${(INDIAN_CITIES as string[]).length} Indian cities from frontend data`
          );
        } catch {
          logger.warn('Frontend Indian cities data not found, using inline seed locations');
        }

        // Seed world cities
        try {
          const { WORLD_CITIES } = await import('../data/world-cities');
          for (const city of WORLD_CITIES) {
            const cleanText = city.text.trim();
            if (cleanText.length < 1) continue;
            const id = `location:${cleanText.toLowerCase().replace(/[\s,]+/g, '_')}`;
            operations.push({ index: { _index: ELASTIC_INDICES.SUGGESTIONS, _id: id } });
            operations.push({
              text: cleanText,
              category: 'location',
              count: 0,
              source: 'seed',
              isActive: true,
              region: city.region,
              parentCategory: city.state || null,
              createdAt: now,
              updatedAt: now,
            });
          }
        } catch {
          logger.warn('World cities data not found, skipping international cities');
        }

        // Bulk index in chunks of 2000 (1000 items)
        for (let i = 0; i < operations.length; i += 2000) {
          const chunk = operations.slice(i, i + 2000);
          try {
            await (elasticClient.bulk as any)({ operations: chunk });
            totalSeeded += chunk.length / 2;
          } catch (err) {
            logger.warn('Seed suggestions bulk chunk failed', err);
          }
        }

        logger.info(`Seeded ${totalSeeded} suggestions into ES`);
        span.setAttribute('suggestions.seeded', totalSeeded);
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
      } catch (error) {
        logger.error('Failed to seed suggestions', error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        span.end();
      }
    });
  }

  /**
   * Force re-seed the suggestions index (admin/reindex).
   */
  async backfillSuggestions(): Promise<void> {
    try {
      const exists = await elasticClient.indices.exists({
        index: ELASTIC_INDICES.SUGGESTIONS,
      });
      if (exists) {
        await (elasticClient.indices.delete as any)({
          index: ELASTIC_INDICES.SUGGESTIONS,
        });
        logger.info('Deleted suggestions index for re-seed');
      }
      await this.createSuggestionsIndex();
    } catch (error) {
      logger.error('Failed to backfill suggestions', error);
    }
  }

  // ─── Reindex All ────────────────────────────────────────────────────

  async reindexAll() {
    const indices = [
      ELASTIC_INDICES.JOBS,
      ELASTIC_INDICES.CANDIDATES,
      ELASTIC_INDICES.EMPLOYERS,
      ELASTIC_INDICES.SUGGESTIONS,
    ];
    for (const index of indices) {
      try {
        const exists = await elasticClient.indices.exists({ index });
        if (exists) {
          await (elasticClient.indices.delete as any)({ index });
          logger.info(`Deleted index: ${index}`);
        }
      } catch (error) {
        logger.error(`Failed to delete index ${index}`, error);
      }
    }
    await this.initializeIndices();
    await this.backfillAll();
    logger.info('All indices have been recreated and backfilled');
  }

  // ─── Backfill If Empty ──────────────────────────────────────────────

  async backfillIfEmpty() {
    try {
      const jobCount = await (elasticClient.count as any)({ index: ELASTIC_INDICES.JOBS });
      if (jobCount.count > 0) {
        logger.info(`ES indices already have data (${jobCount.count} jobs), skipping backfill`);
        return;
      }
      logger.info('ES indices are empty, starting backfill from database...');
      await this.backfillAll();
    } catch (error) {
      logger.error('Backfill check failed', error);
    }
  }

  // ─── Backfill All Data from DB ──────────────────────────────────────

  async backfillAll() {
    try {
      // Backfill jobs
      const jobs = await prisma.jobPost.findMany({
        where: { status: JobStatus.OPEN },
        include: {
          company: {
            select: {
              id: true,
              companyName: true,
              logo: true,
              industry: true,
              companyType: true,
              companySize: true,
              isVerified: true,
            },
          },
        },
      });
      let jobCount = 0;
      for (const job of jobs) {
        try {
          await this.indexJob(job);
          jobCount++;
        } catch {
          /* skip individual failures */
        }
      }
      logger.info(`Backfilled ${jobCount}/${jobs.length} jobs into ES`);

      // Backfill candidates
      const candidates = await prisma.candidateProfile.findMany({
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              isEmailVerified: true,
              isMobileVerified: true,
              isWhatsappVerified: true,
              lastActiveAt: true,
            },
          },
        },
      });
      let candidateCount = 0;
      for (const candidate of candidates) {
        try {
          await this.indexCandidate(candidate);
          candidateCount++;
        } catch {
          /* skip individual failures */
        }
      }
      logger.info(`Backfilled ${candidateCount}/${candidates.length} candidates into ES`);

      // Backfill employers
      const employers = await prisma.companyProfile.findMany();
      let employerCount = 0;
      for (const employer of employers) {
        try {
          await this.indexEmployer(employer);
          employerCount++;
        } catch {
          /* skip individual failures */
        }
      }
      logger.info(`Backfilled ${employerCount}/${employers.length} employers into ES`);
    } catch (error) {
      logger.error('Backfill failed', error);
    }
  }
}

export const searchService = new SearchService();
