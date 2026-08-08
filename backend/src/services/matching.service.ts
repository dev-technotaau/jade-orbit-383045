import { prisma } from '../config/prisma';
import elasticClient from '../config/elasticsearch';
import { ELASTIC_INDICES } from '../constants';
import logger from '../config/logger';
import { isFeatureEnabled } from '../config/feature-flags';

// Education level hierarchy for comparison
const EDUCATION_RANK: Record<string, number> = {
  TENTH: 1,
  TWELFTH: 2,
  DIPLOMA: 3,
  BACHELORS: 4,
  MASTERS: 5,
  PHD: 6,
  POST_DOCTORAL: 7,
};

// Notice period urgency — lower = more available
const NOTICE_RANK: Record<string, number> = {
  IMMEDIATE: 1,
  FIFTEEN_DAYS: 2,
  THIRTY_DAYS: 3,
  SIXTY_DAYS: 4,
  NINETY_DAYS: 5,
  MORE_THAN_NINETY_DAYS: 6,
};

interface CandidateMatch {
  userId: string;
  candidateId: string;
  score: number;
  fullName: string;
}

interface JobMatch {
  jobId: string;
  score: number;
  title: string;
  companyName: string;
}

/**
 * Matching Engine — 13-dimension weighted scoring
 *
 * | Dimension              | Weight |
 * |------------------------|--------|
 * | Skills overlap         | 25%    |
 * | Experience fit         | 12%    |
 * | Salary overlap         | 12%    |
 * | Location match         | 8%     |
 * | Industry match         | 7%     |
 * | Work mode match        | 7%     |
 * | Education match        | 6%     |
 * | Notice period          | 5%     |
 * | Experience level       | 5%     |
 * | Functional area        | 4%     |
 * | Job type preference    | 4%     |
 * | Education level match  | 3%     |
 * | Driving license match  | 2%     |
 */
class MatchingService {
  /**
   * Find candidates that match a given job posting.
   */
  async findMatchingCandidates(jobId: string): Promise<CandidateMatch[]> {
    if (!(await isFeatureEnabled('enableAIMatching'))) {
      logger.debug('AI matching disabled via feature flag — skipping');
      return [];
    }

    const job = await prisma.jobPost.findUnique({
      where: { id: jobId },
      include: { company: true },
    });

    if (!job) {
      logger.warn(`Matching: job ${jobId} not found`);
      return [];
    }

    const skills: string[] = (job.skillsRequired as string[]) || [];
    const functions: any[] = [];

    // 1. Skills overlap (25%)
    if (skills.length > 0) {
      functions.push({
        filter: { terms: { skills } },
        weight: 25,
      });
    }

    // 2. Experience fit (12%)
    if (job.experienceMin !== null || job.experienceMax !== null) {
      functions.push({
        filter: {
          range: {
            experienceYears: {
              ...(job.experienceMin !== null ? { gte: job.experienceMin } : {}),
              ...(job.experienceMax !== null ? { lte: job.experienceMax } : {}),
            },
          },
        },
        weight: 12,
      });
    }

    // 3. Salary overlap (12%)
    if (job.salaryMin !== null || job.salaryMax !== null) {
      functions.push({
        filter: {
          bool: {
            should: [
              ...(job.salaryMax !== null
                ? [{ range: { expectedSalaryMin: { lte: Number(job.salaryMax) } } }]
                : []),
              ...(job.salaryMin !== null
                ? [{ range: { expectedSalaryMax: { gte: Number(job.salaryMin) } } }]
                : []),
            ],
          },
        },
        weight: 12,
      });
    }

    // 4. Location match (8%)
    if (job.location) {
      functions.push({
        filter: {
          bool: {
            should: [
              { match: { currentLocation: job.location } },
              { term: { preferredLocations: job.location } },
              { term: { city: job.location } },
            ],
          },
        },
        weight: 8,
      });
    }

    // 5. Industry match (7%)
    if (job.industry) {
      functions.push({
        filter: { term: { currentIndustry: job.industry } },
        weight: 7,
      });
    }

    // 6. Work mode match (7%)
    if (job.workMode) {
      functions.push({
        filter: { term: { preferredWorkMode: job.workMode } },
        weight: 7,
      });
    }

    // 7. Education match (6%) — candidates whose education >= required
    if (job.educationRequired) {
      const requiredRank = EDUCATION_RANK[job.educationRequired] || 0;
      const qualifyingLevels = Object.entries(EDUCATION_RANK)
        .filter(([, rank]) => rank >= requiredRank)
        .map(([level]) => level);
      if (qualifyingLevels.length > 0) {
        functions.push({
          filter: { terms: { highestEducationLevel: qualifyingLevels } },
          weight: 6,
        });
      }
    }

    // 8. Notice period fit (5%)
    if (job.urgencyLevel === 'URGENT' || job.urgencyLevel === 'IMMEDIATE') {
      functions.push({
        filter: { terms: { noticePeriod: ['IMMEDIATE', 'FIFTEEN_DAYS'] } },
        weight: 5,
      });
    } else {
      functions.push({
        filter: {
          terms: { noticePeriod: ['IMMEDIATE', 'FIFTEEN_DAYS', 'THIRTY_DAYS', 'SIXTY_DAYS'] },
        },
        weight: 5,
      });
    }

    // 9. Experience level match (5%)
    if (job.experienceLevel) {
      functions.push({
        filter: { term: { experienceLevel: job.experienceLevel } },
        weight: 5,
      });
    }

    // 10. Functional area match (4%)
    if (job.functionalArea) {
      functions.push({
        filter: { term: { functionalArea: job.functionalArea } },
        weight: 4,
      });
    }

    // 11. Job type preference match (4%)
    if (job.type) {
      functions.push({
        filter: { term: { preferredJobType: job.type } },
        weight: 4,
      });
    }

    // 12. Highest education level (3%) — direct match with specificDegrees
    if (job.specificDegrees && (job.specificDegrees as string[]).length > 0) {
      functions.push({
        filter: { terms: { highestDegree: job.specificDegrees as string[] } },
        weight: 3,
      });
    }

    // 13. Driving license match (2%)
    if (job.drivingLicenseRequired && job.drivingLicenseRequired !== 'NONE') {
      functions.push({
        filter: { term: { drivingLicenseType: job.drivingLicenseRequired } },
        weight: 2,
      });
    }

    // Base query
    const baseQuery: any =
      skills.length > 0
        ? {
            bool: {
              should: [{ terms: { skills } }],
              minimum_should_match: 0,
            },
          }
        : { match_all: {} };

    try {
      const result = await (elasticClient.search as any)({
        index: ELASTIC_INDICES.CANDIDATES,
        size: 50,
        query: {
          function_score: {
            query: baseQuery,
            functions,
            score_mode: 'sum',
            boost_mode: 'replace',
            max_boost: 100,
          },
        },
        min_score: 0.3,
      });

      const hits = result.hits.hits || [];
      const maxScore = hits.length > 0 ? Math.max(...hits.map((h: any) => h._score)) : 1;

      return hits.map((hit: any) => ({
        userId: hit._source.userId,
        candidateId: hit._source.id,
        score: maxScore > 0 ? hit._score / maxScore : 0,
        fullName: hit._source.fullName || '',
      }));
    } catch (error) {
      logger.error(`Failed to find matching candidates for job ${jobId}`, error);
      return [];
    }
  }

  /**
   * Find jobs that match a given candidate's profile.
   */
  async findMatchingJobs(userId: string): Promise<JobMatch[]> {
    if (!(await isFeatureEnabled('enableAIMatching'))) {
      logger.debug('AI matching disabled via feature flag — skipping');
      return [];
    }

    const candidate = await prisma.candidateProfile.findUnique({
      where: { userId },
      include: { user: true },
    });

    if (!candidate) {
      logger.warn(`Matching: candidate profile for user ${userId} not found`);
      return [];
    }

    const skills: string[] = (candidate.skills as string[]) || [];
    const functions: any[] = [];

    // 1. Skills overlap (25%)
    if (skills.length > 0) {
      functions.push({
        filter: { terms: { skills } },
        weight: 25,
      });
    }

    // 2. Experience fit (12%)
    if (candidate.experienceYears !== null) {
      functions.push({
        filter: {
          bool: {
            must: [
              { range: { experienceMin: { lte: candidate.experienceYears } } },
              { range: { experienceMax: { gte: candidate.experienceYears } } },
            ],
          },
        },
        weight: 12,
      });
    }

    // 3. Salary overlap (12%)
    if (candidate.expectedSalaryMin || candidate.expectedSalaryMax) {
      const salaryFilter: any[] = [];
      if (candidate.expectedSalaryMin) {
        salaryFilter.push({ range: { salaryMax: { gte: Number(candidate.expectedSalaryMin) } } });
      }
      if (candidate.expectedSalaryMax) {
        salaryFilter.push({ range: { salaryMin: { lte: Number(candidate.expectedSalaryMax) } } });
      }
      functions.push({
        filter: { bool: { should: salaryFilter } },
        weight: 12,
      });
    }

    // 4. Location match (8%)
    const locations: string[] = (candidate.preferredLocations as string[]) || [];
    if (candidate.currentLocation || locations.length > 0) {
      const locationShould: any[] = [];
      if (candidate.currentLocation) {
        locationShould.push({ match: { location: candidate.currentLocation } });
      }
      if (locations.length > 0) {
        locationShould.push({ terms: { 'location.keyword': locations } });
      }
      functions.push({
        filter: { bool: { should: locationShould } },
        weight: 8,
      });
    }

    // 5. Industry match (7%) — use both currentIndustry and preferredIndustries
    const industryTerms: string[] = [];
    if (candidate.currentIndustry) industryTerms.push(candidate.currentIndustry);
    const preferredIndustries = (candidate.preferredIndustries as string[]) || [];
    industryTerms.push(...preferredIndustries);
    if (industryTerms.length > 0) {
      functions.push({
        filter: { terms: { industry: [...new Set(industryTerms)] } },
        weight: 7,
      });
    }

    // 6. Work mode match (7%)
    const preferredWorkModes = (candidate.preferredWorkMode as string[]) || [];
    if (preferredWorkModes.length > 0) {
      functions.push({
        filter: { terms: { workMode: preferredWorkModes } },
        weight: 7,
      });
    }

    // 7. Education match (6%) — boost jobs at or below candidate's education level
    if (candidate.highestEducationLevel) {
      const candidateRank = EDUCATION_RANK[candidate.highestEducationLevel] || 0;
      const qualifyingLevels = Object.entries(EDUCATION_RANK)
        .filter(([, rank]) => rank <= candidateRank)
        .map(([level]) => level);
      if (qualifyingLevels.length > 0) {
        functions.push({
          filter: { terms: { educationRequired: qualifyingLevels } },
          weight: 6,
        });
      }
    }

    // 8. Notice period fit (5%)
    if (candidate.noticePeriod) {
      const noticeRank = NOTICE_RANK[candidate.noticePeriod] || 99;
      if (noticeRank <= 2) {
        functions.push({
          filter: { terms: { urgencyLevel: ['URGENT', 'IMMEDIATE'] } },
          weight: 5,
        });
      } else {
        functions.push({
          filter: { terms: { urgencyLevel: ['NORMAL', 'URGENT'] } },
          weight: 5,
        });
      }
    }

    // 9. Experience level match (5%)
    if (candidate.experienceLevel) {
      functions.push({
        filter: { term: { experienceLevel: candidate.experienceLevel } },
        weight: 5,
      });
    }

    // 10. Functional area match (4%)
    if (candidate.functionalArea) {
      functions.push({
        filter: { term: { functionalArea: candidate.functionalArea } },
        weight: 4,
      });
    }

    // 11. Job type preference match (4%)
    const preferredJobTypes = (candidate.preferredJobType as string[]) || [];
    if (preferredJobTypes.length > 0) {
      functions.push({
        filter: { terms: { type: preferredJobTypes } },
        weight: 4,
      });
    }

    // 12. Shift type preference match (3%)
    if (candidate.preferredShift) {
      functions.push({
        filter: { term: { shiftType: candidate.preferredShift } },
        weight: 3,
      });
    }

    // 13. Driving license match (2%)
    if (
      candidate.hasDrivingLicense &&
      candidate.drivingLicenseType &&
      candidate.drivingLicenseType !== 'NONE'
    ) {
      functions.push({
        filter: { term: { drivingLicenseRequired: candidate.drivingLicenseType } },
        weight: 2,
      });
    }

    // Base query: open jobs, optionally matching skills
    const baseQuery: any = {
      bool: {
        must: [{ term: { status: 'OPEN' } }],
        ...(skills.length > 0 ? { should: [{ terms: { skills } }], minimum_should_match: 0 } : {}),
      },
    };

    try {
      const result = await (elasticClient.search as any)({
        index: ELASTIC_INDICES.JOBS,
        size: 20,
        query: {
          function_score: {
            query: baseQuery,
            functions,
            score_mode: 'sum',
            boost_mode: 'replace',
            max_boost: 100,
          },
        },
        min_score: 0.3,
      });

      const hits = result.hits.hits || [];
      const maxScore = hits.length > 0 ? Math.max(...hits.map((h: any) => h._score)) : 1;

      return hits.map((hit: any) => ({
        jobId: hit._source.id,
        score: maxScore > 0 ? hit._score / maxScore : 0,
        title: hit._source.title || '',
        companyName: hit._source.companyName || '',
      }));
    } catch (error) {
      logger.error(`Failed to find matching jobs for user ${userId}`, error);
      return [];
    }
  }

  /**
   * Calculate skills overlap with proficiency weighting.
   * EXPERT=1.0, ADVANCED=0.75, INTERMEDIATE=0.5, BEGINNER=0.25
   */
  calculateSkillsOverlap(
    candidateSkills: string[],
    requiredSkills: string[],
    skillsWithProficiency?: any[]
  ): number {
    if (!candidateSkills.length || !requiredSkills.length) return 0;

    const requiredSet = new Set(requiredSkills.map((s) => s.toLowerCase()));

    // If proficiency data exists, use weighted scoring
    if (skillsWithProficiency && skillsWithProficiency.length > 0) {
      const proficiencyWeights: Record<string, number> = {
        EXPERT: 1.0,
        ADVANCED: 0.75,
        INTERMEDIATE: 0.5,
        BEGINNER: 0.25,
      };
      const profMap = new Map<string, number>();
      for (const sp of skillsWithProficiency) {
        profMap.set(sp.skill.toLowerCase(), proficiencyWeights[sp.proficiency] || 0.5);
      }

      let weightedScore = 0;
      const maxPossible = requiredSet.size;
      for (const skill of requiredSet) {
        if (profMap.has(skill)) {
          weightedScore += profMap.get(skill)!;
        }
      }
      return maxPossible > 0 ? weightedScore / maxPossible : 0;
    }

    // Fallback: Jaccard similarity
    const setA = new Set(candidateSkills.map((s) => s.toLowerCase()));
    let intersection = 0;
    for (const skill of setA) {
      if (requiredSet.has(skill)) intersection++;
    }
    const union = new Set([...setA, ...requiredSet]).size;
    return union > 0 ? intersection / union : 0;
  }

  /**
   * Calculate match score between a specific candidate and job (13 dimensions)
   * Returns score breakdown and overall percentage
   */
  async calculateCandidateJobMatchScore(
    candidateId: string,
    jobId: string
  ): Promise<{
    overall: number;
    dimensions: {
      skills: number;
      experience: number;
      salary: number;
      location: number;
      industry: number;
      workMode: number;
      education: number;
      noticePeriod: number;
      experienceLevel: number;
      functionalArea: number;
      jobType: number;
      educationLevel: number;
      drivingLicense: number;
    };
  }> {
    const [candidate, job] = await Promise.all([
      prisma.candidateProfile.findUnique({
        where: { id: candidateId },
        include: { user: true },
      }),
      prisma.jobPost.findUnique({
        where: { id: jobId },
        include: { company: true },
      }),
    ]);

    if (!candidate || !job) {
      return {
        overall: 0,
        dimensions: {
          skills: 0,
          experience: 0,
          salary: 0,
          location: 0,
          industry: 0,
          workMode: 0,
          education: 0,
          noticePeriod: 0,
          experienceLevel: 0,
          functionalArea: 0,
          jobType: 0,
          educationLevel: 0,
          drivingLicense: 0,
        },
      };
    }

    const dimensions = {
      skills: 0,
      experience: 0,
      salary: 0,
      location: 0,
      industry: 0,
      workMode: 0,
      education: 0,
      noticePeriod: 0,
      experienceLevel: 0,
      functionalArea: 0,
      jobType: 0,
      educationLevel: 0,
      drivingLicense: 0,
    };

    // 1. Skills overlap (25%)
    const jobSkills = (job.skillsRequired as string[]) || [];
    const candSkills = (candidate.skills as string[]) || [];
    if (jobSkills.length > 0 && candSkills.length > 0) {
      const jobSet = new Set(jobSkills.map((s) => s.toLowerCase()));
      const candSet = new Set(candSkills.map((s) => s.toLowerCase()));
      let overlap = 0;
      for (const skill of candSet) {
        if (jobSet.has(skill)) overlap++;
      }
      dimensions.skills = overlap / jobSkills.length;
    }

    // 2. Experience fit (12%)
    if (
      candidate.experienceYears !== null &&
      (job.experienceMin !== null || job.experienceMax !== null)
    ) {
      const exp = candidate.experienceYears;
      const min = job.experienceMin ?? 0;
      const max = job.experienceMax ?? 100;
      dimensions.experience = exp >= min && exp <= max ? 1.0 : 0.5;
    }

    // 3. Salary overlap (12%)
    if (candidate.expectedSalaryMin && (job.salaryMin !== null || job.salaryMax !== null)) {
      const candMin = Number(candidate.expectedSalaryMin);
      const candMax = candidate.expectedSalaryMax
        ? Number(candidate.expectedSalaryMax)
        : candMin * 1.5;
      const jobMin = Number(job.salaryMin) || 0;
      const jobMax = Number(job.salaryMax) || jobMin * 1.5;
      const overlap = Math.max(0, Math.min(candMax, jobMax) - Math.max(candMin, jobMin));
      const union = Math.max(candMax, jobMax) - Math.min(candMin, jobMin);
      dimensions.salary = union > 0 ? overlap / union : 0;
    }

    // 4. Location match (8%)
    if (candidate.currentLocation && job.location) {
      const candLoc = candidate.currentLocation.toLowerCase();
      const jobLoc = job.location.toLowerCase();
      dimensions.location = candLoc.includes(jobLoc) || jobLoc.includes(candLoc) ? 1.0 : 0.3;
    }

    // 5. Industry match (7%)
    if (candidate.currentIndustry && job.industry) {
      dimensions.industry =
        candidate.currentIndustry.toLowerCase() === job.industry.toLowerCase() ? 1.0 : 0.0;
    }

    // 6. Work mode match (7%)
    if (candidate.preferredWorkMode && job.workMode) {
      const modes = candidate.preferredWorkMode as string[];
      dimensions.workMode = modes.includes(job.workMode) ? 1.0 : 0.3;
    }

    // 7. Education match (6%)
    if (candidate.highestEducationLevel && job.educationRequired) {
      // Compare education levels (both are EducationLevel enum values)
      const EDUCATION_RANK: Record<string, number> = {
        BELOW_10TH: 1,
        HIGH_SCHOOL: 2,
        INTERMEDIATE: 3,
        DIPLOMA: 4,
        BACHELORS: 5,
        MASTERS: 6,
        DOCTORATE: 7,
      };
      const candLevel = EDUCATION_RANK[candidate.highestEducationLevel] || 0;
      const reqLevel = EDUCATION_RANK[job.educationRequired] || 0;
      dimensions.education = candLevel >= reqLevel ? 1.0 : 0.3;
    }

    // 8. Notice period (5%)
    // Only candidates have notice period, not jobs. Score based on immediacy.
    if (candidate.noticePeriod) {
      const candNotice = NOTICE_RANK[candidate.noticePeriod] || 3;
      // Lower notice period = better score (immediate joiners get 1.0)
      dimensions.noticePeriod = candNotice <= 1 ? 1.0 : candNotice <= 2 ? 0.8 : 0.5;
    }

    // 9. Experience level (5%)
    if (job.experienceLevel) {
      const candExp = Number(candidate.experienceYears) || 0;
      const levelMatch =
        (job.experienceLevel === 'FRESHER' && candExp <= 1) ||
        (job.experienceLevel === 'ENTRY' && candExp <= 2) ||
        (job.experienceLevel === 'MID' && candExp >= 2 && candExp <= 5) ||
        (job.experienceLevel === 'SENIOR' && candExp >= 5 && candExp <= 10) ||
        (job.experienceLevel === 'LEAD' && candExp >= 10) ||
        (job.experienceLevel === 'EXECUTIVE' && candExp >= 15);
      dimensions.experienceLevel = levelMatch ? 1.0 : 0.4;
    }

    // 10. Functional area (4%)
    if (candidate.currentRole && job.functionalArea) {
      const candRole = candidate.currentRole.toLowerCase();
      const jobArea = job.functionalArea.toLowerCase();
      dimensions.functionalArea =
        candRole.includes(jobArea) || jobArea.includes(candRole) ? 1.0 : 0.0;
    }

    // 11. Job type preference (4%)
    if (candidate.preferredJobType && job.type) {
      const types = candidate.preferredJobType as string[];
      dimensions.jobType = types.includes(job.type) ? 1.0 : 0.3;
    }

    // 12. Education level match (3%)
    // Note: This is redundant with dimension 7 above, but keeping for 13-dimension structure
    if (candidate.highestEducationLevel && job.educationRequired) {
      const EDUCATION_RANK: Record<string, number> = {
        BELOW_10TH: 1,
        HIGH_SCHOOL: 2,
        INTERMEDIATE: 3,
        DIPLOMA: 4,
        BACHELORS: 5,
        MASTERS: 6,
        DOCTORATE: 7,
      };
      const candRank = EDUCATION_RANK[candidate.highestEducationLevel] || 0;
      const jobRank = EDUCATION_RANK[job.educationRequired] || 0;
      dimensions.educationLevel = candRank >= jobRank ? 1.0 : 0.5;
    }

    // 13. Driving license match (2%)
    if (
      job.drivingLicenseRequired &&
      job.drivingLicenseRequired !== 'NONE' &&
      candidate.drivingLicenseType
    ) {
      dimensions.drivingLicense =
        candidate.drivingLicenseType === job.drivingLicenseRequired ? 1.0 : 0.0;
    }

    // Calculate weighted overall score
    const weights = {
      skills: 25,
      experience: 12,
      salary: 12,
      location: 8,
      industry: 7,
      workMode: 7,
      education: 6,
      noticePeriod: 5,
      experienceLevel: 5,
      functionalArea: 4,
      jobType: 4,
      educationLevel: 3,
      drivingLicense: 2,
    };

    let overall = 0;
    for (const [key, weight] of Object.entries(weights)) {
      overall += dimensions[key as keyof typeof dimensions] * weight;
    }

    return {
      overall: Math.round(overall),
      dimensions,
    };
  }
}

export const matchingService = new MatchingService();
